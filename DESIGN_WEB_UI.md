# 🎨 台北小飛官 — Web UI 設計語言（玩具櫃 web 版）

> v1.1-0 foundation。這是 **UI 層的 B1**：設計一次 seam，V1–V5 後面填槽位不重畫。
> 北極星 [`ROADMAP.md`](ROADMAP.md) §4 v1.1-0；工法基準 §9（UI 起跑線＝`../spec/DESIGN_CRAFT_GUIDE.md` 的 TactilePress + 多層表面 + haptic 政策，web 重做）。
>
> **鐵律：維持玩具櫃 / voxel-toybox 識別，把 UI 系統化——不換風格。** 本檔是 display HUD 與 remote
> 共用的 token + 槽位契約**單一來源**。色值/圓角/Tactile/haptic 一律引用本檔的 CSS 變數，不散落各檔硬編。

---

## 1. 識別原則

- voxel 玩具視覺恆定（ROADMAP §2 tone ladder）：UI 是「玩具櫃裡的塑膠儀表」，圓潤、厚實、可按、糖果色。
- 不擬真航電（那是 tone ladder 民航端 V4+ 才漸進爬升的事）；v1.1 全程卡通玩具調性。
- 一切可按元素都有**實體按壓感**（Tactile press），不是扁平 web 按鈕。

---

## 2. 色票（CSS 變數，single source）

display 與 remote 的 `<style>` 都從這組 `:root` 起手（複製本區塊，勿各自硬編色值）：

```css
:root {
  /* —— 介面底層（深色駕駛艙，襯托糖果色 HUD）—— */
  --ui-bg:        #1a2233;   /* 全域背景／面板底 */
  --ui-panel:     #2a3450;   /* 卡片／chip 面 */
  --ui-panel-2:   #3a4666;   /* 次級面（校正鈕等）*/
  --ui-ink:       #f2ead8;   /* 暖米白主文字 */
  --ui-ink-dim:   #f2ead8aa; /* 次要文字 */

  /* —— 玩具糖果色（世界色票家族，ROADMAP/spec 一致）—— */
  --candy-amber:  #f2b94b;   /* 主行動色（開始/油門）*/
  --candy-amber-d:#b8852a;   /* amber 按壓陰影 */
  --candy-green:  #7fc97f;   /* 確認/正向（校準完成/起落架放下）*/
  --candy-green-d:#4e8a4e;
  --candy-red:    #e0533d;   /* 警示/撞擊；亦為紅機機身色 */
  --grass:        #9dbf7b;   /* 草地（世界）*/
  --river:        #8fc7d6;   /* 河流粉藍 */
  --teal-101:     #4fb6a0;   /* 101 青綠（地標強調）*/
  --beige:        #efe6cf;   /* 暖米背景（亮底場合）*/

  /* —— slot 識別（機身色 / 遙控器主題色，對齊 constants.SLOT_COLORS）—— */
  --slot-0:       #e0533d;   /* 🔴 紅機 */
  --slot-1:       #3d7be0;   /* 🔵 藍機 */

  /* —— 圓角階梯 —— */
  --r-sm: 10px;  --r-md: 14px;  --r-lg: 20px;  --r-pill: 999px;

  /* —— Tactile 按壓位移／陰影厚度 —— */
  --press-lift: 5px;     /* 靜止時「浮起」厚度（box-shadow 下緣）*/
  --press-drop: 3px;     /* 按下時下沉位移 */

  /* —— HUD 字級（給孩子看：大、粗、高對比）—— */
  --hud-fz:   18px;
  --hud-fz-lg:34px;
  --hud-shadow: 0 2px 4px #0008;  /* HUD 浮在 3D 世界上的描影 */
}
```

> 新增世界/空域相關顏色（地標、河流）走 `airspace.json`（B1），**不進本檔**；本檔只管 UI 介面色。

---

## 3. Tactile Press（實體按壓）

