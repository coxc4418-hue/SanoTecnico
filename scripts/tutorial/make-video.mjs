// Sano-Técnico — Genera el video tutorial narrado (voz es-VE) grabando el sistema real.
// Requisitos: emuladores corriendo (o URL de producción), ffmpeg en el PATH y `pip install edge-tts`.
// Uso: node make-video.mjs [url=http://127.0.0.1:5066/?emu=1]
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const APP = process.argv[2] || 'http://127.0.0.1:5066/?emu=1';
const WORK = path.join(here, 'work');
const OUT_DIR = path.join(here, '..', '..', 'public', 'tutorial');
mkdirSync(WORK, { recursive: true }); mkdirSync(OUT_DIR, { recursive: true });
const FFMPEG = execFileSync('where', ['ffmpeg']).toString().split(/\r?\n/)[0].trim();
const VOICE = 'es-VE-PaolaNeural';
const W = 1280, H = 720;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ======================================================================
// Guion: cada escena tiene la narración y las acciones que se graban
// ======================================================================
const SCENES = [
  { id: '01-intro', card: 'intro', text: 'Hola. Bienvenido a Sano-Técnico, el sistema para servicios técnicos y talleres de reparación de celulares, tablets y computadoras. En pocos minutos te muestro cómo usarlo.' },
  { id: '02-login', text: 'Para empezar, entra con el usuario y la contraseña de tu taller. Si solo quieres probar, toca “Probar demo gratis”: tendrás treinta minutos con un taller de ejemplo, y el PIN de la demo es uno, dos, tres, cuatro.',
    act: async (v, dur) => { await v.hl('#login-form', 4200); await v.hl('#lg-demo', 4600); await v.move('#lg-demo'); await sleep(Math.max(0, dur * 1000 - 11800)); await v.point('#lg-demo'); }, after: 'demo' },
  { id: '03-inicio', text: 'Esta es la pantalla de inicio. Ves lo cobrado hoy en dólares y bolívares, los equipos que hay en el taller, los que están listos para entregar y lo que falta por cobrar. Abajo, cuántos equipos hay en cada etapa. Y con el buscador encuentras cualquier orden por número, cliente, modelo o IMEI.',
    act: async (v) => { await v.hl('[data-tour="kpis"]', 6000); await v.hl('[data-tour="pipeline"]', 5000); await v.hl('#sb-search', 3000); await v.hl('#sb-rate', 2200); } },
  { id: '04-recibir', text: 'Llega un cliente con un celular. Toca “Recibir equipo”. Escribe el nombre y el teléfono del cliente, elige la marca y el modelo, y anota el IMEI: el sistema verifica que sea válido. Si el equipo tiene patrón de desbloqueo, lo dibujas aquí mismo.',
    act: async (v) => {
      await v.nav('recibir'); await sleep(600);
      await v.point('#in-cname'); await v.page.keyboard.type('Carlos Ramírez', { delay: 60 });
      await v.point('#in-cphone'); await v.page.keyboard.type('0414-7778899', { delay: 50 });
      await v.point('[data-brand="Redmi"]'); await sleep(300);
      await v.point('#in-model'); await v.page.keyboard.type('Note 11', { delay: 70 });
      await v.point('#in-imei'); await v.page.keyboard.type('490154203237518', { delay: 40 });
      await v.hl('#in-imei-hint', 1500);
      await v.point('[data-unlock="pattern"]'); await sleep(500);
      for (const i of [0, 1, 2, 4, 6]) await v.point(`.pp-dot[data-i="${i}"]`);
    } },
  { id: '05-revision', text: 'Marca la falla que reporta el cliente y descríbela. Luego deja constancia de cómo llega el equipo: qué funciona y qué no, el estado físico, los accesorios que deja y hasta cuatro fotos. Agrega el servicio con su precio, y toca “Registrar orden”.',
    act: async (v) => {
      await v.point('[data-fault="Pantalla rota"]');
      await v.point('#in-fault'); await v.page.keyboard.type('Se cayó y la pantalla no da imagen', { delay: 45 });
      await v.point('#in-allok'); await sleep(500);
      await v.point('[data-cond="Pantalla partida"]');
      await v.point('[data-acc="Chip SIM"]'); await v.point('[data-acc="Forro"]');
      await v.point('[data-svc="1"]'); await sleep(500);
      await v.hl('.in-summary', 2200);
      await v.point('#in-save'); await sleep(1600);
    } },
  { id: '06-orden', text: 'La orden queda registrada con su número y un código de seguimiento. Puedes imprimir la orden de servicio en hoja carta, con términos, firmas y un código QR, el ticket, o una etiqueta para pegarla al equipo. Y enviársela al cliente por WhatsApp.',
    act: async (v) => { await v.hl('.modal .track-box', 4000); await v.hl('.modal .done-actions', 5000); await v.move('.modal [data-a="open"]'); }, after: 'closeModal' },
  { id: '07-tablero', text: 'En Órdenes de servicio está el tablero del taller: cada columna es una etapa, desde recibido hasta listo. Las órdenes atrasadas se marcan en rojo. Abramos la que acabamos de recibir.',
    act: async (v) => { await v.nav('ordenes'); await sleep(700); await v.hl('#o-board', 5500); await v.pointText('#o-board .rcard', 'Carlos Ramírez'); await sleep(1200); } },
  { id: '08-presupuesto', text: 'En la ficha de la orden ves todo: el equipo, el cliente, el saldo y las etapas. En “Presupuesto” agregas el repuesto del inventario, en este caso la pantalla. Al guardar, el repuesto se descuenta del inventario automáticamente. Luego tocas la etapa “Reparando”.',
    act: async (v) => {
      await v.hl('.repair-modal .rp-money', 3000);
      await v.pointText('.repair-modal .rp-tabs button', 'Presupuesto'); await sleep(700);
      await v.point('.repair-modal [data-part]'); await v.page.keyboard.type('pantalla redmi', { delay: 60 }); await sleep(500);
      await v.point('.repair-modal [data-sug] [data-pid]'); await sleep(600);
      await v.hl('.repair-modal .budget-foot', 2000);
      await v.point('.repair-modal [data-savebudget]'); await sleep(1200);
      await v.point('.repair-modal [data-st="reparacion"]'); await sleep(900);
      await v.point('.modal-backdrop:last-child [data-ok]'); await sleep(900);
    } },
  { id: '09-listo', text: 'Cuando terminas la reparación, marca la orden como “Lista”. El sistema te ofrece avisarle al cliente por WhatsApp con un mensaje ya escrito, que incluye el enlace para consultar su equipo.',
    act: async (v) => {
      await v.point('.repair-modal [data-st="listo"]'); await sleep(900);
      await v.hl('.modal-backdrop:last-child [data-w]', 2500, (el) => el.closest('label'));
      await v.page.evaluate(() => { const w = document.querySelector('.modal-backdrop:last-child [data-w]'); if (w) w.checked = false; });
      await v.point('.modal-backdrop:last-child [data-ok]'); await sleep(900);
      await v.hl('.repair-modal [data-wa]', 2000);
    } },
  { id: '10-entregar', text: 'Al retirar el equipo, toca “Entregar”. Cobras el saldo en dólares, bolívares, punto, pago móvil o Zelle, incluso combinados, con vuelto en la moneda que elijas. Se emite la nota de entrega y se activa la garantía.',
    act: async (v) => {
      v.code = await v.page.evaluate(async () => (await import('/js/store.js')).store.repairs.find((r) => r.customerName === 'Carlos Ramírez')?.trackCode);
      await v.point('.repair-modal .rp-foot [data-deliver]'); await sleep(1200);
      await v.hl('.modal-backdrop:last-child .pay-methods', 3000);
      await v.point('.modal-backdrop:last-child [data-ok]'); await sleep(1800);
    }, after: 'closeModal' },
  { id: '11-consulta', track: true, text: 'Y esto es lo que ve tu cliente: con el código de su orden o escaneando el QR, consulta en línea el estado de su equipo, el presupuesto y la garantía, y puede escribirle al taller por WhatsApp. Sin llamadas preguntando si ya está listo.' },
  { id: '12-garantias', text: 'En Garantías ves los equipos entregados con garantía vigente. Si un cliente regresa, lo reingresas por garantía con un clic y todos los datos del equipo se cargan solos.',
    act: async (v) => { await v.nav('garantias'); await sleep(800); await v.hl('#w-kpis', 3000); await v.hl('#w-list tbody tr', 3000); await v.move('#w-list [data-re]'); } },
  { id: '13-vender', text: 'También vendes accesorios: forros, vidrios templados, cargadores. Toca los productos y cobra. El inventario se descuenta solo y te avisa cuando algo se está acabando.',
    act: async (v) => {
      await v.nav('vender'); await sleep(700);
      await v.pointText('#pos-grid .pcard', 'Vidrio templado'); await sleep(500);
      await v.pointText('#pos-grid .pcard', 'Cargador 25W'); await sleep(700);
      await v.point('#c-pay'); await sleep(1200);
      await v.point('.modal-backdrop:last-child [data-ok]'); await sleep(1500);
    }, after: 'closeModal' },
  { id: '14-caja', text: 'En Caja abres el turno con el efectivo de fondo y registras los gastos, como la compra de repuestos. Al cerrar, cuentas el dinero y el sistema te dice si sobra o falta, en dólares y en bolívares.',
    act: async (v) => { await v.nav('caja'); await sleep(800); await v.hl('#k-body .kpis', 5000); await v.hl('#k-out', 2400); await v.hl('#k-close', 2600); } },
  { id: '15-reportes', text: 'Los reportes están protegidos con el PIN del dueño. Ves ingresos, ganancia descontando el costo de los repuestos, las fallas y marcas más comunes, los servicios más vendidos y el rendimiento de cada técnico, con su comisión.',
    act: async (v) => {
      await v.navRaw('reportes'); await sleep(900);
      await v.point('.modal [data-pin]'); await v.page.keyboard.type('1234', { delay: 160 }); await sleep(300);
      await v.point('.modal [data-ok]'); await sleep(1600);
      await v.hl('.kpis', 4200);
      await v.page.evaluate(() => window.scrollBy({ top: 520, behavior: 'smooth' })); await sleep(3500);
      await v.nav('tecnicos'); await sleep(900); await v.hl('.tech-grid', 3500);
    } },
  { id: '16-instalar', card: 'phone', text: 'Y lo mejor: Sano-Técnico se instala desde el navegador, en tu teléfono, tablet o computadora, sin descargar nada de una tienda. Todos tus equipos y todas tus sedes quedan conectados en tiempo real.' },
  { id: '17-ayuda', text: 'Si tienes dudas, en “Ayuda y recorridos” encuentras guías que te señalan cada parte de la pantalla, y este mismo video.',
    act: async (v) => { await v.nav('inicio'); await sleep(500); await v.point('#sb-help'); await sleep(1300); await v.hl('.modal .help-list', 3500); }, after: 'closeModal' },
  { id: '18-cierre', card: 'outro', text: '¿Listo para organizar tu taller? Escríbenos por WhatsApp al cero, cuatro, dos, dos, uno, nueve, cero, seis, cero, cuatro, cinco, y activa Sano-Técnico hoy mismo. ¡Gracias por ver!' }
];

