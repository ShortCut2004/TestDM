import { escapeHtml } from './utils.js';

export function getChatHTML(entries, secret = '') {
  const categories = {
    sop: { label: 'תהליך מכירה (SOP)', icon: '📋' },
    objections: { label: 'טיפול בהתנגדויות', icon: '🛡️' },
    faq: { label: 'שאלות נפוצות', icon: '❓' },
    tone: { label: 'סגנון ושפה', icon: '🎯' },
    scripts: { label: 'תסריטי שיחה', icon: '💬' },
    general: { label: 'כללי', icon: '📝' },
    rules: { label: 'חוק קבוע', icon: '🚫' },
  };
  const allEntries = entries || [];
  const ruleEntries = allEntries.filter(e => e.category === 'rules');
  const otherEntries = allEntries.filter(e => e.category !== 'rules');

  const entriesHTML = otherEntries.map(e => {
    const cat = categories[e.category] || categories.general;
    return '<div class="entry" data-id="' + e.id + '" data-cat="' + e.category + '">' +
      '<div class="entry-header">' +
      '<span class="entry-cat">' + cat.icon + ' ' + cat.label + '</span>' +
      '<button class="delete-btn" onclick="deleteEntry(\'' + e.id + '\')">✕</button>' +
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
      '<button class="delete-btn" onclick="deleteRule(\'' + e.id + '\')">✕</button>' +
      '</div>' +
      '</div>';
  }).join('');

  const categoryOptions = Object.entries(categories)
    .filter(([key]) => key !== 'rules')
    .map(([key, val]) => '<option value="' + key + '">' + val.icon + ' ' + val.label + '</option>')
    .join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Typer - דשבורד</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a; color: #fff;
      height: 100vh; display: flex; flex-direction: column; overflow: hidden;
    }

    /* Top bar */
    .topbar {
      padding: 10px 20px; background: #111; border-bottom: 1px solid #222;
      display: flex; align-items: center; gap: 14px; flex-shrink: 0;
    }
    .topbar .logo {
      width: 34px; height: 34px; border-radius: 50%;
      background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
      display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0;
    }
    .topbar .title { font-size: 15px; font-weight: 600; white-space: nowrap; }
    .topbar .stats { display: flex; gap: 16px; margin-right: auto; font-size: 12px; color: #666; }
    .topbar .stats .num { color: #3b82f6; font-weight: 700; }
    .topbar .stats .num.red { color: #f87171; }

    /* Nav */
    .nav {
      display: flex; background: #0d0d0d; border-bottom: 1px solid #1a1a1a; flex-shrink: 0;
    }
    .nav-btn {
      flex: 1; padding: 11px 8px; text-align: center; font-size: 13px; font-weight: 600;
      color: #555; cursor: pointer; border: none; background: none;
      border-bottom: 2.5px solid transparent; transition: all 0.15s;
    }
    .nav-btn:hover { color: #aaa; }
    .nav-btn.active { color: #3b82f6; border-bottom-color: #3b82f6; }

    /* Sections */
    .section { display: none; flex: 1; flex-direction: column; overflow: hidden; }
    .section.active { display: flex; }
    .scroll-area { flex: 1; overflow-y: auto; padding: 20px; }

    /* Chat */
    .config-bar {
      padding: 6px 20px; background: #0d0d0d; border-bottom: 1px solid #1a1a1a;
      display: flex; gap: 8px; align-items: center; font-size: 12px; color: #666; flex-shrink: 0;
    }
    .config-bar input { padding: 4px 8px; background: #1a1a1a; border: 1px solid #333; color: #fff; border-radius: 6px; font-size: 12px; }
    .config-bar button { padding: 4px 10px; background: #333; border: 1px solid #444; color: #fff; border-radius: 4px; cursor: pointer; font-size: 12px; }
    .messages { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; gap: 8px; }
    .msg-group { display: flex; flex-direction: column; gap: 4px; }
    .message { max-width: 75%; padding: 10px 14px; border-radius: 18px; font-size: 15px; line-height: 1.4; word-wrap: break-word; white-space: pre-wrap; }
    .message.user { align-self: flex-start; background: #3b82f6; border-bottom-left-radius: 4px; }
    .message.assistant { align-self: flex-end; background: #262626; border-bottom-right-radius: 4px; }
    .message.system { align-self: center; background: transparent; color: #666; font-size: 13px; text-align: center; }
    .feedback-row { align-self: flex-end; display: flex; gap: 4px; flex-wrap: wrap; padding: 2px 0; }
    .fb-btn { padding: 3px 10px; border-radius: 12px; font-size: 11px; border: 1px solid #333; background: #1a1a1a; color: #888; cursor: pointer; transition: all 0.15s; }
    .fb-btn:hover { border-color: #f87171; color: #f87171; background: rgba(248,113,113,0.08); }
    .feedback-form { align-self: flex-end; background: #151515; border: 1px solid #262626; border-radius: 12px; padding: 10px 14px; max-width: 85%; display: none; }
    .feedback-form.open { display: block; }
    .feedback-form .fb-label { font-size: 12px; color: #f87171; font-weight: 600; margin-bottom: 6px; }
    .feedback-form .fb-context { font-size: 11px; color: #555; margin-bottom: 8px; max-height: 40px; overflow: hidden; }
    .feedback-form textarea { width: 100%; padding: 8px 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1a; color: #fff; font-size: 13px; font-family: inherit; outline: none; direction: rtl; resize: vertical; min-height: 50px; }
    .feedback-form textarea:focus { border-color: #f87171; }
    .feedback-form .fb-actions { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; }
    .feedback-form .fb-cancel { padding: 5px 12px; border-radius: 6px; border: 1px solid #333; background: transparent; color: #888; font-size: 12px; cursor: pointer; }
    .feedback-form .fb-submit { padding: 5px 14px; border-radius: 6px; border: none; background: #f87171; color: #fff; font-size: 12px; font-weight: 600; cursor: pointer; }
    .feedback-form .fb-submit:hover { background: #ef4444; }
    .fb-success { align-self: flex-end; font-size: 11px; color: #4ade80; padding: 2px 0; }
    .typing { align-self: flex-end; color: #666; font-size: 13px; display: none; padding: 4px 14px; flex-shrink: 0; }
    .typing.active { display: block; }
    .input-area { padding: 12px 20px; background: #111; border-top: 1px solid #222; display: flex; gap: 10px; flex-shrink: 0; }
    .input-area input { flex: 1; padding: 12px 16px; border-radius: 24px; border: 1px solid #333; background: #1a1a1a; color: #fff; font-size: 15px; outline: none; direction: rtl; }
    .input-area input:focus { border-color: #3b82f6; }
    .input-area button { padding: 12px 20px; border-radius: 24px; border: none; background: #3b82f6; color: #fff; font-size: 15px; cursor: pointer; font-weight: 600; }
    .input-area button:hover { background: #2563eb; }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Teach */
    .card { background: #111; border: 1px solid #222; border-radius: 14px; padding: 20px; margin-bottom: 20px; }
    .card h2 { font-size: 16px; margin-bottom: 14px; }
    .form-row { display: flex; gap: 10px; margin-bottom: 10px; }
    .form-row select, .form-row input { padding: 10px 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; }
    .form-row select { width: 200px; }
    .form-row input { flex: 1; }
    .card textarea { width: 100%; padding: 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; min-height: 100px; resize: vertical; direction: rtl; margin-bottom: 10px; font-family: inherit; line-height: 1.6; }
    .card textarea:focus, .card input:focus, .card select:focus { outline: none; border-color: #3b82f6; }
    .name-row { display: flex; gap: 10px; align-items: center; }
    .name-row input { flex: 1; padding: 10px 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; }
    .add-btn { padding: 10px 20px; background: #3b82f6; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .add-btn:hover { background: #2563eb; }
    .add-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .entries-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
    .entries-header h2 { font-size: 16px; }
    .filter-btns { display: flex; gap: 5px; flex-wrap: wrap; }
    .filter-btn { padding: 5px 10px; background: #1a1a1a; border: 1px solid #333; border-radius: 6px; color: #aaa; font-size: 12px; cursor: pointer; }
    .filter-btn.active { background: #3b82f6; border-color: #3b82f6; color: #fff; }
    .entry { background: #111; border: 1px solid #222; border-radius: 10px; padding: 14px; margin-bottom: 10px; }
    .entry-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .entry-cat { font-size: 12px; color: #888; }
    .delete-btn { background: none; border: none; color: #666; cursor: pointer; font-size: 15px; padding: 2px 6px; border-radius: 4px; }
    .delete-btn:hover { color: #f87171; background: #1a1a1a; }
    .entry-title { font-weight: 600; margin-bottom: 4px; font-size: 14px; }
    .entry-content { color: #ccc; font-size: 13px; line-height: 1.6; white-space: pre-wrap; word-wrap: break-word; }
    .entry-meta { font-size: 10px; color: #555; margin-top: 6px; }
    .empty-state { text-align: center; padding: 40px 20px; color: #555; font-size: 14px; }

    /* Rules */
    .tip-box { background: #0c1e0c; border: 1px solid #166534; border-radius: 10px; padding: 14px; margin-bottom: 20px; font-size: 12px; color: #4ade80; line-height: 1.6; }
    .tip-box.red { background: #1a0a0a; border-color: #7f1d1d; color: #fca5a5; }
    .rule-input-row { display: flex; gap: 10px; margin-bottom: 16px; }
    .rule-input-row input { flex: 1; padding: 12px 14px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 14px; direction: rtl; }
    .rule-input-row input:focus { outline: none; border-color: #f87171; }
    .rule-input-row button { padding: 12px 18px; background: #dc2626; color: #fff; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .rule-input-row button:hover { background: #b91c1c; }
    .rules-list { display: flex; flex-direction: column; gap: 8px; }
    .rule-item { background: #1a0a0a; border: 1px solid #3b1111; border-radius: 10px; padding: 12px 16px; }
    .rule-content { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 4px; }
    .rule-icon { font-size: 16px; flex-shrink: 0; }
    .rule-text { font-size: 14px; color: #fca5a5; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
    .rule-actions { display: flex; justify-content: space-between; align-items: center; }
    .rule-meta { font-size: 11px; color: #555; }
    .rules-count { font-size: 13px; color: #f87171; font-weight: 600; margin-bottom: 12px; }
    .rules-empty { text-align: center; padding: 24px; color: #555; font-size: 14px; }

    /* Test */
    .test-context { background: #0d0d0d; border: 1px solid #1a1a1a; border-radius: 12px; padding: 14px; margin-bottom: 16px; }
    .test-context-toggle { display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none; }
    .test-context-toggle h3 { font-size: 13px; color: #aaa; }
    .test-context-toggle .arrow { color: #666; font-size: 12px; transition: transform 0.2s; }
    .test-context-toggle .arrow.open { transform: rotate(180deg); }
    .test-context-fields { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .test-context-fields.collapsed { display: none; }
    .test-context-fields label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #888; }
    .test-context-fields input { padding: 8px 12px; background: #1a1a1a; border: 1px solid #333; border-radius: 8px; color: #fff; font-size: 13px; direction: rtl; }
    .test-context-fields input:focus { outline: none; border-color: #3b82f6; }
    .context-note { grid-column: 1 / -1; font-size: 11px; color: #555; margin-top: 4px; }
    .test-chat { background: #111; border: 1px solid #222; border-radius: 14px; overflow: hidden; }
    .test-chat-header { padding: 10px 14px; background: #1a1a1a; border-bottom: 1px solid #222; display: flex; justify-content: space-between; align-items: center; }
    .test-chat-header h3 { font-size: 14px; }
    .test-chat-reset { padding: 6px 14px; background: #dc2626; border: none; color: #fff; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600; }
    .test-chat-reset:hover { background: #b91c1c; }
    .test-messages { height: 320px; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .test-msg { max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
    .test-msg.user { align-self: flex-start; background: #3b82f6; border-bottom-left-radius: 4px; }
    .test-msg.assistant { align-self: flex-end; background: #262626; border-bottom-right-radius: 4px; }
    .test-msg.system { align-self: center; color: #555; font-size: 13px; }
    .test-typing { color: #555; font-size: 13px; padding: 4px 16px; display: none; }
    .test-typing.active { display: block; }
    .test-input-area { padding: 10px; border-top: 1px solid #222; display: flex; gap: 8px; }
    .test-input-area input { flex: 1; padding: 10px 14px; border-radius: 20px; border: 1px solid #333; background: #1a1a1a; color: #fff; font-size: 14px; direction: rtl; }
    .test-input-area input:focus { outline: none; border-color: #3b82f6; }
    .test-input-area button { padding: 10px 16px; border-radius: 20px; border: none; background: #3b82f6; color: #fff; font-size: 14px; cursor: pointer; font-weight: 600; }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="logo">AI</div>
    <div class="title">Typer</div>
    <span style="background:#f59e0b;color:#000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">ADMIN - מוח ראשי</span>
    <div class="stats">
      <span><span class="num" id="statKnowledge">${otherEntries.length}</span> פריטי ידע</span>
      <span><span class="num red" id="statRules">${ruleEntries.length}</span> חוקים</span>
    </div>
    <a href="/app" style="margin-right:auto;padding:4px 10px;background:#3b82f6;color:#fff;border-radius:6px;font-size:11px;text-decoration:none;font-weight:600;">לדשבורד לקוח</a>
  </div>

  <div class="nav">
    <button class="nav-btn active" onclick="showSection('chat')">💬 צ'אט</button>
    <button class="nav-btn" onclick="showSection('teach')">📚 למד</button>
    <button class="nav-btn" onclick="showSection('rules')">🚫 חוקים</button>
    <button class="nav-btn" onclick="showSection('test')">🧪 בדוק</button>
  </div>

  <!-- CHAT -->
  <div class="section active" id="sec-chat">
    <div class="config-bar">
      <span>User:</span>
      <input id="userIdInput" value="test-user" style="width:80px">
      <button onclick="resetChat()">איפוס שיחה</button>
    </div>
    <div class="messages" id="messages">
      <div class="message system">התחל שיחה בעברית כדי לבדוק את הבוט</div>
    </div>
    <div class="typing" id="typing">...מקליד/ה</div>
    <div class="input-area">
      <input type="text" id="messageInput" placeholder="...כתוב הודעה" autofocus>
      <button id="sendBtn" onclick="sendMessage()">שלח</button>
    </div>
  </div>

  <!-- TEACH -->
  <div class="section" id="sec-teach">
    <div class="scroll-area">
      <div class="card">
        <h2>➕ הוסף ידע חדש</h2>
        <div class="form-row">
          <select id="category">${categoryOptions}</select>
          <input id="title" placeholder="כותרת (אופציונלי)">
        </div>
        <textarea id="content" placeholder="כתוב כאן את הידע שאת/ה רוצה ללמד את הבוט...

למשל:
כשליד חדש שולח הודעה, קודם כל תגיד שלום חם ותשאל מה הוא מחפש.

או:
כשמישהו אומר 'יקר לי' - אל תוריד מחיר. תשאל 'מה התקציב שלך?'"></textarea>
        <div class="name-row">
          <input id="addedBy" placeholder="השם שלך">
          <button class="add-btn" id="addBtn" onclick="addEntry()">הוסף למאגר</button>
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
        ${entriesHTML || '<div class="empty-state">אין עדיין ידע במאגר. התחילו להוסיף!</div>'}
      </div>
    </div>
  </div>

  <!-- RULES -->
  <div class="section" id="sec-rules">
    <div class="scroll-area">
      <div class="tip-box red">
        <strong>🚫 חוקים קבועים</strong> - דברים שהבוט חייב לזכור ואסור לו לעשות אף פעם.<br>
        למשל: "אסור להשתמש באימוגים", "אסור לשאול שתי שאלות בהודעה אחת"<br>
        החוקים עדיפים על כל דבר אחר.
      </div>
      <div class="card">
        <h2>🚫 הוסף חוק חדש</h2>
        <div class="rule-input-row">
          <input type="text" id="ruleInput" placeholder='למשל: "אסור להשתמש בסימני קריאה" או "חובה לשאול שאלה אחת בלבד"'>
          <button onclick="addRule()">הוסף חוק</button>
        </div>
        <div class="rules-count" id="rulesCount">${ruleEntries.length} חוקים פעילים</div>
      </div>
      <div class="rules-list" id="rulesList">
        ${rulesHTML || '<div class="rules-empty">אין עדיין חוקים.</div>'}
      </div>
    </div>
  </div>

  <!-- TEST -->
  <div class="section" id="sec-test">
    <div class="scroll-area">
      <div class="test-context">
        <div class="test-context-toggle" onclick="toggleTestContext()">
          <h3>⚙️ התאם את הבוט לבדיקה - מה העסק שלך?</h3>
          <span class="arrow open" id="contextArrow">▼</span>
        </div>
        <div class="test-context-fields" id="contextFields">
          <label>שם הבעלים <input type="text" id="ctx-ownerName" placeholder="למשל: אופק"></label>
          <label>שם העסק <input type="text" id="ctx-name" placeholder="למשל: אופק קליסטניקס"></label>
          <label>תחום / נישה <input type="text" id="ctx-businessType" placeholder="למשל: אימוני כושר, ייעוץ עסקי"></label>
          <label>שירותים <input type="text" id="ctx-services" placeholder="למשל: ליווי אישי, תוכנית אימונים"></label>
          <div class="context-note">השדות האלה משנים רק את שיחת הבדיקה - לא נשמר לזיכרון הקבוע</div>
        </div>
      </div>
      <div class="test-chat">
        <div class="test-chat-header">
          <h3>💬 שלח הודעה כאילו אתה לקוח</h3>
          <button class="test-chat-reset" onclick="resetTestChat()">🔄 אפס</button>
        </div>
        <div class="test-messages" id="testMessages">
          <div class="test-msg system">כתוב הודעה כאילו אתה לקוח חדש שפונה בDM</div>
        </div>
        <div class="test-typing" id="testTyping">...הבוט מקליד</div>
        <div class="test-input-area">
          <input type="text" id="testInput" placeholder="...כתוב הודעה">
          <button onclick="sendTestMsg()">שלח</button>
        </div>
      </div>
      <div class="tip-box" style="margin-top:16px">
        <strong>💡 איך לבדוק:</strong> כתוב הודעות כאילו אתה לקוח חדש. אם הבוט לא עונה כמו שצריך - לך לטאב "למד" ותוסיף ידע חדש.
      </div>
    </div>
  </div>

  <script>
    var API_SECRET = '${secret}';
    var authHeaders = { 'Content-Type': 'application/json', 'X-API-Secret': API_SECRET };

    // Navigation
    function showSection(name) {
      var tabs = ['chat','teach','rules','test'];
      document.querySelectorAll('.nav-btn').forEach(function(btn, i) {
        btn.classList.toggle('active', tabs[i] === name);
      });
      document.querySelectorAll('.section').forEach(function(sec) {
        sec.classList.toggle('active', sec.id === 'sec-' + name);
      });
      if (name === 'chat') document.getElementById('messageInput').focus();
      if (name === 'test') document.getElementById('testInput').focus();
    }

    // Chat
    var messagesEl = document.getElementById('messages');
    var inputEl = document.getElementById('messageInput');
    var typingEl = document.getElementById('typing');
    var sendBtn = document.getElementById('sendBtn');
    var fbCategories = [
      { key: 'general', label: 'ידע שגוי' },
      { key: 'tone', label: 'טון/סגנון' },
      { key: 'scripts', label: 'צורת כתיבה' },
      { key: 'rules', label: 'חוק חדש' },
    ];

    function resetChat() {
      var uid = 'user-' + Date.now();
      document.getElementById('userIdInput').value = uid;
      fetch('/api/chat/reset', { method: 'POST', headers: authHeaders, body: JSON.stringify({ tenantId: 'test', userId: uid }) }).catch(function(){});
      messagesEl.innerHTML = '<div class="message system">שיחה חדשה התחילה</div>';
    }

    inputEl.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });

    async function sendMessage() {
      var message = inputEl.value.trim();
      if (!message) return;
      addMessage(message, 'user');
      inputEl.value = '';
      sendBtn.disabled = true;
      typingEl.classList.add('active');
      try {
        var res = await fetch('/api/chat', { method: 'POST', headers: authHeaders, body: JSON.stringify({ tenantId: 'test', userId: document.getElementById('userIdInput').value, message: message }) });
        var data = await res.json();
        if (data.error) throw new Error(data.error);
        addMessage(data.reply, 'assistant');
      } catch (err) { addMessage('Error: ' + err.message, 'system'); }
      finally { typingEl.classList.remove('active'); sendBtn.disabled = false; inputEl.focus(); }
    }

    function addMessage(text, role) {
      var group = document.createElement('div');
      group.className = 'msg-group';
      var div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      group.appendChild(div);
      if (role === 'assistant') {
        var fbRow = document.createElement('div');
        fbRow.className = 'feedback-row';
        fbCategories.forEach(function(cat) {
          var btn = document.createElement('button');
          btn.className = 'fb-btn';
          btn.textContent = cat.label;
          btn.onclick = function() { openFeedback(group, cat, text); };
          fbRow.appendChild(btn);
        });
        group.appendChild(fbRow);
      }
      messagesEl.appendChild(group);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function openFeedback(group, cat, botMsg) {
      var existing = group.querySelector('.feedback-form');
      if (existing) { existing.remove(); return; }
      var form = document.createElement('div');
      form.className = 'feedback-form open';
      var shortMsg = botMsg.length > 80 ? botMsg.substring(0, 80) + '...' : botMsg;
      form.innerHTML =
        '<div class="fb-label">' + cat.label + '</div>' +
        '<div class="fb-context">על ההודעה: "' + shortMsg.replace(/[<]/g, '&lt;') + '"</div>' +
        '<textarea placeholder="מה היה לא בסדר? איך הבוט צריך להתנהג?"></textarea>' +
        '<div class="fb-actions">' +
          '<button class="fb-cancel" onclick="this.closest(\\'.feedback-form\\').remove()">ביטול</button>' +
          '<button class="fb-submit">שמור</button>' +
        '</div>';
      var submitBtn = form.querySelector('.fb-submit');
      submitBtn.onclick = async function() {
        var textarea = form.querySelector('textarea');
        var content = textarea.value.trim();
        if (!content) { textarea.style.borderColor = '#f87171'; return; }
        submitBtn.disabled = true; submitBtn.textContent = '...שומר';
        try {
          var saveCat = cat.key || 'corrections';
          var saveContent = saveCat === 'rules' ? content : '[' + cat.label + '] הבוט כתב: "' + botMsg.substring(0, 120) + '" - התיקון: ' + content;
          var res = await fetch('/api/knowledge', { method: 'POST', headers: authHeaders, body: JSON.stringify({ category: saveCat, content: saveContent, title: saveCat === 'rules' ? '' : cat.label, addedBy: 'team' }) });
          if (!res.ok) throw new Error('Failed');
          form.remove();
          var success = document.createElement('div');
          success.className = 'fb-success';
          success.textContent = 'נשמר! הבוט ישתפר מהפידבק הזה';
          group.appendChild(success);
          setTimeout(function() { success.style.opacity = '0.5'; }, 3000);
          // Update stats counter
          if (saveCat === 'rules') {
            var el = document.getElementById('statRules');
            if (el) el.textContent = parseInt(el.textContent) + 1;
          } else {
            var el = document.getElementById('statKnowledge');
            if (el) el.textContent = parseInt(el.textContent) + 1;
          }
        } catch(e) { submitBtn.disabled = false; submitBtn.textContent = 'שמור'; alert('שגיאה בשמירה'); }
      };
      group.appendChild(form);
      form.querySelector('textarea').focus();
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Teach
    async function addEntry() {
      var category = document.getElementById('category').value;
      var title = document.getElementById('title').value.trim();
      var content = document.getElementById('content').value.trim();
      var addedBy = document.getElementById('addedBy').value.trim();
      if (!content) { alert('נא לכתוב תוכן'); return; }
      document.getElementById('addBtn').disabled = true;
      try {
        var res = await fetch('/api/knowledge', { method: 'POST', headers: authHeaders, body: JSON.stringify({ category: category, title: title, content: content, addedBy: addedBy }) });
        if (!res.ok) throw new Error('Server error');
        window.location.reload();
      } catch (err) { alert('שגיאה: ' + err.message); document.getElementById('addBtn').disabled = false; }
    }

    async function deleteEntry(id) {
      if (!confirm('למחוק את הפריט הזה?')) return;
      try {
        var res = await fetch('/api/knowledge/' + id, { method: 'DELETE', headers: { 'X-API-Secret': API_SECRET } });
        if (!res.ok) throw new Error('Error');
        var el = document.querySelector('[data-id="' + id + '"]');
        if (el) el.remove();
      } catch (err) { alert('שגיאה במחיקה'); }
    }

    function filterEntries(cat, btn) {
      document.querySelectorAll('.filter-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      document.querySelectorAll('.entry').forEach(function(el) {
        if (cat === 'all') { el.style.display = ''; return; }
        el.style.display = el.dataset.cat === cat ? '' : 'none';
      });
    }

    var nameInput = document.getElementById('addedBy');
    nameInput.value = localStorage.getItem('teachName') || '';
    nameInput.addEventListener('change', function() { localStorage.setItem('teachName', nameInput.value); });

    // Rules
    async function addRule() {
      var input = document.getElementById('ruleInput');
      var content = input.value.trim();
      if (!content) { alert('נא לכתוב חוק'); return; }
      var addedBy = localStorage.getItem('teachName') || 'Anonymous';
      try {
        var res = await fetch('/api/knowledge', { method: 'POST', headers: authHeaders, body: JSON.stringify({ category: 'rules', title: '', content: content, addedBy: addedBy }) });
        if (!res.ok) throw new Error('Server error');
        window.location.reload();
      } catch (err) { alert('שגיאה: ' + err.message); }
    }

    document.getElementById('ruleInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); addRule(); }
    });

    async function deleteRule(id) {
      if (!confirm('למחוק את החוק הזה?')) return;
      try {
        var res = await fetch('/api/knowledge/' + id, { method: 'DELETE', headers: { 'X-API-Secret': API_SECRET } });
        if (!res.ok) throw new Error('Error');
        var el = document.querySelector('.rule-item[data-id="' + id + '"]');
        if (el) el.remove();
        var remaining = document.querySelectorAll('.rule-item').length;
        document.getElementById('rulesCount').textContent = remaining + ' חוקים פעילים';
        if (remaining === 0) document.getElementById('rulesList').innerHTML = '<div class="rules-empty">אין עדיין חוקים.</div>';
      } catch (err) { alert('שגיאה במחיקה'); }
    }

    // Test
    var contextOpen = true;
    function toggleTestContext() {
      contextOpen = !contextOpen;
      document.getElementById('contextFields').classList.toggle('collapsed', !contextOpen);
      document.getElementById('contextArrow').classList.toggle('open', contextOpen);
    }

    ['ctx-ownerName','ctx-name','ctx-businessType','ctx-services'].forEach(function(id) {
      var el = document.getElementById(id);
      el.value = localStorage.getItem(id) || '';
      el.addEventListener('input', function() { localStorage.setItem(id, el.value); });
    });

    function getTestContext() {
      var ctx = {};
      var ow = document.getElementById('ctx-ownerName').value.trim();
      var nm = document.getElementById('ctx-name').value.trim();
      var bt = document.getElementById('ctx-businessType').value.trim();
      var sv = document.getElementById('ctx-services').value.trim();
      if (ow) ctx.ownerName = ow;
      if (nm) ctx.name = nm;
      if (bt) ctx.businessType = bt;
      if (sv) ctx.services = sv;
      return Object.keys(ctx).length > 0 ? ctx : null;
    }

    var testUserId = 'tester-' + Date.now();

    async function resetTestChat() {
      try { await fetch('/api/chat/reset', { method: 'POST', headers: authHeaders, body: JSON.stringify({ tenantId: 'test', userId: testUserId }) }); } catch(e){}
      testUserId = 'tester-' + Date.now();
      document.getElementById('testMessages').innerHTML = '<div class="test-msg system">שיחה חדשה - כתוב הודעה כאילו אתה לקוח</div>';
    }

    document.getElementById('testInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); sendTestMsg(); }
    });

    async function sendTestMsg() {
      var input = document.getElementById('testInput');
      var msg = input.value.trim();
      if (!msg) return;
      addTestMsg(msg, 'user');
      input.value = '';
      document.getElementById('testTyping').classList.add('active');
      try {
        var body = { tenantId: 'test', userId: testUserId, message: msg };
        var tc = getTestContext();
        if (tc) body.testContext = tc;
        var res = await fetch('/api/chat', { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
        var data = await res.json();
        if (data.error) throw new Error(data.error);
        addTestMsg(data.reply, 'assistant');
      } catch (err) { addTestMsg('Error: ' + err.message, 'system'); }
      finally { document.getElementById('testTyping').classList.remove('active'); input.focus(); }
    }

    function addTestMsg(text, role) {
      var div = document.createElement('div');
      div.className = 'test-msg ' + role;
      div.textContent = text;
      var container = document.getElementById('testMessages');
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }
  </script>
</body>
</html>`;
}
