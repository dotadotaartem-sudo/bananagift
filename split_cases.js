const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

(async () => {
  const dir = path.join('C:\\Users\\PC\\Downloads', 'для кейсов');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.png'))
    .sort();
  
  const ids = ['star', 'summer', 'rgb', 'regular', 'farm', 'flex', 'vision', 'fresh'];
  
  for (let i = 0; i < ids.length; i++) {
    const src = path.join(dir, files[i]);
    const id = ids[i];
    
    const buf = await sharp(src)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    const { data, info } = buf;
    const ch = info.channels;
    
    const sample = (x, y) => {
      const idx = (y * info.width + x) * ch;
      return [data[idx], data[idx+1], data[idx+2]];
    };
    const corners = [sample(0,0), sample(info.width-1,0), sample(0,info.height-1), sample(info.width-1,info.height-1)];
    const bgR = Math.round(corners.reduce((s,c) => s+c[0], 0) / corners.length);
    const bgG = Math.round(corners.reduce((s,c) => s+c[1], 0) / corners.length);
    const bgB = Math.round(corners.reduce((s,c) => s+c[2], 0) / corners.length);
    console.log(`${files[i]} -> ${id}: bg rgb(${bgR},${bgG},${bgB})`);
    
    const threshold = 70;
    const edgeSoftness = 50;
    
    for (let p = 0; p < data.length; p += ch) {
      const dr = data[p] - bgR;
      const dg = data[p+1] - bgG;
      const db = data[p+2] - bgB;
      const dist = Math.sqrt(dr*dr + dg*dg + db*db);
      if (dist < threshold) {
        data[p+3] = 0;
      } else if (dist < threshold + edgeSoftness) {
        data[p+3] = Math.round(255 * ((dist - threshold) / edgeSoftness));
      }
    }
    
    await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
      .png()
      .toFile(`miniapp/img/cases/${id}.png`);
    console.log(`  saved ${id}.png`);
  }
  
  console.log('Done!');
})();
