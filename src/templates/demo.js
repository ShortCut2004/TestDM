import { escapeHtml } from './utils.js';

export function getDemoHTML() {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הדגמה חיה - Typer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #fff;
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    /* ===== Setup Form Phase ===== */
    .setup-phase {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .setup-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 480px;
    }
    .setup-card h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .setup-card .subtitle {
      color: #888;
      font-size: 14px;
      margin-bottom: 24px;
    }
    .form-group {
      margin-bottom: 16px;
    }
    .form-group label {
      display: block;
      font-size: 13px;
      color: #aaa;
      margin-bottom: 6px;
      font-weight: 500;
    }
    .form-group input, .form-group textarea {
      width: 100%;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #fff;
      font-size: 14px;
      outline: none;
      direction: rtl;
      font-family: inherit;
    }
    .form-group input:focus, .form-group textarea:focus {
      border-color: #3b82f6;
    }
    .form-group textarea {
      resize: vertical;
      min-height: 60px;
    }
    .form-group .required { color: #f87171; }
    .form-error {
      color: #f87171;
      font-size: 13px;
      margin-top: 6px;
      display: none;
    }
    .presets {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }
    .presets button {
      padding: 6px 14px;
      border-radius: 20px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #ccc;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .presets button:hover {
      border-color: #3b82f6;
      color: #3b82f6;
      background: rgba(59,130,246,0.08);
    }
    .start-btn {
      width: 100%;
      padding: 14px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      transition: opacity 0.15s;
    }
    .start-btn:hover { opacity: 0.9; }

    /* ===== Chat Phase ===== */
    .chat-phase {
      flex: 1;
      flex-direction: column;
      display: none;
    }
    .demo-header {
      padding: 14px 20px;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border-bottom: 1px solid #222;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .demo-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .demo-header .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .demo-header h1 {
      font-size: 16px;
      font-weight: 600;
    }
    .demo-header .subtitle {
      font-size: 12px;
      color: #8b5cf6;
      font-weight: 500;
    }
    .demo-header-left {
      display: flex;
      gap: 8px;
    }
    .demo-header-left button {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #ccc;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .demo-header-left button:hover {
      border-color: #3b82f6;
      color: #fff;
    }
    .demo-info {
      padding: 8px 20px;
      background: rgba(59,130,246,0.06);
      border-bottom: 1px solid #1a1a2e;
      font-size: 12px;
      color: #888;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .demo-info span { color: #aaa; }
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 75%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 15px;
      line-height: 1.4;
      word-wrap: break-word;
      white-space: pre-wrap;
    }
    .message.user {
      align-self: flex-start;
      background: #3b82f6;
      border-bottom-left-radius: 4px;
    }
    .message.assistant {
      align-self: flex-end;
      background: #262626;
      border-bottom-right-radius: 4px;
    }
    .message.system {
      align-self: center;
      background: transparent;
      color: #666;
      font-size: 13px;
      text-align: center;
    }
    .typing {
      align-self: flex-end;
      color: #666;
      font-size: 13px;
      display: none;
      padding: 4px 14px;
    }
    .typing.active { display: block; }
    .input-area {
      padding: 12px 20px;
      background: #111;
      border-top: 1px solid #222;
      display: flex;
      gap: 10px;
    }
    .input-area input {
      flex: 1;
      padding: 12px 16px;
      border-radius: 24px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #fff;
      font-size: 15px;
      outline: none;
      direction: rtl;
    }
    .input-area input:focus { border-color: #3b82f6; }
    .input-area button {
      padding: 12px 20px;
      border-radius: 24px;
      border: none;
      background: #3b82f6;
      color: #fff;
      font-size: 15px;
      cursor: pointer;
      font-weight: 600;
    }
    .input-area button:hover { background: #2563eb; }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ===== Teach Panel ===== */
    .teach-toggle {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #8b5cf6;
      background: rgba(139,92,246,0.1);
      color: #8b5cf6;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      font-weight: 600;
    }
    .teach-toggle:hover {
      background: rgba(139,92,246,0.2);
    }
    .teach-toggle.active {
      background: #8b5cf6;
      color: #fff;
    }
    .teach-panel {
      display: none;
      background: #111;
      border-top: 1px solid #222;
      padding: 16px 20px;
      max-height: 280px;
      overflow-y: auto;
    }
    .teach-panel.open { display: block; }
    .teach-panel h3 {
      font-size: 14px;
      margin-bottom: 10px;
      color: #ccc;
    }
    .teach-input-row {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
    }
    .teach-input-row input {
      flex: 1;
      padding: 10px 14px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #fff;
      font-size: 13px;
      outline: none;
      direction: rtl;
    }
    .teach-input-row input:focus { border-color: #8b5cf6; }
    .teach-input-row button {
      padding: 10px 16px;
      border-radius: 8px;
      border: none;
      background: #8b5cf6;
      color: #fff;
      font-size: 13px;
      cursor: pointer;
      font-weight: 600;
      white-space: nowrap;
    }
    .teach-input-row button:hover { background: #7c3aed; }
    .teach-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .teach-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: #1a1a1a;
      border: 1px solid #262626;
      border-radius: 8px;
      font-size: 13px;
      color: #ccc;
    }
    .teach-item .remove-btn {
      background: none;
      border: none;
      color: #666;
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
    }
    .teach-item .remove-btn:hover { color: #f87171; }
    .teach-empty {
      color: #555;
      font-size: 13px;
      text-align: center;
      padding: 12px;
    }
  </style>
</head>
<body>

  <!-- Phase 1: Setup Form -->
  <div class="setup-phase" id="setupPhase">
    <div class="setup-card">
      <h1>הדגמה חיה</h1>
      <div class="subtitle">הכנס את פרטי העסק של הלקוח ותראה לו איך הבוט עובד בזמן אמת</div>

      <div style="font-size:12px;color:#666;margin-bottom:10px;">מילוי מהיר:</div>
      <div class="presets">
        <button onclick="fillPreset('fitness')">מאמן כושר</button>
        <button onclick="fillPreset('beauty')">מכון יופי</button>
        <button onclick="fillPreset('consulting')">ייעוץ עסקי</button>
        <button onclick="fillPreset('realestate')">נדל&quot;ן</button>
      </div>

      <div class="form-group">
        <label>נישה / תחום <span class="required">*</span></label>
        <input type="text" id="demoNiche" placeholder='לדוגמה: מאמן כושר אישי, מעצבת פנים, יועץ עסקי'>
      </div>
      <div class="form-group">
        <label>שם העסק <span class="required">*</span></label>
        <input type="text" id="demoBusinessName" placeholder='לדוגמה: Fit With Danny'>
      </div>
      <div class="form-group">
        <label>שם הבעלים <span class="required">*</span></label>
        <input type="text" id="demoOwnerName" placeholder='לדוגמה: דני כהן'>
      </div>
      <div class="form-group">
        <label>שירותים <span class="required">*</span></label>
        <textarea id="demoServices" placeholder='לדוגמה: אימונים אישיים, תוכניות תזונה, ליווי אונליין'></textarea>
      </div>
      <div class="form-group">
        <label>לינק לקביעת פגישה</label>
        <input type="text" id="demoBookingLink" placeholder='לדוגמה: https://cal.com/your-link' dir="ltr">
      </div>
      <div class="form-error" id="formError">יש למלא את כל השדות המסומנים</div>
      <button class="start-btn" onclick="startDemo()">התחל הדגמה</button>
    </div>
  </div>

  <!-- Phase 2: Chat -->
  <div class="chat-phase" id="chatPhase">
    <div class="demo-header">
      <div class="demo-header-right">
        <div class="avatar" id="demoAvatar"></div>
        <div>
          <h1 id="demoHeaderName"></h1>
          <div class="subtitle">הדגמה חיה</div>
        </div>
      </div>
      <div class="demo-header-left">
        <button class="teach-toggle" id="teachToggle" onclick="toggleTeach()">למד את הבוט</button>
        <button onclick="newConversation()">שיחה חדשה</button>
        <button onclick="changeBusiness()">החלף עסק</button>
      </div>
    </div>
    <div class="demo-info">
      <span id="demoInfoText"></span>
    </div>
    <div class="teach-panel" id="teachPanel">
      <h3>למד את הבוט - הוסף הנחיות והערות</h3>
      <div class="teach-input-row">
        <input type="text" id="teachInput" placeholder='לדוגמה: אל תשתמש בסימני קריאה, תדבר יותר חם...' onkeydown="if(event.key==='Enter')addTeaching()">
        <button onclick="addTeaching()">הוסף</button>
      </div>
      <div class="teach-list" id="teachList">
        <div class="teach-empty">עדיין אין הנחיות - הוסף הנחיה והבוט ישתפר בזמן אמת</div>
      </div>
    </div>
    <div class="messages" id="messages">
      <div class="message system">התחל שיחה - תדבר כאילו אתה לקוח פוטנציאלי שפונה בהודעה</div>
    </div>
    <div class="typing" id="typing">...מקליד/ה</div>
    <div class="input-area">
      <input type="text" id="messageInput" placeholder="...כתוב הודעה כלקוח">
      <button id="sendBtn" onclick="sendMessage()">שלח</button>
    </div>
  </div>

  <script>
    let demoUserId = 'demo-' + Date.now();
    let demoContext = null;
    let demoTeachings = [];

    const presets = {
      fitness: {
        niche: 'מאמן כושר אישי',
        businessName: 'FitPro Studio',
        ownerName: 'דני כהן',
        services: 'אימונים אישיים, תוכניות תזונה מותאמות, ליווי אונליין, אימוני קבוצות',
      },
      beauty: {
        niche: 'מכון יופי וטיפוח',
        businessName: 'Beauty Lab',
        ownerName: 'מיכל לוי',
        services: 'טיפולי פנים, לייזר, מניקור פדיקור, איפור לאירועים',
      },
      consulting: {
        niche: 'ייעוץ עסקי',
        businessName: 'BizGrowth',
        ownerName: 'אורי שלום',
        services: 'ייעוץ אסטרטגי, ליווי עסקי, בניית תוכנית עסקית, קואצינג למנהלים',
      },
      realestate: {
        niche: 'נדל"ן',
        businessName: 'HomeFinder',
        ownerName: 'יוסי אברהם',
        services: 'מכירת דירות, השכרה, ייעוץ נדל"ן, שיווק נכסים',
      },
    };

    function fillPreset(type) {
      const p = presets[type];
      if (!p) return;
      document.getElementById('demoNiche').value = p.niche;
      document.getElementById('demoBusinessName').value = p.businessName;
      document.getElementById('demoOwnerName').value = p.ownerName;
      document.getElementById('demoServices').value = p.services;
    }

    function startDemo() {
      const niche = document.getElementById('demoNiche').value.trim();
      const businessName = document.getElementById('demoBusinessName').value.trim();
      const ownerName = document.getElementById('demoOwnerName').value.trim();
      const services = document.getElementById('demoServices').value.trim();
      const bookingLink = document.getElementById('demoBookingLink').value.trim();

      if (!niche || !businessName || !ownerName || !services) {
        document.getElementById('formError').style.display = 'block';
        return;
      }
      document.getElementById('formError').style.display = 'none';

      demoContext = {
        businessType: niche,
        name: businessName,
        ownerName: ownerName,
        services: services,
        bookingInstructions: bookingLink || 'לקביעת שיחת היכרות: https://cal.com/your-link',
        demoMode: true,
        demoTeachings: demoTeachings,
      };

      // Update chat header
      document.getElementById('demoHeaderName').textContent = businessName;
      document.getElementById('demoAvatar').textContent = businessName.charAt(0);
      document.getElementById('demoInfoText').textContent = niche + ' | ' + services;

      // Switch to chat phase
      document.getElementById('setupPhase').style.display = 'none';
      document.getElementById('chatPhase').style.display = 'flex';
      document.getElementById('messageInput').focus();
    }

    async function sendMessage() {
      const input = document.getElementById('messageInput');
      const msg = input.value.trim();
      if (!msg) return;

      addMessage(msg, 'user');
      input.value = '';
      document.getElementById('sendBtn').disabled = true;
      document.getElementById('typing').classList.add('active');

      try {
        const res = await fetch('/api/demo/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenantId: 'test',
            userId: demoUserId,
            message: msg,
            testContext: demoContext,
          }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        addMessage(data.reply, 'assistant');
      } catch (err) {
        addMessage('שגיאה: ' + err.message, 'system');
      } finally {
        document.getElementById('typing').classList.remove('active');
        document.getElementById('sendBtn').disabled = false;
        input.focus();
      }
    }

    async function newConversation() {
      try {
        await fetch('/api/demo/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: 'test', userId: demoUserId }),
        });
      } catch(e) {}
      demoUserId = 'demo-' + Date.now();
      document.getElementById('messages').innerHTML =
        '<div class="message system">שיחה חדשה התחילה - תדבר כאילו אתה לקוח חדש</div>';
    }

    async function changeBusiness() {
      try {
        await fetch('/api/demo/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: 'test', userId: demoUserId }),
        });
      } catch(e) {}
      demoUserId = 'demo-' + Date.now();
      demoContext = null;
      demoTeachings = [];
      renderTeachings();
      document.getElementById('teachPanel').classList.remove('open');
      document.getElementById('teachToggle').classList.remove('active');
      document.getElementById('chatPhase').style.display = 'none';
      document.getElementById('setupPhase').style.display = 'flex';
      document.getElementById('messages').innerHTML =
        '<div class="message system">התחל שיחה - תדבר כאילו אתה לקוח פוטנציאלי שפונה בהודעה</div>';
    }

    function toggleTeach() {
      const panel = document.getElementById('teachPanel');
      const btn = document.getElementById('teachToggle');
      panel.classList.toggle('open');
      btn.classList.toggle('active');
      if (panel.classList.contains('open')) {
        document.getElementById('teachInput').focus();
      }
    }

    function addTeaching() {
      const input = document.getElementById('teachInput');
      const text = input.value.trim();
      if (!text) return;
      demoTeachings.push(text);
      input.value = '';
      renderTeachings();
      if (demoContext) {
        demoContext.demoTeachings = demoTeachings;
      }
    }

    function removeTeaching(index) {
      demoTeachings.splice(index, 1);
      renderTeachings();
      if (demoContext) {
        demoContext.demoTeachings = demoTeachings;
      }
    }

    function renderTeachings() {
      const list = document.getElementById('teachList');
      if (demoTeachings.length === 0) {
        list.innerHTML = '<div class="teach-empty">עדיין אין הנחיות - הוסף הנחיה והבוט ישתפר בזמן אמת</div>';
        return;
      }
      list.innerHTML = demoTeachings.map(function(t, i) {
        var safe = t.replace(/&/g, '&amp;').replace(/[<]/g, '&lt;').replace(/>/g, '&gt;');
        return '<div class="teach-item"><span>' + safe + '<\/span><button class="remove-btn" onclick="removeTeaching(' + i + ')">\u2715<\/button><\/div>';
      }).join('');
    }

    function addMessage(text, role) {
      const div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      document.getElementById('messages').appendChild(div);
      const messagesEl = document.getElementById('messages');
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    document.getElementById('messageInput').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  </script>
</body>
</html>`;
}
