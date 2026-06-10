// ============================================================
//  DATOS Y HELPERS PUROS (sin DOM)
//  Mundial 2026: 48 equipos · 12 grupos
// ============================================================

const STORAGE_KEY = 'conecta_predictor_2026_v1';
const DEADLINE = new Date('2026-06-12T11:00:00');

function t(name, iso, abbr) { return { name, iso, abbr }; }

const GROUPS = {
  A: [t('Argentina','ar','ARG'), t('México','mx','MEX'), t('Polonia','pl','POL'), t('Argelia','dz','ALG')],
  B: [t('Francia','fr','FRA'), t('Dinamarca','dk','DEN'), t('Túnez','tn','TUN'), t('Australia','au','AUS')],
  C: [t('España','es','ESP'), t('Alemania','de','GER'), t('Japón','jp','JPN'), t('Costa Rica','cr','CRC')],
  D: [t('Brasil','br','BRA'), t('Suiza','ch','SUI'), t('Serbia','rs','SRB'), t('Camerún','cm','CMR')],
  E: [t('Portugal','pt','POR'), t('Uruguay','uy','URU'), t('Corea S.','kr','KOR'), t('Ghana','gh','GHA')],
  F: [t('Bélgica','be','BEL'), t('Croacia','hr','CRO'), t('Marruecos','ma','MAR'), t('Canadá','ca','CAN')],
  G: [t('P. Bajos','nl','NED'), t('Ecuador','ec','ECU'), t('Senegal','sn','SEN'), t('Catar','qa','QAT')],
  H: [t('Nigeria','ng','NGA'), t('EE.UU.','us','USA'), t('Irán','ir','IRN'), t('Colombia','co','COL')],
  I: [t('Inglaterra','gb-eng','ENG'), t('Italia','it','ITA'), t('Egipto','eg','EGY'), t('Perú','pe','PER')],
  J: [t('Chile','cl','CHI'), t('Suecia','se','SWE'), t('C. Marfil','ci','CIV'), t('Arabia S.','sa','KSA')],
  K: [t('Escocia','gb-sct','SCO'), t('Noruega','no','NOR'), t('Paraguay','py','PAR'), t('Jamaica','jm','JAM')],
  L: [t('Turquía','tr','TUR'), t('Grecia','gr','GRE'), t('Venezuela','ve','VEN'), t('Honduras','hn','HON')],
};
const GLETTERS = Object.keys(GROUPS);

// Mapa nombre -> equipo (para reconstruir desde localStorage y fixtures)
const NAME2TEAM = {};
Object.values(GROUPS).flat().forEach(tm => NAME2TEAM[tm.name] = tm);
function teamByName(n) { return NAME2TEAM[n] || null; }

// Ronda de 32 (16 partidos): W=1.º, R=2.º, T=mejor tercero(i)
const W = g => ({ k: 'W', g }), R = g => ({ k: 'R', g }), T = i => ({ k: 'T', i });
const R32_SEED = [
  [W('A'), T(0)], [W('C'), T(1)], [W('E'), T(2)], [W('G'), T(3)],
  [W('I'), R('J')], [W('K'), R('L')], [R('A'), R('B')], [R('C'), R('D')],
  [W('B'), T(4)], [W('D'), T(5)], [W('F'), T(6)], [W('H'), T(7)],
  [W('J'), R('I')], [W('L'), R('K')], [R('E'), R('F')], [R('G'), R('H')],
];

// Fases para el filtro del calendario (los partidos vienen de la API: GET /partidos).
const PHASES = ['Todas', 'Grupos', 'Dieciseisavos', 'Octavos', 'Cuartos', 'Semifinal', 'Final'];

const LEADERBOARD = [
  { pos: 1, equipo: 'Los Cracks', puntos: 142 }, { pos: 2, equipo: 'Furia Naranja', puntos: 128 },
  { pos: 3, equipo: 'Goleadores FC', puntos: 119 }, { pos: 4, equipo: 'Las Tigres', puntos: 105 },
  { pos: 5, equipo: 'Conecta Stars', puntos: 97 },
];

// Helper de bandera (flagcdn) — robusto ante el emoji roto de Windows
function flag(tm, cls) {
  cls = cls || 'w-5';
  return tm && tm.iso
    ? `<img src="https://flagcdn.com/w40/${tm.iso}.png" class="${cls} h-auto rounded-[2px] shadow-sm flex-shrink-0" alt="${tm.name}" loading="lazy" decoding="async" />`
    : '';
}
