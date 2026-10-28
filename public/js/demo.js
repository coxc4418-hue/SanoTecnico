// Sano-Técnico — Modo demo (sesión anónima de 30 minutos) con un taller de ejemplo
import { auth, db, doc, collection, writeBatch, getDoc, getDocs, Timestamp, signInAnonymously, signOut } from './firebase.js';
import { store, DEFAULT_SETTINGS, STATUS } from './store.js';
import { createRepair, updateRepair, saveRepairItems, deliverRepair, chargeSale, genTrackCode, fmtSeq, syncTracking, itemsTotal, itemsCost, deviceName } from './ops.js';
import { fetchBcvRate } from './shared.js';
import { round2, nowISO, todayKey, dayKey, addDays, shortId, sha256 } from './utils.js';

/** PIN de administrador de todas las demos (se muestra en pantalla) */
export const DEMO_PIN = '1234';

export const DEMO_MINUTES = 30;
const DATA_COLLECTIONS = ['repairs', 'products', 'customers', 'cash_shifts', 'cash_movements', 'sales', 'inventory_logs', 'config'];
const BIZ = 'TecnoFix Demo';

export async function startDemo() { await signInAnonymously(auth); }

export function demoRemainingMs(tenant) {
  const exp = tenant?.expiresAt;
  if (!exp) return 0;
  const ms = typeof exp.toMillis === 'function' ? exp.toMillis() : new Date(exp).getTime();
  return ms - Date.now();
}

const TECHS = [
  { id: 'tluis', name: 'Luis Méndez', phone: '0414-5550101', commission: 30, active: true },
  { id: 'tandrea', name: 'Andrea Rojas', phone: '0424-5550202', commission: 35, active: true },
  { id: 'tkevin', name: 'Kevin Paredes', phone: '0412-5550303', commission: 25, active: true }
];

const CUSTOMERS = [
  ['María González', '0414-1234567', 'V-18.456.789'], ['José Rodríguez', '0424-7654321', 'V-20.112.334'], ['Carmen Pérez', '0412-5551234', 'V-15.998.120'],
  ['Luis Hernández', '0416-3332211', 'V-24.556.001'], ['Ana Martínez', '0426-8889900', 'V-22.345.678'], ['Pedro Castillo', '0414-2223344', 'V-12.777.456'],
  ['Daniela Suárez', '0424-1112233', 'V-27.001.552'], ['Inversiones Lara C.A.', '0251-2345678', 'J-40123456-7']
];

// [nombre, categoría, compatibles, costo, precio, stock, mínimo, se vende]
const PRODUCTS = [
  ['Pantalla Samsung A10 con marco', 'Pantallas', 'A10, A10s', 14, 28, 4, 2, false],
  ['Pantalla Samsung A32 OLED', 'Pantallas', 'A32 4G', 32, 55, 2, 1, false],
  ['Pantalla Redmi Note 11', 'Pantallas', 'Redmi Note 11, 11S', 22, 40, 3, 2, false],
  ['Pantalla iPhone 11 incell', 'Pantallas', 'iPhone 11', 26, 50, 1, 2, false],
  ['Pantalla Tecno Spark 10', 'Pantallas', 'Spark 10, 10C', 15, 30, 3, 1, false],
  ['Batería Samsung A20/A30', 'Baterías', 'A20, A30, A50', 6, 14, 6, 3, true],
  ['Batería iPhone 11', 'Baterías', 'iPhone 11', 11, 25, 2, 2, true],
  ['Batería Redmi 9 (BN54)', 'Baterías', 'Redmi 9, Note 9', 7, 16, 1, 2, true],
  ['Pin de carga tipo C (placa)', 'Pines de carga', 'Universal tipo C', 1.5, 5, 15, 5, false],
  ['Pin de carga micro USB', 'Pines de carga', 'Universal', 0.8, 4, 12, 5, false],
  ['Flex de carga Samsung A12', 'Flex', 'A12, M12', 3, 9, 4, 2, false],
  ['Cámara trasera iPhone XR', 'Cámaras', 'iPhone XR', 14, 30, 1, 1, false],
  ['Tapa trasera Samsung A51', 'Tapas', 'A51', 4, 10, 3, 1, true],
  ['Corneta auricular universal', 'Cornetas y micrófonos', 'Varios', 1, 4, 10, 4, false],
  ['Forro silicón iPhone 13', 'Forros', 'iPhone 13', 1.5, 5, 18, 5, true],
  ['Forro antichoque Samsung A14', 'Forros', 'A14 4G/5G', 1.8, 6, 2, 4, true],
  ['Vidrio templado 9D', 'Vidrios templados', 'Varios modelos', 0.5, 3, 40, 10, true],
  ['Cargador 25W tipo C original', 'Cargadores', 'Samsung', 7, 15, 6, 3, true],
  ['Cargador 20W iPhone', 'Cargadores', 'iPhone', 6, 14, 5, 3, true],
  ['Cable tipo C a C 1 m', 'Cables', 'Universal', 1.2, 4, 25, 8, true],
  ['Cable Lightning 1 m', 'Cables', 'iPhone', 1.5, 5, 14, 6, true],
  ['Audífonos Bluetooth TWS', 'Audífonos', 'Universal', 5, 12, 7, 3, true],
  ['Memoria micro SD 64 GB', 'Memorias', 'Universal', 4.5, 9, 9, 3, true],
  ['Chip IC de carga (Tristar)', 'Placas y chips', 'iPhone 6-8', 3, 0, 3, 1, false]
];

