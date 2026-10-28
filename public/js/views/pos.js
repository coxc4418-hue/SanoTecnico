// Sano-Técnico — Vender: accesorios y repuestos en mostrador
import { store } from '../store.js';
import { chargeSale, cartTotals } from '../ops.js';
import { esc, usd, bs, num, toast, normalize, debounce, emptyState, qtyFmt, openModal, parseNum, initials, colorFor, round2 } from '../utils.js';
import { icon } from '../icons.js';
import { printReceipt, notifyLowStock } from '../shared.js';
import { openPay, showPaid } from '../pay.js';

const CAT_ICON = { Pantallas: 'phone', Baterías: 'battery', 'Pines de carga': 'zap', Flex: 'link', Cámaras: 'camera', Tapas: 'layers', 'Cornetas y micrófonos': 'bell', 'Placas y chips': 'cpu', Forros: 'shield', 'Vidrios templados': 'layers', Cargadores: 'zap', Cables: 'link', Audífonos: 'bell', Memorias: 'cpu' };

export function mount(el) {
  let cat = 'all';
  let search = '';
  let cart = [];
  let customer = null;

  el.innerHTML = `<div class="pos">
    <div class="pos-main">
      <div class="pos-head">
        <div class="row"><label class="search" style="flex:1">${icon('search')}<input id="pos-search" placeholder="Buscar producto o escanear código…" autocomplete="off"></label></div>
        <div class="chips" id="pos-cats"></div>
      </div>
      <div class="pos-grid-wrap"><div class="pgrid" id="pos-grid"></div></div>
    </div>
    <div class="cart-backdrop" id="cart-bd"></div>
    <aside class="cart" id="cart">
      <div class="cart-head"><div class="between"><b style="font-size:16px">Venta de mostrador</b><button class="btn btn-ghost btn-sm" id="c-clear">${icon('trash')} Vaciar</button></div>
        <div class="cart-ctx"><button class="btn btn-secondary btn-sm" id="c-cust">${icon('user')} <span class="ellipsis" id="c-cust-l">Cliente de mostrador</span></button></div></div>
      <div class="cart-list" id="c-list"></div>
      <div class="cart-foot">
        <div class="cart-grand"><span class="lbl">Total</span><div class="val"><b id="c-total">$ 0,00</b><span id="c-totalbs">Bs 0,00</span></div></div>
        <button class="btn btn-success btn-xl btn-block" id="c-pay">${icon('check')} Cobrar</button>
      </div>
    </aside>
    <button class="cart-fab" id="cart-fab"><span><span class="cnt" id="fab-n">0</span>Ver venta</span><b id="fab-t">$ 0,00</b></button>
  </div>`;
  const $ = (s) => el.querySelector(s);
  const sellable = () => store.products.filter((p) => p.active !== false && p.sellable !== false);

  function renderCats() {
    const cats = [...new Set(sellable().map((p) => p.category).filter(Boolean))];
    $('#pos-cats').innerHTML = [['all', 'Todo'], ...cats.map((c) => [c, c])].map(([k, l]) => `<button class="chip ${cat === k ? 'on' : ''}" data-cat="${esc(k)}">${esc(l)}</button>`).join('');
    el.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => { cat = b.dataset.cat; renderCats(); renderGrid(); });
  }

  function renderGrid() {
    const t = normalize(search);
    const list = sellable().filter((p) => (cat === 'all' || p.category === cat) && (!t || normalize(`${p.name} ${p.sku || ''} ${p.compatible || ''} ${p.category}`).includes(t)));
    const inCart = (id) => cart.find((l) => l.productId === id)?.qty || 0;
    $('#pos-grid').innerHTML = list.length ? list.map((p) => {
      const stock = Number(p.stock) || 0; const tracked = p.trackStock !== false;
      const out = tracked && stock - inCart(p.id) <= 0;
      return `<button class="pcard" data-p="${p.id}" ${out ? 'disabled' : ''}>
        ${inCart(p.id) ? `<span class="pcard-qty">${qtyFmt(inCart(p.id))}</span>` : ''}
        ${tracked ? `<span class="pcard-flag badge ${stock <= 0 ? 'badge-danger' : stock <= (p.minStock || 0) ? 'badge-warning' : 'badge-neutral'}">${stock <= 0 ? 'Agotado' : qtyFmt(stock)}</span>` : ''}
        <div class="pcard-media" style="--pc:${p.color || 'var(--surface-2)'}">${p.image ? `<img src="${p.image}" alt="">` : `<span class="pcard-ic">${icon(CAT_ICON[p.category] || 'box')}</span>`}</div>
        <div class="pcard-name">${esc(p.name)}</div>
        <div class="pcard-price"><b>${usd(p.price)}</b><span>${bs(p.price * store.rate)}</span></div>
      </button>`;
    }).join('') : `<div style="grid-column:1/-1">${emptyState('box', 'No hay productos para vender', 'Agrega accesorios y repuestos en Inventario y marca “Se vende en mostrador”.')}</div>`;
    el.querySelectorAll('[data-p]').forEach((b) => b.onclick = () => add(store.product(b.dataset.p)));
  }

  function add(p, qty = 1) {
    if (!p) return;
    const line = cart.find((l) => l.productId === p.id);
    const have = (line?.qty || 0) + qty;
    if (p.trackStock !== false && have > (Number(p.stock) || 0)) { toast(`Solo quedan ${qtyFmt(p.stock || 0)} de ${p.name}`, 'warning'); return; }
    if (line) line.qty = have; else cart.push({ productId: p.id, name: p.name, qty, price: p.price, cost: p.cost || 0 });
    renderCart(); renderGrid();
  }

  function renderCart() {
    const t = cartTotals(cart);
    $('#c-list').innerHTML = cart.length ? cart.map((l, i) => `<div class="cline">
      <div class="cline-name">${esc(l.name)}</div><div class="cline-total">${usd(l.price * l.qty)}</div>
      <div class="cline-meta"><button class="linkish" data-price="${i}">${usd(l.price)} c/u ${icon('edit')}</button></div>
      <div class="cline-actions"><div class="stepper"><button data-dec="${i}">${icon('minus')}</button><span>${qtyFmt(l.qty)}</span><button data-inc="${i}">${icon('plus')}</button></div><button class="btn btn-ghost btn-icon btn-sm" data-del="${i}">${icon('trash')}</button></div>
    </div>`).join('') : `<div class="empty">${icon('cart')}<b>Venta vacía</b><span>Toca un producto para agregarlo.</span></div>`;
    $('#c-total').textContent = usd(t.total); $('#c-totalbs').textContent = bs(t.total * store.rate);
    $('#fab-n').textContent = cart.reduce((a, l) => a + l.qty, 0); $('#fab-t').textContent = usd(t.total);
    $('#c-pay').disabled = !cart.length;
    $('#c-cust-l').textContent = customer?.name || 'Cliente de mostrador';
    el.querySelectorAll('[data-inc]').forEach((b) => b.onclick = () => add(store.product(cart[+b.dataset.inc].productId) || cart[+b.dataset.inc]));
    el.querySelectorAll('[data-dec]').forEach((b) => b.onclick = () => { const l = cart[+b.dataset.dec]; l.qty -= 1; if (l.qty <= 0) cart.splice(+b.dataset.dec, 1); renderCart(); renderGrid(); });
    el.querySelectorAll('[data-del]').forEach((b) => b.onclick = () => { cart.splice(+b.dataset.del, 1); renderCart(); renderGrid(); });
    el.querySelectorAll('[data-price]').forEach((b) => b.onclick = async () => {
      const l = cart[+b.dataset.price];
      const { promptDialog } = await import('../utils.js');
      const v = await promptDialog({ title: 'Precio de venta', label: `${l.name} ($)`, value: num(l.price), confirmText: 'Aplicar' });
      if (v != null && parseNum(v) >= 0) { l.price = round2(parseNum(v)); renderCart(); }
    });
  }

  function pickCustomer() {
    const m = openModal({
      title: 'Cliente', size: 'md',
      body: `<div class="stack"><label class="search">${icon('search')}<input data-q placeholder="Buscar por nombre o teléfono" autofocus></label><div class="list" data-l style="max-height:320px;overflow:auto"></div>
        <div class="section-title">Nuevo cliente</div><div class="form-grid"><input class="input" data-n placeholder="Nombre"><input class="input" data-ph placeholder="Teléfono"></div></div>`,
      footer: `<button class="btn btn-secondary" data-none>Mostrador</button><button class="btn btn-primary" data-add>${icon('plus')} Usar nuevo</button>`
    });
    const draw = (q = '') => {
      const t = normalize(q);
      m.el.querySelector('[data-l]').innerHTML = store.customers.filter((c) => !t || normalize(`${c.name} ${c.phone}`).includes(t)).slice(0, 30).map((c) => `<div class="list-item click" data-c="${c.id}"><span class="avatar" style="background:${colorFor(c.name)}">${esc(initials(c.name))}</span><div class="grow"><b>${esc(c.name)}</b><div class="t-sub">${esc(c.phone || '')}</div></div></div>`).join('') || '<div class="small muted">Sin clientes</div>';
      m.el.querySelectorAll('[data-c]').forEach((x) => x.onclick = () => { customer = store.customer(x.dataset.c); m.close(); renderCart(); });
    };
    m.el.querySelector('[data-q]').oninput = (e) => draw(e.target.value);
    m.el.querySelector('[data-none]').onclick = () => { customer = null; m.close(); renderCart(); };
    m.el.querySelector('[data-add]').onclick = async () => {
      const name = m.el.querySelector('[data-n]').value.trim(); if (!name) { toast('Escribe el nombre', 'warning'); return; }
      const ref = store.newRef('customers');
      const c = { name, phone: m.el.querySelector('[data-ph]').value.trim(), idDoc: '', email: '', address: '', notes: '', repairs: 0, totalSpent: 0, createdAt: new Date().toISOString() };
      await store.save('customers', ref.id, c, false);
      customer = { id: ref.id, ...c }; m.close(); renderCart();
    };
    draw();
  }

  async function pay() {
    if (!cart.length) return;
    const t = cartTotals(cart);
    await openPay({
      title: 'Cobrar venta', sub: esc(customer?.name || 'Cliente de mostrador'), amount: t.total, baseTotal: t.total, discount: true, printLabel: 'Imprimir nota de entrega',
      onConfirm: async (res) => {
        const out = await chargeSale({ lines: cart, customer, discount: res.discount, payments: res.payments, changeCurrency: res.changeCurrency });
        if (res.print) printReceipt(out.sale);
        notifyLowStock(out.low);
        showPaid(out.sale, { title: 'Venta registrada', onPrint: () => printReceipt(out.sale) });
        cart = []; customer = null; closeCart(); renderCart(); renderGrid();
        return out;
      }
    });
  }

  const openCart = () => { $('#cart').classList.add('open'); $('#cart-bd').classList.add('open'); };
  const closeCart = () => { $('#cart').classList.remove('open'); $('#cart-bd').classList.remove('open'); };
  $('#cart-fab').onclick = openCart; $('#cart-bd').onclick = closeCart;
  $('#c-pay').onclick = pay;
  $('#c-cust').onclick = pickCustomer;
  $('#c-clear').onclick = () => { cart = []; renderCart(); renderGrid(); };
  const sInp = $('#pos-search');
  sInp.oninput = debounce((e) => { search = e.target.value; renderGrid(); }, 100);
  sInp.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    const v = sInp.value.trim().toLowerCase(); if (!v) return;
    const exact = sellable().find((p) => (p.sku || '').toLowerCase() === v);
    if (exact) { add(exact); sInp.value = ''; search = ''; renderGrid(); }
  };
  renderCats(); renderGrid(); renderCart();
  return store.on('*', (evt) => { if (evt === 'products') { renderCats(); renderGrid(); } if (evt === 'rate') { renderGrid(); renderCart(); } });
}
