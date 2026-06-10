// ============================================================
//  CONFIG · URL del backend
//  En local apunta a localhost:3000. En producción, reemplaza
//  la URL por la del backend desplegado en Railway (paso 5).
// ============================================================
const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')
    ? 'http://localhost:3000'
    : 'https://TU-BACKEND.up.railway.app'; // ← cambiar tras desplegar en Railway
