export function getLoginHTML(error = '') {
  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>התחברות | Typer</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#fff;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:20px}
.card{background:#111;border:1px solid #222;border-radius:16px;padding:40px;max-width:420px;width:100%}
.logo{text-align:center;margin-bottom:24px;font-size:28px;font-weight:700}

h2{text-align:center;margin-bottom:8px;font-size:22px}
.subtitle{text-align:center;color:#888;margin-bottom:24px;font-size:14px}
label{display:block;color:#ccc;font-size:14px;margin-bottom:6px;margin-top:16px}
input{width:100%;padding:12px 14px;background:#1a1a1a;border:1px solid #333;border-radius:10px;color:#fff;font-size:15px;outline:none;transition:border 0.2s}
input:focus{border-color:#3b82f6}
button{width:100%;padding:14px;background:#3b82f6;color:#fff;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;margin-top:24px;transition:background 0.2s}
button:hover{background:#2563eb}
.error{background:#7f1d1d33;border:1px solid #dc2626;color:#fca5a5;padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:14px;text-align:center}
.link{text-align:center;margin-top:20px;color:#888;font-size:14px}
.link a{color:#3b82f6;text-decoration:none}
.link a:hover{text-decoration:underline}
</style></head><body>
<div class="card">
<div class="logo">Typer</div>
<h2>התחברות</h2>
<p class="subtitle">היכנס לדשבורד שלך</p>
${error ? `<div class="error">${error}</div>` : ''}
<form method="POST" action="/login">
<label>אימייל</label>
<input type="email" name="email" required placeholder="your@email.com" dir="ltr">
<label>סיסמה</label>
<input type="password" name="password" required placeholder="הסיסמה שלך">
<button type="submit">התחבר</button>
</form>
<p class="link">אין לך חשבון? <a href="/signup">הרשמה</a></p>
</div></body></html>`;
}
