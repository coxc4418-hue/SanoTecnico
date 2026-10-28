// Sano-Técnico — Configuración
import { store, updateTenant, DEFAULT_TERMS } from '../store.js';
import { requirePin, changePassword, authErrorMessage, session } from '../auth.js';
import { esc, num, toast, parseNum, setBusy, toggleTheme, download, nowISO, round2 } from '../utils.js';
import { icon } from '../icons.js';
import { openRateModal, salesWa, SALES_PHONE_FMT } from '../shared.js';
import { isStandalone, bindInstallButtons } from '../install.js';

const SECTIONS = { negocio: 'Negocio', taller: 'Taller y servicios', documentos: 'Documentos', seguridad: 'Seguridad', apps: 'Instalar y respaldo' };

export function mount(el) {
  let sec = 'negocio';
  el.innerHTML = `
    <div class="view-header"><div><h1 class="view-title">Configuración</h1><p class="view-sub">Personaliza Sano-Técnico para tu taller.</p></div></div>
    <div class="tabs">${Object.entries(SECTIONS).map(([k, v]) => `<button data-s="${k}">${v}</button>`).join('')}</div>
    <div id="s-body" style="max-width:900px"></div>`;
  const $ = (q) => el.querySelector(q);
  const s = () => store.settings;

  function render() {
    el.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === sec));
    const body = $('#s-body');
    if (sec === 'negocio') {
      body.innerHTML = `<form class="card stack" id="f-biz">
        <div class="form-grid">
          <div class="field full"><label>Nombre del taller</label><input class="input" name="businessName" value="${esc(s().businessName || store.tenant?.name || '')}" placeholder="Ej.: TecnoFix Celulares"></div>
          <div class="field"><label>RIF</label><input class="input" name="rif" value="${esc(s().rif)}" placeholder="J-12345678-9"></div>
          <div class="field"><label>Teléfono</label><input class="input" name="phone" value="${esc(s().phone)}" placeholder="0414-1234567"></div>
          <div class="field"><label>WhatsApp del taller</label><input class="input" name="whatsapp" value="${esc(s().whatsapp || '')}" placeholder="0414-1234567"><span class="hint">Aparece en la consulta en línea para que el cliente te escriba.</span></div>
          <div class="field"><label>Instagram</label><input class="input" name="instagram" value="${esc(s().instagram)}" placeholder="@tutaller"></div>
          <div class="field full"><label>Dirección</label><input class="input" name="address" value="${esc(s().address)}"></div>
        </div>
        <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar</button></div>
      </form>
      <div class="card mt-lg between row-wrap"><div><div class="bold">Tasa del día: Bs ${num(store.rate)} por $1</div><div class="small muted">${s().rateAuto !== false ? 'Se actualiza automáticamente con la tasa oficial BCV cada día.' : 'Tasa manual.'}</div></div><button class="btn btn-secondary" id="s-rate">${icon('refresh')} Cambiar tasa</button></div>
      <div class="card mt-lg between row-wrap"><div><div class="bold">Tema de la aplicación</div><div class="small muted">Claro u oscuro, según tu preferencia.</div></div><button class="btn btn-secondary" id="s-theme">${icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon')} Cambiar tema</button></div>`;
      $('#f-biz').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        const patch = {}; for (const k of ['businessName', 'rif', 'phone', 'whatsapp', 'address', 'instagram']) patch[k] = F[k].value.trim();
        await store.saveSettings(patch);
        if (patch.businessName && patch.businessName !== store.tenant?.name && !store.isDemo) updateTenant(store.tenantId, { name: patch.businessName, updatedAt: nowISO() }).catch(() => {});
        toast('Datos del taller guardados');
      };
      $('#s-rate').onclick = openRateModal;
      $('#s-theme').onclick = (e) => { const n = toggleTheme(); e.currentTarget.innerHTML = `${icon(n === 'dark' ? 'sun' : 'moon')} Cambiar tema`; };
    }
    if (sec === 'taller') {
      const svcs = s().services || [];
      body.innerHTML = `<div class="stack">
        <div class="card stack"><div class="card-title">${icon('wrench')} Servicios y precios de referencia</div><p class="small muted" style="margin:0">Aparecen como botones al recibir un equipo y en el presupuesto. El precio se puede ajustar en cada orden.</p>
          <div class="stack-sm" id="svc-list">${svcs.map((x, i) => `<div class="row"><input class="input" data-sn="${i}" value="${esc(x.name)}"><div class="input-group" style="width:130px;flex:none"><span class="prefix">$</span><input class="input" data-sp="${i}" inputmode="decimal" value="${num(x.price)}"></div><button class="btn btn-ghost btn-icon" data-srm="${i}" aria-label="Quitar">${icon('trash')}</button></div>`).join('')}</div>
          <div class="row row-wrap"><button class="btn btn-secondary" id="svc-add">${icon('plus')} Agregar servicio</button><span class="grow"></span><button class="btn btn-primary" id="svc-save">${icon('check')} Guardar servicios</button></div></div>
        <form class="card stack" id="f-shop"><div class="card-title">${icon('shieldCheck')} Garantía</div>
          <div class="form-grid"><div class="field"><label>Días de garantía por defecto</label><input class="input" name="warrantyDays" inputmode="numeric" value="${s().warrantyDays ?? 30}"><span class="hint">Se puede cambiar en cada orden. 0 = sin garantía.</span></div></div>
          <div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar</button></div></form>
        ${listEditor('categories', 'Categorías de inventario', 'Ej.: Pantallas', s().categories || [])}
      </div>`;
      const read = () => svcs.map((x, i) => ({ name: body.querySelector(`[data-sn="${i}"]`).value.trim(), price: round2(parseNum(body.querySelector(`[data-sp="${i}"]`).value)) }));
      body.querySelectorAll('[data-srm]').forEach((b) => b.onclick = () => { const l = read(); l.splice(+b.dataset.srm, 1); store.settings.services = l; render(); });
      $('#svc-add').onclick = () => { store.settings.services = [...read(), { name: 'Nuevo servicio', price: 0 }]; render(); const ins = body.querySelectorAll('[data-sn]'); ins[ins.length - 1].select(); };
      $('#svc-save').onclick = async () => { const l = read().filter((x) => x.name); await store.saveSettings({ services: l }); toast('Servicios guardados'); render(); };
      $('#f-shop').onsubmit = async (e) => { e.preventDefault(); await store.saveSettings({ warrantyDays: Math.max(0, Math.round(parseNum(e.target.elements.warrantyDays.value))) }); toast('Garantía guardada'); };
      bindList('categories');
    }
    if (sec === 'documentos') {
      body.innerHTML = `<form class="card stack" id="f-docs">
        <div class="form-grid">
          <div class="field"><label>Título de la factura / nota</label><input class="input" name="docTitle" value="${esc(s().docTitle || 'NOTA DE ENTREGA')}"><span class="hint">Ej.: NOTA DE ENTREGA, RECIBO, FACTURA.</span></div>
          <div class="field"><label>Formato del ticket de cobro</label><select class="select" name="receiptFormat">${[['80mm', 'Ticket 80 mm'], ['58mm', 'Ticket 58 mm'], ['carta', 'Hoja carta']].map(([v, l]) => `<option value="${v}" ${s().receiptFormat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Formato de la orden de servicio</label><select class="select" name="orderFormat">${[['carta', 'Hoja carta (con firmas)'], ['80mm', 'Ticket 80 mm']].map(([v, l]) => `<option value="${v}" ${s().orderFormat === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>IVA incluido en los precios (%)</label><input class="input" name="iva" inputmode="decimal" value="${num(s().iva || 0, 0)}"><span class="hint">Solo se muestra desglosado. 0 para no mostrarlo.</span></div>
          <div class="field full"><label>Mensaje al pie</label><input class="input" name="receiptFooter" value="${esc(s().receiptFooter)}"></div>
          <div class="field full"><label>Términos y condiciones de la orden de servicio</label><textarea class="textarea" name="terms" style="min-height:140px">${esc(s().terms || DEFAULT_TERMS)}</textarea><span class="hint">Se imprimen en cada orden, junto a la firma del cliente.</span></div>
        </div>
        <div class="row row-wrap" style="justify-content:flex-end"><button type="button" class="btn btn-ghost" id="d-reset">Restaurar términos sugeridos</button><button class="btn btn-primary">${icon('check')} Guardar</button></div>
      </form>`;
      $('#d-reset').onclick = () => { $('#f-docs').elements.terms.value = DEFAULT_TERMS; };
      $('#f-docs').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        await store.saveSettings({ docTitle: F.docTitle.value.trim().toUpperCase() || 'NOTA DE ENTREGA', receiptFormat: F.receiptFormat.value, orderFormat: F.orderFormat.value, iva: parseNum(F.iva.value), receiptFooter: F.receiptFooter.value.trim(), terms: F.terms.value.trim() });
        toast('Documentos guardados');
      };
    }
    if (sec === 'seguridad') {
      body.innerHTML = `<div class="grid-2">
        <form class="card stack" id="f-pin"><div class="card-title">${icon('lock')} PIN de administrador</div><p class="small muted" style="margin:0">Protege reportes, anulaciones, cancelaciones, mermas, gastos, cierre de caja, técnicos y la clave de los equipos.</p>
          <div class="field"><label>Nuevo PIN (4 a 12 dígitos)</label><input class="input" name="pin" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <div class="field"><label>Repetir PIN</label><input class="input" name="pin2" type="password" inputmode="numeric" maxlength="12" autocomplete="new-password"></div>
          <button class="btn btn-primary">${icon('check')} Cambiar PIN</button></form>
        ${session.user?.isAnonymous ? `<div class="card stack"><div class="card-title">${icon('shield')} Contraseña</div><p class="muted" style="margin:0">En la demo no hay contraseña. Contrata Sano-Técnico para tener tu propia cuenta.</p><a class="btn btn-whatsapp" href="${salesWa()}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>`
          : `<form class="card stack" id="f-pass"><div class="card-title">${icon('shield')} Contraseña de acceso</div>
          <div class="field"><label>Contraseña actual</label><input class="input" name="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label>Nueva contraseña (mínimo 8)</label><input class="input" name="next" type="password" autocomplete="new-password"></div>
          <div class="error-msg" data-err></div>
          <button class="btn btn-primary">${icon('check')} Cambiar contraseña</button></form>`}
      </div>`;
      $('#f-pin').onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements;
        if (store.isDemo) { toast('En la demo el PIN siempre es 1234.', 'info'); return; }
        if (!/^\d{4,12}$/.test(F.pin.value)) { toast('El PIN debe tener de 4 a 12 dígitos', 'warning'); return; }
        if (F.pin.value !== F.pin2.value) { toast('Los PIN no coinciden', 'warning'); return; }
        if (store.hasPin() && !(await requirePin('Cambiar el PIN'))) return;
        await store.setPin(F.pin.value); e.target.reset(); toast('PIN actualizado');
      };
      const fp = $('#f-pass');
      if (fp) fp.onsubmit = async (e) => {
        e.preventDefault(); const F = e.target.elements; const err = fp.querySelector('[data-err]'); err.textContent = '';
        if (F.next.value.length < 8) { err.textContent = 'La nueva contraseña debe tener al menos 8 caracteres.'; return; }
        const btn = fp.querySelector('button'); setBusy(btn, true);
        try { await changePassword(F.cur.value, F.next.value); e.target.reset(); toast('Contraseña actualizada'); }
        catch (ex) { err.textContent = authErrorMessage(ex); }
        setBusy(btn, false);
      };
    }
    if (sec === 'apps') {
      body.innerHTML = `<div class="grid-2">
        <div class="card stack"><div class="card-title">${icon('install')} Instalar la app</div>
          <p class="small muted" style="margin:0">Instala Sano-Técnico desde el navegador en cada teléfono, tablet o computadora del taller. Es el mismo sistema, conectado en tiempo real, con su propio ícono y ventana.</p>
          ${isStandalone() ? `<div class="pay-status ok"><span>${icon('check')} Estás usando la app instalada</span><span></span></div>` : `<button class="btn btn-primary btn-lg" data-install>${icon('install')} Instalar en este equipo</button>`}
          <div class="list">
            <div class="list-item"><span class="kpi-icon tone-success" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>Android</b><div class="t-sub">Chrome › menú ⋮ › Instalar app</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-info" style="width:34px;height:34px">${icon('laptop')}</span><div class="grow"><b>Computadora</b><div class="t-sub">Chrome o Edge › ícono de instalar en la barra de direcciones</div></div></div>
            <div class="list-item"><span class="kpi-icon tone-violet" style="width:34px;height:34px">${icon('phone')}</span><div class="grow"><b>iPhone / iPad</b><div class="t-sub">Safari › Compartir › Agregar a inicio</div></div></div>
          </div></div>
        <div class="card stack"><div class="card-title">${icon('download')} Respaldo de datos</div>
          <p class="small muted" style="margin:0">Descarga una copia de tus órdenes abiertas, inventario, clientes y configuración.</p>
          <button class="btn btn-secondary" id="s-backup">${icon('download')} Descargar respaldo</button>
          <div class="divider"></div>
          <div class="card-title">${icon('whatsapp')} Soporte</div>
          <p class="small muted" style="margin:0">¿Dudas o sugerencias? Escríbenos.</p>
          <a class="btn btn-whatsapp" href="${salesWa('Hola, necesito soporte con Sano-Técnico.')}" target="_blank" rel="noopener">${icon('whatsapp')} ${SALES_PHONE_FMT}</a></div>
      </div>`;
      bindInstallButtons(body);
      $('#s-backup').onclick = () => {
        const data = { app: 'Sano-Técnico', exportedAt: nowISO(), business: store.businessName, settings: store.settings, repairs: store.repairs.map(({ photos, ...r }) => r), products: store.products, customers: store.customers };
        download(`respaldo-${(store.businessName || 'sano').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2), 'application/json');
        toast('Respaldo descargado');
      };
    }
  }

  function listEditor(key, title, ph, items) {
    return `<div class="card stack" data-list="${key}"><div class="card-title">${title}</div>
      <div class="tagrow" data-items>${items.map((v, i) => `<span class="tag">${esc(v)} <button class="tag-x" data-rm="${i}" aria-label="Quitar">${icon('x')}</button></span>`).join('') || '<span class="small faint">Vacío</span>'}</div>
      <div class="row"><input class="input" data-new placeholder="${esc(ph)}"><button class="btn btn-secondary" data-add aria-label="Agregar">${icon('plus')}</button></div></div>`;
  }
  function bindList(key) {
    const box = el.querySelector(`[data-list="${key}"]`);
    const cur = () => [...(s()[key] || [])];
    const save = async (list) => { await store.saveSettings({ [key]: list }); render(); };
    box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { const list = cur(); list.splice(+b.dataset.rm, 1); save(list); });
    const add = () => { const v = box.querySelector('[data-new]').value.trim(); if (!v) return; if (cur().includes(v)) { toast('Ya existe', 'warning'); return; } save([...cur(), v]); };
    box.querySelector('[data-add]').onclick = add;
    box.querySelector('[data-new]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } };
  }

  el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { sec = b.dataset.s; render(); });
  render();
  return store.on('rate', () => { if (sec === 'negocio') render(); });
}
