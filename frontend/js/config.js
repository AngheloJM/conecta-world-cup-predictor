// ============================================================
//  CONFIG · URL del backend
//  En local apunta a localhost:3000. En producción, al backend
//  desplegado en Render.
// ============================================================
const API_BASE =
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.protocol === 'file:')
    ? 'http://localhost:3000'
    : 'https://conecta-world-cup-predictor.onrender.com'; // backend desplegado en Render
