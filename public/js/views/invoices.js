// Sano-Técnico — Facturación: notas de entrega, ventas y recibos de abono
import { store } from '../store.js';
import { voidSale } from '../ops.js';
import { requirePin } from '../auth.js';
import { esc, usd, bs, toast, openModal, emptyState, normalize, debounce, fmtDateTime, startOfDay, endOfDay, addDays, dayKey, fromKey, methodLabel, toCSV, download, setBusy, num } from '../utils.js';
import { icon } from '../icons.js';
import { printReceipt } from '../shared.js';

const KIND = { reparacion: ['Reparación', 'badge-brand', 'wrench'], venta: ['Venta', 'badge-success', 'cart'], abono: ['Abono', 'badge-violet', 'dollar'] };

export function mount(el) {
  let from = dayKey(addDays(new Date(), -6)); let to = dayKey();
  let kind = 'all'; let search = ''; let rows = null;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Facturación</h1><p class="view-sub">Notas de entrega de reparaciones, ventas de mostrador y recibos de abono.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="f-csv">${icon('download')} Exportar</button></div></div>
    <div class="kpis" id="f-kpis"></div>
    <div class="card card-flush"><div class="toolbar">
      <label class="search">${icon('search')}<input id="f-search" placeholder="Buscar por número, cliente, orden o equipo…"></label>
      <div class="row"><input class="input input-sm" type="date" id="f-from" value="${from}" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="f-to" value="${to}" style="width:auto"></div>
    </div><div class="chips" id="f-chips" style="padding:0 14px 12px"></div><div id="f-list"><div class="empty"><div class="spinner"></div></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    $('#f-list').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try { rows = (await store.salesBetween(startOfDay(fromKey(from)).toISOString(), endOfDay(fromKey(to)).toISOString())).sort((a, b) => (b.date || '').localeCompare(a.date || '')); }
    catch (e) { rows = []; toast('No se pudo cargar: ' + e.message, 'danger'); }
    render();
  }

  function render() {
    if (!rows) return;
    const valid = rows.filter((s) => s.status !== 'voided');
    const billed = valid.filter((s) => s.kind !== 'abono').reduce((a, s) => a + s.total, 0);
    const received = valid.reduce((a, s) => a + (s.received || 0), 0);
    const profit = valid.filter((s) => s.kind !== 'abono').reduce((a, s) => a + s.total - (s.cost || 0), 0);
    $('#f-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Facturado</span><span class="kpi-icon tone-brand">${icon('file')}</span></div><div class="kpi-value">${usd(billed)}</div><div class="kpi-sub">${valid.filter((s) => s.kind !== 'abono').length} documento(s)</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span><span class="kpi-icon tone-success">${icon('dollar')}</span></div><div class="kpi-value">${usd(received)}</div><div class="kpi-sub">incluye abonos · ${bs(received * store.rate)}</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ganancia bruta</span><span class="kpi-icon tone-violet">${icon('trend')}</span></div><div class="kpi-value">${usd(profit)}</div><div class="kpi-sub">facturado menos costo de repuestos</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Anulados</span><span class="kpi-icon tone-danger">${icon('x')}</span></div><div class="kpi-value">${rows.length - valid.length}</div><div class="kpi-sub">en el período</div></div>`;
    const counts = { all: rows.length }; Object.keys(KIND).forEach((k) => { counts[k] = rows.filter((s) => s.kind === k).length; });
    $('#f-chips').innerHTML = [['all', 'Todos'], ...Object.entries(KIND).map(([k, v]) => [k, v[0]])].map(([k, l]) => `<button class="chip ${kind === k ? 'on' : ''}" data-k="${k}">${l} <span class="count">${counts[k] || 0}</span></button>`).join('');
    el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { kind = b.dataset.k; render(); });
    const t = normalize(search);
    const list = rows.filter((s) => (kind === 'all' || s.kind === kind) && (!t || normalize(`${s.number} ${s.customerName} ${s.repairNumber || ''} ${s.device || ''} ${s.customerIdDoc || ''}`).includes(t)));
    $('#f-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Documento</th><th>Fecha</th><th class="hide-sm">Cliente</th><th class="hide-sm">Detalle</th><th class="hide-sm">Pago</th><th class="r">Total</th><th></th></tr></thead><tbody>
      ${list.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}">
        <td><b>${esc(s.number)}</b><div><span class="badge ${KIND[s.kind]?.[1] || 'badge-neutral'}">${KIND[s.kind]?.[0] || s.kind}</span>${s.status === 'voided' ? ' <span class="badge badge-danger">Anulado</span>' : ''}</div></td>
        <td class="small nowrap">${fmtDateTime(s.date)}</td>
        <td class="hide-sm">${esc(s.customerName)}</td>
        <td class="hide-sm small ellipsis" style="max-width:260px">${s.repairNumber ? `${esc(s.repairNumber)} · ${esc(s.device || '')}` : (s.items || []).map((i) => esc(i.name)).join(', ')}</td>
        <td class="hide-sm small">${(s.payments || []).map((p) => esc(methodLabel(p.method))).join(', ') || (s.prepaid ? 'Pagado con abonos' : '—')}</td>
        <td class="r num"><b>${usd(s.total)}</b>${s.prepaid ? `<div class="t-sub">abonado ${usd(s.prepaid)}</div>` : `<div class="t-sub">${bs(s.total * (s.rate || store.rate))}</div>`}</td>
        <td class="r nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-view="${s.id}" title="Ver">${icon('eye')}</button><button class="btn btn-ghost btn-icon btn-sm" data-pr="${s.id}" title="Imprimir">${icon('print')}</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:20px">${emptyState('file', 'No hay documentos en este período')}</div>`;
    const find = (id) => rows.find((s) => s.id === id);
    el.querySelectorAll('[data-pr]').forEach((b) => b.onclick = () => printReceipt(find(b.dataset.pr)));
    el.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => view(find(b.dataset.view)));
  }

  function view(s) {
    const m = openModal({
      title: `${KIND[s.kind]?.[0] || ''} ${esc(s.number)}`, sub: `${fmtDateTime(s.date)} · ${esc(s.customerName)}${s.status === 'voided' ? ' · ANULADO' : ''}`, size: 'md',
      body: `<div class="stack">
        ${s.repairNumber ? `<div class="box small">${icon('wrench')} Orden <b>${esc(s.repairNumber)}</b> · ${esc(s.device || '')}${s.technician ? ' · ' + esc(s.technician) : ''}</div>` : ''}
        <div class="summary-box">${(s.items || []).map((i) => `<div class="summary-row"><span>${num(i.qty, i.qty % 1 ? 2 : 0)} × ${esc(i.name)}</span><b>${usd(i.total ?? i.price * i.qty)}</b></div>`).join('')}
          ${s.discount ? `<div class="summary-row"><span>Descuento</span><b>−${usd(s.discount)}</b></div>` : ''}
          <div class="summary-row total"><span>Total</span><span>${usd(s.total)}</span></div>
          ${s.prepaid ? `<div class="summary-row"><span>Abonado antes</span><b>−${usd(s.prepaid)}</b></div><div class="summary-row"><span>Cobrado en la entrega</span><b>${usd(s.due)}</b></div>` : ''}</div>
        ${(s.payments || []).length ? `<div class="section-title">Pagos</div><div class="summary-box">${s.payments.map((p) => `<div class="summary-row"><span>${esc(methodLabel(p.method))}</span><b>${p.currency === 'BS' ? bs(p.amount) : usd(p.amount)}</b></div>`).join('')}${s.changeUSD > 0.009 ? `<div class="summary-row"><span>Vuelto</span><b>${s.changeCurrency === 'BS' ? bs(s.changeUSD * s.rate) : usd(s.changeUSD)}</b></div>` : ''}</div>` : ''}
        ${s.status === 'voided' ? `<div class="pay-status due"><span>Anulado ${fmtDateTime(s.voidedAt)}${s.voidReason ? ': ' + esc(s.voidReason) : ''}</span><span></span></div>` : ''}
      </div>`,
      footer: `${s.status !== 'voided' ? `<button class="btn btn-danger-soft" data-void style="margin-right:auto">${icon('x')} Anular</button>` : ''}<button class="btn btn-secondary" data-close>Cerrar</button><button class="btn btn-primary" data-pr>${icon('print')} Imprimir</button>`
    });
    m.el.querySelector('[data-pr]').onclick = () => printReceipt(s);
    m.el.querySelector('[data-void]') && (m.el.querySelector('[data-void]').onclick = async () => {
      if (!(await requirePin('Anular un documento'))) return;
      const m2 = openModal({
        title: `Anular ${esc(s.number)}`, size: 'sm',
        sub: s.kind === 'reparacion' ? 'La orden vuelve a quedar abierta (lista para entregar) y se revierte el cobro de la caja.' : s.kind === 'venta' ? 'Los productos regresan al inventario y se revierte el cobro de la caja.' : 'El abono se descuenta de la orden y se revierte de la caja.',
        body: `<div class="field"><label>Motivo</label><input class="input" data-r placeholder="Ej.: error en el cobro" autofocus></div>`,
        footer: `<button class="btn btn-secondary" data-close>Volver</button><button class="btn btn-danger" data-ok>Anular</button>`
      });
      m2.el.querySelector('[data-ok]').onclick = async (e) => {
        setBusy(e.currentTarget, true);
        try {
          const { cashReverted } = await voidSale(s, m2.el.querySelector('[data-r]').value.trim());
          m2.close(); m.close(); toast(cashReverted ? 'Documento anulado y caja revertida' : 'Documento anulado (no hay caja abierta: ajusta el efectivo manualmente)', cashReverted ? 'success' : 'warning', 5000);
          load();
        } catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
      };
    });
  }

  $('#f-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  $('#f-from').onchange = (e) => { from = e.target.value; load(); };
  $('#f-to').onchange = (e) => { to = e.target.value; load(); };
  $('#f-csv').onclick = () => download(`facturacion-${from}-${to}.csv`, toCSV([['Número', 'Tipo', 'Fecha', 'Cliente', 'C.I./RIF', 'Orden', 'Equipo', 'Total $', 'Cobrado $', 'Costo $', 'Tasa', 'Pago', 'Estado'],
    ...(rows || []).map((s) => [s.number, KIND[s.kind]?.[0], fmtDateTime(s.date), s.customerName, s.customerIdDoc || '', s.repairNumber || '', s.device || '', s.total.toFixed(2), (s.received || 0).toFixed(2), (s.cost || 0).toFixed(2), s.rate, (s.payments || []).map((p) => methodLabel(p.method)).join(' + '), s.status === 'voided' ? 'Anulado' : 'Válido'])]));
  load();
  return store.on('sales', () => load());
}
