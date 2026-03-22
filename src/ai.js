import { getConversationHistory, saveMessage, getOrCreateLead, updateLead, recordApiUsage } from './db.js';

import { classifyEntry, resolveConversationMode, CONVERSATION_MODES } from './sequence.js';
import { config } from './config.js';
import { sendInstagramMessage } from './instagram.js';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Not confident phrase detection
const NOT_CONFIDENT_PHRASE = 'not confident in answering';

// Send notification to business owner via Instagram when AI is not confident
async function sendNotConfidentNotification(leadUsername) {
  if (!config.notificationIgAccessToken || !config.notificationIgUserId) {
    console.warn('[Notification] No notification IG credentials configured — skipping notification');
    return false;
  }
  
  const message = `צריך לחזור ל${leadUsername ? '@' + leadUsername : 'ליד'}`;
  
  try {
    await sendInstagramMessage(config.notificationIgAccessToken, config.notificationIgUserId, message);
    console.log(`[Notification] Sent "not confident" notification for ${leadUsername || 'unknown lead'}`);
    return true;
  } catch (err) {
    console.error(`[Notification] Failed to send notification: ${err.message}`);
    return false;
  }
}

// Robust JSON extraction from AI responses (handles ```json blocks, truncated responses, etc.)
function parseAIJson(raw) {
  // 1. Strip markdown fences if present
  let json = raw;
  const fenced = raw.match(/```json?\s*([\s\S]*?)```/);
  if (fenced) {
    json = fenced[1].trim();
  } else {
    const openFence = raw.match(/```json?\s*([\s\S]*)/);
    if (openFence) json = openFence[1].trim();
  }

  // 2. Try direct parse
  try { return JSON.parse(json.trim()); } catch { /* fall through */ }

  // 3. Extract first { ... } or [ ... ] block
  const braceMatch = json.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (braceMatch) {
    try { return JSON.parse(braceMatch[1]); } catch { /* fall through */ }
  }

  // 4. Repair truncated JSON — close open strings, brackets, braces
  const repaired = repairTruncatedJson(json);
  if (repaired) {
    try { return JSON.parse(repaired); } catch { /* fall through */ }
  }

  throw new Error('No valid JSON found in response');
}

// Attempt to repair JSON truncated by token limit
function repairTruncatedJson(raw) {
  // Find the start of JSON
  const startIdx = raw.search(/[{\[]/);
  if (startIdx === -1) return null;
  let s = raw.slice(startIdx);

  // Remove trailing incomplete key-value (e.g. ,"unfinished_key": "partial val)
  // Trim to last complete value: ends with ", }, ], number, true, false, null
  s = s.replace(/,\s*"[^"]*"?\s*:\s*"[^"]*$/, '');  // truncated string value
  s = s.replace(/,\s*"[^"]*"?\s*:\s*$/, '');          // truncated after colon
  s = s.replace(/,\s*"[^"]*$/, '');                    // truncated key
  s = s.replace(/,\s*\{[^}]*$/, '');                   // truncated nested object
  s = s.replace(/,\s*$/, '');                           // trailing comma

  // Close any open string (odd number of unescaped quotes)
  const quotes = (s.match(/(?<!\\)"/g) || []).length;
  if (quotes % 2 !== 0) s += '"';

  // Count and close unmatched brackets/braces
  let openBraces = 0, openBrackets = 0;
  let inString = false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '"' && (i === 0 || s[i - 1] !== '\\')) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (s[i] === '{') openBraces++;
    else if (s[i] === '}') openBraces--;
    else if (s[i] === '[') openBrackets++;
    else if (s[i] === ']') openBrackets--;
  }

  // Close in reverse order (inner brackets first)
  for (let i = 0; i < openBraces; i++) s += '}';
  for (let i = 0; i < openBrackets; i++) s += ']';

  return s;
}

// OpenRouter pricing per million tokens
const PRICING = {
  'anthropic/claude-sonnet-4.5': { input: 3.00, output: 15.00 },
  'anthropic/claude-haiku-4.5': { input: 0.80, output: 4.00 },
};

function calculateCost(model, promptTokens, completionTokens) {
  const pricing = PRICING[model] || PRICING['anthropic/claude-sonnet-4.5'];
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output;
}

// Fire-and-forget usage recording (never blocks the response)
export function trackUsage(tenantId, operation, usage) {
  if (!usage || !tenantId) return;
  const model = config.aiModel || 'anthropic/claude-sonnet-4.5';
  const cost = calculateCost(model, usage.promptTokens, usage.completionTokens);
  recordApiUsage(
    tenantId, operation,
    usage.promptTokens, usage.completionTokens, usage.totalTokens,
    cost, model
  ).catch(err => console.warn(`[Usage] Failed to record: ${err.message}`));
}

// Primary regex — standard format
const LEAD_TAG_REGEX = /<!--\s*LEAD\s*:\s*(.*?)\s*-->/s;
// Aggressive cleanup regexes — catch malformed variants the AI might generate
const LEAD_TAG_CLEANUP_PATTERNS = [
  /<!--\s*LEAD\s*:[\s\S]*?-->/g,            // Standard with variations
  /<!--\s*LEAD\s*:\{[\s\S]*?\}[\s\S]{0,5}$/g, // Missing closing --> at end of string
  /<!--\s*LEAD\s*:[^\n]*$/gm,               // LEAD tag without closing, rest of line
  /<!\s*[-—]{1,3}\s*LEAD\s*:[\s\S]*?[-—]{1,3}\s*>/g, // Wrong number of dashes or em-dashes
  /LEAD:\s*\{[^}]*("gathered"|"score"|"action"|"gender"|"intent")[^}]*\}/g, // Bare LEAD JSON without HTML comment wrapper
];

// Normalize any gender value to 'male', 'female', or null
// Handles Hebrew, English, abbreviations, and case variants
export function normalizeGender(raw) {
  if (!raw) return null;
  const v = String(raw).trim().toLowerCase();
  if (['male', 'm', 'זכר', 'בן', 'גבר'].includes(v)) return 'male';
  if (['female', 'f', 'נקבה', 'בת', 'אישה'].includes(v)) return 'female';
  return null; // unknown / unrecognized → treat as not detected
}

// Legacy heuristic gender helpers have been removed in favor of an LLM subagent.

// Shared OpenRouter API call helper with timeout + retry
export async function callOpenRouter(messages, maxTokens, title = 'SetterAI', temperature = 0.6) {
  const maxRetries = 3;
  const baseDelay = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openrouterApiKey}`,
          'HTTP-Referer': config.baseUrl,
          'X-Title': title,
        },
        body: JSON.stringify({
          model: config.aiModel,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const data = await res.json();
      if (data.error) {
        throw new Error(data.error.message || JSON.stringify(data.error));
      }

      // Extract token usage for cost tracking
      const usage = data.usage ? {
        promptTokens: data.usage.prompt_tokens || 0,
        completionTokens: data.usage.completion_tokens || 0,
        totalTokens: data.usage.total_tokens || 0,
      } : null;
      if (usage) {
        console.log(`[Cost] ${title} | in=${usage.promptTokens} out=${usage.completionTokens} total=${usage.totalTokens}`);
      }

      return { content: data.choices[0].message.content, usage };
    } catch (err) {
      clearTimeout(timeout);

      if (attempt === maxRetries) {
        console.error(`[OpenRouter] All ${maxRetries} attempts failed:`, err.message);
        throw err;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      console.warn(`[OpenRouter] Attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// --- Haiku caller for lightweight AI tasks (grading, QA, etc.) ---
// Uses the same OpenRouter API but forces Haiku model for cost efficiency.
// Haiku: $0.80/M input, $4.00/M output vs Sonnet: $3.00/M input, $15.00/M output
export async function callHaiku(messages, maxTokens = 200, title = 'SetterAI-QA') {
  const HAIKU_MODEL = 'anthropic/claude-haiku-4.5';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30s timeout

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.openrouterApiKey}`,
        'HTTP-Referer': config.baseUrl,
        'X-Title': title,
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.2, // Low temp for consistent evaluation
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error));
    }

    const usage = data.usage ? {
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    } : null;

    return { content: data.choices[0].message.content, usage };
  } catch (err) {
    clearTimeout(timeout);
    console.warn(`[Haiku] ${title} failed:`, err.message);
    return null; // Silent failure — QA is non-critical
  }
}

// --- Python AI Microservice caller ---
// Uses OpenRouter/Anthropic behind the microservice, but keeps business rules in Node.
async function callAIMicroservice({ tenant, lead, userId, userMessage, conversationHistory, systemPrompt }) {
  const maxRetries = 2;
  const baseDelay = 500;

  const url = `${(config.aiServiceUrl || 'http://localhost:8000').replace(/\/$/, '')}/dm/respond`;
  const payload = {
    client_id: tenant.id,
    system_prompt: systemPrompt,
    current_message: userMessage,
    conversation_history: (conversationHistory || []).map(m => ({
      role: m.role,
      content: m.content,
    })),
    sender_name: lead?.instagramName || null,
    instagram_username: lead?.instagramUsername || null,
    locale: 'he-IL',
    tenant_profile: {
      name: tenant.name || null,
      businessType: tenant.businessType || null,
      services: tenant.services || null,
      ownerName: tenant.ownerName || null,
      botGoal: tenant.botGoal || null,
      ctaType: tenant.ctaType || null,
      bookingInstructions: tenant.bookingInstructions || null,
      workingHours: tenant.workingHours || null,
      voiceGreeting: tenant.voiceGreeting || null,
      voiceEnergy: tenant.voiceEnergy || null,
      voicePhrases: tenant.voicePhrases || null,
      voicePhrasesMale: tenant.voicePhrasesMale || null,
      voicePhrasesFemale: tenant.voicePhrasesFemale || null,
      voiceEmoji: tenant.voiceEmoji || null,
      voiceLength: tenant.voiceLength || null,
      voiceHumor: tenant.voiceHumor || null,
      voiceAvoid: tenant.voiceAvoid || null,
      voicePersonality: tenant.voicePersonality || null,
      slangWords: tenant.slangWords || null,
      voiceExamples: tenant.voiceExamples || null,
      customFlowInstructions: tenant.customFlowInstructions || null,
    },
    lead_state: {
      entryType: lead?.entryType || null,
      conversationMode: lead?.conversationMode || null,
      qualificationScore: typeof lead?.qualificationScore === 'number' ? lead.qualificationScore : null,
      intent: lead?.intent || null,
      gathered: lead?.gathered || {},
      bookingLinkSent: !!lead?.bookingLinkSent,
      gender: lead?.gender || null,
      genderLocked: !!lead?.genderLocked,
      needsHuman: !!lead?.needsHuman,
    },
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90000); // 90s timeout per attempt

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': tenant.id,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`AI microservice HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      }

      const data = await res.json();
      
      // Handle null response (microservice couldn't generate response after retries)
      // Return null reply so caller knows not to send anything
      return {
        reply: data.response || null,  // Can be null if all retries failed
        sourcesUsed: data.sources_used || [],
        confidence: data.confidence || 0,
        leadMetadata: data.lead_metadata || null,
        usage: data.usage || null,
        subagentUsage: data.subagent_usage || null,
        debug: data.debug || null,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === maxRetries) {
        console.error(`[${tenant.id}] AI microservice failed (user ${userId}):`, err.message);
        // Return null instead of throwing - let the caller handle no response gracefully
        return {
          reply: null,
          sourcesUsed: [],
          confidence: 0,
          leadMetadata: null,
          usage: null,
          subagentUsage: null,
          debug: { error: err.message, retries_exhausted: true },
        };
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`[${tenant.id}] AI microservice attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

function extractLeadData(text) {
  const match = text.match(LEAD_TAG_REGEX);
  if (!match) {
    // Fallback: AI sometimes writes action="send_link" directly in message text
    // instead of inside the <!-- LEAD:{...} --> comment. Extract it so we still track CTA actions.
    const inlineAction = text.match(/\baction\s*=\s*"([^"]*)"/i);
    if (inlineAction) {
      const action = inlineAction[1];
      const validActions = ['none', 'send_link', 'follow_up', 'end_conversation', 'needs_human'];
      if (validActions.includes(action)) {
        console.warn(`[LeadData] Extracted inline action="${action}" — AI used wrong format`);
        return { action };
      }
    }
    return null;
  }
  try {
    const data = JSON.parse(match[1]);
    if (typeof data !== 'object' || data === null) return null;

    // Clamp score to 0-10
    if (typeof data.score === 'number') {
      data.score = Math.max(0, Math.min(10, Math.round(data.score)));
    }

    // Validate action
    const validActions = ['none', 'send_link', 'follow_up', 'end_conversation', 'needs_human'];
    if (data.action && !validActions.includes(data.action)) {
      data.action = 'none';
    }

    // Validate gender
    const validGenders = ['male', 'female', 'unknown'];
    if (data.gender && !validGenders.includes(data.gender)) {
      data.gender = 'unknown';
    }

    // Validate intent
    const validIntents = ['info', 'professional', 'content_reaction', 'fan', 'chat'];
    if (data.intent && !validIntents.includes(data.intent)) {
      data.intent = 'chat';
    }

    return data;
  } catch (e) {
    console.error('Failed to parse lead data:', e.message);
    return null;
  }
}

function cleanResponse(text) {
  let cleaned = text;

  // 1. Primary regex (handles standard + minor variations)
  cleaned = cleaned.replace(LEAD_TAG_REGEX, '');

  // 2. Aggressive cleanup — catch all malformed variants
  for (const pattern of LEAD_TAG_CLEANUP_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 3. Nuclear option — if ANYTHING resembling LEAD metadata remains, strip it
  if (cleaned.includes('LEAD:') || cleaned.includes('LEAD :')) {
    // Find where LEAD starts and cut everything from there
    const leadIdx = cleaned.search(/LEAD\s*:/);
    if (leadIdx !== -1) {
      // Walk backwards to find the start of the HTML comment or tag
      let cutStart = leadIdx;
      for (let i = leadIdx - 1; i >= Math.max(0, leadIdx - 10); i--) {
        if (cleaned[i] === '<' || cleaned[i] === '!') {
          cutStart = i;
          break;
        }
      }
      cleaned = cleaned.slice(0, cutStart);
    }
  }

  // 4. Strip any remaining HTML comments or HTML-like artifacts (there should never be HTML in DMs)
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned.replace(/<![—\-\s]*>/g, '');  // Empty comment remnants like <!——>

  // 5. Strip action/score/metadata tags that leaked into visible text
  // AI sometimes writes these inline instead of in the LEAD comment
  cleaned = cleaned.replace(/\s*action\s*=\s*"[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s*score\s*=\s*\d+\+?/gi, '');
  cleaned = cleaned.replace(/\s*gender\s*=\s*"[^"]*"/gi, '');
  cleaned = cleaned.replace(/\s*intent\s*=\s*"[^"]*"/gi, '');

  return cleaned.trim();
}

// Outbound safety gate — final check before ANY message goes to a real user
// Call this right before sending to Instagram/ManyChat
export function sanitizeOutbound(text) {
  if (!text) return text;

  let safe = text;

  // Strip any HTML comments
  safe = safe.replace(/<!--[\s\S]*?-->/g, '');

  // Strip bare LEAD JSON that somehow survived
  if (safe.includes('LEAD:') || safe.includes('LEAD :')) {
    const leadIdx = safe.search(/LEAD\s*:/);
    if (leadIdx !== -1) {
      let cutStart = leadIdx;
      for (let i = leadIdx - 1; i >= Math.max(0, leadIdx - 10); i--) {
        if (safe[i] === '<' || safe[i] === '!') {
          cutStart = i;
          break;
        }
      }
      safe = safe.slice(0, cutStart).trim();
    }
  }

  // Strip any JSON blob that looks like lead metadata (score, gathered, action fields)
  safe = safe.replace(/\{[^{}]*"(?:score|gathered|action|gender|intent)"[^{}]*\}/g, '');

  // Strip action/metadata tags that leaked into visible text
  safe = safe.replace(/\s*action\s*=\s*"[^"]*"/gi, '');
  safe = safe.replace(/\s*score\s*=\s*\d+\+?/gi, '');
  safe = safe.replace(/\s*gender\s*=\s*"[^"]*"/gi, '');
  safe = safe.replace(/\s*intent\s*=\s*"[^"]*"/gi, '');

  // If after all cleaning the message is empty or just whitespace, return null (don't send)
  safe = safe.trim();
  if (!safe) return null;

  return safe;
}

// Compress long conversation histories to save context window space
// Keeps last 6 messages verbatim, summarizes earlier ones
function compressHistory(history) {
  const VERBATIM_COUNT = 6;
  if (history.length <= 10) return history;

  const earlyMessages = history.slice(0, -VERBATIM_COUNT);
  const recentMessages = history.slice(-VERBATIM_COUNT);

  const summaryParts = earlyMessages.map(msg => {
    const speaker = msg.role === 'user' ? 'לקוח' : 'אנחנו';
    const content = msg.content.length > 60
      ? msg.content.slice(0, 57) + '...'
      : msg.content;
    return `${speaker}: ${content}`;
  });

  const summaryMessage = {
    role: 'system',
    content: `[סיכום ${earlyMessages.length} הודעות קודמות:\n${summaryParts.join('\n')}\n--- ההודעות האחרונות למטה ---]`,
  };

  return [summaryMessage, ...recentMessages];
}

// Detect spam: 3+ identical messages in a row
function isSpamming(history) {
  const userMessages = history.filter(m => m.role === 'user');
  if (userMessages.length < 3) return false;
  const last3 = userMessages.slice(-3).map(m => m.content.trim().toLowerCase());
  // All 3 identical
  if (last3[0] === last3[1] && last3[1] === last3[2]) return true;
  return false;
}

// --- Post-Conversation Detection Helpers ---

const FAREWELL_PATTERNS = [
  /בהצלחה/, /מחכה לעדכון/, /נדבר שם/, /נדבר בשיחה/,
  /בשמחה\b/, /יאללה סגור/, /כל הכבוד/,
  /מובן לגמרי/, /בכיף/, /אין בעיה/,
  /תעדכן/, /תעדכני/,
];

function isConversationEffectivelyClosed(lead, history) {
  // Explicit status
  if (lead.status === 'closed') return { closed: true, reason: 'closed_explicit' };
  if (lead.status === 'booked') return { closed: true, reason: 'booked' };

  // Check last user message for conversion confirmation or disinterest
  const userMessages = history.filter(m => m.role === 'user');
  const lastUserMsg = userMessages[userMessages.length - 1]?.content || '';

  const CONVERSION_CONFIRMS = [
    /קבעתי/i, /נרשמתי/i, /שלחתי/i, /בוצע/i, /אני בפנים/i,
    /נקבע/i, /הזמנתי/i, /סגרתי/i, /אישרתי/i,
  ];

  const DISINTEREST = [
    /לא מעוניין/i, /לא מעוניינת/i, /לא רלוונטי/i,
    /לא בשבילי/i, /לא מתאים/i, /לא צריך/i, /לא צריכה/i,
  ];

  if (lead.bookingLinkSent && CONVERSION_CONFIRMS.some(p => p.test(lastUserMsg))) {
    return { closed: true, reason: 'converted' };
  }

  if (DISINTEREST.some(p => p.test(lastUserMsg))) {
    return { closed: true, reason: 'disinterest' };
  }

  // Booking link sent + farewell in recent bot messages
  if (lead.bookingLinkSent) {
    const recentBotMsgs = history
      .filter(m => m.role === 'assistant')
      .slice(-3)
      .map(m => m.content);

    if (recentBotMsgs.some(msg => FAREWELL_PATTERNS.some(p => p.test(msg)))) {
      return { closed: true, reason: 'farewell_after_cta' };
    }
  }

  return { closed: false, reason: null };
}

function isCasualPostConversation(text) {
  if (text.length > 30) return false;

  const casualPatterns = [
    /^תודה/i, /^tnx/i, /^thanks/i,
    /^(אוקי|אוקיז|ok|אוקיי)/i,
    /^(סבבה|בסדר|טוב|יופי|אחלה|מגניב)/i,
    /^(חחחח?|לול|haha)/i,
    /^בשמחה/i,
    /^(סגור|מעולה|אלוף)/i,
  ];

  return casualPatterns.some(p => p.test(text));
}

export async function generateReply(tenant, userId, userMessage, wasConsolidated = false) {
  // 1. Save user message
  // Always save userMessage - if consolidation happened, this is the consolidated message
  // This ensures the chat history matches what the AI actually saw and responded to
  await saveMessage(tenant.id, userId, 'user', userMessage);
  if (wasConsolidated) {
    console.log(`[${tenant.id}] Saved consolidated message for ${userId}`);
  }

  // 2. Get conversation history
  const history = await getConversationHistory(tenant.id, userId, 100);

  // 3. Check for spam/loops
  if (isSpamming(history)) {
    const spamReply = 'הכל בסדר? 😊';
    await saveMessage(tenant.id, userId, 'assistant', spamReply);
    return spamReply;
  }

  // 4. Get/create lead
  const lead = await getOrCreateLead(tenant.id, userId);

  // 4a. Post-conversation handling — prevent restarts after conversation is done
  const closeStatus = isConversationEffectivelyClosed(lead, history);
  if (closeStatus.closed) {
    const trimmedMsg = userMessage.trim();
    const isEmojiOnly = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s\u200d\ufe0f\u200b]+$/u.test(trimmedMsg);

    if (isEmojiOnly) {
      console.log(`[${tenant.id}] Emoji after closed conversation (${closeStatus.reason}) — not replying`);
      return null;
    }

    if (isCasualPostConversation(trimmedMsg)) {
      const ack = '🙏';
      await saveMessage(tenant.id, userId, 'assistant', ack);
      console.log(`[${tenant.id}] Casual follow-up after close (${closeStatus.reason}) — sending ack`);
      return ack;
    }

    // Substantive new message after close — allow continuation but log it
    console.log(`[${tenant.id}] New message after closed conversation (${closeStatus.reason}) from ${userId} — allowing`);
  }

  // 5. Count user messages for conversation phase
  const messageCount = history.filter(m => m.role === 'user').length;

  // 5b. Classify or reclassify entry type BEFORE building prompt
  if (lead.entryType === 'unknown') {
    // First classification — accept anything
    const entryType = classifyEntry(userMessage);
    lead.entryType = entryType;
    await updateLead(tenant.id, userId, { entryType });
  } else if (lead.entryType === 'greeting' && messageCount >= 2) {
    // User started with greeting — try to upgrade to a more specific type
    const reclassified = classifyEntry(userMessage);
    if (reclassified !== 'greeting' && reclassified !== 'unknown') {
      lead.entryType = reclassified;
      await updateLead(tenant.id, userId, { entryType: reclassified });
    }
  }

  // 5c. Resolve or update conversation mode
  const prevMode = lead.conversationMode;
  const botGoal = tenant.botGoal || 'book_calls';
  if (!lead.conversationMode) {
    const mode = resolveConversationMode(lead, lead.entryType, botGoal);
    lead.conversationMode = mode;
    await updateLead(tenant.id, userId, { conversationMode: mode });
    console.log(`[${tenant.id}] Mode: ${mode} for ${userId} (entry: ${lead.entryType}, goal: ${botGoal})`);
  } else {
    // Check for mode upgrade (e.g., fan starts asking about services)
    const newMode = resolveConversationMode(lead, lead.entryType, botGoal);
    if (newMode !== lead.conversationMode) {
      lead.conversationMode = newMode;
      await updateLead(tenant.id, userId, { conversationMode: newMode });
      console.log(`[${tenant.id}] Mode upgrade: ${prevMode} → ${newMode} for ${userId}`);
    }
  }

  // 5d. Post-CTA instruction injection — prevent bot from restarting sales flow
  // after booking link was sent. This is a hard block that goes into the prompt.
  let postCTAOverride = null;
  if (lead.bookingLinkSent) {
    postCTAOverride = `⚠️ **הלינק כבר נשלח!** חוק ברזל:
- אל תפתח שיחה מחדש. אל תשאל "מה מביא אותך" / "מה המטרה" / "ספר לי על עצמך"
- אם שואלים שאלה → ענה בקצרה
- אם אומרים "קבעתי" / "נרשמתי" → "אחלה! מחכה לך 🙏" + action="end_conversation", score=10
- אם כותבים סתם → ack קצר ("🙏" / "תמיד פה!")
- אם שואלים משהו חדש שלא קשור → ענה ותסיים`;
  }

  // 6. Use system prompt from tenant DB field
  const systemPrompt = tenant.systemPrompt || '';

  // 7. Build messages array (compress long histories to save context)
  const compressedHistory = compressHistory(history);
  const messages = [
    { role: 'system', content: systemPrompt },
    ...compressedHistory.map(m => ({
      role: m.role,
      content: m.content,
    })),
  ];

  // 8. Call AI (microservice preferred, fallback to in-process OpenRouter)
  let rawReply;
  let leadMetadataFromService = null;
  let microserviceUsage = null;
  let microserviceSubagentUsage = null;
  try {
    if (config.aiMicroserviceEnabled) {
      const result = await callAIMicroservice({
        tenant,
        lead,
        userId,
        userMessage,
        conversationHistory: compressedHistory,
        systemPrompt,
      });
      rawReply = result.reply;
      leadMetadataFromService = result.leadMetadata;
      microserviceUsage = result.usage;
      microserviceSubagentUsage = result.subagentUsage;
      
      // Handle null response from microservice (retries exhausted or timeout)
      // Don't send any message - better to be silent than reveal we're a bot
      if (!rawReply) {
        console.warn(`[${tenant.id}] Microservice returned no response for ${userId} — staying silent`);
        return null;
      }
      
      // Check for "not confident in answering" response
      // Send notification to business owner instead of AI response
      if (rawReply && rawReply.toLowerCase().includes(NOT_CONFIDENT_PHRASE)) {
        console.log(`[${tenant.id}] AI not confident for ${userId} — sending notification to owner`);
        const leadUsername = lead?.instagramUsername || lead?.instagramName || null;
        await sendNotConfidentNotification(leadUsername);
        // Don't send the AI response to the user - stay silent
        return null;
      }
    } else {
      const result = await callOpenRouter(messages, 300, 'SetterAI', tenant.aiTemperature ?? 0.6);
      rawReply = result.content;
      trackUsage(tenant.id, 'SetterAI', result.usage);
    }
  } catch (err) {
    console.error(`[${tenant.id}] AI reply failed after retries:`, err.message);
    // SILENT FAILURE — never expose errors to users. The bot simply doesn't reply.
    return null;
  }

  // 8b. Record microservice usage (fire-and-forget, never blocks reply)
  if (config.aiMicroserviceEnabled) {
    const toUsage = (u) => {
      if (!u || typeof u !== 'object') return null;
      const promptTokens = u.prompt_tokens ?? u.promptTokens ?? 0;
      const completionTokens = u.completion_tokens ?? u.completionTokens ?? 0;
      const totalTokens = u.total_tokens ?? u.totalTokens ?? (promptTokens + completionTokens);
      return { promptTokens, completionTokens, totalTokens };
    };

    if (Array.isArray(microserviceSubagentUsage) && microserviceSubagentUsage.length > 0) {
      for (const row of microserviceSubagentUsage) {
        const operation = row?.operation || 'SetterAI';
        const usage = toUsage(row);
        trackUsage(tenant.id, operation, usage);
      }
    } else {
      trackUsage(tenant.id, 'SetterAI', toUsage(microserviceUsage));
    }
  }

  // 9. Extract lead metadata + gathered data
  const leadData = leadMetadataFromService && typeof leadMetadataFromService === 'object'
    ? leadMetadataFromService
    : extractLeadData(rawReply);
  if (leadData) {
    const updates = {};
    if (leadData.name) updates.name = leadData.name;
    if (leadData.interest) updates.interest = leadData.interest;
    if (typeof leadData.score === 'number') updates.qualificationScore = leadData.score;
    if (leadData.gender && !lead.genderLocked) {
      const normalized = normalizeGender(leadData.gender);
      if (normalized) updates.gender = normalized;
    }
    // Mode-aware CTA gating: only allow send_link in qualify mode (or high score safety valve)
    const modeConfig = CONVERSATION_MODES[lead.conversationMode] || {};
    if (leadData.action === 'send_link') {
      if (modeConfig.allowsCTA || leadData.score >= 7) {
        updates.bookingLinkSent = true;
      } else {
        console.log(`[${tenant.id}] CTA suppressed — mode=${lead.conversationMode} for ${userId}`);
        leadData.action = 'none'; // suppress the CTA
      }
    }
    if (leadData.action === 'end_conversation') updates.status = 'closed';
    else if (leadData.action === 'needs_human') {
      updates.needsHuman = true;
      updates.needsHumanReason = leadData.interest || 'Bot not confident';
      console.log(`[${tenant.id}] 🚨 needs_human flagged for ${userId} — pausing auto-replies`);
    }
    else if (leadData.score >= 9) updates.status = 'booked';
    else if (leadData.score >= 7) updates.status = 'qualified';
    if (leadData.intent) updates.intent = leadData.intent;

    // Merge gathered data (additive — never overwrite existing values)
    if (leadData.gathered && typeof leadData.gathered === 'object') {
      const existingGathered = lead.gathered || {};
      const merged = { ...existingGathered };
      for (const [key, value] of Object.entries(leadData.gathered)) {
        if (value && value !== 'null' && !merged[key]) {
          merged[key] = value;
        }
      }
      updates.gathered = merged;
    }

    await updateLead(tenant.id, userId, updates);

    // 9b. Re-evaluate mode after AI intent classification (smart mode correction)
    // Step 5c set mode using dumb regex. Now the AI has classified intent — use it
    // to correct the mode if needed. This is the "brain" that makes mode smart.
    if (leadData.intent) {
      lead.intent = leadData.intent;
      const correctedMode = resolveConversationMode(lead, lead.entryType, botGoal);
      if (correctedMode !== lead.conversationMode) {
        const oldMode = lead.conversationMode;
        lead.conversationMode = correctedMode;
        await updateLead(tenant.id, userId, { conversationMode: correctedMode });
        console.log(`[${tenant.id}] Mode corrected by AI: ${oldMode} → ${correctedMode} for ${userId} (intent: ${leadData.intent})`);
      }
    }
  }

  // 11. Clean response
  let reply = cleanResponse(rawReply);

  // 11b. Anti-AI phrase filter — catch robotic/unnatural Hebrew that slips through prompt
  // SKIP when tenant has Voice DNA — their real phrasing IS the standard.
  // Voice DNA owners might naturally use "בהחלט" or "שמח לשמוע" — don't strip it.
  // Safety-net regex replacements — only for tenants WITHOUT Voice DNA.
  // These catch the most common AI Hebrew mistakes that slip through the prompt.
  // Kept minimal (top 10) — the prompt should prevent most issues proactively.
  const hasVoiceDNA = tenant.voiceExamples || tenant.voicePhrases;
  const AI_PHRASE_REPLACEMENTS = hasVoiceDNA ? [] : [
    // Wrong prepositions (AI's #1 Hebrew mistake)
    [/בצדך/g, 'אצלך'],
    [/בצידך/g, 'אצלך'],
    [/עבורך/g, 'בשבילך'],
    [/לעזרתך/g, 'לעזור לך'],
    // Archaic/formal Hebrew (AI defaults to these)
    [/כיצד/g, 'איך'],
    [/\bניתן\b/g, 'אפשר'],
    [/\bהינו\b/g, ''],
    [/\bהינה\b/g, ''],
    [/\bאנו\b/g, 'אנחנו'],
    // Robotic closers that kill the vibe
    [/אם יש עוד שאלות.*/g, ''],
    [/אם תצטרך עוד משהו.*/g, ''],
    [/אם תצטרכי עוד משהו.*/g, ''],
  ];
  for (const [pattern, replacement] of AI_PHRASE_REPLACEMENTS) {
    reply = reply.replace(pattern, replacement);
  }

  // 11c. Strip markdown formatting (bold, lists, headers)
  reply = reply
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1')  // **bold** or *italic*
    .replace(/^#+\s*/gm, '')                    // # headers
    .replace(/^[-*]\s+/gm, '')                  // - bullet points
    .replace(/^\d+\.\s+/gm, '')                 // 1. numbered lists
    .replace(/\s{2,}/g, ' ')                     // double spaces from removals
    .trim();

  // 11d. Ensure questions end with ? — Hebrew question words without ? sound like statements
  // Split into sentences, check each one for question words, add ? if missing
  const questionWords = /(?:מה|מי|איך|למה|מתי|איפה|כמה|האם|איזה|לאן|מאיפה|ואיפה|ומה|ואיך|תגיד|תגידי|רוצה|מעוניין|מעוניינת|בא לך)\s/;
  reply = reply.replace(/([^\n.!?]+)(?=\n|$)/g, (sentence) => {
    const trimmed = sentence.trim();
    if (!trimmed) return sentence;
    // If sentence contains a Hebrew question word and doesn't end with punctuation, add ?
    if (questionWords.test(trimmed) && !/[.!?]$/.test(trimmed)) {
      return sentence + '?';
    }
    return sentence;
  });

  // 12. CTA action — append based on ctaType
  if (leadData?.action === 'send_link' && !lead.bookingLinkSent) {
    const ctaType = tenant.ctaType || 'send_link';
    if (ctaType === 'send_link' && tenant.bookingInstructions && !reply.includes(tenant.bookingInstructions)) {
      const isFemale = normalizeGender(leadData?.gender) === 'female' || lead.gender === 'female';
      const updateWord = isFemale ? 'תעדכני' : 'תעדכן';
      reply += `\n\nהנה לינק לקביעת שיחה, צריך לבחור שם את השעה שמתאימה לך ואז זה יופיע לשנינו ביומן\n${tenant.bookingInstructions}\n${updateWord} שקבעת`;
    } else if (ctaType === 'give_phone' && tenant.ownerPhone && !reply.includes(tenant.ownerPhone)) {
      reply += `\n\n${tenant.ownerPhone}`;
    }
    // ask_phone and custom — the AI's reply text already handles it, no append needed
  }

  // 12b. Identity leak detection — catch cases where the AI accidentally reveals it's a bot
  const identityLeakPhrases = ['אני בוט', 'אני AI', 'מודל שפה', 'אני תוכנה', 'I am a bot', 'I am an AI', 'I\'m a bot', 'I\'m an AI', 'אני צ\'אטבוט', 'אני רובוט'];
  const replyLower = reply.toLowerCase();
  if (identityLeakPhrases.some(phrase => replyLower.includes(phrase.toLowerCase()))) {
    console.error(`[SECURITY] Identity leak detected for ${tenant.name} -> ${userId}: "${reply.slice(0, 100)}"`);
    reply = 'חחח מה? בוא נחזור לעניין — במה אפשר לעזור?';
  }

  // 13. Save assistant message
  await saveMessage(tenant.id, userId, 'assistant', reply);

  return reply;
}

// --- Message Splitting for Human-Like Delivery ---
// Splits a reply into [reaction, substance] to mimic natural DM patterns.
// Only splits longer messages, and only ~55% of the time for variety.
// The full reply is already saved to history — splitting is delivery-only.
export function splitReplyForHumanDelivery(reply) {
  const words = reply.trim().split(/\s+/);

  // Don't split short messages or messages with links (booking URLs)
  if (words.length < 15 || reply.includes('http') || reply.includes('calendly')) {
    return { parts: [reply], shouldSplit: false };
  }

  // Only split ~55% of the time for naturalness
  if (Math.random() > 0.55) {
    return { parts: [reply], shouldSplit: false };
  }

  // Find a natural split point in the first 40% of the message
  const splitZoneEnd = Math.floor(reply.length * 0.4);
  const splitZone = reply.slice(0, splitZoneEnd);

  const sentenceEnders = ['. ', '? ', '! ', '.\n', '?\n', '!\n'];
  let bestSplit = -1;
  for (const ender of sentenceEnders) {
    const idx = splitZone.lastIndexOf(ender);
    if (idx > bestSplit) bestSplit = idx + ender.length - 1;
  }

  // If no natural split found, don't force it
  if (bestSplit <= 3) {
    return { parts: [reply], shouldSplit: false };
  }

  const reaction = reply.slice(0, bestSplit + 1).trim();
  const substance = reply.slice(bestSplit + 1).trim();

  // Only split if both parts are meaningful
  if (reaction.length < 3 || substance.length < 10) {
    return { parts: [reply], shouldSplit: false };
  }

  return { parts: [reaction, substance], shouldSplit: true };
}

// --- Screenshot Knowledge Extractor ---
export async function extractFromScreenshot(base64Image, mimeType = 'image/jpeg') {
  const messages = [
    {
      role: 'system',
      content: `You are a business information extractor. You receive screenshots from a business owner — these can be price lists, service menus, booking pages, FAQs, schedules, Instagram posts, or any business-related content.

Your job: Extract ALL useful business information from the screenshot that a sales bot would need to know.

IMPORTANT:
- Write in Hebrew
- Be thorough — extract every detail (prices, services, hours, conditions, etc.)
- Format clearly with line breaks
- If it's a price list — list every item with its price
- If it's a schedule — list all times/days
- If it's a post/story — extract the key message and any offers
- Do NOT add information that isn't in the screenshot
- Do NOT wrap in JSON or markdown — just plain Hebrew text`,
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Extract all the business information from this screenshot:' },
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
      ],
    },
  ];

  const result = await callOpenRouter(messages, 1000, 'SetterAI Screenshot Extractor', 0.3);
  return result;
}

// --- teachBot removed: Now handled by AI microservice at /training/ingest ---
// See callTrainingMicroservice() in index.js for the HTTP-based implementation

// --- Voice Analyzer ---
export async function analyzeVoice(conversationText) {
  const voiceMessages = [
    {
      role: 'system',
      content: `You are an expert Hebrew communication analyst. You will receive raw Instagram DM conversations where a business owner chats with potential customers.

Your job: Analyze the BUSINESS OWNER's communication style and extract a voice profile.

IMPORTANT:
- Focus ONLY on the business owner's messages, not the customer's
- The conversations are in Hebrew
- Return ONLY valid JSON, no markdown, no explanation
- All values must be in Hebrew
- Be specific — use actual examples from the conversations, not generic descriptions
- VOICE ONLY — never include situational/temporary content like availability status ("not taking clients", "in army reserves", "full right now"), waitlists, or any message where the owner is deferring/turning away customers. Extract only their communication STYLE.

Return this exact JSON structure:
{
  "greeting": "How they typically greet people (exact quote or pattern)",
  "energy": "One of: רגוע, חם, אנרגטי, מקצועי",
  "phrases": "Common phrases/expressions they repeat, each on a new line",
  "emoji_usage": "One of: אף פעם, פה ושם, הרבה",
  "response_length": "One of: קצר, רגיל, מפורט",
  "humor": "One of: אין, קליל, יבש, מימים",
  "gender_terms_male": "How they address male customers (e.g. אחי, בוס, גבר)",
  "gender_terms_female": "How they address female customers (e.g. מותקי, יפה, מלכה)",
  "avoid_phrases": "Phrases they seem to NEVER use — robotic/formal language they avoid"
}`,
    },
    {
      role: 'user',
      content: `Analyze the business owner's communication style from these Instagram DM conversations:\n\n${conversationText}`,
    },
  ];

  const { content: rawContent, usage: voiceUsage } = await callOpenRouter(voiceMessages, 800, 'SetterAI Voice Analyzer');

  let profile;
  try {
    profile = parseAIJson(rawContent);
  } catch (e) {
    console.error('Voice analysis parse error:', rawContent?.slice(0, 300));
    throw new Error('Failed to parse voice analysis result');
  }

  return { profile, usage: voiceUsage };
}

