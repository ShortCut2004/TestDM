import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SEED_DIR = path.join(__dirname, '..', 'data-seed');

// On first deploy with a volume, /app/data is empty.
// Copy seed files if the data directory has no knowledge base yet.
function seedDataIfNeeded() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const kbFile = path.join(DATA_DIR, 'knowledge-base.json');
  const seedKb = path.join(SEED_DIR, 'knowledge-base.json');
  if (!fs.existsSync(kbFile) && fs.existsSync(seedKb)) {
    console.log('Seeding knowledge base from data-seed...');
    fs.copyFileSync(seedKb, kbFile);
  }
  const dbFile = path.join(DATA_DIR, 'db.json');
  const seedDb = path.join(SEED_DIR, 'db.json');
  if (!fs.existsSync(dbFile) && fs.existsSync(seedDb)) {
    console.log('Seeding db from data-seed...');
    fs.copyFileSync(seedDb, dbFile);
  }
}
seedDataIfNeeded();

// Simple JSON-based storage (will be swapped for PostgreSQL when DATABASE_URL is set)
const DB_FILE = path.join(DATA_DIR, 'db.json');

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading db, starting fresh:', e.message);
  }
  return { tenants: {}, conversations: {}, leads: {}, users: {}, sessions: {} };
}

function saveDb(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
}

let db = loadDb();

// --- Tenants ---

export async function createTenant(tenant) {
  const id = tenant.id || `tenant_${crypto.randomUUID()}`;
  db.tenants[id] = {
    id,
    name: tenant.name || '',
    businessType: tenant.businessType || '',
    services: tenant.services || '',
    ownerName: tenant.ownerName || '',
    workingHours: tenant.workingHours || 'א-ה 9:00-18:00',
    bookingInstructions: tenant.bookingInstructions || '',
    customFirstReply: tenant.customFirstReply || '',
    slangWords: tenant.slangWords || '',
    websiteLinks: tenant.websiteLinks || '',
    igPageId: tenant.igPageId || '',
    igAccessToken: tenant.igAccessToken || '',
    botActive: tenant.botActive !== undefined ? tenant.botActive : true,
    phone: tenant.phone || '',
    instagram: tenant.instagram || '',
    notes: tenant.notes || '',
    // Voice profile
    voiceGreeting: tenant.voiceGreeting || '',
    voiceEnergy: tenant.voiceEnergy || 'warm',
    voicePhrases: tenant.voicePhrases || '',
    voicePhrasesMale: tenant.voicePhrasesMale || '',
    voicePhrasesFemale: tenant.voicePhrasesFemale || '',
    voiceEmoji: tenant.voiceEmoji || 'sometimes',
    voiceLength: tenant.voiceLength || 'normal',
    voiceHumor: tenant.voiceHumor || 'light',
    voiceExamples: tenant.voiceExamples || '',
    voiceAvoid: tenant.voiceAvoid || '',
    systemPrompt: tenant.systemPrompt || '',
    status: 'pending_setup',
    createdAt: new Date().toISOString(),
  };
  saveDb(db);
  return db.tenants[id];
}

export async function getTenant(id) {
  return db.tenants[id] || null;
}

export async function getTenantByIgPageId(igPageId) {
  // Return the most recently created tenant with this igPageId (handles duplicates)
  const matches = Object.values(db.tenants).filter(t => t.igPageId === igPageId);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // Prefer the newest one (highest timestamp in ID or createdAt)
  return matches.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).at(0);
}

export async function updateTenant(id, fields) {
  if (!db.tenants[id]) return null;
  Object.assign(db.tenants[id], fields);
  saveDb(db);
  return db.tenants[id];
}

export async function getAllTenants() {
  return Object.values(db.tenants);
}

export async function deleteTenantAndData(tenantId) {
  if (!db.tenants[tenantId]) return false;
  delete db.tenants[tenantId];
  // Delete conversations and leads for this tenant
  for (const key of Object.keys(db.conversations || {})) {
    if (key.startsWith(tenantId + ':')) delete db.conversations[key];
  }
  for (const key of Object.keys(db.leads || {})) {
    if (key.startsWith(tenantId + ':')) delete db.leads[key];
  }
  saveDb(db);
  return true;
}

