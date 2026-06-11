// ============================================================
//  VISTA "MIS APUESTAS" · resumen personal del usuario
//  Depende de: api.js, data.js (PARTIDOS, tName), calendar.js (crestImg), api (Auth)
// ============================================================

const misEl = document.getElementById('mis-content');

function _ptsColor(pts) {
  return pts === 10 ? 'text-acento' : pts >= 5 ? 'text-white' : pts > 0 ? 'text-blue-200' : 'text-white/40';
}

async function renderMis() {
  misEl.innerHTML = '<p class="text-blue-200 text-sm py-8 text-center">Cargando…</p>';

  let apuestas = [], rank = [];
  try {
    [apuestas, rank] = await Promise.all([api.getApuestas(), api.getRanking()]);
  } catch (_) { /* sin conexión */ }

  const yo = (Auth.user() || {}).id;
  const mi = rank.find(r => r.id === yo) || {};

  // Resumen
  const resumen = `
    <div class="bg-white/5 border border-white/10 rounded-card p-5 flex flex-wrap items-center gap-x-8 gap-y-4">
      <div>
        <div class="text-[10px] uppercase tracking-wide text-blue-200">Posición</div>
        <div class="text-3xl font-extrabold text-white">${mi.pos ? '#' + mi.pos : '—'}</div>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wide text-blue-200">Puntos</div>
        <div class="text-3xl font-extrabold text-acento tabular-nums">${mi.puntos || 0}</div>
      </div>
      <div>
        <div class="text-[10px] uppercase tracking-wide text-blue-200">Bonus predictor</div>
        <div class="text-3xl font-extrabold text-white tabular-nums">+${mi.predictor || 0}</div>
      </div>
      <div class="flex gap-5 text-center">
        <div><div class="text-xl font-extrabold text-white">${mi.exactos || 0}</div><div class="text-[10px] text-blue-200">exactos</div></div>
        <div><div class="text-xl font-extrabold text-white">${mi.diferencias || 0}</div><div class="text-[10px] text-blue-200">diferencia</div></div>
        <div><div class="text-xl font-extrabold text-white">${mi.simples || 0}</div><div class="text-[10px] text-blue-200">simples</div></div>
      </div>
    </div>`;

  // Lista de apuestas (unidas con los partidos)
  const porId = {};
  PARTIDOS.forEach(p => { porId[p.id] = p; });
  apuestas.sort((a, b) => new Date(porId[a.partido_id]?.fecha_hora || 0) - new Date(porId[b.partido_id]?.fecha_hora || 0));

  let lista;
  if (!apuestas.length) {
    lista = '<p class="text-blue-200 text-sm py-10 text-center">Aún no has hecho apuestas. Ve al <b class="text-white">Calendario</b> y predice marcadores.</p>';
  } else {
    lista = '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + apuestas.map(a => {
      const p = porId[a.partido_id]; if (!p) return '';
      const fin = p.estado === 'Finalizado';
      const fecha = new Date(p.fecha_hora).toLocaleDateString('es', { day: 'numeric', month: 'short' });
      return `
      <div class="rounded-xl border border-white/10 bg-white/5 p-3">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] uppercase font-bold text-acento bg-acento/15 rounded px-2 py-0.5">${p.grupo ? 'Grupo ' + p.grupo : p.fase}</span>
          <span class="text-[11px] text-blue-200/70">${fecha}</span>
        </div>
        <div class="flex items-center gap-2">
          <div class="flex items-center gap-1.5 flex-1 min-w-0">${crestImg(p.crest_local, p.local_cod)}<span class="truncate text-sm font-semibold text-slate-100">${tName(p.equipo_local)}</span></div>
          <span class="text-sm font-extrabold text-white tabular-nums px-1">${a.prediccion_local}-${a.prediccion_visitante}</span>
          <div class="flex items-center gap-1.5 flex-1 min-w-0 justify-end"><span class="truncate text-sm font-semibold text-slate-100 text-right">${tName(p.equipo_visitante)}</span>${crestImg(p.crest_visitante, p.visitante_cod)}</div>
        </div>
        <div class="flex items-center justify-between mt-1.5 text-[11px]">
          <span class="text-blue-200/70">${fin ? `Real: ${p.goles_local}-${p.goles_visitante}` : 'Pendiente'}</span>
          ${fin ? `<span class="font-extrabold ${_ptsColor(a.puntos_ganados)}">+${a.puntos_ganados} pts</span>` : ''}
        </div>
      </div>`;
    }).join('') + '</div>';
  }

  misEl.innerHTML = resumen + `<h2 class="text-sm font-bold text-white mt-6 mb-3">Tus pronósticos (${apuestas.length})</h2>` + lista;
}
