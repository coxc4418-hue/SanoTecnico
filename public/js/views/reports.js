// Sano-Técnico — Reportes del taller (protegidos con PIN)
import { store, STATUS } from '../store.js';
import { deviceName, methodNet } from '../ops.js';
import { esc, usd, bs, num, emptyState, startOfDay, endOfDay, addDays, dayKey, fromKey, fmtDate, PAY_METHODS, methodLabel, toCSV, download } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';

const RANGES = { hoy: 'Hoy', '7': '7 días', '30': '30 días', mes: 'Este mes', custom: 'Personalizado' };

export function mount(el) {
  let range = '7';
  let from = dayKey(addDays(new Date(), -6)); let to = dayKey();
  let data = null;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Reportes</h1><p class="view-sub">Ingresos, ganancias, reparaciones, fallas más comunes y rendimiento.</p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="r-csv">${icon('download')} Excel</button><button class="btn btn-secondary" id="r-print">${icon('print')} Imprimir</button></div></div>
    <div class="card" style="margin-bottom:16px;padding:12px 14px"><div class="row row-wrap"><div class="chips" id="r-ranges"></div><div class="row" id="r-custom" hidden><input class="input input-sm" type="date" id="r-from" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="r-to" style="width:auto"></div></div></div>
    <div id="r-body"><div class="empty"><div class="spinner"></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  function setRange(k) {
    range = k; const now = new Date();
    if (k === 'hoy') { from = to = dayKey(); }
    if (k === '7') { from = dayKey(addDays(now, -6)); to = dayKey(); }
    if (k === '30') { from = dayKey(addDays(now, -29)); to = dayKey(); }
    if (k === 'mes') { from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1)); to = dayKey(); }
    $('#r-ranges').innerHTML = Object.entries(RANGES).map(([v, l]) => `<button class="chip ${v === range ? 'on' : ''}" data-r="${v}">${l}</button>`).join('');
    el.querySelectorAll('[data-r]').forEach((b) => b.onclick = () => setRange(b.dataset.r));
    $('#r-custom').hidden = k !== 'custom';
    $('#r-from').value = from; $('#r-to').value = to;
    load();
  }

  async function load() {
    $('#r-body').innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    const a = startOfDay(fromKey(from)).toISOString(), b = endOfDay(fromKey(to)).toISOString();
    try {
      const [sales, received, delivered] = await Promise.all([store.salesBetween(a, b), store.listBetween('repairs', 'createdAt', a, b), store.listBetween('repairs', 'deliveredAt', a, b)]);
      data = { sales: sales.filter((s) => s.status !== 'voided'), received, delivered: delivered.filter((r) => r.status === 'entregado') };
    } catch (e) { $('#r-body').innerHTML = `<div class="card">${emptyState('alert', 'No se pudo cargar', esc(e.message))}</div>`; return; }
    render();
  }

  const top = (map, n = 8) => Object.entries(map).sort((x, y) => y[1] - x[1]).slice(0, n);
  function hbars(rows, fmt = (v) => v, unit = '') {
    if (!rows.length) return emptyState('chart', 'Sin datos en el período');
    const max = Math.max(...rows.map((r) => r[1]), 1);
    return rows.map(([k, v]) => `<div class="hbar" title="${esc(k)}: ${fmt(v)}${unit}"><span class="ellipsis">${esc(k)}</span><div class="track"><i style="width:${Math.max(2, v / max * 100)}%"></i></div><b class="num">${fmt(v)}${unit}</b></div>`).join('');
  }

  function compute() {
    const { sales, received, delivered } = data;
    const inv = sales.filter((s) => s.kind !== 'abono');
    const billed = inv.reduce((a, s) => a + s.total, 0);
    const cost = inv.reduce((a, s) => a + (s.cost || 0), 0);
    const cash = sales.reduce((a, s) => a + (s.received || 0), 0);
    const repairsBilled = inv.filter((s) => s.kind === 'reparacion').reduce((a, s) => a + s.total, 0);
    const shopBilled = inv.filter((s) => s.kind === 'venta').reduce((a, s) => a + s.total, 0);
    const repaired = delivered.filter((r) => r.finalStatus !== 'no_reparado');
    const avgDays = repaired.length ? repaired.reduce((a, r) => a + (new Date(r.deliveredAt) - new Date(r.createdAt)) / 864e5, 0) / repaired.length : 0;
    const days = []; for (let d = fromKey(from); d <= fromKey(to); d = addDays(d, 1)) days.push(dayKey(d));
    const perDay = days.map((k) => [k, sales.filter((s) => s.dayKey === k).reduce((a, s) => a + (s.received || 0), 0)]);
    const faults = {}; received.forEach((r) => (r.faultTags?.length ? r.faultTags : ['Otra']).forEach((t) => { faults[t] = (faults[t] || 0) + 1; }));
    const brands = {}; received.forEach((r) => { const b = r.device?.brand || 'Otra'; brands[b] = (brands[b] || 0) + 1; });
    const models = {}; received.forEach((r) => { const m = deviceName(r.device); models[m] = (models[m] || 0) + 1; });
    const services = {}; inv.filter((s) => s.kind === 'reparacion').forEach((s) => (s.items || []).filter((i) => !i.productId).forEach((i) => { services[i.name] = (services[i.name] || 0) + i.price * i.qty; }));
    const products = {}; inv.forEach((s) => (s.items || []).filter((i) => i.productId).forEach((i) => { products[i.name] = (products[i.name] || 0) + i.qty; }));
    const methods = {}; sales.forEach((s) => Object.entries(methodNet(s)).forEach(([k, v]) => { methods[k] = (methods[k] || 0) + v; }));
    const techs = {}; delivered.forEach((r) => { const t = r.technician || 'Sin asignar'; techs[t] = (techs[t] || 0) + 1; });
    return { billed, cost, cash, profit: billed - cost, repairsBilled, shopBilled, repaired, avgDays, perDay, faults, brands, models, services, products, methods, techs, inv };
  }

  function render() {
    const c = compute();
    const { received, delivered } = data;
    const max = Math.max(1, ...c.perDay.map((x) => x[1]));
    const showDays = c.perDay.length <= 31;
    $('#r-body').innerHTML = `
      <div class="kpis">
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Facturado</span><span class="kpi-icon tone-brand">${icon('file')}</span></div><div class="kpi-value">${usd(c.billed)}</div><div class="kpi-sub">Reparaciones ${usd(c.repairsBilled)} · ventas ${usd(c.shopBilled)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Ganancia bruta</span><span class="kpi-icon tone-success">${icon('trend')}</span></div><div class="kpi-value">${usd(c.profit)}</div><div class="kpi-sub">${c.billed ? num(c.profit / c.billed * 100, 0) : 0}% · repuestos ${usd(c.cost)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Cobrado</span><span class="kpi-icon tone-info">${icon('dollar')}</span></div><div class="kpi-value">${usd(c.cash)}</div><div class="kpi-sub text-bs">${bs(c.cash * store.rate)}</div></div>
        <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Equipos</span><span class="kpi-icon tone-violet">${icon('wrench')}</span></div><div class="kpi-value">${received.length} <small class="muted" style="font-size:14px">recibidos</small></div><div class="kpi-sub">${c.repaired.length} reparados · ${delivered.length - c.repaired.length} sin reparación · ${num(c.avgDays, 1)} días promedio</div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><div class="card-title">${icon('chart')} Cobrado por día</div><span class="small muted">${fmtDate(from)} – ${fmtDate(to)}</span></div>
        ${showDays ? `<div class="bars">${c.perDay.map(([k, v]) => `<div class="bar" title="${fmtDate(k)}: ${usd(v)}"><i style="height:${v / max * 100}%"></i><span>${c.perDay.length > 14 ? k.slice(8) : fmtDate(k).slice(0, 5)}</span></div>`).join('')}</div>` : `<p class="muted">Elige un período de 31 días o menos para ver el detalle diario.</p>`}</div>
      <div class="grid-2" style="margin-bottom:16px">
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('alert')} Fallas más comunes</div>${hbars(top(c.faults))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('phone')} Marcas que más llegan</div>${hbars(top(c.brands))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('wrench')} Servicios más facturados</div>${hbars(top(c.services), (v) => usd(v))}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('box')} Repuestos y accesorios más usados</div>${hbars(top(c.products), (v) => num(v, 0), ' und')}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('card')} Formas de pago</div>${Object.keys(c.methods).length ? Object.entries(PAY_METHODS).filter(([k]) => Math.abs(c.methods[k] || 0) > 0.004).map(([k, p]) => `<div class="hbar" title="${p.label}: ${usd(c.methods[k])}"><span class="row"><i style="width:10px;height:10px;border-radius:50%;background:${p.color}"></i>${p.label}</span><div class="track"><i style="width:${Math.max(2, c.methods[k] / Math.max(...Object.values(c.methods)) * 100)}%;background:${p.color}"></i></div><b class="num">${usd(c.methods[k])}</b></div>`).join('') : emptyState('card', 'Sin cobros')}</div>
        <div class="card"><div class="card-title" style="margin-bottom:10px">${icon('medal')} Entregas por técnico</div>${hbars(top(c.techs), (v) => num(v, 0))}</div>
      </div>
      <div class="card card-flush"><div class="card-head" style="padding:16px 18px 0"><div class="card-title">${icon('list')} Modelos más recibidos</div></div>
        ${Object.keys(c.models).length ? `<div class="table-wrap"><table class="table"><tbody>${top(c.models, 10).map(([k, v]) => `<tr><td class="t-name">${esc(k)}</td><td class="r"><b>${v}</b> equipo(s)</td></tr>`).join('')}</tbody></table></div>` : `<div style="padding:16px">${emptyState('phone', 'Sin equipos recibidos')}</div>`}</div>`;
  }

  $('#r-from').onchange = (e) => { from = e.target.value; load(); };
  $('#r-to').onchange = (e) => { to = e.target.value; load(); };
  $('#r-csv').onclick = () => {
    if (!data) return;
    download(`reporte-${from}-${to}.csv`, toCSV([['Documento', 'Tipo', 'Fecha', 'Cliente', 'Detalle', 'Total $', 'Costo $', 'Ganancia $', 'Cobrado $', 'Pago'],
      ...data.sales.map((s) => [s.number, s.kind, s.date.slice(0, 10), s.customerName, s.repairNumber ? `${s.repairNumber} ${s.device}` : (s.items || []).map((i) => i.name).join(' + '), s.kind === 'abono' ? '0' : s.total.toFixed(2), (s.cost || 0).toFixed(2), s.kind === 'abono' ? '0' : (s.total - (s.cost || 0)).toFixed(2), (s.received || 0).toFixed(2), (s.payments || []).map((p) => methodLabel(p.method)).join(' + ')])]));
  };
  $('#r-print').onclick = () => {
    if (!data) return;
    const c = compute();
    printDoc(`Reporte del ${fmtDate(from)} al ${fmtDate(to)}`, `
      <div class="kpis"><div class="kpi">Facturado<b>$${num(c.billed)}</b></div><div class="kpi">Ganancia bruta<b>$${num(c.profit)}</b></div><div class="kpi">Cobrado<b>$${num(c.cash)}</b></div><div class="kpi">Equipos recibidos<b>${data.received.length}</b></div><div class="kpi">Reparados<b>${c.repaired.length}</b></div></div>
      <h2>Fallas más comunes</h2><table><tbody>${top(c.faults).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${v}</td></tr>`).join('')}</tbody></table>
      <h2>Servicios</h2><table><tbody>${top(c.services).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">$${num(v)}</td></tr>`).join('')}</tbody></table>
      <h2>Formas de pago</h2><table><tbody>${Object.entries(c.methods).filter(([, v]) => Math.abs(v) > 0.004).map(([k, v]) => `<tr><td>${esc(methodLabel(k))}</td><td class="r">$${num(v)}</td></tr>`).join('')}</tbody></table>`);
  };
  setRange('7');
  return null;
}
