// ============================================================
//  DATOS Y HELPERS PUROS (sin DOM)
//  Mundial 2026: 48 equipos · 12 grupos · datos REALES de la API
// ============================================================

const STORAGE_KEY = 'conecta_predictor_2026_v2';
const DEADLINE = new Date('2026-06-12T11:00:00');

// Grupos (se construyen desde los partidos reales: buildGroupsFromPartidos).
const GROUPS = {};
let GLETTERS = [];
const NAME2TEAM = {};
function teamByName(n) { return NAME2TEAM[n] || null; }

// Partidos reales (cargados de GET /partidos).
let PARTIDOS = [];

// Construye los 12 grupos (con equipos reales {name, cod, crest}) a partir de los
// partidos de fase de grupos. El orden inicial es alfabético; el usuario reordena.
function buildGroupsFromPartidos(partidos) {
  for (const k in GROUPS) delete GROUPS[k];
  for (const k in NAME2TEAM) delete NAME2TEAM[k];

  const tmp = {};
  const lados = [
    ['equipo_local', 'local_cod', 'crest_local'],
    ['equipo_visitante', 'visitante_cod', 'crest_visitante'],
  ];
  for (const p of partidos) {
    if (p.fase !== 'Grupos' || !p.grupo) continue;
    for (const [nk, ck, crk] of lados) {
      const name = p[nk];
      if (!name || name === 'Por definir') continue;
      tmp[p.grupo] = tmp[p.grupo] || new Map();
      if (!tmp[p.grupo].has(name)) tmp[p.grupo].set(name, { name, cod: p[ck] || '', crest: p[crk] || '' });
    }
  }

  GLETTERS = Object.keys(tmp).sort();
  for (const g of GLETTERS) {
    GROUPS[g] = [...tmp[g].values()].sort((a, b) => a.name.localeCompare(b.name));
    GROUPS[g].forEach(tm => { NAME2TEAM[tm.name] = tm; });
  }
}

// Ronda de 32 (16 partidos): W=1.º, R=2.º, T=mejor tercero(i)
const W = g => ({ k: 'W', g }), R = g => ({ k: 'R', g }), T = i => ({ k: 'T', i });
const R32_SEED = [
  [W('A'), T(0)], [W('C'), T(1)], [W('E'), T(2)], [W('G'), T(3)],
  [W('I'), R('J')], [W('K'), R('L')], [R('A'), R('B')], [R('C'), R('D')],
  [W('B'), T(4)], [W('D'), T(5)], [W('F'), T(6)], [W('H'), T(7)],
  [W('J'), R('I')], [W('L'), R('K')], [R('E'), R('F')], [R('G'), R('H')],
];

// Fases para el filtro del calendario.
const PHASES = ['Todas', 'Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final'];

const LEADERBOARD = [
  { pos: 1, equipo: 'Los Cracks', puntos: 142 }, { pos: 2, equipo: 'Furia Naranja', puntos: 128 },
  { pos: 3, equipo: 'Goleadores FC', puntos: 119 }, { pos: 4, equipo: 'Las Tigres', puntos: 105 },
  { pos: 5, equipo: 'Conecta Stars', puntos: 97 },
];

// Escudo oficial del equipo (de la API). Acepta {crest, cod, name}.
function flag(tm, cls) {
  cls = cls || 'w-5';
  return tm && tm.crest
    ? `<img src="${tm.crest}" class="${cls} aspect-square object-contain flex-shrink-0" alt="${tm.name}" loading="lazy" />`
    : (tm && tm.cod ? `<span class="text-[10px] font-extrabold px-1 rounded bg-white/10">${tm.cod}</span>` : '');
}