// --- Voice DNA Import: extract compact voice profile from raw DM conversations ---
export async function importVoiceDNA(conversationText) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert Hebrew DM communication analyst. You receive raw Instagram DM conversations where a business owner chats with customers.

Analyze the BUSINESS OWNER's messages ONLY. Extract their voice DNA — the exact way they talk AND the exact things they say in specific situations.

CRITICAL RULES:
- All text values MUST be in Hebrew (except enum values)
- Use EXACT QUOTES from the conversations, not paraphrases
- Every example must be a real sentence they wrote (or very close to one)
- Return ONLY raw JSON — NO \`\`\`json fences, NO markdown, NO explanation before/after
- Focus on RECURRING PATTERNS — things they say repeatedly across different conversations
- Quality matters! The goal is to clone their voice perfectly. Capture their EXACT words.

⚠️ VOICE ONLY — NO SITUATIONAL CONTENT:
You are extracting HOW they talk, NOT temporary facts about their life. NEVER include:
- Availability status ("I'm not available", "not taking new clients", "I'm full", "I'll be back in a month")
- Personal circumstances ("I'm in army reserves", "I'm on vacation", "I'm sick")
- Temporary offers/discounts ("this week only", "special price until...")
- Waitlist/callback language ("I'll add you to the list", "I'll reach out when I'm free")
- ANY message where the owner is turning away or deferring a customer
These are SITUATIONAL and change over time — they must NEVER be part of the permanent voice profile.
Instead, for Q&A and CTA examples, only extract messages where the owner is ACTIVELY SELLING and engaging (inviting to a call, explaining services, pushing toward booking).

Return this exact JSON (fields in priority order — most important first):
{
  "greeting": "Their exact typical opening message (verbatim quote)",
  "energy": "chill|warm|high-energy|professional",
  "phrases": "5-8 signature phrases they repeat constantly, one per line. These are their verbal fingerprint.",
  "phrasesMale": "Exact words they use to address males (אחי, בוס, גבר, מלך, תותח — whatever THEY use)",
  "phrasesFemale": "Exact words they use to address females (מותקי, יפה, מלכה — whatever THEY use)",
  "emoji": "never|sometimes|a-lot",
  "emoji_favorites": "The specific emojis they actually use, in order of frequency (e.g. 🔥❤️😂🙏)",
  "length": "super-short|normal|detailed",
  "humor": "none|light|dry|memes",
  "avoid": "Formal/robotic phrases they clearly never use",
  "slang": "Unique vocabulary, slang, or filler words specific to them",
  "micro_patterns": "How they FORMAT messages: punctuation habits (... or !! or none), חחח/לול usage, sentence starters (שמע/תראה/יאללה/בוא), line breaks between thoughts, ending without period, etc.",
  "recurring_qa": "3-6 recurring Q&A patterns. Format: Q: [common question customers ask] → A: [owner's typical answer]. Customers ask the same questions — capture how THIS owner always answers them.",
  "examples_empathy": "3-5 EXACT messages when customer expresses pain/frustration/difficulty. How do they show they HEAR them? one per line",
  "examples_question": "3-5 EXACT discovery/probing questions they ask (these tend to repeat!), one per line",
  "examples_cta": "3-5 EXACT messages where they push toward a call/meeting/booking, one per line",
  "examples_greeting": "3-5 EXACT opening/greeting messages they send, one per line",
  "examples_reaction": "3-5 EXACT reactions when customer shares something positive (validation, praise), one per line",
  "examples_objection": "3-5 EXACT messages where they handle hesitation/price/rejection, one per line",
  "examples_casual": "2-3 EXACT messages in casual/small-talk moments (jokes, tangents, warmth), one per line",
  "personality": "A 2-3 sentence Hebrew paragraph describing WHO this person is as a communicator. Not style labels — a character sketch. Example: 'אח גדול שתמיד יודע מה להגיד. לא לוחץ, לא דוחף — אבל תמיד מוביל את השיחה. משתמש בהומור כדי להוריד מגננות ואז שואל שאלות חדות.' Think: archetype (mentor/bro/authority/empathic listener/challenger), how they build trust, their selling philosophy (push vs pull vs educational)."
}

PRIORITY ORDER of what matters most:
1. recurring_qa — the bot needs to ANSWER like the owner, not just sound like them
2. examples_empathy — how they handle pain (critical to not sound robotic)
3. personality — the CHARACTER that drives everything (archetype, trust style, philosophy)
4. examples_question — their go-to discovery questions (these repeat constantly)
5. examples_cta — their exact closing style
6. examples_greeting + examples_reaction — their warmth/style
7. Everything else — style DNA`,
    },
    {
      role: 'user',
      content: `Analyze this business owner's communication style:\n\n${conversationText.slice(0, 15000)}`,
    },
  ];

  const { content: rawContent, usage: dnaUsage } = await callOpenRouter(messages, 4000, 'SetterAI Voice DNA Import', 0.3);

  try {
    const dna = parseAIJson(rawContent);
    return { dna, usage: dnaUsage };
  } catch (e) {
    console.error('[VoiceDNA] Parse error:', rawContent?.slice(0, 300));
    throw new Error('Failed to parse voice DNA result');
  }
}

