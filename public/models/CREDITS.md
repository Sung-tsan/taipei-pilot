# 第三方 3D 模型素材出處與授權（V4 民航地面）

> 北極星：ROADMAP §11「voxel + low-poly 共存，匯入 GLB 須正規化（剝貼圖→flat＋重映色票）」。
> 本目錄的 GLB 在 runtime 由 `src/display/assets/` 的 normalize/fitToGround 管線載入並對齊玩具視覺。

| 檔案 | 用途 | 來源 | 授權 | 需標示 |
|------|------|------|------|--------|
| `airliner.glb` | ATR-72（通用低面數客機**替代**，V4 民航機） | Poly Pizza `/m/8ciDd9k8wha`（原 Poly by Google，~1292 tris） | **CC-BY 3.0** | **是** |
| `follow-me.glb` | 地面導航「跟我車」 | Kenney Car Kit 3.1（`sedan`） | **CC0 1.0** | 否（仍致謝） |

## ⚠️ 授權注意（待 Sung 拍板）
- **`airliner.glb` 為 CC-BY 3.0，需標示**（"Airplane" by Poly by Google，CC-BY 3.0）。
  - 線上 CC0 來源（Poly Pizza / Quaternius）**查無客運客機**：客機幾乎都是 Google Poly 的 CC-BY；
    CC0 飛行物只有太空船/直升機/飛船（不合用）。故 V4 暫用 CC-BY 客機 + 標示。
  - **出貨前若要維持純 CC0**：丟一個 CC0 客機 GLB 進 `public/models/airliner.glb` 即一行替換（管線不變）。
- ATR-72 是雙螺旋槳支線客機；本替代件為噴射客機外型——**外型代用、玩法(滑行/靠橋/地面作業)不受影響**。

## 致謝
- "Airplane" — Poly by Google，CC-BY 3.0（https://poly.pizza/m/8ciDd9k8wha）。
- Kenney（kenney.nl）Car Kit — CC0 1.0。