const svc = (name, price) => ({ id: shortId(6), kind: 'servicio', productId: null, name, qty: 1, price, cost: 0 });

/** Crea la sede de demostración con configuración, técnicos, clientes y caja abierta. */
export async function createDemoTenant(uid) {
  const now = Date.now();
  const expiresAt = Timestamp.fromMillis(now + DEMO_MINUTES * 60 * 1000);
  let rate = 0;
  try { rate = (await Promise.race([fetchBcvRate(), new Promise((_, r) => setTimeout(() => r(new Error('t')), 3500))])).rate; } catch (_) { rate = 0; }
  if (!(rate > 0)) rate = 40;
  rate = round2(rate);

  const b1 = writeBatch(db);
  b1.set(doc(db, 'tenants', uid), { name: BIZ, code: 'demo', ownerUid: uid, ownerEmail: '', active: true, demo: true, createdAt: nowISO(), expiresAt });
  await b1.commit();

  const ref = (name, id) => doc(db, 'tenants', uid, name, id || doc(collection(db, 'tenants', uid, name)).id);
  const b = writeBatch(db);
  b.set(ref('config', 'settings'), {
    ...DEFAULT_SETTINGS, businessName: BIZ, rif: 'J-00000000-0', phone: '0414-0000000', whatsapp: '0414-0000000', address: 'C.C. Galerías, nivel 1, local 24', instagram: '@sanotecnico',
    receiptFooter: '¡Gracias por probar Sano-Técnico!', rate, rateUpdatedAt: nowISO(), rateSource: 'bcv', techs: TECHS
  });
  b.set(ref('config', 'security'), { pinHash: await sha256(`${uid}:${DEMO_PIN}`), updatedAt: nowISO() });
  b.set(ref('config', 'counters'), { shift: 1 });
  CUSTOMERS.forEach(([name, phone, idDoc], i) => b.set(ref('customers'), { name, phone, idDoc, email: '', address: '', notes: i === 7 ? 'Cliente corporativo: 12 equipos' : '', repairs: 0, totalSpent: 0, createdAt: addDays(new Date(), -40 + i).toISOString() }));
  b.set(ref('cash_shifts'), {
    status: 'open', openedAt: nowISO(), openedBy: 'demo', dayKey: todayKey(), number: 'T-0001',
    openingUSD: 20, openingBs: round2(rate * 10), rateAtOpen: rate, inUSD: 0, inBs: 0, outUSD: 0, outBs: 0, salesCount: 0, salesTotal: 0, note: 'Turno de demostración'
  });
  await b.commit();
}

async function waitFor(cond, ms = 6000) {
  const t0 = Date.now();
  while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 120));
}

