// Sano-Técnico — Ficha de una orden de servicio
import { store, STATUS, FLOW, DEVICE_TYPES, statusBadge, isOpenStatus } from './store.js';
import { setRepairStatus, updateRepair, saveRepairItems, registerDeposit, deliverRepair, cancelRepair, deviceName, repairBalance, itemsTotal, trackUrl } from './ops.js';
import { requirePin } from './auth.js';
import { openModal, esc, usd, bs, num, toast, fmtDateTime, fmtDate, setBusy, parseNum, confirmDialog, emptyState, shortId, compressImage, qtyFmt, normalize, dayKey, fromKey, methodLabel, round2 } from './utils.js';
import { icon } from './icons.js';
import { patternSVG, waCustomer, printRepairOrder, printLabel, printReceipt, checksChips, notifyLowStock, customerMessage } from './shared.js';
import { openPay, showPaid } from './pay.js';

const MAX_PHOTOS = 4;

/** Abre la ficha de la orden (por id o por objeto) */
export async function openRepair(idOrRepair, { tab = 'resumen' } = {}) {
  let r = typeof idOrRepair === 'string' ? await store.getRepair(idOrRepair) : idOrRepair;
  if (!r) { toast('No se encontró la orden.', 'warning'); return; }
  let current = tab;
  let receipts = null;
  let draft = null; // presupuesto en edición

  const m = openModal({ title: '', size: 'xl', body: '<div data-root></div>' });
  m.el.querySelector('.modal').classList.add('repair-modal');
  const rootEl = m.el.querySelector('[data-root]');
  const off = store.on('repairs', () => {
    const fresh = store.repair(r.id);
    if (fresh && fresh.updatedAt !== r.updatedAt) { r = fresh; if (current !== 'presupuesto' || !draft) render(); }
  });
  const prevClose = m.close;
  m.close = () => { off(); prevClose(); };

  async function loadReceipts() {
    try { receipts = (await store.listEq('sales', 'repairId', r.id)).sort((a, b) => (b.date || '').localeCompare(a.date || '')); } catch (_) { receipts = []; }
    if (current === 'pagos') render();
  }

  function header() {
    const dev = r.device || {};
    const open = isOpenStatus(r.status);
    const bal = repairBalance(r);
    return `<div class="rp-head">
      <div class="rp-dev"><span class="rp-icon">${icon(DEVICE_TYPES[dev.type]?.icon || 'phone')}</span>
        <div class="grow" style="min-width:0">
          <div class="row row-wrap" style="gap:6px"><span class="rp-num">${esc(r.number)}</span>${statusBadge(r.status)}${r.priority === 'urgente' ? `<span class="badge badge-danger">${icon('zap')} Urgente</span>` : ''}${r.isWarranty ? `<span class="badge badge-violet">${icon('shieldCheck')} Garantía</span>` : ''}</div>
          <div class="rp-title ellipsis">${esc(deviceName(dev))}${dev.color ? ` <span class="muted">· ${esc(dev.color)}</span>` : ''}</div>
          <div class="small muted ellipsis">${icon('user')} ${esc(r.customerName)}${r.customerPhone ? ' · ' + esc(r.customerPhone) : ''} · Recibido ${fmtDateTime(r.createdAt)}</div>
        </div>
        <button class="x-btn" data-x aria-label="Cerrar">${icon('x')}</button>
      </div>
      <div class="rp-money">
        <div><span>Total</span><b>${usd((r.total || 0) - (r.discount || 0))}</b></div>
        <div><span>Abonado</span><b class="text-success">${usd(r.paid || 0)}</b></div>
        <div><span>Saldo</span><b class="${bal > 0 ? 'text-danger' : ''}">${usd(bal)}</b><small class="text-bs">${bs(bal * store.rate)}</small></div>
        <div><span>Técnico</span><b class="ellipsis">${esc(r.technician || 'Sin asignar')}</b></div>
        <div><span>${r.deliveredAt ? 'Entregado' : 'Entrega estimada'}</span><b class="${!r.deliveredAt && r.promisedAt && new Date(r.promisedAt) < new Date() && open ? 'text-danger' : ''}">${r.deliveredAt ? fmtDate(r.deliveredAt) : r.promisedAt ? fmtDate(r.promisedAt) : '—'}</b></div>
      </div>
      ${open ? `<div class="rp-steps">${FLOW.map((s, i) => { const idx = FLOW.indexOf(r.status); const st = STATUS[s]; return `<button class="rp-step ${s === r.status ? 'on' : idx > i && r.status !== 'no_reparado' ? 'done' : ''}" data-st="${s}" title="${esc(st.desc)}"><i>${icon(st.icon)}</i><span>${st.short}</span></button>`; }).join('')}<button class="rp-step bad ${r.status === 'no_reparado' ? 'on' : ''}" data-st="no_reparado" title="No se pudo reparar"><i>${icon('x')}</i><span>Sin reparar</span></button></div>` : ''}
      <div class="tabs rp-tabs">${[['resumen', 'Resumen'], ['presupuesto', 'Presupuesto'], ['pagos', 'Pagos'], ['fotos', `Fotos${r.photos?.length ? ` (${r.photos.length})` : ''}`], ['historial', 'Historial']].map(([k, l]) => `<button data-tab="${k}" class="${k === current ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div>`;
  }

  function footer() {
    const open = isOpenStatus(r.status);
    return `<div class="rp-foot">
      <div class="row row-wrap">
        <button class="btn btn-whatsapp" data-wa>${icon('whatsapp')} Avisar</button>
        <button class="btn btn-secondary" data-print>${icon('print')} Imprimir</button>
        <button class="btn btn-secondary btn-icon" data-copy title="Copiar enlace de seguimiento">${icon('link')}</button>
      </div>
      <div class="row row-wrap">
        ${open ? `<button class="btn btn-ghost" data-cancel>${icon('x')} Cancelar orden</button>
          ${repairBalance(r) > 0 ? `<button class="btn btn-secondary" data-dep>${icon('dollar')} Abono</button>` : ''}
          <button class="btn btn-primary" data-deliver>${icon('handshake')} Entregar</button>`
        : `${r.invoiceId ? `<button class="btn btn-secondary" data-inv>${icon('file')} Factura ${esc(r.invoiceNumber || '')}</button>` : ''}
           ${r.warrantyUntil && new Date(r.warrantyUntil) >= new Date() ? `<button class="btn btn-primary" data-warranty>${icon('shieldCheck')} Ingresar por garantía</button>` : ''}`}
      </div>
    </div>`;
  }

  // ---------- Pestañas ----------
  function tabResumen() {
    const dev = r.device || {};
    const open = isOpenStatus(r.status);
    const unlock = dev.unlockType === 'pattern' ? `<div class="row" style="align-items:flex-start;gap:12px"><div class="pattern-mini">${patternSVG(dev.pattern || [], 92)}</div><span class="small muted">Patrón de desbloqueo<br>(el punto grande es el inicio)</span></div>`
      : dev.unlockType === 'pin' || dev.unlockType === 'password' ? `<div class="row"><span class="mono secret" data-secret>••••••</span><button class="btn btn-ghost btn-sm" data-reveal>${icon('eye')} Ver</button><span class="small muted">${dev.unlockType === 'pin' ? 'PIN' : 'Contraseña'}</span></div>` : '<span class="muted">Sin bloqueo</span>';
    const techs = store.activeTechs;
    return `<div class="rp-grid">
      <div class="stack">
        <div class="card"><div class="card-title">${icon('phone')} Equipo</div>
          <div class="kv mt">
            <div><span>Tipo</span><b>${esc(DEVICE_TYPES[dev.type]?.label || '—')}</b></div>
            <div><span>Marca y modelo</span><b>${esc(deviceName(dev))}</b></div>
            <div><span>Color</span><b>${esc(dev.color || '—')}</b></div>
            <div><span>IMEI / Serial</span><b class="mono">${esc(dev.imei || '—')}</b></div>
            ${dev.storage ? `<div><span>Capacidad</span><b>${esc(dev.storage)}</b></div>` : ''}
          </div>
          <div class="section-title mt-lg">Desbloqueo</div>${unlock}
        </div>
        <div class="card"><div class="card-title">${icon('alert')} Falla reportada</div>
          ${r.faultTags?.length ? `<div class="tagrow mt">${r.faultTags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          <p style="margin:8px 0 0">${esc(r.fault || '—')}</p>
          <div class="section-title mt-lg">Estado físico</div>
          <div class="tagrow">${(r.condition || []).map((t) => `<span class="tag ${t === 'Buen estado' ? '' : 'tag-warn'}">${esc(t)}</span>`).join('') || '<span class="faint small">Sin observaciones</span>'}</div>
          ${r.conditionNote ? `<p class="small muted" style="margin:6px 0 0">${esc(r.conditionNote)}</p>` : ''}
          <div class="section-title mt-lg">Accesorios recibidos</div>
          <div class="tagrow">${(r.accessories || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('') || '<span class="faint small">Ninguno</span>'}</div>
          <div class="section-title mt-lg">Pruebas al recibir</div>
          ${checksChips(r.checks)}
        </div>
      </div>
      <form class="card stack" data-f>
        <div class="card-title">${icon('wrench')} Trabajo técnico</div>
        <div class="field"><label>Diagnóstico</label><textarea class="textarea" name="diagnosis" placeholder="Qué encontró el técnico y qué hay que hacer" ${open ? '' : 'disabled'}>${esc(r.diagnosis || '')}</textarea></div>
        <div class="field"><label>Notas internas <span class="faint">(no las ve el cliente)</span></label><textarea class="textarea" name="techNotes" placeholder="Ej.: placa con sulfato en la zona de carga" ${open ? '' : 'disabled'}>${esc(r.techNotes || '')}</textarea></div>
        <div class="field"><label>Mensaje para el cliente <span class="faint">(se ve en la consulta en línea)</span></label><input class="input" name="publicNote" value="${esc(r.publicNote || '')}" placeholder="Ej.: llega el repuesto el jueves" ${open ? '' : 'disabled'}></div>
        <div class="form-grid">
          <div class="field"><label>Técnico</label><select class="select" name="technicianId" ${open ? '' : 'disabled'}><option value="">Sin asignar</option>${techs.map((t) => `<option value="${t.id}" ${t.id === r.technicianId ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Entrega estimada</label><input class="input" type="date" name="promisedAt" value="${r.promisedAt ? dayKey(new Date(r.promisedAt)) : ''}" ${open ? '' : 'disabled'}></div>
          <div class="field"><label>Prioridad</label><select class="select" name="priority" ${open ? '' : 'disabled'}><option value="normal">Normal</option><option value="urgente" ${r.priority === 'urgente' ? 'selected' : ''}>Urgente</option></select></div>
          <div class="field"><label>Garantía (días)</label><input class="input" name="warrantyDays" inputmode="numeric" value="${r.warrantyDays ?? store.settings.warrantyDays}" ${open ? '' : 'disabled'}></div>
        </div>
        ${open ? `<div class="row" style="justify-content:flex-end"><button class="btn btn-primary">${icon('check')} Guardar cambios</button></div>` : ''}
        ${r.warrantyUntil ? `<div class="pay-status ${new Date(r.warrantyUntil) >= new Date() ? 'ok' : 'due'}"><span>${icon('shieldCheck')} Garantía hasta el ${fmtDate(r.warrantyUntil)}</span><span>${new Date(r.warrantyUntil) >= new Date() ? 'Vigente' : 'Vencida'}</span></div>` : ''}
        <div class="track-box"><div class="grow"><div class="small muted">Consulta en línea del cliente</div><b class="mono">${esc(r.trackCode || '—')}</b></div><a class="btn btn-ghost btn-sm" href="${trackUrl(r.trackCode)}" target="_blank" rel="noopener">${icon('eye')} Ver</a></div>
      </form>
    </div>`;
  }

  function tabPresupuesto() {
    draft ||= { items: (r.items || []).map((i) => ({ ...i })), discount: r.discount || 0 };
    const open = isOpenStatus(r.status);
    const total = itemsTotal(draft.items);
    const services = store.settings.services || [];
    return `<div class="stack">
      ${open ? `<div class="card stack">
        <div class="row row-wrap">
          <select class="select" data-svc style="flex:1;min-width:220px"><option value="">+ Agregar servicio / mano de obra…</option>${services.map((s, i) => `<option value="${i}">${esc(s.name)} — ${usd(s.price)}</option>`).join('')}<option value="custom">Otro (escribir)…</option></select>
          <div class="search" style="flex:1.2;min-width:240px;position:relative">${icon('box')}<input data-part placeholder="+ Agregar repuesto del inventario…"><div class="suggest" data-sug hidden></div></div>
        </div>
        <div class="hint">Los repuestos se descuentan del inventario al guardar el presupuesto, y regresan si los quitas o cancelas la orden.</div>
      </div>` : ''}
      <div class="card card-flush">
        ${draft.items.length ? `<div class="table-wrap"><table class="table budget"><thead><tr><th>Descripción</th><th class="c">Cant.</th><th class="r">Precio $</th><th class="r">Total</th>${open ? '<th></th>' : ''}</tr></thead><tbody>
          ${draft.items.map((it, i) => `<tr>
            <td><div class="row" style="gap:8px"><span class="badge ${it.productId ? 'badge-info' : 'badge-brand'}">${it.productId ? 'Repuesto' : 'Servicio'}</span>${open ? `<input class="input input-sm" data-name="${i}" value="${esc(it.name)}">` : `<b>${esc(it.name)}</b>`}</div>${it.productId ? `<div class="t-sub">Stock: ${qtyFmt(store.product(it.productId)?.stock ?? 0)} · costo ${usd(it.cost)}</div>` : ''}</td>
            <td class="c">${open ? `<input class="input input-sm center" style="width:64px" data-qty="${i}" inputmode="decimal" value="${qtyFmt(it.qty)}">` : qtyFmt(it.qty)}</td>
            <td class="r">${open ? `<input class="input input-sm r" style="width:96px" data-price="${i}" inputmode="decimal" value="${num(it.price)}">` : usd(it.price)}</td>
            <td class="r num"><b data-lt="${i}">${usd(it.price * it.qty)}</b></td>
            ${open ? `<td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-rm="${i}">${icon('trash')}</button></td>` : ''}
          </tr>`).join('')}
        </tbody></table></div>` : `<div style="padding:12px">${emptyState('file', 'Sin presupuesto todavía', 'Agrega la mano de obra y los repuestos que lleva la reparación.')}</div>`}
        <div class="budget-foot">
          <div class="field" style="max-width:160px"><label>Descuento $</label><input class="input input-sm" data-disc inputmode="decimal" value="${draft.discount ? num(draft.discount) : ''}" placeholder="0,00" ${open ? '' : 'disabled'}></div>
          <div class="r"><div class="small muted">Total presupuesto</div><div class="budget-total" data-bt>${usd(total - draft.discount)}</div><div class="text-bs small bold" data-btb>${bs((total - draft.discount) * store.rate)}</div></div>
        </div>
      </div>
      ${open ? `<div class="row row-wrap" style="justify-content:flex-end">
        <button class="btn btn-whatsapp" data-sendbudget>${icon('whatsapp')} Guardar y enviar presupuesto</button>
        ${!r.approved ? `<button class="btn btn-secondary" data-approve>${icon('check')} Cliente aprobó</button>` : `<span class="badge badge-success" style="height:32px">${icon('check')} Aprobado ${r.approvedAt ? fmtDate(r.approvedAt) : ''}</span>`}
        <button class="btn btn-primary" data-savebudget>${icon('check')} Guardar presupuesto</button>
      </div>` : ''}
    </div>`;
  }

  function tabPagos() {
    if (receipts === null) { loadReceipts(); return '<div class="empty"><div class="spinner"></div></div>'; }
    const bal = repairBalance(r);
    return `<div class="stack">
      <div class="kpis" style="margin:0">
        <div class="card kpi"><div class="kpi-label">Total</div><div class="kpi-value">${usd((r.total || 0) - (r.discount || 0))}</div><div class="kpi-sub">${bs(((r.total || 0) - (r.discount || 0)) * store.rate)}</div></div>
        <div class="card kpi"><div class="kpi-label">Pagado</div><div class="kpi-value text-success">${usd(r.paid || 0)}</div><div class="kpi-sub">${receipts.filter((x) => x.status !== 'voided').length} comprobante(s)</div></div>
        <div class="card kpi"><div class="kpi-label">Saldo</div><div class="kpi-value ${bal > 0 ? 'text-danger' : ''}">${usd(bal)}</div><div class="kpi-sub">${bs(bal * store.rate)}</div></div>
      </div>
      ${isOpenStatus(r.status) && bal > 0 ? `<div class="row" style="justify-content:flex-end"><button class="btn btn-secondary" data-dep>${icon('dollar')} Registrar abono</button><button class="btn btn-primary" data-deliver>${icon('handshake')} Entregar y cobrar ${usd(bal)}</button></div>` : ''}
      <div class="card card-flush">${receipts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Fecha</th><th>Forma de pago</th><th class="r">Monto</th><th></th></tr></thead><tbody>
        ${receipts.map((s) => `<tr style="${s.status === 'voided' ? 'opacity:.5' : ''}"><td><b>${esc(s.number)}</b><div class="t-sub">${s.kind === 'abono' ? 'Recibo de abono' : 'Factura de entrega'}${s.status === 'voided' ? ' · ANULADO' : ''}</div></td><td class="small">${fmtDateTime(s.date)}</td><td class="small">${(s.payments || []).map((p) => esc(methodLabel(p.method))).join(', ') || '—'}</td><td class="r num"><b>${usd(s.kind === 'abono' ? s.total : s.due)}</b></td><td class="r"><button class="btn btn-ghost btn-icon btn-sm" data-rp="${s.id}">${icon('print')}</button></td></tr>`).join('')}
      </tbody></table></div>` : `<div style="padding:12px">${emptyState('dollar', 'Sin pagos registrados')}</div>`}</div>
    </div>`;
  }

  function tabFotos() {
    const photos = r.photos || [];
    return `<div class="stack">
      <div class="photo-grid">${photos.map((p, i) => `<div class="photo"><img src="${p}" alt="Foto ${i + 1}" data-zoom="${i}">${isOpenStatus(r.status) ? `<button class="btn btn-danger-soft btn-icon btn-sm" data-delph="${i}">${icon('trash')}</button>` : ''}</div>`).join('')}
        ${photos.length < MAX_PHOTOS ? `<label class="photo add">${icon('camera')}<span>Agregar foto</span><input type="file" accept="image/*" capture="environment" data-addph hidden></label>` : ''}</div>
      <div class="hint">Toma fotos del equipo al recibirlo (pantalla, tapa, bordes) para evitar reclamos. Máximo ${MAX_PHOTOS}.</div>
    </div>`;
  }

  function tabHistorial() {
    const h = [...(r.history || [])].reverse();
    return `<div class="timeline">${h.map((x) => `<div class="tl-item"><span class="tl-dot tone-${STATUS[x.status]?.tone || 'neutral'}">${icon(STATUS[x.status]?.icon || 'clock')}</span><div><div class="row row-wrap" style="gap:6px"><b>${esc(STATUS[x.status]?.label || x.status)}</b><span class="t-sub">${fmtDateTime(x.at)}${x.by ? ' · ' + esc(x.by) : ''}</span></div><div class="small muted">${esc(x.note || '')}</div></div></div>`).join('') || emptyState('clock', 'Sin historial')}</div>`;
  }

  // ---------- Render ----------
  function render() {
    const body = { resumen: tabResumen, presupuesto: tabPresupuesto, pagos: tabPagos, fotos: tabFotos, historial: tabHistorial }[current]();
    rootEl.innerHTML = `${header()}<div class="rp-body">${body}</div>${footer()}`;
    bind();
  }

  function bind() {
    const q = (s) => rootEl.querySelector(s);
    const qa = (s) => rootEl.querySelectorAll(s);
    q('[data-x]').onclick = () => m.close();
    qa('[data-tab]').forEach((b) => b.onclick = () => { if (current === 'presupuesto' && b.dataset.tab !== 'presupuesto') draft = null; current = b.dataset.tab; render(); });
    qa('[data-st]').forEach((b) => b.onclick = () => changeStatus(b.dataset.st));
    q('[data-wa]').onclick = whatsappMenu;
    q('[data-print]').onclick = printMenu;
    q('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(trackUrl(r.trackCode)); toast('Enlace de seguimiento copiado'); } catch (_) { toast(trackUrl(r.trackCode), 'info', 6000); } };
    qa('[data-dep]').forEach((b) => b.onclick = deposit);
    qa('[data-deliver]').forEach((b) => b.onclick = deliver);
    q('[data-cancel]') && (q('[data-cancel]').onclick = cancel);
    q('[data-inv]') && (q('[data-inv]').onclick = async () => { const s = (await store.listEq('sales', 'repairId', r.id)).find((x) => x.id === r.invoiceId); if (s) printReceipt(s); });
    q('[data-warranty]') && (q('[data-warranty]').onclick = () => { m.close(); import('./main.js').then((x) => x.navigate('recibir', { params: { warrantyOf: r.id } })); });

    if (current === 'resumen') {
      q('[data-reveal]') && (q('[data-reveal]').onclick = async () => { if (!(await requirePin('Ver la clave del equipo'))) return; q('[data-secret]').textContent = r.device?.unlockValue || '—'; });
      const f = q('[data-f]');
      f.onsubmit = async (e) => {
        e.preventDefault(); const F = f.elements;
        const tech = store.tech(F.technicianId.value);
        const patch = { diagnosis: F.diagnosis.value.trim(), techNotes: F.techNotes.value.trim(), publicNote: F.publicNote.value.trim(), technicianId: tech?.id || null, technician: tech?.name || '', promisedAt: F.promisedAt.value ? new Date(fromKey(F.promisedAt.value).setHours(18, 0, 0)).toISOString() : null, priority: F.priority.value, warrantyDays: Math.max(0, Math.round(parseNum(F.warrantyDays.value))) };
        const notes = [];
        if (patch.technicianId !== r.technicianId) notes.push(`Técnico: ${patch.technician || 'sin asignar'}`);
        if (patch.diagnosis !== (r.diagnosis || '')) notes.push('Diagnóstico actualizado');
        r = await updateRepair(r, patch, notes.join(' · '));
        toast('Orden actualizada'); render();
      };
    }
    if (current === 'presupuesto' && isOpenStatus(r.status)) bindBudget(q, qa);
    if (current === 'pagos') qa('[data-rp]').forEach((b) => b.onclick = () => printReceipt(receipts.find((s) => s.id === b.dataset.rp)));
    if (current === 'fotos') {
      q('[data-addph]') && (q('[data-addph]').onchange = async (e) => {
        const file = e.target.files?.[0]; if (!file) return;
        try { const data = await compressImage(file, 900, 0.62); r = await updateRepair(r, { photos: [...(r.photos || []), data] }, 'Foto agregada'); render(); }
        catch (_) { toast('No se pudo leer la imagen', 'danger'); }
      });
      qa('[data-delph]').forEach((b) => b.onclick = async () => { if (!(await confirmDialog({ title: 'Eliminar foto', message: '¿Quitar esta foto de la orden?', confirmText: 'Eliminar', danger: true }))) return; const p = [...r.photos]; p.splice(+b.dataset.delph, 1); r = await updateRepair(r, { photos: p }); render(); });
      qa('[data-zoom]').forEach((img) => img.onclick = () => openModal({ title: `Foto ${+img.dataset.zoom + 1}`, size: 'lg', body: `<img src="${r.photos[+img.dataset.zoom]}" style="width:100%;border-radius:12px">` }));
    }
  }

  function bindBudget(q, qa) {
    const recalc = () => {
      const t = itemsTotal(draft.items) - (draft.discount || 0);
      q('[data-bt]').textContent = usd(t); q('[data-btb]').textContent = bs(t * store.rate);
      draft.items.forEach((it, i) => { const el = q(`[data-lt="${i}"]`); if (el) el.textContent = usd(it.price * it.qty); });
    };
    qa('[data-name]').forEach((inp) => inp.oninput = () => { draft.items[+inp.dataset.name].name = inp.value; });
    qa('[data-qty]').forEach((inp) => inp.oninput = () => { draft.items[+inp.dataset.qty].qty = parseNum(inp.value); recalc(); });
    qa('[data-price]').forEach((inp) => inp.oninput = () => { draft.items[+inp.dataset.price].price = parseNum(inp.value); recalc(); });
    qa('[data-rm]').forEach((b) => b.onclick = () => { draft.items.splice(+b.dataset.rm, 1); render(); });
    q('[data-disc]').oninput = (e) => { draft.discount = parseNum(e.target.value); recalc(); };
    q('[data-svc]').onchange = (e) => {
      const v = e.target.value; if (v === '') return;
      if (v === 'custom') draft.items.push({ id: shortId(6), kind: 'servicio', name: 'Servicio', qty: 1, price: 0, cost: 0 });
      else { const s = store.settings.services[+v]; draft.items.push({ id: shortId(6), kind: 'servicio', name: s.name, qty: 1, price: s.price, cost: 0 }); }
      render();
      if (v === 'custom') { const ins = rootEl.querySelectorAll('[data-name]'); ins[ins.length - 1]?.select(); }
    };
    const inp = q('[data-part]'); const sug = q('[data-sug]');
    inp.oninput = () => {
      const t = normalize(inp.value);
      if (!t) { sug.hidden = true; return; }
      const list = store.products.filter((p) => p.active !== false && normalize(`${p.name} ${p.sku || ''} ${p.compatible || ''} ${p.category}`).includes(t)).slice(0, 8);
      sug.hidden = false;
      sug.innerHTML = list.length ? list.map((p) => `<button type="button" data-pid="${p.id}"><span class="grow"><b>${esc(p.name)}</b><small>${esc(p.category || '')}${p.compatible ? ' · ' + esc(p.compatible) : ''}</small></span><span class="r"><b>${usd(p.price)}</b><small class="${(p.stock || 0) <= 0 ? 'text-danger' : ''}">Stock ${qtyFmt(p.stock || 0)}</small></span></button>`).join('') : '<div class="small muted" style="padding:10px">Sin resultados en inventario</div>';
      sug.querySelectorAll('[data-pid]').forEach((b) => b.onmousedown = (ev) => {
        ev.preventDefault();
        const p = store.product(b.dataset.pid);
        const ex = draft.items.find((x) => x.productId === p.id);
        if (ex) ex.qty += 1; else draft.items.push({ id: shortId(6), kind: 'repuesto', productId: p.id, name: p.name, qty: 1, price: p.price, cost: p.cost || 0 });
        if ((p.stock || 0) < 1) toast(`${p.name} no tiene stock: quedará en negativo hasta que registres la compra.`, 'warning', 5000);
        render();
      });
    };
    inp.onblur = () => setTimeout(() => { sug.hidden = true; }, 150);
    const save = async (note) => {
      const res = await saveRepairItems(r, draft.items, { discount: draft.discount, note });
      r = res.repair; draft = null; notifyLowStock(res.low);
      return r;
    };
    q('[data-savebudget]').onclick = async (e) => { setBusy(e.currentTarget, true); await save('Presupuesto actualizado'); toast('Presupuesto guardado'); render(); };
    q('[data-sendbudget]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      await save('Presupuesto enviado al cliente');
      if (!r.approved && ['recibido', 'diagnostico'].includes(r.status)) r = await setRepairStatus(r, 'presupuesto', 'Presupuesto enviado al cliente');
      waCustomer(r, 'presupuesto'); render();
    };
    q('[data-approve]') && (q('[data-approve]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      if (draft.items.length) await save('Presupuesto aprobado');
      r = await updateRepair(r, { approved: true, approvedAt: new Date().toISOString(), status: r.status === 'presupuesto' || r.status === 'recibido' || r.status === 'diagnostico' ? 'reparacion' : r.status, statusAt: new Date().toISOString() }, 'El cliente aprobó el presupuesto');
      toast('Presupuesto aprobado: la orden pasó a reparación'); render();
    });
  }

  // ---------- Acciones ----------
  async function changeStatus(s) {
    if (s === r.status) return;
    const st = STATUS[s];
    const m2 = openModal({
      title: `Cambiar a “${st.label}”`, sub: st.desc, size: 'sm',
      body: `<div class="stack"><div class="field"><label>Nota (opcional)</label><input class="input" data-n placeholder="${s === 'repuesto' ? 'Ej.: pantalla pedida, llega el jueves' : s === 'no_reparado' ? 'Ej.: placa dañada, no tiene reparación' : 'Detalle para el historial'}" autofocus></div>
        ${r.customerPhone ? `<label class="check"><input type="checkbox" data-w ${['presupuesto', 'listo', 'no_reparado', 'repuesto'].includes(s) ? 'checked' : ''}> <span>Avisar al cliente por WhatsApp</span></label>` : ''}</div>`,
      footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${icon('check')} Cambiar estado</button>`
    });
    const go = async () => {
      const note = m2.el.querySelector('[data-n]').value.trim();
      const wa = m2.el.querySelector('[data-w]')?.checked;
      if (s === 'no_reparado' && note && !r.diagnosis) r = { ...r, diagnosis: note };
      r = await setRepairStatus(r, s, note);
      m2.close(); toast(`Estado: ${st.label}`); render();
      if (wa) waCustomer(r, s);
    };
    m2.el.querySelector('[data-ok]').onclick = go;
    m2.el.querySelector('[data-n]').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } };
  }

  function whatsappMenu() {
    if (!r.customerPhone) toast('El cliente no tiene teléfono registrado: elige el contacto en WhatsApp.', 'info', 4000);
    const opts = [['estado', `Estado actual: ${STATUS[r.status]?.label}`, r.status], ['presupuesto', 'Enviar presupuesto', 'presupuesto'], ['listo', 'Equipo listo para retirar', 'listo'], ['cobro', 'Recordar saldo pendiente', 'cobro'], ['recibido', 'Comprobante de recepción', 'recibido']];
    const m2 = openModal({
      title: 'Avisar al cliente', sub: `${esc(r.customerName)} · ${esc(r.customerPhone || 'sin teléfono')}`, size: 'md',
      body: `<div class="help-list">${opts.map(([k, l, kind]) => `<button type="button" class="help-item" data-k="${kind}"><span class="kpi-icon tone-success" style="width:36px;height:36px">${icon('whatsapp')}</span><span class="grow"><b>${esc(l)}</b><small>${esc(customerMessage(r, kind).split('\n').filter(Boolean).slice(1, 2).join(' ').slice(0, 90))}…</small></span>${icon('arrowRight')}</button>`).join('')}</div>`
    });
    m2.el.querySelectorAll('[data-k]').forEach((b) => b.onclick = () => { m2.close(); waCustomer(r, b.dataset.k); });
  }

  function printMenu() {
    const m2 = openModal({
      title: 'Imprimir', size: 'sm',
      body: `<div class="help-list">
        <button type="button" class="help-item" data-p="carta"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon('file')}</span><span class="grow"><b>Orden de servicio (carta)</b><small>Copia completa con QR, términos y firmas</small></span></button>
        <button type="button" class="help-item" data-p="80mm"><span class="kpi-icon tone-info" style="width:36px;height:36px">${icon('receipt')}</span><span class="grow"><b>Comprobante en ticket</b><small>Impresora térmica 80 mm</small></span></button>
        <button type="button" class="help-item" data-p="label"><span class="kpi-icon tone-violet" style="width:36px;height:36px">${icon('tag2')}</span><span class="grow"><b>Etiqueta para el equipo</b><small>Número de orden, cliente y QR (58 × 30 mm)</small></span></button>
      </div>`
    });
    m2.el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => { m2.close(); if (b.dataset.p === 'label') printLabel(r); else printRepairOrder(r, b.dataset.p); });
  }

  async function deposit() {
    const bal = repairBalance(r);
    await openPay({
      title: `Abono · ${r.number}`, sub: esc(r.customerName), amount: bal > 0 ? Math.min(bal, round2(bal / 2) || bal) : 0, editable: true, max: bal || undefined,
      confirmText: 'Registrar abono', printLabel: 'Imprimir recibo de abono',
      onConfirm: async (res) => {
        const out = await registerDeposit(r, res);
        r = out.repair; receipts = null;
        if (res.print) printReceipt(out.receipt);
        showPaid(out.receipt, { title: 'Abono registrado', onPrint: () => printReceipt(out.receipt) });
        render();
        return out;
      }
    });
  }

  async function deliver() {
    const bal = repairBalance(r);
    if (!['listo', 'no_reparado'].includes(r.status) && !(await confirmDialog({ title: 'Entregar equipo', message: `La orden está en “${STATUS[r.status].label}”. ¿Entregar el equipo de todas formas?`, confirmText: 'Sí, entregar' }))) return;
    if (!(r.items || []).length && r.status !== 'no_reparado' && !(await confirmDialog({ title: 'Sin presupuesto', message: 'La orden no tiene servicios ni repuestos cargados. ¿Entregar sin cobrar?', confirmText: 'Entregar sin cobro' }))) return;
    const base = bal;
    const doDeliver = async (res) => {
      const out = await deliverRepair(r, { payments: res.payments, changeCurrency: res.changeCurrency, discount: round2((r.discount || 0) + (res.discount || 0)) });
      r = out.repair; receipts = null;
      if (res.print) printReceipt(out.sale);
      showPaid(out.sale, { title: 'Equipo entregado', onPrint: () => printReceipt(out.sale) });
      if (r.customerPhone) setTimeout(() => toast('Puedes enviar el agradecimiento por WhatsApp desde “Avisar”.', 'info', 4000), 600);
      render();
      return out;
    };
    if (bal <= 0.004) {
      try { await doDeliver({ payments: [], discount: 0, changeCurrency: 'BS', print: true }); } catch (e) { toast(e.message, 'danger'); }
      return;
    }
    await openPay({
      title: `Entregar ${r.number}`, sub: `${esc(r.customerName)} · ${esc(deviceName(r.device))}`,
      amount: bal, baseTotal: base, discount: true, discountValue: 0, confirmText: 'Cobrar y entregar', printLabel: 'Imprimir nota de entrega',
      breakdown: (st) => `Total ${usd((r.total || 0) - (r.discount || 0))}${r.paid ? ` · Abonado −${usd(r.paid)}` : ''}${st.discount ? ` · Descuento −${usd(st.discount)}` : ''}`,
      onConfirm: doDeliver
    });
  }

  async function cancel() {
    if (!(await requirePin('Cancelar una orden'))) return;
    const m2 = openModal({
      title: `Cancelar ${r.number}`, sub: 'Los repuestos cargados regresan al inventario.', size: 'sm',
      body: `<div class="stack"><div class="field"><label>Motivo</label><select class="select" data-r><option>El cliente retiró el equipo sin reparar</option><option>El cliente no aprobó el presupuesto</option><option>Orden duplicada o por error</option><option>Otro</option></select></div>
        ${r.paid > 0 ? `<label class="check box box-white"><input type="checkbox" data-ref checked> <span>Devolver el abono de <b>${usd(r.paid)}</b> desde la caja</span></label><div class="seg seg-block" data-curseg><button type="button" class="on" data-c="USD">En dólares</button><button type="button" data-c="BS">En bolívares</button></div>` : ''}</div>`,
      footer: `<button class="btn btn-secondary" data-close>Volver</button><button class="btn btn-danger" data-ok>${icon('x')} Cancelar orden</button>`
    });
    let cur = 'USD';
    m2.el.querySelectorAll('[data-c]').forEach((b) => b.onclick = () => { cur = b.dataset.c; m2.el.querySelectorAll('[data-c]').forEach((x) => x.classList.toggle('on', x === b)); });
    m2.el.querySelector('[data-ok]').onclick = async (e) => {
      setBusy(e.currentTarget, true);
      try {
        r = await cancelRepair(r, { reason: m2.el.querySelector('[data-r]').value, refund: !!m2.el.querySelector('[data-ref]')?.checked, refundCurrency: cur });
        m2.close(); toast('Orden cancelada', 'warning'); render();
      } catch (ex) { toast(ex.message, 'danger'); setBusy(e.currentTarget, false); }
    };
  }

  render();
  return m;
}
