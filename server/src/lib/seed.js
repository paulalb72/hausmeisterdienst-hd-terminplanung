// Erstbefüllung von Hand. Im Container erledigt das der Server beim Start
// selbst (siehe bootstrap.js) – dieses Skript ist für lokale Installationen
// und für den Fall, dass man den Zugang bewusst neu erzeugen will.
import 'dotenv/config';

import { migrate } from './migrate.js';
import { ensureChefAccount, logBootstrap } from './bootstrap.js';
import { pool } from './db.js';

await migrate();
const ergebnis = await ensureChefAccount();
if (ergebnis.created) {
  logBootstrap(ergebnis);
} else {
  console.log('Es gibt bereits Mitarbeiter – nichts geändert.');
}
await pool.end();
