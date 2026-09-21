import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import {
  addDays, formatDate, formatDateShort, isSameDay, isToday, isWeekend,
  startOfDay, startOfWeek, toDateInput, weekdayShort,
} from '../lib/dates.js';
import { istVorbei, ruftAn, zeitLabel, zeitLabelKurz } from '../lib/termin.js';
import { Avatar, ErrorBox, Shell, Spinner } from '../components/Shell.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  IconChevronLeft, IconChevronRight, IconPhone, IconPlus, IconRefresh,
} from '../components/Icons.jsx';
import '../dispo.css';

const DAY_COL_W = 200;   // Pixel je Tagesspalte
const NAME_W = 190;      // Breite der Mitarbeiterspalte
const BLOCK_H = 40;      // Jeder Termin gleich hoch – es gibt keine Dauer
const BLOCK_GAP = 3;
const ROW_PAD = 8;
const DAYS = 7;

/**
 * Planungsboard: Mitarbeiter in den Zeilen, Datum in den Spalten.
 * Termine lassen sich per Drag & Drop auf einen anderen Mitarbeiter oder
 * einen anderen Tag ziehen. Die Uhrzeit bleibt dabei unveraendert – sie
 * wird im Termin selbst gepflegt.
 */
export default function Dispo() {
  const navigate = useNavigate();
  const toast = useToast();

  const [anchor, setAnchor] = useState(() => startOfDay(new Date()));
  const [employees, setEmployees] = useState([]);
  const [objektVorschlaege, setObjektVorschlaege] = useState([]);
  const [appts, setAppts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState({ employeeId: '', object: '' });
  const [drag, setDrag] = useState(null);             // { appt }
  const [dropTarget, setDropTarget] = useState(null); // "empId:spaltenIndex"

  const weekStart = useMemo(() => startOfWeek(anchor), [anchor]);
  const dayList = useMemo(
    () => Array.from({ length: DAYS }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const load = useCallback(() => {
    setError(null);
    api.appointments({
      from: weekStart.toISOString(),
      to: addDays(weekStart, DAYS).toISOString(),
      object: filter.object || undefined,
      status: 'alle',
    })
      .then(setAppts)
      .catch((err) => { setError(err.message); setAppts([]); });
  }, [weekStart, filter.object]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([api.employees(), api.objectSuggestions().catch(() => [])])
      .then(([emp, objekte]) => { setEmployees(emp); setObjektVorschlaege(objekte); })
      .catch((err) => setError(err.message));
  }, []);

  const rows = useMemo(() => {
    const active = employees.filter((e) => e.active !== false);
    return filter.employeeId
      ? active.filter((e) => String(e.id) === filter.employeeId)
      : active;
  }, [employees, filter.employeeId]);

  // Termine je Mitarbeiter und Tag einsortieren.
  const byEmployee = useMemo(() => {
    const map = new Map();
    for (const appt of appts || []) {
      if (!map.has(appt.employee_id)) map.set(appt.employee_id, {});
      const spalte = dayList.findIndex((d) => isSameDay(d, appt.starts_at));
      if (spalte === -1) continue;
      const proTag = map.get(appt.employee_id);
      (proTag[spalte] ||= []).push(appt);
    }
    for (const proTag of map.values()) {
      for (const liste of Object.values(proTag)) {
        liste.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
      }
    }
    return map;
  }, [appts, dayList]);

  // --- Drag & Drop --------------------------------------------------------

  function onDragStart(event, appt) {
    setDrag({ appt });
    event.dataTransfer.effectAllowed = 'move';
    // Firefox startet den Zug nur, wenn Daten gesetzt sind.
    event.dataTransfer.setData('text/plain', String(appt.id));
  }

  function onDragEnd() {
    setDrag(null);
    setDropTarget(null);
  }

  async function onDrop(event, employeeId, spalte) {
    event.preventDefault();
    setDropTarget(null);
    if (!drag) return;
    const { appt } = drag;
    setDrag(null);

    // Nur das Datum wandert, die Uhrzeit bzw. der Zeitraum bleibt bestehen.
    const original = new Date(appt.starts_at);
    const ziel = new Date(dayList[spalte]);
    ziel.setHours(original.getHours(), original.getMinutes(), 0, 0);

    const unveraendert = appt.employee_id === employeeId
      && original.getTime() === ziel.getTime();
    if (unveraendert) return;

    // Erst lokal umsetzen, damit der Block sofort springt; bei einem Fehler
    // wird der Serverstand wieder eingelesen.
    const vorher = appts;
    setAppts((list) => list.map((a) => (
      a.id === appt.id
        ? {
            ...a,
            employee_id: employeeId,
            starts_at: ziel.toISOString(),
            employee_name: rows.find((r) => r.id === employeeId)?.name || a.employee_name,
            employee_color: rows.find((r) => r.id === employeeId)?.color || a.employee_color,
          }
        : a
    )));

    try {
      const updated = await api.updateAppointment(appt.id, {
        employeeId,
        startsAt: ziel.toISOString(),
      });
      setAppts((list) => list.map((a) => (a.id === updated.id ? updated : a)));
      toast(`Verschoben auf ${formatDateShort(ziel)}`);
    } catch (err) {
      setAppts(vorher);
      toast(err.message, 'error');
    }
  }

  /** Klick auf ein freies Tagesfeld legt einen Termin mit Vorbelegung an. */
  function onCellClick(employeeId, spalte) {
    if (drag) return;
    const start = new Date(dayList[spalte]);
    start.setHours(8, 0, 0, 0);
    navigate(`/termin/neu?employee=${employeeId}&start=${encodeURIComponent(start.toISOString())}`);
  }

  const gridTemplate = `${NAME_W}px repeat(${DAYS}, ${DAY_COL_W}px)`;
  const rangeLabel = `${formatDate(weekStart)} – ${formatDate(addDays(weekStart, 6))}`;

  return (
    <Shell title="Disposition" wide>
      <div className="dispo__bar">
        <button
          type="button"
          className="cal__nav"
          onClick={() => setAnchor((d) => addDays(d, -7))}
          aria-label="Vorige Woche"
        >
          <IconChevronLeft />
        </button>
        <span className="dispo__range">{rangeLabel}</span>
        <button
          type="button"
          className="cal__nav"
          onClick={() => setAnchor((d) => addDays(d, 7))}
          aria-label="Nächste Woche"
        >
          <IconChevronRight />
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setAnchor(startOfDay(new Date()))}
        >
          Diese Woche
        </button>

        <input
          className="input"
          style={{ flex: '0 0 165px', minHeight: 40 }}
          type="date"
          value={toDateInput(anchor)}
          onChange={(e) => e.target.value && setAnchor(startOfDay(new Date(`${e.target.value}T00:00`)))}
          aria-label="Woche wählen"
        />

        <span className="spacer" />

        <select
          className="select"
          style={{ flex: '0 0 175px', minHeight: 40 }}
          value={filter.employeeId}
          onChange={(e) => setFilter((f) => ({ ...f, employeeId: e.target.value }))}
          aria-label="Nach Mitarbeiter filtern"
        >
          <option value="">Alle Mitarbeiter</option>
          {employees.filter((e) => e.active !== false).map((e) => (
            <option key={e.id} value={e.id}>{e.name}</option>
          ))}
        </select>

        <input
          className="input"
          style={{ flex: '0 0 195px', minHeight: 40 }}
          type="search"
          list="dispo-objekte"
          value={filter.object}
          onChange={(e) => setFilter((f) => ({ ...f, object: e.target.value }))}
          placeholder="Objekt filtern…"
          aria-label="Nach Objekt filtern"
        />
        <datalist id="dispo-objekte">
          {objektVorschlaege.map((o) => <option key={o} value={o} />)}
        </datalist>

        <button type="button" className="iconbtn" onClick={load} aria-label="Aktualisieren">
          <IconRefresh />
        </button>
        <button type="button" className="btn btn--sm" onClick={() => navigate('/termin/neu')}>
          <IconPlus style={{ width: 15, height: 15 }} /> Termin
        </button>
      </div>

      <div className="info-box dispo__hint-mobile">
        Das Planungsboard ist für den Browser am Rechner gedacht. Auf dem Handy
        kannst du es seitlich scrollen – zum Verschieben öffne den Termin und
        nutze „Bearbeiten“.
      </div>

      <ErrorBox error={error} />

      {appts === null ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <div className="board__empty">Keine aktiven Mitarbeiter angelegt.</div>
      ) : (
        <div className="board">
          <div className="board__grid" style={{ gridTemplateColumns: gridTemplate }}>
            <div className="board__corner">Mitarbeiter</div>
            {dayList.map((day) => (
              <div
                key={day.getTime()}
                className={
                  'board__colhead'
                  + (isToday(day) ? ' board__colhead--today' : '')
                  + (isWeekend(day) ? ' board__colhead--weekend' : '')
                }
              >
                {weekdayShort(day)}
                <small>{formatDate(day)}</small>
              </div>
            ))}

            {rows.map((emp) => {
              const proTag = byEmployee.get(emp.id) || {};
              const maxProTag = Math.max(
                1,
                ...dayList.map((_, i) => (proTag[i]?.length || 0)),
              );
              const rowHeight = maxProTag * (BLOCK_H + BLOCK_GAP) + ROW_PAD * 2;
              const anzahl = Object.values(proTag)
                .flat()
                .filter((a) => a.status !== 'storniert').length;

              return (
                <DispoRow
                  key={emp.id}
                  employee={emp}
                  count={anzahl}
                  dayList={dayList}
                  proTag={proTag}
                  height={rowHeight}
                  drag={drag}
                  dropTarget={dropTarget}
                  setDropTarget={setDropTarget}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onDrop={onDrop}
                  onCellClick={onCellClick}
                  onOpen={(appt) => navigate(`/termin/${appt.id}`)}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="dispo__legend">
        <span>
          <span className="dispo__swatch" style={{ background: 'var(--hd-green)' }} /> Geplant
        </span>
        <span>
          <span
            className="dispo__swatch"
            style={{
              background: 'repeating-linear-gradient(45deg,#9A9A9A,#9A9A9A 3px,#8C8C8C 3px,#8C8C8C 6px)',
            }}
          /> Storniert
        </span>
        <span><IconPhone style={{ width: 12, height: 12 }} /> Kunde ruft an</span>
        <span>Ziehen verschiebt auf einen anderen Tag oder Mitarbeiter · Klick öffnet</span>
      </div>
    </Shell>
  );
}

/** Eine Mitarbeiterzeile: sieben Tagesfelder mit gestapelten Terminen. */
function DispoRow({
  employee, count, dayList, proTag, height,
  drag, dropTarget, setDropTarget, onDragStart, onDragEnd, onDrop, onCellClick, onOpen,
}) {
  return (
    <>
      <div className="board__rowhead" style={{ height }}>
        <Avatar name={employee.name} color={employee.color} size={30} />
        <span className="board__rowhead__name">
          {employee.name}
          <span className="board__rowhead__count"> · {count}</span>
        </span>
      </div>

      <div
        className="board__row"
        style={{ height, gridColumn: `2 / span ${dayList.length}` }}
      >
        <div
          className="board__cells"
          style={{ gridTemplateColumns: `repeat(${dayList.length}, 1fr)` }}
        >
          {dayList.map((day, i) => {
            const key = `${employee.id}:${i}`;
            const termine = proTag[i] || [];

            return (
              <div
                key={day.getTime()}
                className={
                  'board__cell'
                  + (isWeekend(day) ? ' board__cell--weekend' : '')
                  + (isToday(day) ? ' board__cell--today' : '')
                  + (dropTarget === key ? ' board__cell--drop' : '')
                }
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                  if (dropTarget !== key) setDropTarget(key);
                }}
                onDragLeave={() => { if (dropTarget === key) setDropTarget(null); }}
                onDrop={(e) => onDrop(e, employee.id, i)}
                onClick={() => onCellClick(employee.id, i)}
                title={`${employee.name} · ${formatDate(day)}`}
              >
                <div className="board__stack">
                  {termine.map((appt) => (
                    <Block
                      key={appt.id}
                      appt={appt}
                      dragging={drag?.appt.id === appt.id}
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onOpen={onOpen}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Block({ appt, dragging, onDragStart, onDragEnd, onOpen }) {
  const cancelled = appt.status === 'storniert';
  const past = !cancelled && istVorbei(appt);

  return (
    <div
      className={
        'block'
        + (dragging ? ' block--dragging' : '')
        + (cancelled ? ' block--cancelled' : '')
        + (past ? ' block--past' : '')
      }
      style={cancelled ? undefined : { background: appt.employee_color || 'var(--hd-green)' }}
      draggable={!cancelled}
      onDragStart={(e) => { e.stopPropagation(); onDragStart(e, appt); }}
      onDragEnd={onDragEnd}
      onClick={(e) => { e.stopPropagation(); onOpen(appt); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(appt); } }}
      title={`${appt.title}\n${zeitLabel(appt)}${ruftAn(appt) ? ' (Kunde ruft an)' : ''}`
           + (appt.object ? `\n${appt.object}` : '')
           + (cancelled ? '\n(storniert)' : '')}
    >
      <div className="block__title">
        <span className="block__zeit">
          {ruftAn(appt) && <IconPhone className="block__phone" />}
          {zeitLabelKurz(appt)}
        </span>
        {appt.title}
      </div>
      {appt.object && <div className="block__sub">{appt.object}</div>}
    </div>
  );
}
