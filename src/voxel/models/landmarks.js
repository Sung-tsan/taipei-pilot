// @ts-check
// 台北地標 voxel 模型（手工 + 程式化混合；box = [x,y,z,w,h,d,colorKey]）。
// 全部原點 = 底部中心。尺寸「辨識度優先」：比例正確比擬真重要。

/** @typedef {import('../build.js').VoxelModel} VoxelModel */

/** 台北 101：8 節倒梯形斗拱 + 裙樓 + 尖塔（高 ~480m 含塔尖，鎮場之寶） @returns {VoxelModel} */
export function taipei101() {
  const boxes = [];
  // 裙樓
  boxes.push([-55, 0, -55, 110, 30, 110, 'P']);
  // 基座段（直筒，到 ~120m）
  boxes.push([-28, 0, -28, 56, 120, 56, 'G']);
  // 8 節斗拱：每節下窄上寬的倒梯形（2 層 box）+ 節間白簷（參考作品的精緻感）
  let y = 120;
  for (let i = 0; i < 8; i++) {
    const h = 34;
    boxes.push([-22, y, -22, 44, h * 0.45, 44, 'G']);            // 節腰（窄）
    boxes.push([-27, y + h * 0.45, -27, 54, h * 0.55 - 2.5, 54, 'g']); // 節口（寬）
    boxes.push([-29, y + h - 2.5, -29, 58, 2.5, 58, 'W']);       // 白簷
    y += h;
  }
  // 頂冠 + 尖塔
  boxes.push([-16, y, -16, 32, 18, 32, 'G']);
  boxes.push([-4, y + 18, -4, 8, 30, 8, 'S']);
  boxes.push([-1.5, y + 48, -1.5, 3, 42, 3, 'S']);
  return {
    name: '台北 101', scale: 1,
    palette: { G: '#3f7d6a', g: '#55997f', S: '#aebdc6', P: '#7d8a92', W: '#e9eef1' },
    boxes,
  };
}

/** 圓山大飯店：紅柱白牆 + 金黃大屋頂（中國宮殿式，14 層） @returns {VoxelModel} */
export function grandHotel() {
  const boxes = [];
  boxes.push([-95, 0, -45, 190, 12, 90, 'B']);     // 基座
  boxes.push([-85, 12, -38, 170, 48, 76, 'R']);    // 紅樓本體
  for (let i = 0; i < 6; i++) {                     // 白窗帶
    boxes.push([-85, 17 + i * 8, -39, 170, 2.4, 78, 'W']);
  }
  // 大屋頂（兩層收分）
  boxes.push([-95, 60, -46, 190, 8, 92, 'Y']);
  boxes.push([-72, 68, -36, 144, 8, 72, 'Y']);
  boxes.push([-48, 76, -26, 96, 7, 52, 'y']);
  boxes.push([-20, 83, -14, 40, 6, 28, 'y']);
  return {
    name: '圓山大飯店', scale: 1,
    palette: { R: '#b8403a', W: '#f2e8d8', Y: '#d9a441', y: '#c08f2f', B: '#9a8c78' },
    boxes,
  };
}

/** 總統府：紅磚白橫帶長樓 + 中央高塔（日治文藝復興式，塔高 60m） @returns {VoxelModel} */
export function presidentialOffice() {
  const boxes = [];
  boxes.push([-130, 0, -25, 260, 30, 50, 'R']);    // 長樓本體
  for (let i = 0; i < 4; i++) {                     // 白橫帶
    boxes.push([-130, 5 + i * 7, -26, 260, 2, 52, 'W']);
  }
  boxes.push([-130, 30, -25, 260, 4, 50, 'W']);    // 簷口
  boxes.push([-105, 34, -20, 30, 8, 40, 'R']);     // 兩端閣樓
  boxes.push([75, 34, -20, 30, 8, 40, 'R']);
  // 中央塔
  boxes.push([-16, 30, -16, 32, 34, 32, 'R']);
  boxes.push([-13, 64, -13, 26, 4, 26, 'W']);
  boxes.push([-9, 68, -9, 18, 14, 18, 'R']);
  boxes.push([-5, 82, -5, 10, 8, 10, 'W']);
  return {
    name: '總統府', scale: 1,
    palette: { R: '#a8524a', W: '#efe9dd' },
    boxes,
  };
}

