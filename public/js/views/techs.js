// Sano-Técnico — Técnicos: carga de trabajo, rendimiento y comisiones
import { store, STATUS } from '../store.js';
import { requirePin } from '../auth.js';
import { esc, usd, num, toast, openModal, emptyState, parseNum, shortId, initials, colorFor, startOfDay, endOfDay, dayKey, fromKey, waLink, round2, confirmDialog } from '../utils.js';
import { icon } from '../icons.js';
import { printDoc } from '../shared.js';

const laborOf = (r) => (r.items || []).filter((i) => !i.productId).reduce((a, i) => a + i.price * i.qty, 0);

export function mount(el) {
  const now = new Date();
  let from = dayKey(new Date(now.getFullYear(), now.getMonth(), 1)); let to = dayKey();
  let done = null;

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Técnicos</h1><p class="view-sub">Quién tiene cada equipo, cuántos repara y cuánto le corresponde de comisión.</p></div>
    <div class="view-actions"><div class="row"><input class="input input-sm" type="date" id="t-from" value="${from}" style="width:auto"><span class="muted">a</span><input class="input input-sm" type="date" id="t-to" value="${to}" style="width:auto"></div><button class="btn btn-secondary" id="t-print">${icon('print')} Imprimir</button><button class="btn btn-primary" id="t-new">${icon('plus')} Nuevo técnico</button></div></div>
    <div id="t-body"><div class="empty"><div class="spinner"></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    try { done = (await store.listBetween('repairs', 'deliveredAt', startOfDay(fromKey(from)).toISOString(), endOfDay(fromKey(to)).toISOString())).filter((r) => r.status === 'entregado'); } catch (_) { done = []; }
    render();
  }

  function stats() {
    const techs = [...store.settings.techs, { id: null, name: 'Sin asignar', commission: 0, virtual: true }];
    return techs.map((t) => {
      const open = store.repairs.filter((r) => (r.technicianId || null) === t.id);
      const fin = (done || []).filter((r) => (r.technicianId || null) === t.id);
      const repaired = fin.filter((r) => r.finalStatus !== 'no_reparado');
      const labor = round2(repaired.reduce((a, r) => a + laborOf(r), 0));
      const billed = round2(fin.reduce((a, r) => a + (r.total || 0) - (r.discount || 0), 0));
      return { t, open, fin, repaired, labor, billed, commission: round2(labor * (Number(t.commission) || 0) / 100) };
    }).filter((s) => !s.t.virtual || s.open.length || s.fin.length);
  }

  function render() {
    if (!done) return;
    const list = stats();
    $('#t-body').innerHTML = store.settings.techs.length ? `<div class="tech-grid">${list.map((s) => `
      <div class="card tech-card ${s.t.active === false ? 'inactive' : ''}">
        <div class="row"><span class="avatar" style="width:46px;height:46px;font-size:16px;background:${s.t.virtual ? 'var(--faint)' : colorFor(s.t.name)}">${esc(initials(s.t.name))}</span>
          <div class="grow" style="min-width:0"><b style="font-size:16px">${esc(s.t.name)}</b><div class="t-sub">${s.t.virtual ? 'Órdenes sin técnico' : `${esc(s.t.phone || 'Sin teléfono')} · comisión ${num(s.t.commission || 0, 0)}% de mano de obra`}${s.t.active === false ? ' · inactivo' : ''}</div></div>
          ${s.t.virtual ? '' : `<button class="btn btn-ghost btn-icon btn-sm" data-ed="${s.t.id}">${icon('edit')}</button>`}</div>
        <div class="tech-stats">
          <div><b>${s.open.length}</b><span>En proceso</span></div>
          <div><b>${s.repaired.length}</b><span>Reparados</span></div>
          <div><b>${usd(s.labor)}</b><span>Mano de obra</span></div>
          <div><b class="text-success">${usd(s.commission)}</b><span>Comisión</span></div>
        </div>
        ${s.open.length ? `<div class="tagrow">${Object.entries(s.open.reduce((a, r) => { a[r.status] = (a[r.status] || 0) + 1; return a; }, {})).map(([k, n]) => `<span class="badge badge-${STATUS[k].tone}">${n} ${STATUS[k].short}</span>`).join('')}</div>` : '<div class="small faint">Sin equipos asignados ahora</div>'}
        ${!s.t.virtual && s.t.phone && s.open.length ? `<a class="btn btn-ghost btn-sm" style="align-self:flex-start" href="${waLink(s.t.phone, `Hola ${s.t.name}, tus equipos pendientes:\n${s.open.map((r) => `• ${r.number} ${r.device?.brand || ''} ${r.device?.model || ''} — ${STATUS[r.status].label}`).join('\n')}`)}" target="_blank" rel="noopener">${icon('whatsapp')} Enviarle sus pendientes</a>` : ''}
      </div>`).join('')}</div>` : `<div class="card">${emptyState('medal', 'Registra a tus técnicos', 'Asigna cada equipo a un técnico, mide cuántos repara y calcula su comisión sobre la mano de obra.')}<div class="center"><button class="btn btn-primary" data-first>${icon('plus')} Agregar técnico</button></div></div>`;
    el.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => edit(store.tech(b.dataset.ed)));
    el.querySelector('[data-first]') && (el.querySelector('[data-first]').onclick = () => edit());
  }

  async function edit(t = null) {
    if (!(await requirePin(t ? 'Editar un técnico' : 'Agregar un técnico'))) return;
    const isNew = !t;
    t ||= { id: shortId(8), name: '', phone: '', commission: 0, active: true };
    const m = openModal({
      title: isNew ? 'Nuevo técnico' : `Editar ${esc(t.name)}`, size: 'sm',
      body: `<form class="stack" data-f><div class="field"><label>Nombre *</label><input class="input" name="name" value="${esc(t.name)}" autofocus></div>
        <div class="field"><label>Teléfono / WhatsApp</label><input class="input" name="phone" value="${esc(t.phone || '')}" inputmode="tel"></div>
        <div class="field"><label>Comisión sobre la mano de obra (%)</label><input class="input" name="commission" inputmode="decimal" value="${num(t.commission || 0, 0)}"><span class="hint">Ej.: 30 = el técnico gana el 30% de los servicios que repara (no incluye repuestos).</span></div>
        <label class="check"><span class="switch"><input type="checkbox" name="active" ${t.active !== false ? 'checked' : ''}><span></span></span> Activo</label></form>`,
      footer: `${isNew ? '' : `<button class="btn btn-danger-soft" data-del style="margin-right:auto">${icon('trash')}</button>`}<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Guardar</button>`
    });
    const F = m.el.querySelector('[data-f]').elements;
    const save = async (e) => {
      e?.preventDefault();
      const name = F.name.value.trim(); if (!name) { toast('Escribe el nombre', 'warning'); return; }
      const next = { ...t, name, phone: F.phone.value.trim(), commission: Math.max(0, Math.min(100, parseNum(F.commission.value))), active: F.active.checked };
      const list = isNew ? [...store.settings.techs, next] : store.settings.techs.map((x) => x.id === t.id ? next : x);
      await store.saveSettings({ techs: list }); m.close(); toast('Técnico guardado'); render();
    };
    m.el.querySelector('[data-f]').onsubmit = save; m.el.querySelector('[data-ok]').onclick = save;
    m.el.querySelector('[data-del]') && (m.el.querySelector('[data-del]').onclick = async () => {
      if (store.repairs.some((r) => r.technicianId === t.id)) { toast('Tiene equipos asignados: márcalo como inactivo o reasígnalos.', 'warning', 4500); return; }
      if (!(await confirmDialog({ title: 'Eliminar técnico', message: `¿Eliminar a <b>${esc(t.name)}</b>? Su historial se conserva en las órdenes.`, confirmText: 'Eliminar', danger: true }))) return;
      await store.saveSettings({ techs: store.settings.techs.filter((x) => x.id !== t.id) }); m.close(); render();
    });
  }

  $('#t-new').onclick = () => edit();
  $('#t-from').onchange = (e) => { from = e.target.value; load(); };
  $('#t-to').onchange = (e) => { to = e.target.value; load(); };
  $('#t-print').onclick = () => printDoc(`Técnicos · ${from} al ${to}`, `<table><thead><tr><th>Técnico</th><th class="r">En proceso</th><th class="r">Reparados</th><th class="r">Facturado</th><th class="r">Mano de obra</th><th class="r">Comisión %</th><th class="r">Comisión</th></tr></thead><tbody>${stats().map((s) => `<tr><td>${esc(s.t.name)}</td><td class="r">${s.open.length}</td><td class="r">${s.repaired.length}</td><td class="r">$${num(s.billed)}</td><td class="r">$${num(s.labor)}</td><td class="r">${num(s.t.commission || 0, 0)}%</td><td class="r"><b>$${num(s.commission)}</b></td></tr>`).join('')}</tbody></table>`);
  load();
  return store.on('*', (e) => { if (e === 'repairs' || e === 'settings') render(); });
}
