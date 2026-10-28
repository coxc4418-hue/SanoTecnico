// Sano-Técnico — Recorrido guiado: ilumina zonas de la pantalla y explica para qué sirven
import { esc, openModal, closeAllModals } from './utils.js';
import { icon } from './icons.js';

// Cada paso: { route, sel: [selectores alternativos], title, text }. Sin elemento visible → tarjeta centrada.
export const TOURS = {
  general: {
    name: 'Recorrido general', desc: 'Lo esencial del sistema en 1 minuto', icon: 'sparkle',
    steps: [
      { route: 'inicio', title: '¡Bienvenido a Sano-Técnico! 👋', text: 'Te mostramos en un minuto cómo funciona tu taller aquí. Usa “Siguiente” para avanzar o “Salir” cuando quieras. Puedes repetir este recorrido desde el menú › Ayuda.' },
      { route: 'inicio', sel: ['.sb-nav', '.bottom-nav'], title: 'Menú principal', text: 'Desde aquí entras a cada sección: recibir equipos, órdenes, garantías, vender accesorios, facturación, caja, clientes, inventario, técnicos y reportes. Los números de colores son avisos pendientes.' },
      { route: 'inicio', sel: ['#sb-search', '.sb-search', '#tb-search'], title: 'Búsqueda rápida', text: 'Encuentra cualquier orden por número, cliente, teléfono, modelo, IMEI o código de seguimiento. En la computadora: Ctrl + K.' },
      { route: 'inicio', sel: ['#sb-rate', '#tb-rate'], title: 'Tasa del día', text: 'Los precios se guardan en dólares y se muestran en bolívares con esta tasa. Se actualiza sola con la tasa BCV y puedes cambiarla tocando aquí.' },
      { route: 'inicio', sel: ['[data-tour="kpis"]'], title: 'Resumen del día', text: 'Lo cobrado hoy en $ y Bs, equipos en el taller, listos para entregar y órdenes atrasadas según la fecha prometida.' },
      { route: 'inicio', sel: ['[data-tour="pipeline"]'], title: 'Equipos por etapa', text: 'Cuántos equipos hay en cada etapa: recibido, diagnóstico, presupuesto, esperando repuesto, en reparación y listo. Toca una etapa para verlos.' },
      { route: 'recibir', sel: ['#in-s1'], title: 'Recibir un equipo', text: 'La orden de servicio en 5 pasos: cliente, equipo (marca, modelo, IMEI, clave o patrón), falla, revisión al recibir con fotos, y presupuesto con abono opcional.' },
      { route: 'recibir', sel: ['#in-s4'], title: 'Revisión al recibir', text: 'Marca qué funciona y qué no, el estado físico y los accesorios que deja el cliente. Queda impreso en la orden y te protege ante reclamos.' },
      { route: 'ordenes', sel: ['#o-board', '#o-body'], title: 'Tablero del taller', text: 'Cada columna es una etapa. Toca una tarjeta para ver la orden completa, cambiar el estado, armar el presupuesto con repuestos del inventario, cobrar abonos y entregar.' },
      { route: 'ordenes', sel: ['#o-mode'], title: 'Tablero, lista o historial', text: 'Cambia la vista a lista o consulta el historial de equipos entregados y cancelados, y expórtalo a Excel.' },
      { route: 'vender', sel: ['#pos-grid'], title: 'Vender accesorios', text: 'Vende forros, cargadores, vidrios templados y más. Se descuentan del inventario al cobrar.' },
      { route: 'vender', sel: ['#c-pay', '#cart-fab'], title: 'Cobro en $ y Bs', text: 'Acepta varias formas de pago a la vez (efectivo $, efectivo Bs, punto, pago móvil, Zelle…) y calcula el vuelto en la moneda que elijas.' },
      { route: 'caja', sel: ['#k-body'], title: 'Caja', text: 'Abre la caja con el efectivo de fondo, registra gastos y al cerrar cuenta el dinero: el sistema te dice si sobra o falta, en $ y en Bs.' },
      { route: 'caja', sel: ['.sb-nav [data-nav="reportes"]', '.sb-nav [data-nav="tecnicos"]'], title: 'Reportes y técnicos', text: 'Ingresos, ganancia, fallas y marcas más comunes, servicios más vendidos y comisiones de cada técnico. Los reportes están protegidos con el PIN del dueño (en la demo: 1234).' },
      { route: 'caja', sel: ['.sb-foot [data-install]', '.topbar [data-install]'], title: 'Instala la app', text: 'Instala Sano-Técnico en el teléfono, la tablet o la computadora desde el navegador: queda con su ícono, abre en su propia ventana y todo se sincroniza.' },
      { route: 'inicio', title: '¡Listo para trabajar! 🎉', text: 'Prueba ahora: toca “Recibir equipo”, registra un celular y luego muévelo por las etapas hasta entregarlo. Tu cliente recibe un código para consultar el estado en línea. Más recorridos en el menú › Ayuda.', final: true }
    ]
  },
  recibir: {
    name: 'Recibir un equipo', desc: 'Orden de servicio paso a paso', icon: 'inbox',
    steps: [
      { route: 'recibir', sel: ['#in-s1'], title: '1. Cliente', text: 'Busca por nombre, teléfono o cédula. Si es nuevo, escribe su nombre y teléfono: se registra solo al guardar.' },
      { route: 'recibir', sel: ['#in-s2'], title: '2. Equipo', text: 'Tipo, marca y modelo (con sugerencias), color, capacidad e IMEI (se valida). Anota la clave, PIN o dibuja el patrón de desbloqueo: queda protegido con el PIN del taller.' },
      { route: 'recibir', sel: ['#in-s3'], title: '3. Falla', text: 'Toca las fallas comunes o descríbela con tus palabras, tal como la cuenta el cliente.' },
      { route: 'recibir', sel: ['#in-s4'], title: '4. Revisión', text: 'Prueba rápida de funciones, estado físico (rayones, golpes, humedad), accesorios recibidos y hasta 4 fotos del equipo.' },
      { route: 'recibir', sel: ['#in-s5'], title: '5. Presupuesto', text: 'Agrega servicios y repuestos, asigna un técnico, la fecha prometida y la garantía. Puedes cobrar un abono en ese momento.' },
      { route: 'recibir', sel: ['#in-save', '#in-save-m'], title: 'Guardar e imprimir', text: 'Se genera el número de orden y un código de seguimiento con QR. Imprime la orden en hoja carta con firmas, o el ticket y la etiqueta para pegar al equipo.' }
    ]
  },
  ordenes: {
    name: 'Órdenes y entregas', desc: 'Estados, presupuesto, abonos y entrega', icon: 'columns',
    steps: [
      { route: 'ordenes', sel: ['#o-chips'], title: 'Filtros por etapa', text: 'Filtra rápido por estado o por técnico.' },
      { route: 'ordenes', sel: ['#o-board', '#o-body'], title: 'Tablero', text: 'Las tarjetas muestran el equipo, la falla, el cliente y el tiempo en el taller. En rojo, las atrasadas; con una etiqueta, las urgentes.' },
      { route: 'ordenes', sel: ['.rcard'], title: 'Abrir una orden', text: 'Dentro de la orden: cambia el estado y avísale al cliente por WhatsApp con un mensaje listo, arma el presupuesto (los repuestos se descuentan del inventario), registra abonos, agrega fotos y revisa el historial.' },
      { route: 'ordenes', sel: ['#o-search'], title: 'Buscar', text: 'Por número de orden, cliente, teléfono, modelo, IMEI o código.' }
    ]
  },
  inventario: {
    name: 'Inventario', desc: 'Repuestos, accesorios, compras y alertas', icon: 'box',
    steps: [
      { route: 'inventario', sel: ['#i-kpis'], title: 'Estado del inventario', text: 'Cuántos productos tienes, cuáles están bajos o agotados y cuánto vale tu inventario al costo.' },
      { route: 'inventario', sel: ['#i-new'], title: 'Nuevo producto', text: 'Registra repuestos (pantallas, baterías, pines…) con sus modelos compatibles, y accesorios para vender. Marca “Solo taller” para lo que no se vende en mostrador.' },
      { route: 'inventario', sel: ['#i-buy'], title: 'Registrar compra', text: 'Suma la mercancía con lo que pagaste: el costo promedio se actualiza solo. Puedes pagarla con dinero de la caja.' },
      { route: 'inventario', sel: ['[data-mv]'], title: 'Mover', text: 'Para cada producto: compra, entrada, merma (pieza dañada) o ajuste por conteo físico.' },
      { route: 'inventario', sel: ['[data-tab="shop"]'], title: 'Lista de compras', text: 'Te sugiere qué comprar y cuánto, y la envías por WhatsApp al proveedor.' }
    ]
  },
  caja: {
    name: 'Caja', desc: 'Abrir, gastos y cierre con arqueo', icon: 'wallet',
    steps: [
      { route: 'caja', sel: ['#k-body .kpis', '#k-open'], title: 'Turno de caja', text: 'Muestra lo cobrado en el turno (reparaciones, abonos y ventas) y el efectivo esperado en dólares y en bolívares.' },
      { route: 'caja', sel: ['#k-out'], title: 'Gastos', text: 'Registra lo que sale de la caja: compra de repuestos, pasajes, pagos a técnicos… Así el cierre cuadra.' },
      { route: 'caja', sel: ['#k-close'], title: 'Cerrar caja', text: 'Cuenta el efectivo y escríbelo: el sistema calcula si sobra o falta y te da un reporte de cierre para imprimir.' }
    ]
  }
};