DESIGN_CRAFT_GUIDE 的 TactilePress 精神，web 用「厚底陰影 + 按下沉位移」實現（沿用 v1 已驗證的 `#startBtn`/`#gearBtn` 手感，系統化成 class）：

```css
.tactile {
  border: none; border-radius: var(--r-lg);
  box-shadow: 0 var(--press-lift) 0 var(--press-shadow, #0006);
  transition: transform .08s ease, box-shadow .08s ease, background .2s;
  cursor: pointer;
}
.tactile:active {
  transform: translateY(var(--press-drop));
  box-shadow: 0 calc(var(--press-lift) - var(--press-drop)) 0 var(--press-shadow, #0006);
}
.tactile:disabled { filter: grayscale(.4) brightness(.8); }
```

- 每種按鈕用 `--press-shadow` 給自己的深色（amber→`--candy-amber-d`、green→`--candy-green-d`）。
- 微暗＝按下時 `box-shadow` 縮短（浮起厚度變薄）＋下沉位移，視覺上「壓進去」再回彈。
- 觸控目標 **≥ 96px**（孩子手指）；context 動作鍵更大。

---

## 4. Haptic / 撞擊回饋政策

跨平台落地（沿用 `remote/feedback.js`，已驗證）：

| 平台 | 撞擊/警示回饋 |
|---|---|
| Android（有 `navigator.vibrate`）| 震動 120ms |
| iOS（無 vibrate）| 全螢幕**閃紅框**（`#flash` 動畫）+ 短 beep |
| 兩者 | 短促 square-wave beep（`feedback._beep`）|

- **政策：任何「後果」事件（撞擊/❤️−1/被擊落，v1.1-1+）都要走這條 haptic 通道**，不是只有撞擊。
- display 端 fx 訊息（`{t:'fx',kind}`）→ remote 端對應回饋；新 kind 在這裡登記（v1.1 之後擴充 `bump` 以外的 kind 要同步更新協定 + 本表）。

---

## 5. HUD 6 槽位契約（display）

display 每個視口（分屏時左右各一套）疊一層 `hud-layer`，內含 6 個固定槽位。**每模式只亮要的**（contextual）。槽位位置固定 → 後面版本填內容不搬家（UI 層的 B1）。

```
┌─────────────────────────────────────────┐
│ [StatusSlot]      [TaskSlot]    [ModeSlot]│  ← 頂列：左 狀態 / 中 任務 / 右 機種
│  左上              頂中            右上     │
│                                   ┌──────┐ │
│              [CenterSlot]         │AltBand│ │  ← 中央：導引/慶祝 overlay；右緣 高度帶
│               中央(大)            └──────┘ │
│ [HomeSlot]                                │  ← 左下：回家箭頭
└─────────────────────────────────────────┘
```

| 槽位 | 位置 | 職責 | v1.1-0（本輪）| 後續填充 |
|---|---|---|---|---|
| **StatusSlot** | 左上 | 這架飛機的身分與狀態 | **空契約**（eligible 但無內容→隱藏）| v1.1-1：❤️ 顆數 + 後果模式 chip |
| **TaskSlot** | 頂中 | 當前任務卡 | **空契約**（free 模式不 eligible→隱藏）| v1.1-4：任務卡（prompt DRAFT）|
| **ModeSlot** | 右上 | 機種 + 飛行狀態 | 機種「🛩 T-34C」/ parked 時「🛫 推滿油門起飛！」| v1.2：roster 機種名；V2：武器/彈藥 |
| **CenterSlot** | 中央 | 導引與大事件 overlay | 事件 toast（起飛/降落/碰，**瞬時 overlay**；持久內容空契約）| v1.1-4：目標箭頭/光圈/達成揭曉/大慶祝 |
| **AltBand** | 右緣 | 高度帶 | 高度（m）+ 速度（km/h），只飛行中 | V3：升降率/雲頂帶；V4：襟翼/起落架燈 |
| **HomeSlot** | 左下 | 回機場導引 | 回家箭頭 + 距離（飛離>900m 才亮）| V5：航網目的地箭頭 |

