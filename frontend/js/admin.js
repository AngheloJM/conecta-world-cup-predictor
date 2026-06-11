// ============================================================
//  PANEL ADMIN · acciones, usuarios y carga manual de resultados
//  Visible solo para administradores. Depende de: api.js, data.js
//  (PARTIDOS, PHASES, tName), main.js (toast).
// ============================================================

const adminEl = document.getElementById('admin-content');
let ADMIN_USERS = [];

async function renderAdmin() {
  adminEl.innerHTML = '<p class="text-blue-200 py-8 text-center">Cargando…</p>';
  try { ADMIN_USERS = await api.adminUsuarios(); } catch (_) { ADMIN_USERS = []; }
  const yo = (Auth.user() || {}).id;
  const btn = 'font-bold text-sm px-4 py-2.5 rounded-lg transition';

  const usuariosRows = ADMIN_USERS.map(u => `
    <tr class="hover:bg-white/5">
      <td class="px-4 py-2.5 text-white/40 text-xs">${u.id}</td>
      <td class="px-4 py-2.5">
        <div class="font-semibold text-white">${u.nombre}${u.es_admin ? ' <span class="text-[9px] uppercase bg-acento/20 text-acento rounded px-1.5 py-0.5">admin</span>' : ''}</div>
        <div class="text-[11px] text-blue-200/60">${u.email}</div>
      </td>
      <td class="px-4 py-2.5 text-right font-extrabold text-acento tabular-nums">${u.puntos_totales}</td>
      <td class="px-4 py-2.5 text-right whitespace-nowrap">
        <button data-pass="${u.id}" class="text-blue-300 hover:text-blue-200 text-xs font-bold mr-3">Clave</button>
        ${u.id === yo ? '<span class="text-[11px] text-blue-200/50">tú</span>' : `<button data-del="${u.id}" class="text-red-300 hover:text-red-200 text-xs font-bold">Eliminar</button>`}
      </td>
    </tr>`).join('');

  adminEl.innerHTML = `
    <div class="space-y-6">
      <section class="bg-white/5 border border-white/10 rounded-card p-5">
        <h2 class="font-extrabold text-white">Acciones</h2>
        <p class="text-xs text-blue-200/70 mb-3">El auto-sync corre cada 15 min; aquí puedes forzarlo.</p>
        <div class="flex flex-wrap gap-3">
          <button id="btn-sync" class="${btn} bg-marca hover:bg-blue-800 text-white">⟳ Sincronizar API ahora</button>
          <button id="btn-recalc" class="${btn} bg-white/10 hover:bg-white/20 text-white">∑ Recalcular puntos</button>
        </div>
        <p id="admin-status" class="text-sm text-acento mt-3 min-h-[1.25rem]"></p>
      </section>

      <section class="bg-white/5 border border-white/10 rounded-card overflow-hidden">
        <div class="px-5 py-3 border-b border-white/10"><h2 class="font-extrabold text-white">Usuarios (${ADMIN_USERS.length})</h2></div>
        <div class="overflow-x-auto"><table class="w-full text-sm"><tbody class="divide-y divide-white/10">${usuariosRows || '<tr><td class="px-4 py-6 text-center text-blue-200">Sin usuarios</td></tr>'}</tbody></table></div>
      </section>

      <section class="bg-white/5 border border-white/10 rounded-card p-5">
        <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 class="font-extrabold text-white">Cargar resultado manual</h2>
            <p class="text-xs text-blue-200/70">Por si la API falla un partido. Al guardar, recalcula puntos.</p>
          </div>
          <select id="admin-phase" class="bg-white/10 border border-white/20 rounded-lg text-sm font-semibold text-white px-3 py-2 [&>option]:text-slate-800"></select>
        </div>
        <div id="admin-partidos" class="space-y-2"></div>
      </section>
    </div>`;

  const sel = document.getElementById('admin-phase');
  sel.innerHTML = PHASES.map(p => `<option value="${p}">${p === 'Todas' ? 'Todas las fases' : p}</option>`).join('');
  sel.value = 'Grupos';
  renderAdminPartidos();
}

