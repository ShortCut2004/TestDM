// Vector embedding generation via OpenAI API
// Used for RAG-based knowledge base retrieval

const OPENAI_EMBEDDING_URL = 'https://api.openai.com/v1/embeddings';
const EMBEDDING_MODEL = 'text-embedding-3-small';

/**
 * Generate embedding vector for a single text string.
 * Returns a number[] of 1536 dimensions, or null on failure.
 */
export async function generateEmbedding(text, apiKey) {
  if (!apiKey || !text?.trim()) return null;

  // Truncate to ~8K tokens worth of Hebrew (~16K chars)
  const truncated = text.trim().slice(0, 16000);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(OPENAI_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data.error) {
      console.error('[Embedding] API error:', data.error.message);
      return null;
    }

    return data.data[0].embedding;
  } catch (err) {
    clearTimeout(timeout);
    console.error('[Embedding] Failed:', err.message);
    return null;
  }
}

/**
 * Embed all stale KB entries. Run periodically (every 6h) to keep RAG current.
 * Returns the number of entries successfully embedded.
 */
export async function embedStaleKBEntries(apiKey) {
  if (!apiKey) return 0;

  try {
    const { getStaleKnowledgeEntries, updateKnowledgeEmbedding } = await import('./db.js');
    const stale = await getStaleKnowledgeEntries();
    if (stale.length === 0) return 0;

    console.log(`[Embeddings] Found ${stale.length} stale KB entries to embed`);
    let embedded = 0;

    for (const entry of stale) {
      try {
        const text = `${entry.category}: ${entry.title ? entry.title + ' — ' : ''}${entry.content}`;
        const embedding = await generateEmbedding(text, apiKey);
        if (embedding) {
          await updateKnowledgeEmbedding(entry.id, embedding);
          embedded++;
        }
      } catch (err) {
        console.warn(`[Embeddings] Failed for KB entry ${entry.id}:`, err.message);
      }
      // Rate limit: 200ms between API calls
      await new Promise(r => setTimeout(r, 200));
    }

    if (embedded > 0) {
      console.log(`[Embeddings] Embedded ${embedded}/${stale.length} KB entries`);
    }
    return embedded;
  } catch (err) {
    console.warn('[Embeddings] Batch KB embedding failed (non-fatal):', err.message);
    return 0;
  }
}

/**
 * Generate embeddings for multiple texts in a single API call.
 * Returns an array of embeddings in the same order as inputs, or [] on failure.
 */
export async function generateEmbeddingsBatch(texts, apiKey) {
  if (!apiKey || !texts?.length) return [];

  const truncated = texts.map(t => (t || '').trim().slice(0, 16000));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(OPENAI_EMBEDDING_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncated,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await res.json();
    if (data.error) {
      console.error('[Embedding] Batch API error:', data.error.message);
      return [];
    }

    return data.data
      .sort((a, b) => a.index - b.index)
      .map(d => d.embedding);
  } catch (err) {
    clearTimeout(timeout);
    console.error('[Embedding] Batch failed:', err.message);
    return [];
  }
}
