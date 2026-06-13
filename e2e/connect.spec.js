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

// server slot 狀態是跨測試共用的（單一 relay 進程）。前一個測試佔住的 slot 會留在 grace
// 期，害下一個只連 remote、不重置的測試拿到 slots_full 畫面。每個測試開跑前用一個拋棄式
// display 連線送 reset，並輪詢確認所有 slot 歸零，保證乾淨起點（不依賴前測自我清理）。
test.beforeEach(async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);
  await display.evaluate(() => {
    const net = /** @type {any} */ (window).__tp.net;
    net.ws.send(JSON.stringify({ t: 'reset' }));
  });
  // reset 後 server 對每個非空 slot 回 remote_gone → slotStatus 轉 empty；輪詢到全空才算確定送達。
  await expect
    .poll(() => display.evaluate(
      () => /** @type {any} */ (window).__tp.net.slotStatus.every((s) => s === 'empty'),
    ))
    .toBe(true);
  await ctx.close();
});

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

// —— v1.1-0 P4：複雜版 scheme / 向後相容 / 分屏槽位 ——

/** @param {import('@playwright/test').Browser} browser @returns {Promise<import('@playwright/test').Page>} */
async function freshDisplay(browser) {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);
  return display;
}

test('複雜版 scheme → 送 rudder/flaps/trim、右舵把機頭偏右（yaw）', async ({ browser }) => {
  const display = await freshDisplay(browser);

  const rCtx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 844, height: 390 } });
  const remote = await rCtx.newPage();
  await remote.goto('/remote.html?test=1&scheme=complex');
  await remote.click('#startBtn');
  await remote.click('#calDoneBtn');
  await expect(remote.locator('#control')).toBeVisible();
  await expect(remote.locator('#complexBar')).toBeVisible(); // scheme-complex → 複雜操控列出現
  await expect(remote.locator('#rudderTrack')).toBeVisible();

  await remote.evaluate(() => /** @type {any} */ (window).__injectInput(0, 0, 1)); // 滿油門
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');

  const h0 = await display.evaluate(() => /** @type {any} */ (window).__tp.states[0].heading);
  await remote.evaluate(() => /** @type {any} */ (window).__setComplex(1, 2, 0.3)); // 右滿舵 + 襟翼2 + 配平爬升

  // display 端收到複雜欄位
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.net.inputs[0]?.rudder)).toBe(1);
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.net.inputs[0]?.flaps)).toBe(2);
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.net.inputs[0]?.trim)).toBe(0.3);

  // 右舵 → heading 順時針增加（取最短角差，避開 wrap）
  await expect.poll(() => display.evaluate((h) => {
    let d = /** @type {any} */ (window).__tp.states[0].heading - h;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }, h0), { timeout: 8000 }).toBeGreaterThan(0.3);

  await rCtx.close();
  await display.context().close();
});

test('舊式 remote（簡單版、無新欄位）→ display 收到的 input 不含 rudder（向後相容）', async ({ browser }) => {
  const display = await freshDisplay(browser);
  const r = await openRemote(browser); // 簡單版：只送 {s,r,p,th,b}
  await r.page.evaluate(() => /** @type {any} */ (window).__injectInput(0.3, 0, 0.5));
  await expect.poll(() => display.evaluate(() => {
    const inp = /** @type {any} */ (window).__tp.net.inputs[0];
    return inp ? inp.rudder : 'pending';
  })).toBe(undefined);
  await r.ctx.close();
  await display.context().close();
});

test('分屏：兩機各自 HUD 槽位渲染（每半屏一套 AltBand）', async ({ browser }) => {
  const display = await freshDisplay(browser);
  const r1 = await openRemote(browser);
  const r2 = await openRemote(browser);
  await r1.page.evaluate(() => /** @type {any} */ (window).__injectInput(0, 0, 1));
  await r2.page.evaluate(() => /** @type {any} */ (window).__injectInput(0, 0, 1));

  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode), { timeout: 60000 }).toBe('flying');
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.states[1].mode), { timeout: 60000 }).toBe('flying');

  await expect.poll(() => display.evaluate(() => document.body.classList.contains('split'))).toBe(true);
  await expect(display.locator('#hud-0')).toBeVisible();
  await expect(display.locator('#hud-1')).toBeVisible();
  await expect(display.locator('#hud-0 .alt-band')).toContainText('⛰');
  await expect(display.locator('#hud-1 .alt-band')).toContainText('⛰');

  await r1.ctx.close();
  await r2.ctx.close();
  await display.context().close();
});

