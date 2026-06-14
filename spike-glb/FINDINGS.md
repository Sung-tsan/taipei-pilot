# GLB × voxel 共存 spike — findings（2026-06-14）

> 目的：驗證 §11 的「voxel + low-poly 共存」是否成立，並定出 v4.0 要用的 scale / 正規化標準。
> 做法：拋棄式 spike（`spike-glb/`，不碰 `src/`），重用遊戲真實 `world.js`（Hemi+Directional 燈、霧 `#bfe0ef`、草地 `#9dbf7b`），把真實 voxel `t34c` 與 Kenney CC0 Car Kit（sedan/firetruck/van）並排，`GLTFLoader` 載入 + `normalize()`。截圖：`spike-glb/out/coexist.png`。
> 素材：Kenney Car Kit 3.1（CC0），`spike-glb/assets/`。

## 結論：共存成立 ✅（最終美感拍板 = Sung HITL）
Kenney low-poly 車與 voxel 飛機在同一套燈光/草地下**讀起來是同一個玩具世界**——同屬 flat-shaded、簡單造型；voxel 較方、low-poly 較圓，差異讀作「不同物件」而非「不同畫風」。

## 四個實證發現（餵 v4.0）
1. **材質正規化幾乎免費**：`MeshStandard → MeshLambert + flatShading` 對 Kenney「原樣 vs 正規化」幾乎看不出差（②③ 一模一樣）——因為 Kenney 模型本就極扁平、無 PBR 反光、無 env map。**Lambert 化是保險（吃同一套燈光），不是重點。**
2. **真正的正規化槓桿＝重映色票**：Kenney 預設色偏**飽和、對比較高**（亮紅/亮藍），比本款「暖色低對比、±5–8% 明度差」(DESIGN_CRAFT_GUIDE) 略跳。**把匯入色降飽和/偏暖，是共存最該做的一步。**
3. **Scale＝量 bbox→公尺，逐型別定，別用全域倍率**：Kenney Car Kit 以**次公尺單位**建模——sedan 最長邊 2.55u→×1.76 到 4.5m；firetruck ×2.35→8m；van ×1.82→5m。`fitToGround(root, 目標公尺)` 自動量 bbox 縮放（見 `main.js`），坐回地面 y=0。
4. **管線細節（踩到才知道）**：
   - Kenney「GLB format」**不自帶貼圖**，相對參照外部 `Textures/colormap.png`（一張 12K 色票 atlas，全 kit 共用）。→ v4.0 三選一：**(a) 連同 colormap 一起 ship**（最省）／(b) 重匯出成 embedded GLB／(c) 把 atlas 烤成 vertex colors（最貼本款 `voxelMaterial` 路線、可丟貼圖）。
   - `GLTFLoader`（`three/addons`）開箱即用；此 kit **無 Draco**、**零新 npm 套件**（§11.1 確認）。

## 可重用產物
- `normalize()` + `fitToGround()`：`spike-glb/main.js`——v4.0 import recipe 的種子。
- scale 對照（暫定目標公尺）：sedan 4.5 / van 5 / firetruck 8。

## v4.0 待辦（把 spike 變正式管線時）
- [ ] 加「色票重映」一步（降飽和/偏暖對齊本款家族）——本 spike 還沒做，是最大美感缺口。
- [ ] 定 texture 策略：ship atlas vs 烤 vertex colors（建議烤 → 與既有 voxel 同走 `MeshLambert(vertexColors)`，零貼圖）。
- [ ] 鎖單一家族＝Kenney（本 spike 證實貼合）；同 kit 取地勤車（firetruck/van/truck/tractor 已在 Car Kit）。
- [x] **Sung HITL 給過（2026-06-14）** — 共存美感通過；v4.0 只剩「色票重映」這個 polish。

## 去留
**保留作 v4.0 種子（Sung 2026-06-14）**。`spike-glb/` 未碰 `src/`；含 Kenney CC0 素材＋License、可重用 `normalize()`/`fitToGround()` recipe、findings 與截圖。v4.0 直接從這裡長。
