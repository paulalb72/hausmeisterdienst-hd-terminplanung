# Hausmeisterdienst HD – Terminplanung

Terminplanung für Hausmeisterdienst HD, Frankfurt am Main.
Eine Anwendung, drei Oberflächen, eine gemeinsame Datenbasis:

| Oberfläche | Rolle | Zweck |
|---|---|---|
| **PWA mobil** | Chef | Termin nach Anruf in Sekunden anlegen, bearbeiten, verschieben, stornieren |
| **PWA mobil** | Mitarbeiter | Nur die eigenen Termine – Liste, Kalender, Detail |
| **Disposition** | Chef | Wochenboard: Mitarbeiter in den Zeilen, Tage in den Spalten, Drag & Drop |

Die Rolle entscheidet beim Anmelden, was jemand sieht. Es gibt keine zweite App
zum Installieren und keine getrennte Adresse.

---

## Technik in einem Absatz

Backend: Node.js 20+, Express, PostgreSQL (`pg`, kein ORM). Frontend: React 18
mit Vite, als installierbare PWA mit Service Worker und Web-Push. Anmeldung über
Name + 5-stellige PIN, bcrypt-gehasht, Sitzung in einem `httpOnly`-Cookie.
Im Produktivbetrieb liefert derselbe Node-Prozess API und Web-Oberfläche aus –
ein Port, keine CORS-Konfiguration.

---

## Schnellstart (lokal)

Voraussetzung: Node.js 20 oder neuer und eine erreichbare PostgreSQL-Datenbank.
Wer keine zur Hand hat, startet die mitgelieferte Entwicklungsdatenbank:

```bash
docker compose -f docker-compose.dev.yml up -d
# DATABASE_URL=postgres://hd_user:devpw@localhost:55432/hd_dispo
```

```bash
# 1. Backend einrichten
cd server
npm install
cp .env.example .env          # DATABASE_URL eintragen
npm run genkeys               # VAPID-Schlüssel erzeugen, Ausgabe in .env eintragen
npm run seed                  # Schema anlegen + Chef-Zugang

# 2. Frontend
cd ../web
npm install
npm run build                 # oder: npm run dev  (Vite auf Port 5173)

# 3. Starten
cd ../server
npm start                     # http://localhost:4000
```

`npm run seed` legt den Chef-Zugang an und gibt eine **zufällig erzeugte PIN**
aus – sie erscheint nur dieses eine Mal. Wer eine feste PIN will, setzt vorher
`SEED_CHEF_PIN` in der `.env`. Nach der ersten Anmeldung unter *Mehr → PIN
ändern* eine eigene vergeben.

**Entwicklung:** `npm run dev` im `server`-Ordner und `npm run dev` im
`web`-Ordner parallel. Vite läuft auf 5173 und leitet `/api` an 4000 weiter,
damit die Sitzungs-Cookies same-origin bleiben.

---

## Deployment mit Docker

Das Repository bringt alles mit: ein mehrstufiges `Dockerfile` und einen
fertigen Stack aus Anwendung und Datenbank.

```bash
cp .env.example .env        # POSTGRES_PASSWORD setzen
docker compose up -d --build
docker compose logs app     # hier steht die PIN fuer die erste Anmeldung
```

Beim **allerersten Start** legt der Server selbst einen Chef-Zugang an und
schreibt eine zufaellig erzeugte PIN ins Log – einmalig, sie erscheint nie
wieder. Wer die PIN vorgeben will, setzt `SEED_CHEF_PIN`. Bei jedem weiteren
Start passiert nichts, der Zugang wird nicht ueberschrieben.

Web-Push-Schluessel erzeugen und in die `.env` uebernehmen:

```bash
docker compose run --rm --no-deps app npm run genkeys
```

Das Image laeuft als Benutzer `node` (nicht root), nutzt `tini` als PID 1 fuer
sauberes Herunterfahren und bringt einen Healthcheck mit, der auch die
Datenbankverbindung prueft.

> **Fallstrick:** `POSTGRES_PASSWORD` wirkt nur, wenn das Datenverzeichnis noch
> leer ist. Wer das Passwort spaeter aendert, muss es in Postgres selbst
> aendern (`ALTER USER hd_user WITH PASSWORD '…'`) – sonst startet die
> Anwendung mit `password authentication failed`.

