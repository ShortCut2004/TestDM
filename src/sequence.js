// Sequence-based conversation engine
// Determines the current step based on gathered data, not message count.
// All tenants share the same sequence logic — voice profile handles personalization.
//
// Entry patterns derived from 4,500+ real Instagram DM conversations.
// Classification order matters: specific types checked before broad ones.

// --- Entry Type Classification ---
// Order: booking_request → price_ask → service_inquiry → problem_statement → aspiration → content_reaction → professional_question → fan_message → greeting → unknown

const ENTRY_PATTERNS = {
  // "בוא נקבע שיחה", "אפשר לקבוע?", "רוצה להתחיל" (~2% of openers)
  booking_request: [
    /אפשר לקבוע/i, /רוצה לקבוע/i, /לקבוע (תור|פגישה|שיחה)/i,
    /מתי (פנוי|אפשר)/i, /יש מקום/i,
    /אפשר להירשם/i, /רוצה להירשם/i, /איך נרשמים/i,
    /רוצה להתחיל/i, /בוא נקבע/i, /נקבע שיחה/i,
    /אפשרי לעבוד איתכם/i, /אשמח לעבוד איתכם/i,
  ],

  // "כמה עולה ליווי?", "מה המחיר?", "כמה בערך?" (~12% of openers)
  price_ask: [
    /כמה (זה )?עולה/i, /כמה עולה/i,
    /מה המחיר/i, /מה העלות/i, /מחירון/i,
    /מחיר/i, /תעריף/i, /עלות/i,
    /כמה בערך/i, /תגיד.+כמה/i,
    /כמה (היא|הוא) לוקח/i,
    /how much/i, /price/i,
  ],

  // "רוצה לשמוע על ליווי", "מחפש ייעוץ", "אשמח לשמוע" (~25% — HIGHEST CONVERTERS)
  service_inquiry: [
    /רוצה לשמוע על/i, /אשמח לשמוע/i,
    /רוצה פרטים/i, /אני מעוניין/i, /אני מעוניינת/i,
    /מחפש (ייעוץ|ליווי|עזרה|שירות|תוכנית)/i,
    /מחפשת (ייעוץ|ליווי|עזרה|שירות|תוכנית)/i,
    /איך (אתה|את) יכול.* לעזור/i, /אפשר לעזור/i,
    /מה אתם מציעים/i, /מה יש לכם/i, /מה השירות/i,
    /ספרו לי/i, /תספר/i, /מידע על/i,
    /מה זה כולל/i, /איך זה עובד/i, /מה התהליך/i,
    /יש לך שירות/i, /יש לכם שירות/i,
    /אשמח.*(לשמוע|לדעת|פרטים)/i,
    /שתף.* אותי/i, /ספר.* לי/i,
    /אשמח להכיר/i, /רציתי לשמוע/i,
    /רציתי להתייעץ/i,
  ],

  // "אני תקוע", "קשה לי", "לא מצליח", "מרגיש מבולבל" (~8% — pain given for free)
  problem_statement: [
    /תקוע/i, /קשה לי/i,
    /לא מצליח/i, /לא מצליחה/i,
    /מרגיש.*(תקוע|אבוד|מבולבל|מתוסכל)/i,
    /מרגישה.*(תקועה|אבודה|מבולבלת|מתוסכלת)/i,
    /לא יודע.*(מה לעשות|איך|במה)/i,
    /לא יודעת.*(מה לעשות|איך|במה)/i,
    /מה (עוצר|תוקע) אות/i, /לא עובד/i,
    /בעיה עם/i, /מתקשה/i,
    /לא טוב[הא] ב/i, /מביך/i, /מפחד/i, /מפחדת/i,
    /חסר.*(ביטחון|ידע|כיוון|סיסטם|מערכת)/i,
    /אני חייב[ת]? כבר/i,
  ],

  // "אני רוצה להיות...", "רוצה לבנות עסק", "איך עשית?" (~8% — goal given for free)
  aspiration: [
    /רוצה (לעשות|להיות|לבנות|להגיע|להתחיל|ללמוד|לגדול|להרוויח|לפתוח)/i,
    /איך (ככה )?עשית/i, /איך אתה עושה/i,
    /מה בדיוק אתה עושה/i,
    /אני גם רוצה/i,
    /רוצה להשתפר/i, /רוצה לשנות/i,
    /חולם על/i, /חולמת על/i,
    /המטרה שלי/i, /היעד שלי/i,
    /איך אפשר לעשות/i,
    /תלמד אותי/i, /תלמדי אותי/i,
  ],

  // "אהבתי את הסרטון", "Liked a message", "ראיתי את הסטורי" (~10%)
  content_reaction: [
    /ראיתי את ה(סטורי|פוסט|רילס|סרטון)/i,
    /ראיתי (אצלכם|שפרסמתם)/i,
    /הגעתי מה(סטורי|פוסט|רילס)/i,
    /אהבתי את ה/i, /אהבתי מאוד/i, /אהבתי את זה/i,
    /Liked a message/i,
    /עניין אותי (מה ש|ה)/i, /שלחו לי/i,
    /כיף להסתכל/i, /מהמם/i,
    /אלוף/i, /מקצוען/i,
  ],

  // "מה דעתך על...", "ניסית...", professional advice/question (~5%)
  professional_question: [
    /מה דעתך על/i, /מה אתה חושב על/i, /מה את חושבת על/i,
    /ניסית (פעם|אי פעם)/i, /מכיר את/i, /מכירה את/i,
    /יש לי שאלה (מקצועית|טכנית)/i, /שאלה מקצועית/i,
    /אפשר לשאול (שאלה|משהו)/i,
    /מה (ההבדל|היתרון|החיסרון) בין/i,
    /מה היית (עושה|ממליץ|מציע)/i, /מה היית ממליצה/i,
    /איך (אתה|את) מתמודד/i,
    /טיפ (ל|בנוגע ל|על)/i, /יש לך טיפ/i,
    /אני (גם )?בתחום/i, /אני (גם )?עוסק[ת]? ב/i,
  ],

  // "אתה השראה", "עוקב אחריך", pure fan/admiration (~3%)
  fan_message: [
    /אתה השראה/i, /את השראה/i,
    /עוקב אחריך/i, /עוקבת אחריך/i,
    /מעריך[הת]? את מה ש/i,
    /כל הכבוד (על|ל)/i, /כל הכבוד לך/i,
    /ממשיך[הת]? לעקוב/i,
    /גאווה/i, /מתרגש/i,
    /אוהב[ת]? את התוכן/i,
    /הגעת למקום מטורף/i, /יאללה תמשיך/i,
  ],

  // "היי", "מה קורה אחי", "שלום", "אהלן" (~20% — zero context)
  greeting: [
    /^(היי|הי|שלום|הייי+|מה קורה|מה נשמע|מה המצב|מה הולך|אהלן|בוקר טוב|ערב טוב|hey|hi|hello|yo)(\s|[!?.,]|אחי|גבר|אח|מלך|מלכה|אחות)*$/i,
    /^(אחלה|יא מלך|מניינים|אהלו)/i,
    /^(אח|אחי|גבר|שום|אחשלי)\s*$/i,
    /^מה (קורה|נשמע|המצב|הולך)/i,
  ],
};

