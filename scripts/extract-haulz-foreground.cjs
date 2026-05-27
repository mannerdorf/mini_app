#!/usr/bin/env node
/**
 * Белая надпись HAULZ на прозрачном фоне из квадратной иконки (синий фон + текст).
 * Usage: node extract-haulz-foreground.cjs <input.png> <output.png> [size]
 * Запускать из каталога с установленным sharp (см. generate-haulz-brand-icons.sh).
 */
const sharp = require('sharp');

const [input, output, sizeArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node extract-haulz-foreground.cjs <input.png> <output.png> [size]');
  process.exit(1);
}

const size = sizeArg ? Number(sizeArg) : 1024;

(async () => {
  const { data, info } = await sharp(input)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    if (lum >= 180) {
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = 255;
    } else {
      data[i + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png()
    .toFile(output);
})();
