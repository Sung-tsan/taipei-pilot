# 🪄 V6 — 終章打磨（Polish Backlog）

> **本檔是 V6「終章打磨」環節的滾動 backlog 與 canonical 定義。**
> V6 ＝ V1→V5 北極星全達成**之後**的一輪**全局**打磨——把增量建起來的 5 個版本收成「一件作品」。
> 與各版本自己的 Polish 子階段不同：那是「打磨那一版」，V6 是「打磨**整個遊戲**的細節、一致性與缺口」。
> 北極星：[`ROADMAP.md`](ROADMAP.md)。Wave 1 五款的對應前例＝Stage G 整合 polish + Stage K 質感打磨。

---

## ⚙️ Harvest 機制（dev session 請照做）

**每當你（實作 session）記下一個「明示取捨（非降級）／資產缺口／Phase-2 留待」，就順手 append 到下面對應維度。** 這樣到 V5 實作完，V6 清單已自己收齊——不必結尾才從頭翻 log。

Append 格式（一行）：

```
- [ ] <一句話項目> — <出處 vXX-X / commit> — <為何延 / 補完代價估>
```

- 完成的項目打勾 `- [x]`、保留為「最終決定不做」的標 `~~刪除線~~ + 理由`。
- 大項可加子彈點。

## 拆解時機

- **現在＝立框架 + 種子**（下方 9 維度）。
- **V6 詳細 handoff 拆解** ＝ **V5 實作完、backlog 收齊後**，照維度拆（near-term 框架、far-term 具體；backlog 還會長）。
- 拆解照同一套節奏：待拍板收斂 → 一次交付 handoff → 每階段本地全綠 + Sung 雙真機 HITL。

---

## 9 維度 backlog

### 1. 資產補完（CC0 取樣 SFX / art 缺口）
- [ ] 擬真爆炸真·取樣 clip 待 CC0 drop — V2 音效 — 合成已逼近，待 CC0 音效資產
- [ ] ATR-72 換純 CC0 客機 GLB（目前 **CC-BY 3.0** 通用噴射客機代用螺旋槳機）— v4.0-1 — 線上查無 CC0 客機（見 public/models/CREDITS.md）；丟 CC0 GLB 進 `public/models/airliner.glb` 即一行替換

### 2. 明示取捨回收（逐項決定：補完 or 接受為最終）
- [ ] 真實「出局」正式版（回合淘汰／觀戰）— v2.0-3/2.0-4 — 暫以長暫退重生呈現
- [ ] 競速完賽收集簿 — v2.1-1 — 暫以慶祝呈現、未寫收集簿（輕度簡化）
- [ ] 移動車流 / 遠方環境機 — v3.0-3 — bonus 未做（perf 預算，不擋版本）
- [ ] smoking 狀態降性能 — v1.1-1 — 暫僅視覺+警告、不降性能
- [ ] 手動 pushback（真實模式 stretch）— v4.1-1 — 暫全自動引導
- [ ] 空對地紅區進 airspace.json schema — v2.0-4 — 暫 demo hardcoded
- [ ] 敵機編隊維持相位 — V3 五修 — 暫用 spawn 編隊+既有追擊散開達成
- [ ] GLB 民航機 per-slot 識別色（紅/藍機）— v4.0-1 — GLB 用 livery 貼圖、暫無 accent，雙人同機外觀相同

### 3. 跨版本一致性（HUD / 音效個性 / Tactile / voxel×CC0 融合）
- [ ] HUD 槽位跨所有模式（free/mission/dogfight/race/民航/航網）一致性檢查
- [ ] 音效個性 tone ladder 一致（教練卡通→戰鬥擬真→民航仿真）
- [ ] Tactile / haptic 政策跨版本一致
- [ ] voxel × CC0 low-poly 色票重映一致（各機隊/機場 GLB 進來後總檢，§11 主槓桿）
- [ ] ATR GLB 機鼻朝向 yaw + 降飽和/偏暖強度 HITL 校正 — v4.0-1 — yaw=0、saturation/warm 為預設值，待真機目視微調（glb-model.js / plane-specs atr72.model.yaw）

### 4. 手感終調（旋鈕一次跟孩子調）
- [ ] 側風 / 亂流幅度 + 暈（v3.0-2，幅度先弱待調）
- [ ] 敵機難度曲線 / adaptive（v2.0-4，HITL 已調一輪）
- [ ] 鎖定強度 / 追蹤（v2.0-2）
- [ ] 油量曲線（v5.0-2）

### 5. 全局效能（最壞場景）
- [ ] 空戰 + 天氣 + 生活感 + 多機場疊加 perf（雙視口 60fps、draws<300/視口 under worst case）

### 6. 教育內容總校（DRAFT 最終校稿）
- [ ] 各版 facts / 任務 prompt / 天氣任務 / ATC bank 最終校稿總清（適齡 + 正確）

### 7. 首次體驗 onboarding
- [ ] 6 歲第一次開不被 5 版功能淹沒（模式選單 / 解鎖呈現 / 教學瞬間 holistic）

### 8. 設定總成
- [ ] 後果軸 / ❤️ 上限 / 鏡頭晃 / remote 簡單複雜 / 日夜 / 天氣… 旋鈕整合成連貫一頁

### 9. 質感 Phase-2（DESIGN_WEB_UI）
- [ ] 入場 transition
- [ ] 各模式表面層次
- [ ] 微互動（滾筒翻特技手感等）
- [ ] GLB 民航機起落架收放動畫 — v4.0-1 — voxel 機有 scale 收放、GLB 機暫靜態（飛行速度上限仍由 flight-model gearDown 生效）
- [ ] （對應 DESIGN_CRAFT_GUIDE Phase-2 backlog 的 web 版）

---

## 工法基準
V6 照 Fable 完整度線 + kids-game-pipeline（見 ROADMAP §9 工法基準）：每階段 DoD + 本地三閘全綠 + Sung 雙真機 HITL（不可 proxy）+ 決策進 ROADMAP §7。美術引用 §11。
