// @ts-check
// 整合：鍵盤駕駛端到端（起飛 → 空中），與雙人分屏 HUD 狀態。
import { test, expect } from '@playwright/test';

// headless 軟體渲染下滾行起飛偶爾很慢 → 給足預算（真機/真 GPU 都在 10s 內）
test.setTimeout(90000);

test('鍵盤滿油門 → 滾行 → 自動離地 → 空中', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.keyboard.down('Space');

  // joinPanel 讓位給遊戲畫面；HUD 層亮、ModeSlot 出現（parked 時顯示起飛提示）
  await expect(display.locator('#joinPanel')).toBeHidden();
  await expect(display.locator('#hud-0')).toBeVisible();
  await expect(display.locator('#hud-0 .mode-slot')).toBeVisible();

  // 60 秒內必定離地（實際 ~8s；headless 軟渲染給寬裕）
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await display.keyboard.up('Space');

  // 飛行中 AltBand 顯示高度/速度
  await expect(display.locator('#hud-0 .alt-band')).toContainText('⛰');
  await ctx.close();
});

test('手機連線 + 注入輸入 → 該機起飛；斷線 → 空中盤旋', async ({ browser }) => {
  const displayCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await displayCtx.newPage();
  await display.goto('/');
  // 清掉前一個測試殘留的 slot（含 grace）
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);
  await display.evaluate(() => {
    /** @type {any} */ (window).__tp.net.ws.send(JSON.stringify({ t: 'reset' }));
  });

  const rCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 844, height: 390 }, // 橫式遙控
  });
  const remote = await rCtx.newPage();
  await remote.goto('/remote.html?test=1');
  await remote.click('#startBtn');
  await remote.click('#calDoneBtn'); // 首次校準步驟
  await remote.evaluate(() => /** @type {any} */ (window).__injectInput(0, 0, 1)); // 滿油門

  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');

  // 斷線 → 盤旋 autopilot
  await rCtx.close();
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].autopilot),
    { timeout: 15000 },
  ).toBe('orbit');
  await expect(display.locator('#lost0')).toBeVisible();

  await displayCtx.close();
});
