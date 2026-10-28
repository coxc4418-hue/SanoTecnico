// Sano-Técnico — Operaciones: órdenes de servicio, presupuestos, abonos, entregas, ventas, caja e inventario
import { auth } from './firebase.js';
import { store, STATUS, DEVICE_TYPES, isOpenStatus } from './store.js';
import { round2, round4, nowISO, todayKey, PAY_METHODS, shortId, addDays } from './utils.js';

export const APP_URL = 'https://sano-tecnico.web.app';
const by = () => (auth.currentUser?.isAnonymous ? 'demo' : (auth.currentUser?.email || '').split('@')[0] || '—');
const FLOW0 = () => ({ inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 });

const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genTrackCode() {
  return Array.from(crypto.getRandomValues(new Uint32Array(6)), (x) => CODE_ALPHA[x % CODE_ALPHA.length]).join('');
}
export const trackUrl = (code) => `${APP_URL}/estado/${code}`;
export const fmtSeq = (prefix, n, len = 5) => `${prefix}-${String(n).padStart(len, '0')}`;

export function deviceName(d = {}) {
  return [d.brand && d.brand !== 'Otra' ? d.brand : '', d.model].filter(Boolean).join(' ').trim() || DEVICE_TYPES[d.type]?.label || 'Equipo';
}

// ======================================================================
// TOTALES
// ======================================================================
export function itemsTotal(items) { return round2((items || []).reduce((a, i) => a + (Number(i.price) || 0) * (Number(i.qty) || 0), 0)); }
export function itemsCost(items) { return round2((items || []).reduce((a, i) => a + (Number(i.cost) || 0) * (Number(i.qty) || 0), 0)); }
export function repairBalance(r) { return round2(Math.max(0, (Number(r.total) || 0) - (Number(r.discount) || 0) - (Number(r.paid) || 0))); }

// ======================================================================
// PAGOS Y CAJA
// ======================================================================
/** Normaliza los pagos: [{method, amount}] en la moneda del método → con equivalente en $ */
export function normalizePays(payments, rate) {
  return (payments || []).filter((p) => p.amount > 0.004).map((p) => {
    const cur = PAY_METHODS[p.method]?.cur || 'USD';
    return { method: p.method, currency: cur, amount: round2(p.amount), usd: round4(cur === 'BS' ? p.amount / rate : p.amount) };
  });
}

/** Lo que realmente queda por forma de pago (en $): lo pagado menos el vuelto, que sale del efectivo de esa moneda. */
export function methodNet(sale) {
  const m = {};
  (sale.payments || []).forEach((p) => { m[p.method] = round4((m[p.method] || 0) + (p.usd || 0)); });
  const ch = Number(sale.changeUSD) || 0;
  if (ch > 0.004) { const k = sale.changeCurrency === 'BS' ? 'efectivo_bs' : 'efectivo_usd'; m[k] = round4((m[k] || 0) - ch); }
  return m;
}

export function cashFlowOf(payments, changeUSD, changeCurrency, rate) {
  const f = FLOW0();
  for (const p of payments) {
    if (p.method === 'efectivo_usd') f.inUSD += p.amount;
    if (p.method === 'efectivo_bs') f.inBs += p.amount;
  }
  if (changeUSD > 0.004) {
    if (changeCurrency === 'BS') f.outBs += round2(changeUSD * rate);
    else f.outUSD += round2(changeUSD);
  }
  for (const k in f) f[k] = round2(f[k]);
  return f;
}

function shiftIncrements(flow, extra = {}) {
  const u = {};
  for (const k of ['inUSD', 'inBs', 'outUSD', 'outBs']) if (flow[k]) u[k] = store.inc(flow[k]);
  for (const [k, v] of Object.entries(extra)) if (v) u[k] = store.inc(round4(v));
  u.updatedAt = nowISO();
  return u;
}

