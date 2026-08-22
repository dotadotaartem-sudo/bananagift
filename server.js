
];
];

async function handleUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const firstName = msg.from?.first_name || 'User';
  const fromId = String(msg.from?.id || '');

  const cmd = text.split(/[\s@]+/)[0].toLowerCase();

  try {
    if (cmd === '/start') {
      const miniAppUrl = `${WEBAPP_URL}?uid=${chatId}`;
      await tg('sendMessage', {
        chat_id: chatId,
        text: `Привет, ${firstName}!\n\nДобро пожаловать в BananGift!\nОткрывай кейсы, прокачивай предметы и выигрывай редкие подарки!`,
        reply_markup: {
          inline_keyboard: [
            [{ text: '🎁 Открыть бот', web_app: { url: miniAppUrl } }]
          ]
        }
      });
    } else if (cmd === '/help') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: 'Команды:\n/start — Открыть бота\n/myid — Твой ID\n\nИспользуй мини-апп для кейсов, магазина и многого другого!'
      });
    } else if (cmd === '/addstars' && OWNER_IDS.includes(fromId)) {
      const parts = text.split(' ');
      const amount = parseInt(parts[1]) || 100;
      const user = getUser(chatId);
      user.stars += amount;
      updateUser(chatId, user);
      await tg('sendMessage', {
        chat_id: chatId,
        text: `✅ +${amount}★ added! Balance: ${user.stars}★`
      });
    } else if (cmd === '/myid') {
      await tg('sendMessage', {
        chat_id: chatId,
        text: `Your ID: ${fromId}\nChat ID: ${chatId}`
      });
    }
  } catch (e) {
    console.error('handleUpdate error:', e.message);
  }
}

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'miniapp')));

// --- BOT POLLING ---
let pollingOffset = 0;
let pollingActive = false;
let pollErrors = 0;

async function pollUpdates() {
  if (pollingActive) return;
  pollingActive = true;
  try {
    const res = await tg('getUpdates', { offset: pollingOffset, timeout: 30 });
    if (res.ok && res.result) {
      pollErrors = 0;
      for (const update of res.result) {
        pollingOffset = update.update_id + 1;
        await handleUpdate(update);
      }
    } else if (res.description && res.description.includes('Conflict')) {
      console.log('Polling conflict detected, waiting 5s...');
      pollErrors++;
      await new Promise(r => setTimeout(r, 5000));
    } else {
      console.error('Poll error:', JSON.stringify(res));
      pollErrors++;
    }
  } catch (e) {
    console.error('Poll error:', e.message);
    pollErrors++;
  }
  pollingActive = false;
  const delay = pollErrors > 5 ? 5000 : 1000;
  setTimeout(pollUpdates, delay);
}

// --- DB (GitHub-backed) ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = 'dotadotaartem-sudo/bananagift';
const GITHUB_DB_PATH = 'db.json';
const DB_FILE = path.join(__dirname, 'db.json');

let _db = null;
let _dbSha = null;
let _saveTimer = null;
let _saving = false;

function fallbackDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users: {} }; }
}

async function loadDBFromGitHub() {
  try {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (!r.ok) { console.log('GitHub DB fetch failed:', r.status); return null; }
    const data = await r.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    _dbSha = data.sha;
    return JSON.parse(content);
  } catch (e) {
    console.error('loadDBFromGitHub error:', e.message);
    return null;
  }
}

async function saveDBToGitHub() {
  if (!_db || _saving) return;
  _saving = true;
  try {
    const body = {
      message: `db update ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(_db, null, 2)).toString('base64'),
    };
    if (_dbSha) body.sha = _dbSha;
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_DB_PATH}`, {
      method: 'PUT',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github.v3+json' },
      body: JSON.stringify(body)
    });
    if (r.ok) {
      const data = await r.json();
      _dbSha = data.content?.sha || _dbSha;
      console.log('DB saved to GitHub');
    } else {
      const err = await r.text();
      console.error('GitHub save failed:', r.status, err);
    }
  } catch (e) {
    console.error('saveDBToGitHub error:', e.message);
  }
  _saving = false;
}

