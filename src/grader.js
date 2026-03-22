// src/grader.js — AI Conversation Grader (Self-Learning System Phase 2)
// Batch-grades closed conversations using Haiku on 5 dimensions.
// Feeds the golden examples pipeline. Guarded by GRADING_ENABLED env var.

import { getUngradedOutcomes, saveGrade, getConversationHistory } from './db.js';

const GRADING_ENABLED = process.env.GRADING_ENABLED !== 'false' &&
                         process.env.LEARNING_ENABLED !== 'false';

const GRADING_PROMPT = `אתה מעריך איכות שיחות של בוט אינסטגרם בעברית. קראת שיחה שלמה בין בוט לבין לקוח פוטנציאלי.

דרג כל מימד מ-1 עד 5:

1. **naturalness** — האם הבוט נשמע כמו בן אדם אמיתי ב-DM? (1=רובוט ברור, 5=לא ניתן להבחין מאדם)
2. **hebrew_quality** — עברית טבעית ודיבורית? (1=פורמלי/שגויות, 5=מושלם, סלנג נכון)
3. **goal_achievement** — האם הבוט השיג את המטרה? (1=התעלם מהמטרה, 5=השיג בצורה מושלמת)
4. **customer_satisfaction** — סימנים חיוביים מהלקוח? (1=תסכול ברור, 5=לקוח מרוצה)
5. **flow_quality** — זרימת שיחה חלקה? (1=קפיצות, חזרות, 5=טבעי ומתקדם)

ענה בJSON בלבד:
{"naturalness":X,"hebrew_quality":X,"goal_achievement":X,"customer_satisfaction":X,"flow_quality":X,"strengths":"נקודות חזקות בקצרה","weaknesses":"נקודות חלשות בקצרה"}`;

// Grade a single conversation
async function gradeConversation(tenantId, userId, outcome) {
  const history = await getConversationHistory(tenantId, userId, 50);
  if (!history || history.length < 3) return null;

  // Format conversation for the grader
  const convoText = history.map(m => {
    const role = m.role === 'user' ? 'לקוח' : 'בוט';
    // Strip hidden metadata from bot replies
    const content = (m.content || '').replace(/<!--[\s\S]*?-->/g, '').trim();
    return `${role}: ${content}`;
  }).join('\n');

  const prompt = `${GRADING_PROMPT}

## תוצאת השיחה: ${outcome}

## השיחה:
${convoText}`;

  try {
    // Dynamic import to avoid circular dependency
    const { callHaiku } = await import('./ai.js');
    if (!callHaiku) return null;

    const result = await callHaiku(
      [{ role: 'user', content: prompt }],
      300,
      'ConversationGrader'
    );
    if (!result?.content) return null;

    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const grades = JSON.parse(jsonMatch[0]);

    // Validate all dimensions are 1-5
    const dims = ['naturalness', 'hebrew_quality', 'goal_achievement', 'customer_satisfaction', 'flow_quality'];
    for (const d of dims) {
      if (typeof grades[d] !== 'number' || grades[d] < 1 || grades[d] > 5) {
        console.warn(`[Grader] Invalid ${d}: ${grades[d]}`);
        return null;
      }
    }

    // Calculate overall score (average of 5 dimensions)
    const overall = dims.reduce((sum, d) => sum + grades[d], 0) / dims.length;

    return {
      outcome,
      naturalness: grades.naturalness,
      hebrewQuality: grades.hebrew_quality,
      goalAchievement: grades.goal_achievement,
      customerSatisfaction: grades.customer_satisfaction,
      flowQuality: grades.flow_quality,
      overallScore: parseFloat(overall.toFixed(2)),
      strengths: grades.strengths || null,
      weaknesses: grades.weaknesses || null,
    };
  } catch (err) {
    console.warn(`[Grader] Failed for ${tenantId}:${userId}:`, err.message);
    return null;
  }
}

// Batch grade ungraded conversations
export async function runBatchGrading() {
  if (!GRADING_ENABLED) return { graded: 0 };

  try {
    const ungraded = await getUngradedOutcomes(10); // Process 10 at a time
    if (ungraded.length === 0) return { graded: 0 };

    console.log(`[Grader] Found ${ungraded.length} ungraded conversation(s)`);
    let graded = 0;

    for (const row of ungraded) {
      const grade = await gradeConversation(row.tenant_id, row.user_id, row.outcome);
      if (grade) {
        await saveGrade(row.tenant_id, row.user_id, grade);
        graded++;
        console.log(`[Grader] Graded ${row.tenant_id}:${row.user_id} → ${grade.overallScore}/5`);
      }
      // Small delay between API calls to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }

    if (graded > 0) {
      console.log(`[Grader] Batch complete: ${graded}/${ungraded.length} graded`);
    }
    return { graded };
  } catch (err) {
    console.warn('[Grader] Batch grading failed (non-fatal):', err.message);
    return { graded: 0 };
  }
}

// After grading, extract golden examples from high-quality conversations
export async function gradeAndExtract() {
  if (!GRADING_ENABLED) return { graded: 0, extracted: 0 };

  const { graded } = await runBatchGrading();

  // Only extract if we actually graded something
  if (graded === 0) return { graded: 0, extracted: 0 };

  try {
    const { extractGoldenFromRecentGrades } = await import('./golden.js');
    const extracted = await extractGoldenFromRecentGrades();
    return { graded, extracted };
  } catch (err) {
    console.warn('[Grader] Golden extraction failed (non-fatal):', err.message);
    return { graded, extracted: 0 };
  }
}