> **顯隱規則（v1.1-0 實作）**：`slot 顯示 ⟺ slotVisibility(mode)[slot] 為真 且 該 slot 有內容`。
> 故 StatusSlot 在 free 模式 eligible 但本輪無內容→隱藏；v1.1-1 餵 ❤️ 內容後即在自由飛也亮（不必改框架）。
> TaskSlot 在 free 不 eligible→恆隱藏；v1.1-4 切 mission 模式後 eligible，餵任務卡即亮。

### Contextual 顯示 map（`mode → 哪些槽位有持久內容`）

純資料、可單測（`src/display/ui/hud-slots.js` 的 `slotVisibility(mode)`）：

| mode | 亮的持久槽位 |
|---|---|
| `free`（自由飛，v1.1-0 唯一模式）| StatusSlot, ModeSlot, AltBand, HomeSlot |
| `mission`（任務模式，v1.1-4 接）| + TaskSlot, CenterSlot |

> CenterSlot 的「事件 toast」是**瞬時 overlay**，不受 mode 持久顯示控制（任何模式撞機都要 toast）。持久顯示 map 只管「常駐」槽位。
> 空契約槽位（本輪的 TaskSlot）：DOM 存在、預設 hidden，等內容 setter 被呼叫才亮——後階段零改框架。

---

## 6. Remote 控制層契約

remote 兩前端共用同一控制協定（[`shared/protocol.js`](shared/protocol.js) `in`），每支手機自選 scheme（存 `tp_remote_scheme`，per device）：

| 區塊 | 簡單版（孩子）| 複雜版（大人，增操控感）|
|---|---|---|
| 油門 | 豎滑桿（不回彈）| 同 |
| 姿態 | 傾斜（重力投影）+ 姿態泡泡 | 同 + 迷你姿態儀 |
| 校正 | 校正歸零鈕 | 同 |
| 起落架 | 左拇指大鈕 | 同 |
| **context 動作鍵 slot** | 2 顆（預設 🔊喇叭 / 🛬降落輔助）| 同（可換）|
| 方向舵 rudder | — | 有（→ yaw，接 V3 側風 crab）|
| 襟翼 flaps | — | 有（分段 0..2）|
| 配平 trim | — | 有（pitch 偏置）|
| 迷你儀表 | — | 空速 / 高度 / 航向（走 `pstate` 擴充回傳）|

- **context 動作鍵＝可替換 slot**（`src/remote/context-keys.js`）：本輪預設「喇叭/降落輔助」，V2 換「開火/鎖定」、任務模式換任務動作——換 config 不改框架。
- **向後相容鐵律**：簡單版/舊 remote 只送 `{s,r,p,th,b}`；複雜版多送 `rudder/flaps/trim`。display 對缺欄位以中立值（0）處理 → 舊 remote 永遠還能飛（e2e 守）。
- 不動 `tilt.js` 重力投影（v0.2.x 真機調過的手感資產）。

---

## 7. 排版／字級

- 字體：`'PingFang TC', 'Noto Sans TC', system-ui, sans-serif`（沿用）。
- HUD 數字大而粗（`--hud-fz`/`--hud-fz-lg`）、高對比、帶 `--hud-shadow` 浮在 3D 上。
- 分屏半屏可讀性是真風險（v1.1-4 任務 UI 會放大檢驗）：半屏時 HUD 字級不縮、改精簡內容。
- emoji 當圖示（零資產成本、跨平台、童趣），與玩具櫃調性一致。

---

## 8. 不在本輪（避免 scope 膨脹）

- 任務/❤️/迫降/收集/慶祝的**內容**（只建空槽位契約）。
- 武器/航班/ATC 槽位內容（V2+）。
- 真實 voxel 美術精修（方向稿等級即可）。