/** Inventario, historial de la semana, órdenes en cada estado y ventas de hoy para que la demo se vea con vida. */
export async function seedDemoActivity() {
  // 1) Inventario
  const b0 = store.batch(); const now = nowISO();
  PRODUCTS.forEach(([name, category, compatible, cost, price, stock, minStock, sellable]) => b0.set(store.newRef('products'), {
    name, category, compatible, sku: '', cost, price, stock, minStock, supplier: 'Distribuidora Celular C.A.', sellable, trackStock: true, active: true, sold: 0, createdAt: now, updatedAt: now
  }));
  await store.commit(b0);
  await waitFor(() => store.products.length >= PRODUCTS.length && store.customers.length >= CUSTOMERS.length && store.openShift);
  const P = (n) => store.products.find((x) => x.name === n);
  const part = (n, qty = 1) => { const p = P(n); return p ? { id: shortId(6), kind: 'repuesto', productId: p.id, name: p.name, qty, price: p.price, cost: p.cost } : null; };
  const partLog = (n, qty = 1) => { const p = P(n); return p ? { id: shortId(6), kind: 'repuesto', productId: null, name: p.name, qty, price: p.price, cost: p.cost } : null; };
  const C = (n) => store.customers.find((c) => c.name.startsWith(n));
  const rate = store.rate;
  const techOf = (i) => TECHS[i % TECHS.length];

  // 2) Historial: equipos entregados los últimos días (para reportes, garantías y facturación)
  const past = [
    ['María', { type: 'celular', brand: 'Samsung', model: 'Galaxy A10', color: 'Negro' }, 'Pantalla rota', ['Pantalla rota'], [svc('Cambio de pantalla (mano de obra)', 15), partLog('Pantalla Samsung A10 con marco')], 'pagomovil'],
    ['José', { type: 'celular', brand: 'Apple', model: 'iPhone 11', color: 'Blanco' }, 'La batería dura muy poco', ['Batería'], [svc('Cambio de batería (mano de obra)', 8), partLog('Batería iPhone 11')], 'zelle'],
    ['Carmen', { type: 'celular', brand: 'Xiaomi', model: 'Redmi Note 11', color: 'Azul' }, 'No carga', ['No carga', 'Pin de carga'], [svc('Cambio de pin de carga', 10), partLog('Pin de carga tipo C (placa)')], 'efectivo_usd'],
    ['Luis', { type: 'laptop', brand: 'HP', model: 'Pavilion 15', color: 'Gris' }, 'Muy lenta y se calienta', ['Software / lento'], [svc('Mantenimiento laptop / PC', 15), svc('Actualización / flasheo de software', 12)], 'punto'],
    ['Ana', { type: 'celular', brand: 'Tecno', model: 'Spark 10', color: 'Morado' }, 'Se cayó y no da imagen', ['Pantalla rota'], [svc('Cambio de pantalla (mano de obra)', 15), partLog('Pantalla Tecno Spark 10')], 'pagomovil'],
    ['Pedro', { type: 'celular', brand: 'Samsung', model: 'Galaxy A32', color: 'Negro' }, 'Se mojó', ['Se mojó'], [svc('Limpieza por humedad', 15)], 'efectivo_bs'],
    ['Daniela', { type: 'tablet', brand: 'Samsung', model: 'Galaxy Tab A7', color: 'Gris' }, 'Pin de carga flojo', ['Pin de carga'], [svc('Cambio de pin de carga', 10), partLog('Pin de carga tipo C (placa)')], 'transferencia'],
    ['Inversiones', { type: 'celular', brand: 'Samsung', model: 'Galaxy A12', color: 'Negro' }, 'No carga', ['No carga'], [svc('Cambio de pin de carga', 10), partLog('Flex de carga Samsung A12')], 'transferencia'],
    ['María', { type: 'celular', brand: 'Redmi', model: '9', color: 'Verde' }, 'Batería inflada', ['Batería'], [svc('Cambio de batería (mano de obra)', 8), partLog('Batería Redmi 9 (BN54)')], 'efectivo_usd'],
    ['José', { type: 'consola', brand: 'Otra', model: 'PlayStation 4', color: 'Negro' }, 'Se apaga sola', ['Se reinicia'], [svc('Revisión / diagnóstico', 5), svc('Mantenimiento laptop / PC', 15)], 'zelle']
  ];
  const sellPast = [['Vidrio templado 9D', 2], ['Cargador 25W tipo C original', 1], ['Forro silicón iPhone 13', 1], ['Cable tipo C a C 1 m', 2], ['Audífonos Bluetooth TWS', 1], ['Memoria micro SD 64 GB', 1]];
  const b = store.batch();
  past.forEach(([cn, device, fault, faultTags, rawItems, method], i) => {
    const d = 6 - Math.floor(i * 6 / past.length);
    const created = addDays(new Date(), -d - 2); created.setHours(10 + (i % 6), (i * 17) % 60, 0, 0);
    const delivered = addDays(new Date(), -d); delivered.setHours(11 + (i % 7), (i * 23) % 60, 0, 0);
    const c = C(cn); const tech = techOf(i);
    const items = rawItems.filter(Boolean);
    const total = itemsTotal(items); const cost = itemsCost(items);
    const os = store.nextSeq(b, 'os'); const inv = store.nextSeq(b, 'inv');
    const rRef = store.newRef('repairs'); const sRef = store.newRef('sales');
    const warrantyUntil = addDays(delivered, 30).toISOString();
    const cur = ['efectivo_usd', 'zelle'].includes(method) ? 'USD' : 'BS';
    const pays = [{ method, currency: cur, amount: cur === 'BS' ? round2(total * rate) : total, usd: total }];
    const r = {
      number: fmtSeq('OS', os, 4), seq: os, trackCode: genTrackCode(), status: 'entregado', open: false, finalStatus: 'listo',
      createdAt: created.toISOString(), updatedAt: delivered.toISOString(), statusAt: delivered.toISOString(), dayKey: dayKey(created),
      customerId: c?.id || null, customerName: c?.name || 'Cliente', customerPhone: c?.phone || '', customerIdDoc: c?.idDoc || '',
      device: { ...device, imei: '', unlockType: 'none', unlockValue: '', pattern: [] }, accessories: ['Chip SIM'], condition: ['Buen estado'], conditionNote: '', checks: {},
      fault, faultTags, diagnosis: 'Diagnóstico confirmado y reparado.', techNotes: '', publicNote: '', photos: [], priority: 'normal',
      technicianId: tech.id, technician: tech.name, promisedAt: null, items, total, cost, discount: 0, paid: total, approved: true, approvedAt: created.toISOString(),
      warrantyDays: 30, warrantyUntil, warrantyOf: null, isWarranty: false, deliveredAt: delivered.toISOString(), readyAt: delivered.toISOString(),
      invoiceId: sRef.id, invoiceNumber: fmtSeq('F', inv, 6), receivedBy: 'demo',
      history: [
        { at: created.toISOString(), status: 'recibido', note: 'Equipo recibido', by: 'demo' },
        { at: addDays(created, 0.2).toISOString(), status: 'presupuesto', note: STATUS.presupuesto.desc, by: 'demo' },
        { at: addDays(created, 0.5).toISOString(), status: 'reparacion', note: STATUS.reparacion.desc, by: 'demo' },
        { at: addDays(created, 1.5).toISOString(), status: 'listo', note: STATUS.listo.desc, by: 'demo' },
        { at: delivered.toISOString(), status: 'entregado', note: `Entregado al cliente · ${fmtSeq('F', inv, 6)}`, by: 'demo' }
      ]
    };
    b.set(rRef, r);
    syncTracking(b, r);
    b.set(sRef, {
      number: r.invoiceNumber, seq: inv, kind: 'reparacion', date: r.deliveredAt, dayKey: dayKey(delivered), items: items.map((x) => ({ ...x, total: round2(x.price * x.qty) })),
      subtotal: total, discount: 0, total, prepaid: 0, due: total, cost, totalBs: round2(total * rate), rate, payments: pays, paidUSD: total, changeUSD: 0, changeCurrency: 'BS',
      method, received: total, shiftId: 'historial', cashFlow: { inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 },
      customerId: r.customerId, customerName: r.customerName, customerPhone: r.customerPhone, customerIdDoc: r.customerIdDoc,
      repairId: rRef.id, repairNumber: r.number, device: deviceName(device), imei: '', technicianId: tech.id, technician: tech.name, warrantyUntil, warrantyDays: 30, note: '', status: 'completed', by: 'demo'
    });
    // Ventas de mostrador del mismo día
    const [pn, q] = sellPast[i % sellPast.length]; const p = P(pn);
    if (p) {
      const inv2 = store.nextSeq(b, 'inv'); const t2 = round2(p.price * q); const dt = new Date(delivered.getTime() + 40 * 60000);
      b.set(store.newRef('sales'), {
        number: fmtSeq('F', inv2, 6), seq: inv2, kind: 'venta', date: dt.toISOString(), dayKey: dayKey(dt), items: [{ productId: p.id, name: p.name, qty: q, price: p.price, cost: p.cost, kind: 'producto', total: t2 }],
        subtotal: t2, discount: 0, total: t2, prepaid: 0, due: t2, cost: round2(p.cost * q), totalBs: round2(t2 * rate), rate,
        payments: [{ method: 'pagomovil', currency: 'BS', amount: round2(t2 * rate), usd: t2 }], paidUSD: t2, changeUSD: 0, changeCurrency: 'BS', method: 'pagomovil', received: t2,
        shiftId: 'historial', cashFlow: { inUSD: 0, inBs: 0, outUSD: 0, outBs: 0 }, customerId: null, customerName: 'Cliente de mostrador', customerPhone: '', customerIdDoc: '', note: '', status: 'completed', by: 'demo'
      });
    }
  });
  await store.commit(b);

  // 3) Órdenes abiertas en cada etapa del taller
  const hoursAgo = (h) => new Date(Date.now() - h * 3600e3).toISOString();
  const open = [
    { c: 'Ana', device: { type: 'celular', brand: 'Samsung', model: 'Galaxy A32', color: 'Azul', imei: '356789104512347', storage: '128 GB', unlockType: 'pattern', unlockValue: '', pattern: [0, 3, 6, 7, 8] }, fault: 'Pantalla partida, el táctil no responde abajo', faultTags: ['Pantalla rota', 'Táctil'], condition: ['Pantalla partida', 'Golpes en bordes'], accessories: ['Chip SIM', 'Forro'], status: 'recibido', h: 1, tech: null, priority: 'urgente' },
    { c: 'Pedro', device: { type: 'celular', brand: 'Apple', model: 'iPhone XR', color: 'Rojo', imei: '353045098765431', storage: '64 GB', unlockType: 'pin', unlockValue: '1590' }, fault: 'La cámara trasera se ve borrosa', faultTags: ['Cámara'], condition: ['Cámara partida'], accessories: [], status: 'diagnostico', h: 5, tech: 1 },
    { c: 'Daniela', device: { type: 'celular', brand: 'Redmi', model: 'Note 11', color: 'Gris', storage: '128 GB', unlockType: 'none' }, fault: 'Se cayó, pantalla negra', faultTags: ['Pantalla rota'], condition: ['Pantalla partida'], accessories: ['Chip SIM'], status: 'presupuesto', h: 26, tech: 0, items: [svc('Cambio de pantalla (mano de obra)', 15), part('Pantalla Redmi Note 11')], deposit: null },
    { c: 'Luis', device: { type: 'celular', brand: 'Apple', model: 'iPhone 11', color: 'Negro', imei: '352999112233445', unlockType: 'password', unlockValue: 'luis2024' }, fault: 'Cambio de pantalla, tiene manchas', faultTags: ['Pantalla rota'], condition: ['Pantalla rayada'], accessories: ['Forro'], status: 'repuesto', h: 50, tech: 1, items: [svc('Cambio de pantalla (mano de obra)', 15)], note: 'Se pidió la pantalla al proveedor, llega mañana.', deposit: 20 },
    { c: 'Carmen', device: { type: 'celular', brand: 'Samsung', model: 'Galaxy A10', color: 'Negro', unlockType: 'none' }, fault: 'No carga, hay que mover el cable', faultTags: ['No carga', 'Pin de carga'], condition: ['Buen estado'], accessories: [], status: 'reparacion', h: 20, tech: 2, items: [svc('Cambio de pin de carga', 10), part('Pin de carga micro USB')], deposit: 5 },
    { c: 'Inversiones', device: { type: 'laptop', brand: 'Lenovo', model: 'IdeaPad 3', color: 'Gris', unlockType: 'password', unlockValue: 'Lara.2023' }, fault: 'Muy lenta, respaldar información y formatear', faultTags: ['Software / lento'], condition: ['Buen estado'], accessories: ['Cargador'], status: 'listo', h: 30, tech: 0, items: [svc('Actualización / flasheo de software', 12), svc('Respaldo de información', 6), svc('Mantenimiento laptop / PC', 15)], deposit: 10 },
    { c: 'José', device: { type: 'celular', brand: 'Samsung', model: 'Galaxy A51', color: 'Blanco', unlockType: 'none' }, fault: 'Tapa trasera rota y batería dura poco', faultTags: ['Tapa trasera', 'Batería'], condition: ['Tapa rota'], accessories: ['Chip SIM', 'Memoria SD'], status: 'listo', h: 8, tech: 2, items: [svc('Cambio de tapa trasera', 8), part('Tapa trasera Samsung A51'), svc('Cambio de batería (mano de obra)', 8), part('Batería Samsung A20/A30')] },
    { c: 'María', device: { type: 'celular', brand: 'Huawei', model: 'P30 Lite', color: 'Azul', unlockType: 'none' }, fault: 'Se mojó, no enciende', faultTags: ['Se mojó', 'No enciende'], condition: ['Humedad visible'], accessories: [], status: 'no_reparado', h: 70, tech: 1, items: [svc('Revisión / diagnóstico', 5)], note: 'Placa con corrosión severa: no tiene reparación.' },
    { c: 'Daniela', device: { type: 'reloj', brand: 'Apple', model: 'Watch Series 5', color: 'Negro', unlockType: 'none' }, fault: 'No enciende', faultTags: ['No enciende'], condition: ['Buen estado'], accessories: ['Cable'], status: 'diagnostico', h: 100, tech: 0, priority: 'normal' }
  ];
  const flow = ['recibido', 'diagnostico', 'presupuesto', 'repuesto', 'reparacion', 'listo'];
  for (const o of open) {
    try {
      const c = C(o.c);
      const tech = o.tech != null ? TECHS[o.tech] : null;
      const created = hoursAgo(o.h);
      const promised = new Date(Date.now() + (o.status === 'diagnostico' && o.h > 90 ? -24 : 24) * 3600e3).toISOString();
      const deposit = o.deposit ? { amount: o.deposit, payments: [{ method: 'efectivo_usd', amount: o.deposit }], changeCurrency: 'BS' } : null;
      const { repair } = await createRepair({
        customer: c, device: { color: '', imei: '', storage: '', unlockValue: '', pattern: [], ...o.device }, accessories: o.accessories, condition: o.condition,
        checks: { enciende: o.faultTags.includes('No enciende') ? 'falla' : 'ok', pantalla: o.faultTags.includes('Pantalla rota') ? 'falla' : 'ok', carga: o.faultTags.includes('No carga') ? 'falla' : 'ok', camara: o.faultTags.includes('Cámara') ? 'falla' : 'ok', audio: 'ok', senal: 'na' },
        fault: o.fault, faultTags: o.faultTags, technicianId: tech?.id || null, priority: o.priority || 'normal', promisedAt: promised
      }, deposit);
      let r = repair;
      if (o.items) r = (await saveRepairItems(r, o.items.filter(Boolean), { note: 'Presupuesto' })).repair;
      // Historial y fechas realistas
      const target = o.status;
      const steps = target === 'no_reparado' ? ['recibido', 'diagnostico', 'no_reparado'] : flow.slice(0, flow.indexOf(target) + 1);
      const span = o.h * 3600e3;
      const history = steps.map((s, i) => ({ at: new Date(Date.now() - span + (span * i) / Math.max(1, steps.length)).toISOString(), status: s, note: i === 0 ? 'Equipo recibido' : STATUS[s].desc, by: 'demo' }));
      if (o.deposit) history.splice(1, 0, { at: new Date(Date.now() - span + 60000).toISOString(), status: 'recibido', note: `Abono de $${o.deposit.toFixed(2)}`, by: 'demo' });
      if (o.note) history.push({ at: hoursAgo(Math.max(0.2, o.h / 6)), status: target, note: o.note, by: 'demo' });
      const approved = ['repuesto', 'reparacion', 'listo'].includes(target);
      r = await updateRepair(r, {
        status: target, createdAt: created, statusAt: history[history.length - 1].at, history, approved, approvedAt: approved ? created : null,
        diagnosis: target === 'recibido' ? '' : target === 'no_reparado' ? o.note : `Se confirma: ${o.fault.toLowerCase()}.`,
        publicNote: target === 'repuesto' ? 'Estamos esperando el repuesto, te avisamos al llegar.' : '',
        readyAt: target === 'listo' ? hoursAgo(1) : null, dayKey: dayKey(new Date(created))
      });
    } catch (e) { console.warn('[demo] orden', e); }
  }

  // 4) Hoy: una entrega con factura y dos ventas de mostrador
  await waitFor(() => store.repairs.length >= open.length - 1);
  const toDeliver = store.repairs.find((r) => r.status === 'listo' && r.customerName.startsWith('Inversiones'));
  if (toDeliver) {
    const due = round2(toDeliver.total - (toDeliver.paid || 0));
    try { await deliverRepair(toDeliver, { payments: [{ method: 'pagomovil', amount: round2(due * rate) }], changeCurrency: 'BS' }); } catch (e) { console.warn('[demo] entrega', e); }
  }
  const line = (n, qty = 1) => { const p = P(n); return p ? { productId: p.id, name: p.name, qty, price: p.price, cost: p.cost } : null; };
  const sales = [
    { lines: [line('Vidrio templado 9D', 2), line('Forro silicón iPhone 13')], pays: [{ method: 'efectivo_usd', amount: 20 }] },
    { lines: [line('Cargador 25W tipo C original'), line('Cable tipo C a C 1 m')], pays: [{ method: 'punto', amount: round2(19 * rate) }], customer: C('Ana') }
  ];
  for (const s of sales) {
    try { await chargeSale({ lines: s.lines.filter(Boolean), customer: s.customer || null, payments: s.pays, changeCurrency: 'USD' }); } catch (e) { console.warn('[demo] venta', e); }
  }
}

