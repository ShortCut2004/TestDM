# Mock Data Testing Guide

This guide explains how to seed and clean up mock data in Upstash Vector for testing the RAG functionality.

## Prerequisites

1. **Upstash Vector Index** - Follow section 3 in README.md to create one
2. **Environment variables** - Your `.env` file should have:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-your-key
   UPSTASH_VECTOR_REST_URL=https://your-index.upstash.io
   =your-token
   ```

## Test Clients (Namespaces)

The mock data script creates 3 test clients:

| Client ID (Namespace) | Business Type | Description                                          |
| --------------------- | ------------- | ---------------------------------------------------- |
| `fitness-studio-test` | Fitness       | Gym with personal training, group classes, nutrition |
| `beauty-salon-test`   | Beauty        | Salon with facials, laser hair removal, manicure     |
| `restaurant-test`     | Restaurant    | Mediterranean restaurant with menu and hours         |

---

## Seeding Mock Data

Run this to populate the vector database with test documents:

```bash
# From the DMSetter root directory:
cd test_new_ai_agent/ai-microservice
pip install -e .
python3 scripts/seed_mock_data.py
```
**Or run directly from DMSetter root:**
```bash
python3 test_new_ai_agent/ai-microservice/scripts/seed_mock_data.py
```
**Expected output:**

```
============================================================
MOCK DATA SEEDER - Upstash Vector
============================================================

Credentials loaded successfully
Connected to Upstash Vector

  Seeding client: פיט פרו - סטודיו לאימונים (namespace: fitness-studio-test)
    Document 'services.md': 2 chunks
    Document 'faq.md': 1 chunks
    Total vectors: 3

  Seeding client: ביוטי קווין - מכון יופי (namespace: beauty-salon-test)
    Document 'treatments.md': 2 chunks
    Total vectors: 2

  Seeding client: מסעדת הים התיכון (namespace: restaurant-test)
    Document 'menu.md': 2 chunks
    Total vectors: 2

============================================================
DONE! Seeded 7 vectors across 3 clients
============================================================
```

---

## Testing the API

After seeding, test with Swagger UI at `http://localhost:8000/docs`:

### Test 1: Fitness Studio (with RAG context)

```json
{
  "client_id": "fitness-studio-test",
  "system_prompt": "אתה נציג מכירות של סטודיו כושר. ענה בעברית ידידותית.",
  "current_message": "כמה עולה אימון אישי?"
}
```

**Expected:** The AI should answer with specific pricing from the seeded documents (250 ש"ח לאימון בודד, חבילות, etc.)

### Test 2: Beauty Salon

```json
{
  "client_id": "beauty-salon-test",
  "system_prompt": "אתה נציגת של מכון יופי. ענה בעברית ידידותית.",
  "current_message": "מה המחיר של טיפול פנים?"
}
```

**Expected:** The AI should mention the facial treatments pricing (280 ש"ח לטיפול קלאסי, 450 ש"ח לאנטי-אייג'ינג)

### Test 3: Restaurant

```json
{
  "client_id": "restaurant-test",
  "system_prompt": "אתה נציג של מסעדה. ענה בעברית ידידותית.",
  "current_message": "מה יש לכם לאכול?"
}
```

**Expected:** The AI should describe menu items from the seeded menu document.

### Test 4: Non-existent client (no RAG)

```json
{
  "client_id": "does-not-exist",
  "system_prompt": "אתה עוזר ידידותי.",
  "current_message": "מה שלומך?"
}
```

**Expected:** The AI should respond without RAG context (generic response).

---

## Cleaning Up Mock Data

When you're done testing, clean up the test data:

```bash
# From the DMSetter root directory:
cd test_new_ai_agent/ai-microservice
python3 scripts/cleanup_mock_data.py
```

**Or run directly from DMSetter root:**
```bash
python3 test_new_ai_agent/ai-microservice/scripts/cleanup_mock_data.py
```

**You will be asked to confirm:**

```
============================================================
MOCK DATA CLEANUP - Upstash Vector
============================================================

This will DELETE all vectors in these test namespaces:
  - fitness-studio-test
  - beauty-salon-test
  - restaurant-test

Are you sure? (yes/no): yes

Credentials loaded successfully
Connected to Upstash Vector

  Cleaned: fitness-studio-test
  Cleaned: beauty-salon-test
  Cleaned: restaurant-test

============================================================
DONE! Cleaned 3/3 namespaces
============================================================
```

---

## Customizing Mock Data

To add your own test data, edit `scripts/seed_mock_data.py` and modify the `MOCK_CLIENTS` dictionary:

```python
MOCK_CLIENTS = {
    "your-namespace": {
        "name": "Your Business Name",
        "documents": [
            {
                "id": "doc-id",
                "filename": "document.md",
                "content": """# Your Document

Your content here in Markdown format.
"""
            }
        ]
    }
}
```

If you add new namespaces, also update `TEST_NAMESPACES` in `scripts/cleanup_mock_data.py` so cleanup works correctly.

---

## Troubleshooting

### Error: "Upstash credentials not found"

Make sure your `.env` file exists and has the correct variables:

```bash
cat .env
```

### Error: "401 Unauthorized" or "User not found"

Your OpenRouter API key is invalid or expired. Get a new one from https://openrouter.ai/keys

### Vectors not appearing in search

- Wait a few seconds after seeding (Upstash has slight indexing delay)
- Verify the namespace matches exactly (case-sensitive)
- Check Upstash console to see if vectors were created