Der Stack veroeffentlicht den Port bewusst nur auf `127.0.0.1`. Nach aussen
gehoert ein Reverse Proxy mit TLS davor (siehe unten) – **ohne HTTPS gibt es
weder Service Worker noch Push, und die Anmeldung scheitert**, weil das
Sitzungs-Cookie `Secure` traegt.

---

## Web-Push-Schlüssel erzeugen

Web-Push braucht ein VAPID-Schlüsselpaar. Es wird **einmal** erzeugt und bleibt
dann bestehen: Wird es später ausgetauscht, verlieren alle Handys ihr Abo und
müssen die Benachrichtigungen neu einschalten.

Der schnellste Weg, ohne das Projekt auszuchecken – läuft auf jedem Rechner
mit Docker und gibt direkt einfügefertige Zeilen aus:

```bash
docker run --rm -w /tmp node:22-alpine sh -c   "npm install web-push --silent >/dev/null 2>&1;    node -e \"const k=require('web-push').generateVAPIDKeys();    console.log('VAPID_PUBLIC_KEY='+k.publicKey);    console.log('VAPID_PRIVATE_KEY='+k.privateKey)\""
```

Alternativ aus dem Projekt heraus:

```bash
cd server && npm run genkeys              # lokal
docker compose run --rm --no-deps app npm run genkeys   # im Container
```

Beide Werte als Umgebungsvariablen hinterlegen. Der **private** Schlüssel ist
ein Geheimnis und gehört nicht ins Git. Fehlen die Schlüssel, startet die
Anwendung trotzdem – dann sind lediglich die Benachrichtigungen aus, und das
Log sagt es.

---

## Die erste Anmeldung

Beim allerersten Start – wenn die Mitarbeitertabelle noch leer ist – legt der
Server einen Chef-Zugang an. Zwei Wege:

**Empfohlen: PIN vorher festlegen.** `SEED_CHEF_PIN` auf eine fünfstellige
Zahl setzen, bevor zum ersten Mal deployt wird. Dann ist die PIN bekannt und
niemand muss im Log suchen. Nach der ersten Anmeldung unter *Mehr → PIN
ändern* eine eigene vergeben und die Variable wieder entfernen.

**Oder: PIN aus dem Log holen.** Bleibt `SEED_CHEF_PIN` leer, erzeugt der
Server eine zufällige PIN und schreibt sie beim Start in die Logausgabe:

```
================================================================
  ERSTE INBETRIEBNAHME – Chef-Zugang wurde angelegt
  Name: Chef
  PIN:  64178
================================================================
```

In Coolify steht das unter *Logs* der Anwendung, bei Docker unter
`docker compose logs app`.

> Diese Zeile erscheint **nur ein einziges Mal**. Bei jedem weiteren Start
> passiert nichts mehr, weil der Zugang bereits existiert. Wer sie verpasst,
> setzt die PIN mit `npm run reset-pin` neu (siehe *Wartung*).

---

## Deployment mit Coolify

Coolify uebernimmt Reverse Proxy, Zertifikat und Neustarts. Zwei Wege, der
erste ist der empfohlene.

### Variante A: Dockerfile + verwaltete Datenbank (empfohlen)

Coolify sichert seine eigenen Datenbanken automatisch – das spricht dafuer,
Postgres nicht im Compose-Stack mitlaufen zu lassen.

1. **Datenbank anlegen:** *New Resource → Database → PostgreSQL*. Nach dem
   Start die **interne** Verbindungs-URL kopieren (Hostname ist der
   Servicename, erreichbar nur im Coolify-Netz).
2. **Anwendung anlegen:** *New Resource → Application → Public/Private
   Repository*. Als Build Pack **Dockerfile** waehlen, Branch setzen.
3. **Port:** unter *Ports Exposes* die **4000** eintragen.
4. **Umgebungsvariablen** setzen:

   | Variable | Wert |
   |---|---|
   | `DATABASE_URL` | interne URL aus Schritt 1 |
   | `NODE_ENV` | `production` |
   | `PORT` | `4000` |
   | `TRUST_PROXY` | `true` |
   | `VAPID_PUBLIC_KEY` | aus `npm run genkeys` |
   | `VAPID_PRIVATE_KEY` | aus `npm run genkeys` |
   | `VAPID_SUBJECT` | `mailto:info@hausmeister-service-frankfurt.de` |
   | `SEED_CHEF_NAME` | `Chef` |

   `SEED_CHEF_PIN` bleibt leer – dann erzeugt der Server eine Zufalls-PIN.
