// Sano-Técnico — Capa de datos multisede (Firestore en tiempo real + caché offline)
import {
  db, collection, doc, getDoc, getDocs, setDoc, deleteDoc, onSnapshot, query, where, writeBatch, increment
} from './firebase.js';
import { addDays, startOfDay, sha256, toast, todayKey } from './utils.js';

// ---------- Catálogos del servicio técnico ----------
export const DEVICE_TYPES = {
  celular: { label: 'Celular', icon: 'phone' },
  tablet: { label: 'Tablet', icon: 'tablet' },
  laptop: { label: 'Laptop', icon: 'laptop' },
  pc: { label: 'PC', icon: 'monitor' },
  reloj: { label: 'Smartwatch', icon: 'watch' },
  consola: { label: 'Consola', icon: 'gamepad' },
  otro: { label: 'Otro', icon: 'cpu' }
};
export const BRANDS = ['Samsung', 'Xiaomi', 'Redmi', 'Apple', 'Tecno', 'Infinix', 'Motorola', 'Huawei', 'Honor', 'ZTE', 'Realme', 'Oppo', 'Vivo', 'Alcatel', 'Blu', 'Nokia', 'Lenovo', 'HP', 'Otra'];
export const FAULT_TAGS = ['Pantalla rota', 'No enciende', 'No carga', 'Batería', 'Se mojó', 'Software / lento', 'Cámara', 'Audio / corneta', 'Micrófono', 'Sin señal', 'Botones', 'Huella / Face ID', 'Tapa trasera', 'Pin de carga', 'Wi-Fi / Bluetooth', 'Se reinicia', 'Táctil', 'Bloqueado'];
export const CONDITION_TAGS = ['Pantalla rayada', 'Pantalla partida', 'Tapa rota', 'Golpes en bordes', 'Marco doblado', 'Cámara partida', 'Humedad visible', 'Abierto antes', 'Sin tornillos', 'Buen estado'];
export const ACCESSORY_TAGS = ['Chip SIM', 'Memoria SD', 'Cargador', 'Cable', 'Forro', 'Vidrio templado', 'Caja', 'Lápiz', 'Bandeja SIM'];
export const CHECKS = [
  ['enciende', 'Enciende'], ['pantalla', 'Pantalla'], ['tactil', 'Táctil'], ['carga', 'Carga'], ['camara', 'Cámaras'], ['audio', 'Audio'],
  ['microfono', 'Micrófono'], ['senal', 'Señal'], ['wifi', 'Wi-Fi'], ['biometria', 'Huella/Face'], ['botones', 'Botones'], ['vibrador', 'Vibrador']
];
export const CHECK_STATES = { ok: { label: 'Funciona', cls: 'ok' }, falla: { label: 'Falla', cls: 'bad' }, na: { label: 'No se probó', cls: 'na' } };

// Estados de una orden de servicio
export const STATUS = {
  recibido: { label: 'Recibido', short: 'Recibido', tone: 'info', icon: 'inbox', desc: 'Equipo recibido en el taller' },
  diagnostico: { label: 'En diagnóstico', short: 'Diagnóstico', tone: 'violet', icon: 'search', desc: 'El técnico está revisando el equipo' },
  presupuesto: { label: 'Esperando aprobación', short: 'Por aprobar', tone: 'warning', icon: 'clock', desc: 'Presupuesto enviado al cliente' },
  repuesto: { label: 'Esperando repuesto', short: 'Repuesto', tone: 'warning', icon: 'box', desc: 'Esperando la llegada del repuesto' },
  reparacion: { label: 'En reparación', short: 'Reparando', tone: 'brand', icon: 'wrench', desc: 'El técnico está reparando el equipo' },
  listo: { label: 'Listo para entregar', short: 'Listo', tone: 'success', icon: 'check', desc: 'El equipo está listo para retirar' },
  no_reparado: { label: 'Sin reparación', short: 'Sin reparar', tone: 'danger', icon: 'x', desc: 'No se pudo reparar o el cliente no aprobó' },
  entregado: { label: 'Entregado', short: 'Entregado', tone: 'neutral', icon: 'handshake', desc: 'Equipo entregado al cliente' },
  cancelado: { label: 'Cancelado', short: 'Cancelado', tone: 'neutral', icon: 'x', desc: 'Orden cancelada' }
};
export const FLOW = ['recibido', 'diagnostico', 'presupuesto', 'repuesto', 'reparacion', 'listo'];
export const BOARD = ['recibido', 'diagnostico', 'presupuesto', 'repuesto', 'reparacion', 'listo', 'no_reparado'];
export const isOpenStatus = (s) => s !== 'entregado' && s !== 'cancelado';
export const statusBadge = (s) => {
  const st = STATUS[s] || { label: s, tone: 'neutral' };
  return `<span class="badge badge-${st.tone}"><i class="dotc"></i>${st.label}</span>`;
};