function scheduleSaveDB() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => { _saveTimer = null; saveDBToGitHub(); }, 3000);
}

function loadDB() {
  if (_db) return _db;
  _db = fallbackDB();
  return _db;
}

function saveDB(db) {
  _db = db;
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch {}
  scheduleSaveDB();
}

async function initDB() {
  const ghDB = await loadDBFromGitHub();
  if (ghDB && ghDB.users) {
    _db = ghDB;
    try { fs.writeFileSync(DB_FILE, JSON.stringify(_db, null, 2), 'utf8'); } catch {}
    console.log('DB loaded from GitHub, users:', Object.keys(_db.users).length);
  } else {
    console.log('Using local DB fallback');
  }
}

function getUser(uid) {
  const db = loadDB();
  const id = String(uid);
  if (!db.users[id]) {
    db.users[id] = {
      stars: 0, inventory: [], history: [],
      total_opened: 0, total_spent: 0,
      joined: new Date().toISOString()
    };
    saveDB(db);
  }
  return db.users[id];
}

function updateUser(uid, data) {
  const db = loadDB();
  db.users[String(uid)] = { ...db.users[String(uid)], ...data };
  saveDB(db);
}

// --- EMOJI TO IMG MAP ---
const EMOJI_IMG = {
  '❤️': 'heart', '🧸': 'bear', '🌹': 'rose', '🎁': 'gift', '🍀': 'clover',
  '🔥': 'fire', '💐': 'bouquet', '🌸': 'sakura', '🍪': 'cookie', '🌊': 'wave',
  '🚀': 'rocket', '🎄': 'tree', '🎆': 'fireworks', '🎸': 'guitar', '🏆': 'trophy',
  '💍': 'ring', '💎': 'diamond', '🌌': 'galaxy', '🏔️': 'mountain', '🎂': 'cake',
  '🐰': 'bunny', '🐕': 'dog', '⌚': 'watch', '⛑️': 'helmet', '🍑': 'peach',
  '🎒': 'bag', '🔮': 'crystal', '💝': 'heart_locket', '😺': 'cat', '🐸': 'pepe',
};

const GIFTS_DIR = path.join(__dirname, 'miniapp', 'img', 'gifts');
const giftImgCache = {};

function giftImg(emoji, name) {
  const key = EMOJI_IMG[emoji] || name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (giftImgCache[key]) return giftImgCache[key];
  const exts = ['.webp', '.png', '.jpg'];
  for (const ext of exts) {
    const fp = path.join(GIFTS_DIR, key + ext);
    if (fs.existsSync(fp)) {
      giftImgCache[key] = `/img/gifts/${key}${ext}`;
      return giftImgCache[key];
    }
  }
  return `/img/gifts/${key}.png`;
}

// Real market floor prices (GRAM): Plush Pepe 5440, Heart Locket 1100, Durov's Cap 439,
// Precious Peach 249, Scared Cat 199, Heroic Helmet 180, Astral Shard 117, Loot Bag 116,
// Swiss Watch 48, Toy Bear 37, Eternal Rose 26, Sakura 9.5, Jelly Bunny 7.9, Snoop Dogg 5

