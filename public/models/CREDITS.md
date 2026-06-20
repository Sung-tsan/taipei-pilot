# 第三方 3D 模型素材出處與授權（V4 民航地面）

> 北極星：ROADMAP §11「voxel + low-poly 共存，匯入 GLB 須正規化（剝貼圖→flat＋重映色票）」。
> 本目錄的 GLB 在 runtime 由 `src/display/assets/` 的 normalize/fitToGround 管線載入並對齊玩具視覺。

| 檔案 | 用途 | 來源 | 授權 | 需標示 |
|------|------|------|------|--------|
| `a330.glb` | A330（廣體客機，clean-belly） | Poly Pizza [`/m/fzIXe2paBN9`](https://poly.pizza/m/fzIXe2paBN9)（"Airplane" Boeing 787，Poly by Google，~1100 tris） | **CC-BY 3.0** | **是** |
| `atr72.glb` | ATR-72（民航機，clean-belly） | Poly Pizza [`/m/1uXmHq-ELhz`](https://poly.pizza/m/1uXmHq-ELhz)（"Small plane"，Poly by Google，~254 tris） | **CC-BY 3.0** | **是** |
| `follow-me.glb` | 地面導航「跟我車」/ 地勤車 / pushback 拖車 | Kenney Car Kit 3.1（`sedan`） | **CC0 1.0** | 否（仍致謝） |
| `Textures/colormap.png` | 上面 Kenney 車的色票（GLB 相對外參，須一起 ship） | Kenney Car Kit 3.1 | **CC0 1.0** | 否 |
| `airliner.glb` | （**已停用**，原 ATR-72 代用；支柱烤進機身、飛行露輪 → 換成 `atr72.glb`） | Poly Pizza `/m/8ciDd9k8wha` | CC-BY 3.0 | — |

> 候選清單（含 ATR 螺旋槳版、F-16、T-34 GLB）見 `candidates/CANDIDATES.md`；目前 F-16/T-34C 維持手刻 voxel（保留旋槳動畫 + 雙人識別色）。

## ⚠️ 授權注意（待 Sung 拍板）
- **`a330.glb` / `atr72.glb` 皆 CC-BY 3.0，需標示**（見下致謝）。線上查無 CC0 客機（Poly Pizza/Quaternius 客機幾乎全是 Google Poly 的 CC-BY）。
- 兩件皆 **clean-belly（無外露支柱）**，解掉舊 `airliner.glb` 飛行露輪問題（Sung (b) 需求）。
- yaw/scale（機鼻朝向、大小）待 Sung 真機目視校正（plane-specs `a330.model.yaw` / `atr72.model.yaw`）。
- A330＝Boeing 787 外型代用、ATR-72＝小型客機外型代用——**外型代用、玩法不受影響**。

## 致謝
- "Airplane"（Boeing 787）— Poly by Google，CC-BY 3.0（https://poly.pizza/m/fzIXe2paBN9）。
- "Small plane" — Poly by Google，CC-BY 3.0（https://poly.pizza/m/1uXmHq-ELhz）。
- Kenney（kenney.nl）Car Kit — CC0 1.0。
