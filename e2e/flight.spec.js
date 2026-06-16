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

// v4.0-1 P1：選 ATR-72（民航 GLB 機體）→ GLB 過 normalize 管線載入 → 起飛、HUD 顯示 ATR-72。
test('機種 ATR-72：CC0/CC-BY GLB 機體載入 → 起飛、HUD 顯示 ATR-72', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  const errors = /** @type {string[]} */ ([]);
  display.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 選 ATR-72 → planeId=atr72
  await display.click('#playModeBtn');
  await display.click('#planeRow [data-plane="atr72"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.planeId)).toBe('atr72');
  await display.click('#modeMenuClose');

  // GLB 機體 async 載入完成（過 normalize/fitToLength 管線 → 掛進 plane group）
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.planeGlbLoaded[0]),
    { timeout: 30000 },
  ).toBe(true);

  // 鍵盤駕駛紅機（ATR-72，重機起飛滾行較長）→ 起飛
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await display.keyboard.up('Space');

  await expect(display.locator('#hud-0 .mode-slot')).toContainText('ATR-72');
  // GLB 載入/normalize 不得丟 console error
  expect(errors.filter((e) => /glb|gltf|airliner|model/i.test(e))).toEqual([]);
  await ctx.close();
});

// v4.0-1 P3：ATR-72 在地面 → 地面導航三合一（跟我車/綠中線燈/ATC 文字）引導到登機門。
test('地面導航：ATR 在地面 → 滑行道路線建出 + ATC 文字框架', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 選 ATR-72（民航機）
  await display.click('#playModeBtn');
  await display.click('#planeRow [data-plane="atr72"]');
  await display.click('#modeMenuClose');

  // 啟動鍵盤駕駛（按 G 切起落架即 active）→ 飛機停在跑道（不起飛，維持地面）
  await display.keyboard.press('KeyG');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 30000 },
  ).not.toBe('flying');

  // 地面導航啟用：滑行道路線（≥2 點）建出 + ATC 文字框架顯示「登機門」
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.groundNav.active),
    { timeout: 30000 },
  ).toBe(true);
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.groundNav._route.length)).toBeGreaterThan(1);
  await expect(display.locator('#atcBanner')).toBeVisible();
  await expect(display.locator('#atcBanner')).toContainText('塔台'); // ATC 文字框架（「松山塔台：滑行到 N 號門…」）
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

  // HUD（v2.0-5 分流）：武器卡＝ModeSlot（武器+彈藥）、計分卡＝TaskSlot（🎈 剩餘氣球）
  await expect(display.locator('#hud-0 .mode-slot')).toContainText('飛彈');
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

// v3 HITL 2026-06-15：2v2 敵機 4 架且從遠方（>2000m）進場（不再一出現就咬機尾）；翻滾閃避鍵可觸發。
test('空戰 2v2：4 架敵機從遠方 spawn + 翻滾閃避（Z）可觸發', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  await display.click('#playModeBtn');
  await display.click('#pmRow [data-pm="dogfight"]');
  await display.click('#dmRow [data-dm="ai_2v2"]');
  await display.click('#modeMenuClose');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.enemies.length)).toBe(4);
  // 全部敵機都在遠方（離機場 > 2000m）→ 不會一出現就在機尾
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.dogfight.enemies
    .every((/** @type {any} */ e) => Math.hypot(e.state.pos.x, e.state.pos.z) > 2000))).toBe(true);

  // 鍵盤起飛 → 按 Z 翻滾閃避 → 閃避狀態被觸發（readyAt 落在未來）
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await display.keyboard.down('KeyZ');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.dodges[0].readyAt > 0),
    { timeout: 10000 },
  ).toBe(true);
  await display.keyboard.up('KeyZ');
  await display.keyboard.up('Space');
  await ctx.close();
});

// v2.1-1：選競速 → 賽道標記（起點+航圈+終點）建出；切兩型（穿圈航線 4 圈 / 地標衝刺 1 終點）。
test('競速：選競速 → 賽道標記建出、切穿圈/地標兩型', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  await display.click('#playModeBtn');
  await display.click('#pmRow [data-pm="race"]');
  await display.click('#raceRow [data-race="rings"]'); // 穿圈航線
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.gameMode)).toBe('race');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.raceType)).toBe('rings');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.raceMarkers.rings.length)).toBe(4); // 4 航圈
  expect(await display.evaluate(() => !!/** @type {any} */ (window).__tp.raceMarkers.startMesh)).toBe(true); // 起點閘門
  expect(await display.evaluate(() => !!/** @type {any} */ (window).__tp.race)).toBe(true);

  await display.click('#raceRow [data-race="landmark"]'); // 地標衝刺
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.raceType)).toBe('landmark');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.raceMarkers.rings.length)).toBe(1); // 1 終點圈
  await display.click('#modeMenuClose');
  await ctx.close();
});