// ======================================================================
// Voz
// ======================================================================
function tts(scene) {
  const h = createHash('md5').update(VOICE + scene.text).digest('hex').slice(0, 10);
  const mp3 = path.join(WORK, `${scene.id}-${h}.mp3`), srt = path.join(WORK, `${scene.id}-${h}.srt`);
  if (!existsSync(mp3)) execFileSync('python', ['-m', 'edge_tts', '--voice', VOICE, '--rate=+3%', '--text', scene.text, '--write-media', mp3, '--write-subtitles', srt]);
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3]).toString());
  return { mp3, srt, dur };
}

// ======================================================================
// Ayudas visuales: cursor animado, clic y resaltado
// ======================================================================
const OVERLAY = () => {
  const add = () => {
    if (document.getElementById('vcur')) return;
    const st = document.createElement('style');
    st.textContent = `#vcur{position:fixed;left:640px;top:360px;width:26px;height:26px;z-index:2147483647;pointer-events:none;transition:left .7s cubic-bezier(.2,.8,.2,1),top .7s cubic-bezier(.2,.8,.2,1);filter:drop-shadow(0 2px 4px rgba(0,0,0,.5))}
      .vrip{position:fixed;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;border:3px solid #22d3ee;z-index:2147483646;pointer-events:none;animation:vrip .6s ease-out forwards}
      @keyframes vrip{to{transform:scale(3.6);opacity:0}}
      .vhl{position:fixed;z-index:2147483645;pointer-events:none;border-radius:14px;border:3px solid #22d3ee;box-shadow:0 0 0 4px rgba(34,211,238,.25),0 0 28px 6px rgba(34,211,238,.45);transition:opacity .3s;animation:vhl 1.4s ease-in-out infinite}
      @keyframes vhl{50%{box-shadow:0 0 0 7px rgba(34,211,238,.18),0 0 34px 10px rgba(34,211,238,.3)}}
      .toasts{top:auto!important;bottom:18px!important}`;
    document.head.appendChild(st);
    const c = document.createElement('div');
    c.id = 'vcur';
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l15 9.5-6.6 1.4L16 20.5l-3 1.4-3.6-7.6L4 19z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    document.body.appendChild(c);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
};

function helpers(page) {
  const rectOf = async (sel, text = null, pick = null) => {
    const r = await page.evaluate((sel, text, pickSrc) => {
      const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 2 && b.height > 2; };
      let el = [...document.querySelectorAll(sel)].find((e) => vis(e) && (!text || e.textContent.replace(/\s+/g, ' ').includes(text)));
      if (!el) return null;
      if (pickSrc) el = (0, eval)(pickSrc)(el) || el;
      const b0 = el.getBoundingClientRect();
      if (b0.top < 0 || b0.bottom > innerHeight) el.scrollIntoView({ block: 'center', behavior: 'instant' });
      else el.scrollIntoView({ block: 'nearest', behavior: 'instant' });
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    }, sel, text, pick ? pick.toString() : null);
    if (!r) console.warn('   (no encontré', sel, text || '', ')');
    return r;
  };
  const moveXY = async (x, y) => { await page.evaluate((x, y) => { const c = document.getElementById('vcur'); if (c) { c.style.left = x + 'px'; c.style.top = y + 'px'; } }, x, y); await sleep(760); };
  const v = {
    page,
    async move(sel, text) { const r = await rectOf(sel, text); if (r) await moveXY(r.x + r.w / 2, r.y + r.h / 2); return r; },
    async point(sel, text) {
      const r = await v.move(sel, text);
      if (!r) return;
      const x = r.x + r.w / 2, y = r.y + r.h / 2;
      await page.evaluate((x, y) => { const d = document.createElement('div'); d.className = 'vrip'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); }, x, y);
      await page.mouse.click(x, y);
      await sleep(250);
    },
    pointText(sel, text) { return v.point(sel, text); },
    async pointRow(rowSel, text, btnSel) {
      const r = await rectOf(rowSel, text, (el) => el.querySelector('[data-ed]'));
      if (!r) return;
      await moveXY(r.x + r.w / 2, r.y + r.h / 2);
      await page.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
    },
    async hl(sel, ms = 2500, pick = null, text = null) {
      const r = await rectOf(sel, text, pick);
      if (!r) { await sleep(ms); return; }
      await page.evaluate((r) => { const d = document.createElement('div'); d.className = 'vhl'; d.id = 'vhl-cur'; Object.assign(d.style, { left: r.x - 6 + 'px', top: r.y - 6 + 'px', width: r.w + 12 + 'px', height: r.h + 12 + 'px' }); document.body.appendChild(d); }, r);
      await sleep(ms);
      await page.evaluate(() => document.querySelectorAll('.vhl').forEach((d) => d.remove()));
    },
    hlText(sel, text, ms) { return v.hl(sel, ms, null, text); },
    hlRow(sel, text, ms) { return v.hl(sel, ms, null, text); },
    async scrollModalTo(sel) { await page.evaluate((sel) => document.querySelector('.modal ' + sel)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), sel); await sleep(700); },
    async nav(id) { await v.point(`.sb-nav [data-nav="${id}"]`); await sleep(500); },
    async navRaw(id) { await v.point(`.sb-nav [data-nav="${id}"]`); }
  };
  return v;
}

