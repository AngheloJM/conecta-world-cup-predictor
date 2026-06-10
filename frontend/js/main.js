// ============================================================
//  UI común (toast, reloj), leaderboard, envío e INIT
//  Se carga al final: todas las funciones de los otros módulos ya existen.
// ============================================================

// ---------- Toast ----------
function toast(msg, type) {
  const colors = { ok: 'bg-marca', win: 'bg-acento', err: 'bg-red-600' };
  const el = document.createElement('div');
  el.className = `toast ${colors[type] || colors.ok} text-white text-sm font-semibold px-4 py-3 rounded-xl shadow-suave max-w-xs`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => { el.style.transition = 'opacity .3s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2800);
}

// ---------- Leaderboard ----------
function renderLeaderboard() {
  const medal = p => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p;
  document.getElementById('leaderboard').innerHTML = LEADERBOARD.map(r => `
    <tr class="hover:bg-white/5 transition">
      <td class="px-6 py-3 font-bold text-blue-200 w-10">${medal(r.pos)}</td>
      <td class="px-2 py-3 font-semibold text-white">${r.equipo}</td>
      <td class="px-6 py-3 text-right font-extrabold text-acento">${r.puntos}</td></tr>`).join('');
}

// ---------- Pestañas (vistas) ----------
const VIEWS = ['predictor', 'calendario', 'tablero'];
function showView(name) {
  VIEWS.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
    document.querySelector(`[data-view="${v}"]`).classList.toggle('tab-active', v === name);
  });
  // El bracket sólo mide bien estando visible: redibuja conectores al entrar al Predictor.
  if (name === 'predictor') requestAnimationFrame(drawConnectors);
  window.scrollTo({ top: 0 });
}
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  showView(b.dataset.view);
});

// ---------- Reloj (cuenta regresiva) ----------
function tick() {
  const diff = DEADLINE - new Date(); const s = Math.max(0, Math.floor(diff / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  document.getElementById('cd-chip').textContent = `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`;
}

// ---------- Guardado de la predicción (local + servidor) ----------
function _simPayload() {
  let sub = null;
  if (S.f && S.sf[0] && S.sf[1]) sub = (S.f === S.sf[0] ? S.sf[1] : S.sf[0]).name;
  return {
    campeon_predicho: S.f ? S.f.name : null,
    subcampeon_predicho: sub,
    estructura_bracket_json: serializeState(),
  };
}

// Guardado explícito (con feedback) — botón "Guardar" / "Enviar".
async function guardarPrediccion() {
  if (!Auth.token()) { saveState(); toast('Guardado localmente'); return; }
  try {
    await api.saveSimulacion(_simPayload());
    toast('Predicción guardada en tu cuenta ✓');
  } catch (e) {
    toast('Guardado local; error en servidor: ' + e.message, 'err');
  }
}

// Auto-guardado silencioso (debounced) ante cualquier cambio (bracket o calendario).
let _saveTimer = null;
function scheduleServerSave() {
  if (!Auth.token()) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { api.saveSimulacion(_simPayload()).catch(() => {}); }, 900);
}

// ---------- Formulario del calendario ----------
const nombreEl = document.getElementById('nombre');
nombreEl.addEventListener('input', () => { S.nombre = nombreEl.value; saveState(); });
document.getElementById('predict-form').addEventListener('submit', e => { e.preventDefault(); guardarPrediccion(); });

// ============================================================  INIT
(function init() {
  const had = loadState();
  if (S.nombre) nombreEl.value = S.nombre;

  renderGroups();
  renderThirds();
  buildBracketSkeleton();
  updateBracket();
  requestAnimationFrame(drawConnectors);
  renderCalendar();
  renderLeaderboard();

  tick();
  setInterval(tick, 1000);
  if (had) toast('Recuperamos tu predicción anterior');
})();
