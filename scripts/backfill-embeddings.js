// One-time script to embed all existing KB entries that don't have embeddings yet.
// Run: node scripts/backfill-embeddings.js
// Requires: DATABASE_URL and OPENAI_API_KEY in environment (or .env file)

import dotenv from 'dotenv';
dotenv.config();

import { query, closePool } from '../src/database/connection.js';
import { generateEmbeddingsBatch } from '../src/embeddings.js';

const BATCH_SIZE = 50;

async function backfill() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('OPENAI_API_KEY is required. Set it in .env or environment.');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required. This script only works with PostgreSQL.');
    process.exit(1);
  }

  // Get all entries without embeddings
  const result = await query(
    'SELECT id, title, content, category FROM knowledge_base WHERE embedding IS NULL'
  );
  const entries = result.rows;

  if (entries.length === 0) {
    console.log('All KB entries already have embeddings. Nothing to do.');
    await closePool();
    process.exit(0);
  }

  console.log(`Found ${entries.length} entries to embed`);

  let embedded = 0;
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const texts = batch.map(e => `${e.title ? e.title + ': ' : ''}${e.content}`);

    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(entries.length / BATCH_SIZE);
    console.log(`Embedding batch ${batchNum}/${totalBatches} (${batch.length} entries)...`);

    const embeddings = await generateEmbeddingsBatch(texts, apiKey);

    if (embeddings.length !== batch.length) {
      console.error(`  Batch size mismatch: expected ${batch.length}, got ${embeddings.length}. Skipping batch.`);
      continue;
    }

    for (let j = 0; j < batch.length; j++) {
      await query(
        `UPDATE knowledge_base SET embedding = $1::jsonb, embedding_stale = false WHERE id = $2`,
        [JSON.stringify(embeddings[j]), batch[j].id]
      );
      embedded++;
    }

    console.log(`  Done. ${embedded}/${entries.length} embedded so far.`);

    // Small delay between batches to avoid rate limits
    if (i + BATCH_SIZE < entries.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\nBackfill complete! ${embedded}/${entries.length} entries embedded.`);

  await closePool();
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
