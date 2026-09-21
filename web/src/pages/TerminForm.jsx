import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  addDays, formatDateShort, fromDateTimeInput, nextQuarterHour, toDateInput,
} from '../lib/dates.js';
import { ZEITRAEUME, zeitAusTermin, zeitFuerServer } from '../lib/termin.js';
import { ErrorBox, Shell, Spinner } from '../components/Shell.jsx';
import { useToast } from '../components/Toast.jsx';

/**
 * Termin anlegen und bearbeiten.
 * Beim Anlegen zaehlt Tempo: Der Chef hat den Kunden am Telefon. Deshalb
 * Schnellwahl fuer das Datum und Vorschlaege fuer das Objekt.
 */
export default function TerminForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const isEdit = Boolean(id);

  const [employees, setEmployees] = useState([]);
  const [objektVorschlaege, setObjektVorschlaege] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(() => {
    // Vorbelegung aus der Disposition: ein Klick auf ein freies Tagesfeld
    // uebergibt Mitarbeiter und Datum per Query-Parameter.
    const start = params.get('start') ? new Date(params.get('start')) : nextQuarterHour();
    return {
      title: '',
      employeeId: params.get('employee') || '',
      object: '',
      date: toDateInput(start),
      // Zeitangabe
      ruftAn: false,
      uhrzeit: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}`,
      zeitraum: 'vormittags',
      von: '08:00',
      bis: '12:00',
      notes: '',
    };
  });

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.employees(),
      api.objectSuggestions().catch(() => []),
      isEdit ? api.appointment(id) : Promise.resolve(null),
    ])
      .then(([emp, objekte, appt]) => {
        if (cancelled) return;
        setEmployees(emp);
        setObjektVorschlaege(objekte);
        if (appt) {
          const start = new Date(appt.starts_at);
          setForm({
            title: appt.title,
            employeeId: String(appt.employee_id),
            object: appt.object || '',
            date: toDateInput(start),
            ...zeitAusTermin(appt),
            notes: appt.notes || '',
          });
        } else if (!params.get('employee')) {
          // Bei genau einem aktiven Mitarbeiter ist die Auswahl ueberfluessig.
          const active = emp.filter((e) => e.active !== false);
          if (active.length === 1) setForm((f) => ({ ...f, employeeId: String(active[0].id) }));
        }
      })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // params bewusst ausgelassen: die Vorbelegung gilt nur beim ersten Aufbau.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isEdit]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active !== false),
    [employees],
  );

  // Schnellwahl fuer die naechsten Tage – der haeufigste Fall am Telefon.
  const quickDays = useMemo(() => {
    const today = new Date();
    return [0, 1, 2, 3].map((offset) => {
      const d = addDays(today, offset);
      return {
        value: toDateInput(d),
        label: offset === 0 ? 'Heute' : offset === 1 ? 'Morgen' : formatDateShort(d),
      };
    });
  }, []);

  async function submit(event) {
    event.preventDefault();
    setError(null);

    if (!form.title.trim()) return setError('Bitte eine Bezeichnung angeben.');
    if (!form.employeeId) return setError('Bitte einen Mitarbeiter wählen.');
    if (!form.date) return setError('Bitte ein Datum angeben.');
    if (!form.ruftAn && !form.uhrzeit) return setError('Bitte eine Uhrzeit angeben.');
    if (form.ruftAn && form.zeitraum === 'spanne') {
      if (!form.von || !form.bis) return setError('Bitte Beginn und Ende der Zeitspanne angeben.');
      if (form.bis <= form.von) return setError('Das Ende der Zeitspanne muss nach dem Beginn liegen.');
    }

    const { zeit, timeMode, spanEnd } = zeitFuerServer(form);
    const payload = {
      title: form.title.trim(),
      employeeId: Number(form.employeeId),
      object: form.object.trim(),
      startsAt: fromDateTimeInput(form.date, zeit),
      timeMode,
      spanEnd,
      notes: form.notes.trim(),
    };

    setSaving(true);
    try {
      if (isEdit) {
        await api.updateAppointment(id, payload);
        toast('Termin gespeichert.');
        navigate(`/termin/${id}`, { replace: true });
      } else {
        const created = await api.createAppointment(payload);
        toast('Termin angelegt.');
        navigate(`/termin/${created.id}`, { replace: true });
      }
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  if (loading) return <Shell title="Termin" back nav={false}><Spinner /></Shell>;

  return (
    <Shell title={isEdit ? 'Termin bearbeiten' : 'Neuer Termin'} back nav={false}>
      <form onSubmit={submit}>
        <ErrorBox error={error} />

        <div className="field">
          <label className="label" htmlFor="t-title">Bezeichnung</label>
          <input
            id="t-title"
            className="input"
            value={form.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="z. B. Treppenhausreinigung"
            maxLength={200}
            autoFocus={!isEdit}
            required
          />
        </div>

        <div className="field">
          <label className="label" htmlFor="t-emp">Mitarbeiter</label>
          <select
            id="t-emp"
            className="select"
            value={form.employeeId}
            onChange={(e) => set({ employeeId: e.target.value })}
            required
          >
            <option value="">– bitte wählen –</option>
            {activeEmployees.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label className="label" htmlFor="t-obj">Objekt</label>
          <input
            id="t-obj"
            className="input"
            list="objekt-vorschlaege"
            value={form.object}
            onChange={(e) => set({ object: e.target.value })}
            placeholder="Name und/oder Adresse"
            maxLength={200}
            autoComplete="off"
          />
          {/* Schon einmal getippte Objekte als Vorschlag – spart das erneute
              Eintippen, ohne dass es Stammdaten zu pflegen gäbe. */}
          <datalist id="objekt-vorschlaege">
            {objektVorschlaege.map((o) => <option key={o} value={o} />)}
          </datalist>
        </div>

        <div className="field">
          <span className="label">Datum</span>
          <div className="row row--wrap" style={{ marginBottom: 8 }}>
            {quickDays.map((d) => (
              <button
                key={d.value}
                type="button"
                className={`btn btn--sm ${form.date === d.value ? '' : 'btn--muted'}`}
                onClick={() => set({ date: d.value })}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            className="input"
            type="date"
            value={form.date}
            onChange={(e) => set({ date: e.target.value })}
            aria-label="Datum"
            required
          />
        </div>

        <ZeitFeld form={form} set={set} />

        <div className="field">
          <label className="label" htmlFor="t-notes">Arbeitsauftrag / Zusatzinformationen</label>
          <textarea
            id="t-notes"
            className="textarea"
            value={form.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Was ist zu tun? Schlüssel, Ansprechpartner, Material …"
            maxLength={4000}
          />
          <p className="hint">Sieht der Mitarbeiter in seiner App.</p>
        </div>

        <div className="row" style={{ marginTop: 20, marginBottom: 20 }}>
          <button
            type="button"
            className="btn btn--muted grow"
            onClick={() => navigate(-1)}
            disabled={saving}
          >
            Abbrechen
          </button>
          <button type="submit" className="btn grow" disabled={saving}>
            {saving ? 'Speichern…' : isEdit ? 'Speichern' : 'Termin anlegen'}
          </button>
        </div>
      </form>
    </Shell>
  );
}

/**
 * Uhrzeit oder – wenn der Kunde anruft – ein grober Zeitraum.
 * Die Auswahl schliesst sich gegenseitig aus, deshalb steckt sie in einem
 * eigenen Block statt in zwei unabhaengigen Feldern.
 */
function ZeitFeld({ form, set }) {
  return (
    <div className="field">
      <span className="label">Uhrzeit</span>

      <label className="check">
        <input
          type="checkbox"
          checked={form.ruftAn}
          onChange={(e) => set({ ruftAn: e.target.checked })}
        />
        <span className="check__text">
          <strong>Ruft an?</strong>
          <span className="check__sub">Keine feste Uhrzeit, nur ein Zeitraum</span>
        </span>
      </label>

      {!form.ruftAn ? (
        <input
          className="input"
          type="time"
          step={300}
          value={form.uhrzeit}
          onChange={(e) => set({ uhrzeit: e.target.value })}
          aria-label="Uhrzeit"
          required
        />
      ) : (
        <>
          <div className="segmented segmented--wrap" role="group" aria-label="Zeitraum">
            {ZEITRAEUME.map((z) => (
              <button
                key={z.wert}
                type="button"
                className={`segmented__btn${form.zeitraum === z.wert ? ' segmented__btn--active' : ''}`}
                onClick={() => set({ zeitraum: z.wert })}
                aria-pressed={form.zeitraum === z.wert}
              >
                {z.wert === 'spanne' ? 'Benutzerdefiniert' : z.label}
              </button>
            ))}
          </div>

          {form.zeitraum === 'spanne' && (
            <div className="row" style={{ marginTop: 10 }}>
              <div className="grow">
                <label className="label" htmlFor="t-von">Von</label>
                <input
                  id="t-von"
                  className="input"
                  type="time"
                  step={300}
                  value={form.von}
                  onChange={(e) => set({ von: e.target.value })}
                />
              </div>
              <div className="grow">
                <label className="label" htmlFor="t-bis">Bis</label>
                <input
                  id="t-bis"
                  className="input"
                  type="time"
                  step={300}
                  value={form.bis}
                  onChange={(e) => set({ bis: e.target.value })}
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
