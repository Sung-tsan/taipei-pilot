# 🪄 V6 — 終章打磨（Polish Backlog）

> **本檔是 V6「終章打磨」環節的滾動 backlog 與 canonical 定義。**
> V6 ＝ V1→V5 北極星全達成**之後**的一輪**全局**打磨——把增量建起來的 5 個版本收成「一件作品」。
> 與各版本自己的 Polish 子階段不同：那是「打磨那一版」，V6 是「打磨**整個遊戲**的細節、一致性與缺口」。
> 北極星：[`ROADMAP.md`](ROADMAP.md)。Wave 1 五款的對應前例＝Stage G 整合 polish + Stage K 質感打磨。

---

## ⚙️ Harvest 機制（dev session 請照做）

**每當你（實作 session）記下一個「明示取捨（非降級）／資產缺口／Phase-2 留待／代碼可精簡處（長太大·可抽·重複·死碼）」，就順手 append 到下面對應維度。** 這樣到 V5 實作完，V6 清單已自己收齊——不必結尾才從頭翻 log。

Append 格式（一行）：

```
- [ ] <一句話項目> — <出處 vXX-X / commit> — <為何延 / 補完代價估>
```

- 完成的項目打勾 `- [x]`、保留為「最終決定不做」的標 `~~刪除線~~ + 理由`。
- 大項可加子彈點。

## 拆解時機

- **現在＝立框架 + 種子**（下方 10 維度）。
- **V6 詳細 handoff 拆解** ＝ **V5 實作完、backlog 收齊後**，照維度拆（near-term 框架、far-term 具體；backlog 還會長）。
- 拆解照同一套節奏：待拍板收斂 → 一次交付 handoff → 每階段本地全綠 + Sung 雙真機 HITL。

---

## 10 維度 backlog

### 1. 資產補完（CC0 取樣 SFX / art 缺口）
- [ ] 擬真爆炸真·取樣 clip 待 CC0 drop — V2 音效 — 合成已逼近，待 CC0 音效資產
- [ ] ATC 真語音 clip / 預生成 TTS — v4.1-2 — 目前＝文字 + 合成無線電 squelch；真語音留 V5（交付明訂）
- [ ] ATR-72 換純 CC0 客機 GLB（目前 **CC-BY 3.0** 通用噴射客機代用螺旋槳機）— v4.0-1 — 線上查無 CC0 客機（見 public/models/CREDITS.md）；丟 CC0 GLB 進 `public/models/airliner.glb` 即一行替換

### 2. 明示取捨回收（逐項決定：補完 or 接受為最終）
- [ ] 起飛排序可見的「前面那架」環境離場機 — v4.1-1 — 排序為計時 hold-short + ATC（功能完整）；可見機需 transient 環境機 entity + scripted 起飛（排隊感目前靠 ATC）
- [ ] 登機走動 voxel 乘客小人 — v4.1-1 — 乘客目前＝ATC 計數器 N/72（加油/行李車是實體）
- [ ] 專屬地勤車模型（拖車/油罐/行李車）— v4.1-1 — 暫重用 Kenney follow-me sedan 造型
- [ ] 4 機型候選（A330/ATR/F16/T34 clean-belly GLB）換入 plane-specs — v4 — 已 sourcing `public/models/candidates/`，yaw/scale 待 HITL 校
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
- [ ] GLB 降飽和/偏暖強度 + 跟我車朝向微調 — v4.0-1 — ATR 機鼻朝向已修(yaw=π，HITL 2026-06-16)；saturation/warm 預設值堪用、跟我車 yaw 待真機確認

### 4. 手感終調（旋鈕一次跟孩子調）
- [ ] **重力/失速幅度**（v4 能量模型，2026-06-18）— `GRAVITY`(俯衝vs爬升落差)／`STALL_GAP`(失速門檻=vGlide−gap)／`STALL_PITCH`(失速下垂)／`ACCEL`(=每型引擎推力) 為合理初值，待真機調「俯衝爽度 vs 失速懲罰對 6 歲是否太兇」；放手滑翔目前穩在 ~vGlide+4（可調 GLIDE_PITCH/ACCEL）
- [ ] 側風 / 亂流幅度 + 暈（v3.0-2，幅度先弱待調）
- [ ] 敵機難度曲線 / adaptive（v2.0-4，HITL 已調一輪）
- [ ] 鎖定強度 / 追蹤（v2.0-2）
- [ ] 油量曲線（v5.0-2）

### 5. 全局效能（最壞場景）
- [ ] 空戰 + 天氣 + 生活感 + 多機場疊加 perf（雙視口 60fps、draws<300/視口 under worst case）

### 6. 教育內容總校（DRAFT 最終校稿）
- [ ] 各版 facts / 任務 prompt / 天氣任務 / ATC bank 最終校稿總清（適齡 + 正確）
- [ ] ATC phraseology DRAFT 校稿（`atc-phraseology.js` ATC_DRAFT=true + 空中走廊用語）— v4.1-2 — 擬真+6歲懂，讀給孩子校

### 7. 首次體驗 onboarding
- [ ] 6 歲第一次開不被 5 版功能淹沒（模式選單 / 解鎖呈現 / 教學瞬間 holistic）

### 8. 設定總成
- [ ] 後果軸 / ❤️ 上限 / 鏡頭晃 / remote 簡單複雜 / 日夜 / 天氣… 旋鈕整合成連貫一頁

### 9. 質感 Phase-2（DESIGN_WEB_UI）
- [ ] 入場 transition
- [ ] 各模式表面層次
- [ ] 微互動（滾筒翻特技手感等）
- [ ] GLB 民航機完整起落架收放（含支柱）— v4.0-1 — 此 CC-BY 模型 3 根支柱烤進機身網格(Airplane1 單一 mesh)、無法單獨隱藏；目前**恆放下**(gearDown 速度上限仍生效)。真收放需 separable-gear 或無支柱的模型（連動「換純 CC0 客機 GLB」項）
- [ ] （對應 DESIGN_CRAFT_GUIDE Phase-2 backlog 的 web 版）

### 10. 代碼精緻度 / 優化精簡（holistic code review）
> V6 對**全 codebase** 跑一次整體 review（review agents 全掃／`/simplify` 逐 diff；`/code-review` 適合逐 PR）：找重複、死碼、過度複雜、漏掉的重用、可精簡/可優化處。
> **🔴 鐵律：重構不可破壞手感位元**——這款手感是核心資產，refactor 必須 tests 全綠 + Sung HITL 手感不變（沿用 dev「純加法＋中立預設、位元不變」紀律）。
- [ ] `src/display/main.js`（**1053 行 god-file**，5 版整合 glue 累積）→ 評估解耦（per-mode controllers／weather·combat·ground glue 抽出）— 掃描 2026-06-15；**待 feature-complete 再拆（現拆白工＋動手感）**
- [ ] `src/display/combat/dogfight.js`（581 行）→ 戰鬥編排，評估可拆
- [ ] 全 codebase 重複/死碼/過度複雜掃描（feature-complete 後）
- [ ] perf 熱點優化（接維度 5 全局效能）
- ✅ 現況健康讀數（2026-06-15 掃）：8490 LOC、tests 4250（~0.5 比，健康）、**0 TODO/FIXME**（取捨外記紀律佳）；唯一明顯目標＝main.js god-file

---

## 工法基準
V6 照 Fable 完整度線 + kids-game-pipeline（見 ROADMAP §9 工法基準）：每階段 DoD + 本地三閘全綠 + Sung 雙真機 HITL（不可 proxy）+ 決策進 ROADMAP §7。美術引用 §11。
