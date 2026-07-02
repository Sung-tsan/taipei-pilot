// @ts-check
import { describe, it, expect } from 'vitest';
import {
  AI, decideInput, difficultyLevel, adaptiveHandicap, shouldFire,
} from '../src/display/combat/enemy-ai.js';
import { makePlane } from '../src/display/flight/flight-model.js';

/**
 * 造一架空中飛行狀態（與 flight-model.test.js 風格一致）。
 * @param {{ x?:number, y?:number, z?:number, heading?:number, speed?:number }} [o]
 */
function airborne({ x = 0, y = 300, z = 0, heading = 0, speed = 45 } = {}) {
  const s = makePlane({ x, z, heading });
  s.pos.y = y;
  s.speed = speed;
  s.mode = 'flying';
  return s;
}

describe('decideInput — 追擊', () => {
  it('目標在正北遠方、我朝北 → 油門高、roll 幾乎為 0（已對準）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });       // 機頭朝北(-Z)
    const target = airborne({ x: 0, z: -3000 });             // 正北方 3km
    const inp = decideInput(self, target, { difficulty: 0.6, handicap: 0 });
    expect(inp.th).toBeGreaterThan(0.6);
    expect(Math.abs(inp.r)).toBeLessThan(0.05);
    expect(inp.gearUp).toBe(true);
  });

  it('目標在我右前方 → 右滾（r>0），符合 heading 順時針增加慣例', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });       // 朝北
    const target = airborne({ x: 2000, z: -2000 });          // 東北方 → 需順時針(右)轉
    const inp = decideInput(self, target, { difficulty: 0.6 });
    expect(inp.r).toBeGreaterThan(0.2);
  });

  it('目標在我左前方 → 左滾（r<0）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });       // 朝北
    const target = airborne({ x: -2000, z: -2000 });         // 西北方 → 需逆時針(左)轉
    const inp = decideInput(self, target, { difficulty: 0.6 });
    expect(inp.r).toBeLessThan(-0.2);
  });

  it('目標較高 → 拉桿爬升（p>0）；目標較低 → 推桿下降（p<0）', () => {
    const self = airborne({ x: 0, z: 0, y: 300, heading: 0 });
    const high = airborne({ x: 0, z: -3000, y: 600 });
    const low = airborne({ x: 0, z: -3000, y: 100 });
    expect(decideInput(self, high, { difficulty: 0.6 }).p).toBeGreaterThan(0.05);
    expect(decideInput(self, low, { difficulty: 0.6 }).p).toBeLessThan(-0.05);
  });
});

describe('decideInput — 閃避', () => {
  it('目標咬在正後方近距 → 破壞性轉彎（roll 打滿）+ 拉桿 + 加力', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });       // 我朝北
    // 目標在我「正後方」（南方）且近：z 為正(南)、距離 < EVADE_DIST
    const target = airborne({ x: 0, z: 300 });
    const inp = decideInput(self, target, { difficulty: 0.6, handicap: 0 });
    expect(Math.abs(inp.r)).toBeGreaterThan(0.9); // 打滿破壞性轉彎
    expect(inp.p).toBeGreaterThan(0.3);           // 拉桿
    expect(inp.th).toBeGreaterThan(0.9);          // 加力甩尾
  });

  it('目標在後方但遠（超出 EVADE_DIST）→ 不觸發閃避，仍是追擊', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const target = airborne({ x: 0, z: AI.EVADE_DIST + 500 }); // 後方但遠
    const inp = decideInput(self, target, { difficulty: 0.6, handicap: 0 });
    // 追擊油門（< EVADE_TH），不是閃避的滿油
    expect(inp.th).toBeLessThan(AI.EVADE_TH);
  });
});