export const PRODUCT_CATEGORIES = ['Pantallas', 'Baterías', 'Pines de carga', 'Flex', 'Cámaras', 'Tapas', 'Cornetas y micrófonos', 'Placas y chips', 'Forros', 'Vidrios templados', 'Cargadores', 'Cables', 'Audífonos', 'Memorias', 'Otros'];
export const DEFAULT_SERVICES = [
  { name: 'Revisión / diagnóstico', price: 5 },
  { name: 'Cambio de pantalla (mano de obra)', price: 15 },
  { name: 'Cambio de batería (mano de obra)', price: 8 },
  { name: 'Cambio de pin de carga', price: 10 },
  { name: 'Limpieza por humedad', price: 15 },
  { name: 'Actualización / flasheo de software', price: 12 },
  { name: 'Respaldo de información', price: 6 },
  { name: 'Reparación de placa', price: 25 },
  { name: 'Cambio de tapa trasera', price: 8 },
  { name: 'Mantenimiento laptop / PC', price: 15 }
];
export const DEFAULT_TERMS = 'El cliente autoriza la revisión del equipo. La revisión tiene un costo si no se aprueba la reparación. Los equipos con humedad o golpes pueden presentar fallas adicionales. La garantía cubre solo la pieza y el trabajo realizado; no cubre golpes, humedad ni manipulación de terceros. Equipos no retirados en 90 días se consideran abandonados. Respalde su información: el taller no se hace responsable por pérdida de datos.';

const DEFAULT_SETTINGS = {
  businessName: '',
  rif: '',
  phone: '',
  whatsapp: '',
  address: '',
  instagram: '',
  receiptFooter: '¡Gracias por confiar en nosotros!',
  receiptFormat: '80mm',
  orderFormat: 'carta',
  docTitle: 'NOTA DE ENTREGA',
  rate: 0,
  rateUpdatedAt: null,
  rateAuto: true,
  iva: 0,
  warrantyDays: 30,
  terms: DEFAULT_TERMS,
  services: DEFAULT_SERVICES,
  categories: PRODUCT_CATEGORIES,
  techs: [],
  requireDiagnosisFee: false
};

class Store {
  constructor() {
    this.tenantId = null;
    this.tenant = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.security = {};
    this.counters = {};
    this.announcement = null;
    this.repairs = [];
    this.products = [];
    this.customers = [];
    this.openShift = null;
    this.recentSales = [];
    this.ready = false;
    this._unsubs = [];
    this._listeners = {};
    this._loaded = new Set();
  }

