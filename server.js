const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {Bot} = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN || '7885895188:AAElBVUrGTdwfAeS928M7sH0WFDGcORudiY';
const WEBAPP_URL = process.env.WEBAPP_URL || 'http://localhost:5000';

const bot = new Bot(BOT_TOKEN);

bot.command('start', async (ctx) => {
  const firstName = ctx.from?.first_name || 'User';
  await ctx.reply(
    `💎 Hey, ${firstName}!\n\nWelcome to Exitency Bot!\nOpen cases, upgrade items & win rare NFTs!`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🎮 Open Bot', web_app: { url: WEBAPP_URL } }],
          [
            { text: '🎁 Cases', callback_data: 'cases' },
            { text: '💰 Shop', callback_data: 'shop' }
          ],
          [
            { text: '📦 Inventory', callback_data: 'inventory' },
            { text: '⬆️ Upgrade', callback_data: 'upgrade' }
          ]
        ]
      }
    }
  );
});

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat.id;
  const data = query.data;

  const replies = {
    cases: { text: '🎁 Choose a case in the Mini App!', btn: '🎮 Open Cases' },
    shop: { text: '💰 Buy stars in the Shop!', btn: '⭐ Open Shop' },
    inventory: { text: '📦 Check your inventory!', btn: '📦 Open Inventory' },
    upgrade: { text: '⬆️ Upgrade your items!', btn: '⬆️ Open Upgrade' },
  };

  if (replies[data] && chatId) {
    await bot.api.sendMessage(chatId, replies[data].text, {
      reply_markup: {
        inline_keyboard: [[{ text: replies[data].btn, web_app: { url: WEBAPP_URL } }]]
      }
    });
  }
  await bot.api.answerCallbackQuery({ callback_query_id: query.id });
});

bot.startPolling();
console.log('🤖 Bot started!');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'miniapp')));

const DB_FILE = path.join(__dirname, 'db.json');

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users: {} }; }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
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

