// @ts-check
// 兩機相撞純判定（HITL：溫和/真實模式，空中或地面兩機相撞會受損甚至爆炸）。
// 純函式、零副作用；安全模式不在此處罰（呼叫端只在 gentle/real 啟用、並接後果軸）。

/**
 * 兩機是否相撞：3D 中心距 ≤ 合計碰撞半徑。
 * @param {{x:number,y:number,z:number}} a
 * @param {{x:number,y:number,z:number}} b
 * @param {number} radius 兩機合計碰撞半徑（m）
 * @returns {boolean}
 */
export function planesColliding(a, b, radius) {
  if (!a || !b || !(typeof radius === 'number' && radius > 0)) return false;
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  if (![dx, dy, dz].every(Number.isFinite)) return false;
  return dx * dx + dy * dy + dz * dz <= radius * radius;
}
