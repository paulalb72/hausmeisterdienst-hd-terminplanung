import { Router } from 'express';
import { z } from 'zod';
import { many, one } from '../lib/db.js';
import { requireAuth, requireChef } from '../lib/auth.js';
import { notifyEmployee } from '../lib/push.js';

export const appointmentsRouter = Router();

// Alle Termine werden dem Nutzer in deutscher Ortszeit angezeigt, in der
// Datenbank liegen sie als UTC. Diese eine Konstante hält das zusammen.
const TZ = 'Europe/Berlin';

const fmtDate = new Intl.DateTimeFormat('de-DE', {
  timeZone: TZ, weekday: 'short', day: '2-digit', month: '2-digit',
});
const fmtTime = new Intl.DateTimeFormat('de-DE', {
  timeZone: TZ, hour: '2-digit', minute: '2-digit',
});

/**
 * Zeitraum-Modi für "ruft an". Der Anker bestimmt nur, wo der Termin
 * innerhalb des Tages einsortiert wird – angezeigt wird das Wort.
 * Muss mit web/src/lib/termin.js übereinstimmen.
 */
export const TIME_MODES = {
  exakt:        { label: null,           anchor: null },
  vormittags:   { label: 'Vormittags',   anchor: '08:00' },
  mittags:      { label: 'Mittags',      anchor: '12:00' },
  nachmittags:  { label: 'Nachmittags',  anchor: '14:00' },
  spanne:       { label: null,           anchor: null },
};

/** "07:30 Uhr" / "Vormittags" / "09:00 – 12:00 Uhr" */
function timeLabel(row) {
  const start = fmtTime.format(new Date(row.starts_at));
  if (row.time_mode === 'exakt') return `${start} Uhr`;
  if (row.time_mode === 'spanne') {
    return row.span_end ? `${start} – ${row.span_end} Uhr` : `ab ${start} Uhr`;
  }
  return TIME_MODES[row.time_mode]?.label || start;
}

/** "Mo., 22.09. um 08:30 Uhr" bzw. "Mo., 22.09. vormittags" – für Push. */
function humanWhen(row) {
  const tag = fmtDate.format(new Date(row.starts_at));
  if (row.time_mode === 'exakt') return `${tag} um ${timeLabel(row)}`;
  return `${tag}, ${timeLabel(row)}`;
}

// Ein Termin mit allen Feldern, die das Handy zum Anzeigen braucht, damit
// die Mitarbeiter-App mit einer einzigen Abfrage auskommt.
const SELECT_FULL = `
  SELECT a.id, a.title, a.starts_at, a.time_mode, a.span_end, a.object,
         a.notes, a.status,
         a.employee_id, e.name AS employee_name, e.color AS employee_color
    FROM appointments a
    JOIN employees e ON e.id = a.employee_id`;

const listQuerySchema = z.object({
  from:       z.string().datetime({ offset: true }).optional(),
  to:         z.string().datetime({ offset: true }).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  object:     z.string().trim().max(200).optional(),
  status:     z.enum(['geplant', 'storniert', 'alle']).default('geplant'),
});

/**
 * Terminliste mit Filtern (Mitarbeiter / Objekt / Zeitraum).
 * Mitarbeiter bekommen ausschließlich die eigenen geplanten Termine –
 * das wird hier serverseitig erzwungen, nicht im Frontend.
 */
appointmentsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Ungültiger Filter.' });
    }
    const f = parsed.data;
    const isChef = req.user.role === 'chef';

    const where = [];
    const params = [];
    const add = (sql, value) => {
      params.push(value);
      where.push(sql.replace('?', `$${params.length}`));
    };

    if (isChef) {
      if (f.employeeId) add('a.employee_id = ?', f.employeeId);
      // Freitext: Teiltreffer ohne Beachtung der Groß-/Kleinschreibung.
      if (f.object) add('a.object ILIKE ?', `%${f.object}%`);
      if (f.status !== 'alle') add('a.status = ?', f.status);
    } else {
      add('a.employee_id = ?', req.user.id);
      where.push(`a.status = 'geplant'`);
    }
    if (f.from) add('a.starts_at >= ?', f.from);
    if (f.to) add('a.starts_at < ?', f.to);

    const sql = `${SELECT_FULL}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.starts_at
      LIMIT 2000`;
    res.json(await many(sql, params));
  } catch (err) { next(err); }
});

