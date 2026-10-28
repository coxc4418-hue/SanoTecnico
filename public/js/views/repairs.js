// Sano-Técnico — Órdenes de servicio: tablero por estado, lista e historial
import { store, STATUS, BOARD, DEVICE_TYPES, statusBadge } from '../store.js';
import { deviceName, repairBalance } from '../ops.js';
import { esc, usd, fmtDate, fmtAgo, normalize, debounce, emptyState, startOfDay, endOfDay, addDays, dayKey, fromKey, toCSV, download, fmtDateTime } from '../utils.js';
import { icon } from '../icons.js';
import { openRepair } from '../repair.js';

const pref = (k, d) => { try { return localStorage.getItem(k) || d; } catch (_) { return d; } };
const setPref = (k, v) => { try { localStorage.setItem(k, v); } catch (_) {} };

export function mount(el, { navigate, params = {} }) {
  let mode = params.mode || pref('st_orders_mode', innerWidth < 760 ? 'list' : 'board');
  let filter = params.status || 'all';
  let tech = 'all';
  let search = '';
  let hist = null; let histFrom = dayKey(addDays(new Date(), -30)); let histTo = dayKey();

  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Órdenes de servicio</h1><p class="view-sub" id="o-sub"></p></div>
      <div class="view-actions">
        <div class="seg" id="o-mode"><button data-m="board">${icon('columns')} Tablero</button><button data-m="list">${icon('list')} Lista</button><button data-m="hist">${icon('clock')} Entregadas</button></div>
        <button class="btn btn-primary" id="o-new">${icon('plus')} Recibir equipo</button>
      </div></div>
    <div class="card card-flush" style="margin-bottom:14px"><div class="toolbar">
      <label class="search">${icon('search')}<input id="o-search" placeholder="Buscar por orden, cliente, teléfono, modelo o IMEI…" value=""></label>
      <select class="select" id="o-tech" style="width:auto;min-width:170px"><option value="all">Todos los técnicos</option><option value="none">Sin asignar</option>${store.activeTechs.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
      <div class="row" id="o-range" hidden><input class="input input-sm" type="date" id="o-from" value="${histFrom}" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="o-to" value="${histTo}" style="width:auto"><button class="btn btn-secondary btn-sm" id="o-csv">${icon('download')} Excel</button></div>
    </div><div class="chips" id="o-chips" style="padding:0 14px 12px"></div></div>
    <div id="o-body"></div>`;
  const $ = (s) => el.querySelector(s);

  const matches = (r) => {
    if (tech === 'none' && r.technicianId) return false;
    if (tech !== 'all' && tech !== 'none' && r.technicianId !== tech) return false;
    if (!search) return true;
    const t = normalize(search);
    return normalize(`${r.number} ${r.customerName} ${r.customerPhone} ${r.device?.brand} ${r.device?.model} ${r.device?.imei} ${r.trackCode} ${r.fault}`).includes(t);
  };

  function card(r) {
    const late = r.promisedAt && new Date(r.promisedAt) < new Date() && !['listo', 'no_reparado'].includes(r.status);
    const bal = repairBalance(r);
    return `<button class="rcard ${r.priority === 'urgente' ? 'urgent' : ''}" data-open="${r.id}">
      <div class="between"><span class="rcard-num">${esc(r.number)}</span><span class="rcard-time ${late ? 'late' : ''}">${late ? `${icon('alert')} Atrasada` : fmtAgo(r.statusAt || r.createdAt)}</span></div>
      <div class="rcard-dev">${icon(DEVICE_TYPES[r.device?.type]?.icon || 'phone')}<b class="ellipsis">${esc(deviceName(r.device))}</b></div>
      <div class="rcard-fault">${esc(r.fault || '')}</div>
      <div class="between rcard-foot"><span class="ellipsis">${icon('user')} ${esc(r.customerName)}</span>${bal > 0 ? `<b class="num">${usd(bal)}</b>` : (r.total > 0 ? `<span class="badge badge-success">Pagado</span>` : '')}</div>
      ${r.technician || r.priority === 'urgente' || r.isWarranty ? `<div class="row row-wrap" style="gap:4px">${r.priority === 'urgente' ? `<span class="badge badge-danger">${icon('zap')} Urgente</span>` : ''}${r.isWarranty ? `<span class="badge badge-violet">Garantía</span>` : ''}${r.technician ? `<span class="badge badge-neutral">${icon('wrench')} ${esc(r.technician)}</span>` : ''}</div>` : ''}
    </button>`;
  }

  function render() {
    el.querySelectorAll('#o-mode [data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
    $('#o-range').hidden = mode !== 'hist';
    $('#o-chips').hidden = mode === 'hist';
    const list = store.repairs.filter(matches);
    $('#o-sub').textContent = `${store.repairs.length} equipo(s) en el taller · ${store.readyRepairs.length} listo(s) para entregar${store.lateRepairs.length ? ` · ${store.lateRepairs.length} atrasado(s)` : ''}`;
    const counts = { all: list.length };
    BOARD.forEach((s) => { counts[s] = list.filter((r) => r.status === s).length; });
    $('#o-chips').innerHTML = [['all', 'Todas'], ...BOARD.map((s) => [s, STATUS[s].short])].map(([k, l]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${l} <span class="count">${counts[k] || 0}</span></button>`).join('');
    el.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { filter = b.dataset.f; render(); });

    const body = $('#o-body');
    if (mode === 'hist') { renderHist(); return; }
    if (!store.repairs.length) { body.innerHTML = `<div class="card">${emptyState('inbox', 'No hay equipos en el taller', 'Cuando recibas un equipo aparecerá aquí, en la columna “Recibido”.')}<div class="center"><button class="btn btn-primary" data-new>${icon('plus')} Recibir equipo</button></div></div>`; body.querySelector('[data-new]').onclick = () => navigate('recibir'); return; }
    if (mode === 'board') {
      const cols = filter === 'all' ? BOARD : [filter];
      body.innerHTML = `<div class="board" id="o-board">${cols.map((s) => {
        const items = list.filter((r) => r.status === s);
        return `<div class="bcol bcol-${STATUS[s].tone}"><div class="bcol-head"><span>${icon(STATUS[s].icon)} ${STATUS[s].label}</span><span class="badge badge-${STATUS[s].tone}">${items.length}</span></div>
          <div class="bcol-list">${items.map(card).join('') || '<div class="bcol-empty">Sin equipos</div>'}</div></div>`;
      }).join('')}</div>`;
    } else {
      const rows = list.filter((r) => filter === 'all' || r.status === filter);
      if (window.innerWidth < 700) {
        body.innerHTML = rows.length ? `<div class="rlist">${rows.map((r) => card(r).replace('<div class="between"><span class="rcard-num">', `<div class="between"><span class="row" style="gap:6px"><span class="rcard-num">`).replace('</span><span class="rcard-time', `</span>${statusBadge(r.status)}</span><span class="rcard-time`)).join('')}</div>` : `<div class="card">${emptyState('search', 'Sin resultados')}</div>`;
        body.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openRepair(b.dataset.open));
        return;
      }
      body.innerHTML = `<div class="card card-flush">${rows.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Orden</th><th>Equipo</th><th class="hide-sm">Cliente</th><th>Estado</th><th class="hide-sm">Técnico</th><th class="hide-sm">Entrega</th><th class="r">Saldo</th></tr></thead><tbody>
        ${rows.map((r) => { const late = r.promisedAt && new Date(r.promisedAt) < new Date() && !['listo', 'no_reparado'].includes(r.status); return `<tr class="click" data-open="${r.id}">
          <td><b>${esc(r.number)}</b>${r.priority === 'urgente' ? ` <span class="badge badge-danger">${icon('zap')}</span>` : ''}<div class="t-sub">${fmtDate(r.createdAt)}</div></td>
          <td><div class="t-name ellipsis" style="max-width:220px">${esc(deviceName(r.device))}</div><div class="t-sub ellipsis" style="max-width:220px">${esc(r.fault || '')}</div></td>
          <td class="hide-sm">${esc(r.customerName)}<div class="t-sub">${esc(r.customerPhone || '')}</div></td>
          <td>${statusBadge(r.status)}</td>
          <td class="hide-sm small">${esc(r.technician || '—')}</td>
          <td class="hide-sm small ${late ? 'text-danger bold' : ''}">${r.promisedAt ? fmtDate(r.promisedAt) : '—'}</td>
          <td class="r num"><b>${usd(repairBalance(r))}</b></td></tr>`; }).join('')}
      </tbody></table></div>` : `<div style="padding:16px">${emptyState('search', 'Sin resultados')}</div>`}</div>`;
    }
    body.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openRepair(b.dataset.open));
  }

  async function renderHist() {
    const body = $('#o-body');
    if (!hist) {
      body.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
      try { hist = (await store.listBetween('repairs', 'statusAt', startOfDay(fromKey(histFrom)).toISOString(), endOfDay(fromKey(histTo)).toISOString())).filter((r) => !r.open).sort((a, b) => (b.statusAt || '').localeCompare(a.statusAt || '')); }
      catch (e) { body.innerHTML = `<div class="card">${emptyState('alert', 'No se pudo cargar', esc(e.message))}</div>`; return; }
    }
    const rows = hist.filter(matches);
    body.innerHTML = `<div class="card card-flush">${rows.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Orden</th><th>Equipo</th><th class="hide-sm">Cliente</th><th>Resultado</th><th class="hide-sm">Fecha</th><th class="hide-sm">Garantía</th><th class="r">Total</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="click" data-open="${r.id}"><td><b>${esc(r.number)}</b><div class="t-sub">${esc(r.invoiceNumber || '')}</div></td><td class="t-name">${esc(deviceName(r.device))}</td><td class="hide-sm">${esc(r.customerName)}</td>
        <td>${statusBadge(r.status)}${r.finalStatus === 'no_reparado' ? '<div class="t-sub">Sin reparación</div>' : ''}</td><td class="hide-sm small">${fmtDate(r.statusAt)}</td>
        <td class="hide-sm small">${r.warrantyUntil ? (new Date(r.warrantyUntil) >= new Date() ? `<span class="badge badge-success">hasta ${fmtDate(r.warrantyUntil)}</span>` : '<span class="faint">Vencida</span>') : '—'}</td>
        <td class="r num"><b>${usd((r.total || 0) - (r.discount || 0))}</b></td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:16px">${emptyState('clock', 'No hay órdenes cerradas en estas fechas')}</div>`}</div>`;
    body.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openRepair(b.dataset.open));
  }

  el.querySelectorAll('#o-mode [data-m]').forEach((b) => b.onclick = () => { mode = b.dataset.m; if (mode !== 'hist') setPref('st_orders_mode', mode); render(); });
  $('#o-new').onclick = () => navigate('recibir');
  $('#o-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  $('#o-tech').onchange = (e) => { tech = e.target.value; render(); };
  $('#o-from').onchange = (e) => { histFrom = e.target.value; hist = null; render(); };
  $('#o-to').onchange = (e) => { histTo = e.target.value; hist = null; render(); };
  $('#o-csv').onclick = () => download(`ordenes-${histFrom}-${histTo}.csv`, toCSV([['Orden', 'Fecha recibido', 'Cerrada', 'Estado', 'Cliente', 'Teléfono', 'Equipo', 'IMEI', 'Falla', 'Técnico', 'Total $', 'Factura'],
    ...(hist || []).map((r) => [r.number, fmtDateTime(r.createdAt), fmtDateTime(r.statusAt), STATUS[r.status]?.label, r.customerName, r.customerPhone, deviceName(r.device), r.device?.imei || '', r.fault, r.technician, ((r.total || 0) - (r.discount || 0)).toFixed(2), r.invoiceNumber || ''])]));
  render();
  return store.on('repairs', () => { if (mode !== 'hist') render(); });
}
