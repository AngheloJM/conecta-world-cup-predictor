// ============================================================
//  CALENDARIO · partidos reales + apuestas relacionales (apuestas_partidos)
//  Depende de: data.js (PHASES, PARTIDOS, tName), api.js (api)
// ============================================================

const calendarEl = document.getElementById('calendar');
const calPhaseEl = document.getElementById('cal-phase');

// Apuestas del usuario: partido_id -> { prediccion_local, prediccion_visitante, puntos_ganados }
let APUESTAS = {};

calPhaseEl.innerHTML = PHASES.map(p => `<option value="${p}">${p === 'Todas' ? 'Todas las fases' : p}</option>`).join('');

// Carga las apuestas del usuario autenticado (tras iniciar sesión) y repinta.
async function loadApuestas() {
  try {
    const list = await api.getApuestas();
    APUESTAS = {};
    list.forEach(a => { APUESTAS[a.partido_id] = a; });
  } catch (_) { APUESTAS = {}; }
  renderCalendar();
}

function crestImg(url, cod) {
  return url
    ? `<img src="${url}" class="w-6 h-6 object-contain flex-shrink-0" loading="lazy" alt="${cod || ''}" />`
    : `<span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-white/10 text-white/70">${cod || '—'}</span>`;
}

function matchRow(p) {
  const start = new Date(p.fecha_hora);
  const finalizado = p.estado === 'Finalizado';
  const cerrado = finalizado || start <= new Date();
  const ap = APUESTAS[p.id];
  const bl = ap && ap.prediccion_local != null ? ap.prediccion_local : '';
  const bv = ap && ap.prediccion_visitante != null ? ap.prediccion_visitante : '';
  const hora = start.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  const etiqueta = p.grupo ? `Grupo ${p.grupo}` : p.fase;
  const inpCls = 'w-10 h-9 text-center font-bold text-white bg-white/10 border border-white/20 rounded-lg disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-acento/40 focus:border-acento';

  const fila = (name, crest, cod, side, goles, bet) => `
    <div class="flex items-center gap-2">
      ${crestImg(crest, cod)}
      <span class="text-sm font-semibold text-slate-100 flex-1 min-w-0 truncate">${name}</span>
      ${finalizado
        ? `<span class="w-9 text-center font-extrabold text-acento tabular-nums">${goles}</span>`
        : `<input type="number" min="0" max="20" data-bet="${p.id}" data-side="${side}" value="${bet}" placeholder="0" class="${inpCls}" ${cerrado ? 'disabled' : ''} />`}
    </div>`;

  // Pie: finalizado muestra tu predicción + puntos; cerrado muestra aviso.
  let pie = '';
  if (finalizado) {
    const tuyo = ap ? ` · Tu: ${ap.prediccion_local}-${ap.prediccion_visitante} → <span class="text-white">${ap.puntos_ganados} pts</span>` : '';
    pie = `<span class="text-[10px] font-bold text-acento">FINALIZADO</span><span class="text-[10px] text-blue-200/70">${tuyo}</span>`;
  } else if (cerrado) {
    pie = '<span class="text-[10px] text-blue-200/60">Cerrado · ya inició</span>';
  }

  return `
    <div class="rounded-xl border border-white/10 bg-white/5 p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-wide text-acento bg-acento/15 rounded px-2 py-0.5">${etiqueta}</span>
        <span class="text-[11px] text-blue-200/70 truncate max-w-[55%] text-right">${hora}${p.venue ? ' · ' + p.venue : ''}</span>
      </div>
      <div class="space-y-1.5">
        ${fila(tName(p.equipo_local), p.crest_local, p.local_cod, 'l', p.goles_local, bl)}
        ${fila(tName(p.equipo_visitante), p.crest_visitante, p.visitante_cod, 'v', p.goles_visitante, bv)}
      </div>
      ${pie ? `<div class="text-right mt-1.5">${pie}</div>` : ''}
    </div>`;
}

function renderCalendar() {
  if (!PARTIDOS.length) {
    calendarEl.innerHTML = '<p class="text-sm text-blue-200 py-6 text-center">Cargando partidos…</p>';
    return;
  }
  const phase = calPhaseEl.value || 'Todas';
  const list = PARTIDOS.filter(p => phase === 'Todas' || p.fase === phase);
  if (!list.length) {
    calendarEl.innerHTML = '<p class="text-sm text-blue-200 py-6 text-center">No hay partidos en esta fase.</p>';
    return;
  }

  const byDay = new Map();
  for (const p of list) {
    const key = new Date(p.fecha_hora).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(p);
  }

  calendarEl.innerHTML = [...byDay.entries()].map(([day, items]) => `
    <div>
      <div class="flex items-center gap-2 mb-2">
        <h3 class="text-sm font-extrabold text-white capitalize">${day}</h3>
        <span class="text-[10px] font-semibold uppercase tracking-wide text-blue-200 bg-white/5 border border-white/10 rounded px-2 py-0.5">${items.length} ${items.length === 1 ? 'partido' : 'partidos'}</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">${items.map(matchRow).join('')}</div>
    </div>`).join('');
}

// Inputs de marcador -> POST /apuestas (debounced por partido; con candado de tiempo en el backend).
const _betTimers = {};
calendarEl.addEventListener('input', e => {
  const inp = e.target.closest('[data-bet]'); if (!inp) return;
  const id = +inp.dataset.bet;
  const ap = APUESTAS[id] || { partido_id: id, prediccion_local: null, prediccion_visitante: null, puntos_ganados: 0 };
  const val = inp.value === '' ? null : parseInt(inp.value, 10);
  if (inp.dataset.side === 'l') ap.prediccion_local = val; else ap.prediccion_visitante = val;
  APUESTAS[id] = ap;

  clearTimeout(_betTimers[id]);
  _betTimers[id] = setTimeout(() => {
    if (ap.prediccion_local == null || ap.prediccion_visitante == null) return; // se requieren ambos
    api.saveApuesta(id, ap.prediccion_local, ap.prediccion_visitante).catch(() => {});
  }, 700);
});
calPhaseEl.addEventListener('change', renderCalendar);