let state = null;

const visible = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && getComputedStyle(el).visibility !== 'hidden'; };
async function findTarget(sels = [], timeout = 2500) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    for (const s of sels) { const el = [...document.querySelectorAll(s)].find(visible); if (el) return el; }
    await new Promise((r) => setTimeout(r, 120));
  }
  return null;
}

/** Inicia un recorrido (por defecto el general). */
export async function startTour(id = 'general') {
  stopTour();
  const tour = TOURS[id];
  if (!tour) return;
  const root = document.createElement('div');
  root.className = 'tour';
  root.innerHTML = '<div class="tour-block"></div><div class="tour-spot"></div><div class="tour-tip" role="dialog" aria-live="polite"></div>';
  document.body.appendChild(root);
  state = { id, tour, i: 0, root, target: null };
  const onKey = (e) => {
    if (!state) return;
    if (e.key === 'Escape') { e.stopPropagation(); stopTour(); }
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  };
  const onResize = () => place();
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('resize', onResize);
  window.addEventListener('scroll', onResize, true);
  state.cleanup = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onResize, true); };
  await show();
}

export function stopTour() {
  if (!state) return;
  state.cleanup?.();
  state.root.remove();
  state = null;
  try { localStorage.setItem('st_tour_done', '1'); } catch (_) {}
}
export const tourActive = () => !!state;

