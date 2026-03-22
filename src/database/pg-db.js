import crypto from 'crypto';
import { query, closePool } from './connection.js';

// --- Auto-migration: add new columns if missing ---
try {
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS gathered JSONB DEFAULT '{}'");
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'unknown'");
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_step TEXT DEFAULT 'opening'");
} catch (e) {
  console.warn('Migration warning (non-fatal):', e.message);
}

// --- Bot gender + custom flow ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bot_gender TEXT DEFAULT 'male'");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS custom_flow_instructions TEXT DEFAULT ''");
} catch (e) {
  console.warn('Bot gender/flow migration warning (non-fatal):', e.message);
}

// --- Mute/ignore users ---
try {
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS ignored BOOLEAN DEFAULT false");
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_username TEXT");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ignore_list TEXT DEFAULT ''");
} catch (e) {
  console.warn('Ignore list migration warning (non-fatal):', e.message);
}

// --- Gender lock (manual override from dashboard) ---
try {
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS gender_locked BOOLEAN DEFAULT false");
} catch (e) {
  console.warn('Gender lock migration warning (non-fatal):', e.message);
}

// --- Conversation mode (multi-mode engine) ---
try {
  await query("ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_mode TEXT DEFAULT NULL");
} catch (e) {
  console.warn('Conversation mode migration warning (non-fatal):', e.message);
}

// --- Trigger words (CTA from bio) ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trigger_words JSONB DEFAULT '[]'");
} catch (e) {
  console.warn('Trigger words migration warning (non-fatal):', e.message);
}

// --- Payment tracking (master admin) ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_payment NUMERIC DEFAULT 0");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid'");
} catch (e) {
  console.warn('Payment tracking migration warning (non-fatal):', e.message);
}

// --- Wizard completion flag ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wizard_completed BOOLEAN DEFAULT false");
  // Backfill: existing tenants with IG connected are already onboarded
  await query("UPDATE tenants SET wizard_completed = true WHERE ig_access_token != '' AND ig_access_token IS NOT NULL AND wizard_completed = false");
} catch (e) {
  console.warn('Wizard migration warning (non-fatal):', e.message);
}

// --- CTA configuration ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cta_push_level TEXT DEFAULT 'normal'");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cta_type TEXT DEFAULT 'send_link'");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_phone TEXT DEFAULT ''");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cta_custom_text TEXT DEFAULT ''");
} catch (e) {
  console.warn('CTA config migration warning (non-fatal):', e.message);
}

// --- Conversation strategy (Wizard V4) ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS conversation_strategy JSONB DEFAULT NULL");
} catch (e) {
  console.warn('Conversation strategy migration warning (non-fatal):', e.message);
}

// --- Voice personality (character archetype) ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS voice_personality TEXT DEFAULT ''");
} catch (e) {
  console.warn('Voice personality migration warning (non-fatal):', e.message);
}

// --- Voice import metadata ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS voice_import_meta JSONB DEFAULT '{}'");
} catch (e) {
  console.warn('Voice import meta migration warning (non-fatal):', e.message);
}

// --- Response delay configuration ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delay_config JSONB DEFAULT NULL");
} catch (e) {
  console.warn('Delay config migration warning (non-fatal):', e.message);
}

// --- Bot goal & max messages (freeflow onboarding) ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bot_goal TEXT DEFAULT 'book_calls'");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_bot_messages INTEGER DEFAULT NULL");
} catch (e) {
  console.warn('Bot goal migration warning (non-fatal):', e.message);
}

// --- System prompt override (full custom prompt per tenant) ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT ''");
} catch (e) {
  console.warn('System prompt migration warning (non-fatal):', e.message);
}

// --- RAG: embedding columns ---
try {
  await query("ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding JSONB");
  await query("ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding_stale BOOLEAN DEFAULT true");
} catch (e) {
  console.warn('RAG migration warning (non-fatal):', e.message);
}

// --- AI usage tracking table ---
try {
  await query(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      operation TEXT NOT NULL,
      prompt_tokens INTEGER NOT NULL DEFAULT 0,
      completion_tokens INTEGER NOT NULL DEFAULT 0,
      total_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
      model TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_api_usage_tenant_time ON api_usage (tenant_id, created_at DESC)');
  await query('CREATE INDEX IF NOT EXISTS idx_api_usage_created ON api_usage (created_at DESC)');
} catch (e) {
  console.warn('API usage table migration warning (non-fatal):', e.message);
}

// --- One-time backfill: estimate historical AI costs from assistant messages ---
// Calibrated against actual OpenRouter spend ($29.74 monthly as of 2026-03-09).
// Messages are our only proxy — wizard/voice/teaching calls aren't in the DB.
// So we pro-rate the full OpenRouter spend across message counts per tenant.
try {
  const { rows: [{ count: usageCount }] } = await query('SELECT COUNT(*) as count FROM api_usage');
  const needsBackfill = parseInt(usageCount) === 0;
  // Also fix if old underestimated backfill ran (cost_usd ~$0.003 per row)
  const { rows: [{ avg_cost }] } = needsBackfill ? { rows: [{ avg_cost: 0 }] }
    : await query('SELECT AVG(cost_usd) as avg_cost FROM api_usage WHERE operation = $1', ['SetterAI']);
  const needsCorrection = !needsBackfill && parseFloat(avg_cost || 0) < 0.01;

  if (needsBackfill || needsCorrection) {
    if (needsCorrection) {
      // Delete old underestimated rows
      await query("DELETE FROM api_usage WHERE operation = 'SetterAI'");
    }
    // Pro-rated from actual OpenRouter spend: $29.74 / ~515 total messages ≈ $0.0577 per message
    // Token estimates: Hebrew system prompt ~12,500 + context ~2,500 = ~15,000 input, ~150 output
    const AVG_IN = 15000, AVG_OUT = 150, AVG_TOTAL = 15150;
    const COST_PER_CALL = 0.0577; // calibrated to actual OpenRouter bill
    const backfill = await query(`
      INSERT INTO api_usage (tenant_id, operation, prompt_tokens, completion_tokens, total_tokens, cost_usd, model, created_at)
      SELECT m.tenant_id, 'SetterAI', $1, $2, $3, $4, 'anthropic/claude-haiku-4.5', m.created_at
      FROM messages m
      WHERE m.role = 'assistant'
        AND m.tenant_id != 'test'
        AND m.tenant_id IN (SELECT id FROM tenants)
    `, [AVG_IN, AVG_OUT, AVG_TOTAL, COST_PER_CALL]);
    if (backfill.rowCount > 0) {
      console.log(`[Usage Backfill] ${needsCorrection ? 'Corrected' : 'Inserted'} ${backfill.rowCount} estimated usage records (calibrated to OpenRouter spend)`);
    }
  }
} catch (e) {
  console.warn('Usage backfill warning (non-fatal):', e.message);
}

// --- Billing columns migration ---
try {
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS polar_customer_id TEXT");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_model TEXT DEFAULT 'flat'");
  await query("ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_per_conversation NUMERIC DEFAULT 0");
  // Give existing tenants without billing data a 14-day trial
  const migrated = await query(`
    UPDATE tenants SET payment_status = 'trial', trial_ends_at = NOW() + INTERVAL '14 days'
    WHERE trial_ends_at IS NULL AND payment_status = 'unpaid'
  `);
  if (migrated.rowCount > 0) {
    console.log(`[Billing Migration] Granted 14-day trial to ${migrated.rowCount} existing tenant(s)`);
  }
} catch (e) {
  console.warn('Billing migration warning (non-fatal):', e.message);
}