/** Valida los pagos contra el monto a cobrar y prepara el registro de caja */
function preparePayment({ amount, payments, changeCurrency = 'BS' }) {
  const rate = store.rate;
  if (!(rate > 0)) throw new Error('Configura la tasa del día antes de cobrar.');
  const shift = store.openShift;
  if (!shift) throw new Error('Abre la caja antes de cobrar (menú Caja).');
  const pays = normalizePays(payments, rate);
  const paidUSD = round4(pays.reduce((a, p) => a + p.usd, 0));
  if (paidUSD < amount - 0.01) throw new Error(`Falta por cobrar $${round2(amount - paidUSD).toFixed(2)}.`);
  const changeUSD = round2(Math.max(0, paidUSD - amount));
  const flow = cashFlowOf(pays, changeUSD, changeCurrency, rate);
  return { rate, shift, pays, paidUSD, changeUSD, changeCurrency, flow, received: round2(paidUSD - changeUSD) };
}

function addToShift(b, pay) {
  const byMethod = {};
  for (const [k, v] of Object.entries(methodNet({ payments: pay.pays, changeUSD: pay.changeUSD, changeCurrency: pay.changeCurrency }))) byMethod[`byMethod.${k}`] = v;
  b.update(store.ref('cash_shifts', pay.shift.id), shiftIncrements(pay.flow, { salesCount: 1, salesTotal: pay.received, ...byMethod }));
}

function customerFields(c) {
  return { customerId: c?.id || null, customerName: c?.name || 'Cliente de mostrador', customerPhone: c?.phone || '', customerIdDoc: c?.idDoc || '' };
}

function paymentFields(pay) {
  return {
    rate: pay.rate, payments: pay.pays, paidUSD: pay.paidUSD, changeUSD: pay.changeUSD, changeCurrency: pay.changeCurrency,
    method: pay.pays.length === 1 ? pay.pays[0].method : pay.pays.length ? 'mixto' : 'ninguno', received: pay.received,
    shiftId: pay.shift?.id || null, cashFlow: pay.flow
  };
}

// ======================================================================
// SEGUIMIENTO PÚBLICO
// ======================================================================
function trackingDoc(r) {
  const s = store.settings;
  return {
    tenantId: store.tenantId,
    code: r.trackCode,
    number: r.number,
    business: { name: store.businessName, phone: s.phone || '', whatsapp: s.whatsapp || s.phone || '', address: s.address || '', instagram: s.instagram || '' },
    device: deviceName(r.device), deviceType: r.device?.type || 'celular',
    customer: String(r.customerName || '').split(' ')[0],
    fault: r.fault || '',
    publicNote: r.publicNote || '',
    status: r.status, statusLabel: STATUS[r.status]?.label || r.status,
    history: (r.history || []).map((h) => ({ s: h.status, at: h.at })),
    items: (r.items || []).filter((i) => i.qty > 0).map((i) => ({ name: i.name, total: round2(i.price * i.qty) })),
    total: round2((r.total || 0) - (r.discount || 0)), paid: round2(r.paid || 0), balance: repairBalance(r),
    approved: !!r.approved,
    promisedAt: r.promisedAt || null, warrantyUntil: r.warrantyUntil || null, deliveredAt: r.deliveredAt || null,
    createdAt: r.createdAt, updatedAt: nowISO(),
    demo: store.isDemo
  };
}
export function syncTracking(b, r) { if (r.trackCode) b.set(store.trackRef(r.trackCode), trackingDoc(r)); }

