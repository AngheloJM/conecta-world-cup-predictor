// ============================================================
//  UI común (toast, reloj), leaderboard, envío e INIT
//  Se carga al final: todas las funciones de los otros módulos ya existen.
// ============================================================

// ---------- Indicador "Guardado ✓" ----------
let _savedTimer = null;
function flashGuardado() {
  const el = document.getElementById('saved-flag');
  if (!el) return;
  el.classList.remove('hidden');
  el.style.opacity = '1';
  clearTimeout(_savedTimer);
  _savedTimer = setTimeout(() => {
    el.style.transition = 'opacity .4s';
    el.style.opacity = '0';
    setTimeout(() => el.classList.add('hidden'), 400);
  }, 1300);
}

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
  const podium = document.getElementById('podium');
  const sub = document.getElementById('tablero-sub');

  // Skeleton mientras carga.
  tbody.innerHTML = Array.from({ length: 5 }).map(() =>
    '<tr class="animate-pulse"><td class="px-6 py-3.5"><div class="h-4 w-6 bg-white/10 rounded"></div></td><td class="px-2 py-3.5"><div class="h-4 w-32 bg-white/10 rounded"></div></td><td class="px-6 py-3.5"><div class="h-4 w-8 bg-white/10 rounded ml-auto"></div></td></tr>'
  ).join('');

  let rows;
  try { rows = await api.getRanking(); } catch (_) { rows = null; }

  if (!rows || !rows.length) {
    podium.innerHTML = '';
    tbody.innerHTML = '<tr><td class="px-6 py-8 text-center text-blue-200 text-sm" colspan="3">Aún no hay jugadores. ¡Sé el primero!</td></tr>';
    if (sub) sub.textContent = 'Aún no hay jugadores registrados.';
    return;
  }

  const yo = (Auth.user() || {}).id;
  const miFila = rows.find(r => r.id === yo);
  const nombreDe = r => r.nombre;

  // Resumen + "mi posición"
  if (sub) sub.textContent = `${rows.length} ${rows.length === 1 ? 'jugador' : 'jugadores'} en juego.`;
  const miPuesto = document.getElementById('tablero-mi-puesto');
  if (miFila && miPuesto) {
    miPuesto.classList.remove('hidden');
    document.getElementById('mi-pos').textContent = '#' + miFila.pos;
    document.getElementById('mi-pts').textContent = miFila.puntos;
  } else if (miPuesto) {
    miPuesto.classList.add('hidden');
  }

  // Podio (top 3) — colores por medalla + brillo para el campeón.
  const alturas = ['h-28', 'h-20', 'h-16'];
  const medallas = ['🥇', '🥈', '🥉'];
  const orden = [1, 0, 2]; // 2.º, 1.º, 3.º para el efecto podio
  // Indexado por puesto (0=1.º, 1=2.º, 2=3.º).
  const estilo = [
    { bar: 'border-amber-300/60 bg-gradient-to-t from-amber-400/30 to-amber-300/5', pts: 'text-amber-300' }, // oro
    { bar: 'border-slate-300/45 bg-gradient-to-t from-slate-300/20 to-slate-200/5', pts: 'text-slate-200' }, // plata
    { bar: 'border-orange-400/45 bg-gradient-to-t from-orange-500/22 to-orange-400/5', pts: 'text-orange-300' }, // bronce
  ];
  podium.innerHTML = orden.map(i => {
    const r = rows[i];
    if (!r) return '<div></div>';
    const esYo = r.id === yo;
    const st = estilo[i] || estilo[2];
    const campeon = i === 0;
    return `
    <div class="flex flex-col justify-end items-center">
      ${campeon ? '<div class="crown text-2xl leading-none -mb-0.5">👑</div>' : ''}
      <div class="text-3xl mb-1">${medallas[i]}</div>
      <div class="text-center mb-2">
        <div class="font-bold text-white text-sm truncate max-w-[9rem]">${nombreDe(r)}${esYo ? ' <span class="text-acento">·Tú</span>' : ''}</div>
        <div class="${st.pts} font-extrabold tabular-nums">${r.puntos} pts</div>
      </div>
      <div class="pod-bar w-full ${alturas[i]} rounded-t-xl border-t border-x ${st.bar} ${campeon ? 'pod-winner' : ''} ${esYo ? 'ring-1 ring-acento/60' : ''} flex items-start justify-center pt-1.5 text-xs font-bold text-white/90">${r.pos}.º</div>
    </div>`;
  }).join('');

  // Tabla completa
  tbody.innerHTML = rows.map(r => {
    const esYo = r.id === yo;
    return `
    <tr class="transition ${esYo ? 'bg-acento/15' : 'hover:bg-white/5'}">
      <td class="px-6 py-3.5 font-bold ${r.pos <= 3 ? 'text-white' : 'text-blue-200'} w-12">${medalPos(r.pos)}</td>
      <td class="px-2 py-3.5 font-semibold text-white">
        ${nombreDe(r)}${esYo ? '<span class="ml-2 text-[10px] font-bold uppercase text-acento">Tú</span>' : ''}
      </td>
      <td class="px-6 py-3.5 text-right font-extrabold text-acento tabular-nums text-base">${r.puntos}</td>
    </tr>`;
  }).join('');
}

