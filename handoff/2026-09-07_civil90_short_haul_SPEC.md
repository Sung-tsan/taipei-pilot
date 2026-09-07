# 台北小飛官 — Civil 90 短航班規格（2026-09-07）

> 狀態：**已凍結可開工**（2026-09-07 Sung 確認）· 開工順序 P0-1 → P0-2 → P0-3 → P1  
> 北極星：**使用者本人開民航／台灣航網**，體感從 ~60 → ~90；**不是**「能飛就好」。  
> 一局理想時長：**8–12 分鐘短航班**（完整長流程 ATC＝可選「真實模式」，不當預設）。

---

## 0. 產品決策（已確認）

| 項目 | 決策 |
|------|------|
| 90 分主角 | 使用者自己開民航／航網 |
| 一局長度 | 8–12 分鐘短航班 |
| 驗收標準 | 「這班飛完還想立刻再開一班」；測試綠燈只是必要條件，不是成功定義 |
| 六歲玩具飛／空戰 | 次要模式；不得污染民航預設體驗 |
| 本輪不做 | `main.js` 大拆、ATC 真錄音、完整航司塗裝資產工程、20–30 分鐘長航班預設 |

---

## 1. 預設完美一局（約 10 分鐘）

旗艦調校航線（開工先釘 2 條，建議）：

1. **松山 (RCSS) → 高雄 (RCKH)** — 本島幹線手感基準  
2. **松山 (RCSS) → 花蓮 (RCFN)** — 短程＋地形／進場辨識

### 時間盒

| 段 | 目標時長 | 玩家應感覺到 |
|----|----------|--------------|
| 選航線／機種 | ≤30s | 清楚「這一班要去哪」 |
| 後推＋滑出 | 1.5–2 min | 有儀式、有綠線／指令，**少傻等** |
| 起飛＋離場 | ~1.5 min | 加速／抬輪／離場有感 |
| 巡航 | 3–4 min | **至少 1–2 個可玩節點**（航點可見、輕互動或天氣），不是純快轉過場 |
| 進場＋落地＋回饋 | 2–2.5 min | 對正跑道直覺；落地有掌聲／準點成績 |
| 收尾 CTA | ≤15s | 「同一航線再飛／換對場／看這班成績」三選一 |

---

## 2. P0 硬傷（必須先於航網擴充）

判斷：修完能不能「好好開一班民航」。

### P0-1 追焦相機必須正後方（HITL 回歸）

**症狀（Sung 2026-09-07）：** 開飛機視角常在斜後方，導致斜著開、無法好好操控。

**已知脈絡：**

- 設計意圖：`src/display/render/chase-cam.js` — 機尾後上方、地平線水平、方位角域平滑追 `heading`
- 既有修復紀錄：`POLISH_BACKLOG.md`（GLB bbox 偏心 × `yaw=π` 曾把鏡頭甩成右後方／貼機尾；`plane-entity._buildGlb` 旋轉後重算 bbox 置中；`model.cam` back/up 倍率）
- **現況：使用者仍感到斜後方 → 當回歸 bug 處理，不當「已結案」**

**驗收（真機 HITL）：**

1. A330、B737、ATR-72 各測：直線平飛 ≥5s → 機尾在畫面**水平正中央、略偏下**（不得偏左／右四分之三）
2. 中等轉彎中與轉彎結束後 1s 內：仍維持「正後方」錨點，不得鎖在斜後方
3. 進場對準跑道：機鼻／跑道延長線與畫面中線對得起來（地平線保持水平可保留）

**實作方向（開工時驗證後擇一或併用，勿先鎖死單一真因）：**

- 複驗 `plane-entity` GLB 置中是否在 A330／B737 路徑仍生效  
- 複驗 `yaw`／飛行 `heading` 是否同向  
- 複驗 `chase-cam` 角域 damping 是否在民航轉彎速度下仍顯落後  
- 必要時加「民航專用」更貼身的 cam 參數（可走既有 `model.cam`）

**主要檔案：** `chase-cam.js`、`plane-entity.js`、`plane-specs.js`（`cam`）、相關測試／視覺檢查腳本

---

### P0-2 民航機不得發射飛彈（敘事鎖）

**症狀：** 民航機能發射飛彈，破壞短航班 immersion。

**根因（已對碼）：** 武器／空戰只認 `playMode === 'dogfight'`，**不認** `tone === 'airliner'`；選單允許 A330＋空戰並存；remote 仍收到發射／切武器 context。

**規則：**

| 機種 tone | 可進空戰 | 武器鍵／飛彈 |
|-----------|----------|--------------|
| `cartoon`（T-34C） | 可 | 可 |
| `combat`（F-16） | 可 | 可 |
| `airliner`（ATR／B737／A330） | **不可** | **不可** |

**行為：**