// ======================================================================
// Tarjetas (portada, instalación en teléfono, cierre)
// ======================================================================
const logo = readFileSync(path.join(here, '..', '..', 'public', 'assets', 'logo.svg'), 'utf8');
const CARD_CSS = `body{margin:0;width:${W}px;height:${H}px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;color:#fff;
  background:radial-gradient(900px 500px at -10% -20%,#0891b2 0%,transparent 55%),radial-gradient(800px 500px at 110% 120%,#6d28d9 0%,transparent 55%),linear-gradient(150deg,#060a14,#0b1630 50%,#070b18)}
  .c{height:100%;display:flex;align-items:center;justify-content:center;gap:60px;text-align:left}
  .logo svg{width:150px;height:150px;border-radius:40px;box-shadow:0 30px 60px -20px rgba(0,0,0,.7);animation:pop .9s cubic-bezier(.2,.8,.2,1)}
  h1{font-size:64px;margin:0;letter-spacing:-2px;animation:up .9s .15s both} h1 em{font-style:normal;background:linear-gradient(90deg,#67e8f9,#a78bfa);-webkit-background-clip:text;color:transparent}
  p{font-size:26px;margin:14px 0 0;opacity:.82;animation:up .9s .35s both} .tag{display:inline-block;margin-top:26px;padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.12);font-size:20px;animation:up .9s .55s both}
  @keyframes pop{from{transform:scale(.6);opacity:0}} @keyframes up{from{transform:translateY(22px);opacity:0}}`;
