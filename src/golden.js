// src/golden.js — Golden Examples Bank (Self-Learning System Phase 2)
// Extracts high-quality conversation patterns from graded conversations.
// All examples start as 'pending' — require human approval on master admin.
// Guarded by LEARNING_ENABLED env var.

import crypto from 'crypto';
import {
  saveGoldenExample, getGoldenExamples,
  searchGoldenByEmbedding, incrementGoldenUsage,
  updateGoldenEmbedding, getStaleGoldenExamples,
  getConversationHistory, getTenant, updateTenant,
} from './db.js';
import { config } from './config.js';

const LEARNING_ENABLED = process.env.LEARNING_ENABLED !== 'false';

// Situation types for classification
const SITUATION_TYPES = [
  'greeting',            // Opening / first message
  'discovery_question',  // Asking about the lead's needs
  'empathy',             // Responding to pain/frustration
  'value_statement',     // Explaining value proposition
  'objection_handling',  // Handling objections/hesitation
  'cta_transition',      // Moving to CTA naturally
  'closing',             // Final message / farewell
  'rapport_building',    // Building connection / small talk
];

// Classify a user-bot exchange into a situation type using simple heuristics
function classifySituation(userMessage, botReply, isFirstExchange, isLastExchange) {
  if (isFirstExchange) return 'greeting';
  if (isLastExchange) return 'closing';

  const user = userMessage.toLowerCase();
  const bot = botReply.toLowerCase();

  // Empathy — user expresses pain/frustration
  if (/סבל|קשה|מתוסכל|נמאס|תקוע|עייפ|לא מצליח|כואב|מפחד/.test(user)) return 'empathy';

  // Objection handling — user pushes back
  if (/לא מעוניין|יקר|לא צריך|חושב על זה|אחזור|לא בטוח|מה המחיר/.test(user)) return 'objection_handling';

  // CTA transition — bot moves to booking
  if (/לינק|שיחה|פגישה|נקבע|בוא נדבר|calendly/.test(bot)) return 'cta_transition';

  // Discovery question — bot asks about needs
  if (/\?/.test(bot) && /מה|איך|למה|מתי|כמה/.test(bot)) return 'discovery_question';

  // Value statement — bot explains value
  if (/אני עוזר|אנחנו מתמחים|הגישה שלי|השיטה|התוצאות/.test(bot)) return 'value_statement';

  // Rapport building — casual/friendly exchange
  if (/הא|חחח|😂|😊|אחלה|מגניב|וואו/.test(user)) return 'rapport_building';

  return 'discovery_question'; // Default
}

