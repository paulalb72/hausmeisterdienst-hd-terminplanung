import { Router } from 'express';
import { z } from 'zod';
import { query } from '../lib/db.js';
import { requireAuth } from '../lib/auth.js';
import { getPublicKey, notifyEmployee, pushEnabled } from '../lib/push.js';

export const pushRouter = Router();

/** Der öffentliche VAPID-Schlüssel, den der Browser zum Abonnieren braucht. */
pushRouter.get('/key', (_req, res) => {
  res.json({ publicKey: getPublicKey(), enabled: pushEnabled });
});

const subSchema = z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth:   z.string().min(1).max(500),
  }),
});

/**
 * Gerät anmelden. Ein Endpoint gehört immer genau einem Mitarbeiter:
 * Meldet sich auf demselben Handy jemand anders an, wandert das Abo mit.
 */
pushRouter.post('/subscribe', requireAuth, async (req, res, next) => {
  try {
    const parsed = subSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Ungültiges Push-Abo.' });
    }
    const { endpoint, keys } = parsed.data;
    await query(
      `INSERT INTO push_subscriptions (employee_id, endpoint, p256dh, auth)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint) DO UPDATE
         SET employee_id = EXCLUDED.employee_id,
             p256dh      = EXCLUDED.p256dh,
             auth        = EXCLUDED.auth`,
      [req.user.id, endpoint, keys.p256dh, keys.auth],
    );
    res.status(201).json({ ok: true });
  } catch (err) { next(err); }
});

pushRouter.post('/unsubscribe', requireAuth, async (req, res, next) => {
  try {
    const endpoint = String(req.body?.endpoint || '');
    if (endpoint) {
      await query(
        'DELETE FROM push_subscriptions WHERE endpoint = $1 AND employee_id = $2',
        [endpoint, req.user.id],
      );
    }
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Testnachricht an das eigene Handy – hilft beim Einrichten. */
pushRouter.post('/test', requireAuth, async (req, res, next) => {
  try {
    if (!pushEnabled) {
      return res.status(503).json({ error: 'Push ist auf dem Server nicht eingerichtet.' });
    }
    await notifyEmployee(req.user.id, {
      title: 'Benachrichtigungen aktiv',
      body: 'Hausmeisterdienst HD meldet sich ab jetzt bei neuen Terminen.',
      url: '/',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