  // ---------- Eventos ----------
  on(evt, fn) { (this._listeners[evt] ||= new Set()).add(fn); return () => this._listeners[evt].delete(fn); }
  emit(evt, data) {
    (this._listeners[evt] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
    (this._listeners['*'] || []).forEach((fn) => { try { fn(evt); } catch (e) { console.error(e); } });
  }

  // ---------- Referencias ----------
  col(name) { return collection(db, 'tenants', this.tenantId, name); }
  ref(name, id) { return doc(db, 'tenants', this.tenantId, name, String(id)); }
  newRef(name) { return doc(this.col(name)); }
  tenantRef(id = this.tenantId) { return doc(db, 'tenants', id); }
  trackRef(code) { return doc(db, 'tracking', String(code)); }
  batch() { return writeBatch(db); }
  get isDemo() { return this.tenant?.demo === true; }
  inc(n) { return increment(n); }

  /**
   * Confirma un lote. La caché local aplica el cambio al instante (también sin internet);
   * se espera la confirmación del servidor como máximo unos segundos para no bloquear el mostrador.
   */
  async commit(batch) {
    const p = batch.commit();
    p.catch((err) => {
      console.error('[store] commit', err);
      toast(err?.code === 'permission-denied' ? 'Sin permiso para guardar. Verifica que la sede esté activa.' : 'No se pudo sincronizar un cambio: ' + (err?.message || err), 'danger', 5000);
    });
    if (!navigator.onLine) return;
    await Promise.race([p.catch(() => {}), new Promise((r) => setTimeout(r, 3500))]);
  }

  async save(name, id, data, merge = true) {
    const b = this.batch();
    b.set(this.ref(name, id), data, { merge });
    await this.commit(b);
  }
  async remove(name, id) {
    const b = this.batch();
    b.delete(this.ref(name, id));
    await this.commit(b);
  }

  // ---------- Ciclo de vida ----------
  async start(tenantId) {
    this.stop();
    this.tenantId = tenantId;
    this._loaded = new Set();
    const need = ['tenant', 'settings', 'repairs', 'products', 'customers', 'shift', 'sales'];
    let resolveReady;
    const readyP = new Promise((r) => { resolveReady = r; });
    const mark = (k) => { this._loaded.add(k); if (need.every((x) => this._loaded.has(x))) resolveReady(); };
    const fail = (k) => (err) => { console.error('[store]', k, err); mark(k); if (err?.code === 'permission-denied') this.emit('denied', err); };
    const listen = (q, k, fn) => this._unsubs.push(onSnapshot(q, (s) => { fn(s); mark(k); this.emit(k); this.emit('change', k); }, fail(k)));
    const rows = (s) => s.docs.map((d) => ({ id: d.id, ...d.data() }));
    const byName = (a, b) => (a.name || '').localeCompare(b.name || '', 'es', { numeric: true });

    listen(this.tenantRef(), 'tenant', (s) => { this.tenant = s.exists() ? { id: s.id, ...s.data() } : null; });
    listen(this.ref('config', 'settings'), 'settings', (s) => {
      this.settings = { ...DEFAULT_SETTINGS, ...(s.exists() ? s.data() : {}) };
      for (const k of ['categories', 'services']) {
        if (!Array.isArray(this.settings[k]) || !this.settings[k].length) this.settings[k] = DEFAULT_SETTINGS[k];
      }
      if (!Array.isArray(this.settings.techs)) this.settings.techs = [];
    });
    this._unsubs.push(onSnapshot(this.ref('config', 'security'), (s) => { this.security = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(this.ref('config', 'counters'), (s) => { this.counters = s.exists() ? s.data() : {}; }, () => {}));
    this._unsubs.push(onSnapshot(doc(db, 'system', 'announcement'), (s) => { this.announcement = s.exists() ? s.data() : null; this.emit('announcement'); }, () => {}));
    listen(query(this.col('repairs'), where('open', '==', true)), 'repairs', (s) => {
      this.repairs = rows(s).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    });
    listen(this.col('products'), 'products', (s) => { this.products = rows(s).sort(byName); this._pMap = null; });
    listen(this.col('customers'), 'customers', (s) => { this.customers = rows(s).sort(byName); });
    listen(query(this.col('cash_shifts'), where('status', '==', 'open')), 'shift', (s) => {
      this.openShift = rows(s).sort((a, b) => (b.openedAt || '').localeCompare(a.openedAt || ''))[0] || null;
    });
    const since = startOfDay(addDays(new Date(), -7)).toISOString();
    listen(query(this.col('sales'), where('date', '>=', since)), 'sales', (s) => {
      this.recentSales = rows(s).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    });

    // Nunca bloquear más de 8 s (p. ej. sin internet y sin caché)
    await Promise.race([readyP, new Promise((r) => setTimeout(r, 8000))]);
    this.ready = true;
  }

  stop() {
    this._unsubs.forEach((u) => { try { u(); } catch (_) {} });
    this._unsubs = [];
    this.ready = false;
    this.tenant = null; this.repairs = []; this.products = []; this.customers = [];
    this.openShift = null; this.recentSales = [];
    this.settings = { ...DEFAULT_SETTINGS }; this.security = {}; this.counters = {}; this._pMap = null;
  }

  // ---------- Ajustes ----------
  get rate() { return Number(this.settings.rate) || 0; }
  get businessName() { return this.settings.businessName || this.tenant?.name || 'Mi servicio técnico'; }

  async saveSettings(patch) {
    Object.assign(this.settings, patch);
    await this.save('config', 'settings', patch, true);
    this.emit('settings');
  }
  async setRate(rate, auto = false) {
    const v = Number(rate);
    if (!(v > 0)) throw new Error('Tasa inválida');
    await this.saveSettings({ rate: v, rateUpdatedAt: new Date().toISOString(), rateSource: auto ? 'bcv' : 'manual' });
    this.emit('rate', v);
  }

  /** Correlativo (órdenes "os" y facturas "inv"). Se reserva en el mismo lote que el documento. */
  nextSeq(b, key) {
    const n = (Number(this.counters[key]) || 0) + 1;
    this.counters = { ...this.counters, [key]: n };
    b.set(this.ref('config', 'counters'), { [key]: n }, { merge: true });
    return n;
  }

  // ---------- PIN de administrador ----------
  hasPin() { return !!this.security.pinHash; }
  async verifyPin(pin) {
    if (!this.security.pinHash) {
      const s = await getDoc(this.ref('config', 'security')).catch(() => null);
      if (s?.exists()) this.security = s.data();
    }
    if (!this.security.pinHash) return true;
    return (await sha256(`${this.tenantId}:${pin}`)) === this.security.pinHash;
  }
  async setPin(pin) {
    const pinHash = await sha256(`${this.tenantId}:${pin}`);
    this.security = { ...this.security, pinHash, updatedAt: new Date().toISOString() };
    await this.save('config', 'security', this.security, true);
  }

  // ---------- Búsquedas ----------
  product(id) {
    if (!this._pMap) this._pMap = new Map(this.products.map((p) => [p.id, p]));
    return this._pMap.get(id);
  }
  customer(id) { return this.customers.find((c) => c.id === id); }
  repair(id) { return this.repairs.find((r) => r.id === id); }
  tech(id) { return this.settings.techs.find((t) => t.id === id); }
  get activeTechs() { return this.settings.techs.filter((t) => t.active !== false); }

  // ---------- Alertas de stock ----------
  get lowProducts() {
    return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= (Number(p.minStock) || 0));
  }
  get outProducts() { return this.products.filter((p) => p.active !== false && p.trackStock !== false && (Number(p.stock) || 0) <= 0); }

  // ---------- Órdenes ----------
  get readyRepairs() { return this.repairs.filter((r) => r.status === 'listo' || r.status === 'no_reparado'); }
  get lateRepairs() {
    const now = Date.now();
    return this.repairs.filter((r) => r.promisedAt && new Date(r.promisedAt).getTime() < now && !['listo', 'no_reparado'].includes(r.status));
  }

  // ---------- Consultas ----------
  async listBetween(name, field, fromISO, toISO) {
    const s = await getDocs(query(this.col(name), where(field, '>=', fromISO), where(field, '<=', toISO)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async salesBetween(fromISO, toISO) { return this.listBetween('sales', 'date', fromISO, toISO); }
  async listEq(name, field, value) {
    const s = await getDocs(query(this.col(name), where(field, '==', value)));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  async getRepair(id) {
    const local = this.repair(id);
    if (local) return local;
    const s = await getDoc(this.ref('repairs', id));
    return s.exists() ? { id: s.id, ...s.data() } : null;
  }
  async closedShifts(max = 30) {
    const s = await getDocs(query(this.col('cash_shifts'), where('status', '==', 'closed')));
    return s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.closedAt || '').localeCompare(a.closedAt || '')).slice(0, max);
  }
}

export const store = new Store();

// ---------- Administración de sedes (solo administrador general) ----------
export async function listTenants() {
  const s = await getDocs(collection(db, 'tenants'));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.code || a.name || '').localeCompare(b.code || b.name || '', 'es', { numeric: true }));
}
export async function updateTenant(id, data) { await setDoc(doc(db, 'tenants', id), data, { merge: true }); }
export async function tenantSalesSince(tenantId, fromISO) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'sales'), where('date', '>=', fromISO)));
  return s.docs.map((d) => d.data());
}
export async function tenantOpenRepairs(tenantId) {
  const s = await getDocs(query(collection(db, 'tenants', tenantId, 'repairs'), where('open', '==', true)));
  return s.size;
}
export async function getTenant(id) {
  const s = await getDoc(doc(db, 'tenants', id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}
export async function createTenantDoc(id, data) { await setDoc(doc(db, 'tenants', id), data); }
export async function getUsername(username) {
  const s = await getDoc(doc(db, 'usernames', String(username).toLowerCase()));
  return s.exists() ? s.data() : null;
}
export async function setUsername(username, data) { await setDoc(doc(db, 'usernames', String(username).toLowerCase()), data); }
export async function deleteUsername(username) { await deleteDoc(doc(db, 'usernames', String(username).toLowerCase())); }
export async function setAnnouncement(data) { await setDoc(doc(db, 'system', 'announcement'), data); }
export async function getAnnouncement() {
  const s = await getDoc(doc(db, 'system', 'announcement'));
  return s.exists() ? s.data() : null;
}
/** Consulta pública del estado de un equipo (página /estado/CODIGO) */
export async function getTracking(code) {
  const s = await getDoc(doc(db, 'tracking', String(code).toUpperCase()));
  return s.exists() ? s.data() : null;
}
export { DEFAULT_SETTINGS };