/** Borra todos los datos de una sede (y sus páginas públicas de seguimiento). Con onlyDemo, también borra el documento si es una demo. */
export async function purgeTenant(tenantId, onlyDemo = true) {
  try {
    const reps = await getDocs(collection(db, 'tenants', tenantId, 'repairs'));
    const codes = reps.docs.map((d) => d.data().trackCode).filter(Boolean);
    for (let i = 0; i < codes.length; i += 400) {
      const b = writeBatch(db);
      codes.slice(i, i + 400).forEach((c) => b.delete(doc(db, 'tracking', c)));
      await b.commit().catch((e) => console.warn('[purge] seguimiento', e?.code || e));
    }
  } catch (e) { console.warn('[purge] seguimiento', e?.code || e); }
  for (const c of DATA_COLLECTIONS) {
    try {
      const snap = await getDocs(collection(db, 'tenants', tenantId, c));
      for (let i = 0; i < snap.docs.length; i += 400) {
        const b = writeBatch(db);
        snap.docs.slice(i, i + 400).forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    } catch (e) { console.warn('[purge]', c, e?.code || e); }
  }
  if (onlyDemo) {
    try {
      const t = await getDoc(doc(db, 'tenants', tenantId));
      if (t.exists() && t.data().demo === true) { const b = writeBatch(db); b.delete(t.ref); await b.commit(); }
    } catch (e) { console.warn('[purge] sede', e?.code || e); }
  }
}

/** Borra la demo actual y la cuenta anónima. */
export async function cleanupDemo(tenantId) {
  await purgeTenant(tenantId, true);
  const u = auth.currentUser;
  if (u && u.isAnonymous) {
    try { await u.delete(); } catch (_) { await signOut(auth).catch(() => {}); }
  }
}
