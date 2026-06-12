// @ts-check
/** @param {number} v @param {number} lo @param {number} hi */
export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** @param {number} a @param {number} b @param {number} t */
export const lerp = (a, b, t) => a + (b - a) * t;

/** 把角度收進 (-π, π] @param {number} a */
export function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

/** 最短帶號角差 to - from @param {number} from @param {number} to */
export const angDiff = (from, to) => wrapAngle(to - from);

/**
 * 朝目標值移動，速率上限 rate（每秒）。
 * @param {number} v @param {number} target @param {number} rate @param {number} dt
 */
export function approach(v, target, rate, dt) {
  const d = target - v;
  const step = rate * dt;
  return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
}

/** 角度版 approach（走最短弧） @param {number} v @param {number} target @param {number} rate @param {number} dt */
export function approachAngle(v, target, rate, dt) {
  const d = angDiff(v, target);
  const step = rate * dt;
  return Math.abs(d) <= step ? target : wrapAngle(v + Math.sign(d) * step);
}

/** 幀率無關的指數平滑係數 @param {number} sharpness @param {number} dt */
export const expDamp = (sharpness, dt) => 1 - Math.exp(-sharpness * dt);
