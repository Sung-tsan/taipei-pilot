// @ts-check
// 開發自驗工具：headless 跑起飛流程 + 截圖（真 GPU fps 仍以實機為準）。
// 用法：node scripts/visual-check.js（需先 npm run build 並確保 8443 沒被佔用）
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const server = spawn('node', ['server/index.js'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 1200));

const browser = await chromium.launch();
const page = await browser.newPage({
  ignoreHTTPSErrors: true,
  viewport: { width: 1280, height: 720 },
});
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));

await page.goto('https://localhost:8443/?debug=1');
await page.waitForTimeout(800);

// 鍵盤開紅機：滿油門起飛
await page.keyboard.down('Space');
await page.waitForTimeout(600);
await page.screenshot({ path: '/tmp/tp-1-runway.png' });

await page.waitForTimeout(8000); // 滾行 + 離地
await page.screenshot({ path: '/tmp/tp-2-takeoff.png' });

await page.keyboard.up('Space');
await page.keyboard.down('ArrowUp'); // 拉桿爬升
await page.waitForTimeout(4000);
await page.keyboard.up('ArrowUp');
await page.keyboard.down('ArrowRight'); // 右轉
await page.waitForTimeout(4000);
await page.keyboard.up('ArrowRight');
await page.screenshot({ path: '/tmp/tp-3-turn.png' });

const state = await page.evaluate(() => {
  const t = /** @type {any} */ (window).__tp;
  const s = t.states[0];
  return { mode: s.mode, y: s.pos.y.toFixed(1), speed: s.speed.toFixed(1), draws: t.drawCalls };
});
console.log('P1 state:', JSON.stringify(state));

// 模型檢視器
await page.goto('https://localhost:8443/dev-viewer.html');
await page.waitForTimeout(1500);
await page.screenshot({ path: '/tmp/tp-4-viewer.png' });

await browser.close();
server.kill();
console.log('截圖：/tmp/tp-1-runway.png ~ tp-4-viewer.png');
