// Entwurf fuer "Neuer Termin".
//
// Der Chef nimmt Termine am Telefon auf, auch dort, wo das Netz fehlt.
// Scheitert das Speichern und wird die App geschlossen, soll die Eingabe
// beim naechsten Oeffnen noch da sein. Nachgesendet wird nichts: der Chef
// tippt selbst auf Speichern, sobald er wieder Netz hat.
//
// Bewusst nur fuer neue Termine. Ein Entwurf einer Bearbeitung koennte
// spaeter Aenderungen ueberschreiben, die inzwischen auf dem Server liegen.

const KEY = 'hd-termin-entwurf';
// Ein vergessener Entwurf soll nicht Tage spaeter wieder auftauchen.
const MAX_ALTER_MS = 24 * 60 * 60 * 1000;

/** { form, gespeichert } oder null. */
export function ladeEntwurf() {
  try {
    const entwurf = JSON.parse(localStorage.getItem(KEY));
    if (!entwurf?.form) return null;
    if (Date.now() - entwurf.gespeichert > MAX_ALTER_MS) {
      verwirfEntwurf();
      return null;
    }
    return entwurf;
  } catch {
    // Privater Modus oder kaputter Eintrag: dann eben ohne Entwurf.
    return null;
  }
}

export function speichereEntwurf(form) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ form, gespeichert: Date.now() }));
  } catch { /* Speicher voll oder gesperrt */ }
}

export function verwirfEntwurf() {
  try { localStorage.removeItem(KEY); } catch { /* s. o. */ }
}