5. **Domain** eintragen, z. B. `termine.hausmeister-service-frankfurt.de`.
   Coolify holt das Let's-Encrypt-Zertifikat selbst. Der DNS-A-Record muss
   vorher auf den Server zeigen.
6. **Health Check:** Pfad `/api/health`, Port `4000`. Das Image bringt
   zusaetzlich einen eigenen Docker-Healthcheck mit.
7. **Deploy** – danach einmal in die Logs sehen: dort steht die PIN fuer die
   erste Anmeldung.

`TRUST_PROXY=true` ist hier **nicht optional**. Coolify setzt einen Proxy
davor; ohne die Variable sieht die Anwendung nur dessen IP und das
Anmelde-Rate-Limit wuerde alle Mitarbeiter gemeinsam aussperren.

### Variante B: Docker Compose

*New Resource → Application → Docker Compose*, als Datei `docker-compose.yml`
waehlen. Die Variablen aus `.env.example` in der Coolify-Oberflaeche setzen
(mindestens `POSTGRES_PASSWORD`). Coolify verwaltet dann auch die Datenbank
als Teil des Stacks – die Sicherung liegt damit bei dir.

### Nach dem Deploy

1. Domain im Browser oeffnen, als **Chef** mit der PIN aus dem Log anmelden.
2. Sofort unter *Mehr → PIN aendern* eine eigene PIN vergeben.
3. Unter *Mehr → Mitarbeiter* die Mitarbeiter mit Start-PINs anlegen.
4. Auf jedem Handy die App installieren und die Benachrichtigungen
   einschalten (siehe unten).

### Aktualisieren

Neuen Stand ins Git schieben und in Coolify *Redeploy* druecken. Das
Datenbankschema bringt sich beim Start selbst auf Stand – die Migrationen in
`schema.sql` sind idempotent und laufen bei jedem Start folgenlos mit.

---

## Deployment ohne Docker (klassisch auf der Hetzner-Instanz)

### 1. Datenbank anlegen

```bash
sudo -u postgres psql
```
```sql
CREATE USER hd_user WITH PASSWORD 'HIER_EIN_LANGES_PASSWORT';
CREATE DATABASE hd_dispo OWNER hd_user;
\q
```

Das Schema legt die App beim ersten Start selbst an – `schema.sql` ist
idempotent und läuft bei jedem Start erneut durch.

### 2. Code ausrollen

```bash
sudo mkdir -p /opt/hd-dispo && sudo chown $USER /opt/hd-dispo
# Projektordner nach /opt/hd-dispo kopieren, dann:
cd /opt/hd-dispo/server && npm ci --omit=dev
cd /opt/hd-dispo/web    && npm ci && npm run build
```

### 3. Konfiguration

`/opt/hd-dispo/server/.env`:

```ini
DATABASE_URL=postgres://hd_user:PASSWORT@localhost:5432/hd_dispo
PORT=4000
NODE_ENV=production
TRUST_PROXY=true
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:info@hausmeister-service-frankfurt.de
```

```bash
chmod 600 /opt/hd-dispo/server/.env   # enthält Datenbankpasswort und Push-Schlüssel
cd /opt/hd-dispo/server && npm run seed
```

### 4. systemd-Dienst

`/etc/systemd/system/hd-dispo.service`:

```ini
[Unit]
Description=Hausmeisterdienst HD Terminplanung
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/hd-dispo/server
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Absicherung
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/hd-dispo

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now hd-dispo
sudo systemctl status hd-dispo
```

### 5. Reverse Proxy mit HTTPS

**HTTPS ist Pflicht, nicht optional.** Ohne TLS registriert der Browser keinen
Service Worker, es gibt keine Installation auf dem Home-Bildschirm und keine
Push-Benachrichtigungen. Außerdem sendet der Server das Sitzungs-Cookie mit
`Secure`, sobald `NODE_ENV=production` gesetzt ist – über `http://` käme also
gar keine Anmeldung zustande.

Caddy erledigt das Zertifikat von allein. `/etc/caddy/Caddyfile`:

```
termine.hausmeister-service-frankfurt.de {
    reverse_proxy localhost:4000
    encode gzip zstd
}
```

Mit nginx stattdessen:

