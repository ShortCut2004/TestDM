-- SetterAI PostgreSQL Schema
-- Run this once to set up the database tables

BEGIN;

-- Tenants (businesses)
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  business_type TEXT NOT NULL DEFAULT '',
  services TEXT NOT NULL DEFAULT '',
  owner_name TEXT NOT NULL DEFAULT '',
  working_hours TEXT NOT NULL DEFAULT 'א-ה 9:00-18:00',
  booking_instructions TEXT NOT NULL DEFAULT '',
  custom_first_reply TEXT NOT NULL DEFAULT '',
  slang_words TEXT NOT NULL DEFAULT '',
  website_links TEXT NOT NULL DEFAULT '',
  ig_page_id TEXT NOT NULL DEFAULT '',
  ig_access_token TEXT NOT NULL DEFAULT '',
  bot_active BOOLEAN NOT NULL DEFAULT true,
  phone TEXT NOT NULL DEFAULT '',
  instagram TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  -- Voice profile fields
  voice_greeting TEXT NOT NULL DEFAULT '',
  voice_energy TEXT NOT NULL DEFAULT 'warm',
  voice_phrases TEXT NOT NULL DEFAULT '',
  voice_phrases_male TEXT NOT NULL DEFAULT '',
  voice_phrases_female TEXT NOT NULL DEFAULT '',
  voice_emoji TEXT NOT NULL DEFAULT 'sometimes',
  voice_length TEXT NOT NULL DEFAULT 'normal',
  voice_humor TEXT NOT NULL DEFAULT 'light',
  voice_examples TEXT NOT NULL DEFAULT '',
  voice_avoid TEXT NOT NULL DEFAULT '',
  -- AI settings
  ai_temperature REAL,
  -- Integration state
  manychat_connected BOOLEAN NOT NULL DEFAULT false,
  last_api_call TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending_setup',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages (conversation history)
CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_tenant_user_time
  ON messages (tenant_id, user_id, created_at DESC);

-- Leads (qualified contacts)
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  name TEXT,
  interest TEXT,
  qualification_score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new',
  booking_link_sent BOOLEAN NOT NULL DEFAULT false,
  gender TEXT,
  intent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);

-- Sequence system columns (added for data-driven conversation flow)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gathered JSONB DEFAULT '{}';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS entry_type TEXT DEFAULT 'unknown';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS current_step TEXT DEFAULT 'opening';

-- Instagram profile data (fetched from Graph API)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS instagram_username TEXT;

-- Gender manual override lock (prevents auto-detection from overriding dashboard edits)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS gender_locked BOOLEAN DEFAULT false;

-- Conversation mode (multi-mode engine: qualify, engage, assist, acknowledge, converse)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_mode TEXT DEFAULT NULL;

-- Needs human flag (bot escalation: pauses auto-replies until owner takes over)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_human BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_human_reason TEXT;

-- Instagram history sync (tracks if we've fetched the initial DM history from Instagram API)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS history_synced BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS history_synced_at TIMESTAMPTZ;

-- Trigger words: CTA words from bio that get fixed auto-replies
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trigger_words JSONB DEFAULT '[]';

-- Payment tracking (master admin)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS monthly_payment NUMERIC DEFAULT 0;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'unpaid';

-- Wizard completion flag (bot stays off until wizard is done)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS wizard_completed BOOLEAN DEFAULT false;

-- CTA configuration
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cta_push_level TEXT DEFAULT 'normal';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cta_type TEXT DEFAULT 'send_link';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS owner_phone TEXT DEFAULT '';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cta_custom_text TEXT DEFAULT '';

-- Conversation strategy (Wizard V4 — per-tenant conversation flow)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS conversation_strategy JSONB DEFAULT NULL;

-- Voice personality (character archetype extracted from Voice DNA)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS voice_personality TEXT DEFAULT '';

-- Voice import metadata (tracks what was analyzed, stats, version)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS voice_import_meta JSONB DEFAULT '{}';

-- Response delay configuration (per-tenant speed control)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS delay_config JSONB DEFAULT NULL;

-- Bot goal & max messages (freeflow onboarding: different bot types)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bot_goal TEXT DEFAULT 'book_calls';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS max_bot_messages INTEGER DEFAULT NULL;

-- Custom system prompt for AI microservice (RAG-based conversations)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT '';

-- AI service enable/disable toggle (default OFF - user must explicitly enable)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT false;

-- Knowledge base entries (training data, SOPs, rules)
CREATE TABLE IF NOT EXISTS knowledge_base (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT '__global__',
  category TEXT NOT NULL DEFAULT 'general',
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  added_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_kb_tenant ON knowledge_base (tenant_id);

-- RAG: embeddings for semantic search (stored as JSONB for compatibility)
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding JSONB;
ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding_stale BOOLEAN DEFAULT true;

-- Users (dashboard accounts)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  tenant_id TEXT REFERENCES tenants(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions (auth sessions)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  tenant_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions (email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Admin impersonation: allows admin to temporarily act as another tenant
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS impersonating_tenant_id TEXT;

-- AI token usage tracking (per-tenant cost monitoring)
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
);
CREATE INDEX IF NOT EXISTS idx_api_usage_tenant_time
  ON api_usage (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_created
  ON api_usage (created_at DESC);

-- Polar billing integration
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS polar_customer_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS billing_model TEXT DEFAULT 'flat';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS price_per_conversation NUMERIC DEFAULT 0;

-- Conversation outcomes (self-learning system: tracks conversion, drop-off, timing)
CREATE TABLE IF NOT EXISTS conversation_outcomes (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'active',  -- active|converted|dropped|closed_by_bot|closed_by_user
  close_reason TEXT,                        -- specific reason (farewell, disinterest, converted, etc.)
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
);
CREATE INDEX IF NOT EXISTS idx_outcomes_tenant ON conversation_outcomes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outcomes_outcome ON conversation_outcomes (outcome);

-- QA issues log (persisted for analytics, not just console.log)
CREATE TABLE IF NOT EXISTS qa_issues (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  issue_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  detail TEXT,
  reply_snippet TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_qa_issues_tenant ON qa_issues (tenant_id, created_at DESC);

-- Conversation grades (self-learning: AI evaluates conversation quality after close)
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
);

-- Golden examples (self-learning: proven conversation patterns for few-shot injection)
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
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|approved|rejected|disabled
  times_used INTEGER DEFAULT 0,
  embedding JSONB,
  embedding_stale BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_golden_status ON golden_examples (status);
CREATE INDEX IF NOT EXISTS idx_golden_tenant ON golden_examples (tenant_id);

COMMIT;
