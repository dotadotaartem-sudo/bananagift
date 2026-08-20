const API = '';
let uid = 0;
let balance = 0;
let inventory = [];
let selectedPack = null;

// Init
(async function init() {
  if (window.Telegram && Telegram.WebApp) {
    Telegram.WebApp.ready();
    uid = Telegram.WebApp.initDataUnsafe?.user?.id || 12345678;
  } else {
    uid = 12345678;
  }
  await loadUser();
  await loadCases();
  setupTabs();
})();

async function api(path, opts) {
  const r = await fetch(API + path, opts);
  return r.json();
}

async function loadUser() {
  const u = await api(`/api/user/${uid}`);
  balance = u.stars;
  inventory = u.inventory || [];
  document.getElementById('balance').textContent = `★ ${balance.toLocaleString()}`;
}

// TABS
function setupTabs() {
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      const tab = t.dataset.tab;
      document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
      document.getElementById('sec-' + tab).classList.add('active');
      if (tab === 'inventory') loadInventory();
      if (tab === 'upgrade') loadUpgradeItems();
      if (tab === 'shop') { loadPacks(); loadMethods(); }
    });
  });
}

// CASES
async function loadCases() {
  const cases = await api('/api/cases');
  const grid = document.getElementById('caseGrid');
  grid.innerHTML = cases.map(c => `
    <div class="case-card" onclick="openCaseView('${c.id}')" style="--cc:${c.color}">
      <div class="case-icon">${c.icon}</div>
      <div class="case-name">${c.name}</div>
      <div class="case-price">★ ${c.price}</div>
      <div class="case-count">${c.items_count} items</div>
    </div>
  `).join('');
}

let currentCase = null;

async function openCaseView(cid) {
  const cases = await api('/api/cases');
  currentCase = cases.find(c => c.id === cid);
  const items = await api(`/api/case/${cid}/items`);

  document.getElementById('caseOpenHeader').innerHTML = `
    <div class="co-icon">${currentCase.icon}</div>
    <div class="co-name">${currentCase.name}</div>
    <div class="co-price">★ ${currentCase.price}</div>
  `;

  document.getElementById('caseItemsList').innerHTML = items.map(i => `
    <div class="ci-item rarity-${i.rarity}">
      <div class="ci-emoji">${i.emoji}</div>
      <div class="ci-name">${i.name}</div>
      <div class="ci-val">★ ${i.value}</div>
      <div class="ci-chance">${i.chance}%</div>
    </div>
  `).join('');

  document.getElementById('resultCard').classList.add('hidden');
  document.getElementById('spinnerWrap').style.display = 'none';

  showSection('caseopen');
}

async function doOpen() {
  if (!currentCase) return;
  if (balance < currentCase.price) {
    toast('Not enough stars!');
    return;
  }

  const items = await api(`/api/case/${currentCase.id}/items`);
  const wrap = document.getElementById('spinnerWrap');
  const spinner = document.getElementById('spinner');
  const resultCard = document.getElementById('resultCard');

  wrap.style.display = 'block';
  resultCard.classList.add('hidden');

  // Build spin items
  const spinItems = [];
  for (let i = 0; i < 40; i++) {
    const ri = items[Math.floor(Math.random() * items.length)];
    spinItems.push(ri);
  }

  spinner.innerHTML = spinItems.map(i => `
    <div class="spin-item rarity-${i.rarity}">
      <div class="si-emoji">${i.emoji}</div>
      <div class="si-name">${i.name}</div>
      <div class="si-val">★ ${i.value}</div>
    </div>
  `).join('');

  spinner.style.transition = 'none';
  spinner.style.transform = 'translateX(0)';

  await sleep(100);

  // Real result from server
  const res = await api(`/api/open/${currentCase.id}`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({uid})
  });

  if (res.error) {
    toast(res.error);
    return;
  }

  // Replace last item with real result
  const realIdx = spinItems.length - 5;
  spinItems[realIdx] = res.item;
  spinner.innerHTML = spinItems.map(i => `
    <div class="spin-item rarity-${i.rarity}">
      <div class="si-emoji">${i.emoji}</div>
      <div class="si-name">${i.name}</div>
      <div class="si-val">★ ${i.value}</div>
    </div>
  `).join('');

  const itemWidth = 88;
  const offset = -(realIdx * itemWidth);
  spinner.style.transition = 'transform 4s cubic-bezier(.17,.67,.12,.99)';
  spinner.style.transform = `translateX(${offset}px)`;

  await sleep(4200);

  balance = res.balance;
  document.getElementById('balance').textContent = `★ ${balance.toLocaleString()}`;

  const profitClass = res.profit >= 0 ? 'win' : 'lose';
  const profitSign = res.profit >= 0 ? '+' : '';
  resultCard.innerHTML = `
    <div class="rc-emoji">${res.item.emoji}</div>
    <div class="rc-name" style="color:var(--${res.item.rarity})">${res.item.name}</div>
    <div class="rc-value">★ ${res.item.value} • ${res.item.rarity}</div>
    <div class="rc-profit ${profitClass}">${profitSign}${res.profit} stars</div>
    <div class="rc-actions">
      <button class="btn-accent btn-sm" onclick="doOpen()">Open Again</button>
      <button class="btn-gold btn-sm" onclick="showCases()">Back</button>
    </div>
  `;
  resultCard.classList.remove('hidden');
}

