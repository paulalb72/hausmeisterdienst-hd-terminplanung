// Darstellung der Terminzeit.
//
// Ein Termin hat entweder eine feste Uhrzeit (time_mode 'exakt') oder – wenn
// der Kunde von sich aus anruft – nur einen groben Zeitraum. Eine Dauer gibt
// es bewusst nicht.
//
// Die Ankerzeiten bestimmen ausschliesslich die Sortierung innerhalb eines
// Tages; angezeigt wird immer das Wort. Sie muessen mit TIME_MODES in
// server/src/routes/appointments.js uebereinstimmen.

import { formatTime, toDate } from './dates.js';

export const ZEITRAEUME = [
  { wert: 'vormittags',  label: 'Vormittags',  kurz: 'Vorm.',  anker: '08:00' },
  { wert: 'mittags',     label: 'Mittags',     kurz: 'Mittag', anker: '12:00' },
  { wert: 'nachmittags', label: 'Nachmittags', kurz: 'Nachm.', anker: '14:00' },
  { wert: 'spanne',      label: 'Zeitspanne',  kurz: null,     anker: null },
];

const NACH_WERT = Object.fromEntries(ZEITRAEUME.map((z) => [z.wert, z]));

/** Hat der Termin eine feste Uhrzeit? */
export const hatFesteUhrzeit = (appt) => (appt?.time_mode || 'exakt') === 'exakt';

/** Ruft der Kunde an, statt dass eine Uhrzeit feststeht? */
export const ruftAn = (appt) => !hatFesteUhrzeit(appt);

/** Ankerzeit eines Zeitraums, z. B. 'vormittags' -> "08:00". */
export const ankerZeit = (wert) => NACH_WERT[wert]?.anker || '08:00';

/**
 * Ausgeschriebene Zeitangabe.
 * "07:30" · "Vormittags" · "09:00 – 12:00"
 */
export function zeitLabel(appt) {
  const start = formatTime(appt.starts_at);
  const modus = appt.time_mode || 'exakt';
  if (modus === 'exakt') return start;
  if (modus === 'spanne') return appt.span_end ? `${start} – ${appt.span_end}` : `ab ${start}`;
  return NACH_WERT[modus]?.label || start;
}

/**
 * Kurzform fuer enge Stellen wie die Zeitspalte der Terminkarte oder die
 * Bloecke im Planungsboard.
 * "07:30" · "Vorm." · "09–12"
 */
export function zeitLabelKurz(appt) {
  const start = formatTime(appt.starts_at);
  const modus = appt.time_mode || 'exakt';
  if (modus === 'exakt') return start;
  if (modus === 'spanne') {
    if (!appt.span_end) return `ab ${start}`;
    // Volle Stunden ohne ":00" – spart in der schmalen Spalte vier Zeichen.
    const knapp = (t) => (t.endsWith(':00') ? t.slice(0, 2) : t);
    return `${knapp(start)}–${knapp(appt.span_end)}`;
  }
  return NACH_WERT[modus]?.kurz || start;
}

/** Ergaenzender Hinweis fuer die Detailansicht. */
export function zeitHinweis(appt) {
  if (hatFesteUhrzeit(appt)) return null;
  return 'Keine feste Uhrzeit – der Kunde ruft an.';
}

/**
 * Baut aus den Formularwerten den Zeitpunkt fuer den Server.
 * Bei einem Zeitraum wandert die Ankerzeit in starts_at, damit die
 * Sortierung innerhalb des Tages stimmt.
 */
export function zeitFuerServer({ datum, uhrzeit, ruftAn: anruf, zeitraum, von, bis }) {
  if (!anruf) {
    return { zeit: uhrzeit, timeMode: 'exakt', spanEnd: null };
  }
  if (zeitraum === 'spanne') {
    return { zeit: von, timeMode: 'spanne', spanEnd: bis };
  }
  return { zeit: ankerZeit(zeitraum), timeMode: zeitraum, spanEnd: null };
}

/** Liest einen geladenen Termin zurueck in die Formularfelder. */
export function zeitAusTermin(appt) {
  const modus = appt.time_mode || 'exakt';
  const start = formatTime(appt.starts_at);
  if (modus === 'exakt') {
    return { ruftAn: false, zeitraum: 'vormittags', uhrzeit: start, von: '08:00', bis: '12:00' };
  }
  if (modus === 'spanne') {
    return { ruftAn: true, zeitraum: 'spanne', uhrzeit: start, von: start, bis: appt.span_end || '12:00' };
  }
  return { ruftAn: true, zeitraum: modus, uhrzeit: start, von: '08:00', bis: '12:00' };
}

/** Liegt der Termin in der Vergangenheit? Bei Zeitraeumen zaehlt der Tag. */
export function istVorbei(appt) {
  if (hatFesteUhrzeit(appt)) return toDate(appt.starts_at).getTime() < Date.now();
  // Ohne feste Uhrzeit gilt der Termin erst nach Tagesende als vorbei.
  const ende = toDate(appt.starts_at);
  ende.setHours(23, 59, 59, 999);
  return ende.getTime() < Date.now();
}
