// Sano-Técnico — Recepción de equipos (nueva orden de servicio)
import { store, DEVICE_TYPES, BRANDS, FAULT_TAGS, CONDITION_TAGS, ACCESSORY_TAGS, CHECKS, CHECK_STATES } from '../store.js';
import { createRepair, deviceName, itemsTotal } from '../ops.js';
import { esc, usd, bs, num, toast, parseNum, setBusy, normalize, shortId, compressImage, openModal, addDays, dayKey, fromKey, round2, initials, colorFor, debounce } from '../utils.js';
import { icon } from '../icons.js';
import { mountPatternPad, printRepairOrder, printLabel, printReceipt, waCustomer, notifyLowStock } from '../shared.js';
import { openPay } from '../pay.js';

const MAX_PHOTOS = 4;

/** Valida un IMEI de 15 dígitos (algoritmo de Luhn) */
export function imeiValid(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 15) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) { let n = +d[i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } sum += n; }
  return sum % 10 === 0;
}

function blankForm() {
  return {
    customer: null, newCustomer: { name: '', phone: '', idDoc: '' },
    device: { type: 'celular', brand: '', model: '', color: '', imei: '', storage: '', unlockType: 'none', unlockValue: '', pattern: [] },
    faultTags: [], fault: '', checks: {}, condition: [], conditionNote: '', accessories: [], photos: [],
    items: [], technicianId: '', priority: 'normal', promisedAt: dayKey(addDays(new Date(), 1)), warrantyDays: store.settings.warrantyDays ?? 30,
    deposit: false, warrantyOf: null
  };
}

