// ============================================================
//  AUSPICIADORES · carruseles fijos (sticky) a los lados del Tablero.
//  - Izquierda: siempre (si hay auspiciadores).
//  - Derecha: solo si hay 2 o más.
//  - Celular: franja horizontal abajo del ranking.
//  Para agregar/quitar: edita el arreglo SPONSORS.
//    logo: archivo en frontend/img/sponsors/  →  "img/sponsors/archivo.png"
//    instagram: URL completa · whatsapp: solo números con país (ej. 59178946118)
// ============================================================

const SPONSORS = [
  {
    nombre: 'EGO by Yuyo Rosales',
    logo: 'img/sponsors/EGO.png',
    instagram: 'https://www.instagram.com/ego_yr',
    whatsapp: '59178946118',
  },
  // { nombre: 'Otra Marca', logo: 'img/sponsors/otra.png', instagram: '', whatsapp: '' },
];

const _IG_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.3 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.2-1 .3-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.2-.4-.3-1-.4-2.2-.1-1.3-.1-1.7-.1-4.9s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.4-.5.2-.9.4-1.2.8-.4.3-.6.7-.8 1.2-.2.4-.3 1-.4 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.4 2.1.2.5.4.9.8 1.2.3.4.7.6 1.2.8.4.2 1 .3 2.1.4 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.4.5-.2.9-.4 1.2-.8.4-.3.6-.7.8-1.2.2-.4.3-1 .4-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.4-2.1-.2-.5-.4-.9-.8-1.2-.3-.4-.7-.6-1.2-.8-.4-.2-1-.3-2.1-.4-1.2-.1-1.6-.1-4.7-.1zm0 3.1a4.9 4.9 0 110 9.8 4.9 4.9 0 010-9.8zm0 1.8a3.1 3.1 0 100 6.2 3.1 3.1 0 000-6.2zm5.1-.3a1.1 1.1 0 11-2.2 0 1.1 1.1 0 012.2 0z"/></svg>';
const _WA_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><path d="M.1 24l1.7-6.2A11.9 11.9 0 010 11.9C0 5.3 5.4 0 12 0a11.9 11.9 0 018.4 3.5 11.8 11.8 0 013.5 8.4c0 6.6-5.4 11.9-12 11.9-2 0-4-.5-5.7-1.5L.1 24zM6.6 20l.4.2a9.9 9.9 0 005 1.4c5.5 0 10-4.4 10-9.9 0-2.6-1-5.1-2.9-7a9.9 9.9 0 00-7-2.9C6.6 1.8 2.1 6.2 2.1 11.7c0 1.9.5 3.7 1.5 5.3l.2.4-1 3.6 3.8-1zm11.1-5.3c-.1-.1-.3-.2-.5-.3-.3-.1-1.6-.8-1.9-.9-.3-.1-.4-.1-.6.1-.2.3-.6.9-.8 1.1-.1.2-.3.2-.5.1-.3-.1-1.1-.4-2.1-1.3-.8-.7-1.3-1.5-1.5-1.8-.1-.3 0-.4.1-.5l.4-.5c.1-.2.2-.3.2-.5.1-.2 0-.3 0-.5-.1-.1-.6-1.4-.8-1.9-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.3.3-1 .9-1 2.3s1 2.7 1.2 2.9c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.6-.1 1.6-.7 1.9-1.3.2-.6.2-1.2.2-1.3-.1-.1-.3-.2-.5-.3z"/></svg>';

function _redes(s, center) {
  const a = [];
  if (s.instagram) a.push(`<a href="${s.instagram}" target="_blank" rel="noopener" title="Instagram" class="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 hover:opacity-90 transition">${_IG_SVG}</a>`);
  if (s.whatsapp) a.push(`<a href="https://wa.me/${s.whatsapp}" target="_blank" rel="noopener" title="WhatsApp" class="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-green-500 hover:bg-green-600 transition">${_WA_SVG}</a>`);
  return a.length ? `<div class="flex gap-2 ${center ? 'justify-center' : 'justify-center sm:justify-start'} mt-2">${a.join('')}</div>` : '';
}