function cardHTML(kind) {
  if (kind === 'intro') return `<style>${CARD_CSS}</style><div class="c"><div class="logo">${logo}</div><div><h1>Sano-<em>Técnico</em></h1><p>Tutorial: cómo usar el sistema en tu servicio técnico</p><span class="tag">Recepción · Reparaciones · Presupuestos · Garantías · Inventario · Caja en $ y Bs</span></div></div>`;
  if (kind === 'outro') return `<style>${CARD_CSS} .wa{display:inline-flex;align-items:center;gap:14px;margin-top:28px;padding:18px 28px;border-radius:18px;background:#16a34a;font-size:34px;font-weight:700;animation:up .9s .45s both;box-shadow:0 20px 40px -16px rgba(22,163,74,.8)}</style>
    <div class="c"><div class="logo">${logo}</div><div><h1>¿Listo para <em>tu taller?</em></h1><p>Instálalo desde sano-tecnico.web.app</p><div class="wa">WhatsApp +58 422-190 6045</div></div></div>`;
  return `<style>${CARD_CSS} .phone{width:330px;height:640px;border-radius:46px;background:#000;padding:12px;box-shadow:0 40px 80px -24px rgba(0,0,0,.85),0 0 0 2px #333;animation:pop .9s cubic-bezier(.2,.8,.2,1)}
    .phone{position:relative;width:302px;height:648px;padding:12px;overflow:hidden} .phone img{position:absolute;left:12px;top:12px;width:302px;height:648px;object-fit:cover;object-position:top;border-radius:36px}
    .phone .s2{opacity:0;animation:fadein .8s 7s forwards} @keyframes fadein{to{opacity:1}}
    .steps{max-width:520px} .steps h1{font-size:50px} .st{display:flex;gap:16px;align-items:center;margin-top:22px;font-size:24px;animation:up .8s both} .st b{width:44px;height:44px;border-radius:14px;background:#0284c7;display:grid;place-items:center;flex:none}</style>
    <div class="c"><div class="phone"><img src="${PHONE[0]}"><img class="s2" src="${PHONE[1]}"></div><div class="steps"><h1>Instálalo <em>desde la web</em></h1>
    <div class="st" style="animation-delay:.4s"><b>1</b>Abre sano-tecnico.web.app en Chrome</div>
    <div class="st" style="animation-delay:1.6s"><b>2</b>Toca “Instalar app”</div>
    <div class="st" style="animation-delay:2.8s"><b>3</b>Listo: el ícono queda en tu pantalla</div>
    <div class="st" style="animation-delay:4s"><b>✓</b>Teléfono, tablet o computadora, conectados</div></div></div>`;
}