// Map voice DNA output to tenant fields with validation + defaults
export function mapVoiceDNAToTenant(dna) {
  const validEnergy = ['chill', 'warm', 'high-energy', 'professional'];
  const validEmoji = ['never', 'sometimes', 'a-lot'];
  const validLength = ['super-short', 'normal', 'detailed'];
  const validHumor = ['none', 'light', 'dry', 'memes'];

  // Build situation-organized examples (the core of voice cloning)
  const exampleSections = [];
  // Recurring Q&A first — this is the highest-value content
  if (dna.recurring_qa) exampleSections.push(`[תשובות חוזרות — השתמש בתשובות האלה כשנשאלת שאלות דומות!]\n${dna.recurring_qa}`);
  if (dna.examples_empathy) exampleSections.push(`[אמפתיה — כשלקוח מביע כאב/תסכול/קושי]\n${dna.examples_empathy}`);
  if (dna.examples_greeting) exampleSections.push(`[ברכה]\n${dna.examples_greeting}`);
  if (dna.examples_reaction) exampleSections.push(`[תגובה/פרגון]\n${dna.examples_reaction}`);
  if (dna.examples_question) exampleSections.push(`[שאלות]\n${dna.examples_question}`);
  if (dna.examples_cta) exampleSections.push(`[הצעת שיחה/סגירה]\n${dna.examples_cta}`);
  if (dna.examples_objection) exampleSections.push(`[התנגדויות]\n${dna.examples_objection}`);
  if (dna.examples_casual) exampleSections.push(`[שיחה חופשית/סמול טוק]\n${dna.examples_casual}`);
  // Fallback: if AI returned old-format flat examples
  const combinedExamples = exampleSections.length > 0
    ? exampleSections.join('\n\n')
    : (dna.examples || '');

  // Combine slang + micro_patterns + emoji favorites into slangWords
  const styleParts = [];
  if (dna.slang) styleParts.push(dna.slang);
  if (dna.micro_patterns) styleParts.push(`סגנון כתיבה: ${dna.micro_patterns}`);
  if (dna.emoji_favorites) styleParts.push(`אימוג׳י מועדפים: ${dna.emoji_favorites}`);
  const combinedStyle = styleParts.join('\n');

  return {
    voiceGreeting: (dna.greeting || '').slice(0, 200),
    voiceEnergy: validEnergy.includes(dna.energy) ? dna.energy : 'warm',
    voicePhrases: (dna.phrases || '').slice(0, 800),
    voicePhrasesMale: (dna.phrasesMale || '').slice(0, 200),
    voicePhrasesFemale: (dna.phrasesFemale || '').slice(0, 200),
    voiceEmoji: validEmoji.includes(dna.emoji) ? dna.emoji : 'sometimes',
    voiceLength: validLength.includes(dna.length) ? dna.length : 'normal',
    voiceHumor: validHumor.includes(dna.humor) ? dna.humor : 'light',
    voiceAvoid: (dna.avoid || '').slice(0, 500),
    voicePersonality: (dna.personality || '').slice(0, 1000),
    slangWords: combinedStyle.slice(0, 2500),
    voiceExamples: combinedExamples.slice(0, 10000),
  };
}

