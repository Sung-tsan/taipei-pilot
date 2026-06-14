// @ts-check
// V3 天氣受損% 計算 —— 純函式，零副作用，vitest 直測。
// 接 consequence.js 的 damagePct（v3.0-2 把離散 damage 擴成連續 %）。
// 哲學：磁吸接住小幅，超過 threshold 才咬；台北寧可先弱（HITL 再加）。

/**
 * 側風劣質著陸受損%：偏離跑道中線 + 接地速度超標 → %。
 * 容差內＝0（磁吸接住）；超過才依超標量累加。
 * @param {{ offsetM:number, speedMps:number }} p
 *   offsetM＝接地點離跑道中線的橫向距離；speedMps＝接地空速。
 * @param {{ tolM?:number, maxSpeed?:number }} [cfg]
 * @returns {number} 受損百分點（0..100）
 */
export function crosswindDamagePct({ offsetM, speedMps }, { tolM = 30, maxSpeed = 60 } = {}) {
  const off = Math.max(0, Math.abs(offsetM || 0) - tolM);   // 中線容差內不咬
  const overSpd = Math.max(0, (speedMps || 0) - maxSpeed);  // 接地過快才咬
  const pct = off * 0.6 + overSpd * 1.2; // 每超 1m 偏移 +0.6%、每超 1m/s +1.2%
  return Math.max(0, Math.min(100, pct));
}

/**
 * 亂流甩出安全包絡受損%：bank/pitch 超過安全角才咬（magnitude 超量 → %）。
 * 包絡內＝0（磁吸接住）；只在被亂流甩超才累加。
 * @param {{ bank:number, pitch:number }} att 當前姿態（rad）
 * @param {{ bankSafe?:number, pitchSafe?:number }} [cfg]
 * @returns {number} 受損百分點（0..100）
 */
export function turbulenceDamagePct({ bank, pitch }, { bankSafe = 1.1, pitchSafe = 0.6 } = {}) {
  const bOver = Math.max(0, Math.abs(bank || 0) - bankSafe);
  const pOver = Math.max(0, Math.abs(pitch || 0) - pitchSafe);
  const pct = (bOver + pOver) * 28; // 超出 rad × 28 → %（甩很大才明顯）
  return Math.max(0, Math.min(100, pct));
}