```nginx
server {
    listen 443 ssl http2;
    server_name termine.hausmeister-service-frankfurt.de;

    ssl_certificate     /etc/letsencrypt/live/DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/DOMAIN/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        # Ohne diesen Header sehen alle Rate-Limits nur die Proxy-IP.
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
server {
    listen 80;
    server_name termine.hausmeister-service-frankfurt.de;
    return 301 https://$host$request_uri;
}
```

`TRUST_PROXY=true` gehört dazu, sonst zählt das Rate-Limit alle Mitarbeiter
als einen einzigen Absender.

### 6. Sicherung

```bash
# Täglich per cron
pg_dump -U hd_user hd_dispo | gzip > /var/backups/hd_dispo_$(date +\%F).sql.gz
```

---

## Installation auf den Handys

1. Adresse im Browser öffnen und anmelden.
2. **Android/Chrome:** Menü → *App installieren*.
   **iPhone/Safari:** *Teilen* → *Zum Home-Bildschirm*.
3. Die App vom Home-Bildschirm starten.
4. Unter *Mehr → Benachrichtigungen* auf **Ein** tippen.

> **Wichtig für iPhones:** Push funktioniert ausschließlich, wenn die App
> vorher zum Home-Bildschirm hinzugefügt wurde. In einem normalen Safari-Tab
> bietet iOS die Berechtigung gar nicht erst an. Die App weist im
> Einstellungsbereich darauf hin.

---

## Wie die Dinge funktionieren

### Rollen

| | Chef | Mitarbeiter |
|---|---|---|
| Eigene Termine sehen | ✓ | ✓ |
| Termine aller Mitarbeiter sehen | ✓ | – |
| Termine anlegen, ändern, verschieben, stornieren | ✓ | – |
| Planungsboard | ✓ | – |
| Mitarbeiter verwalten | ✓ | – |

Die Trennung erzwingt der Server. Ein Mitarbeiter bekommt fremde Termine auch
dann nicht, wenn er die API direkt anspricht – die Einschränkung auf die eigene
Person sitzt in der SQL-Abfrage, nicht in der Oberfläche.

### Anmeldung und Brute-Force-Schutz

Zwei voneinander unabhängige Ebenen:

- **Pro IP:** 10 Anmeldeversuche in 15 Minuten. Erfolgreiche zählen nicht mit,
  damit sich ein voll besetzter Transporter im selben Mobilfunknetz nicht
  gegenseitig aussperrt.
- **Pro Konto:** nach 5 Fehlversuchen 15 Minuten gesperrt. Das greift auch,
  wenn ein Angreifer die IP wechselt. Der Chef hebt die Sperre in der
  Mitarbeiterverwaltung mit einem Klick sofort auf; eine neue PIN entsperrt
  ebenfalls.

Die Fehlermeldung ist bei falschem Namen und falscher PIN identisch, damit sich
nicht durchprobieren lässt, welche Konten existieren.

### Zeitzonen

Die Datenbank speichert `timestamptz`, also absolute Zeitpunkte in UTC.
Angezeigt und eingegeben wird in der Zeitzone des Geräts. Dadurch stimmen
Termine über die Sommerzeit-Umstellung hinweg, ohne dass irgendwo gerechnet
werden muss.

### Ein Termin

Ein Termin besteht aus Bezeichnung, Mitarbeiter, Objekt, Datum und Zeitangabe –
mehr nicht. Insbesondere gibt es **keine Dauer**: Im Planungsboard ist jeder
Termin gleich hoch.

**Objekt ist Freitext.** Es gibt keine Objekt-Stammdaten und nichts zu pflegen.
Der Chef tippt Name und/oder Adresse so, wie sie ihm am Telefon genannt werden.
Damit niemand dieselbe Adresse zweimal eintippen muss, schlägt das Feld bereits
verwendete Bezeichnungen vor – das ist reine Eingabehilfe, keine Tabelle.

### Uhrzeit oder Zeitraum ("Ruft an?")

Steht die Uhrzeit fest, wird sie eingetragen. Ruft der Kunde stattdessen von
sich aus an, setzt der Chef den Haken **„Ruft an?"** und wählt einen groben
Zeitraum:

| Auswahl | Anzeige | Kurzform im Board |
|---|---|---|
| Vormittags | Vormittags | Vorm. |
| Mittags | Mittags | Mittag |
| Nachmittags | Nachmittags | Nachm. |
| Benutzerdefiniert | z. B. 09:00 – 12:30 | 09–12:30 |

