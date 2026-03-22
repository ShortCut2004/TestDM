import { escapeHtml } from './utils.js';

export function getAppHTML(tenant, entries, globalEntries, justConnected = false, isAdmin = false, isImpersonating = false, config = {}) {
  const categories = {
    sop: { label: 'תהליך מכירה (SOP)', icon: 'SOP' },
    objections: { label: 'טיפול בהתנגדויות', icon: 'OBJ' },
    faq: { label: 'שאלות נפוצות', icon: 'FAQ' },
    tone: { label: 'סגנון ושפה', icon: 'TN' },
    scripts: { label: 'תסריטי שיחה', icon: 'SC' },
    general: { label: 'כללי', icon: 'GEN' },
    rules: { label: 'חוק קבוע', icon: 'RULE' },
  };

  const allEntries = entries || [];
  const ruleEntries = allEntries.filter(e => e.category === 'rules');
  const otherEntries = allEntries.filter(e => e.category !== 'rules');

  const entriesHTML = otherEntries.map(e => {
    const cat = categories[e.category] || categories.general;
    return '<div class="entry" data-id="' + e.id + '" data-cat="' + e.category + '">' +
      '<div class="entry-header">' +
      '<span class="entry-cat">' + cat.icon + ' ' + cat.label + '</span>' +
      '<button class="delete-btn" onclick="deleteEntry(\'' + e.id + '\')">x</button>' +
      '</div>' +
      (e.title ? '<div class="entry-title">' + escapeHtml(e.title) + '</div>' : '') +
      '<div class="entry-content">' + escapeHtml(e.content) + '</div>' +
      '<div class="entry-meta">' + new Date(e.createdAt).toLocaleDateString('he-IL') + '</div>' +
      '</div>';
  }).join('');

  const rulesHTML = ruleEntries.map(e => {
    return '<div class="rule-item" data-id="' + e.id + '">' +
      '<div class="rule-content">' +
      '<span class="rule-icon" style="color:#f87171;font-size:12px;font-weight:700">RULE</span>' +
      '<span class="rule-text">' + escapeHtml(e.content) + '</span>' +
      '</div>' +
      '<div class="rule-actions">' +
      '<button class="delete-btn" onclick="deleteRule(\'' + e.id + '\')">x</button>' +
      '</div>' +
      '</div>';
  }).join('');

  const categoryOptions = Object.entries(categories)
    .filter(([key]) => key !== 'rules')
    .map(([key, val]) => '<option value="' + key + '">' + val.icon + ' ' + val.label + '</option>')
    .join('');

  const t = tenant;
  // Parse ignoreList entries for the blacklist chip UI
  const ignoreLines = (t.ignoreList || '').split('\n').map(l => l.trim()).filter(Boolean);
  const isConnected = !!t.igAccessToken;
  const igHandle = t.instagram || '';

  // Check if personality is "empty" (no services, no knowledge, no voice)
  const hasPersonality = !!(t.services || t.voiceGreeting || t.voicePhrases || allEntries.length > 0);

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(t.name)} | Typer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0C0C0C; color: #F0F0F0; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

    .topbar { padding: 0 20px; height: 52px; background: #111; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; gap: 14px; flex-shrink: 0; }
    .topbar .logo { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; color: #fff; }
    .topbar .ig-handle { font-size: 13px; color: #F0F0F0; font-weight: 500; }
    .topbar .biz-name { font-size: 13px; color: #666; }
    .topbar .spacer { flex: 1; }
    .topbar .logout-btn { padding: 6px 14px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #888; border-radius: 8px; font-size: 13px; cursor: pointer; text-decoration: none; transition: all 0.15s; }
    .topbar .logout-btn:hover { color: #F0F0F0; border-color: rgba(255,255,255,0.15); }

    /* 3-Column Layout */
    .app-layout { display: flex; flex: 1; overflow: hidden; }
    .nav-sidebar { width: 200px; background: #111; border-inline-start: 1px solid rgba(255,255,255,0.06); padding: 16px 0; display: flex; flex-direction: column; overflow-y: auto; flex-shrink: 0; }
    .nav-item { display: flex; align-items: center; gap: 10px; padding: 9px 20px; font-size: 13px; color: #777; cursor: pointer; border: none; background: none; transition: all 0.15s; font-family: inherit; text-align: start; width: 100%; }
    .nav-item:hover { color: #ccc; background: rgba(255,255,255,0.03); }
    .nav-item.active { color: #fff; font-weight: 600; background: rgba(255,255,255,0.05); }
    .nav-item svg { width: 18px; height: 18px; flex-shrink: 0; opacity: 0.5; }
    .nav-item.active svg { opacity: 1; }
    .nav-divider { height: 1px; background: rgba(255,255,255,0.06); margin: 10px 16px; }
    .nav-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #444; padding: 16px 20px 6px; font-weight: 600; }
    .nav-admin { text-decoration: none; color: #555; font-size: 12px; }
    .nav-admin:hover { color: #999; }
    .nav-admin svg { opacity: 0.4; }
    .main-content { flex: 1; overflow-y: auto; padding: 28px 32px; background: #0C0C0C; }
    .main-content::-webkit-scrollbar { width: 6px; }
    .main-content::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 3px; }
    .chat-sidebar { width: 340px; background: #111; border-inline-end: 1px solid rgba(255,255,255,0.06); display: flex; flex-direction: column; flex-shrink: 0; }
    .chat-sidebar-header { padding: 14px 16px; border-bottom: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; justify-content: space-between; }
    .chat-sidebar-header h3 { font-size: 14px; font-weight: 600; color: #F0F0F0; margin: 0; }
    .view { display: none; }
    .view.active { display: block; }
    .view-header { font-size: 18px; font-weight: 600; color: #F0F0F0; margin-bottom: 28px; letter-spacing: -0.2px; }
    .scroll-area { flex: 1; overflow-y: auto; padding: 20px; }

    /* Mobile */
    .mobile-chat-toggle { display: none; position: fixed; bottom: 20px; left: 20px; z-index: 100; width: 48px; height: 48px; border-radius: 50%; background: #fff; color: #000; border: none; font-size: 20px; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.5); align-items: center; justify-content: center; }
    .chat-sidebar-overlay { display: none; }
    @media (max-width: 1024px) {
      .chat-sidebar { display: none; }
      .chat-sidebar.open { display: flex; position: fixed; top: 52px; left: 0; bottom: 0; z-index: 200; width: 340px; box-shadow: 4px 0 20px rgba(0,0,0,0.5); }
      .chat-sidebar-overlay.open { display: block; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 199; }
      .mobile-chat-toggle { display: flex; }
    }
    @media (max-width: 768px) {
      .nav-sidebar { width: 56px; padding: 12px 0; }
      .nav-item { padding: 10px 0; justify-content: center; }
      .nav-item span { display: none; }
      .nav-item svg { margin: 0; }
      .nav-label { display: none; }
      .nav-divider { margin: 8px 10px; }
      .main-content { padding: 20px 16px; }
    }

    .messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .message { max-width: 80%; padding: 10px 14px; border-radius: 16px; font-size: 14px; line-height: 1.5; word-wrap: break-word; white-space: pre-wrap; }
    .message.user { align-self: flex-start; background: #2563EB; color: #fff; border-bottom-left-radius: 4px; }
    .message.assistant { align-self: flex-end; background: #1E1E1E; color: #ddd; border-bottom-right-radius: 4px; }
    .message.system { align-self: center; background: transparent; color: #555; font-size: 13px; text-align: center; }
    .feedback-row { align-self: flex-end; display: flex; gap: 4px; flex-wrap: wrap; padding: 2px 0; }
    .fb-btn { padding: 3px 10px; border-radius: 12px; font-size: 11px; border: 1px solid rgba(255,255,255,0.08); background: #161616; color: #777; cursor: pointer; transition: all 0.15s; font-family: inherit; }
    .fb-btn:hover { background: #222; color: #ccc; }
    .fb-btn.sent { background: #166534; border-color: #22c55e; color: #86efac; }
    .input-area { padding: 12px 16px; background: #111; border-top: 1px solid rgba(255,255,255,0.06); display: flex; gap: 10px; flex-shrink: 0; }
    .input-area input { flex: 1; padding: 10px 16px; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 24px; color: #F0F0F0; font-size: 14px; outline: none; font-family: inherit; }
    .input-area input:focus { border-color: rgba(255,255,255,0.2); }
    .input-area button { padding: 8px 20px; background: #fff; color: #000; border: none; border-radius: 24px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .input-area button:disabled { opacity: 0.3; cursor: not-allowed; }
    .reset-btn { padding: 6px 12px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #777; border-radius: 8px; font-size: 12px; cursor: pointer; font-family: inherit; }
    .reset-btn:hover { color: #ccc; border-color: rgba(255,255,255,0.15); }
    .scenarios { padding: 10px 16px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid rgba(255,255,255,0.06); flex-shrink: 0; }
    .scenario-btn { padding: 5px 10px; background: transparent; border: 1px solid rgba(255,255,255,0.08); color: #888; border-radius: 14px; font-size: 11px; cursor: pointer; white-space: nowrap; font-family: inherit; transition: all 0.15s; }
    .scenario-btn:hover { background: rgba(255,255,255,0.04); color: #ccc; border-color: rgba(255,255,255,0.15); }

    .form-row { display: flex; gap: 8px; margin-bottom: 8px; }
    .form-row select, .form-row input, .form-row textarea { padding: 10px 12px; background: #161616; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #F0F0F0; font-size: 14px; font-family: inherit; outline: none; }
    .form-row select { min-width: 160px; }
    .form-row input, .form-row textarea { flex: 1; }
    .form-row textarea { resize: vertical; min-height: 50px; }
    .submit-btn { padding: 10px 20px; background: #fff; color: #000; border: none; border-radius: 8px; cursor: pointer; font-size: 14px; font-weight: 600; font-family: inherit; }
    .submit-btn:hover { background: #e5e5e5; }
    .entries-list { display: flex; flex-direction: column; gap: 10px; }
    .entry { background: #161616; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; }
    .entry-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
    .entry-cat { font-size: 12px; color: #a78bfa; }
    .entry-title { font-weight: 600; margin-bottom: 4px; }
    .entry-content { font-size: 14px; color: #999; line-height: 1.5; white-space: pre-wrap; }
    .entry-meta { font-size: 11px; color: #444; margin-top: 6px; }
    .delete-btn { background: none; border: none; color: #555; cursor: pointer; font-size: 14px; padding: 4px 8px; }
    .delete-btn:hover { color: #f87171; }
    .rule-item { background: #161616; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .rule-content { display: flex; align-items: center; gap: 8px; flex: 1; }
    .rule-icon { font-size: 16px; }
    .rule-text { font-size: 14px; color: #999; }
    .empty-state { text-align: center; color: #555; padding: 40px 20px; font-size: 14px; }
    .filter-row { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
    .filter-btn { padding: 5px 12px; border-radius: 16px; font-size: 12px; border: 1px solid rgba(255,255,255,0.08); background: transparent; color: #777; cursor: pointer; font-family: inherit; transition: all 0.15s; }
    .filter-btn.active { background: #fff; border-color: #fff; color: #000; }

    .switch input { opacity: 0; width: 0; height: 0; }
    .switch .slider:before { position: absolute; content: ""; height: 18px; width: 18px; left: 3px; bottom: 3px; background: white; transition: .3s; border-radius: 50%; }
    .switch input:checked + .slider { background: #22c55e !important; }
    .switch input:not(:checked) + .slider { background: #333 !important; }
    .switch input:checked + .slider:before { transform: translateX(20px); }

    .settings-form { max-width: 600px; }
    .settings-form label { display: block; color: #666; font-size: 13px; margin-bottom: 6px; margin-top: 18px; }
    .settings-form label:first-child { margin-top: 0; }
    .settings-form input, .settings-form textarea, .settings-form select { width: 100%; padding: 10px 14px; background: #141414; border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: #F0F0F0; font-size: 14px; font-family: inherit; outline: none; transition: border-color 0.15s; }
    .settings-form input:focus, .settings-form textarea:focus { border-color: rgba(255,255,255,0.2); }
    .settings-form textarea { resize: vertical; min-height: 70px; }
    .settings-form .hint { font-size: 12px; color: #444; margin-top: 4px; }
    .settings-card { background: transparent; border: none; border-radius: 0; padding: 0 0 28px; margin-bottom: 28px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .settings-card:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    .settings-card h3 { color: #F0F0F0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 16px; padding-bottom: 0; border-bottom: none; cursor: default; display: block; }
    .settings-card h3::after { display: none; }
    .settings-card.collapsed h3 { margin-bottom: 0; }
    .settings-card.collapsed .card-body { display: none; }
    .save-btn { margin-top: 20px; padding: 14px 40px; background: #fff; color: #000; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; width: 100%; font-family: inherit; transition: background 0.15s; }
    .save-btn:hover { background: #e5e5e5; }
    .save-msg { display: block; text-align: center; color: #22c55e; font-size: 14px; margin-top: 8px; opacity: 0; transition: opacity 0.3s; }
    .save-msg.show { opacity: 1; }

    .teach-section { margin-bottom: 28px; padding-bottom: 24px; border-bottom: 1px solid #1a1a1a; }
    .teach-section:last-child { border-bottom: none; }
    .teach-section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
    .teach-section-header h3 { color: #fff; font-size: 16px; font-weight: 600; }
    .teach-section-header .icon { font-size: 20px; }
    .teach-chip { padding:5px 12px;border-radius:16px;font-size:12px;border:1px solid rgba(255,255,255,0.08);background:transparent;color:#888;cursor:pointer;transition:all 0.15s;font-family:inherit; }
    .teach-chip:hover { border-color:rgba(255,255,255,0.2);color:#ccc; }
    .memory-entry { background:#161616;border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;margin-bottom:8px;transition:border-color 0.15s; }
    .memory-entry:hover { border-color:rgba(255,255,255,0.12); }
    .memory-voice-row { display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06); }
    .memory-voice-row:last-child { border-bottom:none; }
    .memory-voice-label { font-size:13px;color:#777; }
    .memory-voice-value { font-size:14px;color:#ddd;background:#1a1a1a;padding:4px 10px;border-radius:6px;min-width:60px;text-align:center;cursor:text;outline:none; }
    .memory-voice-value:focus { border:1px solid rgba(255,255,255,0.2);background:#111; }

    .speed-btn { padding:8px 16px;background:transparent;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#777;font-size:13px;cursor:pointer;transition:all 0.15s;flex:1;text-align:center;font-family:inherit; }
    .speed-btn:hover { border-color:rgba(255,255,255,0.15);color:#ccc; }
    .speed-btn.active { background:rgba(255,255,255,0.06);border-color:rgba(255,255,255,0.2);color:#fff;font-weight:600; }
    .sq-item { display:flex;align-items:center;gap:8px;padding:8px 10px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px; }
    .sq-item .sq-label { font-weight:600;color:#a78bfa;font-size:13px;min-width:60px; }
    .sq-item .sq-prompt { flex:1;color:#999;font-size:13px; }
    .sq-item .sq-actions { display:flex;gap:4px; }
    .sq-item .sq-btn { background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:2px 4px; }
    .sq-item .sq-btn:hover { color:#fff; }
    .sqa-item { display:flex;align-items:flex-start;gap:8px;padding:8px 10px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.06);border-radius:8px;margin-bottom:6px; }
    .sqa-item .sqa-q { font-weight:600;color:#f59e0b;font-size:13px;min-width:100px; }
    .sqa-item .sqa-a { flex:1;color:#999;font-size:13px; }

    .analyzer-card { background: transparent; border: none; border-radius: 0; padding: 0; }
    .analyzer-card h3 { color: #fff; font-size: 18px; margin-bottom: 4px; }
    .analyzer-card p { color: #777; font-size: 13px; margin-bottom: 16px; }
    .analyzer-textarea { width: 100%; min-height: 120px; padding: 14px; background: #1a1a1a; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; color: #F0F0F0; font-size: 14px; font-family: inherit; resize: vertical; outline: none; line-height: 1.6; direction: rtl; }
    .analyzer-textarea:focus { border-color: rgba(255,255,255,0.2); }
    .analyzer-textarea::placeholder { color: #555; }
    .analyze-btn { margin-top: 12px; padding: 12px 28px; background: #fff; color: #000; border: none; border-radius: 10px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background 0.15s; font-family: inherit; }
    .analyze-btn:hover { background: #e5e5e5; }
    .analyze-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .voice-preview { background: #1a1a1a; border: 1px solid rgba(255,255,255,0.06); border-radius: 12px; padding: 20px; margin-top: 16px; display: none; }
    .voice-preview.show { display: block; }
    .voice-preview h4 { color: #F0F0F0; margin-bottom: 12px; font-size: 15px; }
    .voice-field { margin-bottom: 10px; }
    .voice-field-label { font-size: 12px; color: #888; margin-bottom: 2px; }
    .voice-field-value { font-size: 14px; color: #ddd; background: #111; padding: 8px 12px; border-radius: 8px; white-space: pre-wrap; }
    .voice-save-btn { padding: 10px 24px; background: #22c55e; color: #fff; border: none; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; font-family: inherit; }
    .voice-save-btn:hover { background: #16a34a; }

    @keyframes voice-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
    .voice-spinner { display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.1);border-top-color:#22c55e;border-radius:50%;animation:voice-spin 0.8s linear infinite; }

    .connection-card { display: flex; align-items: center; gap: 12px; background: transparent; border: none; border-radius: 0; padding: 0; }
    .connection-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .connection-dot.active { background: #22c55e; box-shadow: 0 0 8px #22c55e44; }
    .connection-dot.inactive { background: #ef4444; }

    .onboarding-nudge { background: transparent; border: none; border-radius: 0; padding: 0 0 20px; margin-bottom: 20px; text-align: center; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .onboarding-nudge p { color: #777; font-size: 14px; line-height: 1.6; }
    .onboarding-nudge strong { color: #F0F0F0; }

    .wizard-banner { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 18px; margin-bottom: 24px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: all 0.2s; text-decoration: none; }
    .wizard-banner:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.1); }
    .wizard-banner .wizard-icon { font-size: 24px; flex-shrink: 0; }
    .wizard-banner .wizard-text { flex: 1; }
    .wizard-banner .wizard-title { color: #F0F0F0; font-size: 14px; font-weight: 600; margin-bottom: 2px; }
    .wizard-banner .wizard-desc { color: #777; font-size: 13px; }
    .wizard-banner .wizard-arrow { color: #555; font-size: 18px; flex-shrink: 0; }

    .spinner { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #fff; border-radius: 50%; animation: spin 0.6s linear infinite; vertical-align: middle; margin-left: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .lead-item { background: #161616; border: 1px solid rgba(255,255,255,0.06); border-radius: 10px; padding: 14px 16px; display: flex; align-items: center; gap: 14px; transition: border-color 0.15s; }
    .lead-item:hover { border-color: rgba(255,255,255,0.12); }
    .lead-item.muted { opacity: 0.5; }
    .lead-item.needs-attention { border-color: #f87171; border-width: 1px; }
    .needs-attention-badge { display: inline-block; margin-inline-start: 8px; padding: 2px 8px; background: #7f1d1d; color: #f87171; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; vertical-align: middle; }
    .needs-attention-badge:hover { background: #991b1b; }
    .lead-name { font-weight: 600; font-size: 15px; }
    .lead-meta { font-size: 12px; color: #555; margin-top: 2px; }
    .lead-score { display: inline-flex; align-items: center; justify-content: center; min-width: 28px; height: 28px; border-radius: 50%; font-size: 12px; font-weight: 700; }
    .lead-status { font-size: 11px; padding: 3px 8px; border-radius: 12px; font-weight: 600; }
    .gender-badge { padding: 4px 10px; border-radius: 12px; font-size: 13px; font-weight: 700; border: 1px solid; cursor: pointer; transition: all 0.15s; min-width: 32px; text-align: center; line-height: 1.2; }
    .gender-badge:hover { filter: brightness(1.3); }
    .mute-toggle { padding: 6px 14px; border-radius: 8px; font-size: 12px; font-weight: 600; border: 1px solid rgba(255,255,255,0.08); cursor: pointer; transition: all 0.15s; background: transparent; font-family: inherit; }
    .mute-toggle.muted { color: #f87171; border-color: #f87171; }
    .mute-toggle.active { color: #777; }
    .mute-toggle:hover { background: rgba(255,255,255,0.04); }
    .ignore-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px 6px 14px; background: #1c1017; border: 1px solid #f8717133; border-radius: 20px; font-size: 13px; color: #f87171; }
    .ignore-chip .chip-label { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ignore-chip .chip-type { font-size: 11px; color: #888; margin-inline-start: 2px; }
    .ignore-chip .chip-remove { width: 20px; height: 20px; border-radius: 50%; border: none; background: #f8717122; color: #f87171; font-size: 14px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; line-height: 1; }
    .ignore-chip .chip-remove:hover { background: #f8717144; }
  </style>
</head>
<body${isImpersonating ? ' style="padding-top:40px;"' : ''}>

${isImpersonating ? `<div style="position:fixed;top:0;left:0;right:0;z-index:9999;background:#7c3aed;color:#fff;text-align:center;padding:8px 16px;font-size:14px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:12px;">
  <span>Managing: ${escapeHtml(tenant.name || tenant.id)}</span>
  <button onclick="stopImpersonating()" style="background:#fff;color:#7c3aed;border:none;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer;">Back to Admin</button>
</div>` : ''}

<div class="topbar">
  <div class="logo">Typer</div>
  ${igHandle ? `<span class="ig-handle">${escapeHtml(igHandle)}</span><span class="biz-name">${escapeHtml(t.name)}</span>` : `<span class="biz-name" style="color:#888;font-size:14px">${escapeHtml(t.name)}</span>`}
  <div class="spacer"></div>
  <div style="display:flex;align-items:center;gap:8px;">
    <span id="botStatusText" style="font-size:12px;font-weight:600;color:${t.botActive !== false ? '#22c55e' : '#ef4444'}">${t.botActive !== false ? 'פעיל' : 'כבוי'}</span>
    <label class="switch" style="position:relative;display:inline-block;width:44px;height:24px;">
      <input type="checkbox" id="botToggle" ${t.botActive !== false ? 'checked' : ''} onchange="toggleBot(this.checked)">
      <span class="slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${t.botActive !== false ? '#22c55e' : '#333'};transition:.3s;border-radius:24px;"></span>
    </label>
  </div>
  ${!isConnected ? `<a href="/connect/${t.id}" style="padding:8px 16px;background:#fff;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;">חבר אינסטגרם</a>` : ''}
  <a href="/logout" class="logout-btn">התנתק</a>
</div>
${justConnected ? '<div style="background:#166534;color:#86efac;padding:10px 20px;text-align:center;font-size:14px;font-weight:600;">אינסטגרם חובר בהצלחה! הבוט שלך פעיל עכשיו.</div>' : ''}
<!-- Billing banner hidden -->
<div id="billingBanner" style="display:none"></div>

<div class="app-layout">

<!-- Navigation Sidebar -->
<nav class="nav-sidebar">
  <button class="nav-item active" data-view="home" onclick="switchView('home')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    <span>בית</span>
  </button>
  <button class="nav-item" data-view="teach" onclick="switchView('teach')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
    <span>למד</span>
  </button>
  <button class="nav-item" data-view="leads" onclick="switchView('leads')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    <span>שיחות</span>
  </button>
  <button class="nav-item" data-view="strategy" onclick="switchView('strategy')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
    <span>אסטרטגיה</span>
  </button>
  <button class="nav-item" data-view="style" onclick="switchView('style')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>
    <span>סגנון</span>
  </button>
  <div class="nav-divider"></div>
  <button class="nav-item" data-view="settings" onclick="switchView('settings')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    <span>הגדרות</span>
  </button>
  <button class="nav-item" data-view="voice-dna" onclick="switchView('voice-dna')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
    <span>Voice DNA</span>
  </button>
  <!-- Billing nav hidden - all payments via bank transfer
  <button class="nav-item" data-view="billing" onclick="switchView('billing')">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
    <span>חיוב</span>
  </button>
  -->
  ${isAdmin ? `
  <div class="nav-divider"></div>
  <a href="/master-admin" class="nav-item nav-admin">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    <span>Admin</span>
  </a>
  ` : ''}
</nav>

<!-- Main Content Area -->
<main class="main-content">

<!-- HOME VIEW -->
<div id="view-home" class="view active">
  <h2 class="view-header">בית</h2>
  <div class="settings-form">

      ${!hasPersonality ? `
      <div class="onboarding-nudge">
        <p><strong>ברוכים הבאים!</strong> מלא את הפרטים כאן כדי שהבוט ידע מי אתה, איך לדבר, ומה לענות. ברגע שתסיים — לך ל״בדוק״ ותראה אותו בפעולה.</p>
      </div>
      ` : ''}

      <a href="/wizard" class="wizard-banner">
        <svg style="width:20px;height:20px;flex-shrink:0;opacity:0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
        <div class="wizard-text">
          <div class="wizard-title">אשף ההגדרות</div>
          <div class="wizard-desc">שיחה קצרה שתלמד את הבוט איך אתה מדבר עם לקוחות</div>
        </div>
        <div class="wizard-arrow">←</div>
      </a>

      <div class="settings-card">
        <h3 onclick="this.parentElement.classList.toggle('collapsed')">פרטי העסק</h3>
        <div class="card-body">
          <label>שם העסק</label>
          <input type="text" id="setName" value="${escapeHtml(t.name)}">
          <label>שם הבעלים</label>
          <input type="text" id="setOwner" value="${escapeHtml(t.ownerName)}">
          <label>תחום</label>
          <input type="text" id="setType" value="${escapeHtml(t.businessType)}">
          <label>שירותים</label>
          <textarea id="setServices" rows="2">${escapeHtml(t.services)}</textarea>
          <label>הוראות לקביעת פגישה / לינק</label>
          <textarea id="setBooking" rows="2">${escapeHtml(t.bookingInstructions)}</textarea>
          <p class="hint">הלינק שהבוט ישלח כשמישהו רוצה לקבוע פגישה</p>
        </div>
      </div>

      <button class="save-btn" onclick="saveSettings()">שמור הכל</button>
      <span class="save-msg" id="saveMsg">נשמר בהצלחה!</span>
  </div>
</div>

<!-- TEACH VIEW -->
<div id="view-teach" class="view">
  <h2 class="view-header">למד את הבוט</h2>

          <div id="teachingChatPanel" style="display:flex;flex-direction:column;height:460px;background:#111;border:1px solid rgba(255,255,255,0.06);border-radius:12px;overflow:hidden">
            <div id="teachingMessages" style="flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px">
              <div class="teach-system-msg" style="text-align:center;color:#666;font-size:13px;padding:20px 10px;line-height:1.6">
                ספר לי מה אתה רוצה שאדע — מחירים, שירותים, חוקים, סגנון דיבור...<br>אני אשמור הכל ואאשר שהבנתי
              </div>
            </div>

            <div id="teachingScreenshotZone" style="border-top:1px solid rgba(255,255,255,0.06);padding:10px 14px;background:#111;display:none">
              <div style="display:flex;align-items:center;gap:10px">
                <img id="teachingScreenshotPreview" style="max-height:50px;border-radius:6px;display:none">
                <div style="flex:1;font-size:13px;color:#888" id="teachingScreenshotLabel">מעלה תמונה...</div>
                <button onclick="clearTeachingScreenshot()" style="padding:4px 10px;background:#1a1a1a;border:none;border-radius:6px;color:#ccc;cursor:pointer;font-size:12px">x</button>
              </div>
            </div>

            <div style="border-top:1px solid rgba(255,255,255,0.06);padding:10px 12px;display:flex;gap:8px;align-items:center">
              <input type="file" id="teachingImageInput" accept="image/*" style="display:none" onchange="handleTeachingImage(this)">
              <button onclick="document.getElementById('teachingImageInput').click()" title="העלה צילום מסך" style="padding:7px 10px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;color:#888;flex-shrink:0;display:flex;align-items:center"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg></button>
              <input type="text" id="teachingInput" placeholder='לדוגמה: "מחיר פגישה 200 שקל"' style="flex:1;padding:9px 14px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:20px;color:#fff;font-size:14px;outline:none;direction:rtl" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendTeaching()}">
              <button id="teachingSendBtn" onclick="sendTeaching()" style="padding:7px 18px;background:#fff;color:#000;border:none;border-radius:20px;font-size:14px;font-weight:600;cursor:pointer;flex-shrink:0">שלח</button>
            </div>
          </div>

          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
            <span style="font-size:12px;color:#555">נסה:</span>
            <button class="teach-chip" onclick="sendTeachingExample(this.dataset.msg)" data-msg="מחיר פגישה אצלי הוא 200 שקל">מחיר</button>
            <button class="teach-chip" onclick="sendTeachingExample(this.dataset.msg)" data-msg="אני תמיד אומר מה קורה בוס בהתחלה">ברכה</button>
            <button class="teach-chip" onclick="sendTeachingExample(this.dataset.msg)" data-msg="אם מישהו אומר שזה יקר, תסביר שהתוצאות שוות את ההשקעה">התנגדות</button>
            <button class="teach-chip" onclick="sendTeachingExample(this.dataset.msg)" data-msg="לעולם לא להגיד בוודאי או בהחלט">חוק</button>
            <button class="teach-chip" onclick="startStyleTraining()" style="background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.1);color:#ccc">תרגול</button>
            <button class="teach-chip" onclick="openMemoryView()" style="margin-right:auto;background:rgba(255,255,255,0.03);border-color:rgba(255,255,255,0.1);color:#ccc">הזיכרון שלי</button>
          </div>
</div>

<!-- STRATEGY VIEW -->
<div id="view-strategy" class="view">
  <h2 class="view-header">אסטרטגיית שיחה</h2>
          <div id="strategyEmpty" style="display:${t.conversationStrategy?.questions?.length || t.conversationStrategy?.handlingPatterns?.length ? 'none' : ''}">
            <div style="text-align:center;padding:20px 10px;color:#666">
              <div style="font-size:14px;margin-bottom:12px">עדיין לא הגדרת אסטרטגיית שיחה</div>
              <a href="/wizard" style="display:inline-block;padding:10px 24px;background:#fff;color:#000;border:none;border-radius:10px;font-size:14px;font-weight:600;cursor:pointer;text-decoration:none">הפעל את האשף</a>
            </div>
          </div>
          <div id="strategyEditor" style="display:${t.conversationStrategy?.questions?.length || t.conversationStrategy?.handlingPatterns?.length ? '' : 'none'}">
            <div style="margin-bottom:16px">
              <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">מהירות שיחה</label>
              <div style="display:flex;gap:8px" id="speedSelector">
                <button class="speed-btn${t.conversationStrategy?.speed === 'quick' ? ' active' : ''}" data-speed="quick" onclick="setSpeed('quick')">מהירה</button>
                <button class="speed-btn${(!t.conversationStrategy?.speed || t.conversationStrategy?.speed === 'balanced') ? ' active' : ''}" data-speed="balanced" onclick="setSpeed('balanced')">מאוזנת</button>
                <button class="speed-btn${t.conversationStrategy?.speed === 'deep' ? ' active' : ''}" data-speed="deep" onclick="setSpeed('deep')">מעמיקה</button>
              </div>
              <p style="font-size:11px;color:#555;margin-top:6px" id="speedHint"></p>
            </div>

            <div style="margin-bottom:16px">
              <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">שאלות לליד (לפי סדר)</label>
              <div id="strategyQuestionsList"></div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <input type="text" id="newQuestionLabel" placeholder="שם (למשל: תקציב)" style="flex:1;padding:7px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:rtl">
                <input type="text" id="newQuestionPrompt" placeholder="איך לשאול (למשל: מה התקציב שלך?)" style="flex:2;padding:7px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:rtl">
                <button onclick="addStrategyQuestion()" style="padding:7px 14px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;cursor:pointer;white-space:nowrap">+ הוסף</button>
              </div>
            </div>

            <div style="margin-bottom:16px">
              <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">שאלות ותשובות נפוצות</label>
              <div id="strategyQAList"></div>
              <div style="display:flex;gap:8px;margin-top:8px">
                <input type="text" id="newQAQuestion" placeholder="שאלה (למשל: כמה זה עולה?)" style="flex:1;padding:7px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:rtl">
                <input type="text" id="newQAAnswer" placeholder="תשובה מוכנה" style="flex:1;padding:7px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:rtl">
                <button onclick="addStrategyQA()" style="padding:7px 14px;background:#fff;color:#000;border:none;border-radius:8px;font-size:13px;cursor:pointer;white-space:nowrap">+ הוסף</button>
              </div>
            </div>

            <div style="margin-bottom:16px">
              <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">דפוסי תגובה</label>
              <div id="handlingPatternsList"></div>
            </div>

            <div style="display:flex;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,0.06)">
              <a href="/wizard" style="font-size:13px;color:#999;text-decoration:none">הפעל אשף מחדש</a>
              <span id="strategySaveMsg" style="font-size:12px;color:#22c55e;opacity:0;transition:opacity 0.3s">נשמר</span>
            </div>
          </div>
</div>

<!-- STYLE VIEW -->
<div id="view-style" class="view">
  <h2 class="view-header">סגנון</h2>
  <div class="settings-form">
      <div class="settings-card">
        <h3 onclick="this.parentElement.classList.toggle('collapsed')">מהירות תגובה</h3>
        <div class="card-body">
          <div>
            <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">מהירות תגובה</label>
            <select id="delayPreset" onchange="saveDelayConfig()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
              <option value="instant" ${(t.delayConfig?.preset) === 'instant' ? 'selected' : ''}>מיידי</option>
              <option value="fast" ${(t.delayConfig?.preset) === 'fast' ? 'selected' : ''}>מהיר</option>
              <option value="natural" ${(!t.delayConfig?.preset || t.delayConfig?.preset === 'natural') ? 'selected' : ''}>טבעי (ברירת מחדל)</option>
              <option value="slow" ${(t.delayConfig?.preset) === 'slow' ? 'selected' : ''}>שקול</option>
              <option value="custom" ${(t.delayConfig?.preset) === 'custom' ? 'selected' : ''}>מותאם אישית</option>
            </select>
            <p id="delayHint" style="font-size:12px;color:#666;margin:8px 0 0 0;direction:rtl"></p>
          </div>

          <div id="delayCustomPanel" style="display:${t.delayConfig?.preset === 'custom' ? '' : 'none'};margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">
            <div style="display:grid;gap:14px">
              <div>
                <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">תגובה ראשונה (טווח)</label>
                <div style="display:flex;align-items:center;gap:8px">
                  <input type="range" id="delayFirstMin" min="0" max="60000" step="500" value="${t.delayConfig?.firstReplyMin ?? 3000}" oninput="updateDelayLabel(this,'delayFirstMinL')" onchange="saveDelayConfig()" style="flex:1;accent-color:#fff">
                  <span id="delayFirstMinL" style="font-size:12px;color:#666;min-width:35px">${((t.delayConfig?.firstReplyMin ?? 3000) / 1000).toFixed(1)}s</span>
                  <span style="color:#444">—</span>
                  <input type="range" id="delayFirstMax" min="1000" max="120000" step="1000" value="${t.delayConfig?.firstReplyMax ?? 30000}" oninput="updateDelayLabel(this,'delayFirstMaxL')" onchange="saveDelayConfig()" style="flex:1;accent-color:#fff">
                  <span id="delayFirstMaxL" style="font-size:12px;color:#666;min-width:35px">${((t.delayConfig?.firstReplyMax ?? 30000) / 1000).toFixed(1)}s</span>
                </div>
              </div>
              <div>
                <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">תגובות המשך (טווח)</label>
                <div style="display:flex;align-items:center;gap:8px">
                  <input type="range" id="delayFollowMin" min="0" max="60000" step="500" value="${t.delayConfig?.followUpMin ?? 1000}" oninput="updateDelayLabel(this,'delayFollowMinL')" onchange="saveDelayConfig()" style="flex:1;accent-color:#fff">
                  <span id="delayFollowMinL" style="font-size:12px;color:#666;min-width:35px">${((t.delayConfig?.followUpMin ?? 1000) / 1000).toFixed(1)}s</span>
                  <span style="color:#444">—</span>
                  <input type="range" id="delayFollowMax" min="500" max="120000" step="500" value="${t.delayConfig?.followUpMax ?? 10000}" oninput="updateDelayLabel(this,'delayFollowMaxL')" onchange="saveDelayConfig()" style="flex:1;accent-color:#fff">
                  <span id="delayFollowMaxL" style="font-size:12px;color:#666;min-width:35px">${((t.delayConfig?.followUpMax ?? 10000) / 1000).toFixed(1)}s</span>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
                <div>
                  <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">השהייה בין חלקי הודעה</label>
                  <div style="display:flex;align-items:center;gap:8px">
                    <input type="range" id="delaySplit" min="0" max="10000" step="250" value="${t.delayConfig?.splitDelay ?? 2000}" oninput="updateDelayLabel(this,'delaySplitL')" onchange="saveDelayConfig()" style="flex:1;accent-color:#fff">
                    <span id="delaySplitL" style="font-size:12px;color:#666;min-width:35px">${((t.delayConfig?.splitDelay ?? 2000) / 1000).toFixed(1)}s</span>
                  </div>
                </div>
                <div>
                  <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">באפר הודעות</label>
                  <div style="display:flex;align-items:center;gap:8px">
                    <input type="range" id="delayDebounce" min="500" max="10000" step="250" value="${t.delayConfig?.debounce ?? 2000}" oninput="updateDelayLabel(this,'delayDebounceL')" onchange="saveDelayConfig()" style="flex:1;accent-color:#fff">
                    <span id="delayDebounceL" style="font-size:12px;color:#666;min-width:35px">${((t.delayConfig?.debounce ?? 2000) / 1000).toFixed(1)}s</span>
                  </div>
                </div>
              </div>
              <div style="display:flex;gap:20px;align-items:center">
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#ccc;cursor:pointer">
                  <input type="checkbox" id="delayReadingFactor" ${(t.delayConfig?.readingFactor !== false) ? 'checked' : ''} onchange="saveDelayConfig()" style="accent-color:#fff">
                  בונוס קריאה
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#ccc;cursor:pointer">
                  <input type="checkbox" id="delayTypingFactor" ${(t.delayConfig?.typingFactor !== false) ? 'checked' : ''} onchange="saveDelayConfig()" style="accent-color:#fff">
                  בונוס הקלדה
                </label>
              </div>
            </div>
          </div>
          <p style="font-size:11px;color:#555;margin-top:10px;direction:rtl">ההשהיות ��לות רק על ש��חות אינסטגרם אמיתיות, לא על הצ׳אט הפנימי</p>
        </div>
      </div>

      <div class="settings-card">
        <h3 onclick="this.parentElement.classList.toggle('collapsed')">סגנון הבוט</h3>
        <div class="card-body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">מגדר הבוט</label>
              <select id="vcGender" onchange="saveVoiceControl()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="male" ${t.botGender === 'male' ? 'selected' : ''}>זכר</option>
                <option value="female" ${t.botGender === 'female' ? 'selected' : ''}>נקבה</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">אנרגיה</label>
              <select id="vcEnergy" onchange="saveVoiceControl()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="" ${!t.voiceEnergy ? 'selected' : ''}>ברירת מחדל</option>
                <option value="warm" ${t.voiceEnergy === 'warm' ? 'selected' : ''}>חם</option>
                <option value="chill" ${t.voiceEnergy === 'chill' ? 'selected' : ''}>רגוע</option>
                <option value="professional" ${t.voiceEnergy === 'professional' ? 'selected' : ''}>מקצועי</option>
                <option value="high-energy" ${t.voiceEnergy === 'high-energy' ? 'selected' : ''}>אנרגטי</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">אורך הודעות</label>
              <select id="vcLength" onchange="saveVoiceControl()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="" ${!t.voiceLength ? 'selected' : ''}>ברירת מחדל</option>
                <option value="super-short" ${t.voiceLength === 'super-short' ? 'selected' : ''}>קצר מאוד</option>
                <option value="normal" ${t.voiceLength === 'normal' ? 'selected' : ''}>רגיל</option>
                <option value="detailed" ${t.voiceLength === 'detailed' ? 'selected' : ''}>מפורט</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">אימוג׳י</label>
              <select id="vcEmoji" onchange="saveVoiceControl()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="" ${!t.voiceEmoji ? 'selected' : ''}>ברירת מחדל</option>
                <option value="never" ${t.voiceEmoji === 'never' ? 'selected' : ''}>בלי</option>
                <option value="sometimes" ${t.voiceEmoji === 'sometimes' ? 'selected' : ''}>לפעמים</option>
                <option value="a-lot" ${t.voiceEmoji === 'a-lot' ? 'selected' : ''}>הרבה</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">הומור</label>
              <select id="vcHumor" onchange="saveVoiceControl()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="" ${!t.voiceHumor ? 'selected' : ''}>ברירת מחדל</option>
                <option value="none" ${t.voiceHumor === 'none' ? 'selected' : ''}>בלי</option>
                <option value="light" ${t.voiceHumor === 'light' ? 'selected' : ''}>קל</option>
                <option value="dry" ${t.voiceHumor === 'dry' ? 'selected' : ''}>יבש</option>
                <option value="memes" ${t.voiceHumor === 'memes' ? 'selected' : ''}>מימס</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">דחיפה לשיחה</label>
              <select id="vcCtaPush" onchange="saveVoiceControl()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="soft" ${t.ctaPushLevel === 'soft' ? 'selected' : ''}>טבעי (בונה קשר קודם)</option>
                <option value="normal" ${(!t.ctaPushLevel || t.ctaPushLevel === 'normal') ? 'selected' : ''}>מאוזן</option>
                <option value="aggressive" ${t.ctaPushLevel === 'aggressive' ? 'selected' : ''}>מהיר (דוחף לפגישה)</option>
              </select>
            </div>
            <div>
              <label style="font-size:12px;color:#888;margin-bottom:4px;display:block">קריאה לפעולה</label>
              <select id="vcCtaType" onchange="onCtaTypeChange()" style="width:100%;padding:8px 10px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl">
                <option value="send_link" ${(!t.ctaType || t.ctaType === 'send_link') ? 'selected' : ''}>לינק לפגישה</option>
                <option value="ask_phone" ${t.ctaType === 'ask_phone' ? 'selected' : ''}>בקש טלפון</option>
                <option value="give_phone" ${t.ctaType === 'give_phone' ? 'selected' : ''}>תן טלפון שלי</option>
                <option value="custom" ${t.ctaType === 'custom' ? 'selected' : ''}>מותאם אישית</option>
              </select>
            </div>
          </div>
          <div id="ctaExtra" style="margin-top:10px;display:${(!t.ctaType || t.ctaType === 'send_link' || t.ctaType === 'give_phone' || t.ctaType === 'custom') ? '' : 'none'}">
            <div id="ctaLinkField" style="display:${(!t.ctaType || t.ctaType === 'send_link') ? '' : 'none'}">
              <input type="text" id="ctaBookingLink" value="${escapeHtml(t.bookingInstructions)}" placeholder="https://calendly.com/..." onchange="saveVoiceControl()" style="width:100%;padding:8px 12px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:ltr;box-sizing:border-box">
            </div>
            <div id="ctaPhoneField" style="display:${t.ctaType === 'give_phone' ? '' : 'none'}">
              <input type="tel" id="ctaOwnerPhone" value="${escapeHtml(t.ownerPhone || '')}" placeholder="050-1234567" onchange="saveVoiceControl()" style="width:100%;padding:8px 12px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:ltr;box-sizing:border-box">
            </div>
            <div id="ctaCustomField" style="display:${t.ctaType === 'custom' ? '' : 'none'}">
              <textarea id="ctaCustomText" rows="2" placeholder="מה הבוט יעשה / יגיד?" onchange="saveVoiceControl()" style="width:100%;padding:8px 12px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:rtl;box-sizing:border-box;resize:vertical">${escapeHtml(t.ctaCustomText || '')}</textarea>
            </div>
          </div>
          <p class="hint" style="margin-top:10px">שינויים נשמרים אוטומטית. לפרטים נוספים (סלנג, ברכה, ביטויים) — השתמש בצ׳אט למעלה</p>
          <div style="margin-top:16px;padding-top:16px;border-top:1px solid rgba(255,255,255,0.06)">
            <label style="font-size:12px;color:#888;margin-bottom:6px;display:block">הוראות שיחה מותאמות</label>
            <textarea id="customFlowInput" rows="3" onchange="saveVoiceControl()" placeholder="כתוב בחופשיות איך אתה רוצה שהבוט ינהל שיחות... למשל: 'כשמישהו שואל על מחיר, תגיד שזה מתחיל מ-500 ש״ח' או 'אל תציע שיחה לאנשים שרק מפרגנים'" style="width:100%;padding:10px 12px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;direction:rtl;resize:vertical;box-sizing:border-box">${escapeHtml(t.customFlowInstructions || '')}</textarea>
            <p class="hint">ההוראות האלה מתווספות להגדרות הבסיסיות ומשפיעות על כל השיחות</p>
          </div>
        </div>
      </div>
  </div>
</div>

<!-- LEADS VIEW -->
<div id="view-leads" class="view">
  <h2 class="view-header">שיחות</h2>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div></div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="text" id="leadsSearch" placeholder="חפש לפי שם..."
          style="padding:8px 14px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;outline:none;width:180px"
          oninput="filterLeads()">
        <select id="leadsFilter" onchange="filterLeads()"
          style="padding:8px 12px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px">
          <option value="all">הכל</option>
          <option value="attention">דורש תשומת לב</option>
          <option value="active">פעילים</option>
          <option value="muted">מושתקים</option>
        </select>
      </div>
    </div>
    <div id="leadsList" class="entries-list">
      <div class="empty-state">טוען שיחות...</div>
    </div>
</div>

<!-- SETTINGS VIEW -->
<div id="view-settings" class="view">
  <h2 class="view-header">הגדרות</h2>
  <div class="settings-form">

      <div class="settings-card">
        <h3 style="cursor:default">חיבור אינסטגרם</h3>
        <div class="card-body">
          <div class="connection-card">
            <span class="connection-dot ${isConnected ? 'active' : 'inactive'}"></span>
            <div style="flex:1">
              <div style="font-weight:600;font-size:14px">${isConnected ? 'מחובר' : 'לא מחובר'}</div>
              ${isConnected && igHandle ? `<div style="font-size:13px;color:#8b5cf6">${escapeHtml(igHandle)}</div>` : !isConnected ? '<div style="font-size:13px;color:#888">חבר את האינסטגרם כדי שהבוט יתחיל לענות</div>' : ''}
            </div>
            ${!isConnected ? `<a href="/connect/${t.id}" style="padding:8px 16px;background:#fff;color:#000;border-radius:8px;text-decoration:none;font-weight:600;font-size:13px;white-space:nowrap">חבר</a>` : ''}
          </div>
          <div style="margin-top:16px">
            <label style="color:#ccc;font-size:14px;margin-bottom:8px;display:block">סטטוס הבוט</label>
            <div style="display:flex;align-items:center;gap:12px">
              <label class="switch" style="position:relative;display:inline-block;width:44px;height:24px;">
                <input type="checkbox" id="botToggleSettings" ${t.botActive !== false ? 'checked' : ''} onchange="toggleBot(this.checked);document.getElementById('botToggle').checked=this.checked">
                <span class="slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${t.botActive !== false ? '#22c55e' : '#333'};transition:.3s;border-radius:24px;"></span>
              </label>
              <span style="font-size:14px;color:#ccc">${t.botActive !== false ? 'הבוט פעיל ומגיב להודעות' : 'הבוט כבוי'}</span>
            </div>
          </div>
          <div style="margin-top:16px">
            <label style="color:#ccc;font-size:14px;margin-bottom:8px;display:block">שירות AI</label>
            <div style="display:flex;align-items:center;gap:12px">
              <label class="switch" style="position:relative;display:inline-block;width:44px;height:24px;">
                <input type="checkbox" id="aiToggleSettings" ${t.aiEnabled ? 'checked' : ''} onchange="toggleAI(this.checked)">
                <span class="slider" style="position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:${t.aiEnabled ? '#3b82f6' : '#333'};transition:.3s;border-radius:24px;"></span>
              </label>
              <span id="aiStatusText" style="font-size:14px;color:#ccc">${t.aiEnabled ? 'שירות AI פעיל' : 'שירות AI כבוי'}</span>
            </div>
            <p style="margin-top:8px;font-size:12px;color:#666">כאשר שירות AI כבוי, הבוט לא יגיב להודעות נכנסות כלל.</p>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3 style="cursor:default">לינקים לשיתוף</h3>
        <div class="card-body">
          <label>אתר, מחירון, תיק עבודות</label>
          <textarea id="setLinks" rows="3" placeholder='לינקים שהבוט יכול לשתף כשרלוונטי...'>${escapeHtml(t.websiteLinks)}</textarea>
          <p class="hint">הבוט ישתף את הלינקים האלה כשמתאים בשיחה</p>
          <button class="save-btn" style="margin-top:16px" onclick="saveSettings()">שמור</button>
          <span class="save-msg" id="saveMsgSettings">נשמר!</span>
        </div>
      </div>

      <div class="settings-card">
        <h3 style="cursor:default">מילות טריגר</h3>
        <div class="card-body">
          <p style="color:#888;font-size:13px;margin-bottom:12px;line-height:1.6">
            הוסף מילות CTA מהביו שלך. כשלקוח שולח את המילה בדיוק — הבוט שולח תשובה קבועה מיד (בלי AI).
          </p>
          <div id="triggerWordsList"></div>
          <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
            <input type="text" id="twWord" placeholder="מילת טריגר (למשל: אימון)" style="flex:1;min-width:120px;padding:10px 14px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px">
            <input type="text" id="twReply" placeholder="תשובה קבועה..." style="flex:2;min-width:200px;padding:10px 14px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px">
            <button onclick="addTriggerWord()" style="padding:10px 18px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;cursor:pointer;white-space:nowrap">+ הוסף</button>
          </div>
          <p class="hint" style="margin-top:8px">הלקוח צריך לשלוח את המילה בדיוק (לא כחלק ממשפט). מקסימום 20 מילות טריגר.</p>
        </div>
      </div>

      <div class="settings-card">
        <h3 style="cursor:default">מקסימום הודעות בוט</h3>
        <div class="card-body">
          <p style="color:#888;font-size:13px;margin-bottom:12px;line-height:1.6">
            כמה הודעות הבוט ישלח לפני שמסיים את השיחה. מתאים לשליטה על אורך השיחה.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="speed-btn${t.maxBotMessages === 3 ? ' active' : ''}" onclick="setMaxMessages(3)" style="padding:8px 16px;background:${t.maxBotMessages === 3 ? '#fff' : '#1a1a1a'};color:${t.maxBotMessages === 3 ? '#000' : '#ccc'};border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;font-size:13px">3 (מהיר)</button>
            <button class="speed-btn${t.maxBotMessages === 6 || !t.maxBotMessages ? ' active' : ''}" onclick="setMaxMessages(6)" style="padding:8px 16px;background:${t.maxBotMessages === 6 || !t.maxBotMessages ? '#fff' : '#1a1a1a'};color:${t.maxBotMessages === 6 || !t.maxBotMessages ? '#000' : '#ccc'};border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;font-size:13px">6 (רגיל)</button>
            <button class="speed-btn${t.maxBotMessages === 10 ? ' active' : ''}" onclick="setMaxMessages(10)" style="padding:8px 16px;background:${t.maxBotMessages === 10 ? '#fff' : '#1a1a1a'};color:${t.maxBotMessages === 10 ? '#000' : '#ccc'};border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;font-size:13px">10 (מעמיק)</button>
            <button class="speed-btn${t.maxBotMessages === 999 ? ' active' : ''}" onclick="setMaxMessages(999)" style="padding:8px 16px;background:${t.maxBotMessages === 999 ? '#fff' : '#1a1a1a'};color:${t.maxBotMessages === 999 ? '#000' : '#ccc'};border:1px solid rgba(255,255,255,0.08);border-radius:8px;cursor:pointer;font-size:13px">ללא הגבלה</button>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3 style="cursor:default">רשימת השתקה</h3>
        <div class="card-body">
          <p style="color:#888;font-size:13px;margin-bottom:12px;line-height:1.6">
            אנשים שהבוט לא יענה להם (חברים, משפחה וכו'). אפשר גם להשתיק מלשונית ״שיחות״.
          </p>
          <div id="ignoreChips" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px"></div>
          <div id="ignoreEmpty" style="display:none;color:#555;font-size:13px;padding:8px 0;margin-bottom:12px">אין אנשים מושתקים</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
            <input type="text" id="ignoreAddName" dir="rtl" placeholder="שם תצוגה..." style="flex:1;min-width:120px;padding:10px 14px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl;text-align:right">
            <span style="color:#555;font-size:13px">או</span>
            <input type="text" id="ignoreAddHandle" dir="ltr" placeholder="@username" style="flex:1;min-width:120px;padding:10px 14px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:ltr;text-align:left">
            <button onclick="addToIgnoreList()" style="padding:10px 18px;background:#dc2626;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer;white-space:nowrap">+ השתק</button>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3 style="cursor:default">System Prompt</h3>
        <div class="card-body">
          <p style="color:#888;font-size:13px;margin-bottom:12px;line-height:1.6">
            הגדר את ההוראות הבסיסיות לבוט ה-AI. הפרומפט הזה ישמש בכל השיחות.
          </p>
          <textarea id="systemPromptInput" rows="8" placeholder="כתוב את ה-system prompt כאן... לדוגמה: 'אתה נציג שירות לקוחות של חברת X. תענה בצורה מקצועית ונעימה...'" style="width:100%;padding:12px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:14px;direction:rtl;resize:vertical;box-sizing:border-box;min-height:120px;font-family:inherit">${escapeHtml(t.systemPrompt || '')}</textarea>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px">
            <span id="systemPromptCharCount" style="font-size:12px;color:#555">${(t.systemPrompt || '').length}/10000</span>
            <div style="display:flex;gap:8px;align-items:center">
              <span class="save-msg" id="saveMsgSystemPrompt">נשמר!</span>
              <button onclick="saveSystemPrompt()" style="padding:10px 20px;background:#fff;color:#000;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer">שמור</button>
            </div>
          </div>
        </div>
      </div>

      <div class="settings-card">
        <h3 style="cursor:default">מאגר ידע (Knowledge Base)</h3>
        <div class="card-body">
          <p style="color:#888;font-size:13px;margin-bottom:12px;line-height:1.6">
            העלה קבצי Markdown (.md) עם מידע על העסק שלך. הבוט ישתמש במידע הזה כדי לענות על שאלות.
          </p>
          <input type="file" id="knowledgeFilesInput" accept=".md" multiple style="display:none" onchange="handleKnowledgeFiles(this)">
          <div id="knowledgeDropZone" onclick="document.getElementById('knowledgeFilesInput').click()" style="border:2px dashed rgba(255,255,255,0.1);border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s">
            <div id="knowledgeUploadUI">
              <div style="margin-bottom:8px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg></div>
              <div style="color:#fff;font-size:14px;font-weight:500">לחץ כאן לבחירת קבצים</div>
              <div style="color:#666;font-size:12px;margin-top:6px">ניתן לבחור מספר קבצי .md בבת אחת</div>
            </div>
            <div id="knowledgeProgressUI" style="display:none;padding:8px 0">
              <div style="font-size:13px;font-weight:600;color:#888;margin-bottom:8px" id="knowledgeProgressText">מעלה קבצים...</div>
              <div style="height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden">
                <div id="knowledgeProgressBar" style="height:100%;background:#6ee7b7;border-radius:2px;transition:width 0.3s ease;width:0%"></div>
              </div>
            </div>
          </div>
          <div id="knowledgeFilesList" style="margin-top:16px"></div>
          <div id="knowledgeUploadResults" style="margin-top:12px;display:none"></div>
        </div>
      </div>
  </div>
</div>

<!-- VOICE DNA VIEW -->
<div id="view-voice-dna" class="view">
  <h2 class="view-header">Voice DNA</h2>
          <div style="margin-bottom:32px;background:#141414;border:1px solid rgba(255,255,255,0.06);border-radius:14px;padding:20px;max-width:600px">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
              <div style="width:32px;height:32px;border-radius:8px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg></div>
              <div>
                <div style="font-size:14px;font-weight:600;color:#F0F0F0">איך לייצא מידע מאינסטגרם</div>
                <div style="font-size:12px;color:#555">מדריך קצר שמראה צעד אחר צעד</div>
              </div>
            </div>
            <div style="position:relative;padding-bottom:56.25%;height:0;border-radius:10px;overflow:hidden"><iframe src="https://www.loom.com/embed/021fd95d9cf14d97ba1df46cd0083671" frameborder="0" webkitallowfullscreen mozallowfullscreen allowfullscreen style="position:absolute;top:0;left:0;width:100%;height:100%"></iframe></div>
          </div>
          <div id="voiceDnaScore" style="margin-bottom:16px"></div>
          <p style="color:#888;font-size:13px;margin-bottom:12px;line-height:1.6">
            העלה את קובץ הייצוא מאינסטגרם — המערכת תנתח את הסגנון שלך ותלמד את הבוט לדבר בדיוק כמוך.
          </p>
          <input type="file" id="voiceDnaFile" accept=".json,.zip,application/json,application/zip" style="display:none" onchange="handleVoiceFile(this)">
          <input type="file" id="voiceDnaFolder" webkitdirectory style="display:none" onchange="handleVoiceFolder(this)">
          <div id="voiceDropZone" style="border:2px dashed rgba(255,255,255,0.1);border-radius:12px;padding:32px 20px;text-align:center;cursor:pointer;transition:border-color 0.2s,background 0.2s">
            <div id="voiceUploadUI">
              <div style="margin-bottom:8px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg></div>
              <div style="color:#fff;font-size:14px;font-weight:500" id="voiceDropLabel">לחץ כאן להעלאת קובץ מאינסטגרם</div>
              <div style="display:flex;gap:12px;justify-content:center;margin-top:10px">
                <button type="button" onclick="event.stopPropagation();document.getElementById('voiceDnaFile').click()" style="background:#1a1a1a;color:#ccc;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px">העלאת קובץ ZIP</button>
                <button type="button" onclick="event.stopPropagation();document.getElementById('voiceDnaFolder').click()" style="background:#1a1a1a;color:#ccc;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 16px;cursor:pointer;font-size:13px">בחירת תיקייה</button>
              </div>
              <div style="color:#666;font-size:11px;margin-top:8px">ZIP, JSON, או תיקיית הייצוא שחולצה</div>
            </div>
            <div id="voiceProgressUI" style="display:none;padding:8px 0">
              <div style="font-size:13px;font-weight:600;color:#888;margin-bottom:16px;letter-spacing:0.5px" id="voiceProgressEmoji">PROCESSING</div>
              <div id="voiceSteps" style="text-align:right;max-width:260px;margin:0 auto"></div>
              <div style="margin-top:16px;height:3px;background:#1a1a1a;border-radius:2px;overflow:hidden">
                <div id="voiceProgressBar" style="height:100%;background:#6ee7b7;border-radius:2px;transition:width 0.6s ease;width:0%"></div>
              </div>
            </div>
          </div>
          <div id="voiceDnaResults" style="display:none;margin-top:16px;direction:rtl"></div>
</div>

<!-- BILLING VIEW hidden - all payments via bank transfer -->

</main><!-- end main-content -->

<!-- Chat Sidebar (persistent test chat) -->
<aside class="chat-sidebar">
  <div class="chat-sidebar-header">
    <h3>בדוק את הבוט</h3>
    <button class="reset-btn" onclick="resetChat()">איפוס</button>
  </div>
  <div class="scenarios">
    <button class="scenario-btn" onclick="sendScenario('היי')">היי</button>
    <button class="scenario-btn" onclick="sendScenario('כמה זה עולה?')">מחיר</button>
    <button class="scenario-btn" onclick="sendScenario('אתה בוט?')">מלכודת</button>
    <button class="scenario-btn" onclick="sendScenario('לא בטוח שזה בשבילי')">התנגדות</button>
    <button class="scenario-btn" onclick="sendScenario('רוצה לקבוע')">קביעה</button>
  </div>
  <div class="messages" id="chatMessages">
    <div class="message system">שלח הודעה כדי לבדוק את הבוט שלך</div>
  </div>
  <div class="input-area">
    <input type="text" id="chatInput" placeholder="כתוב הודעה..." onkeydown="if(event.key==='Enter')sendChat()">
    <button id="chatSend" onclick="sendChat()">שלח</button>
  </div>
</aside>

</div><!-- end app-layout -->

<!-- Memory Modal (fixed overlay, outside layout) -->
<div id="memoryModal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:9999;overflow-y:auto;padding:20px">
  <div style="max-width:700px;margin:0 auto;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:24px;direction:rtl">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
      <h2 style="font-size:18px;font-weight:700;color:#fff;margin:0">הזיכרון של הבוט</h2>
      <button onclick="closeMemoryView()" style="padding:6px 16px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#ccc;cursor:pointer;font-size:13px;font-family:inherit">סגור</button>
    </div>

    <div style="margin-bottom:20px;padding:16px;background:#161616;border:1px solid rgba(255,255,255,0.06);border-radius:10px">
      <h3 style="font-size:15px;font-weight:600;color:#F0F0F0;margin:0 0 12px">פרופיל קולי</h3>
      <div id="memoryVoiceContent" style="font-size:14px"></div>
    </div>

    <div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="font-size:15px;font-weight:600;color:#F0F0F0;margin:0">מאגר ידע</h3>
        <span id="memoryCount" style="font-size:12px;color:#555"></span>
      </div>
      <div style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap" id="memoryFilters"></div>
      <div id="memoryKnowledgeContent"></div>
    </div>
  </div>
</div>

<!-- Mobile chat toggle button -->
<button class="mobile-chat-toggle" onclick="toggleChatSidebar()"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg></button>
<div class="chat-sidebar-overlay" onclick="toggleChatSidebar()"></div>

<script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
<script>
const TENANT_ID = '${t.id}';
const CHAT_USER = 'dashboard-user';
const EXISTING_VOICE = ${JSON.stringify({
    voiceGreeting: t.voiceGreeting || '',
    voiceEnergy: t.voiceEnergy || '',
    voicePhrases: t.voicePhrases || '',
    voicePhrasesMale: t.voicePhrasesMale || '',
    voicePhrasesFemale: t.voicePhrasesFemale || '',
    voiceEmoji: t.voiceEmoji || '',
    voiceLength: t.voiceLength || '',
    voiceHumor: t.voiceHumor || '',
    voiceAvoid: t.voiceAvoid || '',
    slangWords: t.slangWords || '',
    voiceExamples: t.voiceExamples || '',
    voicePersonality: t.voicePersonality || '',
  }).replace(/</g, '\\x3c')};
const IG_CONNECTED = ${!!t.igAccessToken};

let conversationStrategy = ${JSON.stringify(t.conversationStrategy || null).replace(/</g, '\\x3c')};
let delayConfig = ${JSON.stringify(t.delayConfig || null).replace(/</g, '\\x3c')};

// --- Billing ---
async function loadBilling() {
  try {
    const res = await fetch('/api/app/billing');
    if (!res.ok) return;
    const b = await res.json();
    const banner = document.getElementById('billingBanner');
    const loading = document.getElementById('billingLoading');
    const content = document.getElementById('billingContent');
    const statusEl = document.getElementById('billingStatus');
    const usageEl = document.getElementById('billingUsage');
    const actionsEl = document.getElementById('billingActions');
    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    // Status badge
    const statusLabels = { trial: 'תקופת ניסיון', paid: 'מנוי פעיל', unpaid: 'לא פעיל', cancelled: 'מנוי בוטל' };
    const statusColors = { trial: '#eab308', paid: '#22c55e', unpaid: '#ef4444', cancelled: '#888' };
    const label = statusLabels[b.status] || b.status;
    const color = statusColors[b.status] || '#888';
    statusEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' + color + ';display:inline-block"></span>' +
      '<span style="font-weight:600;font-size:15px;color:' + color + '">' + label + '</span>' +
      '</div>' +
      (b.status === 'trial' ? '<div style="color:#ccc;font-size:13px">נשארו ' + b.trialDaysRemaining + ' ימים בתקופת הניסיון</div>' : '') +
      (b.status === 'paid' ? '<div style="color:#ccc;font-size:13px">$' + b.monthlyPayment + '/חודש</div>' : '');

    // Usage stats
    usageEl.innerHTML = '<div style="font-size:13px;color:#888;margin-bottom:8px">שימוש החודש</div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="color:#ccc">שיחות</span><span style="color:#fff;font-weight:600">' + b.conversationsThisMonth + '</span></div>' +
      (b.billingModel === 'per_conversation' ? '<div style="display:flex;justify-content:space-between"><span style="color:#ccc">עלות נוכחית</span><span style="color:#fff;font-weight:600">$' + b.projectedMonthlyCost.toFixed(2) + '</span></div>' : '');

    // Actions
    if (b.status === 'unpaid' || (b.status === 'trial' && b.trialDaysRemaining <= 3)) {
      actionsEl.innerHTML = '<button onclick="startCheckout()" style="width:100%;padding:12px;background:#22c55e;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">שדרג עכשיו — $' + b.monthlyPayment + '/חודש</button>';
    } else if (b.status === 'trial') {
      actionsEl.innerHTML = '<button onclick="startCheckout()" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">שדרג עכשיו — $' + b.monthlyPayment + '/חודש</button>';
    } else if (b.status === 'paid') {
      actionsEl.innerHTML = '<button onclick="cancelBilling()" style="width:100%;padding:10px;background:transparent;color:#888;border:1px solid rgba(255,255,255,0.08);border-radius:8px;font-size:13px;cursor:pointer">בטל מנוי</button>';
    } else if (b.status === 'cancelled') {
      actionsEl.innerHTML = '<button onclick="startCheckout()" style="width:100%;padding:12px;background:#fff;color:#000;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">חדש מנוי</button>';
    } else {
      actionsEl.innerHTML = '';
    }

    // Trial banner
    if (banner) {
      if (b.status === 'trial' && b.trialDaysRemaining <= 3 && b.trialDaysRemaining > 0) {
        banner.style.display = 'block';
        banner.innerHTML = 'תקופת הניסיון שלך מסתיימת בעוד ' + b.trialDaysRemaining + ' ימים — <a href="#" onclick="startCheckout();return false" style="color:#fff;text-decoration:underline;margin-right:8px">שדרג כדי להמשיך</a>';
      } else if (b.status === 'unpaid' || (b.status === 'trial' && b.trialDaysRemaining === 0)) {
        banner.style.display = 'block';
        banner.style.background = '#7f1d1d';
        banner.style.color = '#fca5a5';
        banner.innerHTML = 'תקופת הניסיון הסתיימה — הבוט מושבת. <a href="#" onclick="startCheckout();return false" style="color:#fff;text-decoration:underline;margin-right:8px">שדרג עכשיו</a>';
      } else {
        banner.style.display = 'none';
      }
    }
  } catch (e) { console.error('Billing load error:', e); }
}

async function startCheckout() {
  try {
    const res = await fetch('/api/app/billing/checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'שגיאה ביצירת עמוד תשלום');
      return;
    }
    const data = await res.json();
    if (data.checkoutUrl) window.location.href = data.checkoutUrl;
  } catch (e) {
    alert('שגיאה בחיבור לשרת התשלומים');
    console.error('Checkout error:', e);
  }
}

async function cancelBilling() {
  if (!confirm('בטוח שברצונך לבטל את המנוי? הגישה תישמר עד סוף תקופת החיוב.')) return;
  try {
    const res = await fetch('/api/app/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    if (res.ok) {
      alert('המנוי בוטל. הגישה תישמר עד סוף תקופת החיוב.');
      loadBilling();
    } else {
      const err = await res.json().catch(() => ({}));
      alert(err.error || 'שגיאה בביטול');
    }
  } catch (e) { alert('שגיאה בחיבור לשרת'); }
}

// Billing disabled - all payments via bank transfer
// setTimeout(loadBilling, 500);

// Check for billing success redirect (disabled)
if (false && window.location.search.includes('billing=success')) {
  setTimeout(() => {
    const banner = document.getElementById('billingBanner');
    if (banner) {
      banner.style.display = 'block';
      banner.style.background = '#166534';
      banner.style.color = '#86efac';
      banner.innerHTML = 'התשלום בוצע בהצלחה! המנוי שלך פעיל.';
      setTimeout(() => { banner.style.display = 'none'; }, 5000);
    }
    loadBilling();
    history.replaceState(null, '', '/app');
  }, 300);
}

async function toggleBot(active) {
  try {
    const res = await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ botActive: active }) });
    if (res.ok) {
      const s = document.getElementById('botStatusText');
      if (s) { s.textContent = active ? 'פעיל' : 'כבוי'; s.style.color = active ? '#22c55e' : '#ef4444'; }
      const topToggle = document.getElementById('botToggle');
      const settingsToggle = document.getElementById('botToggleSettings');
      if (topToggle) topToggle.checked = active;
      if (settingsToggle) settingsToggle.checked = active;
    }
  } catch (e) { console.error('Toggle error:', e); }
}

async function toggleAI(enabled) {
  try {
    const res = await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aiEnabled: enabled }) });
    if (res.ok) {
      const s = document.getElementById('aiStatusText');
      if (s) { s.textContent = enabled ? 'שירות AI פעיל' : 'שירות AI כבוי'; }
      const toggle = document.getElementById('aiToggleSettings');
      if (toggle) {
        toggle.checked = enabled;
        toggle.nextElementSibling.style.background = enabled ? '#3b82f6' : '#333';
      }
    }
  } catch (e) { console.error('AI Toggle error:', e); }
}

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('view-' + view);
  if (el) el.classList.add('active');
  const btn = document.querySelector('.nav-item[data-view="' + view + '"]');
  if (btn) btn.classList.add('active');
  if (view === 'leads') loadLeads();
  if (view === 'billing') loadBilling();
}
// Backward-compatible wrapper
function switchTab(tab) {
  const viewMap = { personality: 'home', leads: 'leads', test: null, settings: 'settings' };
  const view = viewMap[tab] !== undefined ? viewMap[tab] : tab;
  if (view) switchView(view);
}
function toggleChatSidebar() {
  document.querySelector('.chat-sidebar').classList.toggle('open');
  document.querySelector('.chat-sidebar-overlay').classList.toggle('open');
}

// --- Chat ---
async function sendChat() {
  const input = document.getElementById('chatInput');
  const msg = input.value.trim();
  if (!msg) return;
  input.value = '';
  addMessage('chatMessages', msg, 'user');
  document.getElementById('chatSend').disabled = true;
  try {
    const res = await fetch('/api/app/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: msg, userId: CHAT_USER }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    addMessage('chatMessages', data.reply, 'assistant');
    addFeedbackRow('chatMessages');
  } catch (e) { addMessage('chatMessages', 'שגיאה: ' + e.message, 'system'); }
  document.getElementById('chatSend').disabled = false;
}

async function resetChat() {
  await fetch('/api/app/chat/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: CHAT_USER }) });
  document.getElementById('chatMessages').innerHTML = '<div class="message system">השיחה אופסה</div>';
}

function addMessage(containerId, text, role) {
  const c = document.getElementById(containerId);
  const sysMsg = c.querySelector('.message.system:first-child');
  if (sysMsg && role !== 'system') sysMsg.remove();
  const d = document.createElement('div');
  d.className = 'message ' + role;
  d.textContent = text;
  c.appendChild(d);
  c.scrollTop = c.scrollHeight;
}

function addFeedbackRow(containerId) {
  const c = document.getElementById(containerId);
  const row = document.createElement('div');
  row.className = 'feedback-row';
  [{ label: 'ידע שגוי', cat: 'corrections' }, { label: 'טון/סגנון', cat: 'tone' }, { label: 'חוק חדש', cat: 'rules' }].forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'fb-btn';
    btn.textContent = t.label;
    btn.onclick = () => handleFeedback(btn, t.cat);
    row.appendChild(btn);
  });
  c.appendChild(row);
  c.scrollTop = c.scrollHeight;
}

function handleFeedback(btn, category) {
  const correction = prompt(category === 'rules' ? 'כתוב את החוק החדש:' : 'מה צריך לתקן?');
  if (!correction) return;
  fetch('/api/app/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, content: correction, title: category === 'rules' ? '' : 'תיקון מהצ\\'אט' }) }).then(() => { btn.classList.add('sent'); btn.textContent = 'נשמר!'; });
}

function sendScenario(text) { document.getElementById('chatInput').value = text; sendChat(); }

// --- Teaching Chat ---
let teachingHistory = [];
let teachingScreenshotData = null;

async function sendTeaching() {
  const input = document.getElementById('teachingInput');
  let message = input.value.trim();

  // If in style training mode and user typed a custom response
  if (styleTrainingIndex >= 0 && message && input.dataset.scenarioIndex) {
    const idx = parseInt(input.dataset.scenarioIndex);
    input.value = '';
    input.placeholder = 'לדוגמה: "מחיר פגישה 200 שקל"';
    delete input.dataset.scenarioIndex;
    pickStyleResponse(idx, message);
    return;
  }

  if (teachingScreenshotData) {
    message = '[תמונה שהועלתה — המידע שנמצא:]\\n' + teachingScreenshotData.extracted + (message ? '\\n\\n' + message : '');
  }
  if (!message) return;
  input.value = '';
  clearTeachingScreenshot();

  addTeachingMessage(message.length > 200 ? message.slice(0, 200) + '...' : message, 'user');
  teachingHistory.push({ role: 'user', content: message });

  const btn = document.getElementById('teachingSendBtn');
  btn.disabled = true; btn.textContent = '...';

  try {
    const res = await fetch('/api/app/teach-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, conversationHistory: teachingHistory.slice(-10) })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addTeachingMessage(data.reply, 'assistant');
    teachingHistory.push({ role: 'assistant', content: data.reply });

    if (data.actions && data.actions.length > 0) {
      const actionText = data.actions.map(a => a.type === 'add_knowledge' ? 'נשמר למאגר' : a.type === 'update_voice' ? 'פרופיל עודכן' : '').filter(Boolean).join(' | ');
      if (actionText) addTeachingMessage(actionText, 'action');
    }
  } catch (err) {
    addTeachingMessage('שגיאה: ' + err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'שלח';
}

function addTeachingMessage(text, role) {
  const container = document.getElementById('teachingMessages');
  const sysMsg = container.querySelector('.teach-system-msg');
  if (sysMsg && role !== 'error') sysMsg.remove();

  const div = document.createElement('div');
  if (role === 'user') {
    div.style.cssText = 'align-self:flex-start;background:#3b82f6;color:#fff;padding:10px 14px;border-radius:16px 16px 4px 16px;max-width:80%;font-size:14px;line-height:1.5;word-break:break-word';
  } else if (role === 'assistant') {
    div.style.cssText = 'align-self:flex-end;background:#1a1a1a;color:#ddd;padding:10px 14px;border-radius:16px 16px 16px 4px;max-width:80%;font-size:14px;line-height:1.5;word-break:break-word;border:1px solid rgba(255,255,255,0.08)';
  } else if (role === 'action') {
    div.style.cssText = 'align-self:center;color:#22c55e;font-size:12px;padding:4px 12px;background:#0a1a0a;border:1px solid #1a3a1a;border-radius:12px';
  } else {
    div.style.cssText = 'align-self:center;color:#ef4444;font-size:13px';
  }
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function sendTeachingExample(msg) {
  document.getElementById('teachingInput').value = msg;
  sendTeaching();
}

// --- Style Training (Voice Quiz) ---
const STYLE_SCENARIOS = [
  { customer: 'מה קורה', options: ['מה קורה בוס!', 'היי מה נשמע?', 'אהלן! הכל טוב?'] },
  { customer: 'כמה עולה?', options: ['תלוי, בוא נדבר', 'שאלה טובה, מה מעניין אותך?', 'בוא נקבע שיחה ונעבור על הכל'] },
  { customer: 'ספר לי על השירות', options: ['בטח! מה הכי מעניין אותך?', 'בוא נקבע שיחה ואפרט', 'בגדול אנחנו עוזרים ב...'] },
  { customer: 'יקר לי', options: ['מבין, בוא נראה מה מתאים', 'ההשקעה מחזירה את עצמה', 'סבבה, תחשוב ותחזור'] },
  { customer: 'אני לא בטוח שזה בשבילי', options: ['בוא נבדוק ביחד', 'בלי לחץ, בוא לשיחה', 'מה מרגיש שחסר?'] },
  { customer: 'תודה!', options: ['בכיף!', 'תענוג, נדבר!', 'שמח לעזור!'] },
];
let styleTrainingIndex = -1;

function startStyleTraining() {
  styleTrainingIndex = 0;
  // Clear chat
  const container = document.getElementById('teachingMessages');
  container.innerHTML = '';
  teachingHistory = [];
  addTeachingMessage('יאללה, בוא נתרגל! אני אראה לך הודעות של לקוחות ואתה תבחר איך היית עונה', 'assistant');
  setTimeout(() => showScenario(0), 600);
}

function showScenario(index) {
  if (index >= STYLE_SCENARIOS.length) {
    addTeachingMessage('סיימנו! הבוט שלך למד את הסגנון שלך', 'assistant');
    styleTrainingIndex = -1;
    return;
  }
  styleTrainingIndex = index;
  const scenario = STYLE_SCENARIOS[index];
  const container = document.getElementById('teachingMessages');

  // Customer message bubble
  const customerDiv = document.createElement('div');
  customerDiv.style.cssText = 'align-self:flex-start;background:#333;color:#fff;padding:10px 14px;border-radius:16px 16px 4px 16px;max-width:80%;font-size:14px;line-height:1.5';
  customerDiv.textContent = 'לקוח כתב: "' + scenario.customer + '"';
  container.appendChild(customerDiv);

  // Prompt
  const promptDiv = document.createElement('div');
  promptDiv.style.cssText = 'align-self:flex-end;color:#888;font-size:13px;margin-top:4px';
  promptDiv.textContent = 'איך היית עונה?';
  container.appendChild(promptDiv);

  // Response option chips
  const chipsDiv = document.createElement('div');
  chipsDiv.id = 'scenarioChips';
  chipsDiv.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;justify-content:flex-end';
  scenario.options.forEach(opt => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.style.cssText = 'padding:8px 14px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:16px;color:#ccc;font-size:13px;cursor:pointer;direction:rtl;transition:all 0.15s';
    btn.onmouseenter = () => { btn.style.background = '#222'; btn.style.borderColor = 'rgba(255,255,255,0.15)'; };
    btn.onmouseleave = () => { btn.style.background = '#1a1a1a'; btn.style.borderColor = 'rgba(255,255,255,0.08)'; };
    btn.onclick = () => pickStyleResponse(index, opt);
    chipsDiv.appendChild(btn);
  });
  // "Write your own" chip
  const customBtn = document.createElement('button');
  customBtn.textContent = 'תשובה משלך';
  customBtn.style.cssText = 'padding:8px 14px;background:#111;border:1px solid rgba(255,255,255,0.08);border-radius:16px;color:#666;font-size:13px;cursor:pointer';
  customBtn.onclick = () => {
    const input = document.getElementById('teachingInput');
    input.focus();
    input.placeholder = 'כת��ב איך היית עונה ל"' + scenario.customer + '"...';
    input.dataset.scenarioIndex = index;
  };
  chipsDiv.appendChild(customBtn);
  container.appendChild(chipsDiv);
  container.scrollTop = container.scrollHeight;
}

async function pickStyleResponse(scenarioIndex, response) {
  const scenario = STYLE_SCENARIOS[scenarioIndex];
  // Remove the chips
  const chips = document.getElementById('scenarioChips');
  if (chips) chips.remove();

  // Show the picked response as user message
  addTeachingMessage(response, 'user');

  // Send to teach-chat as a style instruction
  const teachMsg = 'כשלקוח אומר "' + scenario.customer + '", אני עונה ככה: "' + response + '"';
  teachingHistory.push({ role: 'user', content: teachMsg });

  const btn = document.getElementById('teachingSendBtn');
  btn.disabled = true; btn.textContent = '...';

  try {
    const res = await fetch('/api/app/teach-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: teachMsg, conversationHistory: teachingHistory.slice(-10) })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    addTeachingMessage(data.reply, 'assistant');
    teachingHistory.push({ role: 'assistant', content: data.reply });

    if (data.actions && data.actions.length > 0) {
      const actionText = data.actions.map(a => a.type === 'add_knowledge' ? 'נשמר' : a.type === 'update_voice' ? 'עודכן' : '').filter(Boolean).join(' | ');
      if (actionText) addTeachingMessage(actionText, 'action');
    }
  } catch (err) {
    addTeachingMessage('שגיאה: ' + err.message, 'error');
  }
  btn.disabled = false; btn.textContent = 'שלח';

  // Advance to next scenario after a short delay
  setTimeout(() => showScenario(scenarioIndex + 1), 800);
}

// --- Screenshot in Teaching Chat ---
async function handleTeachingImage(input) {
  const file = input.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('נא להעלות תמונה בלבד');
  if (file.size > 8 * 1024 * 1024) return alert('תמונה גדולה מדי (מקסימום 8MB)');
  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result.split(',')[1];
    document.getElementById('teachingScreenshotPreview').src = e.target.result;
    document.getElementById('teachingScreenshotPreview').style.display = 'block';
    document.getElementById('teachingScreenshotZone').style.display = 'block';
    document.getElementById('teachingScreenshotLabel').textContent = 'מחלץ מידע מהתמונה...';
    try {
      const res = await fetch('/api/app/screenshot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: base64, mimeType: file.type }) });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      teachingScreenshotData = { extracted: data.content };
      document.getElementById('teachingScreenshotLabel').innerHTML = '<span style="color:#22c55e">מידע חולץ</span> — לחץ שלח כדי לשמור';
    } catch (err) {
      document.getElementById('teachingScreenshotLabel').textContent = 'שגיאה: ' + err.message;
      document.getElementById('teachingScreenshotLabel').style.color = '#ef4444';
    }
  };
  reader.readAsDataURL(file);
}

function clearTeachingScreenshot() {
  teachingScreenshotData = null;
  document.getElementById('teachingImageInput').value = '';
  document.getElementById('teachingScreenshotZone').style.display = 'none';
  document.getElementById('teachingScreenshotPreview').style.display = 'none';
}

// --- CTA Settings ---
function onCtaTypeChange() {
  const type = document.getElementById('vcCtaType').value;
  document.getElementById('ctaLinkField').style.display = type === 'send_link' ? '' : 'none';
  document.getElementById('ctaPhoneField').style.display = type === 'give_phone' ? '' : 'none';
  document.getElementById('ctaCustomField').style.display = type === 'custom' ? '' : 'none';
  document.getElementById('ctaExtra').style.display = (type === 'ask_phone') ? 'none' : '';
  saveVoiceControl();
}

// --- Memory View ---
const MEM_CATEGORIES = {
  sop: { label: 'תהליך מכירה', icon: 'SOP', color: '#3b82f6' },
  objections: { label: 'התנגדויות', icon: 'OBJ', color: '#8b5cf6' },
  faq: { label: 'שאלות נפוצות', icon: 'FAQ', color: '#22c55e' },
  tone: { label: 'סגנון', icon: 'TN', color: '#f59e0b' },
  scripts: { label: 'תסריטים', icon: 'SC', color: '#06b6d4' },
  general: { label: 'כללי', icon: 'GEN', color: '#888' },
  rules: { label: 'חוקים', icon: 'RULE', color: '#ef4444' },
  corrections: { label: 'תיקונים', icon: 'FIX', color: '#f97316' },
};

// --- Voice Quick Controls ---
async function saveVoiceControl() {
  const ctaType = document.getElementById('vcCtaType').value;
  const body = {
    botGender: document.getElementById('vcGender').value,
    voiceEnergy: document.getElementById('vcEnergy').value,
    voiceLength: document.getElementById('vcLength').value,
    voiceEmoji: document.getElementById('vcEmoji').value,
    voiceHumor: document.getElementById('vcHumor').value,
    ctaPushLevel: document.getElementById('vcCtaPush').value,
    ctaType,
    customFlowInstructions: document.getElementById('customFlowInput').value,
  };
  if (ctaType === 'send_link') body.bookingInstructions = document.getElementById('ctaBookingLink').value;
  if (ctaType === 'give_phone') body.ownerPhone = document.getElementById('ctaOwnerPhone').value;
  if (ctaType === 'custom') body.ctaCustomText = document.getElementById('ctaCustomText').value;
  try {
    await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch (e) { console.error('Voice control save failed:', e); }
}

// --- Delay Config ---
const DELAY_HINTS = {
  instant: 'תשובה כמעט מיידית — מתאים לתמיכה טכנית',
  fast: 'תשובה מהירה — כמו מישהו שמחכה עם הטלפון ביד',
  natural: 'הכי טבעי — כמו בן אדם אמיתי שקורא ומקליד (ברירת מחדל)',
  slow: 'תשובה איטית — כמו מישהו עסוק שעונה בין פגישות',
  custom: 'הגדרות מותאמות אישית — שליטה מלאה בכל ההשהיות',
};
const DELAY_PRESET_VALUES = {
  instant:  { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
  fast:     { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
  natural:  { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
  slow:     { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
};

function updateDelayLabel(el, labelId) {
  document.getElementById(labelId).textContent = (el.value / 1000).toFixed(1) + 's';
}

function updateDelayHint() {
  const preset = document.getElementById('delayPreset').value;
  document.getElementById('delayHint').textContent = DELAY_HINTS[preset] || '';
  document.getElementById('delayCustomPanel').style.display = preset === 'custom' ? '' : 'none';
  if (preset !== 'custom') {
    const vals = DELAY_PRESET_VALUES[preset] || DELAY_PRESET_VALUES.natural;
    document.getElementById('delayFirstMin').value = vals.firstReplyMin;
    document.getElementById('delayFirstMax').value = vals.firstReplyMax;
    document.getElementById('delayFollowMin').value = vals.followUpMin;
    document.getElementById('delayFollowMax').value = vals.followUpMax;
    document.getElementById('delaySplit').value = vals.splitDelay;
    document.getElementById('delayDebounce').value = vals.debounce;
    document.getElementById('delayReadingFactor').checked = vals.readingFactor;
    document.getElementById('delayTypingFactor').checked = vals.typingFactor;
    ['delayFirstMin','delayFirstMax','delayFollowMin','delayFollowMax','delaySplit','delayDebounce'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) updateDelayLabel(el, id + 'L');
    });
  }
}

async function saveDelayConfig() {
  const preset = document.getElementById('delayPreset').value;
  updateDelayHint();
  var config = { preset: preset };
  if (preset === 'custom') {
    config.firstReplyMin = parseInt(document.getElementById('delayFirstMin').value);
    config.firstReplyMax = parseInt(document.getElementById('delayFirstMax').value);
    config.followUpMin = parseInt(document.getElementById('delayFollowMin').value);
    config.followUpMax = parseInt(document.getElementById('delayFollowMax').value);
    config.splitDelay = parseInt(document.getElementById('delaySplit').value);
    config.debounce = parseInt(document.getElementById('delayDebounce').value);
    config.readingFactor = document.getElementById('delayReadingFactor').checked;
    config.typingFactor = document.getElementById('delayTypingFactor').checked;
  }
  delayConfig = config;
  try {
    await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delayConfig: config }) });
  } catch (e) { console.error('Delay config save failed:', e); }
}

// Init delay hint on load
document.addEventListener('DOMContentLoaded', function() { updateDelayHint(); });

// --- Conversation Strategy Editor ---
const SPEED_LABELS = { quick: 'שיחה קצרה — שאלה אחת ו-CTA מהיר (2 הודעות)', balanced: 'מאוזנת — 2-3 שאלות לפני CTA', deep: 'מעמיקה — 4-5 שאלות, בניית אמון' };

function initStrategyEditor() {
  if (!conversationStrategy) return;
  renderStrategyQuestions();
  renderStrategyQA();
  renderHandlingPatterns();
  updateSpeedHint();
}

function updateSpeedHint() {
  const hint = document.getElementById('speedHint');
  if (hint && conversationStrategy) {
    hint.textContent = SPEED_LABELS[conversationStrategy.speed] || SPEED_LABELS.balanced;
  }
}

function setSpeed(speed) {
  if (!conversationStrategy) conversationStrategy = { speed, questions: [], commonQA: [] };
  conversationStrategy.speed = speed;
  document.querySelectorAll('.speed-btn').forEach(b => b.classList.toggle('active', b.dataset.speed === speed));
  updateSpeedHint();
  saveStrategy();
}

function renderStrategyQuestions() {
  const el = document.getElementById('strategyQuestionsList');
  if (!el || !conversationStrategy?.questions?.length) {
    if (el) el.innerHTML = '<div style="color:#555;font-size:13px;padding:6px 0">אין שאלות עדיין</div>';
    return;
  }
  el.innerHTML = conversationStrategy.questions.map(function(q, i) {
    return '<div class="sq-item">' +
      '<span class="sq-label">' + escapeHtmlJS(q.label) + '</span>' +
      '<span class="sq-prompt">' + escapeHtmlJS(q.prompt) + '</span>' +
      '<span class="sq-actions">' +
        (i > 0 ? '<button class="sq-btn" onclick="moveQuestion(' + i + ',-1)" title="הזז למעלה">▲</button>' : '') +
        (i < conversationStrategy.questions.length - 1 ? '<button class="sq-btn" onclick="moveQuestion(' + i + ',1)" title="הזז למטה">▼</button>' : '') +
        '<button class="sq-btn" onclick="removeQuestion(' + i + ')" title="מחק" style="color:#ef4444">x</button>' +
      '</span>' +
    '</div>';
  }).join('');
}

function addStrategyQuestion() {
  const labelEl = document.getElementById('newQuestionLabel');
  const promptEl = document.getElementById('newQuestionPrompt');
  const label = labelEl.value.trim();
  const prompt = promptEl.value.trim();
  if (!label || !prompt) { alert('נא למלא שם ושאלה'); return; }
  if (!conversationStrategy) conversationStrategy = { speed: 'balanced', questions: [], commonQA: [] };
  if (conversationStrategy.questions.length >= 6) { alert('מקסימום 6 שאלות'); return; }
  const id = label.toLowerCase().replace(/[^a-z0-9א-ת]/g, '_').slice(0, 20) || 'q' + Date.now();
  conversationStrategy.questions.push({ id, label, prompt, required: false });
  labelEl.value = '';
  promptEl.value = '';
  renderStrategyQuestions();
  saveStrategy();
  showStrategyEmptyOrEditor();
}

function removeQuestion(index) {
  conversationStrategy.questions.splice(index, 1);
  renderStrategyQuestions();
  saveStrategy();
  showStrategyEmptyOrEditor();
}

function moveQuestion(index, direction) {
  const arr = conversationStrategy.questions;
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= arr.length) return;
  [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
  renderStrategyQuestions();
  saveStrategy();
}

function renderStrategyQA() {
  const el = document.getElementById('strategyQAList');
  if (!el || !conversationStrategy?.commonQA?.length) {
    if (el) el.innerHTML = '<div style="color:#555;font-size:13px;padding:6px 0">אין שאלות ותשובות נפוצות</div>';
    return;
  }
  el.innerHTML = conversationStrategy.commonQA.map(function(qa, i) {
    return '<div class="sqa-item">' +
      '<span class="sqa-q">' + escapeHtmlJS(qa.q) + '</span>' +
      '<span class="sqa-a">' + escapeHtmlJS(qa.a) + '</span>' +
      '<button class="sq-btn" onclick="removeQA(' + i + ')" title="מחק" style="color:#ef4444">x</button>' +
    '</div>';
  }).join('');
}

function addStrategyQA() {
  const qEl = document.getElementById('newQAQuestion');
  const aEl = document.getElementById('newQAAnswer');
  const q = qEl.value.trim();
  const a = aEl.value.trim();
  if (!q || !a) { alert('נא למלא שאלה ותשובה'); return; }
  if (!conversationStrategy) conversationStrategy = { speed: 'balanced', questions: [], commonQA: [] };
  if (!conversationStrategy.commonQA) conversationStrategy.commonQA = [];
  if (conversationStrategy.commonQA.length >= 10) { alert('מקסימום 10 שאלות ותשובות'); return; }
  conversationStrategy.commonQA.push({ q, a });
  qEl.value = '';
  aEl.value = '';
  renderStrategyQA();
  saveStrategy();
}

function removeQA(index) {
  conversationStrategy.commonQA.splice(index, 1);
  renderStrategyQA();
  saveStrategy();
}

function renderHandlingPatterns() {
  const el = document.getElementById('handlingPatternsList');
  if (!el || !conversationStrategy?.handlingPatterns?.length) {
    if (el) el.innerHTML = '<div style="color:#555;font-size:13px;padding:6px 0">לא הוגדרו דפוסי תגובה — <a href="/wizard" style="color:#8b5cf6">הפעל אשף</a></div>';
    return;
  }
  el.innerHTML = conversationStrategy.handlingPatterns.map(function(hp, i) {
    return '<div class="sqa-item">' +
      '<span class="sqa-q">' + escapeHtmlJS(hp.situation) + '</span>' +
      '<span class="sqa-a">' + escapeHtmlJS(hp.response) + '</span>' +
      '<button class="sq-btn" onclick="removeHandlingPattern(' + i + ')" title="מחק" style="color:#ef4444">x</button>' +
    '</div>';
  }).join('');
}

function removeHandlingPattern(index) {
  if (!conversationStrategy?.handlingPatterns) return;
  conversationStrategy.handlingPatterns.splice(index, 1);
  renderHandlingPatterns();
  saveStrategy();
}

function showStrategyEmptyOrEditor() {
  const hasStrategy = conversationStrategy?.questions?.length > 0 || conversationStrategy?.handlingPatterns?.length > 0;
  document.getElementById('strategyEmpty').style.display = hasStrategy ? 'none' : '';
  document.getElementById('strategyEditor').style.display = hasStrategy ? '' : 'none';
}

async function saveStrategy() {
  try {
    await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationStrategy }) });
    const msg = document.getElementById('strategySaveMsg');
    if (msg) { msg.style.opacity = '1'; setTimeout(() => { msg.style.opacity = '0'; }, 2000); }
  } catch (e) { console.error('Strategy save failed:', e); }
}

// Init on load
initStrategyEditor();

async function openMemoryView() {
  document.getElementById('memoryModal').style.display = 'block';
  document.body.style.overflow = 'hidden';
  await loadMemoryView();
}

function closeMemoryView() {
  document.getElementById('memoryModal').style.display = 'none';
  document.body.style.overflow = '';
}

async function loadMemoryView() {
  try {
    const [settingsRes, kbRes] = await Promise.all([
      fetch('/api/app/settings'),
      fetch('/api/app/knowledge')
    ]);
    const settings = await settingsRes.json();
    const entries = await kbRes.json();
    renderVoiceMemory(settings);
    renderKnowledgeMemory(entries);
  } catch (err) { console.error('Memory load failed:', err); }
}

function renderVoiceMemory(s) {
  const fields = [
    { key: 'voiceGreeting', label: 'ברכה' },
    { key: 'voiceEnergy', label: 'אנרגיה', map: { chill:'רגוע', warm:'חם', 'high-energy':'אנרגטי', professional:'מקצועי' } },
    { key: 'voicePhrases', label: 'ביטויים' },
    { key: 'voicePhrasesMale', label: 'פנייה לבנים' },
    { key: 'voicePhrasesFemale', label: 'פנייה לבנות' },
    { key: 'botGender', label: 'מגדר הבוט', map: { male:'זכר', female:'נקבה' } },
    { key: 'voiceEmoji', label: 'אימוג\\'י', map: { never:'אף פעם', sometimes:'פה ושם', 'a-lot':'הרבה' } },
    { key: 'voiceLength', label: 'אורך', map: { 'super-short':'סופר קצר', normal:'רגיל', detailed:'מפורט' } },
    { key: 'voiceHumor', label: 'הומור', map: { none:'בלי', light:'קליל', dry:'יבש', memes:'מימים' } },
    { key: 'voiceAvoid', label: 'לא להגיד' },
    { key: 'customFirstReply', label: 'תגובה ראשונה' },
    { key: 'slangWords', label: 'סלנג' },
    { key: 'voiceExamples', label: 'Voice DNA' },
  ];
  const html = fields.filter(f => s[f.key]).map(f => {
    const val = (f.map && f.map[s[f.key]]) || s[f.key];
    return '<div class="memory-voice-row"><span class="memory-voice-label">' + f.label + '</span><span class="memory-voice-value" contenteditable="true" data-field="' + f.key + '" onblur="updateVoiceField(\\'' + f.key + '\\',this.textContent)">' + escapeHtmlJS(val) + '</span></div>';
  }).join('');
  document.getElementById('memoryVoiceContent').innerHTML = html || '<div style="color:#555;font-size:13px">עדיין לא הגדרת פרופיל קולי. ספר לי בצ\\'אט איך אתה מדבר!</div>';
}

async function updateVoiceField(field, value) {
  try { await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value.trim() }) }); }
  catch (err) { alert('שגיאה: ' + err.message); }
}

function renderKnowledgeMemory(entries) {
  document.getElementById('memoryCount').textContent = entries.length + ' רשומות';
  const filterBtns = ['<button class="filter-btn active" onclick="filterMemory(\\'all\\',this)">הכל (' + entries.length + ')</button>'];
  for (const [key, val] of Object.entries(MEM_CATEGORIES)) {
    const count = entries.filter(e => e.category === key).length;
    if (count > 0) filterBtns.push('<button class="filter-btn" onclick="filterMemory(\\'' + key + '\\',this)">' + val.icon + ' ' + val.label + ' (' + count + ')</button>');
  }
  document.getElementById('memoryFilters').innerHTML = filterBtns.join('');

  const html = entries.map(e => {
    const cat = MEM_CATEGORIES[e.category] || MEM_CATEGORIES.general;
    return '<div class="memory-entry" data-category="' + e.category + '" data-id="' + e.id + '">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
        '<span style="font-size:12px;color:' + cat.color + '">' + cat.icon + ' ' + cat.label + '</span>' +
        '<button onclick="deleteMemoryEntry(\\'' + e.id + '\\')" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 4px" title="מחק">x</button>' +
      '</div>' +
      (e.title ? '<div style="font-weight:600;margin-bottom:4px;font-size:14px;color:#ddd" contenteditable="true" onblur="updateEntryField(\\'' + e.id + '\\',\\'title\\',this.textContent)">' + escapeHtmlJS(e.title) + '</div>' : '') +
      '<div style="color:#bbb;font-size:13px;line-height:1.5;white-space:pre-wrap" contenteditable="true" onblur="updateEntryField(\\'' + e.id + '\\',\\'content\\',this.textContent)">' + escapeHtmlJS(e.content) + '</div>' +
      '<div style="font-size:11px;color:#444;margin-top:6px">' + (e.createdAt ? new Date(e.createdAt).toLocaleDateString('he-IL') : '') + '</div>' +
    '</div>';
  }).join('');
  document.getElementById('memoryKnowledgeContent').innerHTML = html || '<div style="color:#555;padding:20px;text-align:center;font-size:13px">אין ידע עדיין. ספר לי בצ\\'אט מה הבוט צריך לדעת!</div>';
}

function filterMemory(cat, btn) {
  document.querySelectorAll('#memoryFilters .filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  document.querySelectorAll('.memory-entry').forEach(e => { e.style.display = (cat === 'all' || e.dataset.category === cat) ? '' : 'none'; });
}

async function updateEntryField(id, field, value) {
  try { await fetch('/api/app/knowledge/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: value.trim() }) }); }
  catch (err) { alert('שגיאה: ' + err.message); }
}

async function deleteMemoryEntry(id) {
  if (!confirm('למחוק את הרשומה?')) return;
  try { await fetch('/api/app/knowledge/' + id, { method: 'DELETE' }); document.querySelector('.memory-entry[data-id="' + id + '"]').remove(); }
  catch (err) { alert('שגיאה: ' + err.message); }
}

// --- Ignore List (blacklist) ---
var ignoreListEntries = ${JSON.stringify(ignoreLines)};

function renderIgnoreChips() {
  var container = document.getElementById('ignoreChips');
  var empty = document.getElementById('ignoreEmpty');
  if (!ignoreListEntries.length) {
    container.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  container.innerHTML = ignoreListEntries.map(function(entry, i) {
    var isHandle = entry.startsWith('@');
    var display = isHandle ? entry : entry;
    var typeLabel = isHandle ? 'handle' : 'שם';
    var dir = isHandle ? 'ltr' : 'rtl';
    return '<span class="ignore-chip" dir="' + dir + '">' +
      '<span class="chip-label">' + escapeHtmlJS(display) + '</span>' +
      '<span class="chip-type">(' + typeLabel + ')</span>' +
      '<button class="chip-remove" onclick="removeFromIgnoreList(' + i + ')" title="הסר">&times;</button>' +
    '</span>';
  }).join('');
}

function addToIgnoreList() {
  var nameInput = document.getElementById('ignoreAddName');
  var handleInput = document.getElementById('ignoreAddHandle');
  var name = nameInput.value.trim();
  var handle = handleInput.value.trim().replace(/^@/, '');
  if (!name && !handle) return;
  if (name) ignoreListEntries.push(name);
  if (handle) ignoreListEntries.push('@' + handle);
  nameInput.value = '';
  handleInput.value = '';
  renderIgnoreChips();
  saveIgnoreList();
}

function removeFromIgnoreList(index) {
  ignoreListEntries.splice(index, 1);
  renderIgnoreChips();
  saveIgnoreList();
}

async function saveIgnoreList() {
  try {
    var res = await fetch('/api/app/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignoreList: ignoreListEntries.join('\\n') })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    // Refresh leads to reflect mute changes
    if (typeof loadLeads === 'function') loadLeads();
  } catch (e) { alert('שגיאה: ' + e.message); }
}

// Init chips on load
document.addEventListener('DOMContentLoaded', function() { renderIgnoreChips(); });

// --- Settings ---
async function saveSettings() {
  const body = {
    name: document.getElementById('setName').value,
    ownerName: document.getElementById('setOwner').value,
    businessType: document.getElementById('setType').value,
    services: document.getElementById('setServices').value,
    bookingInstructions: document.getElementById('setBooking').value,
    websiteLinks: document.getElementById('setLinks').value,
    ignoreList: ignoreListEntries.join('\\n'),
  };
  try {
    const res = await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json(); if (data.error) throw new Error(data.error);
    document.querySelectorAll('.save-msg').forEach(msg => { msg.classList.add('show'); setTimeout(() => msg.classList.remove('show'), 2000); });
  } catch (e) { alert('שגיאה: ' + e.message); }
}
// --- Max Bot Messages ---
async function setMaxMessages(count) {
  try {
    const res = await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ maxBotMessages: count }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    document.querySelectorAll('.save-msg').forEach(msg => { msg.classList.add('show'); setTimeout(() => msg.classList.remove('show'), 2000); });
    // Update button active states
    const btns = event.target.parentElement.querySelectorAll('button');
    btns.forEach(function(btn) { btn.style.background = '#1a1a1a'; btn.style.color = '#ccc'; });
    event.target.style.background = '#fff';
    event.target.style.color = '#000';
  } catch (e) { alert('שגיאה: ' + e.message); }
}

// --- System Prompt ---
const systemPromptInput = document.getElementById('systemPromptInput');
const systemPromptCharCount = document.getElementById('systemPromptCharCount');

if (systemPromptInput) {
  systemPromptInput.addEventListener('input', function() {
    const len = this.value.length;
    if (systemPromptCharCount) systemPromptCharCount.textContent = len + '/10000';
    if (len > 10000) {
      this.value = this.value.slice(0, 10000);
      systemPromptCharCount.textContent = '10000/10000';
      systemPromptCharCount.style.color = '#ef4444';
    } else {
      systemPromptCharCount.style.color = '#555';
    }
  });
}

async function saveSystemPrompt() {
  const input = document.getElementById('systemPromptInput');
  if (!input) return;
  const value = input.value.trim();
  if (value.length > 10000) {
    alert('System prompt ארוך מדי (מקסימום 10000 תווים)');
    return;
  }
  try {
    const res = await fetch('/api/app/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemPrompt: value })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const msg = document.getElementById('saveMsgSystemPrompt');
    if (msg) {
      msg.classList.add('show');
      setTimeout(() => msg.classList.remove('show'), 2000);
    }
  } catch (e) { alert('שגיאה: ' + e.message); }
}

// --- Knowledge Base Upload ---
const AI_SERVICE_URL = '${config.aiServiceUrl || 'http://localhost:8000'}';

async function handleKnowledgeFiles(input) {
  const files = input.files;
  if (!files || files.length === 0) return;

  const uploadUI = document.getElementById('knowledgeUploadUI');
  const progressUI = document.getElementById('knowledgeProgressUI');
  const progressText = document.getElementById('knowledgeProgressText');
  const progressBar = document.getElementById('knowledgeProgressBar');
  const resultsDiv = document.getElementById('knowledgeUploadResults');

  // Show progress UI
  if (uploadUI) uploadUI.style.display = 'none';
  if (progressUI) progressUI.style.display = 'block';
  if (progressText) progressText.textContent = 'מכין קבצים להעלאה...';
  if (progressBar) progressBar.style.width = '10%';
  if (resultsDiv) resultsDiv.style.display = 'none';

  try {
    const formData = new FormData();
    formData.append('client_id', 'tenant_' + TENANT_ID);
    
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }

    if (progressText) progressText.textContent = 'מעלה ' + files.length + ' קבצים...';
    if (progressBar) progressBar.style.width = '30%';

    const res = await fetch(AI_SERVICE_URL + '/documents/upload-multiple', {
      method: 'POST',
      body: formData
    });

    if (progressBar) progressBar.style.width = '80%';

    const data = await res.json();

    if (progressBar) progressBar.style.width = '100%';
    
    if (!res.ok) {
      throw new Error(data.detail || 'Upload failed');
    }

    // Show results
    setTimeout(() => {
      if (uploadUI) uploadUI.style.display = 'block';
      if (progressUI) progressUI.style.display = 'none';
      
      if (resultsDiv) {
        resultsDiv.style.display = 'block';
        let html = '<div style="padding:12px;background:#161616;border:1px solid rgba(255,255,255,0.08);border-radius:8px">';
        html += '<div style="font-size:14px;font-weight:600;color:#fff;margin-bottom:8px">' + data.message + '</div>';
        
        if (data.results && data.results.length > 0) {
          html += '<div style="font-size:12px;color:#888">';
          data.results.forEach(function(r) {
            const icon = r.success ? '<span style="color:#22c55e">&#10003;</span>' : '<span style="color:#ef4444">&#10007;</span>';
            const info = r.success ? '(' + r.chunks_created + ' chunks)' : '(' + (r.error || 'error') + ')';
            html += '<div style="padding:4px 0">' + icon + ' ' + escapeHtmlJS(r.filename) + ' ' + info + '</div>';
          });
          html += '</div>';
        }
        html += '</div>';
        resultsDiv.innerHTML = html;
      }

      // Clear the file input
      input.value = '';

      // Refresh documents list
      loadKnowledgeDocuments();
    }, 500);

  } catch (e) {
    if (uploadUI) uploadUI.style.display = 'block';
    if (progressUI) progressUI.style.display = 'none';
    alert('שגיאה בהעלאת קבצים: ' + e.message);
    input.value = '';
  }
}

async function loadKnowledgeDocuments() {
  const listDiv = document.getElementById('knowledgeFilesList');
  if (!listDiv) return;

  try {
    const res = await fetch(AI_SERVICE_URL + '/documents/tenant_' + TENANT_ID + '/list');
    if (!res.ok) {
      listDiv.innerHTML = '<div style="color:#555;font-size:13px">לא ניתן לטעון את רשימת הקבצים</div>';
      return;
    }
    const data = await res.json();
    
    if (!data.documents || data.documents.length === 0) {
      listDiv.innerHTML = '<div style="color:#555;font-size:13px;padding:8px 0">אין קבצים במאגר הידע עדיין</div>';
      return;
    }

    listDiv.innerHTML = data.documents.map(function(doc) {
      const chunkCount = doc.chunk_count || doc.chunks || 0;
      const filename = doc.filename || '';
      return '<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:6px">' +
        '<div style="display:flex;align-items:center;gap:8px">' +
          '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' +
          '<span style="color:#ccc;font-size:13px">' + escapeHtmlJS(filename) + '</span>' +
          '<span style="color:#555;font-size:11px">(' + chunkCount + ' chunks)</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<button onclick="deleteKnowledgeDocument(\\'' + escapeHtmlJS(filename) + '\\')" style="background:none;border:none;color:#555;cursor:pointer;font-size:14px;padding:4px 8px" title="מחק">x</button>' +
        '</div>' +
      '</div>';
    }).join('');
  } catch (e) {
    listDiv.innerHTML = '<div style="color:#555;font-size:13px">שגיאה בטעינת רשימת הקבצים</div>';
  }
}

async function deleteKnowledgeDocument(filename) {
  if (!confirm('האם למחוק את הקובץ הזה?')) return;
  
  try {
    const res = await fetch(AI_SERVICE_URL + '/documents/tenant_' + TENANT_ID + '/' + encodeURIComponent(filename), {
      method: 'DELETE'
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.detail || 'Delete failed');
    }
    loadKnowledgeDocuments();
  } catch (e) {
    alert('שגיאה במחיקת הקובץ: ' + e.message);
  }
}
    loadKnowledgeDocuments();
  } catch (e) {
    alert('שגיאה במחיקת הקובץ: ' + e.message);
  }
}

// Load knowledge documents on page load
document.addEventListener('DOMContentLoaded', function() {
  loadKnowledgeDocuments();
});

// Drag and drop for knowledge upload
const knowledgeDropZone = document.getElementById('knowledgeDropZone');
if (knowledgeDropZone) {
  knowledgeDropZone.addEventListener('dragover', function(e) {
    e.preventDefault();
    this.style.borderColor = 'rgba(255,255,255,0.3)';
    this.style.background = 'rgba(255,255,255,0.02)';
  });
  knowledgeDropZone.addEventListener('dragleave', function(e) {
    e.preventDefault();
    this.style.borderColor = 'rgba(255,255,255,0.1)';
    this.style.background = 'transparent';
  });
  knowledgeDropZone.addEventListener('drop', function(e) {
    e.preventDefault();
    this.style.borderColor = 'rgba(255,255,255,0.1)';
    this.style.background = 'transparent';
    
    const files = e.dataTransfer.files;
    const mdFiles = Array.from(files).filter(f => f.name.toLowerCase().endsWith('.md'));
    
    if (mdFiles.length === 0) {
      alert('יש להעלות קבצי Markdown (.md) בלבד');
      return;
    }
    
    // Create a mock file input and trigger the handler
    const input = document.getElementById('knowledgeFilesInput');
    const dataTransfer = new DataTransfer();
    mdFiles.forEach(f => dataTransfer.items.add(f));
    input.files = dataTransfer.files;
    handleKnowledgeFiles(input);
  });
}

// --- Trigger Words ---
let triggerWords = ${JSON.stringify(t.triggerWords || [])};

function renderTriggerWords() {
  const container = document.getElementById('triggerWordsList');
  if (!triggerWords.length) {
    container.innerHTML = '<div style="color:#555;font-size:13px;padding:8px 0">אין מילות טריגר עדיין</div>';
    return;
  }
  container.innerHTML = triggerWords.map(function(tw, i) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;background:#1a1a1a;border:1px solid rgba(255,255,255,0.08);border-radius:8px;margin-bottom:6px">' +
      '<span style="font-weight:600;color:#3b82f6;font-size:14px;min-width:80px">' + escapeHtmlJS(tw.word) + '</span>' +
      '<span style="color:#999;font-size:13px">→</span>' +
      '<span style="flex:1;color:#ccc;font-size:13px;white-space:pre-wrap">' + escapeHtmlJS(tw.reply) + '</span>' +
      '<button onclick="removeTriggerWord(' + i + ')" style="background:none;border:none;color:#555;cursor:pointer;font-size:16px;padding:0 4px" title="מחק">x</button>' +
    '</div>';
  }).join('');
}

async function saveTriggerWords() {
  try {
    const res = await fetch('/api/app/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ triggerWords }) });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
  } catch (e) { alert('שגיאה: ' + e.message); }
}

function addTriggerWord() {
  const wordEl = document.getElementById('twWord');
  const replyEl = document.getElementById('twReply');
  const word = wordEl.value.trim();
  const reply = replyEl.value.trim();
  if (!word || !reply) { alert('נא למלא מילת טריגר ותשובה'); return; }
  if (word.length > 50) { alert('מילת הטריגר ארוכה מדי (מקסימום 50 תווים)'); return; }
  if (reply.length > 500) { alert('התשובה ארוכה מדי (מקסימום 500 תווים)'); return; }
  if (triggerWords.length >= 20) { alert('מקסימום 20 מילות טריגר'); return; }
  if (triggerWords.some(tw => tw.word.toLowerCase() === word.toLowerCase())) { alert('מילת הטריגר הזו כבר קיימת'); return; }
  triggerWords.push({ word, reply });
  renderTriggerWords();
  saveTriggerWords();
  wordEl.value = '';
  replyEl.value = '';
}

function removeTriggerWord(index) {
  triggerWords.splice(index, 1);
  renderTriggerWords();
  saveTriggerWords();
}

// Init trigger words display
renderTriggerWords();

// --- Voice DNA Import (JSON file upload) ---
const dropZone = document.getElementById('voiceDropZone');
const dropLabel = document.getElementById('voiceDropLabel');

dropZone.addEventListener('dragover', function(e) {
  e.preventDefault();
  dropZone.style.borderColor = '#6ee7b7';
  dropZone.style.background = 'rgba(110,231,183,0.05)';
});
dropZone.addEventListener('dragleave', function() {
  dropZone.style.borderColor = '#333';
  dropZone.style.background = '';
});
dropZone.addEventListener('drop', async function(e) {
  e.preventDefault();
  dropZone.style.borderColor = '#333';
  dropZone.style.background = '';
  // Check if a folder was dropped
  const items = e.dataTransfer.items;
  if (items && items.length > 0) {
    const entry = items[0].webkitGetAsEntry && items[0].webkitGetAsEntry();
    if (entry && entry.isDirectory) {
      // Folder dropped — read all files recursively
      dropLabel.textContent = 'קורא קבצים מהתיקייה...';
      const files = await readDirectoryEntry(entry);
      if (files.length > 0) processFolderFiles(files);
      return;
    }
  }
  const file = e.dataTransfer.files[0];
  if (file) processVoiceFile(file);
});

function handleVoiceFile(input) {
  const file = input.files[0];
  if (file) processVoiceFile(file);
  input.value = '';
}

function handleVoiceFolder(input) {
  const files = Array.from(input.files);
  if (files.length > 0) processFolderFiles(files);
  input.value = '';
}

// Instagram exports UTF-8 text as Latin-1 escaped sequences — decode them
function fixInstagramEncoding(str) {
  if (!str) return str;
  try {
    // Instagram encodes UTF-8 bytes as Latin-1 code points
    return decodeURIComponent(escape(str));
  } catch { return str; }
}

// Extract all DM messages from an Instagram ZIP export — returns structured data
async function extractMessagesFromZip(file) {
  const zip = await JSZip.loadAsync(file);
  const messageFiles = [];
  zip.forEach((path, entry) => {
    // Instagram structure: messages/inbox/*/message_*.json
    if (/message.*\\.json$/i.test(path) && /messages/i.test(path) && !entry.dir) {
      messageFiles.push({ entry, path });
    }
  });
  if (messageFiles.length === 0) throw new Error('לא נמצאו קבצי שיחות ב-ZIP. ודא שזה ייצוא אינסטגרם.');

  // Group by conversation directory (each inbox subfolder = one conversation thread)
  const conversationMap = {};
  for (const { entry, path } of messageFiles) {
    const text = await entry.async('string');
    try {
      const data = JSON.parse(text);
      if (data.messages && Array.isArray(data.messages)) {
        // Conversation ID = parent folder name
        const parts = path.split('/');
        const convId = parts.length >= 3 ? parts[parts.length - 2] : path;
        if (!conversationMap[convId]) conversationMap[convId] = [];
        for (const m of data.messages) {
          if (m.content) {
            conversationMap[convId].push({
              sender: fixInstagramEncoding(m.sender_name || 'Unknown'),
              content: fixInstagramEncoding(m.content),
              ts: m.timestamp_ms || 0,
              convId,
            });
          }
        }
      }
    } catch { /* skip non-JSON or malformed */ }
  }

  const allMessages = Object.values(conversationMap).flat();
  if (allMessages.length === 0) throw new Error('לא נמצאו הודעות בקבצי השיחות.');

  // Sort each conversation chronologically
  for (const convId of Object.keys(conversationMap)) {
    conversationMap[convId].sort((a, b) => a.ts - b.ts);
  }

  return { allMessages, conversationMap };
}

// Read all files from a dropped directory entry recursively
function readDirectoryEntry(dirEntry) {
  return new Promise((resolve) => {
    const allFiles = [];
    let pending = 0;
    function readDir(entry, path) {
      pending++;
      const reader = entry.createReader();
      reader.readEntries(function(entries) {
        for (const e of entries) {
          if (e.isFile) {
            pending++;
            e.file(function(f) {
              // Attach relative path for pattern matching
              Object.defineProperty(f, 'webkitRelativePath', { value: path + '/' + f.name, writable: false });
              allFiles.push(f);
              pending--;
              if (pending === 0) resolve(allFiles);
            });
          } else if (e.isDirectory) {
            readDir(e, path + '/' + e.name);
          }
        }
        pending--;
        if (pending === 0) resolve(allFiles);
      });
    }
    readDir(dirEntry, dirEntry.name);
  });
}

async function extractMessagesFromFolder(files) {
  // Filter for message JSON files (Instagram structure: messages/inbox/*/message_*.json)
  const messageFiles = files.filter(f => /message.*\\.json$/i.test(f.name) && /messages/i.test(f.webkitRelativePath));
  if (messageFiles.length === 0) throw new Error('לא נמצאו קבצי שיחות בתיקייה. ודא שזו תיקיית ייצוא אינסטגרם.');

  const conversationMap = {};
  for (const file of messageFiles) {
    const text = await file.text();
    try {
      const data = JSON.parse(text);
      if (data.messages && Array.isArray(data.messages)) {
        // Conversation ID = parent folder in relative path
        const pathParts = (file.webkitRelativePath || file.name).split('/');
        const convId = pathParts.length >= 3 ? pathParts[pathParts.length - 2] : file.name;
        if (!conversationMap[convId]) conversationMap[convId] = [];
        for (const m of data.messages) {
          if (m.content) {
            conversationMap[convId].push({
              sender: fixInstagramEncoding(m.sender_name || 'Unknown'),
              content: fixInstagramEncoding(m.content),
              ts: m.timestamp_ms || 0,
              convId,
            });
          }
        }
      }
    } catch { /* skip */ }
  }

  const allMessages = Object.values(conversationMap).flat();
  if (allMessages.length === 0) throw new Error('לא נמצאו הודעות בקבצי השיחות.');

  for (const convId of Object.keys(conversationMap)) {
    conversationMap[convId].sort((a, b) => a.ts - b.ts);
  }

  return { allMessages, conversationMap };
}

// --- Voice DNA Preprocessing Pipeline ---

// Noise messages to filter out (Instagram system messages, reactions, etc.)
const NOISE_PATTERNS = [
  /^liked a message$/i,
  /^[\\p{Emoji}]{1,3}$/u,  // single emoji reactions
  /^sent an attachment\\.?$/i,
  /^You sent an attachment/i,
  /^\\[Photo\\]$/i,
  /^\\[Video\\]$/i,
  /^\\[Audio\\]$/i,
  /^\\[Sticker\\]$/i,
  /^Replied to your story/i,
  /^Reacted .+ to your message/i,
  /^הגיב\\/ה על הסטורי שלך/i,
];

function isNoiseMessage(content) {
  if (!content || content.length < 2) return true;
  return NOISE_PATTERNS.some(p => p.test(content.trim()));
}

// Identify the owner: most frequent sender across conversations
function identifyOwner(allMessages) {
  const senderCounts = {};
  const senderConvs = {}; // Track unique conversations per sender
  for (const m of allMessages) {
    senderCounts[m.sender] = (senderCounts[m.sender] || 0) + 1;
    if (!senderConvs[m.sender]) senderConvs[m.sender] = new Set();
    if (m.convId) senderConvs[m.sender].add(m.convId);
  }
  // Owner appears in the MOST conversations (not just most messages)
  const entries = Object.entries(senderConvs);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1].size - a[1].size);
  return entries[0][0];
}

// Score a conversation for voice DNA quality
function scoreConversation(messages, ownerName) {
  const ownerMsgs = messages.filter(m => m.sender === ownerName && !isNoiseMessage(m.content));
  const otherMsgs = messages.filter(m => m.sender !== ownerName && !isNoiseMessage(m.content));

  // Skip dead conversations
  if (ownerMsgs.length < 3 || otherMsgs.length < 2) return 0;

  const avgOwnerLen = ownerMsgs.reduce((s, m) => s + m.content.length, 0) / ownerMsgs.length;
  const backAndForth = Math.min(ownerMsgs.length, otherMsgs.length) / Math.max(ownerMsgs.length, otherMsgs.length);

  // Score: more owner messages = better, longer messages = better, balanced conversation = better
  let score = ownerMsgs.length * 2;
  if (avgOwnerLen > 30) score += 3;
  if (avgOwnerLen > 80) score += 2;
  score += backAndForth * 5;

  return score;
}

// Build statistical analysis from ALL owner messages (no AI needed)
function buildOwnerStats(allMessages, ownerName) {
  const ownerMsgs = allMessages
    .filter(m => m.sender === ownerName && !isNoiseMessage(m.content))
    .map(m => m.content);

  if (ownerMsgs.length === 0) return null;

  const lengths = ownerMsgs.map(m => m.length).sort((a, b) => a - b);
  const totalMessages = ownerMsgs.length;

  // Emoji frequency
  const emojiCounts = {};
  const emojiRegex = /[\\p{Emoji_Presentation}\\p{Extended_Pictographic}]/gu;
  for (const msg of ownerMsgs) {
    const matches = msg.match(emojiRegex);
    if (matches) {
      for (const e of matches) {
        emojiCounts[e] = (emojiCounts[e] || 0) + 1;
      }
    }
  }
  const topEmojis = Object.entries(emojiCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([emoji, count]) => ({ emoji, count }));

  // Phrase frequency (2-3 word n-grams)
  const phraseCounts = {};
  for (const msg of ownerMsgs) {
    const words = msg.split(/\\s+/).filter(w => w.length > 1);
    for (let n = 2; n <= 3; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const phrase = words.slice(i, i + n).join(' ');
        if (phrase.length > 4) {
          phraseCounts[phrase] = (phraseCounts[phrase] || 0) + 1;
        }
      }
    }
  }
  const topPhrases = Object.entries(phraseCounts)
    .filter(([, count]) => count >= 3) // Must appear 3+ times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([phrase, count]) => ({ phrase, count }));

  // Punctuation style
  let ellipsisCount = 0, exclamationCount = 0, questionCount = 0, noPeriodCount = 0;
  for (const msg of ownerMsgs) {
    if (/\\.{2,}/.test(msg)) ellipsisCount++;
    if (/!/.test(msg)) exclamationCount++;
    if (/\\?/.test(msg)) questionCount++;
    if (!/[.!?]$/.test(msg.trim())) noPeriodCount++;
  }

  // Greeting patterns (first owner message in each conversation)
  const greetingCounts = {};
  const seenConvs = new Set();
  const sorted = [...allMessages].sort((a, b) => a.ts - b.ts);
  for (const m of sorted) {
    if (m.sender === ownerName && m.convId && !seenConvs.has(m.convId) && !isNoiseMessage(m.content)) {
      seenConvs.add(m.convId);
      const greeting = m.content.trim().split('\\n')[0].slice(0, 60);
      greetingCounts[greeting] = (greetingCounts[greeting] || 0) + 1;
    }
  }
  const topGreetings = Object.entries(greetingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([text, count]) => ({ text, count }));

  return {
    totalMessages,
    avgLength: Math.round(lengths.reduce((a, b) => a + b, 0) / lengths.length),
    medianLength: lengths[Math.floor(lengths.length / 2)],
    topEmojis,
    topPhrases,
    punctuation: {
      ellipsis: Math.round((ellipsisCount / totalMessages) * 100),
      exclamation: Math.round((exclamationCount / totalMessages) * 100),
      question: Math.round((questionCount / totalMessages) * 100),
      noPeriod: Math.round((noPeriodCount / totalMessages) * 100),
    },
    topGreetings,
  };
}

// Main preprocessing: takes raw extraction output → structured payload for backend
function preprocessVoiceData(allMessages, conversationMap) {
  const ownerName = identifyOwner(allMessages);
  if (!ownerName) throw new Error('לא הצלחנו לזהות את הבעלים ��שיחות. ודא שיש שיחות עם הודעות שלך.');

  // Score and sort conversations
  const scored = Object.entries(conversationMap)
    .map(([convId, messages]) => ({
      convId,
      messages: messages.filter(m => !isNoiseMessage(m.content)),
      score: scoreConversation(messages, ownerName),
    }))
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) throw new Error('לא נמצאו שיחות עם מספיק הודעות. נסה להעלות ייצוא גדול יותר.');

  // Select top conversations (enough to fill ~4 AI chunks of ~8K chars each)
  const selected = [];
  let totalChars = 0;
  const TARGET_CHARS = 40000; // ~4 chunks × 10K chars each (generous)
  for (const conv of scored) {
    if (totalChars >= TARGET_CHARS) break;
    const convText = conv.messages.map(m => m.content).join(' ');
    selected.push(conv);
    totalChars += convText.length;
  }

  // Build stats from ALL messages (not just selected)
  const stats = buildOwnerStats(allMessages, ownerName);

  // Format selected conversations for the backend
  const topConversations = selected.map(c => ({
    messages: c.messages.map(m => ({
      sender: m.sender,
      content: m.content,
      isOwner: m.sender === ownerName,
      ts: m.ts,
    })),
    score: c.score,
  }));

  // Compute date range
  const timestamps = allMessages.filter(m => m.ts > 0).map(m => m.ts);
  const minDate = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
  const maxDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;
  const dateRange = minDate && maxDate
    ? formatDateHeb(minDate) + ' - ' + formatDateHeb(maxDate)
    : '';

  return {
    ownerName,
    stats,
    topConversations,
    meta: {
      totalConversations: Object.keys(conversationMap).length,
      conversationsAnalyzed: selected.length,
      totalMessages: allMessages.length,
      totalOwnerMessages: allMessages.filter(m => m.sender === ownerName).length,
      dateRange,
    },
  };
}

function formatDateHeb(date) {
  const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יוני', 'יולי', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  return months[date.getMonth()] + ' ' + date.getFullYear();
}

// Voice DNA progress stepper
const voiceSteps = [
  { key: 'open', label: 'פותח קבצים', step: '1' },
  { key: 'identify', label: 'מזהה את הבעלים', step: '2' },
  { key: 'filter', label: 'מסנן שיחות איכותיות', step: '3' },
  { key: 'stats', label: 'מנתח סטטיסטיקות', step: '4' },
  { key: 'analyze', label: 'מנתח סגנון דיבור', step: '5' },
  { key: 'save', label: 'שומר Voice DNA', step: '6' },
];

function showVoiceProgress(activeStep) {
  const uploadUI = document.getElementById('voiceUploadUI');
  const progressUI = document.getElementById('voiceProgressUI');
  const stepsEl = document.getElementById('voiceSteps');
  const bar = document.getElementById('voiceProgressBar');
  const emojiEl = document.getElementById('voiceProgressEmoji');

  uploadUI.style.display = 'none';
  progressUI.style.display = 'block';
  dropZone.style.pointerEvents = 'none';
  dropZone.style.cursor = 'default';
  dropZone.style.borderColor = '#1a3a2a';

  const activeIdx = voiceSteps.findIndex(s => s.key === activeStep);
  emojiEl.textContent = 'STEP ' + (voiceSteps[activeIdx]?.step || '...');
  const pct = Math.round(((activeIdx + 0.5) / voiceSteps.length) * 100);
  bar.style.width = pct + '%';

  stepsEl.innerHTML = voiceSteps.map((s, i) => {
    const done = i < activeIdx;
    const active = i === activeIdx;
    const icon = done ? '<span style="color:#6ee7b7">&#10003;</span>' : active ? '<span class="voice-spinner"></span>' : '<span style="color:#333">&#9679;</span>';
    const color = done ? '#6ee7b7' : active ? '#fff' : '#444';
    return '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;color:' + color + ';font-size:14px;font-weight:' + (active ? '600' : '400') + '">' + icon + ' ' + s.label + '</div>';
  }).join('');
}

function showVoiceSuccess() {
  const bar = document.getElementById('voiceProgressBar');
  const emojiEl = document.getElementById('voiceProgressEmoji');
  const stepsEl = document.getElementById('voiceSteps');
  bar.style.width = '100%';
  bar.style.background = '#22c55e';
  emojiEl.textContent = 'DONE';
  stepsEl.innerHTML = voiceSteps.map(s => '<div style="display:flex;align-items:center;gap:10px;padding:6px 0;color:#6ee7b7;font-size:14px"><span>&#10003;</span> ' + s.label + '</div>').join('') +
    '<div style="margin-top:12px;font-size:15px;font-weight:700;color:#22c55e;text-align:center">הייבוא הושלם בהצלחה!</div>';
}

function resetVoiceUI() {
  const uploadUI = document.getElementById('voiceUploadUI');
  const progressUI = document.getElementById('voiceProgressUI');
  const bar = document.getElementById('voiceProgressBar');
  progressUI.style.display = 'none';
  uploadUI.style.display = 'block';
  dropZone.style.pointerEvents = '';
  dropZone.style.cursor = 'pointer';
  dropZone.style.borderColor = '#333';
  bar.style.width = '0%';
  bar.style.background = '#6ee7b7';
}

function showVoiceError(msg) {
  const emojiEl = document.getElementById('voiceProgressEmoji');
  const stepsEl = document.getElementById('voiceSteps');
  const bar = document.getElementById('voiceProgressBar');
  emojiEl.textContent = 'ERROR';
  bar.style.width = '100%';
  bar.style.background = '#ef4444';
  stepsEl.innerHTML = '<div style="color:#ef4444;font-size:14px;text-align:center;padding:12px 0">' + escapeHtmlJS(msg) + '</div>';
  setTimeout(resetVoiceUI, 4000);
}

async function processFolderFiles(files) {
  try {
    showVoiceProgress('open');
    await new Promise(r => setTimeout(r, 300));

    showVoiceProgress('identify');
    const { allMessages, conversationMap } = await extractMessagesFromFolder(files);

    showVoiceProgress('filter');
    await new Promise(r => setTimeout(r, 200));
    const payload = preprocessVoiceData(allMessages, conversationMap);

    showVoiceProgress('stats');
    await new Promise(r => setTimeout(r, 200));

    showVoiceProgress('analyze');
    const res = await fetch('/api/app/import-voice-v2', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    showVoiceProgress('save');
    await new Promise(r => setTimeout(r, 500));
    showVoiceSuccess();
    await new Promise(r => setTimeout(r, 1500));
    resetVoiceUI();
    showVoiceDnaResults(data.imported, data.meta);
  } catch (e) {
    showVoiceError(e.message);
  }
}

async function processVoiceFile(file) {
  const isZip = file.name.endsWith('.zip');
  const isJson = file.name.endsWith('.json');
  if (!isZip && !isJson) {
    alert('יש להעלות קובץ ZIP (ייצוא אינסטגרם) או JSON');
    return;
  }
  if (file.size > 200 * 1024 * 1024) {
    alert('הקובץ גדול מדי (מקסימום 200MB)');
    return;
  }

  try {
    showVoiceProgress('open');

    if (isZip) {
      // ZIP file — use v2 structured pipeline
      showVoiceProgress('identify');
      const { allMessages, conversationMap } = await extractMessagesFromZip(file);

      showVoiceProgress('filter');
      await new Promise(r => setTimeout(r, 200));
      const payload = preprocessVoiceData(allMessages, conversationMap);

      showVoiceProgress('stats');
      await new Promise(r => setTimeout(r, 200));

      showVoiceProgress('analyze');
      const res = await fetch('/api/app/import-voice-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showVoiceProgress('save');
      await new Promise(r => setTimeout(r, 500));
      showVoiceSuccess();
      await new Promise(r => setTimeout(r, 1500));
      resetVoiceUI();
      showVoiceDnaResults(data.imported, data.meta);
    } else {
      // Single JSON file — fallback to v1 (plain text, smaller data)
      showVoiceProgress('identify');
      let text = await file.text();
      if (text.length > 30000) text = text.slice(0, 30000);

      showVoiceProgress('analyze');
      const res = await fetch('/api/app/import-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversations: text })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      showVoiceProgress('save');
      await new Promise(r => setTimeout(r, 500));
      showVoiceSuccess();
      await new Promise(r => setTimeout(r, 1500));
      resetVoiceUI();
      showVoiceDnaResults(data.imported);
    }
  } catch (e) {
    showVoiceError(e.message);
  }
}

function getVoiceDnaScore(voice) {
  let score = 0;
  let total = 0;
  const fields = [
    { key: 'voiceGreeting', weight: 1 },
    { key: 'voiceEnergy', weight: 1 },
    { key: 'voicePhrases', weight: 1.5 },
    { key: 'voicePhrasesMale', weight: 0.5 },
    { key: 'voicePhrasesFemale', weight: 0.5 },
    { key: 'slangWords', weight: 1.5 },
    { key: 'voiceExamples', weight: 2 },
    { key: 'voicePersonality', weight: 2 },
    { key: 'voiceAvoid', weight: 0.5 },
    { key: 'voiceHumor', weight: 0.5 },
  ];
  for (const f of fields) {
    total += f.weight;
    const val = voice[f.key];
    if (val && val.length > 0) {
      if (f.weight >= 1.5) {
        const len = val.length;
        const fullAt = f.key === 'voiceExamples' ? 800 : f.key === 'voicePersonality' ? 150 : 200;
        score += f.weight * Math.min(1, len / fullAt);
      } else {
        score += f.weight;
      }
    }
  }
  return Math.round((score / total) * 100);
}

// Analyze voice example categories for per-category scoring
function analyzeVoiceCategories(voiceExamples) {
  if (!voiceExamples) return [];
  const categories = [
    { key: 'תשובות חוזרות', label: 'תשובות חוזרות (Q&A)', priority: 'high' },
    { key: 'אמפתיה', label: 'אמפתיה', priority: 'high' },
    { key: 'ברכה', label: 'ברכה/פתיחה', priority: 'medium' },
    { key: 'שאלות', label: 'שאלות גילוי', priority: 'medium' },
    { key: 'הצעת שיחה', label: 'הצעת שיחה/סגירה', priority: 'high' },
    { key: 'תגובה', label: 'תגובה/פרגון', priority: 'low' },
    { key: 'התנגדויות', label: 'טיפול בהתנגדויות', priority: 'medium' },
    { key: 'שיחה חופשית', label: 'שיחה חופשית', priority: 'low' },
  ];

  return categories.map(function(cat) {
    // Find lines between this section header and the next one (or end)
    var idx = voiceExamples.indexOf('[' + cat.key);
    if (idx === -1) return { label: cat.label, count: 0, priority: cat.priority, status: 'missing' };
    var afterHeader = voiceExamples.indexOf(']', idx);
    if (afterHeader === -1) return { label: cat.label, count: 0, priority: cat.priority, status: 'missing' };
    var nextSection = voiceExamples.indexOf('\\n[', afterHeader);
    var content = nextSection === -1
      ? voiceExamples.slice(afterHeader + 1)
      : voiceExamples.slice(afterHeader + 1, nextSection);
    var lines = content.split('\\n').filter(function(l) { return l.trim().length > 3; });
    return {
      label: cat.label,
      count: lines.length,
      priority: cat.priority,
      status: lines.length >= 3 ? 'strong' : lines.length >= 1 ? 'ok' : 'missing',
    };
  });
}

function showVoiceDnaScore(voice) {
  const pct = getVoiceDnaScore(voice);
  const el = document.getElementById('voiceDnaScore');
  const color = pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const label = pct >= 80 ? 'מצוין' : pct >= 50 ? 'טוב' : 'בסיסי';

  // Per-category analysis
  const categories = analyzeVoiceCategories(voice.voiceExamples);
  const tips = [];

  // Generate improvement tips
  if (!voice.voicePersonality) tips.push('העלה שיחות כדי לזהות אישיות');
  if (!voice.voiceExamples || voice.voiceExamples.length < 200) {
    tips.push('העלה ייצוא אינסטגרם כדי ללמוד את הסגנון שלך');
  } else {
    for (var c of categories) {
      if (c.status === 'missing' && c.priority !== 'low') {
        tips.push('חסרות דוגמאות ל' + c.label + ' — העלה עוד שיחות');
        break; // One tip is enough
      }
    }
  }

  // Category breakdown (only show if there are organized examples)
  var catHtml = '';
  if (categories.some(function(c) { return c.count > 0; })) {
    catHtml = '<div style="margin-top:10px;display:flex;flex-wrap:wrap;gap:4px">';
    for (var cat of categories) {
      var catColor = cat.status === 'strong' ? '#22c55e' : cat.status === 'ok' ? '#f59e0b' : '#444';
      var icon = cat.status === 'strong' ? '&#10003;' : cat.status === 'ok' ? '&#9679;' : '&#10007;';
      catHtml += '<div style="font-size:10px;padding:3px 8px;border-radius:4px;border:1px solid ' + catColor + '30;color:' + catColor + '">' + icon + ' ' + cat.label + (cat.count > 0 ? ' (' + cat.count + ')' : '') + '</div>';
    }
    catHtml += '</div>';
  }

  var tipsHtml = tips.length > 0
    ? '<div style="font-size:11px;color:#f59e0b;margin-top:8px;line-height:1.5">' + tips.map(function(t) { return '&#9889; ' + t; }).join('<br>') + '</div>'
    : '';

  el.innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;margin-bottom:4px">' +
      '<div style="flex:1">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
          '<span style="font-size:13px;color:#ccc;font-weight:600">שלמות Voice DNA</span>' +
          '<span style="font-size:13px;font-weight:700;color:' + color + '">' + pct + '% — ' + label + '</span>' +
        '</div>' +
        '<div style="height:6px;background:#1a1a1a;border-radius:3px;overflow:hidden">' +
          '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;transition:width 0.6s ease"></div>' +
        '</div>' +
        catHtml +
        tipsHtml +
      '</div>' +
    '</div>';
}


function showVoiceDnaResults(imported, meta) {
  const el = document.getElementById('voiceDnaResults');
  const energyMap = { chill:'רגוע', warm:'חם', 'high-energy':'אנרגטי', professional:'מקצועי' };
  const emojiMap = { never:'אף פעם', sometimes:'לפעמים', 'a-lot':'הרבה' };
  const lengthMap = { 'super-short':'סופר קצר', normal:'רגיל', detailed:'מפורט' };
  const humorMap = { none:'בלי', light:'קליל', dry:'יבש', memes:'מימים' };

  // Quick stats row
  const statItems = [];
  if (imported.voiceEnergy) statItems.push({ label: 'אנרגיה', val: energyMap[imported.voiceEnergy] || imported.voiceEnergy });
  if (imported.voiceEmoji) statItems.push({ label: 'אימוג׳י', val: emojiMap[imported.voiceEmoji] || imported.voiceEmoji });
  if (imported.voiceLength) statItems.push({ label: 'אורך', val: lengthMap[imported.voiceLength] || imported.voiceLength });
  if (imported.voiceHumor) statItems.push({ label: 'הומור', val: humorMap[imported.voiceHumor] || imported.voiceHumor });

  const statsRow = statItems.map(s => '<div style="background:#0a1a0a;border:1px solid #1a3a1a;border-radius:8px;padding:8px 12px;text-align:center;min-width:70px"><div style="font-size:10px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:0.3px">' + s.label + '</div><div style="color:#6ee7b7;font-size:12px;font-weight:600;margin-top:4px">' + escapeHtmlJS(s.val) + '</div></div>').join('');

  // Detail rows
  const details = [];
  if (imported.voicePersonality) details.push({ l: 'אישיות', v: imported.voicePersonality });
  if (imported.voiceGreeting) details.push({ l: 'ברכה', v: imported.voiceGreeting });
  if (imported.voicePhrases) details.push({ l: 'ביטויים', v: imported.voicePhrases });
  if (imported.voicePhrasesMale) details.push({ l: 'פנייה לבנים', v: imported.voicePhrasesMale });
  if (imported.voicePhrasesFemale) details.push({ l: 'פנייה לבנות', v: imported.voicePhrasesFemale });
  if (imported.slangWords) details.push({ l: 'סלנג וסגנון', v: imported.slangWords });
  if (imported.voiceAvoid) details.push({ l: 'לא להגיד', v: imported.voiceAvoid });
  if (imported.voiceExamples) details.push({ l: 'דוגמאות אמיתיות', v: imported.voiceExamples });

  const detailsHTML = details.map(r => '<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #1a2a1a"><div style="color:#6ee7b7;font-size:12px;font-weight:700;margin-bottom:4px">' + r.l + '</div><div style="color:#ccc;font-size:13px;white-space:pre-line;line-height:1.6">' + escapeHtmlJS(r.v) + '</div></div>').join('');

  el.innerHTML =
    '<div style="background:linear-gradient(135deg,#0a1a0a 0%,#0a1a2a 100%);border:1px solid #1a3a1a;border-radius:12px;padding:20px;margin-bottom:12px">' +
      '<div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">' +
        '<span style="font-size:14px;font-weight:700;color:#22c55e;letter-spacing:0.5px">IMPORTED</span>' +
        '<div><div style="font-size:16px;font-weight:700;color:#22c55e">הבוט למד את הסגנון שלך!</div>' +
        '<div style="font-size:12px;color:#6ee7b7;margin-top:2px">' +
          (meta ? 'ניתחנו ' + meta.conversationsAnalyzed + ' שיחות איכותיות מתוך ' + meta.totalConversations + ' (' + meta.totalOwnerMessages + ' הודעות שלך)' + (meta.dateRange ? ' | ' + meta.dateRange : '') : 'Voice DNA נשמר — הבוט ידבר בדיוק כמוך') +
        '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">' + statsRow + '</div>' +
      detailsHTML +
      '<div id="voiceValidationArea"></div>' +
      '<div style="text-align:center;margin-top:12px;display:flex;gap:8px;justify-content:center">' +
        '<button onclick="runVoiceValidation()" id="voiceValidateBtn" style="background:#1a3a2a;border:1px solid #22c55e40;color:#22c55e;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600">בדוק איך הבוט נשמע</button>' +
        '<button onclick="resetVoiceUI();document.getElementById(\\\'voiceDnaResults\\\').style.display=\\\'none\\\'" style="background:none;border:1px solid rgba(255,255,255,0.08);color:#888;padding:8px 20px;border-radius:8px;cursor:pointer;font-size:13px">העלאה נוספת</button>' +
      '</div>' +
    '</div>';
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Voice DNA validation test — generates sample replies
async function runVoiceValidation() {
  const btn = document.getElementById('voiceValidateBtn');
  const area = document.getElementById('voiceValidationArea');
  if (!btn || !area) return;
  btn.disabled = true;
  btn.textContent = 'בודק...';
  btn.style.opacity = '0.5';

  try {
    const res = await fetch('/api/app/voice-validate', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    const scenarios = data.scenarios || [];
    if (scenarios.length === 0) {
      area.innerHTML = '<div style="color:#888;font-size:13px;text-align:center;padding:12px">לא הצלחנו לייצר דוגמאות. נסה שוב.</div>';
      return;
    }

    area.innerHTML =
      '<div style="margin-top:16px;padding-top:16px;border-top:1px solid #1a3a1a">' +
        '<div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:12px">ככה הבוט ידבר — זה נשמע כמוך?</div>' +
        scenarios.map(function(s) {
          return '<div style="background:#0d1a0d;border:1px solid #1a2a1a;border-radius:8px;padding:12px;margin-bottom:8px">' +
            '<div style="font-size:11px;color:#6ee7b7;font-weight:600;margin-bottom:6px">' + escapeHtmlJS(s.label) + '</div>' +
            '<div style="font-size:12px;color:#888;margin-bottom:4px">לקוח: "' + escapeHtmlJS(s.message) + '"</div>' +
            '<div style="font-size:13px;color:#fff;direction:rtl;line-height:1.5">' + escapeHtmlJS(s.response) + '</div>' +
          '</div>';
        }).join('') +
        '<div style="font-size:11px;color:#555;text-align:center;margin-top:8px">אלה דוגמאות בלבד — הבוט מתאים את עצמו לכל שיחה</div>' +
      '</div>';

    btn.style.display = 'none';
  } catch (e) {
    area.innerHTML = '<div style="color:#ef4444;font-size:13px;text-align:center;padding:8px">' + escapeHtmlJS(e.message) + '</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'בדוק איך הבוט נשמע';
    btn.style.opacity = '1';
  }
}

// --- Leads ---
let allLeads = [];

function escapeHtmlJS(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function loadLeads() {
  try {
    const res = await fetch('/api/app/leads');
    allLeads = await res.json();
    renderLeads(allLeads);
  } catch (e) {
    document.getElementById('leadsList').innerHTML = '<div class="empty-state">שגיאה בטעינת שיחות</div>';
  }
}

function renderLeads(leads) {
  const list = document.getElementById('leadsList');
  if (!leads.length) {
    list.innerHTML = '<div class="empty-state">אין שיחות עדיין. ברגע שמישהו ישלח הודעה באינסטגרם — זה יופיע כאן.</div>';
    return;
  }
  // Sort: needs-attention first, then by date
  leads = leads.slice().sort(function(a, b) {
    if (a.needsHuman && !b.needsHuman) return -1;
    if (!a.needsHuman && b.needsHuman) return 1;
    return 0;
  });
  const statusMap = { new: { label: 'חדש', color: '#3b82f6', bg: '#1e3a5f' }, qualified: { label: 'מתעניין', color: '#22c55e', bg: '#14532d' }, booked: { label: 'נקבע', color: '#a78bfa', bg: '#3b1f6e' }, closed: { label: 'סגור', color: '#888', bg: '#333' } };
  list.innerHTML = leads.map(function(l) {
    var s = statusMap[l.status] || statusMap['new'];
    var isTest = ['dashboard-user', 'test-user', 'demo-user'].indexOf(l.userId) !== -1;
    var rawName = (l.instagramName && l.instagramName !== 'null' ? l.instagramName : null) || (l.name && l.name !== 'null' ? l.name : null) || (isTest ? null : l.userId);
    var name = isTest ? 'שיחת בדיקה' : rawName;
    var usernameTag = (l.instagramUsername && !isTest) ? ' <span style="color:#888;font-size:12px;font-weight:400">@' + escapeHtmlJS(l.instagramUsername) + '</span>' : '';
    var scoreColor = l.qualificationScore >= 7 ? '#22c55e' : l.qualificationScore >= 4 ? '#f59e0b' : '#666';
    var scoreBg = l.qualificationScore >= 7 ? '#14532d' : l.qualificationScore >= 4 ? '#422006' : '#222';
    var date = l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('he-IL') : '';
    var isMuted = l.ignored;
    var g = l.gender || 'unknown';
    var gIcon = g === 'male' ? '♂' : g === 'female' ? '♀' : '?';
    var gColor = g === 'male' ? '#60a5fa' : g === 'female' ? '#f472b6' : '#555';
    var gBg = g === 'male' ? '#1e3a5f' : g === 'female' ? '#4a1942' : '#222';
    var gTitle = g === 'male' ? 'זכר (לחץ לשנות)' : g === 'female' ? 'נקבה (לחץ לשנות)' : 'לא ידוע (לחץ לקבוע)';
    var gLocked = l.genderLocked ? '' : '';
    var modeMap = { qualify: { icon: '', label: 'ליד', color: '#22c55e', bg: '#14532d' }, engage: { icon: '', label: 'קשר', color: '#60a5fa', bg: '#1e3a5f' }, assist: { icon: '', label: 'מומחיות', color: '#a78bfa', bg: '#3b1f6e' }, acknowledge: { icon: '', label: 'תגובה', color: '#888', bg: '#333' }, converse: { icon: '', label: 'שיחה', color: '#f59e0b', bg: '#422006' } };
    var mode = modeMap[l.conversationMode] || null;
    var needsAttention = l.needsHuman;
    var attentionBadge = needsAttention
      ? '<span class="needs-attention-badge" title="' + escapeHtmlJS(l.needsHumanReason || 'הבוט צריך עזרה') + '" onclick="dismissFlag(\\'' + l.userId + '\\',this)">דורש טיפול</span>'
      : '';
    return '<div class="lead-item' + (isMuted ? ' muted' : '') + (needsAttention ? ' needs-attention' : '') + '" data-user="' + l.userId + '" data-name="' + escapeHtmlJS(name).toLowerCase() + '" data-muted="' + (isMuted ? '1' : '0') + '" data-attention="' + (needsAttention ? '1' : '0') + '">' +
      '<div style="flex:1">' +
        '<div class="lead-name">' + escapeHtmlJS(name) + usernameTag + attentionBadge + '</div>' +
        '<div class="lead-meta">' + date + (l.interest && l.interest !== 'null' ? ' · ' + escapeHtmlJS(l.interest) : '') + (mode ? ' · ' + mode.label : '') + '</div>' +
      '</div>' +
      '<button class="gender-badge" data-gender="' + g + '" style="color:' + gColor + ';background:' + gBg + ';border-color:' + gColor + '33" title="' + gTitle + '" onclick="toggleGender(\\'' + l.userId + '\\',\\'' + g + '\\',this)">' + gIcon + gLocked + '</button>' +
      '<span class="lead-status" style="color:' + s.color + ';background:' + s.bg + '">' + s.label + '</span>' +
      '<span class="lead-score" style="color:' + scoreColor + ';background:' + scoreBg + '">' + (l.qualificationScore || 0) + '</span>' +
      '<button class="mute-toggle ' + (isMuted ? 'muted' : 'active') + '" onclick="toggleMute(\\'' + l.userId + '\\',' + !isMuted + ',this)">' + (isMuted ? 'מושתק' : 'פעיל') + '</button>' +
    '</div>';
  }).join('');
}

async function toggleMute(userId, mute, btn) {
  btn.disabled = true;
  try {
    var res = await fetch('/api/app/leads/' + encodeURIComponent(userId) + '/ignore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ignored: mute })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    var lead = allLeads.find(function(l) { return l.userId === userId; });
    if (lead) lead.ignored = mute;
    var item = btn.closest('.lead-item');
    if (mute) {
      item.classList.add('muted');
      item.dataset.muted = '1';
      btn.className = 'mute-toggle muted';
      btn.textContent = 'מושתק';
    } else {
      item.classList.remove('muted');
      item.dataset.muted = '0';
      btn.className = 'mute-toggle active';
      btn.textContent = 'פעיל';
    }
  } catch (e) {
    alert('שגיאה: ' + e.message);
  }
  btn.disabled = false;
}

async function toggleGender(userId, _unused, btn) {
  // Read current gender from data attribute (stays in sync after updates)
  var currentGender = btn.dataset.gender || 'unknown';
  // Cycle: unknown → male → female → unknown (auto)
  var next = currentGender === 'unknown' ? 'male' : currentGender === 'male' ? 'female' : null;
  btn.disabled = true;
  try {
    var res = await fetch('/api/app/leads/' + encodeURIComponent(userId) + '/gender', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gender: next })
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    var lead = allLeads.find(function(l) { return l.userId === userId; });
    if (lead) { lead.gender = next || 'unknown'; lead.genderLocked = !!next; }
    var g = next || 'unknown';
    var gIcon = g === 'male' ? '♂' : g === 'female' ? '♀' : '?';
    var gColor = g === 'male' ? '#60a5fa' : g === 'female' ? '#f472b6' : '#555';
    var gBg = g === 'male' ? '#1e3a5f' : g === 'female' ? '#4a1942' : '#222';
    var gTitle = g === 'male' ? 'זכר (לחץ לשנות)' : g === 'female' ? 'נקבה (לחץ לשנות)' : 'לא ידוע (לחץ לקבוע)';
    btn.textContent = gIcon;
    btn.style.color = gColor;
    btn.style.background = gBg;
    btn.style.borderColor = gColor + '33';
    btn.title = gTitle;
    btn.dataset.gender = g;
  } catch (e) {
    alert('שגיאה: ' + e.message);
  }
  btn.disabled = false;
}

async function dismissFlag(userId, badge) {
  if (!confirm('לבטל את הדגל? הבוט יחזור לענות אוטומטית.')) return;
  try {
    var res = await fetch('/api/app/leads/' + encodeURIComponent(userId) + '/dismiss-flag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    var data = await res.json();
    if (data.error) throw new Error(data.error);
    var lead = allLeads.find(function(l) { return l.userId === userId; });
    if (lead) lead.needsHuman = false;
    badge.remove();
    var item = document.querySelector('.lead-item[data-user="' + userId + '"]');
    if (item) { item.classList.remove('needs-attention'); item.dataset.attention = '0'; }
  } catch (e) {
    alert('שגיאה: ' + e.message);
  }
}

function filterLeads() {
  var search = (document.getElementById('leadsSearch').value || '').toLowerCase();
  var filter = document.getElementById('leadsFilter').value;
  document.querySelectorAll('#leadsList .lead-item').forEach(function(item) {
    var name = item.dataset.name || '';
    var isMuted = item.dataset.muted === '1';
    var needsAttention = item.dataset.attention === '1';
    var matchSearch = !search || name.includes(search);
    var matchFilter = filter === 'all' || (filter === 'attention' && needsAttention) || (filter === 'muted' && isMuted) || (filter === 'active' && !isMuted);
    item.style.display = (matchSearch && matchFilter) ? '' : 'none';
  });
}


async function stopImpersonating() {
  await fetch('/master-admin/stop-impersonate', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
  window.location.href = '/master-admin';
}

// Show existing voice DNA on page load if it exists
showVoiceDnaScore(EXISTING_VOICE);
if (EXISTING_VOICE.voiceGreeting || EXISTING_VOICE.voiceExamples || EXISTING_VOICE.voicePhrases || EXISTING_VOICE.voicePersonality) {
  showVoiceDnaResults(EXISTING_VOICE);
}
</script>
</body>
</html>`;
}