// ======================================================================
// ÓRDENES DE SERVICIO
// ======================================================================
/** Aplica al inventario la diferencia de repuestos entre dos listas de ítems */
function applyPartsDelta(b, oldItems, newItems, refLabel) {
  const qtyMap = (items) => {
    const m = new Map();
    (items || []).forEach((i) => { if (i.productId) m.set(i.productId, (m.get(i.productId) || 0) + (Number(i.qty) || 0)); });
    return m;
  };
  const before = qtyMap(oldItems); const after = qtyMap(newItems);
  const ids = new Set([...before.keys(), ...after.keys()]);
  const date = nowISO();
  const low = [];
  for (const id of ids) {
    const p = store.product(id);
    const delta = round4((after.get(id) || 0) - (before.get(id) || 0));
    if (!p || !delta || p.trackStock === false) continue;
    b.update(store.ref('products', id), { stock: store.inc(-delta), updatedAt: date });
    b.set(store.newRef('inventory_logs'), { productId: id, name: p.name, date, dayKey: todayKey(), type: delta > 0 ? 'uso' : 'devolucion', qty: -delta, cost: Number(p.cost) || 0, reason: refLabel, by: by() });
    const left = (Number(p.stock) || 0) - delta;
    if (delta > 0 && left <= (Number(p.minStock) || 0)) low.push({ ...p, stock: left });
  }
  return low;
}

export function cleanItems(items) {
  return (items || []).filter((i) => i && i.name && Number(i.qty) > 0).map((i) => ({
    id: i.id || shortId(6), kind: i.kind || (i.productId ? 'repuesto' : 'servicio'), productId: i.productId || null, name: String(i.name).trim(),
    qty: round4(Number(i.qty) || 1), price: round2(Number(i.price) || 0), cost: round4(Number(i.cost) || 0)
  }));
}

/**
 * Crea una orden de servicio (recepción del equipo).
 * deposit: { amount, payments, changeCurrency } opcional (abono inicial)
 */
export async function createRepair(data, deposit = null) {
  if (deposit && deposit.amount > 0) preparePayment(deposit); // valida antes de escribir
  const b = store.batch();
  const date = nowISO();
  let customer = data.customer;
  if (customer && !customer.id) {
    const cref = store.newRef('customers');
    customer = { ...customer, id: cref.id };
    b.set(cref, { name: customer.name, phone: customer.phone || '', idDoc: customer.idDoc || '', email: customer.email || '', address: customer.address || '', notes: '', repairs: 1, totalSpent: 0, createdAt: date, lastVisitAt: date });
  } else if (customer?.id) {
    b.update(store.ref('customers', customer.id), { repairs: store.inc(1), lastVisitAt: date });
  }
  const seq = store.nextSeq(b, 'os');
  const ref = store.newRef('repairs');
  const items = cleanItems(data.items);
  const tech = data.technicianId ? store.tech(data.technicianId) : null;
  const status = data.status || 'recibido';
  const r = {
    number: fmtSeq('OS', seq, 4), seq, trackCode: genTrackCode(),
    status, open: true, createdAt: date, updatedAt: date, statusAt: date, dayKey: todayKey(),
    ...customerFields(customer),
    device: data.device || {}, accessories: data.accessories || [], condition: data.condition || [], conditionNote: data.conditionNote || '',
    checks: data.checks || {}, fault: data.fault || '', faultTags: data.faultTags || [], diagnosis: data.diagnosis || '', techNotes: '', publicNote: '',
    photos: data.photos || [],
    priority: data.priority || 'normal', technicianId: tech?.id || null, technician: tech?.name || '',
    promisedAt: data.promisedAt || null,
    items, total: itemsTotal(items), cost: itemsCost(items), discount: 0, paid: 0,
    approved: !!data.approved, approvedAt: data.approved ? date : null,
    warrantyDays: Number(data.warrantyDays ?? store.settings.warrantyDays) || 0, warrantyUntil: null,
    warrantyOf: data.warrantyOf || null, isWarranty: !!data.warrantyOf,
    history: [{ at: date, status, note: data.warrantyOf ? 'Ingreso por garantía' : 'Equipo recibido', by: by() }],
    receivedBy: by()
  };
  const low = applyPartsDelta(b, [], items, `Orden ${r.number}`);
  let receipt = null;
  if (deposit && deposit.amount > 0) {
    const pay = preparePayment(deposit);
    receipt = depositSale(b, { id: ref.id, ...r }, pay, deposit.amount);
    r.paid = round2(deposit.amount);
    r.history.push({ at: date, status, note: `Abono de $${round2(deposit.amount).toFixed(2)} (${receipt.number})`, by: by() });
  }
  b.set(ref, r);
  syncTracking(b, r);
  await store.commit(b);
  return { repair: { id: ref.id, ...r }, receipt, low };
}

