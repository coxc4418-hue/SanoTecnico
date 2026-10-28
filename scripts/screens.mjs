// Genera las capturas del manifiesto (ventana de instalación de Chrome) desde la demo
// Uso: node screens.mjs [url=https://sano-tecnico.web.app]  (con emuladores: http://127.0.0.1:5066/?emu=1)
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'screens');
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
await p.evaluateOnNewDocument(() => {
  localStorage.setItem('st_install_hide', '1'); localStorage.setItem('st_theme', 'dark');
  const st = document.createElement('style'); st.textContent = '.toasts,.demo-banner,[data-install]{display:none!important}';
  document.addEventListener('DOMContentLoaded', () => document.head.appendChild(st));
});
const URL_ = process.argv[2] || 'https://sano-tecnico.web.app';
await p.goto(URL_, { waitUntil: 'networkidle2' });
await p.waitForSelector('#lg-demo'); await p.click('#lg-demo');
await p.waitForSelector('.sb-nav', { timeout: 60000 }); await sleep(5000);
const go = async (id, mobile) => { await p.evaluate((id, m) => document.querySelector(`${m ? '.bottom-nav' : '.sb-nav'} [data-nav="${id}"]`)?.click(), id, mobile); await sleep(1800); };
const shot = (f) => p.screenshot({ path: path.join(out, f) });
await p.evaluate(() => document.querySelector('.tour-tip [data-t="stop"]')?.click()); await sleep(800);
await go('inicio'); await shot('pc-inicio.png');
await go('ordenes'); await shot('pc-ordenes.png');
await go('recibir'); await shot('pc-recibir.png');
const code = await p.evaluate(async () => (await import('/js/store.js')).store.repairs.find((r) => r.status === 'reparacion')?.trackCode);
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
await p.waitForSelector('.bottom-nav [data-nav="inicio"]', { timeout: 30000 }); await sleep(2500);
await go('inicio', true); await shot('movil-inicio.png');
await go('ordenes', true); await shot('movil-ordenes.png');
const pub = await b.newPage();
await pub.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
const u = new URL(URL_); await pub.goto(`${u.origin}/estado/${code}${u.search}`, { waitUntil: 'domcontentloaded' });
await pub.waitForSelector('.tr-hero', { timeout: 30000 }); await sleep(800);
await pub.screenshot({ path: path.join(out, 'movil-estado.png') }); await pub.close();
// Terminar la demo (borra sus datos)
await p.setViewport({ width: 1280, height: 800 });
await p.waitForSelector('#demo-end', { timeout: 30000 }); await sleep(1500);
await p.evaluate(() => document.getElementById('demo-end').click());
await p.waitForSelector('.modal [data-yes]'); await p.click('.modal [data-yes]');
await p.waitForSelector('#login-form', { timeout: 60000 });
await b.close();
console.log('capturas listas');
