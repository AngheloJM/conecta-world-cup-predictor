// ============================================================
//  ESTADO GLOBAL + PERSISTENCIA (localStorage)
//  Depende de: data.js (NAME2TEAM, GLETTERS, STORAGE_KEY)
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

function saveState() {
  const state = {
    groups: Object.fromEntries(Object.entries(GROUPS).map(([g, a]) => [g, a.map(x => x.name)])),
    thirds: [...S.thirds],
    r32: S.r32.map(x => x ? x.name : null), r16: S.r16.map(x => x ? x.name : null),
    qf: S.qf.map(x => x ? x.name : null), sf: S.sf.map(x => x ? x.name : null),
    f: S.f ? S.f.name : null,
    bets: S.bets, nombre: S.nombre,
  };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (_) {}
}

function loadState() {
  let s; try { s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch (_) { s = null; }
  if (!s) return false;
  if (s.groups) for (const g in s.groups) if (GROUPS[g]) GROUPS[g] = s.groups[g].map(n => NAME2TEAM[n]).filter(Boolean);
  if (s.thirds) S.thirds = new Set(s.thirds);
  const map = (arr, n) => { const r = (arr || []).map(x => x ? NAME2TEAM[x] : null); while (r.length < n) r.push(null); return r; };
  S.r32 = map(s.r32, 16); S.r16 = map(s.r16, 8); S.qf = map(s.qf, 4); S.sf = map(s.sf, 2);
  S.f = s.f ? NAME2TEAM[s.f] : null;
  S.bets = s.bets || {};
  S.nombre = s.nombre || '';
  return true;
}