// --- CASES ---
const CASES = [
  {
    id: 'star', name: 'Star Case', icon: '⭐', img: '/img/cases/star.png', price: 1, color: '#eab308',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 60 },
      { name: 'Teddy Bear', emoji: '🧸', value: 1, rarity: 'common', chance: 25 },
      { name: 'Rose', emoji: '🌹', value: 1, rarity: 'common', chance: 10 },
      { name: 'Gift Box', emoji: '🎁', value: 1, rarity: 'uncommon', chance: 3 },
      { name: 'Clover', emoji: '🍀', value: 2, rarity: 'uncommon', chance: 1.5 },
      { name: 'Bouquet', emoji: '💐', value: 2, rarity: 'rare', chance: 0.4 },
      { name: 'Sakura', emoji: '🌸', value: 3, rarity: 'epic', chance: 0.08 },
      { name: 'Jelly Bunny', emoji: '🐰', value: 5, rarity: 'epic', chance: 0.02 },
    ]
  },
  {
    id: 'summer', name: 'Super Summer Capsule', icon: '☀️', img: '/img/cases/summer.png', price: 5, color: '#f97316',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 35 },
      { name: 'Teddy Bear', emoji: '🧸', value: 1, rarity: 'common', chance: 25 },
      { name: 'Rose', emoji: '🌹', value: 1, rarity: 'common', chance: 18 },
      { name: 'Gift Box', emoji: '🎁', value: 2, rarity: 'common', chance: 10 },
      { name: 'Clover', emoji: '🍀', value: 2, rarity: 'uncommon', chance: 5 },
      { name: 'Flame', emoji: '🔥', value: 2, rarity: 'uncommon', chance: 3.5 },
      { name: 'Sakura', emoji: '🌸', value: 3, rarity: 'rare', chance: 1.8 },
      { name: 'Snoop Dogg', emoji: '🐕', value: 3, rarity: 'rare', chance: 1 },
      { name: 'Eternal Rose', emoji: '🌹', value: 5, rarity: 'epic', chance: 0.5 },
      { name: 'Toy Bear', emoji: '🧸', value: 8, rarity: 'epic', chance: 0.15 },
      { name: 'Swiss Watch', emoji: '⌚', value: 15, rarity: 'legendary', chance: 0.05 },
    ]
  },
  {
    id: 'rgb', name: 'RGB Capsule Case', icon: '🌈', img: '/img/cases/rgb.png', price: 8, color: '#8b5cf6',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 30 },
      { name: 'Teddy Bear', emoji: '🧸', value: 1, rarity: 'common', chance: 22 },
      { name: 'Clover', emoji: '🍀', value: 2, rarity: 'common', chance: 15 },
      { name: 'Flame', emoji: '🔥', value: 2, rarity: 'common', chance: 12 },
      { name: 'Sakura', emoji: '🌸', value: 3, rarity: 'uncommon', chance: 8 },
      { name: 'Cookie', emoji: '🍪', value: 2, rarity: 'uncommon', chance: 5 },
      { name: 'Eternal Rose', emoji: '🌹', value: 5, rarity: 'rare', chance: 3.5 },
      { name: 'Toy Bear', emoji: '🧸', value: 8, rarity: 'rare', chance: 2.5 },
      { name: 'Swiss Watch', emoji: '⌚', value: 15, rarity: 'epic', chance: 1.2 },
      { name: 'Heroic Helmet', emoji: '⛑️', value: 30, rarity: 'epic', chance: 0.5 },
      { name: 'Durov\'s Cap', emoji: '🧢', value: 50, rarity: 'legendary', chance: 0.15 },
      { name: 'Plush Pepe', emoji: '🐸', value: 100, rarity: 'legendary', chance: 0.05 },
    ]
  },
  {
    id: 'regular', name: 'Regular Case', icon: '📦', img: '/img/cases/regular.png', price: 12, color: '#6366f1',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 22 },
      { name: 'Teddy Bear', emoji: '🧸', value: 1, rarity: 'common', chance: 18 },
      { name: 'Sakura', emoji: '🌸', value: 3, rarity: 'common', chance: 15 },
      { name: 'Cookie', emoji: '🍪', value: 2, rarity: 'common', chance: 12 },
      { name: 'Eternal Rose', emoji: '🌹', value: 5, rarity: 'uncommon', chance: 10 },
      { name: 'Snoop Dogg', emoji: '🐕', value: 3, rarity: 'uncommon', chance: 8 },
      { name: 'Jelly Bunny', emoji: '🐰', value: 5, rarity: 'uncommon', chance: 5 },
      { name: 'Toy Bear', emoji: '🧸', value: 8, rarity: 'rare', chance: 4 },
      { name: 'Swiss Watch', emoji: '⌚', value: 15, rarity: 'rare', chance: 2.5 },
      { name: 'Astral Shard', emoji: '🔮', value: 20, rarity: 'epic', chance: 1.5 },
      { name: 'Loot Bag', emoji: '🎒', value: 25, rarity: 'epic', chance: 0.8 },
      { name: 'Precious Peach', emoji: '🍑', value: 50, rarity: 'legendary', chance: 0.15 },
      { name: 'Plush Pepe', emoji: '🐸', value: 150, rarity: 'legendary', chance: 0.05 },
    ]
  },
  {
    id: 'farm', name: 'Farm Case', icon: '🌾', img: '/img/cases/farm.png', price: 15, color: '#22c55e',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 20 },
      { name: 'Snoop Dogg', emoji: '🐕', value: 3, rarity: 'common', chance: 18 },
      { name: 'Jelly Bunny', emoji: '🐰', value: 5, rarity: 'common', chance: 15 },
      { name: 'Eternal Rose', emoji: '🌹', value: 5, rarity: 'common', chance: 12 },
      { name: 'Toy Bear', emoji: '🧸', value: 8, rarity: 'uncommon', chance: 10 },
      { name: 'Swiss Watch', emoji: '⌚', value: 15, rarity: 'uncommon', chance: 8 },
      { name: 'Astral Shard', emoji: '🔮', value: 20, rarity: 'rare', chance: 5 },
      { name: 'Loot Bag', emoji: '🎒', value: 25, rarity: 'rare', chance: 4 },
      { name: 'Heroic Helmet', emoji: '⛑️', value: 30, rarity: 'epic', chance: 3 },
      { name: 'Scared Cat', emoji: '😺', value: 40, rarity: 'epic', chance: 2 },
      { name: 'Precious Peach', emoji: '🍑', value: 50, rarity: 'legendary', chance: 1.5 },
      { name: 'Durov\'s Cap', emoji: '🧢', value: 80, rarity: 'legendary', chance: 0.8 },
      { name: 'Plush Pepe', emoji: '🐸', value: 200, rarity: 'legendary', chance: 0.15 },
      { name: 'Heart Locket', emoji: '💝', value: 300, rarity: 'legendary', chance: 0.05 },
    ]
  },
  {
    id: 'flex', name: 'Flex Case', icon: '😎', img: '/img/cases/flex.png', price: 25, color: '#ec4899',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 15 },
      { name: 'Teddy Bear', emoji: '🧸', value: 1, rarity: 'common', chance: 14 },
      { name: 'Toy Bear', emoji: '🧸', value: 8, rarity: 'common', chance: 12 },
      { name: 'Swiss Watch', emoji: '⌚', value: 15, rarity: 'common', chance: 10 },
      { name: 'Astral Shard', emoji: '🔮', value: 20, rarity: 'uncommon', chance: 10 },
      { name: 'Loot Bag', emoji: '🎒', value: 25, rarity: 'uncommon', chance: 8 },
      { name: 'Heroic Helmet', emoji: '⛑️', value: 30, rarity: 'rare', chance: 7 },
      { name: 'Scared Cat', emoji: '😺', value: 40, rarity: 'rare', chance: 6 },
      { name: 'Precious Peach', emoji: '🍑', value: 50, rarity: 'rare', chance: 5 },
      { name: 'Durov\'s Cap', emoji: '🧢', value: 80, rarity: 'epic', chance: 4 },
      { name: 'Heart Locket', emoji: '💝', value: 120, rarity: 'epic', chance: 3 },
      { name: 'Plush Pepe', emoji: '🐸', value: 300, rarity: 'legendary', chance: 2 },
      { name: 'Heart Locket', emoji: '💝', value: 500, rarity: 'legendary', chance: 0.8 },
      { name: 'Plush Pepe', emoji: '🐸', value: 800, rarity: 'legendary', chance: 0.2 },
    ]
  },
  {
    id: 'vision', name: 'Vision Case', icon: '🔮', img: '/img/cases/vision.png', price: 35, color: '#06b6d4',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 14 },
      { name: 'Sakura', emoji: '🌸', value: 3, rarity: 'common', chance: 12 },
      { name: 'Snoop Dogg', emoji: '🐕', value: 3, rarity: 'common', chance: 10 },
      { name: 'Astral Shard', emoji: '🔮', value: 20, rarity: 'common', chance: 10 },
      { name: 'Loot Bag', emoji: '🎒', value: 25, rarity: 'common', chance: 9 },
      { name: 'Heroic Helmet', emoji: '⛑️', value: 30, rarity: 'uncommon', chance: 8 },
      { name: 'Scared Cat', emoji: '😺', value: 40, rarity: 'uncommon', chance: 7 },
      { name: 'Precious Peach', emoji: '🍑', value: 50, rarity: 'rare', chance: 6 },
      { name: 'Durov\'s Cap', emoji: '🧢', value: 80, rarity: 'rare', chance: 5 },
      { name: 'Heart Locket', emoji: '💝', value: 120, rarity: 'rare', chance: 5 },
      { name: 'Plush Pepe', emoji: '🐸', value: 300, rarity: 'epic', chance: 4 },
      { name: 'Heart Locket', emoji: '💝', value: 500, rarity: 'epic', chance: 3 },
      { name: 'Plush Pepe', emoji: '🐸', value: 500, rarity: 'legendary', chance: 2 },
      { name: 'Heart Locket', emoji: '💝', value: 800, rarity: 'legendary', chance: 1 },
      { name: 'Plush Pepe', emoji: '🐸', value: 1500, rarity: 'legendary', chance: 0.2 },
    ]
  },
  {
    id: 'fresh', name: 'Fresh Case', icon: '🍃', img: '/img/cases/fresh.png', price: 50, color: '#10b981',
    items: [
      { name: 'Heart', emoji: '❤️', value: 1, rarity: 'common', chance: 12 },
      { name: 'Teddy Bear', emoji: '🧸', value: 1, rarity: 'common', chance: 11 },
      { name: 'Rose', emoji: '🌹', value: 1, rarity: 'common', chance: 10 },
      { name: 'Sakura', emoji: '🌸', value: 3, rarity: 'common', chance: 9 },
      { name: 'Swiss Watch', emoji: '⌚', value: 15, rarity: 'common', chance: 8 },
      { name: 'Heroic Helmet', emoji: '⛑️', value: 30, rarity: 'uncommon', chance: 7 },
      { name: 'Scared Cat', emoji: '😺', value: 40, rarity: 'uncommon', chance: 7 },
      { name: 'Precious Peach', emoji: '🍑', value: 50, rarity: 'uncommon', chance: 6 },
      { name: 'Durov\'s Cap', emoji: '🧢', value: 80, rarity: 'rare', chance: 6 },
      { name: 'Heart Locket', emoji: '💝', value: 120, rarity: 'rare', chance: 5 },
      { name: 'Plush Pepe', emoji: '🐸', value: 300, rarity: 'rare', chance: 5 },
      { name: 'Heart Locket', emoji: '💝', value: 500, rarity: 'epic', chance: 4 },
      { name: 'Plush Pepe', emoji: '🐸', value: 500, rarity: 'epic', chance: 3 },
      { name: 'Heart Locket', emoji: '💝', value: 800, rarity: 'legendary', chance: 2 },
      { name: 'Plush Pepe', emoji: '🐸', value: 1500, rarity: 'legendary', chance: 1 },
      { name: 'Plush Pepe', emoji: '🐸', value: 3000, rarity: 'legendary', chance: 0.2 },
    ]
  },
];