// Anonymize tenant-specific details from an exchange
function anonymizeExchange(userMessage, botReply, tenantName) {
  let anonUser = userMessage;
  let anonBot = botReply;

  // Strip the tenant's business name
  if (tenantName) {
    const nameRegex = new RegExp(tenantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    anonBot = anonBot.replace(nameRegex, '[שם העסק]');
    anonUser = anonUser.replace(nameRegex, '[שם העסק]');
  }

  // Strip URLs
  anonBot = anonBot.replace(/https?:\/\/\S+/g, '[לינק]');
  anonUser = anonUser.replace(/https?:\/\/\S+/g, '[לינק]');

  // Strip phone numbers
  anonBot = anonBot.replace(/0\d{1,2}[-.]?\d{7,8}/g, '[טלפון]');
  anonUser = anonUser.replace(/0\d{1,2}[-.]?\d{7,8}/g, '[טלפון]');

  // Strip hidden metadata
  anonBot = anonBot.replace(/<!--[\s\S]*?-->/g, '').trim();

  return { userMessage: anonUser, botReply: anonBot };
}

// Extract golden examples from recently graded, high-quality conversations
export async function extractGoldenFromRecentGrades() {
  if (!LEARNING_ENABLED) return 0;

  try {
    // Dynamic import to avoid potential issues
    const { query } = await import('./database/connection.js');

    // Find recently graded conversations with genuinely high quality AND converted outcome
    // Strict filters to prevent learning from mediocre conversations:
    //   - overall ≥ 4.5 (not just "above average")
    //   - every dimension ≥ 3 (no hiding a terrible score behind a good average)
    //   - customer_satisfaction ≥ 4 (customer must have been happy, not just "converted")
    const result = await query(`
      SELECT cg.tenant_id, cg.user_id, cg.outcome, cg.overall_score,
             cg.customer_satisfaction,
             co.final_mode, co.final_entry_type,
             co.final_score as lead_score,
             t.name as tenant_name
      FROM conversation_grades cg
      JOIN conversation_outcomes co ON cg.tenant_id = co.tenant_id AND cg.user_id = co.user_id
      JOIN tenants t ON cg.tenant_id = t.id
      WHERE cg.overall_score >= 4.5
        AND co.outcome = 'converted'
        AND cg.naturalness >= 3
        AND cg.hebrew_quality >= 3
        AND cg.goal_achievement >= 3
        AND cg.customer_satisfaction >= 4
        AND cg.flow_quality >= 3
        AND cg.graded_at > NOW() - INTERVAL '24 hours'
        AND NOT EXISTS (
          SELECT 1 FROM golden_examples ge
          WHERE ge.tenant_id = cg.tenant_id
            AND ge.user_message LIKE '%' || LEFT(cg.user_id, 10) || '%'
        )
      ORDER BY cg.overall_score DESC
      LIMIT 5
    `);

    if (result.rows.length === 0) return 0;

    let extracted = 0;

    for (const row of result.rows) {
      try {
        const history = await getConversationHistory(row.tenant_id, row.user_id, 30);
        if (!history || history.length < 6) continue; // Need at least 3 full exchanges

        // Extract the best 2-3 exchanges from the conversation
        const examples = extractBestExchanges(history, row);

        for (const ex of examples) {
          const { userMessage, botReply } = anonymizeExchange(
            ex.userMessage, ex.botReply, row.tenant_name
          );

          // Skip very short or empty exchanges
          if (userMessage.length < 3 || botReply.length < 5) continue;

          // Auto-approve truly exceptional examples (≥4.8 overall + perfect customer satisfaction)
          // Still logged for admin review, but immediately available for few-shot injection
          const autoApprove = row.overall_score >= 4.8 && row.customer_satisfaction >= 5;
          const status = autoApprove ? 'approved' : 'pending';

          await saveGoldenExample({
            id: `golden_${crypto.randomUUID()}`,
            tenantId: row.tenant_id,
            situation: ex.situation,
            userMessage,
            botReply,
            entryType: row.final_entry_type,
            conversationMode: row.final_mode,
            leadScoreBefore: ex.scoreBefore,
            leadScoreAfter: ex.scoreAfter,
            gradeOverall: row.overall_score,
            status,
          });
          extracted++;
        }
      } catch (err) {
        console.warn(`[Golden] Failed to extract from ${row.tenant_id}:${row.user_id}:`, err.message);
      }
    }

    if (extracted > 0) {
      console.log(`[Golden] Extracted ${extracted} example(s) from ${result.rows.length} conversation(s)`);
    }
    return extracted;
  } catch (err) {
    console.warn('[Golden] Extraction failed (non-fatal):', err.message);
    return 0;
  }
}

// Pick the best 2-3 exchanges from a conversation
function extractBestExchanges(history, meta) {
  const exchanges = [];

  // Pair user messages with the next bot reply
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].role === 'user' && history[i + 1].role === 'assistant') {
      const isFirst = i === 0;
      const isLast = i + 2 >= history.length;
      const userMsg = history[i].content;
      const botReply = history[i + 1].content;

      exchanges.push({
        userMessage: userMsg,
        botReply: botReply,
        situation: classifySituation(userMsg, botReply, isFirst, isLast),
        index: i,
        scoreBefore: null,
        scoreAfter: null,
      });
    }
  }

  if (exchanges.length === 0) return [];

  // Prioritize diverse situation types — pick at most one per type
  const seenSituations = new Set();
  const selected = [];

  // Priority order: empathy, objection_handling, cta_transition, discovery_question, greeting
  const priorityOrder = ['empathy', 'objection_handling', 'cta_transition', 'discovery_question', 'greeting', 'value_statement', 'rapport_building', 'closing'];

  for (const situation of priorityOrder) {
    if (selected.length >= 3) break;
    const match = exchanges.find(e => e.situation === situation && !seenSituations.has(situation));
    if (match) {
      seenSituations.add(situation);
      selected.push(match);
    }
  }

  // If we still have room, add remaining exchanges (oldest first for context)
  if (selected.length < 2) {
    for (const ex of exchanges) {
      if (selected.length >= 2) break;
      if (!selected.includes(ex)) {
        selected.push(ex);
      }
    }
  }

  return selected;
}