// --- Voice DNA v2: Multi-chunk analysis pipeline ---
// Accepts structured payload from the smart frontend preprocessing.
// Steps: build chunks → parallel Haiku extraction → Sonnet synthesis.

export async function importVoiceDNAv2({ ownerName, stats, topConversations }) {
  // Step 1: Build text chunks from top conversations
  const chunks = buildVoiceChunks(topConversations);
  console.log(`[VoiceDNA-v2] Built ${chunks.length} chunks from ${topConversations.length} conversations for "${ownerName}"`);

  // Step 2: Parallel Haiku extraction
  const chunkPrompt = `You are analyzing Instagram DM conversations by a business owner named "${ownerName}".
Extract their EXACT communication patterns. Only extract from messages by ${ownerName} (marked as [Owner]).

IMPORTANT: Extract from ALL types of conversations — sales, casual, support, fan engagement.
The goal is to capture their FULL personality, not just sales mode!

Return JSON with these fields (all values in Hebrew, use EXACT QUOTES from the conversations):
{
  "examples_empathy": "3-5 exact messages when customer shares pain/frustration, one per line",
  "examples_cta": "3-5 exact messages where they push toward a call/meeting/booking, one per line",
  "examples_question": "3-5 exact discovery/probing questions they ask, one per line",
  "examples_objection": "3-5 exact messages handling hesitation/price/rejection, one per line",
  "examples_greeting": "2-3 exact opening/greeting messages, one per line",
  "examples_reaction": "3-5 exact reactions to positive sharing (validation, praise, compliments), one per line",
  "examples_casual": "3-5 casual/small-talk/relationship-building messages, one per line",
  "recurring_qa": "2-4 Q&A patterns: Q: [customer question] → A: [owner's typical answer]",
  "phrases": "5-8 signature phrases they repeat across conversations",
  "style_notes": "Observations about their formatting: punctuation, emoji usage, sentence starters, typical message LENGTH"
}

⚠️ IMPORTANT:
- Include CASUAL + RELATIONSHIP messages! How they respond to fans, compliments, small talk = critical
- NEVER include availability excuses ("I'm not available", "on vacation") or logistics
- Focus on HOW they talk, not WHAT they sell
- Note typical message LENGTH — are they a 1-liner or a paragraph writer?

Return ONLY raw JSON — no markdown fences, no explanation.`;

  const chunkResults = await Promise.all(
    chunks.map(async (chunkText, i) => {
      try {
        const result = await callHaiku(
          [
            { role: 'system', content: chunkPrompt },
            { role: 'user', content: chunkText },
          ],
          1200,
          `VoiceDNA-Chunk-${i + 1}`
        );
        if (!result?.content) return null;
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]);
      } catch (err) {
        console.warn(`[VoiceDNA-v2] Chunk ${i + 1} failed:`, err.message);
        return null;
      }
    })
  );

  const validChunks = chunkResults.filter(Boolean);
  console.log(`[VoiceDNA-v2] ${validChunks.length}/${chunks.length} chunks succeeded`);

  if (validChunks.length === 0) {
    throw new Error('Voice DNA analysis failed — no chunks returned results');
  }

  // Step 3: Sonnet synthesis — merge chunk results + stats into final DNA
  const statsSection = stats ? formatStatsForSynthesis(stats) : '';
  const mergedChunks = mergeChunkResults(validChunks);

  const synthesisMessages = [
    {
      role: 'system',
      content: `You are synthesizing a Voice DNA profile for "${ownerName}" from pre-analyzed conversation data.

You have:
1. Statistical analysis of ${stats?.totalMessages || 'many'} messages
2. Pre-extracted examples from ${validChunks.length} conversation batches

Your job: MERGE, DEDUPLICATE, and pick the BEST examples. Remove near-duplicates. Prioritize recurring patterns over one-offs.

${statsSection}

Return the EXACT same JSON format as below. All values in Hebrew. Use EXACT QUOTES, not paraphrases.
Return ONLY raw JSON — no markdown fences, no explanation.

{
  "greeting": "Their most common opening message (verbatim)",
  "energy": "chill|warm|high-energy|professional",
  "phrases": "5-8 most distinctive signature phrases, one per line",
  "phrasesMale": "Words they use to address males",
  "phrasesFemale": "Words they use to address females",
  "emoji": "never|sometimes|a-lot",
  "emoji_favorites": "Top emojis they use, in frequency order",
  "length": "super-short|normal|detailed",
  "humor": "none|light|dry|memes",
  "avoid": "Formal/robotic phrases they clearly never use",
  "slang": "Unique slang, filler words, and vocabulary",
  "micro_patterns": "Formatting habits: punctuation, line breaks, sentence starters",
  "recurring_qa": "Top 5-8 Q&A patterns. Q: → A: format. MOST IMPORTANT field.",
  "examples_empathy": "Top 5-7 empathy messages (merged from chunks, deduplicated)",
  "examples_question": "Top 5-7 discovery questions",
  "examples_cta": "Top 5-7 CTA/closing messages",
  "examples_greeting": "Top 3-5 greetings",
  "examples_reaction": "Top 3-5 positive reactions",
  "examples_objection": "Top 3-5 objection handling messages",
  "examples_casual": "Top 5-7 casual/small-talk messages (CRITICAL — this is how they talk when NOT selling)",
  "personality": "A 3-4 sentence Hebrew paragraph: WHO is this person as a communicator? Archetype, trust-building style, selling philosophy."
}

⚠️ CRITICAL BALANCE: Most DMs are NOT sales conversations! The bot needs to sound natural in casual chats too.
If casual/reaction examples are weak — extract more from the data. These are as important as empathy/CTA.

PRIORITY ORDER (most important first):
1. recurring_qa — how they ANSWER common questions
2. examples_reaction + examples_casual — how they talk when NOT selling (most common DM scenario!)
3. examples_empathy — how they handle pain (critical for not sounding robotic)
4. personality — the CHARACTER driving everything
5. examples_question — their go-to discovery questions
6. examples_cta — their exact closing style (used rarely, only when lead is ready)
7. Everything else`,
    },
    {
      role: 'user',
      content: `Pre-extracted data from ${validChunks.length} conversation batches:\n\n${JSON.stringify(mergedChunks, null, 2)}`,
    },
  ];

  const { content: rawContent, usage: dnaUsage } = await callOpenRouter(synthesisMessages, 4000, 'VoiceDNA-v2-Synthesis', 0.3);

  try {
    const dna = parseAIJson(rawContent);
    return { dna, usage: dnaUsage };
  } catch (e) {
    console.error('[VoiceDNA-v2] Synthesis parse error:', rawContent?.slice(0, 300));
    throw new Error('Failed to parse voice DNA synthesis result');
  }
}