const UPGRADE_TABLE = {
  25: { multiplier: 2, chance: 50 },
  50: { multiplier: 2, chance: 50 },
  100: { multiplier: 2, chance: 50 },
  200: { multiplier: 2.5, chance: 40 },
  500: { multiplier: 3, chance: 33 },
  1000: { multiplier: 4, chance: 25 },
};

const STAR_PACKS = [
  { stars: 100, usd: 2.50, eur: 2.35, rub: 230, gbp: 2.00, uah: 103, bonus: 0 },
  { stars: 250, usd: 6.50, eur: 6.10, rub: 595, gbp: 5.15, uah: 267, bonus: 5 },
  { stars: 500, usd: 13.00, eur: 12.20, rub: 1190, gbp: 10.30, uah: 534, bonus: 10 },
  { stars: 1000, usd: 20.00, eur: 18.80, rub: 1830, gbp: 15.90, uah: 822, bonus: 15 },
];

const PAYMENT_METHODS = [
  { id: 'trc20', name: 'USDT (TRC20)', icon: '₮', desc: 'Tron Network' },
];

function rollItem(items) {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const item of items) {
    cumulative += item.chance;
    if (roll <= cumulative) return item;
  }
  return items[items.length - 1];
}

// --- API Routes ---

app.get('/api/user/:uid', (req, res) => {
  res.json(getUser(req.params.uid));
});

