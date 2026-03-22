// src/qa.js — Self-QA system for conversation quality
// Detects issues in real-time, logs them, and auto-adds corrections to KB
// so the AI learns from its mistakes in future conversations.

import { addKnowledgeEntry, getKnowledgeEntriesForTenant, recordQAIssue } from './db.js';

// --- Metadata Leak Detection ---
const METADATA_PATTERNS = [
  { pattern: /action\s*=\s*"[^"]*"/i, name: 'action_tag_leak' },
  { pattern: /score\s*=\s*\d+/i, name: 'score_leak' },
  { pattern: /\bgender\s*=\s*"[^"]*"/i, name: 'gender_tag_leak' },
  { pattern: /\bintent\s*=\s*"[^"]*"/i, name: 'intent_tag_leak' },
  { pattern: /<!--[\s\S]*?-->/g, name: 'html_comment_leak' },
  { pattern: /LEAD\s*:\s*\{/i, name: 'lead_json_leak' },
  { pattern: /\bgathered\s*:\s*\{/i, name: 'gathered_json_leak' },
];

// --- Opening questions (shouldn't appear after CTA was sent) ---
const OPENING_QUESTIONS = [
  /מה מביא אותך/i,
  /מה הביא אותך/i,
  /מה תוקע אותך/i,
  /מה המטרה/i,
  /ספר לי על עצמך/i,
  /מה עניין אותך/i,
  /למה פנית/i,
  /מה קורה איתך היום/i,
];

// --- User frustration signals ---
const FRUSTRATION_SIGNALS = [
  /נו באמת/i,
  /לא הבנתי/i,
  /🤦/, /🤷/,
  /עזוב/i,
  /מספיק/i,
  /תפסיק/i,
  /חלאס/i,
  /מה אתה רוצה/i,
  /לא מעניין/i,
  /מה זה הזוי/i,
];

// --- Post-Reply Quality Check ---
// Runs after every bot reply. Detects issues and logs them.
export function checkReplyQuality(tenantName, userId, reply, history, lead) {
  const issues = [];

  // 1. Metadata leak in sent reply (even after sanitizeOutbound — belt and suspenders)
  for (const { pattern, name } of METADATA_PATTERNS) {
    if (pattern.test(reply)) {
      issues.push({ type: name, severity: 'critical' });
    }
  }

  // 2. Repetitive question detection — compare new reply's questions against recent bot questions
  const botMessages = history.filter(m => m.role === 'assistant').map(m => m.content);
  if (botMessages.length >= 1) {
    const recentBotQuestions = botMessages.slice(-3).flatMap(extractQuestions);
    const newQuestions = extractQuestions(reply);
    for (const nq of newQuestions) {
      if (recentBotQuestions.some(rq => questionSimilarity(rq, nq) > 0.5)) {
        issues.push({ type: 'repetitive_question', severity: 'warning', detail: nq });
      }
    }
  }

  // 3. Post-CTA restart detection (asking opening questions after link was sent)
  if (lead.bookingLinkSent && OPENING_QUESTIONS.some(p => p.test(reply))) {
    issues.push({ type: 'post_cta_restart', severity: 'critical', detail: 'Bot restarted qualification after CTA' });
  }

  // 4. User frustration not handled properly
  const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  if (FRUSTRATION_SIGNALS.some(p => p.test(lastUserMsg))) {
    const respondedOK = /בוא נקבע|יאללה|סבבה|לינק|שיחה/i.test(reply) ||
      /מובן|בסדר|בהצלחה/i.test(reply);
    if (!respondedOK) {
      issues.push({ type: 'frustration_ignored', severity: 'warning', detail: lastUserMsg.slice(0, 50) });
    }
  }

  // 5. Message too long for DM
  if (reply.length > 500) {
    issues.push({ type: 'too_long', severity: 'warning', detail: `${reply.length} chars` });
  }

  // 6. CTA pushed in non-sales conversation mode
  if (lead.conversationMode && lead.conversationMode !== 'qualify') {
    const CTA_PHRASES = /בוא לשיחה|נקבע שיחה|בוא נדבר על|לינק לקביעת|calendly|הנה לינק|רוצה לקבוע|נקבע פגישה/i;
    if (CTA_PHRASES.test(reply)) {
      issues.push({ type: 'cta_in_non_sales_mode', severity: 'warning', detail: `mode: ${lead.conversationMode}` });
    }
  }

  // Log issues
  if (issues.length > 0) {
    const criticals = issues.filter(i => i.severity === 'critical');
    const warnings = issues.filter(i => i.severity === 'warning');
    console.log(`[QA][${tenantName}] User ${userId}: ${criticals.length} critical, ${warnings.length} warning`);
    for (const issue of issues) {
      console.log(`  [QA:${issue.severity}] ${issue.type}${issue.detail ? ': ' + issue.detail : ''}`);
    }

    // Persist to database for analytics (non-blocking, fire-and-forget)
    // Use lead.tenantId since checkReplyQuality receives tenantName not tenantId
    const tid = lead?.tenantId;
    if (typeof recordQAIssue === 'function' && tid) {
      const replySnippet = reply.slice(0, 200);
      for (const issue of issues) {
        recordQAIssue(tid, userId, issue.type, issue.severity, issue.detail || null, replySnippet)
          .catch(err => console.warn('[QA] DB persist failed (non-fatal):', err.message));
      }
    }
  }

  return issues;
}

// --- Auto-Correction System ---
// For critical issues, automatically add corrections to the tenant's KB
// so the AI learns from mistakes for future conversations.

const AUTO_CORRECTIONS = {
  action_tag_leak: {
    category: 'corrections',
    title: 'אסור לכלול action= בטקסט ההודעה',
    content: 'חוק ברזל: action="send_link" הולך רק בתוך תגית <!-- LEAD:{...} --> בסוף ההודעה. אף פעם לא בגוף ההודעה שהלקוח רואה! הלקוח ראה את הטקסט הטכני וזה נראה כמו באג.',
  },
  post_cta_restart: {
    category: 'corrections',
    title: 'אסור להתחיל שיחה מחדש אחרי CTA',
    content: 'אם כבר שלחת לינק לשיחה או נפרדת מהלקוח — אל תשאל שוב "מה מביא אותך" או שאלות פתיחה! אם הלקוח חוזר — תשאל "קבעת?" או "מחכה לעדכון" או תענה קצר על מה שאמר.',
  },
  lead_json_leak: {
    category: 'corrections',
    title: 'אסור שהלקוח יראה מידע טכני',
    content: 'LEAD:{...} חייב להיות בתוך <!-- --> (HTML comment). אם הלקוח רואה JSON, score, gathered, או כל מידע טכני — זה כישלון חמור.',
  },
  cta_in_non_sales_mode: {
    category: 'corrections',
    title: 'אסור להציע שיחה/פגישה למי שלא שאל על שירות',
    content: 'כשמישהו מפרגן, שואל שאלה מקצועית, או סתם מדבר — אל תציע שיחה או פגישה! רק כשיש עניין אמיתי בשירות. מעריצים ומגיבים לתוכן לא צריכים CTA.',
  },
};

// In-memory cache to avoid re-querying DB on every issue (DB is source of truth)
const addedCorrections = new Map();

export async function autoCorrect(tenantId, issues) {
  const added = addedCorrections.get(tenantId) || new Set();

  for (const issue of issues) {
    if (issue.severity !== 'critical') continue;
    const correction = AUTO_CORRECTIONS[issue.type];
    if (!correction) continue;
    if (added.has(issue.type)) continue;

    try {
      // Check if this correction already exists in tenant's KB (by exact title match)
      const existing = await getKnowledgeEntriesForTenant(tenantId);
      const alreadyExists = existing.some(e =>
        e.category === 'corrections' && e.title === correction.title
      );

      if (alreadyExists) {
        added.add(issue.type);
        addedCorrections.set(tenantId, added);
        continue;
      }

      await addKnowledgeEntry({
        category: correction.category,
        title: correction.title,
        content: correction.content,
        addedBy: 'QA-auto',
      }, tenantId);

      added.add(issue.type);
      addedCorrections.set(tenantId, added);

      console.log(`[QA:AutoCorrect][${tenantId}] Added correction: "${correction.title}"`);
    } catch (err) {
      console.warn(`[QA:AutoCorrect] Failed for ${tenantId}:`, err.message);
    }
  }
}

// --- Conditional AI QA ("Second Opinion") ---
// Only fires when regex QA found warnings (not critical).
// Uses Haiku for cost efficiency. Guarded by LEARNING_ENABLED env var.

const AI_QA_ENABLED = process.env.LEARNING_ENABLED !== 'false';

export async function runAIQualityCheck(reply, lastUserMessage, lead) {
  if (!AI_QA_ENABLED) return [];

  try {
    // Dynamic import to avoid circular dependency
    const { callHaiku } = await import('./ai.js');
    if (!callHaiku) return [];

    const gender = lead?.gender || 'unknown';
    const prompt = `בדוק את התשובה הבאה של בוט אינסטגרם ודרג 3 מימדים (1-5):

הודעת הלקוח: "${lastUserMessage}"
תשובת הבוט: "${reply}"
מגדר הלקוח: ${gender}

בדוק:
1. relevance: האם הבוט באמת ענה על מה שהלקוח שאל? (1=התעלם לחלוטין, 5=ענה בדיוק)
2. naturalness: האם זה נשמע כמו בן אדם אמיתי בהודעת DM? (1=רובוט, 5=טבעי לגמרי)
3. gender: האם התאמת המגדר נכונה? (1=טעות, 3=ניטרלי, 5=מושלם)

ענה בJSON בלבד: {"relevance":X,"naturalness":X,"gender":X,"issue":"תיאור קצר של הבעיה או null"}`;

    const result = await callHaiku([{ role: 'user', content: prompt }], 150, 'QA-Check');
    if (!result?.content) return [];

    // Parse the response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    const grades = JSON.parse(jsonMatch[0]);
    const issues = [];

    if (grades.relevance && grades.relevance <= 2) {
      issues.push({
        type: 'ai_qa_irrelevant_reply',
        severity: 'warning',
        detail: grades.issue || `relevance=${grades.relevance}`,
      });
    }

    if (grades.naturalness && grades.naturalness <= 2) {
      issues.push({
        type: 'ai_qa_unnatural_hebrew',
        severity: 'warning',
        detail: grades.issue || `naturalness=${grades.naturalness}`,
      });
    }

    if (grades.gender && grades.gender <= 2 && gender !== 'unknown') {
      issues.push({
        type: 'ai_qa_gender_mismatch',
        severity: 'warning',
        detail: `gender check=${grades.gender}, expected=${gender}`,
      });
    }

    if (issues.length > 0) {
      console.log(`[QA:AI] Haiku flagged ${issues.length} issue(s): ${issues.map(i => i.type).join(', ')}`);
    }

    return issues;
  } catch (err) {
    console.warn('[QA:AI] Haiku check failed (non-fatal):', err.message);
    return [];
  }
}

// --- Helper Functions ---

function extractQuestions(text) {
  if (!text) return [];
  const matches = text.match(/[^.!?\n]*\?/g);
  return matches ? matches.map(q => q.trim()).filter(q => q.length > 5) : [];
}

function questionSimilarity(q1, q2) {
  // Word overlap similarity — simple but effective for Hebrew
  const words1 = new Set(q1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(q2.split(/\s+/).filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;

  let overlap = 0;
  for (const w of words1) {
    if (words2.has(w)) overlap++;
  }

  return overlap / Math.min(words1.size, words2.size);
}
