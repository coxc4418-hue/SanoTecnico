// Sano-Técnico — Revisa que ninguna pantalla tenga scroll lateral en distintos anchos (teléfono, tablet, PC)
// Uso: node mobile-check.mjs [url=http://127.0.0.1:5066/?emu=1] [carpeta]   (entra con la demo)
import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] || 'http://127.0.0.1:5066/?emu=1';
const OUT = process.argv[3] || path.join(here, 'shots', 'mobile');
mkdirSync(OUT, { recursive: true });
const VIEWS = ['inicio', 'recibir', 'ordenes', 'garantias', 'vender', 'facturas', 'caja', 'clientes', 'inventario', 'tecnicos', 'reportes', 'ajustes'];
const SIZES = [
  { name: 'phone-320', width: 320, height: 640, mobile: true },
  { name: 'phone-360', width: 360, height: 760, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'phone-430', width: 430, height: 932, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'tablet-1024', width: 1024, height: 768, mobile: true },
  { name: 'pc-1366', width: 1366, height: 768, mobile: false }
];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Elementos que se salen por la derecha (los más profundos) y ancho total del documento
const measure = ([label, W]) => ({
  label,
  vw: W, iw: innerWidth,
  sw: document.documentElement.scrollWidth,
  bw: document.body.scrollWidth,
  over: [...document.querySelectorAll('body *')].filter((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || r.right <= W + 1) return false;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return false;
    }
    return ![...el.children].some((c) => c.getBoundingClientRect().right > W + 1);
  }).slice(0, 8).map((el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} → ${Math.round(el.getBoundingClientRect().right)}px`)
});

const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let fails = 0;
for (const s of SIZES.filter((z) => !process.env.ONLY || z.name === process.env.ONLY)) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: s.width, height: s.height, isMobile: s.mobile, hasTouch: s.mobile, deviceScaleFactor: s.mobile ? 2 : 1 });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(1, 3).join(' | ')));
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  const check = async (label, shot) => {
    const m = await page.evaluate(measure, [label, s.width]);
    const bad = m.sw > m.vw + 1 || m.iw > m.vw + 1 || m.over.length;
    if (bad) { fails++; console.log(`✗ ${s.name} ${label}: doc ${m.sw}px, ventana ${m.iw}px / pantalla ${m.vw}px`, m.over); }
    if (shot || bad) await page.screenshot({ path: path.join(OUT, `${s.name}-${label}.png`), fullPage: s.width === 360 });
  };
  await check('login', s.width <= 390);
  await page.click('#lg-demo');
  await page.waitForSelector('.sb-nav', { timeout: 60000 });
  await sleep(2500);
  await check('inicio-con-recorrido', s.mobile);
  await page.evaluate(async () => (await import('/js/tour.js')).stopTour());
  await sleep(500);
  for (const v of VIEWS) {
    await page.evaluate((v) => { location.hash = '#/' + v; }, v);
    await sleep(1300);
    if (v === 'reportes' && await page.$('.modal [data-pin]')) {
      await page.type('.modal [data-pin]', '1234'); await page.evaluate(() => document.querySelector('.modal [data-ok]').click()); await sleep(1500);
    }
    await check(v, s.width === 360);
  }
  // Ficha de una orden abierta
  await page.evaluate(() => { location.hash = '#/ordenes'; }); await sleep(1200);
  const clickSel = (sel, text) => page.evaluate((sel, text) => {
    const el = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent || getComputedStyle(e).position === 'fixed').find((e) => !text || e.textContent.includes(text));
    if (el) el.click(); return !!el;
  }, sel, text);
  const closeModals = async () => { await page.evaluate(async () => (await import('/js/utils.js')).closeAllModals()); await sleep(400); };
  const opened = await clickSel('.rcard', 'Listo para entregar') || await clickSel('.rcard, #o-list tbody tr, .rlist > *');
  if (opened) {
    await sleep(1500); await check('ficha-orden', s.width <= 390);
    for (const t of ['presupuesto', 'pagos', 'fotos', 'historial']) {
      if (await clickSel(`.repair-modal [data-tab="${t}"]`)) { await sleep(700); await check(`ficha-${t}`, s.width === 360); }
    }
    if (await clickSel('.repair-modal .rp-foot [data-deliver]')) { await sleep(1200); await check('entregar-cobro', s.width === 360); }
    await closeModals();
  }
  // Venta de mostrador con cobro
  await page.evaluate(() => { location.hash = '#/vender'; }); await sleep(1200);
  await clickSel('#pos-grid .pcard'); await sleep(300);
  if (s.width <= 980) { await clickSel('#cart-fab'); await sleep(600); await check('vender-carrito', s.width === 360); }
  if (await clickSel('#c-pay')) { await sleep(1000); await check('vender-cobrar', s.width === 360); }
  await closeModals();
  // Búsqueda y ayuda
  await page.evaluate(() => { location.hash = '#/inicio'; }); await sleep(1000);
  if (await clickSel('#tb-search') || await clickSel('#sb-search')) { await sleep(600); await page.keyboard.type('Samsung'); await sleep(900); await check('busqueda', s.width === 360); }
  await closeModals();
  await page.evaluate(async () => (await import('/js/tour.js')).openHelp()); await sleep(700); await check('ayuda', s.width === 360);
  await closeModals();
  // Consulta pública del cliente
  const code = await page.evaluate(async () => (await import('/js/store.js')).store.repairs.find((r) => r.trackCode)?.trackCode);
  if (code) {
    const pub = await ctx.newPage();
    await pub.setViewport({ width: s.width, height: s.height, isMobile: s.mobile, hasTouch: s.mobile, deviceScaleFactor: s.mobile ? 2 : 1 });
    await pub.goto(new URL(`/estado/${code}`, BASE).href + (BASE.includes('emu=1') ? '?emu=1' : ''), { waitUntil: 'networkidle2' });
    await sleep(1500);
    const m = await pub.evaluate(measure, ['consulta-publica', s.width]);
    if (m.sw > m.vw + 1 || m.iw > m.vw + 1 || m.over.length) { fails++; console.log(`✗ ${s.name} consulta-publica: doc ${m.sw}px`, m.over); }
    if (s.width === 360) await pub.screenshot({ path: path.join(OUT, `${s.name}-consulta-publica.png`), fullPage: true });
    await pub.close();
  }
  if (errs.length) { fails++; console.log(`✗ ${s.name} errores:`, errs); }
  console.log(`${s.name} revisado`);
  await ctx.close();
}
await browser.close();
console.log(fails ? `FALLAS: ${fails}` : 'SIN SCROLL LATERAL EN NINGÚN ANCHO');
process.exit(fails ? 1 : 0);