app.get('/api/cases', (req, res) => {
  res.json(CASES.map(c => ({
    id: c.id, name: c.name, icon: c.icon, img: c.img,
    price: c.price, color: c.color,
    items_count: c.items.length,
  })));
});

app.get('/api/case/:cid/items', (req, res) => {
  const c = CASES.find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c.items.map(i => ({ ...i, img: giftImg(i.emoji, i.name) })));
});

app.post('/api/open/:cid', (req, res) => {
  const { uid } = req.body;
  const user = getUser(uid);
  const c = CASES.find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'case not found' });
  if (user.stars < c.price) {
    return res.status(400).json({ error: 'not enough stars', need: c.price, have: user.stars });
  }

  const won = rollItem(c.items);
  const profit = won.value - c.price;
  user.stars -= c.price;
  user.total_opened += 1;
  user.total_spent += c.price;
  const wonItem = { ...won, img: giftImg(won.emoji, won.name) };
  user.inventory.push({
    name: won.name, emoji: won.emoji, img: wonItem.img,
    value: won.value, rarity: won.rarity,
    from_case: c.name, time: new Date().toISOString(),
  });
  user.history.push({
    case: c.name, item: won.name,
    value: won.value, profit, time: new Date().toISOString(),
  });
  updateUser(uid, user);

  res.json({ item: wonItem, profit, balance: user.stars, case_price: c.price });
});