/** Cambia datos de una orden (y su historial / seguimiento) */
export async function updateRepair(repair, patch, note = '') {
  const b = store.batch();
  const date = nowISO();
  const next = { ...repair, ...patch, updatedAt: date };
  if (note) next.history = [...(repair.history || []), { at: date, status: next.status, note, by: by() }];
  const { id, ...data } = next;
  b.set(store.ref('repairs', repair.id), data);
  syncTracking(b, next);
  await store.commit(b);
  return next;
}

export async function setRepairStatus(repair, status, note = '') {
  if (!STATUS[status]) throw new Error('Estado inválido');
  if (!isOpenStatus(status)) throw new Error('Usa Entregar o Cancelar para cerrar la orden.');
  const date = nowISO();
  const patch = { status, statusAt: date };
  if (status === 'reparacion' && !repair.approved) { patch.approved = true; patch.approvedAt = date; }
  if (status === 'listo') patch.readyAt = date;
  return updateRepair(repair, patch, note || STATUS[status].desc);
}

/** Guarda el presupuesto (servicios y repuestos). Los repuestos se descuentan del inventario al agregarlos. */
export async function saveRepairItems(repair, items, { discount = repair.discount || 0, note = 'Presupuesto actualizado' } = {}) {
  const clean = cleanItems(items);
  const b = store.batch();
  const date = nowISO();
  const low = applyPartsDelta(b, repair.items, clean, `Orden ${repair.number}`);
  const next = { ...repair, items: clean, total: itemsTotal(clean), cost: itemsCost(clean), discount: round2(discount), updatedAt: date };
  next.history = [...(repair.history || []), { at: date, status: next.status, note: `${note}: $${round2(next.total - next.discount).toFixed(2)}`, by: by() }];
  const { id, ...data } = next;
  b.set(store.ref('repairs', repair.id), data);
  syncTracking(b, next);
  await store.commit(b);
  return { repair: next, low };
}

function depositSale(b, repair, pay, amount) {
  const seq = store.nextSeq(b, 'rec');
  const ref = store.newRef('sales');
  const sale = {
    number: fmtSeq('R', seq), seq, kind: 'abono', date: nowISO(), dayKey: todayKey(),
    items: [{ name: `Abono a la orden ${repair.number} · ${deviceName(repair.device)}`, qty: 1, price: round2(amount), cost: 0, kind: 'abono' }],
    subtotal: round2(amount), discount: 0, total: round2(amount), prepaid: 0, due: round2(amount), cost: 0,
    totalBs: round2(amount * pay.rate),
    ...paymentFields(pay),
    customerId: repair.customerId, customerName: repair.customerName, customerPhone: repair.customerPhone, customerIdDoc: repair.customerIdDoc || '',
    repairId: repair.id, repairNumber: repair.number, device: deviceName(repair.device),
    status: 'completed', by: by()
  };
  b.set(ref, sale);
  addToShift(b, pay);
  return { id: ref.id, ...sale };
}

/** Registra un abono (pago parcial) a una orden abierta */
export async function registerDeposit(repair, { amount, payments, changeCurrency }) {
  amount = round2(amount);
  if (!(amount > 0)) throw new Error('Indica el monto del abono.');
  const pay = preparePayment({ amount, payments, changeCurrency });
  const b = store.batch();
  const receipt = depositSale(b, repair, pay, amount);
  const date = nowISO();
  const next = { ...repair, paid: round2((repair.paid || 0) + amount), updatedAt: date };
  next.history = [...(repair.history || []), { at: date, status: repair.status, note: `Abono de $${amount.toFixed(2)} (${receipt.number})`, by: by() }];
  const { id, ...data } = next;
  b.set(store.ref('repairs', repair.id), data);
  syncTracking(b, next);
  await store.commit(b);
  return { repair: next, receipt };
}