// v3.0-1：天氣 modulate world.js——安全模式恆晴(fog 遠)；霧/雨把 fog 拉近(能見度降)。
test('天氣：安全模式恆晴、設霧/雨 → fog 拉近（modulate world.js）', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 預設安全模式 → 開場恆晴、fog 遠（能見度好）
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.weather)).toBe('clear');
  const farClear = await display.evaluate(() => /** @type {any} */ (window).__tp.weatherRenderer.fog.far);
  expect(farClear).toBeGreaterThan(4000);

  // 設霧 → fog near 拉很近（能見度降，靠箭頭/光柱導航）
  await display.evaluate(() => /** @type {any} */ (window).__tp.setWeather('fog'));
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.weather)).toBe('fog');
  const nearFog = await display.evaluate(() => /** @type {any} */ (window).__tp.weatherRenderer.fog.near);
  expect(nearFog).toBeLessThan(500);

  // 設雨 → 下雨粒子顯示
  await display.evaluate(() => /** @type {any} */ (window).__tp.setWeather('rain'));
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.weatherRenderer.rain.visible)).toBe(true);
  await ctx.close();
});

// v3.0-2：真實模式 + 雨 → 飛行中吃側風(wind 餵進輸入)；亂流鏡頭晃動可在設定關掉(減暈)。
test('側風/亂流：真實模式+雨 → 側風進輸入；鏡頭晃動可關', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 切真實模式（設定頁）+ 設雨
  await display.click('#settingsBtn');
  await display.click('#modeRow [data-mode="real"]');
  await display.evaluate(() => /** @type {any} */ (window).__tp.setWeather('rain'));
  // 鏡頭晃動：關 → 設定生效（減暈）
  await display.click('#shakeRow [data-shake="0"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.settings.camShake)).toBe(false);
  await display.click('#settingsClose');

  // 鍵盤起飛 → 飛行中側風 wind 餵進輸入（real + 有風 + flying）
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await expect.poll(() => display.evaluate(() => {
    const w = /** @type {any} */ (window).__tp.lastInputs[0].wind;
    return w ? Math.hypot(w.x, w.z) : 0;
  })).toBeGreaterThan(0); // 真實+雨+飛行 → 有側風
  await display.keyboard.up('Space');
  await ctx.close();
});

// v3.0-3：生活感擺件 + 日夜——夜晚夜燈亮；perf GO/NO-GO：單視口 draws < 300。
test('生活感/日夜：夜燈可開、draws < 300（perf GO/NO-GO）', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 鍵盤起飛 → 有視口在渲染（draws 才有值）
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');
  await display.keyboard.up('Space');

  // perf GO/NO-GO：擺件全 merged/instanced → 單視口 draw calls < 300
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.drawCalls)).toBeGreaterThan(0);
  const draws = await display.evaluate(() => /** @type {any} */ (window).__tp.drawCalls);
  expect(draws).toBeLessThan(300);

  // 切夜晚 → 時段＝night、夜燈亮（純氛圍）
  await display.click('#settingsBtn');
  await display.click('#timeRow [data-time="night"]');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.timeOfDay)).toBe('night');
  expect(await display.evaluate(() => /** @type {any} */ (window).__tp.airportLife.nightLights.visible)).toBe(true);
  await ctx.close();
});

// v3.0-4：天氣挑戰任務——當前任務帶 weatherRequirement → 覆寫天氣；任務結束回環境天氣。
test('天氣挑戰任務：當前任務 weatherRequirement → 覆寫天氣、結束回環境', async ({ browser }) => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const display = await ctx.newPage();
  await display.goto('/');
  await display.waitForFunction(() => /** @type {any} */ (window).__tp?.net.connected);

  // 鍵盤駕駛紅機（預設任務模式）→ 有 driven slot
  await display.keyboard.down('Space');
  await expect.poll(
    () => display.evaluate(() => /** @type {any} */ (window).__tp.states[0].mode),
    { timeout: 60000 },
  ).toBe('flying');

  // 注入「霧中降落」天氣挑戰任務為當前任務 → 天氣覆寫成霧
  await display.evaluate(() => {
    /** @type {any} */ (window).__tp.runner.current[0] = { id: 'wx', type: 'takeoff_landing', weatherRequirement: 'fog', prompt: { text: '霧', draft: true } };
  });
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.weather)).toBe('fog');

  // 任務結束（清當前）→ 回環境天氣（預設安全模式＝晴）
  await display.evaluate(() => { /** @type {any} */ (window).__tp.runner.current[0] = null; });
  await expect.poll(() => display.evaluate(() => /** @type {any} */ (window).__tp.weather)).toBe('clear');
  await display.keyboard.up('Space');
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
