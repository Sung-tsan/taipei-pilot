// @ts-check
// 撞建築 = 溫和彈開（退回上一個安全位置 + 減速 + 微抬頭），不墜毀、無懲罰。
// 垂直方向（屋頂擦過）由 flight-model 的接地柔彈處理；這裡管「側面撞進去」。
import { P } from './flight-model.js';

/**
 * @param {import('./flight-model.js').PlaneState} s
 * @param {{x:number,y:number,z:number}} prevPos step 前的位置
 * @param {(x:number,z:number)=>{h:number,cx:number,cz:number}|null} solidAt
 * @returns {boolean} 有撞到
 */
export function collidePlane(s, prevPos, solidAt) {
  const hit = solidAt(s.pos.x, s.pos.z);
  if (!hit) return false;
  if (s.mode !== 'flying') {
    // 地面滑行撞到建築 footprint＝牆：擋住、停住（退回上一安全位置），不爬上屋頂也不穿牆。
    // HITL 2026-06-21：曾在桃園滑過頭卡在航廈頂無法動。純擋牆、不走 mishap/crash（taxi 速度事件，
    // 由 checkTaxiOff 導回綠線）；轉/退到沒進 footprint 就能離開。
    s.pos.x = prevPos.x;
    s.pos.z = prevPos.z;
    s.speed = 0;
    return false;
  }
  if (s.pos.y > hit.h + 1) return false;

  // 退回安全位置 + 往「離建築中心」方向再推一点
  s.pos.x = prevPos.x;
  s.pos.z = prevPos.z;
  const dx = s.pos.x - hit.cx, dz = s.pos.z - hit.cz;
  const len = Math.hypot(dx, dz) || 1;
  s.pos.x += (dx / len) * 6;
  s.pos.z += (dz / len) * 6;

  s.speed = Math.max(s.speed * 0.55, P.V_MIN);
  s.pitch = Math.max(s.pitch, 0.12); // 微抬頭，鼓勵飛離
  return true;
}
