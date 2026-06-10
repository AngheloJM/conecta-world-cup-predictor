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

// ---------- Tablero de líderes (real, desde la BD) ----------
const medalPos = p => p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p;

async function renderLeaderboard() {
  const tbody = document.getElementById('leaderboard');
  let rows;
  try { rows = await api.getRanking(); } catch (_) { rows = null; }

  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr><td class="px-6 py-6 text-center text-blue-200 text-sm" colspan="3">Aún no hay jugadores. ¡Sé el primero!</td></tr>';
    return;
  }

  const yo = (Auth.user() || {}).id;
  tbody.innerHTML = rows.map(r => {
    const esYo = r.id === yo;
    const nombre = r.nombre_equipo || r.nombre;
    return `
    <tr class="transition ${esYo ? 'bg-acento/15' : 'hover:bg-white/5'}">
      <td class="px-6 py-3 font-bold ${r.pos <= 3 ? 'text-white' : 'text-blue-200'} w-10">${medalPos(r.pos)}</td>
      <td class="px-2 py-3 font-semibold text-white">
        ${nombre}${esYo ? '<span class="ml-2 text-[10px] font-bold uppercase text-acento">Tú</span>' : ''}
        ${r.nombre_equipo ? `<div class="text-[11px] text-blue-200/60 font-normal">${r.nombre}</div>` : ''}
      </td>
      <td class="px-6 py-3 text-right font-extrabold text-acento tabular-nums">${r.puntos}</td>
    </tr>`;
  }).join('');
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
  if (name === 'tablero') renderLeaderboard();   // ranking fresco al abrir
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
// `predReady` evita guardar ANTES de haber cargado la predicción del servidor
// (si no, un cambio temprano sobreescribiría lo guardado con un estado vacío).
let predReady = false;
let _saveTimer = null;
function scheduleServerSave() {
  if (!Auth.token() || !predReady) return;
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { api.saveSimulacion(_simPayload()).catch(() => {}); }, 900);
}

// ---------- Formulario del calendario ----------
const nombreEl = document.getElementById('nombre');
nombreEl.addEventListener('input', () => { S.nombre = nombreEl.value; saveState(); });
document.getElementById('predict-form').addEventListener('submit', e => { e.preventDefault(); guardarPrediccion(); });

// ============================================================  CARGA DE DATOS REALES
// Promesa que resuelve cuando los grupos reales están construidos y pintados.
let _dataResolve;
const dataReadyPromise = new Promise(r => { _dataResolve = r; });

async function bootstrapData() {
  try { PARTIDOS = await api.getPartidos(); } catch (_) { PARTIDOS = []; }
  buildGroupsFromPartidos(PARTIDOS);   // 12 grupos reales con escudos

  loadState();                          // estado local (si hay), defensivo
  if (S.nombre) nombreEl.value = S.nombre;

  renderGroups();
  renderThirds();
  buildBracketSkeleton();
  updateBracket();
  requestAnimationFrame(drawConnectors);
  renderCalendar();

  _dataResolve();                       // habilita la carga de la predicción del usuario
}

// ============================================================  INIT
(function init() {
  renderLeaderboard();
  tick();
  setInterval(tick, 1000);
  bootstrapData();
})();
