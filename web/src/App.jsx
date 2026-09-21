import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { Spinner } from './components/Shell.jsx';

import Login from './pages/Login.jsx';
import Termine from './pages/Termine.jsx';
import Kalender from './pages/Kalender.jsx';
import TerminDetail from './pages/TerminDetail.jsx';
import TerminForm from './pages/TerminForm.jsx';
import Dispo from './pages/Dispo.jsx';
import Mehr from './pages/Mehr.jsx';
import Mitarbeiter from './pages/Mitarbeiter.jsx';

export default function App() {
  const { user, loading, isChef } = useAuth();

  if (loading) {
    return <div className="shell"><Spinner /></div>;
  }

  if (!user) {
    return (
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Alles andere landet vor der Anmeldung auf dem Login. */}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />

        {/* Beide Rollen */}
        <Route path="/" element={<Termine />} />
        <Route path="/kalender" element={<Kalender />} />
        <Route path="/termin/:id" element={<TerminDetail />} />
        <Route path="/mehr" element={<Mehr />} />

        {/* Nur der Chef plant und pflegt Stammdaten. Der Server prueft das
            ohnehin noch einmal – das hier ist nur die Oberflaeche. */}
        {isChef && (
          <>
            <Route path="/termin/neu" element={<TerminForm />} />
            <Route path="/termin/:id/bearbeiten" element={<TerminForm />} />
            <Route path="/dispo" element={<Dispo />} />
            <Route path="/verwaltung/mitarbeiter" element={<Mitarbeiter />} />
          </>
        )}

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
