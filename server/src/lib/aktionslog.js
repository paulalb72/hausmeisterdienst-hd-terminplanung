// Aktionsprotokoll: eine Zeile je Nutzeraktion, zum Nachlesen auf dem
// Server (tail, grep). Eine Datei je Monat – logs/aktionen-2026-11.log –
// hält die Dateien klein, ohne dass es eine Rotation braucht.
//
//   2026-11-18 14:32:05 | Chef (#1) | Termin angelegt | #42 "Heizung entlüften" · Max · …
//
// Schreibfehler werden gemeldet, nie geworfen: Das Protokoll darf keine
// Aktion scheitern lassen.
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// server/logs – im Docker-Image /app/server/logs, dort als Volume einhängen,
// sonst ist das Protokoll nach jedem Redeploy weg.
const LOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'logs');

// "2026-11-18 14:32:05" in deutscher Ortszeit.
const fmtStempel = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Schreibvorgänge laufen nacheinander, damit die Reihenfolge stimmt.
let kette = Promise.resolve();
let fehlerGemeldet = false;

/**
 * Hält eine Aktion fest. `wer` ist req.user oder ein { id, name } –
 * null, wenn niemand angemeldet ist (fehlgeschlagene Anmeldung, Skript).
 */
export function protokolliere(wer, aktion, details = '') {
  const stempel = fmtStempel.format(new Date());
  const person = wer ? `${wer.name} (#${wer.id})` : '–';
  const zeile = [stempel, person, aktion, details].filter(Boolean).join(' | ')
    .replace(/[\r\n]+/g, ' ');
  const datei = join(LOG_DIR, `aktionen-${stempel.slice(0, 7)}.log`);

  kette = kette
    .then(() => mkdir(LOG_DIR, { recursive: true }))
    .then(() => appendFile(datei, `${zeile}\n`, 'utf8'))
    .then(() => { fehlerGemeldet = false; })
    .catch((err) => {
      // Einmal melden genügt – sonst flutet ein fehlendes Volume das Log.
      if (!fehlerGemeldet) console.error('[aktionslog] Schreiben fehlgeschlagen:', err.message);
      fehlerGemeldet = true;
    });
  return kette;
}

/** Freitext fürs Protokoll: einzeilig, gekürzt, in Anführungszeichen. */
export function zitat(text, max = 120) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  return `"${s.length > max ? `${s.slice(0, max - 1)}…` : s}"`;
}
