import { escapeHtml } from './utils.js';

export function getMasterAdminHTML(tenants, users, allLeads, totalLeads, usageData = null) {
  const active = tenants.filter(t => t.igAccessToken);
  const pending = tenants.filter(t => !t.igAccessToken);

  // MRR calculation: sum monthly_payment of tenants with paymentStatus === 'paid'
  const mrr = tenants.reduce((sum, t) => {
    if (t.paymentStatus === 'paid' && t.monthlyPayment > 0) return sum + t.monthlyPayment;
    return sum;
  }, 0);
  const payingCount = tenants.filter(t => t.paymentStatus === 'paid' && t.monthlyPayment > 0).length;

  // Map tenantId -> user emails
  const tenantEmailMap = {};
  for (const u of users) {
    if (u.tenantId) {
      if (!tenantEmailMap[u.tenantId]) tenantEmailMap[u.tenantId] = [];
      tenantEmailMap[u.tenantId].push(u.email);
    }
  }

  const tenantRows = tenants.map(t => {
    const leads = allLeads[t.id] || [];
    const hotLeads = leads.filter(l => l.qualificationScore >= 7).length;
    const hasIG = !!t.igAccessToken;
    const botOn = !!t.botActive;
    const isLive = hasIG;
    const tenantEmails = tenantEmailMap[t.id] || [];
    const created = t.createdAt
      ? new Date(t.createdAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })
      : '--';

    const igDisplay = t.instagram
      ? `<span class="ig-handle">${escapeHtml(t.instagram)}</span>`
      : '<span class="muted">--</span>';

    const tenantUsage = usageData?.byTenant?.find(u => u.tenantId === t.id);
    const tenantCost = tenantUsage?.costUsd || 0;
    const tenantCalls = tenantUsage?.callCount || 0;

    const paymentAmount = t.monthlyPayment || 0;
    const paymentStatus = t.paymentStatus || 'unpaid';
    const statusColors = { paid: 'green', unpaid: 'red', trial: 'yellow', cancelled: 'gray' };
    const statusLabels = { paid: 'Paid', unpaid: 'Unpaid', trial: 'Trial', cancelled: 'Cancelled' };
    const billingModel = t.billingModel || 'flat';
    const pricePerConv = t.pricePerConversation || 0;
    const trialEnds = t.trialEndsAt ? new Date(t.trialEndsAt).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' }) : '--';
    const polarSub = t.polarSubscriptionId || '';

    return `
      <tr class="${isLive ? '' : 'row-pending'}" id="row-${t.id}">
        <td>
          <div class="tenant-name">${escapeHtml(t.name || '--')}</div>
          <div class="tenant-sub">${escapeHtml(t.ownerName || '')}</div>
          <div class="tenant-sub email">${tenantEmails.map(e => escapeHtml(e)).join(', ') || '--'}</div>
        </td>
        <td>
          ${igDisplay}
          <div style="margin-top:3px">
            <span class="dot ${hasIG ? 'green' : 'red'}"></span>
            <span class="conn-label">${hasIG ? 'Connected' : 'Not connected'}</span>
          </div>
        </td>
        <td>
          <span class="dot ${botOn ? 'green' : 'red'}" id="dot-${t.id}"></span>
          <span id="bot-label-${t.id}">${botOn ? 'Active' : 'Inactive'}</span>
        </td>
        <td>
          <span class="lead-count">${leads.length}</span>
          ${hotLeads > 0 ? '<span class="hot-badge">' + hotLeads + ' hot</span>' : ''}
        </td>
        <td class="cost-cell" id="cost-${t.id}">
          <div class="cost-amount">$${tenantCost.toFixed(2)}</div>
          <div class="cost-calls">${tenantCalls} calls</div>
        </td>
        <td class="payment-cell" id="payment-${t.id}">
          <div class="payment-amount">
            <span class="shekel">$</span>
            <input type="number" class="payment-input" id="pay-amt-${t.id}" value="${paymentAmount}" min="0" step="1" onchange="savePayment('${escapeHtml(t.id)}')" />
          </div>
          <select class="payment-select ${statusColors[paymentStatus] || 'red'}" id="pay-status-${t.id}" onchange="savePayment('${escapeHtml(t.id)}')">
            <option value="unpaid" ${paymentStatus === 'unpaid' ? 'selected' : ''}>Unpaid</option>
            <option value="paid" ${paymentStatus === 'paid' ? 'selected' : ''}>Paid</option>
            <option value="trial" ${paymentStatus === 'trial' ? 'selected' : ''}>Trial</option>
            <option value="cancelled" ${paymentStatus === 'cancelled' ? 'selected' : ''}>Cancelled</option>
          </select>
          <div style="margin-top:4px;display:flex;gap:4px;align-items:center">
            <select class="payment-select" style="font-size:10px;padding:2px 4px" id="bill-model-${t.id}" onchange="savePayment('${escapeHtml(t.id)}')">
              <option value="flat" ${billingModel === 'flat' ? 'selected' : ''}>Flat</option>
              <option value="per_conversation" ${billingModel === 'per_conversation' ? 'selected' : ''}>Per Conv</option>
            </select>
            <input type="number" style="width:50px;font-size:10px;padding:2px 4px;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:4px;color:#fff" id="price-conv-${t.id}" value="${pricePerConv}" min="0" step="0.5" placeholder="$/conv" title="Price per conversation" onchange="savePayment('${escapeHtml(t.id)}')" />
          </div>
          <div style="margin-top:4px;display:flex;gap:4px;align-items:center">
            <span style="font-size:10px;color:#666">Trial: ${trialEnds}</span>
            <button style="font-size:9px;padding:1px 6px;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:4px;color:#888;cursor:pointer" onclick="extendTrial('${escapeHtml(t.id)}')">+14d</button>
          </div>
          ${polarSub ? '<div style="font-size:9px;color:#555;margin-top:2px" title="' + escapeHtml(polarSub) + '">Polar: ' + escapeHtml(polarSub.slice(0, 8)) + '...</div>' : ''}
        </td>
        <td>
          <span class="status-badge ${isLive ? 'live' : 'pending'}">${isLive ? 'LIVE' : 'PENDING'}</span>
          <div class="meta-date">${created}</div>
        </td>
        <td class="actions-cell">
          <button class="action-btn manage-btn" onclick="impersonate('${escapeHtml(t.id)}')">Manage</button>
          <button class="action-btn voice-btn" onclick="openVoiceModal('${escapeHtml(t.id)}', '${escapeHtml(t.name || t.id)}')">Voice</button>
          <button class="action-btn ${botOn ? 'bot-off-btn' : 'bot-on-btn'}" onclick="toggleBot('${escapeHtml(t.id)}', ${!botOn}, this)">${botOn ? 'Turn Off' : 'Turn On'}</button>
          ${tenantEmails.map(e =>
            `<button class="action-btn logout-btn" onclick="forceLogout('${escapeHtml(e)}', this)">Logout</button>`
          ).join('')}
          <button class="action-btn delete-btn" onclick="deleteTenant('${escapeHtml(t.id)}', '${escapeHtml(t.name || t.id)}', ${leads.length})">Delete</button>
        </td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Master Admin | Typer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0C0C0C; color: #F0F0F0; min-height: 100vh; }

    .topbar { padding: 0 24px; height: 52px; background: #111; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 14px; }
    .topbar .logo { font-size: 18px; font-weight: 700; color: #fff; letter-spacing: -0.3px; }
    .topbar .badge { font-size: 10px; background: #fff; color: #000; padding: 2px 8px; border-radius: 10px; font-weight: 700; letter-spacing: 0.3px; text-transform: uppercase; }
    .topbar .spacer { flex: 1; }
    .topbar a { padding: 6px 14px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #888; border-radius: 8px; font-size: 13px; text-decoration: none; transition: all 0.15s; }
    .topbar a:hover { color: #F0F0F0; border-color: rgba(255,255,255,0.15); }

    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }

    .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 28px; }
    .stat-card { background: #111; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 16px; text-align: center; }
    .stat-value { font-size: 28px; font-weight: 700; margin-bottom: 4px; color: #F0F0F0; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 500; }
    .stat-value.blue { color: #60a5fa; }
    .stat-value.green { color: #22c55e; }
    .stat-value.yellow { color: #eab308; }
    .stat-value.purple { color: #a78bfa; }

    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #F0F0F0; letter-spacing: -0.2px; }

    .table-wrap { background: #111; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; overflow-x: auto; }
    .table-wrap::-webkit-scrollbar { height: 6px; }
    .table-wrap::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; table-layout: auto; min-width: 900px; }
    th { background: #141414; padding: 8px 10px; text-align: right; font-weight: 600; color: #666; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.06); white-space: nowrap; }
    td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: top; }
    tr:last-child td { border-bottom: none; }
    tr:hover { background: rgba(255,255,255,0.02); }
    tr.row-pending { opacity: 0.5; }

    .tenant-name { font-weight: 600; color: #F0F0F0; font-size: 14px; }
    .tenant-sub { font-size: 12px; color: #555; margin-top: 1px; }
    .tenant-sub.email { color: #888; }
    .ig-handle { color: #e1306c; font-weight: 500; font-size: 13px; }
    .conn-label { font-size: 12px; color: #888; }
    .meta-date { font-size: 11px; color: #555; margin-top: 3px; }
    .muted { color: #444; }

    .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }
    .dot.green { background: #22c55e; box-shadow: 0 0 4px #22c55e55; }
    .dot.red { background: #ef4444; box-shadow: 0 0 4px #ef444455; }

    .lead-count { font-weight: 600; }
    .hot-badge { background: #7c2d12; color: #fb923c; font-size: 11px; padding: 1px 6px; border-radius: 8px; margin-right: 4px; font-weight: 600; }

    .status-badge { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 10px; display: inline-block; }
    .status-badge.live { background: #14532d; color: #4ade80; }
    .status-badge.pending { background: #422006; color: #fbbf24; }

    .actions-cell { white-space: nowrap; }
    .action-btn { padding: 3px 8px; border: 1px solid transparent; border-radius: 5px; font-size: 11px; font-weight: 600; cursor: pointer; margin: 1px; transition: all 0.15s; white-space: nowrap; }
    .action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .logout-btn { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.15); }
    .logout-btn:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
    .bot-on-btn { background: rgba(34,197,94,0.1); color: #4ade80; border-color: rgba(34,197,94,0.15); }
    .bot-on-btn:hover:not(:disabled) { background: rgba(34,197,94,0.2); }
    .bot-off-btn { background: rgba(234,179,8,0.1); color: #fbbf24; border-color: rgba(234,179,8,0.15); }
    .bot-off-btn:hover:not(:disabled) { background: rgba(234,179,8,0.2); }
    .manage-btn { background: #fff; color: #000; border-color: #fff; }
    .manage-btn:hover:not(:disabled) { background: #e5e5e5; }
    .delete-btn { background: rgba(239,68,68,0.1); color: #f87171; border-color: rgba(239,68,68,0.15); }
    .delete-btn:hover:not(:disabled) { background: rgba(239,68,68,0.2); }
    .voice-btn { background: #1a1a1a; color: #ccc; border-color: rgba(255,255,255,0.08); }
    .voice-btn:hover:not(:disabled) { background: #222; color: #fff; }

    .cost-cell { text-align: center; min-width: 80px; }
    .cost-amount { font-weight: 600; color: #f87171; font-size: 14px; }
    .cost-calls { font-size: 11px; color: #666; margin-top: 2px; }
    .stat-sub { font-size: 11px; color: #666; margin-top: 2px; }

    .payment-cell { min-width: 110px; max-width: 160px; }
    .payment-amount { display: flex; align-items: center; gap: 2px; margin-bottom: 3px; }
    .shekel { color: #888; font-size: 13px; font-weight: 600; }
    .payment-input { width: 70px; background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #F0F0F0; font-size: 13px; padding: 4px 6px; text-align: right; font-family: inherit; }
    .payment-input:focus { outline: none; border-color: rgba(255,255,255,0.2); }
    .payment-select { background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; color: #F0F0F0; font-size: 11px; padding: 3px 6px; cursor: pointer; width: 100%; font-family: inherit; }
    .payment-select:focus { outline: none; border-color: rgba(255,255,255,0.2); }
    .payment-select.green { border-color: #22c55e44; color: #4ade80; }
    .payment-select.red { border-color: #ef444444; color: #f87171; }
    .payment-select.yellow { border-color: #eab30844; color: #fbbf24; }
    .payment-select.gray { border-color: #55555544; color: #888; }
    .mrr-card { border-color: rgba(34,197,94,0.15); }

    .toast { position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%); background: #22c55e; color: #000; padding: 10px 24px; border-radius: 10px; font-size: 14px; font-weight: 600; opacity: 0; transition: opacity 0.3s; pointer-events: none; z-index: 100; }
    .toast.show { opacity: 1; }

    .empty-state { text-align: center; color: #555; padding: 60px 20px; font-size: 15px; }

    /* Delete confirmation modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: none; align-items: center; justify-content: center; z-index: 200; }
    .modal-overlay.show { display: flex; }
    .modal { background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; padding: 28px; max-width: 400px; width: 90%; text-align: center; }
    .modal h3 { color: #f87171; margin-bottom: 12px; font-size: 18px; }
    .modal p { color: #aaa; font-size: 14px; line-height: 1.6; margin-bottom: 8px; }
    .modal .warn { color: #fbbf24; font-size: 13px; margin-bottom: 20px; }
    .modal-actions { display: flex; gap: 10px; justify-content: center; }
    .modal-actions button { padding: 10px 24px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; }
    .modal-cancel { background: #1a1a1a; color: #ccc; border: 1px solid rgba(255,255,255,0.08); }
    .modal-cancel:hover { background: #222; }
    .modal-confirm { background: #991b1b; color: #fff; }
    .modal-confirm:hover { background: #b91c1c; }

    @media (max-width: 800px) {
      .container { padding: 16px; }
      .stats-row { grid-template-columns: repeat(2, 1fr); }
      table, thead, tbody, th, td, tr { display: block; }
      thead { display: none; }
      tr { background: #111; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; margin-bottom: 10px; padding: 14px; }
      tr:hover { background: #111; }
      td { padding: 4px 0; border: none; display: flex; justify-content: space-between; align-items: center; }
      td::before { font-weight: 600; color: #888; font-size: 12px; margin-left: 12px; }
      td:nth-child(1)::before { content: ''; }
      td:nth-child(2)::before { content: 'Instagram'; }
      td:nth-child(3)::before { content: 'Bot'; }
      td:nth-child(4)::before { content: 'Leads'; }
      td:nth-child(5)::before { content: 'AI Cost'; }
      td:nth-child(6)::before { content: 'Payment'; }
      td:nth-child(7)::before { content: 'Status'; }
      td:nth-child(8)::before { content: 'Actions'; }
      .actions-cell { white-space: normal; display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
    }
  </style>
</head>
<body>
  <div class="topbar">
    <div class="logo">Typer</div>
    <span class="badge">Master Admin</span>
    <div class="spacer"></div>
    <a href="/app">Dashboard</a>
  </div>

  <div class="container">
    <div class="stats-row">
      <div class="stat-card">
        <div class="stat-value blue">${tenants.length}</div>
        <div class="stat-label">Total Tenants</div>
      </div>
      <div class="stat-card">
        <div class="stat-value green">${active.length}</div>
        <div class="stat-label">Live / Connected</div>
      </div>
      <div class="stat-card">
        <div class="stat-value yellow">${pending.length}</div>
        <div class="stat-label">Pending Setup</div>
      </div>
      <div class="stat-card">
        <div class="stat-value purple">${totalLeads}</div>
        <div class="stat-label">Total Leads</div>
      </div>
      <div class="stat-card">
        <div class="stat-value blue">${users.length}</div>
        <div class="stat-label">Registered Users</div>
      </div>
      <div class="stat-card mrr-card">
        <div class="stat-value green" id="mrr-value">₪${mrr.toLocaleString()}</div>
        <div class="stat-label">MRR (${payingCount} paying)</div>
      </div>
      <div class="stat-card" style="border-color:#ef444433">
        <div class="stat-value" style="color:#f87171" id="ai-cost-value">$${(usageData?.platform?.costUsd || 0).toFixed(2)}</div>
        <div class="stat-label">AI Cost (This Month)</div>
        <div class="stat-sub">${(usageData?.platform?.callCount || 0).toLocaleString()} calls</div>
      </div>
    </div>

    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
      <div class="section-title" style="margin-bottom:0">All Tenants</div>
      <select id="costPeriod" onchange="refreshCosts()" style="background:#141414;border:1px solid rgba(255,255,255,0.08);color:#fff;border-radius:6px;padding:4px 8px;font-size:12px">
        <option value="month">This Month</option>
        <option value="week">This Week</option>
        <option value="all">All Time</option>
      </select>
    </div>

    ${tenants.length > 0 ? `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Business</th>
            <th>Instagram</th>
            <th>Bot</th>
            <th>Leads</th>
            <th>AI Cost</th>
            <th>Payment</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${tenantRows}
        </tbody>
      </table>
    </div>
    ` : '<div class="empty-state">No tenants yet.</div>'}
  </div>

  <!-- Self-Learning: Golden Examples Approval Queue -->
  <div class="card" style="margin-top:24px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0;font-size:18px">Self-Learning</h2>
      <div style="display:flex;gap:8px">
        <select id="goldenFilter" style="background:#141414;color:#F0F0F0;border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:6px 12px;font-size:13px" onchange="loadGoldenExamples()">
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="">All</option>
        </select>
        <button class="action-btn" onclick="loadAnalytics()" style="padding:6px 14px;font-size:13px">Stats</button>
      </div>
    </div>
    <div id="goldenStats" style="display:none;margin-bottom:16px;padding:12px;background:#141414;border-radius:8px;font-size:13px;color:#ccc"></div>
    <div id="goldenList" style="font-size:13px;color:#999">Click to load golden examples.</div>
  </div>

  <div class="toast" id="toast"></div>

  <!-- Delete confirmation modal -->
  <div class="modal-overlay" id="deleteModal">
    <div class="modal">
      <h3>Delete Account</h3>
      <p id="deleteMsg"></p>
      <div class="warn" id="deleteWarn"></div>
      <div class="modal-actions">
        <button class="modal-cancel" onclick="closeDeleteModal()">Cancel</button>
        <button class="modal-confirm" id="deleteConfirmBtn">Delete</button>
      </div>
    </div>
  </div>

  <!-- Voice DNA import modal -->
  <div class="modal-overlay" id="voiceModal">
    <div class="modal" style="max-width:550px">
      <h3 style="color:#F0F0F0">Import Voice DNA</h3>
      <p id="voiceModalTenant" style="margin-bottom:12px"></p>
      <textarea id="voiceConversations" rows="10" placeholder="Paste DM conversations here... (plain text or Instagram JSON export)" style="width:100%;background:#141414;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#F0F0F0;font-size:13px;padding:12px;resize:vertical;font-family:inherit;line-height:1.5"></textarea>
      <div style="color:#888;font-size:12px;margin:8px 0 16px">Min 50 chars, max 30,000. Accepts plain text copy-paste or Instagram JSON export.</div>
      <div class="modal-actions">
        <button class="modal-cancel" onclick="closeVoiceModal()">Cancel</button>
        <button class="voice-btn action-btn" id="voiceImportBtn" style="padding:10px 24px;font-size:14px" onclick="submitVoiceImport()">Import</button>
      </div>
    </div>
  </div>

  <script>
    function showToast(msg, color) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background = color || '#22c55e';
      t.classList.add('show');
      setTimeout(() => t.classList.remove('show'), 2500);
    }

    async function forceLogout(email, btn) {
      if (!confirm('Force logout ' + email + '?')) return;
      btn.disabled = true;
      btn.textContent = '...';
      try {
        const res = await fetch('/master-admin/logout-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(email + ' logged out', '#22c55e');
          btn.textContent = 'Done';
        } else {
          showToast('Error: ' + (data.error || 'Unknown'), '#ef4444');
          btn.textContent = 'Logout';
          btn.disabled = false;
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
        btn.textContent = 'Logout';
        btn.disabled = false;
      }
    }

    async function toggleBot(tenantId, newState, btn) {
      btn.disabled = true;
      try {
        const res = await fetch('/master-admin/toggle-bot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, botActive: newState })
        });
        const data = await res.json();
        if (data.ok) {
          const dot = document.getElementById('dot-' + tenantId);
          const label = document.getElementById('bot-label-' + tenantId);
          if (newState) {
            dot.className = 'dot green';
            label.textContent = 'Active';
            btn.className = 'action-btn bot-off-btn';
            btn.textContent = 'Turn Off';
            btn.onclick = function() { toggleBot(tenantId, false, btn); };
          } else {
            dot.className = 'dot red';
            label.textContent = 'Inactive';
            btn.className = 'action-btn bot-on-btn';
            btn.textContent = 'Turn On';
            btn.onclick = function() { toggleBot(tenantId, true, btn); };
          }
          showToast('Bot ' + (newState ? 'activated' : 'deactivated'), newState ? '#22c55e' : '#eab308');
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
      }
      btn.disabled = false;
    }

    async function impersonate(tenantId) {
      try {
        const res = await fetch('/master-admin/impersonate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId })
        });
        const data = await res.json();
        if (data.ok) {
          window.location.href = '/app';
        } else {
          showToast('Error: ' + (data.error || 'Unknown'), '#ef4444');
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
      }
    }

    let pendingDeleteId = null;

    function deleteTenant(tenantId, name, leadCount) {
      pendingDeleteId = tenantId;
      document.getElementById('deleteMsg').textContent = 'Delete "' + name + '" and all their data?';
      document.getElementById('deleteWarn').textContent = leadCount > 0
        ? 'This will permanently delete ' + leadCount + ' leads, all conversations, and knowledge base entries.'
        : 'This will permanently delete the tenant and all associated data.';
      document.getElementById('deleteModal').classList.add('show');
    }

    function closeDeleteModal() {
      pendingDeleteId = null;
      document.getElementById('deleteModal').classList.remove('show');
    }

    document.getElementById('deleteConfirmBtn').onclick = async function() {
      if (!pendingDeleteId) return;
      const tenantId = pendingDeleteId;
      const btn = this;
      btn.disabled = true;
      btn.textContent = 'Deleting...';
      try {
        const res = await fetch('/master-admin/delete-tenant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId })
        });
        const data = await res.json();
        if (data.ok) {
          closeDeleteModal();
          const row = document.getElementById('row-' + tenantId);
          if (row) row.remove();
          showToast('Deleted successfully', '#22c55e');
        } else {
          showToast('Error: ' + (data.error || 'Unknown'), '#ef4444');
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
      }
      btn.disabled = false;
      btn.textContent = 'Delete';
    };

    // Close modal on overlay click
    document.getElementById('deleteModal').onclick = function(e) {
      if (e.target === this) closeDeleteModal();
    };

    // Payment management
    async function savePayment(tenantId) {
      const amtInput = document.getElementById('pay-amt-' + tenantId);
      const statusSelect = document.getElementById('pay-status-' + tenantId);
      const billModelSelect = document.getElementById('bill-model-' + tenantId);
      const priceConvInput = document.getElementById('price-conv-' + tenantId);
      const monthlyPayment = parseFloat(amtInput.value) || 0;
      const paymentStatus = statusSelect.value;
      const billingModel = billModelSelect ? billModelSelect.value : 'flat';
      const pricePerConversation = priceConvInput ? (parseFloat(priceConvInput.value) || 0) : 0;

      // Update select color
      statusSelect.className = 'payment-select ' + {paid:'green',unpaid:'red',trial:'yellow',cancelled:'gray'}[paymentStatus];

      try {
        const res = await fetch('/master-admin/update-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, monthlyPayment, paymentStatus, billingModel, pricePerConversation })
        });
        const data = await res.json();
        if (data.ok) {
          showToast('Payment updated', '#22c55e');
          recalcMRR();
        } else {
          showToast('Error: ' + (data.error || 'Unknown'), '#ef4444');
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
      }
    }

    async function extendTrial(tenantId) {
      try {
        const res = await fetch('/master-admin/extend-trial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, days: 14 })
        });
        const data = await res.json();
        if (data.ok) {
          showToast('Trial extended +14 days', '#22c55e');
        } else {
          showToast('Error: ' + (data.error || 'Unknown'), '#ef4444');
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
      }
    }

    // Voice DNA import
    let voiceTenantId = null;

    function openVoiceModal(tenantId, tenantName) {
      voiceTenantId = tenantId;
      document.getElementById('voiceModalTenant').textContent = 'Importing voice for: ' + tenantName;
      document.getElementById('voiceConversations').value = '';
      document.getElementById('voiceImportBtn').disabled = false;
      document.getElementById('voiceImportBtn').textContent = 'Import';
      document.getElementById('voiceModal').classList.add('show');
    }

    function closeVoiceModal() {
      voiceTenantId = null;
      document.getElementById('voiceModal').classList.remove('show');
    }

    document.getElementById('voiceModal').onclick = function(e) {
      if (e.target === this) closeVoiceModal();
    };

    async function submitVoiceImport() {
      if (!voiceTenantId) return;
      const conversations = document.getElementById('voiceConversations').value.trim();
      if (conversations.length < 50) { showToast('Not enough text (min 50 chars)', '#ef4444'); return; }
      const btn = document.getElementById('voiceImportBtn');
      btn.disabled = true;
      btn.textContent = 'Analyzing...';
      try {
        const res = await fetch('/master-admin/import-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId: voiceTenantId, conversations })
        });
        const data = await res.json();
        if (data.ok) {
          closeVoiceModal();
          showToast('Voice DNA imported!', '#22c55e');
        } else {
          showToast('Error: ' + (data.error || 'Unknown'), '#ef4444');
          btn.disabled = false;
          btn.textContent = 'Import';
        }
      } catch (e) {
        showToast('Network error', '#ef4444');
        btn.disabled = false;
        btn.textContent = 'Import';
      }
    }

    async function refreshCosts() {
      const period = document.getElementById('costPeriod').value;
      try {
        const res = await fetch('/master-admin/usage?period=' + period);
        const data = await res.json();
        // Update platform total
        const costEl = document.getElementById('ai-cost-value');
        if (costEl) costEl.textContent = '$' + data.platform.costUsd.toFixed(2);
        const subEl = costEl?.closest('.stat-card')?.querySelector('.stat-sub');
        if (subEl) subEl.textContent = data.platform.callCount.toLocaleString() + ' calls';
        // Update per-tenant cells
        document.querySelectorAll('.cost-cell').forEach(cell => {
          cell.querySelector('.cost-amount').textContent = '$0.00';
          cell.querySelector('.cost-calls').textContent = '0 calls';
        });
        for (const usage of data.byTenant) {
          const cell = document.getElementById('cost-' + usage.tenantId);
          if (cell) {
            cell.querySelector('.cost-amount').textContent = '$' + usage.costUsd.toFixed(2);
            cell.querySelector('.cost-calls').textContent = usage.callCount + ' calls';
          }
        }
      } catch (e) {
        showToast('Failed to load costs', '#ef4444');
      }
    }

    // --- Golden Examples ---
    async function loadGoldenExamples() {
      const filter = document.getElementById('goldenFilter').value;
      const list = document.getElementById('goldenList');
      list.innerHTML = 'Loading...';
      try {
        const url = filter ? '/master-admin/golden-examples?status=' + filter : '/master-admin/golden-examples';
        const res = await fetch(url, { credentials: 'include' });
        const data = await res.json();
        if (!data.examples || data.examples.length === 0) {
          list.innerHTML = '<div style="padding:12px;color:#666">No examples found.</div>';
          return;
        }
        const situationLabels = {greeting:'Greeting',discovery_question:'Discovery',empathy:'Empathy',value_statement:'Value',objection_handling:'Objection',cta_transition:'CTA',closing:'Closing',rapport_building:'Rapport'};
        list.innerHTML = data.examples.map(ex => {
          const sit = situationLabels[ex.situation] || ex.situation;
          const statusColor = {pending:'#eab308',approved:'#22c55e',rejected:'#ef4444',disabled:'#666'}[ex.status] || '#666';
          const actions = ex.status === 'pending' ? \`
            <button onclick="goldenAction('\${ex.id}','approve')" style="background:#22c55e;color:#000;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px">Approve</button>
            <button onclick="goldenAction('\${ex.id}','reject')" style="background:#ef4444;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px">Reject</button>
          \` : ex.status === 'approved' ? \`
            <button onclick="goldenAction('\${ex.id}','disable')" style="background:#666;color:#fff;border:none;border-radius:4px;padding:4px 10px;cursor:pointer;font-size:12px">Disable</button>
          \` : '';
          return \`<div style="padding:12px;border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:8px;background:#0a0a0a">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="color:#ccc;font-size:12px">\${sit} | Score: \${ex.gradeOverall || '--'} | Used: \${ex.timesUsed}x</span>
              <span style="color:\${statusColor};font-size:12px;font-weight:600">\${ex.status.toUpperCase()}</span>
            </div>
            <div style="color:#888;margin-bottom:4px">User: "\${ex.userMessage}"</div>
            <div style="color:#F0F0F0;margin-bottom:8px">Bot: "\${ex.botReply}"</div>
            <div style="display:flex;gap:6px">\${actions}</div>
          </div>\`;
        }).join('');
      } catch (e) {
        list.innerHTML = '<div style="color:#ef4444">Failed to load examples.</div>';
      }
    }

    async function goldenAction(id, action) {
      try {
        const res = await fetch('/master-admin/golden-examples/' + id + '/' + action, { method:'POST', credentials:'include' });
        if (res.ok) {
          showToast('Example ' + action + 'd', '#22c55e');
          loadGoldenExamples();
        } else {
          showToast('Failed: ' + action, '#ef4444');
        }
      } catch (e) {
        showToast('Error: ' + e.message, '#ef4444');
      }
    }

    async function loadAnalytics() {
      const statsDiv = document.getElementById('goldenStats');
      try {
        const res = await fetch('/master-admin/analytics', { credentials: 'include' });
        const data = await res.json();
        const gs = data.gradeStats || {};
        const oc = data.outcomeStats || [];
        const totalOutcomes = oc.reduce((s, o) => s + parseInt(o.count || 0), 0);
        const converted = oc.find(o => o.outcome === 'converted');
        const convRate = totalOutcomes > 0 && converted ? ((parseInt(converted.count) / totalOutcomes) * 100).toFixed(1) : '0';
        statsDiv.style.display = 'block';
        statsDiv.innerHTML = \`
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px">
            <div><div style="font-size:20px;font-weight:600;color:#F0F0F0">\${totalOutcomes}</div><div style="color:#888">Conversations</div></div>
            <div><div style="font-size:20px;font-weight:600;color:#22c55e">\${convRate}%</div><div style="color:#888">Conv. Rate</div></div>
            <div><div style="font-size:20px;font-weight:600;color:#F0F0F0">\${gs.total || 0}</div><div style="color:#888">Graded</div></div>
            <div><div style="font-size:20px;font-weight:600;color:#F0F0F0">\${gs.avgScore || '0'}</div><div style="color:#888">Avg Score</div></div>
            <div><div style="font-size:20px;font-weight:600;color:#F0F0F0">\${gs.avgHebrew || '0'}</div><div style="color:#888">Hebrew Q</div></div>
            <div><div style="font-size:20px;font-weight:600;color:#eab308">\${data.pendingGolden || 0}</div><div style="color:#888">Pending</div></div>
          </div>
        \`;
      } catch (e) {
        statsDiv.style.display = 'block';
        statsDiv.innerHTML = '<span style="color:#ef4444">Failed to load analytics.</span>';
      }
    }

    // Auto-load golden examples on page load
    loadGoldenExamples();

    function recalcMRR() {
      let mrr = 0;
      let paying = 0;
      document.querySelectorAll('.payment-cell').forEach(cell => {
        const input = cell.querySelector('.payment-input');
        const select = cell.querySelector('.payment-select');
        if (input && select && select.value === 'paid') {
          const amt = parseFloat(input.value) || 0;
          if (amt > 0) { mrr += amt; paying++; }
        }
      });
      const el = document.getElementById('mrr-value');
      if (el) el.textContent = '₪' + mrr.toLocaleString();
      // Update label too
      const label = el?.closest('.stat-card')?.querySelector('.stat-label');
      if (label) label.textContent = 'MRR (' + paying + ' paying)';
    }
  </script>
</body>
</html>`;
}
