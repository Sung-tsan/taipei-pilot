// SPIKE 截圖器：spawn vite（專案自身 https 設定）→ Playwright 無頭載入 spike → 等場景就緒 → 截圖。
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { mkdirSync } from 'node:fs';

const PORT = 5181;
mkdirSync('spike-glb/out', { recursive: true });

const vite = spawn('./node_modules/.bin/vite', ['--port', String(PORT), '--strictPort'], {
  cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'],
});
vite.stdout.on('data', (d) => process.stdout.write('[vite] ' + d));
vite.stderr.on('data', (d) => process.stderr.write('[vite-err] ' + d));

const url = `https://localhost:${PORT}/spike-glb/index.html`;
let code = 0;
try {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));

  let ok = false;
  for (let i = 0; i < 60; i++) {
    try { await page.goto(url, { waitUntil: 'load', timeout: 3000 }); ok = true; break; }
    catch { await sleep(500); }
  }
  if (!ok) throw new Error('vite 起不來 / 連不上');

  await page.waitForFunction('window.__spikeReady===true || window.__spikeError', null, { timeout: 25000 });
  await sleep(700);
  await page.screenshot({ path: 'spike-glb/out/coexist.png' });
  const err = await page.evaluate('window.__spikeError || null');
  console.log('RESULT spikeError =', err);
  console.log('RESULT screenshot = spike-glb/out/coexist.png');
  await browser.close();
} catch (e) {
  console.error('SHOOT FAILED:', e && e.message);
  code = 1;
} finally {
  vite.kill('SIGTERM');
}
process.exit(code);