// --- Self-Learning System: conversation_outcomes + qa_issues tables ---
try {
  await query(`
    CREATE TABLE IF NOT EXISTS conversation_outcomes (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'active',
      close_reason TEXT,
      first_message_at TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ,
      outcome_at TIMESTAMPTZ,
      user_message_count INTEGER DEFAULT 0,
      bot_message_count INTEGER DEFAULT 0,
      total_messages INTEGER DEFAULT 0,
      final_score INTEGER DEFAULT 0,
      final_mode TEXT,
      final_entry_type TEXT,
      booking_link_sent BOOLEAN DEFAULT false,
      last_step TEXT,
      drop_off_after_step TEXT,
      prompt_version TEXT DEFAULT 'v1',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id)
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_outcomes_tenant ON conversation_outcomes (tenant_id)');
  await query('CREATE INDEX IF NOT EXISTS idx_outcomes_outcome ON conversation_outcomes (outcome)');

  await query(`
    CREATE TABLE IF NOT EXISTS qa_issues (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      issue_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      detail TEXT,
      reply_snippet TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_qa_issues_tenant ON qa_issues (tenant_id, created_at DESC)');
} catch (e) {
  console.warn('Self-learning tables migration warning (non-fatal):', e.message);
}

// --- Phase 2: conversation_grades + golden_examples tables ---
try {
  await query(`
    CREATE TABLE IF NOT EXISTS conversation_grades (
      id SERIAL PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      naturalness INTEGER,
      hebrew_quality INTEGER,
      goal_achievement INTEGER,
      customer_satisfaction INTEGER,
      flow_quality INTEGER,
      overall_score REAL,
      strengths TEXT,
      weaknesses TEXT,
      grader_model TEXT DEFAULT 'anthropic/claude-haiku-4.5',
      graded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tenant_id, user_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS golden_examples (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      situation TEXT NOT NULL,
      user_message TEXT NOT NULL,
      bot_reply TEXT NOT NULL,
      entry_type TEXT,
      conversation_mode TEXT,
      lead_score_before INTEGER,
      lead_score_after INTEGER,
      grade_overall REAL,
      status TEXT NOT NULL DEFAULT 'pending',
      times_used INTEGER DEFAULT 0,
      embedding JSONB,
      embedding_stale BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await query('CREATE INDEX IF NOT EXISTS idx_golden_status ON golden_examples (status)');
  await query('CREATE INDEX IF NOT EXISTS idx_golden_tenant ON golden_examples (tenant_id)');
} catch (e) {
  console.warn('Phase 2 tables migration warning (non-fatal):', e.message);
}

// --- Cleanup: strip leaked LEAD tags from conversation history ---
try {
  const result = await query(`
    UPDATE messages SET content = REGEXP_REPLACE(content, '<!--\\s*LEAD\\s*:.*?-->', '', 'gs')
    WHERE role = 'assistant' AND content LIKE '%LEAD:%'
  `);
  if (result.rowCount > 0) {
    console.log(`[DB Cleanup] Stripped LEAD tags from ${result.rowCount} poisoned messages`);
  }
} catch (e) {
  console.warn('LEAD tag cleanup warning (non-fatal):', e.message);
}

// --- Tenants ---

export async function createTenant(tenant) {
  const id = tenant.id || `tenant_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await query(`
    INSERT INTO tenants (
      id, name, business_type, services, owner_name, working_hours,
      booking_instructions, custom_first_reply, slang_words, website_links,
      ig_page_id, ig_access_token, bot_active, phone, instagram, notes,
      voice_greeting, voice_energy, voice_phrases, voice_phrases_male,
      voice_phrases_female, voice_emoji, voice_length, voice_humor,
      voice_examples, voice_avoid, bot_gender, custom_flow_instructions, ignore_list, status, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31
    )`, [
    id,
    tenant.name || '',
    tenant.businessType || '',
    tenant.services || '',
    tenant.ownerName || '',
    tenant.workingHours || 'א-ה 9:00-18:00',
    tenant.bookingInstructions || '',
    tenant.customFirstReply || '',
    tenant.slangWords || '',
    tenant.websiteLinks || '',
    tenant.igPageId || '',
    tenant.igAccessToken || '',
    tenant.botActive !== undefined ? tenant.botActive : true,
    tenant.phone || '',
    tenant.instagram || '',
    tenant.notes || '',
    tenant.voiceGreeting || '',
    tenant.voiceEnergy || 'warm',
    tenant.voicePhrases || '',
    tenant.voicePhrasesMale || '',
    tenant.voicePhrasesFemale || '',
    tenant.voiceEmoji || 'sometimes',
    tenant.voiceLength || 'normal',
    tenant.voiceHumor || 'light',
    tenant.voiceExamples || '',
    tenant.voiceAvoid || '',
    tenant.botGender || 'male',
    tenant.customFlowInstructions || '',
    tenant.ignoreList || '',
    tenant.status || 'pending_setup',
    now,
  ]);
  // Set trial period for new tenants
  await query(`
    UPDATE tenants SET payment_status = 'trial', trial_ends_at = NOW() + INTERVAL '14 days'
    WHERE id = $1 AND trial_ends_at IS NULL
  `, [id]);
  return await getTenant(id);
}

function rowToTenant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type,
    services: row.services,
    ownerName: row.owner_name,
    workingHours: row.working_hours,
    bookingInstructions: row.booking_instructions,
    customFirstReply: row.custom_first_reply,
    slangWords: row.slang_words,
    websiteLinks: row.website_links,
    igPageId: row.ig_page_id,
    igAccessToken: row.ig_access_token,
    botActive: row.bot_active,
    phone: row.phone,
    instagram: row.instagram,
    notes: row.notes,
    voiceGreeting: row.voice_greeting,
    voiceEnergy: row.voice_energy,
    voicePhrases: row.voice_phrases,
    voicePhrasesMale: row.voice_phrases_male,
    voicePhrasesFemale: row.voice_phrases_female,
    voiceEmoji: row.voice_emoji,
    voiceLength: row.voice_length,
    voiceHumor: row.voice_humor,
    voiceExamples: row.voice_examples,
    voiceAvoid: row.voice_avoid,
    voicePersonality: row.voice_personality || '',
    voiceImportMeta: typeof row.voice_import_meta === 'string'
      ? JSON.parse(row.voice_import_meta)
      : (row.voice_import_meta || {}),
    botGender: row.bot_gender,
    customFlowInstructions: row.custom_flow_instructions,
    ignoreList: row.ignore_list || '',
    triggerWords: typeof row.trigger_words === 'string' ? JSON.parse(row.trigger_words) : (row.trigger_words || []),
    monthlyPayment: row.monthly_payment != null ? parseFloat(row.monthly_payment) : 0,
    paymentStatus: row.payment_status || 'unpaid',
    manychatConnected: row.manychat_connected,
    lastApiCall: row.last_api_call,
    status: row.status,
    aiTemperature: row.ai_temperature != null ? parseFloat(row.ai_temperature) : undefined,
    wizardCompleted: row.wizard_completed || false,
    ctaPushLevel: row.cta_push_level || 'normal',
    ctaType: row.cta_type || 'send_link',
    ownerPhone: row.owner_phone || '',
    ctaCustomText: row.cta_custom_text || '',
    conversationStrategy: typeof row.conversation_strategy === 'string'
      ? JSON.parse(row.conversation_strategy)
      : (row.conversation_strategy || null),
    delayConfig: typeof row.delay_config === 'string'
      ? JSON.parse(row.delay_config)
      : (row.delay_config || null),
    botGoal: row.bot_goal || 'book_calls',
    maxBotMessages: row.max_bot_messages != null ? parseInt(row.max_bot_messages) : null,
    polarCustomerId: row.polar_customer_id || '',
    polarSubscriptionId: row.polar_subscription_id || '',
    trialEndsAt: row.trial_ends_at?.toISOString?.() || row.trial_ends_at || null,
    subscriptionEndsAt: row.subscription_ends_at?.toISOString?.() || row.subscription_ends_at || null,
    billingModel: row.billing_model || 'flat',
    pricePerConversation: row.price_per_conversation != null ? parseFloat(row.price_per_conversation) : 0,
    systemPrompt: row.system_prompt || '',
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

// Map camelCase field names to snake_case column names
const TENANT_FIELD_MAP = {
  name: 'name',
  businessType: 'business_type',
  services: 'services',
  ownerName: 'owner_name',
  workingHours: 'working_hours',
  bookingInstructions: 'booking_instructions',
  customFirstReply: 'custom_first_reply',
  slangWords: 'slang_words',
  websiteLinks: 'website_links',
  igPageId: 'ig_page_id',
  igAccessToken: 'ig_access_token',
  botActive: 'bot_active',
  phone: 'phone',
  instagram: 'instagram',
  notes: 'notes',
  voiceGreeting: 'voice_greeting',
  voiceEnergy: 'voice_energy',
  voicePhrases: 'voice_phrases',
  voicePhrasesMale: 'voice_phrases_male',
  voicePhrasesFemale: 'voice_phrases_female',
  voiceEmoji: 'voice_emoji',
  voiceLength: 'voice_length',
  voiceHumor: 'voice_humor',
  voiceExamples: 'voice_examples',
  voiceAvoid: 'voice_avoid',
  voicePersonality: 'voice_personality',
  voiceImportMeta: 'voice_import_meta',
  botGender: 'bot_gender',
  customFlowInstructions: 'custom_flow_instructions',
  ignoreList: 'ignore_list',
  triggerWords: 'trigger_words',
  monthlyPayment: 'monthly_payment',
  paymentStatus: 'payment_status',
  manychatConnected: 'manychat_connected',
  lastApiCall: 'last_api_call',
  status: 'status',
  aiTemperature: 'ai_temperature',
  wizardCompleted: 'wizard_completed',
  ctaPushLevel: 'cta_push_level',
  ctaType: 'cta_type',
  ownerPhone: 'owner_phone',
  ctaCustomText: 'cta_custom_text',
  conversationStrategy: 'conversation_strategy',
  delayConfig: 'delay_config',
  botGoal: 'bot_goal',
  maxBotMessages: 'max_bot_messages',
  polarCustomerId: 'polar_customer_id',
  polarSubscriptionId: 'polar_subscription_id',
  trialEndsAt: 'trial_ends_at',
  subscriptionEndsAt: 'subscription_ends_at',
  billingModel: 'billing_model',
  pricePerConversation: 'price_per_conversation',
  systemPrompt: 'system_prompt',
};

export async function getTenant(id) {
  const result = await query('SELECT * FROM tenants WHERE id = $1', [id]);
  return rowToTenant(result.rows[0]) || null;
}

export async function getTenantByIgPageId(igPageId) {
  const result = await query(
    'SELECT * FROM tenants WHERE ig_page_id = $1 ORDER BY created_at DESC LIMIT 1',
    [igPageId]
  );
  return rowToTenant(result.rows[0]) || null;
}

export async function updateTenant(id, fields) {
  // Build SET clause dynamically from provided fields
  const setClauses = [];
  const values = [];
  let paramIndex = 1;

  const JSONB_FIELDS = new Set(['trigger_words', 'conversation_strategy', 'delay_config', 'voice_import_meta']);
  for (const [camelKey, value] of Object.entries(fields)) {
    const snakeKey = TENANT_FIELD_MAP[camelKey];
    if (snakeKey) {
      if (JSONB_FIELDS.has(snakeKey) && typeof value !== 'string') {
        setClauses.push(`${snakeKey} = $${paramIndex}::jsonb`);
        values.push(JSON.stringify(value));
      } else {
        setClauses.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
      }
      paramIndex++;
    }
  }

  if (setClauses.length === 0) return await getTenant(id);

  values.push(id);
  const result = await query(
    `UPDATE tenants SET ${setClauses.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );
  return rowToTenant(result.rows[0]) || null;
}

export async function getAllTenants() {
  const result = await query('SELECT * FROM tenants ORDER BY created_at');
  return result.rows.map(rowToTenant);
}

export async function deleteTenantAndData(tenantId) {
  // Tables without FK cascade — must delete explicitly
  await query('DELETE FROM knowledge_base WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM qa_issues WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM conversation_grades WHERE tenant_id = $1', [tenantId]);
  await query('DELETE FROM golden_examples WHERE tenant_id = $1', [tenantId]);
  // Delete user accounts linked to this tenant
  const userResult = await query('SELECT email FROM users WHERE tenant_id = $1', [tenantId]);
  for (const row of userResult.rows) {
    await query('DELETE FROM sessions WHERE email = $1', [row.email]);
  }
  await query('DELETE FROM users WHERE tenant_id = $1', [tenantId]);
  // Delete the tenant (cascades to messages, leads, api_usage, conversation_outcomes)
  const result = await query('DELETE FROM tenants WHERE id = $1', [tenantId]);
  return result.rowCount > 0;
}

// --- Conversations ---

export async function getConversationHistory(tenantId, userId, limit = 20) {
  const result = await query(
    `SELECT role, content, created_at as timestamp
     FROM messages
     WHERE tenant_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [tenantId, userId, limit]
  );
  // Reverse to get chronological order (we queried DESC for LIMIT efficiency)
  return result.rows.reverse().map(r => ({
    role: r.role,
    content: r.content,
    timestamp: r.timestamp?.toISOString?.() || r.timestamp,
  }));
}

export async function saveMessage(tenantId, userId, role, content) {
  await query(
    `INSERT INTO messages (tenant_id, user_id, role, content) VALUES ($1, $2, $3, $4)`,
    [tenantId, userId, role, content]
  );
  // Keep last 100 messages per conversation
  await query(
    `DELETE FROM messages WHERE id IN (
      SELECT id FROM messages
      WHERE tenant_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      OFFSET 100
    )`,
    [tenantId, userId]
  );
}

// --- Leads ---

export async function getOrCreateLead(tenantId, userId) {
  // Try to get existing lead
  const existing = await query(
    'SELECT * FROM leads WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  if (existing.rows[0]) return rowToLead(existing.rows[0]);

  // Create new lead
  const result = await query(
    `INSERT INTO leads (tenant_id, user_id, name, interest, qualification_score, status, booking_link_sent, gathered, entry_type, current_step)
     VALUES ($1, $2, NULL, NULL, 0, 'new', false, '{}', 'unknown', 'opening')
     ON CONFLICT (tenant_id, user_id) DO NOTHING
     RETURNING *`,
    [tenantId, userId]
  );
  // Handle race condition — if ON CONFLICT hit, re-fetch
  if (result.rows[0]) return rowToLead(result.rows[0]);
  const refetch = await query(
    'SELECT * FROM leads WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  return rowToLead(refetch.rows[0]);
}

function rowToLead(row) {
  if (!row) return null;
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    name: row.name,
    instagramName: row.instagram_name,
    instagramUsername: row.instagram_username,
    interest: row.interest,
    qualificationScore: row.qualification_score,
    status: row.status,
    bookingLinkSent: row.booking_link_sent,
    gender: row.gender,
    genderLocked: row.gender_locked || false,
    intent: row.intent,
    gathered: typeof row.gathered === 'string' ? JSON.parse(row.gathered) : (row.gathered || {}),
    entryType: row.entry_type || 'unknown',
    currentStep: row.current_step || 'opening',
    conversationMode: row.conversation_mode || null,
    needsHuman: row.needs_human || false,
    needsHumanReason: row.needs_human_reason || null,
    ignored: row.ignored || false,
    historySynced: row.history_synced || false,
    historySyncedAt: row.history_synced_at?.toISOString?.() || row.history_synced_at,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

export async function getLeadIfExists(tenantId, userId) {
  const result = await query(
    'SELECT * FROM leads WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  return rowToLead(result.rows[0]);
}

export async function updateLead(tenantId, userId, fields) {
  // Ensure lead exists
  await getOrCreateLead(tenantId, userId);

  const LEAD_FIELD_MAP = {
    name: 'name',
    instagramName: 'instagram_name',
    instagramUsername: 'instagram_username',
    interest: 'interest',
    qualificationScore: 'qualification_score',
    status: 'status',
    bookingLinkSent: 'booking_link_sent',
    gender: 'gender',
    intent: 'intent',
    gathered: 'gathered',
    entryType: 'entry_type',
    currentStep: 'current_step',
    conversationMode: 'conversation_mode',
    ignored: 'ignored',
    genderLocked: 'gender_locked',
    needsHuman: 'needs_human',
    needsHumanReason: 'needs_human_reason',
    historySynced: 'history_synced',
    historySyncedAt: 'history_synced_at',
  };

  const setClauses = ['updated_at = NOW()'];
  const values = [];
  let paramIndex = 1;

  for (const [camelKey, value] of Object.entries(fields)) {
    const snakeKey = LEAD_FIELD_MAP[camelKey];
    if (snakeKey) {
      setClauses.push(`${snakeKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  values.push(tenantId, userId);
  const result = await query(
    `UPDATE leads SET ${setClauses.join(', ')}
     WHERE tenant_id = $${paramIndex} AND user_id = $${paramIndex + 1}
     RETURNING *`,
    values
  );
  return rowToLead(result.rows[0]);
}

export async function getLeadsByTenant(tenantId) {
  const result = await query(
    'SELECT * FROM leads WHERE tenant_id = $1 ORDER BY updated_at DESC',
    [tenantId]
  );
  return result.rows.map(rowToLead);
}

export async function clearConversation(tenantId, userId) {
  const result = await query(
    'DELETE FROM messages WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  return result.rowCount > 0;
}

// --- Knowledge Base ---

function rowToKbEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    category: row.category,
    title: row.title,
    content: row.content,
    addedBy: row.added_by,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    updatedAt: row.updated_at?.toISOString?.() || row.updated_at,
  };
}

export async function addKnowledgeEntry(entry, tenantId = '__global__') {
  const id = `kb_${crypto.randomUUID()}`;
  const result = await query(
    `INSERT INTO knowledge_base (id, tenant_id, category, title, content, added_by)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [id, tenantId, entry.category || 'general', entry.title || '', entry.content || '', entry.addedBy || '']
  );
  return rowToKbEntry(result.rows[0]);
}

export async function getKnowledgeEntries(category) {
  let sql = "SELECT * FROM knowledge_base WHERE tenant_id = '__global__'";
  const params = [];
  if (category) {
    sql += ' AND category = $1';
    params.push(category);
  }
  sql += ' ORDER BY created_at';
  const result = await query(sql, params);
  return result.rows.map(rowToKbEntry);
}

export async function getKnowledgeEntriesForTenant(tenantId, category) {
  let sql = "SELECT * FROM knowledge_base WHERE (tenant_id = '__global__' OR tenant_id = $1)";
  const params = [tenantId];
  if (category) {
    sql += ' AND category = $2';
    params.push(category);
  }
  sql += ' ORDER BY created_at';
  const result = await query(sql, params);
  return result.rows.map(rowToKbEntry);
}

export async function getTenantKnowledgeEntries(tenantId, category) {
  let sql = 'SELECT * FROM knowledge_base WHERE tenant_id = $1';
  const params = [tenantId];
  if (category) {
    sql += ' AND category = $2';
    params.push(category);
  }
  sql += ' ORDER BY created_at';
  const result = await query(sql, params);
  return result.rows.map(rowToKbEntry);
}

export async function deleteKnowledgeEntry(id, tenantId = null) {
  let sql = 'DELETE FROM knowledge_base WHERE id = $1';
  const params = [id];
  if (tenantId) {
    sql += ' AND tenant_id = $2';
    params.push(tenantId);
  }
  const result = await query(sql, params);
  return result.rowCount > 0;
}

export async function updateKnowledgeEntry(id, fields, tenantId = null) {
  const setClauses = ['updated_at = NOW()'];
  const values = [];
  let paramIndex = 1;

  const KB_FIELD_MAP = {
    category: 'category',
    title: 'title',
    content: 'content',
    addedBy: 'added_by',
  };

  for (const [camelKey, value] of Object.entries(fields)) {
    const snakeKey = KB_FIELD_MAP[camelKey];
    if (snakeKey) {
      setClauses.push(`${snakeKey} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }
  }

  values.push(id);
  let sql = `UPDATE knowledge_base SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;
  if (tenantId) {
    paramIndex++;
    values.push(tenantId);
    sql += ` AND tenant_id = $${paramIndex}`;
  }
  sql += ' RETURNING *';
  const result = await query(sql, values);
  return rowToKbEntry(result.rows[0]) || null;
}

// --- RAG: Semantic Search (JSONB embeddings + JS cosine similarity) ---

function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export async function searchKnowledgeByEmbedding(tenantId, queryEmbedding, topK = 5) {
  // Fetch all KB entries for this tenant in one query
  const result = await query(
    `SELECT * FROM knowledge_base
     WHERE (tenant_id = '__global__' OR tenant_id = $1)
     ORDER BY created_at`,
    [tenantId]
  );

  const priority = [];
  const withEmbedding = [];
  const unembedded = [];

  for (const row of result.rows) {
    const entry = rowToKbEntry(row);
    if (entry.category === 'corrections' || entry.category === 'rules') {
      priority.push(entry);
    } else if (row.embedding) {
      const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
      const similarity = cosineSimilarity(queryEmbedding, emb);
      withEmbedding.push({ ...entry, similarity, distance: 1 - similarity });
    } else {
      unembedded.push(entry);
    }
  }

  // Sort by similarity descending, take top-K
  withEmbedding.sort((a, b) => b.similarity - a.similarity);
  const semantic = withEmbedding.slice(0, topK);

  return { priority, semantic, unembedded };
}

export async function updateKnowledgeEmbedding(id, embedding) {
  await query(
    `UPDATE knowledge_base SET embedding = $1::jsonb, embedding_stale = false WHERE id = $2`,
    [JSON.stringify(embedding), id]
  );
}

export async function getStaleKnowledgeEntries() {
  const result = await query(
    `SELECT * FROM knowledge_base WHERE embedding_stale = true OR embedding IS NULL ORDER BY created_at`
  );
  return result.rows.map(rowToKbEntry);
}

export async function markEmbeddingStale(id) {
  await query(
    `UPDATE knowledge_base SET embedding_stale = true WHERE id = $1`,
    [id]
  );
}

// --- Users ---

export async function createUserRecord(email, passwordHash, tenantId) {
  const id = `user_${crypto.randomUUID()}`;
  const result = await query(
    `INSERT INTO users (id, email, password_hash, tenant_id) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, email, passwordHash, tenantId]
  );
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    tenantId: row.tenant_id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

export async function getUserByEmail(email) {
  const result = await query('SELECT * FROM users WHERE email = $1', [email]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    tenantId: row.tenant_id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

export async function getAllUsers() {
  const result = await query(
    'SELECT id, email, tenant_id, created_at FROM users ORDER BY created_at'
  );
  return result.rows.map(row => ({
    id: row.id,
    email: row.email,
    tenantId: row.tenant_id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  }));
}

export async function getUserEmailByTenantId(tenantId) {
  const result = await query('SELECT email FROM users WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  return result.rows[0]?.email || null;
}

export async function updateUserTenant(email, newTenantId) {
  const result = await query(
    'UPDATE users SET tenant_id = $1 WHERE email = $2 RETURNING *',
    [newTenantId, email]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    tenantId: row.tenant_id,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

export async function updateSessionsTenant(email, newTenantId) {
  await query(
    'UPDATE sessions SET tenant_id = $1 WHERE email = $2',
    [newTenantId, email]
  );
}

// --- Sessions ---

export async function saveSessionRecord(sessionId, data) {
  await query(
    `INSERT INTO sessions (id, email, tenant_id, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       email = EXCLUDED.email,
       tenant_id = EXCLUDED.tenant_id,
       expires_at = EXCLUDED.expires_at`,
    [sessionId, data.email, data.tenantId, data.createdAt, data.expiresAt]
  );
}

export async function getSessionRecord(sessionId) {
  const result = await query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    email: row.email,
    tenantId: row.tenant_id,
    impersonatingTenantId: row.impersonating_tenant_id || null,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
    expiresAt: row.expires_at?.toISOString?.() || row.expires_at,
  };
}

export async function setImpersonation(sessionId, tenantId) {
  await query(
    'UPDATE sessions SET impersonating_tenant_id = $1 WHERE id = $2',
    [tenantId, sessionId]
  );
}

export async function deleteSessionRecord(sessionId) {
  await query('DELETE FROM sessions WHERE id = $1', [sessionId]);
}

export async function deleteSessionsByEmail(email) {
  const result = await query('DELETE FROM sessions WHERE email = $1', [email]);
  return result.rowCount;
}

export async function cleanupExpiredSessions() {
  const result = await query('DELETE FROM sessions WHERE expires_at < NOW()');
  return result.rowCount;
}

// --- API Usage Tracking ---

export async function recordApiUsage(tenantId, operation, promptTokens, completionTokens, totalTokens, costUsd, model) {
  await query(
    `INSERT INTO api_usage (tenant_id, operation, prompt_tokens, completion_tokens, total_tokens, cost_usd, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [tenantId, operation, promptTokens, completionTokens, totalTokens, costUsd, model]
  );
}

export async function getUsageSummaryByTenant(since = null) {
  const sinceDate = since || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const result = await query(
    `SELECT tenant_id,
            COUNT(*) as call_count,
            SUM(prompt_tokens) as total_prompt_tokens,
            SUM(completion_tokens) as total_completion_tokens,
            SUM(total_tokens) as total_tokens,
            SUM(cost_usd) as total_cost_usd
     FROM api_usage
     WHERE created_at >= $1
     GROUP BY tenant_id
     ORDER BY total_cost_usd DESC`,
    [sinceDate.toISOString()]
  );
  return result.rows.map(r => ({
    tenantId: r.tenant_id,
    callCount: parseInt(r.call_count),
    promptTokens: parseInt(r.total_prompt_tokens),
    completionTokens: parseInt(r.total_completion_tokens),
    totalTokens: parseInt(r.total_tokens),
    costUsd: parseFloat(r.total_cost_usd),
  }));
}

export async function getPlatformUsageSummary(since = null) {
  const sinceDate = since || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const result = await query(
    `SELECT COUNT(*) as call_count,
            SUM(prompt_tokens) as total_prompt_tokens,
            SUM(completion_tokens) as total_completion_tokens,
            SUM(total_tokens) as total_tokens,
            SUM(cost_usd) as total_cost_usd
     FROM api_usage
     WHERE created_at >= $1`,
    [sinceDate.toISOString()]
  );
  const r = result.rows[0];
  return {
    callCount: parseInt(r.call_count || 0),
    promptTokens: parseInt(r.total_prompt_tokens || 0),
    completionTokens: parseInt(r.total_completion_tokens || 0),
    totalTokens: parseInt(r.total_tokens || 0),
    costUsd: parseFloat(r.total_cost_usd || 0),
  };
}

// --- Billing Usage ---

export async function getConversationCountByTenant(tenantId, since = null) {
  const sinceDate = since || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const result = await query(
    `SELECT COUNT(DISTINCT user_id) as conversation_count,
            COUNT(*) as message_count
     FROM messages
     WHERE tenant_id = $1 AND role = 'user' AND created_at >= $2`,
    [tenantId, sinceDate.toISOString()]
  );
  const r = result.rows[0];
  return {
    conversationCount: parseInt(r.conversation_count || 0),
    messageCount: parseInt(r.message_count || 0),
  };
}

// --- Conversation Outcomes (Self-Learning) ---

export async function upsertOutcome(tenantId, userId, fields) {
  const now = new Date().toISOString();
  // Try insert first, then update on conflict
  const result = await query(`
    INSERT INTO conversation_outcomes (tenant_id, user_id, first_message_at, created_at, updated_at)
    VALUES ($1, $2, $3, $3, $3)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET updated_at = $3
    RETURNING *
  `, [tenantId, userId, now]);

  if (fields && Object.keys(fields).length > 0) {
    const FIELD_MAP = {
      outcome: 'outcome', closeReason: 'close_reason',
      firstMessageAt: 'first_message_at', lastMessageAt: 'last_message_at',
      outcomeAt: 'outcome_at', userMessageCount: 'user_message_count',
      botMessageCount: 'bot_message_count', totalMessages: 'total_messages',
      finalScore: 'final_score', finalMode: 'final_mode',
      finalEntryType: 'final_entry_type', bookingLinkSent: 'booking_link_sent',
      lastStep: 'last_step', dropOffAfterStep: 'drop_off_after_step',
      promptVersion: 'prompt_version',
    };
    const setClauses = ['updated_at = NOW()'];
    const values = [];
    let idx = 1;
    for (const [camel, val] of Object.entries(fields)) {
      const col = FIELD_MAP[camel];
      if (col) {
        setClauses.push(`${col} = $${idx}`);
        values.push(val);
        idx++;
      }
    }
    if (values.length > 0) {
      values.push(tenantId, userId);
      await query(
        `UPDATE conversation_outcomes SET ${setClauses.join(', ')}
         WHERE tenant_id = $${idx} AND user_id = $${idx + 1}`,
        values
      );
    }
  }
  return result.rows[0];
}

export async function getOutcome(tenantId, userId) {
  const result = await query(
    'SELECT * FROM conversation_outcomes WHERE tenant_id = $1 AND user_id = $2',
    [tenantId, userId]
  );
  return result.rows[0] || null;
}

export async function getActiveOutcomes(olderThanHours = 48) {
  const result = await query(`
    SELECT co.*, l.qualification_score, l.booking_link_sent as lead_bls,
           l.current_step, l.conversation_mode, l.entry_type
    FROM conversation_outcomes co
    JOIN leads l ON co.tenant_id = l.tenant_id AND co.user_id = l.user_id
    WHERE co.outcome = 'active'
      AND co.last_message_at < NOW() - INTERVAL '${Math.floor(olderThanHours)} hours'
  `);
  return result.rows;
}

export async function getOutcomeStats(tenantId = null) {
  const where = tenantId ? 'WHERE tenant_id = $1' : '';
  const params = tenantId ? [tenantId] : [];
  const result = await query(`
    SELECT outcome, COUNT(*) as count,
           AVG(total_messages) as avg_messages,
           AVG(final_score) as avg_score
    FROM conversation_outcomes
    ${where}
    GROUP BY outcome
    ORDER BY count DESC
  `, params);
  return result.rows.map(r => ({
    outcome: r.outcome,
    count: parseInt(r.count),
    avgMessages: parseFloat(r.avg_messages || 0).toFixed(1),
    avgScore: parseFloat(r.avg_score || 0).toFixed(1),
  }));
}

export async function getOutcomeStatsByTenant() {
  const result = await query(`
    SELECT co.tenant_id, t.name as tenant_name,
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE co.outcome = 'converted') as converted,
           COUNT(*) FILTER (WHERE co.outcome = 'dropped') as dropped,
           COUNT(*) FILTER (WHERE co.outcome = 'active') as active,
           AVG(co.total_messages) as avg_messages
    FROM conversation_outcomes co
    JOIN tenants t ON co.tenant_id = t.id
    GROUP BY co.tenant_id, t.name
    ORDER BY total DESC
  `);
  return result.rows.map(r => ({
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    total: parseInt(r.total),
    converted: parseInt(r.converted),
    dropped: parseInt(r.dropped),
    active: parseInt(r.active),
    avgMessages: parseFloat(r.avg_messages || 0).toFixed(1),
    conversionRate: r.total > 0 ? ((parseInt(r.converted) / parseInt(r.total)) * 100).toFixed(1) : '0.0',
  }));
}

// --- QA Issues Persistence ---

export async function recordQAIssue(tenantId, userId, issueType, severity, detail, replySnippet) {
  await query(
    `INSERT INTO qa_issues (tenant_id, user_id, issue_type, severity, detail, reply_snippet)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [tenantId, userId, issueType, severity, detail || null, replySnippet || null]
  );
}

export async function getQAIssueSummary(tenantId = null, since = null) {
  const sinceDate = since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // last 30 days
  const where = tenantId
    ? 'WHERE tenant_id = $1 AND created_at >= $2'
    : 'WHERE created_at >= $1';
  const params = tenantId ? [tenantId, sinceDate.toISOString()] : [sinceDate.toISOString()];
  const result = await query(`
    SELECT issue_type, severity, COUNT(*) as count
    FROM qa_issues
    ${where}
    GROUP BY issue_type, severity
    ORDER BY count DESC
  `, params);
  return result.rows.map(r => ({
    issueType: r.issue_type,
    severity: r.severity,
    count: parseInt(r.count),
  }));
}

export async function getRecentQAIssues(limit = 50) {
  const result = await query(`
    SELECT qi.*, t.name as tenant_name
    FROM qa_issues qi
    LEFT JOIN tenants t ON qi.tenant_id = t.id
    ORDER BY qi.created_at DESC
    LIMIT $1
  `, [limit]);
  return result.rows.map(r => ({
    id: r.id,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    userId: r.user_id,
    issueType: r.issue_type,
    severity: r.severity,
    detail: r.detail,
    replySnippet: r.reply_snippet,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
  }));
}

// --- Conversation Grades (Phase 2) ---

export async function saveGrade(tenantId, userId, grade) {
  await query(`
    INSERT INTO conversation_grades (tenant_id, user_id, outcome, naturalness, hebrew_quality,
      goal_achievement, customer_satisfaction, flow_quality, overall_score, strengths, weaknesses)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (tenant_id, user_id) DO UPDATE SET
      outcome = EXCLUDED.outcome, naturalness = EXCLUDED.naturalness, hebrew_quality = EXCLUDED.hebrew_quality,
      goal_achievement = EXCLUDED.goal_achievement, customer_satisfaction = EXCLUDED.customer_satisfaction,
      flow_quality = EXCLUDED.flow_quality, overall_score = EXCLUDED.overall_score,
      strengths = EXCLUDED.strengths, weaknesses = EXCLUDED.weaknesses, graded_at = NOW()
  `, [tenantId, userId, grade.outcome, grade.naturalness, grade.hebrewQuality,
      grade.goalAchievement, grade.customerSatisfaction, grade.flowQuality,
      grade.overallScore, grade.strengths, grade.weaknesses]);
}

export async function getUngradedOutcomes(limit = 20) {
  const result = await query(`
    SELECT co.tenant_id, co.user_id, co.outcome, co.total_messages,
           co.final_score, co.final_mode, co.final_entry_type
    FROM conversation_outcomes co
    LEFT JOIN conversation_grades cg ON co.tenant_id = cg.tenant_id AND co.user_id = cg.user_id
    WHERE co.outcome != 'active' AND cg.id IS NULL AND co.total_messages >= 3
    ORDER BY co.outcome_at DESC NULLS LAST
    LIMIT $1
  `, [limit]);
  return result.rows;
}

export async function getGradeStats() {
  const result = await query(`
    SELECT COUNT(*) as total,
           AVG(overall_score) as avg_score,
           AVG(naturalness) as avg_naturalness,
           AVG(hebrew_quality) as avg_hebrew,
           COUNT(*) FILTER (WHERE overall_score >= 4) as high_quality
    FROM conversation_grades
  `);
  const r = result.rows[0];
  return {
    total: parseInt(r.total || 0),
    avgScore: parseFloat(r.avg_score || 0).toFixed(2),
    avgNaturalness: parseFloat(r.avg_naturalness || 0).toFixed(2),
    avgHebrew: parseFloat(r.avg_hebrew || 0).toFixed(2),
    highQuality: parseInt(r.high_quality || 0),
  };
}

// --- Golden Examples (Phase 2) ---

export async function saveGoldenExample(example) {
  await query(`
    INSERT INTO golden_examples (id, tenant_id, situation, user_message, bot_reply,
      entry_type, conversation_mode, lead_score_before, lead_score_after,
      grade_overall, status, embedding_stale)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true)
    ON CONFLICT (id) DO NOTHING
  `, [example.id, example.tenantId, example.situation, example.userMessage,
      example.botReply, example.entryType || null, example.conversationMode || null,
      example.leadScoreBefore || null, example.leadScoreAfter || null,
      example.gradeOverall || null, example.status || 'pending']);
}

export async function getGoldenExamples(status = null, tenantId = null) {
  let sql = 'SELECT * FROM golden_examples WHERE 1=1';
  const params = [];
  let idx = 1;
  if (status) { sql += ` AND status = $${idx}`; params.push(status); idx++; }
  if (tenantId) { sql += ` AND tenant_id = $${idx}`; params.push(tenantId); idx++; }
  sql += ' ORDER BY created_at DESC';
  const result = await query(sql, params);
  return result.rows.map(rowToGoldenExample);
}

export async function updateGoldenExampleStatus(id, status) {
  const result = await query(
    'UPDATE golden_examples SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  return result.rows[0] ? rowToGoldenExample(result.rows[0]) : null;
}

export async function incrementGoldenUsage(id) {
  await query('UPDATE golden_examples SET times_used = times_used + 1 WHERE id = $1', [id]);
}

export async function searchGoldenByEmbedding(queryEmbedding, conversationMode = null, limit = 3) {
  let sql = "SELECT * FROM golden_examples WHERE status = 'approved' AND embedding IS NOT NULL";
  const params = [];
  let idx = 1;
  if (conversationMode) {
    sql += ` AND (conversation_mode = $${idx} OR conversation_mode IS NULL)`;
    params.push(conversationMode);
    idx++;
  }
  const result = await query(sql, params);

  // Compute similarity in JS (same pattern as KB RAG search)
  const scored = result.rows.map(row => {
    const emb = typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding;
    const sim = cosineSimilarity(queryEmbedding, emb);
    return { ...rowToGoldenExample(row), similarity: sim };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}

export async function updateGoldenEmbedding(id, embedding) {
  await query(
    'UPDATE golden_examples SET embedding = $1::jsonb, embedding_stale = false WHERE id = $2',
    [JSON.stringify(embedding), id]
  );
}

export async function getStaleGoldenExamples() {
  const result = await query(
    "SELECT * FROM golden_examples WHERE (embedding_stale = true OR embedding IS NULL) AND status = 'approved'"
  );
  return result.rows.map(rowToGoldenExample);
}

export async function getPendingGoldenCount() {
  const result = await query("SELECT COUNT(*) as count FROM golden_examples WHERE status = 'pending'");
  return parseInt(result.rows[0].count || 0);
}

function rowToGoldenExample(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    situation: row.situation,
    userMessage: row.user_message,
    botReply: row.bot_reply,
    entryType: row.entry_type,
    conversationMode: row.conversation_mode,
    leadScoreBefore: row.lead_score_before,
    leadScoreAfter: row.lead_score_after,
    gradeOverall: row.grade_overall ? parseFloat(row.grade_overall) : null,
    status: row.status,
    timesUsed: row.times_used || 0,
    createdAt: row.created_at?.toISOString?.() || row.created_at,
  };
}

// --- Seed ---

export async function seedTestTenant() {
  const existing = await getTenant('test');
  if (!existing) {
    await createTenant({
      id: 'test',
      name: 'העסק שלי',
      businessType: 'ייעוץ עסקי',
      services: 'ייעוץ עסקי, אסטרטגיה שיווקית, ליווי צמיחה',
      ownerName: 'יובל',
      workingHours: 'א-ה 9:00-18:00',
      bookingInstructions: 'לקביעת שיחת היכרות: https://cal.com/your-link',
    });
    console.log('Seeded test tenant (PostgreSQL)');
  }
}
