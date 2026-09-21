import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import {
  disablePush, enablePush, isIOS, isPushActive, isStandalone, permissionState,
} from '../lib/push.js';
import { Avatar, ErrorBox, Shell } from '../components/Shell.jsx';
import { Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  IconBell, IconChevronRight, IconLock, IconLogout, IconUsers,
} from '../components/Icons.jsx';

export default function Mehr() {
  const { user, isChef, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushNote, setPushNote] = useState(null);
  const [showPin, setShowPin] = useState(false);

  useEffect(() => { isPushActive().then(setPushOn); }, []);

  async function togglePush() {
    setPushBusy(true);
    setPushNote(null);
    try {
      if (pushOn) {
        await disablePush();
        setPushOn(false);
        toast('Benachrichtigungen ausgeschaltet.');
      } else {
        const res = await enablePush();
        if (!res.ok) {
          setPushNote(res.error);
        } else {
          setPushOn(true);
          await api.pushTest().catch(() => {});
          toast('Benachrichtigungen eingeschaltet.');
        }
      }
    } catch (err) {
      setPushNote(err.message);
    } finally {
      setPushBusy(false);
    }
  }

  const blocked = permissionState() === 'denied';
  const needsInstall = isIOS() && !isStandalone();

  return (
    <Shell title="Mehr">
      <div className="settings__item" style={{ marginBottom: 20 }}>
        <Avatar name={user.name} color={user.color} size={44} />
        <div className="settings__item__main">
          <div className="settings__item__title">{user.name}</div>
          <div className="settings__item__sub">
            {isChef ? 'Chef · Disposition' : 'Mitarbeiter'}
          </div>
        </div>
      </div>

      {isChef && (
        <section className="settings__group">
          <h2>Verwaltung</h2>
          <button
            type="button"
            className="settings__item"
            style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
            onClick={() => navigate('/verwaltung/mitarbeiter')}
          >
            <IconUsers style={{ width: 21, height: 21, color: 'var(--hd-green)' }} />
            <span className="settings__item__main">
              <span className="settings__item__title">Mitarbeiter</span>
              <span className="settings__item__sub">Anlegen, Farbe, Rolle und PIN</span>
            </span>
            <IconChevronRight style={{ width: 18, height: 18, color: 'var(--hd-ink-faint)' }} />
          </button>
        </section>
      )}

      <section className="settings__group">
        <h2>Benachrichtigungen</h2>
        <div className="settings__item">
          <IconBell style={{ width: 21, height: 21, color: 'var(--hd-green)' }} />
          <div className="settings__item__main">
            <div className="settings__item__title">Push auf dieses Gerät</div>
            <div className="settings__item__sub">
              {pushOn
                ? 'Aktiv – neue und verschobene Termine melden sich.'
                : 'Aus – du siehst Änderungen nur beim Öffnen der App.'}
            </div>
          </div>
          <button
            type="button"
            className={`btn btn--sm${pushOn ? ' btn--muted' : ''}`}
            onClick={togglePush}
            disabled={pushBusy || blocked}
          >
            {pushBusy ? '…' : pushOn ? 'Aus' : 'Ein'}
          </button>
        </div>

        {needsInstall && !pushOn && (
          <div className="info-box" style={{ marginTop: 10 }}>
            <strong>iPhone:</strong> Benachrichtigungen gehen nur, wenn die App
            installiert ist. In Safari auf <em>Teilen</em> tippen, dann
            <em> Zum Home-Bildschirm</em> – danach die App von dort öffnen.
          </div>
        )}
        {blocked && (
          <div className="error-box" style={{ marginTop: 10 }}>
            Benachrichtigungen sind für diese Seite im Browser blockiert. Bitte in
            den Website-Einstellungen wieder erlauben.
          </div>
        )}
        <ErrorBox error={pushNote} />

        {pushOn && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            style={{ marginTop: 10 }}
            onClick={() => api.pushTest()
              .then(() => toast('Testnachricht verschickt.'))
              .catch((err) => toast(err.message, 'error'))}
          >
            Testnachricht senden
          </button>
        )}
      </section>

      <section className="settings__group">
        <h2>Zugang</h2>
        <button
          type="button"
          className="settings__item"
          style={{ width: '100%', cursor: 'pointer', textAlign: 'left' }}
          onClick={() => setShowPin(true)}
        >
          <IconLock style={{ width: 21, height: 21, color: 'var(--hd-green)' }} />
          <span className="settings__item__main">
            <span className="settings__item__title">PIN ändern</span>
            <span className="settings__item__sub">Fünfstellige Anmelde-PIN</span>
          </span>
          <IconChevronRight style={{ width: 18, height: 18, color: 'var(--hd-ink-faint)' }} />
        </button>
      </section>

      <button
        type="button"
        className="btn btn--muted btn--block"
        onClick={async () => {
          // Das Push-Abo gehoert zum Konto, nicht zum Geraet – beim Abmelden
          // also mit abmelden, damit der Naechste keine fremden Termine sieht.
          await disablePush().catch(() => {});
          await logout();
        }}
      >
        <IconLogout style={{ width: 17, height: 17 }} /> Abmelden
      </button>

      <p className="hint" style={{ textAlign: 'center', marginTop: 22 }}>
        Hausmeisterdienst HD · Terminplanung
      </p>

      {showPin && <PinModal onClose={() => setShowPin(false)} onDone={toast} />}
    </Shell>
  );
}

function PinModal({ onClose, onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const digits = (v) => v.replace(/\D/g, '').slice(0, 5);

  async function save() {
    if (next !== repeat) return setError('Die beiden neuen PINs stimmen nicht überein.');
    if (!/^\d{5}$/.test(next)) return setError('Die neue PIN muss aus 5 Ziffern bestehen.');
    if (next === current) return setError('Die neue PIN muss sich von der alten unterscheiden.');

    setBusy(true);
    setError(null);
    try {
      await api.changePin(current, next);
      onDone('PIN geändert.');
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title="PIN ändern"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--muted" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button type="button" className="btn" onClick={save} disabled={busy}>
            {busy ? 'Speichern…' : 'Speichern'}
          </button>
        </>
      }
    >
      <ErrorBox error={error} />
      <div className="field">
        <label className="label" htmlFor="p-cur">Aktuelle PIN</label>
        <input
          id="p-cur"
          className="input"
          inputMode="numeric"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(digits(e.target.value))}
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="p-new">Neue PIN</label>
        <input
          id="p-new"
          className="input"
          inputMode="numeric"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(digits(e.target.value))}
        />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label className="label" htmlFor="p-rep">Neue PIN wiederholen</label>
        <input
          id="p-rep"
          className="input"
          inputMode="numeric"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(digits(e.target.value))}
        />
      </div>
    </Modal>
  );
}