export function classifyEntry(messageText) {
  const text = messageText.trim();
  // Check each type in priority order (ENTRY_PATTERNS insertion order is the priority)
  for (const [type, patterns] of Object.entries(ENTRY_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return type;
    }
  }
  return 'unknown';
}

// --- Conversation Modes ---
// Not every DM is a sales lead. The mode determines HOW the bot behaves.

export const CONVERSATION_MODES = {
  qualify:     { label: 'הכשרת ליד', allowsCTA: true },
  engage:      { label: 'בניית קשר', allowsCTA: false },
  assist:      { label: 'מענה מקצועי', allowsCTA: false },
  acknowledge: { label: 'תגובה קצרה', allowsCTA: false },
  converse:    { label: 'שיחה חופשית', allowsCTA: false },
};

const SALES_ENTRY_TYPES = new Set([
  'booking_request', 'price_ask', 'service_inquiry', 'problem_statement', 'aspiration',
]);

export function resolveConversationMode(lead, entryType, botGoal = 'book_calls') {
  const intent = lead.intent || '';
  const currentMode = lead.conversationMode;
  const score = lead.qualificationScore || 0;

  // Mode transitions: upgrade to qualify, or lateral shift based on AI intent
  if (currentMode && currentMode !== 'qualify') {
    // Upgrade to qualify if sales signals detected
    if (score >= 6 || intent === 'info' || SALES_ENTRY_TYPES.has(entryType)) {
      return 'qualify';
    }
    // Lateral transitions based on AI intent (smart correction)
    // The AI classifies intent after seeing the actual message — trust it over regex
    if (intent === 'professional' && currentMode !== 'assist') return 'assist';
    if ((intent === 'fan' || intent === 'content_reaction') && currentMode !== 'engage') return 'engage';
    if (intent === 'chat' && currentMode !== 'converse') return 'converse';
    return currentMode;
  }
  if (currentMode === 'qualify') return 'qualify'; // never downgrade

  // --- Bot Goal override: tenant-level default mode ---
  // Parse multi-goal: "book_calls,warm_up" → Set(['book_calls','warm_up'])
  const goals = new Set((botGoal || 'book_calls').split(',').map(g => g.trim()).filter(Boolean));
  const wantsWarmUp = goals.has('warm_up');
  const wantsAnswer = goals.has('answer_questions');
  const wantsBooking = goals.has('book_calls');

  // Always qualify for explicit booking requests
  if (entryType === 'booking_request') return 'qualify';

  // Multi-goal: warm_up + book_calls — start warm but upgrade sooner
  if (wantsWarmUp && wantsBooking) {
    if (score >= 5 || intent === 'info') return 'qualify';
    return 'engage';
  }
  // Multi-goal: answer_questions + book_calls — assist but upgrade sooner
  if (wantsAnswer && wantsBooking) {
    if (score >= 5 || intent === 'info') return 'qualify';
    return 'assist';
  }
  // Single goal: warm_up only — engage, high threshold to qualify
  if (wantsWarmUp) {
    if (score >= 7) return 'qualify';
    if (intent === 'info' && score >= 5) return 'qualify';
    return 'engage';
  }
  // Single goal: answer_questions only — assist, high threshold
  if (wantsAnswer) {
    if (score >= 7) return 'qualify';
    if (intent === 'info' && score >= 5) return 'qualify';
    return 'assist';
  }

  // --- Default (book_calls / custom): auto-detect from intent & entry type ---

  // Intent override (AI reclassifies after first message)
  if (intent === 'info') return 'qualify';
  if (intent === 'professional') return 'assist';
  if (intent === 'fan' || intent === 'content_reaction') return 'engage';
  if (intent === 'chat') return 'converse';

  // Initial assignment from entry type
  if (SALES_ENTRY_TYPES.has(entryType)) return 'qualify';
  if (entryType === 'content_reaction' || entryType === 'fan_message') return 'engage';
  if (entryType === 'professional_question') return 'assist';
  return 'converse'; // greeting, unknown → pure chat
}

