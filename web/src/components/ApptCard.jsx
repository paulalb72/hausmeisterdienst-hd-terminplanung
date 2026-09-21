import { useNavigate } from 'react-router-dom';
import { istVorbei, ruftAn, zeitLabelKurz } from '../lib/termin.js';
import { IconBuilding, IconPhone, IconUser } from './Icons.jsx';

/** Ein Termin als antippbare Karte. `showEmployee` nur in Chef-Ansichten. */
export function ApptCard({ appt, showEmployee = false, onClick }) {
  const navigate = useNavigate();
  const cancelled = appt.status === 'storniert';
  const past = !cancelled && istVorbei(appt);
  const zeit = zeitLabelKurz(appt);
  const anruf = ruftAn(appt);

  return (
    <button
      type="button"
      className={
        'appt'
        + (anruf ? ' appt--ruftan' : '')
        + (cancelled ? ' appt--cancelled' : '')
        + (past ? ' appt--past' : '')
      }
      style={showEmployee && appt.employee_color
        ? { borderLeftColor: appt.employee_color }
        : undefined}
      onClick={() => (onClick ? onClick(appt) : navigate(`/termin/${appt.id}`))}
    >
      <span className="appt__time">
        {/* Zeitraeume brauchen mehr Platz als eine Uhrzeit. */}
        <span className={`appt__start${zeit.length > 5 ? ' appt__start--lang' : ''}`}>
          {zeit}
        </span>
        {anruf && (
          <span className="appt__ruftan"><IconPhone /> ruft an</span>
        )}
      </span>

      <span className="appt__body">
        <span className="appt__title">{appt.title}</span>

        {appt.object && (
          <span className="appt__meta">
            <IconBuilding /><span>{appt.object}</span>
          </span>
        )}
        {showEmployee && (
          <span className="appt__meta">
            <IconUser /><span>{appt.employee_name}</span>
          </span>
        )}

        {(anruf || cancelled || past) && (
          <span className="appt__tags">
            {anruf && (
              <span className="chip chip--ruftan">
                <IconPhone /> Ruft an – keine feste Uhrzeit
              </span>
            )}
            {cancelled && <span className="chip chip--danger">Storniert</span>}
            {past && <span className="chip chip--grey">Vorbei</span>}
          </span>
        )}
      </span>
    </button>
  );
}