// Build text chunks from top conversations for Haiku analysis
function buildVoiceChunks(topConversations) {
  const TARGET_CHUNK_SIZE = 8000; // chars per chunk
  const MAX_CHUNKS = 4;

  const chunks = [];
  let currentChunk = '';

  for (const conv of topConversations) {
    // Format conversation with [Owner]/[Customer] labels
    const formatted = conv.messages
      .map(m => `[${m.isOwner ? 'Owner' : 'Customer'}]: ${m.content}`)
      .join('\n');
    const convBlock = `--- שיחה ---\n${formatted}\n\n`;

    if (currentChunk.length + convBlock.length > TARGET_CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = '';
      if (chunks.length >= MAX_CHUNKS) break;
    }
    currentChunk += convBlock;
  }

  if (currentChunk.length > 0 && chunks.length < MAX_CHUNKS) {
    chunks.push(currentChunk);
  }

  return chunks;
}

// Format frontend stats for the synthesis prompt
function formatStatsForSynthesis(stats) {
  const parts = [];

  if (stats.totalMessages) {
    parts.push(`Total owner messages analyzed: ${stats.totalMessages}`);
    parts.push(`Average message length: ${stats.avgLength} chars (median: ${stats.medianLength})`);
  }

  if (stats.topEmojis?.length > 0) {
    const emojiStr = stats.topEmojis.slice(0, 8).map(e => `${e.emoji}(${e.count})`).join(' ');
    parts.push(`Top emojis: ${emojiStr}`);
  }

  if (stats.topPhrases?.length > 0) {
    const phraseStr = stats.topPhrases.slice(0, 15).map(p => `"${p.phrase}"(${p.count}x)`).join(', ');
    parts.push(`Most repeated phrases: ${phraseStr}`);
  }

  if (stats.punctuation) {
    const p = stats.punctuation;
    const styles = [];
    if (p.ellipsis > 20) styles.push('uses ... frequently');
    if (p.exclamation > 30) styles.push('uses ! a lot');
    if (p.noPeriod > 60) styles.push('rarely ends with period');
    if (styles.length > 0) parts.push(`Punctuation: ${styles.join(', ')}`);
  }

  if (stats.topGreetings?.length > 0) {
    const greetStr = stats.topGreetings.map(g => `"${g.text}"(${g.count}x)`).join(', ');
    parts.push(`Common greetings: ${greetStr}`);
  }

  return parts.length > 0
    ? `## Statistical Analysis (hard data from ALL messages)\n${parts.join('\n')}\n\nUse this data to VALIDATE your extraction — if stats say they use "..." 40% of the time, the profile must reflect that.`
    : '';
}