/** Entrega el equipo: cobra el saldo, emite la factura y activa la garantía */
export async function deliverRepair(repair, { payments = [], changeCurrency = 'BS', discount = repair.discount || 0, note = '' } = {}) {
  const total = round2((repair.total || 0) - discount);
  const due = round2(Math.max(0, total - (repair.paid || 0)));
  const pay = due > 0.004 ? preparePayment({ amount: due, payments, changeCurrency }) : { rate: store.rate || 1, shift: store.openShift, pays: [], paidUSD: 0, changeUSD: 0, changeCurrency, flow: FLOW0(), received: 0 };
  const b = store.batch();
  const date = nowISO();
  const seq = store.nextSeq(b, 'inv');
  const ref = store.newRef('sales');
  const items = (repair.items || []).map((i) => ({ ...i, total: round2(i.price * i.qty) }));
  const repaired = repair.status !== 'no_reparado';
  const warrantyUntil = repaired && repair.warrantyDays > 0 ? addDays(new Date(), repair.warrantyDays).toISOString() : null;
  const sale = {
    number: fmtSeq(store.settings.invoicePrefix || 'F', seq, 6), seq, kind: 'reparacion', date, dayKey: todayKey(),
    items, subtotal: round2(repair.total || 0), discount: round2(discount), total, prepaid: round2(repair.paid || 0), due,
    cost: round2(repair.cost || itemsCost(items)), totalBs: round2(total * (pay.rate || store.rate)),
    ...paymentFields(pay),
    customerId: repair.customerId, customerName: repair.customerName, customerPhone: repair.customerPhone, customerIdDoc: repair.customerIdDoc || '',
    repairId: repair.id, repairNumber: repair.number, device: deviceName(repair.device), imei: repair.device?.imei || '',
    technicianId: repair.technicianId || null, technician: repair.technician || '', warrantyUntil, warrantyDays: repaired ? repair.warrantyDays : 0,
    note, status: 'completed', by: by()
  };
  b.set(ref, sale);
  if (due > 0.004) addToShift(b, pay);
  const next = {
    ...repair, status: 'entregado', open: false, statusAt: date, updatedAt: date, deliveredAt: date, discount: round2(discount),
    paid: round2((repair.paid || 0) + due), warrantyUntil, invoiceId: ref.id, invoiceNumber: sale.number, finalStatus: repair.status
  };
  next.history = [...(repair.history || []), { at: date, status: 'entregado', note: `Entregado al cliente · ${sale.number}${note ? ' · ' + note : ''}`, by: by() }];
  const { id, ...data } = next;
  b.set(store.ref('repairs', repair.id), data);
  syncTracking(b, next);
  if (repair.customerId && store.customer(repair.customerId)) b.update(store.ref('customers', repair.customerId), { totalSpent: store.inc(total), lastVisitAt: date });
  await store.commit(b);
  return { repair: next, sale: { id: ref.id, ...sale } };
}

