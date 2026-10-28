// Sano-Técnico — Garantías vigentes y reingresos
import { store } from '../store.js';
import { deviceName } from '../ops.js';
import { esc, usd, fmtDate, emptyState, normalize, debounce, waLink } from '../utils.js';
import { icon } from '../icons.js';
import { openRepair } from '../repair.js';

export function mount(el, { navigate }) {
  let list = null; let search = '';
  el.innerHTML = `<div class="view-header"><div><h1 class="view-title">Garantías</h1><p class="view-sub">Equipos entregados con garantía vigente. Si un cliente regresa, ingrésalo por garantía en un clic.</p></div></div>
    <div class="kpis" id="w-kpis"></div>
    <div class="card card-flush"><div class="toolbar"><label class="search">${icon('search')}<input id="w-search" placeholder="Buscar por orden, cliente, modelo o IMEI…"></label></div><div id="w-list"><div class="empty"><div class="spinner"></div></div></div></div>`;
  const $ = (s) => el.querySelector(s);

  async function load() {
    try { list = (await store.listBetween('repairs', 'warrantyUntil', new Date().toISOString(), '9999')).sort((a, b) => (a.warrantyUntil || '').localeCompare(b.warrantyUntil || '')); }
    catch (_) { list = []; }
    render();
  }
  function render() {
    if (!list) return;
    const inWarranty = store.repairs.filter((r) => r.isWarranty);
    const soon = list.filter((r) => new Date(r.warrantyUntil) - Date.now() < 7 * 864e5).length;
    $('#w-kpis').innerHTML = `
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Garantías vigentes</span><span class="kpi-icon tone-success">${icon('shieldCheck')}</span></div><div class="kpi-value">${list.length}</div><div class="kpi-sub">${soon} vencen esta semana</div></div>
      <div class="card kpi"><div class="kpi-top"><span class="kpi-label">Reingresos en taller</span><span class="kpi-icon tone-violet">${icon('rotate')}</span></div><div class="kpi-value">${inWarranty.length}</div><div class="kpi-sub">equipos que regresaron por garantía</div></div>`;
    const t = normalize(search);
    const rows = list.filter((r) => !t || normalize(`${r.number} ${r.customerName} ${r.customerPhone} ${r.device?.model} ${r.device?.brand} ${r.device?.imei}`).includes(t));
    $('#w-list').innerHTML = rows.length ? `<div class="table-wrap"><table class="table rt"><thead><tr><th>Orden</th><th>Equipo</th><th class="hide-sm">Cliente</th><th class="hide-sm">Trabajo</th><th>Vence</th><th></th></tr></thead><tbody>
      ${rows.map((r) => { const days = Math.ceil((new Date(r.warrantyUntil) - Date.now()) / 864e5); return `<tr><td class="click" data-open="${r.id}"><b>${esc(r.number)}</b><div class="t-sub">Entregado ${fmtDate(r.deliveredAt)}</div></td><td class="t-name">${esc(deviceName(r.device))}</td>
        <td class="hide-sm">${esc(r.customerName)}<div class="t-sub">${esc(r.customerPhone || '')}</div></td><td class="hide-sm small">${esc((r.items || []).map((i) => i.name).join(', ') || '—')}<div class="t-sub">${usd((r.total || 0) - (r.discount || 0))}</div></td>
        <td><span class="badge ${days <= 7 ? 'badge-warning' : 'badge-success'}">${fmtDate(r.warrantyUntil)}</span><div class="t-sub">${days} día(s)</div></td>
        <td class="r nowrap">${r.customerPhone ? `<a class="btn btn-ghost btn-icon btn-sm" href="${waLink(r.customerPhone, `Hola ${String(r.customerName).split(' ')[0]}, te escribimos de ${store.businessName}. ¿Cómo sigue funcionando tu ${deviceName(r.device)}?`)}" target="_blank" rel="noopener">${icon('whatsapp')}</a>` : ''}<button class="btn btn-secondary btn-sm" data-re="${r.id}">${icon('rotate')} Reingresar</button></td></tr>`; }).join('')}
    </tbody></table></div>` : `<div style="padding:20px">${emptyState('shieldCheck', 'No hay garantías vigentes', 'Al entregar un equipo reparado se activa su garantía según los días configurados.')}</div>`;
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => openRepair(b.dataset.open));
    el.querySelectorAll('[data-re]').forEach((b) => b.onclick = () => navigate('recibir', { params: { warrantyOf: b.dataset.re } }));
  }
  $('#w-search').oninput = debounce((e) => { search = e.target.value; render(); }, 120);
  load();
  return store.on('repairs', () => load());
}