async function go(d) {
  if (!state) return;
  const n = state.i + d;
  if (n < 0) return;
  if (n >= state.tour.steps.length) { stopTour(); return; }
  state.i = n;
  await show();
}

async function show() {
  const s = state.tour.steps[state.i];
  const tip = state.root.querySelector('.tour-tip');
  tip.classList.add('busy');
  const { navigate } = await import('./main.js');
  if (s.route && location.hash.replace(/^#\/?/, '') !== s.route) {
    await navigate(s.route);
    await new Promise((r) => setTimeout(r, 350));
  }
  if (!state) return;
  closeAllModals();
  state.target = s.sel ? await findTarget(s.sel) : null;
  if (!state) return;
  if (state.target) state.target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
  const total = state.tour.steps.length;
  tip.innerHTML = `
    <div class="tour-step">${state.i + 1} de ${total}</div>
    <div class="tour-title">${esc(s.title)}</div>
    <div class="tour-text">${esc(s.text)}</div>
    <div class="tour-dots">${Array.from({ length: total }, (_, k) => `<i class="${k === state.i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="tour-actions">
      <button type="button" class="btn btn-ghost btn-sm" data-t="stop">${s.final ? 'Cerrar' : 'Salir'}</button>
      <span class="grow"></span>
      ${state.i > 0 ? `<button type="button" class="btn btn-secondary btn-sm" data-t="prev">${icon('arrowLeft')}</button>` : ''}
      ${s.final ? `<button type="button" class="btn btn-secondary btn-sm" data-t="video">${icon('eye')} Ver video</button>` : ''}
      <button type="button" class="btn btn-primary btn-sm" data-t="next">${state.i === total - 1 ? 'Terminar' : 'Siguiente'} ${state.i === total - 1 ? '' : icon('arrowRight')}</button>
    </div>`;
  tip.querySelector('[data-t="stop"]').onclick = stopTour;
  tip.querySelector('[data-t="next"]').onclick = () => go(1);
  const pv = tip.querySelector('[data-t="prev"]'); if (pv) pv.onclick = () => go(-1);
  const vd = tip.querySelector('[data-t="video"]'); if (vd) vd.onclick = () => { stopTour(); openVideo(); };
  tip.classList.remove('busy');
  place();
  tip.querySelector('[data-t="next"]').focus({ preventScroll: true });
}

function place() {
  if (!state) return;
  const spot = state.root.querySelector('.tour-spot');
  const tip = state.root.querySelector('.tour-tip');
  const vw = innerWidth, vh = innerHeight, pad = 8;
  const el = state.target;
  if (!el || !document.contains(el)) {
    spot.style.cssText = `left:${vw / 2}px;top:${vh / 2}px;width:0;height:0;`;
    tip.className = 'tour-tip center';
    tip.style.left = `${Math.max(12, (vw - tip.offsetWidth) / 2)}px`;
    tip.style.top = `${Math.max(12, (vh - tip.offsetHeight) / 2)}px`;
    return;
  }
  const r = el.getBoundingClientRect();
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - x - 4, r.width + pad * 2), h = Math.min(vh - y - 4, r.height + pad * 2);
  spot.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
  const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 14;
  let left, top, side;
  if (y + h + gap + th <= vh - 8) { side = 'bottom'; top = y + h + gap; left = x + w / 2 - tw / 2; }
  else if (y - gap - th >= 8) { side = 'top'; top = y - gap - th; left = x + w / 2 - tw / 2; }
  else if (x + w + gap + tw <= vw - 8) { side = 'right'; left = x + w + gap; top = y + h / 2 - th / 2; }
  else if (x - gap - tw >= 8) { side = 'left'; left = x - gap - tw; top = y + h / 2 - th / 2; }
  else { side = 'inside'; left = vw / 2 - tw / 2; top = vh - th - 16; }
  left = Math.max(10, Math.min(vw - tw - 10, left));
  top = Math.max(10, Math.min(vh - th - 10, top));
  tip.className = `tour-tip side-${side}`;
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
}

// ======================================================================
// Ayuda: lista de recorridos y video tutorial
// ======================================================================
export const VIDEO_URL = '/tutorial/sano-tecnico-tutorial.mp4';

export function openVideo() {
  const m = openModal({
    title: 'Video tutorial', sub: 'Cómo usar Sano-Técnico, paso a paso', size: 'xl',
    body: `<video class="tutorial-video" src="${VIDEO_URL}" poster="/tutorial/portada.jpg" controls autoplay playsinline preload="metadata"></video>`,
    footer: '<a class="btn btn-secondary" href="' + VIDEO_URL + '" download>' + icon('download') + ' Descargar</a><button class="btn btn-primary" data-close>Cerrar</button>'
  });
  return m;
}

export function openHelp() {
  const m = openModal({
    title: 'Ayuda', sub: 'Elige un recorrido guiado o mira el video tutorial', size: 'md',
    body: `<div class="stack">
      <button type="button" class="help-video" data-video><span class="help-play">${icon('arrowRight')}</span><span><b>Video tutorial</b><small>Las funciones principales explicadas con voz</small></span></button>
      <div class="section-title">Recorridos guiados</div>
      <div class="help-list">${Object.entries(TOURS).map(([k, t]) => `<button type="button" class="help-item" data-tour-id="${k}"><span class="kpi-icon tone-brand" style="width:36px;height:36px">${icon(t.icon)}</span><span class="grow"><b>${esc(t.name)}</b><small>${esc(t.desc)}</small></span>${icon('arrowRight')}</button>`).join('')}</div>
    </div>`,
    footer: '<button class="btn btn-primary" data-close>Cerrar</button>'
  });
  m.el.querySelector('[data-video]').onclick = () => { m.close(); openVideo(); };
  m.el.querySelectorAll('[data-tour-id]').forEach((b) => b.onclick = () => { m.close(); startTour(b.dataset.tourId); });
}
