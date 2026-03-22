import express from 'express';
import http from 'http';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { config } from './config.js';
import { seedTestTenant, getTenant, getTenantByIgPageId, createTenant, updateTenant, getAllTenants, getLeadsByTenant, getOrCreateLead, getLeadIfExists, updateLead, addKnowledgeEntry, getKnowledgeEntries, getKnowledgeEntriesForTenant, getTenantKnowledgeEntries, deleteKnowledgeEntry, updateKnowledgeEntry, clearConversation, updateUserTenant, updateSessionsTenant, getSessionRecord, setImpersonation, getConversationHistory, getAllUsers, deleteSessionsByEmail, updateKnowledgeEmbedding, markEmbeddingStale, getStaleKnowledgeEntries, deleteTenantAndData, getUsageSummaryByTenant, getPlatformUsageSummary, getConversationCountByTenant, getOutcomeStats, getOutcomeStatsByTenant, getQAIssueSummary, getRecentQAIssues, getGradeStats, getGoldenExamples, updateGoldenExampleStatus, getPendingGoldenCount, cleanupExpiredSessions, getUserEmailByTenantId } from './db.js';
import { hasBillingAccess, getBillingStatus, createCheckoutSession, cancelSubscription, verifyAndParseWebhook, WebhookVerificationError } from './billing.js';
import { generateEmbedding } from './embeddings.js';
import { generateReply, analyzeVoice, extractFromScreenshot, splitReplyForHumanDelivery, sanitizeOutbound, callOpenRouter, callHaiku, extractWizardKnowledge, importVoiceDNA, importVoiceDNAv2, mapVoiceDNAToTenant, extractMessagesFromInstagramJSON, trackUsage, extractStrategy, extractFreeflowConfig } from './ai.js';
import { sendInstagramMessage, sendTypingIndicator, fetchInstagramProfile, fetchLeadConversationHistory } from './instagram.js';
import { checkReplyQuality, autoCorrect, runAIQualityCheck } from './qa.js';
import { updateOutcomeMetrics, classifyStaleOutcomes, detectCloseReason, markOutcomeFromCloseReason } from './outcomes.js';
import { gradeAndExtract } from './grader.js';
import { embedStaleGoldenExamples, reinforceVoiceFromGrades } from './golden.js';
import { embedStaleKBEntries } from './embeddings.js';
import { createUser, verifyUser, createSession, destroySession, authMiddleware, validatePassword } from './auth.js';
import { getLoginHTML, getSignupHTML, getAppHTML, getChatHTML, getDashboardHTML, getTeachHTML, getDemoHTML, getErrorPageHTML, getMasterAdminHTML, getWizardHTML, escapeHtml } from './templates/index.js';

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();

// Multipart upload handler (memory; forwarded to AI microservice)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

// SECURITY: Trust Railway's reverse proxy for secure cookies
app.set('trust proxy', 1);

// SECURITY: Add security headers (CSP disabled — templates use inline scripts)
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

// SECURITY: Capture raw body for webhook signature verification
function captureRawBody(req, res, buf) {
  if ((req.url === '/webhook' || req.url === '/webhooks/polar') && req.method === 'POST') {
    req.rawBody = buf;
  }
}

app.use(express.json({ limit: '2mb', verify: captureRawBody }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use('/public', express.static(join(__dirname, '..', 'public')));

// SECURITY: Global rate limit (skip webhook + health to not break Meta/Railway)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path === '/webhook' || req.path === '/webhooks/polar' || req.path === '/health',
  message: { error: 'Too many requests, slow down' },
});
app.use(globalLimiter);

// SECURITY: Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many login attempts, try again later',
});

// SECURITY: Rate limit for onboarding/signup to prevent spam
const onboardLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many signups, try again later' },
});

// SECURITY: Safe error response — log full details, return generic message to client
function safeError(res, err, context = 'Operation') {
  console.error(`${context} error:`, err);
  res.status(500).json({ error: 'Internal server error' });
}

// RAG: auto-embed KB entries (non-blocking, fire-and-forget)
async function embedKnowledgeEntry(id, title, content) {
  if (!config.openaiApiKey || !process.env.DATABASE_URL) return;
  const text = `${title ? title + ': ' : ''}${content}`;
  const embedding = await generateEmbedding(text, config.openaiApiKey);
  if (embedding) await updateKnowledgeEmbedding(id, embedding);
}

// --- AI Microservice Client Namespace API ---
// Creates a namespace in the AI microservice for a new paying client
async function createClientNamespace(tenantId, tenantName = null, clientGmail = null, businessName = null) {
  if (!config.aiMicroserviceEnabled) {
    console.log(`[AI Microservice] Skipped namespace creation for ${tenantId} (microservice disabled)`);
    return { success: true, skipped: true };
  }

  const url = `${(config.aiServiceUrl || 'http://localhost:8000').replace(/\/$/, '')}/clients/create`;
  const payload = {
    client_id: tenantId,
    client_name: tenantName || null,
    client_gmail: clientGmail || null,
    business_name: businessName || tenantName || null,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Client-Id': tenantId,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI microservice HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    const data = await res.json();
    console.log(`[AI Microservice] Created namespace for client ${tenantId}: ${data.message}`);
    return {
      success: data.success,
      namespaceCreated: data.namespace_created,
      ragEnabled: data.rag_enabled,
    };
  } catch (err) {
    clearTimeout(timeout);
    // Non-blocking: log error but don't fail the subscription activation
    console.error(`[AI Microservice] Failed to create namespace for ${tenantId}:`, err.message);
    return { success: false, error: err.message };
  }
}

// --- AI Microservice Consolidate API ---
// Consolidates multiple consecutive messages from the same user into a single coherent message
async function callConsolidateMicroservice(messages) {
  if (!config.aiMicroserviceEnabled) {
    // When microservice is disabled, just join messages with newlines
    return {
      consolidatedMessage: messages.join('\n'),
      wasConsolidated: false,
      originalCount: messages.length,
    };
  }

  const url = `${(config.aiServiceUrl || 'http://localhost:8000').replace(/\/$/, '')}/dm/consolidate`;
  const payload = { messages };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Consolidate microservice HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }

    const data = await res.json();
    return {
      consolidatedMessage: data.consolidated_message,
      wasConsolidated: data.was_consolidated,
      originalCount: data.original_count,
    };
  } catch (err) {
    clearTimeout(timeout);
    console.error(`[Consolidate] Failed:`, err.message);
    // Fallback to simple join on error
    return {
      consolidatedMessage: messages.join('\n'),
      wasConsolidated: false,
      originalCount: messages.length,
    };
  }
}

// --- AI Microservice Training API ---
// Calls the Python AI microservice for training/teaching operations
async function callTrainingMicroservice({ tenantId, category, sourceMessage, correction, assistantReply, title, addedBy }) {
  const maxRetries = 2;
  const baseDelay = 800;

  const url = `${(config.aiServiceUrl || 'http://localhost:8000').replace(/\/$/, '')}/training/ingest`;
  const payload = {
    client_id: tenantId,
    category: category || 'general',
    source_message: sourceMessage,
    correction: correction,
    assistant_reply: assistantReply || null,
    title: title || null,
    added_by: addedBy || null,
    locale: 'he-IL',
  };

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Id': tenantId,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Training microservice HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      }

      const data = await res.json();
      return {
        success: data.success,
        memoryCard: data.memory_card || null,
        saved: data.saved || null,
      };
    } catch (err) {
      clearTimeout(timeout);
      if (attempt === maxRetries) {
        console.error(`[${tenantId}] Training microservice failed:`, err.message);
        throw err;
      }
      const delay = baseDelay * Math.pow(2, attempt - 1);
      console.warn(`[${tenantId}] Training microservice attempt ${attempt} failed (${err.message}), retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// 30-second response timeout for all routes
app.use((req, res, next) => {
  res.setTimeout(30000, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// ⏸ PAUSE FLAG - set to true to stop auto-replies (Instagram)
// Change to false when ready to go live again
const PAUSED = false;

// Rate limiter to prevent rapid-fire bot loops
const recentReplies = new Map();

// Message debounce — batches rapid-fire messages before processing
// Key: "tenantId:senderId", Value: { messages[], timer, tenant }
const messageBuffer = new Map();

// Prevents parallel AI generation for the same user
const processingLock = new Set();

// Tracks last outbound message per user to prevent sending duplicates
const lastSentMessage = new Map();

// Track bot-to-bot exchange patterns between connected tenants
// Key: canonical tenant pair (sorted "tenantA:tenantB"), Value: { count, firstSeen, lastSeen }
const pingPongTracker = new Map();

// Seed test tenant on startup
seedTestTenant();

// ============================================
// Health check
// ============================================
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/debug/bot-status', adminAuth, async (req, res) => {
  const tenants = (await getAllTenants()).map(t => ({
    id: t.id, name: t.name, igPageId: t.igPageId,
    botActive: t.botActive, hasToken: !!t.igAccessToken
  }));
  res.json(tenants);
});

// One-time migration: point a user's sessions to the correct IG-connected tenant
app.post('/api/migrate-tenant', async (req, res) => {
  const { secret, email, targetTenantId } = req.body;
  if (secret !== config.apiSecret) return res.status(401).json({ error: 'Unauthorized' });
  if (!email || !targetTenantId) return res.status(400).json({ error: 'email and targetTenantId required' });
  const targetTenant = await getTenant(targetTenantId);
  if (!targetTenant) return res.status(404).json({ error: 'Target tenant not found' });
  await updateUserTenant(email, targetTenantId);
  await updateSessionsTenant(email, targetTenantId);
  res.json({ success: true, message: `User ${email} now points to tenant ${targetTenantId}`, tenant: { id: targetTenant.id, name: targetTenant.name, igPageId: targetTenant.igPageId } });
});

// ============================================
// Privacy Policy, Terms, Data Deletion (Meta requirements)
// ============================================
app.get('/privacy', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מדיניות פרטיות - SetterAI</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}h1{color:#111}h2{margin-top:2em}</style></head><body>
<h1>מדיניות פרטיות - SetterAI</h1>
<p>עדכון אחרון: ${new Date().toLocaleDateString('he-IL')}</p>
<h2>מידע שאנו אוספים</h2>
<p>SetterAI אוסף את המידע הבא כאשר אתה מחבר את חשבון האינסטגרם שלך:</p>
<ul>
<li>מזהה חשבון האינסטגרם העסקי שלך</li>
<li>מזהה דף הפייסבוק המקושר</li>
<li>הודעות שנשלחות לחשבון העסקי שלך באינסטגרם (לצורך מענה אוטומטי)</li>
</ul>
<h2>כיצד אנו משתמשים במידע</h2>
<p>המידע משמש אך ורק לצורך:</p>
<ul>
<li>מענה אוטומטי להודעות ישירות באינסטגרם בשם העסק שלך</li>
<li>ניהול לידים ומעקב אחרי שיחות</li>
</ul>
<h2>שיתוף מידע</h2>
<p>איננו מוכרים, משתפים או מעבירים את המידע שלך לצדדים שלישיים, למעט ספקי שירות הנדרשים להפעלת השירות (כגון שירותי AI לעיבוד שפה).</p>
<h2>מחיקת מידע</h2>
<p>תוכל לבקש מחיקת כל המידע שלך בכל עת. ראה <a href="/data-deletion">דף מחיקת מידע</a>.</p>
<h2>יצירת קשר</h2>
<p>לשאלות בנושא פרטיות: <a href="mailto:support@setterai.com">support@setterai.com</a></p>
</body></html>`);
});