function renderAdminPartidos() {
  const cont = document.getElementById('admin-partidos');
  if (!cont) return;
  const phase = document.getElementById('admin-phase').value || 'Todas';
  const list = PARTIDOS.filter(p => phase === 'Todas' || p.fase === phase);
  if (!list.length) { cont.innerHTML = '<p class="text-sm text-blue-200 py-4 text-center">Sin partidos.</p>'; return; }
  const inp = 'w-12 h-9 text-center font-bold text-white bg-white/10 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-acento/40';
  cont.innerHTML = list.map(p => {
    const fin = p.estado === 'Finalizado';
    return `<div class="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
      <span class="text-[10px] text-blue-200/60 w-10 flex-shrink-0">${p.grupo ? 'G' + p.grupo : p.fase.slice(0, 4)}</span>
      <span class="flex-1 text-sm text-slate-100 truncate text-right">${tName(p.equipo_local)}</span>
      <input type="number" min="0" max="30" id="g-${p.id}-l" value="${fin ? p.goles_local : ''}" placeholder="-" class="${inp}" />
      <span class="text-white/40 text-xs">:</span>
      <input type="number" min="0" max="30" id="g-${p.id}-v" value="${fin ? p.goles_visitante : ''}" placeholder="-" class="${inp}" />
      <span class="flex-1 text-sm text-slate-100 truncate">${tName(p.equipo_visitante)}</span>
      <button data-fin="${p.id}" class="text-xs font-bold flex-shrink-0 ${fin ? 'text-acento' : 'text-white/60 hover:text-acento'}">${fin ? '✓ Editar' : 'Guardar'}</button>
    </div>`;
  }).join('');
}

adminEl.addEventListener('change', e => { if (e.target.id === 'admin-phase') renderAdminPartidos(); });

adminEl.addEventListener('click', async e => {
  const status = document.getElementById('admin-status');

  if (e.target.id === 'btn-sync') {
    status.textContent = 'Sincronizando…';
    try { const r = await api.adminSync(); status.textContent = `✓ Sincronizados ${r.sincronizados}/${r.recibidos} partidos.`; }
    catch (err) { status.textContent = '✗ ' + err.message; }
    return;
  }
  if (e.target.id === 'btn-recalc') {
    status.textContent = 'Recalculando…';
    try { const r = await api.adminRecalcular(); status.textContent = `✓ Recalculado (${r.partidos_finalizados} partidos finalizados).`; renderAdmin(); }
    catch (err) { status.textContent = '✗ ' + err.message; }
    return;
  }

  const pass = e.target.closest('[data-pass]');
  if (pass) {
    const np = prompt('Nueva contraseña temporal para este usuario (mín. 8):');
    if (!np) return;
    if (np.length < 8) { toast('Mínimo 8 caracteres', 'err'); return; }
    try { await api.adminResetPassword(+pass.dataset.pass, np); toast('Contraseña restablecida ✓. Compártesela al usuario.'); }
    catch (err) { toast(err.message, 'err'); }
    return;
  }

  const del = e.target.closest('[data-del]');
  if (del) {
    if (!confirm('¿Eliminar este usuario? Se borran también sus apuestas.')) return;
    try { await api.adminBorrarUsuario(+del.dataset.del); toast('Usuario eliminado'); renderAdmin(); }
    catch (err) { toast(err.message, 'err'); }
    return;
  }

  const fin = e.target.closest('[data-fin]');
  if (fin) {
    const id = +fin.dataset.fin;
    const l = document.getElementById(`g-${id}-l`).value;
    const v = document.getElementById(`g-${id}-v`).value;
    if (l === '' || v === '') { toast('Ingresa ambos marcadores', 'err'); return; }
    try {
      await api.adminSetResultado(id, parseInt(l, 10), parseInt(v, 10));
      toast('Resultado guardado · puntos recalculados ✓');
      PARTIDOS = await api.getPartidos();   // refrescar en memoria
      renderAdminPartidos();
    } catch (err) { toast(err.message, 'err'); }
  }
});
