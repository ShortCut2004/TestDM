import pg from 'pg';

let pool = null;

export function getPool() {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      min: 2,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on('error', (err) => {
      console.error('Unexpected PostgreSQL pool error:', err.message);
    });
  }
  return pool;
}

export async function query(text, params) {
  const result = await getPool().query(text, params);
  return result;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
