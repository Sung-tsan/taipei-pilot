# 四機型 GLB 候選（2026-06-18 sourcing — 接 (b)「找一架起落架可完整收／無支柱的客機」）

> 任務：找 A330 / ATR-72(or ATR-42) / F-16 / T-34(or 類似螺旋槳教練機) 四款 **low-poly CC0/CC-BY GLB**，
> 重點解掉現役 `airliner.glb` 的「3 根起落架支柱烤進機身、飛行時恆放下」問題（見 ../CREDITS.md、plane-entity.js:163）。
> 全部已下載到本資料夾（staging，**未動 live 遊戲**）；runtime 走 src/display/assets/glb-model.js normalize 管線。
> 來源全為 **Poly Pizza**（Google Poly 典藏）。每檔已驗 GLB 合法 + 量 tris + 看官方縮圖。

## 兩個誠實結論（先講）
1. **查無任何 CC0 飛機** —— 整個 Poly Pizza 的飛機集都是 **CC-BY 3.0**（需標示）。與現役 `airliner.glb` 同等級，
   出貨需一行致謝。線上 CC0 飛行物只有太空船/直升機（不合用），與 ../CREDITS.md 既有結論一致。
2. **查無真正的「雙螺旋槳高翼支線客機」(ATR/Dash-8 外型)** —— ATR-72 只能用代用件。下面給兩個取向各一，待 Sung 拍板。

## 推薦組合（已 staging）

| 槽位 | 檔案 | 原型/外觀 | 來源 | 作者 | 授權 | tris | 起落架 | 備註 |
|------|------|-----------|------|------|------|------|--------|------|
| **A330** | `a330.glb` | Boeing 787（雙引擎寬體，**最接近 A330 體型**） | [poly.pizza/m/fzIXe2paBN9](https://poly.pizza/m/fzIXe2paBN9) | Poly by Google | CC-BY 3.0 | ~1100 | **CLEAN-BELLY ✅ 無支柱** | 縮圖確認機腹乾淨、飛行不露輪。**解掉支柱問題的主角。** |
| **F-16** | `f16.glb` | 現代匿蹤戰機（讀作 F-22/F-35，泛用單尾戰機；無正版 F-16） | [poly.pizza/m/6fyLMORhgGK](https://poly.pizza/m/6fyLMORhgGK) | jeremy | CC-BY 3.0 | ~1434 | **CLEAN-BELLY ✅ 無支柱** | vertex color、無貼圖，匯入最省事。 |
| **T-34** | `t34.glb` | **低翼軍用教練機 = T-34 Mentor 神似**（綠+黃條、機鼻槳、泡泡罩） | [poly.pizza/m/9VeIc0cybp4](https://poly.pizza/m/9VeIc0cybp4) | Gilang Romadhan | CC-BY 3.0 | ~590 | **CLEAN-BELLY ✅** | 外觀最像 T-34。**螺旋槳烤進單一網格＝無法單獨轉**（現役 GLB 機本就不轉槳，可接受）。有貼圖。 |
| **ATR-72 取向A（乾淨）** | `atr72-jet.glb` | 小型客機/公務噴射（乾淨機腹、體型比 A330 小可區隔） | [poly.pizza/m/1uXmHq-ELhz](https://poly.pizza/m/1uXmHq-ELhz) | Poly by Google | CC-BY 3.0 | ~254 | **CLEAN-BELLY ✅** | 飛行最乾淨；缺點＝噴射機，沒有 ATR 的螺旋槳識別。 |
| **ATR-72 取向B（螺旋槳）** | `atr72-prop.glb` | 高翼單槳輕航機（Cessna；高翼+槳＝**最接近 ATR 剪影家族**） | [poly.pizza/m/7cvx6ex-xfL](https://poly.pizza/m/7cvx6ex-xfL) | Vojtěch Balák | CC-BY 3.0 | ~584 | **固定起落架（FIXED）** | 有獨立 `Propeller_Cone` 節點＝**可轉槳**。缺點＝有露出的固定輪（小高翼機讀作「故意固定」尚可，但非收放）。 |

## ATR-72 怎麼選（唯一要你拍板的點）
- **取向A `atr72-jet.glb`** —— 要「飛行畫面乾淨、不再有支柱」就選它；體型小於 787 可與 A330 視覺區隔。代價：是噴射機外型，丟了 ATR 螺旋槳味。
- **取向B `atr72-prop.glb`** —— 要保留「螺旋槳支線機」識別（且想要會轉的槳）就選它；高翼+槳是全庫最接近 ATR 的剪影。代價：有固定輪（非收放，但讀作小高翼機的固定腳架，不像 787 那種斷掉的支柱）。
- 補充：ATR 的遊戲識別本來就靠「重、轉彎慢、長跑道、地面作業」(plane-specs.js)，外觀是代用（../CREDITS.md 已記）。兩個都比現役「噴射客機+恆放支柱」乾淨。

## 落選（記錄備查）
- **Boeing 747**（[49CLof4tP2V](https://poly.pizza/m/49CLof4tP2V)，CC-BY，clean-belly）：4 引擎+上層駝峰，讀作 747 不像雙引擎 A330。要第二種寬體剪影才用。
- **現役 `airliner.glb`**（[8ciDd9k8wha](https://poly.pizza/m/8ciDd9k8wha)）：`Wheel1-6` 雖獨立節點，但**支柱腿烤進 `Airplane1` 機身**＝藏輪後仍留斷腿。即本次要換掉的對象。
- **Sea Plane / 高翼 Cessna 固定輪 / 各式低翼噴射**：見 sourcing 過程，皆有 identity 或起落架缺陷。

## 下一步（待 Sung）
1. 選 ATR-72 取向 A 或 B。
2. 要我把選定的接進 `src/display/planes/plane-specs.js`（新增 a330 spec、把 atr72/f16/t34 改 GLB），
   並補 `../CREDITS.md` 致謝（4 筆 CC-BY 3.0）。
3. **yaw/scale 需 HITL 校正**：每架機鼻朝向(yaw)、縮放(lengthM) 要看 render 校（現役 ATR 的 `yaw: Math.PI` 就是 2026-06-16 HITL 校出來的）——接進去後要在你裝置上看一輪。

## 致謝草稿（出貨用，CC-BY 3.0）
- "Airplane" (Boeing 787) — Poly by Google — https://poly.pizza/m/fzIXe2paBN9
- "Jet" — jeremy — https://poly.pizza/m/6fyLMORhgGK
- "Aeroplane" — Gilang Romadhan — https://poly.pizza/m/9VeIc0cybp4
- "Small plane" — Poly by Google — https://poly.pizza/m/1uXmHq-ELhz （取向A）
- "Small Airplane" — Vojtěch Balák — https://poly.pizza/m/7cvx6ex-xfL （取向B）
