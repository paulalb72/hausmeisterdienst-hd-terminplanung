// Erstinbetriebnahme.
//
// In einem Container gibt es niemanden, der "npm run seed" aufruft. Damit
// eine frische Installation trotzdem benutzbar ist, legt der Server beim
// Start einen Chef-Zugang an – aber nur, wenn die Datenbank noch voellig
// leer ist. Bei jedem weiteren Start passiert nichts.

import crypto from 'node:crypto';
import { hashPin } from './auth.js';
import { one, query } from './db.js';

/** Fuenfstellige PIN aus einer kryptografisch sicheren Quelle. */
function zufallsPin() {
  // rejection sampling: verhindert die leichte Schieflage, die ein
  // simples Modulo bei 65536 % 100000 erzeugen wuerde.
  let n;
  do {
    n = crypto.randomBytes(3).readUIntBE(0, 3); // 0 … 16_777_215
  } while (n >= 16_700_000);
  return String(n % 100_000).padStart(5, '0');
}

/**
 * Legt den ersten Chef-Zugang an, falls noch kein einziger Mitarbeiter
 * existiert. Gibt zurueck, was passiert ist – index.js schreibt es ins Log.
 */
export async function ensureChefAccount() {
  const { count } = await one('SELECT count(*)::int AS count FROM employees');
  if (count > 0) return { created: false };

  const name = process.env.SEED_CHEF_NAME || 'Chef';
  const vorgabe = process.env.SEED_CHEF_PIN;

  if (vorgabe && !/^\d{5}$/.test(vorgabe)) {
    throw new Error('SEED_CHEF_PIN muss aus genau 5 Ziffern bestehen.');
  }

  // Ohne Vorgabe eine Zufalls-PIN, damit keine Installation mit einer
  // allgemein bekannten Standard-PIN im Netz steht.
  const pin = vorgabe || zufallsPin();
  await query(
    `INSERT INTO employees (name, role, color, pin_hash) VALUES ($1, 'chef', '#10712A', $2)`,
    [name, await hashPin(pin)],
  );

  return { created: true, name, pin, zufaellig: !vorgabe };
}

/** Auffaellige Ausgabe im Log – die PIN steht nur dieses eine Mal dort. */
export function logBootstrap(ergebnis) {
  if (!ergebnis.created) return;
  const linie = '='.repeat(64);
  console.log(`\n${linie}`);
  console.log('  ERSTE INBETRIEBNAHME – Chef-Zugang wurde angelegt');
  console.log(`  Name: ${ergebnis.name}`);
  console.log(`  PIN:  ${ergebnis.pin}`);
  if (ergebnis.zufaellig) {
    console.log('\n  Diese PIN wurde zufaellig erzeugt und erscheint nur in');
    console.log('  dieser Zeile. Jetzt notieren und nach der ersten Anmeldung');
    console.log('  unter "Mehr -> PIN aendern" ersetzen.');
  } else {
    console.log('\n  PIN stammt aus SEED_CHEF_PIN. Nach der ersten Anmeldung');
    console.log('  unter "Mehr -> PIN aendern" ersetzen und die Variable aus');
    console.log('  der Umgebung entfernen.');
  }
  console.log(`${linie}\n`);
}
