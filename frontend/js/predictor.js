// ============================================================
//  PREDICTOR: grupos (drag&drop) + mejores terceros + bracket
//  Depende de: data.js, store.js, (toast en main.js, confetti CDN)
// ============================================================

const selectedThirds = () => GLETTERS.filter(g => S.thirds.has(g)).map(g => GROUPS[g][2]);

function slotTeam(slot) {
  if (slot.k === 'W') return GROUPS[slot.g][0];
  if (slot.k === 'R') return GROUPS[slot.g][1];
  if (slot.k === 'T') return selectedThirds()[slot.i] || null;
  return null;
}
function r32Teams() { return R32_SEED.map(([a, b]) => [slotTeam(a), slotTeam(b)]); }

// ---------- GRUPOS ----------
const groupsEl = document.getElementById('groups');
let drag = null;
const rowTone = i => i < 2 ? 'text-acento' : i === 2 ? 'text-blue-300' : 'text-white/40';

function renderGroups() {
  groupsEl.innerHTML = Object.entries(GROUPS).map(([g, teams]) => `
    <div class="bg-white/5 rounded-card border border-white/10 overflow-hidden">
      <div class="bg-white/5 border-b border-white/10 px-4 py-2.5 flex items-center justify-between">
        <span class="font-extrabold text-white">Grupo ${g}</span>
        <span class="text-[10px] font-semibold uppercase tracking-wide text-blue-200/70">Arrastra ↕</span>
      </div>
      <ul class="p-2" data-group="${g}">
        ${teams.map((tm, i) => `
          <li draggable="true" data-group="${g}" data-i="${i}"
              class="group-item flex items-center gap-2.5 rounded-lg px-2.5 py-2 cursor-grab active:cursor-grabbing transition
                     ${i < 2 ? 'bg-acento/10' : i === 2 ? 'bg-white/5' : 'hover:bg-white/5'}">
            <span class="w-4 text-center text-xs font-bold ${rowTone(i)}">${i + 1}</span>
            ${flag(tm, 'w-6')}
            <span class="text-[10px] font-extrabold w-9 text-center px-1 py-0.5 rounded ${i < 2 ? 'bg-acento/25 text-acento' : i === 2 ? 'bg-blue-400/20 text-blue-200' : 'bg-white/10 text-white/60'}">${tm.abbr}</span>
            <span class="text-sm font-semibold truncate ${i < 2 ? 'text-white' : i === 2 ? 'text-blue-100' : 'text-white/55'}">${tm.name}</span>
            ${i < 2 ? '<span class="ml-auto text-[9px] font-bold text-acento flex-shrink-0">CLASIF</span>' : i === 2 ? '<span class="ml-auto text-[9px] font-bold text-blue-300 flex-shrink-0">3.º</span>' : '<span class="ml-auto text-white/20 flex-shrink-0">⠿</span>'}
          </li>`).join('')}
      </ul>
    </div>`).join('');
}
groupsEl.addEventListener('dragstart', e => {
  const li = e.target.closest('.group-item'); if (!li) return;
  drag = { group: li.dataset.group, index: +li.dataset.i }; li.classList.add('dragging');
});
groupsEl.addEventListener('dragend', e => {
  e.target.closest('.group-item')?.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
});
groupsEl.addEventListener('dragover', e => {
  e.preventDefault();
  const li = e.target.closest('.group-item');
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  if (li && drag && li.dataset.group === drag.group) li.classList.add('drag-over');
});
groupsEl.addEventListener('drop', e => {
  e.preventDefault();
  const li = e.target.closest('.group-item'); if (!li || !drag || li.dataset.group !== drag.group) return;
  const arr = GROUPS[drag.group];
  const [it] = arr.splice(drag.index, 1); arr.splice(+li.dataset.i, 0, it);
  drag = null; renderGroups(); renderThirds(); resetBracket(); updateBracket(); saveState();
});

// ---------- MEJORES TERCEROS ----------
const thirdsEl = document.getElementById('thirds');
function renderThirds() {
  thirdsEl.innerHTML = GLETTERS.map(g => {
    const tm = GROUPS[g][2], on = S.thirds.has(g);
    return `<button data-third="${g}"
      class="flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition
             ${on ? 'border-acento bg-acento/20' : 'border-white/10 bg-white/5 hover:border-white/30'}">
      ${flag(tm, 'w-6')}
      <div class="min-w-0">
        <div class="text-xs font-bold ${on ? 'text-white' : 'text-blue-100'} truncate">${tm.name}</div>
        <div class="text-[10px] ${on ? 'text-acento' : 'text-blue-300/70'}">3.º Grupo ${g}</div>
      </div>
      ${on ? '<span class="ml-auto text-acento flex-shrink-0">✓</span>' : ''}
    </button>`;
  }).join('');
  document.getElementById('thirds-count').textContent = `${S.thirds.size} / 8`;
}
thirdsEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-third]'); if (!btn) return;
  const g = btn.dataset.third;
  if (S.thirds.has(g)) S.thirds.delete(g);
  else if (S.thirds.size >= 8) { toast('Ya elegiste 8 terceros. Quita uno primero.', 'err'); return; }
  else S.thirds.add(g);
  renderThirds(); resetBracket(); updateBracket(); saveState();
});

