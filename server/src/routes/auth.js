import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { many, one, query } from '../lib/db.js';
import {
  LOCKOUT_MINUTES, MAX_FAILED_LOGINS,
  createSession, destroySession, requireAuth, verifyPin,
} from '../lib/auth.js';
import { getPublicKey } from '../lib/push.js';

export const authRouter = Router();

// Erste Verteidigungslinie: pro IP nur 10 Anmeldeversuche in 15 Minuten.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Erfolgreiche Anmeldungen zählen nicht mit, damit ein voll besetzter
  // Transporter im selben WLAN sich nicht gegenseitig aussperrt.
  skipSuccessfulRequests: true,
  message: { error: 'Zu viele Anmeldeversuche. Bitte in 15 Minuten erneut versuchen.' },
});

const loginSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  pin: z.string().regex(/^\d{5}$/, 'Die PIN besteht aus 5 Ziffern.'),
});

/** Namensliste für den Anmeldebildschirm – ohne PINs, ohne Rollen. */
authRouter.get('/employees', async (_req, res, next) => {
  try {
    res.json(await many(
      'SELECT id, name, color FROM employees WHERE active ORDER BY name',
    ));
  } catch (err) { next(err); }
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Bitte Namen wählen und 5-stellige PIN eingeben.' });
    }
    const { employeeId, pin } = parsed.data;

    const emp = await one(
      `SELECT id, name, role, color, pin_hash, failed_logins, locked_until
         FROM employees WHERE id = $1 AND active`,
      [employeeId],
    );

    // Immer dieselbe Meldung, damit man nicht durchprobieren kann,
    // welche Konten es gibt.
    const wrong = { error: 'Name oder PIN stimmt nicht.' };
    if (!emp) return res.status(401).json(wrong);

    if (emp.locked_until && new Date(emp.locked_until) > new Date()) {
      const mins = Math.ceil((new Date(emp.locked_until) - Date.now()) / 60000);
      return res.status(429).json({
        error: `Konto ist wegen Fehlversuchen für ${mins} Minute(n) gesperrt.`,
      });
    }

    if (!(await verifyPin(pin, emp.pin_hash))) {
      const failed = emp.failed_logins + 1;
      const lock = failed >= MAX_FAILED_LOGINS;
      await query(
        `UPDATE employees
            SET failed_logins = $2,
                locked_until = CASE WHEN $3 THEN now() + ($4 || ' minutes')::interval
                                    ELSE locked_until END
          WHERE id = $1`,
        [emp.id, lock ? 0 : failed, lock, String(LOCKOUT_MINUTES)],
      );
      if (lock) {
        return res.status(429).json({
          error: `Konto für ${LOCKOUT_MINUTES} Minuten gesperrt. Der Chef kann es sofort entsperren.`,
        });
      }
      return res.status(401).json(wrong);
    }

    await query(
      'UPDATE employees SET failed_logins = 0, locked_until = NULL WHERE id = $1',
      [emp.id],
    );
    await createSession(res, emp.id);
    res.json({ user: { id: emp.id, name: emp.name, role: emp.role, color: emp.color } });
  } catch (err) { next(err); }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    await destroySession(req, res);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/** Wer bin ich? Die PWA fragt das beim Start, um die Sitzung zu prüfen. */
authRouter.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  res.json({ user: req.user, vapidPublicKey: getPublicKey() });
});

const pinSchema = z.object({
  currentPin: z.string().regex(/^\d{5}$/),
  newPin: z.string().regex(/^\d{5}$/, 'Die neue PIN besteht aus 5 Ziffern.'),
});

/** Eigene PIN ändern. */
authRouter.post('/pin', requireAuth, async (req, res, next) => {
  try {
    const parsed = pinSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Beide PINs müssen aus 5 Ziffern bestehen.' });
    }
    const { currentPin, newPin } = parsed.data;
    const emp = await one('SELECT pin_hash FROM employees WHERE id = $1', [req.user.id]);
    if (!(await verifyPin(currentPin, emp.pin_hash))) {
      return res.status(401).json({ error: 'Die aktuelle PIN stimmt nicht.' });
    }
    const { hashPin } = await import('../lib/auth.js');
    await query('UPDATE employees SET pin_hash = $2, updated_at = now() WHERE id = $1',
      [req.user.id, await hashPin(newPin)]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});
