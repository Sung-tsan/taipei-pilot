# 測試 Baseline 與已知非問題（避免重跑 / 重查）

> 每個 handoff §0-PRE 要求「baseline 全綠才動工」。本檔記錄**當前綠燈基準**、**已修的坑**、以及
> **已知非問題（假性紅燈）**——下次 session 照表對照即可，不用重新調查同一件事或重跑驗證。

## 當前 baseline（最後更新 2026-06-13，含 v1.1-0 ~ v1.1-3）

| 檢查 | 指令 | 期望 |
|------|------|------|
| 型別 | `npm run typecheck` | 0 errors |
| 單元 | `npm test`（vitest） | **117 passed**（11 files；+missions） |
| 整合 | `npm run e2e`（playwright） | **10 passed**（connect ×8 + flight ×2） |

> JSDoc 眉角（已踩過）：全形 `）`/`。` 緊接 `@param` 會讓 tsc 解析不到 tag → implicit any。標點與 `@param` 間留空格。

> JSDoc 眉角（已踩過）：全形 `）` 緊接 `@param` 會讓 tsc 解析不到 tag → 報 implicit any。`）` 與 `@param` 間留一個空格。

三項全綠＝可動工。任一非預期紅燈 → 先比對下方「已知非問題」，不在表上才算真紅。

## 已修的坑（log，不要回退）

- **2026-06-13 e2e `connect.spec.js`「遊戲中被 OS 轉直」測試隔離洩漏**
  - 症狀：單獨跑過、整檔跑紅（`#full` 滿員畫面攔截 `#calDoneBtn`）。
  - 根因：server slot 狀態跨測試共用（單一 relay 進程）；前測佔住的 slot 留在 30s grace，後測沒重置就連線 → 拿到 `slots_full`。
  - 修法：在 `connect.spec.js` 加 `test.beforeEach`，用拋棄式 display 連線送 `{t:'reset'}` 並輪詢 `slotStatus` 全 empty 才放行 → 每測試乾淨起點，不依賴前測自我清理。**這是真 bug，已修，非假性紅燈。**

## 已知非問題 / 假性紅燈（不需修，不要重查重跑）

> 規則：被判定為「不是真 bug、不該動程式」的紅燈或缺測，記在這裡，附原因。下次看到照此略過。

- **HITL 手感閘不在自動化 baseline 內**：傾斜手感、iOS 權限、震動、雙真機分屏、crab/協調轉彎等「手感類」驗收只能真機由 Sung 親驗（鐵律 2，不可 proxy）。自動化測試**沒有**這些並非紅燈——`connect.spec.js` 開頭註解已言明「傾斜手感、iOS 權限、震動只能真機驗」。不要為了補這些而寫假測試。
- （目前自動化套件內無其他假性紅燈。新發現再往下加。）
