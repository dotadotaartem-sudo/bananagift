let uid = 0;
let balance = 0;
let inventory = [];
let currentCase = null;
let upgradeTable = {};

(async function init() {
  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
    if (Telegram.WebApp.enableVerticalScrolling) Telegram.WebApp.enableVerticalScrolling();
    uid = Telegram.WebApp.initDataUnsafe?.user?.id;
  }
  if (!uid) {
    const params = new URLSearchParams(window.location.search);
    uid = parseInt(params.get('uid')) || 12345678;
  }
  const name = (window.Telegram && Telegram.WebApp ? Telegram.WebApp.initDataUnsafe?.user?.first_name : null) || 'User';
  const photo = (window.Telegram && Telegram.WebApp ? Telegram.WebApp.initDataUnsafe?.user?.photo_url : null);
  document.getElementById('profileName').textContent = name;
  document.getElementById('profileId').textContent = 'ID: ' + uid;
  if (photo) document.getElementById('profileAvatar').innerHTML = `<img src="${photo}" style="width:72px;height:72px;border-radius:50%;object-fit:cover">`;
  await Promise.all([loadUser(), loadCases()]);
  loadShop();
})();

async function api(path, opts) {
  const r = await fetch(path, opts);
  return r.json();
}

async function loadUser() {
  const u = await api(`/api/user/${uid}`);
  balance = u.stars || 0;
  inventory = u.inventory || [];
  updateBalances();
  loadHistory();
}

function updateBalances() {
  const topEl = document.getElementById('topStars');
  const isShop = document.getElementById('page-shop')?.classList.contains('active');
  if (isShop) { topEl.style.display = 'none'; }
  else { topEl.style.display = 'flex'; }
  document.getElementById('topBalance').textContent = balance.toLocaleString();
  document.getElementById('profileBalance').textContent = balance.toLocaleString();
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const navItem = document.querySelector(`.nav-item[data-page="${name}"]`);
  if (navItem) navItem.classList.add('active');

  const topEl = document.getElementById('topStars');
  if (name === 'shop') { topEl.style.display = 'none'; }
  else { topEl.style.display = 'flex'; }

  if (name === 'cases') loadCases();
  if (name === 'profile') { loadProfile(); loadInventory(); loadHistory(); }
}

// CASES
async function loadCases() {
  const cases = await api('/api/cases');
  const el = document.getElementById('caseList');
  el.innerHTML = cases.map(c => {
    const imgSrc = `/img/cases/${c.id}.png`;
    return `
    <div class="case-card" onclick="openCase('${c.id}')">
      <div class="case-img-wrap">
        <img src="${imgSrc}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
        <div class="case-fallback" style="display:none"><span>${c.icon}</span></div>
      </div>
      <div class="case-bottom">
        <div class="case-name">${c.name}</div>
        <div class="case-price">★ ${c.price}</div>
      </div>
    </div>
  `}).join('');
}

async function openCase(cid) {
  currentCase = cid;
  const cases = await api('/api/cases');
  const c = cases.find(x => x.id === cid);
  const items = await api(`/api/case/${cid}/items`);

  document.getElementById('caseOpenTop').innerHTML = `
    <div class="case-open-icon"><img src="/img/cases/${c.id}.png" class="case-open-img" onerror="this.style.display='none';this.parentElement.textContent='${c.icon}'"></div>
    <div class="case-open-name">${c.name}</div>
    <div class="case-open-price">★ ${c.price}</div>
  `;
  document.getElementById('spinnerContainer').style.display = 'none';
  document.getElementById('resultWrap').innerHTML = '';
  document.getElementById('openBtnWrap').innerHTML = `<button class="btn btn-pink" onclick="doOpen()">Open Case</button>`;
  document.getElementById('caseItemsGrid').innerHTML = items.map(i => `
    <div class="item-card rarity-${i.rarity}">
      <div class="ic-img"><img src="${i.img}" class="gift-img" onerror="this.outerHTML='${i.emoji}'"></div>
      <div class="ic-name">${i.name}</div>
      <div class="ic-val">★ ${i.value}</div>
    </div>
  `).join('');

  showPage('caseopen');
}

