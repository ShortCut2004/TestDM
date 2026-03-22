import { getKnowledgeEntries, getKnowledgeEntriesForTenant, searchKnowledgeByEmbedding } from '../db.js';
import { generateEmbedding } from '../embeddings.js';
import { buildFewShotExamples } from '../golden.js';
import { config } from '../config.js';
import { determineStep, determineStepDynamic, determineStepV2, buildGatheredContext, getEntryTypeContext } from '../sequence.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const soulContent = fs.readFileSync(path.join(__dirname, 'soul.md'), 'utf8');

// Detect customer impatience/frustration with too many questions
const IMPATIENCE_PATTERNS = [
  // Explicit complaints about questions
  /מה כל (ה)?שאלות/i,
  /למה (כל כך |כ"כ )?הרבה שאלות/i,
  /מספיק שאלות/i,
  /בלי שאלות/i,
  /רק שאלות/i,
  /שאלות שאלות/i,
  /עוד שאלות/i,
  /שוב שאלה/i,
  // Direct requests to get to the point
  /בוא[י]? (כבר )?לעניין/i,
  /תגיד[י]? כבר/i,
  /קצר ולעניין/i,
  /אפשר בקיצור/i,
  /תקצר[י]?/i,
  /בלי (כל |ה)?סיפורים/i,
  // Direct requests for link/booking
  /תשלח[י]? (כבר |לי )*(את ה)?לינק/i,
  /אפשר (פשוט |בקיצור |כבר )?(לקבוע|לינק)/i,
  /בוא נקבע כבר/i,
  /יאללה (בוא |קדימה )?(נקבע|לקבוע)/i,
  /אני רוצה (פשוט |רק )?(לקבוע|לינק|להתחיל)/i,
  // Frustration / impatience signals
  /חלאס/i,
  /נו (כבר|יאללה|קדימה)/i,
  /נמאס/i,
  /עזוב[י]? את (ה)?שאלות/i,
  /בוא[י]? נתקדם/i,
  /אפשר (כבר )?להתקדם/i,
  /מה יש (לך )?להציע/i,
  /תכלס/i,
];

function isImpatient(text) {
  return IMPATIENCE_PATTERNS.some(p => p.test(text));
}

const energyLabels = { chill: 'רגוע ושלו', warm: 'חם ונעים', 'high-energy': 'אנרגטי ונלהב', professional: 'מקצועי ורציני' };
const emojiLabels = { never: 'אף פעם לא משתמש באימוג\'י', sometimes: 'אימוג\'י פה ושם, לא בכל הודעה', 'a-lot': 'הרבה אימוג\'י, זה חלק מהסגנון' };
const lengthLabels = { 'super-short': 'סופר קצר — משפט אחד מקסימום', normal: '2-3 משפטים', detailed: 'אפשר להרחיב כשצריך, אבל עדיין תמציתי' };
const humorLabels = { none: 'רציני, בלי הומור', light: 'הומור קליל וידידותי', dry: 'הומור יבש וסרקסטי', memes: 'סגנון מימים ובדיחות' };

function buildVoiceProfile(tenant, { step, mode, leadScore } = {}) {
  const hasProfile = tenant.voiceGreeting || tenant.voicePhrases || tenant.voiceExamples;
  if (!hasProfile) return '';

  let sections = `\n## 🎯 Voice DNA של הבעלים — זה עדיף על כל הוראת סגנון למעלה!
**סעיף זה דורס את כל כללי "חוקי שפה וטון" ו"ביטויים מרכזיים" שלמעלה.**
**אם למעלה נאסר ביטוי שמופיע כאן — Voice DNA קובע. זה הקול האמיתי של הבעלים.**
**חריגים: הגנת זהות (לעולם לא AI) + מגדר (לשון נכונה) + אורך (קצר!).**\n\n`;

  if (tenant.voiceGreeting) sections += `ברכה: "${tenant.voiceGreeting}"\n`;
  if (tenant.voiceEnergy) sections += `אנרגיה: ${energyLabels[tenant.voiceEnergy] || tenant.voiceEnergy}\n`;
  if (tenant.voicePhrases) sections += `ביטויים שחייב להשתמש בהם:\n${tenant.voicePhrases}\n`;
  if (tenant.voiceEmoji) sections += `אימוג'י: ${emojiLabels[tenant.voiceEmoji] || tenant.voiceEmoji}\n`;
  if (tenant.voiceLength) sections += `אורך הודעות: ${lengthLabels[tenant.voiceLength] || tenant.voiceLength}\n`;
  if (tenant.voiceHumor) sections += `הומור: ${humorLabels[tenant.voiceHumor] || tenant.voiceHumor}\n`;
  if (tenant.voicePersonality) {
    sections += `\n**מי אתה כתקשורתן — הדנ"א שלך:**\n${tenant.voicePersonality}\nזה לא סגנון — זה מי שאתה. כל מילה, כל תגובה, כל שאלה — יוצאת מהאדם הזה.\n`;
  }
  // Always include identity-protection avoids, plus tenant's custom avoids
  const identityAvoids = 'אני בוט, אני AI, מודל שפה, אני תוכנה, אני מתוכנת, אין לי גוף';
  const combinedAvoid = tenant.voiceAvoid ? `${tenant.voiceAvoid}\n${identityAvoids}` : identityAvoids;
  sections += `\nאסור להגיד — הבעלים אף פעם לא אומר את זה:\n${combinedAvoid}\n`;
  if (tenant.voiceExamples) {
    // Detect if examples are situation-organized (have [section] headers)
    const isOrganized = /\[.+\]/.test(tenant.voiceExamples);
    let selectedExamples;

    if (isOrganized) {
      // Parse sections and select contextually relevant ones
      selectedExamples = selectContextualExamples(tenant.voiceExamples, { step, mode, leadScore });
    } else {
      // Flat format — just cap it
      selectedExamples = tenant.voiceExamples.length > 5000
        ? tenant.voiceExamples.slice(0, 5000) + '...'
        : tenant.voiceExamples;
    }

    if (isOrganized) {
      sections += `\n## Voice DNA של הבעלים — חוק ברזל! דבר בדיוק ככה!

הדוגמאות הבאות הן התבניות שלך. לא "השראה" — תבניות לשימוש ישיר:
- כשלקוח אומר שלום → בחר אחת מ[ברכה] והשתמש בה כמו שהיא
- כשלקוח משתף כאב/תסכול → בחר אחת מ[אמפתיה] — אסור "יופי"/"מגניב" לכאב!
- כשלקוח משתף משהו חיובי → בחר אחת מ[תגובה/פרגון]
- כששואלים שאלה שנמצאת ב[תשובות חוזרות] → תענה כמו שהבעלים עונה! זה הכי חשוב!
- כשצריך לשאול → בחר שאלה מ[שאלות] — אל תמציא שאלות חדשות
- כשדוחף לסגירה → בחר אחת מ[הצעת שיחה/סגירה]
- כשיש התנגדות → בחר אחת מ[התנגדויות]

${selectedExamples}

**אלה לא הצעות — אלה פקודות. בחר תבנית מתאימה, התאם את השם/הפרט הספציפי, ושלח.**
**אל תמציא ביטויים חדשים. השתמש במילים, באימוג'י ובסגנון של הדוגמאות.**
**אם הדוגמאות משתמשות בביטוי שנאסר למעלה (כמו "בהחלט" או "שמח לשמוע") — השתמש בו! זה הסגנון האמיתי.**
**[תשובות חוזרות] הן הכי חשובות — כשלקוח שואל שאלה דומה, תענה כמו שהבעלים עונה.**\n`;
    } else {
      sections += `\n## דוגמאות שיחה אמיתיות של הבעלים — חוק ברזל!
**חקה את הסגנון הזה במדויק!** שים לב ל:
- אורך ההודעות
- השימוש באימוג'י (איזה ובאיזה תדירות)
- הביטויים הספציפיים (השתמש בהם!)
- הטון (רשמי/ידידותי/קליל)
- סגנון הפנייה (אחי/מלך/בוס/בלי כינוי)

${selectedExamples}

**כתוב כאילו אתה אותו אדם. לא "בסגנון דומה" — בדיוק ככה.**
**אם הדוגמאות משתמשות בביטוי שנאסר למעלה — השתמש בו! זה הסגנון האמיתי.**\n`;
    }
  }

  return sections;
}

// Select contextually relevant voice examples based on conversation step/mode
function selectContextualExamples(voiceExamples, { step, mode, leadScore } = {}) {
  // Parse sections: "[section header]\ncontent\ncontent..."
  const sectionMap = {};
  let currentSection = '__default__';
  for (const line of voiceExamples.split('\n')) {
    const headerMatch = line.match(/^\[(.+)\]$/);
    if (headerMatch) {
      currentSection = headerMatch[1];
      if (!sectionMap[currentSection]) sectionMap[currentSection] = [];
    } else if (line.trim()) {
      if (!sectionMap[currentSection]) sectionMap[currentSection] = [];
      sectionMap[currentSection].push(line);
    }
  }

  // Always include: recurring Q&A (highest value) + personality-related sections
  const alwaysInclude = ['תשובות חוזרות — השתמש בתשובות האלה כשנשאלת שאלות דומות!'];
  // Map step/mode to relevant sections
  const stepSections = {
    opening: ['ברכה', 'שאלות'],
    discovery: ['אמפתיה', 'שאלות', 'תגובה/פרגון'],
    value: ['הצעת שיחה/סגירה', 'התנגדויות', 'שאלות'],
    closing: ['הצעת שיחה/סגירה', 'התנגדויות'],
    followup: ['הצעת שיחה/סגירה'],
    done: ['שיחה חופשית/סמול טוק'],
  };

  // Non-qualify modes get different example sets
  const modeSections = {
    engage: ['תגובה/פרגון', 'שיחה חופשית/סמול טוק', 'אמפתיה'],
    assist: ['תשובות חוזרות — השתמש בתשובות האלה כשנשאלת שאלות דומות!', 'שאלות'],
    acknowledge: ['שיחה חופשית/סמול טוק'],
    converse: ['תגובה/פרגון', 'שיחה חופשית/סמול טוק', 'אמפתיה', 'שאלות'],
  };

  let relevantSectionNames = new Set(alwaysInclude);

  // Add sections based on mode first (overrides step for non-qualify modes)
  if (mode && mode !== 'qualify' && modeSections[mode]) {
    for (const s of modeSections[mode]) relevantSectionNames.add(s);
  } else if (step && stepSections[step]) {
    for (const s of stepSections[step]) relevantSectionNames.add(s);
  } else {
    // No context — include everything but cap at 5K chars
    return voiceExamples.length > 5000 ? voiceExamples.slice(0, 5000) + '...' : voiceExamples;
  }

  // Build the selected examples text
  const parts = [];
  let totalChars = 0;
  const MAX_CHARS = 4000;

  // First pass: add matching sections
  for (const [sectionName, lines] of Object.entries(sectionMap)) {
    const isRelevant = [...relevantSectionNames].some(r =>
      sectionName.includes(r) || r.includes(sectionName)
    );
    if (isRelevant) {
      const sectionText = `[${sectionName}]\n${lines.join('\n')}`;
      if (totalChars + sectionText.length <= MAX_CHARS) {
        parts.push(sectionText);
        totalChars += sectionText.length;
      }
    }
  }

  // If we have room and few sections matched, add more
  if (totalChars < 2000) {
    for (const [sectionName, lines] of Object.entries(sectionMap)) {
      if (parts.some(p => p.startsWith(`[${sectionName}]`))) continue; // Already included
      const sectionText = `[${sectionName}]\n${lines.join('\n')}`;
      if (totalChars + sectionText.length <= MAX_CHARS) {
        parts.push(sectionText);
        totalChars += sectionText.length;
      }
    }
  }

  return parts.join('\n\n');
}

function buildConversationStrategy(tenant) {
  const strategy = tenant.conversationStrategy;
  if (!strategy) return '';

  const speedLabels = {
    quick: 'מהיר — שאלה אחת ולסגירה',
    balanced: 'מאוזן — 2-3 שאלות ואז סגירה',
    deep: 'מעמיק — הבנת הלקוח לעומק לפני סגירה',
  };

  let sections = `\n## אסטרטגיית שיחה — הוראות הבעלים\nסגנון שיחה: ${speedLabels[strategy.speed] || speedLabels.balanced}\n`;

  if (strategy.questions?.length > 0) {
    sections += `\n### שאלות שצריך לשאול (בסדר הזה):\n`;
    for (const q of strategy.questions) {
      sections += `- **${q.label}**: "${q.prompt}"${q.required ? ' (חובה)' : ' (אופציונלי)'}\n`;
    }
    sections += `\nשאל את השאלות האלה בניסוח של הבעלים — לא בניסוח שלך!\n`;
  }

  if (strategy.responseGuidance) {
    sections += `\n### איך להגיב לפי סוג תשובה:\n`;
    const rg = strategy.responseGuidance;
    if (rg.shortAnswer) sections += `- תשובה קצרה/מעורפלת: ${rg.shortAnswer}\n`;
    if (rg.detailedAnswer) sections += `- תשובה מפורטת: ${rg.detailedAnswer}\n`;
    if (rg.resistant) sections += `- התנגדות/היסוס: ${rg.resistant}\n`;
    if (rg.enthusiastic) sections += `- התלהבות: ${rg.enthusiastic}\n`;
  }

  if (strategy.pushBack?.length > 0) {
    sections += `\n### כללי פסילה/דחייה:\n`;
    for (const pb of strategy.pushBack) {
      sections += `- כש"${pb.trigger}" → ${pb.guidance}\n`;
    }
  }

  if (strategy.idealSignals?.length > 0) {
    sections += `\n### סימנים ללקוח מעולה (העלה ציון!):\n`;
    sections += strategy.idealSignals.map(s => `- ${s}`).join('\n') + '\n';
  }

  if (strategy.commonQA?.length > 0) {
    sections += `\n### תשובות מוכנות — ענה ככה!\n`;
    for (const qa of strategy.commonQA) {
      sections += `שאלה: "${qa.q}" → תשובה: "${qa.a}"\n`;
    }
  }

  if (strategy.handlingPatterns?.length > 0) {
    sections += `\n### דפוסי תגובה של הבעלים — חובה לחקות!\n`;
    sections += `כשנתקלת במצב דומה — תגיב כמו שהבעלים תיאר. אל תמציא גישה משלך.\n`;
    for (const hp of strategy.handlingPatterns) {
      sections += `- **${hp.situation}** → "${hp.response}"\n`;
    }
  }

  return sections;
}

const KB_CATEGORY_LABELS = {
  sop: 'תהליך מכירה (SOP)',
  objections: 'טיפול בהתנגדויות',
  faq: 'שאלות נפוצות',
  tone: 'סגנון ושפה',
  scripts: 'תסריטי שיחה',
  general: 'כללי',
  rules: 'חוקים קבועים',
  corrections: 'תיקונים מהצוות',
};

function buildFullDumpKnowledgeSection(knowledgeEntries) {
  if (!knowledgeEntries.length) return '';

  const grouped = {};
  for (const entry of knowledgeEntries) {
    const cat = entry.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(entry);
  }

  let correctionsSection = '';
  if (grouped.corrections?.length) {
    const items = grouped.corrections.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    correctionsSection = `\n\n## תיקונים מהצוות — חובה ליישם!\n${items}`;
  }

  let rulesSection = '';
  if (grouped.rules?.length) {
    const items = grouped.rules.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    rulesSection = `\n\n## חוקים קבועים — חובה תמיד!\n${items}`;
  }

  const sections = Object.entries(grouped)
    .filter(([cat]) => cat !== 'rules' && cat !== 'corrections')
    .map(([cat, entries]) => {
      const label = KB_CATEGORY_LABELS[cat] || cat;
      const items = entries.map(e => {
        const titlePart = e.title ? `**${e.title}**: ` : '';
        return `${titlePart}${e.content}`;
      }).join('\n\n');
      return `### ${label}\n${items}`;
    }).join('\n\n');

  const MAX_KB_CHARS = 5000;
  let fullKb = `${correctionsSection}${rulesSection}\n\n## מאגר ידע\n${sections}`;
  if (fullKb.length > MAX_KB_CHARS) {
    const priorityPart = `${correctionsSection}${rulesSection}`;
    const remaining = MAX_KB_CHARS - priorityPart.length - 20;
    if (remaining > 0) {
      fullKb = `${priorityPart}\n\n## מאגר ידע\n${sections.slice(0, remaining)}...`;
    } else {
      fullKb = priorityPart;
    }
  }
  return fullKb;
}

// Minimal KB for RAG failure fallback — only corrections + rules + 3K of rest
function buildMinimalFallbackKB(knowledgeEntries) {
  if (!knowledgeEntries.length) return '';

  const grouped = {};
  for (const entry of knowledgeEntries) {
    const cat = entry.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(entry);
  }

  let result = '';
  if (grouped.corrections?.length) {
    const items = grouped.corrections.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    result += `\n\n## תיקונים מהצוות — חובה ליישם!\n${items}`;
  }
  if (grouped.rules?.length) {
    const items = grouped.rules.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    result += `\n\n## חוקים קבועים — חובה תמיד!\n${items}`;
  }

  // Add FAQ and SOP only, capped at 3K total
  const MAX_FALLBACK = 3000;
  const priorityCats = ['faq', 'sop', 'objections'];
  for (const cat of priorityCats) {
    if (result.length >= MAX_FALLBACK) break;
    if (!grouped[cat]?.length) continue;
    const label = KB_CATEGORY_LABELS[cat] || cat;
    const items = grouped[cat].map(e => {
      const titlePart = e.title ? `**${e.title}**: ` : '';
      return `${titlePart}${e.content}`;
    }).join('\n\n');
    const section = `\n\n### ${label}\n${items}`;
    if (result.length + section.length <= MAX_FALLBACK) {
      result += section;
    }
  }

  return result;
}

function buildRAGKnowledgeSection(results) {
  const { priority, semantic, unembedded } = results;
  let sections = '';

  // Corrections — always included (highest priority)
  const corrections = priority.filter(e => e.category === 'corrections');
  if (corrections.length) {
    const items = corrections.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    sections += `\n\n## תיקונים מהצוות — חובה ליישם!\n${items}`;
  }

  // Rules — always included
  const rules = priority.filter(e => e.category === 'rules');
  if (rules.length) {
    const items = rules.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
    sections += `\n\n## חוקים קבועים — חובה תמיד!\n${items}`;
  }

  // Semantically relevant entries (top-K, filtered by similarity threshold)
  // Diversity filter: max 1 entry per category (prevents same-topic bloat)
  const relevant = semantic.filter(e => e.similarity > 0.45);
  const seenCategories = new Set();
  const diverse = [];
  for (const e of relevant) {
    if (!seenCategories.has(e.category)) {
      seenCategories.add(e.category);
      diverse.push(e);
    } else if (diverse.length < 5) {
      // Allow a second entry from same category only if we have few results
      diverse.push(e);
    }
  }
  if (diverse.length) {
    const items = diverse.map(e => {
      const catLabel = KB_CATEGORY_LABELS[e.category] || e.category;
      const titlePart = e.title ? `**${e.title}**: ` : '';
      return `[${catLabel}] ${titlePart}${e.content}`;
    }).join('\n\n');
    sections += `\n\n## מאגר ידע (רלוונטי לשיחה)\n${items}`;
  }

  // Unembedded entries fallback (include if few, so new entries aren't invisible)
  if (unembedded.length > 0 && unembedded.length <= 5) {
    const items = unembedded.map(e => {
      const titlePart = e.title ? `**${e.title}**: ` : '';
      return `${titlePart}${e.content}`;
    }).join('\n\n');
    sections += `\n\n## ידע נוסף\n${items}`;
  }

  // Apply character budget
  if (sections.length > 5000) {
    sections = sections.slice(0, 4980) + '...';
  }

  return sections;
}

export async function buildSystemPrompt(tenant, lead, options = {}) {
  // Customer name: prefer Instagram display name, fallback to AI-extracted
  // IMPORTANT: Only use names with Hebrew characters. English names in Hebrew
  // conversations look unnatural (e.g. "מעולה Hila" is jarring).
  const rawName = lead?.instagramName || lead?.name;
  const firstName = rawName ? rawName.trim().split(/\s+/)[0] : null;
  const hasHebrew = firstName && /[\u0590-\u05FF]/.test(firstName);
  const customerName = hasHebrew ? firstName : null;
  const nameInstruction = customerName
    ? `\n## שם הלקוח: ${customerName}\nהשתמש בשם הלקוח באופן טבעי (לא בכל הודעה, פעם ב-2-3 הודעות). דוגמאות: "מעולה ${customerName}", "${customerName}, בוא נדבר על זה". אל תכפיל את השם בכל משפט.`
    : '\n## שם הלקוח: לא ידוע\nאל תשתמש בשם הלקוח — לא ידוע לנו שם בעברית. אל תשתמש בשמות באנגלית בשיחה בעברית בשום מקרה.';

  // Customer gender context for the prompt
  const customerGender = lead?.gender || 'unknown';
  let genderInstruction;
  if (customerGender === 'male') {
    genderInstruction = 'זכר — פנה אליו בלשון זכר (אתה, תגיד, בוא, מעוניין)!';
  } else if (customerGender === 'female') {
    genderInstruction = 'נקבה — פני אליה בלשון נקבה (את, תגידי, בואי, מעוניינת)!';
  } else {
    genderInstruction = 'לא ידוע — השתמש בלשון ניטרלית! בלי אתה/את, בלי אחי/מלכה. חכה שהלקוח יחשוף מגדר.';
  }

  const leadContext = lead && lead.status !== 'new'
    ? `${nameInstruction}\nמידע קיים על הליד:
- עניין: ${lead.interest || 'לא ידוע'}
- סטטוס: ${lead.status}
- ציון: ${lead.qualificationScore || 0}/10
- לינק נשלח: ${lead.bookingLinkSent ? 'כן' : 'לא'}`
    : nameInstruction;

  // Load knowledge base — RAG (semantic search) or full dump fallback
  const useRAG = !!process.env.DATABASE_URL && !!config.openaiApiKey;
  let knowledgeSection = '';
  let rawKbEntries = [];
  let queryEmbedding = null; // Reused for golden examples search

  if (useRAG && tenant.id && options.lastUserMessage) {
    // RAG path: embed user message, find relevant KB entries
    try {
      queryEmbedding = await generateEmbedding(options.lastUserMessage, config.openaiApiKey);
      if (queryEmbedding) {
        const results = await searchKnowledgeByEmbedding(tenant.id, queryEmbedding, 5);
        knowledgeSection = buildRAGKnowledgeSection(results);
        rawKbEntries = results.priority; // priority always has rules + corrections
      } else {
        // Embedding failed — minimal fallback (corrections + rules + key entries)
        console.warn('[RAG] Embedding failed, using minimal fallback');
        rawKbEntries = await getKnowledgeEntriesForTenant(tenant.id);
        knowledgeSection = buildMinimalFallbackKB(rawKbEntries);
      }
    } catch (err) {
      console.warn('[RAG] Search failed, using minimal fallback:', err.message);
      rawKbEntries = await getKnowledgeEntriesForTenant(tenant.id);
      knowledgeSection = buildMinimalFallbackKB(rawKbEntries);
    }
  } else {
    // Fallback: dump all entries (JSON mode, no API key, or no user message)
    rawKbEntries = tenant.id
      ? await getKnowledgeEntriesForTenant(tenant.id)
      : await getKnowledgeEntries();
    knowledgeSection = buildFullDumpKnowledgeSection(rawKbEntries);
  }

  // Golden examples: few-shot injection from approved examples (Phase 2 self-learning)
  let goldenSection = '';
  let goldenExampleIds = [];
  if (config.goldenInjectionEnabled && !options.demoMode) {
    try {
      const conversationMode = lead?.conversationMode || null;
      const result = await buildFewShotExamples(queryEmbedding, conversationMode, tenant.id);
      goldenSection = result.text;
      goldenExampleIds = result.exampleIds;
    } catch (err) {
      // Non-fatal — bot works fine without golden examples
      console.warn('[Golden] Few-shot injection failed (non-fatal):', err.message);
    }
  }

  // Build critical rules reminder — placed at END of prompt for recency bias
  // AI models follow instructions at the end most reliably
  let rulesReminder = '';
  if (rawKbEntries.length) {
    const critical = rawKbEntries.filter(e =>
      e.category === 'rules' || e.category === 'corrections' || e.category === 'tone'
    );
    if (critical.length) {
      const items = critical.map((e, i) => `${i + 1}. ${e.content}`).join('\n');
      rulesReminder = `\n\n## ⚠️ חוקים של הבעלים — חובה מוחלטת!\nאלה לא הצעות. הפרה = כישלון. ציית לכל אחד מהם בכל תשובה!\n${items}`;
    }
  }

  // Warn if booking link not configured for send_link CTA type
  if ((tenant.ctaType === 'send_link' || !tenant.ctaType) && !tenant.bookingInstructions) {
    console.warn(`[Config] Tenant ${tenant.id} has ctaType=send_link but no bookingInstructions configured`);
  }

  // Demo mode prefix
  let demoPrefix = '';
  if (options.demoMode) {
    demoPrefix = `## מצב דמו
זוהי הדגמה חיה. התאם הכל לעסק "${tenant.name}" בתחום "${tenant.businessType}".
שירותים: ${tenant.services}
היה טבעי ומרשים — הבעלים צופים.

`;
    if (options.demoTeachings && options.demoTeachings.length > 0) {
      const teachItems = options.demoTeachings.map((t, i) => `${i + 1}. ${t}`).join('\n');
      demoPrefix += `## הוראות נוספות מהבעלים\n${teachItems}\n\n`;
    }
  }

  // Sequence-based step determination — V2 (mode-aware) or legacy fallback
  const messageCount = options.messageCount || 0;
  const strategy = tenant.conversationStrategy;
  const conversationMode = lead?.conversationMode || null;
  let stepResult;
  if (conversationMode) {
    // V2: mode-aware step determination
    stepResult = determineStepV2(lead || {}, messageCount, tenant.ctaPushLevel, strategy, tenant.maxBotMessages);
  } else if (strategy?.questions?.length > 0) {
    stepResult = determineStepDynamic(lead || {}, messageCount, strategy);
  } else {
    stepResult = determineStep(lead || {}, messageCount, tenant.ctaPushLevel);
  }
  let { step, instruction } = stepResult;
  const gatheredContext = buildGatheredContext(lead?.gathered, strategy);
  const entryTypeHint = getEntryTypeContext(lead?.entryType || 'unknown');

  // Analyze user's last message for tone mirroring
  const lastUserMessage = options.lastUserMessage || '';

  // Detect customer impatience — override step to CTA immediately
  if (lastUserMessage && !lead?.bookingLinkSent && isImpatient(lastUserMessage)) {
    step = 'cta';
    instruction = `## שלב: הצעת שיחה — הלקוח חסר סבלנות!
- הלקוח מבקש לעבור לעניין — כבד את זה!
- אל תשאל שום שאלה נוספת!
- תגיב בקצרה ("סבבה, יאללה" / "צודק, בוא נקבע") ותציע שיחה מיד
- אל תתנצל יותר מדי — פשוט תעבור לעניין
- action="send_link", score=8+`;
    console.log(`[Impatience] Detected for ${lead?.id || 'unknown'} — forcing CTA`);
  }
  let mirrorContext = '';
  if (lastUserMessage) {
    const wordCount = lastUserMessage.trim().split(/\s+/).length;
    const hasEmoji = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/u.test(lastUserMessage);
    const excitementLevel = (lastUserMessage.match(/!{2,}/g) || []).length +
                            (lastUserMessage.match(/[🔥❤️😍🎉💪]/g) || []).length;
    const isShort = wordCount <= 3;
    const isVeryShort = wordCount <= 1;

    // Detect negative emotions — prevent positive reactions ("יופי") to pain/frustration
    const NEGATIVE_PATTERNS = /סבל|קשה|מתוסכל|מתוסכלת|נמאס|תקוע|תקועה|עייפ|מיואש|מיואשת|נלחם|לא מצליח|לא מצליחה|מרגיש רע|מרגישה רע|בבעיה|בצרות|גרוע|נורא|אבוד|אבודה|מסובך|מפחד|מפחדת|חרדה|לחוץ|לחוצה|שבור|שבורה|לא יודע מה לעשות|אין לי כוח|ויתרתי|רוצה לוותר|בדיכאון|סובל|סובלת|כואב|מייאש/;
    const hasNegativeEmotion = NEGATIVE_PATTERNS.test(lastUserMessage);

    mirrorContext = `\n## הודעה אחרונה של הלקוח — התאם סגנון!
- אורך: ${isVeryShort ? 'מילה אחת' : isShort ? 'קצר מאוד' : wordCount <= 8 ? 'רגיל' : 'ארוך'}
- אימוג\'י: ${hasEmoji ? 'כן — שלב אימוג\'י אחד' : 'לא — אל תוסיף אימוג\'י'}
- אנרגיה: ${excitementLevel >= 2 ? 'גבוהה — תתאם!!' : excitementLevel === 1 ? 'חמה' : hasNegativeEmotion ? 'כאב/תסכול — היה אמפתי!' : 'נייטרלי'}
${isVeryShort ? '- ⚠ הודעה קצרצרה — ענה במקסימום 8 מילים!' : isShort ? '- ⚠ הודעה קצרה — ענה במקסימום 10 מילים!' : ''}
${hasNegativeEmotion ? `- ⚠ הלקוח מביע כאב/תסכול/קושי! חובה:
  1. תראה שהבנת: "שומע אותך" / "מבין למה זה מתסכל" / "לגיטימי"
  2. אסור מילים חיוביות כתגובה ראשונה! לא "יופי", לא "מגניב", לא "אחלה", לא "נהדר"
  3. אמפתיה קודם → ואז תכוון לפתרון` : ''}`;
  }

  // Conditionally strip default voice/tone section when Voice DNA is present
  const hasVoiceDNA = tenant.voiceExamples || tenant.voicePhrases;
  let soul = soulContent
    .replace(/\[שם הבעלים\]/g, tenant.ownerName)
    .replace(/\[שם\]/g, tenant.ownerName);
  if (hasVoiceDNA) {
    // Voice DNA overrides default tone, common mistakes, and Hebrew corrections
    // The owner's real language IS the standard — don't second-guess it
    soul = soul.replace(/<!-- VOICE_DEFAULTS_START -->[\s\S]*?<!-- VOICE_DEFAULTS_END -->/, '');
    soul = soul.replace(/<!-- COMMON_MISTAKES_START -->[\s\S]*?<!-- COMMON_MISTAKES_END -->/, '');
  }

  return `${demoPrefix}${soul}

## העסק
- שם: ${tenant.name}
- תחום: ${tenant.businessType}
- שירותים: ${tenant.services}
- שעות: ${tenant.workingHours}
- בעלים: ${tenant.ownerName}

## הוראות סגירה (CTA)
${tenant.ctaType === 'ask_phone' ? 'כשהלקוח מוכן — בקש מספר טלפון: "מעולה, שלח לי מספר ואחזור אליך היום"'
  : tenant.ctaType === 'give_phone' ? `כשהלקוח מוכן — תן לו להתקשר: "${tenant.ownerPhone || '[טלפון לא הוגדר]'}"`
  : tenant.ctaType === 'custom' ? `כשהלקוח מוכן — ${tenant.ctaCustomText || 'הצע שיחה'}`
  : (tenant.bookingInstructions || 'הבעלים טרם הגדיר לינק. הצע שיחה ותגיד שתחזור עם פרטים — action="follow_up"')}
${tenant.ctaType === 'send_link' || !tenant.ctaType ? 'אל תכלול לינק בתשובה — הוא יצורף אוטומטית.' : ''}
${tenant.ctaPushLevel === 'soft' ? '\n## גישת סגירה: רכה\nבנה אמון ושיחה לפני שמציע פגישה. תן ערך אמיתי בשיחה. הצע פגישה רק כשהלקוח מראה עניין ברור או שואל בעצמו.' : tenant.ctaPushLevel === 'aggressive' ? '\n## גישת סגירה: אגרסיבית\nהציע פגישה/שיחה מוקדם ככל האפשר. אחרי שאלה אחת — הציע. אל תחכה. כל הודעה שנייה צריכה לקרב לפגישה.' : ''}
${tenant.customFirstReply ? `\n## הודעה ראשונה מותאמת\nכשמישהו שולח הודעה ראשונה, תענה בדיוק ככה:\n"${tenant.customFirstReply}"` : ''}
${tenant.slangWords ? `\n## סגנון הבעלים\n${tenant.slangWords}\nהשתמש בסגנון הזה!` : ''}
${tenant.websiteLinks ? `\n## לינקים\nכשרלוונטי:\n${tenant.websiteLinks}` : ''}
## מגדר — קריטי!
המגדר שלך (${tenant.botGender === 'female' ? 'נקבה' : 'זכר'}) ≠ מגדר הלקוח. אל תערבב!

**אתה (${tenant.botGender === 'female' ? 'נקבה' : 'זכר'}):** ${tenant.botGender === 'female'
  ? 'דברי על עצמך בנקבה: "אני מסכימה", "אני שמחה", "הייתי שמחה"'
  : 'דבר על עצמך בזכר: "אני מסכים", "אני שמח", "הייתי שמח"'}

**הלקוח:** ${genderInstruction}
${customerGender === 'unknown'
  ? 'בלי "אחי"/"מלכה"/"אתה"/"את". שאלות פתוחות + שם הלקוח. ברגע שחושף מגדר (מרגיש/מרגישה) — נעל ופנה בהתאם!'
  : customerGender === 'male'
    ? `${tenant.voicePhrasesMale ? `פנה אליו עם "${tenant.voicePhrasesMale}". ` : ''}לשון זכר (בוא, תגיד, אתה, מעוניין). אף פעם לשון נקבה לבן.`
    : `${tenant.voicePhrasesFemale ? `פני אליה עם "${tenant.voicePhrasesFemale}". ` : ''}לשון נקבה (בואי, תגידי, את, מעוניינת). אף פעם לשון זכר לבת.`}
ברגע שזיהית מגדר — ${tenant.botGender === 'female' ? 'תהיי עקבית' : 'תהיה עקבי'}!

## הגנת זהות
${tenant.botGender === 'female' ? `את ${tenant.ownerName} מ"${tenant.name}"` : `אתה ${tenant.ownerName} מ"${tenant.name}"`} — ראה סעיף 5 למעלה.

${gatheredContext}
${leadContext}
${knowledgeSection}
${tenant.customFlowInstructions ? `
## הוראות שיחה מותאמות מהבעלים — חובה ליישם!
הבעלים ${tenant.botGender === 'female' ? 'ביקשה' : 'ביקש'} שתנהל${tenant.botGender === 'female' ? 'י' : ''} שיחות ככה:

${tenant.customFlowInstructions}

**הוראות אלו משלימות את הכללים הבסיסיים ולא מבטלות אותם (ענה על שאלות, היה קצר, שקף אנרגיה).**
` : ''}
## מה לעשות עכשיו — זה החלק הכי חשוב!
${options.postCTAOverride ? `\n${options.postCTAOverride}\n` : ''}${conversationMode && conversationMode !== 'qualify' ? `\n⚠ **מצב: ${conversationMode === 'engage' ? 'בניית קשר' : conversationMode === 'assist' ? 'מענה מקצועי' : conversationMode === 'acknowledge' ? 'תגובה קצרה' : 'שיחה חופשית'}** — זו לא שיחת מכירה! אל תציע פגישה, שיחה, או שירות!` : ''}
סוג פנייה: ${entryTypeHint}

${instruction}
${mirrorContext}
${goldenSection}${buildConversationStrategy(tenant)}
${buildVoiceProfile(tenant, { step: lead?.currentStep, mode: conversationMode, leadScore: lead?.qualificationScore })}
**הלקוח כתב עכשיו:** "${lastUserMessage}"

**חוק ברזל — קודם ענה על מה שהלקוח כתב!**
השלב למעלה = כיוון בלבד. קודם ענה, אז כוון. כאב/תסכול → אמפתיה קודם, לא "יופי"/"מגניב".
${conversationMode === 'qualify' || !conversationMode
  ? '2-5 הודעות שלך ואז שיחה. ספק? תציע שיחה. חוסר סבלנות? מיד action="send_link".'
  : conversationMode === 'engage'
  ? 'בנה קשר אמיתי. אסור להציע שיחה/פגישה אלא אם הלקוח ביקש ישירות! אם השיחה הסתיימה → action="end_conversation".'
  : conversationMode === 'assist'
  ? 'ענה ברצינות ובמקצועיות. הראה שאתה מומחה. רק אם הם יוזמים עניין בשירות → הצע שיחה בעדינות.'
  : conversationMode === 'acknowledge'
  ? 'תגובה קצרצרה ואותנטית. 3-5 מילים מקסימום. action="end_conversation".'
  : 'שיחה חופשית. דבר כמו חבר. אסור לנהל ליד או להציע שירותים אלא אם הם מבקשים.'}
${rulesReminder}

## חילוץ מידע על הליד
בסוף כל תשובה הוסף שורה נסתרת:
${strategy?.questions?.length > 0
  ? `<!--LEAD:{"name":"שם או null","interest":"עניין או null","score":NUMBER,"action":"none","gender":"male/female/unknown","intent":"info/professional/content_reaction/fan/chat","gathered":{${strategy.questions.map(q => `"${q.id}":"${q.label} או null"`).join(',')}}}-->`
  : `<!--LEAD:{"name":"שם או null","interest":"עניין או null","score":NUMBER,"action":"none","gender":"male/female/unknown","intent":"info/professional/content_reaction/fan/chat","gathered":{"goal":"מה שהם רוצים או null","motivation":"למה עכשיו או null","currentStatus":"מצב נוכחי או null","pastAttempts":"מה ניסו או null","barriers":"מכשולים או null","priority":"עדיפות או null"}}-->`}

⚠ action/score/gender/intent — **רק** בתוך <!--LEAD:{}-->! אסור בגוף ההודעה!
❌ "בוא נדבר action="send_link"" ← הלקוח רואה טקסט טכני!
✅ "בוא נדבר" + <!--LEAD:{"action":"send_link",...}--> בשורה נפרדת

gathered: מלא רק מה שהלקוח הזכיר. null אם לא. שדה מלא = לא נשאל שוב.
ציון: 1-3 התחלה | 4-6 עניין | 7-8 חזק | 9-10 מוכן
action: none=המשך | send_link=פגישה(7+) | follow_up=מאוחר | end_conversation=סיום | needs_human=העבר לבעלים
needs_human: השתמש כשאתה לא בטוח שאתה יכול לעזור. דוגמאות: שאלה על מחיר/זמינות שלא ב-KB, לקוח מתוסכל ולא מצליח לפתור, בקשה מיוחדת שדורשת החלטה אנושית. כשמשתמש → שלח הודעה חמה כמו "רגע, אני בודק ואחזור אליך בהקדם 🙏"
intent: info=שירות/מחיר | professional=שאלה מקצועית | content_reaction=תוכן | fan=פרגון | chat=כללי
${conversationMode === 'qualify' || !conversationMode
  ? '**intent לא info → אל תמהר ל-CTA! professional→ענה ברצינות, fan→פרגון, chat→שיחה. רק info+5+ → שיחה**'
  : `**מצב ${conversationMode} — רק במצב qualify מותר להציע שיחה/פגישה! בכל מצב אחר — רק אם הלקוח מבקש ישירות.**`}
gender: "male"/"female"/"unknown" (באנגלית!). זהה מפעלים/שם. לא בטוח → "unknown".`;
}
