import { Router } from 'express';
import { z } from 'zod';
import { many, one, query } from '../lib/db.js';
import { hashPin, requireAuth, requireChef } from '../lib/auth.js';
import { protokolliere } from '../lib/aktionslog.js';

export const employeesRouter = Router();

const bodySchema = z.object({
  name: z.string().trim().min(2, 'Name ist zu kurz.').max(80),
  role: z.enum(['chef', 'mitarbeiter']).default('mitarbeiter'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10712A'),
  phone: z.string().trim().max(40).optional().default(''),
  active: z.boolean().default(true),
  pin: z.string().regex(/^\d{5}$/, 'Die PIN besteht aus 5 Ziffern.').optional(),
});

/** Alle Mitarbeiter. Die Mitarbeiter-PWA braucht die Namen für die Anzeige. */
employeesRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const chef = req.user.role === 'chef';
    res.json(await many(
      chef
        ? `SELECT id, name, role, color, phone, active,
                  (locked_until IS NOT NULL AND locked_until > now()) AS locked
             FROM employees ORDER BY active DESC, name`
        : 'SELECT id, name, color FROM employees WHERE active ORDER BY name',
    ));
  } catch (err) { next(err); }
});

employeesRouter.post('/', requireChef, async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const d = parsed.data;
    if (!d.pin) return res.status(400).json({ error: 'Bitte eine Start-PIN vergeben.' });

    const row = await one(
      `INSERT INTO employees (name, role, color, phone, active, pin_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, role, color, phone, active`,
      [d.name, d.role, d.color, d.phone, d.active, await hashPin(d.pin)],
    );
    protokolliere(req.user, 'Mitarbeiter angelegt',
      `${row.name} (#${row.id}) · Rolle ${row.role}${row.active ? '' : ' · inaktiv'}`);
    res.status(201).json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Diesen Namen gibt es schon.' });
    }
    next(err);
  }
});

employeesRouter.put('/:id', requireChef, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const parsed = bodySchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.issues[0].message });
    }
    const d = parsed.data;

    const before = await one(
      'SELECT id, name, role, color, phone, active FROM employees WHERE id = $1', [id],
    );
    if (!before) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden.' });

    // Der letzte aktive Chef darf sich nicht selbst aussperren.
    if (d.role === 'mitarbeiter' || d.active === false) {
      const { count } = await one(
        `SELECT count(*)::int AS count FROM employees
          WHERE role = 'chef' AND active AND id <> $1`, [id],
      );
      if (before.role === 'chef' && before.active && count === 0) {
        return res.status(409).json({
          error: 'Das ist der letzte aktive Chef – Rolle und Status können nicht geändert werden.',
        });
      }
    }

    const row = await one(
      `UPDATE employees SET
         name   = COALESCE($2, name),
         role   = COALESCE($3, role),
         color  = COALESCE($4, color),
         phone  = COALESCE($5, phone),
         active = COALESCE($6, active),
         pin_hash = COALESCE($7, pin_hash),
         -- Jede PIN-Änderung hebt eine Sperre auf.
         failed_logins = CASE WHEN $7 IS NULL THEN failed_logins ELSE 0 END,
         locked_until  = CASE WHEN $7 IS NULL THEN locked_until  ELSE NULL END,
         updated_at = now()
       WHERE id = $1
       RETURNING id, name, role, color, phone, active`,
      [id, d.name ?? null, d.role ?? null, d.color ?? null, d.phone ?? null,
       d.active ?? null, d.pin ? await hashPin(d.pin) : null],
    );
    if (!row) return res.status(404).json({ error: 'Mitarbeiter nicht gefunden.' });

    const teile = [];
    for (const [feld, name] of [['name', 'Name'], ['role', 'Rolle'], ['color', 'Farbe'], ['phone', 'Telefon']]) {
      if (before[feld] !== row[feld]) teile.push(`${name}: ${before[feld] || '–'} → ${row[feld] || '–'}`);
    }
    if (before.active !== row.active) teile.push(row.active ? 'aktiviert' : 'deaktiviert');
    if (d.pin) teile.push('PIN neu gesetzt');
    protokolliere(req.user, 'Mitarbeiter geändert',
      `${row.name} (#${row.id}) · ${teile.join(' · ') || 'keine inhaltliche Änderung'}`);
    res.json(row);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Diesen Namen gibt es schon.' });
    }
    next(err);
  }
});

/** Kontosperre nach Fehlversuchen sofort aufheben. */
employeesRouter.post('/:id/unlock', requireChef, async (req, res, next) => {
  try {
    const emp = await one(
      `UPDATE employees SET failed_logins = 0, locked_until = NULL WHERE id = $1
       RETURNING id, name`,
      [Number(req.params.id)],
    );
    if (emp) protokolliere(req.user, 'Sperre aufgehoben', `${emp.name} (#${emp.id})`);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

/**
 * Löschen nur, solange keine Termine hängen – sonst deaktivieren.
 * So bleibt die Terminhistorie in jedem Fall lesbar.
 */
employeesRouter.delete('/:id', requireChef, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.user.id) {
      return res.status(409).json({ error: 'Das eigene Konto kann nicht gelöscht werden.' });
    }
    const emp = await one('SELECT id, name FROM employees WHERE id = $1', [id]);
    const { count } = await one(
      'SELECT count(*)::int AS count FROM appointments WHERE employee_id = $1', [id],
    );
    if (count > 0) {
      await query('UPDATE employees SET active = FALSE, updated_at = now() WHERE id = $1', [id]);
      if (emp) {
        protokolliere(req.user, 'Mitarbeiter deaktiviert',
          `${emp.name} (#${emp.id}) · statt Löschung, ${count} Termin(e) vorhanden`);
      }
      return res.json({ ok: true, deactivated: true, appointments: count });
    }
    await query('DELETE FROM employees WHERE id = $1', [id]);
    if (emp) protokolliere(req.user, 'Mitarbeiter gelöscht', `${emp.name} (#${emp.id})`);
    res.json({ ok: true, deactivated: false });
  } catch (err) { next(err); }
});