// Merge results from multiple Haiku chunks into a combined object
function mergeChunkResults(chunks) {
  const merged = {};
  const arrayFields = [
    'examples_empathy', 'examples_cta', 'examples_question', 'examples_objection',
    'examples_greeting', 'examples_reaction', 'examples_casual', 'recurring_qa', 'phrases',
  ];

  for (const chunk of chunks) {
    for (const [key, value] of Object.entries(chunk)) {
      if (!value) continue;
      if (arrayFields.includes(key)) {
        // These are newline-separated lists — merge them
        if (!merged[key]) merged[key] = '';
        merged[key] += (merged[key] ? '\n' : '') + value;
      } else {
        // For other fields, keep the longer/more detailed version
        if (!merged[key] || (typeof value === 'string' && value.length > (merged[key]?.length || 0))) {
          merged[key] = value;
        }
      }
    }
  }

  return merged;
}

// Extract messages from Instagram JSON export format
export function extractMessagesFromInstagramJSON(jsonText) {
  try {
    const data = JSON.parse(jsonText);
    // Instagram export format: { messages: [{ sender_name, content, timestamp_ms }] }
    if (data.messages && Array.isArray(data.messages)) {
      return data.messages
        .filter(m => m.content)
        .map(m => `${m.sender_name || 'Unknown'}: ${m.content}`)
        .reverse() // Instagram exports newest first
        .join('\n');
    }
    // Try array of conversations
    if (Array.isArray(data)) {
      return data
        .filter(m => m.content || m.text || m.message)
        .map(m => m.content || m.text || m.message)
        .join('\n');
    }
    return null;
  } catch {
    return null; // Not JSON — treat as plain text
  }
}

