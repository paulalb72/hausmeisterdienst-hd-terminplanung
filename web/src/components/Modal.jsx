import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from './Icons.jsx';

/**
 * Dialog. Auf dem Handy faehrt er von unten hoch, ab Tablet steht er mittig.
 * Escape und ein Klick auf den Hintergrund schliessen ihn.
 */
export function Modal({ title, onClose, children, footer, wide = false }) {
  const boxRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    // Hintergrund nicht mitscrollen lassen, solange der Dialog offen ist.
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    boxRef.current?.querySelector('input, select, textarea, button')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="modal__backdrop"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={boxRef}
        style={wide ? { maxWidth: 760 } : undefined}
      >
        <div className="modal__head">
          <h2>{title}</h2>
          <button type="button" className="iconbtn" onClick={onClose} aria-label="Schließen">
            <IconClose />
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Rueckfrage vor dem Stornieren oder Loeschen. */
export function ConfirmModal({ title, message, confirmLabel = 'Ja, ausführen', danger, onConfirm, onClose, busy }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn btn--muted" onClick={onClose} disabled={busy}>
            Abbrechen
          </button>
          <button
            type="button"
            className={`btn${danger ? ' btn--danger' : ''}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Moment…' : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>{message}</p>
    </Modal>
  );
}