async function doOpen() {
  if (!currentCase) return;
  const c = (await api('/api/cases')).find(x => x.id === currentCase);
  if (balance < c.price) { toast('Недостаточно звёзд! Иди в магазин.'); return; }

  const items = await api(`/api/case/${currentCase}/items`);
  const wrap = document.getElementById('spinnerContainer');
  const track = document.getElementById('spinnerTrack');
  const btnWrap = document.getElementById('openBtnWrap');
  const resultWrap = document.getElementById('resultWrap');

  btnWrap.innerHTML = `<button class="btn btn-pink" disabled style="opacity:.5">Открывается...</button>`;
  resultWrap.innerHTML = '';
  wrap.style.display = 'block';

  const spinItems = [];
  for (let i = 0; i < 30; i++) {
    spinItems.push(items[Math.floor(Math.random() * items.length)]);
  }

  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';
  track.innerHTML = spinItems.map(i => `
    <div class="spin-item rarity-${i.rarity}">
      <div class="si-img"><img src="${i.img}" class="spin-img" onerror="this.outerHTML='${i.emoji}'"></div>
      <div class="si-name">${i.name}</div>
      <div class="si-val">★ ${i.value}</div>
    </div>
  `).join('');

  await new Promise(r => setTimeout(r, 100));

  const res = await api(`/api/open/${currentCase}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid })
  });

  if (res.error) {
    toast(res.error);
    btnWrap.innerHTML = `<button class="btn btn-pink" onclick="doOpen()">Открыть кейс</button>`;
    return;
  }

  const realIdx = spinItems.length - 5;
  spinItems[realIdx] = res.item;
  track.innerHTML = spinItems.map(i => `
    <div class="spin-item rarity-${i.rarity}">
      <div class="si-img"><img src="${i.img}" class="spin-img" onerror="this.outerHTML='${i.emoji}'"></div>
      <div class="si-name">${i.name}</div>
      <div class="si-val">★ ${i.value}</div>
    </div>
  `).join('');

  const itemW = 106;
  const offset = -(realIdx * itemW) + (wrap.offsetWidth / 2) - (itemW / 2);
  track.style.transition = 'transform 3.5s cubic-bezier(.15,.8,.2,1)';
  track.style.transform = `translateX(${offset}px)`;

  await new Promise(r => setTimeout(r, 3800));

  balance = res.balance;
  inventory.push(res.item);
  updateBalances();

  const pc = res.profit >= 0 ? 'win' : 'lose';
  const ps = res.profit >= 0 ? '+' : '';
  resultWrap.innerHTML = `
    <div class="result-card">
      <div class="result-img"><img src="${res.item.img}" class="result-gift-img" onerror="this.outerHTML='${res.item.emoji}'"></div>
      <div class="result-name" style="color:var(--${res.item.rarity})">${res.item.name}</div>
      <div class="result-meta">★ ${res.item.value} · ${res.item.rarity}</div>
      <div class="result-profit ${pc}">${ps}${res.profit} ★</div>
    </div>
    <div class="actions-row">
      <button class="btn btn-pink btn-sm" onclick="doOpen()">Открыть ещё</button>
      <button class="btn btn-outline btn-sm" onclick="showPage('cases')">Назад</button>
    </div>
  `;
}

// PROFILE
function loadProfile() {
  document.getElementById('profileBalance').textContent = balance.toLocaleString();
}

async function loadInventory() {
  const data = await api(`/api/inventory/${uid}`);
  const el = document.getElementById('invList');
  if (!data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">Пока нет предметов. Открой кейсы!</div></div>';
    return;
  }
  el.innerHTML = data.slice(-20).reverse().map((item, idx) => `
    <div class="inv-item rarity-${item.rarity}">
      <div class="inv-img"><img src="${item.img}" class="inv-gift-img" onerror="this.outerHTML='${item.emoji}'"></div>
      <div class="inv-info">
        <div class="inv-name">${item.name}</div>
        <div class="inv-from">${item.from_case || ''} · ${item.rarity}</div>
      </div>
      <div class="inv-right">
        <div class="inv-val">★ ${item.value}</div>
        <div class="inv-sell" onclick="sellItem(${data.length - 1 - idx})">Продать</div>
      </div>
    </div>
  `).join('');
}

async function sellItem(idx) {
  const res = await api('/api/sell', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, index: idx })
  });
  if (res.error) { toast(res.error); return; }
  balance = res.balance;
  updateBalances();
  toast(`Продано за ★ ${res.sold.value}`);
  loadInventory();
  loadHistory();
}

async function loadHistory() {
  const data = await api(`/api/history/${uid}`);
  const el = document.getElementById('historyList');
  if (!data.length) {
    el.innerHTML = '<div class="empty"><div class="empty-text">История пуста</div></div>';
    return;
  }
  el.innerHTML = data.slice(-10).reverse().map(h => {
    const pc = h.profit >= 0 ? 'win' : 'lose';
    const ps = h.profit >= 0 ? '+' : '';
    return `
      <div class="history-item">
        <div class="hi-left">
          <div class="hi-name">${h.item}</div>
          <div class="hi-case">${h.case}</div>
        </div>
        <div class="hi-profit ${pc}">${ps}${h.profit} ★</div>
      </div>
    `;
  }).join('');

  const stats = await api(`/api/stats/${uid}`);
  document.getElementById('statsGrid').innerHTML = `
    <div class="stat-card"><div class="stat-val">${stats.total_opened}</div><div class="stat-label">Открыто</div></div>
    <div class="stat-card"><div class="stat-val">${stats.items_count}</div><div class="stat-label">Предметов</div></div>
    <div class="stat-card"><div class="stat-val">★ ${stats.total_spent}</div><div class="stat-label">Потрачено</div></div>
  `;
}

// SHOP
let currentOrderId = null;

async function loadShop() {
  const [packs, wallet] = await Promise.all([
    api('/api/shop/packs'),
    api('/api/shop/wallet'),
  ]);

  document.getElementById('packGrid').innerHTML = packs.map((p, i) => `
    <div class="pack-card${i === 2 ? ' best' : ''}" onclick="selectPack(${p.stars})">
      <div class="pack-stars">★ ${p.stars}</div>
      <div class="pack-price">$${p.usd} USDT</div>
      ${p.bonus ? `<div class="pack-bonus">+${p.bonus}% бонус</div>` : ''}
      <div class="pack-alt">≈ ₽${p.rub} · ≈ €${p.eur}</div>
    </div>
  `).join('');

  document.getElementById('payList').innerHTML = `
    <div class="pay-card">
      <div class="pay-icon">₮</div>
      <div><div class="pay-name">USDT (TRC20)</div><div class="pay-desc">Tron Network · ${wallet.address.slice(0,8)}...${wallet.address.slice(-6)}</div></div>
    </div>
  `;
}

async function selectPack(stars) {
  const res = await api('/api/pay/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, pack_stars: stars })
  });
  if (res.error) { toast(res.error); return; }

  currentOrderId = res.order_id;
  document.getElementById('modalTitle').textContent = `Купить ★ ${stars}`;
  document.getElementById('modalPrice').textContent = `${res.amount_usdt} USDT`;

  document.getElementById('modalMethods').innerHTML = `
    <div class="pay-step">
      <div class="pay-step-num">1</div>
      <div class="pay-step-text">Отправьте ровно <strong>${res.amount_usdt} USDT</strong> на:</div>
      <div class="pay-address" onclick="copyAddress('${res.wallet}')">${res.wallet}</div>
      <div class="pay-step-hint">Нажмите на адрес чтобы скопировать · Сеть: только TRC20</div>
    </div>
    <div class="pay-step">
      <div class="pay-step-num">2</div>
      <div class="pay-step-text">Вставьте TX хеш:</div>
      <input type="text" class="pay-input" id="txHashInput" placeholder="Введите хеш транзакции..." autocomplete="off">
    </div>
    <button class="btn btn-pink" onclick="verifyPayment()">Проверить оплату</button>
    <div id="payStatus"></div>
  `;

  document.getElementById('payModal').classList.remove('hidden');
}

function copyAddress(addr) {
  navigator.clipboard.writeText(addr).then(() => toast('Адрес скопирован!'));
}

function closeModal(e) {
  if (e.target === document.getElementById('payModal')) {
    document.getElementById('payModal').classList.add('hidden');
  }
}

async function verifyPayment() {
  const txHash = document.getElementById('txHashInput')?.value?.trim();
  if (!txHash) { toast('Введите хеш транзакции'); return; }
  if (!currentOrderId) { toast('Нет активного заказа'); return; }

  const statusEl = document.getElementById('payStatus');
  statusEl.innerHTML = '<div class="pay-verifying">Проверка...</div>';

  const res = await api('/api/pay/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uid, order_id: currentOrderId, tx_hash: txHash })
  });

  if (res.error) {
    statusEl.innerHTML = `<div class="pay-error">${res.error}</div>`;
    return;
  }

  balance = res.balance;
  updateBalances();
  document.getElementById('payModal').classList.add('hidden');
  currentOrderId = null;
  toast(`+${res.stars_added} звёзд${res.bonus ? ' (+' + res.bonus + ' бонус)' : ''}`);
}

// HELPERS
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}
