// Sano-Técnico — Prueba de extremo a extremo contra los emuladores
// Requisitos: firebase emulators:start --only auth,firestore,hosting  y  node provision.mjs 3 --emu
// Uso: node e2e.mjs [url=http://127.0.0.1:5066] [carpeta-capturas]
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:5066') + '/?emu=1';
const SHOTS = process.argv[3] || path.join(here, 'shots');
mkdirSync(SHOTS, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));

const results = [];
const ok = (name, cond, extra = '') => { results.push([cond ? 'OK ' : 'FALLA', name, extra]); console.log(cond ? '  ✔' : '  ✘', name, extra); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', '--window-size=1400,900'] });
const errors = [];

async function newPage(w = 1400, h = 900) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|dolarapi|ERR_|Failed to load resource|net::|CORS/i.test(m.text())) errors.push(`console: ${m.text()}`); });
  page.on('dialog', (d) => d.dismiss());
  // Evita que el diálogo de impresión bloquee la prueba
  await page.evaluateOnNewDocument(() => { window.print = () => {}; HTMLIFrameElement.prototype.focus = function () {}; });
  return { ctx, page };
}
const clickText = async (page, sel, text, timeout = 8000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const ok = await page.evaluate((sel, text) => {
      const el = [...document.querySelectorAll(sel)].find((e) => e.offsetParent !== null && !e.disabled && e.textContent.replace(/\s+/g, ' ').includes(text));
      if (el) { el.click(); return true; } return false;
    }, sel, text);
    if (ok) return true;
    await sleep(150);
  }
  throw new Error(`No encontré ${sel} con texto "${text}"`);
};
const waitText = (page, text, timeout = 15000) => page.waitForFunction((t) => document.body.innerText.includes(t), { timeout }, text);
const store = (page, fn, arg) => page.evaluate(async (fnSrc, arg) => { const { store } = await import('/js/store.js'); return (0, eval)(fnSrc)(store, arg); }, fn.toString(), arg);
const fill = async (page, sel, value) => { await page.$eval(sel, (e) => { e.value = ''; }); await page.type(sel, String(value)); };
const nav = async (page, id) => { await page.evaluate((id) => { const b = document.querySelector(`.sb-nav [data-nav="${id}"]`); b.click(); }, id); await sleep(700); };

const ORIGIN = process.argv[2] || 'http://127.0.0.1:5066';
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name) });
const top = '.modal-backdrop:last-child';
const closeModals = (page) => page.evaluate(async () => { const u = await import('/js/utils.js'); u.closeAllModals(); });
const typePin = async (page, pin) => {
  await page.waitForSelector(`${top} [data-pin]`, { timeout: 8000 });
  await page.type(`${top} [data-pin]`, pin);
  await page.click(`${top} [data-ok]`);
  await sleep(700);
};
const login = async (page, user, pass) => {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form');
  await page.type('#lg-user', user);
  await page.type('#lg-pass', pass);
  await page.click('#lg-btn');
};
const repairs = (page) => store(page, (s) => s.repairs.map((r) => ({ id: r.id, number: r.number, status: r.status, trackCode: r.trackCode, paid: r.paid, total: r.total })));
const readPublic = (page, code) => page.evaluate(async (c) => { const f = await import('/js/firebase.js'); try { const d = await f.getDoc(f.doc(f.db, 'tracking', c)); return d.exists() ? d.data() : null; } catch (e) { return e.code; } }, code);
let demoUid = null; let demoCode = null;