/**
 * Bereits verwendete Objektbezeichnungen – füttert die Vorschlagsliste im
 * Formular und den Objektfilter. Ersetzt die frühere Stammdatentabelle:
 * nichts zu pflegen, aber man muss eine Adresse nicht zweimal tippen.
 */
appointmentsRouter.get('/objects/suggestions', requireAuth, async (req, res, next) => {
  try {
    const rows = await many(
      `SELECT object, max(starts_at) AS last_used, count(*)::int AS uses
         FROM appointments
        WHERE object <> ''
        GROUP BY object
        ORDER BY count(*) DESC, max(starts_at) DESC
        LIMIT 200`,
    );
    res.json(rows.map((r) => r.object));
  } catch (err) { next(err); }
});

appointmentsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).json({ error: 'Termin nicht gefunden.' });
    const row = await one(`${SELECT_FULL} WHERE a.id = $1`, [id]);
    if (!row) return res.status(404).json({ error: 'Termin nicht gefunden.' });
    if (req.user.role !== 'chef' &&
        (row.employee_id !== req.user.id || row.status !== 'geplant')) {
      return res.status(404).json({ error: 'Termin nicht gefunden.' });
    }
    res.json(row);
  } catch (err) { next(err); }
});

const createSchema = z.object({
  title:      z.string().trim().min(2, 'Bitte eine Bezeichnung angeben.').max(200),
  employeeId: z.coerce.number().int().positive({ message: 'Bitte einen Mitarbeiter wählen.' }),
  object:     z.string().trim().max(200).default(''),
  startsAt:   z.string().datetime({ offset: true, message: 'Datum/Uhrzeit fehlt.' }),
  timeMode:   z.enum(['exakt', 'vormittags', 'mittags', 'nachmittags', 'spanne']).default('exakt'),
  spanEnd:    z.string().regex(/^[0-2]\d:[0-5]\d$/, 'Ende der Zeitspanne fehlt.')
                .nullable().optional(),
  notes:      z.string().trim().max(4000).default(''),
}).refine((d) => d.timeMode !== 'spanne' || Boolean(d.spanEnd), {
  message: 'Bei einer Zeitspanne muss auch das Ende angegeben werden.',
  path: ['spanEnd'],
});

/** span_end ergibt nur im Modus 'spanne' Sinn – sonst immer leeren. */
const normalizeSpan = (mode, spanEnd) => (mode === 'spanne' ? spanEnd ?? null : null);

