export function getSignupHTML(error = '') {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>הרשמה | Typer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.card{background:#111;border:1px solid #222;border-radius:16px;padding:40px;max-width:480px;width:100%}
.logo{text-align:center;margin-bottom:24px;font-size:28px;font-weight:700}

h2{text-align:center;margin-bottom:8px;font-size:22px}
.subtitle{text-align:center;color:#888;margin-bottom:24px;font-size:14px}
label{display:block;color:#ccc;font-size:14px;margin-bottom:6px;margin-top:16px}
.required::after{content:" *";color:#f87171}
input,textarea{width:100%;padding:12px 14px;background:#1a1a1a;border:1px solid #333;border-radius:10px;color:#fff;font-size:15px;outline:none;transition:border 0.2s;font-family:inherit}
input:focus,textarea:focus{border-color:#3b82f6}
textarea{resize:vertical;min-height:60px}
button{width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;margin-top:24px;transition:background 0.2s}
button:hover{background:#2563eb}
.error{background:#7f1d1d33;border:1px solid #dc2626;color:#fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:14px;text-align:center}
.link{text-align:center;margin-top:20px;color:#888;font-size:14px}
.link a{color:#3b82f6;text-decoration:none}
.link a:hover{text-decoration:underline}
.divider{border:none;border-top:1px solid #222;margin:20px 0 4px}
.section-label{color:#666;font-size:12px;margin-top:4px}
</style></head><body>
<div class="card">
<div class="logo">Typer</div>
<h2>הרשמה</h2>
<p class="subtitle">צור חשבון והתחל לבנות את הבוט שלך</p>
${error ? `<div class="error">${error}</div>` : ''}
<form method="POST" action="/signup">
<label class="required">אימייל</label>
<input type="email" name="email" required placeholder="your@email.com" dir="ltr">
<label class="required">סיסמה</label>
<input type="password" name="password" required placeholder="לפחות 6 תווים" minlength="6">
<hr class="divider"><p class="section-label">פרטי העסק</p>
<label class="required">שם העסק</label>
<input type="text" name="name" required placeholder='לדוגמה: "הסטודיו של דנה"'>
<label class="required">שם הבעלים</label>
<input type="text" name="ownerName" required placeholder="השם שלך">
<label>תחום</label>
<input type="text" name="businessType" placeholder='לדוגמה: "אימון כושר", "עיצוב שיער"'>
<label>שירותים</label>
<textarea name="services" rows="2" placeholder='לדוגמה: "אימון אישי, תוכנית תזונה, ייעוץ"'></textarea>
<label>טלפון / וואטסאפ</label>
<input type="text" name="phone" placeholder="050-1234567" dir="ltr">
<label>חשבון אינסטגרם</label>
<input type="text" name="instagram" placeholder="@your_business" dir="ltr">
<label>לינק לקביעת פגישה</label>
<input type="text" name="bookingInstructions" placeholder="https://cal.com/your-link" dir="ltr">
<button type="submit">צור חשבון וחבר אינסטגרם</button>
</form>
<p class="link">יש לך חשבון? <a href="/login">התחברות</a></p>
</div></body></html>`;
}