/** Cancela una orden: devuelve los repuestos al inventario y, si se indica, el dinero abonado */
export async function cancelRepair(repair, { reason = '', refund = false, refundCurrency = 'USD' } = {}) {
  const b = store.batch();
  const date = nowISO();
  applyPartsDelta(b, repair.items, [], `Cancelación ${repair.number}`);
  const next = { ...repair, status: 'cancelado', open: false, statusAt: date, updatedAt: date, cancelReason: reason, items: (repair.items || []).filter((i) => !i.productId) };
  next.total = itemsTotal(next.items); next.cost = itemsCost(next.items);
  if (refund && repair.paid > 0) {
    const shift = store.openShift;
    if (!shift) throw new Error('Abre la caja para devolver el abono.');
    const amount = refundCurrency === 'BS' ? round2(repair.paid * store.rate) : round2(repair.paid);
    const flow = FLOW0(); flow[refundCurrency === 'BS' ? 'outBs' : 'outUSD'] = amount;
    b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'expense', direction: 'out', currency: refundCurrency, amount, rate: store.rate, flow, concept: `Devolución de abono ${repair.number}`, category: 'Devoluciones', by: by() });
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, { expensesUSD: repair.paid }));
    next.refunded = round2(repair.paid); next.paid = 0;
  }
  next.history = [...(repair.history || []), { at: date, status: 'cancelado', note: `Orden cancelada${reason ? ': ' + reason : ''}${next.refunded ? ` · se devolvieron $${next.refunded.toFixed(2)}` : ''}`, by: by() }];
  const { id, ...data } = next;
  b.set(store.ref('repairs', repair.id), data);
  syncTracking(b, next);
  await store.commit(b);
  return next;
}

// ======================================================================
// VENTAS DE MOSTRADOR (accesorios y repuestos)
// ======================================================================
export function cartTotals(lines, discount = 0) {
  const subtotal = round2((lines || []).reduce((a, l) => a + l.price * l.qty, 0));
  const disc = round2(Math.min(subtotal, Math.max(0, Number(discount) || 0)));
  return { subtotal, discount: disc, total: round2(subtotal - disc) };
}

export async function chargeSale({ lines, customer = null, discount = 0, payments = [], changeCurrency = 'BS', note = '' }) {
  const clean = (lines || []).filter((l) => l.qty > 0).map((l) => ({ productId: l.productId || null, name: l.name, qty: round4(l.qty), price: round2(l.price), cost: round4(l.cost || 0), kind: 'producto', total: round2(l.price * l.qty) }));
  if (!clean.length) throw new Error('La venta está vacía.');
  for (const l of clean) {
    const p = l.productId && store.product(l.productId);
    if (p && p.trackStock !== false && (Number(p.stock) || 0) < l.qty - 1e-9) throw new Error(`Stock insuficiente de ${p.name} (quedan ${Number(p.stock) || 0}).`);
  }
  const t = cartTotals(clean, discount);
  const pay = preparePayment({ amount: t.total, payments, changeCurrency });
  const b = store.batch();
  const date = nowISO();
  const seq = store.nextSeq(b, 'inv');
  const ref = store.newRef('sales');
  const low = [];
  for (const l of clean) {
    const p = l.productId && store.product(l.productId);
    if (!p || p.trackStock === false) continue;
    b.update(store.ref('products', p.id), { stock: store.inc(-l.qty), sold: store.inc(l.qty), updatedAt: date });
    b.set(store.newRef('inventory_logs'), { productId: p.id, name: p.name, date, dayKey: todayKey(), type: 'venta', qty: -l.qty, cost: Number(p.cost) || 0, reason: `Venta ${fmtSeq(store.settings.invoicePrefix || 'F', seq, 6)}`, by: by() });
    const left = (Number(p.stock) || 0) - l.qty;
    if (left <= (Number(p.minStock) || 0)) low.push({ ...p, stock: left });
  }
  const sale = {
    number: fmtSeq(store.settings.invoicePrefix || 'F', seq, 6), seq, kind: 'venta', date, dayKey: todayKey(),
    items: clean, ...t, prepaid: 0, due: t.total, cost: itemsCost(clean), totalBs: round2(t.total * pay.rate),
    ...paymentFields(pay), ...customerFields(customer), note, status: 'completed', by: by()
  };
  b.set(ref, sale);
  addToShift(b, pay);
  if (customer?.id && store.customer(customer.id)) b.update(store.ref('customers', customer.id), { totalSpent: store.inc(t.total), purchases: store.inc(1), lastVisitAt: date });
  await store.commit(b);
  return { sale: { id: ref.id, ...sale }, low };
}

