// src/outcomes.js — Conversation outcome tracking (Self-Learning System)
// Tracks: did the lead convert? How many messages? Where did they drop off?
// Runs as a batch job (every 6h) + per-message metric updates.
// Guarded by LEARNING_ENABLED env var — if disabled, all functions are no-ops.

import {
  upsertOutcome, getActiveOutcomes, getOutcome,
  getConversationHistory, getLeadsByTenant, getAllTenants,
} from './db.js';

const LEARNING_ENABLED = process.env.LEARNING_ENABLED !== 'false';

// --- Hebrew patterns for outcome detection ---

const CONVERSION_PATTERNS = [
  /קבעתי/i, /נרשמתי/i, /שלחתי/i, /בוצע/i, /אני בפנים/i,
  /נקבע/i, /הזמנתי/i, /רשמתי/i, /סגרתי/i, /עשיתי/i,
  /מאשר/i, /אישרתי/i, /מצוין נדבר/i,
];

const DISINTEREST_PATTERNS = [
  /לא מעוניין/i, /לא מעוניינת/i,
  /לא רלוונטי/i, /לא בשבילי/i,
  /לא מתאים/i, /לא צריך/i, /לא צריכה/i,
  /חבל על הזמן/i, /אל תפנה אלי/i,
  /תפסיק לכתוב/i, /תחסום/i,
];

const FAREWELL_PATTERNS = [
  /בהצלחה/i, /מחכה לעדכון/i, /נדבר שם/i, /נדבר בשיחה/i,
  /בשמחה\b/i, /יאללה סגור/i, /כל הכבוד/i,
  /תעדכן/i, /תעדכני/i, /יאללה ביי/i,
];

// --- Per-message update: counts + timestamps ---

export async function updateOutcomeMetrics(tenantId, userId, role) {
  if (!LEARNING_ENABLED) return;

  try {
    const existing = await getOutcome(tenantId, userId);
    const now = new Date().toISOString();

    if (!existing) {
      // First message — create outcome record
      await upsertOutcome(tenantId, userId, {
        firstMessageAt: now,
        lastMessageAt: now,
        userMessageCount: role === 'user' ? 1 : 0,
        botMessageCount: role === 'assistant' ? 1 : 0,
        totalMessages: 1,
      });
      return;
    }

    // Update counts incrementally
    const updates = { lastMessageAt: now };
    if (role === 'user') {
      updates.userMessageCount = (existing.user_message_count || 0) + 1;
    } else if (role === 'assistant') {
      updates.botMessageCount = (existing.bot_message_count || 0) + 1;
    }
    updates.totalMessages = (existing.total_messages || 0) + 1;

    await upsertOutcome(tenantId, userId, updates);
  } catch (err) {
    console.warn('[Outcomes] Metric update failed (non-fatal):', err.message);
  }
}

// --- Detect close reason from conversation content ---

export function detectCloseReason(lead, history) {
  // Explicit lead status
  if (lead.status === 'booked') return { closed: true, reason: 'booked' };
  if (lead.status === 'closed') return { closed: true, reason: 'closed_explicit' };

  const userMessages = history.filter(m => m.role === 'user').map(m => m.content);
  const botMessages = history.filter(m => m.role === 'assistant').map(m => m.content);
  const lastUserMsg = userMessages[userMessages.length - 1] || '';
  const recentBotMsgs = botMessages.slice(-3);

  // Check for conversion confirmation from user
  if (lead.bookingLinkSent && CONVERSION_PATTERNS.some(p => p.test(lastUserMsg))) {
    return { closed: true, reason: 'converted' };
  }

  // Check for disinterest from user
  if (DISINTEREST_PATTERNS.some(p => p.test(lastUserMsg))) {
    return { closed: true, reason: 'disinterest' };
  }

  // Booking link sent + farewell in bot messages
  if (lead.bookingLinkSent && recentBotMsgs.some(msg => FAREWELL_PATTERNS.some(p => p.test(msg)))) {
    return { closed: true, reason: 'farewell_after_cta' };
  }

  return { closed: false, reason: null };
}

// --- Batch job: classify outcomes for stale conversations ---

export async function classifyStaleOutcomes() {
  if (!LEARNING_ENABLED) return { classified: 0 };

  try {
    // Get conversations that have been inactive for 48+ hours and are still "active"
    const stale = await getActiveOutcomes(48);
    let classified = 0;

    for (const row of stale) {
      try {
        const outcome = determineStaleOutcome(row);
        if (outcome !== 'active') {
          await upsertOutcome(row.tenant_id, row.user_id, {
            outcome,
            outcomeAt: new Date().toISOString(),
            finalScore: row.qualification_score || 0,
            finalMode: row.conversation_mode || null,
            finalEntryType: row.entry_type || null,
            bookingLinkSent: row.lead_bls || false,
            lastStep: row.current_step || null,
            dropOffAfterStep: outcome === 'dropped' ? (row.current_step || null) : null,
          });
          classified++;
        }
      } catch (err) {
        console.warn(`[Outcomes] Failed to classify ${row.tenant_id}:${row.user_id}:`, err.message);
      }
    }

    if (classified > 0) {
      console.log(`[Outcomes] Classified ${classified} stale conversation(s)`);
    }
    return { classified };
  } catch (err) {
    console.warn('[Outcomes] Batch classification failed (non-fatal):', err.message);
    return { classified: 0 };
  }
}

function determineStaleOutcome(row) {
  // High score + booking link sent → likely converted (even if they didn't confirm)
  if (row.lead_bls && (row.qualification_score || 0) >= 8) return 'converted';

  // Booking link sent but no high score → dropped after CTA
  if (row.lead_bls) return 'dropped';

  // Was in qualify mode but never got to CTA → dropped during qualification
  if (row.conversation_mode === 'qualify') return 'dropped';

  // Non-sales modes (engage, assist, acknowledge) → closed naturally
  if (['engage', 'assist', 'acknowledge'].includes(row.conversation_mode)) return 'closed_by_bot';

  // Default for stale conversations
  return 'dropped';
}

// --- Update outcome on real-time close detection ---

export async function markOutcomeFromCloseReason(tenantId, userId, closeReason, lead) {
  if (!LEARNING_ENABLED) return;

  try {
    const outcomeMap = {
      'booked': 'converted',
      'converted': 'converted',
      'closed_explicit': 'closed_by_bot',
      'disinterest': 'closed_by_user',
      'farewell_after_cta': 'converted', // optimistic: link sent + farewell = probably converting
    };

    const outcome = outcomeMap[closeReason] || 'closed_by_bot';

    await upsertOutcome(tenantId, userId, {
      outcome,
      closeReason,
      outcomeAt: new Date().toISOString(),
      finalScore: lead.qualificationScore || 0,
      finalMode: lead.conversationMode || null,
      finalEntryType: lead.entryType || null,
      bookingLinkSent: lead.bookingLinkSent || false,
      lastStep: lead.currentStep || null,
    });
  } catch (err) {
    console.warn('[Outcomes] markOutcomeFromCloseReason failed (non-fatal):', err.message);
  }
}