// --- Gathered Fields ---

const GATHERED_FIELDS = ['goal', 'motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'];

// --- Step Instructions (Hebrew) ---

const STEP_INSTRUCTIONS = {
  opening: `## שלב: פתיחה
- אם הלקוח שאל/ביקש משהו — ענה על זה!
- אם רק ברכה ("היי", "מה קורה", "מה נשמע") — ענה כמו חבר! "הכל טוב, מה איתך?" / "מה נשמע?" — בלי שום שאלות עסקיות! זו שיחה רגילה.
- אל תשאל "מה המטרות שלך" או "מה תוקע אותך" בתשובה לברכה! זה לא טבעי.
- אל תדחוף שירותים עדיין`,

  goal: `## שלב: הבנת המטרה
- אם הלקוח כבר אמר מה רוצה / ביקש פרטים → תחזק ותציע שיחה. אל תשאל שוב!
- אם שאלו שאלה → ענה בקצרה, ואז הציע שיחה.
- רק אם לא ברור מה רוצים → שאלה קצרה אחת.`,

  motivation: `## שלב: הבנת המוטיבציה
- אם נשמעים מוכנים → תציע שיחה!
- אם לא → שאלה קצרה אחת`,

  current: `## שלב: מצב נוכחי
- אם שיתפו מספיק → תציע שיחה!
- אם לא → שאלה קצרה אחת`,

  pain: `## שלב: כאב ומכשולים
- אם שיתפו מספיק → תציע שיחה!
- אם לא → שאלה אחת`,

  priority: `## שלב: עדיפות
- כנראה הגיע הזמן להציע שיחה!`,

  cta: `## שלב: הצעת שיחה — עכשיו!
- אל תשאל עוד שאלות!
- תציע שיחה: "בוא נדבר" / "יש לי רעיון — בוא לשיחה קצרה"
- אל תכלול את הלינק בתשובה — הוא יצורף אוטומטית עם הסבר
- אל תציע שעות או ימים ספציפיים! הלינק מאפשר ללקוח לבחור בעצמו
- action="send_link", score=8+`,

  booking: `## שלב: סגירת פגישה
- הלינק נשלח — "הצלחת לקבוע?"
- אם מהססים: "שיחה של 15 דקות, בלי התחייבות"
- אם קבעו → action="end_conversation", score=10`,

  followup: `## שלב: פולו-אפ
- הודעה קצרה: "היי, חשבת על זה?"
- אם לא מעוניינים → action="end_conversation"`,

  engage: `## שלב: המשך שיחה
- אל תדחוף למכירה! זו שיחת פרגון/מקצוע/כללי.
- בנה קשר אמיתי. ענה על שאלות ברצינות.
- רק אם הלקוח יוזם עניין בשירות → הצע שיחה בעדינות.`,
};

