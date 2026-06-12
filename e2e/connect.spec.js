// @ts-check
// 整合測試：1 display + 2 remote 真瀏覽器連線（wss over 自簽 https）。
// 傾斜手感、iOS 權限、震動只能真機驗 —— 這裡驗的是連線鏈與 UI 狀態機。
import { test, expect } from '@playwright/test';

/** 清掉前一個測試殘留的 slot（含 30s grace） @param {import('@playwright/test').Page} display */
async function resetSlots(display) {
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);
  await display.evaluate(() => {
    const net = /** @type {any} */ (window).__tp.net;
    net.ws.send(JSON.stringify({ t: 'reset' }));
  });
}

/**
 * @param {import('@playwright/test').Browser} browser
 */
async function openRemote(browser) {
  // 橫式手機 viewport（直拿會被 rotateGuard 擋住 —— 另有測試驗證）
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 844, height: 390 }, // 橫式遙控
  });
  const page = await ctx.newPage();
  await page.goto('/remote.html?test=1');
  await page.click('#startBtn');
  await page.click('#calDoneBtn'); // 首次校準步驟
  return { ctx, page };
}

test('雙手機連線 → 輸入轉發 → 滿員 → 斷線重連', async ({ browser }) => {
  // —— display ——
  const displayCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await displayCtx.newPage();
  await display.goto('/');
  await resetSlots(display);
  await expect(display.locator('#joinPanel')).toBeVisible();
  // QR 有畫出來（canvas 非空白）
  await expect.poll(() => display.evaluate(() => {
    const c = /** @type {HTMLCanvasElement} */ (document.getElementById('qr'));
    return c.width > 0 && c.toDataURL().length > 1000;
  })).toBe(true);

  // —— 第一支手機 ——
  const r1 = await openRemote(browser);
  await expect(r1.page.locator('#slotName')).toContainText('紅機');
  await expect(display.locator('#joinPanel')).toBeHidden();
  await expect(display.locator('#miniQr')).toBeVisible(); // 還有空位 → 角落小 QR

  // 注入輸入 → display 端收到 slot 0 的值
  await r1.page.evaluate(() => /** @type {any} */ (window).__injectInput(0.5, -0.25, 0.8));
  await expect.poll(() => display.evaluate(() => {
    const input = /** @type {any} */ (window).__tp.net.inputs[0];
    return input && Math.abs(input.r - 0.5) < 1e-9 && Math.abs(input.th - 0.8) < 1e-9;
  })).toBe(true);

  // —— 第二支手機 ——
  const r2 = await openRemote(browser);
  await expect(r2.page.locator('#slotName')).toContainText('藍機');
  await expect(display.locator('#miniQr')).toBeHidden(); // 滿了 → 收起小 QR

  // —— 第三支：機庫滿了（slots_full 會直接蓋掉校準頁，不走 calDone） ——
  const r3Ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 844, height: 390 }, // 橫式遙控
  });
  const r3 = await r3Ctx.newPage();
  await r3.goto('/remote.html?test=1');
  await r3.click('#startBtn');
  await expect(r3.locator('#full')).toBeVisible();
  await expect(r3.locator('#calibrate')).toBeHidden();
  await r3Ctx.close();

  // —— r1 斷線 → display 標 lost；帶 token 的新分頁 → 回 slot 0 ——
  const r1Token = await r1.page.evaluate(() => localStorage.getItem('tp_token'));
  await r1.ctx.close();
  // 斷線偵測：close frame 即時，但慢機器上靠心跳兜底（3s×2）→ 給足 15s
  await expect.poll(() => display.evaluate(
    () => /** @type {any} */ (window).__tp.net.slotStatus[0],
  ), { timeout: 15000 }).toBe('lost');

  const r1bCtx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 844, height: 390 }, // 橫式遙控
  });
  const r1b = await r1bCtx.newPage();
  await r1b.addInitScript((token) => localStorage.setItem('tp_token', String(token)), r1Token);
  await r1b.goto('/remote.html?test=1');
  await r1b.click('#startBtn');
  await r1b.click('#calDoneBtn');
  await expect(r1b.locator('#slotName')).toContainText('紅機'); // 回原 slot
  await expect.poll(() => display.evaluate(
    () => /** @type {any} */ (window).__tp.net.slotStatus[0],
  )).toBe('active');

  await r1bCtx.close();
  await r2.ctx.close();
  await displayCtx.close();
});

test('直拿手機 → rotateGuard 遮罩擋住操作', async ({ browser }) => {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 }, // 直式
  });
  const page = await ctx.newPage();
  await page.goto('/remote.html?test=1');
  await expect(page.locator('#rotateGuard')).toBeVisible();
  await ctx.close();
});

test('遊戲中被 OS 轉直 → 不中斷：guard 不出現、只顯示小提示、輸入照送', async ({ browser }) => {
  const ctx = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 844, height: 390 }, // 橫式進場
  });
  const page = await ctx.newPage();
  await page.goto('/remote.html?test=1');
  await page.click('#startBtn');
  await page.click('#calDoneBtn');
  await expect(page.locator('#control')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 }); // 模擬 OS 轉直
  await expect(page.locator('#rotateGuard')).toBeHidden(); // 不擋
  await expect(page.locator('#rotateHint')).toBeVisible(); // 只提示
  await expect(page.locator('#control')).toBeVisible();    // 遊戲沒中斷

  await page.setViewportSize({ width: 844, height: 390 }); // 轉回來
  await expect(page.locator('#rotateHint')).toBeHidden();
  await ctx.close();
});
