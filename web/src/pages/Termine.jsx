import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  addDays, formatDate, formatDayLabel, startOfDay,
} from '../lib/dates.js';
import { EmptyState, ErrorBox, Shell, Spinner } from '../components/Shell.jsx';
import { ApptCard } from '../components/ApptCard.jsx';
import { IconFilter, IconRefresh } from '../components/Icons.jsx';

/**
 * Startseite. Der Mitarbeiter sieht ausschliesslich seine eigenen Termine,
 * der Chef standardmaessig alle – mit Filter nach Mitarbeiter und Objekt.
 */
export default function Termine() {
  const { user, isChef } = useAuth();
  const [appts, setAppts] = useState(null);
  const [error, setError] = useState(null);
  const [showFilter, setShowFilter] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [objects, setObjects] = useState([]);

  // Chef-Standard: die eigene Belegschaft, ab heute. Mitarbeiter bekommen
  // dieselbe Zeitspanne, die Einschraenkung auf die eigene Person macht
  // der Server.
  const [filter, setFilter] = useState({ employeeId: '', object: '', days: 30 });

  const load = useCallback(() => {
    setError(null);
    const from = startOfDay(new Date());
    const to = addDays(from, Number(filter.days));
    api.appointments({
      from: from.toISOString(),
      to: to.toISOString(),
      employeeId: isChef ? filter.employeeId : undefined,
      object: isChef ? filter.object : undefined,
    })
      .then(setAppts)
      .catch((err) => { setError(err.message); setAppts([]); });
  }, [filter, isChef]);

  useEffect(() => { load(); }, [load]);

  // Die Filterlisten braucht nur der Chef.
  useEffect(() => {
    if (!isChef) return;
    Promise.all([api.employees(), api.objectSuggestions()])
      .then(([emp, obj]) => { setEmployees(emp); setObjects(obj); })
      .catch(() => {});
  }, [isChef]);

  // Termine nach Tagen buendeln, damit die Liste Zwischenueberschriften bekommt.
  const days = useMemo(() => {
    if (!appts) return [];
    const map = new Map();
    for (const appt of appts) {
      const key = startOfDay(appt.starts_at).getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(appt);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([time, items]) => ({ date: new Date(time), items }));
  }, [appts]);

  const filterActive = isChef && (filter.employeeId || filter.object || filter.days !== 30);

  return (
    <Shell
      title={isChef ? 'Alle Termine' : 'Meine Termine'}
      action={
        <>
          {isChef && (
            <button
              type="button"
              className="topbar__btn"
              onClick={() => setShowFilter((v) => !v)}
              aria-label="Filter"
              aria-pressed={showFilter}
              style={filterActive ? { background: 'rgba(255,255,255,.2)' } : undefined}
            >
              <IconFilter />
            </button>
          )}
          <button type="button" className="topbar__btn" onClick={load} aria-label="Aktualisieren">
            <IconRefresh />
          </button>
        </>
      }
    >
      {!isChef && (
        <p className="page__sub" style={{ marginBottom: 12 }}>
          Hallo {user.name.split(' ')[0]} – hier sind deine nächsten Einsätze.
        </p>
      )}

      {isChef && showFilter && (
        <div className="filterbar">
          <div className="field">
            <label className="label" htmlFor="f-emp">Mitarbeiter</label>
            <select
              id="f-emp"
              className="select"
              value={filter.employeeId}
              onChange={(e) => setFilter((f) => ({ ...f, employeeId: e.target.value }))}
            >
              <option value="">Alle</option>
              {employees.filter((e) => e.active !== false).map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-obj">Objekt</label>
            <input
              id="f-obj"
              className="input"
              type="search"
              list="filter-objekte"
              value={filter.object}
              onChange={(e) => setFilter((f) => ({ ...f, object: e.target.value }))}
              placeholder="Alle"
            />
            <datalist id="filter-objekte">
              {objects.map((o) => <option key={o} value={o} />)}
            </datalist>
          </div>
          <div className="field">
            <label className="label" htmlFor="f-days">Zeitraum</label>
            <select
              id="f-days"
              className="select"
              value={filter.days}
              onChange={(e) => setFilter((f) => ({ ...f, days: Number(e.target.value) }))}
            >
              <option value={1}>Heute</option>
              <option value={7}>7 Tage</option>
              <option value={30}>30 Tage</option>
              <option value={90}>3 Monate</option>
              <option value={365}>1 Jahr</option>
            </select>
          </div>
          {filterActive && (
            <button
              type="button"
              className="btn btn--muted btn--sm"
              onClick={() => setFilter({ employeeId: '', object: '', days: 30 })}
            >
              Zurücksetzen
            </button>
          )}
        </div>
      )}

      <ErrorBox error={error} />

      {appts === null ? (
        <Spinner />
      ) : days.length === 0 ? (
        <EmptyState
          script="Alles ruhig"
          text={
            isChef
              ? 'Im gewählten Zeitraum steht nichts an.'
              : 'Für dich ist gerade kein Termin eingetragen.'
          }
        />
      ) : (
        days.map(({ date, items }) => (
          <section className="daygroup" key={date.getTime()}>
            <header className="daygroup__head">
              <span className="daygroup__label">{formatDayLabel(date)}</span>
              <span className="daygroup__date">{formatDate(date)}</span>
              <span className="daygroup__count">
                {items.length} {items.length === 1 ? 'Termin' : 'Termine'}
              </span>
            </header>
            <div className="stack">
              {items.map((appt) => (
                <ApptCard key={appt.id} appt={appt} showEmployee={isChef} />
              ))}
            </div>
          </section>
        ))
      )}
    </Shell>
  );
}