// vertical=true → tarjeta apilada (lados). vertical=false → horizontal (franja celular).
function _slideInner(s, vertical) {
  const logo = s.logo
    ? `<img src="${s.logo}" alt="${s.nombre}" class="${vertical ? 'max-h-24' : 'max-h-16'} w-auto object-contain" loading="lazy" />`
    : `<span class="text-slate-800 font-extrabold text-center">${s.nombre}</span>`;
  return `
    <div class="bg-white rounded-xl p-3 flex items-center justify-center shrink-0 min-w-[6rem]">${logo}</div>
    <div class="${vertical ? 'text-center' : 'text-center sm:text-left'}">
      <p class="text-[10px] uppercase tracking-widest text-blue-200/70 font-bold">Auspiciador</p>
      <h3 class="text-white font-extrabold ${vertical ? 'text-sm' : 'text-lg'} leading-tight">${s.nombre}</h3>
      ${_redes(s, vertical)}
    </div>`;
}

// Monta un carrusel dentro de `el`. Guarda su estado en el propio elemento.
function _mountCarousel(el, vertical, offset) {
  if (!el) return;
  if (!SPONSORS.length) { el.innerHTML = ''; return; }
  clearInterval(el._timer);

  const multi = SPONSORS.length > 1;
  el.innerHTML = `
    <div class="relative bg-white/5 border border-white/10 rounded-card overflow-hidden">
      <div data-slide class="px-4 py-4 flex ${vertical ? 'flex-col' : 'flex-col sm:flex-row'} items-center justify-center gap-3 sm:gap-6 ${vertical ? 'min-h-[11rem]' : 'min-h-[7.5rem]'}"></div>
      ${multi ? `
        <button data-d="-1" class="absolute left-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg leading-none flex items-center justify-center">‹</button>
        <button data-d="1" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white text-lg leading-none flex items-center justify-center">›</button>
        <div data-dots class="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5"></div>` : ''}
    </div>`;

  el._i = ((offset % SPONSORS.length) + SPONSORS.length) % SPONSORS.length;
  const slide = el.querySelector('[data-slide]');
  const dots = el.querySelector('[data-dots]');

  const paint = () => {
    slide.classList.remove('pop'); void slide.offsetWidth; slide.classList.add('pop');
    slide.innerHTML = _slideInner(SPONSORS[el._i], vertical);
    if (dots) dots.innerHTML = SPONSORS.map((_, k) =>
      `<span class="w-2 h-2 rounded-full ${k === el._i ? 'bg-acento' : 'bg-white/30'}"></span>`).join('');
  };
  const go = d => { el._i = (el._i + d + SPONSORS.length) % SPONSORS.length; paint(); start(); };
  const start = () => { clearInterval(el._timer); if (multi) el._timer = setInterval(() => go(1), 4500); };

  paint();
  if (multi) {
    el.querySelector('[data-d="-1"]').onclick = () => go(-1);
    el.querySelector('[data-d="1"]').onclick = () => go(1);
    start();
  }
}

function renderSponsors() {
  const left = document.getElementById('ausp-left');
  const right = document.getElementById('ausp-right');
  const mobile = document.getElementById('ausp-mobile');

  if (!SPONSORS.length) {
    [left, right, mobile].forEach(e => { if (e) e.innerHTML = ''; });
    return;
  }

  _mountCarousel(left, true, 0);
  _mountCarousel(mobile, false, 0);

  // Derecha: solo cuando hay 2 o más auspiciadores (arranca en el 2.º).
  if (right) {
    if (SPONSORS.length > 1) {
      right.style.display = '';
      _mountCarousel(right, true, 1);
    } else {
      right.style.display = 'none';
      right.innerHTML = '';
    }
  }
}
