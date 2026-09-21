import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatDateLong } from '../lib/dates.js';
import { ruftAn, zeitHinweis, zeitLabel } from '../lib/termin.js';
import { Avatar, ErrorBox, Shell, Spinner } from '../components/Shell.jsx';
import { ConfirmModal } from '../components/Modal.jsx';
import { useToast } from '../components/Toast.jsx';
import {
  IconBan, IconBuilding, IconEdit, IconMapPin, IconNote, IconPhone,
  IconTrash, IconUser,
} from '../components/Icons.jsx';

export default function TerminDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isChef } = useAuth();
  const toast = useToast();

  const [appt, setAppt] = useState(null);
  const [error, setError] = useState(null);
  const [confirm, setConfirm] = useState(null); // 'cancel' | 'delete'
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAppt(null);
    api.appointment(id)
      .then(setAppt)
      .catch((err) => setError(err.message));
  }, [id]);

  async function doCancel() {
    setBusy(true);
    try {
      const updated = await api.cancelAppointment(id);
      setAppt(updated);
      setConfirm(null);
      toast('Termin storniert. Der Mitarbeiter wurde benachrichtigt.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function doDelete() {
    setBusy(true);
    try {
      await api.deleteAppointment(id);
      toast('Termin gelöscht.');
      navigate('/', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  if (error) {
    return <Shell title="Termin" back><ErrorBox error={error} /></Shell>;
  }
  if (!appt) {
    return <Shell title="Termin" back><Spinner /></Shell>;
  }

  const hinweis = zeitHinweis(appt);
  // Das Objekt ist Freitext und enthält in aller Regel die Adresse –
  // damit lässt sich die Navigation direkt füttern.
  const mapsQuery = encodeURIComponent(appt.object || '');

  return (
    <Shell
      title="Termin"
      back
      nav={false}
      action={isChef && (
        <button
          type="button"
          className="topbar__btn"
          onClick={() => navigate(`/termin/${appt.id}/bearbeiten`)}
          aria-label="Bearbeiten"
        >
          <IconEdit />
        </button>
      )}
    >
      <div style={{ margin: '-16px -14px 0' }}>
        <div className="detail__hero">
          {appt.status === 'storniert' && (
            <span className="chip chip--danger" style={{ marginBottom: 8 }}>Storniert</span>
          )}
          <h1 className="detail__title">{appt.title}</h1>
          <div className="detail__when">
            <span>{formatDateLong(appt.starts_at)}</span>
            <span style={{ color: 'var(--hd-green-head)' }}>{zeitLabel(appt)}</span>
          </div>
          {hinweis && (
            <p className="detail__ruftan"><IconPhone /> {hinweis}</p>
          )}
        </div>

        {appt.object && (
          <div className="detail__block">
            <div className="detail__label">
              <IconBuilding style={{ width: 13, height: 13, verticalAlign: -2 }} /> Objekt
            </div>
            <div className="detail__value detail__value--pre">{appt.object}</div>
            <a
              className="btn btn--ghost btn--sm"
              style={{ marginTop: 9 }}
              href={`https://www.google.com/maps/search/?api=1&query=${mapsQuery}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconMapPin style={{ width: 15, height: 15 }} /> Route anzeigen
            </a>
          </div>
        )}

        <div className="detail__block">
          <div className="detail__label">
            <IconUser style={{ width: 13, height: 13, verticalAlign: -2 }} /> Mitarbeiter
          </div>
          <div className="row" style={{ alignItems: 'center', gap: 9 }}>
            <Avatar name={appt.employee_name} color={appt.employee_color} />
            <span className="detail__value">{appt.employee_name}</span>
          </div>
        </div>

        {appt.notes && (
          <div className="detail__block">
            <div className="detail__label">
              <IconNote style={{ width: 13, height: 13, verticalAlign: -2 }} /> Arbeitsauftrag
            </div>
            <div className="detail__value detail__value--pre">{appt.notes}</div>
          </div>
        )}

        {isChef && (
          <div className="detail__actions">
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => navigate(`/termin/${appt.id}/bearbeiten`)}
            >
              <IconEdit style={{ width: 16, height: 16 }} /> Bearbeiten
            </button>
            {appt.status === 'geplant' ? (
              <button type="button" className="btn btn--danger" onClick={() => setConfirm('cancel')}>
                <IconBan style={{ width: 16, height: 16 }} /> Stornieren
              </button>
            ) : (
              <button type="button" className="btn btn--danger" onClick={() => setConfirm('delete')}>
                <IconTrash style={{ width: 16, height: 16 }} /> Endgültig löschen
              </button>
            )}
          </div>
        )}
      </div>

      {confirm === 'cancel' && (
        <ConfirmModal
          title="Termin stornieren?"
          message={`"${appt.title}" verschwindet aus der Übersicht von ${appt.employee_name}. `
                 + 'Der Termin bleibt für dich in der Historie sichtbar.'}
          confirmLabel="Ja, stornieren"
          danger
          busy={busy}
          onConfirm={doCancel}
          onClose={() => setConfirm(null)}
        />
      )}
      {confirm === 'delete' && (
        <ConfirmModal
          title="Endgültig löschen?"
          message="Der Termin wird unwiderruflich entfernt und taucht in keiner Auswertung mehr auf."
          confirmLabel="Ja, löschen"
          danger
          busy={busy}
          onConfirm={doDelete}
          onClose={() => setConfirm(null)}
        />
      )}
    </Shell>
  );
}