// ---------- Pestañas (vistas) ----------
const VIEWS = ['predictor', 'calendario', 'tablero', 'mis', 'admin'];
function showView(name) {
  VIEWS.forEach(v => {
    document.getElementById('view-' + v).classList.toggle('hidden', v !== name);
    document.querySelector(`[data-view="${v}"]`).classList.toggle('tab-active', v === name);
  });
  // El bracket sólo mide bien estando visible: redibuja conectores al entrar al Predictor.
  if (name === 'predictor') requestAnimationFrame(drawConnectors);
  if (name === 'tablero') { renderLeaderboard(); renderSponsors(); }  // ranking + auspiciadores
  if (name === 'mis') renderMis();               // resumen personal fresco
  if (name === 'admin') renderAdmin();           // panel admin fresco
  window.scrollTo({ top: 0 });
}
document.getElementById('tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-view]'); if (!b) return;
  showView(b.dataset.view);
});

// ---------- Cierre del predictor ----------
function predictorCerrado() {
  return DEADLINE != null && Date.now() >= DEADLINE.getTime();
}

// ---------- Reloj (cuenta regresiva al cierre) ----------
function tick() {
  const chip = document.getElementById('cd-chip');
  if (!DEADLINE) { chip.textContent = '--'; return; }
  if (predictorCerrado()) {
    chip.textContent = 'Cerrado';
    document.getElementById('save-btn').disabled = true;
    return;
  }
  const s = Math.max(0, Math.floor((DEADLINE - new Date()) / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  chip.textContent = `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`;
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

// Guardado explícito (con feedback) — botón "Guardar".
async function guardarPrediccion() {
  if (predictorCerrado()) { toast('Predicciones cerradas: el Mundial ya va a comenzar', 'err'); return; }
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
  _saveTimer = setTimeout(() => { api.saveSimulacion(_simPayload()).then(flashGuardado).catch(() => {}); }, 900);
}

// ---------- Formulario del calendario ----------
document.getElementById('predict-form').addEventListener('submit', e => { e.preventDefault(); guardarPrediccion(); });

// ============================================================  CARGA DE DATOS REALES
// Promesa que resuelve cuando los grupos reales están construidos y pintados.
let _dataResolve;
const dataReadyPromise = new Promise(r => { _dataResolve = r; });

async function bootstrapData() {
  // Skeleton de grupos mientras llegan los partidos.
  document.getElementById('groups').innerHTML = Array.from({ length: 8 }).map(() =>
    '<div class="bg-white/5 rounded-card border border-white/10 p-3 animate-pulse"><div class="h-4 w-20 bg-white/10 rounded mb-3"></div>' +
    '<div class="space-y-2">' + '<div class="h-7 bg-white/10 rounded"></div>'.repeat(4) + '</div></div>'
  ).join('');

  try { PARTIDOS = await api.getPartidos(); } catch (_) { PARTIDOS = []; }
  buildGroupsFromPartidos(PARTIDOS);   // 12 grupos reales con escudos
  calcularDeadline(PARTIDOS);          // cierre = 30 min antes del primer partido

  loadState();                          // estado local (si hay), defensivo

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