describe('decideInput — 低空拉起地板', () => {
  it('極低空 → p 為正（被拉起），即使目標在下方也不會撞地', () => {
    const self = airborne({ x: 0, z: 0, y: 10, heading: 0 }); // agl≈10m 極低
    const lowTarget = airborne({ x: 0, z: -2000, y: 0 });     // 目標在地面
    const inp = decideInput(self, lowTarget, { difficulty: 0.8 });
    expect(inp.p).toBeGreaterThan(0.3); // 地板拉起壓過「追低目標」的推桿
  });

  it('低空拉起 handicap 也拔不掉（地板鐵律）', () => {
    const self = airborne({ x: 0, z: 0, y: 5, heading: 0 });
    const lowTarget = airborne({ x: 0, z: -2000, y: 0 });
    const inp = decideInput(self, lowTarget, { difficulty: 0.2, handicap: 1 });
    expect(inp.p).toBeGreaterThan(0.3);
  });
});

describe('decideInput — difficulty 強度差異', () => {
  it('高難度 vs 低難度：高難度油門更滿、roll 更積極', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    // 方位誤差 ≈0.5 rad：在直線窗口（AIM_WINDOW_RAD）外、roll 未飽和，才量得出增益差異。
    const target = airborne({ x: 1640, z: -3000 });
    const easy = decideInput(self, target, { difficulty: 0.5, handicap: 0 });
    const hard = decideInput(self, target, { difficulty: 0.95, handicap: 0 });
    expect(hard.th).toBeGreaterThan(easy.th);
    expect(Math.abs(hard.r)).toBeGreaterThan(Math.abs(easy.r)); // 同方位下高難度轉得更兇
    expect(Math.abs(hard.r)).toBeLessThan(1); // 確認在未飽和區（增益差才有意義）
  });
});

describe('decideInput — v5.2-1 可咬尾設計', () => {
  it('直線瞄準窗口：目標在機頭 ±AIM_WINDOW_RAD 內 → 直飛不修方位（r=0）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const target = airborne({ x: 200, z: -3000 }); // 誤差 ≈0.067 rad，窗口內
    const inp = decideInput(self, target, { difficulty: 0.95, handicap: 0 });
    expect(inp.r).toBe(0);
  });

  it('窗口邊界連續：剛出窗口的 roll 極小（死區重基準、不跳變）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    // 誤差 ≈ 0.32 rad（剛超出 0.3 的窗口）
    const target = airborne({ x: 3000 * Math.tan(0.32), z: -3000 });
    const inp = decideInput(self, target, { difficulty: 0.95, handicap: 0 });
    expect(Math.abs(inp.r)).toBeGreaterThan(0);
    expect(Math.abs(inp.r)).toBeLessThan(0.1);
  });

  it('近距減速：CLOSE_DIST 內油門比遠距低（讓玩家拉得近）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const near = airborne({ x: 0, z: -500 });   // 500m < CLOSE_DIST
    const far = airborne({ x: 0, z: -2000 });   // 2000m > CLOSE_DIST
    const iNear = decideInput(self, near, { difficulty: 0.8, handicap: 0 });
    const iFar = decideInput(self, far, { difficulty: 0.8, handicap: 0 });
    expect(iNear.th).toBeLessThan(iFar.th);
    expect(iNear.th).toBeCloseTo(iFar.th * AI.CLOSE_TH_SCALE, 5);
  });

  it('新手局油門封頂：difficulty < EASY_DIFF 時 th ≤ EASY_TH_CAP（含閃避）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const chaseTarget = airborne({ x: 0, z: -2000 });
    const chase = decideInput(self, chaseTarget, { difficulty: 0.2, handicap: 0 });
    expect(chase.th).toBeLessThanOrEqual(AI.EASY_TH_CAP);
    const tailTarget = airborne({ x: 0, z: 300 }); // 咬尾近距 → 閃避
    const evade = decideInput(self, tailTarget, { difficulty: 0.2, handicap: 0 });
    expect(evade.th).toBeLessThanOrEqual(AI.EASY_TH_CAP);
  });

  it('閃避距離隨難度放大：700m 咬尾在新手局不觸發閃避、滿難度觸發', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const tail = airborne({ x: 0, z: 700 }); // 尾後 700m（> 基礎 600、< 滿難度 900）
    const easy = decideInput(self, tail, { difficulty: 0, handicap: 0 });
    expect(easy.th).toBeLessThan(AI.EVADE_TH);      // 未閃避（追擊油門）
    const hard = decideInput(self, tail, { difficulty: 1, handicap: 0 });
    expect(hard.th).toBeCloseTo(AI.EVADE_TH, 5);    // 閃避滿油
  });
});

