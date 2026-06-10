// ============================================================
//  CALENDARIO / APUESTAS POR FECHA
//  Lista los partidos por día con su marcador a predecir.
//  Depende de: data.js (SCHEDULE, PHASES, flag, teamByName), store.js (S, saveState)
// ============================================================

const calendarEl = document.getElementById('calendar');
const calPhaseEl = document.getElementById('cal-phase');

// Llena el selector de fases una vez
calPhaseEl.innerHTML = PHASES.map(p => `<option value="${p}">${p === 'Todas' ? 'Todas las fases' : p}</option>`).join('');

function matchRow(m) {
  const home = teamByName(m.home), away = teamByName(m.away);
  const bl = (S.bets[m.id] && S.bets[m.id].l) || '';
  const bv = (S.bets[m.id] && S.bets[m.id].v) || '';
  return `
    <div class="rounded-xl border border-borde bg-fondo p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-wide text-marca bg-marca/10 rounded px-2 py-0.5">Grupo ${m.group}</span>
        <span class="text-[11px] text-slate-400">${m.time} · ${m.venue}</span>
      </div>
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div class="flex items-center gap-2 min-w-0">${flag(home, 'w-6')}<span class="text-sm font-semibold text-slate-700 truncate">${home.name}</span></div>
        <div class="flex items-center gap-1">
          <input type="number" min="0" max="20" data-bet="${m.id}" data-side="l" value="${bl}" placeholder="0" class="w-10 h-10 text-center font-bold text-marca bg-white border border-borde rounded-lg focus:outline-none focus:ring-2 focus:ring-acento/40 focus:border-acento" />
          <span class="text-slate-400 font-bold text-xs">VS</span>
          <input type="number" min="0" max="20" data-bet="${m.id}" data-side="v" value="${bv}" placeholder="0" class="w-10 h-10 text-center font-bold text-marca bg-white border border-borde rounded-lg focus:outline-none focus:ring-2 focus:ring-acento/40 focus:border-acento" />
        </div>
        <div class="flex items-center gap-2 justify-end min-w-0"><span class="text-sm font-semibold text-slate-700 truncate text-right">${away.name}</span>${flag(away, 'w-6')}</div>
      </div>
    </div>`;
}

function renderCalendar() {
  const phase = calPhaseEl.value || 'Todas';
  const days = SCHEDULE.filter(d => phase === 'Todas' || d.phase === phase);
  if (!days.length) { calendarEl.innerHTML = '<p class="text-sm text-slate-400 py-6 text-center">No hay partidos en esta fase todavía.</p>'; return; }
  calendarEl.innerHTML = days.map(d => `
    <div>
      <div class="flex items-center gap-2 mb-2">
        <h3 class="text-sm font-extrabold text-marca">${d.day}</h3>
        <span class="text-[10px] font-semibold uppercase tracking-wide text-slate-400 bg-fondo border border-borde rounded px-2 py-0.5">${d.items.length} partidos</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">${d.items.map(matchRow).join('')}</div>
    </div>`).join('');
}

// Inputs de marcador -> estado + persistencia
calendarEl.addEventListener('input', e => {
  const inp = e.target.closest('[data-bet]'); if (!inp) return;
  const id = inp.dataset.bet;
  S.bets[id] = S.bets[id] || { l: '', v: '' };
  S.bets[id][inp.dataset.side] = inp.value;
  saveState();
});
calPhaseEl.addEventListener('change', renderCalendar);