Technisch trägt `starts_at` immer das Datum. Bei einer festen Uhrzeit ist die
Zeit darin verbindlich; bei einem Zeitraum ist sie nur ein **Ankerwert**, der
die Reihenfolge innerhalb des Tages bestimmt (vormittags 08:00, mittags 12:00,
nachmittags 14:00). Angezeigt wird immer das Wort. Bei „Benutzerdefiniert"
steht der Beginn in `starts_at` und das Ende in `span_end`.

Termine mit Zeitraum gelten erst nach Tagesende als vorbei – man weiß ja nicht,
wann genau am Vormittag der Kunde anruft.

### Stornieren statt Löschen

„Stornieren" setzt den Status auf `storniert`. Beim Mitarbeiter verschwindet der
Termin, in der Disposition bleibt er schraffiert sichtbar. Endgültiges Löschen
gibt es zusätzlich – für versehentlich angelegte Termine.

Dasselbe Prinzip bei Stammdaten: Ein Mitarbeiter oder Objekt mit Terminhistorie
wird beim Löschversuch nur deaktiviert. So bleibt nachvollziehbar, wer wann wo
war, und keine Fremdschlüssel brechen.

### Planungsboard

Zeilen sind die Mitarbeiter, Spalten die sieben Tage von Montag bis Sonntag.
Die Termine eines Tages stapeln sich untereinander und sind **alle gleich
hoch** – es gibt keine Dauer, die eine unterschiedliche Höhe rechtfertigen
würde.

- **Ziehen** verschiebt auf einen anderen Mitarbeiter und/oder Tag. Die
  Zeitangabe bleibt dabei unverändert; sie wird im Termin selbst gepflegt.
- **Klick auf einen Block** öffnet den Termin, **Klick auf freie Fläche** legt
  einen neuen an – Mitarbeiter und Tag sind dann schon ausgefüllt.
- **Filter** nach Mitarbeiter (Auswahlliste) und Objekt (Freitextsuche,
  Teiltreffer ohne Beachtung der Groß-/Kleinschreibung).

Auf dem Handy ist der Dispo-Reiter ausgeblendet, weil das Board Maus und
Breite braucht. Die Route bleibt per Direktlink erreichbar. Maße und
Blockhöhe stehen oben in [web/src/pages/Dispo.jsx](web/src/pages/Dispo.jsx).

### Benachrichtigungen

Der Mitarbeiter bekommt Push bei: neuem Termin, Verschiebung, Änderung von
Bezeichnung/Auftrag/Objekt, Stornierung und Löschung. Wechselt ein Termin den
Mitarbeiter, werden beide informiert – der eine, dass er ihn los ist, der andere,
dass er ihn hat.

Ein fehlgeschlagener Push lässt das Speichern nie scheitern. Geräte, die ihr Abo
verworfen haben (HTTP 404/410), werden automatisch aus der Datenbank entfernt.

### Offline

Der Service Worker hält die App-Hülle und die zuletzt geladenen Termine vor.
Im Funkloch sieht der Mitarbeiter also weiterhin seine Einsätze. Anmeldung und
Änderungen brauchen eine Verbindung.

---

## Projektstruktur