1. 選民航機時：玩法選單隱藏或禁用「空戰」；若目前已在空戰 → 自動切回 `free` 或上次非空戰模式並 toast 說明  
2. 在空戰中改選民航機 → 同上，強制離開空戰  
3. `net.sendMode`／remote context：**不送** FIRE／WEAPON_SWITCH 給民航 session  
4. `dogfight.setActive(false)` 並清彈／鎖時一併觸發  

**驗收：**

- 無法以任何選單路徑讓 A330／B737／ATR 進入可射擊狀態  
- e2e 或 unit：`isCivil(planeId) ⇒ dogfight inactive ∧ remote 無武器鍵`

**主要檔案：** `main.js`（`applyPlayMode`／`setPlane`／選單 UI）、`remote.html`／remote 輸入、`shared/protocol.js`（若 mode 契約需補強）

---

### P0-3 A330／B737 機模達到「短航班可認真開」的外觀底線

**症狀：** A330、B737 模型很陽春。

**現況資產：**

| 機種 | 檔案 | 問題 |
|------|------|------|
| A330 | `public/models/a330.glb`（~15KB，約 1100 tris，787 代用） | 過簡，廣體辨識弱 |
| B737 | `public/models/low_poly_airliner.glb`（窄體、較佳但仍 low-poly） | 可接受為 interim，需辨識度／站姿再校 |
| ATR-72 | `atr72.glb`（小型客機代用） | 本輪次優先；不擋 P0-1/2 |

**本輪外觀底線（非電影級）：**

1. A330／B737 **肉眼可區分**（翼吊發、機身長寬比、垂尾）  
2. 與 T-34C／F-16 voxel 並排時，不顯得「沒做完的 placeholder」  
3. 授權可商用／可標示（維持 CREDITS.md；CC-BY 可接受）  
4. 接既有 normalize／fitToGround／`gearNodes` 管線；換模後重跑 P0-1 相機 HITL  

**候選（已知，開工時再下載拍板）：** 見 `public/models/CREDITS.md`、`candidates/CANDIDATES.md`  
**不做：** 完整航司塗裝系統、高模 PBR（列 POLISH 後續）

**驗收：** Sung 真機並排看 A330 vs B737 vs ATR，「願意用這台開完整短航班」通過／打回。

---

## 3. P1 — 短航班節奏與再飛拉力（P0 之後）

| ID | 項目 | 要點 | 主要觸點 |
|----|------|------|----------|
| P1-1 | 地面流程壓縮 | **已實作 2026-09-07**：`DEPART_TIMING.shortHaul` 預設；腳本死氣 13s→~7.7s（立刻確認）、21s→~11.7s（auto）；綠線／ModeSlot 保留；`realistic` 表備好等 P1-6 | `ground-flow.js` 節奏表、`main.js` 離場狀態機 |
| P1-2 | 巡航去過場化 | **已實作 2026-09-07**：世界航點環＋路徑小環；巡航內 2 閘門穿圈＋1 天氣拍；overlay 顯示下一航點 | `route-engine.js` beats、`cruise-markers.js`、`main.js` |
| P1-3 | 進場落地定稿 | **已實作 2026-09-07**：對正／下滑 HUD＋五邊短走廊＋落地品質 toast／成績；chase-cam 下降略拉遠視注 | `approach-guide.js`、`main.js`、`chase-cam.js`、HUD |
| P1-4 | 機場／機種身份 | **已實作 2026-09-07**：九場 accent＋抬頭名牌；GLB slot 識別色／大名牌 | airport-life／labels／plane-entity／airports |
| P1-5 | 落地 CTA | **已實作 2026-09-07**：`flight-cta.js` + `#flightCta` modal；落地後 ≤15s 三選一（再飛／對場／成績）；hook `lastFlight` | `ui/flight-cta.js`、`index.html`、`main.js` 落地結算 |
| P1-6 | 真實模式開關 | **已實作 2026-09-07**：設定「真實模式」預設關；開→`DEPART_TIMING.realistic`＋略長巡航；持久化 `tp_realistic_mode` | settings-store + `#realisticRow` + `main.js` applyDepartPace |

---


### P1-1 實作紀要（2026-09-07）

| 常數 | 舊值 | shortHaul（預設） | realistic（P1-6） |
|------|------|-------------------|-------------------|
| `boardSec` | 4 | 2.5 | 8 |
| `confirmAutoSec` | 8（hardcode `BOARD+8`） | 4 | 12 |
| `pushSec` | 3.2 | 2.4 | 5 |
| `pushDoneSec` | 0.8 | 0.55 | 1.2 |
| `seqSec` | 5 | 2.2 | 8 |
| `turnaroundMs` | 4500 | 2500 | 8000 |