// ---------- BRACKET ----------
const bracketEl = document.getElementById('bracket');
const ROW_BASE = 'w-full h-9 flex items-center gap-2 px-2.5 text-sm font-semibold transition';

function cardSkel(cardId, accent) {
  const r = cardId.replace('-', ':');
  return `<div data-card="${cardId}" class="rounded-xl border ${accent ? 'border-acento/60' : 'border-white/10'} bg-white/5 overflow-hidden">
    <button data-pick="${r}:a" class="${ROW_BASE}"></button>
    <div class="h-px bg-white/10"></div>
    <button data-pick="${r}:b" class="${ROW_BASE}"></button></div>`;
}
function buildBracketSkeleton() {
  const colSkel = (ids, accent) => `<div class="w-44 flex flex-col justify-around flex-shrink-0">${ids.map(id => cardSkel(id, accent)).join('')}</div>`;
  const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}-${i}`);
  bracketEl.innerHTML =
    colSkel(ids('r32', 16), false) + colSkel(ids('r16', 8), false) +
    colSkel(ids('qf', 4), false) + colSkel(ids('sf', 2), false) + colSkel(['fn-0'], true) +
    `<div class="w-44 flex flex-col justify-center flex-shrink-0">
       <div data-card="champ-0" class="rounded-xl border-2 border-acento bg-acento/15 p-4 text-center">
         <div class="champ-flag flex justify-center mb-1"><span class="text-3xl">🏆</span></div>
         <div class="text-xs font-semibold uppercase tracking-widest text-acento">Campeón</div>
         <div class="champ-name font-extrabold text-white mt-0.5 text-sm">—</div>
       </div></div>`;
}

function paintRow(btn, team, picked, disabled, isThird) {
  if (!btn) return;
  const key = team ? team.name : (isThird ? '★' : '∅');
  if (btn._key !== key) {
    btn._key = key;
    btn.innerHTML = team
      ? `${flag(team, 'w-5')}<span class="truncate">${team.name}</span>`
      : (isThird ? '<span class="text-amber-300 mr-1">★</span><span class="text-white/30">Mejor 3.º</span>' : '<span class="text-white/30">Por definir</span>');
  }
  btn.disabled = disabled;
  btn.classList.toggle('bg-acento', picked);
  btn.classList.toggle('text-white', picked);
  btn.classList.toggle('text-slate-100', !picked && !!team);
  btn.classList.toggle('hover:bg-white/10', !picked && !!team);
  btn.classList.toggle('cursor-default', !team);
}
function paintCard(round, i, a, b, pick, aThird, bThird) {
  paintRow(document.querySelector(`[data-pick="${round}:${i}:a"]`), a, pick === 'a', !a, aThird);
  paintRow(document.querySelector(`[data-pick="${round}:${i}:b"]`), b, pick === 'b', !b, bThird);
}
function updateBracket() {
  const r32 = r32Teams();
  for (let i = 0; i < 16; i++) {
    const [a, b] = r32[i];
    paintCard('r32', i, a, b, S.r32[i] ? (S.r32[i] === a ? 'a' : 'b') : null, R32_SEED[i][0].k === 'T', R32_SEED[i][1].k === 'T');
  }
  for (let j = 0; j < 8; j++) { const a = S.r32[j*2], b = S.r32[j*2+1]; paintCard('r16', j, a, b, S.r16[j] ? (S.r16[j] === a ? 'a' : 'b') : null); }
  for (let j = 0; j < 4; j++) { const a = S.r16[j*2], b = S.r16[j*2+1]; paintCard('qf', j, a, b, S.qf[j] ? (S.qf[j] === a ? 'a' : 'b') : null); }
  for (let j = 0; j < 2; j++) { const a = S.qf[j*2], b = S.qf[j*2+1]; paintCard('sf', j, a, b, S.sf[j] ? (S.sf[j] === a ? 'a' : 'b') : null); }
  const fa = S.sf[0], fb = S.sf[1];
  paintCard('fn', 0, fa, fb, S.f ? (S.f === fa ? 'a' : 'b') : null);
  const cf = document.querySelector('[data-card="champ-0"]');
  cf.querySelector('.champ-flag').innerHTML = S.f ? flag(S.f, 'w-10') : '<span class="text-3xl">🏆</span>';
  cf.querySelector('.champ-name').textContent = S.f ? S.f.name : '—';
  updateProgress();
}

bracketEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-pick]'); if (!btn) return;
  const [round, idx, slot] = btn.dataset.pick.split(':'); const i = +idx, s = slot === 'a' ? 0 : 1;
  if (round === 'r32') { S.r32[i] = r32Teams()[i][s]; S.r16[Math.floor(i/2)] = null; S.qf[Math.floor(i/4)] = null; S.sf[Math.floor(i/8)] = null; S.f = null; }
  else if (round === 'r16') { S.r16[i] = [S.r32[i*2], S.r32[i*2+1]][s]; S.qf[Math.floor(i/2)] = null; S.sf[Math.floor(i/4)] = null; S.f = null; }
  else if (round === 'qf') { S.qf[i] = [S.r16[i*2], S.r16[i*2+1]][s]; S.sf[Math.floor(i/2)] = null; S.f = null; }
  else if (round === 'sf') { S.sf[i] = [S.qf[i*2], S.qf[i*2+1]][s]; S.f = null; }
  else if (round === 'fn') { S.f = [S.sf[0], S.sf[1]][s]; }
  updateBracket(); saveState();
  btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
});
document.getElementById('reset-bracket').addEventListener('click', () => { resetBracket(); updateBracket(); saveState(); toast('Llave reiniciada'); });

// ---------- Conectores SVG (se dibujan 1 vez; las posiciones no cambian) ----------
function drawConnectors() {
  const wrap = document.getElementById('bracket-wrap'), svg = document.getElementById('bracket-lines');
  if (!wrap || !svg) return;
  const wr = wrap.getBoundingClientRect();
  svg.setAttribute('width', wrap.scrollWidth); svg.setAttribute('height', wrap.clientHeight);
  const card = (r, i) => document.querySelector(`[data-card="${r}-${i}"]`);
  const pt = (el, side) => { const r = el.getBoundingClientRect(); return { x: (side === 'r' ? r.right : r.left) - wr.left, y: r.top - wr.top + r.height / 2 }; };
  let d = '';
  const link = (from, to) => { if (!from || !to) return; const a = pt(from, 'r'), b = pt(to, 'l'), mx = (a.x + b.x) / 2; d += `<path d="M${a.x},${a.y} H${mx} V${b.y} H${b.x}" fill="none" stroke="rgba(255,255,255,.15)" stroke-width="2"/>`; };
  for (let j = 0; j < 8; j++) { link(card('r32', 2*j), card('r16', j)); link(card('r32', 2*j+1), card('r16', j)); }
  for (let j = 0; j < 4; j++) { link(card('r16', 2*j), card('qf', j)); link(card('r16', 2*j+1), card('qf', j)); }
  for (let j = 0; j < 2; j++) { link(card('qf', 2*j), card('sf', j)); link(card('qf', 2*j+1), card('sf', j)); }
  link(card('sf', 0), card('fn', 0)); link(card('sf', 1), card('fn', 0)); link(card('fn', 0), card('champ', 0));
  svg.innerHTML = d;
}
window.addEventListener('resize', () => requestAnimationFrame(drawConnectors));

// ---------- Progreso + validación + confeti ----------
let lastChampFired = null;
function updateProgress() {
  const picks = S.r32.filter(Boolean).length + S.r16.filter(Boolean).length + S.qf.filter(Boolean).length + S.sf.filter(Boolean).length + (S.f ? 1 : 0);
  const pct = Math.round((picks / 31) * 100);
  document.getElementById('progress-bar').style.width = pct + '%';
  document.getElementById('progress-text').textContent = pct + '%';
  const saveBtn = document.getElementById('save-btn');
  if (S.f) {
    document.getElementById('progress-state').innerHTML = `<span class="text-acento">¡Campeón: ${S.f.abbr}! Listo para guardar</span>`;
    saveBtn.disabled = false;
    if (lastChampFired !== S.f.name) {
      lastChampFired = S.f.name;
      if (window.confetti) confetti({ particleCount: 130, spread: 80, origin: { y: 0.3 }, colors: ['#FF6B00', '#1A3B8B', '#ffffff'] });
      toast(`🏆 ${S.f.name} es tu campeón`, 'win');
    }
  } else {
    const need8 = S.thirds.size !== 8;
    document.getElementById('progress-state').innerHTML = need8 ? `<span class="text-blue-200">Elige los 8 terceros (${S.thirds.size}/8)</span>` : `Faltan ${31 - picks} llaves`;
    saveBtn.disabled = true; lastChampFired = null;
  }
}
document.getElementById('save-btn').addEventListener('click', () => { guardarPrediccion(); });
