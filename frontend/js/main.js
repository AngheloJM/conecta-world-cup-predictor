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
    <tr class="hover:bg-fondo transition">
      <td class="px-6 py-3 font-bold text-slate-600 w-10">${medal(r.pos)}</td>
      <td class="px-2 py-3 font-semibold text-slate-800">${r.equipo}</td>
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

// ---------- Formulario (nombre + envío de todo) ----------
const nombreEl = document.getElementById('nombre');
nombreEl.addEventListener('input', () => { S.nombre = nombreEl.value; saveState(); });

document.getElementById('predict-form').addEventListener('submit', e => {
  e.preventDefault();
  if (!S.nombre.trim()) { toast('Escribe tu nombre', 'err'); return; }
  const payload = {
    usuario: { nombre: S.nombre },
    campeon: S.f ? S.f.name : null,
    grupos: Object.fromEntries(Object.entries(GROUPS).map(([g, ts]) => [g, ts.map((x, i) => ({ pos: i + 1, equipo: x.name }))])),
    mejores_terceros: selectedThirds().map(x => x.name),
    apuestas: Object.entries(S.bets).map(([id, b]) => ({ partido_id: +id, prediccion_local: +(b.l || 0), prediccion_visitante: +(b.v || 0) })),
  };
  console.log('Payload listo para el backend Rust:', payload);
  saveState();
  toast('¡Predicciones enviadas! ✓');
});

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
