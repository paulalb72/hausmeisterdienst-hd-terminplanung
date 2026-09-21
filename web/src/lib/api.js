// Schmaler Wrapper um fetch. Die Sitzung steckt in einem httpOnly-Cookie,
// deshalb braucht es hier keine Token-Verwaltung.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
    });
  } catch {
    // Netzabdeckung auf der Baustelle ist nicht selbstverständlich.
    throw new ApiError('Keine Verbindung zum Server. Internetverbindung prüfen.', 0);
  }

  if (res.status === 204) return null;

  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* kein JSON */ }

  if (!res.ok) {
    throw new ApiError(data?.error || `Fehler ${res.status}`, res.status);
  }
  return data;
}

const get = (path) => request(path);
const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body ?? {}) });
const del = (path) => request(path, { method: 'DELETE' });

/** Baut aus einem Filter-Objekt einen Query-String ohne leere Werte. */
function qs(params) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export const api = {
  // Anmeldung
  loginList:  () => get('/auth/employees'),
  login:      (employeeId, pin) => post('/auth/login', { employeeId, pin }),
  logout:     () => post('/auth/logout'),
  me:         () => get('/auth/me'),
  changePin:  (currentPin, newPin) => post('/auth/pin', { currentPin, newPin }),

  // Mitarbeiter
  employees:        () => get('/employees'),
  createEmployee:   (data) => post('/employees', data),
  updateEmployee:   (id, data) => put(`/employees/${id}`, data),
  unlockEmployee:   (id) => post(`/employees/${id}/unlock`),
  deleteEmployee:   (id) => del(`/employees/${id}`),

  // Objekte sind Freitext am Termin. Die Vorschlagsliste speist sich aus
  // den bereits verwendeten Bezeichnungen – es gibt keine Stammdaten.
  objectSuggestions: () => get('/appointments/objects/suggestions'),

  // Termine
  appointments:      (filter) => get(`/appointments${qs(filter)}`),
  appointment:       (id) => get(`/appointments/${id}`),
  createAppointment: (data) => post('/appointments', data),
  updateAppointment: (id, data) => put(`/appointments/${id}`, data),
  cancelAppointment: (id) => post(`/appointments/${id}/cancel`),
  deleteAppointment: (id) => del(`/appointments/${id}`),

  // Push
  pushKey:         () => get('/push/key'),
  pushSubscribe:   (sub) => post('/push/subscribe', sub),
  pushUnsubscribe: (endpoint) => post('/push/unsubscribe', { endpoint }),
  pushTest:        () => post('/push/test'),
};