function showCases() {
  showSection('cases');
}

// UPGRADE
let upgradeItem = null;

async function loadUpgradeItems() {
  const inv = inventory.filter(i => i.value < 5000);
  const el = document.getElementById('upgradeItems');
  if (inv.length === 0) {
    el.innerHTML = '<div class="empty"><div class="e-icon">📦</div>No items to upgrade</div>';
    return;
  }
  el.innerHTML = inv.map((item, idx) => `
    <div class="upg-item rarity-${item.rarity}" onclick="selectUpgrade(${idx})">
      <div class="ui-emoji">${item.emoji}</div>
      <div class="ui-name">${item.name}</div>
      <div class="ui-val">★ ${item.value}</div>
    </div>
  `).join('');
  document.getElementById('upgradeVisual').classList.add('hidden');
  document.getElementById('upgradeInfo').classList.add('hidden');
  document.getElementById('upgradeBtn').classList.add('hidden');
  document.getElementById('upgradeResult').classList.add('hidden');
}

function selectUpgrade(idx) {
  const item = inventory[idx];
  upgradeItem = {...item, idx};

  const targets = [25,50,100,200,500,1000];
  let target = null;
  for (const t of targets) {
    if (t > item.value) { target = t; break; }
  }
  if (!target) { toast('No upgrade path'); return; }

  const table = {25:{chance:50},50:{chance:50},100:{chance:50},200:{chance:40},500:{chance:33},1000:{chance:25}};
  const chance = table[target]?.chance || 50;
  const bet = Math.floor(item.value * 0.8);

  document.getElementById('upgradeFromVal').textContent = `★ ${item.value}`;
  document.getElementById('upgradeToVal').textContent = `★ ${target}`;
  document.getElementById('upgradeBet').textContent = `★ ${bet}`;
  document.getElementById('upgradeChance').textContent = `${chance}%`;
  document.getElementById('upgradeVisual').classList.remove('hidden');
  document.getElementById('upgradeInfo').classList.remove('hidden');
  document.getElementById('upgradeBtn').classList.remove('hidden');
  document.getElementById('upgradeResult').classList.add('hidden');
}

async function doUpgrade() {
  if (!upgradeItem) return;
  const res = await api('/api/upgrade', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({uid, item_value: upgradeItem.value})
  });
  if (res.error) { toast(res.error); return; }

  balance = res.balance;
  document.getElementById('balance').textContent = `★ ${balance.toLocaleString()}`;

  const resultEl = document.getElementById('upgradeResult');
  if (res.success) {
    resultEl.innerHTML = `<div style="color:var(--green);font-weight:700;font-size:16px">🎉 Upgrade Success! ★ ${res.target}</div>`;
    inventory.push(res.new_item);
  } else {
    resultEl.innerHTML = `<div style="color:var(--red);font-weight:700;font-size:16px">❌ Failed! Item lost.</div>`;
    inventory.splice(upgradeItem.idx, 1);
  }
  resultEl.classList.remove('hidden');
  loadUpgradeItems();
}

