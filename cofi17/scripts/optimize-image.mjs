#!/usr/bin/env node
/**
 * Shrinks an image for the web: resizes so the longest side is at most --max pixels and encodes
 * it as WebP. Large originals (scans, print files) should go through this before landing in
 * public/ or src/, because every image is cached for offline use on the visitor's phone.
 *
 *   pnpm image <input> <output.webp> [--max 2400] [--quality 85]
 */
import { statSync } from 'node:fs';
import sharp from 'sharp';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const [, value] = args.splice(i, 2);
  return Number(value);
};
const max = option('max', 2400);
const quality = option('quality', 85);
const [input, output] = args;
if (!input || !output || !output.endsWith('.webp')) {
  console.error('Usage: pnpm image <input> <output.webp> [--max 2400] [--quality 85]');
  process.exit(1);
}

const info = await sharp(input)
  .rotate()
  .resize({ width: max, height: max, fit: 'inside', withoutEnlargement: true })
  .webp({ quality, effort: 6, smartSubsample: true })
  .toFile(output);
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;
console.log(`${input} (${kb(statSync(input).size)}) → ${output} ${info.width}×${info.height} (${kb(info.size)})`);