// --- Entry Type Context for Prompt ---

const ENTRY_TYPE_CONTEXT = {
  greeting: 'הלקוח פתח בברכה כללית ("היי", "מה קורה", "מה נשמע"). תגיב כמו חבר אמיתי — תברך בחזרה וזהו! "היי! מה נשמע?" / "אהלן, הכל טוב?" — בלי שום שאלות עסקיות! לא "מה המטרות שלך", לא "ספר לי על עצמך", לא "איך אפשר לעזור". פשוט שיחה רגילה בין שני אנשים.',
  service_inquiry: 'הלקוח שאל ישירות על השירות. תענה בקצרה ותציע שיחה מהר — הם כבר מעוניינים!',
  price_ask: 'הלקוח שאל על מחיר. תגיד שזה תלוי, תשאל שאלה אחת על המטרה, ותציע שיחה.',
  content_reaction: 'הלקוח הגיב לתוכן (סטורי/סרטון/פוסט). תודה חמה ושאל מה דיבר אליהם. בנה קשר אמיתי — לא קופצים למכירה! רק אם יש עניין אמיתי בשירות — הצע שיחה בעדינות.',
  professional_question: 'הלקוח שאל שאלה מקצועית. ענה ברצינות ובידע — אתה מומחה! תן תשובה אמיתית (1-3 משפטים). אל תדחוף שירות. רק אם הם ממשיכים לשאול ויש עניין — "רוצה לצלול לעומק בשיחה?"',
  fan_message: 'הלקוח מפרגן / מעריץ. תודה חמה, פרגון בחזרה. בנה קשר אישי. אל תמכור למעריצים! "תודה מלך, מחמם ❤️"',
  problem_statement: 'הלקוח שיתף כאב/בעיה. תגיב באמפתיה קצרה ותציע שיחה — הם כבר מוכנים!',
  aspiration: 'הלקוח שיתף מטרה/שאיפה. תחזק בקצרה ותציע שיחה — המטרה כבר ברורה!',
  booking_request: 'הלקוח רוצה לקבוע! תאשר ותשלח לינק מיד.',
  unknown: 'תגיב בטבעיות למה שנאמר ותשאל בחזרה — כמו שיחה רגילה בין אנשים.',
};

// --- Fast-Track Skipping ---
// AGGRESSIVE: DM conversations should be SHORT. Once we know the goal → CTA.
// Skip everything that can be discussed on the actual call.

