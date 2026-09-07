# 第三方 3D 模型素材出處與授權（V4 民航地面）

> 北極星：ROADMAP §11「voxel + low-poly 共存，匯入 GLB 須正規化（剝貼圖→flat＋重映色票）」。
> 本目錄的 GLB 在 runtime 由 `src/display/assets/` 的 normalize/fitToGround 管線載入並對齊玩具視覺。

| 檔案 | 用途 | 來源 | 授權 | 需標示 |
|------|------|------|------|--------|
| `a330.glb` | A330（廣體客機，clean-belly） | OpenGameArt ["Jumbo Jet, Wide Body"](https://opengameart.org/content/jumbo-jetwide-body) by NuclearOsmosis（OBJ→GLB，~3176 tris；雙發寬體、無外露輪） | **CC0 1.0** | 否（仍致謝） |
| `atr72.glb` | ATR-72（民航機，clean-belly） | Poly Pizza [`/m/1uXmHq-ELhz`](https://poly.pizza/m/1uXmHq-ELhz)（"Small plane"，Poly by Google，~254 tris） | **CC-BY 3.0** | **是** |
| `follow-me.glb` | 地面導航「跟我車」/ 地勤車 / pushback 拖車 | Kenney Car Kit 3.1（`sedan`） | **CC0 1.0** | 否（仍致謝） |
| `Textures/colormap.png` | 上面 Kenney 車的色票（GLB 相對外參，須一起 ship） | Kenney Car Kit 3.1 | **CC0 1.0** | 否 |
| `airliner.glb` | （**已停用**，原 ATR-72 代用；支柱烤進機身、飛行露輪 → 換成 `atr72.glb`） | Poly Pizza `/m/8ciDd9k8wha` | CC-BY 3.0 | — |

> 候選清單（含 ATR 螺旋槳版、F-16、T-34 GLB）見 `candidates/CANDIDATES.md`；目前 F-16/T-34C 維持手刻 voxel（保留旋槳動畫 + 雙人識別色）。

## ⚠️ 授權注意（待 Sung 拍板）
- **`atr72.glb` 為 CC-BY 3.0，需標示**（見下致謝）。`a330.glb`（P0-3）改為 **CC0**（OpenGameArt Jumbo Jet）。
- A330 / ATR 皆 **clean-belly（無外露支柱）**；A330 疊參數化 voxel 假輪（無 gearNodes）。
- yaw/scale 待 Sung 真機目視校正（plane-specs `a330.model.yaw` / `atr72.model.yaw`）。
- A330＝寬體雙發代用、ATR-72＝小型客機外型代用——**外型代用、玩法不受影響**。

## 致謝
- "Jumbo Jet, Wide Body" — NuclearOsmosis，CC0 1.0（https://opengameart.org/content/jumbo-jetwide-body）；P0-3 轉 GLB 入庫為 `a330.glb`。
- "Small plane" — Poly by Google，CC-BY 3.0（https://poly.pizza/m/1uXmHq-ELhz）。
- Kenney（kenney.nl）Car Kit — CC0 1.0。
- （退役）"Airplane"（Boeing 787）— Poly by Google，CC-BY 3.0（https://poly.pizza/m/fzIXe2paBN9）；備份 `candidates/a330-poly-787-old.glb`。
- "Low Poly Airliner" by Mauro3D — CC-BY 4.0（https://sketchfab.com/maurogsw）；`low_poly_airliner.glb`＝B737。

## 音效（public/sounds/，v5.2 polish）
| 檔案 | 用途 | 來源 | 授權 | 需標示 |
|------|------|------|------|--------|
| `sounds/squelch-open.mp3` | ATC 語音開頻嘶（clip 優先、合成保底） | freesound "Walkie Talkie - Transmission Start" by bruce965（https://freesound.org/people/bruce965/sounds/321905/；此為 HQ 預覽轉檔 128k mp3，全質量 FLAC 需帳號下載、可直接替換） | **CC0** | 否（仍致謝） |
| `sounds/squelch-close.mp3` | ATC 語音關頻嘶 | freesound "Walkie Talkie - Roger Beep" by bruce965（https://freesound.org/people/bruce965/sounds/321906/） | **CC0** | 否（仍致謝） |
| （未入庫） | 背景 static loop 候選：freesound "continuous static" by Jace（https://freesound.org/people/Jace/sounds/35291/，CC0）——疊底噪與「不刺耳」拍板衝突，待 Sung 裁定再接 | — | CC0 | — |

## B737 窄體 GLB 候選（2026-07-02 搜尋，待 Sung 下載拍板）
- **首選**："Low Poly Airliner" by Mauro3D — CC-BY 4.0、3,484 tris、A320 窄體翼吊雙發、**輪子獨立 mesh（可接收放）**（https://sketchfab.com/3d-models/low-poly-airliner-f06d488f08764e3ca26f2917d4053c69；Sketchfab 下載需登入帳號）
- 次選："Low Poly Passenger Aircraft" by Crimexix — CC-BY 4.0、2,700 tris（外型需開預覽確認）
- P0-3 已採用 OpenGameArt "Jumbo Jet, Wide Body" 作為 A330（寬體 CC0；https://opengameart.org/content/jumbo-jetwide-body）
- 結論維持：「線上幾乎無 CC0 客機」再驗證成立（Sketchfab CC0 池實測零客機）。

## B737 專屬窄體 GLB（2026-07-02 換裝完成）
| 檔案 | 用途 | 來源 | 授權 | 需標示 |
|------|------|------|------|--------|
| `low_poly_airliner.glb` | **B737**（窄體幹線；A320 體、翼吊雙發、3,484 tris；**起落架＝原生獨立 node（鼻輪+雙主輪）→ 真收放**） | "Low Poly Airliner" by Mauro3D（https://sketchfab.com/3d-models/low-poly-airliner-f06d488f08764e3ca26f2917d4053c69；授權 metadata 內建於 GLB asset.extras） | **CC-BY 4.0** | **是** |

- 致謝："Low Poly Airliner" by Mauro3D (https://sketchfab.com/maurogsw), licensed under CC-BY 4.0.
- yaw=π（垂尾頂點掃描在 -Z 端＝機鼻原朝 +Z）；scale/站姿待 Sung 真機目視校正。
- B737 與 A330 至此外型徹底分開（原共用 787 GLB 縮小代用退役）。

## P0-3 A330 廣體換裝（2026-09-07）
| 檔案 | 用途 | 來源 | 授權 | 需標示 |
|------|------|------|------|--------|
| `a330.glb` | **A330**（廣體；~3176 tris；翼吊雙發；clean-belly） | OpenGameArt "Jumbo Jet, Wide Body" by NuclearOsmosis（https://opengameart.org/content/jumbo-jetwide-body；OBJ→GLB） | **CC0 1.0** | 否（仍致謝） |
| `low_poly_airliner.glb` | **B737**（維持 Mauro3D 窄體） | 不變 | **CC-BY 4.0** | **是** |

- A330：`lengthM:50`、`yaw: Math.PI`、`cam:{back:1.1,up:1.3}`、無 `gearNodes`（假輪方案 B）。
- B737：維持 `lengthM:38`、`yaw: Math.PI`、`gearNodes:['Cylinder.001','Cylinder.002','Cylinder.003']`、`cam:{back:1.15,up:1.35}`。
- **更高品質寬體候選（需 Sung 登入下載）**：Mauro3D "Low Poly Boeing 787 Dreamliner" CC-BY — https://sketchfab.com/3d-models/low-poly-boeing-787-dreamliner-50baa323fabd49a6b861096cb88e5c25 （Sketchfab API 401／需帳號）。下載後可直接替換 `public/models/a330.glb`。
- staging：`candidates/airplane-a3XrQkLNna9.glb`（Poly Pizza 11k tris 雙發，單 mesh＋輪烤進機身，未採用）；`candidates/a330-poly-787-old.glb`（舊 1100-tris 787 代用）。
