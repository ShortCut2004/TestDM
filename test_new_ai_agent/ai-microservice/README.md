# Instagram DM AI Microservice (ai-agent)

This is the Python AI microservice used by SetterAI for Instagram DM automation with RAG and usage/cost tracking.

It runs separately from the main Node.js app and exposes a FastAPI server (by default on port 8000).

---

## 1. Prerequisites

- Python **3.12+** (recommended: Homebrew `python@3.13` on macOS).
- Node app running separately (for full integration), but not required if you just want to hit the microservice directly.

---

## 2. First-time setup (virtualenv + install)

From the `test_new_ai_agent` directory:

```bash
cd test_new_ai_agent

# 1) Create and activate a virtualenv (PEP 668 safe)
python3 -m venv .venv
source .venv/bin/activate

# 2) Install the ai-microservice package in editable mode
cd ai-microservice
python -m pip install -U pip
python -m pip install -e .
```

> If you close the terminal later, you only need to re-run:
>
> ```bash
> cd test_new_ai_agent
> source .venv/bin/activate
> cd ai-agent
> ```

---

## 3. Setting up Upstash Vector (for RAG)

The microservice uses **Upstash Vector** to store and retrieve documents for RAG (Retrieval-Augmented Generation). This is optional - the chat works without it, but RAG provides better context-aware answers.

### Step-by-step setup:

1. **Go to Upstash Console**: https://console.upstash.com/

2. **Create a Vector Index** (NOT Search Database):
   - Click "Create Index" under the **Vector** section
   - Choose a name (e.g., `setter-ai-knowledge`)
   - **Region**: Choose the closest to your users (e.g., `eu-west-1` for Israel)
   - **Dimensions**: `1536` (required for OpenAI `text-embedding-3-small`)
   - **Distance Metric**: `COSINE` (recommended for text similarity)
   - Click "Create"

3. **Get your credentials**:
   - After creating, click on your index
   - Copy the **REST URL** (e.g., `https://xxx.upstash.io`)
   - Copy the **REST Token** (click "Show" to reveal)

4. **Add to your `.env` file**:
   ```bash
   UPSTASH_VECTOR_REST_URL=https://your-index-xxx.upstash.io
   UPSTASH_VECTOR_REST_TOKEN=your-token-here
   ```

### Vector Index vs Search Database - Which to choose?

| Feature | Vector Index | Search Database |
|---------|--------------|-----------------|
| **Use case** | RAG, semantic search | Full-text search |
| **How it works** | Embeddings + cosine similarity | Keyword matching |
| **Best for** | "Find similar content" | "Find exact matches" |
| **What we need** | **This one** | Not needed |

**You only need a Vector Index** for the RAG functionality in this microservice.

---

## 4. Environment variables

Set these before running the server (in your shell, `.env`, or a process manager):

**Required:**
- `OPENROUTER_API_KEY` – your OpenRouter API key.
- `AI_MODEL` – main reply model, e.g. `anthropic/claude-sonnet-4.5`.
- `AI_META_MODEL` – lightweight meta model for lead metadata, e.g. `anthropic/claude-haiku-4.5`.

**Optional (for RAG/vector search):**
- `UPSTASH_VECTOR_REST_URL` – Upstash Vector REST URL (if not set, RAG is disabled but chat still works).
- `UPSTASH_VECTOR_REST_TOKEN` – Upstash Vector REST token.

**Optional (other):**
- `OPENROUTER_BASE_URL` – defaults to `https://openrouter.ai/api/v1`.
- `BASE_URL` – used for `HTTP-Referer` header (e.g. your production URL).
- `X_TITLE` – OpenRouter `X-Title` header (defaults to `SetterAI Microservice`).
- `OPENROUTER_PRICING_TTL_SECONDS` – pricing cache TTL (default ~6 hours).

**Minimal setup example (without vector DB):**

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
export AI_MODEL=anthropic/claude-sonnet-4.5
export AI_META_MODEL=anthropic/claude-haiku-4.5
```

**Full setup example (with vector DB):**

```bash
export OPENROUTER_API_KEY=sk-or-v1-your-key-here
export AI_MODEL=anthropic/claude-sonnet-4.5
export AI_META_MODEL=anthropic/claude-haiku-4.5
export UPSTASH_VECTOR_REST_URL=https://your-index.upstash.io
export UPSTASH_VECTOR_REST_TOKEN=your-token
```

---

## 5. Running the microservice

From inside the virtualenv and `ai-agent` directory:

```bash
cd /Users/guybernshtein/Documents/SetterAI/test_new_ai_agent
source .venv/bin/activate
cd ai-agent

uvicorn main:app --reload --port 8000
```

The API will be available at:

- `http://localhost:8000/docs` – FastAPI Swagger UI.
- `http://localhost:8000/health` – health check.

---

## 6. Key endpoints

### 6.1 Health check

```http
GET /health
```

Returns:

```json
{
  "status": "healthy",
  "version": "1.0.0"
}
```

### 6.2 Generate DM response

```http
POST /dm/respond
Content-Type: application/json
```

**Copy-paste this exact JSON into Swagger UI to test (works without vector DB):**