const FAST_TRACK = {
  booking_request: ['goal', 'motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // straight to cta
  price_ask: ['motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // answer price → goal → cta
  service_inquiry: ['motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // answer → goal → cta
  content_reaction: ['motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // what interested you → goal → cta
  professional_question: ['goal', 'motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // answer question, don't qualify
  fan_message: ['goal', 'motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // just engage, don't qualify
  problem_statement: ['goal', 'motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // pain given → cta fast
  aspiration: ['motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // goal given → cta fast
  greeting: ['motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // goal → cta (1 question max)
  unknown: ['motivation', 'currentStatus', 'pastAttempts', 'barriers', 'priority'], // goal → cta (1 question max)
};

// --- Step Determination ---

export function determineStep(lead, messageCount, ctaPushLevel = 'normal') {
  const gathered = lead.gathered || {};
  const entryType = lead.entryType || 'unknown';
  const score = lead.qualificationScore || 0;
  const intent = lead.intent || '';
  const skippable = FAST_TRACK[entryType] || [];
  const isNonSales = NON_SALES_INTENTS.has(intent);

  // CTA timing thresholds per push level
  const CTA_THRESHOLDS = {
    soft:       { forceAt: 5, gatheredMin: 3, scoreMin: 8 },
    normal:     { forceAt: 3, gatheredMin: 2, scoreMin: 7 },
    aggressive: { forceAt: 2, gatheredMin: 1, scoreMin: 5 },
  };
  const thresholds = CTA_THRESHOLDS[ctaPushLevel] || CTA_THRESHOLDS.normal;

  // First message is always opening
  if (messageCount <= 1) {
    return { step: 'opening', instruction: STEP_INSTRUCTIONS.opening };
  }

  // Force CTA after N messages — but NOT for non-sales intents (unless score is high)
  if (messageCount >= thresholds.forceAt && !lead.bookingLinkSent && (!isNonSales || score >= 7)) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  // If booking link already sent
  if (lead.bookingLinkSent) {
    return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  }

  // Count gathered fields
  const gatheredCount = GATHERED_FIELDS.filter(f => gathered[f]).length;

  // CTA triggers — thresholds adjust by push level
  // Guard: non-sales intents (fan, professional, etc.) only CTA if score is high enough
  if ((gathered.goal || gatheredCount >= thresholds.gatheredMin || score >= thresholds.scoreMin) && (!isNonSales || score >= 7)) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  // Walk through steps, skip fast-tracked ones
  for (const field of GATHERED_FIELDS) {
    if (skippable.includes(field)) continue;

    // Map field names to step names
    const stepName = field === 'currentStatus' ? 'current'
      : field === 'pastAttempts' ? 'pain'
      : field === 'barriers' ? 'pain'
      : field;

    if (!gathered[field]) {
      // For 'pain' step, check both pastAttempts and barriers
      if (stepName === 'pain' && (gathered.pastAttempts || gathered.barriers)) continue;

      return { step: stepName, instruction: STEP_INSTRUCTIONS[stepName] };
    }
  }

  // All fields gathered or skipped — CTA unless non-sales with low score
  if (isNonSales && score < 7) {
    return { step: 'engage', instruction: STEP_INSTRUCTIONS.engage };
  }
  return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
}

// --- Dynamic Step Determination (Wizard V4: per-tenant strategy) ---

const SPEED_THRESHOLDS = {
  quick:    { forceAt: 2, gatheredMin: 1, scoreMin: 5 },
  balanced: { forceAt: 3, gatheredMin: 2, scoreMin: 7 },
  deep:     { forceAt: 5, gatheredMin: 3, scoreMin: 8 },
};

// Non-sales intents — don't force CTA, let the conversation flow
const NON_SALES_INTENTS = new Set(['professional', 'content_reaction', 'fan', 'chat']);

export function determineStepDynamic(lead, messageCount, strategy) {
  const gathered = lead.gathered || {};
  const entryType = lead.entryType || 'unknown';
  const score = lead.qualificationScore || 0;
  const intent = lead.intent || '';
  const questions = strategy.questions || [];
  const thresholds = SPEED_THRESHOLDS[strategy.speed] || SPEED_THRESHOLDS.balanced;
  const isNonSales = NON_SALES_INTENTS.has(intent);

  // First message is always opening
  if (messageCount <= 1) {
    return { step: 'opening', instruction: STEP_INSTRUCTIONS.opening };
  }

  // Force CTA after N messages — but NOT for non-sales intents (unless score is high)
  if (messageCount >= thresholds.forceAt && !lead.bookingLinkSent && (!isNonSales || score >= 7)) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  // Booking link already sent
  if (lead.bookingLinkSent) {
    return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  }

  // Count gathered fields (from strategy questions)
  const questionIds = questions.map(q => q.id);
  const gatheredCount = questionIds.filter(id => gathered[id]).length;

  // CTA triggers
  // Guard: non-sales intents (fan, professional, etc.) only CTA if score is high enough
  if ((gathered.goal || gatheredCount >= thresholds.gatheredMin || score >= thresholds.scoreMin) && (!isNonSales || score >= 7)) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  // Walk through custom questions in order
  for (const question of questions) {
    if (gathered[question.id]) continue;

    // Skip if entry type is in skipEntryTypes
    if (question.skipEntryTypes && question.skipEntryTypes.includes(entryType)) continue;

    const customInstruction = `## שלב: ${question.label}
- שאל את הלקוח: "${question.prompt}"
- אם כבר ענה על זה → תתקדם
- אם הלקוח נשמע מוכן → תציע שיחה!`;

    return { step: question.id, instruction: customInstruction };
  }

  // All questions asked or skipped — CTA unless non-sales with low score
  if (isNonSales && score < 7) {
    return { step: 'engage', instruction: STEP_INSTRUCTIONS.engage };
  }
  return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
}

// --- Build Gathered Context for Prompt ---

export function buildGatheredContext(gathered, strategy = null) {
  if (!gathered || Object.keys(gathered).length === 0) return '';

  const defaultLabels = {
    goal: 'מטרה',
    motivation: 'מוטיבציה',
    currentStatus: 'מצב נוכחי',
    pastAttempts: 'ניסיונות קודמים',
    barriers: 'מכשולים',
    priority: 'עדיפות',
    budget: 'תקציב',
    timeline: 'לוח זמנים',
  };

  // Merge labels from strategy questions
  const strategyLabels = {};
  if (strategy?.questions) {
    for (const q of strategy.questions) {
      strategyLabels[q.id] = q.label;
    }
  }
  const labels = { ...defaultLabels, ...strategyLabels };

  const lines = [];
  for (const [key, value] of Object.entries(gathered)) {
    if (value) {
      lines.push(`- ${labels[key] || key}: ${value}`);
    }
  }

  if (lines.length === 0) return '';
  return `\n## מידע שכבר נאסף (אל תשאל שוב!):\n${lines.join('\n')}`;
}

// --- Get Entry Type Context ---

export function getEntryTypeContext(entryType) {
  return ENTRY_TYPE_CONTEXT[entryType] || ENTRY_TYPE_CONTEXT.unknown;
}

// ========================================================================
// Multi-Mode Step Determination (V2)
// ========================================================================

const STEP_INSTRUCTIONS_V2 = {
  // --- Engage mode (fans, content reactions) ---
  engage_open: `## שלב: תגובה חמה
- הלקוח הגיב לתוכן או מפרגן. תודה חמה ואותנטית!
- שאל מה דיבר אליהם / מה הכי אהבו — כמו שיחה בין חברים
- אל תציע שום שירות, שיחה, או פגישה. זה לא ליד — זה אדם שרוצה להתחבר!
- המטרה: בנה חיבור אנושי. נקודה.`,

  engage: `## שלב: המשך קשר
- המשך את השיחה באופן טבעי. שאל שאלות מעניינות, שתף תובנות.
- אל תדחוף שירותים! רק אם הלקוח יוזם ושואל ישירות על שירות — אז ענה.
- אם השיחה מתמצה → חתום ברגש: "שמח שנהנית!" / "תמיד שמח לפרגן" ← action="end_conversation"
- המטרה: שהאדם ירגיש ששוחחת איתו, לא שניסית למכור לו.`,

  warmClose: `## שלב: סיום חם
- השיחה הגיעה למקום טבעי. סיים ברגש: "שמח שכתבת!", "תמיד שמח לפרגן 🙏"
- אל תציע שיחה/פגישה! הם לא ביקשו.
- action="end_conversation"`,

  // --- Assist mode (professional questions) ---
  assist_answer: `## שלב: מענה מקצועי
- שאלו שאלה מקצועית. ענה ברצינות, בידע ובעומק!
- תן ערך אמיתי — 2-4 משפטים של תוכן מועיל (לא "שאלה טובה")
- המטרה: להראות שאתה מומחה אמיתי. אל תדחוף לפגישה!
- רק אם הם ממשיכים לשאול ויש עניין ברור → "רוצה לצלול לעומק בשיחה?"`,

  assist_continue: `## שלב: המשך מענה מקצועי
- המשך לענות ברצינות על שאלות.
- אם שואלים שאלה נוספת → ענה!
- אם השיחה מתמצה → "תמיד פה אם יש עוד שאלות 🙏" ← action="end_conversation"
- רק אם הם יוזמים עניין בשירות → הצע שיחה בעדינות.`,

  expertClose: `## שלב: סיום מקצועי
- נתת ערך מספיק. סיים בביטחון: "מקווה שעזרתי! תרגיש חופשי לכתוב מתי שתרצה 🙏"
- אל תדחוף לפגישה!
- action="end_conversation"`,

  // --- Acknowledge mode ---
  acknowledge: `## שלב: הכרה קצרה
- הודעה קצרצרה. תגיב בחמימות: "תודה! 🙏" / "מעריך מלך" / "❤️"
- מקסימום 5 מילים. לא צריך שיחה.
- action="end_conversation", score=1`,

  // --- Converse mode (general chat) ---
  chat: `## שלב: שיחה חופשית
- שיחה רגילה בין אנשים. דבר כמו חבר!
- אל תשאל שאלות עסקיות. אל תציע שירותים. אל תנהל ליד.
- אם הם שואלים על השירות → מצב ישתנה אוטומטית. בינתיים — סתם תהנה מהשיחה.`,

  naturalClose: `## שלב: סיום טבעי
- השיחה דועכת. סיים בטבעיות: "נדבר!" / "לילה טוב!" / "שבוע טוב 🙏"
- אל תציע שיחה/פגישה!
- action="end_conversation"`,
};

// Relaxed CTA thresholds for qualify mode
const CTA_THRESHOLDS_V2 = {
  soft:       { forceAt: 8, gatheredMin: 3, scoreMin: 8 },
  normal:     { forceAt: 5, gatheredMin: 2, scoreMin: 7 },
  aggressive: { forceAt: 3, gatheredMin: 1, scoreMin: 6 },
};

function determineQualifyStep(lead, messageCount, ctaPushLevel) {
  const gathered = lead.gathered || {};
  const entryType = lead.entryType || 'unknown';
  const score = lead.qualificationScore || 0;
  const skippable = FAST_TRACK[entryType] || [];
  const thresholds = CTA_THRESHOLDS_V2[ctaPushLevel] || CTA_THRESHOLDS_V2.normal;

  if (messageCount <= 1) {
    return { step: 'opening', instruction: STEP_INSTRUCTIONS.opening };
  }

  // Force CTA after N messages
  if (messageCount >= thresholds.forceAt && !lead.bookingLinkSent) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  if (lead.bookingLinkSent) {
    return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  }

  const gatheredCount = GATHERED_FIELDS.filter(f => gathered[f]).length;

  if (gathered.goal || gatheredCount >= thresholds.gatheredMin || score >= thresholds.scoreMin) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  // Walk through steps, skip fast-tracked ones
  for (const field of GATHERED_FIELDS) {
    if (skippable.includes(field)) continue;
    const stepName = field === 'currentStatus' ? 'current'
      : field === 'pastAttempts' ? 'pain'
      : field === 'barriers' ? 'pain'
      : field;
    if (!gathered[field]) {
      if (stepName === 'pain' && (gathered.pastAttempts || gathered.barriers)) continue;
      return { step: stepName, instruction: STEP_INSTRUCTIONS[stepName] };
    }
  }

  return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
}

function determineQualifyStepDynamic(lead, messageCount, strategy) {
  const gathered = lead.gathered || {};
  const score = lead.qualificationScore || 0;
  const questions = strategy.questions || [];
  const thresholds = (strategy.speed === 'quick' ? CTA_THRESHOLDS_V2.aggressive
    : strategy.speed === 'deep' ? CTA_THRESHOLDS_V2.soft
    : CTA_THRESHOLDS_V2.normal);

  if (messageCount <= 1) {
    return { step: 'opening', instruction: STEP_INSTRUCTIONS.opening };
  }

  if (messageCount >= thresholds.forceAt && !lead.bookingLinkSent) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  if (lead.bookingLinkSent) {
    return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  }

  const questionIds = questions.map(q => q.id);
  const gatheredCount = questionIds.filter(id => gathered[id]).length;

  if (gathered.goal || gatheredCount >= thresholds.gatheredMin || score >= thresholds.scoreMin) {
    return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
  }

  for (const question of questions) {
    if (gathered[question.id]) continue;
    if (question.skipEntryTypes && question.skipEntryTypes.includes(lead.entryType)) continue;
    const customInstruction = `## שלב: ${question.label}
- שאל את הלקוח: "${question.prompt}"
- אם כבר ענה על זה → תתקדם
- אם הלקוח נשמע מוכן → תציע שיחה!`;
    return { step: question.id, instruction: customInstruction };
  }

  return { step: 'cta', instruction: STEP_INSTRUCTIONS.cta };
}

function determineEngageStep(lead, messageCount, maxBotMessages = null) {
  const limit = maxBotMessages || 6;
  if (lead.bookingLinkSent) return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  if (messageCount <= 1) return { step: 'engage_open', instruction: STEP_INSTRUCTIONS_V2.engage_open };
  if (messageCount >= limit) return { step: 'warmClose', instruction: STEP_INSTRUCTIONS_V2.warmClose };
  return { step: 'engage', instruction: STEP_INSTRUCTIONS_V2.engage };
}

function determineAssistStep(lead, messageCount, maxBotMessages = null) {
  const limit = maxBotMessages || 8;
  if (lead.bookingLinkSent) return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  if (messageCount <= 1) return { step: 'assist_answer', instruction: STEP_INSTRUCTIONS_V2.assist_answer };
  if (messageCount >= limit) return { step: 'expertClose', instruction: STEP_INSTRUCTIONS_V2.expertClose };
  return { step: 'assist_continue', instruction: STEP_INSTRUCTIONS_V2.assist_continue };
}

function determineAcknowledgeStep() {
  return { step: 'acknowledge', instruction: STEP_INSTRUCTIONS_V2.acknowledge };
}

function determineConverseStep(lead, messageCount, maxBotMessages = null) {
  const limit = maxBotMessages || 10;
  if (lead.bookingLinkSent) return { step: 'booking', instruction: STEP_INSTRUCTIONS.booking };
  if (messageCount <= 1) return { step: 'opening', instruction: STEP_INSTRUCTIONS.opening };
  if (messageCount >= limit) return { step: 'naturalClose', instruction: STEP_INSTRUCTIONS_V2.naturalClose };
  return { step: 'chat', instruction: STEP_INSTRUCTIONS_V2.chat };
}

export function determineStepV2(lead, messageCount, ctaPushLevel = 'normal', strategy = null, maxBotMessages = null) {
  const mode = lead.conversationMode || 'converse';

  switch (mode) {
    case 'qualify':
      return strategy?.questions?.length > 0
        ? determineQualifyStepDynamic(lead, messageCount, strategy)
        : determineQualifyStep(lead, messageCount, ctaPushLevel);
    case 'engage':
      return determineEngageStep(lead, messageCount, maxBotMessages);
    case 'assist':
      return determineAssistStep(lead, messageCount, maxBotMessages);
    case 'acknowledge':
      return determineAcknowledgeStep();
    case 'converse':
      return determineConverseStep(lead, messageCount, maxBotMessages);
    default:
      return determineConverseStep(lead, messageCount, maxBotMessages);
  }
}
