# 玩具櫃質感工法指南（Quiet Tactile Craft）

> 2026-06-11 定稿。源於 Grok design review（經 codebase 查證後採納），Stage K Phase 1 落地。
> **新遊戲從這裡開始**：開發任何新遊戲時，本指南是 UI/互動的起跑線，handoff 直接引用本檔，不要從單色填滿+裸 GestureDetector 重新開始。

---

## 1. 定調

**Quiet Tactile Craft**：好的木頭玩具、厚實紙板遊戲、蒙特梭利教具——安靜但極有質感。

紅線（產品憲法，不可違反）：
- 低刺激、暖色、低對比 —— 層次做在 **±5-8% 明度差**內
- 無多巴胺鉤子 —— 慶祝不能變連續劇
- 精緻靠「層次 + 誠實回饋」，**不靠特效**（禁：粒子雨、Lottie、3D、閃亮、noise shader）
- 動畫 150–400ms，短而有性格
- 零新依賴（不引入 flutter_animate 之類；原語自己封裝）

## 2. 已落地的原語（新遊戲直接用，不要重造）

| 原語 | 位置 | 用途 |
|---|---|---|
| `TactilePress` | `core/interaction/tactile.dart` | **所有可點元件的標準包裝**：按下 0.97 縮放 + 8% 加暗 + light haptic，放開 overshoot 回彈。取代裸 GestureDetector/InkWell |
| `Settle` | 同上 | 「著地/吸入」單次動畫（四子棋落子感的模式化）：放置成功、揭曉卡、收集時刻用 |
| `Tactile.tap()/success()/error()` | 同上 | **haptic 三級政策唯一入口**（輕點 light / 重要成功 medium / 錯誤 heavy）。不要直呼 HapticFeedback |
| `K.gentle/playful/settle/calmEase` | `core/design/tokens.dart` | motion 語言（280ms / 380ms / easeOutBack / easeOutCubic）|
| `K.pressScale/pressDarken` | 同上 | 按壓常數 |
| `K.shadowLifted` | 同上 | 雙層陰影（貼地軟影 + 接觸影），取代單層的「平」|
| `K.surfaceHighlight/surfaceShade` | 同上 | 多層表面的高光/收暗 |

## 3. 新遊戲 UI 檢核清單（寫 handoff 時照抄進 DoD）

- [ ] 所有可點元件用 `TactilePress`（含 borderRadius 對齊；鎖定態用 `enabled: false`）
- [ ] 主要容器/卡片用**多層表面**：底色 + 左上光源極淡漸層 + 深一階描邊 + 內高光邊 + `shadowLifted`（範本：`launcher/game_card.dart`）
- [ ] 答對/放對 → `Tactile.success()`；錯誤/重大狀態 → `Tactile.error()`（溫和型錯誤如 quiz 再想想可不給）
- [ ] 放置/揭曉/收集時刻用 `Settle`
- [ ] 拖曳元件要有 lift（拿起 scale ~1.06 + `Tactile.tap()`）
- [ ] 動畫 timing 用 `K.gentle/playful` + `K.settle/calmEase`，不要自創 ms 數
- [ ] 高頻操作元件（踏板類）按壓形變要更明顯（~0.93）
- [ ] 每城/每關變動的視覺值放 data 不放 code（B1，原有紀律）

## 4. 驗證方法（HITL 標準，源自 Grok review）

1. **拇指連點 20 次**：每一下都要有「這東西真的被我按到了」的形變+震動+回彈
2. **給 6 歲孩子摸**：觀察他會不會不自覺多點兩下「試試看有沒有反應」
3. **關掉音效只看畫面**：仍然覺得「有東西在動、有回應」才及格

## 5. Grok review 採納紀錄（查證結論）

採納：tokens-first、Tactile/Settle 原語化、haptic 三級政策、GameCard 多層表面、四子棋落子感模式化、驗證三法。
剔除（含原因）：noise/BackdropFilter shader（效能風險+與低刺激微衝突）、flutter_animate 依賴（零依賴紀律，自封裝 170 行足夠）、kDebugMode haptic 開關（要開關該放家長設定）、果汁攤（不存在的遊戲，幻覺）、IndexCard 手作斜度（早已實作）。
教訓：外部 AI 的 review 八成中肯也要逐條對 code 查證再採納。

## 6. Phase 2 backlog（視 HITL 回饋再開）

- 入場 transition：「從 launcher 卡片長大」進入遊戲（Hero / matched scale+fade）
- 各遊戲主要容器表面層次升級（detective_board / map_board / board_frame；四子棋洞的深度感、世界拼圖紙緣 bevel）
- 四子棋/斜吃棋欄位**局部**按壓回饋（不是全卡縮放）
- 教學/慶祝瞬間 staggered 進場 + 微 vignette
- 一致性 audit：六款全部跑一遍第 3 節檢核清單（目前只套了重點元件）

## 7. 測試備忘

- 縮放斷言**不可用** `getMaxScaleOnAxis()`（縮小時 z 軸 =1 會蓋過），讀 `transform.entry(0, 0)`
- TactilePress 按住測試：startGesture 後要 `pump(duration)` + 再 `pump()` 一幀讓 setState 生效
