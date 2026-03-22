import { escapeHtml } from './utils.js';

export function getTeachHTML(entries, secret = '') {
  const categories = {
    sop: { label: 'תהליך מכירה (SOP)', icon: '📋' },
    objections: { label: 'טיפול בהתנגדויות', icon: '🛡️' },
    faq: { label: 'שאלות נפוצות', icon: '❓' },
    tone: { label: 'סגנון ושפה', icon: '🎯' },
    scripts: { label: 'תסריטי שיחה', icon: '💬' },
    general: { label: 'כללי', icon: '📝' },
    rules: { label: 'חוק קבוע', icon: '🚫' },
  };

  // Separate rules from other entries
  const ruleEntries = entries.filter(e => e.category === 'rules');
  const otherEntries = entries.filter(e => e.category !== 'rules');

  const entriesHTML = otherEntries.map(e => {
    const cat = categories[e.category] || categories.general;
    return '<div class="entry" data-id="' + e.id + '" data-cat="' + e.category + '">' +
      '<div class="entry-header">' +
      '<span class="entry-cat">' + cat.icon + ' ' + cat.label + '</span>' +
      '<button class="delete-btn" onclick="deleteEntry(\'' + e.id + '\')" title="מחק">✕</button>' +
      '</div>' +
      (e.title ? '<div class="entry-title">' + escapeHtml(e.title) + '</div>' : '') +
      '<div class="entry-content">' + escapeHtml(e.content) + '</div>' +
      '<div class="entry-meta">' + (e.addedBy || '') + ' • ' + new Date(e.createdAt).toLocaleDateString('he-IL') + '</div>' +
      '</div>';
  }).join('');

  const rulesHTML = ruleEntries.map(e => {
    return '<div class="rule-item" data-id="' + e.id + '">' +
      '<div class="rule-content">' +
      '<span class="rule-icon">🚫</span>' +
      '<span class="rule-text">' + escapeHtml(e.content) + '</span>' +
      '</div>' +
      '<div class="rule-actions">' +
      '<span class="rule-meta">' + (e.addedBy || '') + ' • ' + new Date(e.createdAt).toLocaleDateString('he-IL') + '</span>' +
      '<button class="delete-btn" onclick="deleteRule(\'' + e.id + '\')" title="מחק">✕</button>' +
      '</div>' +
      '</div>';
  }).join('');

  const categoryOptions = Object.entries(categories)
    .filter(([key]) => key !== 'rules')
    .map(([key, val]) =>
      '<option value="' + key + '">' + val.icon + ' ' + val.label + '</option>'
    ).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>למד את הבוט - מאגר ידע</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
      padding: 20px;
    }
    /* Compact mode when loaded inside iframe */
    body.in-iframe { padding: 12px; min-height: auto; }
    body.in-iframe .page-header { display: none; }
    body.in-iframe .stats { display: none; }
    body.in-iframe .tabs { margin-bottom: 16px; }
    body.in-iframe .add-card { margin-bottom: 20px; padding: 16px; }
    body.in-iframe .tip { margin-bottom: 16px; padding: 12px; font-size: 12px; }
    .container { max-width: 800px; margin: 0 auto; }
    .page-header { text-align: center; margin-bottom: 32px; }
    .page-header h1 { font-size: 28px; margin-bottom: 8px; }
    .page-header p { color: #888; font-size: 15px; line-height: 1.6; }
    .stats {
      display: flex; gap: 16px; justify-content: center; margin: 20px 0;
    }
    .stat {
      background: #111; border: 1px solid #222; border-radius: 10px;
      padding: 12px 20px; text-align: center;
    }
    .stat .num { font-size: 24px; font-weight: 700; color: #3b82f6; }
    .stat .num.red { color: #f87171; }
    .stat .label { font-size: 12px; color: #888; }

    /* Add form */
    .add-card {
      background: #111; border: 1px solid #222; border-radius: 16px;
      padding: 24px; margin-bottom: 32px;
    }
    .add-card h2 { font-size: 18px; margin-bottom: 16px; }
    .form-row { display: flex; gap: 12px; margin-bottom: 12px; }
    .form-row select, .form-row input {
      padding: 10px 12px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 8px; color: #fff; font-size: 14px;
    }
    .form-row select { width: 200px; }
    .form-row input { flex: 1; }
    textarea {
      width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 8px; color: #fff; font-size: 14px; min-height: 120px;
      resize: vertical; direction: rtl; margin-bottom: 12px;
      font-family: inherit; line-height: 1.6;
    }
    textarea:focus, input:focus, select:focus { outline: none; border-color: #3b82f6; }
    .name-row { display: flex; gap: 12px; align-items: center; }
    .name-row input { flex: 1; padding: 10px 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; }
    .add-btn {
      padding: 12px 24px; background: #3b82f6; color: #fff; border: none;
      border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;
      white-space: nowrap;
    }
    .add-btn:hover { background: #2563eb; }
    .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Entries list */
    .entries-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .entries-header h2 { font-size: 18px; }
    .filter-btns { display: flex; gap: 6px; flex-wrap: wrap; }
    .filter-btn {
      padding: 6px 12px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 6px; color: #aaa; font-size: 12px; cursor: pointer;
    }
    .filter-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }

    .entry {
      background: #111; border: 1px solid #222; border-radius: 12px;
      padding: 16px; margin-bottom: 12px;
    }
    .entry-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
    .entry-cat { font-size: 12px; color: #888; }
    .delete-btn {
      background: none; border: none; color: #666; cursor: pointer; font-size: 16px;
      padding: 4px 8px; border-radius: 4px;
    }
    .delete-btn:hover { color: #f87171; background: #1a1a1a; }
    .entry-title { font-weight: 600; margin-bottom: 6px; font-size: 15px; }
    .entry-content {
      color: #ccc; font-size: 14px; line-height: 1.7; white-space: pre-wrap;
      word-wrap: break-word;
    }
    .entry-meta { font-size: 11px; color: #555; margin-top: 8px; }

    .empty { text-align: center; padding: 40px; color: #555; }
    .tip {
      background: #0c1e0c; border: 1px solid #166534; border-radius: 10px;
      padding: 16px; margin-bottom: 24px; font-size: 13px; color: #4ade80; line-height: 1.6;
    }

    /* Tabs */
    .tabs { display: flex; gap: 4px; margin-bottom: 24px; background: #111; border-radius: 10px; padding: 4px; }
    .tab {
      flex: 1; padding: 12px; text-align: center; border-radius: 8px;
      cursor: pointer; font-size: 14px; font-weight: 600; color: #888; transition: all 0.2s;
    }
    .tab.active { background: #3b82f6; color: #fff; }
    .tab:hover:not(.active) { color: #fff; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    /* Test chat */
    .chat-card {
      background: #111; border: 1px solid #222; border-radius: 16px;
      overflow: hidden; margin-bottom: 24px;
    }
    .chat-header {
      padding: 12px 16px; background: #1a1a1a; border-bottom: 1px solid #222;
      display: flex; justify-content: space-between; align-items: center;
    }
    .chat-header h3 { font-size: 15px; }
    .chat-reset {
      padding: 8px 16px; background: #dc2626; border: none; color: #fff;
      border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 600;
      transition: background 0.2s;
    }
    .chat-reset:hover { background: #b91c1c; }
    .chat-messages {
      height: 350px; overflow-y: auto; padding: 16px; display: flex;
      flex-direction: column; gap: 10px;
    }
    .chat-msg {
      max-width: 80%; padding: 10px 14px; border-radius: 16px;
      font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap;
    }
    .chat-msg.user { align-self: flex-start; background: #3b82f6; border-bottom-left-radius: 4px; }
    .chat-msg.assistant { align-self: flex-end; background: #262626; border-bottom-right-radius: 4px; }
    .chat-msg.system { align-self: center; color: #555; font-size: 13px; }
    .chat-typing { color: #555; font-size: 13px; padding: 4px 16px; display: none; }
    .chat-typing.active { display: block; }
    .chat-input-area {
      padding: 12px; border-top: 1px solid #222; display: flex; gap: 8px;
    }
    .chat-input-area input {
      flex: 1; padding: 10px 14px; border-radius: 20px; border: 1px solid #333;
      background: #1a1a1a; color: #fff; font-size: 14px; direction: rtl;
    }
    .chat-input-area input:focus { outline: none; border-color: #3b82f6; }
    .chat-input-area button {
      padding: 10px 18px; border-radius: 20px; border: none;
      background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; font-weight: 600;
    }

    /* Test context / customization panel */
    .test-context {
      background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 12px;
      padding: 16px; margin-bottom: 16px;
    }
    .test-context-toggle {
      display: flex; justify-content: space-between; align-items: center;
      cursor: pointer; user-select: none;
    }
    .test-context-toggle h3 { font-size: 14px; color: #aaa; }
    .test-context-toggle .arrow { color: #666; font-size: 12px; transition: transform 0.2s; }
    .test-context-toggle .arrow.open { transform: rotate(180deg); }
    .test-context-fields {
      display: none; margin-top: 16px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
    }
    .test-context-fields.collapsed { display: none; }
    .test-context-fields label {
      display: flex; flex-direction: column; gap: 4px;
      font-size: 12px; color: #888;
    }
    .test-context-fields input {
      padding: 8px 12px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 8px; color: #fff; font-size: 13px; direction: rtl;
    }
    .test-context-fields input:focus { outline: none; border-color: #3b82f6; }
    .context-note {
      grid-column: 1 / -1; font-size: 11px; color: #555; margin-top: 4px;
    }

    /* Rules section */
    .rules-card {
      background: #111; border: 1px solid #222; border-radius: 16px;
      padding: 24px; margin-bottom: 24px;
    }
    .rules-card h2 { font-size: 18px; margin-bottom: 8px; }
    .rules-card .rules-desc { font-size: 13px; color: #888; margin-bottom: 16px; line-height: 1.5; }
    .rule-input-row {
      display: flex; gap: 10px; margin-bottom: 20px;
    }
    .rule-input-row input {
      flex: 1; padding: 12px 14px; background: #1a1a1a; border: 1px solid #333;
      border-radius: 8px; color: #fff; font-size: 14px; direction: rtl;
    }
    .rule-input-row input:focus { outline: none; border-color: #f87171; }
    .rule-input-row button {
      padding: 12px 20px; background: #dc2626; color: #fff; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
      white-space: nowrap;
    }
    .rule-input-row button:hover { background: #b91c1c; }
    .rules-list { display: flex; flex-direction: column; gap: 8px; }
    .rule-item {
      background: #1a0a0a; border: 1px solid #3b1111; border-radius: 10px;
      padding: 12px 16px;
    }
    .rule-content {
      display: flex; align-items: flex-start; gap: 8px; margin-bottom: 6px;
    }
    .rule-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
    .rule-text { font-size: 14px; color: #fca5a5; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
    .rule-actions {
      display: flex; justify-content: space-between; align-items: center;
    }
    .rule-meta { font-size: 11px; color: #555; }
    .rules-empty { text-align: center; padding: 24px; color: #555; font-size: 14px; }
    .rules-count { font-size: 13px; color: #f87171; font-weight: 600; }
  </style>
</head>
<body>
  <script>if (window !== window.parent) document.body.classList.add('in-iframe');</script>
  <div class="container">
    <div class="page-header">
      <h1>📚 למד את הבוט</h1>
      <p>הוסיפו כאן את כל הידע שהבוט צריך: תהליכי מכירה, טיפול בהתנגדויות, תסריטי שיחה, שאלות נפוצות ועוד.<br>כל מה שתכתבו כאן נשמר לצמיתות ומשפיע על כל השיחות של הבוט.</p>
    </div>

    <div class="stats">
      <div class="stat"><div class="num">${otherEntries.length}</div><div class="label">פריטי ידע</div></div>
      <div class="stat"><div class="num red">${ruleEntries.length}</div><div class="label">חוקים קבועים</div></div>
      <div class="stat"><div class="num">${new Set(entries.map(e => e.category)).size}</div><div class="label">קטגוריות</div></div>
    </div>

    <!-- Tabs: Teach / Test / Rules -->
    <div class="tabs">
      <div class="tab active" onclick="switchTab('teach', this)">📚 למד את הבוט</div>
      <div class="tab" onclick="switchTab('test', this)">💬 בדוק את הבוט</div>
      <div class="tab" onclick="switchTab('rules', this)">🚫 חוקים</div>
    </div>

    <!-- TEST TAB -->
    <div class="tab-content" id="tab-test">
      <!-- Test Context Customization -->
      <div class="test-context">
        <div class="test-context-toggle" onclick="toggleTestContext()">
          <h3>⚙️ התאם את הבוט לבדיקה - מה העסק שלך?</h3>
          <span class="arrow" id="contextArrow">▼</span>
        </div>
        <div class="test-context-fields" id="contextFields">
          <label>
            שם הבעלים / המאמן
            <input type="text" id="ctx-ownerName" placeholder="למשל: אופק יהלום" value="">
          </label>
          <label>
            שם העסק
            <input type="text" id="ctx-name" placeholder="למשל: אופק קליסטניקס" value="">
          </label>
          <label>
            תחום / נישה
            <input type="text" id="ctx-businessType" placeholder="למשל: אימוני קליסטניקס, ייעוץ עסקי, קוסמטיקה" value="">
          </label>
          <label>
            שירותים
            <input type="text" id="ctx-services" placeholder="למשל: ליווי אישי, תוכנית אימונים מותאמת" value="">
          </label>
          <div class="context-note">השדות האלה משנים רק את שיחת הבדיקה - לא נשמר לזיכרון הקבוע של הבוט</div>
        </div>
      </div>

      <div class="chat-card">
        <div class="chat-header">
          <h3>💬 שלח הודעה כאילו אתה לקוח - תראה איך הבוט עונה</h3>
          <button class="chat-reset" onclick="resetTestChat()">🔄 אפס שיחה</button>
        </div>
        <div class="chat-messages" id="chatMessages">
          <div class="chat-msg system">כתוב הודעה כאילו אתה לקוח חדש שפונה בDM</div>
        </div>
        <div class="chat-typing" id="chatTyping">...הבוט מקליד</div>
        <div class="chat-input-area">
          <input type="text" id="chatInput" placeholder="...כתוב הודעה">
          <button onclick="sendTestMsg()">שלח</button>
        </div>
      </div>
      <div class="tip">
        <strong>💡 איך לבדוק:</strong> כתוב הודעות כאילו אתה לקוח חדש. תראה איך הבוט מגיב. אם הוא לא עונה כמו שצריך - לך לטאב "למד את הבוט" ותוסיף ידע חדש.<br>
        <strong>⚙️ התאמה:</strong> פתח את ההגדרות למעלה כדי לבדוק את הבוט בתור עסק ספציפי (למשל מאמן כושר, יועץ עסקי וכו') - זה לא משנה את הזיכרון הקבוע.
      </div>
    </div>

    <!-- RULES TAB -->
    <div class="tab-content" id="tab-rules">
      <div class="tip" style="background: #1a0a0a; border-color: #7f1d1d; color: #fca5a5;">
        <strong>🚫 חוקים קבועים:</strong> הוסיפו כאן דברים שהבוט חייב לזכור ואסור לו לעשות אף פעם.<br>
        למשל: "אסור להשתמש באימוגים", "אסור לשאול שתי שאלות בהודעה אחת", "אסור לומר שאתה AI"<br>
        החוקים האלה עדיפים על כל דבר אחר - הבוט חייב לציית להם תמיד.
      </div>

      <div class="rules-card">
        <h2>🚫 הוסף חוק חדש</h2>
        <div class="rules-desc">כתוב חוק שהבוט חייב לזכור ולציית לו תמיד. תיאור ברור של מה אסור / מה חובה.</div>
        <div class="rule-input-row">
          <input type="text" id="ruleInput" placeholder='למשל: "אסור להשתמש בסימני קריאה בברכות" או "חובה לשאול שאלה אחת בלבד בכל הודעה"'>
          <button onclick="addRule()">הוסף חוק</button>
        </div>
        <div class="rules-count" id="rulesCount">${ruleEntries.length} חוקים פעילים</div>
      </div>

      <div class="rules-list" id="rulesList">
        ${rulesHTML || '<div class="rules-empty">אין עדיין חוקים. הוסיפו חוקים שהבוט חייב לציית להם תמיד.</div>'}
      </div>
    </div>

    <!-- TEACH TAB -->
    <div class="tab-content active" id="tab-teach">
    <div class="tip">
      <strong>💡 טיפים למה ללמד את הבוט:</strong><br>
      • תהליך מכירה שלב אחרי שלב (SOP) - מהפתיחה ועד קביעת הפגישה<br>
      • איך להתמודד עם "יקר לי", "אני צריך לחשוב", "מה המחיר"<br>
      • שאלות שלקוחות שואלים הכי הרבה ואיך לענות<br>
      • משפטי פתיחה ותסריטי שיחה שעובדים<br>
      • סגנון הדיבור הנכון (רשמי/קזואלי, אימוג'ים, אורך הודעה)
    </div>

    <div class="add-card">
      <h2>➕ הוסף ידע חדש</h2>
      <div class="form-row">
        <select id="category">
          ${categoryOptions}
        </select>
        <input id="title" placeholder="כותרת (אופציונלי) - למשל: שלב 1 - פתיחת שיחה">
      </div>
      <textarea id="content" placeholder="כתוב כאן את הידע שאת/ה רוצה ללמד את הבוט...

למשל:
כשליד חדש שולח הודעה, קודם כל תגיד שלום חם ותשאל מה הוא מחפש. אל תמכור מיד. תן לו להרגיש שאתה מקשיב.

או:
כשמישהו אומר 'יקר לי' - אל תוריד מחיר. תשאל 'מה התקציב שלך?' ותראה אם יש חבילה שמתאימה."></textarea>
      <div class="name-row">
        <input id="addedBy" placeholder="השם שלך (כדי שנדע מי הוסיף)" value="">
        <button class="add-btn" id="addBtn" onclick="addEntry()">הוסף למאגר הידע</button>
      </div>
    </div>

    <div class="entries-header">
      <h2>מאגר הידע (${otherEntries.length})</h2>
      <div class="filter-btns">
        <div class="filter-btn active" onclick="filterEntries('all', this)">הכל</div>
        <div class="filter-btn" onclick="filterEntries('sop', this)">📋 SOP</div>
        <div class="filter-btn" onclick="filterEntries('objections', this)">🛡️ התנגדויות</div>
        <div class="filter-btn" onclick="filterEntries('faq', this)">❓ שאלות</div>
        <div class="filter-btn" onclick="filterEntries('scripts', this)">💬 תסריטים</div>
        <div class="filter-btn" onclick="filterEntries('tone', this)">🎯 סגנון</div>
      </div>
    </div>

    <div id="entriesList">
      ${entriesHTML || '<div class="empty">אין עדיין ידע במאגר. התחילו להוסיף!</div>'}
    </div>
    </div><!-- /tab-teach -->
  </div>

  <script>
    const API_SECRET = '${secret}';
    const authHeaders = { 'Content-Type': 'application/json', 'X-API-Secret': API_SECRET };

    // --- Tab switching ---
    function switchTab(tab, el) {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('tab-' + tab).classList.add('active');
      if (tab === 'test') document.getElementById('chatInput').focus();
    }

    // --- Test Context ---
    let contextOpen = true;
    function toggleTestContext() {
      contextOpen = !contextOpen;
      document.getElementById('contextFields').classList.toggle('collapsed', !contextOpen);
      document.getElementById('contextArrow').classList.toggle('open', contextOpen);
    }

    // Save/load test context to localStorage
    const ctxFields = ['ctx-ownerName', 'ctx-name', 'ctx-businessType', 'ctx-services'];
    ctxFields.forEach(id => {
      const el = document.getElementById(id);
      el.value = localStorage.getItem(id) || '';
      el.addEventListener('input', () => localStorage.setItem(id, el.value));
    });

    function getTestContext() {
      const ctx = {};
      const ownerName = document.getElementById('ctx-ownerName').value.trim();
      const name = document.getElementById('ctx-name').value.trim();
      const businessType = document.getElementById('ctx-businessType').value.trim();
      const services = document.getElementById('ctx-services').value.trim();
      if (ownerName) ctx.ownerName = ownerName;
      if (name) ctx.name = name;
      if (businessType) ctx.businessType = businessType;
      if (services) ctx.services = services;
      return Object.keys(ctx).length > 0 ? ctx : null;
    }

    // --- Test Chat ---
    let testUserId = 'tester-' + Date.now();

    async function resetTestChat() {
      // Clear server-side conversation
      try {
        await fetch('/api/chat/reset', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ tenantId: 'test', userId: testUserId }),
        });
      } catch (e) { /* ignore */ }
      testUserId = 'tester-' + Date.now();
      document.getElementById('chatMessages').innerHTML = '<div class="chat-msg system">שיחה חדשה - כתוב הודעה כאילו אתה לקוח</div>';
    }

    document.getElementById('chatInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); sendTestMsg(); }
    });

    async function sendTestMsg() {
      const input = document.getElementById('chatInput');
      const msg = input.value.trim();
      if (!msg) return;

      addChatMsg(msg, 'user');
      input.value = '';
      document.getElementById('chatTyping').classList.add('active');

      try {
        const body = { tenantId: 'test', userId: testUserId, message: msg };
        const testContext = getTestContext();
        if (testContext) body.testContext = testContext;

        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        addChatMsg(data.reply, 'assistant');
      } catch (err) {
        addChatMsg('Error: ' + err.message, 'system');
      } finally {
        document.getElementById('chatTyping').classList.remove('active');
        input.focus();
      }
    }

    function addChatMsg(text, role) {
      const div = document.createElement('div');
      div.className = 'chat-msg ' + role;
      div.textContent = text;
      const container = document.getElementById('chatMessages');
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
  </script>

  <script>
    // --- Rules ---
    async function addRule() {
      const input = document.getElementById('ruleInput');
      const content = input.value.trim();
      if (!content) { alert('נא לכתוב חוק'); return; }

      const addedBy = localStorage.getItem('teachName') || 'Anonymous';

      try {
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ category: 'rules', title: '', content, addedBy }),
        });
        if (!res.ok) throw new Error('Server error');
        window.location.reload();
      } catch (err) {
        alert('שגיאה: ' + err.message);
      }
    }

    document.getElementById('ruleInput').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addRule(); }
    });

    async function deleteRule(id) {
      if (!confirm('למחוק את החוק הזה?')) return;
      try {
        const res = await fetch('/api/knowledge/' + id, { method: 'DELETE', headers: { 'X-API-Secret': API_SECRET } });
        if (!res.ok) throw new Error('Error');
        document.querySelector('.rule-item[data-id="' + id + '"]').remove();
        // Update count
        const remaining = document.querySelectorAll('.rule-item').length;
        document.getElementById('rulesCount').textContent = remaining + ' חוקים פעילים';
        if (remaining === 0) {
          document.getElementById('rulesList').innerHTML = '<div class="rules-empty">אין עדיין חוקים. הוסיפו חוקים שהבוט חייב לציית להם תמיד.</div>';
        }
      } catch (err) {
        alert('שגיאה במחיקה');
      }
    }

    // --- Knowledge entries ---
    async function addEntry() {
      const category = document.getElementById('category').value;
      const title = document.getElementById('title').value.trim();
      const content = document.getElementById('content').value.trim();
      const addedBy = document.getElementById('addedBy').value.trim();

      if (!content) { alert('נא לכתוב תוכן'); return; }

      document.getElementById('addBtn').disabled = true;

      try {
        const res = await fetch('/api/knowledge', {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ category, title, content, addedBy }),
        });
        if (!res.ok) throw new Error('Server error');
        window.location.reload();
      } catch (err) {
        alert('שגיאה: ' + err.message);
        document.getElementById('addBtn').disabled = false;
      }
    }

    async function deleteEntry(id) {
      if (!confirm('למחוק את הפריט הזה?')) return;

      try {
        const res = await fetch('/api/knowledge/' + id, { method: 'DELETE', headers: { 'X-API-Secret': API_SECRET } });
        if (!res.ok) throw new Error('Error');
        document.querySelector('[data-id="' + id + '"]').remove();
      } catch (err) {
        alert('שגיאה במחיקה');
      }
    }

    function filterEntries(cat, btn) {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.entry').forEach(el => {
        if (cat === 'all') { el.style.display = ''; return; }
        el.style.display = el.dataset.cat === cat ? '' : 'none';
      });
    }

    // Auto-save name to localStorage
    const nameInput = document.getElementById('addedBy');
    nameInput.value = localStorage.getItem('teachName') || '';
    nameInput.addEventListener('change', () => localStorage.setItem('teachName', nameInput.value));
  </script>
</body>
</html>`;
}
