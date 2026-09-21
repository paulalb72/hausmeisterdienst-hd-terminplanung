# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stufe 1 – Oberflaeche bauen
# ---------------------------------------------------------------------------
FROM node:22-alpine AS web
WORKDIR /build/web

# Erst die Manifeste kopieren: solange sie sich nicht aendern, bleibt die
# Installationsschicht im Cache und der Neubau dauert Sekunden.
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/index.html web/vite.config.js ./
COPY web/public ./public
COPY web/src ./src
RUN npm run build

# ---------------------------------------------------------------------------
# Stufe 2 – Server-Abhaengigkeiten (nur Produktion)
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /build/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# Stufe 3 – Laufzeit
# ---------------------------------------------------------------------------
FROM node:22-alpine

# tini raeumt als PID 1 Zombie-Prozesse ab und reicht SIGTERM sauber weiter,
# damit "docker stop" den Server ordentlich herunterfaehrt.
RUN apk add --no-cache tini wget

ENV NODE_ENV=production \
    PORT=4000

# Arbeitsverzeichnis ist der Serverordner, damit die npm-Skripte im
# Container genauso laufen wie lokal (z. B. "npm run genkeys").
WORKDIR /app/server
COPY --from=deps  /build/server/node_modules ./node_modules
COPY server/package.json server/package-lock.json ./
COPY server/src ./src
# index.js sucht die gebaute Oberflaeche in ../../web/dist, von src aus.
COPY --from=web   /build/web/dist /app/web/dist

# Nicht als root laufen. Der Prozess schreibt nichts auf die Platte,
# Lesezugriff auf die kopierten Dateien genuegt.
USER node

EXPOSE 4000

# Prueft zusaetzlich die Datenbankverbindung, nicht nur den offenen Port.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q --spider "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
