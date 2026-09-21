// Datums- und Zeitwerkzeuge.
//
// Der Server speichert und liefert UTC-ISO-Zeitstempel. Angezeigt und
// eingegeben wird in der Zeitzone des Geraets – bei Nutzung in Frankfurt
// ist das Europe/Berlin, inklusive korrekter Sommerzeit-Umstellung, weil
// der Browser sie selbst kennt.

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const pad = (n) => String(n).padStart(2, '0');

export const toDate = (value) => (value instanceof Date ? value : new Date(value));

/** "08:30" */
export function formatTime(value) {
  const d = toDate(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "22.09.2026" */
export function formatDate(value) {
  const d = toDate(value);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** "Montag, 22. September" */
export function formatDateLong(value) {
  const d = toDate(value);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

/** "Mo, 22.09." */
export function formatDateShort(value) {
  const d = toDate(value);
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
}

/** "September 2026" */
export function formatMonthYear(value) {
  const d = toDate(value);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export const weekdayShort = (value) => WEEKDAYS_SHORT[toDate(value).getDay()];

/** "Heute" / "Morgen" / "Mo, 22.09." – die Kopfzeile der Terminliste. */
export function formatDayLabel(value) {
  const d = startOfDay(value);
  const today = startOfDay(new Date());
  const diff = Math.round((d - today) / 86_400_000);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return formatDateShort(d);
}

// --- Rechnen mit Tagen ----------------------------------------------------

export function startOfDay(value) {
  const d = toDate(value);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(value) {
  const d = startOfDay(value);
  d.setDate(d.getDate() + 1);
  return d;
}

export function addDays(value, days) {
  const d = toDate(value);
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function addMonths(value, months) {
  const d = toDate(value);
  const out = new Date(d);
  out.setMonth(out.getMonth() + months);
  return out;
}

/** Montag der Woche – Deutschland beginnt die Woche am Montag. */
export function startOfWeek(value) {
  const d = startOfDay(value);
  const day = d.getDay();
  return addDays(d, day === 0 ? -6 : 1 - day);
}

export function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export const isToday = (value) => isSameDay(value, new Date());

export const isWeekend = (value) => {
  const day = toDate(value).getDay();
  return day === 0 || day === 6;
};

export const isPast = (value) => toDate(value).getTime() < Date.now();

/** Alle Tage von "from" bis einschliesslich "to". */
export function daysBetween(from, to) {
  const out = [];
  let cursor = startOfDay(from);
  const last = startOfDay(to);
  while (cursor <= last) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}

/** Das Raster einer Monatsansicht: volle Wochen von Montag bis Sonntag. */
export function monthGrid(value) {
  const d = toDate(value);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return daysBetween(startOfWeek(first), addDays(startOfWeek(last), 6));
}

// --- Umwandlung fuer Formularfelder --------------------------------------

/** Date -> "2026-09-22" fuer <input type="date">. */
export function toDateInput(value) {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Date -> "08:30" fuer <input type="time">. */
export const toTimeInput = (value) => formatTime(value);

/**
 * "2026-09-22" + "08:30" -> UTC-ISO fuer den Server.
 * Der Date-Konstruktor mit Einzelwerten interpretiert die Angaben als
 * Ortszeit; genau das ist hier gewollt.
 */
export function fromDateTimeInput(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = (timeStr || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

/** Auf das naechste Viertelstunden-Raster runden – fuer neue Termine. */
export function nextQuarterHour(value = new Date()) {
  const d = toDate(value);
  const out = new Date(d);
  out.setSeconds(0, 0);
  out.setMinutes(Math.ceil(out.getMinutes() / 15) * 15);
  return out;
}