// --- Wizard: Extract KB entries from onboarding conversation ---
export async function extractWizardKnowledge(tenant, conversationText) {
  const messages = [
    {
      role: 'system',
      content: `You are a business knowledge extractor. You receive a conversation between a business owner and a potential customer (role-play scenario during onboarding).

Extract business knowledge that a sales bot would need. Focus on the OWNER's replies only.

Return ONLY raw JSON — NO \`\`\`json fences, NO markdown, NO text before/after.
[
  { "category": "faq", "title": "short title in Hebrew", "content": "the knowledge in Hebrew" },
  ...
]

Categories to use:
- "faq" — pricing, services, availability, process info the owner mentioned
- "objections" — exact technique for handling price/hesitation/past-experience objections. Capture HOW they handled it (empathy? redirect? reframe? discount?)
- "sop" — booking process, what happens after booking, follow-up approach
- "rules" — firm policies the owner stated ("we don't do X", "always Y first", "minimum Z")
- "corrections" — if the owner corrected a customer assumption, that's a business rule

Rules:
- Write everything in Hebrew
- Extract 5-15 entries (more is better — we can always remove later)
- Each entry must contain SPECIFIC information from the conversation, not generic advice
- Include the owner's EXACT WORDS where possible
- If they quoted a price → capture the exact price and what it includes
- If they described a process → capture the steps
- If they handled an objection → capture the specific TECHNIQUE they used
- If they mentioned policies or limits → capture as "rules"
- Do NOT invent information that wasn't in the conversation`,
    },
    {
      role: 'user',
      content: `Business: ${tenant.name} (${tenant.businessType})\nServices: ${tenant.services}\n\nConversation:\n${conversationText}`,
    },
  ];

  const { content: raw, usage: wizardKbUsage } = await callOpenRouter(messages, 2000, 'SetterAI Wizard KB Extract', 0.3);
  trackUsage(tenant.id, 'WizardExtract', wizardKbUsage);

  try {
    const parsed = parseAIJson(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[Wizard] KB extraction parse error:', raw?.slice(0, 300));
    return [];
  }
}

// --- Wizard V4: Extract conversation strategy from interview ---
export async function extractStrategy(tenant, interviewText) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert at extracting sales conversation strategies from business owner interviews.
You receive a conversation where a business owner explains how they handle Instagram DM conversations with potential customers.

Extract their CONVERSATION STRATEGY — not their personality or voice (that's handled separately).

Return ONLY raw JSON — NO \`\`\`json fences, NO markdown, NO text before/after:
{
  "speed": "quick|balanced|deep",
  "questions": [
    {
      "id": "snake_case_id",
      "label": "Hebrew display label",
      "prompt": "The exact question phrasing in Hebrew, as the owner described asking it",
      "required": true/false,
      "skipEntryTypes": ["booking_request", ...]
    }
  ],
  "responseGuidance": {
    "shortAnswer": "What the owner does when customer gives a vague answer (Hebrew, 1 sentence)",
    "detailedAnswer": "What the owner does when customer gives detailed info (Hebrew, 1 sentence)",
    "resistant": "What the owner does when customer pushes back (Hebrew, 1 sentence)",
    "enthusiastic": "What the owner does when customer is excited (Hebrew, 1 sentence)"
  },
  "pushBack": [
    { "trigger": "Hebrew description of disqualification scenario", "action": "disqualify|soft_exit|redirect", "guidance": "Hebrew guidance for the bot" }
  ],
  "idealSignals": ["Hebrew signal 1", "Hebrew signal 2"],
  "commonQA": [
    { "q": "Common question customers ask in Hebrew", "a": "Owner's typical answer in Hebrew" }
  ],
  "rawStrategyNotes": "2-3 sentence summary of the owner's approach in Hebrew"
}

RULES:
- Maximum 6 questions
- questions[0].id should be "goal" if they ask about what the customer wants
- Use the owner's EXACT WORDS for prompts and answers
- speed: "quick" = 1 question max before CTA, "balanced" = 2-3 questions, "deep" = 4+ questions
- skipEntryTypes options: booking_request, price_ask, service_inquiry, problem_statement, aspiration, content_reaction, greeting, unknown
- For "quick" speed, most questions should skip most entry types
- booking_request should always be in skipEntryTypes for every question
- Include pushBack only for scenarios the owner explicitly mentioned
- commonQA: extract REAL Q&A patterns from the conversation, not generic ones
- If the owner didn't mention something, omit it (empty arrays are fine)`,
    },
    {
      role: 'user',
      content: `Business: ${tenant.name || 'לא ידוע'} (${tenant.businessType || 'לא ידוע'})
Services: ${tenant.services || 'לא ידוע'}

Strategy interview transcript:
${interviewText}`,
    },
  ];

  const { content: raw, usage } = await callOpenRouter(messages, 2000, 'SetterAI Strategy Extract', 0.3);
  trackUsage(tenant.id, 'StrategyExtract', usage);

  try {
    const parsed = parseAIJson(raw);

    // Validate and sanitize
    const validSpeeds = ['quick', 'balanced', 'deep'];
    if (!validSpeeds.includes(parsed.speed)) parsed.speed = 'balanced';
    if (!Array.isArray(parsed.questions)) parsed.questions = [];
    parsed.questions = parsed.questions.slice(0, 6); // max 6
    if (!parsed.responseGuidance) parsed.responseGuidance = {};
    if (!Array.isArray(parsed.pushBack)) parsed.pushBack = [];
    if (!Array.isArray(parsed.idealSignals)) parsed.idealSignals = [];
    if (!Array.isArray(parsed.commonQA)) parsed.commonQA = [];

    return { strategy: parsed, usage };
  } catch (e) {
    console.error('[Strategy] Parse error:', raw?.slice(0, 200));
    throw new Error('Failed to parse strategy extraction result');
  }
}