describe('decideInput — handicap 鈍化（放水）', () => {
  it('handicap 高 → 油門收、roll 鈍化（轉更慢）', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const target = airborne({ x: 1500, z: -2000 });
    const sharp = decideInput(self, target, { difficulty: 0.8, handicap: 0 });
    const soft = decideInput(self, target, { difficulty: 0.8, handicap: 1 });
    expect(soft.th).toBeLessThan(sharp.th);
    expect(Math.abs(soft.r)).toBeLessThan(Math.abs(sharp.r));
  });
});

describe('decideInput — heuristic 地板（絕不爆）', () => {
  it('餵 NaN 座標 → 不 throw，回合理保守 Input', () => {
    const self = airborne({ heading: 0 });
    self.pos.x = NaN; self.pos.z = NaN;
    const target = airborne({ x: 1000, z: -1000 });
    /** @type {any} */ let inp;
    expect(() => { inp = decideInput(self, target, { difficulty: 0.6 }); }).not.toThrow();
    expect(Number.isFinite(inp.r)).toBe(true);
    expect(Number.isFinite(inp.p)).toBe(true);
    expect(inp.th).toBeGreaterThanOrEqual(0);
    expect(inp.th).toBeLessThanOrEqual(1);
  });

  it('target 缺 pos / 全空 → 不 throw，回平飛中油門', () => {
    const self = airborne();
    /** @type {any} */ let a;
    /** @type {any} */ let b;
    expect(() => { a = decideInput(self, /** @type {any} */ ({}), {}); }).not.toThrow();
    expect(() => { b = decideInput(/** @type {any} */ (null), /** @type {any} */ (null), {}); }).not.toThrow();
    for (const inp of [a, b]) {
      expect(Number.isFinite(inp.r)).toBe(true);
      expect(Number.isFinite(inp.p)).toBe(true);
      expect(inp.th).toBeGreaterThanOrEqual(0);
      expect(inp.th).toBeLessThanOrEqual(1);
    }
  });

  it('opts 為 NaN / 缺值 → 夾回合法區間，不爆', () => {
    const self = airborne({ x: 0, z: 0, heading: 0 });
    const target = airborne({ x: 1000, z: -1000 });
    const inp = decideInput(self, target, /** @type {any} */ ({ difficulty: NaN, handicap: NaN }));
    expect(Number.isFinite(inp.r)).toBe(true);
    expect(inp.th).toBeGreaterThanOrEqual(0);
    expect(inp.th).toBeLessThanOrEqual(1);
  });
});

describe('difficultyLevel — 難度曲線', () => {
  it('隨局數單調不遞減、永遠落在 [START, CAP]', () => {
    let prev = -1;
    for (let i = 0; i < 60; i++) {
      const lv = difficultyLevel(i);
      expect(lv).toBeGreaterThanOrEqual(AI.CURVE_START - 1e-9);
      expect(lv).toBeLessThanOrEqual(AI.CURVE_CAP + 1e-9);
      expect(lv).toBeGreaterThanOrEqual(prev - 1e-9); // 不遞減
      prev = lv;
    }
  });

  it('前幾局明顯比後段低（前低後升）', () => {
    expect(difficultyLevel(0)).toBeLessThan(difficultyLevel(20));
    expect(difficultyLevel(0)).toBeCloseTo(AI.CURVE_START, 5);
  });

  it('異常輸入（負數 / NaN）不爆界', () => {
    expect(difficultyLevel(-5)).toBeGreaterThanOrEqual(AI.CURVE_START - 1e-9);
    expect(difficultyLevel(/** @type {any} */ (NaN))).toBeGreaterThanOrEqual(AI.CURVE_START - 1e-9);
    expect(difficultyLevel(1e9)).toBeLessThanOrEqual(AI.CURVE_CAP + 1e-9);
  });
});