// ======================================================================
// Grabación
// ======================================================================
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-sandbox', `--window-size=${W},${H}`, '--autoplay-policy=no-user-gesture-required'] });
const app = await browser.newPage();
await app.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await app.evaluateOnNewDocument(OVERLAY);
await app.evaluateOnNewDocument(() => { window.print = () => {}; try { localStorage.setItem('st_install_hide', '1'); localStorage.setItem('st_theme', 'dark'); } catch (_) {} });
const v = helpers(app);

// Capturas del teléfono (Android) para la escena de instalación
const PHONE = [];
{
  const ctx = await browser.createBrowserContext();
  const m = await ctx.newPage();
  await m.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36');
  await m.setViewport({ width: 390, height: 836, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await m.goto(APP, { waitUntil: 'networkidle0' });
  await m.waitForSelector('.install-card'); await sleep(900);
  await m.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await sleep(300);
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await m.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await m.evaluate(() => document.querySelector('.install-card [data-install]').click());
  await m.waitForSelector('.modal'); await sleep(700);
  await m.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  PHONE.push('data:image/png;base64,' + (await m.screenshot({ encoding: 'base64' })));
  await ctx.close();
}
await app.goto(APP, { waitUntil: 'networkidle0' });
await app.waitForSelector('#login-form');
await sleep(1200);

const parts = [];
for (const sc of SCENES) {
  const voice = tts(sc);
  console.log(`● ${sc.id} (${voice.dur.toFixed(1)} s)`);
  const webm = path.join(WORK, `${sc.id}.webm`);
  let page = app, cardPage = null;
  if (sc.card) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await cardPage.setContent(cardHTML(sc.card), { waitUntil: 'load' });
    page = cardPage;
  }
  if (sc.track) {
    cardPage = await browser.newPage();
    await cardPage.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    const u = new URL(APP);
    await cardPage.goto(`${u.origin}/estado/${v.code}${u.search}`, { waitUntil: 'domcontentloaded' });
    await cardPage.waitForSelector('.tr-hero', { timeout: 30000 }).catch(() => {});
    await cardPage.addStyleTag({ content: '.tr-step.on i{animation:trpulse 1.4s ease-in-out infinite}@keyframes trpulse{50%{box-shadow:0 0 0 10px var(--brand-soft)}}' });
    await cardPage.evaluate(() => { setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 6500); });
    await sleep(800);
    page = cardPage;
  }
  await page.bringToFront();
  await sleep(300);
  const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG });
  const t0 = Date.now();
  if (sc.act) { try { await sc.act(v, voice.dur); } catch (e) { console.warn('   acción:', e.message); } }
  const left = voice.dur * 1000 + 700 - (Date.now() - t0);
  if (left > 0) await sleep(left);
  await rec.stop();
  const total = Math.max(voice.dur + 0.7, (Date.now() - t0) / 1000);
  parts.push({ webm, ...voice, total });
  if (cardPage) await cardPage.close();
  // Acciones fuera de cámara
  if (sc.after === 'demo') {
    await app.waitForSelector('.sb-nav', { timeout: 90000 });
    await app.waitForSelector('.tour-tip', { timeout: 20000 }).catch(() => {});
    await app.evaluate(async () => (await import('/js/tour.js')).stopTour());
    await sleep(6000);
    await app.evaluate(() => document.querySelectorAll('.toast').forEach((t) => t.remove()));
  }
  if (sc.after === 'closeModal') { await app.keyboard.press('Escape'); await sleep(400); await app.keyboard.press('Escape'); await sleep(300); }
}
await browser.close();

