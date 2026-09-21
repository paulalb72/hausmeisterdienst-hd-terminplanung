// Web-Push an die Handys der Mitarbeiter. Ohne VAPID-Schlüssel bleibt das
// Modul still inaktiv – die App funktioniert dann einfach ohne Push.
import webpush from 'web-push';
import { many, query } from './db.js';

const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
const subject = process.env.VAPID_SUBJECT || 'mailto:info@hausmeister-service-frankfurt.de';

export const pushEnabled = Boolean(publicKey && privateKey);

if (pushEnabled) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
} else {
  console.warn('[push] VAPID-Schlüssel fehlen – Benachrichtigungen sind aus. "npm run genkeys" erzeugt sie.');
}

export function getPublicKey() {
  return pushEnabled ? publicKey : null;
}

/**
 * Schickt eine Nachricht an alle Geräte eines Mitarbeiters.
 * Fehler werden geloggt, nie geworfen: Ein toter Push darf das Speichern
 * eines Termins niemals scheitern lassen.
 */
export async function notifyEmployee(employeeId, payload) {
  if (!pushEnabled) return;
  let subs;
  try {
    subs = await many(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE employee_id = $1',
      [employeeId],
    );
  } catch (err) {
    console.error('[push] Abos nicht lesbar:', err.message);
    return;
  }

  const body = JSON.stringify(payload);
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        body,
      );
    } catch (err) {
      // 404/410 = Gerät hat das Abo verworfen (App deinstalliert, Cache geleert).
      if (err.statusCode === 404 || err.statusCode === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id])
          .catch(() => {});
      } else {
        console.error('[push] Versand fehlgeschlagen:', err.statusCode, err.message);
      }
    }
  }));
}