describe('adaptiveHandicap — 回拉到目標勝率', () => {
  it('玩家連敗 → handicap 升高（AI 放水）', () => {
    const losing = [false, false, false, false, false]; // 玩家全輸
    const winning = [true, true, true, true, true];      // 玩家全贏
    expect(adaptiveHandicap(losing)).toBeGreaterThan(adaptiveHandicap(winning));
  });

  it('玩家連勝 → handicap 降低（AI 變強回拉）', () => {
    const winning = [true, true, true, true, true];
    expect(adaptiveHandicap(winning)).toBeLessThan(AI.HANDICAP_DEFAULT);
  });

  it('物件陣列 {win} 介面與布林陣列等價', () => {
    const boolForm = [true, false, true, false];
    const objForm = [{ win: true }, { win: false }, { win: true }, { win: false }];
    expect(adaptiveHandicap(objForm)).toBeCloseTo(adaptiveHandicap(boolForm), 9);
  });

  it('空資料 / 非陣列 → 友善預設（偏放水）', () => {
    expect(adaptiveHandicap([])).toBe(AI.HANDICAP_DEFAULT);
    expect(adaptiveHandicap(/** @type {any} */ (null))).toBe(AI.HANDICAP_DEFAULT);
    expect(adaptiveHandicap(/** @type {any} */ (undefined))).toBe(AI.HANDICAP_DEFAULT);
  });

  it('輸出永遠落在 [0,1]，殘缺元素被跳過不爆', () => {
    const messy = /** @type {any} */ ([true, null, 'x', { win: false }, undefined, { win: true }]);
    const h = adaptiveHandicap(messy);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(1);
  });

  it('剛好打到目標勝率 → handicap 接近友善預設中心', () => {
    // target=0.6：6 勝 4 敗 = 0.6
    const onTarget = [true, true, true, true, true, true, false, false, false, false];
    expect(adaptiveHandicap(onTarget, 0.6)).toBeCloseTo(AI.HANDICAP_DEFAULT, 5);
  });
});

describe('shouldFire — 射程 + 錐角', () => {
  it('射程內 + 對準機頭 → 開火', () => {
    const self = airborne({ x: 0, z: 0, y: 300, heading: 0 });   // 朝北
    const target = airborne({ x: 0, z: -400, y: 300 });          // 正前方 400m
    expect(shouldFire(self, target, { rangeM: 800 })).toBe(true);
  });

  it('射程外 → 不開火', () => {
    const self = airborne({ x: 0, z: 0, y: 300, heading: 0 });
    const target = airborne({ x: 0, z: -2000, y: 300 });         // 正前方但 2km > 800
    expect(shouldFire(self, target, { rangeM: 800 })).toBe(false);
  });

  it('射程內但偏離機頭（錐角外）→ 不開火', () => {
    const self = airborne({ x: 0, z: 0, y: 300, heading: 0 });   // 朝北
    const target = airborne({ x: 400, z: 0, y: 300 });           // 正東(右側 90°)、400m
    expect(shouldFire(self, target, { rangeM: 800 })).toBe(false);
  });

  it('預設 spec（不給 rangeM/coneRad）也能運作', () => {
    const self = airborne({ x: 0, z: 0, y: 300, heading: 0 });
    const near = airborne({ x: 0, z: -300, y: 300 });            // 前方 300m < 預設 800
    const far = airborne({ x: 0, z: -5000, y: 300 });
    expect(shouldFire(self, near)).toBe(true);
    expect(shouldFire(self, far)).toBe(false);
  });

  it('NaN / 殘缺輸入 → 安全側回 false（寧可不開火）', () => {
    const self = airborne();
    self.pos.x = NaN;
    const target = airborne({ x: 0, z: -300 });
    expect(shouldFire(self, target, { rangeM: 800 })).toBe(false);
    expect(shouldFire(/** @type {any} */ (null), /** @type {any} */ (null))).toBe(false);
  });
});