export function mount(el, { navigate, params = {} }) {
  const f = blankForm();
  let pad = null;

  // Ingreso por garantía: precarga cliente y equipo de la orden original
  async function preloadWarranty(id) {
    const o = await store.getRepair(id);
    if (!o) return;
    f.warrantyOf = o.id;
    f.customer = store.customer(o.customerId) || { id: o.customerId, name: o.customerName, phone: o.customerPhone, idDoc: o.customerIdDoc };
    f.device = { ...f.device, ...o.device };
    f.fault = `Garantía de la orden ${o.number}: `;
    f.items = [];
    f.priority = 'urgente';
    render();
    toast(`Ingreso por garantía de la orden ${o.number}`, 'info', 4000);
  }

  const models = () => [...new Set(store.repairs.map((r) => r.device?.model).filter(Boolean))].slice(0, 40);

  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Recibir equipo</h1><p class="view-sub">Registra el equipo con todos sus detalles. Al guardar se crea la orden de servicio con su código de seguimiento.</p></div>
    <div class="view-actions"><button class="btn btn-ghost" id="in-reset">${icon('rotate')} Limpiar</button></div></div>
    <div class="intake" id="in-root"></div>`;
  const root = el.querySelector('#in-root');

  function sec(n, title, sub, inner, id = '') {
    return `<section class="card in-sec" ${id ? `id="${id}"` : ''}><div class="in-sec-head"><span class="in-n">${n}</span><div><div class="card-title" style="gap:0">${title}</div>${sub ? `<div class="small muted">${sub}</div>` : ''}</div></div>${inner}</section>`;
  }

  function customerBlock() {
    if (f.customer) {
      const c = f.customer;
      return `<div class="cust-pick"><span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">${esc(c.phone || 'Sin teléfono')}${c.idDoc ? ' · ' + esc(c.idDoc) : ''}${c.repairs ? ` · ${c.repairs} equipo(s) antes` : ''}</div></div><button type="button" class="btn btn-ghost btn-sm" id="in-cchange">${icon('rotate')} Cambiar</button></div>`;
    }
    return `<div class="search" style="position:relative">${icon('search')}<input id="in-csearch" placeholder="Buscar cliente por nombre, teléfono o cédula…" autocomplete="off"><div class="suggest" id="in-csug" hidden></div></div>
      <div class="section-title mt-lg">O registra un cliente nuevo</div>
      <div class="form-grid-3">
        <div class="field"><label>Nombre y apellido *</label><input class="input" id="in-cname" value="${esc(f.newCustomer.name)}" placeholder="Ej.: María González" autocomplete="off"></div>
        <div class="field"><label>Teléfono / WhatsApp</label><input class="input" id="in-cphone" value="${esc(f.newCustomer.phone)}" placeholder="0414-1234567" inputmode="tel"></div>
        <div class="field"><label>Cédula / RIF</label><input class="input" id="in-cid" value="${esc(f.newCustomer.idDoc)}" placeholder="V-12345678"></div>
      </div>`;
  }

  function render() {
    const d = f.device;
    const techs = store.activeTechs;
    const total = itemsTotal(f.items);
    const ml = models();
    root.innerHTML = `
      <div class="in-main">
        ${f.warrantyOf ? `<div class="pay-status ok" style="margin-bottom:12px"><span>${icon('shieldCheck')} Ingreso por garantía: sin costo salvo que se indique lo contrario.</span><span></span></div>` : ''}
        ${sec(1, 'Cliente', 'Busca un cliente o regístralo en segundos.', customerBlock(), 'in-s1')}
        ${sec(2, 'Equipo', '', `
          <div class="type-grid">${Object.entries(DEVICE_TYPES).map(([k, t]) => `<button type="button" class="type-btn ${d.type === k ? 'on' : ''}" data-type="${k}">${icon(t.icon)}<span>${t.label}</span></button>`).join('')}</div>
          <div class="section-title mt-lg">Marca</div>
          <div class="chips chips-wrap">${BRANDS.map((b) => `<button type="button" class="chip ${d.brand === b ? 'on' : ''}" data-brand="${esc(b)}">${esc(b)}</button>`).join('')}</div>
          <div class="form-grid mt-lg">
            <div class="field"><label>Modelo *</label><input class="input" id="in-model" list="in-models" value="${esc(d.model)}" placeholder="Ej.: Galaxy A54, Redmi Note 12, iPhone 11"><datalist id="in-models">${ml.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
            <div class="field"><label>Color</label><input class="input" id="in-color" value="${esc(d.color)}" placeholder="Ej.: Negro"></div>
            <div class="field"><label>IMEI / Serial</label><input class="input mono" id="in-imei" value="${esc(d.imei)}" placeholder="Marca *#06# para verlo" autocomplete="off"><span class="hint" id="in-imei-hint">${d.imei ? (imeiValid(d.imei) ? '<span class="text-success">✔ IMEI válido</span>' : /^\d{15}$/.test(d.imei.replace(/\D/g, '')) ? '<span class="text-warning">El IMEI no pasa la verificación</span>' : 'Serial / IMEI registrado') : 'En celulares, marca *#06# para ver el IMEI.'}</span></div>
            <div class="field"><label>Capacidad</label><input class="input" id="in-storage" value="${esc(d.storage)}" placeholder="Ej.: 128 GB · 6 GB RAM"></div>
          </div>
          <div class="section-title mt-lg">Desbloqueo del equipo</div>
          <div class="seg">${[['none', 'Sin bloqueo'], ['pin', 'PIN'], ['password', 'Contraseña'], ['pattern', 'Patrón']].map(([k, l]) => `<button type="button" data-unlock="${k}" class="${d.unlockType === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          ${d.unlockType === 'pin' || d.unlockType === 'password' ? `<div class="field mt" style="max-width:320px"><input class="input mono" id="in-unlock" value="${esc(d.unlockValue)}" placeholder="${d.unlockType === 'pin' ? 'PIN del equipo' : 'Contraseña del equipo'}" autocomplete="off"><span class="hint">Se guarda protegida: para verla luego se pide el PIN del taller.</span></div>` : ''}
          ${d.unlockType === 'pattern' ? `<div class="row row-wrap mt" style="align-items:flex-start;gap:16px"><div id="in-pad"></div><div class="stack-sm" style="max-width:260px"><span class="small muted">Dibuja el patrón tocando los puntos en orden (o arrastrando el dedo). El primer punto se marca más grande.</span><button type="button" class="btn btn-secondary btn-sm" id="in-padclear">${icon('rotate')} Borrar patrón</button></div></div>` : ''}
        `, 'in-s2')}
        ${sec(3, 'Falla reportada', 'Toca las fallas que indica el cliente y descríbelas.', `
          <div class="chips chips-wrap">${FAULT_TAGS.map((t) => `<button type="button" class="chip ${f.faultTags.includes(t) ? 'on' : ''}" data-fault="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="field mt-lg"><label>Descripción *</label><textarea class="textarea" id="in-fault" placeholder="Ej.: Se cayó y la pantalla no muestra imagen, pero vibra al recibir llamadas.">${esc(f.fault)}</textarea></div>
        `, 'in-s3')}
        ${sec(4, 'Revisión al recibir', 'Deja constancia de cómo llega el equipo. Toca cada prueba para marcarla.', `
          <div class="check-grid">${CHECKS.map(([k, l]) => { const v = f.checks[k]; return `<button type="button" class="chk ${v ? CHECK_STATES[v].cls : ''}" data-chk="${k}"><span>${esc(l)}</span><small>${v ? CHECK_STATES[v].label : 'Sin probar'}</small></button>`; }).join('')}</div>
          <div class="row row-wrap mt"><button type="button" class="btn btn-ghost btn-sm" id="in-allok">${icon('check')} Todo funciona</button><button type="button" class="btn btn-ghost btn-sm" id="in-nopower">${icon('power')} No enciende (no se pudo probar)</button></div>
          <div class="section-title mt-lg">Estado físico</div>
          <div class="chips chips-wrap">${CONDITION_TAGS.map((t) => `<button type="button" class="chip ${f.condition.includes(t) ? 'on' : ''}" data-cond="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="field mt"><input class="input" id="in-condnote" value="${esc(f.conditionNote)}" placeholder="Otras observaciones del estado físico (opcional)"></div>
          <div class="section-title mt-lg">Accesorios que deja el cliente</div>
          <div class="chips chips-wrap">${ACCESSORY_TAGS.map((t) => `<button type="button" class="chip ${f.accessories.includes(t) ? 'on' : ''}" data-acc="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="section-title mt-lg">Fotos del equipo</div>
          <div class="photo-grid">${f.photos.map((p, i) => `<div class="photo"><img src="${p}" alt=""><button type="button" class="btn btn-danger-soft btn-icon btn-sm" data-delph="${i}">${icon('trash')}</button></div>`).join('')}
            ${f.photos.length < MAX_PHOTOS ? `<label class="photo add">${icon('camera')}<span>Tomar foto</span><input type="file" accept="image/*" capture="environment" id="in-photo" hidden></label>` : ''}</div>
        `, 'in-s4')}
        ${sec(5, 'Presupuesto y entrega', 'Opcional: puedes dejarlo para después del diagnóstico.', `
          <div class="section-title">Servicios frecuentes</div>
          <div class="chips chips-wrap">${(store.settings.services || []).map((s, i) => `<button type="button" class="chip ${f.items.some((x) => x.svc === i) ? 'on' : ''}" data-svc="${i}">${esc(s.name)} <span class="count">${usd(s.price)}</span></button>`).join('')}</div>
          ${f.items.length ? `<div class="mini-items mt">${f.items.map((it, i) => `<div class="row"><span class="grow">${esc(it.name)}</span><input class="input input-sm r" style="width:100px" data-iprice="${i}" inputmode="decimal" value="${num(it.price)}"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-irm="${i}">${icon('x')}</button></div>`).join('')}</div>` : ''}
          <div class="form-grid mt-lg">
            <div class="field"><label>Técnico</label><select class="select" id="in-tech"><option value="">Sin asignar</option>${techs.map((t) => `<option value="${t.id}" ${t.id === f.technicianId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
            <div class="field"><label>Prioridad</label><div class="seg seg-block"><button type="button" data-prio="normal" class="${f.priority === 'normal' ? 'on' : ''}">Normal</button><button type="button" data-prio="urgente" class="${f.priority === 'urgente' ? 'on' : ''}">${icon('zap')} Urgente</button></div></div>
            <div class="field"><label>Entrega estimada</label><input class="input" type="date" id="in-date" value="${f.promisedAt}"><div class="row row-wrap" style="gap:6px">${[['Hoy', 0], ['Mañana', 1], ['2 días', 2], ['1 semana', 7]].map(([l, n]) => `<button type="button" class="btn btn-ghost btn-sm" data-days="${n}">${l}</button>`).join('')}</div></div>
            <div class="field"><label>Garantía (días)</label><input class="input" id="in-warranty" inputmode="numeric" value="${f.warrantyDays}"></div>
          </div>
          <label class="check box box-white mt"><span class="switch"><input type="checkbox" id="in-dep" ${f.deposit ? 'checked' : ''}><span></span></span><span><b>Cobrar un abono al recibir</b><br><small class="muted">Se abre la caja de cobro al guardar la orden (requiere caja abierta).</small></span></label>
        `, 'in-s5')}
      </div>
      <aside class="in-side">
        <div class="card in-summary">
          <div class="card-title">${icon('file')} Resumen</div>
          <div class="sum-line"><span>Cliente</span><b class="ellipsis">${esc(f.customer?.name || f.newCustomer.name || '—')}</b></div>
          <div class="sum-line"><span>Equipo</span><b class="ellipsis">${esc(d.model ? deviceName(d) : DEVICE_TYPES[d.type].label)}</b></div>
          <div class="sum-line"><span>Fallas</span><b class="ellipsis">${esc(f.faultTags.join(', ') || (f.fault ? 'Descrita' : '—'))}</b></div>
          <div class="sum-line"><span>Desbloqueo</span><b>${{ none: 'Sin bloqueo', pin: 'PIN', password: 'Contraseña', pattern: f.device.pattern.length ? `Patrón (${f.device.pattern.length} puntos)` : 'Patrón' }[d.unlockType]}</b></div>
          <div class="sum-line"><span>Fotos</span><b>${f.photos.length}</b></div>
          <div class="sum-total"><span>Presupuesto estimado</span><b>${usd(total)}</b><small class="text-bs">${bs(total * store.rate)}</small></div>
          <div class="error-msg" id="in-err"></div>
          <button type="button" class="btn btn-primary btn-lg btn-block" id="in-save">${icon('check')} Registrar orden</button>
          <div class="hint center">Se genera el número de orden y un código QR para que el cliente consulte el estado.</div>
        </div>
      </aside>
      <div class="in-fab"><button type="button" class="btn btn-primary btn-lg btn-block" id="in-save-m">${icon('check')} Registrar orden · ${usd(total)}</button></div>`;
    bind();
  }

  function softRender() {
    // Conserva la posición del scroll al re-dibujar
    const y = window.scrollY; const main = document.querySelector('.main');
    render(); window.scrollTo(0, y); if (main) main.scrollTop = main.scrollTop;
  }

  function bind() {
    const q = (s) => root.querySelector(s);
    const qa = (s) => root.querySelectorAll(s);
    const toggle = (arr, v) => { const i = arr.indexOf(v); if (i >= 0) arr.splice(i, 1); else arr.push(v); };

    // Cliente
    if (!f.customer) {
      const inp = q('#in-csearch'); const sug = q('#in-csug');
      inp.oninput = debounce(() => {
        const t = normalize(inp.value);
        if (!t) { sug.hidden = true; return; }
        const list = store.customers.filter((c) => normalize(`${c.name} ${c.phone} ${c.idDoc}`).includes(t) || String(c.phone || '').replace(/\D/g, '').includes(t.replace(/\D/g, '') || '§')).slice(0, 8);
        sug.hidden = false;
        sug.innerHTML = list.length ? list.map((c) => `<button type="button" data-cid="${c.id}"><span class="avatar" style="width:30px;height:30px;font-size:11px;background:${colorFor(c.name)}">${esc(initials(c.name))}</span><span class="grow"><b>${esc(c.name)}</b><small>${esc(c.phone || '')}${c.idDoc ? ' · ' + esc(c.idDoc) : ''}</small></span><small>${c.repairs || 0} equipo(s)</small></button>`).join('') : `<div class="small muted" style="padding:10px">No existe. Regístralo abajo.</div>`;
        sug.querySelectorAll('[data-cid]').forEach((b) => b.onmousedown = (e) => { e.preventDefault(); f.customer = store.customer(b.dataset.cid); softRender(); });
      }, 120);
      inp.onblur = () => setTimeout(() => { sug.hidden = true; }, 150);
      for (const [id, k] of [['#in-cname', 'name'], ['#in-cphone', 'phone'], ['#in-cid', 'idDoc']]) q(id).oninput = (e) => { f.newCustomer[k] = e.target.value; if (k === 'name') updateSummary(); };
    } else q('#in-cchange').onclick = () => { f.customer = null; softRender(); setTimeout(() => q('#in-csearch')?.focus(), 30); };

    // Equipo
    qa('[data-type]').forEach((b) => b.onclick = () => { f.device.type = b.dataset.type; softRender(); });
    qa('[data-brand]').forEach((b) => b.onclick = () => { f.device.brand = f.device.brand === b.dataset.brand ? '' : b.dataset.brand; softRender(); q('#in-model')?.focus(); });
    for (const [id, k] of [['#in-model', 'model'], ['#in-color', 'color'], ['#in-storage', 'storage']]) q(id).oninput = (e) => { f.device[k] = e.target.value; updateSummary(); };
    q('#in-imei').oninput = (e) => {
      f.device.imei = e.target.value.trim();
      const v = f.device.imei;
      q('#in-imei-hint').innerHTML = !v ? 'En celulares, marca *#06# para ver el IMEI.' : imeiValid(v) ? '<span class="text-success">✔ IMEI válido</span>' : /^\d{15}$/.test(v.replace(/\D/g, '')) ? '<span class="text-warning">El IMEI no pasa la verificación</span>' : 'Serial / IMEI registrado';
    };
    qa('[data-unlock]').forEach((b) => b.onclick = () => { f.device.unlockType = b.dataset.unlock; softRender(); });
    if (q('#in-unlock')) q('#in-unlock').oninput = (e) => { f.device.unlockValue = e.target.value; };
    if (q('#in-pad')) {
      pad = mountPatternPad(q('#in-pad'), f.device.pattern, (s) => { f.device.pattern = s; updateSummary(); });
      q('#in-padclear').onclick = () => pad.clear();
    }

    // Falla
    qa('[data-fault]').forEach((b) => b.onclick = () => { toggle(f.faultTags, b.dataset.fault); b.classList.toggle('on'); updateSummary(); });
    q('#in-fault').oninput = (e) => { f.fault = e.target.value; updateSummary(); };

    // Revisión
    const cycle = { undefined: 'ok', ok: 'falla', falla: 'na', na: undefined };
    qa('[data-chk]').forEach((b) => b.onclick = () => {
      const k = b.dataset.chk; const v = cycle[f.checks[k]];
      if (v) f.checks[k] = v; else delete f.checks[k];
      b.className = 'chk ' + (v ? CHECK_STATES[v].cls : '');
      b.querySelector('small').textContent = v ? CHECK_STATES[v].label : 'Sin probar';
    });
    q('#in-allok').onclick = () => { CHECKS.forEach(([k]) => { f.checks[k] = 'ok'; }); softRender(); };
    q('#in-nopower').onclick = () => { CHECKS.forEach(([k]) => { f.checks[k] = 'na'; }); f.checks.enciende = 'falla'; if (!f.faultTags.includes('No enciende')) f.faultTags.push('No enciende'); softRender(); };
    qa('[data-cond]').forEach((b) => b.onclick = () => { toggle(f.condition, b.dataset.cond); b.classList.toggle('on'); });
    q('#in-condnote').oninput = (e) => { f.conditionNote = e.target.value; };
    qa('[data-acc]').forEach((b) => b.onclick = () => { toggle(f.accessories, b.dataset.acc); b.classList.toggle('on'); });
    if (q('#in-photo')) q('#in-photo').onchange = async (e) => {
      const file = e.target.files?.[0]; if (!file) return;
      try { f.photos.push(await compressImage(file, 900, 0.62)); softRender(); } catch (_) { toast('No se pudo leer la imagen', 'danger'); }
    };
    qa('[data-delph]').forEach((b) => b.onclick = () => { f.photos.splice(+b.dataset.delph, 1); softRender(); });

    // Presupuesto y entrega
    qa('[data-svc]').forEach((b) => b.onclick = () => {
      const i = +b.dataset.svc; const ex = f.items.findIndex((x) => x.svc === i);
      if (ex >= 0) f.items.splice(ex, 1);
      else { const s = store.settings.services[i]; f.items.push({ id: shortId(6), svc: i, kind: 'servicio', name: s.name, qty: 1, price: s.price, cost: 0 }); }
      softRender();
    });
    qa('[data-iprice]').forEach((inp) => inp.oninput = () => { f.items[+inp.dataset.iprice].price = parseNum(inp.value); updateSummary(); });
    qa('[data-irm]').forEach((b) => b.onclick = () => { f.items.splice(+b.dataset.irm, 1); softRender(); });
    q('#in-tech').onchange = (e) => { f.technicianId = e.target.value; };
    qa('[data-prio]').forEach((b) => b.onclick = () => { f.priority = b.dataset.prio; qa('[data-prio]').forEach((x) => x.classList.toggle('on', x === b)); });
    q('#in-date').onchange = (e) => { f.promisedAt = e.target.value; };
    qa('[data-days]').forEach((b) => b.onclick = () => { f.promisedAt = dayKey(addDays(new Date(), +b.dataset.days)); q('#in-date').value = f.promisedAt; });
    q('#in-warranty').oninput = (e) => { f.warrantyDays = Math.max(0, Math.round(parseNum(e.target.value))); };
    q('#in-dep').onchange = (e) => { f.deposit = e.target.checked; };
    q('#in-save').onclick = save;
    q('#in-save-m').onclick = save;
  }

  function updateSummary() {
    const s = root.querySelector('.in-summary');
    if (!s) return;
    const d = f.device;
    const lines = s.querySelectorAll('.sum-line b');
    lines[0].textContent = f.customer?.name || f.newCustomer.name || '—';
    lines[1].textContent = d.model ? deviceName(d) : DEVICE_TYPES[d.type].label;
    lines[2].textContent = f.faultTags.join(', ') || (f.fault ? 'Descrita' : '—');
    lines[3].textContent = { none: 'Sin bloqueo', pin: 'PIN', password: 'Contraseña', pattern: d.pattern.length ? `Patrón (${d.pattern.length} puntos)` : 'Patrón' }[d.unlockType];
    const t = itemsTotal(f.items);
    s.querySelector('.sum-total b').textContent = usd(t);
    s.querySelector('.sum-total small').textContent = bs(t * store.rate);
    const mb = root.querySelector('#in-save-m'); if (mb) mb.innerHTML = `${icon('check')} Registrar orden · ${usd(t)}`;
  }

  function validate() {
    const err = (msg, secId) => { root.querySelector('#in-err').textContent = msg; toast(msg, 'warning'); root.querySelector('#' + secId)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return false; };
    if (!f.customer && f.newCustomer.name.trim().length < 2) return err('Indica el cliente: búscalo o escribe su nombre.', 'in-s1');
    if (!f.device.model.trim() && !f.device.brand) return err('Indica la marca o el modelo del equipo.', 'in-s2');
    if (f.device.unlockType === 'pattern' && f.device.pattern.length < 3) return err('Dibuja el patrón de desbloqueo (mínimo 3 puntos) o elige otra opción.', 'in-s2');
    if (!f.fault.trim() && !f.faultTags.length) return err('Describe la falla reportada por el cliente.', 'in-s3');
    root.querySelector('#in-err').textContent = '';
    return true;
  }

  async function save(e) {
    if (!validate()) return;
    const btn = e.currentTarget;
    const customer = f.customer || { name: f.newCustomer.name.trim(), phone: f.newCustomer.phone.trim(), idDoc: f.newCustomer.idDoc.trim().toUpperCase() };
    const device = { ...f.device, model: f.device.model.trim(), color: f.device.color.trim(), imei: f.device.imei.trim() };
    if (device.unlockType !== 'pattern') device.pattern = [];
    if (device.unlockType === 'none' || device.unlockType === 'pattern') device.unlockValue = '';
    const data = {
      customer, device, faultTags: f.faultTags, fault: f.fault.trim() || f.faultTags.join(', '), checks: f.checks, condition: f.condition, conditionNote: f.conditionNote.trim(),
      accessories: f.accessories, photos: f.photos, items: f.items, technicianId: f.technicianId || null, priority: f.priority,
      promisedAt: f.promisedAt ? new Date(fromKey(f.promisedAt).setHours(18, 0, 0)).toISOString() : null, warrantyDays: f.warrantyDays, warrantyOf: f.warrantyOf
    };
    const finish = (out) => {
      notifyLowStock(out.low);
      if (out.receipt) printReceipt(out.receipt);
      done(out.repair);
      Object.assign(f, blankForm());
      render();
      window.scrollTo(0, 0);
    };
    if (f.deposit) {
      const est = itemsTotal(f.items);
      await openPay({
        title: 'Abono al recibir', sub: esc(customer.name), amount: est > 0 ? round2(est / 2) : 0, editable: true, max: est > 0 ? est : undefined,
        confirmText: 'Registrar orden y abono', printLabel: 'Imprimir recibo de abono',
        onConfirm: async (res) => { const out = await createRepair(data, { amount: res.amount, payments: res.payments, changeCurrency: res.changeCurrency }); if (!res.print) out.receipt = null; finish(out); return out; }
      });
      return;
    }
    setBusy(btn, true, 'Guardando…');
    try { finish(await createRepair(data)); }
    catch (ex) { toast(ex.message || String(ex), 'danger'); setBusy(btn, false); }
  }

  function done(r) {
    const m = openModal({
      size: 'md',
      body: `<div class="center stack" style="padding:14px 0 2px;align-items:center">
        <div class="kpi-icon tone-success" style="width:64px;height:64px;border-radius:20px">${icon('check')}</div>
        <div class="muted small">Orden de servicio registrada</div>
        <div style="font-size:42px;font-weight:800;letter-spacing:-.03em;line-height:1">${esc(r.number)}</div>
        <div><b>${esc(deviceName(r.device))}</b> · ${esc(r.customerName)}</div>
        <div class="track-box" style="max-width:340px;width:100%"><div class="grow"><div class="small muted">Código de seguimiento</div><b class="mono" style="font-size:20px;letter-spacing:.15em">${esc(r.trackCode)}</b></div>${icon('qr')}</div>
      </div>
      <div class="done-actions">
        <button class="btn btn-secondary" data-a="carta">${icon('print')} Orden (carta)</button>
        <button class="btn btn-secondary" data-a="80mm">${icon('receipt')} Ticket</button>
        <button class="btn btn-secondary" data-a="label">${icon('tag2')} Etiqueta</button>
        <button class="btn btn-whatsapp" data-a="wa">${icon('whatsapp')} Enviar al cliente</button>
      </div>`,
      footer: `<button class="btn btn-secondary" data-a="open">${icon('eye')} Ver orden</button><button class="btn btn-primary" data-close>${icon('plus')} Recibir otro equipo</button>`
    });
    m.el.querySelectorAll('[data-a]').forEach((b) => b.onclick = async () => {
      const a = b.dataset.a;
      if (a === 'carta' || a === '80mm') printRepairOrder(r, a);
      if (a === 'label') printLabel(r);
      if (a === 'wa') waCustomer(r, 'recibido');
      if (a === 'open') { m.close(); (await import('../repair.js')).openRepair(r.id); }
    });
  }

  el.querySelector('#in-reset').onclick = () => { Object.assign(f, blankForm()); render(); };
  if (params.customerId && store.customer(params.customerId)) f.customer = store.customer(params.customerId);
  render();
  if (params.warrantyOf) preloadWarranty(params.warrantyOf);
  return null;
}
