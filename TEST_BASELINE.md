# 測試 Baseline 與已知非問題（避免重跑 / 重查）

> 每個 handoff §0-PRE 要求「baseline 全綠才動工」。本檔記錄**當前綠燈基準**、**已修的坑**、以及
> **已知非問題（假性紅燈）**——下次 session 照表對照即可，不用重新調查同一件事或重跑驗證。

## 當前 baseline（最後更新 2026-06-14，含 V2 全 6 子階段[已 tag v2.0] + V3 v3.0-1 天氣核心）

| 檢查 | 指令 | 期望 |
|------|------|------|
| 型別 | `npm run typecheck` | 0 errors |
| 單元 | `npm test`（vitest） | **291 passed**（25 files；+weapons/enemy-ai/race/balloon/dogfight/minimap/missile/plane-collision/plane-specs/context-keys） |
| 整合 | `npm run e2e`（playwright） | **21 passed**（connect ×11 + flight ×10；含 overlap×3 + RWD×2 + 空戰/F-16/PvP/1v1/競速 regression） |

> JSDoc 眉角（已踩過）：全形 `）`/`。` 緊接 `@param` 會讓 tsc 解析不到 tag → implicit any。標點與 `@param` 間留空格。

> JSDoc 眉角（已踩過）：全形 `）` 緊接 `@param` 會讓 tsc 解析不到 tag → 報 implicit any。`）` 與 `@param` 間留一個空格。

三項全綠＝可動工。任一非預期紅燈 → 先比對下方「已知非問題」，不在表上才算真紅。

## 已修的坑（log，不要回退）

- **2026-06-13 e2e `connect.spec.js`「遊戲中被 OS 轉直」測試隔離洩漏**
  - 症狀：單獨跑過、整檔跑紅（`#full` 滿員畫面攔截 `#calDoneBtn`）。
  - 根因：server slot 狀態跨測試共用（單一 relay 進程）；前測佔住的 slot 留在 30s grace，後測沒重置就連線 → 拿到 `slots_full`。
  - 修法：在 `connect.spec.js` 加 `test.beforeEach`，用拋棄式 display 連線送 `{t:'reset'}` 並輪詢 `slotStatus` 全 empty 才放行 → 每測試乾淨起點，不依賴前測自我清理。**這是真 bug，已修，非假性紅燈。**

- **2026-06-13 左上 HUD 重疊（HITL Sung 截圖回報）**
  - 症狀：左上角 `#topBtns`（⚙設定/🎯任務模式/📖收集簿）與 StatusSlot 後果 badge（🛡️安全/❤️/🔥真實）整個疊在一起。
  - 根因：v1.1-0 的全域控制列 `#topBtns`（`top:16 left:16`）與 v1.1-1 的 `.status-slot`（`top/left: var(--hud-pad)=16`）兩個 sub-stage 各自釘左上同一點，沒人知道對方。
  - 修法：`.status-slot` 下移到 `top: calc(var(--hud-pad)+54px)`（讓出按鈕列高 46+間距），保留設計 §5「StatusSlot=左上」契約。加 e2e `flight.spec.js`「overlap regression」：驅動紅機 → 比對 `#topBtns` 與 `.status-slot` 邊界框不相交（已驗：還原 CSS 會紅）。

- **2026-06-13 小手機橫拿操控面板顯示不全（HITL Sung iPhone 12 回報）**
  - 症狀：iPhone 12 等小手機橫拿，`remote.html` 操控面板底部（喇叭/降落輔助鍵）被裁切、放不下。
  - 根因：`.screen { inset:0 }` 在 iOS Safari 用「大 viewport」高（工具列藏起來的高）→ 置中內容底部被工具列蓋掉；且姿態泡泡固定 `min(34vh,230)` + ctx 鍵固定 min-height + grid `1fr` 不可縮，短螢幕擠爆。
  - 修法：①容器 `height:100dvh`（可視高）②grid 中列 `minmax(0,1fr)` + 容器/欄 `min-height:0` 可縮 ③`@media (max-height:430px)` 短橫螢幕收緊泡泡/按鍵/間距。加 e2e `connect.spec.js`「RWD regression」simple/complex 各一（已驗：還原 remote.html 會紅）。
  - **註**：Chromium 無 iOS 動態工具列，無法重現 inset:0 落差 → 測試用「刻意偏矮」橫螢幕高（simple 250 / complex 330）當判別器，非真機實際可視高（iPhone 12 橫拿 ~364，有餘裕）。真機最終手感仍 HITL。

## 已知非問題 / 假性紅燈（不需修，不要重查重跑）

> 規則：被判定為「不是真 bug、不該動程式」的紅燈或缺測，記在這裡，附原因。下次看到照此略過。

- **HITL 手感閘不在自動化 baseline 內**：傾斜手感、iOS 權限、震動、雙真機分屏、crab/協調轉彎等「手感類」驗收只能真機由 Sung 親驗（鐵律 2，不可 proxy）。自動化測試**沒有**這些並非紅燈——`connect.spec.js` 開頭註解已言明「傾斜手感、iOS 權限、震動只能真機驗」。不要為了補這些而寫假測試。
- **Playwright 瀏覽器啟動逾時（環境 flake，非程式問題）**：機器資源吃緊時偶見 `browserType.launch: Timeout 180000ms exceeded`（chromium-headless-shell 啟不起來），整套 e2e 跑很久（曾 16min vs 正常 ~1.5min）且首測（connect 第一個）紅。**這是環境/資源 flake，不是測試或程式 bug。** 處置：清掉殘留 server/瀏覽器程序（`lsof -ti:8443 | xargs kill -9`、`pkill -f chrome-headless-shell`）後重跑即綠，不要追這個「紅」。
- （目前自動化套件內無其他假性紅燈。新發現再往下加。）
