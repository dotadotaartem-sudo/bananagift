const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

// Find and remove the 3 cases: easy, elite, profit
// They start after the fresh case and end before "];"

const freshEnd = code.indexOf("{ name: 'Plush Pepe', emoji: '🐸', value: 3000, rarity: 'legendary', chance: 0.2 },\n    ]\n  },");
if (freshEnd === -1) { console.log('fresh case end not found'); process.exit(1); }

const afterFresh = code.indexOf('\n  },\n  {', freshEnd + 10);
const casesEnd = code.indexOf('\n];', afterFresh);

// Remove everything between fresh case end and ];
const cutStart = afterFresh;
const cutEnd = casesEnd;
const before = code.substring(0, cutStart);
const after = code.substring(cutEnd);

code = before + '\n];' + after;

// Also rename the remaining 8 cases to be sequential IDs 1-8? No, keep IDs, just remove easy/elite/profit
fs.writeFileSync('server.js', code, 'utf8');
console.log('Removed easy, elite, profit cases');