const CASES = [
  {
    id: 'starter', name: 'Starter Case', icon: '📦', price: 15, color: '#6366f1',
    items: [
      { name: 'NFT Pixel', emoji: '🎨', value: 10, rarity: 'common', chance: 45 },
      { name: 'NFT Neon', emoji: '💎', value: 20, rarity: 'common', chance: 30 },
      { name: 'NFT Cyber', emoji: '🤖', value: 35, rarity: 'uncommon', chance: 15 },
      { name: 'NFT Astral', emoji: '🌌', value: 50, rarity: 'rare', chance: 7 },
      { name: 'NFT Dragon', emoji: '🐉', value: 100, rarity: 'epic', chance: 2.5 },
      { name: 'NFT Cosmos', emoji: '🪐', value: 250, rarity: 'legendary', chance: 0.5 },
    ]
  },
  {
    id: 'basic', name: 'Basic Case', icon: '🎁', price: 25, color: '#06b6d4',
    items: [
      { name: 'NFT Wave', emoji: '🌊', value: 15, rarity: 'common', chance: 40 },
      { name: 'NFT Frost', emoji: '❄️', value: 30, rarity: 'common', chance: 30 },
      { name: 'NFT Ember', emoji: '🔥', value: 50, rarity: 'uncommon', chance: 16 },
      { name: 'NFT Storm', emoji: '⚡', value: 75, rarity: 'rare', chance: 9 },
      { name: 'NFT Phoenix', emoji: '🦅', value: 150, rarity: 'epic', chance: 4 },
      { name: 'NFT Void', emoji: '🕳️', value: 400, rarity: 'legendary', chance: 1 },
    ]
  },
  {
    id: 'standard', name: 'Standard Case', icon: '🏆', price: 45, color: '#f59e0b',
    items: [
      { name: 'NFT Pulse', emoji: '💜', value: 25, rarity: 'common', chance: 35 },
      { name: 'NFT Prism', emoji: '🔮', value: 45, rarity: 'common', chance: 28 },
      { name: 'NFT Solar', emoji: '☀️', value: 70, rarity: 'uncommon', chance: 18 },
      { name: 'NFT Lunar', emoji: '🌙', value: 100, rarity: 'rare', chance: 11 },
      { name: 'NFT Titan', emoji: '🗿', value: 200, rarity: 'epic', chance: 6 },
      { name: 'NFT Eternal', emoji: '♾️', value: 600, rarity: 'legendary', chance: 2 },
    ]
  },
  {
    id: 'premium', name: 'Premium Case', icon: '👑', price: 75, color: '#a78bfa',
    items: [
      { name: 'NFT Velvet', emoji: '🪻', value: 40, rarity: 'common', chance: 30 },
      { name: 'NFT Glacier', emoji: '🏔️', value: 65, rarity: 'common', chance: 25 },
      { name: 'NFT Aurora', emoji: '🌈', value: 100, rarity: 'uncommon', chance: 20 },
      { name: 'NFT Shadow', emoji: '🖤', value: 160, rarity: 'rare', chance: 13 },
      { name: 'NFT Celestial', emoji: '⭐', value: 300, rarity: 'epic', chance: 8 },
      { name: 'NFT Infinity', emoji: '💠', value: 1000, rarity: 'legendary', chance: 4 },
    ]
  },
  {
    id: 'elite', name: 'Elite Case', icon: '💎', price: 120, color: '#ef4444',
    items: [
      { name: 'NFT Eclipse', emoji: '🌑', value: 60, rarity: 'common', chance: 25 },
      { name: 'NFT Quantum', emoji: '⚛️', value: 90, rarity: 'common', chance: 22 },
      { name: 'NFT Nebula', emoji: '🎆', value: 140, rarity: 'uncommon', chance: 20 },
      { name: 'NFT Supernova', emoji: '💥', value: 220, rarity: 'rare', chance: 16 },
      { name: 'NFT Blackhole', emoji: '⚫', value: 400, rarity: 'epic', chance: 10 },
      { name: 'NFT Genesis', emoji: '🌌', value: 1500, rarity: 'legendary', chance: 5 },
      { name: 'NFT Big Bang', emoji: '💫', value: 5000, rarity: 'mythic', chance: 2 },
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
  { id: 'card', name: 'Bank Card', icon: '💳', desc: 'Visa / MasterCard / МИР' },
  { id: 'crypto', name: 'Crypto', icon: '₿', desc: 'USDT / BTC / ETH / TON' },
  { id: 'qiwi', name: 'QIWI', icon: '🥝', desc: 'QIWI Wallet' },
  { id: 'sbp', name: 'SBP', icon: '📱', desc: 'Система Быстрых Платежей' },
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

function generateSpinItems(items, realItem) {
  const result = [];
  for (let i = 0; i < 40; i++) {
    if (i === 35) {
      result.push(realItem);
    } else {
      result.push(items[Math.floor(Math.random() * items.length)]);
    }
  }
  return result;
}

// API Routes
app.get('/api/user/:uid', (req, res) => {
  res.json(getUser(req.params.uid));
});

app.get('/api/cases', (req, res) => {
  res.json(CASES.map(c => ({
    id: c.id, name: c.name, icon: c.icon,
    price: c.price, color: c.color,
    items_count: c.items.length,
  })));
});

app.get('/api/case/:cid/items', (req, res) => {
  const c = CASES.find(x => x.id === req.params.cid);
  if (!c) return res.status(404).json({ error: 'not found' });
  res.json(c.items);
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
  user.inventory.push({
    name: won.name, emoji: won.emoji,
    value: won.value, rarity: won.rarity,
    from_case: c.name, time: new Date().toISOString(),
  });
  user.history.push({
    case: c.name, item: won.name,
    value: won.value, profit, time: new Date().toISOString(),
  });
  updateUser(uid, user);

  res.json({ item: won, profit, balance: user.stars, case_price: c.price });
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

app.get('/api/shop/packs', (req, res) => res.json(STAR_PACKS));
app.get('/api/shop/methods', (req, res) => res.json(PAYMENT_METHODS));

app.post('/api/shop/buy', (req, res) => {
  const { uid, stars: packStars, method } = req.body;
  const pack = STAR_PACKS.find(p => p.stars === packStars);
  if (!pack) return res.status(400).json({ error: 'invalid pack' });

  const user = getUser(uid);
  const bonus = pack.bonus ? Math.floor(packStars * pack.bonus / 100) : 0;
  const total = packStars + bonus;
  user.stars += total;
  updateUser(uid, user);
  res.json({ stars_added: total, bonus, balance: user.stars, method });
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Exitency Bot running on http://localhost:${PORT}`);
});
