import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Avatar, ErrorBox, Spinner } from '../components/Shell.jsx';
import { IconBack } from '../components/Icons.jsx';
import bildmarke from '../assets/logo/bildmarke.svg';
import wortmarke from '../assets/logo/wortmarke.svg';

const PIN_LENGTH = 5;

export default function Login() {
  const { login } = useAuth();
  const [people, setPeople] = useState(null);
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    api.loginList()
      .then(setPeople)
      .catch((err) => { setError(err.message); setPeople([]); });
  }, []);

  // Sobald jemand ausgewaehlt ist, soll die Zifferntastatur aufgehen.
  useEffect(() => {
    if (selected) inputRef.current?.focus();
  }, [selected]);

  async function submit(value) {
    setBusy(true);
    setError(null);
    try {
      await login(selected.id, value);
      // Der AuthProvider setzt den Nutzer; App.jsx wechselt die Ansicht.
    } catch (err) {
      setError(err.message);
      setPin('');
      inputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  }

  function onPinChange(raw) {
    const digits = raw.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(digits);
    setError(null);
    // Vollstaendige PIN direkt absenden – spart einen Tipp auf der Baustelle.
    if (digits.length === PIN_LENGTH) submit(digits);
  }

  function back() {
    setSelected(null);
    setPin('');
    setError(null);
  }

  return (
    <div className="login">
      <div className="login__inner">
        <div className="login__brand">
          {/* Vollstaendige Wort-Bild-Marke. Beide Teile sind dunkel angelegt
              und werden per Filter fuer den gruenen Grund weiss gefaerbt. */}
          <img className="login__bildmarke" src={bildmarke} alt="" />
          <img className="login__wortmarke" src={wortmarke}
               alt="Hausmeisterdienst HD – Wahre Hausfreunde" />
        </div>

        <div className="login__card">
          {!selected ? (
            <>
              <h1>Wer bist du?</h1>
              <ErrorBox error={error} />
              {people === null ? (
                <Spinner />
              ) : people.length === 0 ? (
                <p className="hint">
                  Noch kein Zugang angelegt. Der Administrator richtet den ersten
                  Zugang über <code>npm run seed</code> ein.
                </p>
              ) : (
                <div className="login__people">
                  {people.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="person"
                      onClick={() => setSelected(p)}
                    >
                      <Avatar name={p.name} color={p.color} />
                      <span className="person__name">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="pinpad">
              <div className="pinpad__who">
                <button
                  type="button"
                  className="iconbtn"
                  onClick={back}
                  aria-label="Anderen Namen wählen"
                >
                  <IconBack />
                </button>
                <Avatar name={selected.name} color={selected.color} />
                <span>{selected.name}</span>
              </div>

              <label className="label" htmlFor="pin">PIN eingeben</label>
              <div className="pinpad__boxes">
                {Array.from({ length: PIN_LENGTH }, (_, i) => (
                  <div
                    key={i}
                    className={
                      'pinpad__box'
                      + (pin.length > i ? ' pinpad__box--filled' : '')
                      + (pin.length === i ? ' pinpad__box--active' : '')
                    }
                    aria-hidden="true"
                  >
                    {pin[i] ? '•' : ''}
                  </div>
                ))}
                <input
                  id="pin"
                  ref={inputRef}
                  className="pinpad__input"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="\d*"
                  maxLength={PIN_LENGTH}
                  value={pin}
                  disabled={busy}
                  onChange={(e) => onPinChange(e.target.value)}
                  aria-label={`${PIN_LENGTH}-stellige PIN`}
                />
              </div>

              <ErrorBox error={error} />

              <button
                type="button"
                className="btn btn--block"
                disabled={busy || pin.length !== PIN_LENGTH}
                onClick={() => submit(pin)}
              >
                {busy ? 'Anmelden…' : 'Anmelden'}
              </button>
              <p className="hint">PIN vergessen? Der Chef kann eine neue vergeben.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
