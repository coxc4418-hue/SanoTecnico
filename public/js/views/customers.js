// Sano-Técnico — Clientes y su historial de equipos
import { store, statusBadge } from '../store.js';
import { deviceName, repairBalance } from '../ops.js';
import { requirePin } from '../auth.js';
import { esc, usd, toast, openModal, emptyState, normalize, debounce, initials, colorFor, fmtDate, nowISO, confirmDialog, waLink, toCSV, download, dayKey } from '../utils.js';
import { icon } from '../icons.js';

export async function openCustomer(id) {
  const c = store.customer(id);
  if (!c) { toast('Cliente no encontrado', 'warning'); return; }
  const m = openModal({ title: esc(c.name), sub: [c.phone, c.idDoc].filter(Boolean).map(esc).join(' · ') || 'Sin datos de contacto', size: 'lg', body: '<div class="empty"><div class="spinner"></div></div>',
    footer: `<button class="btn btn-ghost" data-edit style="margin-right:auto">${icon('edit')} Editar</button>${c.phone ? `<a class="btn btn-whatsapp" href="${waLink(c.phone, `Hola ${c.name.split(' ')[0]}, te escribimos de ${store.businessName}.`)}" target="_blank" rel="noopener">${icon('whatsapp')} WhatsApp</a>` : ''}<button class="btn btn-primary" data-new>${icon('inbox')} Recibir equipo</button>` });
  m.el.querySelector('[data-edit]').onclick = () => { m.close(); editCustomer(c); };
  m.el.querySelector('[data-new]').onclick = async () => { m.close(); (await import('../main.js')).navigate('recibir', { params: { customerId: c.id } }); };
  let reps = [], sales = [];
  try { [reps, sales] = await Promise.all([store.listEq('repairs', 'customerId', c.id), store.listEq('sales', 'customerId', c.id)]); } catch (_) {}
  reps.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  sales = sales.filter((s) => s.status !== 'voided' && s.kind === 'venta').sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const spent = reps.filter((r) => r.status === 'entregado').reduce((a, r) => a + (r.total || 0) - (r.discount || 0), 0) + sales.reduce((a, s) => a + s.total, 0);
  const owed = reps.filter((r) => r.open).reduce((a, r) => a + repairBalance(r), 0);
  m.el.querySelector('.modal-body').innerHTML = `
    <div class="kpis" style="margin-bottom:14px">
      <div class="card kpi"><div class="kpi-label">Equipos traídos</div><div class="kpi-value">${reps.length}</div><div class="kpi-sub">${reps.filter((r) => r.open).length} en el taller</div></div>
      <div class="card kpi"><div class="kpi-label">Total gastado</div><div class="kpi-value">${usd(spent)}</div><div class="kpi-sub">${sales.length} compra(s) de accesorios</div></div>
      <div class="card kpi"><div class="kpi-label">Saldo pendiente</div><div class="kpi-value ${owed > 0 ? 'text-danger' : ''}">${usd(owed)}</div><div class="kpi-sub">Cliente desde ${fmtDate(c.createdAt)}</div></div>
    </div>
    ${c.notes ? `<div class="box small mb">${icon('info')} ${esc(c.notes)}</div>` : ''}
    <div class="section-title">Equipos</div>
    ${reps.length ? `<div class="list">${reps.map((r) => `<div class="list-item click" data-r="${r.id}"><div class="grow" style="min-width:0"><div class="t-name">${esc(r.number)} · ${esc(deviceName(r.device))}</div><div class="t-sub ellipsis">${fmtDate(r.createdAt)} · ${esc(r.fault || '')}</div></div>${statusBadge(r.status)}</div>`).join('')}</div>` : emptyState('inbox', 'Sin equipos registrados')}
    ${sales.length ? `<div class="section-title mt-lg">Compras</div><div class="list">${sales.map((s) => `<div class="list-item"><div class="grow"><div class="t-name">${esc(s.number)}</div><div class="t-sub">${fmtDate(s.date)} · ${s.items.map((i) => esc(i.name)).join(', ')}</div></div><b>${usd(s.total)}</b></div>`).join('')}</div>` : ''}`;
  m.el.querySelectorAll('[data-r]').forEach((x) => x.onclick = async () => { m.close(); (await import('../repair.js')).openRepair(x.dataset.r); });
}

