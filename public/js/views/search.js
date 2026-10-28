// Sano-Técnico — Búsqueda global (Ctrl + K): órdenes, clientes y productos
import { store, STATUS } from '../store.js';
import { deviceName, repairBalance } from '../ops.js';
import { openModal, esc, usd, normalize, debounce, initials, colorFor, qtyFmt } from '../utils.js';
import { icon } from '../icons.js';

export function openSearch() {
  if (document.querySelector('.search-modal')) return;
  const m = openModal({
    size: 'lg',
    body: `<div class="search search-big">${icon('search')}<input data-q placeholder="Orden (OS-0012), cliente, teléfono, IMEI, modelo o código de seguimiento…" autofocus autocomplete="off"><kbd>Esc</kbd></div><div data-res class="sres"></div>`
  });
  m.el.querySelector('.modal').classList.add('search-modal');
  const input = m.el.querySelector('[data-q]');
  const res = m.el.querySelector('[data-res]');
  let token = 0;

  async function run() {
    const raw = input.value.trim();
    const t = normalize(raw);
    const my = ++token;
    if (!t) { res.innerHTML = hint(); bind(); return; }
    const reps = store.repairs.filter((r) => normalize(`${r.number} ${r.customerName} ${r.customerPhone} ${r.device?.brand} ${r.device?.model} ${r.device?.imei} ${r.trackCode}`).includes(t)).slice(0, 8);
    const custs = store.customers.filter((c) => normalize(`${c.name} ${c.phone} ${c.idDoc}`).includes(t)).slice(0, 5);
    const prods = store.products.filter((p) => normalize(`${p.name} ${p.sku || ''} ${p.compatible || ''}`).includes(t)).slice(0, 5);
    draw(reps, custs, prods, []);
    // Órdenes ya cerradas: búsqueda exacta por número, código o IMEI
    const up = raw.toUpperCase();
    const queries = [];
    if (/^OS-?\d+$/i.test(up)) queries.push(['number', up.includes('-') ? up : up.replace('OS', 'OS-')]);
    if (/^\d+$/.test(up) && up.length <= 5) queries.push(['number', 'OS-' + up.padStart(4, '0')]);
    if (/^[A-Z0-9]{6}$/.test(up)) queries.push(['trackCode', up]);
    if (/^\d{8,17}$/.test(raw)) queries.push(['device.imei', raw]);
    if (!queries.length) return;
    const found = [];
    for (const [f, v] of queries) { try { found.push(...await store.listEq('repairs', f, v)); } catch (_) {} }
    if (my !== token) return;
    const extra = found.filter((r) => !reps.some((x) => x.id === r.id));
    if (extra.length) draw([...reps, ...extra], custs, prods);
  }

  function draw(reps, custs, prods) {
    res.innerHTML = (reps.length || custs.length || prods.length) ? `
      ${reps.length ? `<div class="section-title">Órdenes</div>${reps.map((r) => `<button class="sitem" data-r="${r.id}"><span class="kpi-icon tone-${STATUS[r.status]?.tone || 'neutral'}" style="width:36px;height:36px">${icon(STATUS[r.status]?.icon || 'wrench')}</span><span class="grow"><b>${esc(r.number)} · ${esc(deviceName(r.device))}</b><small>${esc(r.customerName)} · ${esc(STATUS[r.status]?.label || '')}${repairBalance(r) > 0 ? ' · saldo ' + usd(repairBalance(r)) : ''}</small></span>${icon('arrowRight')}</button>`).join('')}` : ''}
      ${custs.length ? `<div class="section-title">Clientes</div>${custs.map((c) => `<button class="sitem" data-c="${c.id}"><span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.phone || '')} · ${c.repairs || 0} equipo(s)</small></span>${icon('arrowRight')}</button>`).join('')}` : ''}
      ${prods.length ? `<div class="section-title">Inventario</div>${prods.map((p) => `<button class="sitem" data-p="${p.id}"><span class="kpi-icon tone-info" style="width:36px;height:36px">${icon('box')}</span><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.category || '')} · stock ${qtyFmt(p.stock || 0)} · ${usd(p.price)}</small></span>${icon('arrowRight')}</button>`).join('')}` : ''}`
      : `<div class="empty">${icon('search')}<b>Sin resultados</b><span>Para órdenes ya entregadas escribe el número exacto (ej. OS-0012), el código de seguimiento o el IMEI.</span></div>`;
    bind();
  }

  function hint() {
    const recent = store.repairs.slice(0, 5);
    return recent.length ? `<div class="section-title">Recientes</div>${recent.map((r) => `<button class="sitem" data-r="${r.id}"><span class="kpi-icon tone-${STATUS[r.status]?.tone}" style="width:36px;height:36px">${icon(STATUS[r.status]?.icon || 'wrench')}</span><span class="grow"><b>${esc(r.number)} · ${esc(deviceName(r.device))}</b><small>${esc(r.customerName)} · ${esc(STATUS[r.status]?.label)}</small></span>${icon('arrowRight')}</button>`).join('')}` : '';
  }

  function bind() {
    res.querySelectorAll('[data-r]').forEach((b) => b.onclick = async () => { m.close(); (await import('../repair.js')).openRepair(b.dataset.r); });
    res.querySelectorAll('[data-c]').forEach((b) => b.onclick = async () => { m.close(); (await import('./customers.js')).openCustomer(b.dataset.c); });
    res.querySelectorAll('[data-p]').forEach((b) => b.onclick = async () => { m.close(); (await import('../main.js')).navigate('inventario', { params: { q: store.product(b.dataset.p)?.name || '' } }); });
  }

  input.oninput = debounce(run, 140);
  input.onkeydown = (e) => { if (e.key === 'Enter') { const first = res.querySelector('.sitem'); if (first) first.click(); } };
  res.innerHTML = hint(); bind();
}