// ======================================================================
// Montaje con ffmpeg: video + voz + subtítulos por escena, luego unión
// ======================================================================
const subStyle = "FontName=Segoe UI,FontSize=17,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=4,Outline=0,Shadow=0,MarginV=22,MarginL=60,MarginR=60";
const list = [];
for (const p of parts) {
  const mp4 = p.webm.replace('.webm', '.mp4');
  const srtName = path.basename(p.srt);
  execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', p.webm, '-i', p.mp3,
    '-filter_complex', `[0:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=0x060a14,tpad=stop_mode=clone:stop_duration=5,subtitles=${srtName}:force_style='${subStyle}',setsar=1[v];[1:a]adelay=250|250,apad[a]`,
    '-map', '[v]', '-map', '[a]', '-t', p.total.toFixed(2), '-c:v', 'libx264', '-preset', 'medium', '-crf', '24', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-ac', '2', mp4], { cwd: WORK });
  list.push(`file '${mp4.replace(/\\/g, '/')}'`);
}
const listFile = path.join(WORK, 'lista.txt');
writeFileSync(listFile, list.join('\n'));
const final = path.join(OUT_DIR, 'sano-tecnico-tutorial.mp4');
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-movflags', '+faststart', final]);
execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-ss', '2.5', '-i', parts[0].webm.replace('.webm', '.mp4'), '-frames:v', '1', '-q:v', '3', path.join(OUT_DIR, 'portada.jpg')]);
const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', final]).toString());
console.log(`\n✔ Video listo: ${final} (${(dur / 60).toFixed(1)} min)`);
