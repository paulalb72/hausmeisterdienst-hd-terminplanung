import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { one, query } from './db.js';

const SESSION_COOKIE = 'hd_session';
const SESSION_DAYS = 30;

// Kontosperre nach zu vielen Fehlversuchen. Greift zusätzlich zum
// IP-Rate-Limit, damit ein Angreifer mit wechselnden IPs nicht durchkommt.
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

export function hashPin(pin) {
  return bcrypt.hash(pin, 12);
}

export function verifyPin(pin, hash) {
  return bcrypt.compare(pin, hash);
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  path: '/',
};

export async function createSession(res, employeeId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query(
    'INSERT INTO sessions (token, employee_id, expires_at) VALUES ($1, $2, $3)',
    [token, employeeId, expiresAt],
  );
  res.cookie(SESSION_COOKIE, token, cookieOptions);
  return token;
}

export async function destroySession(req, res) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (token) await query('DELETE FROM sessions WHERE token = $1', [token]);
  res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined });
}

/** Hängt req.user an, wenn eine gültige Sitzung existiert. Blockt nie. */
export async function loadUser(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return next();
  try {
    req.user = await one(
      `SELECT e.id, e.name, e.role, e.color, e.active
         FROM sessions s
         JOIN employees e ON e.id = s.employee_id
        WHERE s.token = $1 AND s.expires_at > now() AND e.active`,
      [token],
    );
  } catch (err) {
    console.error('[auth] Sitzung konnte nicht geladen werden:', err.message);
  }
  next();
}

/** Ab hier ist eine Anmeldung Pflicht. */
export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  next();
}

/** Nur der Chef darf planen und Stammdaten pflegen. */
export function requireChef(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Nicht angemeldet.' });
  if (req.user.role !== 'chef') {
    return res.status(403).json({ error: 'Nur für die Bauleitung.' });
  }
  next();
}

/** Abgelaufene Sitzungen aufräumen – stündlich aus index.js aufgerufen. */
export async function purgeExpiredSessions() {
  const { rowCount } = await query('DELETE FROM sessions WHERE expires_at < now()');
  return rowCount;
}
