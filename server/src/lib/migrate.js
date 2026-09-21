// Legt das Schema an. Läuft beim Serverstart automatisch und ist idempotent.
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from './db.js';

const here = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = await readFile(join(here, 'schema.sql'), 'utf8');
  await pool.query(sql);
}

// Direkt aufrufbar: npm run migrate
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  console.log('Schema angelegt bzw. aktuell.');
  await pool.end();
}