- 綠線 taxi、跟我車、ModeSlot／ATC 引導**未移除**；ModeSlot hold 文案改「前機離場中…即將起飛」。
- 天氣／後果軸**不**擋離場節奏（原本就沒 gate）；T-34C／非民航路徑不動。
- HITL：松山選 A330／B737／ATR → KeyG spawn-at-gate → 計時 boarding→確認後推→跟綠線到 hold→cleared；目標地面段 1.5–2 min。


### P1-2 實作紀要（2026-09-07）

- **世界可見**：進雲時沿航向放 2 座 torus 閘門＋路徑中點小環（語彙同 race/corridor markers），不只 `#cruiseOverlay`。
- **互動（壓縮巡航 22–48s 內）**：`gate1`（~30%）穿圈 → 航線小知識 toast；`wx1`（~50%）雲層亂流拍；`gate2`（~72%）第二穿圈。逾時未穿＝擦過提示，不擋抵達。
- **半自動保留**：progress 仍時間推進；轉向權重 0.25→0.42 方便穿之字閘門。shortHaul 預設不變、不強制 ATC 等待。
- **驗收 HITL（松山→高雄）**：選 A330／航線 RCSS→RCKH → 起飛爬升進雲 → 應見前方青色航點環；穿／擦各至少驗證一次；天氣拍 toast；抵達進場 toast 含航點成績。
- **測試**：`tests/route-engine.test.js` P1-2 describe（beats／place／step／label）。


### P1-3 實作紀要（2026-09-07）

- **對正**：五邊進場 `ModeSlot`＝對正／偏左偏右；`HomeSlot` 箭頭＝航向誤差；世界可見 `finalApproachPoints` 穿越環（對正→下滑→跑道頭）。
- **下滑**：`approachSpawnPose` 改為 ~3.5° 可讀高度＋民航進場速度（不再 360m/70m/s 過陡過快）；`AltBand` 顯示目標高度與偏高／偏低。
- **落地回饋**：`judgeRunwayLanding`（下沉＋中線）→ soft/ok/firm 與 ⭐；toast 接 `lastFlight` 載客／航點；P1-5 CTA 成績列可顯落地品質。
- **相機**：下降時 chase-cam 略拉遠視注（XZ 正後方幾何鎖不變，不回退 P0-1）。
- **並行**：純邏輯在 `approach-guide.js`；不改 P1-1／P1-2／P1-5 契約（只加強 toast／成績欄位）。
- **HITL（最終 2–2.5 min）**：松山→高雄抵達後應見橘／金穿越環＋ModeSlot「對正／下滑」；對正中線輕觸地 →「漂亮落地」＋CTA 含 ⭐；偏離／重觸 → 較弱文案仍可過。
- **測試**：`tests/approach-guide.test.js`；`air-corridor` ATC 機場名；`hud-slots` free TaskSlot。


### P1-5 實作紀要（2026-09-07）

- **觸發**：巡航抵達寫入 `lastFlight`（routeId/from/to/pax/gateScore/punctual）→ `justLanded` 且民航 → `#flightCta` candy modal（同 modeMenu 風格）。
- **三選一**：①同一航線再飛（回出發場＋選同 dest＋spawn-at-gate）②換對場（RCKH↔RCSS 等同 route 反向）③看這班成績（準點／載客／航點／指派門）；15s 自動收合＝繼續到場滑行。
- **並行**：邏輯在 `src/display/ui/flight-cta.js`；`main.js` 只碰落地結算＋CTA 接線＋過站 hold（CTA 開著不 auto-turnaround）。
- **HITL**：A330／航線松山→高雄 → `arriveNow` 或真飛落地 → 應見 CTA；測再飛／對場／成績／關閉。
- **測試**：`tests/flight-cta.test.js`。


### P1-6 實作紀要（2026-09-07）

- **UI**：⚙️ 設定 modal 新增「🛫 真實模式」開關列（關＝短航班 8–12 分／開＝較長登機與排序）；candy `.set-opt` 同既有設定風格。
- **持久化**：`settings-store` 欄位 `realisticMode`（預設 `false`）；localStorage key `tp_realistic_mode`＝`'1'|'0'`。
- **地面**：`applyDepartPace` 依開關選 `DEPART_TIMING.shortHaul|realistic`（P1-1 表）；綠線／ModeSlot／ATC 文案不拆，只換 timer。
- **巡航輕閘**：`cruiseDuration`／`makeCruise` 可選 `pace`；realistic 夾值 40–90s（預設仍 22–48s）。不重建 ATC。
- **HITL**：設定→開真實模式→民航 spawn-at-gate → boarding 約 8s（短航班約 2.5s）；或 `__tp.setRealisticMode(true)` 後看 `__tp.departTiming.boardSec`。
- **測試**：`settings-store.test.js`（預設＋pace）、`ground-flow` `departPaceFromRealistic`、`route-engine` realistic 夾值。