app.get('/api/inventory/:uid', (req, res) => {
  res.json(getUser(req.params.uid).inventory || []);
});

app.post('/api/sell', (req, res) => {
  const { uid, index } = req.body;
  const user = getUser(uid);
  const inv = user.inventory || [];
  if (index < 0 || index >= inv.length) {
    return res.status(400).json({ error: 'invalid' });
  }
  const item = inv.splice(index, 1)[0];
  user.stars += item.value;
  updateUser(uid, user);
  res.json({ sold: item, balance: user.stars });
});

app.post('/api/upgrade', (req, res) => {
  const { uid, item_value } = req.body;
  const user = getUser(uid);

  const targets = Object.keys(UPGRADE_TABLE).map(Number).sort((a, b) => a - b);
  const target = targets.find(t => t > item_value);
  if (!target) return res.status(400).json({ error: 'no upgrade path' });

  const { chance } = UPGRADE_TABLE[target];
  const bet = Math.floor(item_value * 0.8);
  if (user.stars < bet) {
    return res.status(400).json({ error: 'not enough stars for bet', need: bet });
  }

  const success = Math.random() * 100 < chance;
  user.stars -= bet;

  if (success) {
    const newItem = {
      name: `NFT Upgrade ★${target}`, emoji: '⬆️',
      value: target, rarity: target < 500 ? 'rare' : 'epic',
      from_case: 'Upgrade', time: new Date().toISOString(),
    };
    user.inventory.push(newItem);
    updateUser(uid, user);
    return res.json({ success: true, target, chance, bet, balance: user.stars, new_item: newItem });
  }

  updateUser(uid, user);
  res.json({ success: false, target, chance, bet, balance: user.stars });
});

app.get('/api/upgrade/table', (req, res) => res.json(UPGRADE_TABLE));

app.get('/api/shop/packs', (req, res) => res.json(STAR_PACKS));
app.get('/api/shop/methods', (req, res) => res.json(PAYMENT_METHODS));
app.get('/api/shop/wallet', (req, res) => res.json({ address: TRC20_WALLET, network: 'TRC20', token: 'USDT' }));