appointmentsRouter.post('/', requireChef, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const d = parsed.data;
    const created = await one(
      `INSERT INTO appointments
         (title, employee_id, object, starts_at, time_mode, span_end, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [d.title, d.employeeId, d.object, d.startsAt, d.timeMode,
       normalizeSpan(d.timeMode, d.spanEnd), d.notes, req.user.id],
    );
    const row = await one(`${SELECT_FULL} WHERE a.id = $1`, [created.id]);

    notifyEmployee(row.employee_id, {
      title: 'Neuer Termin',
      body: `${row.title}\n${humanWhen(row)}${row.object ? `\n${row.object}` : ''}`,
      url: `/termin/${row.id}`,
    });

    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Mitarbeiter existiert nicht.' });
    }
    next(err);
  }
});

const updateSchema = z.object({
  title:      z.string().trim().min(2, 'Bitte eine Bezeichnung angeben.').max(200).optional(),
  employeeId: z.coerce.number().int().positive().optional(),
  object:     z.string().trim().max(200).optional(),
  startsAt:   z.string().datetime({ offset: true }).optional(),
  timeMode:   z.enum(['exakt', 'vormittags', 'mittags', 'nachmittags', 'spanne']).optional(),
  spanEnd:    z.string().regex(/^[0-2]\d:[0-5]\d$/).nullable().optional(),
  notes:      z.string().trim().max(4000).optional(),
  status:     z.enum(['geplant', 'storniert']).optional(),
});

/**
 * Bearbeiten, Verschieben und Stornieren in einem. Das Drag & Drop der
 * Disposition schickt hier nur employeeId und startsAt.
 */
appointmentsRouter.put('/:id', requireChef, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const d = parsed.data;

    const before = await one(`${SELECT_FULL} WHERE a.id = $1`, [id]);
    if (!before) return res.status(404).json({ error: 'Termin nicht gefunden.' });

    // Der Modus entscheidet über span_end. Wird nur der Modus geändert, muss
    // eine alte Zeitspanne verschwinden – sonst bliebe sie unsichtbar stehen.
    const mode = d.timeMode ?? before.time_mode;
    if (mode === 'spanne') {
      const ende = d.spanEnd !== undefined ? d.spanEnd : before.span_end;
      if (!ende) {
        return res.status(400).json({ error: 'Bei einer Zeitspanne muss auch das Ende angegeben werden.' });
      }
    }
    const spanEnd = mode === 'spanne'
      ? (d.spanEnd !== undefined ? d.spanEnd : before.span_end)
      : null;

    const row = await one(
      `UPDATE appointments SET
         title       = COALESCE($2, title),
         employee_id = COALESCE($3, employee_id),
         object      = COALESCE($4, object),
         starts_at   = COALESCE($5, starts_at),
         time_mode   = $6,
         span_end    = $7,
         notes       = COALESCE($8, notes),
         status      = COALESCE($9, status),
         updated_at  = now()
       WHERE id = $1
       RETURNING id`,
      [id, d.title ?? null, d.employeeId ?? null, d.object ?? null,
       d.startsAt ?? null, mode, spanEnd, d.notes ?? null, d.status ?? null],
    );
    const after = await one(`${SELECT_FULL} WHERE a.id = $1`, [row.id]);

    await notifyOnChange(before, after);
    res.json(after);
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Mitarbeiter existiert nicht.' });
    }
    next(err);
  }
});

/** Stornieren. Der Termin bleibt für die Historie erhalten. */
appointmentsRouter.post('/:id/cancel', requireChef, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const before = await one(`${SELECT_FULL} WHERE a.id = $1`, [id]);
    if (!before) return res.status(404).json({ error: 'Termin nicht gefunden.' });

    await one(
      `UPDATE appointments SET status = 'storniert', updated_at = now()
        WHERE id = $1 RETURNING id`, [id],
    );
    const after = await one(`${SELECT_FULL} WHERE a.id = $1`, [id]);
    await notifyOnChange(before, after);
    res.json(after);
  } catch (err) { next(err); }
});

/** Endgültig entfernen – für versehentlich angelegte Termine. */
appointmentsRouter.delete('/:id', requireChef, async (req, res, next) => {
  try {
    const row = await one(
      `DELETE FROM appointments WHERE id = $1
       RETURNING id, employee_id, title, starts_at, time_mode, span_end`,
      [Number(req.params.id)],
    );
    if (!row) return res.status(404).json({ error: 'Termin nicht gefunden.' });
    notifyEmployee(row.employee_id, {
      title: 'Termin entfällt',
      body: `${row.title}\n${humanWhen(row)}`,
      url: '/',
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * Entscheidet, wer über welche Änderung informiert wird. Bei einem Wechsel
 * des Mitarbeiters müssen beide Bescheid wissen: der alte, dass er den
 * Termin los ist, der neue, dass er ihn bekommen hat.
 */
async function notifyOnChange(before, after) {
  if (before.status === 'geplant' && after.status === 'storniert') {
    return notifyEmployee(before.employee_id, {
      title: 'Termin storniert',
      body: `${after.title}\n${humanWhen(before)}`,
      url: '/',
    });
  }
  if (after.status !== 'geplant') return;

  if (before.employee_id !== after.employee_id) {
    await notifyEmployee(before.employee_id, {
      title: 'Termin abgegeben',
      body: `${before.title}\n${humanWhen(before)}\nÜbernimmt: ${after.employee_name}`,
      url: '/',
    });
    return notifyEmployee(after.employee_id, {
      title: 'Neuer Termin',
      body: `${after.title}\n${humanWhen(after)}${after.object ? `\n${after.object}` : ''}`,
      url: `/termin/${after.id}`,
    });
  }

  const zeitGeaendert = before.starts_at !== after.starts_at
    || before.time_mode !== after.time_mode
    || before.span_end !== after.span_end;

  if (zeitGeaendert) {
    return notifyEmployee(after.employee_id, {
      title: 'Termin verschoben',
      body: `${after.title}\nNeu: ${humanWhen(after)}`,
      url: `/termin/${after.id}`,
    });
  }

  if (before.title !== after.title || before.notes !== after.notes ||
      before.object !== after.object) {
    return notifyEmployee(after.employee_id, {
      title: 'Termin geändert',
      body: `${after.title}\n${humanWhen(after)}`,
      url: `/termin/${after.id}`,
    });
  }
}
