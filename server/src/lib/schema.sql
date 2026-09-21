-- Hausmeisterdienst HD – Terminplanung
-- Schema ist idempotent: kann bei jedem Start erneut ausgeführt werden.

CREATE TABLE IF NOT EXISTS employees (
  id            SERIAL PRIMARY KEY,
  name          TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'mitarbeiter'
                            CHECK (role IN ('chef', 'mitarbeiter')),
  pin_hash      TEXT        NOT NULL,
  color         TEXT        NOT NULL DEFAULT '#10712A',
  phone         TEXT,
  active        BOOLEAN     NOT NULL DEFAULT TRUE,
  -- Brute-Force-Schutz pro Konto (ergänzt das IP-Rate-Limit)
  failed_logins INTEGER     NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Namen dienen als Login-Kennung und müssen daher eindeutig sein,
-- unabhängig von Groß-/Kleinschreibung.
CREATE UNIQUE INDEX IF NOT EXISTS employees_name_unique
  ON employees (lower(name));

CREATE TABLE IF NOT EXISTS appointments (
  id            SERIAL PRIMARY KEY,
  title         TEXT        NOT NULL,
  employee_id   INTEGER     NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
  -- Objekt ist bewusst Freitext: keine Stammdatenpflege, der Chef tippt
  -- Name und/oder Adresse so, wie sie ihm am Telefon genannt werden.
  object        TEXT        NOT NULL DEFAULT '',

  -- Zeitpunkt. starts_at trägt immer das Datum. Die Uhrzeit darin ist
  -- entweder die verbindliche Uhrzeit (time_mode = 'exakt') oder ein
  -- Ankerwert, der nur die Sortierung innerhalb des Tages bestimmt.
  -- timestamptz macht die Sommerzeit-Umstellung korrekt, weil
  -- Europe/Berlin erst bei der Anzeige angewendet wird.
  starts_at     TIMESTAMPTZ NOT NULL,
  -- 'exakt'        = feste Uhrzeit
  -- alles andere   = "ruft an", also nur ein grober Zeitraum
  time_mode     TEXT        NOT NULL DEFAULT 'exakt'
                            CHECK (time_mode IN ('exakt', 'vormittags', 'mittags',
                                                 'nachmittags', 'spanne')),
  -- Nur bei time_mode = 'spanne': Ende der Zeitspanne als "HH:MM".
  -- Der Beginn steckt in der Uhrzeit von starts_at.
  span_end      TEXT        CHECK (span_end IS NULL OR span_end ~ '^[0-2][0-9]:[0-5][0-9]$'),

  notes         TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'geplant'
                            CHECK (status IN ('geplant', 'storniert')),
  created_by    INTEGER              REFERENCES employees (id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT        PRIMARY KEY,
  employee_id INTEGER     NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          SERIAL PRIMARY KEY,
  employee_id INTEGER     NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  endpoint    TEXT        NOT NULL UNIQUE,
  p256dh      TEXT        NOT NULL,
  auth        TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subs_employee_idx
  ON push_subscriptions (employee_id);


-- ===========================================================================
-- Migrationen für Datenbanken, die noch mit dem alten Modell angelegt wurden
-- (Objekt-Stammdatentabelle, feste Termindauer). Alle Schritte sind
-- idempotent und laufen bei jedem Start folgenlos mit.
-- ===========================================================================

-- 1. Objekt: vom Fremdschlüssel auf Freitext.
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS object TEXT NOT NULL DEFAULT '';

DO $migration$
BEGIN
  -- Bestehende Zuordnungen in den Freitext übernehmen, bevor die Tabelle fällt.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_name = 'appointments' AND column_name = 'object_id')
     AND EXISTS (SELECT 1 FROM information_schema.tables
                  WHERE table_name = 'objects') THEN
    EXECUTE $sql$
      UPDATE appointments a
         SET object = concat_ws(', ',
               o.name,
               nullif(o.street, ''),
               nullif(btrim(concat_ws(' ', o.zip, o.city)), ''))
        FROM objects o
       WHERE o.id = a.object_id
         AND a.object = ''
    $sql$;
  END IF;
END
$migration$;

DROP INDEX IF EXISTS appointments_object_idx;
ALTER TABLE appointments DROP COLUMN IF EXISTS object_id;
DROP TABLE IF EXISTS objects;

-- 2. Termindauer entfällt – ein Termin hat nur noch einen Zeitpunkt.
ALTER TABLE appointments DROP COLUMN IF EXISTS duration_min;

-- 3. Zeitangabe: feste Uhrzeit oder grober Zeitraum ("ruft an").
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS time_mode TEXT NOT NULL DEFAULT 'exakt';
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS span_end TEXT;

DO $migration$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'appointments_time_mode_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_time_mode_check
      CHECK (time_mode IN ('exakt', 'vormittags', 'mittags', 'nachmittags', 'spanne'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'appointments_span_end_check') THEN
    ALTER TABLE appointments ADD CONSTRAINT appointments_span_end_check
      CHECK (span_end IS NULL OR span_end ~ '^[0-2][0-9]:[0-5][0-9]$');
  END IF;
END
$migration$;


-- Indizes zuletzt: sie beziehen sich auf die migrierten Spalten.
CREATE INDEX IF NOT EXISTS appointments_starts_at_idx
  ON appointments (starts_at);
CREATE INDEX IF NOT EXISTS appointments_employee_starts_idx
  ON appointments (employee_id, starts_at) WHERE status = 'geplant';
-- Trägt den Objektfilter, der auf Teiltreffern ohne Beachtung der
-- Groß-/Kleinschreibung arbeitet.
CREATE INDEX IF NOT EXISTS appointments_object_text_idx
  ON appointments (lower(object));
