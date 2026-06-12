# 🛫 台北小飛官（Taipei Pilot）

電腦大螢幕 + 手機遙控器的 voxel 飛行遊戲：兩個孩子各拿一支手機當操縱桿，
從松山機場起飛，在半徑 10 公里的點陣台北上空自由飛——找 101、沿基隆河飛、回跑道降落。

一個爸爸做給孩子的週末專案。MIT 授權，歡迎拿去玩、改、給你家小孩開。

## 怎麼玩（爸爸看這段就夠）

需要 [Node.js](https://nodejs.org)（18+）。

```bash
git clone https://github.com/Sung-tsan/taipei-pilot.git
cd taipei-pilot
npm install        # 第一次
npm start          # build + 起 server（電腦和手機要同一個 Wi-Fi）
```

1. 電腦瀏覽器開 terminal 印出的網址（`https://<IP>:8443/`）。
   **憑證是自簽的**：警告頁選「進階 → 仍要前往」（每台裝置一次）。
2. 手機掃螢幕上的 QR → 一樣踩一次憑證警告 → 按「🛫 開始操控」
   （iPhone 會跳「要允許取得動作與方向取用權限嗎？」→ **允許**；
   不小心按到「不允許」要關掉分頁重掃 QR）。
3. **先校準**：把手機**橫拿**、像端遙控器一樣雙手握兩端、面朝上 45°，
   泡泡會跟著手動，擺好按「✅ 就是這個姿勢！」= 設為中立位。
4. 左右傾 = 轉彎、前後傾 = 抬頭低頭；**右手**豎滑桿 = 油門、
   **左手**大按鈕 = 起落架收放（收輪飛比較快；沒放輪不能落地，會被提醒）。
   飛到一半覺得飄，按「🎯 校正歸零」隨時重校。
5. 推滿油門 → 自動離地。第二支手機掃同一個 QR = 藍機，螢幕自動分屏。
6. 撞到樓會「碰！」彈開（Android 手機會震動、iPhone 閃紅框），不會墜機。
   回跑道輕輕降落有掌聲 👏。
7. 迷航不用怕：飛離機場 900m 後，畫面上方會出現**回家箭頭**
   （指向松山機場＋距離），跑道上也有一根金色光柱，多遠都看得到。

> **延遲與連線**：全程走家裡 Wi-Fi 的端到端連線（手機 → 路由器 → 電腦），
> **不經任何雲端**；控制訊號 60Hz，整鏈延遲 ~35–55ms，體感即時。
> 不用藍牙是因為手機瀏覽器（尤其 iOS Safari）不支援 Web Bluetooth，
> 而且 BLE 傳輸間隔並不比 LAN Wi-Fi 快。

鍵盤也能開（開發/沒手機時）：方向鍵 = 操縱桿、W/S = 油門、Space = 滿油門、X = 收油門、**G = 起落架**。

## 開發

```bash
npm run dev        # vite HMR (:5173) + ws relay (:8443) 同時起
npm test           # vitest（飛行模型/relay/協定/城市生成）
npm run typecheck  # tsc --noEmit（JSDoc 型別）
npm run e2e        # Playwright：1 display + 2 remote 真瀏覽器整合
node scripts/visual-check.js   # headless 起飛截圖到 /tmp/tp-*.png
```

- `?debug=1`：fps / draw calls / P1 狀態面板
- `?fake2=1`：假藍機在市區盤旋（雙視口壓測）
- `/dev-viewer.html`：voxel 模型轉盤檢視器

## 架構速覽

```
server/    https(自簽) + 靜態檔 + ws relay（啞中繼，slot 0/1 + token 重連 + 30s grace）
shared/    protocol.js（訊息協定，三端共用）+ constants.js
src/remote/   手機遙控器：tilt(權限/校正/軸向) throttle feedback(震動/閃屏) net
src/display/  電腦主畫面：flight/(街機飛行模型+碰撞) scene/(機場/三河/地標/程序化街區)
              planes/ render/(追焦相機/分屏/名牌) input/(鍵盤) audio.js(全合成音效)
src/voxel/    build.js(box清單→merged geometry) + models/(T-34C、7 個地標)
```

設計原則：模擬全在 display 端（手機是無狀態搖桿）；飛行手感調參集中在
`flight-model.js` 的 `P` 常數表；城市/地標全參數化（換空域 = 換 `taipei.js` 的清單）。

## 已知限制

- iPhone 沒有震動（iOS Safari 不支援 `navigator.vibrate`）→ 改全螢幕閃紅框
- iOS 拒絕動作權限後無法再次詢問 → 關分頁重掃 QR
- 第一版 = 自由飛（無任務/計分），任務系統見 spec 未來擴充