// SHOP
async function loadPacks() {
  const packs = await api('/api/shop/packs');
  const grid = document.getElementById('packGrid');
  grid.innerHTML = packs.map((p, i) => `
    <div class="pack-card${i===2?' best':''}" onclick="selectPack(${p.stars})">
      <div class="pack-stars">★ ${p.stars}</div>
      <div class="pack-price">$${p.usd}</div>
      ${p.bonus ? `<div class="pack-bonus">+${p.bonus}% bonus</div>` : ''}
      <div class="pack-alt">€${p.eur} • ₽${p.rub} • £${p.gbp}</div>
    </div>
  `).join('');
}

async function loadMethods() {
  const methods = await api('/api/shop/methods');
  const list = document.getElementById('methodsList');
  list.innerHTML = methods.map(m => `
    <div class="method-card">
      <div class="m-icon">${m.icon}</div>
      <div>
        <div class="m-name">${m.name}</div>
        <div class="m-desc">${m.desc}</div>
      </div>
    </div>
  `).join('');
}

function selectPack(stars) {
  selectedPack = stars;
  const modal = document.getElementById('buyModal');
  document.getElementById('modalTitle').textContent = `Buy ★ ${stars}`;
  const packs = [
    {s:100,u:'$2.50'},{s:250,u:'$6.50'},{s:500,u:'$13.00'},{s:1000,u:'$20.00'}
  ];
  const p = packs.find(x => x.s === stars);
  document.getElementById('modalPrice').textContent = p ? p.u : '';

  const methods = [
    {id:'card',icon:'💳',name:'Bank Card'},
    {id:'crypto',icon:'₿',name:'Crypto (USDT/BTC/ETH)'},
    {id:'qiwi',icon:'🥝',name:'QIWI'},
    {id:'sbp',icon:'📱',name:'SBP'},
  ];
  document.getElementById('modalMethods').innerHTML = methods.map(m => `
    <div class="modal-method" onclick="buyStars('${m.id}')">
      <div class="mm-icon">${m.icon}</div>
      <div class="mm-name">${m.name}</div>
    </div>
  `).join('');

  modal.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('buyModal').classList.add('hidden');
}

async function buyStars(method) {
  if (!selectedPack) return;
  closeModal();
  toast('Processing payment...');
  await sleep(1500);

  const res = await api('/api/shop/buy', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({uid, stars: selectedPack, method})
  });

  if (res.error) { toast(res.error); return; }
  balance = res.balance;
  document.getElementById('balance').textContent = `★ ${balance.toLocaleString()}`;
  toast(`+${res.stars_added} stars added!${res.bonus ? ' (+'+res.bonus+' bonus)' : ''}`);
}

// INVENTORY
async function loadInventory() {
  const data = await api(`/api/inventory/${uid}`);
  inventory = data;
  const el = document.getElementById('invList');
  if (data.length === 0) {
    el.innerHTML = '<div class="empty"><div class="e-icon">📦</div>Your inventory is empty.<br>Open some cases!</div>';
    return;
  }
  el.innerHTML = data.map((item, idx) => `
    <div class="inv-item rarity-${item.rarity}">
      <div class="ii-emoji">${item.emoji}</div>
      <div class="ii-info">
        <div class="ii-name">${item.name}</div>
        <div class="ii-from">${item.from_case} • ${item.rarity}</div>
      </div>
      <div class="ii-val">★ ${item.value}</div>
      <div class="ii-sell" onclick="sellItem(${idx})">Sell</div>
    </div>
  `).join('');
}

async function sellItem(idx) {
  const res = await api('/api/sell', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({uid, index: idx})
  });
  if (res.error) { toast(res.error); return; }
  balance = res.balance;
  document.getElementById('balance').textContent = `★ ${balance.toLocaleString()}`;
  toast(`Sold for ★ ${res.sold.value}`);
  loadInventory();
}

// HELPERS
function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('sec-' + name).classList.add('active');
}

function toast(msg) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className='toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }