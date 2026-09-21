import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  addMonths, formatDateLong, formatMonthYear, isSameDay, isToday,
  isWeekend, monthGrid, startOfDay,
} from '../lib/dates.js';
import { EmptyState, ErrorBox, Shell, Spinner } from '../components/Shell.jsx';
import { ApptCard } from '../components/ApptCard.jsx';
import { IconChevronLeft, IconChevronRight } from '../components/Icons.jsx';

const DOW = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MAX_DOTS = 3;

/** Monatskalender mit Punkten je Termin; darunter der gewaehlte Tag. */
export default function Kalender() {
  const { isChef } = useAuth();
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState(() => startOfDay(new Date()));
  const [appts, setAppts] = useState(null);
  const [error, setError] = useState(null);

  const grid = useMemo(() => monthGrid(month), [month]);

  const load = useCallback(() => {
    if (grid.length === 0) return;
    setError(null);
    // Genau das sichtbare Raster laden, inklusive der Randtage aus den
    // Nachbarmonaten.
    const from = grid[0];
    const to = new Date(grid[grid.length - 1].getTime() + 86_400_000);
    api.appointments({ from: from.toISOString(), to: to.toISOString() })
      .then(setAppts)
      .catch((err) => { setError(err.message); setAppts([]); });
  }, [grid]);

  useEffect(() => { load(); }, [load]);

  // Termine pro Tag vorsortieren – spart das Filtern in 42 Zellen.
  const byDay = useMemo(() => {
    const map = new Map();
    for (const appt of appts || []) {
      const key = startOfDay(appt.starts_at).getTime();
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(appt);
    }
    return map;
  }, [appts]);

  const selectedAppts = byDay.get(selected.getTime()) || [];
  const currentMonth = month.getMonth();

  function jump(delta) {
    const next = addMonths(month, delta);
    setMonth(next);
    // Auswahl mitziehen, damit der untere Bereich nicht leer wirkt.
    setSelected(startOfDay(new Date(next.getFullYear(), next.getMonth(), 1)));
  }

  function goToday() {
    const today = startOfDay(new Date());
    setMonth(today);
    setSelected(today);
  }

  return (
    <Shell title="Kalender">
      <div className="cal__bar">
        <button type="button" className="cal__nav" onClick={() => jump(-1)} aria-label="Voriger Monat">
          <IconChevronLeft />
        </button>
        <div className="cal__month">{formatMonthYear(month)}</div>
        <button type="button" className="cal__nav" onClick={() => jump(1)} aria-label="Nächster Monat">
          <IconChevronRight />
        </button>
      </div>

      <ErrorBox error={error} />

      <div className="cal__grid" role="grid" aria-label={`Kalender ${formatMonthYear(month)}`}>
        {DOW.map((d) => <div className="cal__dow" key={d}>{d}</div>)}

        {grid.map((day) => {
          const items = byDay.get(day.getTime()) || [];
          const visible = items.filter((a) => a.status !== 'storniert');
          const out = day.getMonth() !== currentMonth;

          return (
            <button
              type="button"
              key={day.getTime()}
              className={
                'cal__day'
                + (out ? ' cal__day--out' : '')
                + (isWeekend(day) ? ' cal__day--weekend' : '')
                + (isToday(day) ? ' cal__day--today' : '')
                + (isSameDay(day, selected) ? ' cal__day--selected' : '')
              }
              onClick={() => {
                setSelected(day);
                if (out) setMonth(day);
              }}
              aria-label={`${formatDateLong(day)}, ${visible.length} Termine`}
              aria-pressed={isSameDay(day, selected)}
            >
              <span className="cal__daynum">{day.getDate()}</span>
              {visible.length > 0 && (
                <span className="cal__dots">
                  {visible.slice(0, MAX_DOTS).map((a) => (
                    <span
                      className="cal__dot"
                      key={a.id}
                      style={isChef && a.employee_color ? { background: a.employee_color } : undefined}
                    />
                  ))}
                  {visible.length > MAX_DOTS && (
                    <span className="cal__more">+{visible.length - MAX_DOTS}</span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <section className="cal__selected">
        <div className="row" style={{ alignItems: 'baseline', marginBottom: 9 }}>
          <h3 className="grow" style={{ margin: 0 }}>{formatDateLong(selected)}</h3>
          {!isToday(selected) && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={goToday}>
              Heute
            </button>
          )}
        </div>

        {appts === null ? (
          <Spinner />
        ) : selectedAppts.length === 0 ? (
          <EmptyState script="Frei" text="An diesem Tag ist nichts eingetragen." />
        ) : (
          <div className="stack">
            {selectedAppts.map((appt) => (
              <ApptCard key={appt.id} appt={appt} showEmployee={isChef} />
            ))}
          </div>
        )}
      </section>
    </Shell>
  );
}