// —— v1.1-1：後果軸設定頁 ——
test('設定頁：切換後果模式 + ❤️ 上限 → conseq/localStorage/StatusSlot 生效', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');

  // join 畫面就能開設定（齒輪 z-index 高於 joinPanel）
  await display.click('#settingsBtn');
  await expect(display.locator('#settings')).toBeVisible();
  await display.click('#modeRow [data-mode="gentle"]');
  await display.click('#limitRow [data-limit="2"]');

  // localStorage 寫入
  await expect.poll(() => display.evaluate(() => localStorage.getItem('tp_consequence_mode'))).toBe('gentle');
  await expect.poll(() => display.evaluate(() => localStorage.getItem('tp_mishap_limit'))).toBe('2');
  // conseq 狀態套用
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.conseq[0].mode)).toBe('gentle');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.conseq[0].heartsMax)).toBe(2);

  await display.click('#settingsClose');
  await expect(display.locator('#settings')).toBeHidden();

  // 鍵盤接管紅機 → StatusSlot 顯示 ❤️（gentle）
  await display.keyboard.press('KeyW');
  await expect(display.locator('#hud-0 .status-slot')).toContainText('❤️');

  await ctx.close();
});

// —— v1.1-2：真實模式 + 地形辨識（迫降 GO/NO-GO 的好不好玩留 Sung HITL）——
test('真實模式 + terrainAt 在真實生成場景正確分類（跑道/水/草地）', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');

  // 切真實模式（迫降生效的前提）
  await display.click('#settingsBtn');
  await display.click('#modeRow [data-mode="real"]');
  await display.click('#settingsClose');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.conseq[0].mode)).toBe('real');

  // terrainAt 走真實生成場景：原點=跑道、淡水河頂點=水、極北空地=草地
  const t = await display.evaluate(() => {
    const f = /** @type {any} */ (window).__tp.terrainAt;
    return { runway: f(0, 0), water: f(-6250, 200), grass: f(0, -9500) };
  });
  expect(t.runway).toBe('runway');
  expect(t.water).toBe('water');
  expect(t.grass).toBe('grass');

  await ctx.close();
});

// —— v1.1-4：任務 UI + 收集 + 一次性大慶祝 ——
test('任務模式：任務卡顯示 → 完成循環 → 點亮收集 → 全亮一次性大慶祝 → 收集簿重看', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');

  // 鍵盤接管紅機（預設任務模式）→ 任務卡（TaskSlot）出現帶 prompt
  await display.keyboard.press('KeyW');
  await expect(display.locator('#hud-0 .task-slot')).toBeVisible();
  await expect(display.locator('#hud-0 .task-slot')).toContainText(/km|🎯/); // 地標任務顯示方向距離；高度/起降顯示 🎯

  // dev hook 跑完整迴圈（飛到定點在 headless 不穩）→ 驗收集 + 一次性慶祝
  await display.evaluate(() => {
    const tp = /** @type {any} */ (window).__tp;
    for (let guard = 0; guard < 50 && tp.runner.current[0]; guard++) tp.completeMission(0);
  });
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.collection.lit.size)).toBe(7);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.collection.celebrated)).toBe(true);

  // 台北飛透透大慶祝 overlay
  await expect(display.locator('#celebration')).toBeVisible();
  await display.click('#celebrationClose');
  await expect(display.locator('#celebration')).toBeHidden();

  // 收集簿可重看，顯示 7/7
  await display.click('#collectionBtn');
  await expect(display.locator('#collection')).toBeVisible();
  await expect(display.locator('#collectionCount')).toContainText('7/7');

  await ctx.close();
});