```
Dockerfile                  Mehrstufiges Image (Oberfläche bauen → Server)
docker-compose.yml          Produktivstack: Anwendung + Datenbank
docker-compose.dev.yml      Nur die Entwicklungsdatenbank
.env.example                Vorlage für die Compose-Konfiguration

server/
  src/
    index.js              Express-Aufbau, Auslieferung der PWA, Rate-Limits
    lib/
      schema.sql          Datenbankschema (idempotent)
      db.js               Einziger Ort mit SQL-Zugriff
      auth.js             PIN-Hashing, Sitzungen, Rollenprüfung
      push.js             Web-Push-Versand
      migrate.js          Schema anlegen
      bootstrap.js        Ersten Chef-Zugang anlegen (Zufalls-PIN)
      seed.js             Dasselbe von Hand, für lokale Installationen
      reset-pin.js        PIN eines Zugangs zurücksetzen und entsperren
      genkeys.js          VAPID-Schlüssel erzeugen
    routes/
      auth.js             Anmelden, Abmelden, PIN ändern
      employees.js        Mitarbeiterverwaltung
      appointments.js     Termine, Verschieben, Stornieren, Objektvorschläge
      push.js             Geräte an- und abmelden

web/
  src/
    theme.css             Corporate Design (Farben, Schriften, Buttons)
    app.css               Layout, Listen, Kalender, Formulare
    dispo.css             Planungsboard
    lib/
      api.js              API-Client
      dates.js            Datums- und Zeitwerkzeuge
      termin.js           Uhrzeit vs. Zeitraum ("ruft an")
      auth.jsx            Anmeldezustand
      push.js             Push im Browser einrichten
    components/           Shell, Icons, Modal, Toast, Terminkarte
    pages/
      Login.jsx           Name wählen + PIN
      Termine.jsx         Terminliste mit Filtern
      Kalender.jsx        Monatskalender
      TerminDetail.jsx    Detailansicht
      TerminForm.jsx      Anlegen und Bearbeiten
      Dispo.jsx           Wochenboard mit Drag & Drop
      Mitarbeiter.jsx     Mitarbeiterverwaltung
      Mehr.jsx            Push, PIN ändern, Abmelden
  public/
    sw.js                 Service Worker (Offline + Push)
    manifest.webmanifest  PWA-Manifest
  tools/make-icons.mjs    Erzeugt die PWA-Icons aus der Bildmarke
```

---

## Corporate Design

Übernommen aus dem Stylesheet von hausmeister-service-frankfurt.de.
Alle Werte stehen als CSS-Variablen in [web/src/theme.css](web/src/theme.css).

| | Wert |
|---|---|
| Primärgrün | `#10712A` |
| Überschriften | `#11772B` |
| Hover | `#07692A` |
| Logo-Verlauf | `#2D9537 → #1B6C30` |
| Grünschleier | `#E7F1EA` |
| Anthrazit | `#2D2D2D` |
| Akzent | `#EABD00` |
| Warnrot | `#C81410` |

Schriften: **Anton** für Überschriften, **Lato** für Fließtext, **Caveat** als
handschriftlicher Akzent. Alle drei liegen als `woff2` im Projekt – kein
Google-CDN, damit die PWA offline funktioniert und keine Daten abfließen.

Prägend für die Marke sind **eckige Kanten**: `--radius: 0`. Nur Chips und
Avatare sind rund.

Logo als `bildmarke.svg` (Haus mit „HD") und `wortmarke.svg` (Schriftzug mit
Claim) in `web/src/assets/logo/`. Beide sind dunkel angelegt und werden auf
grünem Grund per `filter: brightness(0) invert(1)` weiß gefärbt – so gibt es
nur eine Datei je Marke statt zweier Farbvarianten.

Verwendung: Anmeldeseite zeigt beide Teile untereinander, die Kopfzeile nur
die Bildmarke (quadratisch, lässt Platz für den Seitentitel). Die App-Icons
sind aus der Bildmarke gerendert – `web/tools/make-icons.mjs` erzeugt sie neu,
falls sich das Logo ändert.

---

## Wartung

```bash
# Logs
journalctl -u hd-dispo -f

# Neu ausrollen (ohne Docker)
cd /opt/hd-dispo/web && npm ci && npm run build
sudo systemctl restart hd-dispo

# Neu ausrollen (mit Docker)
docker compose up -d --build

# Gesundheitsprüfung (prüft auch die Datenbankverbindung)
curl https://DOMAIN/api/health     # {"ok":true}
```

Abgelaufene Sitzungen räumt die App stündlich selbst auf.

### PIN vergessen

Chef → *Mehr* → *Mitarbeiter* → Stift-Symbol → neue PIN eintragen. Das hebt eine
bestehende Sperre gleich mit auf.

Ist die PIN **des Chefs** verloren, gibt es dafür ein Wartungsskript:

```bash
# Mit Docker / Coolify
docker compose exec app npm run reset-pin -- "Chef" 40721

# Ohne Docker
cd /opt/hd-dispo/server && npm run reset-pin -- "Chef" 40721
```

Ohne PIN als zweites Argument wird eine zufällige erzeugt und ausgegeben, ohne
jedes Argument listet das Skript die vorhandenen Zugänge auf. Es hebt eine
bestehende Kontosperre auf und beendet alle offenen Sitzungen dieses Zugangs –
wer die alte PIN kannte, bleibt also nicht angemeldet.