// --- TRC20 PAYMENT ---
app.post('/api/pay/create', (req, res) => {
  const { uid, pack_stars } = req.body;
  const pack = STAR_PACKS.find(p => p.stars === pack_stars);
  if (!pack) return res.status(400).json({ error: 'invalid pack' });
  const db = loadDB();
  if (!db.payments) db.payments = {};
  const orderId = `bg_${uid}_${pack_stars}_${Date.now()}`;
  db.payments[orderId] = {
    uid: String(uid), pack_stars, amount_usdt: pack.usd,
    status: 'pending', created: new Date().toISOString()
  };
  saveDB(db);
  res.json({ order_id: orderId, amount_usdt: pack.usd, wallet: TRC20_WALLET, network: 'TRC20' });
});

app.post('/api/pay/verify', async (req, res) => {
  const { uid, order_id, tx_hash } = req.body;
  if (!tx_hash || !order_id) return res.status(400).json({ error: 'missing fields' });

  const db = loadDB();
  if (!db.payments) db.payments = {};
  const order = db.payments[order_id];
  if (!order) return res.status(400).json({ error: 'order not found' });
  if (order.status === 'completed') return res.status(400).json({ error: 'already completed' });
  if (order.uid !== String(uid)) return res.status(400).json({ error: 'wrong user' });

  if (!db.used_txs) db.used_txs = [];
  if (db.used_txs.includes(tx_hash)) {
    return res.status(400).json({ error: 'Transaction already used' });
  }

  try {
    const url = `${TRONGRID_API}/transactions/trc20?only_to=true&to=${TRC20_WALLET}&limit=50`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    const data = await r.json();

    if (!data.data || !data.data.length) {
      return res.status(400).json({ error: 'No transactions found. Try again in 30s.' });
    }

    const tx = data.data.find(t =>
      t.transaction_id === tx_hash &&
      t.token_info?.address === USDT_TRC20 &&
      t.to === TRC20_WALLET
    );

    if (!tx) {
      return res.status(400).json({ error: 'Transaction not found. Check TX hash.' });
    }

    const sentAmount = parseFloat(tx.value) / 1e6;
    if (Math.abs(sentAmount - order.amount_usdt) > 0.01) {
      return res.status(400).json({ error: `Wrong amount: got ${sentAmount} USDT, need ${order.amount_usdt}` });
    }

    db.used_txs.push(tx_hash);
    order.status = 'completed';
    order.tx_hash = tx_hash;
    order.completed = new Date().toISOString();
    saveDB(db);

    const user = getUser(uid);
    const pack = STAR_PACKS.find(p => p.stars === order.pack_stars);
    const bonus = pack?.bonus ? Math.floor(order.pack_stars * pack.bonus / 100) : 0;
    const total = order.pack_stars + bonus;
    user.stars += total;
    updateUser(uid, user);

    res.json({ success: true, stars_added: total, bonus, balance: user.stars });
  } catch (e) {
    res.status(500).json({ error: 'Verification failed: ' + e.message });
  }
});

app.get('/api/history/:uid', (req, res) => {
  const user = getUser(req.params.uid);
  res.json((user.history || []).slice(-50));
});

app.get('/api/stats/:uid', (req, res) => {
  const user = getUser(req.params.uid);
  res.json({
    stars: user.stars,
    total_opened: user.total_opened,
    total_spent: user.total_spent,
    items_count: (user.inventory || []).length,
  });
});

const PORT = process.env.PORT || 5000;
(async () => {
  await initDB();
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BananGift running on http://localhost:${PORT}`);

    tg('deleteWebhook', { drop_pending_updates: true })
      .then(() => {
        console.log('Webhook deleted, starting polling...');
        pollUpdates();
      })
      .catch(e => {
        console.error('deleteWebhook error:', e.message);
        pollUpdates();
      });
  });
})();

process.on('SIGTERM', async () => { await saveDBToGitHub(); process.exit(0); });
process.on('SIGINT', async () => { await saveDBToGitHub(); process.exit(0); });
