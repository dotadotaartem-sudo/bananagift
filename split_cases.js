const sharp = require('sharp');

(async () => {
  const src = 'miniapp/img/cases_all.png';
  const meta = await sharp(src).metadata();
  const W = meta.width, H = meta.height;
  
  // Assume 4 columns x 2 rows = 8 cases
  const cols = 4, rows = 2;
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);
  
  console.log(`Image: ${W}x${H}, grid: ${cols}x${rows}, cell: ${cellW}x${cellH}`);
  
  const caseIds = ['star', 'summer', 'rgb', 'regular', 'farm', 'flex', 'vision', 'fresh', 'easy', 'elite', 'profit'];
  
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= caseIds.length) break;
      const id = caseIds[idx];
      await sharp(src)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .resize(256, 256, { fit: 'cover' })
        .png()
        .toFile(`miniapp/img/cases/${id}.png`);
      console.log(`Saved: ${id}.png (${cellW}x${cellH})`);
    }
  }
  
  console.log('Done!');
})();
