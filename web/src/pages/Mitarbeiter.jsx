import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Avatar, ErrorBox, Shell, Spinner } from '../components/Shell.jsx';
import { ConfirmModal, Modal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import { IconEdit, IconPlus, IconTrash, IconUnlock } from '../components/Icons.jsx';

// Auswahl gut unterscheidbarer Farben fuer die Zeilen im Planungsboard.
const COLORS = [
  '#10712A', '#2D9537', '#1B6C30', '#4A7C1F', '#0F6E6E',
  '#1F5FA8', '#6B4BA8', '#A8452B', '#B8860B', '#5A5A5A',
];

export default function Mitarbeiter() {
  const { user } = useAuth();
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(null);
  const [remove, setRemove] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api.employees()
    .then(setList)
    .catch((err) => { setError(err.message); setList([]); });

  useEffect(() => { load(); }, []);

  function openNew() {
    setEdit({
      name: '', role: 'mitarbeiter', phone: '', active: true,
      color: COLORS[(list?.length || 0) % COLORS.length],
      pin: '',
    });
  }

  async function doDelete() {
    setBusy(true);
    try {
      const res = await api.deleteEmployee(remove.id);
      toast(res.deactivated
        ? `${remove.name} hat ${res.appointments} Termine und wurde deaktiviert statt gelöscht.`
        : `${remove.name} wurde gelöscht.`);
      setRemove(null);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function unlock(emp) {
    try {
      await api.unlockEmployee(emp.id);
      toast(`${emp.name} kann sich wieder anmelden.`);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  return (
    <Shell
      title="Mitarbeiter"
      back="/mehr"
      action={
        <button type="button" className="topbar__btn" onClick={openNew} aria-label="Neu anlegen">
          <IconPlus />
        </button>
      }
    >
      <ErrorBox error={error} />

      {list === null ? <Spinner /> : (
        <div className="adminlist">
          {list.map((emp) => (
            <div
              className={`adminrow${emp.active ? '' : ' adminrow--inactive'}`}
              key={emp.id}
            >
              <Avatar name={emp.name} color={emp.color} />
              <div className="adminrow__main">
                <div className="adminrow__name">
                  {emp.name}
                  {emp.id === user.id && <span className="chip" style={{ marginLeft: 7 }}>Du</span>}
                  {emp.role === 'chef' && <span className="chip" style={{ marginLeft: 7 }}>Chef</span>}
                  {emp.locked && <span className="chip chip--danger" style={{ marginLeft: 7 }}>Gesperrt</span>}
                  {!emp.active && <span className="chip chip--grey" style={{ marginLeft: 7 }}>Inaktiv</span>}
                </div>
                <div className="adminrow__sub">{emp.phone || 'Keine Telefonnummer'}</div>
              </div>
              <div className="adminrow__actions">
                {emp.locked && (
                  <button
                    type="button"
                    className="iconbtn"
                    onClick={() => unlock(emp)}
                    aria-label={`${emp.name} entsperren`}
                    title="Sperre aufheben"
                  >
                    <IconUnlock />
                  </button>
                )}
                <button
                  type="button"
                  className="iconbtn"
                  onClick={() => setEdit({ ...emp, pin: '' })}
                  aria-label={`${emp.name} bearbeiten`}
                >
                  <IconEdit />
                </button>
                {emp.id !== user.id && (
                  <button
                    type="button"
                    className="iconbtn iconbtn--danger"
                    onClick={() => setRemove(emp)}
                    aria-label={`${emp.name} entfernen`}
                  >
                    <IconTrash />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="btn btn--block" style={{ marginTop: 14 }} onClick={openNew}>
        <IconPlus style={{ width: 17, height: 17 }} /> Mitarbeiter anlegen
      </button>

      {edit && (
        <EmployeeModal
          draft={edit}
          onChange={setEdit}
          onClose={() => setEdit(null)}
          onSaved={async (msg) => { setEdit(null); toast(msg); await load(); }}
        />
      )}

      {remove && (
        <ConfirmModal
          title={`${remove.name} entfernen?`}
          message="Falls bereits Termine zugeordnet sind, wird der Zugang nur deaktiviert – die Terminhistorie bleibt dann erhalten."
          confirmLabel="Ja, entfernen"
          danger
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setRemove(null)}
        />
      )}
    </Shell>
  );
}

function EmployeeModal({ draft, onChange, onClose, onSaved }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const isNew = !draft.id;
  const set = (patch) => onChange({ ...draft, ...patch });

  async function save() {
    if (!draft.name.trim()) return setError('Bitte einen Namen angeben.');
    if (isNew && !/^\d{5}$/.test(draft.pin)) {
      return setError('Bitte eine 5-stellige Start-PIN vergeben.');
    }
    if (!isNew && draft.pin && !/^\d{5}$/.test(draft.pin)) {
      return setError('Die neue PIN muss aus 5 Ziffern bestehen.');
    }

    setBusy(true);
    setError(null);
    const payload = {
      name: draft.name.trim(),
      role: draft.role,
      color: draft.color,
      phone: (draft.phone || '').trim(),
      active: draft.active,
    };
    if (draft.pin) payload.pin = draft.pin;

    try {
      if (isNew) {
        await api.createEmployee(payload);
        onSaved(`${payload.name} angelegt. PIN: ${draft.pin}`);
      } else {
        await api.updateEmployee(draft.id, payload);
        onSaved(draft.pin
          ? `${payload.name} gespeichert. Neue PIN: ${draft.pin}`
          : `${payload.name} gespeichert.`);
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <Modal
      title={isNew ? 'Neuer Mitarbeiter' : draft.name}
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
        <label className="label" htmlFor="m-name">Name</label>
        <input
          id="m-name"
          className="input"
          value={draft.name}
          onChange={(e) => set({ name: e.target.value })}
          placeholder="Vor- und Nachname"
          maxLength={80}
        />
        <p className="hint">Mit diesem Namen meldet er sich in der App an.</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="m-phone">Telefon</label>
        <input
          id="m-phone"
          className="input"
          type="tel"
          value={draft.phone || ''}
          onChange={(e) => set({ phone: e.target.value })}
          maxLength={40}
        />
      </div>

      <div className="field">
        <span className="label">Rolle</span>
        <div className="segmented">
          <button
            type="button"
            className={`segmented__btn${draft.role === 'mitarbeiter' ? ' segmented__btn--active' : ''}`}
            onClick={() => set({ role: 'mitarbeiter' })}
          >
            Mitarbeiter
          </button>
          <button
            type="button"
            className={`segmented__btn${draft.role === 'chef' ? ' segmented__btn--active' : ''}`}
            onClick={() => set({ role: 'chef' })}
          >
            Chef
          </button>
        </div>
        <p className="hint">
          Nur der Chef kann Termine anlegen, verschieben und Stammdaten pflegen.
        </p>
      </div>

      <div className="field">
        <span className="label">Farbe im Planungsboard</span>
        <div className="row row--wrap" style={{ gap: 7 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Farbe ${c}`}
              onClick={() => set({ color: c })}
              style={{
                width: 34, height: 34, cursor: 'pointer', background: c,
                border: draft.color === c ? '3px solid var(--hd-ink)' : '1px solid var(--hd-line)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="m-pin">
          {isNew ? 'Start-PIN (5 Ziffern)' : 'Neue PIN vergeben (optional)'}
        </label>
        <input
          id="m-pin"
          className="input"
          inputMode="numeric"
          autoComplete="off"
          value={draft.pin || ''}
          onChange={(e) => set({ pin: e.target.value.replace(/\D/g, '').slice(0, 5) })}
          placeholder={isNew ? 'z. B. 40721' : 'Leer lassen = unverändert'}
        />
        <p className="hint">
          {isNew
            ? 'Die PIN dem Mitarbeiter mitteilen – er kann sie danach selbst ändern.'
            : 'Setzt eine bestehende Sperre nach Fehlversuchen automatisch zurück.'}
        </p>
      </div>

      {!isNew && (
        <div className="field" style={{ marginBottom: 0 }}>
          <label className="row" style={{ alignItems: 'center', gap: 9, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(e) => set({ active: e.target.checked })}
              style={{ width: 20, height: 20 }}
            />
            <span>Aktiv (kann sich anmelden und Termine bekommen)</span>
          </label>
        </div>
      )}
    </Modal>
  );
}
