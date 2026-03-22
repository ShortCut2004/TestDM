import { escapeHtml } from './utils.js';

export function getWizardHTML(tenant) {
  const t = tenant;
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הגדרת הבוט - Typer</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #fff;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    /* ===== Phase Container ===== */
    .phase {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .phase.centered {
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    /* ===== Welcome Card ===== */
    .welcome-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      padding: 32px;
      width: 100%;
      max-width: 480px;
      text-align: center;
    }
    .welcome-card .logo {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 20px;
      color: #888;
    }
    .welcome-card h1 {
      font-size: 22px;
      font-weight: 700;
      margin-bottom: 8px;
      line-height: 1.4;
    }
    .welcome-card .subtitle {
      color: #888;
      font-size: 14px;
      margin-bottom: 24px;
      line-height: 1.6;
    }
    .biz-badge {
      display: inline-block;
      padding: 6px 16px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 20px;
      font-size: 14px;
      color: #ccc;
      margin-bottom: 24px;
    }
    .gender-section {
      margin-bottom: 24px;
      text-align: right;
    }
    .gender-section label {
      display: block;
      font-size: 13px;
      color: #aaa;
      margin-bottom: 10px;
    }
    .gender-options {
      display: flex;
      gap: 10px;
    }
    .gender-btn {
      flex: 1;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #ccc;
      font-size: 14px;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .gender-btn:hover { border-color: #3b82f6; color: #fff; }
    .gender-btn.active {
      border-color: #3b82f6;
      background: rgba(59,130,246,0.1);
      color: #3b82f6;
      font-weight: 600;
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
      transition: opacity 0.15s;
      font-family: inherit;
    }
    .start-btn:hover { opacity: 0.9; }
    .time-note {
      color: #555;
      font-size: 12px;
      margin-top: 12px;
    }

    /* ===== Chat Phase (shared for strategy + roleplay) ===== */
    .chat-header {
      padding: 14px 20px;
      background: linear-gradient(135deg, #1a1a2e, #16213e);
      border-bottom: 1px solid #222;
    }
    .header-top {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 10px;
    }
    .header-top .avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }
    .header-top h2 {
      font-size: 15px;
      font-weight: 600;
    }
    .exit-btn {
      margin-right: auto;
      background: none;
      border: none;
      color: #666;
      font-size: 13px;
      cursor: pointer;
      padding: 4px 8px;
      font-family: inherit;
    }
    .exit-btn:hover { color: #f87171; }
    .scenario-label {
      font-size: 12px;
      color: #8b5cf6;
    }
    .progress-bar {
      height: 4px;
      background: #222;
      border-radius: 2px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #8b5cf6);
      border-radius: 2px;
      transition: width 0.4s ease;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .message {
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 18px;
      font-size: 15px;
      line-height: 1.5;
      word-wrap: break-word;
      white-space: pre-wrap;
      animation: fadeIn 0.2s ease;
    }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    .message.assistant {
      background: #1a1a2e;
      align-self: flex-start;
      border-bottom-right-radius: 6px;
    }
    .message.user {
      background: #3b82f6;
      align-self: flex-end;
      border-bottom-left-radius: 6px;
    }
    .message.system {
      align-self: center;
      background: transparent;
      color: #555;
      font-size: 12px;
      padding: 4px;
    }
    .typing {
      color: #555;
      font-size: 12px;
      padding: 8px 20px;
      display: none;
    }
    .typing.active { display: block; }
    .input-area {
      display: flex;
      gap: 8px;
      padding: 12px 16px;
      border-top: 1px solid #222;
      background: #0a0a0a;
    }
    .input-area input {
      flex: 1;
      padding: 10px 16px;
      border-radius: 24px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #fff;
      font-size: 15px;
      font-family: inherit;
      outline: none;
    }
    .input-area input:focus { border-color: #3b82f6; }
    .input-area button {
      padding: 10px 20px;
      border-radius: 24px;
      border: none;
      background: #3b82f6;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
      font-weight: 600;
    }
    .input-area button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ===== Extracting ===== */
    .extracting-card {
      text-align: center;
    }
    .extracting-card h2 {
      font-size: 18px;
      margin-bottom: 8px;
    }
    .extracting-card p {
      color: #888;
      font-size: 14px;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #333;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 20px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ===== Review ===== */
    .review-container {
      flex: 1;
      overflow-y: auto;
      padding: 24px 20px 40px;
    }
    .review-container h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .review-container .subtitle {
      color: #888;
      font-size: 13px;
      margin-bottom: 24px;
    }
    .section-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 16px;
    }
    .section-card h2 {
      font-size: 15px;
      font-weight: 600;
      margin-bottom: 16px;
      color: #ccc;
    }
    .profile-field {
      margin-bottom: 14px;
    }
    .profile-field label {
      display: block;
      font-size: 12px;
      color: #888;
      margin-bottom: 6px;
    }
    .profile-field input,
    .profile-field textarea,
    .profile-field select {
      width: 100%;
      padding: 8px 12px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
      direction: rtl;
    }
    .profile-field textarea {
      min-height: 60px;
      resize: vertical;
    }
    .profile-field select {
      appearance: auto;
    }
    .next-btn {
      width: 100%;
      padding: 14px;
      border-radius: 10px;
      border: none;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      margin-bottom: 12px;
    }
    .next-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .kb-entry {
      background: #1a1a1a;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      position: relative;
      font-size: 13px;
    }
    .kb-cat { color: #8b5cf6; font-size: 11px; margin-bottom: 4px; }
    .kb-title { font-weight: 600; margin-bottom: 4px; }
    .kb-content { color: #aaa; line-height: 1.4; }
    .kb-remove {
      position: absolute;
      top: 8px;
      left: 8px;
      background: none;
      border: none;
      color: #555;
      cursor: pointer;
      font-size: 14px;
    }
    .kb-remove:hover { color: #f87171; }

    /* ===== Strategy Review Fields ===== */
    .strategy-question {
      background: #1a1a1a;
      border: 1px solid #262626;
      border-radius: 8px;
      padding: 10px 12px;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .strategy-question .q-label { color: #3b82f6; font-size: 11px; margin-bottom: 4px; }
    .strategy-question .q-prompt { color: #ccc; }
    .strategy-qa { color: #aaa; font-size: 13px; line-height: 1.5; }
    .speed-badges { display: flex; gap: 8px; margin-bottom: 12px; }
    .speed-badge {
      flex: 1;
      padding: 10px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #888;
      font-size: 13px;
      text-align: center;
      cursor: pointer;
      transition: all 0.15s;
      font-family: inherit;
    }
    .speed-badge.active {
      border-color: #3b82f6;
      background: rgba(59,130,246,0.1);
      color: #3b82f6;
      font-weight: 600;
    }

    /* ===== Quick-fire ===== */
    .qf-container {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .qf-card {
      background: #111;
      border: 1px solid #222;
      border-radius: 16px;
      padding: 32px 24px;
      width: 100%;
      max-width: 440px;
      text-align: center;
      animation: fadeIn 0.3s ease;
    }
    .qf-number {
      color: #555;
      font-size: 12px;
      margin-bottom: 8px;
    }
    .qf-icon {
      font-size: 36px;
      margin-bottom: 12px;
    }
    .qf-situation {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      line-height: 1.5;
    }
    .qf-example {
      color: #888;
      font-size: 14px;
      line-height: 1.5;
      direction: rtl;
    }

    /* ===== Test ===== */
    .test-container {
      flex: 1;
      overflow-y: auto;
      padding: 24px 20px;
    }
    .test-container h1 {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .test-container .subtitle {
      color: #888;
      font-size: 13px;
      margin-bottom: 20px;
    }
    .test-chat-box {
      background: #111;
      border: 1px solid #222;
      border-radius: 12px;
      overflow: hidden;
      margin-bottom: 20px;
    }
    .test-messages {
      min-height: 180px;
      max-height: 300px;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .test-typing {
      color: #555;
      font-size: 12px;
      padding: 4px 16px;
      display: none;
    }
    .test-typing.active { display: block; }
    .test-input-area {
      display: flex;
      gap: 8px;
      padding: 12px;
      border-top: 1px solid #222;
    }
    .test-input-area input {
      flex: 1;
      padding: 10px 14px;
      border-radius: 20px;
      border: 1px solid #333;
      background: #1a1a1a;
      color: #fff;
      font-size: 14px;
      font-family: inherit;
      outline: none;
    }
    .test-input-area button {
      padding: 8px 16px;
      border-radius: 20px;
      border: none;
      background: #3b82f6;
      color: #fff;
      font-size: 14px;
      cursor: pointer;
      font-family: inherit;
    }
    .test-input-area button:disabled { opacity: 0.5; }
    .go-live-section {
      text-align: center;
      padding: 20px;
      opacity: 0;
      transition: opacity 0.3s;
    }
    .go-live-section.visible { opacity: 1; }
    .success-badge {
      display: inline-block;
      padding: 6px 16px;
      background: rgba(34,197,94,0.1);
      border: 1px solid #22c55e;
      border-radius: 20px;
      color: #22c55e;
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 12px;
    }
    .go-live-btn {
      width: 100%;
      padding: 14px;
      border-radius: 10px;
      border: none;
      background: #22c55e;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      transition: background 0.15s;
    }
    .go-live-btn:hover { background: #16a34a; }
    .go-live-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .skip-to-dashboard-btn {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.15);
      background: transparent;
      color: #6B6B6B;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
      transition: all 0.2s;
    }
    .skip-to-dashboard-btn:hover { background: #f5f3f0; color: #000; }
  </style>
</head>
<body>

  <!-- Phase 1: Welcome -->
  <div class="phase centered" id="phase-welcome">
    <div class="welcome-card">
      <div class="logo">Typer</div>
      <h1>בוא נגדיר את הבוט שלך</h1>
      <p class="subtitle">ספר לנו מה אתה צריך, ואנחנו נעשה את השאר.<br>בסוף — בוט שעובד בדיוק כמו שאתה רוצה.</p>
      <div class="biz-badge">${escapeHtml(t.name || '')}${t.businessType ? ' | ' + escapeHtml(t.businessType) : ''}</div>
      <div class="gender-section">
        <label>איך אתה מדבר?</label>
        <div class="gender-options">
          <button class="gender-btn active" onclick="selectGender('male', this)">אני מדבר בזכר</button>
          <button class="gender-btn" onclick="selectGender('female', this)">אני מדברת בנקבה</button>
        </div>
      </div>
      <button class="start-btn" onclick="startWizard()">יאללה, מתחילים</button>
      <p class="time-note">לוקח 3-5 דקות</p>
    </div>
  </div>

  <!-- Phase 2: Freeflow Chat -->
  <div class="phase" id="phase-freeflow" style="display:none">
    <div class="chat-header">
      <div class="header-top">
        <div class="avatar">💬</div>
        <div>
          <h2 id="freeflowTitle">ספר לי מה אתה צריך</h2>
          <div class="scenario-label" id="freeflowSubtitle">תאר איך אתה רוצה שהבוט יעבוד</div>
        </div>
        <button class="exit-btn" onclick="exitWizard()">יציאה</button>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="freeflowProgress" style="width:10%"></div>
      </div>
    </div>
    <div class="messages" id="freeflowMessages"></div>
    <div class="typing" id="freeflowTyping">...Typer מקליד</div>
    <div class="input-area" id="freeflowInputArea">
      <input type="text" id="freeflowInput" placeholder="ספר מה אתה צריך...">
      <button id="freeflowSendBtn" onclick="sendFreeflowMessage()">שלח</button>
    </div>
  </div>

  <!-- Phase 3: Response Training (Role-play) — OPTIONAL -->
  <div class="phase" id="phase-chat" style="display:none">
    <div class="chat-header">
      <div class="header-top">
        <div class="avatar">👤</div>
        <div>
          <h2 id="phaseTitle">אימון תגובות (אופציונלי)</h2>
          <div class="scenario-label">תרחיש <span id="scenarioNum">1</span></div>
        </div>
        <button class="exit-btn" onclick="skipRoleplay()" style="background:#262626;border:1px solid #444;color:#ccc;padding:6px 16px;border-radius:8px;font-size:13px;cursor:pointer;font-family:inherit;">דלג לסקירה</button>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" id="progressFill" style="width:40%"></div>
      </div>
    </div>
    <div class="messages" id="messages"></div>
    <div class="typing" id="typing">...הלקוח מקליד</div>
    <div class="input-area" id="inputArea">
      <input type="text" id="messageInput" placeholder="ענה כמו שהיית עונה באמת...">
      <button id="sendBtn" onclick="sendMessage()">שלח</button>
    </div>
    <div class="input-area" id="nextScenarioBar" style="display:none;justify-content:center;gap:10px;">
      <button id="nextScenarioBtn" onclick="triggerNextScenario()" style="flex:1;padding:12px 20px;border-radius:24px;border:none;background:#262626;color:#fff;font-size:14px;cursor:pointer;font-family:inherit;">תרחיש הבא</button>
      <button id="nextPhaseBtn" onclick="finishTraining()" style="padding:12px 20px;border-radius:24px;border:none;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:#fff;font-size:14px;cursor:pointer;font-weight:600;font-family:inherit;display:none;">סיום ומעבר לניתוח</button>
    </div>
  </div>

  <!-- Phase 4: Extracting -->
  <div class="phase centered" id="phase-extracting" style="display:none">
    <div class="extracting-card">
      <div class="spinner"></div>
      <h2 id="extractingTitle">מנתח את הסגנון שלך...</h2>
      <p id="extractingSubtitle">רגע, לומד איך אתה מדבר ומוכר</p>
    </div>
  </div>

  <!-- Phase 5: Review -->
  <div class="phase" id="phase-review" style="display:none">
    <div class="review-container">
      <h1>הבוט שלך מוכן</h1>
      <p class="subtitle">בדוק שהכל נכון. אפשר לערוך.</p>

      <!-- Bot Goal Section -->
      <div class="section-card">
        <h2>מטרת הבוט</h2>
        <div class="profile-field">
          <label>מה הבוט עושה?</label>
          <div class="speed-badges" style="gap:8px">
            <button class="speed-badge" data-goal="book_calls" onclick="setGoal('book_calls', this)">קובע שיחות<br><span style="font-size:11px;color:#666">שואל ומציע פגישה</span></button>
            <button class="speed-badge" data-goal="warm_up" onclick="setGoal('warm_up', this)">מחמם לידים<br><span style="font-size:11px;color:#666">בונה קשר, בלי מכירה</span></button>
            <button class="speed-badge" data-goal="answer_questions" onclick="setGoal('answer_questions', this)">עונה על שאלות<br><span style="font-size:11px;color:#666">מומחה מקצועי</span></button>
          </div>
        </div>
        <div class="profile-field">
          <label>מקסימום הודעות בוט (ריק = ברירת מחדל)</label>
          <input id="rv-max-messages" type="number" min="2" max="20" placeholder="למשל: 3" style="width:100px">
        </div>
        <div class="profile-field">
          <label>רמת דחיפה</label>
          <div class="speed-badges" style="gap:8px">
            <button class="speed-badge" data-push="soft" onclick="setPush('soft', this)">רכה<br><span style="font-size:11px;color:#666">עדין, לא לוחץ</span></button>
            <button class="speed-badge" data-push="normal" onclick="setPush('normal', this)">רגילה<br><span style="font-size:11px;color:#666">מאוזן</span></button>
            <button class="speed-badge" data-push="aggressive" onclick="setPush('aggressive', this)">אגרסיבית<br><span style="font-size:11px;color:#666">סוגר מהר</span></button>
          </div>
        </div>
        <div class="profile-field">
          <label>הוראות מיוחדות (חופשי)</label>
          <textarea id="rv-custom-instructions" rows="3" placeholder="למשל: אל תציע מחיר, תמיד תציע שיחה בסוף, אם מישהו שואל על X תגיד Y..."></textarea>
        </div>
      </div>

      <!-- Strategy Section -->
      <div class="section-card">
        <h2>אסטרטגיית שיחה</h2>
        <div class="profile-field">
          <label>מהירות סגירה</label>
          <div class="speed-badges">
            <button class="speed-badge" data-speed="quick" onclick="setSpeed('quick', this)">מהיר<br><span style="font-size:11px;color:#666">שאלה אחת</span></button>
            <button class="speed-badge active" data-speed="balanced" onclick="setSpeed('balanced', this)">מאוזן<br><span style="font-size:11px;color:#666">2-3 שאלות</span></button>
            <button class="speed-badge" data-speed="deep" onclick="setSpeed('deep', this)">מעמיק<br><span style="font-size:11px;color:#666">4+ שאלות</span></button>
          </div>
        </div>
        <div class="profile-field">
          <label>שאלות לפני סגירה</label>
          <div id="rv-strategy-questions"></div>
        </div>
        <div class="profile-field">
          <label>תשובות מוכנות</label>
          <div id="rv-strategy-qa"></div>
        </div>
        <div class="profile-field">
          <label>דפוסי תגובה</label>
          <div id="rv-handling-patterns"></div>
        </div>
      </div>

      <!-- Voice Profile Section -->
      <div class="section-card">
        <h2>🎤 פרופיל קולי</h2>
        <div class="profile-field">
          <label>ברכה</label>
          <input id="rv-greeting" type="text" placeholder="איך אתה פותח שיחה?">
        </div>
        <div class="profile-field">
          <label>אנרגיה</label>
          <select id="rv-energy">
            <option value="warm">חם ונעים</option>
            <option value="chill">רגוע ושלו</option>
            <option value="high-energy">אנרגטי ונלהב</option>
            <option value="professional">מקצועי ורציני</option>
          </select>
        </div>
        <div class="profile-field">
          <label>ביטויים אופייניים</label>
          <textarea id="rv-phrases" placeholder="ביטויים שאתה תמיד משתמש בהם"></textarea>
        </div>
        <div class="profile-field">
          <label>אימוג'י</label>
          <select id="rv-emoji">
            <option value="sometimes">פה ושם</option>
            <option value="never">אף פעם</option>
            <option value="a-lot">הרבה</option>
          </select>
        </div>
        <div class="profile-field">
          <label>אורך הודעות</label>
          <select id="rv-length">
            <option value="normal">2-3 משפטים</option>
            <option value="super-short">סופר קצר — משפט אחד</option>
            <option value="detailed">מפורט כשצריך</option>
          </select>
        </div>
        <div class="profile-field">
          <label>הומור</label>
          <select id="rv-humor">
            <option value="light">קליל וידידותי</option>
            <option value="none">רציני, בלי הומור</option>
            <option value="dry">יבש וסרקסטי</option>
            <option value="memes">סגנון מימים</option>
          </select>
        </div>
        <div class="profile-field">
          <label>פנייה לבנים</label>
          <input id="rv-male-terms" type="text" placeholder="אחי, בוס, גבר...">
        </div>
        <div class="profile-field">
          <label>פנייה לבנות</label>
          <input id="rv-female-terms" type="text" placeholder="מלכה, נשמה, יפה...">
        </div>
        <div class="profile-field">
          <label>דברים שהבוט לא יגיד</label>
          <input id="rv-avoid" type="text" placeholder="ביטויים שצריך להימנע מהם">
        </div>
        <div class="profile-field">
          <label>סלנג וסגנון ייחודי</label>
          <textarea id="rv-slang" placeholder="מילים, סלנג, דפוסים ייחודיים שלך"></textarea>
        </div>
      </div>

      <div class="section-card">
        <h2>דוגמאות מהשיחה</h2>
        <p style="color:#888;font-size:12px;margin-bottom:12px;">דוגמאות שהבוט ילמד מהן</p>
        <div id="rv-examples" style="font-size:13px;color:#ccc;line-height:1.6;white-space:pre-wrap;background:#1a1a1a;padding:12px;border-radius:8px;border:1px solid #262626;max-height:200px;overflow-y:auto;direction:rtl;"></div>
      </div>

      <div class="section-card">
        <h2>ידע שנאסף</h2>
        <div id="kb-entries-list"></div>
      </div>

      <button class="next-btn" onclick="goToTest()">נראה טוב, בוא נבדוק</button>
      <button onclick="window.location.href='/app'" style="width:100%;padding:12px;border-radius:10px;border:1px solid #333;background:transparent;color:#888;font-size:14px;cursor:pointer;margin-bottom:40px;font-family:inherit;">חזרה לדשבורד</button>
    </div>
  </div>

  <!-- Phase 6: Test + Go Live -->
  <div class="phase" id="phase-test" style="display:none">
    <div class="test-container">
      <h1>בדיקה אחרונה</h1>
      <p class="subtitle">שלח הודעה כאילו אתה לקוח חדש — ותראה איך הבוט עונה</p>

      <div class="test-chat-box">
        <div class="test-messages" id="testMessages">
          <div class="message system">כתוב הודעה כלקוח חדש</div>
        </div>
        <div class="test-typing" id="testTyping">...הבוט מקליד</div>
        <div class="test-input-area">
          <input type="text" id="testInput" placeholder="היי ראיתי את הפוסט שלכם...">
          <button id="testSendBtn" onclick="sendTestMessage()">שלח</button>
        </div>
      </div>

      <div class="go-live-section" id="goLiveSection">
        <div class="success-badge">הבוט מוכן!</div>
        <p>ככה הבוט ידבר עם הלקוחות שלך באינסטגרם</p>
        <button class="go-live-btn" id="goLiveBtn" onclick="goLive()">הפעל את הבוט</button>
        <button class="skip-to-dashboard-btn" onclick="goToDashboard()">לדשבורד בלי להפעיל</button>
      </div>
    </div>
  </div>

  <script>
    // ===== State =====
    var gender = 'male';
    var freeflowHistory = [];     // Freeflow onboarding conversation
    var freeflowExchanges = 0;
    var extractedConfig = null;   // Full extracted config from freeflow
    var extractedStrategy = null; // Extracted strategy object
    var conversationHistory = []; // Role-play conversation (for voice extraction)
    var coveredScenarios = [];
    var scenarioCount = 0;
    var lastScenarioMessages = [];
    var waitingForReply = false;
    var voiceProfile = null;
    var knowledgeEntries = [];
    var testUserId = 'wizard-test-' + Date.now();
    var selectedGoals = ['book_calls'];  // Array — multi-select
    var selectedPush = 'normal';

    // ===== Phase Navigation =====
    function showPhase(id) {
      document.querySelectorAll('.phase').forEach(function(p) { p.style.display = 'none'; });
      var el = document.getElementById('phase-' + id);
      if (el) {
        el.style.display = 'flex';
      }
    }

    function selectGender(g, btn) {
      gender = g;
      document.querySelectorAll('.gender-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }

    function exitWizard() {
      if (conversationHistory.length > 4 || freeflowHistory.length > 2) {
        if (!confirm('יש לך תשובות שעדיין לא נשמרו. לצאת בכל זאת?')) return;
      }
      window.location.href = '/app';
    }

    // ===== Helper: Add message to chat =====
    function addMsg(text, role, containerId) {
      var container = document.getElementById(containerId || 'messages');
      var div = document.createElement('div');
      div.className = 'message ' + role;
      div.textContent = text;
      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    // ===== Phase 1: Welcome → Start =====
    function applyGenderTexts() {
      var f = gender === 'female';
      // Freeflow phase
      document.getElementById('freeflowTitle').textContent = f ? 'ספרי לי מה את צריכה' : 'ספר לי מה אתה צריך';
      document.getElementById('freeflowSubtitle').textContent = f ? 'תארי איך את רוצה שהבוט יעבוד' : 'תאר איך אתה רוצה שהבוט יעבוד';
      document.getElementById('freeflowInput').placeholder = f ? 'ספרי מה את צריכה...' : 'ספר מה אתה צריך...';
      // Role-play phase
      document.getElementById('messageInput').placeholder = f ? 'עני כמו שהיית עונה באמת...' : 'ענה כמו שהיית עונה באמת...';
    }

    function startWizard() {
      applyGenderTexts();
      showPhase('freeflow');
      startFreeflow();
    }

    // ===== Phase 2: Freeflow Chat =====
    async function startFreeflow() {
      document.getElementById('freeflowTyping').classList.add('active');

      try {
        var res = await fetch('/api/app/wizard-freeflow-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: '__start__',
            conversationHistory: [],
            gender: gender,
          }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        addMsg(data.reply, 'assistant', 'freeflowMessages');
        freeflowHistory.push({ role: 'assistant', content: data.reply });
      } catch (err) {
        addMsg('שגיאה: ' + err.message, 'system', 'freeflowMessages');
      } finally {
        document.getElementById('freeflowTyping').classList.remove('active');
        document.getElementById('freeflowInput').focus();
      }
    }

    async function sendFreeflowMessage() {
      var input = document.getElementById('freeflowInput');
      var msg = input.value.trim();
      if (!msg) return;
      input.value = '';

      addMsg(msg, 'user', 'freeflowMessages');
      freeflowHistory.push({ role: 'user', content: msg });
      freeflowExchanges++;

      document.getElementById('freeflowSendBtn').disabled = true;
      document.getElementById('freeflowTyping').classList.add('active');

      // Update progress
      var progress = Math.min(10 + freeflowExchanges * 15, 90);
      document.getElementById('freeflowProgress').style.width = progress + '%';

      try {
        var res = await fetch('/api/app/wizard-freeflow-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            conversationHistory: freeflowHistory,
            gender: gender,
          }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        addMsg(data.reply, 'assistant', 'freeflowMessages');
        freeflowHistory.push({ role: 'assistant', content: data.reply });

        if (data.freeflowDone) {
          // Freeflow complete — extract config, move to optional role-play or review
          await extractFreeflowConfig();
        }
      } catch (err) {
        addMsg('שגיאה: ' + err.message, 'system', 'freeflowMessages');
      } finally {
        document.getElementById('freeflowTyping').classList.remove('active');
        document.getElementById('freeflowSendBtn').disabled = false;
        input.focus();
      }
    }

    async function extractFreeflowConfig() {
      showPhase('extracting');
      document.getElementById('extractingTitle').textContent = 'מנתח את מה שאמרת...';
      document.getElementById('extractingSubtitle').textContent = 'רגע, בונה את הבוט שלך';

      try {
        var res = await fetch('/api/app/wizard-freeflow-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationHistory: freeflowHistory }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        extractedConfig = data.config;
        extractedStrategy = data.config.strategy || null;
        voiceProfile = {
          voiceEnergy: data.config.voiceEnergy,
          voiceEmoji: data.config.voiceEmoji,
          voiceLength: data.config.voiceLength,
          voiceHumor: data.config.voiceHumor,
          voiceGreeting: data.config.voiceGreeting,
          voicePhrases: data.config.voicePhrases,
          voiceAvoid: data.config.voiceAvoid,
        };
        knowledgeEntries = data.config.knowledgeEntries || [];
        // Support single value or array from extraction
        var extractedGoal = data.config.botGoal || 'book_calls';
        selectedGoals = Array.isArray(extractedGoal) ? extractedGoal : [extractedGoal];
        selectedPush = data.config.ctaPushLevel || 'normal';

        // Offer optional role-play or go straight to review
        populateReview();
        showPhase('chat');
        requestNewScenario();
      } catch (err) {
        alert('שגיאה בניתוח: ' + err.message);
        showPhase('freeflow');
      }
    }

    function skipRoleplay() {
      populateReview();
      showPhase('review');
    }

    // ===== Bot Goal & Push Level helpers =====
    function setGoal(goal, btn) {
      var idx = selectedGoals.indexOf(goal);
      if (idx !== -1) {
        // Don't allow deselecting the last one
        if (selectedGoals.length <= 1) return;
        selectedGoals.splice(idx, 1);
        btn.classList.remove('active');
      } else {
        selectedGoals.push(goal);
        btn.classList.add('active');
      }
    }

    function setPush(push, btn) {
      selectedPush = push;
      document.querySelectorAll('[data-push]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }

    // ===== Phase 3: Response Training (Role-play) =====
    function showInputBar() {
      document.getElementById('inputArea').style.display = 'flex';
      document.getElementById('nextScenarioBar').style.display = 'none';
      document.getElementById('messageInput').focus();
    }

    function showNextBar() {
      document.getElementById('inputArea').style.display = 'none';
      document.getElementById('nextScenarioBar').style.display = 'flex';
      var npBtn = document.getElementById('nextPhaseBtn');
      if (scenarioCount >= 3) {
        npBtn.style.display = '';
      } else {
        npBtn.style.display = 'none';
      }
    }

    async function requestNewScenario() {
      document.getElementById('typing').classList.add('active');
      lastScenarioMessages = [];

      // Update progress (40-70%)
      var progress = 40 + scenarioCount * 8;
      document.getElementById('progressFill').style.width = Math.min(progress, 70) + '%';
      document.getElementById('scenarioNum').textContent = scenarioCount + 1;

      try {
        var res = await fetch('/api/app/wizard-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: scenarioCount === 0 ? '__start__' : '__new_scenario__',
            conversationHistory: conversationHistory,
            gender: gender,
            currentPhase: 1,
            coveredScenarios: coveredScenarios,
            lastScenarioMessages: [],
          }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        addMsg(data.reply, 'assistant');
        conversationHistory.push({ role: 'assistant', content: data.reply });
        lastScenarioMessages = [{ role: 'assistant', content: data.reply }];
        if (data.coveredScenarios) coveredScenarios = data.coveredScenarios;

        waitingForReply = true;
        showInputBar();
      } catch (err) {
        addMsg('שגיאה: ' + err.message, 'system');
      } finally {
        document.getElementById('typing').classList.remove('active');
      }
    }

    async function sendOwnerReply(msg) {
      addMsg(msg, 'user');
      conversationHistory.push({ role: 'user', content: msg });

      document.getElementById('sendBtn').disabled = true;
      document.getElementById('typing').classList.add('active');

      try {
        var res = await fetch('/api/app/wizard-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: msg,
            conversationHistory: conversationHistory,
            gender: gender,
            currentPhase: 1,
            coveredScenarios: coveredScenarios,
            lastScenarioMessages: lastScenarioMessages,
          }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        addMsg(data.reply, 'assistant');
        conversationHistory.push({ role: 'assistant', content: data.reply });
        if (data.coveredScenarios) coveredScenarios = data.coveredScenarios;

        scenarioCount++;
        waitingForReply = false;
        showNextBar();
      } catch (err) {
        addMsg('שגיאה: ' + err.message, 'system');
      } finally {
        document.getElementById('typing').classList.remove('active');
        document.getElementById('sendBtn').disabled = false;
      }
    }

    function triggerNextScenario() {
      addMsg('— לקוח/ה חדש/ה —', 'system');
      showInputBar();
      requestNewScenario();
    }

    async function sendMessage() {
      var input = document.getElementById('messageInput');
      var msg = input.value.trim();
      if (!msg) return;
      input.value = '';
      await sendOwnerReply(msg);
    }

    async function finishTraining() {
      startRoleplayExtraction();
    }

    // ===== Phase 4: Role-play Extraction (enhances freeflow config with voice DNA) =====
    async function startRoleplayExtraction() {
      showPhase('extracting');
      document.getElementById('extractingTitle').textContent = 'מנתח את הסגנון שלך...';
      document.getElementById('extractingSubtitle').textContent = 'רגע, לומד איך אתה מדבר';

      try {
        var res = await fetch('/api/app/wizard-extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationHistory: conversationHistory }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        // Merge role-play voice extraction with freeflow voice (role-play takes priority for voice fields)
        var rpVoice = data.voiceProfile || {};
        voiceProfile = Object.assign({}, voiceProfile || {}, rpVoice);
        // Append new KB entries from role-play
        var rpKB = data.knowledgeEntries || [];
        if (rpKB.length > 0) {
          knowledgeEntries = knowledgeEntries.concat(rpKB);
        }
        populateReview();
        showPhase('review');
      } catch (err) {
        alert('שגיאה בניתוח: ' + err.message);
        showPhase('chat');
      }
    }

    // ===== Phase 5: Review =====
    var energyMap = { 'רגוע': 'chill', 'חם': 'warm', 'אנרגטי': 'high-energy', 'מקצועי': 'professional' };
    var emojiMap = { 'אף פעם': 'never', 'פה ושם': 'sometimes', 'הרבה': 'a-lot' };
    var lengthMap = { 'קצר': 'super-short', 'רגיל': 'normal', 'מפורט': 'detailed' };
    var humorMap = { 'אין': 'none', 'קליל': 'light', 'יבש': 'dry', 'מימים': 'memes' };

    function mapVal(val, map, fallback) {
      if (!val) return fallback;
      if (map[val]) return map[val];
      var values = Object.values(map);
      if (values.indexOf(val) !== -1) return val;
      return fallback;
    }

    function setSpeed(speed, btn) {
      if (!extractedStrategy) extractedStrategy = {};
      extractedStrategy.speed = speed;
      document.querySelectorAll('[data-speed]').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
    }

    function populateReview() {
      // Bot Goal section (multi-select)
      document.querySelectorAll('[data-goal]').forEach(function(b) {
        b.classList.toggle('active', selectedGoals.indexOf(b.dataset.goal) !== -1);
      });
      document.querySelectorAll('[data-push]').forEach(function(b) {
        b.classList.toggle('active', b.dataset.push === selectedPush);
      });
      var maxMsgEl = document.getElementById('rv-max-messages');
      if (extractedConfig && extractedConfig.maxBotMessages) {
        maxMsgEl.value = extractedConfig.maxBotMessages;
      }
      var customEl = document.getElementById('rv-custom-instructions');
      if (extractedConfig && extractedConfig.customFlowInstructions) {
        customEl.value = extractedConfig.customFlowInstructions;
      }

      // Strategy section
      if (extractedStrategy) {
        // Speed
        document.querySelectorAll('[data-speed]').forEach(function(b) {
          b.classList.toggle('active', b.dataset.speed === (extractedStrategy.speed || 'balanced'));
        });

        // Questions
        var qContainer = document.getElementById('rv-strategy-questions');
        var questions = extractedStrategy.questions || [];
        if (questions.length > 0) {
          qContainer.innerHTML = questions.map(function(q, i) {
            var safe = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
            return '<div class="strategy-question">' +
              '<div class="q-label">' + safe(q.label) + (q.required ? ' (חובה)' : '') + '</div>' +
              '<div class="q-prompt">"' + safe(q.prompt) + '"</div>' +
              '</div>';
          }).join('');
        } else {
          qContainer.innerHTML = '<p style="color:#555;font-size:13px;">לא נמצאו שאלות ספציפיות</p>';
        }

        // Common Q&A
        var qaContainer = document.getElementById('rv-strategy-qa');
        var commonQA = extractedStrategy.commonQA || [];
        if (commonQA.length > 0) {
          qaContainer.innerHTML = commonQA.map(function(qa) {
            var safe = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
            return '<div class="strategy-qa" style="margin-bottom:8px">' +
              '<strong>ש:</strong> ' + safe(qa.q) + '<br>' +
              '<strong>ת:</strong> ' + safe(qa.a) +
              '</div>';
          }).join('');
        } else {
          qaContainer.innerHTML = '<p style="color:#555;font-size:13px;">לא נמצאו תשובות מוכנות</p>';
        }

        // Handling patterns
        var hpContainer = document.getElementById('rv-handling-patterns');
        var patterns = extractedStrategy.handlingPatterns || [];
        if (patterns.length > 0 && hpContainer) {
          hpContainer.innerHTML = patterns.map(function(hp) {
            var safe = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
            return '<div class="strategy-qa" style="margin-bottom:8px">' +
              '<strong>' + safe(hp.situation) + ':</strong> ' + safe(hp.response) +
              '</div>';
          }).join('');
        } else if (hpContainer) {
          hpContainer.innerHTML = '<p style="color:#555;font-size:13px;">לא הוגדרו דפוסי תגובה</p>';
        }
      }

      // Voice profile section
      var vp = voiceProfile;
      document.getElementById('rv-greeting').value = vp.voiceGreeting || vp.greeting || '';
      document.getElementById('rv-energy').value = mapVal(vp.voiceEnergy || vp.energy, energyMap, 'warm');
      document.getElementById('rv-phrases').value = vp.voicePhrases || vp.phrases || '';
      document.getElementById('rv-emoji').value = mapVal(vp.voiceEmoji || vp.emoji || vp.emoji_usage, emojiMap, 'sometimes');
      document.getElementById('rv-length').value = mapVal(vp.voiceLength || vp.length || vp.response_length, lengthMap, 'normal');
      document.getElementById('rv-humor').value = mapVal(vp.voiceHumor || vp.humor, humorMap, 'light');
      document.getElementById('rv-male-terms').value = vp.voicePhrasesMale || vp.phrasesMale || vp.gender_terms_male || '';
      document.getElementById('rv-female-terms').value = vp.voicePhrasesFemale || vp.phrasesFemale || vp.gender_terms_female || '';
      document.getElementById('rv-avoid').value = vp.voiceAvoid || vp.avoid || vp.avoid_phrases || '';
      document.getElementById('rv-slang').value = vp.slangWords || '';

      var exEl = document.getElementById('rv-examples');
      exEl.textContent = vp.voiceExamples || 'לא נמצאו דוגמאות';

      renderKBEntries();
    }

    function renderKBEntries() {
      var list = document.getElementById('kb-entries-list');
      if (!knowledgeEntries.length) {
        list.innerHTML = '<p style="color:#555;font-size:13px;text-align:center;padding:12px;">לא נמצא ידע ספציפי. אפשר להוסיף אחר כך מהדשבורד.</p>';
        return;
      }
      var catLabels = { faq: 'שאלות נפוצות', objections: 'התנגדויות', sop: 'תהליך מכירה', rules: 'כללים', corrections: 'תיקונים', tone: 'סגנון', general: 'כללי' };
      list.innerHTML = knowledgeEntries.map(function(entry, i) {
        var safe = function(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); };
        return '<div class="kb-entry">' +
          '<button class="kb-remove" onclick="removeKB(' + i + ')">\\u2715</button>' +
          '<div class="kb-cat">' + safe(catLabels[entry.category] || entry.category) + '</div>' +
          '<div class="kb-title">' + safe(entry.title) + '</div>' +
          '<div class="kb-content">' + safe(entry.content) + '</div>' +
          '</div>';
      }).join('');
    }

    function removeKB(index) {
      knowledgeEntries.splice(index, 1);
      renderKBEntries();
    }

    // ===== Phase 6: Test + Go Live =====
    async function goToTest() {
      var profile = {
        voiceGreeting: document.getElementById('rv-greeting').value,
        voiceEnergy: document.getElementById('rv-energy').value,
        voicePhrases: document.getElementById('rv-phrases').value,
        voiceEmoji: document.getElementById('rv-emoji').value,
        voiceLength: document.getElementById('rv-length').value,
        voiceHumor: document.getElementById('rv-humor').value,
        voicePhrasesMale: document.getElementById('rv-male-terms').value,
        voicePhrasesFemale: document.getElementById('rv-female-terms').value,
        voiceAvoid: document.getElementById('rv-avoid').value,
        slangWords: document.getElementById('rv-slang').value,
        voiceExamples: voiceProfile ? (voiceProfile.voiceExamples || '') : '',
      };
      voiceProfile = profile;

      // Save settings + strategy (but don't mark wizard complete yet)
      try {
        var maxMsg = document.getElementById('rv-max-messages').value;
        var saveBody = {
          voiceGreeting: profile.voiceGreeting,
          voiceEnergy: profile.voiceEnergy,
          voicePhrases: profile.voicePhrases,
          voiceEmoji: profile.voiceEmoji,
          voiceLength: profile.voiceLength,
          voiceHumor: profile.voiceHumor,
          voicePhrasesMale: profile.voicePhrasesMale,
          voicePhrasesFemale: profile.voicePhrasesFemale,
          voiceAvoid: profile.voiceAvoid,
          slangWords: profile.slangWords,
          voiceExamples: profile.voiceExamples,
          botGender: gender,
          botGoal: selectedGoals.join(','),
          maxBotMessages: maxMsg ? parseInt(maxMsg) : null,
          customFlowInstructions: document.getElementById('rv-custom-instructions').value || '',
          ctaPushLevel: selectedPush,
        };

        if (extractedStrategy) {
          saveBody.conversationStrategy = extractedStrategy;
        }

        await fetch('/api/app/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(saveBody),
        });

        // Save KB entries
        for (var i = 0; i < knowledgeEntries.length; i++) {
          var entry = knowledgeEntries[i];
          if (entry.content && entry.content.trim()) {
            await fetch('/api/app/knowledge', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                category: entry.category || 'general',
                title: entry.title || '',
                content: entry.content.trim(),
              }),
            });
          }
        }
      } catch (err) {
        console.error('Save error:', err);
      }

      showPhase('test');
      document.getElementById('testInput').focus();
    }

    async function sendTestMessage() {
      var input = document.getElementById('testInput');
      var msg = input.value.trim();
      if (!msg) return;
      input.value = '';

      addMsg(msg, 'user', 'testMessages');
      document.getElementById('testSendBtn').disabled = true;
      document.getElementById('testTyping').classList.add('active');

      try {
        var res = await fetch('/api/app/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, userId: testUserId }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);
        addMsg(data.reply, 'assistant', 'testMessages');

        document.getElementById('goLiveSection').classList.add('visible');
      } catch (err) {
        addMsg('שגיאה: ' + err.message, 'system', 'testMessages');
      } finally {
        document.getElementById('testTyping').classList.remove('active');
        document.getElementById('testSendBtn').disabled = false;
        input.focus();
      }
    }

    function goToDashboard() {
      // Save settings but don't activate the bot (wizardCompleted stays false)
      window.location.href = '/app';
    }

    async function goLive() {
      var btn = document.getElementById('goLiveBtn');
      btn.disabled = true;
      btn.textContent = 'מפעיל...';

      try {
        var maxMsg = document.getElementById('rv-max-messages').value;
        var res = await fetch('/api/app/wizard-complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            voiceProfile: voiceProfile,
            knowledgeEntries: knowledgeEntries,
            botGender: gender,
            conversationStrategy: extractedStrategy || null,
            botGoal: selectedGoals.join(','),
            maxBotMessages: maxMsg ? parseInt(maxMsg) : null,
            customFlowInstructions: document.getElementById('rv-custom-instructions').value || '',
            ctaPushLevel: selectedPush,
          }),
        });
        var data = await res.json();
        if (data.error) throw new Error(data.error);

        window.location.href = '/app?wizard=complete';
      } catch (err) {
        alert('שגיאה: ' + err.message);
        btn.disabled = false;
        btn.textContent = 'הפעל את הבוט';
      }
    }

    // ===== Event Listeners =====
    document.getElementById('freeflowInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendFreeflowMessage();
      }
    });
    document.getElementById('messageInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.getElementById('testInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendTestMessage();
      }
    });
  </script>
</body>
</html>`;
}