```json
{
  "client_id": "test-tenant",
  "system_prompt": "אתה נציג מכירות של סטודיו לאימונים אישיים בשם 'פיט פרו'. המטרה שלך היא לענות על שאלות של לקוחות פוטנציאליים ולעודד אותם לקבוע אימון היכרות. דבר בעברית טבעית וידידותית. שירותים: אימונים אישיים, תזונה, תוכניות אונליין. מחיר אימון היכרות: חינם. מחיר חודשי: 800-1200 שח תלוי בתוכנית.",
  "current_message": "היי, כמה עולה אימון אישי אצלכם?",
  "conversation_history": [],
  "sender_name": "דניאל",
  "instagram_username": "daniel_test",
  "locale": "he-IL",
  "tenant_profile": {
    "name": "פיט פרו",
    "businessType": "fitness",
    "services": "אימונים אישיים, תזונה, תוכניות אונליין",
    "ownerName": "יוסי",
    "botGoal": "לקבוע אימון היכרות",
    "ctaType": "booking"
  },
  "lead_state": {
    "entryType": "dm",
    "conversationMode": "sales",
    "qualificationScore": 0,
    "bookingLinkSent": false,
    "gender": "unknown"
  }
}
```

**Minimal test (absolute minimum required fields):**

```json
{
  "client_id": "test",
  "system_prompt": "אתה עוזר ידידותי בעברית. ענה בקצרה.",
  "current_message": "מה שלומך?"
}
```

> **Note:** The microservice works without a vector database (Upstash). When no vector DB is configured, the AI will respond based only on the `system_prompt` without RAG context. To enable RAG, set `UPSTASH_VECTOR_REST_URL` and `UPSTASH_VECTOR_REST_TOKEN` environment variables.

Response (simplified):

```json
{
  "response": "תשובה בעברית ללקוח…",
  "sources_used": ["knowledge-base.md"],
  "confidence": 0.82,
  "lead_metadata": {
    "score": 7,
    "action": "send_link",
    "gender": "female",
    "intent": "info",
    "gathered": { "goal": "לרדת במשקל" }
  },
  "usage": {
    "model": "anthropic/claude-sonnet-4.5",
    "prompt_tokens": 1234,
    "completion_tokens": 210,
    "total_tokens": 1444,
    "cost_usd": 0.012345
  },
  "subagent_usage": [
    {
      "operation": "SetterAI",
      "model": "anthropic/claude-sonnet-4.5",
      "prompt_tokens": 1234,
      "completion_tokens": 210,
      "total_tokens": 1444,
      "cost_usd": 0.012345
    },
    {
      "operation": "SetterAI-Meta",
      "model": "anthropic/claude-haiku-4.5",
      "prompt_tokens": 300,
      "completion_tokens": 80,
      "total_tokens": 380,
      "cost_usd": 0.00123
    }
  ]
}
```

### 6.3 Markdown document upload (RAG)

```http
POST /documents/upload
Content-Type: multipart/form-data
```

Form-data fields:

- `client_id`: tenant ID you want to namespace the docs under.
- `file`: Markdown (.md) file.

Example with `curl`:

```bash
curl -X POST "http://localhost:8000/documents/upload" \
  -F "client_id=test-tenant" \
  -F "file=@/path/to/your-knowledge-base.md"
```

The markdown file is chunked semantically by headers (H1, H2, H3) for better retrieval accuracy.

---

## 7. Testing via Postman

1. Start the microservice (`uvicorn main:app --reload --port 8000`).
2. In Postman, create a new **POST** request:
   - URL: `http://localhost:8000/dm/respond`
   - Body: **raw JSON**, paste the example from section 5.2 and adjust `current_message` / `client_id`.
3. Check that:
   - `response` is in Hebrew.
   - `lead_metadata` is present.
   - `usage.cost_usd` and `subagent_usage` are populated.

---

## 8. Troubleshooting

### Error: "User not found" or 401 Unauthorized

This means your `OPENROUTER_API_KEY` is not set correctly. Make sure you:

1. **Get your API key** from https://openrouter.ai/keys
2. **Set it in the same terminal session** where you run the server:
   ```bash
   export OPENROUTER_API_KEY=sk-or-v1-your-actual-key-here
   ```
3. **Verify it's set** before starting the server:
   ```bash
   echo $OPENROUTER_API_KEY
   # Should print your key, not empty
   ```
4. **Then start the server**:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

**Important:** The `export` command only sets the variable for the current terminal session. If you open a new terminal, you need to export it again.

### Error: "Vector store is not configured"

This error only happens when trying to **upload documents** without Upstash credentials. The chat endpoint (`/dm/respond`) works fine without a vector DB - it will just respond without RAG context.

---

## 9. Integration with the Node app

When the Node app is configured with:

```env
AI_MICROSERVICE_ENABLED=true
AI_SERVICE_URL=http://localhost:8000
OPENROUTER_API_KEY=sk-...
```

it will:

- Build a rich Hebrew `systemPrompt` from the database.
- Call the microservice at `/dm/respond` with:
  - `system_prompt` (from Node).
  - `client_id`, `current_message`, `conversation_history`, `tenant_profile`, `lead_state`.
- Record token usage and cost in the `api_usage` table using the `usage` / `subagent_usage` fields returned by the microservice.
