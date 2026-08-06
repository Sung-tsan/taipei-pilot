// @ts-check
// v5.3 P1 回歸：雙人 ATR 離場互不搶。
// 舊 bug：離場/到場狀態是 main.js 的模組層級單例，第二支手機加入時 startDeparture(1) 覆寫
// departSlot/departPhase/departGate，第一位玩家從此失去後推/滑行引導與 ATC 指示。
import { test, expect } from '@playwright/test';

/** 開一支遙控器（橫式、test=1 略過權限），連上就佔一個 slot。 @param {import('@playwright/test').Browser} browser */
async function openRemote(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await page.goto('/remote.html?test=1');
  await page.click('#startBtn');
  await page.click('#calDoneBtn');
  return { ctx, page };
}

// 兩支遙控器 + 兩段完整登機/後推（各 4s 登機 + 4s 後推）→ 預設 30s 不夠用。
// 檔名排在 flight.spec.js 之後：本檔會佔滿兩個 slot，跑在前面會污染鍵盤接管 slot 0 的既有測試。
test('雙人離場：第二位加入不影響第一位的離場流程與地面導航', async ({ browser }) => {
  test.setTimeout(150000);
  const displayCtx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await displayCtx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);
  await display.evaluate(() => { /** @type {any} */ (window).__tp.net.ws.send(JSON.stringify({ t: 'reset' })); });

  // 民航機（ATR-72）才有離場地面流程
  await display.click('#playModeBtn');
  await display.click('#planeRow [data-plane="atr72"]');
  await display.click('#modeMenuClose');

  // 第一位（slot 0）：登機 → 確認後推 → 滑向跑道頭
  const r0 = await openRemote(browser);
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(0).phase),
    { timeout: 30000 },
  ).toBe('boarding');
  await display.evaluate(() => /** @type {any} */ (window).__tp.confirmDeparture(0));
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(0).phase),
    { timeout: 30000 },
  ).toBe('taxiOut');
  const gate0 = await display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(0).gate);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.groundNavs[0].active)).toBe(true);

  // 第二位（slot 1）加入 → 開自己的離場流程
  const r1 = await openRemote(browser);
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(1).phase),
    { timeout: 30000 },
  ).toBe('boarding');

  // 關鍵斷言：slot 0 沒有被搶——階段還在 taxiOut、門沒被改、綠線導航還活著
  const d0 = await display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(0));
  expect(d0.phase).toBe('taxiOut');
  expect(d0.gate).toBe(gate0);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.groundNavs[0].active)).toBe(true);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.groundNavs[0]._route.length)).toBeGreaterThan(1);
  const d1 = await display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(1));
  expect(d1.gate).not.toBe(gate0); // 兩架不共用登機門

  // 第二位也走完到 taxiOut → 兩架各有自己的綠線與 ATC 文字框
  await display.evaluate(() => /** @type {any} */ (window).__tp.confirmDeparture(1));
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(1).phase),
    { timeout: 30000 },
  ).toBe('taxiOut');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.departureAt(0).phase)).toBe('taxiOut');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.groundNavs[1].active)).toBe(true);
  await expect(display.locator('#atcBanner')).toContainText('松山');
  await expect(display.locator('#atcBanner1')).toContainText('松山');

  await r1.ctx.close();
  await r0.ctx.close();
  // 收尾把 slot 還給下一個測試檔（遙控器關掉後 server 還留 grace/lost，不 reset 會讓後續鍵盤接管不到 slot 0）
  await display.evaluate(() => { /** @type {any} */ (window).__tp.net.ws.send(JSON.stringify({ t: 'reset' })); });
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.net.slotStatus.join(',')),
    { timeout: 15000 },
  ).toBe('empty,empty');
  await displayCtx.close();
});
