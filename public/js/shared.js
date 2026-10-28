// Sano-Técnico — Componentes compartidos: tasa BCV, impresión, WhatsApp, QR y patrón de desbloqueo
import { store, STATUS, DEVICE_TYPES, CHECKS, CHECK_STATES } from './store.js';
import { openModal, toast, num, esc, parseNum, fmtDateTime, fmtDate, setBusy, usd, bs, methodLabel, qtyFmt, printHTML, todayKey, dayKey, waLink } from './utils.js';
import { icon } from './icons.js';
import { deviceName, trackUrl, repairBalance } from './ops.js';

export const APP_NAME = 'Sano-Técnico';
export const SALES_PHONE = '584221906045';
export const SALES_PHONE_FMT = '+58 422-190 6045';
export const salesWa = (msg = 'Hola, me interesa Sano-Técnico para mi servicio técnico. ¿Me pueden dar más información?') =>
  `https://wa.me/${SALES_PHONE}?text=${encodeURIComponent(msg)}`;

// ======================================================================
// TASA BCV
// ======================================================================
export async function fetchBcvRate() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    const r = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { signal: ctrl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const v = Number(j.promedio || j.precio || j.venta);
    if (!(v > 0)) throw new Error('Respuesta inválida');
    return { rate: v, date: j.fechaActualizacion || null };
  } finally { clearTimeout(t); }
}

export async function autoUpdateRate() {
  const s = store.settings;
  if (s.rateAuto === false) return false;
  if (s.rateUpdatedAt && dayKey(new Date(s.rateUpdatedAt)) === todayKey() && store.rate > 0) return false;
  try {
    const r = await fetchBcvRate();
    if (Math.abs(r.rate - store.rate) < 0.0001 && s.rateUpdatedAt && dayKey(new Date(s.rateUpdatedAt)) === todayKey()) return false;
    await store.setRate(Math.round(r.rate * 100) / 100, true);
    toast(`Tasa BCV del día actualizada: Bs ${num(r.rate)}`, 'info', 4000);
    return true;
  } catch (_) { return false; }
}

export function openRateModal() {
  const s = store.settings;
  const m = openModal({
    title: 'Tasa del día',
    sub: s.rateUpdatedAt ? `Última actualización: ${fmtDateTime(s.rateUpdatedAt)} · ${s.rateSource === 'bcv' ? 'automática BCV' : 'manual'}` : 'Configura la tasa para mostrar los precios en bolívares',
    size: 'sm',
    body: `
      <form class="stack" data-f>
        <div class="field">
          <label>Bolívares por 1 $</label>
          <input class="input input-lg" data-rate inputmode="decimal" value="${s.rate ? num(s.rate) : ''}" placeholder="0,00" autofocus>
        </div>
        <button type="button" class="btn btn-secondary btn-block" data-auto>${icon('refresh')} Consultar tasa oficial BCV</button>
        <label class="check"><input type="checkbox" data-autoflag ${s.rateAuto !== false ? 'checked' : ''}> <span>Actualizar automáticamente con la tasa BCV cada día</span></label>
        <div class="hint" data-hint>Puedes escribir cualquier tasa. Se aplica a los precios en Bs, la caja y los reportes.</div>
      </form>`,
    footer: `<button class="btn btn-secondary" data-close>Cancelar</button><button class="btn btn-primary" data-save>Guardar tasa</button>`
  });
  const input = m.el.querySelector('[data-rate]');
  const hint = m.el.querySelector('[data-hint]');
  m.el.querySelector('[data-auto]').onclick = async (e) => {
    const btn = e.currentTarget;
    setBusy(btn, true, 'Consultando…');
    try {
      const r = await fetchBcvRate();
      input.value = num(r.rate);
      hint.textContent = `Tasa oficial BCV${r.date ? ' (' + fmtDateTime(r.date) + ')' : ''}. Pulsa “Guardar tasa” para aplicarla.`;
    } catch (_) {
      hint.textContent = 'No se pudo consultar la tasa automáticamente. Escríbela manualmente.';
    } finally { setBusy(btn, false); }
  };
  const save = async (e) => {
    e?.preventDefault();
    const v = parseNum(input.value);
    if (!(v > 0)) { toast('Ingresa una tasa válida', 'warning'); input.focus(); return; }
    await store.saveSettings({ rateAuto: m.el.querySelector('[data-autoflag]').checked });
    await store.setRate(v, false);
    toast(`Tasa actualizada: Bs ${num(v)} por $1`);
    m.close();
  };
  m.el.querySelector('[data-f]').onsubmit = save;
  m.el.querySelector('[data-save]').onclick = save;
}

