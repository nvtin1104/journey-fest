// Builds Hsin in a headless browser, exports her as GLB and optimises it for the web.
//
//   pnpm export:hsin            → models/hsin/hsin.glb (meshopt + WebP, textures ≤ 1024 px)
//
// Needs Playwright with Chromium (`pnpm dlx playwright install chromium`). If Playwright is not a
// dependency, point PLAYWRIGHT_MODULE at an installed copy, e.g. $(npm root -g)/playwright/index.mjs.
import { execFileSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'models/hsin');
const raw = resolve(outDir, 'hsin.raw.glb');
const out = resolve(outDir, 'hsin.glb');

let playwright;
try {
  playwright = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
} catch {
  console.error('Playwright not found. Install it (pnpm add -D playwright && pnpm dlx playwright install chromium)\nor set PLAYWRIGHT_MODULE to an installed copy.');
  process.exit(1);
}

const server = await createServer({ root, server: { port: 4319, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`${url}tools/hsin-lab.html`);
  await page.waitForFunction(() => 'hsinExport' in window || '__hsinExport' in window, null, { timeout: 180000 });
  const base64 = await page.evaluate(() => window.__hsinExport());
  mkdirSync(outDir, { recursive: true });
  writeFileSync(raw, Buffer.from(base64, 'base64'));
  console.log(`raw GLB: ${(statSync(raw).size / 1048576).toFixed(2)} MB`);
} finally {
  await browser.close();
  await server.close();
}

// Keep the node hierarchy (it carries the animations) and the strand geometry (no simplify).
execFileSync('npx', ['--yes', '@gltf-transform/cli@4.5.1', 'optimize', raw, out,
  '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024',
  '--simplify', 'false', '--flatten', 'false', '--instance', 'false'], { stdio: 'inherit' });
console.log(`optimised GLB: ${(statSync(out).size / 1048576).toFixed(2)} MB → ${out}`);
