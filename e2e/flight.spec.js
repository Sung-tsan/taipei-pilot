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
  // HITL overlap regression：斷線盤旋提示不可疊到左上控制列 #topBtns
  const lostOverlap = await display.evaluate(() => {
    const a = /** @type {Element} */ (document.querySelector('#lost0')).getBoundingClientRect();
    const b = /** @type {Element} */ (document.querySelector('#topBtns')).getBoundingClientRect();
    return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  });
  expect(lostOverlap).toBe(false);

  await displayCtx.close();
});

// HITL overlap regression：右下角小地圖不可疊到「掃第二支」QR（v2.0-4 後同在右下角 → 曾互疊）。
test('小地圖與掃碼面板不重疊（角落 overlap regression）', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.keyboard.down('Space'); // 鍵盤駕駛紅機 → anyDriven + 有空位 → 小地圖 + miniQr 同時顯示
  await expect(display.locator('#minimap')).toBeVisible();
  await expect(display.locator('#miniQr')).toBeVisible();
  const overlap = await display.evaluate(() => {
    const a = /** @type {Element} */ (document.querySelector('#minimap')).getBoundingClientRect();
    const b = /** @type {Element} */ (document.querySelector('#miniQr')).getBoundingClientRect();
    return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  });
  expect(overlap).toBe(false);
  await display.keyboard.up('Space');
  await ctx.close();
});

// v2.0-1：玩法選單切 free↔dogfight↔race（HUD 契約跟著切）+ 選 F-16 起飛（噴射機手感）。
test('玩法選單：切 free/dogfight/race + 選 F-16 → 起飛、HUD 顯示 F-16', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 開玩法選單
  await display.click('#playModeBtn');
  await expect(display.locator('#modeMenu')).toBeVisible();

  // 預設任務模式 → 空戰子模式那段是停用的
  await expect(display.locator('#dogfightSection')).toHaveClass(/disabled/);

  // 切空戰 → gameMode=dogfight、子模式段啟用
  await display.click('#pmRow [data-pm="dogfight"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.gameMode)).toBe('dogfight');
  await expect(display.locator('#dogfightSection')).not.toHaveClass(/disabled/);
  await display.click('#dmRow [data-dm="pvp"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfightMode)).toBe('pvp');

  // 切競速 → gameMode=race
  await display.click('#pmRow [data-pm="race"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.gameMode)).toBe('race');

  // 選 F-16 → planeId=f16；切回自由飛收尾
  await display.click('#planeRow [data-plane="f16"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.planeId)).toBe('f16');
  await display.click('#pmRow [data-pm="free"]');
  await display.click('#modeMenuClose');
  await expect(display.locator('#modeMenu')).toBeHidden();

  // 鍵盤駕駛紅機（F-16）→ 起飛
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await display.keyboard.up('Space');

  // 飛行中 ModeSlot 顯示 F-16 機種名
  await expect(display.locator('#hud-0 .mode-slot')).toContainText('F-16');
  await ctx.close();
});

// v2.0-2：空戰整合——選空戰→氣球靶場 spawn→起飛→按 F 發射→彈藥扣減→HUD 顯示武器/彈藥。
test('空戰：選空戰 → 氣球靶場 spawn → 起飛開火 → 彈藥扣減、HUD 顯示武器', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 選空戰模式 → 氣球靶場 spawn
  await display.click('#playModeBtn');
  await display.click('#pmRow [data-pm="dogfight"]');
  await display.click('#modeMenuClose');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.gameMode)).toBe('dogfight');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.balloons.length)).toBeGreaterThan(0);

  // 鍵盤起飛
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await display.keyboard.up('Space'); // 油門維持（kb.th 保留），續飛

  // 開火（按住 F）→ 彈藥扣減（即使沒鎖到也會發射、扣彈，證明連線生效）
  const ammoBefore = await display.evaluate(() => {
    const d = /** @type {any} */ (window).__tp.dogfight; return d.mags[0][d.weaponId(0)].ammo;
  });
  await display.keyboard.down('KeyF');
  await expect.poll(
    () => display.evaluate(() => { const d = /** @type {any} */ (window).__tp.dogfight; return d.mags[0][d.weaponId(0)].ammo; }),
    { timeout: 10000 },
  ).toBeLessThan(ammoBefore);
  await display.keyboard.up('KeyF');

  // HUD：空戰計分卡（TaskSlot）顯示武器 + 彈藥（含 🎈 剩餘氣球數）
  await expect(display.locator('#hud-0 .task-slot')).toContainText('飛彈');
  await expect(display.locator('#hud-0 .task-slot')).toContainText('🎈');
  // HITL 新元素：角落小地圖顯示、空戰飛行時瞄準框顯示
  await expect(display.locator('#minimap')).toBeVisible();
  await expect(display.locator('#hud-0 .reticle')).toBeVisible();
  await ctx.close();
});

// v2.0-3：選空戰子模式 PvP → 清氣球、開玩家互打旗標（端到端驗 submode→setMode 接線）。
test('空戰子模式 PvP：選 ⚔️對打 → 清氣球、pvp 旗標開', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  await display.click('#playModeBtn');
  await display.click('#pmRow [data-pm="dogfight"]');
  await display.click('#dmRow [data-dm="pvp"]'); // 空戰子模式：PvP 對打
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfightMode)).toBe('pvp');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.pvp)).toBe(true);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.balloonTotal)).toBe(0); // PvP 清氣球
  await ctx.close();
});

// v2.0-4：選空戰子模式 1v1 → spawn 敵機（端到端驗 submode→spawnEnemies 接線）。
test('空戰子模式 1v1：選 🤖1v1 → spawn 一架敵機、清氣球', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  await display.click('#playModeBtn');
  await display.click('#pmRow [data-pm="dogfight"]');
  await display.click('#dmRow [data-dm="ai_1v1"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfightMode)).toBe('ai_1v1');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.enemies.length)).toBe(1);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.balloonTotal)).toBe(0);
  await ctx.close();
});

// 回歸：v1.1-1 StatusSlot（後果 badge）與 v1.1-0 左上控制列 #topBtns 都釘左上 → 曾整個疊在一起
// （HITL 2026-06-13 Sung 截圖回報）。沒修就會紅。
test('左上 StatusSlot 不與 #topBtns 控制列重疊（overlap regression）', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.keyboard.down('Space'); // 鍵盤驅動紅機 → StatusSlot 亮（後果 badge）
  const status = display.locator('#hud-0 .status-slot');
  await expect(status).toBeVisible();
  await expect(status).not.toBeEmpty();

  const overlap = await display.evaluate(() => {
    const a = /** @type {Element} */ (document.querySelector('#topBtns')).getBoundingClientRect();
    const b = /** @type {Element} */ (document.querySelector('#hud-0 .status-slot')).getBoundingClientRect();
    return !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
  });
  expect(overlap).toBe(false);

  await display.keyboard.up('Space');
  await ctx.close();
});
