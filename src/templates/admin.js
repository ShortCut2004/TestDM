import { escapeHtml } from './utils.js';

export function getAdminHTML(tenants, allLeads, secret) {
  const active = tenants.filter(t => t.igAccessToken);
  const pending = tenants.filter(t => !t.igAccessToken);

  const tenantCards = tenants.map(t => {
    const leads = allLeads[t.id] || [];
    const isActive = !!t.igAccessToken;
    const hotLeads = leads.filter(l => l.qualificationScore >= 7).length;
    return '<div class="customer-card">' +
      '<div class="card-top">' +
      '<div class="card-info">' +
      '<div class="card-name">' + escapeHtml(t.name || 'No name') + '</div>' +
      '<div class="card-ig">' + escapeHtml(t.instagram || '') + (t.phone ? ' | ' + escapeHtml(t.phone) : '') + '</div>' +
      '</div>' +
      '<span class="badge ' + (isActive ? 'badge-active' : 'badge-pending') + '">' + (isActive ? 'LIVE' : 'PENDING') + '</span>' +
      '</div>' +
      '<div class="card-stats">' +
      '<div class="card-stat"><span class="stat-num">' + leads.length + '</span><span class="stat-label">Leads</span></div>' +
      '<div class="card-stat"><span class="stat-num">' + hotLeads + '</span><span class="stat-label">Hot (7+)</span></div>' +
      '</div>' +
      '<div class="card-meta">Created: ' + new Date(t.createdAt).toLocaleDateString('he-IL') + '</div>' +
      '<div class="card-actions">' +
      '<a href="/dashboard/' + t.id + '" class="action-btn">Dashboard</a>' +
      '<a href="/api/tenants/' + t.id + '/leads?secret=' + secret + '" class="action-btn" target="_blank">Leads JSON</a>' +
      '</div>' +
      '</div>';
  }).join('');

  return '<!DOCTYPE html>' +
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>Admin Panel</title>' +
    '<style>' +
    '*{margin:0;padding:0;box-sizing:border-box}' +
    'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0a0a;color:#fff;min-height:100vh;padding:20px}' +
    '.container{max-width:900px;margin:0 auto}' +
    'h1{font-size:28px;margin-bottom:8px}' +
    '.subtitle{color:#888;margin-bottom:24px}' +
    '.top-stats{display:flex;gap:16px;margin-bottom:32px}' +
    '.top-stat{background:#111;border:1px solid #222;border-radius:12px;padding:20px;flex:1;text-align:center}' +
    '.top-stat .num{font-size:36px;font-weight:700}' +
    '.top-stat .num.green{color:#4ade80}' +
    '.top-stat .num.blue{color:#3b82f6}' +
    '.top-stat .num.yellow{color:#facc15}' +
    '.top-stat .label{font-size:13px;color:#888;margin-top:4px}' +
    '.actions-bar{display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap}' +
    '.actions-bar a{padding:10px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px}' +
    '.actions-bar a.secondary{background:#222;border:1px solid #333}' +
    '.customer-card{background:#111;border:1px solid #222;border-radius:12px;padding:20px;margin-bottom:16px}' +
    '.card-top{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}' +
    '.card-name{font-size:18px;font-weight:600}' +
    '.card-ig{font-size:13px;color:#888;margin-top:2px}' +
    '.badge{padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700}' +
    '.badge-active{background:#052e16;color:#4ade80;border:1px solid #166534}' +
    '.badge-pending{background:#1a1a0a;color:#facc15;border:1px solid #854d0e}' +
    '.card-stats{display:flex;gap:16px;margin-bottom:12px}' +
    '.card-stat{background:#0a0a0a;border-radius:8px;padding:8px 16px;text-align:center}' +
    '.stat-num{font-size:18px;font-weight:700;color:#3b82f6;display:block}' +
    '.stat-label{font-size:11px;color:#666}' +
    '.card-url{margin-bottom:8px}' +
    '.url-label{font-size:12px;color:#666;margin-bottom:4px}' +
    '.url-box{display:flex;gap:8px;align-items:center;background:#0a0a0a;border:1px solid #222;border-radius:8px;padding:8px 12px}' +
    '.url-box code{flex:1;font-size:13px;color:#4ade80;word-break:break-all}' +
    '.copy-btn{padding:4px 12px;background:#222;border:1px solid #333;color:#fff;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap}' +
    '.copy-btn:hover{background:#333}' +
    '.card-meta{font-size:11px;color:#555;margin-bottom:8px}' +
    '.card-actions{display:flex;gap:8px}' +
    '.action-btn{padding:6px 14px;background:#1a1a1a;border:1px solid #333;color:#aaa;border-radius:6px;text-decoration:none;font-size:13px}' +
    '.action-btn:hover{color:#fff;border-color:#555}' +
    '.empty{text-align:center;padding:40px;color:#555}' +
    '</style></head>' +
    '<body><div class="container">' +
    '<h1>Admin Panel</h1>' +
    '<div class="subtitle">Manage customers & monitor bots</div>' +
    '<div class="top-stats">' +
    '<div class="top-stat"><div class="num blue">' + tenants.length + '</div><div class="label">Total Customers</div></div>' +
    '<div class="top-stat"><div class="num green">' + active.length + '</div><div class="label">Live / Connected</div></div>' +
    '<div class="top-stat"><div class="num yellow">' + pending.length + '</div><div class="label">Pending Setup</div></div>' +
    '</div>' +
    '<div class="actions-bar">' +
    '<a href="/onboard">+ Add New Customer</a>' +
    '<a href="/teach" class="secondary">Teach AI</a>' +
    '<a href="/chat" class="secondary">Test Chat</a>' +
    '</div>' +
    (tenantCards || '<div class="empty">No customers yet. Share the onboard link to get started!</div>') +
    '</div>' +
    '<script></script>' +
    '</body></html>';
}
