// Sano-Técnico — Renderiza los documentos impresos (orden carta, ticket, etiqueta) y los guarda como imagen
// Uso: node print-check.mjs [url=http://127.0.0.1:5066] [carpeta]  (emuladores con datos de test-emu.sh)
import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'http://127.0.0.1:5066') + '/?emu=1';
const OUT = process.argv[3] || path.join(here, 'shots');
mkdirSync(OUT, { recursive: true });
const acc = JSON.parse(readFileSync(path.join(here, '.accounts-emu.json'), 'utf8'));
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 900 });
await page.evaluateOnNewDocument(() => { window.print = () => {}; });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await page.type('#lg-user', 'sede01'); await page.type('#lg-pass', acc.sede01.password); await page.click('#lg-btn');
await page.waitForSelector('.sb-nav', { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
// Captura el HTML que se manda a imprimir
await page.evaluate(() => {
  window.__printed = [];
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
    if (n.tagName === 'IFRAME') setTimeout(() => window.__printed.push('<!DOCTYPE html>' + n.contentDocument.documentElement.outerHTML), 900);
  }))).observe(document.body, { childList: true });
});
const docs = await page.evaluate(async () => {
  const { store } = await import('/js/store.js');
  const sh = await import('/js/shared.js');
  const r = store.repairs[0];
  const wait = () => new Promise((r) => setTimeout(r, 1000));
  await sh.printRepairOrder(r, 'carta'); await wait();
  await sh.printRepairOrder(r, '80mm'); await wait();
  await sh.printLabel(r); await wait();
  const sales = await store.salesBetween('2000', '9999');
  sh.printReceipt(sales.find((s) => s.kind === 'reparacion') || sales[0]);
  await new Promise((r) => setTimeout(r, 1500));
  return window.__printed;
});
const names = ['orden-carta', 'orden-ticket', 'etiqueta', 'nota-entrega'];
for (let i = 0; i < docs.length; i++) {
  const p = await browser.newPage();
  await p.setViewport({ width: i === 0 ? 816 : 420, height: 600 });
  await p.setContent(docs[i], { waitUntil: 'load' });
  await p.screenshot({ path: path.join(OUT, `print-${names[i]}.png`), fullPage: true });
}
console.log('Documentos renderizados:', docs.length);
await browser.close();
