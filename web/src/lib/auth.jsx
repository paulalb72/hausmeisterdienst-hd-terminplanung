import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Beim App-Start pruefen, ob das Sitzungs-Cookie noch gilt. Dadurch bleibt
  // ein Mitarbeiter auf seinem Handy wochenlang angemeldet.
  useEffect(() => {
    let cancelled = false;
    api.me()
      .then((data) => { if (!cancelled) setUser(data.user); })
      .catch(() => { if (!cancelled) setUser(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (employeeId, pin) => {
    const data = await api.login(employeeId, pin);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); }
  }, []);

  const value = {
    user,
    loading,
    login,
    logout,
    isChef: user?.role === 'chef',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von <AuthProvider> stehen.');
  return ctx;
}