/** Anula una factura o recibo: revierte inventario, caja y, si aplica, la orden */
export async function voidSale(sale, reason = '') {
  if (sale.status === 'voided') throw new Error('El documento ya está anulado.');
  const b = store.batch();
  const date = nowISO();
  b.update(store.ref('sales', sale.id), { status: 'voided', voidedAt: date, voidReason: reason || '', voidedBy: by() });
  if (sale.kind === 'venta') {
    for (const l of sale.items || []) {
      const p = l.productId && store.product(l.productId);
      if (!p || p.trackStock === false) continue;
      b.update(store.ref('products', p.id), { stock: store.inc(l.qty), sold: store.inc(-l.qty), updatedAt: date });
      b.set(store.newRef('inventory_logs'), { productId: p.id, name: p.name, date, dayKey: todayKey(), type: 'devolucion', qty: l.qty, cost: Number(p.cost) || 0, reason: `Anulación ${sale.number}`, by: by() });
    }
  }
  if (sale.repairId) {
    const r = await store.getRepair(sale.repairId);
    if (r) {
      const next = { ...r, updatedAt: date };
      if (sale.kind === 'abono') next.paid = round2(Math.max(0, (r.paid || 0) - sale.total));
      if (sale.kind === 'reparacion' && r.invoiceId === sale.id) {
        Object.assign(next, { status: r.finalStatus || 'listo', open: true, deliveredAt: null, warrantyUntil: null, invoiceId: null, invoiceNumber: null, paid: round2(Math.max(0, (r.paid || 0) - (sale.due || 0))) });
      }
      next.history = [...(r.history || []), { at: date, status: next.status, note: `Anulado ${sale.number}${reason ? ': ' + reason : ''}`, by: by() }];
      const { id, ...data } = next;
      b.set(store.ref('repairs', r.id), data);
      syncTracking(b, next);
    }
  }
  if (sale.customerId && sale.kind !== 'abono' && store.customer(sale.customerId)) b.update(store.ref('customers', sale.customerId), { totalSpent: store.inc(-(sale.total || 0)) });
  const shift = store.openShift;
  const f = sale.cashFlow || FLOW0();
  const reverse = { inUSD: f.outUSD || 0, inBs: f.outBs || 0, outUSD: f.inUSD || 0, outBs: f.inBs || 0 };
  let cashReverted = false;
  if (shift && (sale.received || 0) > 0) {
    const extra = {};
    if (sale.shiftId === shift.id) {
      extra.salesCount = -1; extra.salesTotal = -(sale.received || 0);
      for (const [k, v] of Object.entries(methodNet(sale))) extra[`byMethod.${k}`] = -v;
    }
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(reverse, extra));
    if (reverse.inUSD || reverse.inBs || reverse.outUSD || reverse.outBs) {
      b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'void', direction: 'out', currency: 'USD', amount: 0, flow: reverse, concept: `Anulación ${sale.number}`, category: 'Anulaciones', refId: sale.id, by: by() });
    }
    cashReverted = true;
  }
  await store.commit(b);
  return { cashReverted };
}

// ======================================================================
// CAJA
// ======================================================================
export async function cashMovement({ direction, currency, amount, concept, category, note = '' }) {
  const shift = store.openShift;
  if (!shift) throw new Error('No hay caja abierta.');
  const b = store.batch();
  const flow = FLOW0();
  flow[(direction === 'in' ? 'in' : 'out') + (currency === 'BS' ? 'Bs' : 'USD')] = round2(amount);
  const date = nowISO();
  b.set(store.newRef('cash_movements'), {
    shiftId: shift.id, date, dayKey: todayKey(), type: direction === 'in' ? 'income' : 'expense', direction, currency,
    amount: round2(amount), rate: store.rate, flow, concept, category, note, by: by()
  });
  const usdV = currency === 'BS' ? amount / store.rate : amount;
  b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, direction === 'out' ? { expensesUSD: usdV } : { incomeUSD: usdV }));
  await store.commit(b);
}