/** 中正紀念堂：白身藍琉璃八角頂 + 階梯基座（高 70m） @returns {VoxelModel} */
export function cksMemorial() {
  const boxes = [];
  boxes.push([-70, 0, -70, 140, 8, 140, 'S']);     // 大平台
  boxes.push([-55, 8, -55, 110, 10, 110, 'S']);    // 階梯
  boxes.push([-42, 18, -42, 84, 34, 84, 'W']);     // 白色堂身
  boxes.push([-46, 52, -46, 92, 6, 92, 'B']);      // 下簷
  boxes.push([-32, 58, -32, 64, 10, 64, 'B']);     // 八角頂（兩層近似）
  boxes.push([-18, 68, -18, 36, 10, 36, 'B']);
  boxes.push([-5, 78, -5, 10, 8, 10, 'Y']);        // 寶頂
  return {
    name: '中正紀念堂', scale: 1,
    palette: { W: '#f4f1e8', B: '#3f6bb5', S: '#d8d2c4', Y: '#d9a441' },
    boxes,
  };
}

/** 美麗華摩天輪：100m 大輪 + 16 個彩色車廂（程式化圓環） @returns {VoxelModel} */
export function miramarWheel() {
  const boxes = [];
  const R = 42, cy = 52;
  boxes.push([-50, 0, -20, 100, 14, 40, 'M']);     // 商場底座
  boxes.push([-4, 0, -3, 8, cy, 6, 'F']);          // 支柱 ×2（前後）
  boxes.push([-26, 0, -2, 52, 6, 4, 'F']);         // 支柱斜撐近似
  // 輪圈：24 段小箱繞圓
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    boxes.push([Math.cos(a) * R - 2.5, cy + Math.sin(a) * R - 2.5, -1, 5, 5, 2, 'F']);
  }
  // 車廂：16 個糖果色
  const cabColors = ['C1', 'C2', 'C3', 'C4'];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    boxes.push([Math.cos(a) * R - 3, cy + Math.sin(a) * R - 7, -3.5, 6, 7, 7, cabColors[i % 4]]);
  }
  boxes.push([-5, cy - 5, -2, 10, 10, 4, 'F']);    // 輪轂
  return {
    name: '美麗華摩天輪', scale: 1,
    palette: {
      F: '#cdd5dd', M: '#e8ddc8',
      C1: '#e0533d', C2: '#f2b94b', C3: '#5fa68e', C4: '#3d7be0',
    },
    boxes,
  };
}

/** 西門紅樓：紅磚八角樓（小而精，高 ~16m） @returns {VoxelModel} */
export function ximenRedHouse() {
  const boxes = [];
  boxes.push([-22, 0, -22, 44, 12, 44, 'R']);      // 八角主體（方塊近似）
  boxes.push([-16, 0, -28, 32, 12, 56, 'R']);      // 八角的斜角補形
  boxes.push([-28, 0, -16, 56, 12, 32, 'R']);
  boxes.push([-23, 12, -23, 46, 2, 46, 'W']);      // 白簷
  boxes.push([-16, 14, -16, 32, 6, 32, 'D']);      // 屋頂
  boxes.push([-3, 20, -3, 6, 4, 6, 'D']);
  boxes.push([-40, 0, -10, 18, 10, 20, 'R']);      // 十字樓翼
  return {
    name: '西門紅樓', scale: 1,
    palette: { R: '#a8453c', W: '#efe6d4', D: '#6b4a3a' },
    boxes,
  };
}

/** 大安森林公園：深綠草毯 + 一圈圈樹叢（扁平地標，靠「綠洲感」辨識） @returns {VoxelModel} */
export function daanPark() {
  const boxes = [];
  boxes.push([-210, 0, -160, 420, 1.5, 320, 'G']); // 草毯
  // 樹叢：偽隨機散佈（固定 pattern，determinism）
  for (let i = 0; i < 40; i++) {
    const a = i * 2.399963;                          // 黃金角散佈
    const r = 30 + (i / 40) * 165;
    const x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r * 0.9;
    const s = 10 + ((i * 7) % 3) * 4;
    boxes.push([x - s / 2, 1.5, z - s / 2, s, 6 + (i % 3) * 3, s, 'T']);
    boxes.push([x - 1.5, 0, z - 1.5, 3, 4, 3, 'K']);
  }
  boxes.push([-25, 0, -25, 50, 3, 50, 'P']);       // 中央小廣場
  return {
    name: '大安森林公園', scale: 1,
    palette: { G: '#6f9e54', T: '#4f7e3e', K: '#7a5a3a', P: '#d8d2c4' },
    boxes,
  };
}
