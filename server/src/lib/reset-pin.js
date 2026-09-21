// PIN eines Zugangs zuruecksetzen – fuer den Fall, dass niemand mehr
// hineinkommt (etwa wenn die PIN aus der Erstinbetriebnahme verloren ging).
//
//   npm run reset-pin -- "Chef" 40721
//   npm run reset-pin -- "Chef"          # erzeugt eine Zufalls-PIN
//
// Hebt eine bestehende Kontosperre gleich mit auf.
import 'dotenv/config';

import crypto from 'node:crypto';
import { hashPin } from './auth.js';
import { many, one, pool, query } from './db.js';

const [name, pinArg] = process.argv.slice(2);

if (!name) {
  const alle = await many('SELECT name, role, active FROM employees ORDER BY name');
  console.error('Aufruf: npm run reset-pin -- "<Name>" [<5-stellige PIN>]\n');
  if (alle.length) {
    console.error('Vorhandene Zugaenge:');
    for (const e of alle) {
      console.error(`  ${e.name}${e.role === 'chef' ? '  (Chef)' : ''}${e.active ? '' : '  (inaktiv)'}`);
    }
  } else {
    console.error('Es gibt noch keine Zugaenge. Der Server legt beim');
    console.error('naechsten Start selbst einen Chef-Zugang an.');
  }
  await pool.end();
  process.exit(1);
}

if (pinArg && !/^\d{5}$/.test(pinArg)) {
  console.error('Die PIN muss aus genau 5 Ziffern bestehen.');
  await pool.end();
  process.exit(1);
}

// Gleiches Verfahren wie bei der Erstinbetriebnahme: gleichverteilte Ziffern
// aus einer kryptografisch sicheren Quelle.
function zufallsPin() {
  let n;
  do {
    n = crypto.randomBytes(3).readUIntBE(0, 3);
  } while (n >= 16_700_000);
  return String(n % 100_000).padStart(5, '0');
}

const pin = pinArg || zufallsPin();

const treffer = await one(
  `UPDATE employees
      SET pin_hash = $2, failed_logins = 0, locked_until = NULL, updated_at = now()
    WHERE lower(name) = lower($1)
    RETURNING name, role`,
  [name, await hashPin(pin)],
);

if (!treffer) {
  console.error(`Kein Zugang mit dem Namen "${name}" gefunden.`);
  await pool.end();
  process.exit(1);
}

// Alle offenen Sitzungen beenden: Wer die alte PIN kannte, soll nach einem
// Zuruecksetzen nicht einfach angemeldet bleiben.
const { rowCount } = await query(
  'DELETE FROM sessions WHERE employee_id = (SELECT id FROM employees WHERE lower(name) = lower($1))',
  [name],
);

console.log(`\nPIN fuer "${treffer.name}" gesetzt: ${pin}`);
if (!pinArg) console.log('(zufaellig erzeugt – jetzt notieren)');
if (rowCount) console.log(`${rowCount} offene Sitzung(en) beendet.`);
console.log('Eine eventuelle Kontosperre wurde aufgehoben.\n');

await pool.end();
