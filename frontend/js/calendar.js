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
  const inp = 'w-10 h-10 text-center font-bold text-white bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento/40 focus:border-acento';
  return `
    <div class="rounded-xl border border-white/10 bg-white/5 p-3">
      <div class="flex items-center justify-between mb-2">
        <span class="text-[10px] font-bold uppercase tracking-wide text-acento bg-acento/15 rounded px-2 py-0.5">Grupo ${m.group}</span>
        <span class="text-[11px] text-blue-200/70">${m.time} · ${m.venue}</span>
      </div>
      <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div class="flex items-center gap-2 min-w-0">${flag(home, 'w-6')}<span class="text-sm font-semibold text-slate-100 truncate">${home.name}</span></div>
        <div class="flex items-center gap-1">
          <input type="number" min="0" max="20" data-bet="${m.id}" data-side="l" value="${bl}" placeholder="0" class="${inp}" />
          <span class="text-white/40 font-bold text-xs">VS</span>
          <input type="number" min="0" max="20" data-bet="${m.id}" data-side="v" value="${bv}" placeholder="0" class="${inp}" />
        </div>
        <div class="flex items-center gap-2 justify-end min-w-0"><span class="text-sm font-semibold text-slate-100 truncate text-right">${away.name}</span>${flag(away, 'w-6')}</div>
      </div>
    </div>`;
}

function renderCalendar() {
  const phase = calPhaseEl.value || 'Todas';
  const days = SCHEDULE.filter(d => phase === 'Todas' || d.phase === phase);
  if (!days.length) { calendarEl.innerHTML = '<p class="text-sm text-blue-200 py-6 text-center">No hay partidos en esta fase todavía.</p>'; return; }
  calendarEl.innerHTML = days.map(d => `
    <div>
      <div class="flex items-center gap-2 mb-2">
        <h3 class="text-sm font-extrabold text-white">${d.day}</h3>
        <span class="text-[10px] font-semibold uppercase tracking-wide text-blue-200 bg-white/5 border border-white/10 rounded px-2 py-0.5">${d.items.length} partidos</span>
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
