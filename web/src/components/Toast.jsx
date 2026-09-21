import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ToastContext = createContext(() => {});

/** Kurze Rueckmeldung am unteren Rand: "Termin gespeichert" usw. */
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);

  const show = useCallback((message, kind = 'ok') => {
    setToast({ message, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          className={`toast${toast.kind === 'error' ? ' toast--error' : ''}`}
          role="status"
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
