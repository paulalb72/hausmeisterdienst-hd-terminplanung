// Muss die allererste Anweisung bleiben: ESM wertet Importe vor jedem
// Anweisungscode aus, ein spaeteres config() kaeme fuer db.js zu spaet.
import 'dotenv/config';

import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { migrate } from './lib/migrate.js';
import { ensureChefAccount, logBootstrap } from './lib/bootstrap.js';
import { loadUser, purgeExpiredSessions } from './lib/auth.js';
import { pool } from './lib/db.js';
import { authRouter } from './routes/auth.js';
import { employeesRouter } from './routes/employees.js';
import { appointmentsRouter } from './routes/appointments.js';
import { pushRouter } from './routes/push.js';

const here = dirname(fileURLToPath(import.meta.url));
// Nicht 3000: Docker Desktop belegt auf Entwicklungsrechnern haeufig
// 127.0.0.1:3000 und faengt dann die Aufrufe an localhost ab.
const PORT = Number(process.env.PORT || 4000);
const app = express();

// Hinter dem Reverse Proxy (nginx/Caddy) muss Express der Herkunfts-IP aus
// X-Forwarded-For trauen – sonst sähen alle Rate-Limits nur die Proxy-IP.
if (process.env.TRUST_PROXY === 'true') app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // Vite bündelt die Styles, aber React setzt vereinzelt inline-Styles.
      styleSrc:   ["'self'", "'unsafe-inline'"],
      scriptSrc:  ["'self'"],
      imgSrc:     ["'self'", 'data:', 'blob:'],
      fontSrc:    ["'self'"],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  // Sonst blockiert der Browser das Laden der Kartenlinks in neuen Tabs.
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
}));

app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());

// Grundschutz für die gesamte API. Der Login hat zusätzlich sein eigenes,
// deutlich engeres Limit (siehe routes/auth.js).
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Anfragen. Bitte kurz warten.' },
}));

app.use(loadUser);

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch {
    res.status(503).json({ ok: false, error: 'Datenbank nicht erreichbar.' });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/appointments', appointmentsRouter);
app.use('/api/push', pushRouter);

app.use('/api', (_req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt.' }));

// Im Produktivbetrieb liefert derselbe Prozess auch die gebaute PWA aus,
// damit Cookies ohne CORS funktionieren und nur ein Port offen sein muss.
const webDist = join(here, '..', '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist, {
    setHeaders(res, path) {
      // Der Service Worker darf nie aus dem Cache kommen, sonst bleibt eine
      // alte App-Version für immer auf dem Handy stehen.
      if (path.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  // Client-seitiges Routing: alles Unbekannte bekommt die index.html.
  app.get('*', (_req, res) => res.sendFile(join(webDist, 'index.html')));
} else {
  console.warn('[web] Kein Build gefunden – im Entwicklungsmodus übernimmt das Vite (Port 5173).');
}

app.use((err, _req, res, _next) => {
  console.error('[fehler]', err);
  res.status(500).json({ error: 'Unerwarteter Serverfehler.' });
});

await migrate();
// Frische Installation: ersten Chef-Zugang anlegen und die PIN ausgeben.
logBootstrap(await ensureChefAccount());

// Abgelaufene Sitzungen einmal beim Start und danach stündlich aufräumen.
purgeExpiredSessions().catch(() => {});
setInterval(() => { purgeExpiredSessions().catch(() => {}); }, 60 * 60 * 1000).unref();

const server = app.listen(PORT, () => {
  console.log(`Hausmeisterdienst HD – Terminplanung läuft auf Port ${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => pool.end().then(() => process.exit(0)));
  });
}
