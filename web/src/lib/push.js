// Web-Push im Browser einrichten.
//
// Wichtig fuer iPhones: Benachrichtigungen funktionieren dort ausschliesslich,
// wenn die Seite ueber "Zum Home-Bildschirm" installiert wurde. Safari im
// normalen Tab bietet die Berechtigung gar nicht erst an.

import { api } from './api.js';

export const pushSupported = () =>
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Laeuft die App als installierte PWA? */
export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function permissionState() {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

// Der VAPID-Schluessel kommt base64url-kodiert und muss fuer die PushManager-
// API in ein Uint8Array umgewandelt werden.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/**
 * Fragt die Berechtigung ab und meldet das Geraet beim Server an.
 * Gibt eine sprechende Fehlermeldung zurueck statt zu werfen, damit die
 * Oberflaeche sie direkt anzeigen kann.
 */
export async function enablePush() {
  if (!pushSupported()) {
    return { ok: false, error: 'Dieses Gerät unterstützt keine Benachrichtigungen.' };
  }
  if (isIOS() && !isStandalone()) {
    return {
      ok: false,
      error: 'Auf dem iPhone zuerst über "Teilen → Zum Home-Bildschirm" installieren, '
           + 'danach die App von dort öffnen.',
    };
  }

  const { publicKey, enabled } = await api.pushKey();
  if (!enabled || !publicKey) {
    return { ok: false, error: 'Push ist auf dem Server nicht eingerichtet.' };
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    return {
      ok: false,
      error: permission === 'denied'
        ? 'Benachrichtigungen sind für diese App blockiert. Bitte in den Browser-Einstellungen freigeben.'
        : 'Benachrichtigungen wurden nicht erlaubt.',
    };
  }

  const registration = await navigator.serviceWorker.ready;

  // Ein bestehendes Abo mit altem Schluessel muss weg, sonst wirft subscribe().
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    const sameKey = existing.options?.applicationServerKey &&
      btoa(String.fromCharCode(...new Uint8Array(existing.options.applicationServerKey)))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === publicKey;
    if (!sameKey) await existing.unsubscribe();
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await api.pushSubscribe(subscription.toJSON());
  return { ok: true };
}

export async function disablePush() {
  if (!pushSupported()) return { ok: true };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await api.pushUnsubscribe(subscription.endpoint).catch(() => {});
    await subscription.unsubscribe();
  }
  return { ok: true };
}

/** Ist dieses Geraet bereits angemeldet? */
export async function isPushActive() {
  if (!pushSupported() || Notification.permission !== 'granted') return false;
  try {
    const registration = await navigator.serviceWorker.ready;
    return Boolean(await registration.pushManager.getSubscription());
  } catch {
    return false;
  }
}
