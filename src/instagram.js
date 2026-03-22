import axios from 'axios';

const IG_API_BASE = 'https://graph.instagram.com/v21.0';

/**
 * Split text into chunks that fit Instagram's 1000-byte limit.
 * Hebrew chars are 2 bytes in UTF-8, so we need byte-aware splitting.
 */
export function chunkMessage(text, maxBytes = 900) {
  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(text).length;

  if (totalBytes <= maxBytes) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Binary search for the right cut point
    let cutPoint = remaining.length;
    while (encoder.encode(remaining.slice(0, cutPoint)).length > maxBytes) {
      cutPoint = Math.floor(cutPoint * 0.8);
    }

    // Try to cut at sentence boundary
    const chunk = remaining.slice(0, cutPoint);
    const sentenceEnd = Math.max(
      chunk.lastIndexOf('. '),
      chunk.lastIndexOf('? '),
      chunk.lastIndexOf('! '),
      chunk.lastIndexOf('.\n'),
      chunk.lastIndexOf('\n'),
    );

    if (sentenceEnd > cutPoint * 0.3) {
      chunks.push(remaining.slice(0, sentenceEnd + 1).trim());
      remaining = remaining.slice(sentenceEnd + 1).trim();
    } else {
      chunks.push(chunk.trim());
      remaining = remaining.slice(cutPoint).trim();
    }
  }

  return chunks.filter(c => c.length > 0);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Send a message via Instagram Graph API.
 * Automatically chunks long messages.
 */
export async function sendInstagramMessage(accessToken, recipientId, text) {
  const chunks = chunkMessage(text);

  for (let i = 0; i < chunks.length; i++) {
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await axios.post(
          `${IG_API_BASE}/me/messages`,
          {
            recipient: { id: recipientId },
            message: { text: chunks[i] },
          },
          {
            params: { access_token: accessToken },
            timeout: 10000,
          }
        );
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) {
          console.warn(`[Instagram] Send attempt ${attempt} failed (${err.message}), retrying...`);
          await sleep(1000 * attempt);
        }
      }
    }
    if (lastErr) throw lastErr;

    // Delay between chunks to preserve order
    if (i < chunks.length - 1) {
      await sleep(500);
    }
  }
}

/**
 * Send typing indicator so the user sees "typing..." while bot generates a reply.
 * Fire-and-forget — never blocks or throws.
 */
export async function sendTypingIndicator(accessToken, recipientId) {
  try {
    await axios.post(
      `${IG_API_BASE}/me/messages`,
      {
        recipient: { id: recipientId },
        sender_action: 'typing_on',
      },
      {
        params: { access_token: accessToken },
        timeout: 5000,
      }
    );
  } catch (err) {
    console.warn(`[Instagram] Typing indicator failed: ${err.message}`);
  }
}

/**
 * Fetch recent Instagram DM conversations for Voice DNA enhancement.
 * Pulls real owner messages from the IG Conversations API.
 * Returns formatted text with owner messages grouped by conversation.
 */
export async function fetchInstagramConversations(accessToken, igPageId, { maxThreads = 15, maxMessagesPerThread = 30 } = {}) {
  try {
    // 1. Get list of conversations
    const convRes = await axios.get(`${IG_API_BASE}/me/conversations`, {
      params: {
        platform: 'instagram',
        fields: 'id,participants',
        limit: maxThreads,
        access_token: accessToken,
      },
      timeout: 15000,
    });

    const conversations = convRes.data?.data || [];
    if (conversations.length === 0) {
      console.log('[IG-Voice] No conversations found');
      return null;
    }

    console.log(`[IG-Voice] Found ${conversations.length} conversation threads`);

    // 2. Fetch messages from each thread (parallel batches of 5)
    const allOwnerMessages = [];
    let totalMessages = 0;
    const BATCH_SIZE = 5;

    for (let i = 0; i < conversations.length; i += BATCH_SIZE) {
      const batch = conversations.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(conv =>
          axios.get(`${IG_API_BASE}/${conv.id}`, {
            params: {
              fields: `messages.limit(${maxMessagesPerThread}){message,from,created_time}`,
              access_token: accessToken,
            },
            timeout: 8000,
          }).then(msgRes => ({ convId: conv.id, messages: msgRes.data?.messages?.data || [] }))
        )
      );

      for (const result of results) {
        if (result.status === 'rejected') {
          console.warn(`[IG-Voice] Failed to fetch thread: ${result.reason?.message}`);
          continue;
        }
        for (const msg of result.value.messages) {
          if (!msg.message) continue;
          totalMessages++;
          const isOwner = msg.from?.id === igPageId;
          const speaker = isOwner ? 'OWNER' : 'CUSTOMER';
          allOwnerMessages.push({ speaker, text: msg.message, time: msg.created_time });
        }
      }

      // Small delay between batches to respect rate limits
      if (i + BATCH_SIZE < conversations.length) await sleep(300);
    }

    if (allOwnerMessages.length === 0) {
      console.log('[IG-Voice] No messages found in conversations');
      return null;
    }

    // 3. Format as conversation text for analysis
    // Sort by time (oldest first) and format
    allOwnerMessages.sort((a, b) => new Date(a.time) - new Date(b.time));

    const formatted = allOwnerMessages
      .map(m => `${m.speaker}: ${m.text}`)
      .join('\n');

    const ownerCount = allOwnerMessages.filter(m => m.speaker === 'OWNER').length;
    console.log(`[IG-Voice] Extracted ${totalMessages} total messages (${ownerCount} owner) from ${conversations.length} threads`);

    return { text: formatted, ownerMessageCount: ownerCount, totalMessages, threadCount: conversations.length };
  } catch (err) {
    console.error(`[IG-Voice] Conversations fetch failed: ${err.message}`);
    if (err.response?.data?.error) {
      console.error(`[IG-Voice] API error: ${JSON.stringify(err.response.data.error)}`);
    }
    return null;
  }
}

