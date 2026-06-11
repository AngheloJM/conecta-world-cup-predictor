// ============================================================
//  CLIENTE HTTP + SESIÓN
//  Depende de: config.js (API_BASE)
// ============================================================

const Auth = {
  token: () => localStorage.getItem('conecta_token'),
  user: () => { try { return JSON.parse(localStorage.getItem('conecta_user') || 'null'); } catch (_) { return null; } },
  set(token, user) {
    localStorage.setItem('conecta_token', token);
    localStorage.setItem('conecta_user', JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem('conecta_token');
    localStorage.removeItem('conecta_user');
  },
};

async function apiFetch(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const tk = Auth.token();
  if (tk) headers['Authorization'] = 'Bearer ' + tk;

  let res;
  try {
    res = await fetch(API_BASE + path, { ...opts, headers });
  } catch (_) {
    throw new Error('No se pudo conectar con el servidor. ¿Está corriendo el backend?');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || `Error ${res.status}`);
  return data;
}

const api = {
  register: (body) => apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  me: () => apiFetch('/me'),
  cambiarPassword: (actual, nueva) => apiFetch('/me/password', { method: 'POST', body: JSON.stringify({ actual, nueva }) }),
  getSimulacion: () => apiFetch('/simulacion'),
  saveSimulacion: (body) => apiFetch('/simulacion', { method: 'PUT', body: JSON.stringify(body) }),
  getPartidos: () => apiFetch('/partidos'),
  getRanking: () => apiFetch('/ranking'),
  getApuestas: () => apiFetch('/apuestas'),
  saveApuesta: (partidoId, l, v) => apiFetch('/apuestas', { method: 'POST', body: JSON.stringify({ partido_id: partidoId, prediccion_local: l, prediccion_visitante: v }) }),

  // --- Admin ---
  adminSync: () => apiFetch('/admin/sync', { method: 'POST' }),
  adminRecalcular: () => apiFetch('/admin/recalcular', { method: 'POST' }),
  adminUsuarios: () => apiFetch('/admin/usuarios'),
  adminBorrarUsuario: (id) => apiFetch('/admin/usuarios/' + id, { method: 'DELETE' }),
  adminResetPassword: (id, password) => apiFetch('/admin/usuarios/' + id + '/password', { method: 'POST', body: JSON.stringify({ password }) }),
  adminSetResultado: (id, l, v) => apiFetch('/admin/partido/' + id + '/resultado', { method: 'POST', body: JSON.stringify({ goles_local: l, goles_visitante: v }) }),
};