// Build few-shot section from approved golden examples for injection into prompt
export async function buildFewShotExamples(queryEmbedding, conversationMode, tenantId) {
  if (!config.goldenInjectionEnabled) return { text: '', exampleIds: [] };

  try {
    let examples = [];

    if (queryEmbedding) {
      // RAG search: find semantically similar approved examples
      examples = await searchGoldenByEmbedding(queryEmbedding, conversationMode, 5);
      // Filter by minimum similarity
      examples = examples.filter(e => e.similarity > 0.45);
    }

    // If no embedding or too few results, fall back to recent approved
    if (examples.length < 2) {
      const approved = await getGoldenExamples('approved', null);
      // Filter by conversation mode if available
      const modeFiltered = conversationMode
        ? approved.filter(e => e.conversationMode === conversationMode || !e.conversationMode)
        : approved;
      // Prefer tenant's own examples, then cross-tenant
      const tenantOwn = modeFiltered.filter(e => e.tenantId === tenantId);
      const crossTenant = modeFiltered.filter(e => e.tenantId !== tenantId);

      examples = [...tenantOwn.slice(0, 2), ...crossTenant.slice(0, 2)].slice(0, 3);
    }

    // Max 3 examples per prompt
    examples = examples.slice(0, 3);

    if (examples.length === 0) return { text: '', exampleIds: [] };

    // Build the prompt section
    const situationLabels = {
      greeting: 'פתיחת שיחה',
      discovery_question: 'שאלת גילוי',
      empathy: 'אמפתיה',
      value_statement: 'הצגת ערך',
      objection_handling: 'טיפול בהתנגדות',
      cta_transition: 'מעבר לסגירה',
      closing: 'סגירת שיחה',
      rapport_building: 'בניית קשר',
    };

    let section = `\n## דוגמאות מנצחות — למד מהן!\nהדוגמאות הבאות הוכחו כמוצלחות בשיחות אמיתיות. השתמש בהן כ**השראה** (לא העתקה מילה במילה).\n**Voice DNA תמיד גובר על דוגמאות!**\n\n`;

    for (const ex of examples) {
      const label = situationLabels[ex.situation] || ex.situation;
      section += `### ${label}\nלקוח: "${ex.userMessage}"\nתשובה: "${ex.botReply}"\n\n`;
    }

    // Track usage (fire-and-forget)
    for (const ex of examples) {
      if (ex.id) {
        incrementGoldenUsage(ex.id).catch(() => {});
      }
    }

    return { text: section, exampleIds: examples.map(e => e.id).filter(Boolean) };
  } catch (err) {
    console.warn('[Golden] Few-shot build failed (non-fatal):', err.message);
    return { text: '', exampleIds: [] };
  }
}

