import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import bildmarke from '../assets/logo/bildmarke.svg';
import {
  IconBack, IconCalendar, IconGrid, IconList, IconMore, IconPlus,
} from './Icons.jsx';

/**
 * Rahmen aller angemeldeten Seiten: Kopfzeile oben, Navigation unten.
 * `back` blendet statt des Logos einen Zurueck-Pfeil ein.
 */
export function Shell({ title, back, action, nav = true, wide = false, children }) {
  const navigate = useNavigate();
  const { isChef } = useAuth();

  return (
    <div className="shell">
      <header className="topbar">
        {back ? (
          <button
            type="button"
            className="topbar__btn"
            onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
            aria-label="Zurück"
          >
            <IconBack />
          </button>
        ) : (
          <span className="topbar__logo">
            {/* Die Bildmarke statt der Wortmarke: quadratisch, damit der
                Seitentitel daneben Platz hat. */}
            <img src={bildmarke} alt="Hausmeisterdienst HD" />
          </span>
        )}
        <h1 className="topbar__title">{title}</h1>
        {action}
      </header>

      <main className={`shell__main${nav ? '' : ' shell__main--nonav'}`}>
        <div className={wide ? 'page page--wide' : 'page'}>{children}</div>
      </main>

      {nav && <TabBar isChef={isChef} />}
    </div>
  );
}

function TabBar({ isChef }) {
  const navigate = useNavigate();
  const cls = ({ isActive }) => `tabbar__item${isActive ? ' tabbar__item--active' : ''}`;
  // Das Planungsboard ist fuer den Rechner gebaut. Auf dem Handy blendet CSS
  // den Reiter aus; die Route selbst bleibt per Direktlink erreichbar.
  const clsDesktop = (state) => `${cls(state)} tabbar__item--desktop`;

  return (
    // Drei Spalten: links | Knopf | rechts. Die beiden Aussenspalten sind
    // gleich breit, deshalb sitzt der Plus-Knopf immer exakt in der Mitte –
    // unabhaengig davon, wie viele Reiter gerade sichtbar sind.
    <nav
      className={`tabbar${isChef ? ' tabbar--fab' : ''}`}
      aria-label="Hauptnavigation"
    >
      <div className="tabbar__group">
        <NavLink to="/" end className={cls}>
          <IconList /><span>Termine</span>
        </NavLink>
        <NavLink to="/kalender" className={cls}>
          <IconCalendar /><span>Kalender</span>
        </NavLink>
      </div>

      {isChef && (
        <button
          type="button"
          className="tabbar__fab"
          onClick={() => navigate('/termin/neu')}
          aria-label="Neuen Termin anlegen"
        >
          <IconPlus />
        </button>
      )}

      <div className="tabbar__group">
        {isChef && (
          <NavLink to="/dispo" className={clsDesktop}>
            <IconGrid /><span>Dispo</span>
          </NavLink>
        )}
        <NavLink to="/mehr" className={cls}>
          <IconMore /><span>Mehr</span>
        </NavLink>
      </div>
    </nav>
  );
}

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Wird geladen" />;
}

export function EmptyState({ script = 'Nichts zu tun', text, children }) {
  return (
    <div className="empty">
      <div className="empty__script">{script}</div>
      {text && <p>{text}</p>}
      {children}
    </div>
  );
}

/** Rote Fehlerbox; rendert nichts, wenn keine Meldung anliegt. */
export function ErrorBox({ error }) {
  if (!error) return null;
  return <div className="error-box" role="alert">{typeof error === 'string' ? error : error.message}</div>;
}

/** Initialen fuer den Avatar: "Max Mustermann" -> "MM" */
export function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
}

export function Avatar({ name, color, size }) {
  const style = { background: color || 'var(--hd-green)' };
  if (size) {
    style.width = size;
    style.height = size;
    style.fontSize = Math.round(size * 0.38);
  }
  return <span className="avatar" style={style} title={name}>{initials(name)}</span>;
}