export async function openShift({ openingUSD, openingBs, note = '' }) {
  if (store.openShift) throw new Error('Ya hay una caja abierta.');
  const ref = store.newRef('cash_shifts');
  const b = store.batch();
  const seq = store.nextSeq(b, 'shift');
  b.set(ref, {
    status: 'open', openedAt: nowISO(), openedBy: by(), dayKey: todayKey(), number: fmtSeq('T', seq, 4),
    openingUSD: round2(openingUSD), openingBs: round2(openingBs), rateAtOpen: store.rate,
    inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, note
  });
  await store.commit(b);
  return ref.id;
}

export function shiftExpected(shift) {
  return {
    usd: round2((shift.openingUSD || 0) + (shift.inUSD || 0) - (shift.outUSD || 0)),
    bs: round2((shift.openingBs || 0) + (shift.inBs || 0) - (shift.outBs || 0))
  };
}

export async function closeShift(shift, { countedUSD, countedBs, note = '' }) {
  const exp = shiftExpected(shift);
  const b = store.batch();
  b.update(store.ref('cash_shifts', shift.id), {
    status: 'closed', closedAt: nowISO(), closedBy: by(), rateAtClose: store.rate,
    expectedUSD: exp.usd, expectedBs: exp.bs, countedUSD: round2(countedUSD), countedBs: round2(countedBs),
    diffUSD: round2(countedUSD - exp.usd), diffBs: round2(countedBs - exp.bs), closeNote: note
  });
  await store.commit(b);
}

// ======================================================================
// INVENTARIO
// ======================================================================
/**
 * Movimiento de un producto.
 * mode: 'compra' (entrada con costo) | 'entrada' | 'merma' | 'salida' | 'conteo' (fija el stock)
 */
export async function moveProduct(p, { mode, qty, unitCost = 0, reason = '', payFromCash = false, payCurrency = 'USD' }) {
  const current = Number(store.product(p.id)?.stock ?? p.stock) || 0;
  const q = round4(Number(qty) || 0);
  const delta = round4(mode === 'compra' || mode === 'entrada' ? q : mode === 'conteo' ? q - current : -q);
  const date = nowISO();
  const b = store.batch();
  const patch = { stock: store.inc(delta), updatedAt: date };
  if (mode === 'compra' && unitCost > 0) {
    // Costo promedio ponderado
    const stockNow = Math.max(0, current);
    const avg = stockNow + q > 0 ? (stockNow * (Number(p.cost) || 0) + q * unitCost) / (stockNow + q) : unitCost;
    patch.cost = round4(avg); patch.lastCost = round4(unitCost); patch.lastPurchaseAt = date;
  }
  b.update(store.ref('products', p.id), patch);
  b.set(store.newRef('inventory_logs'), { productId: p.id, name: p.name, date, dayKey: todayKey(), type: mode, qty: delta, cost: mode === 'compra' ? unitCost : Number(p.cost) || 0, reason, by: by() });
  if (mode === 'compra' && payFromCash && unitCost > 0) {
    const shift = store.openShift;
    if (!shift) throw new Error('Abre la caja para pagar la compra con dinero de la caja.');
    const totalUSD = round2(unitCost * q);
    const amount = payCurrency === 'BS' ? round2(totalUSD * store.rate) : totalUSD;
    const flow = FLOW0(); flow[payCurrency === 'BS' ? 'outBs' : 'outUSD'] = amount;
    b.set(store.newRef('cash_movements'), { shiftId: shift.id, date, dayKey: todayKey(), type: 'expense', direction: 'out', currency: payCurrency, amount, rate: store.rate, flow, concept: `Compra: ${q} × ${p.name}`, category: 'Compra de repuestos', by: by() });
    b.update(store.ref('cash_shifts', shift.id), shiftIncrements(flow, { expensesUSD: totalUSD }));
  }
  await store.commit(b);
}