### P1-4 實作紀要（2026-09-07）

- **機場**：`airports.accent` 九場一色；`airportNameplate`＝中文名＋ICAO；`airport-scene` 航廈／招牌地標掛抬頭；`labels` 兩行＋世界座標淡入（修 template yaw）。
- **生活感**：`airport-life` 夜燈／風向袋／航廈前色帶吃 accent（variant→機場 id）。
- **民航／雙人**：`plane-entity` GLB 材質 lean slot 色（clone）＋垂尾色條；slot 大名牌（紅機／藍機）。voxel 機原本就吃 accent。
- **未碰**：`main.js`／settings（讓 P1-6）；完整航司塗裝資產工程（仍 POLISH）。
- **測試**：`plane-entity-identity`／`labels-identity`／airports＋airport-life accent cases。
- **HITL**：雙視口同機種分紅藍；松山→高雄進場見「高雄小港／RCKH」抬頭與港灰藍夜燈。

## 4. P2 — 明確降優先（本兩週不排）

- `main.js` god-file 大拆（除非堵住 P0／P1 速度）  
- ATC 真人口播音、航司塗裝、真建模輪組  
- 六歲首次漸進揭露主線（可另開「兒童模式」規格）  
- 空戰手感／敵機 AI 深化  

---

## 5. 兩週開工順序

**原則：每天結束用「還想不想再開一班」驗收。**

### Week 1

1. **P0-1** 相機正後方 HITL（A330／B737 優先）  
2. **P0-2** 民航禁飛彈＋選單／remote 鎖  
3. **P0-3** A330（必要時 B737）換模或升級至外觀底線 + 相機回歸  
4. 釘死 2 條旗艦短程的時間盒，真機跑一輪計時  

### Week 2

5. P1-1 地面壓縮  
6. P1-2 巡航可見目標＋1–2 互動  
7. P1-3 進場落地定稿  
8. P1-5 落地 CTA  
9. P1-4／P1-6 能做多少算多少  
10. 回歸：既有 unit／e2e + 新增「民航無武器」「相機置中」檢查；Sung 雙真機只簽「還想再飛」

---

## 6. 測試與 HITL 清單（摘要）

- [ ] 直線平飛：A330／B737 機尾畫面正中  
- [ ] 轉彎中／後：無持續斜後方鎖死  
- [ ] 民航機無法進入可射擊空戰；remote 無 🔥  
- [ ] 新／升級 GLB 授權寫入 `CREDITS.md`  
- [ ] 松山→高雄（或選定旗艦）牆鐘 **8–12 分鐘** 可完成一班
- [x] P1-1 地面腳本死氣壓縮（shortHaul 表 + unit）；HITL 牆鐘地面 1.5–2 min 仍待 Sung 簽
- [x] P1-2 巡航世界航點＋1–2 互動（beats unit）；HITL 松山→高雄穿圈／天氣拍仍待 Sung 簽  
- [x] 落地後有明確再飛 CTA（P1-5 unit；HITL 松山→高雄落地選三選一仍待 Sung 簽）  
- [x] P1-3 進場對正／下滑／落地回饋（approach-guide unit）；HITL 最終 2–2.5 min 仍待 Sung 簽
- [x] P1-4 機場／機種身份（accent／名牌／GLB slot unit）；HITL 雙人紅藍＋九場抬頭仍待 Sung 簽  
- [x] P1-6 真實模式開關（settings 預設關＋pace unit；HITL 開後較長登機仍待 Sung 簽）
- [ ] 既有 vitest／playwright 全綠（允許新增專測）

---

## 7. 拍板狀態

| # | 項目 | 狀態 | 決議／建議預設 |
|---|------|------|----------------|
| 1 | 旗艦航線 | **已凍結** | 松山 (RCSS)→高雄 (RCKH)、松山 (RCSS)→花蓮 (RCFN) |
| 2 | A330 模天花板 | **已凍結** | 本輪「升級 low-poly 但可辨識」；精模列後續 |
| 3 | 民航×空戰 UI | **已凍結** | 選民航機時空戰選項**不出現** |
| 4 | 真實模式預設 | **已凍結** | 預設**關**；短航班精煉流程為預設 |

開工順序：P0-1 相機 → P0-2 禁飛彈 → P0-3 機模 → P1 短航班節奏。

---

## 8. 對照舊評審的位移

先前以「六歲第一次」為主角的 P0（首次功能海嘯、任務藍光圈、教學 toast）**降為次要**。  
本規格主角改為民航短航班後，**相機／禁飛彈／機模** 升為絕對前置；任務模式可見目標等項改掛兒童／任務子規格。

---

*撰寫：技術開發總監助手 · 2026-09-07（Asia/Taipei）*
