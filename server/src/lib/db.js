// Einziger Ort, an dem SQL gegen Postgres läuft. Wer auf eine andere
// Datenbank wechseln will, tauscht nur diese Datei aus.
import pg from 'pg';

// Termine kommen als timestamptz zurück. Ohne diesen Parser würde pg sie in
// die lokale Zeitzone des Servers wandeln – wir wollen durchgehend UTC-ISO.
pg.types.setTypeParser(1184, (v) => (v === null ? null : new Date(v).toISOString()));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL fehlt. Siehe .env.example.');
}

export const pool = new pg.Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

pool.on('error', (err) => {
  console.error('[db] Verbindungsfehler im Pool:', err.message);
});

export function query(text, params) {
  return pool.query(text, params);
}

/** Genau eine Zeile oder null. */
export async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] ?? null;
}

/** Alle Zeilen. */
export async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

/** Mehrere Statements atomar ausführen. */
export async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