export function editCustomer(c = null) {
  const isNew = !c;
  c ||= { name: '', phone: '', idDoc: '', email: '', address: '', notes: '' };
  const m = openModal({
    title: isNew ? 'Nuevo cliente' : 'Editar cliente', size: 'md',
    body: `<form class="form-grid" data-f autocomplete="off">
      <div class="field full"><label>Nombre y apellido *</label><input class="input" name="name" value="${esc(c.name)}" autofocus></div>
      <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" value="${esc(c.phone || '')}" inputmode="tel" placeholder="0414-1234567"></div>
      <div class="field"><label>Cédula / RIF</label><input class="input" name="idDoc" value="${esc(c.idDoc || '')}" placeholder="V-12345678"></div>
      <div class="field"><label>Correo</label><input class="input" name="email" value="${esc(c.email || '')}" inputmode="email"></div>
      <div class="field"><label>Dirección</label><input class="input" name="address" value="${esc(c.address || '')}"></div>
      <div class="field full"><label>Notas</label><input class="input" name="notes" value="${esc(c.notes || '')}" placeholder="Ej.: cliente frecuente, prefiere pago móvil"></div>
      <div class="error-msg full" data-err></div></form>`,
    footer: `${isNew ? '' : `<button class="btn btn-danger-soft" data-del style="margin-right:auto">${icon('trash')} Eliminar</button>`}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
  });
  const F = m.el.querySelector('[data-f]').elements;
  const save = async (e) => {
    e?.preventDefault();
    const name = F.name.value.trim();
    if (name.length < 2) { m.el.querySelector('[data-err]').textContent = 'Escribe el nombre del cliente.'; return; }
    const data = { name, phone: F.phone.value.trim(), idDoc: F.idDoc.value.trim().toUpperCase(), email: F.email.value.trim(), address: F.address.value.trim(), notes: F.notes.value.trim(), updatedAt: nowISO() };
    if (isNew) Object.assign(data, { repairs: 0, totalSpent: 0, createdAt: nowISO() });
    await store.save('customers', isNew ? store.newRef('customers').id : c.id, data, !isNew);
    m.close(); toast(isNew ? 'Cliente registrado' : 'Cliente actualizado');
  };
  m.el.querySelector('[data-f]').onsubmit = save;
  m.el.querySelector('[data-ok]').onclick = save;
  m.el.querySelector('[data-del]') && (m.el.querySelector('[data-del]').onclick = async () => {
    if (store.repairs.some((r) => r.customerId === c.id)) { toast('El cliente tiene equipos en el taller.', 'warning'); return; }
    if (!(await requirePin('Eliminar un cliente'))) return;
    if (!(await confirmDialog({ title: 'Eliminar cliente', message: `¿Eliminar a <b>${esc(c.name)}</b>? Sus órdenes y facturas se conservan.`, confirmText: 'Eliminar', danger: true }))) return;
    await store.remove('customers', c.id); m.close(); toast('Cliente eliminado', 'warning');
  });
}

export function mount(el) {
  let search = '';
  let sort = 'recent';
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Clientes</h1><p class="view-sub" id="c-sub"></p></div>
    <div class="view-actions"><button class="btn btn-secondary" id="c-exp">${icon('download')} Exportar</button><button class="btn btn-primary" id="c-new">${icon('plus')} Nuevo cliente</button></div></div>
    <div class="card card-flush"><div class="toolbar"><label class="search">${icon('search')}<input id="c-search" placeholder="Buscar por nombre, teléfono o cédula…"></label>
      <div class="seg">${[['recent', 'Recientes'], ['repairs', 'Más equipos'], ['spent', 'Más gasto'], ['name', 'A-Z']].map(([k, l]) => `<button data-sort="${k}">${l}</button>`).join('')}</div></div>
      <div id="c-list"></div></div>`;
  const $ = (s) => el.querySelector(s);
  function render() {
    el.querySelectorAll('[data-sort]').forEach((b) => b.classList.toggle('on', b.dataset.sort === sort));
    const t = normalize(search);
    const inShop = new Map(); store.repairs.forEach((r) => inShop.set(r.customerId, (inShop.get(r.customerId) || 0) + 1));
    const list = store.customers.filter((c) => !t || normalize(`${c.name} ${c.phone} ${c.idDoc}`).includes(t))
      .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'es') : sort === 'repairs' ? (b.repairs || 0) - (a.repairs || 0) : sort === 'spent' ? (b.totalSpent || 0) - (a.totalSpent || 0) : (b.lastVisitAt || b.createdAt || '').localeCompare(a.lastVisitAt || a.createdAt || ''));
    $('#c-sub').textContent = `${store.customers.length} cliente(s) registrados`;
    $('#c-list').innerHTML = list.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Cliente</th><th class="hide-sm">Cédula</th><th class="c">Equipos</th><th class="r">Gastado</th><th class="hide-sm">Última visita</th><th></th></tr></thead><tbody>
      ${list.slice(0, 300).map((c) => `<tr class="click" data-c="${c.id}"><td><div class="row"><span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span><div><div class="t-name">${esc(c.name)}</div><div class="t-sub">${esc(c.phone || 'Sin teléfono')}</div></div></div></td>
        <td class="hide-sm small">${esc(c.idDoc || '—')}</td><td class="c"><b>${c.repairs || 0}</b>${inShop.get(c.id) ? `<div class="t-sub text-brand">${inShop.get(c.id)} en taller</div>` : ''}</td><td class="r num">${usd(c.totalSpent || 0)}</td><td class="hide-sm small">${fmtDate(c.lastVisitAt || c.createdAt)}</td>
        <td class="r nowrap">${c.phone ? `<a class="btn btn-ghost btn-icon btn-sm" href="${waLink(c.phone, `Hola ${c.name.split(' ')[0]}, te escribimos de ${store.businessName}.`)}" target="_blank" rel="noopener" data-stop title="WhatsApp">${icon('whatsapp')}</a>` : ''}<button class="btn btn-ghost btn-icon btn-sm" data-ed="${c.id}">${icon('edit')}</button></td></tr>`).join('')}
    </tbody></table></div>` : `<div style="padding:20px">${emptyState('users', store.customers.length ? 'Sin resultados' : 'Aún no hay clientes', 'Se registran solos al recibir un equipo.')}</div>`;
    el.querySelectorAll('[data-c]').forEach((r) => r.onclick = (e) => { if (e.target.closest('[data-ed],[data-stop]')) return; openCustomer(r.dataset.c); });
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => editCustomer(store.customer(b.dataset.ed)));
  }
  $('#c-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  el.querySelectorAll('[data-sort]').forEach((b) => b.onclick = () => { sort = b.dataset.sort; render(); });
  $('#c-new').onclick = () => editCustomer();
  $('#c-exp').onclick = () => download(`clientes-${dayKey()}.csv`, toCSV([['Nombre', 'Teléfono', 'Cédula', 'Correo', 'Dirección', 'Equipos', 'Gastado $', 'Cliente desde'], ...store.customers.map((c) => [c.name, c.phone, c.idDoc, c.email, c.address, c.repairs || 0, (c.totalSpent || 0).toFixed(2), fmtDate(c.createdAt)])]));
  render();
  return store.on('*', (e) => { if (e === 'customers' || e === 'repairs') render(); });
}
