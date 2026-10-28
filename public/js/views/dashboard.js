// Sano-Técnico — Inicio: resumen del taller
import { store, STATUS, BOARD, DEVICE_TYPES } from '../store.js';
import { deviceName, repairBalance } from '../ops.js';
import { esc, usd, bs, fmtLongDate, fmtDate, fmtAgo, todayKey, dayKey, addDays, emptyState, qtyFmt, waLink } from '../utils.js';
import { icon } from '../icons.js';
import { openRepair } from '../repair.js';
import { waCustomer } from '../shared.js';

export function mount(el, { navigate }) {
  function render() {
    const today = todayKey();
    const sales = store.recentSales.filter((s) => s.status !== 'voided');
    const todays = sales.filter((s) => s.dayKey === today);
    const income = todays.reduce((a, s) => a + (s.received || 0), 0);
    const billed = todays.filter((s) => s.kind !== 'abono').reduce((a, s) => a + (s.total || 0), 0);
    const deliveredToday = todays.filter((s) => s.kind === 'reparacion').length;
    const receivedToday = store.repairs.filter((r) => r.dayKey === today).length;
    const receivable = store.repairs.reduce((a, r) => a + repairBalance(r), 0);
    const ready = store.readyRepairs;
    const late = store.lateRepairs;
    const low = store.lowProducts;
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    // Últimos 7 días (ingresos cobrados)
    const days = Array.from({ length: 7 }, (_, i) => dayKey(addDays(new Date(), i - 6)));
    const perDay = days.map((k) => sales.filter((s) => s.dayKey === k).reduce((a, s) => a + (s.received || 0), 0));
    const maxDay = Math.max(1, ...perDay);
    const total = store.repairs.length;

    el.innerHTML = `
      <div class="view-header"><div><h1 class="view-title">${hello} 👋</h1><p class="view-sub">${fmtLongDate()} · ${esc(store.businessName)}</p></div>
        <div class="view-actions"><button class="btn btn-secondary" id="d-search">${icon('search')} Buscar orden</button><button class="btn btn-primary" id="d-new">${icon('plus')} Recibir equipo</button></div></div>

      <div class="quick">
        <button data-go="recibir"><span class="kpi-icon tone-brand">${icon('inbox')}</span><span>Recibir equipo<small>Nueva orden de servicio</small></span></button>
        <button data-go="ordenes"><span class="kpi-icon tone-violet">${icon('columns')}</span><span>Tablero del taller<small>${total} equipo(s) en proceso</small></span></button>
        <button data-go="vender"><span class="kpi-icon tone-success">${icon('cart')}</span><span>Vender accesorio<small>Forros, cargadores, vidrios…</small></span></button>
        <button data-go="caja"><span class="kpi-icon tone-warning">${icon('wallet')}</span><span>${store.openShift ? 'Caja abierta' : 'Abrir caja'}<small>${store.openShift ? 'Turno ' + esc(store.openShift.number) : 'Necesaria para cobrar'}</small></span></button>
      </div>

      <div class="kpis" data-tour="kpis">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado hoy</span><span class="kpi-icon tone-success">${icon('dollar')}</span></div><div class="kpi-value">${usd(income)}</div><div class="kpi-sub text-bs">${bs(income * store.rate)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Equipos en taller</span><span class="kpi-icon tone-brand">${icon('wrench')}</span></div><div class="kpi-value">${total}</div><div class="kpi-sub">${receivedToday} recibido(s) hoy · ${deliveredToday} entregado(s)</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Listos para entregar</span><span class="kpi-icon tone-violet">${icon('check')}</span></div><div class="kpi-value">${ready.length}</div><div class="kpi-sub">${late.length ? `<span class="text-danger bold">${late.length} atrasado(s)</span>` : 'Ninguno atrasado'}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Por cobrar</span><span class="kpi-icon tone-warning">${icon('clock')}</span></div><div class="kpi-value">${usd(receivable)}</div><div class="kpi-sub">Saldo de órdenes abiertas · facturado hoy ${usd(billed)}</div></div>
      </div>

      <div class="card" style="margin-bottom:16px" data-tour="pipeline">
        <div class="card-head"><div class="card-title">${icon('columns')} Flujo del taller</div><button class="btn btn-ghost btn-sm" data-go="ordenes">Ver tablero ${icon('arrowRight')}</button></div>
        <div class="pipeline">${BOARD.map((s) => { const n = store.repairs.filter((r) => r.status === s).length; return `<button class="pipe pipe-${STATUS[s].tone}" data-status="${s}"><span class="pipe-n">${n}</span><span class="pipe-l">${icon(STATUS[s].icon)} ${STATUS[s].short}</span><i style="width:${total ? Math.max(4, n / total * 100) : 0}%"></i></button>`; }).join('')}</div>
      </div>

      <div class="grid-main">
        <div class="stack">
          <div class="card card-flush">
            <div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('check')} Listos para entregar</div><span class="badge badge-success">${ready.length}</span></div>
            ${ready.length ? `<div class="list" style="padding:4px 18px 8px">${ready.slice(0, 8).map((r) => `<div class="list-item"><span class="emoji-box">${icon(DEVICE_TYPES[r.device?.type]?.icon || 'phone')}</span><div class="grow click" data-open="${r.id}" style="min-width:0"><div class="t-name ellipsis">${esc(r.number)} · ${esc(deviceName(r.device))}</div><div class="t-sub ellipsis">${esc(r.customerName)} · ${r.status === 'no_reparado' ? 'Sin reparación' : 'Listo'} ${fmtAgo(r.statusAt)} · saldo ${usd(repairBalance(r))}</div></div><button class="btn btn-whatsapp btn-sm" data-wa="${r.id}" title="Avisar al cliente">${icon('whatsapp')}<span class="hide-sm">Avisar</span></button></div>`).join('')}</div>` : `<div style="padding:8px 18px 18px">${emptyState('check', 'Nada pendiente por entregar', 'Cuando una reparación esté lista aparecerá aquí para avisar al cliente.')}</div>`}
          </div>
          <div class="card card-flush">
            <div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('alert')} Atrasados</div><span class="badge ${late.length ? 'badge-danger' : 'badge-neutral'}">${late.length}</span></div>
            ${late.length ? `<div class="list" style="padding:4px 18px 8px">${late.slice(0, 6).map((r) => `<div class="list-item click" data-open="${r.id}"><span class="emoji-box" style="color:var(--danger)">${icon('clock')}</span><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(r.number)} · ${esc(deviceName(r.device))}</div><div class="t-sub">${esc(STATUS[r.status].label)} · prometido ${fmtDate(r.promisedAt)}${r.technician ? ' · ' + esc(r.technician) : ''}</div></div>${icon('arrowRight')}</div>`).join('')}</div>` : `<div style="padding:8px 18px 18px">${emptyState('shieldCheck', 'Todo a tiempo', 'No hay equipos pasados de su fecha de entrega.')}</div>`}
          </div>
        </div>
        <div class="stack">
          <div class="card">
            <div class="card-head"><div class="card-title">${icon('trend')} Cobrado últimos 7 días</div></div>
            <div class="bars">${days.map((k, i) => `<div class="bar ${k === today ? 'today' : ''}" title="${fmtDate(k)}: ${usd(perDay[i])}"><i style="height:${(perDay[i] / maxDay) * 100}%"></i><span>${['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(k + 'T12:00').getDay()]}</span></div>`).join('')}</div>
          </div>
          <div class="card" data-tour="stock">
            <div class="card-head"><div class="card-title">${icon('box')} Repuestos por agotarse</div>${low.length ? `<button class="btn btn-ghost btn-sm" data-go="inventario">Ver ${icon('arrowRight')}</button>` : ''}</div>
            ${low.length ? `<div class="list">${low.slice(0, 6).map((p) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(p.name)}</div><div class="t-sub">${esc(p.category || '')} · mínimo ${qtyFmt(p.minStock || 0)}</div></div><span class="badge ${(p.stock || 0) <= 0 ? 'badge-danger' : 'badge-warning'}">${(p.stock || 0) <= 0 ? 'Agotado' : `Quedan ${qtyFmt(p.stock)}`}</span></div>`).join('')}</div>` : emptyState('box', 'Inventario en orden')}
          </div>
          <div class="card">
            <div class="card-head"><div class="card-title">${icon('inbox')} Últimos recibidos</div></div>
            ${store.repairs.length ? `<div class="list">${store.repairs.slice(0, 5).map((r) => `<div class="list-item click" data-open="${r.id}"><div class="grow" style="min-width:0"><div class="t-name ellipsis">${esc(deviceName(r.device))}</div><div class="t-sub">${esc(r.number)} · ${esc(r.customerName)} · ${fmtAgo(r.createdAt)}</div></div><span class="badge badge-${STATUS[r.status].tone}">${STATUS[r.status].short}</span></div>`).join('')}</div>` : emptyState('inbox', 'Aún no hay órdenes')}
          </div>
        </div>
      </div>`;

    el.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => navigate(b.dataset.go));
    el.querySelectorAll('[data-status]').forEach((b) => b.onclick = () => navigate('ordenes', { params: { status: b.dataset.status, mode: 'list' } }));
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openRepair(b.dataset.open));
    el.querySelectorAll('[data-wa]').forEach((b) => b.onclick = () => { const r = store.repair(b.dataset.wa); if (r) waCustomer(r, r.status === 'no_reparado' ? 'no_reparado' : 'listo'); });
    el.querySelector('#d-new').onclick = () => navigate('recibir');
    el.querySelector('#d-search').onclick = () => import('./search.js').then((m) => m.openSearch());
  }
  render();
  return store.on('*', (evt) => { if (['repairs', 'sales', 'products', 'shift', 'rate'].includes(evt)) render(); });
}
