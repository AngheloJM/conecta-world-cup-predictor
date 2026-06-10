// ============================================================
//  ESTADO GLOBAL + (DE)SERIALIZACIÓN + PERSISTENCIA
//  Depende de: data.js (NAME2TEAM, GROUPS, GLETTERS, STORAGE_KEY)
// ============================================================

const S = {
  thirds: new Set(),                 // letras de grupo cuyos 3.º clasifican (máx 8)
  r32: Array(16).fill(null), r16: Array(8).fill(null),
  qf: Array(4).fill(null), sf: Array(2).fill(null), f: null,
  bets: {},                          // id de partido -> { l, v }
  nombre: '',
};

function resetBracket() {
  S.r32 = Array(16).fill(null); S.r16 = Array(8).fill(null);
  S.qf = Array(4).fill(null); S.sf = Array(2).fill(null); S.f = null;
}

// Convierte el estado actual a un objeto plano (para localStorage y servidor).
function serializeState() {
  return {
    groups: Object.fromEntries(Object.entries(GROUPS).map(([g, a]) => [g, a.map(x => x.name)])),
    thirds: [...S.thirds],
    r32: S.r32.map(x => x ? x.name : null), r16: S.r16.map(x => x ? x.name : null),
    qf: S.qf.map(x => x ? x.name : null), sf: S.sf.map(x => x ? x.name : null),
    f: S.f ? S.f.name : null,
    bets: S.bets, nombre: S.nombre,
  };
}

// Aplica un objeto plano al estado S (reconstruye equipos por nombre).
function applyState(s) {
  if (!s) return;
  if (s.groups) for (const g in s.groups) if (GROUPS[g]) GROUPS[g] = s.groups[g].map(n => NAME2TEAM[n]).filter(Boolean);
  S.thirds = new Set(s.thirds || []);
  const map = (arr, n) => { const r = (arr || []).map(x => x ? NAME2TEAM[x] : null); while (r.length < n) r.push(null); return r; };
  S.r32 = map(s.r32, 16); S.r16 = map(s.r16, 8); S.qf = map(s.qf, 4); S.sf = map(s.sf, 2);
  S.f = s.f ? NAME2TEAM[s.f] : null;
  S.bets = s.bets || {};
  S.nombre = s.nombre || '';
}

function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeState())); } catch (_) {}
}

function loadState() {
  let s; try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { s = null; }
  if (!s) return false;
  applyState(s);
  return true;
}

// Vuelve a pintar toda la UI a partir del estado actual (tras cargar del servidor).
function refreshAllFromState() {
  renderGroups();
  renderThirds();
  updateBracket();
  renderCalendar();
  const n = document.getElementById('nombre');
  if (n) n.value = S.nombre || '';
}
