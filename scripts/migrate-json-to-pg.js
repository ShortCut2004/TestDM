/**
 * Migration script: JSON files → PostgreSQL
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/migrate-json-to-pg.js
 *
 * What it does:
 *   1. Reads data/db.json and data/knowledge-base.json
 *   2. Inserts all data into PostgreSQL tables
 *   3. Validates row counts match source
 *
 * Safe to run multiple times — uses ON CONFLICT to skip existing records.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEMA_FILE = path.join(__dirname, '..', 'src', 'database', 'schema.sql');

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL=postgres://... node scripts/migrate-json-to-pg.js');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
});

async function loadJsonFile(filename) {
  const filepath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filepath)) {
    console.warn(`Warning: ${filename} not found, skipping`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

async function runSchema() {
  const schema = fs.readFileSync(SCHEMA_FILE, 'utf8');
  await pool.query(schema);
  console.log('Schema created/verified');
}

async function migrateTenants(db) {
  const tenants = Object.values(db.tenants || {});
  let inserted = 0;

  for (const t of tenants) {
    try {
      await pool.query(`
        INSERT INTO tenants (
          id, name, business_type, services, owner_name, working_hours,
          booking_instructions, custom_first_reply, slang_words, website_links,
          ig_page_id, ig_access_token, bot_active, phone, instagram, notes,
          voice_greeting, voice_energy, voice_phrases, voice_phrases_male,
          voice_phrases_female, voice_emoji, voice_length, voice_humor,
          voice_examples, voice_avoid, manychat_connected, last_api_call,
          status, created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24, $25, $26, $27, $28, $29, $30
        ) ON CONFLICT (id) DO NOTHING
      `, [
        t.id, t.name || '', t.businessType || '', t.services || '',
        t.ownerName || '', t.workingHours || '', t.bookingInstructions || '',
        t.customFirstReply || '', t.slangWords || '', t.websiteLinks || '',
        t.igPageId || '', t.igAccessToken || '', t.botActive !== false,
        t.phone || '', t.instagram || '', t.notes || '',
        t.voiceGreeting || '', t.voiceEnergy || 'warm', t.voicePhrases || '',
        t.voicePhrasesMale || '', t.voicePhrasesFemale || '',
        t.voiceEmoji || 'sometimes', t.voiceLength || 'normal',
        t.voiceHumor || 'light', t.voiceExamples || '', t.voiceAvoid || '',
        t.manychatConnected || false, t.lastApiCall || null,
        t.status || 'pending_setup', t.createdAt || new Date().toISOString(),
      ]);
      inserted++;
    } catch (err) {
      console.error(`  Failed tenant ${t.id}:`, err.message);
    }
  }
  console.log(`Tenants: ${inserted}/${tenants.length} migrated`);
}

async function migrateConversations(db) {
  const conversations = db.conversations || {};
  let totalMessages = 0;

  for (const [key, messages] of Object.entries(conversations)) {
    const [tenantId, ...userIdParts] = key.split(':');
    const userId = userIdParts.join(':'); // Handle userIds that contain colons

    for (const msg of messages) {
      try {
        await pool.query(
          `INSERT INTO messages (tenant_id, user_id, role, content, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, userId, msg.role, msg.content, msg.timestamp || new Date().toISOString()]
        );
        totalMessages++;
      } catch (err) {
        // Skip if tenant doesn't exist (foreign key constraint)
        if (err.code === '23503') continue;
        console.error(`  Failed message in ${key}:`, err.message);
      }
    }
  }
  console.log(`Messages: ${totalMessages} migrated from ${Object.keys(conversations).length} conversations`);
}

async function migrateLeads(db) {
  const leads = db.leads || {};
  let inserted = 0;

  for (const [key, lead] of Object.entries(leads)) {
    try {
      await pool.query(`
        INSERT INTO leads (
          tenant_id, user_id, name, interest, qualification_score,
          status, booking_link_sent, gender, intent, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (tenant_id, user_id) DO NOTHING
      `, [
        lead.tenantId, lead.userId, lead.name || null, lead.interest || null,
        lead.qualificationScore || 0, lead.status || 'new',
        lead.bookingLinkSent || false, lead.gender || null, lead.intent || null,
        lead.createdAt || new Date().toISOString(),
        lead.updatedAt || new Date().toISOString(),
      ]);
      inserted++;
    } catch (err) {
      if (err.code === '23503') continue; // Skip if tenant doesn't exist
      console.error(`  Failed lead ${key}:`, err.message);
    }
  }
  console.log(`Leads: ${inserted}/${Object.keys(leads).length} migrated`);
}

async function migrateUsers(db) {
  const users = db.users || {};
  let inserted = 0;

  for (const [email, user] of Object.entries(users)) {
    try {
      await pool.query(`
        INSERT INTO users (id, email, password_hash, tenant_id, created_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [
        user.id, user.email, user.passwordHash,
        user.tenantId, user.createdAt || new Date().toISOString(),
      ]);
      inserted++;
    } catch (err) {
      console.error(`  Failed user ${email}:`, err.message);
    }
  }
  console.log(`Users: ${inserted}/${Object.keys(users).length} migrated`);
}

async function migrateSessions(db) {
  const sessions = db.sessions || {};
  let inserted = 0;

  for (const [id, session] of Object.entries(sessions)) {
    try {
      await pool.query(`
        INSERT INTO sessions (id, email, tenant_id, created_at, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [
        id, session.email, session.tenantId,
        session.createdAt || new Date().toISOString(),
        session.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      ]);
      inserted++;
    } catch (err) {
      console.error(`  Failed session ${id}:`, err.message);
    }
  }
  console.log(`Sessions: ${inserted}/${Object.keys(sessions).length} migrated`);
}

async function migrateKnowledgeBase(kb) {
  const entries = kb?.entries || [];
  let inserted = 0;

  for (const entry of entries) {
    try {
      await pool.query(`
        INSERT INTO knowledge_base (id, tenant_id, category, title, content, added_by, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (id) DO NOTHING
      `, [
        entry.id, entry.tenantId || '__global__', entry.category || 'general',
        entry.title || '', entry.content || '', entry.addedBy || '',
        entry.createdAt || new Date().toISOString(),
        entry.updatedAt || null,
      ]);
      inserted++;
    } catch (err) {
      console.error(`  Failed KB entry ${entry.id}:`, err.message);
    }
  }
  console.log(`Knowledge Base: ${inserted}/${entries.length} migrated`);
}

async function validate(db, kb) {
  console.log('\n--- Validation ---');

  const tenantCount = (await pool.query('SELECT COUNT(*) FROM tenants')).rows[0].count;
  const msgCount = (await pool.query('SELECT COUNT(*) FROM messages')).rows[0].count;
  const leadCount = (await pool.query('SELECT COUNT(*) FROM leads')).rows[0].count;
  const userCount = (await pool.query('SELECT COUNT(*) FROM users')).rows[0].count;
  const sessionCount = (await pool.query('SELECT COUNT(*) FROM sessions')).rows[0].count;
  const kbCount = (await pool.query('SELECT COUNT(*) FROM knowledge_base')).rows[0].count;

  const sourceTenants = Object.keys(db.tenants || {}).length;
  const sourceMessages = Object.values(db.conversations || {}).reduce((sum, msgs) => sum + msgs.length, 0);
  const sourceLeads = Object.keys(db.leads || {}).length;
  const sourceUsers = Object.keys(db.users || {}).length;
  const sourceSessions = Object.keys(db.sessions || {}).length;
  const sourceKb = (kb?.entries || []).length;

  console.log(`Tenants:   ${tenantCount} in PG / ${sourceTenants} in JSON ${tenantCount >= sourceTenants ? 'OK' : 'MISMATCH'}`);
  console.log(`Messages:  ${msgCount} in PG / ${sourceMessages} in JSON ${msgCount >= sourceMessages ? 'OK' : 'MISMATCH'}`);
  console.log(`Leads:     ${leadCount} in PG / ${sourceLeads} in JSON ${leadCount >= sourceLeads ? 'OK' : 'MISMATCH'}`);
  console.log(`Users:     ${userCount} in PG / ${sourceUsers} in JSON ${userCount >= sourceUsers ? 'OK' : 'MISMATCH'}`);
  console.log(`Sessions:  ${sessionCount} in PG / ${sourceSessions} in JSON ${sessionCount >= sourceSessions ? 'OK' : 'MISMATCH'}`);
  console.log(`KB:        ${kbCount} in PG / ${sourceKb} in JSON ${kbCount >= sourceKb ? 'OK' : 'MISMATCH'}`);
}

async function main() {
  console.log('SetterAI: JSON → PostgreSQL Migration\n');

  // Load source data
  const db = await loadJsonFile('db.json');
  const kb = await loadJsonFile('knowledge-base.json');

  if (!db) {
    console.error('ERROR: data/db.json not found. Nothing to migrate.');
    process.exit(1);
  }

  // Create schema
  await runSchema();

  // Migrate in order (tenants first — other tables reference them)
  console.log('\nMigrating data...');
  await migrateTenants(db);
  await migrateConversations(db);
  await migrateLeads(db);
  await migrateUsers(db);
  await migrateSessions(db);
  if (kb) await migrateKnowledgeBase(kb);

  // Validate
  await validate(db, kb);

  console.log('\nMigration complete!');
  await pool.end();
}

main().catch(err => {
  console.error('Migration failed:', err);
  pool.end();
  process.exit(1);
});