/**
 * Fetch Instagram DM history for a specific lead (conversation thread).
 * Used to sync initial history when first interacting with a new lead.
 * Returns array of { role, content, timestamp } or empty array on failure.
 */
export async function fetchLeadConversationHistory(accessToken, igPageId, leadUserId, { maxMessages = 200 } = {}) {
  try {
    // 1. Get list of conversations to find the thread with this specific user
    const convRes = await axios.get(`${IG_API_BASE}/me/conversations`, {
      params: {
        platform: 'instagram',
        user_id: leadUserId, // Filter by specific user
        fields: 'id,participants',
        limit: 5,
        access_token: accessToken,
      },
      timeout: 15000,
    });

    const conversations = convRes.data?.data || [];
    if (conversations.length === 0) {
      // Try alternate approach: get all conversations and find matching one
      const allConvRes = await axios.get(`${IG_API_BASE}/me/conversations`, {
        params: {
          platform: 'instagram',
          fields: 'id,participants',
          limit: 50,
          access_token: accessToken,
        },
        timeout: 15000,
      });
      
      const allConversations = allConvRes.data?.data || [];
      const matchingConv = allConversations.find(conv => {
        const participants = conv.participants?.data || [];
        return participants.some(p => p.id === leadUserId);
      });
      
      if (!matchingConv) {
        console.log(`[IG-History] No conversation found for lead ${leadUserId}`);
        return [];
      }
      conversations.push(matchingConv);
    }

    const conversationId = conversations[0]?.id;
    if (!conversationId) {
      console.log(`[IG-History] No conversation ID found for lead ${leadUserId}`);
      return [];
    }

    console.log(`[IG-History] Found conversation ${conversationId} for lead ${leadUserId}`);

    // 2. Fetch messages from this thread
    const msgRes = await axios.get(`${IG_API_BASE}/${conversationId}`, {
      params: {
        fields: `messages.limit(${maxMessages}){message,from,created_time}`,
        access_token: accessToken,
      },
      timeout: 15000,
    });

    const messages = msgRes.data?.messages?.data || [];
    if (messages.length === 0) {
      console.log(`[IG-History] No messages in conversation for lead ${leadUserId}`);
      return [];
    }

    // 3. Convert to our format: role (user/assistant based on sender), content, timestamp
    const formattedMessages = messages
      .filter(msg => msg.message) // Skip empty messages
      .map(msg => {
        const isFromOwner = msg.from?.id === igPageId;
        return {
          role: isFromOwner ? 'assistant' : 'user',
          content: msg.message,
          timestamp: msg.created_time,
        };
      })
      // Sort oldest first (API returns newest first)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(`[IG-History] Fetched ${formattedMessages.length} messages for lead ${leadUserId} (${formattedMessages.filter(m => m.role === 'user').length} from user, ${formattedMessages.filter(m => m.role === 'assistant').length} from owner)`);

    return formattedMessages;
  } catch (err) {
    console.error(`[IG-History] Failed to fetch history for lead ${leadUserId}:`, err.message);
    if (err.response?.data?.error) {
      console.error(`[IG-History] API error:`, JSON.stringify(err.response.data.error));
    }
    return [];
  }
}

/**
 * Fetch Instagram user profile (display name + username).
 * Returns { name, username } or null on failure — bot continues without profile.
 */
export async function fetchInstagramProfile(accessToken, userId) {
  try {
    const response = await axios.get(`${IG_API_BASE}/${userId}`, {
      params: { fields: 'name,username', access_token: accessToken },
      timeout: 5000,
    });
    const name = response.data?.name?.trim() || null;
    const username = response.data?.username?.trim() || null;
    if (name || username) {
      console.log(`[Instagram] Profile for ${userId}: ${name || '?'} (@${username || '?'})`);
      return { name, username };
    }
    return null;
  } catch (err) {
    console.warn(`[Instagram] Profile fetch failed for ${userId}: ${err.message}`);
    return null;
  }
}
