// Sano-Técnico — Consulta pública del estado de un equipo (/estado/CODIGO)
import { getTracking } from '../store.js';
import { STATUS, DEVICE_TYPES } from '../store.js';
import { esc, num, fmtDate, fmtDateTime, waLink } from '../utils.js';
import { icon } from '../icons.js';

const STEPS = ['recibido', 'diagnostico', 'reparacion', 'listo', 'entregado'];

export function mount(root) {
  document.title = 'Estado de mi equipo · Sano-Técnico';
  const code = decodeURIComponent(location.pathname.split('/')[2] || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function shell(inner) {
    root.innerHTML = `<div class="track-page"><div class="track-wrap">
      <a class="track-brand" href="/"><img src="/assets/logo.svg" alt=""><span>Sano-Técnico</span></a>
      ${inner}
      <p class="track-foot">Consulta segura · Sano-Técnico, sistema para servicios técnicos</p>
    </div></div>`;
  }

  function form(msg = '') {
    shell(`<div class="track-card">
      <h1>Consulta el estado de tu equipo</h1>
      <p class="muted">Escribe el código que aparece en tu orden de servicio, debajo del código QR.</p>
      <form class="stack mt-lg" id="tr-f"><input class="input input-lg center mono" id="tr-c" maxlength="8" placeholder="Ej.: K7P3QX" value="${esc(code)}" style="letter-spacing:.2em;text-transform:uppercase" autocapitalize="characters"><button class="btn btn-primary btn-lg btn-block">${icon('search')} Consultar</button></form>
      ${msg ? `<div class="pay-status due mt">${msg}</div>` : ''}
    </div>`);
    root.querySelector('#tr-f').onsubmit = (e) => { e.preventDefault(); const c = root.querySelector('#tr-c').value.trim().toUpperCase(); if (c) location.href = '/estado/' + encodeURIComponent(c); };
  }

  async function load() {
    if (!code) { form(); return; }
    shell('<div class="track-card center"><div class="spinner"></div></div>');
    let t = null;
    try { t = await getTracking(code); } catch (e) { form('No se pudo consultar. Revisa tu conexión e inténtalo de nuevo.'); return; }
    if (!t) { form(`No encontramos el código <b>${esc(code)}</b>. Verifica que esté bien escrito.`); return; }
    const st = STATUS[t.status] || { label: t.status, tone: 'neutral', icon: 'clock' };
    const at = (s) => [...(t.history || [])].reverse().find((h) => h.s === s)?.at;
    let idx = STEPS.indexOf(t.status === 'presupuesto' || t.status === 'repuesto' ? 'diagnostico' : t.status === 'no_reparado' ? 'listo' : t.status);
    if (t.status === 'cancelado') idx = -1;
    const wa = t.business?.whatsapp ? waLink(t.business.whatsapp, `Hola, quiero saber de mi equipo ${t.device} (orden ${t.number}, código ${t.code}).`) : '';
    const hero = {
      listo: ['¡Tu equipo está listo! 🎉', 'Ya puedes pasar a retirarlo.'],
      entregado: ['Equipo entregado', t.warrantyUntil ? `Tiene garantía hasta el ${fmtDate(t.warrantyUntil)}.` : 'Gracias por tu confianza.'],
      no_reparado: ['No se pudo reparar', 'Puedes pasar a retirar tu equipo.'],
      presupuesto: ['Esperando tu aprobación', 'Revisa el presupuesto y avísanos para continuar.'],
      repuesto: ['Esperando repuesto', 'Te avisaremos apenas llegue la pieza.'],
      cancelado: ['Orden cancelada', '']
    }[t.status] || [st.label, st.desc || ''];
    shell(`<div class="track-card">
      <div class="tr-top"><span class="tr-icon tone-${st.tone}">${icon(DEVICE_TYPES[t.deviceType]?.icon || 'phone')}</span><div><div class="small muted">Orden ${esc(t.number)}${t.customer ? ' · ' + esc(t.customer) : ''}</div><div class="tr-dev">${esc(t.device)}</div></div></div>
      <div class="tr-hero tone-${st.tone}"><b>${esc(hero[0])}</b>${hero[1] ? `<span>${esc(hero[1])}</span>` : ''}</div>
      ${idx >= 0 ? `<div class="tr-steps">${STEPS.map((s, i) => `<div class="tr-step ${i < idx ? 'done' : i === idx ? 'on' : ''}"><i>${icon(i < idx ? 'check' : STATUS[s].icon)}</i><span>${STATUS[s].short}</span>${at(s) ? `<small>${new Date(at(s)).toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit' })}</small>` : ''}</div>`).join('')}</div>` : ''}
      ${t.publicNote ? `<div class="tr-note">${icon('info')} ${esc(t.publicNote)}</div>` : ''}
      <div class="kv mt-lg">
        <div><span>Estado</span><b>${esc(st.label)}</b></div>
        <div><span>Recibido</span><b>${fmtDate(t.createdAt)}</b></div>
        ${t.promisedAt && !t.deliveredAt ? `<div><span>Entrega estimada</span><b>${fmtDate(t.promisedAt)}</b></div>` : ''}
        ${t.deliveredAt ? `<div><span>Entregado</span><b>${fmtDate(t.deliveredAt)}</b></div>` : ''}
        <div><span>Falla reportada</span><b>${esc(t.fault || '—')}</b></div>
      </div>
      ${t.items?.length ? `<div class="section-title mt-lg">Presupuesto</div><div class="tr-items">${t.items.map((i) => `<div class="between"><span>${esc(i.name)}</span><b>$${num(i.total)}</b></div>`).join('')}
        <div class="between tr-total"><span>Total</span><b>$${num(t.total)}</b></div>${t.paid ? `<div class="between small"><span>Abonado</span><span>$${num(t.paid)}</span></div><div class="between"><span>Saldo</span><b>$${num(t.balance)}</b></div>` : ''}</div>` : ''}
      <div class="tr-biz">
        <div><b>${esc(t.business?.name || '')}</b>${t.business?.address ? `<div class="small muted">${esc(t.business.address)}</div>` : ''}${t.business?.phone ? `<div class="small muted">Tel: ${esc(t.business.phone)}</div>` : ''}</div>
        ${wa ? `<a class="btn btn-whatsapp" href="${wa}" target="_blank" rel="noopener">${icon('whatsapp')} Escribir al taller</a>` : ''}
      </div>
      <div class="small muted center mt">Actualizado ${fmtDateTime(t.updatedAt)}</div>
    </div>`);
  }
  load();
}