try {
  // ==================================================================
  console.log('\n1) Pantalla de inicio de sesión');
  let { ctx, page } = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.waitForSelector('#login-form');
  ok('Login visible', true);
  ok('Botón de demo', !!(await page.$('#lg-demo')));
  ok('Botón “Consultar el estado de mi equipo”', !!(await page.$('#lg-track')));
  const wa = await page.$eval('#lg-wa', (a) => a.href);
  ok('WhatsApp de contratación 584221906045', wa.includes('wa.me/584221906045'), wa.slice(0, 40));
  ok('Logo del sistema', await page.evaluate(() => [...document.images].some((i) => i.src.includes('/assets/logo.svg') && i.complete && i.naturalWidth > 0)));
  await shot(page, '01-login.png');

  // ==================================================================
  console.log('\n2) Demo de 30 minutos');
  await page.click('#lg-demo');
  await page.waitForSelector('.sb-nav', { timeout: 60000 });
  await waitText(page, 'Modo demo');
  await page.waitForSelector('.tour-tip', { timeout: 15000 });
  ok('Recorrido guiado se abre solo en la demo', true);
  await shot(page, '02-tour.png');
  await page.click('.tour-tip [data-t="stop"]');
  await sleep(2500);
  demoUid = await page.evaluate(async () => (await import('/js/firebase.js')).auth.currentUser.uid);
  const d = await store(page, (s) => ({ p: s.products.length, r: s.repairs.length, st: [...new Set(s.repairs.map((x) => x.status))], shift: !!s.openShift, techs: s.settings.techs.length, sales: s.recentSales.length, c: s.customers.length }));
  ok('Inventario de ejemplo', d.p >= 20, `${d.p} productos`);
  ok('Órdenes abiertas en varias etapas', d.r >= 7 && d.st.length >= 6, `${d.r} órdenes · ${d.st.join(', ')}`);
  ok('Técnicos, clientes y caja abierta', d.techs === 3 && d.c >= 8 && d.shift);
  ok('Historial de ventas y entregas', d.sales >= 15, `${d.sales} documentos`);
  await page.waitForSelector('[data-tour="pipeline"] .pipe');
  await shot(page, '03-inicio-demo.png');
  await nav(page, 'ordenes');
  await page.waitForSelector('#o-board .rcard');
  ok('Tablero del taller con tarjetas', (await page.$$('#o-board .rcard')).length >= 7);
  await shot(page, '04-tablero.png');
  const repId = (await repairs(page)).find((r) => r.status === 'reparacion').id;
  await page.click(`#o-board [data-open="${repId}"]`);
  await page.waitForSelector('.repair-modal .rp-head');
  ok('Ficha de la orden abre', true);
  await shot(page, '05-orden.png');
  await clickText(page, '.repair-modal .rp-tabs button', 'Historial');
  await page.waitForSelector('.repair-modal .timeline');
  ok('Historial de la orden', (await page.$$('.repair-modal .tl-item')).length >= 2);
  await closeModals(page);
  demoCode = (await repairs(page)).find((r) => r.status === 'reparacion')?.trackCode;
  // PIN de la demo
  await nav(page, 'reportes');
  await page.waitForSelector(`${top} [data-pin]`);
  ok('El PIN de la demo se muestra (1234)', await page.evaluate(() => document.querySelector('.modal-backdrop:last-child').innerText.includes('1234')));
  await page.type(`${top} [data-pin]`, '9999'); await page.click(`${top} [data-ok]`); await sleep(800);
  ok('PIN incorrecto rechazado', await page.evaluate(() => (document.querySelector('.modal-backdrop:last-child [data-err]')?.textContent || '').length > 3));
  await page.$eval(`${top} [data-pin]`, (e) => { e.value = ''; });
  await page.type(`${top} [data-pin]`, '1234'); await page.click(`${top} [data-ok]`);
  await sleep(2500);
  ok('Reportes con PIN 1234', await page.evaluate(() => !document.querySelector('.modal [data-pin]') && document.querySelector('.view-title')?.textContent.includes('Reportes')));
  await shot(page, '06-reportes-demo.png');
  // Página pública de la demo
  const pub = await newPage(390, 844);
  await pub.page.goto(`${ORIGIN}/estado/${demoCode}?emu=1`, { waitUntil: 'domcontentloaded' });
  await pub.page.waitForSelector('.tr-hero', { timeout: 20000 });
  ok('Consulta pública del cliente (sin sesión)', await pub.page.evaluate(() => document.body.innerText.includes('reparación') || document.body.innerText.includes('Reparación')), demoCode);
  await shot(pub.page, '07-consulta-publica.png');
  await pub.ctx.close();
  // Terminar la demo
  await page.click('#demo-end');
  await page.waitForSelector(`${top} [data-yes]`);
  await page.click(`${top} [data-yes]`);
  await page.waitForSelector('#login-form', { timeout: 40000 });
  ok('Demo terminada vuelve al login', true);
  await ctx.close();

  // ==================================================================
  console.log('\n3) Sede: caja, recepción de un equipo y flujo completo');
  ({ ctx, page } = await newPage());
  await login(page, 'sede01', acc.sede01.password);
  await page.waitForSelector('.sb-nav', { timeout: 30000 });
  ok('Sede01 inicia sesión con su usuario', true);
  await sleep(1200);
  await store(page, (s) => s.setRate(40, false));
  await closeModals(page);
  await sleep(500);
  ok('Tasa configurada', (await store(page, (s) => s.rate)) === 40);
  // Repuesto y accesorio en inventario
  await store(page, async (s) => {
    const b = s.batch(); const now = new Date().toISOString();
    b.set(s.newRef('products'), { name: 'Pantalla Prueba A54', category: 'Pantallas', compatible: 'A54', cost: 20, price: 45, stock: 3, minStock: 1, sellable: false, trackStock: true, active: true, sold: 0, createdAt: now, updatedAt: now });
    b.set(s.newRef('products'), { name: 'Forro Prueba', category: 'Forros', compatible: '', cost: 1, price: 5, stock: 10, minStock: 2, sellable: true, trackStock: true, active: true, sold: 0, createdAt: now, updatedAt: now });
    await s.commit(b);
  });
  await sleep(800);
  // Abrir caja (UI)
  await nav(page, 'caja');
  await page.waitForSelector('#k-open');
  await page.type('#k-open [name="usd"]', '20');
  await page.type('#k-open [name="bs"]', '400');
  await page.click('#k-open button[type="submit"], #k-open .btn-primary');
  await sleep(1500);
  ok('Caja abierta desde la pantalla', !!(await store(page, (s) => s.openShift?.id)));
  // Recibir equipo (UI)
  await nav(page, 'recibir');
  await page.waitForSelector('#in-cname');
  await page.type('#in-cname', 'Carlos Prueba');
  await page.type('#in-cphone', '0414-5556677');
  await page.click('[data-brand="Samsung"]'); await sleep(200);
  await page.type('#in-model', 'Galaxy A54');
  await page.type('#in-imei', '490154203237518');
  ok('IMEI válido detectado (Luhn)', await page.$eval('#in-imei-hint', (e) => e.textContent.includes('válido')));
  await page.click('[data-unlock="pattern"]'); await sleep(250);
  for (const i of [0, 4, 8, 5]) { await page.click(`.pp-dot[data-i="${i}"]`); await sleep(80); }
  ok('Patrón de desbloqueo dibujado', (await page.$$('.pp-dot.on')).length === 4);
  await page.click('[data-fault="Pantalla rota"]');
  await page.type('#in-fault', 'Se cayó, la pantalla está partida y el táctil falla');
  await page.click('#in-allok'); await sleep(250);
  await page.click('[data-cond="Pantalla partida"]');
  await page.click('[data-acc="Chip SIM"]');
  await page.click('[data-svc="1"]'); await sleep(250);
  await shot(page, '08-recibir.png');
  await page.click('#in-save');
  await waitText(page, 'Orden de servicio registrada', 15000);
  ok('Orden registrada OS-0001', await page.evaluate(() => document.querySelector('.modal').innerText.includes('OS-0001')));
  await shot(page, '09-orden-creada.png');
  let rs = await repairs(page);
  const r1 = rs.find((r) => r.number === 'OS-0001');
  ok('Código de seguimiento generado', /^[A-Z0-9]{6}$/.test(r1?.trackCode || ''), r1?.trackCode);
  ok('Cliente nuevo registrado', (await store(page, (s) => s.customers.some((c) => c.name === 'Carlos Prueba'))));
  ok('Patrón guardado', (await store(page, (s, id) => s.repair(id).device.pattern.join(''), r1.id)) === '0485');
  let pubDoc = await readPublic(page, r1.trackCode);
  ok('Ficha pública creada', pubDoc?.status === 'recibido' && pubDoc?.business?.name === 'Sede 01', pubDoc?.statusLabel);
  // Ver orden → presupuesto con repuesto
  await page.click(`${top} [data-a="open"]`);
  await page.waitForSelector('.repair-modal .rp-head');
  await clickText(page, '.repair-modal .rp-tabs button', 'Presupuesto');
  await page.waitForSelector('.repair-modal [data-part]');
  await page.type('.repair-modal [data-part]', 'pantalla prueba');
  await page.waitForSelector('.repair-modal [data-sug] [data-pid]');
  await page.click('.repair-modal [data-sug] [data-pid]');
  await sleep(300);
  await page.click('.repair-modal [data-savebudget]');
  await sleep(1500);
  const stockAfter = await store(page, (s) => s.products.find((p) => p.name === 'Pantalla Prueba A54').stock);
  ok('Repuesto descontado del inventario', stockAfter === 2, `stock ${stockAfter}`);
  rs = await repairs(page);
  ok('Total del presupuesto (15 + 45)', rs[0].total === 60, `$${rs[0].total}`);
  await shot(page, '10-presupuesto.png');
  // Cambiar estado → reparación → listo
  for (const s of ['reparacion', 'listo']) {
    await page.click(`.repair-modal [data-st="${s}"]`);
    await page.waitForSelector(`${top} [data-n]`);
    await page.evaluate(() => { const w = document.querySelector('.modal-backdrop:last-child [data-w]'); if (w) w.checked = false; });
    await page.click(`${top} [data-ok]`);
    await sleep(1200);
  }
  rs = await repairs(page);
  ok('Estado cambiado a Listo', rs[0].status === 'listo');
  pubDoc = await readPublic(page, r1.trackCode);
  ok('Ficha pública actualizada (listo)', pubDoc?.status === 'listo');
  // Abono
  await page.click('.repair-modal .rp-foot [data-dep]');
  await page.waitForSelector(`${top} [data-amount]`);
  await page.$eval(`${top} [data-amount]`, (e) => { e.value = ''; });
  await page.type(`${top} [data-amount]`, '20');
  await sleep(200);
  await page.evaluate(() => { const l = document.querySelector('.modal-backdrop:last-child [data-rm]'); l?.click(); });
  await page.click(`${top} [data-m="efectivo_usd"]`);
  await sleep(200);
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Abono registrado', 10000);
  await page.keyboard.press('Escape'); await sleep(400);
  rs = await repairs(page);
  ok('Abono de $20 registrado', rs[0].paid === 20, `pagado $${rs[0].paid}`);
  // Entregar (cobra el saldo de $40 en pago móvil)
  await page.click('.repair-modal .rp-foot [data-deliver]');
  await page.waitForSelector(`${top} [data-m="pagomovil"]`);
  await page.evaluate(() => { const l = document.querySelector('.modal-backdrop:last-child [data-rm]'); l?.click(); });
  await page.click(`${top} [data-m="pagomovil"]`);
  await sleep(200);
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Equipo entregado', 12000);
  await shot(page, '11-entregado.png');
  await page.keyboard.press('Escape'); await sleep(300);
  await closeModals(page);
  const delivered = await store(page, (s, id) => s.getRepair(id), r1.id);
  ok('Orden entregada con factura y garantía', delivered.status === 'entregado' && !!delivered.invoiceNumber && !!delivered.warrantyUntil, `${delivered.invoiceNumber}`);
  pubDoc = await readPublic(page, r1.trackCode);
  ok('Ficha pública: entregado con garantía', pubDoc?.status === 'entregado' && !!pubDoc?.warrantyUntil);
  const shift = await store(page, (s) => s.openShift);
  ok('Caja: 2 cobros por $60 ($20 efectivo + Bs 1.600)', shift.salesCount === 2 && Math.abs(shift.salesTotal - 60) < 0.01 && shift.inUSD === 20, `${shift.salesCount} cobros · $${shift.salesTotal}`);
  // Garantías
  await nav(page, 'garantias');
  await waitText(page, 'OS-0001', 10000);
  ok('Aparece en garantías vigentes', true);
  await shot(page, '12-garantias.png');
  // Facturación: anular la nota de entrega
  await nav(page, 'facturas');
  await page.waitForSelector('[data-view]');
  await shot(page, '13-facturacion.png');
  const invId = await page.evaluate(() => { const row = [...document.querySelectorAll('tbody tr')].find((tr) => tr.innerText.includes('Reparación')); return row?.querySelector('[data-view]')?.dataset.view; });
  await page.click(`[data-view="${invId}"]`);
  await page.waitForSelector(`${top} [data-void]`);
  await page.click(`${top} [data-void]`);
  await typePin(page, acc.sede01.pin);
  await page.waitForSelector(`${top} [data-r]`);
  await page.type(`${top} [data-r]`, 'Prueba de anulación');
  await page.click(`${top} [data-ok]`);
  await sleep(2000);
  const reopened = await store(page, (s, id) => s.getRepair(id), r1.id);
  ok('Anular la factura reabre la orden', reopened.status === 'listo' && reopened.open === true && reopened.paid === 20, `${reopened.status} · pagado $${reopened.paid}`);
  // Venta de mostrador
  await nav(page, 'vender');
  await page.waitForSelector('#pos-grid .pcard');
  await clickText(page, '#pos-grid .pcard', 'Forro Prueba');
  await clickText(page, '#pos-grid .pcard', 'Forro Prueba');
  await sleep(300);
  await shot(page, '14-vender.png');
  await page.click('#c-pay');
  await page.waitForSelector(`${top} [data-ok]`);
  await page.click(`${top} [data-ok]`);
  await sleep(1800);
  await closeModals(page);
  const forro = await store(page, (s) => s.products.find((p) => p.name === 'Forro Prueba').stock);
  ok('Venta de 2 forros descuenta inventario', forro === 8, `stock ${forro}`);
  // Técnicos e inventario
  await nav(page, 'tecnicos'); await sleep(600);
  await shot(page, '15-tecnicos.png');
  await nav(page, 'inventario'); await page.waitForSelector('#i-kpis');
  await shot(page, '16-inventario.png');
  ok('Pantallas sin errores de carga', true);
  // Seguridad
  const leak = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.getDoc(f.doc(f.db, 'tenants', other, 'config', 'settings')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede01 NO puede leer datos de sede02', leak === 'permission-denied', leak);
  const selfPlan = await page.evaluate(async (me) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'tenants', me), { paidUntil: null, plan: 'Premium' }, { merge: true }); return 'escrito'; } catch (e) { return e.code; } }, acc.sede01.uid);
  ok('Sede no puede cambiar su propio plan', selfPlan === 'permission-denied', selfPlan);
  const fakeTrack = await page.evaluate(async (other) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'tracking', 'FAKE01'), { tenantId: other, status: 'listo' }); return 'escrito'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('No se puede crear seguimiento a nombre de otra sede', fakeTrack === 'permission-denied', fakeTrack);
  const hijack = await page.evaluate(async (code) => { const f = await import('/js/firebase.js'); try { await f.setDoc(f.doc(f.db, 'tracking', code), { tenantId: 'x', status: 'listo' }); return 'escrito'; } catch (e) { return e.code; } }, demoCode);
  ok('No se puede modificar el seguimiento de otro', hijack === 'permission-denied', hijack);
  const listTrack = await page.evaluate(async () => { const f = await import('/js/firebase.js'); try { await f.getDocs(f.collection(f.db, 'tracking')); return 'listado'; } catch (e) { return e.code; } });
  ok('Nadie puede listar los seguimientos', listTrack === 'permission-denied', listTrack);
  // Cierre de caja
  await nav(page, 'caja');
  await page.waitForSelector('#k-close');
  await page.click('#k-close');
  await sleep(600);
  if (await page.$(`${top} [data-pin]`)) await typePin(page, acc.sede01.pin);
  await page.waitForSelector(`${top} [name="usd"]`);
  await page.type(`${top} [name="usd"]`, '50');
  await page.type(`${top} [name="bs"]`, '400');
  await page.click(`${top} [data-ok]`);
  await sleep(2000);
  ok('Cierre de caja', !(await store(page, (s) => s.openShift)));
  await closeModals(page);
  // Móvil
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await nav(page, 'inicio').catch(() => {});
  await page.evaluate(() => { location.hash = '#/inicio'; }); await sleep(1200);
  await shot(page, '17-movil-inicio.png');
  await page.evaluate(() => { location.hash = '#/recibir'; }); await sleep(1200);
  await shot(page, '18-movil-recibir.png');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok('Móvil sin desborde horizontal', overflow <= 1, `${overflow}px`);
  await ctx.close();

  // ==================================================================
  console.log('\n4) Panel del administrador');
  ({ ctx, page } = await newPage());
  await login(page, 'admin', acc.admin.password);
  await waitText(page, 'Panel de administración de sedes', 20000);
  await page.waitForSelector('[data-enter]');
  await sleep(1500);
  await shot(page, '19-admin.png');
  ok('Admin ve las sedes', (await page.$$('[data-enter]')).length >= 3);
  await page.click(`[data-tog="${acc.sede02.uid}"]`);
  await page.waitForSelector(`${top} [data-ok]`);
  await page.click(`${top} [data-ok]`);
  await sleep(900);
  ok('Sede02 congelada', await page.evaluate(() => document.body.innerText.includes('Congelada')));
  await page.click('#a-new');
  await page.waitForSelector(`${top} [name="name"]`);
  await page.type(`${top} [name="name"]`, 'Celulares Prueba');
  await page.click(`${top} [data-ok]`);
  await waitText(page, 'Sede creada', 20000);
  const newPass = await page.evaluate(() => [...document.querySelectorAll('.modal .summary-row')].find((r) => r.textContent.includes('Contraseña')).querySelector('b').textContent);
  const newUser = await page.evaluate(() => [...document.querySelectorAll('.modal .summary-row')].find((r) => r.textContent.includes('Usuario')).querySelector('b').textContent);
  ok('Nueva sede creada desde el panel', !!newPass, newUser);
  await page.keyboard.press('Escape');
  await page.waitForSelector(`[data-enter="${acc.sede01.uid}"]`, { timeout: 20000 });
  await sleep(500);
  await page.click(`[data-enter="${acc.sede01.uid}"]`);
  await waitText(page, 'Modo administrador', 20000);
  ok('Admin entra a la sede01', (await store(page, (s) => s.products.length)) === 2);
  const demoGone = await page.evaluate(async (uid) => { const f = await import('/js/firebase.js'); return (await f.getDoc(f.doc(f.db, 'tenants', uid))).exists(); }, demoUid);
  ok('La demo se borró al terminar', demoGone === false);
  await ctx.close();

  // ==================================================================
  console.log('\n5) Sede congelada y sede nueva');
  ({ ctx, page } = await newPage());
  await login(page, 'sede02', acc.sede02.password);
  await waitText(page, 'Cuenta congelada', 20000);
  ok('Sede congelada ve el bloqueo con WhatsApp', await page.evaluate(() => !!document.querySelector('a[href*="584221906045"]')));
  const frozenRead = await page.evaluate(async (me) => { const f = await import('/js/firebase.js'); try { await f.getDoc(f.doc(f.db, 'tenants', me, 'config', 'settings')); return 'leído'; } catch (e) { return e.code; } }, acc.sede02.uid);
  ok('Sede congelada no puede leer datos (reglas)', frozenRead === 'permission-denied', frozenRead);
  const demoTrack = await readPublic(page, demoCode);
  ok('Seguimiento de la demo borrado', demoTrack === null, String(demoTrack));
  await page.click('#blk-out');
  await page.waitForSelector('#login-form');
  await page.type('#lg-user', newUser);
  await page.type('#lg-pass', newPass);
  await page.click('#lg-btn');
  await page.waitForSelector('.sb-nav', { timeout: 20000 });
  ok('Sede nueva inicia sesión', await page.evaluate(() => document.body.innerText.includes('Celulares Prueba')));
  await ctx.close();
} catch (e) {
  console.error('\nERROR EN LA PRUEBA:', e.message);
  results.push(['FALLA', 'Excepción', e.message]);
} finally {
  await browser.close();
}
console.log('\nErrores de la página:', errors.length ? '\n' + [...new Set(errors)].join('\n') : 'ninguno');
const fails = results.filter((r) => r[0] !== 'OK ');
console.log(`\nRESULTADO: ${results.length - fails.length}/${results.length} OK`);
process.exit(fails.length || errors.length ? 1 : 0);
