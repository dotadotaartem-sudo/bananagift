const sharp = require('sharp');
const fs = require('fs');

(async () => {
  const src = 'miniapp/img/cases_all.png';
  const meta = await sharp(src).metadata();
  const W = meta.width, H = meta.height;
  const cols = 4, rows = 2;
  const cellW = Math.floor(W / cols);
  const cellH = Math.floor(H / rows);
  const ids = ['star', 'summer', 'rgb', 'regular', 'farm', 'flex', 'vision', 'fresh'];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const id = ids[idx];
      const buf = await sharp(src)
        .extract({ left: c * cellW, top: r * cellH, width: cellW, height: cellH })
        .resize(512, 512, { fit: 'cover', position: 'centre' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const { data, info } = buf;
      const pxCount = info.width * info.height;
      const ch = info.channels;

      // Sample corners for bg color
      const sample = (x, y) => {
        const i = (y * info.width + x) * ch;
        return [data[i], data[i+1], data[i+2]];
      };
      const corners = [sample(0,0), sample(info.width-1,0), sample(0,info.height-1), sample(info.width-1,info.height-1),
                        sample(2,2), sample(info.width-3,2), sample(2,info.height-3), sample(info.width-3,info.height-3)];
      const bgR = Math.round(corners.reduce((s,c) => s+c[0], 0) / corners.length);
      const bgG = Math.round(corners.reduce((s,c) => s+c[1], 0) / corners.length);
      const bgB = Math.round(corners.reduce((s,c) => s+c[2], 0) / corners.length);
      console.log(`${id}: bg rgb(${bgR},${bgG},${bgB})`);

      const threshold = 35;
      const edgeSoftness = 30;

      for (let i = 0; i < data.length; i += ch) {
        const dr = data[i] - bgR;
        const dg = data[i+1] - bgG;
        const db = data[i+2] - bgB;
        const dist = Math.sqrt(dr*dr + dg*dg + db*db);
        if (dist < threshold) {
          data[i+3] = 0;
        } else if (dist < threshold + edgeSoftness) {
          data[i+3] = Math.round(255 * ((dist - threshold) / edgeSoftness));
        }
      }

      await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
        .png()
        .toFile(`miniapp/img/cases/${id}.png`);
      console.log(`  -> ${id}.png saved`);
    }
  }
  console.log('All done!');
})();
