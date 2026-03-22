import { escapeHtml } from './utils.js';

export function getDashboardHTML(tenant, saved = false, justConnected = false) {
  const isConnected = !!tenant.igAccessToken;
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>הגדרות - ${escapeHtml(tenant.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #0a0a0a;
      color: #fff;
      min-height: 100vh;
      padding: 40px 20px;
    }
    .container { max-width: 600px; margin: 0 auto; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    .subtitle { color: #888; margin-bottom: 32px; }
    .alert {
      padding: 16px;
      border-radius: 10px;
      margin-bottom: 24px;
      text-align: center;
      font-size: 15px;
    }
    .alert-success { background: #052e16; border: 1px solid #166534; color: #4ade80; }
    .alert-connected {
      background: linear-gradient(135deg, #052e1620, #16653420);
      border: 1px solid #166534;
      color: #4ade80;
      padding: 24px;
      font-size: 18px;
    }
    .alert-connected .big { font-size: 36px; margin-bottom: 8px; }
    form { display: flex; flex-direction: column; gap: 20px; }
    label { display: flex; flex-direction: column; gap: 6px; font-size: 14px; color: #aaa; }
    input, textarea {
      padding: 12px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      color: #fff;
      font-size: 15px;
      direction: rtl;
    }
    textarea { min-height: 80px; resize: vertical; }
    input:focus, textarea:focus { outline: none; border-color: #3b82f6; }
    button {
      padding: 14px;
      background: #3b82f6;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
    }
    button:hover { background: #2563eb; }
    .status {
      margin-top: 24px;
      padding: 16px;
      background: #111;
      border: 1px solid #222;
      border-radius: 8px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .status-dot {
      width: 10px; height: 10px; border-radius: 50%;
    }
    .status-dot.active { background: #4ade80; }
    .status-dot.inactive { background: #666; }
    .connect-link {
      display: inline-block;
      margin-top: 8px;
      padding: 10px 20px;
      background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045);
      color: #fff;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>הגדרות הבוט - ${escapeHtml(tenant.name)}</h1>
    <div class="subtitle">הגדר/י את הפרטים כדי שהבוט ידבר בשם העסק שלך</div>
    ${justConnected ? '<div class="alert alert-connected"><div class="big">🎉</div>האינסטגרם מחובר! הבוט שלך פעיל עכשיו.<br>כל DM שיגיע - הבוט יענה אוטומטית.</div>' : ''}
    ${saved ? '<div class="alert alert-success">✓ ההגדרות נשמרו בהצלחה!</div>' : ''}
    <form method="POST">
      <label>שם העסק <input name="name" value="${escapeHtml(tenant.name)}" required></label>
      <label>תחום העסק <input name="businessType" value="${escapeHtml(tenant.businessType)}" placeholder="ייעוץ עסקי, קוסמטיקה, כושר..."></label>
      <label>שירותים <input name="services" value="${escapeHtml(tenant.services)}" placeholder="פרט/י את השירותים"></label>
      <label>שם הבעלים <input name="ownerName" value="${escapeHtml(tenant.ownerName)}" placeholder="השם שהבוט ישתמש בו"></label>
      <label>שעות עבודה <input name="workingHours" value="${escapeHtml(tenant.workingHours)}" placeholder="א-ה 9:00-18:00"></label>
      <label>הוראות לקביעת פגישה <textarea name="bookingInstructions" placeholder="לינק או הוראות שהבוט ישלח כשליד מוכן">${escapeHtml(tenant.bookingInstructions)}</textarea></label>
      <button type="submit">💾 שמור הגדרות</button>
    </form>
    <div class="status">
      <span class="status-dot ${isConnected ? 'active' : 'inactive'}"></span>
      <span>Instagram: ${isConnected ? 'מחובר ✓' : 'לא מחובר'}</span>
      ${!isConnected ? '<a href="/connect/' + tenant.id + '" class="connect-link">חבר אינסטגרם</a>' : ''}
    </div>
  </div>
</body>
</html>`;
}