app.get('/terms', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>תנאי שימוש - SetterAI</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}h1{color:#111}h2{margin-top:2em}</style></head><body>
<h1>תנאי שימוש - SetterAI</h1>
<p>עדכון אחרון: ${new Date().toLocaleDateString('he-IL')}</p>
<h2>תיאור השירות</h2>
<p>SetterAI מספק שירות מענה אוטומטי להודעות ישירות באינסטגרם עבור עסקים. השירות משתמש בבינה מלאכותית כדי לנהל שיחות, לאסוף לידים ולקבוע פגישות בשם העסק.</p>
<h2>שימוש מותר</h2>
<ul>
<li>השירות מיועד לשימוש עסקי בלבד</li>
<li>אתה אחראי לתוכן שהבוט שולח בשמך</li>
<li>אסור להשתמש בשירות לספאם, הטרדה או כל פעילות לא חו����ית</li>
</ul>
<h2>חשבון אינסטגרם</h2>
<p>בחיבור חשבון האינסטגרם שלך, אתה מאשר ל-SetterAI לקרוא ולהגיב להודעות ישירות בשמך.</p>
<h2>הגבלת אחריות</h2>
<p>SetterAI מסופק "כמות שהוא". איננו אחראים לנזקים שעלולים לנבוע משימוש בשירות.</p>
<h2>יציר���� קשר</h2>
<p>לשאלות: <a href="mailto:support@setterai.com">support@setterai.com</a></p>
</body></html>`);
});

// Data Deletion callback (Meta requirement)
app.get('/data-deletion', (req, res) => {
  res.send(`<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>מחיקת מידע - SetterAI</title>
<style>body{font-family:system-ui,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#222;line-height:1.7}h1{color:#111}</style></head><body>
<h1>בקשת מחיקת מידע</h1>
<p>כדי לבקש מחיקת כל המידע שלך מ-SetterAI, שלח אימייל ל: <a href="mailto:support@setterai.com">support@setterai.com</a></p>
<p>נטפל בבקשתך תוך 30 יום.</p>
</body></html>`);
});

app.post('/data-deletion', (req, res) => {
  // Meta sends a signed_request when a user requests data deletion
  const confirmationCode = `del_${Date.now()}`;
  console.log(`[Data Deletion] Request received, code: ${confirmationCode}`);
  res.json({
    url: `${config.baseUrl}/data-deletion`,
    confirmation_code: confirmationCode,
  });
});

// ============================================
// Auth Routes - Login / Signup / Logout
// ============================================
app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.send(getLoginHTML());
});

app.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.send(getLoginHTML('נא למלא אימייל וסיסמה'));
  const user = await verifyUser(email, password);
  if (!user) return res.send(getLoginHTML('אימייל או סיסמה שגויים'));
  const sessionId = await createSession(email, user.tenantId);
  const isSecure = config.baseUrl.startsWith('https');
  res.cookie('session_id', sessionId, { httpOnly: true, secure: isSecure, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  res.redirect('/app');
});

app.get('/signup', (req, res) => {
  res.send(getSignupHTML());
});

app.post('/signup', authLimiter, async (req, res) => {
  const { email, password, name, businessType, services, ownerName, phone, instagram, bookingInstructions } = req.body;
  if (!email || !password || !name || !ownerName) {
    return res.send(getSignupHTML('נא למלא את כל השדות החובה'));
  }
  // SECURITY: Server-side password validation
  const passwordError = validatePassword(password);
  if (passwordError) return res.send(getSignupHTML(passwordError));
  // Create tenant with all business info
  const tenant = await createTenant({
    name,
    businessType: businessType || '',
    services: services || '',
    ownerName,
    phone: phone || '',
    instagram: instagram || '',
    bookingInstructions: bookingInstructions || '',
    status: 'pending_setup',
  });
  // Create user linked to tenant
  const result = await createUser(email, password, tenant.id);
  if (result.error) return res.send(getSignupHTML(result.error));
  
  // Create client namespace in AI microservice vector store (non-blocking)
  // This prepares the vector store for document uploads / RAG features
  createClientNamespace(tenant.id, tenant.name, email, tenant.name).catch(err => {
    console.error(`[Signup] Failed to create vector store namespace for ${tenant.id}:`, err.message);
  });
  
  // Auto-login
  const sessionId = await createSession(email, tenant.id);
  const isSecure = config.baseUrl.startsWith('https');
  res.cookie('session_id', sessionId, { httpOnly: true, secure: isSecure, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
  // Redirect to Instagram connect
  res.redirect('/connect/' + tenant.id);
});

app.get('/logout', async (req, res) => {
  const sessionId = req.cookies && req.cookies.session_id;
  if (sessionId) await destroySession(sessionId);
  res.clearCookie('session_id');
  res.redirect('/login');
});

// ============================================
// Client Dashboard - /app (protected)
// ============================================
app.get('/app', authMiddleware, async (req, res) => {
  const tenant = await getTenant(req.tenantId);
  if (!tenant) return res.redirect('/login');
  const entries = await getTenantKnowledgeEntries(req.tenantId);
  const globalEntries = await getKnowledgeEntries();
  const justConnected = req.query.connected === 'true';
  const isAdmin = isAdminEmail(req.userEmail);
  res.send(getAppHTML(tenant, entries, globalEntries, justConnected, isAdmin, req.isImpersonating, config));
});

// API: Tenant-scoped knowledge (add)
app.post('/api/app/knowledge', authMiddleware, async (req, res) => {
  const { category, title, content } = req.body;
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }
  if (content.length > 10000) {
    return res.status(400).json({ error: 'Content too long (max 10,000 characters)' });
  }
  const entry = await addKnowledgeEntry({
    category: category || 'general',
    title: title || '',
    content: content.trim(),
    addedBy: req.userEmail,
  }, req.tenantId);
  embedKnowledgeEntry(entry.id, entry.title, entry.content).catch(err =>
    console.warn(`[RAG] Auto-embed failed for ${entry.id}:`, err.message));
  res.json(entry);
});

// API: Tenant-scoped knowledge (get - only their own)
app.get('/api/app/knowledge', authMiddleware, async (req, res) => {
  const category = req.query.category;
  let entries = await getTenantKnowledgeEntries(req.tenantId);
  if (category) entries = entries.filter(e => e.category === category);
  res.json(entries);
});

// API: Tenant-scoped knowledge (delete) — SECURITY: tenant ownership verified
app.delete('/api/app/knowledge/:id', authMiddleware, async (req, res) => {
  const deleted = await deleteKnowledgeEntry(req.params.id, req.tenantId);
  if (!deleted) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

// API: Tenant-scoped knowledge (inline edit) — SECURITY: tenant ownership verified
app.patch('/api/app/knowledge/:id', authMiddleware, async (req, res) => {
  const { title, content, category } = req.body;
  const fields = {};
  if (title !== undefined) fields.title = title.trim();
  if (content !== undefined) fields.content = content.trim();
  if (category !== undefined) fields.category = category;
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
  const updated = await updateKnowledgeEntry(req.params.id, fields, req.tenantId);
  if (!updated) return res.status(404).json({ error: 'Entry not found' });
  if (fields.content) markEmbeddingStale(req.params.id).catch(() => {});
  res.json(updated);
});

// API: Teaching chat — conversational knowledge + voice teaching
// Now routes to AI microservice for training operations
app.post('/api/app/teach-chat', authMiddleware, async (req, res) => {
  try {
    const { message, conversationHistory = [], category = 'general' } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 5000) return res.status(400).json({ error: 'Message too long (max 5000 chars)' });

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Call AI microservice for training
    const result = await callTrainingMicroservice({
      tenantId: req.tenantId,
      category: category,
      sourceMessage: message.trim(),
      correction: message.trim(), // In teaching mode, user message is the correction/instruction
      assistantReply: null,
      title: null,
      addedBy: req.userEmail || 'teaching-chat',
    });

    // Also save to local knowledge base for RAG (if microservice succeeded)
    const executedActions = [];
    if (result.success && result.memoryCard) {
      const card = result.memoryCard;
      
      // Map microservice card kind to local KB category
      const categoryMap = {
        rule: 'rules',
        sop: 'sop',
        faq: 'faq',
        tone: 'tone',
        script: 'scripts',
        objection: 'objections',
        note: 'general',
      };
      const localCategory = categoryMap[card.kind] || 'general';

      // Save to local knowledge base
      const entry = await addKnowledgeEntry({
        category: localCategory,
        title: card.summary || '',
        content: card.instruction || message.trim(),
        addedBy: req.userEmail || 'teaching-chat',
      }, req.tenantId);

      // Embed for RAG search
      embedKnowledgeEntry(entry.id, entry.title, entry.content).catch(err =>
        console.warn('[RAG] Auto-embed failed:', err.message)
      );

      executedActions.push({
        type: 'add_knowledge',
        category: localCategory,
        title: card.summary || '',
        content: card.instruction || message.trim(),
        id: entry.id,
        confidence: card.confidence || 0.8,
      });
    }

    // Build reply message
    const replyText = result.memoryCard?.summary
      ? `הבנתי! שמרתי: ${result.memoryCard.summary}`
      : 'הבנתי! המידע נשמר.';

    res.json({
      reply: replyText,
      actions: executedActions,
      needs_clarification: false,
      microservice_result: result, // Include full result for debugging
    });
  } catch (err) {
    // Fallback: If microservice fails, try to save directly to local KB
    console.error('[Teaching chat] Microservice failed, attempting local fallback:', err.message);
    
    try {
      const { message, category = 'general' } = req.body;
      const entry = await addKnowledgeEntry({
        category: category,
        title: '',
        content: message.trim(),
        addedBy: req.userEmail || 'teaching-chat',
      }, req.tenantId);

      embedKnowledgeEntry(entry.id, entry.title, entry.content).catch(() => {});

      res.json({
        reply: 'הבנתי! המידע נשמר (מצב fallback).',
        actions: [{
          type: 'add_knowledge',
          category: category,
          content: message.trim(),
          id: entry.id,
        }],
        needs_clarification: false,
        fallback: true,
      });
    } catch (fallbackErr) {
      safeError(res, fallbackErr, 'Teaching chat fallback');
    }
  }
});

// API: Tenant-scoped chat
app.post('/api/app/chat', authMiddleware, async (req, res) => {
  try {
    const { message, userId = 'dashboard-user' } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'Message is required' });
    if (message.length > 5000) return res.status(400).json({ error: 'Message too long' });
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const reply = await generateReply(tenant, userId, message.trim());
    res.json({ reply: reply || '(השיחה הסתיימה — הבוט בחר לא לענות)' });
  } catch (err) {
    safeError(res, err, 'App chat');
  }
});

// API: Tenant-scoped chat reset
app.post('/api/app/chat/reset', authMiddleware, async (req, res) => {
  const { userId = 'dashboard-user' } = req.body;
  await clearConversation(req.tenantId, userId);
  res.json({ success: true });
});

// API: Update tenant settings
app.post('/api/app/settings', authMiddleware, async (req, res) => {
  const allowed = ['name', 'businessType', 'services', 'ownerName', 'workingHours', 'bookingInstructions', 'customFirstReply', 'slangWords', 'websiteLinks', 'botActive', 'voiceGreeting', 'voiceEnergy', 'voicePhrases', 'voicePhrasesMale', 'voicePhrasesFemale', 'voiceEmoji', 'voiceLength', 'voiceHumor', 'voiceExamples', 'voiceAvoid', 'voicePersonality', 'aiTemperature', 'botGender', 'customFlowInstructions', 'ignoreList', 'ctaPushLevel', 'ctaType', 'ownerPhone', 'ctaCustomText', 'triggerWords', 'conversationStrategy', 'delayConfig', 'botGoal', 'maxBotMessages', 'systemPrompt'];
  if (req.body.customFlowInstructions !== undefined && req.body.customFlowInstructions.length > 5000) {
    return res.status(400).json({ error: 'Custom flow instructions too long (max 5000 chars)' });
  }
  // Validate triggerWords if provided
  if (req.body.triggerWords !== undefined) {
    if (!Array.isArray(req.body.triggerWords)) {
      return res.status(400).json({ error: 'triggerWords must be an array' });
    }
    if (req.body.triggerWords.length > 20) {
      return res.status(400).json({ error: 'Maximum 20 trigger words allowed' });
    }
    for (const tw of req.body.triggerWords) {
      if (!tw.word || typeof tw.word !== 'string' || !tw.reply || typeof tw.reply !== 'string') {
        return res.status(400).json({ error: 'Each trigger word must have a word and reply' });
      }
      if (tw.word.length > 50 || tw.reply.length > 500) {
        return res.status(400).json({ error: 'Word max 50 chars, reply max 500 chars' });
      }
    }
  }
  // Validate delayConfig if provided
  if (req.body.delayConfig !== undefined && req.body.delayConfig !== null) {
    const dc = req.body.delayConfig;
    if (typeof dc !== 'object') return res.status(400).json({ error: 'delayConfig must be an object or null' });
    const validPresets = ['instant', 'fast', 'natural', 'slow', 'custom'];
    if (!validPresets.includes(dc.preset)) return res.status(400).json({ error: 'Invalid delay preset' });
    if (dc.preset === 'custom') {
      const nums = ['firstReplyMin', 'firstReplyMax', 'followUpMin', 'followUpMax', 'splitDelay', 'debounce'];
      for (const key of nums) {
        if (dc[key] !== undefined && (typeof dc[key] !== 'number' || dc[key] < 0 || dc[key] > 120000)) {
          return res.status(400).json({ error: `${key} must be 0-120000ms` });
        }
      }
      if ((dc.firstReplyMin || 0) > (dc.firstReplyMax || 30000)) {
        return res.status(400).json({ error: 'firstReplyMin must be <= firstReplyMax' });
      }
      if ((dc.followUpMin || 0) > (dc.followUpMax || 10000)) {
        return res.status(400).json({ error: 'followUpMin must be <= followUpMax' });
      }
    }
  }
  const fields = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }
  const updated = await updateTenant(req.tenantId, fields);
  if (!updated) return res.status(404).json({ error: 'Tenant not found' });

  // Retroactive mute/unmute: when ignore list changes, sync all existing leads
  if (fields.ignoreList !== undefined) {
    const leads = await getLeadsByTenant(req.tenantId);
    let mutedCount = 0, unmutedCount = 0;
    for (const lead of leads) {
      const shouldMute = matchesIgnoreList(updated, lead);
      if (!lead.ignored && shouldMute) {
        await updateLead(req.tenantId, lead.userId, { ignored: true });
        mutedCount++;
        console.log(`[${updated.name}] Retroactive mute: ${lead.userId} (${lead.instagramName || '?'}, @${lead.instagramUsername || '?'})`);
      } else if (lead.ignored && !shouldMute) {
        await updateLead(req.tenantId, lead.userId, { ignored: false });
        unmutedCount++;
        console.log(`[${updated.name}] Retroactive unmute: ${lead.userId} (${lead.instagramName || '?'}, @${lead.instagramUsername || '?'})`);
      }
    }
    if (mutedCount || unmutedCount) {
      console.log(`[${updated.name}] Ignore list sync: ${mutedCount} muted, ${unmutedCount} unmuted`);
    }
  }

  res.json({ success: true, tenant: updated });
});

// API: Get tenant settings
app.get('/api/app/settings', authMiddleware, async (req, res) => {
  const tenant = await getTenant(req.tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

  res.json({
    name: tenant.name,
    businessType: tenant.businessType,
    services: tenant.services,
    ownerName: tenant.ownerName,
    workingHours: tenant.workingHours,
    bookingInstructions: tenant.bookingInstructions,
    customFirstReply: tenant.customFirstReply,
    slangWords: tenant.slangWords,
    websiteLinks: tenant.websiteLinks,
    voiceGreeting: tenant.voiceGreeting,
    voiceEnergy: tenant.voiceEnergy,
    voicePhrases: tenant.voicePhrases,
    voicePhrasesMale: tenant.voicePhrasesMale,
    voicePhrasesFemale: tenant.voicePhrasesFemale,
    voiceEmoji: tenant.voiceEmoji,
    voiceLength: tenant.voiceLength,
    voiceHumor: tenant.voiceHumor,
    voiceExamples: tenant.voiceExamples,
    voiceAvoid: tenant.voiceAvoid,
    voicePersonality: tenant.voicePersonality,
    igPageId: tenant.igPageId,
    botActive: tenant.botActive,
    botGender: tenant.botGender,
    customFlowInstructions: tenant.customFlowInstructions,
    ignoreList: tenant.ignoreList || '',
    triggerWords: tenant.triggerWords || [],
    conversationStrategy: tenant.conversationStrategy || null,
    delayConfig: tenant.delayConfig || null,
  });
});

// API: Get leads for current tenant
app.get('/api/app/leads', authMiddleware, async (req, res) => {
  const leads = await getLeadsByTenant(req.tenantId);
  res.json(leads);
});

// API: Toggle mute/ignore for a lead
app.post('/api/app/leads/:userId/ignore', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { ignored } = req.body;
  if (typeof ignored !== 'boolean') {
    return res.status(400).json({ error: 'ignored must be a boolean' });
  }
  const lead = await updateLead(req.tenantId, userId, { ignored });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  console.log(`[${req.tenantId}] Lead ${userId} ${ignored ? 'muted' : 'unmuted'} by dashboard`);
  res.json({ success: true, lead });
});

// API: Set gender for a lead (manual override from dashboard)
app.post('/api/app/leads/:userId/gender', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { gender } = req.body;
  if (gender !== null && gender !== 'male' && gender !== 'female') {
    return res.status(400).json({ error: 'gender must be "male", "female", or null' });
  }
  // null = reset to auto-detect, non-null = lock to manual value
  const updates = gender ? { gender, genderLocked: true } : { gender: null, genderLocked: false };
  const lead = await updateLead(req.tenantId, userId, updates);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  console.log(`[${req.tenantId}] Lead ${userId} gender ${gender ? 'set to ' + gender + ' (locked)' : 'reset to auto'} by dashboard`);
  res.json({ success: true, lead });
});

// API: Dismiss needs_human flag (owner takes over or resolves the issue)
app.post('/api/app/leads/:userId/dismiss-flag', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const lead = await updateLead(req.tenantId, userId, { needsHuman: false, needsHumanReason: null });
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  console.log(`[${req.tenantId}] needs_human dismissed for ${userId} by dashboard`);
  res.json({ success: true, lead });
});

// API: Get conversation history for a specific user
app.get('/api/app/conversation/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const conversation = await getConversationHistory(req.tenantId, userId);
  res.json(conversation);
});

// API: Analyze voice from pasted DM conversations
app.post('/api/app/analyze-voice', authMiddleware, async (req, res) => {
  try {
    const { conversations } = req.body;
    if (!conversations || conversations.trim().length < 50) {
      return res.status(400).json({ error: 'הדבק לפחות שיחה אחת מלאה' });
    }
    const { profile, usage: voiceUsage } = await analyzeVoice(conversations.trim());
    trackUsage(req.tenantId, 'VoiceAnalyzer', voiceUsage);
    res.json({ profile });
  } catch (err) {
    safeError(res, err, 'Voice analysis');
  }
});

// API: Import Voice DNA — analyzes DM conversations and saves compact voice profile
app.post('/api/app/import-voice', authMiddleware, async (req, res) => {
  try {
    let { conversations } = req.body;
    if (!conversations || typeof conversations !== 'string') {
      return res.status(400).json({ error: 'conversations text is required' });
    }
    // Try to parse as Instagram JSON export, fall back to plain text
    const extracted = extractMessagesFromInstagramJSON(conversations);
    if (extracted) conversations = extracted;

    if (conversations.trim().length < 50) {
      return res.status(400).json({ error: 'הדבק לפחות שיחה אחת מלאה (מינימום 50 תווים)' });
    }
    if (conversations.length > 30000) {
      return res.status(400).json({ error: 'טקסט ארוך מדי (מקסימום 30,000 תווים)' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const { dna, usage: dnaUsage } = await importVoiceDNA(conversations.trim());
    trackUsage(req.tenantId, 'VoiceDNA', dnaUsage);
    const mapped = mapVoiceDNAToTenant(dna);
    await updateTenant(req.tenantId, mapped);

    console.log(`[VoiceDNA] Imported for tenant ${tenant.name} (${req.tenantId}) by ${req.userEmail}`);
    res.json({ success: true, imported: mapped });
  } catch (err) {
    safeError(res, err, 'Voice DNA import');
  }
});

// API: Import Voice DNA v2 — structured multi-chunk analysis pipeline
app.post('/api/app/import-voice-v2', authMiddleware, async (req, res) => {
  try {
    const { ownerName, stats, topConversations, meta } = req.body;
    if (!topConversations || !Array.isArray(topConversations) || topConversations.length === 0) {
      return res.status(400).json({ error: 'topConversations array is required' });
    }
    if (!ownerName) {
      return res.status(400).json({ error: 'ownerName is required' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const { dna, usage: dnaUsage } = await importVoiceDNAv2({ ownerName, stats, topConversations });
    trackUsage(req.tenantId, 'VoiceDNA-v2', dnaUsage);
    const mapped = mapVoiceDNAToTenant(dna);

    // Save import metadata alongside the voice profile
    const importMeta = {
      importedAt: new Date().toISOString(),
      totalConversations: meta?.totalConversations || 0,
      conversationsAnalyzed: meta?.conversationsAnalyzed || topConversations.length,
      totalOwnerMessages: meta?.totalOwnerMessages || 0,
      dateRange: meta?.dateRange || '',
      ownerName,
      version: 2,
    };
    mapped.voiceImportMeta = importMeta;

    await updateTenant(req.tenantId, mapped);

    console.log(`[VoiceDNA-v2] Imported for tenant ${tenant.name} (${req.tenantId}) — ${topConversations.length} convos, owner: ${ownerName}`);
    res.json({ success: true, imported: mapped, meta: importMeta });
  } catch (err) {
    safeError(res, err, 'Voice DNA v2 import');
  }
});

// API: Voice DNA validation — generate sample responses to test the voice profile
app.post('/api/app/voice-validate', authMiddleware, async (req, res) => {
  try {
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.voiceExamples && !tenant.voicePersonality) {
      return res.status(400).json({ error: 'No Voice DNA found — import first' });
    }

    // Define test scenarios with conversation context
    // Mix of qualify (sales) and casual (engage) to show the bot's range
    const scenarios = [
      { id: 'greeting', label: 'לקוח אומר שלום', message: 'היי', context: 'זו הו��עה ראשונה. עוד לא יודעים מה הלקוח רוצה. תגיב בחמימות וקצר.' },
      { id: 'fan', label: 'עוקב מפרגן', message: 'אחי הפוסט האחרון שלך היה מטורף 🔥', context: 'זה עוקב שמפרגן על תוכן. אל תמכור לו! תפרגן בחזרה, קצר וחם.' },
      { id: 'question', label: 'שאלה מקצועית', message: 'יש לי שאלה — איך אתה מטפל ב...?', context: 'לקוח שואל שאלה מקצועית. תענה בקצרה ובמקצועיות. אל תדחוף לשיחה.' },
      { id: 'pain', label: 'לקוח משתף קושי', message: 'אני תקוע כבר חודש, לא מצליח להתקדם', context: 'לקוח משתף כאב/תסכול. קודם אמפתיה אמיתית! אל תקפוץ ישר להצעת שיחה.' },
      { id: 'ready', label: 'לקוח מוכן להתחיל', message: 'אני רוצה להתחיל, מה השלב הבא?', context: 'הלקוח מוכן. תסגור בטבעיות — הצע שיחה/פגישה בסגנון שלך.' },
    ];

    // Build a mini voice profile for the test prompt
    const voiceCtx = [];
    if (tenant.voicePersonality) voiceCtx.push(`אישיות: ${tenant.voicePersonality}`);
    if (tenant.voiceGreeting) voiceCtx.push(`ברכה: ${tenant.voiceGreeting}`);
    if (tenant.voicePhrases) voiceCtx.push(`ביטויים: ${tenant.voicePhrases}`);
    if (tenant.voiceEnergy) voiceCtx.push(`אנרגיה: ${tenant.voiceEnergy}`);
    if (tenant.voiceExamples) voiceCtx.push(`דוגמאות:\n${tenant.voiceExamples.slice(0, 3000)}`);
    const voiceProfile = voiceCtx.join('\n');

    // Generate responses in parallel
    const results = await Promise.all(
      scenarios.map(async (scenario) => {
        try {
          const result = await callHaiku(
            [
              {
                role: 'system',
                content: `אתה בעל עסק ישרא��י שעונה בDM באינסטגרם. כתוב תגובה קצרה (1-3 משפטים מקסימום!) בסגנון של Voice DNA למטה.

חוקים:
- זה DM באינסטגרם — תהיה קצר, חם, וטבעי כמו בן אדם אמיתי
- 1-3 משפטים מקסימום! לא יותר!
- אל תמכור אלא אם הלקוח מוכן — רוב השיחות הן בניית קשר
- תתאים את רמת האנרגיה להודעת הלקוח

Voice DNA:
${voiceProfile}

העסק: ${tenant.name || ''} — ${tenant.services || ''}

הקשר: ${scenario.context}

כתוב רק את ההודעה עצמה בעברית — בלי הסבר, בלי מרכאות.`,
              },
              { role: 'user', content: scenario.message },
            ],
            150,
            'VoiceDNA-Validate'
          );
          return { ...scenario, response: result?.content?.trim() || null };
        } catch {
          return { ...scenario, response: null };
        }
      })
    );

    res.json({ scenarios: results.filter(r => r.response) });
  } catch (err) {
    safeError(res, err, 'Voice DNA validation');
  }
});

// API: Extract knowledge from uploaded screenshot
app.post('/api/app/screenshot', authMiddleware, async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'No image provided' });
    }
    if (image.length > 10 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 10MB)' });
    }
    const { content: extracted, usage: ssUsage } = await extractFromScreenshot(image, mimeType || 'image/jpeg');
    trackUsage(req.tenantId, 'Screenshot', ssUsage);
    res.json({ content: extracted });
  } catch (err) {
    safeError(res, err, 'Screenshot extraction');
  }
});

// ============================================
// AI Microservice Proxy API (RAG documents + testing)
// ============================================

function getAiServiceBaseUrl() {
  return (config.aiServiceUrl || 'http://localhost:8000').replace(/\/$/, '');
}

async function fetchAiService(path, init = {}) {
  const url = `${getAiServiceBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`AI service ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Upload a PDF to the AI microservice (tenant-scoped namespace)
app.post('/api/app/ai/documents/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file is required' });
    if (!req.file.originalname?.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const form = new FormData();
    form.append('client_id', req.tenantId);
    form.append(
      'file',
      new Blob([req.file.buffer], { type: req.file.mimetype || 'application/pdf' }),
      req.file.originalname
    );

    const data = await fetchAiService('/documents/upload', { method: 'POST', body: form });
    res.json(data);
  } catch (err) {
    safeError(res, err, 'AI documents upload');
  }
});

// List documents for tenant (microservice proxy)
app.get('/api/app/ai/documents', authMiddleware, async (req, res) => {
  try {
    const data = await fetchAiService(`/documents/${encodeURIComponent(req.tenantId)}/list`, { method: 'GET' });
    res.json(data);
  } catch (err) {
    safeError(res, err, 'AI documents list');
  }
});

// Delete all documents for tenant (microservice proxy)
app.delete('/api/app/ai/documents', authMiddleware, async (req, res) => {
  try {
    const data = await fetchAiService(`/documents/${encodeURIComponent(req.tenantId)}`, { method: 'DELETE' });
    res.json(data);
  } catch (err) {
    safeError(res, err, 'AI documents delete');
  }
});

// Test the AI microservice directly (returns sources/confidence/lead_metadata)
app.post('/api/app/ai/test-reply', authMiddleware, async (req, res) => {
  try {
    const { message, userId = 'ai-test-user', testContext } = req.body || {};
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    let tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Optional one-off overrides (same pattern as /api/chat)
    if (testContext) {
      tenant = { ...tenant };
      if (testContext.businessType) tenant.businessType = testContext.businessType;
      if (testContext.services) tenant.services = testContext.services;
      if (testContext.ownerName) tenant.ownerName = testContext.ownerName;
      if (testContext.name) tenant.name = testContext.name;
      if (testContext.bookingInstructions) tenant.bookingInstructions = testContext.bookingInstructions;
      if (testContext.workingHours) tenant.workingHours = testContext.workingHours;
      if (testContext.demoMode) tenant._demoMode = true;
      if (testContext.demoTeachings) tenant._demoTeachings = testContext.demoTeachings;
    }

    // Ensure lead + history exist in DB so the payload matches production
    const lead = await getOrCreateLead(req.tenantId, userId);
    const history = await getConversationHistory(req.tenantId, userId, 100);

    const payload = {
      client_id: req.tenantId,
      current_message: message.trim(),
      conversation_history: (history || []).map(m => ({ role: m.role, content: m.content })),
      sender_name: lead?.instagramName || null,
      instagram_username: lead?.instagramUsername || null,
      locale: 'he-IL',
      tenant_profile: {
        name: tenant.name || null,
        businessType: tenant.businessType || null,
        services: tenant.services || null,
        ownerName: tenant.ownerName || null,
        botGoal: tenant.botGoal || null,
        ctaType: tenant.ctaType || null,
        bookingInstructions: tenant.bookingInstructions || null,
        workingHours: tenant.workingHours || null,
        voiceGreeting: tenant.voiceGreeting || null,
        voiceEnergy: tenant.voiceEnergy || null,
        voicePhrases: tenant.voicePhrases || null,
        voicePhrasesMale: tenant.voicePhrasesMale || null,
        voicePhrasesFemale: tenant.voicePhrasesFemale || null,
        voiceEmoji: tenant.voiceEmoji || null,
        voiceLength: tenant.voiceLength || null,
        voiceHumor: tenant.voiceHumor || null,
        voiceAvoid: tenant.voiceAvoid || null,
        voicePersonality: tenant.voicePersonality || null,
        slangWords: tenant.slangWords || null,
        voiceExamples: tenant.voiceExamples || null,
        customFlowInstructions: tenant.customFlowInstructions || null,
      },
      lead_state: {
        entryType: lead?.entryType || null,
        conversationMode: lead?.conversationMode || null,
        qualificationScore: typeof lead?.qualificationScore === 'number' ? lead.qualificationScore : null,
        intent: lead?.intent || null,
        gathered: lead?.gathered || {},
        bookingLinkSent: !!lead?.bookingLinkSent,
        gender: lead?.gender || null,
        needsHuman: !!lead?.needsHuman,
      },
    };

    const data = await fetchAiService('/dm/respond', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    res.json(data);
  } catch (err) {
    safeError(res, err, 'AI test reply');
  }
});

// ============================================
// Billing API
// ============================================

// Get billing status
app.get('/api/app/billing', authMiddleware, async (req, res) => {
  try {
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const usage = await getConversationCountByTenant(req.tenantId);
    res.json(getBillingStatus(tenant, usage.conversationCount));
  } catch (err) {
    safeError(res, err, 'Billing status');
  }
});

// Get usage details
app.get('/api/app/billing/usage', authMiddleware, async (req, res) => {
  try {
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const usage = await getConversationCountByTenant(req.tenantId);
    const aiUsage = await getUsageSummaryByTenant();
    const tenantAiUsage = aiUsage.find(u => u.tenantId === req.tenantId);
    res.json({
      conversationsThisMonth: usage.conversationCount,
      messagesThisMonth: usage.messageCount,
      aiCostThisMonth: tenantAiUsage ? tenantAiUsage.costUsd : 0,
      billingModel: tenant.billingModel || 'flat',
      pricePerConversation: tenant.pricePerConversation || 0,
      currentBill: tenant.billingModel === 'per_conversation'
        ? usage.conversationCount * (tenant.pricePerConversation || 0)
        : (tenant.monthlyPayment || config.defaultMonthlyPrice / 100),
    });
  } catch (err) {
    safeError(res, err, 'Billing usage');
  }
});

// Create checkout session
app.post('/api/app/billing/checkout', authMiddleware, async (req, res) => {
  try {
    if (!config.polarAccessToken) {
      return res.status(503).json({ error: 'Billing not configured' });
    }
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    const checkout = await createCheckoutSession(tenant, req.userEmail);
    console.log(`[Billing] Checkout created for ${tenant.name} (${req.tenantId})`);
    res.json({ checkoutUrl: checkout.url });
  } catch (err) {
    safeError(res, err, 'Billing checkout');
  }
});

// Cancel subscription
app.post('/api/app/billing/cancel', authMiddleware, async (req, res) => {
  try {
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    if (!tenant.polarSubscriptionId) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }
    await cancelSubscription(tenant.polarSubscriptionId);
    await updateTenant(req.tenantId, { paymentStatus: 'cancelled' });
    console.log(`[Billing] Subscription cancelled for ${tenant.name} (${req.tenantId})`);
    res.json({ success: true, message: 'Subscription cancelled. Access continues until end of billing period.' });
  } catch (err) {
    safeError(res, err, 'Billing cancel');
  }
});

// Polar webhook handler
app.post('/webhooks/polar', async (req, res) => {
  try {
    const event = verifyAndParseWebhook(req.rawBody, req.headers);
    console.log(`[Polar Webhook] ${event.type}`);

    // Try metadata first, then fall back to finding tenant by Polar subscription ID
    const metadata = event.data?.metadata || {};
    let tenantId = metadata.tenantId;

    // Fallback: look up tenant by polarSubscriptionId for subscription events without metadata
    if (!tenantId && event.data?.id && ['subscription.active', 'subscription.canceled', 'subscription.revoked'].includes(event.type)) {
      const allTenants = await getAllTenants();
      const match = allTenants.find(t => t.polarSubscriptionId === event.data.id);
      if (match) tenantId = match.id;
    }

    switch (event.type) {
      case 'subscription.active': {
        if (tenantId) {
          // Update tenant payment status in PostgreSQL
          await updateTenant(tenantId, {
            paymentStatus: 'paid',
            polarSubscriptionId: event.data.id,
            polarCustomerId: event.data.customerId || '',
          });
          console.log(`[Billing] Tenant ${tenantId} → paid (subscription ${event.data.id})`);

          // Create namespace in AI microservice for this client (non-blocking)
          // Uses the PostgreSQL tenant ID as the namespace identifier
          const tenant = await getTenant(tenantId);
          const userEmail = await getUserEmailByTenantId(tenantId);
          createClientNamespace(tenantId, tenant?.name, userEmail, tenant?.name).catch(err => {
            console.error(`[Billing] Background namespace creation failed for ${tenantId}:`, err.message);
          });
        } else {
          console.warn(`[Polar Webhook] subscription.active but no tenantId found in metadata or by subscription ID`);
        }
        break;
      }
      case 'subscription.canceled': {
        if (tenantId) {
          await updateTenant(tenantId, { paymentStatus: 'cancelled' });
          console.log(`[Billing] Tenant ${tenantId} → cancelled`);
        }
        break;
      }
      case 'subscription.revoked': {
        if (tenantId) {
          await updateTenant(tenantId, {
            paymentStatus: 'unpaid',
            polarSubscriptionId: '',
          });
          console.log(`[Billing] Tenant ${tenantId} → revoked (payment failed)`);
        }
        break;
      }
      case 'checkout.updated': {
        console.log(`[Polar Webhook] Checkout updated: ${event.data?.status}`);
        break;
      }
      default:
        console.log(`[Polar Webhook] Unhandled event: ${event.type}`);
    }

    res.status(202).send('');
  } catch (err) {
    if (err instanceof WebhookVerificationError) {
      console.warn('[Polar Webhook] Signature verification failed');
      return res.status(403).send('');
    }
    console.error('[Polar Webhook] Error:', err);
    res.status(500).send('');
  }
});

// ============================================
// Onboarding Wizard
// ============================================

app.get('/wizard', authMiddleware, async (req, res) => {
  const tenant = await getTenant(req.tenantId);
  if (!tenant) return res.redirect('/login');
  res.send(getWizardHTML(tenant));
});

// Wizard chat: AI plays customer, owner replies — each scenario is a fresh customer
app.post('/api/app/wizard-chat', authMiddleware, async (req, res) => {
  try {
    const { message, conversationHistory = [], gender = 'male', currentPhase = 1, coveredScenarios = [], lastScenarioMessages = [] } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const isNewScenario = message === '__start__' || message === '__new_scenario__';

    const genderLabel = gender === 'female' ? 'לקוחה' : 'לקוח';
    const genderSuffix = gender === 'female' ? 'ת' : '';
    const serviceHint = tenant.services ? tenant.services.split(',')[0].trim() : 'השירות שלכם';

    const phaseScenarios = {
      1: ['cold_opener', 'content_reaction', 'professional_question'],
      2: ['pricing', 'advice_request', 'vague_interest'],
      3: ['price_objection', 'hesitation', 'not_a_lead'],
      4: ['ready_to_book', 'fan_message', 'warm_goodbye'],
    };

    const scenarioLabels = {
      cold_opener: 'פתיחה קרה — "היי, ראיתי את הפוסט שלכם..."',
      content_reaction: 'תגובה לתוכן — "הסרטון שלך על X היה מטורף" / "הסטורי דיבר אליי"',
      professional_question: 'שאלה מקצועית — "מה דעתך על X?" / "ניסית Y?"',
      vague_interest: 'עניין כללי — "מה בדיוק אתם עושים?"',
      pricing: 'שאלת מחיר — "כמה זה עולה?" / "מה המחירים?"',
      advice_request: 'בקשת עצה — "יש לי מצב כזה... מה היית עושה?"',
      price_objection: 'התנגדות מחיר — "זה יקר לי" / "ציפיתי לפחות"',
      hesitation: 'היסוס — "צריך לחשוב..." / "לא בטוח"',
      not_a_lead: 'לא ליד — "סתם שאלה, לא מחפש שירות" / "אני בתחום, רק סקרן"',
      ready_to_book: 'מוכן לקבוע — "נשמע מעולה! איך קובעים?"',
      fan_message: 'מעריץ/פרגון — "אתה השראה" / "עוקב אחריך כבר שנה"',
      warm_goodbye: 'סיום חם — "תודה רבה, אחזור אליך"',
    };

    const phaseNames = { 1: 'תוכן, שאלות ופתיחות', 2: 'מחירים, עצות ועניין', 3: 'התנגדויות ומקרי קצה', 4: 'סגירה ושיחות קלילות' };
    const scenarios = phaseScenarios[currentPhase] || [];
    const remaining = scenarios.filter(s => !coveredScenarios.includes(s));
    const remainingLabels = remaining.map(s => scenarioLabels[s]).join('\n- ');

    let systemPrompt, aiMessages;

    if (isNewScenario) {
      // MODE 1: Open as a fresh new customer
      systemPrompt = `You are a NEW person DMing "${tenant.name}" (${tenant.businessType || 'עסק'}) on Instagram.
Casual Hebrew. Short (1-2 sentences, like a real DM). You are ${genderLabel}.

IMPORTANT: Not everyone is a customer! People DM personal brands for many reasons — they might be fans, professionals asking questions, people reacting to content, or someone wanting advice. Play the SCENARIO role naturally.

You are testing PHASE ${currentPhase}/4: ${phaseNames[currentPhase]}.

SCENARIO TYPES FOR THIS PHASE:
- ${remainingLabels || scenarios.map(s => scenarioLabels[s]).join('\n- ')}

${remaining.length > 0 ? `PICK from uncovered scenarios first. Already covered: ${coveredScenarios.filter(s => scenarios.includes(s)).join(', ') || 'none'}` : 'All covered — pick any scenario from this phase with a different angle.'}

RULES:
- Open naturally as someone who has NEVER spoken to this business/person before
- 1-2 sentences max. Sound like a real Israeli DMing on Instagram
- NO English. Vary your energy (excited / casual / skeptical / short)
- For content_reaction: reference a SPECIFIC video topic related to their business
- For professional_question: ask something an industry peer or curious person would ask
- For fan_message: sound genuine, not salesy — compliment their work
- For not_a_lead: make it clear you're NOT looking to buy
- For advice_request: describe a real situation and ask for their opinion
- After your message, add on a new line: <!--SCENARIO:scenario_name-->
- Use one of: ${scenarios.join(', ')}

Business: ${tenant.name} | Type: ${tenant.businessType || 'לא צוין'} | Services: ${tenant.services || 'לא צוין'}`;

      aiMessages = [{ role: 'system', content: systemPrompt }];
    } else {
      // MODE 2: React briefly to owner's reply (close the scenario)
      systemPrompt = `You are a person who just DMed "${tenant.name}" on Instagram.
You sent them a message, they replied. Now react naturally — continue the conversation briefly.

RULES:
- React to what they ACTUALLY said: if they answered well → acknowledge + maybe a follow-up. If they dodged → call it out gently
- 1-2 sentences. This is a natural DM exchange, not a scripted conversation
- You can ask a short follow-up if it feels natural (but don't start a new topic)
- If they offered a call/link and you're interested → accept naturally ("יאללה, שלח ל��נק")
- If they offered a call but you're the not_a_lead/fan type → politely decline
- Hebrew only. Sound like a real person, not a test.`;

      aiMessages = [
        { role: 'system', content: systemPrompt },
        ...lastScenarioMessages,
        { role: 'user', content: message },
      ];
    }

    const { content: reply, usage: wizardUsage } = await callOpenRouter(aiMessages, 120, 'SetterAI Wizard Chat', 0.8);
    trackUsage(req.tenantId, 'WizardChat', wizardUsage);

    // Parse scenario tag
    const scenarioMatch = reply.match(/<!--SCENARIO:(\w+)-->/);
    const newCovered = scenarioMatch && !coveredScenarios.includes(scenarioMatch[1])
      ? [...coveredScenarios, scenarioMatch[1]]
      : coveredScenarios;
    const cleanReply = reply.replace(/<!--SCENARIO:\w+-->\n?/g, '').trim();

    res.json({
      reply: cleanReply,
      scenarioDone: !isNewScenario,
      coveredScenarios: newCovered,
      currentScenario: scenarioMatch ? scenarioMatch[1] : null,
    });
  } catch (err) {
    safeError(res, err, 'Wizard chat');
  }
});

// Wizard V4: Strategy interview chat — AI asks owner about their sales approach
app.post('/api/app/wizard-strategy-chat', authMiddleware, async (req, res) => {
  try {
    const { message, conversationHistory = [], gender = 'male' } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const isStart = message === '__start__';
    const genderVerb = gender === 'female' ? 'את' : 'אתה';
    const genderAction = gender === 'female' ? 'מנהלת' : 'מנהל';
    const genderWant = gender === 'female' ? 'רוצה' : 'רוצה';

    const systemPrompt = `You are Typer's strategy interviewer. You are having a friendly CONVERSATION in Hebrew with a business owner to understand how they handle Instagram DM sales conversations.

The owner's name: ${tenant.ownerName || 'הבעלים'}
Business: ${tenant.name || 'העסק'} (${tenant.businessType || 'לא ידוע'})
Services: ${tenant.services || 'לא ידוע'}
Owner gender: ${gender === 'female' ? 'נקבה' : 'זכר'}

YOUR GOAL: Understand their SALES STRATEGY for DMs. NOT their personality/voice (that comes later).

Ask about these topics (in order, naturally — ONE question at a time):
1. "ספר/י לי — כשמישהו שולח לך הודעה באינסטגרם, מה ${genderVerb} ${genderAction}? מה הדבר הראשון שחשוב לך לדעת?"
2. "מה הש��לות שתמיד שואל/ת לפני שמציע/ה שיחה/פגישה?"
3. "כמה הודעות ��ד\"כ ${genderVerb} מחליף/ה לפני שמציע/ה שיחה?"
4. "יש מצבים שאת/ה פ��סל/ת ליד? מה גורם לך להגיד 'זה לא ב��ב��לנו'?"
5. "מה הלקוחות שואלים הכי הרבה? ואיך ${genderVerb} עונה?"
6. "מה עושה ליד מעולה? מתי ${genderVerb} ${genderWant} 'וואו, הבן אדם הזה מושלם'?"

RULES:
- Ask ONE question at a time, in Hebrew
- Be warm, brief (1-2 sentences per message), conversational
- React to what they say before asking next question ("מעולה", "מבין", "הגיוני")
- If they give short answers — probe deeper ("תרחיב/י קצת?", "מה הכוונה?")
- If they give a great answer — acknowledge it specifically
- Track which topics you've covered with <!--COVERED:topic1,topic2-->
- After covering at least 4 topics (or 8 exchanges), wrap up: "מעולה, קיבלתי תמונה מצוינת!" and add <!--STRATEGY_DONE-->
- Don't ask about tone/personality/voice — only STRATEGY and FLOW
- Don't give advice or suggestions — just listen and ask`;

    const aiMessages = [{ role: 'system', content: systemPrompt }];
    if (conversationHistory.length > 0) {
      aiMessages.push(...conversationHistory);
    }
    if (!isStart) {
      aiMessages.push({ role: 'user', content: message });
    }

    const { content: reply, usage } = await callOpenRouter(aiMessages, 200, 'SetterAI Strategy Interview', 0.7);
    trackUsage(req.tenantId, 'StrategyInterview', usage);

    const isDone = reply.includes('<!--STRATEGY_DONE-->');
    const cleanReply = reply
      .replace(/<!--STRATEGY_DONE-->/g, '')
      .replace(/<!--COVERED:[^>]+-->/g, '')
      .trim();

    res.json({ reply: cleanReply, strategyDone: isDone });
  } catch (err) {
    safeError(res, err, 'Wizard strategy chat');
  }
});

// Wizard V4: Extract structured strategy from interview transcript
app.post('/api/app/wizard-strategy-extract', authMiddleware, async (req, res) => {
  try {
    const { conversationHistory = [] } = req.body;
    if (conversationHistory.length < 4) {
      return res.status(400).json({ error: 'Not enough conversation data' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const interviewText = conversationHistory.map(m => {
      const speaker = m.role === 'user' ? (tenant.ownerName || 'בעלים') : 'Typer';
      return `${speaker}: ${m.content}`;
    }).join('\n');

    const { strategy } = await extractStrategy(tenant, interviewText);
    res.json({ strategy });
  } catch (err) {
    safeError(res, err, 'Wizard strategy extract');
  }
});

// Wizard freeflow chat: AI setup consultant asks owner how they want their bot to behave
app.post('/api/app/wizard-freeflow-chat', authMiddleware, async (req, res) => {
  try {
    const { message, conversationHistory = [], gender = 'male' } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const isStart = message === '__start__';
    const genderVerb = gender === 'female' ? 'את' : 'אתה';

    // Return hardcoded opening message — no AI call needed
    if (isStart) {
      const f = gender === 'female';
      const openingMsg = f
        ? `תתארי לי בבקשה בדיוק מה היית רוצה שהבוט יעשה, מי את רוצה ��הוא יהיה, מה אור�� השיחות, מה הסטייל של השיחות, ממש פה זה המקום לתאר בדיוק מה את רוצה בצורה כמה שיותר מפורטת. ככה אוכל לדייק ל�� את הבוט כדי שיעבוד כמה שיותר טוב`
        : `תתאר לי בבקשה בדיוק מה היית רוצה שהבוט יעשה, מי אתה רוצה שהוא יהיה, מה אורך השיחות, מה הסטייל של השיחות, ממש פה זה המקום לתאר בדיוק מה אתה רוצה בצורה כמה שיותר מפורטת. ככה אוכל לדייק לך את הבוט כדי שיעבוד ����מה שיותר טוב`;
      return res.json({ reply: openingMsg, freeflowDone: false });
    }

    const systemPrompt = `You are Typer's bot setup assistant. You are having a SHORT, EFFICIENT conversation in Hebrew with a business owner to understand how they want their Instagram DM bot to work.

Owner: ${tenant.ownerName || 'הבעלים'} | Business: ${tenant.name || 'העסק'} (${tenant.businessType || 'לא ידוע'}) | Services: ${tenant.services || 'לא ידוע'}
Gender: ${gender === 'female' ? 'נקבה — פני אליה בלשון נקבה (את, רוצה, צריכה, תארי, ספרי)' : 'זכר — פנה אליו בלשון זכר (אתה, רוצה, צריך, תאר, ספר)'}

YOUR STYLE: Quick & efficient. No fluff. Ask what you need, move on. Like a good developer doing a requirements interview.

TOPICS TO COVER (internally track which you've covered — do NOT write any tracking tags or HTML comments in your reply):
1. goal — What should the bot DO? Book calls? Warm up leads? Answer questions?
2. style — How should it TALK? Short/long? Formal/casual? Emojis?
3. flow — How LONG should conversations be? How many questions before CTA?
4. rules — Special rules? What to avoid? How to handle objections?
5. knowledge — Prices, services, FAQs?

RULES:
- Ask 1-2 things at a time, in Hebrew. Be brief (1-2 sentences per message).
- React briefly to what they say ("מבין", "סבבה", "הגיוני") then ask the next thing
- If they give a detailed answer covering multiple topics → acknowledge and move on, don't re-ask
- If they give a short answer → probe: "מה הכוונה?" / "תרחיב?"
- After covering 3+ topics OR 5+ user exchanges → wrap up: "${gender === 'female' ? 'מעולה, יש לי את מה שצריך! בואי נמשיך' : 'מעולה, יש לי את מה שצריך! בוא נמשיך'}" and add exactly the word FREEFLOW_DONE on a new line at the very end
- You can wrap up early if they gave you enough info in one message
- Do NOT ask about voice/personality in detail — focus on BEHAVIOR and STRATEGY
- Do NOT give advice or suggestions — just listen and understand what they want
- CRITICAL: Do NOT write any HTML, XML, or comment tags like <!-- --> in your response. Your message will be shown directly to the user. Write ONLY plain Hebrew text.`;

    const aiMessages = [{ role: 'system', content: systemPrompt }];
    if (conversationHistory.length > 0) {
      aiMessages.push(...conversationHistory);
    }
    aiMessages.push({ role: 'user', content: message });

    const { content: reply, usage } = await callOpenRouter(aiMessages, 200, 'SetterAI Freeflow Chat', 0.7);
    trackUsage(req.tenantId, 'FreeflowChat', usage);

    const isDone = /FREEFLOW_DONE/i.test(reply);
    // Strip any tracking markers, HTML comments, or tag-like artifacts
    const cleanReply = reply
      .replace(/FREEFLOW_DONE/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]*COVERED[^>]*>/gi, '')
      .replace(/<[^>]*FREEFLOW[^>]*>/gi, '')
      .trim();

    res.json({ reply: cleanReply, freeflowDone: isDone });
  } catch (err) {
    safeError(res, err, 'Wizard freeflow chat');
  }
});

// Wizard freeflow extract: extract structured config from freeflow conversation
app.post('/api/app/wizard-freeflow-extract', authMiddleware, async (req, res) => {
  try {
    const { conversationHistory = [] } = req.body;
    if (conversationHistory.length < 2) {
      return res.status(400).json({ error: 'Not enough conversation data' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    const conversationText = conversationHistory.map(m => {
      const speaker = m.role === 'user' ? (tenant.ownerName || 'בעלים') : 'Typer';
      return `${speaker}: ${m.content}`;
    }).join('\n');

    const { config } = await extractFreeflowConfig(tenant, conversationText);
    res.json({ config });
  } catch (err) {
    safeError(res, err, 'Wizard freeflow extract');
  }
});

// Wizard extract: analyze conversation to get voice profile + KB entries
app.post('/api/app/wizard-extract', authMiddleware, async (req, res) => {
  try {
    const { conversationHistory = [] } = req.body;
    if (conversationHistory.length < 4) {
      return res.status(400).json({ error: 'Not enough conversation data' });
    }

    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Format: owner messages are role=user in the wizard history (they typed them)
    const conversationText = conversationHistory.map(m => {
      const speaker = m.role === 'user' ? (tenant.ownerName || 'בעלים') : 'לקוח';
      return `${speaker}: ${m.content}`;
    }).join('\n');

    // Run deep Voice DNA extraction + knowledge extraction in parallel
    const [dnaResult, knowledgeEntries] = await Promise.all([
      importVoiceDNA(conversationText),
      extractWizardKnowledge(tenant, conversationText),
    ]);
    const { dna: rawDNA, usage: dnaUsage } = dnaResult;
    trackUsage(req.tenantId, 'VoiceDNA', dnaUsage);

    // Map DNA to tenant-ready fields (validates enums, combines examples + slang)
    const tenantFields = mapVoiceDNAToTenant(rawDNA);

    // Return both raw fields (for review UI) and mapped fields (for saving)
    res.json({
      voiceProfile: { ...rawDNA, ...tenantFields },
      knowledgeEntries,
    });
  } catch (err) {
    safeError(res, err, 'Wizard extract');
  }
});

// Wizard complete: save everything, activate bot
app.post('/api/app/wizard-complete', authMiddleware, async (req, res) => {
  try {
    const { voiceProfile = {}, knowledgeEntries = [], botGender = 'male', conversationStrategy = null, botGoal, maxBotMessages, customFlowInstructions, ctaPushLevel } = req.body;
    const tenant = await getTenant(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Save voice profile + activate bot (supports both mapped tenant fields and raw DNA fields)
    const settings = {
      voiceGreeting: voiceProfile.voiceGreeting || voiceProfile.greeting || '',
      voiceEnergy: voiceProfile.voiceEnergy || voiceProfile.energy || 'warm',
      voicePhrases: voiceProfile.voicePhrases || voiceProfile.phrases || '',
      voiceEmoji: voiceProfile.voiceEmoji || voiceProfile.emoji || 'sometimes',
      voiceLength: voiceProfile.voiceLength || voiceProfile.length || 'normal',
      voiceHumor: voiceProfile.voiceHumor || voiceProfile.humor || 'light',
      voicePhrasesMale: voiceProfile.voicePhrasesMale || voiceProfile.phrasesMale || '',
      voicePhrasesFemale: voiceProfile.voicePhrasesFemale || voiceProfile.phrasesFemale || '',
      voiceAvoid: voiceProfile.voiceAvoid || voiceProfile.avoid || '',
      voicePersonality: voiceProfile.voicePersonality || voiceProfile.personality || '',
      slangWords: voiceProfile.slangWords || '',
      voiceExamples: voiceProfile.voiceExamples || '',
      botGender,
      wizardCompleted: true,
      botActive: true,
    };

    // Save conversation strategy if provided (Wizard V4)
    if (conversationStrategy) {
      settings.conversationStrategy = conversationStrategy;
    }

    // Save freeflow onboarding fields
    if (botGoal) settings.botGoal = botGoal;
    if (maxBotMessages !== undefined) settings.maxBotMessages = maxBotMessages;
    if (customFlowInstructions !== undefined) settings.customFlowInstructions = customFlowInstructions;
    if (ctaPushLevel) settings.ctaPushLevel = ctaPushLevel;

    await updateTenant(req.tenantId, settings);

    // Save KB entries (may have been saved in goToTest already, but wizard-complete is the final authority)
    for (const entry of knowledgeEntries) {
      if (entry.content && entry.content.trim()) {
        await addKnowledgeEntry({
          category: entry.category || 'general',
          title: entry.title || '',
          content: entry.content.trim(),
          addedBy: 'wizard',
        }, req.tenantId);
      }
    }

    console.log(`[Wizard] Completed for tenant ${tenant.name} (${req.tenantId}) — bot is now LIVE`);
    res.json({ success: true });
  } catch (err) {
    safeError(res, err, 'Wizard complete');
  }
});


// ============================================
// Test Chat UI - Phase A (internal) — SECURITY: admin only
// ============================================
app.get('/chat', adminAuth, async (req, res) => {
  const entries = await getKnowledgeEntries();
  res.send(getChatHTML(entries, config.apiSecret));
});

// ============================================
// Demo Chat UI - Sales Demo Mode
// ============================================
app.get('/demo', (req, res) => {
  res.send(getDemoHTML());
});

// Demo API — separate from admin /api/chat so demos work without admin secret
const demoLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: 'Demo rate limit reached, try again in a minute' },
});

app.post('/api/demo/chat', demoLimiter, async (req, res) => {
  try {
    const { tenantId = 'test', userId = 'demo-user', message, testContext } = req.body;
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Message too long' });
    }
    // Demo must include testContext with demoMode flag
    if (!testContext || !testContext.demoMode) {
      return res.status(400).json({ error: 'Demo context required' });
    }
    let tenant = await getTenant(tenantId);
    if (!tenant) tenant = { id: 'test', name: 'Demo', services: '', businessType: '', ownerName: 'Demo', bookingInstructions: '', workingHours: '' };
    // Apply demo context overrides
    if (testContext.name) tenant.name = testContext.name;
    if (testContext.businessType) tenant.businessType = testContext.businessType;
    if (testContext.services) tenant.services = testContext.services;
    if (testContext.ownerName) tenant.ownerName = testContext.ownerName;
    if (testContext.bookingInstructions) tenant.bookingInstructions = testContext.bookingInstructions;
    if (testContext.workingHours) tenant.workingHours = testContext.workingHours;
    tenant._demoMode = true;
    if (testContext.demoTeachings) tenant._demoTeachings = testContext.demoTeachings;

    const reply = await generateReply(tenant, userId, message.trim());
    res.json({ reply });
  } catch (err) {
    safeError(res, err, 'Demo chat');
  }
});

app.post('/api/demo/reset', demoLimiter, async (req, res) => {
  const { tenantId = 'test', userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId is required' });
  await clearConversation(tenantId, userId);
  res.json({ success: true });
});

// SECURITY: Admin auth required (previously open)
app.post('/api/chat', adminAuth, async (req, res) => {
  try {
    const { tenantId = 'test', userId = 'test-user', message, testContext } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ error: 'Message too long' });
    }

    let tenant = await getTenant(tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }

    // If testContext is provided, override tenant fields for this test session
    if (testContext) {
      tenant = { ...tenant };
      if (testContext.businessType) tenant.businessType = testContext.businessType;
      if (testContext.services) tenant.services = testContext.services;
      if (testContext.ownerName) tenant.ownerName = testContext.ownerName;
      if (testContext.name) tenant.name = testContext.name;
      if (testContext.bookingInstructions) tenant.bookingInstructions = testContext.bookingInstructions;
      if (testContext.workingHours) tenant.workingHours = testContext.workingHours;
      if (testContext.demoMode) tenant._demoMode = true;
      if (testContext.demoTeachings) tenant._demoTeachings = testContext.demoTeachings;
    }

    const reply = await generateReply(tenant, userId, message.trim());
    res.json({ reply });
  } catch (err) {
    safeError(res, err, 'Chat');
  }
});

app.post('/api/chat/reset', adminAuth, async (req, res) => {
  const { tenantId = 'test', userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }
  await clearConversation(tenantId, userId);
  res.json({ success: true });
});

// ============================================
// Instagram Webhooks - Direct API (Phase B alt)
// ============================================

// Webhook verification (GET)
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.verifyToken) {
    console.log('Webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Webhook event handler (POST)
app.post('/webhook', (req, res) => {
  // SECURITY: Verify Instagram webhook signature
  const signature = req.headers['x-hub-signature-256'];
  if (config.igAppSecret && signature && req.rawBody) {
    const expectedSig = 'sha256=' + crypto
      .createHmac('sha256', config.igAppSecret)
      .update(req.rawBody)
      .digest('hex');
    if (signature !== expectedSig) {
      console.warn('[Webhook] Invalid signature — rejecting');
      return res.sendStatus(403);
    }
  }

  // Always respond 200 immediately (Instagram requirement)
  res.sendStatus(200);

  if (PAUSED) {
    console.log('[Instagram] PAUSED - ignoring message');
    return;
  }

  // Process asynchronously (after sending 200)
  processWebhook(req.body).catch(err => {
    console.error('Webhook processing error:', err);
  });
});

async function processWebhook(body) {
  if (body.object !== 'instagram') return;

  const entry = body.entry?.[0];
  const messaging = entry?.messaging?.[0];
  if (!messaging) return;

  const senderId = messaging.sender?.id;
  const recipientId = messaging.recipient?.id;
  const messageText = messaging.message?.text;

  // Ignore non-text messages
  if (!messageText) return;

  // Find tenant by their IG page ID
  const tenant = await getTenantByIgPageId(recipientId);
  if (!tenant) {
    console.warn(`No tenant found for IG page ID: ${recipientId}`);
    return;
  }

  // Ignore messages sent by the bot itself
  if (senderId === tenant.igPageId) return;

  // Smart bot-to-bot loop prevention: allow connected tenants to message each other (for testing),
  // but detect and kill ping-pong loops (4+ rapid automated exchanges within 60 seconds)
  const senderTenant = await getTenantByIgPageId(senderId);
  if (senderTenant) {
    const pair = [tenant.id, senderTenant.id].sort().join(':');
    const now = Date.now();
    const tracker = pingPongTracker.get(pair);

    if (tracker) {
      if (now - tracker.lastSeen > 60000) {
        // Reset if last exchange was >60s ago (human-speed gap)
        pingPongTracker.set(pair, { count: 1, firstSeen: now, lastSeen: now });
      } else {
        tracker.count++;
        tracker.lastSeen = now;

        if (tracker.count >= 4) {
          console.log(`[Loop blocked] Ping-pong detected: ${senderTenant.name} <-> ${tenant.name} (${tracker.count} exchanges in ${((now - tracker.firstSeen) / 1000).toFixed(0)}s)`);
          return;
        }
      }
    } else {
      pingPongTracker.set(pair, { count: 1, firstSeen: now, lastSeen: now });
    }

    console.log(`[Tenant-to-tenant] ${senderTenant.name} -> ${tenant.name} (exchange #${pingPongTracker.get(pair).count})`);
  }

  // Check if sender is muted / matches ignore list (runs before botActive gate)
  const knownLead = await getLeadIfExists(tenant.id, senderId);
  if (knownLead) {
    const onIgnoreList = matchesIgnoreList(tenant, knownLead);
    if (knownLead.ignored && !onIgnoreList) {
      // Was muted but no longer on ignore list — unmute automatically
      await updateLead(tenant.id, senderId, { ignored: false });
      console.log(`[${tenant.name}] Auto-unmuted ${senderId} (${knownLead.instagramName || '?'}) — removed from ignore list`);
    } else if (!knownLead.ignored && onIgnoreList) {
      // Not muted yet but matches ignore list — mute now
      await updateLead(tenant.id, senderId, { ignored: true });
      console.log(`[${tenant.name}] Auto-muted ${senderId} (${knownLead.instagramName || '?'}, @${knownLead.instagramUsername || '?'}) — matches ignore list`);
      return;
    } else if (knownLead.ignored) {
      // Muted and still on ignore list (or manually muted) — skip
      console.log(`[${tenant.name}] Muted user ${senderId} (${knownLead.instagramName || 'unknown'}) — skipping`);
      return;
    }
  }

  // Check if bot is turned off for this tenant
  if (tenant.botActive === false) {
    console.log(`[${tenant.name}] Bot is OFF — ignoring message from ${senderId}`);
    return;
  }

  // Rate limit: ignore if we replied to this sender in the last 3 seconds (prevents rapid loops)
  const rateLimitKey = `${tenant.id}:${senderId}`;
  const now = Date.now();
  if (recentReplies.get(rateLimitKey) && now - recentReplies.get(rateLimitKey) < 3000) {
    console.log(`[Rate limit] Skipping rapid message from ${senderId}`);
    return;
  }

  // Magic reset word — clears conversation + lead for testing
  if (messageText.trim() === 'אתחולסקי') {
    await clearConversation(tenant.id, senderId);
    await updateLead(tenant.id, senderId, { status: 'new', qualificationScore: 0, bookingLinkSent: false, gathered: {}, entryType: 'unknown', currentStep: 'opening', interest: null, gender: null, intent: null });
    console.log(`[${tenant.name}] Reset triggered by ${senderId}`);
    await sendInstagramMessage(tenant.igAccessToken, senderId, 'אופס, התחלנו מחדש 👋');
    return;
  }

  // Trigger word detection — fixed reply bypasses AI entirely
  const triggerWords = tenant.triggerWords || [];
  if (triggerWords.length > 0) {
    const normalizedMsg = messageText.trim().toLowerCase();
    const matched = triggerWords.find(tw => tw.word && normalizedMsg === tw.word.toLowerCase());
    if (matched && matched.reply) {
      console.log(`[${tenant.name}] Trigger word "${matched.word}" from ${senderId} — sending fixed reply`);
      const delay = getHumanDelay(true, messageText.length, matched.reply.length, tenant.delayConfig);
      await new Promise(resolve => setTimeout(resolve, delay));
      await sendInstagramMessage(tenant.igAccessToken, senderId, matched.reply);
      recentReplies.set(rateLimitKey, Date.now());
      // Create/update lead so it shows in dashboard
      await getOrCreateLead(tenant.id, senderId);
      return;
    }
  }

  // Log suspicious prompt injection attempts (don't block — let the AI handle with system prompt defense)
  if (hasSuspiciousContent(messageText)) {
    console.warn(`[Security] Suspicious message from ${senderId} to ${tenant.name}: "${messageText.slice(0, 100)}"`);
  }

  bufferMessage(tenant, senderId, messageText);
}

// Debounce rapid messages — waits 2s of quiet before processing.
// If user sends 3 messages in 1 second, they're combined into one AI request.
function bufferMessage(tenant, senderId, text) {
  const key = `${tenant.id}:${senderId}`;

  const existing = messageBuffer.get(key);
  if (existing) {
    existing.messages.push(text);
    if (existing.timer) clearTimeout(existing.timer);
    console.log(`[${tenant.name}] Buffered message #${existing.messages.length} from ${senderId}`);
  } else {
    messageBuffer.set(key, { messages: [text], timer: null, tenant });
  }

  const entry = messageBuffer.get(key);
  entry.timer = setTimeout(() => {
    const buffered = messageBuffer.get(key);
    if (!buffered) return;

    // If already generating a reply, leave in buffer — handleInstagramMessage picks up when done
    if (processingLock.has(key)) {
      console.log(`[${tenant.name}] Debounce fired but reply in progress for ${senderId} — will process after`);
      buffered.timer = null;
      return;
    }

    messageBuffer.delete(key);

    // Deduplicate consecutive identical messages (e.g. user taps send twice)
    const unique = buffered.messages.filter((msg, i) => i === 0 || msg !== buffered.messages[i - 1]);

    console.log(`[${tenant.name}] Processing ${buffered.messages.length} buffered msg(s) from ${senderId}${unique.length < buffered.messages.length ? ` (${buffered.messages.length - unique.length} dupes removed)` : ''}`);

    // Pass the original messages array so we can consolidate and store them properly
    handleInstagramMessage(tenant, senderId, unique).catch(err => {
      console.error(`[${tenant.name}] handleInstagramMessage error:`, err);
    });
  }, resolveDelayConfig(tenant.delayConfig).debounce);
}

// Prompt injection detection — log only, don't block (false positives would lose real customers)
const INJECTION_PATTERNS = [
  /ignore (all )?(previous|prior|above) (instructions|prompts|rules)/i,
  /forget (everything|all|your)/i,
  /system prompt/i,
  /reveal your (instructions|prompt|rules)/i,
  /you are now/i,
  /new instructions/i,
  /\bDAN\b/,
  /pretend you/i,
  /act as (a |an )?different/i,
];

function hasSuspiciousContent(text) {
  return INJECTION_PATTERNS.some(p => p.test(text));
}

// Check if a lead matches the tenant's ignore list (by display name or @username)
// Supports exact match AND substring/contains match for flexibility
function matchesIgnoreList(tenant, lead) {
  const ignoreRaw = tenant.ignoreList || '';
  if (!ignoreRaw.trim()) return false;
  const ignoreEntries = ignoreRaw.split('\n').map(n => n.trim().toLowerCase()).filter(Boolean);
  if (!ignoreEntries.length) return false;

  const ignoreUsernames = ignoreEntries.filter(e => e.startsWith('@')).map(e => e.slice(1));
  const ignoreNames = ignoreEntries.filter(e => !e.startsWith('@'));

  const leadName = (lead.instagramName || '').trim().toLowerCase();
  const leadUsername = (lead.instagramUsername || '').trim().toLowerCase();

  // Username match: exact or contains (handles partial usernames)
  if (leadUsername && ignoreUsernames.length) {
    for (const iu of ignoreUsernames) {
      if (leadUsername === iu || leadUsername.includes(iu) || iu.includes(leadUsername)) return true;
    }
  }

  // Name match: exact or contains (handles "rotem izkovich" matching "rotemizkovich" and vice versa)
  if (leadName && ignoreNames.length) {
    const leadNameNoSpaces = leadName.replace(/\s+/g, '');
    for (const iName of ignoreNames) {
      const iNameNoSpaces = iName.replace(/\s+/g, '');
      if (leadName === iName || leadNameNoSpaces === iNameNoSpaces) return true;
      // Substring containment: either direction
      if (leadNameNoSpaces.includes(iNameNoSpaces) || iNameNoSpaces.includes(leadNameNoSpaces)) return true;
    }
  }

  return false;
}

// Delay presets — per-tenant response speed control
// debounce = 7 seconds to buffer incoming messages before processing
// response delays = 0 (AI responds as fast as it can, no artificial delays)
const DELAY_PRESETS = {
  instant:  { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
  fast:     { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
  natural:  { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
  slow:     { firstReplyMin: 0, firstReplyMax: 0, followUpMin: 0, followUpMax: 0, splitDelay: 0, debounce: 9000, readingFactor: false, typingFactor: false },
};

function resolveDelayConfig(delayConfig) {
  if (!delayConfig || !delayConfig.preset) return DELAY_PRESETS.natural;
  if (delayConfig.preset === 'custom') return { ...DELAY_PRESETS.natural, ...delayConfig };
  return DELAY_PRESETS[delayConfig.preset] || DELAY_PRESETS.natural;
}

// Natural delay — considers message lengths for realism
// Longer incoming = more "reading" time, longer outgoing = more "typing" time
function getHumanDelay(isFirstReply, incomingLength = 0, outgoingLength = 0, delayConfig = null) {
  const cfg = resolveDelayConfig(delayConfig);
  const r1 = Math.random();
  const r2 = Math.random();
  const r3 = Math.random();
  const avg = (r1 + r2 + r3) / 3; // peaks around 0.5

  // Typing speed: scale base delay by outgoing message length
  // Short reply (< 30 chars): use min end of range
  // Medium reply (30-120 chars): scale linearly between min and max
  // Long reply (120+ chars): use max end + extra typing time
  const shortThreshold = 30;
  const longThreshold = 120;
  let lengthRatio;
  if (outgoingLength <= shortThreshold) {
    lengthRatio = 0; // stick near min
  } else if (outgoingLength <= longThreshold) {
    lengthRatio = (outgoingLength - shortThreshold) / (longThreshold - shortThreshold); // 0 → 1
  } else {
    lengthRatio = 1; // at max
  }

  let baseDelay;
  if (isFirstReply) {
    // Blend between min and max based on outgoing message length
    const rangeMin = cfg.firstReplyMin;
    const rangeMax = cfg.firstReplyMax;
    baseDelay = rangeMin + (lengthRatio * avg + (1 - lengthRatio) * avg * 0.3) * (rangeMax - rangeMin);
  } else {
    const rangeMin = cfg.followUpMin;
    const rangeMax = cfg.followUpMax;
    baseDelay = rangeMin + (lengthRatio * avg + (1 - lengthRatio) * avg * 0.3) * (rangeMax - rangeMin);
  }

  // Extra typing time for very long messages (120+ chars): ~150ms per char beyond threshold
  // Simulates actual typing at ~40 WPM, capped at 15s extra
  const extraTyping = cfg.typingFactor && outgoingLength > longThreshold
    ? Math.min(15000, (outgoingLength - longThreshold) * 150)
    : 0;

  // Reading factor: +1s per 30 chars of incoming message (capped at +5s)
  const readingBonus = cfg.readingFactor ? Math.min(5000, Math.floor(incomingLength / 30) * 1000) : 0;

  return Math.floor(baseDelay + extraTyping + readingBonus);
}

async function handleInstagramMessage(tenant, senderId, messagesOrText) {
  const lockKey = `${tenant.id}:${senderId}`;
  processingLock.add(lockKey);

  // Handle both single message (string) and multiple messages (array)
  const originalMessages = Array.isArray(messagesOrText) ? messagesOrText : [messagesOrText];
  const wasBuffered = originalMessages.length > 1;

  // If multiple messages were buffered, consolidate them via the microservice
  let textForAI;
  let wasConsolidated = false;
  if (wasBuffered) {
    const consolidateResult = await callConsolidateMicroservice(originalMessages);
    textForAI = consolidateResult.consolidatedMessage;
    wasConsolidated = consolidateResult.wasConsolidated;
    console.log(`[${tenant.name}] Consolidated ${originalMessages.length} messages${wasConsolidated ? ' (AI merged)' : ' (simple join)'}: "${textForAI.slice(0, 100)}"`);
  } else {
    textForAI = originalMessages[0];
  }

  // For display/logging, use the consolidated or single text
  const text = textForAI;

  try {
  console.log(`[${tenant.name}] DM from ${senderId}: ${text}`);

  // Billing gate: skip reply if tenant has no active billing
  if (!hasBillingAccess(tenant)) {
    console.log(`[${tenant.name}] Billing inactive (${tenant.paymentStatus}) — skipping reply to ${senderId}`);
    processingLock.delete(lockKey);
    return;
  }

  // Fetch Instagram profile on first encounter or backfill missing username
  const existingLead = await getOrCreateLead(tenant.id, senderId);
  if (!existingLead.instagramName && tenant.igAccessToken) {
    const profile = await fetchInstagramProfile(tenant.igAccessToken, senderId);
    if (profile) {
      const { name: igName, username: igUsername } = profile;
      const updates = {};
      if (igName) updates.instagramName = igName;
      if (igUsername) updates.instagramUsername = igUsername;
      // Gender is intentionally not guessed from profile name.
      // Gender detection happens inside `generateReply` via the LLM gender subagent
      // and respects `gender_locked` and existing DB values.
      await updateLead(tenant.id, senderId, updates);
      // Merge fetched fields into existingLead for the ignore list check below
      if (igName) existingLead.instagramName = igName;
      if (igUsername) existingLead.instagramUsername = igUsername;
    }
  } else if (existingLead.instagramName && !existingLead.instagramUsername && tenant.igAccessToken) {
    const profile = await fetchInstagramProfile(tenant.igAccessToken, senderId);
    if (profile?.username) {
      await updateLead(tenant.id, senderId, { instagramUsername: profile.username });
      existingLead.instagramUsername = profile.username;
    }
  }

  // Sync Instagram DM history on first interaction with this lead
  // This fetches up to 200 messages from the Instagram API and stores them in PostgreSQL
  if (!existingLead.historySynced && tenant.igAccessToken && tenant.igPageId) {
    try {
      console.log(`[${tenant.name}] Syncing Instagram DM history for lead ${senderId}...`);
      const igHistory = await fetchLeadConversationHistory(
        tenant.igAccessToken,
        tenant.igPageId,
        senderId,
        { maxMessages: 100 }
      );
      
      if (igHistory.length > 0) {
        // Save each message to PostgreSQL (oldest first so timestamps are in order)
        for (const msg of igHistory) {
          await saveMessage(tenant.id, senderId, msg.role, msg.content);
        }
        console.log(`[${tenant.name}] Synced ${igHistory.length} historical messages for lead ${senderId}`);
      }
      
      // Mark history as synced (even if empty, so we don't retry)
      await updateLead(tenant.id, senderId, {
        historySynced: true,
        historySyncedAt: new Date().toISOString(),
      });
      existingLead.historySynced = true;
    } catch (err) {
      // Non-blocking: log error but continue with the conversation
      console.error(`[${tenant.name}] Failed to sync DM history for ${senderId}:`, err.message);
      // Still mark as synced to avoid retrying on every message
      await updateLead(tenant.id, senderId, { historySynced: true }).catch(() => {});
    }
  }

  // Check ignore list on EVERY message (catches entries added after first encounter)
  if (matchesIgnoreList(tenant, existingLead)) {
    await updateLead(tenant.id, senderId, { ignored: true });
    console.log(`[${tenant.name}] Auto-muted ${senderId} (${existingLead.instagramName || '?'}, @${existingLead.instagramUsername || '?'}) — matches ignore list`);
    processingLock.delete(lockKey);
    return;
  }

  // Track user message for outcome metrics (fire-and-forget)
  updateOutcomeMetrics(tenant.id, senderId, 'user').catch(() => {});

  // Needs-human gate: if lead was flagged for owner takeover, pause auto-replies
  if (existingLead.needsHuman) {
    console.log(`[${tenant.name}] ⏸ Skipping auto-reply for ${senderId} — needs_human flag active (owner must take over)`);
    // Still save the user message to history so owner can see it
    // If consolidated, save the consolidated message; otherwise save the single message
    await saveMessage(tenant.id, senderId, 'user', textForAI);
    processingLock.delete(lockKey);
    return;
  }

  // Show "typing..." bubble while bot generates reply
  sendTypingIndicator(tenant.igAccessToken, senderId);
  
  // Pass wasConsolidated flag - if true, the consolidated message is saved (not individual ones)
  // This ensures chat history matches what the AI actually saw and responded to
  const reply = await generateReply(tenant, senderId, textForAI, wasConsolidated);
  
  // If AI decided not to reply (e.g. emoji after conversation ended)
  if (!reply) {
    console.log(`[${tenant.name}] No reply needed for ${senderId}`);
    return;
  }

  // Track bot reply for outcome metrics (fire-and-forget)
  updateOutcomeMetrics(tenant.id, senderId, 'assistant').catch(() => {});

  // Check if this is the first reply in the conversation
  const history = await getConversationHistory(tenant.id, senderId, 10);
  const isFirstReply = history.filter(m => m.role === 'assistant').length <= 1;

  // Self-QA: check reply quality and auto-correct if needed
  const currentLead = await getLeadIfExists(tenant.id, senderId) || existingLead;
  const qaIssues = checkReplyQuality(tenant.name, senderId, reply, history, currentLead);
  if (qaIssues.some(i => i.severity === 'critical')) {
    autoCorrect(tenant.id, qaIssues).catch(err =>
      console.warn('[QA] Auto-correct failed:', err.message)
    );
  }

  // Conditional AI QA: fire Haiku "second opinion" when regex found warnings but no criticals
  // This is non-blocking — reply is already generated and will be sent regardless
  const hasWarnings = qaIssues.some(i => i.severity === 'warning');
  const hasCriticals = qaIssues.some(i => i.severity === 'critical');
  if (hasWarnings && !hasCriticals) {
    const lastUserMsg = history.filter(m => m.role === 'user').slice(-1)[0]?.content || text;
    runAIQualityCheck(reply, lastUserMsg, currentLead).catch(() => {});
  }

  // Real-time close detection → mark outcome (fire-and-forget)
  const closeCheck = detectCloseReason(currentLead, history);
  if (closeCheck.closed) {
    markOutcomeFromCloseReason(tenant.id, senderId, closeCheck.reason, currentLead).catch(() => {});
  }

  // Split for human-like delivery (reaction first, then substance)
  const { parts, shouldSplit } = splitReplyForHumanDelivery(reply);

  // OUTBOUND SAFETY GATE — sanitize every part before it reaches a real user
  const safeParts = parts.map(p => sanitizeOutbound(p)).filter(Boolean);
  if (safeParts.length === 0) {
    console.error(`[SAFETY] All message parts stripped for ${tenant.name} -> ${senderId}. Original: "${reply.slice(0, 200)}"`);
    return;
  }

  // Add natural delay before sending (considers message lengths)
  const delay = getHumanDelay(isFirstReply, text.length, safeParts[0].length, tenant.delayConfig);
  console.log(`[${tenant.name}] Waiting ${(delay / 1000).toFixed(1)}s (${isFirstReply ? 'first' : 'follow-up'}) before replying...`);
  await new Promise(resolve => setTimeout(resolve, delay));

  // Duplicate outbound prevention — never send the exact same message twice in a row
  if (lastSentMessage.get(lockKey) === reply) {
    console.log(`[${tenant.name}] Duplicate reply suppressed for ${senderId}: "${reply.slice(0, 60)}"`);
    return;
  }
  lastSentMessage.set(lockKey, reply);

  console.log(`[${tenant.name}] Reply to ${senderId}: ${safeParts[0]}${shouldSplit && safeParts.length > 1 ? ' [SPLIT]' : ''}`);

  // Track reply timestamp for rate limiting
  const rateLimitKey = `${tenant.id}:${senderId}`;
  recentReplies.set(rateLimitKey, Date.now());

  await sendInstagramMessage(tenant.igAccessToken, senderId, safeParts[0]);

  // Send second part with short "typing" delay
  if (shouldSplit && safeParts[1]) {
    sendTypingIndicator(tenant.igAccessToken, senderId);
    const splitCfg = resolveDelayConfig(tenant.delayConfig);
    const typingDelay = splitCfg.splitDelay * 0.5 + Math.random() * splitCfg.splitDelay; // 50-150% of splitDelay
    console.log(`[${tenant.name}] Split part 2 in ${(typingDelay / 1000).toFixed(1)}s...`);
    await new Promise(resolve => setTimeout(resolve, typingDelay));
    await sendInstagramMessage(tenant.igAccessToken, senderId, safeParts[1]);
  }

  // Clean up old entries every 100 replies
  if (recentReplies.size > 100) {
    const cutoff = Date.now() - 10000;
    for (const [key, time] of recentReplies) {
      if (time < cutoff) recentReplies.delete(key);
    }
  }

  // Clean up ping-pong tracker entries older than 5 minutes
  if (pingPongTracker.size > 50) {
    const cutoff = Date.now() - 300000;
    for (const [key, data] of pingPongTracker) {
      if (data.lastSeen < cutoff) pingPongTracker.delete(key);
    }
  }

  // Clean up old lastSentMessage entries
  if (lastSentMessage.size > 100) {
    const keys = [...lastSentMessage.keys()];
    keys.slice(0, keys.length - 50).forEach(k => lastSentMessage.delete(k));
  }

  } finally {
    // Check for messages that arrived while we were processing
    const pending = messageBuffer.get(lockKey);
    if (pending) {
      messageBuffer.delete(lockKey);
      if (pending.timer) clearTimeout(pending.timer);
      const unique = pending.messages.filter((msg, i) => i === 0 || msg !== pending.messages[i - 1]);
      console.log(`[${tenant.name}] Processing ${pending.messages.length} queued msg(s) from ${senderId}`);
      processingLock.delete(lockKey);
      // Pass the original messages array so we can consolidate and store them properly
      handleInstagramMessage(tenant, senderId, unique).catch(err => {
        console.error(`[${tenant.name}] Queued message error:`, err);
      });
    } else {
      processingLock.delete(lockKey);
    }
  }
}

// ============================================
// Onboard form submission (customer signs up)
// ============================================
app.post('/api/onboard', onboardLimiter, async (req, res) => {
  const { contactName, businessName, businessType, services, bookingLink, phone, instagram, notes } = req.body;

  if (!businessName || !instagram) {
    return res.status(400).json({ error: 'Business name and Instagram handle are required' });
  }

  // Create a new tenant with their info
  const tenant = await createTenant({
    name: businessName,
    businessType: businessType || '',
    services: services || '',
    ownerName: contactName || '',
    bookingInstructions: bookingLink || '',
    // Store extra onboarding info in the tenant
    phone: phone || '',
    instagram: instagram || '',
    notes: notes || '',
  });

  console.log(`\n🆕 NEW CUSTOMER SIGNUP!`);
  console.log(`   Name: ${contactName}`);
  console.log(`   Business: ${businessName}`);
  console.log(`   Instagram: ${instagram}`);
  console.log(`   Phone: ${phone}`);
  console.log(`   Tenant ID: ${tenant.id}`);
  console.log(`   Dashboard: /dashboard/${tenant.id}\n`);

  res.json({ success: true, tenantId: tenant.id });
});

// ============================================
// Instagram OAuth Connect - 1-Click Connection
// ============================================

// Step 1: Redirect customer to Facebook OAuth — SECURITY: must be logged in + own the tenant
app.get('/connect/:tenantId', authMiddleware, async (req, res) => {
  if (req.tenantId !== req.params.tenantId) {
    return res.status(403).send('Forbidden — you can only connect your own account');
  }
  const tenant = await getTenant(req.params.tenantId);
  if (!tenant) return res.status(404).send('Tenant not found');

  if (!config.igAppId || !config.igAppSecret) {
    return res.status(500).send(`
      <html dir="rtl"><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px;text-align:center">
        <h2>Instagram App not configured yet</h2>
        <p style="color:#888">The admin needs to add IG_APP_ID and IG_APP_SECRET to .env</p>
      </body></html>
    `);
  }

  const scopes = [
    'instagram_business_basic',
    'instagram_business_manage_messages',
    'instagram_business_manage_comments',
  ].join(',');

  // SECURITY: HMAC-sign the state to prevent CSRF (attacker can't forge state for another tenant)
  const stateHmac = crypto.createHmac('sha256', config.apiSecret).update(tenant.id).digest('hex').slice(0, 16);
  const signedState = `${tenant.id}:${stateHmac}`;

  const oauthUrl = `https://www.instagram.com/oauth/authorize?` + new URLSearchParams({
    client_id: config.igAppId,
    redirect_uri: `${config.baseUrl}/onboard/callback`,
    scope: scopes,
    state: signedState,
    response_type: 'code',
    force_reauth: 'true',
  });

  res.redirect(oauthUrl);
});

// ============================================
// Tenant Management API
// ============================================

// Auth middleware for admin endpoints — SECURITY: header only, no query params (leak in logs/history)
function adminAuth(req, res, next) {
  const secret = req.headers['x-api-secret'];
  if (secret !== config.apiSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

const adminEmails = config.adminEmail ? config.adminEmail.split(',').map(e => e.trim().toLowerCase()) : [];

function isAdminEmail(email) {
  return adminEmails.length > 0 && adminEmails.includes(email?.toLowerCase());
}

function masterAdminAuth(req, res, next) {
  if (!isAdminEmail(req.userEmail)) {
    return res.status(404).send('Not found');
  }
  next();
}

// Create tenant
app.post('/api/tenants', adminAuth, async (req, res) => {
  const tenant = await createTenant(req.body);
  res.json(tenant);
});

// Update tenant
app.put('/api/tenants/:id', adminAuth, async (req, res) => {
  const tenant = await updateTenant(req.params.id, req.body);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.json(tenant);
});

// List tenants
app.get('/api/tenants', adminAuth, async (req, res) => {
  res.json(await getAllTenants());
});

// Get tenant leads
app.get('/api/tenants/:id/leads', adminAuth, async (req, res) => {
  res.json(await getLeadsByTenant(req.params.id));
});

// Update a lead (admin)
app.put('/api/tenants/:id/leads/:userId', adminAuth, async (req, res) => {
  const lead = await updateLead(req.params.id, req.params.userId, req.body);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});


// ============================================
// Onboarding page - Phase C
// ============================================
app.get('/onboard', (req, res) => {
  res.redirect('/signup');
});

app.get('/onboard/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send(getErrorPageHTML('Missing authorization code'));

  // SECURITY: Verify HMAC-signed state to prevent OAuth CSRF
  let tenantId = null;
  if (state && state.includes(':')) {
    const [tid, hmac] = state.split(':');
    const expectedHmac = crypto.createHmac('sha256', config.apiSecret).update(tid).digest('hex').slice(0, 16);
    if (hmac === expectedHmac) {
      tenantId = tid;
    } else {
      console.warn('[OAuth] Invalid state HMAC — possible CSRF attempt');
      return res.status(403).send(getErrorPageHTML('Invalid OAuth state'));
    }
  } else if (state) {
    // Legacy: plain tenantId without HMAC (backward compat for in-flight OAuth)
    tenantId = state;
  }

  const tenant = tenantId ? await getTenant(tenantId) : null;

  try {
    const axios = (await import('axios')).default;

    // 1. Exchange code for short-lived user access token (Instagram Business Login)
    const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token',
      new URLSearchParams({
        client_id: config.igAppId,
        client_secret: config.igAppSecret,
        grant_type: 'authorization_code',
        redirect_uri: `${config.baseUrl}/onboard/callback`,
        code,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    const shortLivedToken = tokenRes.data.access_token;

    // 2. Exchange for long-lived token (60 days)
    let longLivedToken = shortLivedToken;
    try {
      const longRes = await axios.get('https://graph.instagram.com/access_token', {
        params: {
          grant_type: 'ig_exchange_token',
          client_secret: config.igAppSecret,
          access_token: shortLivedToken,
        },
      });
      longLivedToken = longRes.data.access_token;
    } catch (e) {
      console.warn('Could not get long-lived token, using short-lived:', e.message);
    }

    // 3. Get Instagram account info directly (Instagram Business Login)
    // Webhooks use IGSID format (user_id), NOT app-scoped id
    const igRes = await axios.get('https://graph.instagram.com/v21.0/me', {
      params: {
        fields: 'user_id,username,name',
        access_token: longLivedToken,
      },
    });

    const igUserId = igRes.data.user_id; // IGSID — matches webhook sender/recipient IDs
    const igUsername = igRes.data.username || igRes.data.name || 'Unknown';
    if (!igUserId) {
      return res.send(getErrorPageHTML(
        'לא נמצא חשבון אינסטגרם',
        'משהו השתבש בחיבור. נסה/י שוב.'
      ));
    }

    // 4. Update existing tenant or create new one
    let finalTenantId;
    if (tenant) {
      await updateTenant(tenantId, {
        igPageId: igUserId,
        igAccessToken: longLivedToken,
        instagram: `@${igUsername}`,
        status: 'active',
      });
      finalTenantId = tenantId;
    } else {
      const newTenant = await createTenant({
        igPageId: igUserId,
        igAccessToken: longLivedToken,
        name: igUsername,
        instagram: `@${igUsername}`,
        status: 'active',
      });
      finalTenantId = newTenant.id;
    }

    // 5. Ensure user session points to this IG-connected tenant
    const sessionId = req.cookies && req.cookies.session_id;
    if (sessionId) {
      const session = await getSessionRecord(sessionId);
      if (session) {
        await updateUserTenant(session.email, finalTenantId);
        await updateSessionsTenant(session.email, finalTenantId);
      }
    }

    console.log(`\n✅ INSTAGRAM CONNECTED!`);
    console.log(`   Tenant: ${tenant?.name || igUsername} (${finalTenantId})`);
    console.log(`   IG User ID: ${igUserId}`);
    console.log(`   Username: @${igUsername}\n`);

    console.log(`   → Bot is now LIVE on their Instagram!\n`);
    res.redirect('/app?connected=true');
  } catch (err) {
    console.error('OAuth callback error:', err.response?.data || err.message);
    res.send(getErrorPageHTML(
      'שגיאה בחיבור האינסטגרם',
      'משהו השתבש. נסה/י שוב או צור/י קשר לתמיכה.'
    ));
  }
});

// ============================================
// Dashboard - simple config page per tenant
// ============================================
app.get('/dashboard/:tenantId', async (req, res) => {
  // Redirect logged-in users to /app
  const sessionId = req.cookies && req.cookies.session_id;
  if (sessionId) {
    const session = await getSessionRecord(sessionId);
    if (session) return res.redirect('/app');
  }
  const tenant = await getTenant(req.params.tenantId);
  if (!tenant) return res.status(404).send('Tenant not found');
  const justConnected = req.query.connected === 'true';
  res.send(getDashboardHTML(tenant, false, justConnected));
});

// SECURITY: Dashboard POST requires auth + tenant ownership
app.post('/dashboard/:tenantId', authMiddleware, async (req, res) => {
  if (req.tenantId !== req.params.tenantId) {
    return res.status(403).send('Forbidden');
  }
  const tenant = await updateTenant(req.params.tenantId, {
    name: req.body.name,
    businessType: req.body.businessType,
    services: req.body.services,
    ownerName: req.body.ownerName,
    workingHours: req.body.workingHours,
    bookingInstructions: req.body.bookingInstructions,
  });
  if (!tenant) return res.status(404).send('Tenant not found');
  res.send(getDashboardHTML(tenant, true));
});

// ============================================
// Self-Learning Analytics (master admin only)
// ============================================

app.get('/master-admin/analytics', authMiddleware, masterAdminAuth, async (req, res) => {
  try {
    const [outcomeStats, outcomesByTenant, qaIssues, recentIssues, gradeStats, pendingGolden] = await Promise.all([
      getOutcomeStats(),
      getOutcomeStatsByTenant(),
      getQAIssueSummary(),
      getRecentQAIssues(20),
      getGradeStats(),
      getPendingGoldenCount(),
    ]);
    res.json({ outcomeStats, outcomesByTenant, qaIssues, recentIssues, gradeStats, pendingGolden });
  } catch (err) {
    console.error('[Analytics] Error:', err.message);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// Golden Examples Approval Queue (master admin only)
app.get('/master-admin/golden-examples', authMiddleware, masterAdminAuth, async (req, res) => {
  try {
    const status = req.query.status || null; // pending, approved, rejected, disabled
    const examples = await getGoldenExamples(status);
    res.json({ examples });
  } catch (err) {
    console.error('[Golden] List error:', err.message);
    res.status(500).json({ error: 'Failed to load golden examples' });
  }
});

app.post('/master-admin/golden-examples/:id/approve', authMiddleware, masterAdminAuth, async (req, res) => {
  try {
    const result = await updateGoldenExampleStatus(req.params.id, 'approved');
    if (!result) return res.status(404).json({ error: 'Example not found' });
    console.log(`[Golden] Approved example ${req.params.id}`);
    res.json({ success: true, example: result });
  } catch (err) {
    console.error('[Golden] Approve error:', err.message);
    res.status(500).json({ error: 'Failed to approve' });
  }
});

app.post('/master-admin/golden-examples/:id/reject', authMiddleware, masterAdminAuth, async (req, res) => {
  try {
    const result = await updateGoldenExampleStatus(req.params.id, 'rejected');
    if (!result) return res.status(404).json({ error: 'Example not found' });
    console.log(`[Golden] Rejected example ${req.params.id}`);
    res.json({ success: true, example: result });
  } catch (err) {
    console.error('[Golden] Reject error:', err.message);
    res.status(500).json({ error: 'Failed to reject' });
  }
});

app.post('/master-admin/golden-examples/:id/disable', authMiddleware, masterAdminAuth, async (req, res) => {
  try {
    const result = await updateGoldenExampleStatus(req.params.id, 'disabled');
    if (!result) return res.status(404).json({ error: 'Example not found' });
    console.log(`[Golden] Disabled example ${req.params.id}`);
    res.json({ success: true, example: result });
  } catch (err) {
    console.error('[Golden] Disable error:', err.message);
    res.status(500).json({ error: 'Failed to disable' });
  }
});

// Knowledge Base / Teach the AI - Employee Training Page
// ============================================

// Serve the teaching page — SECURITY: admin only
app.get('/teach', adminAuth, async (req, res) => {
  const entries = await getKnowledgeEntries();
  res.send(getTeachHTML(entries, config.apiSecret));
});

// API: Global knowledge — SECURITY: admin auth required
app.post('/api/knowledge', adminAuth, async (req, res) => {
  const { category, title, content, addedBy } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content is required' });
  }
  const entry = await addKnowledgeEntry({
    category: category || 'general',
    title: title || '',
    content: content.trim(),
    addedBy: addedBy || 'Anonymous',
  });
  embedKnowledgeEntry(entry.id, entry.title, entry.content).catch(err =>
    console.warn(`[RAG] Auto-embed failed for ${entry.id}:`, err.message));
  console.log(`[Knowledge] New entry by ${entry.addedBy}: ${entry.title || entry.category}`);
  res.json(entry);
});

app.get('/api/knowledge', adminAuth, async (req, res) => {
  const category = req.query.category;
  res.json(await getKnowledgeEntries(category || null));
});

app.delete('/api/knowledge/:id', adminAuth, async (req, res) => {
  const deleted = await deleteKnowledgeEntry(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Entry not found' });
  res.json({ success: true });
});

app.put('/api/knowledge/:id', adminAuth, async (req, res) => {
  const entry = await updateKnowledgeEntry(req.params.id, req.body);
  if (!entry) return res.status(404).json({ error: 'Entry not found' });
  markEmbeddingStale(req.params.id).catch(() => {});
  embedKnowledgeEntry(entry.id, entry.title, entry.content).catch(err =>
    console.warn(`[RAG] Re-embed failed for ${entry.id}:`, err.message));
  res.json(entry);
});

// ============================================
// Master Admin Dashboard — platform owner only
// ============================================
app.get('/master-admin', authMiddleware, masterAdminAuth, async (req, res) => {
  const tenants = (await getAllTenants()).filter(t => t.id !== 'test');
  const users = await getAllUsers();
  const allLeads = {};
  let totalLeads = 0;
  for (const t of tenants) {
    const leads = await getLeadsByTenant(t.id);
    allLeads[t.id] = leads;
    totalLeads += leads.length;
  }
  const [usageByTenant, platformUsage] = await Promise.all([
    getUsageSummaryByTenant(),
    getPlatformUsageSummary(),
  ]);
  res.send(getMasterAdminHTML(tenants, users, allLeads, totalLeads, { byTenant: usageByTenant, platform: platformUsage }));
});

// API: AI usage stats for master admin dashboard
app.get('/master-admin/usage', authMiddleware, masterAdminAuth, async (req, res) => {
  try {
    const { period } = req.query;
    let since;
    if (period === 'week') {
      since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    } else if (period === 'all') {
      since = new Date(0);
    } else {
      since = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    }
    const [byTenant, platform] = await Promise.all([
      getUsageSummaryByTenant(since),
      getPlatformUsageSummary(since),
    ]);
    res.json({ byTenant, platform, since: since.toISOString() });
  } catch (err) {
    safeError(res, err, 'Usage stats');
  }
});

// Force-logout a user (delete all their sessions)
app.post('/master-admin/logout-user', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const count = await deleteSessionsByEmail(email);
  res.json({ ok: true, sessionsDeleted: count });
});

// Toggle bot active/inactive for a tenant
app.post('/master-admin/toggle-bot', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const { tenantId, botActive } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  await updateTenant(tenantId, { botActive: !!botActive });
  res.json({ ok: true, botActive: !!botActive });
});

// Impersonate a tenant (temporarily switch admin's session to manage their dashboard)
app.post('/master-admin/impersonate', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const { tenantId } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  const tenant = await getTenant(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const sessionId = req.cookies && req.cookies.session_id;
  if (!sessionId) return res.status(400).json({ error: 'No session' });
  await setImpersonation(sessionId, tenantId);
  res.json({ ok: true, tenantName: tenant.name });
});

// Stop impersonating — return to admin's own tenant
app.post('/master-admin/stop-impersonate', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const sessionId = req.cookies && req.cookies.session_id;
  if (!sessionId) return res.status(400).json({ error: 'No session' });
  await setImpersonation(sessionId, null);
  res.json({ ok: true });
});

// Update payment info for a tenant
app.post('/master-admin/update-payment', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const { tenantId, monthlyPayment, paymentStatus, billingModel, pricePerConversation } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  const fields = {};
  if (monthlyPayment !== undefined) {
    const amount = parseFloat(monthlyPayment);
    if (isNaN(amount) || amount < 0) return res.status(400).json({ error: 'Invalid payment amount' });
    fields.monthlyPayment = amount;
  }
  if (paymentStatus !== undefined) {
    if (!['paid', 'unpaid', 'trial', 'cancelled'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    fields.paymentStatus = paymentStatus;
  }
  if (billingModel !== undefined) {
    if (!['flat', 'per_conversation'].includes(billingModel)) {
      return res.status(400).json({ error: 'Invalid billing model' });
    }
    fields.billingModel = billingModel;
  }
  if (pricePerConversation !== undefined) {
    const ppc = parseFloat(pricePerConversation);
    if (isNaN(ppc) || ppc < 0) return res.status(400).json({ error: 'Invalid price per conversation' });
    fields.pricePerConversation = ppc;
  }
  if (Object.keys(fields).length === 0) return res.status(400).json({ error: 'No fields to update' });
  const updated = await updateTenant(tenantId, fields);
  if (!updated) return res.status(404).json({ error: 'Tenant not found' });
  res.json({ ok: true, monthlyPayment: updated.monthlyPayment, paymentStatus: updated.paymentStatus });
});

app.post('/master-admin/extend-trial', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const { tenantId, days = 14 } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  const tenant = await getTenant(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const baseDate = tenant.trialEndsAt ? new Date(tenant.trialEndsAt) : new Date();
  const newEnd = new Date(Math.max(baseDate.getTime(), Date.now()) + days * 24 * 60 * 60 * 1000);
  await updateTenant(tenantId, { trialEndsAt: newEnd.toISOString(), paymentStatus: 'trial' });
  console.log(`[Billing] Trial extended for ${tenant.name} (${tenantId}) → ${newEnd.toISOString()}`);
  res.json({ ok: true, trialEndsAt: newEnd.toISOString() });
});

// Delete a tenant and all their data (conversations, leads, KB)
app.post('/master-admin/delete-tenant', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  const { tenantId } = req.body;
  if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
  const tenant = await getTenant(tenantId);
  if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
  const deleted = await deleteTenantAndData(tenantId);
  if (!deleted) return res.status(500).json({ error: 'Delete failed' });
  console.log(`[Master Admin] Deleted tenant "${tenant.name}" (${tenantId}) by ${req.userEmail}`);
  res.json({ ok: true });
});

// Import Voice DNA for a specific tenant (admin tool)
app.post('/master-admin/import-voice', authMiddleware, masterAdminAuth, express.json(), async (req, res) => {
  try {
    let { tenantId, conversations } = req.body;
    if (!tenantId) return res.status(400).json({ error: 'tenantId required' });
    if (!conversations || typeof conversations !== 'string') {
      return res.status(400).json({ error: 'conversations text is required' });
    }

    const tenant = await getTenant(tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Try to parse as Instagram JSON export
    const extracted = extractMessagesFromInstagramJSON(conversations);
    if (extracted) conversations = extracted;

    if (conversations.trim().length < 50) {
      return res.status(400).json({ error: 'Not enough text (minimum 50 chars)' });
    }
    if (conversations.length > 30000) {
      return res.status(400).json({ error: 'Text too long (max 30,000 chars)' });
    }

    const { dna, usage: dnaUsage } = await importVoiceDNA(conversations.trim());
    trackUsage(tenantId, 'VoiceDNA', dnaUsage);
    const mapped = mapVoiceDNAToTenant(dna);
    await updateTenant(tenantId, mapped);

    console.log(`[VoiceDNA][Admin] Imported for tenant ${tenant.name} (${tenantId}) by ${req.userEmail}`);
    res.json({ ok: true, imported: mapped });
  } catch (err) {
    safeError(res, err, 'Admin Voice DNA import');
  }
});

// ============================================
// Admin Panel — SECURITY: Redirects to master-admin (proper session auth)
// ============================================
app.get('/admin', (req, res) => {
  res.redirect('/master-admin');
});

// ============================================
// Start server with port conflict handling
// ============================================
let activeServer = null; // Module-level reference for graceful shutdown

function startServer(port, maxRetries = 5) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    
    server.on('listening', () => {
      const local = `http://localhost:${port}`;
      console.log(`\nServer running on ${local}`);
      if (config.baseUrl !== local) console.log(`Production: ${config.baseUrl}`);
      console.log(`App: ${local}/app`);
      console.log(`Test: ${local}/chat`);
      console.log(`Health: ${local}/health\n`);
      activeServer = server; // Store reference for shutdown
      resolve(server);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && maxRetries > 0) {
        const nextPort = port + 1;
        console.warn(`Port ${port} in use, trying ${nextPort}...`);
        startServer(nextPort, maxRetries - 1).then(resolve);
      } else {
        console.error(`Server error: ${err.message}`);
        process.exit(1);
      }
    });

    server.listen(port);
  });
}

startServer(config.port);

// Expired session cleanup every 6 hours
setInterval(async () => {
  try {
    const removed = await cleanupExpiredSessions();
    if (removed > 0) console.log(`[Cleanup] Removed ${removed} expired sessions`);
  } catch (err) {
    console.error('[Cleanup] Session cleanup error:', err.message);
  }
}, 6 * 60 * 60 * 1000);

// Self-Learning: classify stale outcomes + grade conversations + embed golden examples (every 6h)
if (process.env.LEARNING_ENABLED !== 'false') {
  setInterval(async () => {
    try {
      const result = await classifyStaleOutcomes();
      if (result.classified > 0) {
        console.log(`[Outcomes] Batch: classified ${result.classified} stale conversation(s)`);
      }
    } catch (err) {
      console.warn('[Outcomes] Batch classification error (non-fatal):', err.message);
    }
    // Phase 2: Grade closed conversations + extract golden examples
    if (process.env.GRADING_ENABLED !== 'false') {
      try {
        const gradeResult = await gradeAndExtract();
        if (gradeResult.graded > 0 || gradeResult.extracted > 0) {
          console.log(`[Learning] Batch: graded ${gradeResult.graded}, extracted ${gradeResult.extracted} golden`);
        }
      } catch (err) {
        console.warn('[Learning] Grading batch error (non-fatal):', err.message);
      }
      // Embed any stale golden examples
      try {
        await embedStaleGoldenExamples();
      } catch (err) {
        console.warn('[Learning] Golden embedding error (non-fatal):', err.message);
      }
      // Reinforce voice DNA from graded conversations
      try {
        await reinforceVoiceFromGrades();
      } catch (err) {
        console.warn('[Learning] Voice reinforcement error (non-fatal):', err.message);
      }
    }
    // Embed stale KB entries (RAG depends on this!)
    try {
      const kbEmbedded = await embedStaleKBEntries(config.openaiApiKey);
      if (kbEmbedded > 0) {
        console.log(`[Learning] Embedded ${kbEmbedded} stale KB entries`);
      }
    } catch (err) {
      console.warn('[Learning] KB embedding error (non-fatal):', err.message);
    }
  }, 6 * 60 * 60 * 1000);
  // Also run once on startup (after 30s delay to let DB initialize)
  setTimeout(() => {
    classifyStaleOutcomes().catch(err =>
      console.warn('[Outcomes] Startup classification error (non-fatal):', err.message)
    );
    // Grading runs after 60s (give outcomes time to classify first)
    if (process.env.GRADING_ENABLED !== 'false') {
      setTimeout(() => {
        gradeAndExtract().catch(err =>
          console.warn('[Learning] Startup grading error (non-fatal):', err.message)
        );
      }, 30000);
    }
  }, 30000);
}

// Ensure igPageId stores the IGSID (user_id) — webhooks use this format
setTimeout(async () => {
  try {
    const axios = (await import('axios')).default;
    const tenants = await getAllTenants();
    for (const t of tenants) {
      if (!t.igAccessToken) continue;
      try {
        const res = await axios.get('https://graph.instagram.com/v21.0/me', {
          params: { fields: 'user_id,username', access_token: t.igAccessToken },
          timeout: 5000,
        });
        const igsid = res.data.user_id;
        if (igsid && igsid !== t.igPageId) {
          console.log(`[IG-ID-Sync] ${t.name}: ${t.igPageId} → ${igsid} (restored IGSID)`);
          await updateTenant(t.id, { igPageId: igsid });
        }
      } catch (err) {
        if (err.response?.data?.error?.code === 190) continue;
        console.warn(`[IG-ID-Sync] Failed for ${t.name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn('[IG-ID-Sync] Sync failed (non-fatal):', err.message);
  }
}, 5000);

// RAG: re-embed stale KB entries on startup (non-blocking)
if (process.env.DATABASE_URL && config.openaiApiKey) {
  setTimeout(async () => {
    try {
      const stale = await getStaleKnowledgeEntries();
      if (stale.length > 0) {
        console.log(`[RAG] Re-embedding ${stale.length} stale KB entries...`);
        for (const entry of stale) {
          await embedKnowledgeEntry(entry.id, entry.title, entry.content);
        }
        console.log(`[RAG] Re-embedding complete`);
      }
    } catch (err) {
      console.warn('[RAG] Stale embedding cleanup failed (non-fatal):', err.message);
    }
  }, 10000);
}

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down gracefully...`);
  
  if (!activeServer) {
    console.log('Server not started yet, exiting immediately.');
    process.exit(0);
    return;
  }
  
  activeServer.close(async () => {
    try {
      // Close DB pool if PostgreSQL
      if (process.env.DATABASE_URL) {
        const { closePool } = await import('./database/connection.js');
        await closePool();
      }
    } catch (err) {
      console.error('Error closing DB pool:', err.message);
    }
    console.log('Server closed.');
    process.exit(0);
  });
  // Force exit after 10s if connections won't close
  setTimeout(() => {
    console.error('Forcing exit after 10s timeout');
    process.exit(1);
  }, 10000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