// --- Freeflow Onboarding Extraction ---
// Extracts ALL bot config from a freeflow conversation where the owner described their bot's behavior.

export async function extractFreeflowConfig(tenant, conversationText) {
  const messages = [
    {
      role: 'system',
      content: `You are an expert at setting up Instagram DM bots for Israeli businesses.
You receive a conversation where a business owner DESCRIBED how they want their bot to behave.
Your job: extract STRUCTURED CONFIGURATION from what they said.

Return ONLY raw JSON — NO \`\`\`json fences, NO markdown, NO text before/after:
{
  "botGoal": "book_calls|warm_up|answer_questions|custom",
  "maxBotMessages": null or number (2-20),
  "voiceEnergy": "chill|warm|high-energy|professional",
  "voiceEmoji": "never|sometimes|a-lot",
  "voiceLength": "super-short|normal|detailed",
  "voiceHumor": "none|light|dry|memes",
  "voiceGreeting": "Hebrew greeting phrase or empty string",
  "voicePhrases": "comma-separated Hebrew phrases the bot should use",
  "voiceAvoid": "comma-separated Hebrew phrases the bot should NEVER use",
  "strategy": {
    "speed": "quick|balanced|deep",
    "questions": [
      { "id": "snake_case_id", "label": "Hebrew label", "prompt": "Hebrew question", "required": true/false }
    ],
    "commonQA": [
      { "q": "Common question in Hebrew", "a": "Answer in Hebrew" }
    ],
    "handlingPatterns": [
      { "situation": "Hebrew situation", "response": "Hebrew response guidance" }
    ]
  },
  "ctaPushLevel": "soft|normal|aggressive",
  "customFlowInstructions": "Free-text Hebrew instructions — anything specific the owner described that doesn't fit the structured fields above",
  "knowledgeEntries": [
    { "category": "faq|sop|rules|objections|general", "title": "Hebrew title", "content": "Hebrew content" }
  ]
}

MAPPING RULES — match Hebrew descriptions to values:
- "קצר ותכליתי" / "מהיר" / "ישר לעניין" → voiceLength: "super-short", speed: "quick"
- "חמם את ההודעות" / "בנה קשר" / "אל תמכור" → botGoal: "warm_up"
- "תעצור אחרי X הודעות" / "X הודעות ועוצר" → maxBotMessages: X
- "אני סוגר בעצמי" / "אני ממשיך ממנו" → botGoal: "warm_up" (owner handles closing)
- "תענה מקצועית" / "תהיה מומחה" → botGoal: "answer_questions"
- "תקבע שיחות" / "תסגור פגישות" / "תשלח לינק" → botGoal: "book_calls"
- "שאל X שאלות ואז תציע שיחה" → strategy.questions with X questions, botGoal: "book_calls"
- "בלי אימוג'י" / "לא אימוג'יים" → voiceEmoji: "never"
- "רגוע" / "שלו" → voiceEnergy: "chill"
- "אנרגטי" / "נלהב" → voiceEnergy: "high-energy"
- "רציני" / "מקצועי" / "פורמלי" → voiceEnergy: "professional"
- "אל תדחוף" / "רך" / "עדין" → ctaPushLevel: "soft"
- "תדחוף" / "אגרסיבי" / "תסגור מהר" → ctaPushLevel: "aggressive"

IMPORTANT:
- Extract from what the OWNER said, not the interviewer's questions
- Use the owner's EXACT Hebrew phrasing where possible
- If the owner gave specific conversation examples → put them in customFlowInstructions
- If the owner described pricing, services, FAQs → create knowledgeEntries
- If something wasn't mentioned → use sensible defaults (warm, sometimes, normal, light, balanced)
- customFlowInstructions should capture the SPIRIT of what they want — specific behavioral rules in Hebrew
- Max 6 strategy questions, max 10 knowledge entries
- strategy.questions[0].id should be "goal" if they want to know what the customer wants`,
    },
    {
      role: 'user',
      content: `Business: ${tenant.name || 'לא ידוע'} (${tenant.businessType || 'לא ידוע'})
Services: ${tenant.services || 'לא ידוע'}
Owner: ${tenant.ownerName || 'לא ידוע'}

Freeflow onboarding transcript:
${conversationText}`,
    },
  ];

  const { content: raw, usage } = await callOpenRouter(messages, 2000, 'SetterAI Freeflow Extract', 0.3);
  trackUsage(tenant.id, 'FreeflowExtract', usage);

  try {
    const parsed = parseAIJson(raw);

    // Validate and sanitize
    const validGoals = ['book_calls', 'warm_up', 'answer_questions', 'custom'];
    if (!validGoals.includes(parsed.botGoal)) parsed.botGoal = 'book_calls';

    if (parsed.maxBotMessages != null) {
      parsed.maxBotMessages = Math.max(2, Math.min(20, parseInt(parsed.maxBotMessages) || 0)) || null;
    }

    const validEnergies = ['chill', 'warm', 'high-energy', 'professional'];
    if (!validEnergies.includes(parsed.voiceEnergy)) parsed.voiceEnergy = 'warm';

    const validEmojis = ['never', 'sometimes', 'a-lot'];
    if (!validEmojis.includes(parsed.voiceEmoji)) parsed.voiceEmoji = 'sometimes';

    const validLengths = ['super-short', 'normal', 'detailed'];
    if (!validLengths.includes(parsed.voiceLength)) parsed.voiceLength = 'normal';

    const validHumors = ['none', 'light', 'dry', 'memes'];
    if (!validHumors.includes(parsed.voiceHumor)) parsed.voiceHumor = 'light';

    const validPush = ['soft', 'normal', 'aggressive'];
    if (!validPush.includes(parsed.ctaPushLevel)) parsed.ctaPushLevel = 'normal';

    // Strategy validation
    if (!parsed.strategy) parsed.strategy = { speed: 'balanced', questions: [], commonQA: [], handlingPatterns: [] };
    const validSpeeds = ['quick', 'balanced', 'deep'];
    if (!validSpeeds.includes(parsed.strategy.speed)) parsed.strategy.speed = 'balanced';
    if (!Array.isArray(parsed.strategy.questions)) parsed.strategy.questions = [];
    parsed.strategy.questions = parsed.strategy.questions.slice(0, 6);
    if (!Array.isArray(parsed.strategy.commonQA)) parsed.strategy.commonQA = [];
    if (!Array.isArray(parsed.strategy.handlingPatterns)) parsed.strategy.handlingPatterns = [];

    if (!Array.isArray(parsed.knowledgeEntries)) parsed.knowledgeEntries = [];
    parsed.knowledgeEntries = parsed.knowledgeEntries.slice(0, 10);

    if (!parsed.customFlowInstructions) parsed.customFlowInstructions = '';
    if (!parsed.voiceGreeting) parsed.voiceGreeting = '';
    if (!parsed.voicePhrases) parsed.voicePhrases = '';
    if (!parsed.voiceAvoid) parsed.voiceAvoid = '';

    return { config: parsed, usage };
  } catch (e) {
    console.error('[Freeflow] Parse error:', raw?.slice(0, 200));
    throw new Error('Failed to parse freeflow extraction result');
  }
}