// ======================================================================
// MONEDA
// ======================================================================
export function moneyPair(usdVal, rate = store.rate) {
  return `<b class="num">${usd(usdVal)}</b><span class="small text-bs num" style="display:block">${bs(usdVal * rate)}</span>`;
}
export const toBs = (v) => bs((Number(v) || 0) * store.rate);

// ======================================================================
// PATRÓN DE DESBLOQUEO (3×3)
// ======================================================================
const dotXY = (i, size) => { const g = size / 3; return [g * (i % 3) + g / 2, g * Math.floor(i / 3) + g / 2]; };
/** SVG del patrón: puntos y trazo numerado. seq = índices 0..8 en orden */
export function patternSVG(seq = [], size = 120, { color = '#0284c7', dot = '#94a0b4', print = false } = {}) {
  const pts = (seq || []).map((i) => dotXY(i, size));
  const r = size / 22;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="display:block">
    ${pts.length > 1 ? `<polyline points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="${size / 30}" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>` : ''}
    ${Array.from({ length: 9 }, (_, i) => { const [x, y] = dotXY(i, size); const k = seq.indexOf(i); return `<circle cx="${x}" cy="${y}" r="${k === 0 ? r * 1.7 : r}" fill="${k >= 0 ? color : dot}"/>${k >= 0 && print ? `<text x="${x + r * 1.6}" y="${y - r * 1.3}" font-size="${size / 10}" font-family="Arial" fill="#000">${k + 1}</text>` : ''}`; }).join('')}
  </svg>`;
}

/** Componente interactivo para dibujar el patrón. Devuelve { get, set, clear } */
export function mountPatternPad(host, initial = [], onChange = () => {}) {
  let seq = [...(initial || [])];
  host.innerHTML = `<div class="pattern-pad">${Array.from({ length: 9 }, (_, i) => `<button type="button" class="pp-dot" data-i="${i}" aria-label="Punto ${i + 1}"><i></i><b></b></button>`).join('')}<svg class="pp-lines" viewBox="0 0 300 300" preserveAspectRatio="none"><polyline fill="none" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg></div>`;
  const pad = host.querySelector('.pattern-pad');
  const line = host.querySelector('polyline');
  const render = () => {
    host.querySelectorAll('.pp-dot').forEach((d) => {
      const k = seq.indexOf(+d.dataset.i);
      d.classList.toggle('on', k >= 0); d.classList.toggle('first', k === 0);
      d.querySelector('b').textContent = k >= 0 ? k + 1 : '';
    });
    line.setAttribute('points', seq.map((i) => dotXY(i, 300).join(',')).join(' '));
    onChange(seq);
  };
  let drawing = false;
  const add = (i) => { if (!seq.includes(i)) { seq.push(i); render(); } };
  const hit = (x, y) => {
    for (const d of host.querySelectorAll('.pp-dot')) {
      const r = d.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (Math.hypot(x - cx, y - cy) < r.width * 0.42) return +d.dataset.i;
    }
    return -1;
  };
  pad.addEventListener('pointerdown', (e) => {
    const i = hit(e.clientX, e.clientY);
    if (i < 0) return;
    e.preventDefault();
    if (!drawing && seq.length && !seq.includes(i) && e.pointerType !== 'mouse') { /* continuar */ }
    drawing = true;
    try { pad.setPointerCapture(e.pointerId); } catch (_) {}
    add(i);
  });
  pad.addEventListener('pointermove', (e) => { if (!drawing) return; const i = hit(e.clientX, e.clientY); if (i >= 0) add(i); });
  const stop = () => { drawing = false; };
  pad.addEventListener('pointerup', stop); pad.addEventListener('pointercancel', stop);
  render();
  return { get: () => [...seq], set: (s) => { seq = [...s]; render(); }, clear: () => { seq = []; render(); } };
}

// ======================================================================
// QR
// ======================================================================
let qrLoad = null;
function loadQR() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  qrLoad ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = '/js/vendor/qrcode.js';
    s.onload = () => res(window.qrcode); s.onerror = rej;
    document.head.appendChild(s);
  });
  return qrLoad;
}
/** Imagen (data URL) con el código QR del texto */
export async function qrDataURL(text, cell = 4) {
  try {
    const q = await loadQR();
    const qr = q(0, 'M'); qr.addData(text); qr.make();
    return qr.createDataURL(cell, 2);
  } catch (_) { return ''; }
}

// ======================================================================
// WHATSAPP AL CLIENTE
// ======================================================================
export function customerMessage(r, kind = r.status) {
  const name = String(r.customerName || '').split(' ')[0];
  const dev = deviceName(r.device);
  const biz = store.businessName;
  const link = r.trackCode ? `\n\nSigue tu equipo aquí: ${trackUrl(r.trackCode)}` : '';
  const total = (r.total || 0) - (r.discount || 0);
  const bal = repairBalance(r);
  const money = total > 0 ? `\nTotal: $${num(total)} (Bs ${num(total * store.rate)})${r.paid ? `\nAbonado: $${num(r.paid)}\nSaldo: $${num(bal)}` : ''}` : '';
  const h = `Hola ${name} 👋, te escribimos de *${biz}*.`;
  const T = {
    recibido: `${h}\n\nRecibimos tu *${dev}* con la orden *${r.number}*.\nFalla reportada: ${r.fault || '—'}${r.promisedAt ? `\nFecha estimada: ${fmtDate(r.promisedAt)}` : ''}${link}`,
    diagnostico: `${h}\n\nTu *${dev}* (orden ${r.number}) está en diagnóstico. Te avisaremos apenas tengamos el presupuesto.${link}`,
    presupuesto: `${h}\n\nYa revisamos tu *${dev}* (orden ${r.number}).${r.diagnosis ? `\nDiagnóstico: ${r.diagnosis}` : ''}\n\nPresupuesto:\n${(r.items || []).map((i) => `• ${i.qty > 1 ? qtyFmt(i.qty) + ' × ' : ''}${i.name}: $${num(i.price * i.qty)}`).join('\n') || '—'}${money}\n\n¿Aprobamos la reparación? Responde *SÍ* para continuar.${link}`,
    repuesto: `${h}\n\nEstamos esperando el repuesto para tu *${dev}* (orden ${r.number}). Te avisamos apenas llegue.${link}`,
    reparacion: `${h}\n\nTu *${dev}* (orden ${r.number}) ya está en reparación. 🔧${link}`,
    listo: `${h}\n\n✅ ¡Tu *${dev}* está listo para retirar! (orden ${r.number})${money}\n\nTe esperamos${store.settings.address ? ` en ${store.settings.address}` : ''}.${link}`,
    no_reparado: `${h}\n\nLamentablemente tu *${dev}* (orden ${r.number}) no pudo ser reparado.${r.diagnosis ? `\nMotivo: ${r.diagnosis}` : ''}\nPuedes pasar a retirarlo cuando gustes.${link}`,
    entregado: `${h}\n\n¡Gracias por tu confianza! Entregamos tu *${dev}* (orden ${r.number}).${r.warrantyUntil ? `\nGarantía hasta el ${fmtDate(r.warrantyUntil)}.` : ''}${link}`,
    cancelado: `${h}\n\nTu orden ${r.number} (${dev}) fue cancelada.`,
    cobro: `${h}\n\nRecordatorio: tu *${dev}* (orden ${r.number}) tiene un saldo pendiente de $${num(bal)} (Bs ${num(bal * store.rate)}).${link}`
  };
  return T[kind] || T.recibido;
}
export function waCustomer(r, kind) {
  const text = customerMessage(r, kind);
  const url = r.customerPhone ? waLink(r.customerPhone, text) : 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank', 'noopener');
}

// ======================================================================
// IMPRESIÓN
// ======================================================================
function ticketCSS(fmt) {
  const width = fmt === '58mm' ? '200px' : fmt === 'carta' ? '100%' : '290px';
  const font = fmt === 'carta' ? '13px' : fmt === '58mm' ? '10.5px' : '11.5px';
  return `@page { margin: ${fmt === 'carta' ? '12mm' : '2mm'}; }
    body { font-family: ${fmt === 'carta' ? 'Arial, Helvetica, sans-serif' : "'Courier New', monospace"}; font-size: ${font}; width: ${width}; margin: 0 auto; color: #000; }
    .c { text-align: center; } .b { font-weight: bold; } .hr { border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; } td { vertical-align: top; } .r { text-align: right; }
    .big { font-size: 1.25em; font-weight: bold; } .xl { font-size: 1.8em; font-weight: bold; } .sm { font-size: .85em; }`;
}

function headerHTML() {
  const s = store.settings;
  return `<div class="c b" style="font-size:1.3em">${esc(store.businessName)}</div>
    ${s.rif ? `<div class="c">RIF: ${esc(s.rif)}</div>` : ''}
    ${s.address ? `<div class="c">${esc(s.address)}</div>` : ''}
    ${s.phone ? `<div class="c">Tel: ${esc(s.phone)}</div>` : ''}
    ${s.instagram ? `<div class="c">IG: ${esc(s.instagram)}</div>` : ''}`;
}

const KIND_TITLE = { venta: () => store.settings.docTitle || 'NOTA DE ENTREGA', reparacion: () => store.settings.docTitle || 'NOTA DE ENTREGA', abono: () => 'RECIBO DE ABONO' };

/** Factura / nota de entrega o recibo de abono (ticket o carta) */
export function receiptHTML(sale) {
  const s = store.settings;
  const rate = sale.rate || store.rate;
  const ivaPct = Number(s.iva) || 0;
  const ivaBs = ivaPct > 0 && sale.kind !== 'abono' ? (sale.total - sale.total / (1 + ivaPct / 100)) * rate : 0;
  const pays = (sale.payments || []).map((p) => `<tr><td colspan="2">${esc(methodLabel(p.method))}</td><td class="r">${p.currency === 'BS' ? 'Bs ' + num(p.amount) : '$' + num(p.amount)}</td></tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style><title>${esc(sale.number)}</title><style>${ticketCSS(s.receiptFormat)}</style></head><body>
    ${headerHTML()}
    <div class="hr"></div>
    <div class="c big">${esc(KIND_TITLE[sale.kind]?.() || 'RECIBO')}</div>
    <div class="c b">N° ${esc(sale.number)}</div>
    <div>Fecha: ${fmtDateTime(sale.date)}</div>
    <div>Cliente: ${esc(sale.customerName || 'Mostrador')}</div>
    ${sale.customerIdDoc ? `<div>C.I./RIF: ${esc(sale.customerIdDoc)}</div>` : ''}
    ${sale.customerPhone ? `<div>Tel: ${esc(sale.customerPhone)}</div>` : ''}
    ${sale.repairNumber ? `<div>Orden: ${esc(sale.repairNumber)} · ${esc(sale.device || '')}</div>` : ''}
    ${sale.imei ? `<div>IMEI/Serial: ${esc(sale.imei)}</div>` : ''}
    ${sale.status === 'voided' ? '<div class="c b">*** DOCUMENTO ANULADO ***</div>' : ''}
    <div class="hr"></div>
    <table>${(sale.items || []).map((it) => `<tr><td colspan="2" style="padding-top:3px">${qtyFmt(it.qty)} x ${esc(it.name)}</td><td class="r">$${num(it.total ?? it.price * it.qty)}</td></tr>`).join('')}</table>
    <div class="hr"></div>
    <table>
      ${sale.kind !== 'abono' ? `<tr><td colspan="2">Subtotal</td><td class="r">$${num(sale.subtotal)}</td></tr>` : ''}
      ${sale.discount > 0 ? `<tr><td colspan="2">Descuento</td><td class="r">-$${num(sale.discount)}</td></tr>` : ''}
      <tr class="big"><td colspan="2">TOTAL $</td><td class="r">$${num(sale.total)}</td></tr>
      <tr class="big"><td colspan="2">TOTAL Bs</td><td class="r">${num(sale.total * rate)}</td></tr>
      ${sale.prepaid > 0 ? `<tr><td colspan="2">Abonado antes</td><td class="r">-$${num(sale.prepaid)}</td></tr><tr class="b"><td colspan="2">Pagado hoy</td><td class="r">$${num(sale.due)}</td></tr>` : ''}
      <tr><td colspan="3" class="sm">Tasa: Bs ${num(rate)} por $</td></tr>
      ${ivaBs > 0.009 ? `<tr><td colspan="2">IVA ${num(ivaPct, 0)}% incluido</td><td class="r">Bs ${num(ivaBs)}</td></tr>` : ''}
    </table>
    ${pays ? `<div class="hr"></div><table>${pays}</table>` : ''}
    ${sale.changeUSD > 0.009 ? `<div>Vuelto: ${sale.changeCurrency === 'BS' ? 'Bs ' + num(sale.changeUSD * rate) : '$' + num(sale.changeUSD)}</div>` : ''}
    ${sale.warrantyUntil ? `<div class="hr"></div><div class="b">Garantía: ${sale.warrantyDays} días, hasta el ${fmtDate(sale.warrantyUntil)}</div><div class="sm">Cubre la pieza y el trabajo realizado. No cubre golpes, humedad ni manipulación de terceros.</div>` : ''}
    ${sale.note ? `<div>Nota: ${esc(sale.note)}</div>` : ''}
    <div class="hr"></div>
    <div class="c">${esc(s.receiptFooter || '¡Gracias por su compra!')}</div>
    <div class="c sm" style="margin-top:4px">Sano-Técnico</div>
  </body></html>`;
}
export function printReceipt(sale) { printHTML(receiptHTML(sale)); }

function checksTable(r) {
  const cells = CHECKS.map(([k, l]) => { const v = r.checks?.[k]; return `<td style="padding:3px 6px;border:1px solid #bbb">${esc(l)}: <b>${v ? (v === 'ok' ? '✔' : v === 'falla' ? '✘' : '—') : '—'}</b></td>`; });
  const rows = []; for (let i = 0; i < cells.length; i += 4) rows.push(`<tr>${cells.slice(i, i + 4).join('')}</tr>`);
  return `<table style="font-size:11px;margin-top:4px">${rows.join('')}</table><div style="font-size:10px;color:#555">✔ funciona · ✘ falla · — no se pudo probar</div>`;
}

/** Orden de servicio impresa: copia del cliente con QR de seguimiento, términos y firmas */
export async function printRepairOrder(r, fmt = store.settings.orderFormat || 'carta') {
  const s = store.settings;
  const qr = r.trackCode ? await qrDataURL(trackUrl(r.trackCode), fmt === 'carta' ? 4 : 3) : '';
  const dev = r.device || {};
  const unlock = dev.unlockType === 'pattern' ? 'Patrón (ver dibujo)' : dev.unlockType === 'pin' ? `PIN: ${esc(dev.unlockValue || '')}` : dev.unlockType === 'password' ? `Contraseña: ${esc(dev.unlockValue || '')}` : 'Sin bloqueo';
  const total = (r.total || 0) - (r.discount || 0);
  if (fmt !== 'carta') {
    printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style><title>${esc(r.number)}</title><style>${ticketCSS(fmt)}</style></head><body>
      ${headerHTML()}
      <div class="hr"></div>
      <div class="c big">ORDEN DE SERVICIO</div>
      <div class="c xl">${esc(r.number)}</div>
      <div>Fecha: ${fmtDateTime(r.createdAt)}</div>
      <div>Cliente: ${esc(r.customerName)}</div>
      ${r.customerPhone ? `<div>Tel: ${esc(r.customerPhone)}</div>` : ''}
      <div class="hr"></div>
      <div class="b">${esc(DEVICE_TYPES[dev.type]?.label || 'Equipo')}: ${esc(deviceName(dev))}</div>
      ${dev.color ? `<div>Color: ${esc(dev.color)}</div>` : ''}
      ${dev.imei ? `<div>IMEI/Serial: ${esc(dev.imei)}</div>` : ''}
      <div>Falla: ${esc(r.fault || '—')}</div>
      ${r.condition?.length ? `<div>Estado: ${esc(r.condition.join(', '))}</div>` : ''}
      ${r.accessories?.length ? `<div>Accesorios: ${esc(r.accessories.join(', '))}</div>` : ''}
      ${r.promisedAt ? `<div>Entrega estimada: ${fmtDate(r.promisedAt)}</div>` : ''}
      ${total > 0 ? `<div class="hr"></div><div>Presupuesto: $${num(total)}</div>${r.paid ? `<div>Abonado: $${num(r.paid)} · Saldo: $${num(repairBalance(r))}</div>` : ''}` : ''}
      <div class="hr"></div>
      ${qr ? `<div class="c"><img src="${qr}" style="width:130px;height:130px"><div class="sm">Consulta el estado de tu equipo<br>Código: <b>${esc(r.trackCode)}</b></div></div>` : ''}
      <div class="hr"></div>
      <div class="sm">${esc(s.terms || '')}</div>
      <br><br><div class="c">______________________<br>Firma del cliente</div>
    </body></html>`);
    return;
  }
  printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style><title>Orden ${esc(r.number)}</title><style>
    @page { margin: 11mm; } body { font-family: Arial, Helvetica, sans-serif; color: #0b1220; font-size: 12px; margin: 0; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 3px solid #0284c7; padding-bottom: 10px; }
    .biz b { font-size: 19px; display: block; } .muted { color: #555; }
    .os { text-align: right; } .os .n { font-size: 26px; font-weight: 800; color: #0284c7; } .os .t { font-size: 11px; letter-spacing: .12em; font-weight: 700; color: #555; }
    h3 { font-size: 11.5px; letter-spacing: .08em; text-transform: uppercase; color: #0369a1; margin: 14px 0 6px; border-bottom: 1px solid #dfe6ef; padding-bottom: 3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; } .grid div span { color: #555; }
    table.items { width: 100%; border-collapse: collapse; } table.items th { background: #0284c7; color: #fff; text-align: left; padding: 5px 7px; font-size: 11px; }
    table.items td { padding: 5px 7px; border-bottom: 1px solid #e3e8ef; } .r { text-align: right; }
    .side { display: flex; gap: 16px; align-items: flex-start; } .side .grow { flex: 1; }
    .box { border: 1px solid #cfd8e3; border-radius: 8px; padding: 8px; text-align: center; font-size: 10.5px; }
    .terms { font-size: 9.5px; color: #333; text-align: justify; margin-top: 10px; }
    .sign { display: flex; justify-content: space-between; gap: 40px; margin-top: 34px; } .sign div { flex: 1; border-top: 1px solid #000; text-align: center; padding-top: 4px; font-size: 11px; }
    .tags span { display: inline-block; border: 1px solid #cfd8e3; border-radius: 99px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 11px; }
  </style></head><body>
    <div class="top">
      <div class="biz"><b>${esc(store.businessName)}</b>${s.rif ? `<div class="muted">RIF: ${esc(s.rif)}</div>` : ''}${s.address ? `<div class="muted">${esc(s.address)}</div>` : ''}<div class="muted">${[s.phone && 'Tel: ' + esc(s.phone), s.instagram && 'IG: ' + esc(s.instagram)].filter(Boolean).join(' · ')}</div></div>
      <div class="os"><div class="t">ORDEN DE SERVICIO</div><div class="n">${esc(r.number)}</div><div class="muted">${fmtDateTime(r.createdAt)}</div>${r.isWarranty ? '<div><b>INGRESO POR GARANTÍA</b></div>' : ''}</div>
    </div>
    <div class="side">
      <div class="grow">
        <h3>Cliente</h3>
        <div class="grid"><div><span>Nombre:</span> <b>${esc(r.customerName)}</b></div><div><span>C.I./RIF:</span> ${esc(r.customerIdDoc || '—')}</div><div><span>Teléfono:</span> ${esc(r.customerPhone || '—')}</div><div><span>Recibido por:</span> ${esc(r.receivedBy || '—')}</div></div>
        <h3>Equipo</h3>
        <div class="grid">
          <div><span>Tipo:</span> ${esc(DEVICE_TYPES[dev.type]?.label || '—')}</div><div><span>Marca / modelo:</span> <b>${esc(deviceName(dev))}</b></div>
          <div><span>Color:</span> ${esc(dev.color || '—')}</div><div><span>IMEI / Serial:</span> ${esc(dev.imei || '—')}</div>
          <div><span>Desbloqueo:</span> ${unlock}</div><div><span>Técnico:</span> ${esc(r.technician || 'Por asignar')}</div>
          ${r.promisedAt ? `<div><span>Entrega estimada:</span> <b>${fmtDate(r.promisedAt)}</b></div>` : ''}<div><span>Prioridad:</span> ${r.priority === 'urgente' ? '<b>URGENTE</b>' : 'Normal'}</div>
        </div>
      </div>
      ${qr ? `<div class="box" style="margin-top:14px"><img src="${qr}" style="width:120px;height:120px"><div>Consulta tu equipo en línea<br>Código <b style="font-size:13px">${esc(r.trackCode)}</b></div></div>` : ''}
      ${dev.unlockType === 'pattern' && dev.pattern?.length ? `<div class="box" style="margin-top:14px">${patternSVG(dev.pattern, 96, { color: '#0284c7', dot: '#b8c2d0', print: true })}<div>Patrón</div></div>` : ''}
    </div>
    <h3>Falla reportada</h3>
    <div>${r.faultTags?.length ? `<div class="tags">${r.faultTags.map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : ''}${esc(r.fault || '—')}</div>
    <h3>Estado físico, accesorios y pruebas</h3>
    <div class="grid"><div><span>Estado:</span> ${esc((r.condition || []).join(', ') || '—')}${r.conditionNote ? ' · ' + esc(r.conditionNote) : ''}</div><div><span>Accesorios recibidos:</span> ${esc((r.accessories || []).join(', ') || 'Ninguno')}</div></div>
    ${checksTable(r)}
    ${(r.items || []).length ? `<h3>Presupuesto</h3><table class="items"><thead><tr><th>Descripción</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">Total</th></tr></thead><tbody>
      ${r.items.map((i) => `<tr><td>${esc(i.name)}</td><td class="r">${qtyFmt(i.qty)}</td><td class="r">$${num(i.price)}</td><td class="r">$${num(i.price * i.qty)}</td></tr>`).join('')}
      ${r.discount > 0 ? `<tr><td colspan="3" class="r">Descuento</td><td class="r">-$${num(r.discount)}</td></tr>` : ''}
      <tr><td colspan="3" class="r"><b>TOTAL</b></td><td class="r"><b>$${num(total)}</b><div class="muted">Bs ${num(total * store.rate)}</div></td></tr>
      ${r.paid ? `<tr><td colspan="3" class="r">Abonado</td><td class="r">$${num(r.paid)}</td></tr><tr><td colspan="3" class="r"><b>Saldo</b></td><td class="r"><b>$${num(repairBalance(r))}</b></td></tr>` : ''}
    </tbody></table>` : ''}
    ${r.warrantyDays ? `<div style="margin-top:8px"><b>Garantía:</b> ${r.warrantyDays} días a partir de la entrega.</div>` : ''}
    <div class="terms"><b>Términos y condiciones:</b> ${esc(s.terms || '')}</div>
    <div class="sign"><div>Firma del cliente</div><div>Firma y sello del taller</div></div>
    <p class="muted" style="font-size:9px;text-align:center;margin-top:16px">Sano-Técnico · Sistema para servicios técnicos</p>
  </body></html>`);
}

/** Etiqueta pequeña para pegar en el equipo (número de orden, cliente y QR) */
export async function printLabel(r) {
  const qr = r.trackCode ? await qrDataURL(trackUrl(r.trackCode), 3) : '';
  printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style><title>Etiqueta ${esc(r.number)}</title><style>
    @page { size: 58mm 30mm; margin: 1mm; } body { margin: 0; font-family: Arial, sans-serif; color: #000; }
    .l { display: flex; gap: 4px; align-items: center; width: 56mm; height: 28mm; } .l img { width: 24mm; height: 24mm; }
    .n { font-size: 15px; font-weight: 800; } .t { font-size: 9px; line-height: 1.2; }
  </style></head><body><div class="l">${qr ? `<img src="${qr}">` : ''}<div><div class="n">${esc(r.number)}</div><div class="t"><b>${esc(String(r.customerName || '').slice(0, 22))}</b><br>${esc(deviceName(r.device).slice(0, 24))}<br>${esc((r.fault || '').slice(0, 40))}<br>${fmtDate(r.createdAt)}</div></div></div></body></html>`);
}

/** Documento imprimible genérico (reportes, cierres, listas) */
export function printDoc(title, inner) {
  printHTML(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>:root{color-scheme:light}html,body{background:#fff;color:#000}</style><title>${esc(title)}</title>
  <style>
    @page { margin: 14mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 12px; }
    h1 { font-size: 18px; margin: 0 0 2px; } h2 { font-size: 14px; margin: 16px 0 6px; }
    .muted { color: #555; } table { width: 100%; border-collapse: collapse; margin-top: 6px; }
    th { background: #0284c7; color: #fff; text-align: left; padding: 6px; font-size: 11px; }
    td { padding: 5px 6px; border-bottom: 1px solid #ddd; } .r { text-align: right; }
    .kpis { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
    .kpi { border: 1px solid #ccc; border-radius: 6px; padding: 8px 10px; min-width: 140px; }
    .kpi b { display: block; font-size: 15px; }
  </style></head><body>
  <h1>${esc(store.businessName)}</h1>
  <div class="muted">${esc(title)} · Generado ${fmtDateTime(new Date().toISOString())}</div>
  ${inner}
  <p class="muted" style="margin-top:20px;font-size:10px">Sano-Técnico — Sistema para servicios técnicos</p>
  </body></html>`);
}

export function stockText(p) { return `${qtyFmt(Math.round((Number(p.stock) || 0) * 1000) / 1000)} und`; }

export function notifyLowStock(list) {
  if (!list?.length) return;
  const names = list.slice(0, 3).map((i) => `${i.name} (${qtyFmt(i.stock)})`).join(', ');
  toast(`Stock bajo: ${names}${list.length > 3 ? ` y ${list.length - 3} más` : ''}`, 'warning', 6000);
}

/** Línea de checks (OK / falla) como chips pequeños */
export function checksChips(checks = {}) {
  const items = CHECKS.filter(([k]) => checks[k]);
  if (!items.length) return '<span class="faint small">Sin pruebas registradas</span>';
  return `<div class="chk-mini">${items.map(([k, l]) => `<span class="cm ${CHECK_STATES[checks[k]]?.cls || 'na'}">${esc(l)}</span>`).join('')}</div>`;
}

export const statusTone = (s) => STATUS[s]?.tone || 'neutral';
export { usd, bs };