// --- Conversations ---

function convKey(tenantId, userId) {
  return `${tenantId}:${userId}`;
}

export async function getConversationHistory(tenantId, userId, limit = 20) {
  const key = convKey(tenantId, userId);
  const msgs = db.conversations[key] || [];
  return msgs.slice(-limit);
}

export async function saveMessage(tenantId, userId, role, content) {
  const key = convKey(tenantId, userId);
  if (!db.conversations[key]) {
    db.conversations[key] = [];
  }
  db.conversations[key].push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });
  // Keep last 100 messages per conversation
  if (db.conversations[key].length > 100) {
    db.conversations[key] = db.conversations[key].slice(-100);
  }
  saveDb(db);
}

// --- Leads ---

function leadKey(tenantId, userId) {
  return `${tenantId}:${userId}`;
}

export async function getOrCreateLead(tenantId, userId) {
  const key = leadKey(tenantId, userId);
  if (!db.leads[key]) {
    db.leads[key] = {
      tenantId,
      userId,
      name: null,
      instagramName: null,
      instagramUsername: null,
      interest: null,
      qualificationScore: 0,
      status: 'new',
      bookingLinkSent: false,
      gathered: {},
      entryType: 'unknown',
      currentStep: 'opening',
      ignored: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveDb(db);
  }
  return db.leads[key];
}

export async function getLeadIfExists(tenantId, userId) {
  const key = leadKey(tenantId, userId);
  return db.leads[key] || null;
}

export async function updateLead(tenantId, userId, fields) {
  const key = leadKey(tenantId, userId);
  if (!db.leads[key]) {
    await getOrCreateLead(tenantId, userId);
  }
  Object.assign(db.leads[key], fields, { updatedAt: new Date().toISOString() });
  saveDb(db);
  return db.leads[key];
}

export async function getLeadsByTenant(tenantId) {
  return Object.values(db.leads).filter(l => l.tenantId === tenantId);
}

export async function clearConversation(tenantId, userId) {
  const key = convKey(tenantId, userId);
  if (db.conversations[key]) {
    delete db.conversations[key];
    saveDb(db);
    return true;
  }
  return false;
}

// --- Knowledge Base (SOP / Training Data) ---
// Stored separately so it's clear and persistent

const KB_FILE = path.join(DATA_DIR, 'knowledge-base.json');

function loadKnowledgeBase() {
  try {
    if (fs.existsSync(KB_FILE)) {
      return JSON.parse(fs.readFileSync(KB_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('Error loading knowledge base:', e.message);
  }
  return { entries: [] };
}

function saveKnowledgeBase(kb) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(KB_FILE, JSON.stringify(kb, null, 2), 'utf8');
}

let knowledgeBase = loadKnowledgeBase();

export async function addKnowledgeEntry(entry, tenantId = '__global__') {
  const newEntry = {
    id: `kb_${crypto.randomUUID()}`,
    tenantId,
    category: entry.category || 'general',
    title: entry.title || '',
    content: entry.content || '',
    addedBy: entry.addedBy || '',
    createdAt: new Date().toISOString(),
  };
  knowledgeBase.entries.push(newEntry);
  saveKnowledgeBase(knowledgeBase);
  return newEntry;
}

// Get global entries only (no tenantId or __global__)
export async function getKnowledgeEntries(category) {
  let entries = knowledgeBase.entries.filter(e => !e.tenantId || e.tenantId === '__global__');
  if (category) {
    entries = entries.filter(e => e.category === category);
  }
  return entries;
}

// Get entries for a specific tenant (global + their own)
export async function getKnowledgeEntriesForTenant(tenantId, category) {
  let entries = knowledgeBase.entries.filter(e =>
    !e.tenantId || e.tenantId === '__global__' || e.tenantId === tenantId
  );
  if (category) {
    entries = entries.filter(e => e.category === category);
  }
  return entries;
}

// Get ONLY the tenant's own entries (not global)
export async function getTenantKnowledgeEntries(tenantId, category) {
  let entries = knowledgeBase.entries.filter(e => e.tenantId === tenantId);
  if (category) {
    entries = entries.filter(e => e.category === category);
  }
  return entries;
}

export async function deleteKnowledgeEntry(id, tenantId = null) {
  const before = knowledgeBase.entries.length;
  knowledgeBase.entries = knowledgeBase.entries.filter(e => {
    if (e.id !== id) return true;
    if (tenantId && e.tenantId !== tenantId) return true;
    return false;
  });
  if (knowledgeBase.entries.length < before) {
    saveKnowledgeBase(knowledgeBase);
    return true;
  }
  return false;
}

export async function updateKnowledgeEntry(id, fields, tenantId = null) {
  const entry = knowledgeBase.entries.find(e => {
    if (e.id !== id) return false;
    if (tenantId && e.tenantId !== tenantId) return false;
    return true;
  });
  if (!entry) return null;
  Object.assign(entry, fields, { updatedAt: new Date().toISOString() });
  saveKnowledgeBase(knowledgeBase);
  return entry;
}

// --- Users ---

export async function createUserRecord(email, passwordHash, tenantId) {
  if (!db.users) db.users = {};
  const id = `user_${crypto.randomUUID()}`;
  db.users[email] = {
    id,
    email,
    passwordHash,
    tenantId,
    createdAt: new Date().toISOString(),
  };
  saveDb(db);
  return db.users[email];
}

export async function getUserByEmail(email) {
  if (!db.users) db.users = {};
  return db.users[email] || null;
}

export async function getAllUsers() {
  if (!db.users) db.users = {};
  return Object.values(db.users).map(u => ({
    id: u.id,
    email: u.email,
    tenantId: u.tenantId,
    createdAt: u.createdAt,
  }));
}

export async function getUserEmailByTenantId(tenantId) {
  if (!db.users) db.users = {};
  const user = Object.values(db.users).find(u => u.tenantId === tenantId);
  return user?.email || null;
}

export async function updateUserTenant(email, newTenantId) {
  if (!db.users || !db.users[email]) return null;
  db.users[email].tenantId = newTenantId;
  saveDb(db);
  return db.users[email];
}

export async function updateSessionsTenant(email, newTenantId) {
  if (!db.sessions) return;
  for (const [id, session] of Object.entries(db.sessions)) {
    if (session.email === email) {
      session.tenantId = newTenantId;
    }
  }
  saveDb(db);
}

// --- Sessions ---

export async function saveSessionRecord(sessionId, data) {
  if (!db.sessions) db.sessions = {};
  db.sessions[sessionId] = data;
  saveDb(db);
}

export async function getSessionRecord(sessionId) {
  if (!db.sessions) db.sessions = {};
  const session = db.sessions[sessionId] || null;
  if (session && !('impersonatingTenantId' in session)) {
    session.impersonatingTenantId = null;
  }
  return session;
}

export async function setImpersonation(sessionId, tenantId) {
  if (!db.sessions || !db.sessions[sessionId]) return;
  db.sessions[sessionId].impersonatingTenantId = tenantId;
  saveDb(db);
}

export async function deleteSessionRecord(sessionId) {
  if (!db.sessions) db.sessions = {};
  delete db.sessions[sessionId];
  saveDb(db);
}

export async function deleteSessionsByEmail(email) {
  if (!db.sessions) return 0;
  let count = 0;
  for (const [id, session] of Object.entries(db.sessions)) {
    if (session.email === email) {
      delete db.sessions[id];
      count++;
    }
  }
  if (count > 0) saveDb(db);
  return count;
}

export async function cleanupExpiredSessions() {
  if (!db.sessions) return 0;
  const now = new Date();
  let count = 0;
  for (const [id, session] of Object.entries(db.sessions)) {
    if (session.expiresAt && new Date(session.expiresAt) < now) {
      delete db.sessions[id];
      count++;
    }
  }
  if (count > 0) saveDb(db);
  return count;
}

// --- API Usage Tracking ---

export async function recordApiUsage(tenantId, operation, promptTokens, completionTokens, totalTokens, costUsd, model) {
  if (!db.apiUsage) db.apiUsage = [];
  db.apiUsage.push({
    tenantId, operation, promptTokens, completionTokens, totalTokens, costUsd, model,
    createdAt: new Date().toISOString(),
  });
  if (db.apiUsage.length > 10000) {
    db.apiUsage = db.apiUsage.slice(-10000);
  }
  saveDb(db);
}

export async function getUsageSummaryByTenant(since = null) {
  if (!db.apiUsage) return [];
  const sinceDate = since || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const filtered = db.apiUsage.filter(u => new Date(u.createdAt) >= sinceDate);
  const grouped = {};
  for (const u of filtered) {
    if (!grouped[u.tenantId]) grouped[u.tenantId] = { tenantId: u.tenantId, callCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
    grouped[u.tenantId].callCount++;
    grouped[u.tenantId].promptTokens += u.promptTokens;
    grouped[u.tenantId].completionTokens += u.completionTokens;
    grouped[u.tenantId].totalTokens += u.totalTokens;
    grouped[u.tenantId].costUsd += u.costUsd;
  }
  return Object.values(grouped).sort((a, b) => b.costUsd - a.costUsd);
}

export async function getPlatformUsageSummary(since = null) {
  if (!db.apiUsage) return { callCount: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0, costUsd: 0 };
  const sinceDate = since || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const filtered = db.apiUsage.filter(u => new Date(u.createdAt) >= sinceDate);
  return {
    callCount: filtered.length,
    promptTokens: filtered.reduce((s, u) => s + u.promptTokens, 0),
    completionTokens: filtered.reduce((s, u) => s + u.completionTokens, 0),
    totalTokens: filtered.reduce((s, u) => s + u.totalTokens, 0),
    costUsd: filtered.reduce((s, u) => s + u.costUsd, 0),
  };
}

// --- Billing usage (basic stub for JSON mode) ---

export async function getConversationCountByTenant(tenantId, since = null) {
  const sinceDate = since || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const convos = db.conversations || {};
  let uniqueUsers = new Set();
  let messageCount = 0;
  for (const key of Object.keys(convos)) {
    if (!key.startsWith(tenantId + ':')) continue;
    const userId = key.split(':').slice(1).join(':');
    const msgs = convos[key] || [];
    const userMsgs = msgs.filter(m => m.role === 'user' && new Date(m.timestamp || m.createdAt) >= sinceDate);
    if (userMsgs.length > 0) {
      uniqueUsers.add(userId);
      messageCount += userMsgs.length;
    }
  }
  return { conversationCount: uniqueUsers.size, messageCount };
}

// --- Self-Learning stubs (full implementation is PostgreSQL-only) ---

// Phase 1
export async function upsertOutcome() { return null; }
export async function getOutcome() { return null; }
export async function getActiveOutcomes() { return []; }
export async function getOutcomeStats() { return []; }
export async function getOutcomeStatsByTenant() { return []; }
export async function recordQAIssue() {}
export async function getQAIssueSummary() { return []; }
export async function getRecentQAIssues() { return []; }

// Phase 2
export async function saveGrade() {}
export async function getUngradedOutcomes() { return []; }
export async function getGradeStats() { return { total: 0, avgScore: '0', avgNaturalness: '0', avgHebrew: '0', highQuality: 0 }; }
export async function saveGoldenExample() {}
export async function getGoldenExamples() { return []; }
export async function updateGoldenExampleStatus() { return null; }
export async function incrementGoldenUsage() {}
export async function searchGoldenByEmbedding() { return []; }
export async function updateGoldenEmbedding() {}
export async function getStaleGoldenExamples() { return []; }
export async function getPendingGoldenCount() { return 0; }

// --- RAG stubs (vector search is PostgreSQL-only) ---

export async function searchKnowledgeByEmbedding() {
  return { priority: [], semantic: [], unembedded: [] };
}
export async function updateKnowledgeEmbedding() {}
export async function getStaleKnowledgeEntries() { return []; }
export async function markEmbeddingStale() {}

// --- Seed default test tenant ---

export async function seedTestTenant() {
  if (!db.tenants['test']) {
    await createTenant({
      id: 'test',
      name: 'העסק שלי',
      businessType: 'ייעוץ עסקי',
      services: 'ייעוץ עסקי, אסטרטגיה שיווקית, ליווי צמיחה',
      ownerName: 'יובל',
      workingHours: 'א-ה 9:00-18:00',
      bookingInstructions: 'לקביעת שיחת היכרות: https://cal.com/your-link',
    });
    console.log('Seeded test tenant');
  }
}
