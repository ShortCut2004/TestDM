# Typer AI - Instagram Appointment Bot Platform

## Working Style

- **Be a critical thinker.** Challenge ideas, push back when something doesn't make sense. Don't just agree — act as the smartest engineer on the team.
- **Conversation data is gold.** Instagram activity data, training datasets, and conversation history must NEVER be deleted without explicit confirmation.
- **Reliability before intelligence.** A bot that never goes silent is better than a slightly smarter bot that sometimes ghosts users.

## Project Overview

**Typer AI** is a B2B SaaS platform that provides AI-powered Instagram DM automation for Hebrew-speaking service businesses. The bot qualifies leads, books appointments, and manages conversations using advanced AI (Claude Sonnet 4.5 via OpenRouter).

- **Tech Stack**: Node.js, Express, vanilla JavaScript (no framework)
- **Database**: PostgreSQL on Railway (JSON file fallback when `DATABASE_URL` absent)
- **AI**: OpenRouter API (Claude Sonnet 4.5)
- **Integrations**: Instagram Graph API, ManyChat
- **Deployment**: Railway via GitHub auto-deploy (production at https://setterai-production.up.railway.app)
- **Repo**: https://github.com/YuviBuilds/SetterAI (private)

## Architecture

### Multi-Tenant SaaS Model
- Each business is a "tenant" with isolated data
- Session-based authentication (bcrypt + cookies)
- Tenants have their own:
  - Conversation history
  - Lead database
  - Knowledge base entries
  - Voice profile/personality settings

### Key Components

1. **Instagram DM Automation**
   - Webhook receiver for Instagram messages
   - Human-like delays (3-30s first reply, 1-10s follow-ups)
   - Bot-to-bot loop prevention
   - 3-second rate limiting per sender

2. **ManyChat Integration**
   - Dynamic Content API (v2)
   - Allows bot to work on WhatsApp/Facebook via ManyChat

3. **AI Lead Qualification**
   - 4-phase conversation strategy (Opening → Discovery → Value → Closing)
   - Lead scoring (1-10)
   - Gender detection for Hebrew language agreement
   - Intent classification (info, professional, chat)

4. **Voice Profile System**
   - Customizable bot personality
   - Energy levels (warm, chill, professional, high-energy)
   - Emoji usage preferences
   - Must-use phrases and phrases to avoid
   - Voice analyzer tool (analyzes real conversations)

## File Structure

```
src/
├── index.js              # Main Express server (~940 lines, routes only)
├── db.js                 # Database router (PG or JSON fallback)
├── ai.js                 # AI reply generation (OpenRouter)
├── instagram.js          # Instagram Graph API messaging
├── auth.js               # Authentication (bcrypt + sessions)
├── config.js             # Environment configuration
├── prompts/
│   ├── system-prompt.js  # Dynamic prompt builder
│   └── soul.md           # Core bot personality template
└── templates/            # HTML templates (extracted from index.js)
    ├── index.js          # Barrel export
    ├── utils.js          # escapeHtml helper
    ├── app.js            # Main dashboard (/app)
    ├── chat.js           # Admin test chat (/chat)
    ├── demo.js           # Sales demo (/demo)
    ├── teach.js          # Knowledge base UI (/teach)
    ├── admin.js          # Admin panel (/admin)
    ├── setup.js          # ManyChat setup (/setup/:id)
    ├── dashboard.js      # Legacy config page
    ├── master.js         # Master admin dashboard (/master-admin)
    ├── login.js          # Login page
    ├── signup.js         # Signup page
    └── error.js          # Error page

public/
├── logo.png              # Logo image
└── logo.svg              # Logo vector

data/
├── db.json               # Tenants, conversations, leads, users, sessions
└── knowledge-base.json   # Training data (SOP, FAQs, rules, corrections)

data-seed/                # Initial seed data for new deployments
railway.json              # Railway deployment config
```

## Critical Files

### `src/index.js` (Main Server, ~940 lines)
- **ALL** API routes and business logic (HTML templates extracted to `src/templates/`)
- Protected routes use `authMiddleware`
- Admin routes require `X-API-Secret` header or `?secret=` query param
- Key sections:
  - Lines 1-30: Imports and setup
  - Lines 30-130: Health, privacy/terms (Meta compliance)
  - Lines 130-330: Auth routes + Protected dashboard API (`/api/app/*`)
  - Lines 330-380: Test/demo chat API
  - Lines 380-475: ManyChat integration
  - Lines 475-605: Instagram webhook handling
  - Lines 605-820: Onboarding, OAuth, tenant management
  - Lines 820-940: Knowledge base, admin panel, server start

### `src/ai.js` (AI Brain)
- `callOpenRouter()` - Shared API call helper (single place for timeout/retry)
- `generateReply()` - Main AI response generator
- `analyzeVoice()` - Voice profile extraction
- Handles spam detection, emoji-only filtering
- Extracts lead metadata from AI responses via HTML comments

### `src/templates/app.js` (Dashboard UI)
- Main dashboard served at `/app` (authenticated)
- Tabs: Test (chat), Teach (knowledge base), Settings
- Inline vanilla JS with fetch API calls
- Hebrew RTL design

### `data/db.json` (Database)
**NEVER commit this file** - contains sensitive tenant data

Structure:
```json
{
  "tenants": { "[id]": { /* tenant config */ } },
  "conversations": { "[tenantId:userId]": [ /* messages */ ] },
  "leads": { "[tenantId:userId]": { /* lead data */ } },
  "users": { "[email]": { /* user account */ } },
  "sessions": { "[sessionId]": { /* active session */ } }
}
```

## Environment Variables

Required in `.env`:
```bash
PORT=3000
VERIFY_TOKEN=your-instagram-verify-token
API_SECRET=your-admin-secret
OPENROUTER_API_KEY=your-openrouter-key
AI_MODEL=anthropic/claude-sonnet-4.5
FB_APP_ID=your-facebook-app-id
FB_APP_SECRET=your-facebook-app-secret
BASE_URL=https://setterai-production.up.railway.app
SESSION_SECRET=your-session-secret
ADMIN_EMAIL=yuvalp0401@gmail.com
```

## Development Workflow

### Local Development
```bash
npm run dev    # Watch mode with --watch flag
npm start      # Production mode
```

### Database Management
- PostgreSQL is primary (via `DATABASE_URL` env var on Railway)
- JSON file fallback when `DATABASE_URL` is absent (local dev)
- DB router: `src/db.js` → imports `src/database/pg-db.js` or `src/db-json.js`
- Schema: `src/database/schema.sql`
- All DB functions are async, used via named exports from `src/db.js`

### Testing the Bot
1. **Dashboard test chat**: `/app` → Home → Click conversation → Test message
2. **Standalone test UI**: `/chat` (internal)
3. **Demo mode**: `/demo` (sales demos)

## Deployment (Railway + GitHub)

### Deploy Flow
GitHub repo is connected to Railway — every `git push` to `main` auto-deploys.

```bash
git add <files>
git commit -m "description"
git push                # Triggers Railway auto-deploy
```

### DO NOT use `railway up`
The Railway CLI has a bug that silently re-links to the Postgres service, deploying app code to the database and crashing it. Always use `git push` instead.

### Useful Commands
```bash
railway logs            # View deploy logs
railway status          # Check status
railway variables       # View env vars
```

### Deployment URLs
- **Production**: https://setterai-production.up.railway.app

### Health Check
Railway monitors `/health` endpoint (300s timeout).

## Important Conventions

### Hebrew-First Design
- All bot responses in Hebrew
- Gender agreement is critical (male/female addressing)
- RTL text support required
- Voice profile includes `voicePhrasesMale` and `voicePhrasesFemale`

### Safety Protocols

#### Git Commits
- **NEVER** use `--no-verify` (respects pre-commit hooks)
- **NEVER** force push to main
- Always create NEW commits (avoid `--amend` unless explicitly requested)
- Commit message format: Clear summary, detailed body, co-author tag

#### Bot Safety
- Rate limiting: 3-second cooldown per sender
- Bot-to-bot detection: Ignores messages from connected tenants
- Pause flag: Set `PAUSED=true` in config to disable all auto-replies
- Spam detection: Blocks 3+ identical messages

#### Database Safety
- PostgreSQL: all mutations go through `src/database/pg-db.js` query functions
- JSON fallback: auto-saves on every write via `saveDb()`
- Validate tenant IDs before mutations
- Session expiry: 30 days (auto-cleaned every 6 hours)

### Build Forward, Never Break Back
- When adding new features or systems, never modify existing behavior as a side effect
- New systems must be additive — if the new system fails or is disabled, the bot must behave exactly as it did before
- All learning/automation features must have kill switches (env vars)
- Kill switches: `LEARNING_ENABLED`, `GRADING_ENABLED`, `GOLDEN_INJECTION_ENABLED`

### Code Style
- ES6 modules (`import`/`export`)
- Async/await (no callbacks)
- Minimal dependencies (vanilla JS frontend)
- Comments in English, user-facing text in Hebrew

## Common Tasks

### Add a New API Endpoint
```javascript
// In src/index.js
app.get('/api/app/my-endpoint', authMiddleware, (req, res) => {
  const tenant = getTenant(req.tenantId);
  // ... logic
  res.json({ data });
});
```

### Add Knowledge Base Entry
```javascript
// Via API
POST /api/app/knowledge
{
  "category": "sop|objections|faq|tone|scripts|rules|corrections|general",
  "title": "Entry title",
  "content": "Full content"
}
```

### Update Voice Profile
```javascript
// Via API
POST /api/app/settings
{
  "voiceEnergy": "warm|chill|professional|high-energy",
  "voiceEmoji": "never|sometimes|a-lot",
  "voiceGreeting": "Custom greeting",
  "voicePhrases": "Comma,separated,phrases"
}
```

### Clear Conversation History
```javascript
POST /api/app/chat/reset
{ "userId": "instagram-user-id" }
```

### Analyze Voice from Conversations
```javascript
POST /api/app/analyze-voice
{
  "conversations": "Paste full DM conversations here..."
}
```

## UI Architecture (Wisper Design)

### Views
- **Home**: Recent conversations, voice input (placeholder)
- **Dictionary**: Voice profile terms, custom vocabulary
- **Snippets**: Knowledge base quick responses
- **Notes**: Timeline of all messages across leads
- **Chat**: Full conversation view with test input

### Settings Modal Tabs
- **General**: Business info, services, hours
- **System**: Integration status (Instagram, ManyChat)
- **Voice Profile**: Bot personality customization
- **Account**: Email, password
- **Plans & Billing**: Upgrade info

### Color Scheme
```css
--bg-base: #F5F3F0;      /* Main background */
--surface: #F0EDE8;       /* Sidebar, cards */
--text-main: #000000;     /* Primary text */
--text-muted: #6B6B6B;    /* Secondary text */
--border: rgba(0, 0, 0, 0.10);
--accent: #000000;        /* Black buttons */
```

### Fonts
- **Display/Headings**: EB Garamond (serif)
- **UI Elements**: Inter (sans-serif)

## Troubleshooting

### Bot Not Responding
1. Check `botActive` flag in tenant config
2. Verify `PAUSED` is not set to `true`
3. Check Instagram access token hasn't expired (60-day limit)
4. View logs: `railway logs`

### Instagram Token Expired
1. User must reconnect: `/connect/:tenantId`
2. Flow: OAuth → short-lived token → long-lived token (60 days)
3. Updates `igAccessToken` and `igPageId` in tenant

### Database Corruption
1. Check `data/db.json` is valid JSON
2. Restore from backup if needed
3. Use `data-seed/` for fresh start

### Rate Limiting Issues
- Instagram: Max 1000 bytes per message (we chunk at 900)
- Rate limit: 3-second cooldown per sender
- Bot-to-bot: Automatically skips messages from other bots

## Feature Roadmap (Future)

- [x] PostgreSQL migration (from JSON files) — DONE
- [ ] Real-time WebSocket updates
- [ ] Advanced analytics dashboard
- [ ] Multi-language support (English, Arabic)
- [ ] Voice input (Web Speech API)
- [ ] Team collaboration features
- [ ] Stripe billing integration
- [ ] Mobile app (React Native)

## Support & Documentation

- **Dashboard**: https://setterai-production.up.railway.app/app
- **Test Chat**: https://setterai-production.up.railway.app/chat
- **Master Admin**: https://setterai-production.up.railway.app/master-admin (admin only)
- **Privacy Policy**: https://setterai-production.up.railway.app/privacy
- **Terms of Service**: https://setterai-production.up.railway.app/terms

## Quick Reference

### Start Server
```bash
npm start
```

### Deploy to Railway
```bash
git push    # Auto-deploys via GitHub connection
```

### View Logs
```bash
railway logs
```

### Test Locally
```bash
# 1. Start server
npm run dev

# 2. Visit
http://localhost:3000/app
```

### Emergency Stop Bot
Set in `.env`:
```bash
PAUSED=true
```

---

## Notes for Claude

- **Preserve Hebrew**: All user-facing bot messages must be in Hebrew
- **Gender Agreement**: Critical for Hebrew - always respect `voicePhrasesMale`/`voicePhrasesFemale`
- **Never Skip Auth**: All dashboard routes require `authMiddleware`
- **Database**: Use async functions from `src/db.js`, never raw SQL or direct object mutation
- **Voice Profile**: The AI personality is highly customizable - respect tenant settings
- **Testing**: Use `/chat` for internal testing, don't expose to customers
- **Deployment**: `git push` to main → Railway auto-deploys. NEVER use `railway up`
- **Safety First**: Rate limits, loop prevention, and pause flags exist for a reason

**This is a production SaaS platform serving real businesses. Handle with care.** 🚀