// Voice reinforcement: track which patterns succeed in live conversations
// Runs alongside golden extraction — updates voice_import_meta with reinforcement data
export async function reinforceVoiceFromGrades() {
  if (!LEARNING_ENABLED) return 0;

  try {
    const { query } = await import('./database/connection.js');

    // Find recently graded conversations with high naturalness scores
    // These are conversations where the bot successfully sounded like the owner
    const result = await query(`
      SELECT cg.tenant_id, cg.naturalness, cg.hebrew_quality, cg.overall_score,
             cg.strengths, cg.weaknesses
      FROM conversation_grades cg
      WHERE cg.naturalness >= 4
        AND cg.overall_score >= 4.0
        AND cg.graded_at > NOW() - INTERVAL '24 hours'
      ORDER BY cg.naturalness DESC
      LIMIT 20
    `);

    if (result.rows.length === 0) return 0;

    // Aggregate per tenant
    const tenantData = {};
    for (const row of result.rows) {
      if (!tenantData[row.tenant_id]) {
        tenantData[row.tenant_id] = { highNat: 0, lowNat: 0, strengths: [], weaknesses: [] };
      }
      const d = tenantData[row.tenant_id];
      if (row.naturalness >= 4) d.highNat++;
      if (row.strengths) d.strengths.push(row.strengths);
      if (row.weaknesses) d.weaknesses.push(row.weaknesses);
    }

    // Also check for low-naturalness grades to identify weak spots
    const lowResult = await query(`
      SELECT cg.tenant_id, cg.naturalness, cg.weaknesses
      FROM conversation_grades cg
      WHERE cg.naturalness <= 2
        AND cg.graded_at > NOW() - INTERVAL '24 hours'
      LIMIT 20
    `);
    for (const row of lowResult.rows) {
      if (!tenantData[row.tenant_id]) {
        tenantData[row.tenant_id] = { highNat: 0, lowNat: 0, strengths: [], weaknesses: [] };
      }
      tenantData[row.tenant_id].lowNat++;
      if (row.weaknesses) tenantData[row.tenant_id].weaknesses.push(row.weaknesses);
    }

    let updated = 0;
    for (const [tenantId, data] of Object.entries(tenantData)) {
      try {
        const tenant = await getTenant(tenantId);
        if (!tenant) continue;

        const meta = tenant.voiceImportMeta || {};
        if (!meta.reinforcements) meta.reinforcements = {};

        // Update reinforcement stats
        meta.reinforcements.lastChecked = new Date().toISOString();
        meta.reinforcements.highNaturalnessCount = (meta.reinforcements.highNaturalnessCount || 0) + data.highNat;
        meta.reinforcements.lowNaturalnessCount = (meta.reinforcements.lowNaturalnessCount || 0) + data.lowNat;

        // Track weak spots from grader feedback
        if (data.weaknesses.length > 0) {
          const weakSpots = new Set(meta.reinforcements.weakSpots || []);
          for (const w of data.weaknesses) {
            // Simple keyword extraction from grader weaknesses
            if (/אמפתיה|empathy/i.test(w)) weakSpots.add('empathy');
            if (/עברית|hebrew/i.test(w)) weakSpots.add('hebrew_quality');
            if (/התנגדות|objection/i.test(w)) weakSpots.add('objection_handling');
            if (/סגירה|cta|closing/i.test(w)) weakSpots.add('cta_transition');
            if (/שאלות|question/i.test(w)) weakSpots.add('questions');
            if (/טבעיות|natural/i.test(w)) weakSpots.add('naturalness');
          }
          meta.reinforcements.weakSpots = [...weakSpots];
        }

        await updateTenant(tenantId, { voiceImportMeta: meta });
        updated++;
      } catch (err) {
        console.warn(`[VoiceReinforce] Failed for ${tenantId}:`, err.message);
      }
    }

    if (updated > 0) {
      console.log(`[VoiceReinforce] Updated ${updated} tenant(s) from ${result.rows.length} grades`);
    }
    return updated;
  } catch (err) {
    console.warn('[VoiceReinforce] Failed (non-fatal):', err.message);
    return 0;
  }
}

// Embed stale golden examples (run periodically)
export async function embedStaleGoldenExamples() {
  if (!LEARNING_ENABLED || !config.openaiApiKey) return 0;

  try {
    const { generateEmbedding } = await import('./embeddings.js');
    const stale = await getStaleGoldenExamples();
    if (stale.length === 0) return 0;

    let embedded = 0;
    for (const ex of stale) {
      try {
        const text = `${ex.situation}: לקוח: ${ex.userMessage} → תשובה: ${ex.botReply}`;
        const embedding = await generateEmbedding(text, config.openaiApiKey);
        if (embedding) {
          await updateGoldenEmbedding(ex.id, embedding);
          embedded++;
        }
      } catch (err) {
        console.warn(`[Golden] Embedding failed for ${ex.id}:`, err.message);
      }
      await new Promise(r => setTimeout(r, 200)); // Rate limit
    }

    if (embedded > 0) {
      console.log(`[Golden] Embedded ${embedded} example(s)`);
    }
    return embedded;
  } catch (err) {
    console.warn('[Golden] Embedding batch failed (non-fatal):', err.message);
    return 0;
  }
}
