// @ts-check
// V3 天氣渲染 —— modulate world.js 既有 sky/fog/light/cloud（不重造），+ THREE.Points 雨。
// 套件先行（工法基準）：霧用內建 THREE.Fog、雨用 three 原生 THREE.Points 粒子，不自寫 shader/粒子引擎。
// 天氣型別/roll/後果閘在 weather.js（純邏輯、已測）；本檔只把 type → 視覺。
import * as THREE from 'three';

/**
 * 各天氣的視覺參數：fog 遠近/色、光照倍率、天空染色、雲顯隱。
 * @type {Record<string,{near:number,far:number,color:string,light:number,dome:number,clouds:boolean}>}
 */
const LOOK = {
  clear:  { near: 2500, far: 4800, color: '#bfe0ef', light: 1.00, dome: 1.00, clouds: false },
  cloudy: { near: 1700, far: 3900, color: '#ccd6dd', light: 0.82, dome: 0.80, clouds: true },
  rain:   { near: 800,  far: 2500, color: '#9aa7b1', light: 0.62, dome: 0.62, clouds: true },
  fog:    { near: 180,  far: 1250, color: '#c8d0d4', light: 0.58, dome: 0.70, clouds: false },
};
const RAIN_N = 1400;
const RAIN_SPAN = { x: 700, y: 520, z: 700 };
const RAIN_FALL = 240; // m/s
/** 日夜中性參數（白天，不 modulate）；apply 第二參數缺省用它 */
const DAY_NEUTRAL = { sunMul: 1, hemiMul: 1, sunColor: '#fff2dc', skyTint: '#bfe0ef', tintAmt: 0 };

export class WeatherRenderer {
  /** @param {THREE.Scene} scene world.js 的 scene */
  constructor(scene) {
    this.scene = scene;
    this.fog = /** @type {THREE.Fog|null} */ (scene.fog && 'near' in scene.fog ? scene.fog : null);
    this.clouds = scene.getObjectByName('clouds');
    this.skydome = /** @type {THREE.Mesh|null} */ (scene.getObjectByName('skydome') || null);
    /** @type {any} 場景燈（dynamic，用 any 免去型別噪音） */ let sun = null;
    /** @type {any} */ let hemi = null;
    scene.traverse((o) => {
      const a = /** @type {any} */ (o);
      if (a.isDirectionalLight) sun = a;
      if (a.isHemisphereLight) hemi = a;
    });
    this.sun = sun;
    this.hemi = hemi;
    this.baseSun = sun ? sun.intensity : 1.25;
    this.baseHemi = hemi ? hemi.intensity : 0.95;
    this.type = 'clear';
    this._center = { x: 0, y: 0, z: 0 };
    this.rain = this._buildRain(); // constructor 直接賦值（TS 認得確定初始化）
  }

  /** @returns {THREE.Points} */
  _buildRain() {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN_N * 3);
    for (let i = 0; i < RAIN_N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * RAIN_SPAN.x;
      pos[i * 3 + 1] = Math.random() * RAIN_SPAN.y;
      pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_SPAN.z;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.Points(geo, new THREE.PointsMaterial({
      color: '#cfe0ee', size: 2.4, transparent: true, opacity: 0.7, depthWrite: false,
    }));
    rain.visible = false;
    rain.frustumCulled = false; // 跟焦點移動，別被裁掉
    this.scene.add(rain);
    return rain;
  }

  /**
   * 套用天氣 + 日夜（compose 在一次呼叫，避免重複套用累乘）。
   * @param {string} type 天氣型別
   * @param {{sunMul:number,hemiMul:number,sunColor:string,skyTint:string,tintAmt:number}} [day] 日夜參數（缺＝白天中性）
   */
  apply(type, day = DAY_NEUTRAL) {
    const L = LOOK[type] ?? LOOK.clear;
    this.type = type;
    // 天色＝weather 霧色 混入 日夜天色（夜＝深藍）
    const skyCol = new THREE.Color(L.color).lerp(new THREE.Color(day.skyTint), day.tintAmt);
    if (this.fog) { this.fog.near = L.near; this.fog.far = L.far; this.fog.color.copy(skyCol); }
    const bg = /** @type {any} */ (this.scene.background);
    if (bg && bg.copy) bg.copy(skyCol);
    if (this.sun) { this.sun.intensity = this.baseSun * L.light * day.sunMul; this.sun.color.set(day.sunColor); }
    if (this.hemi) this.hemi.intensity = this.baseHemi * L.light * day.hemiMul;
    if (this.clouds) this.clouds.visible = L.clouds;
    // 天空圓頂：weather 染灰 × 日夜天色（夜壓暗變藍）
    if (this.skydome) /** @type {THREE.MeshBasicMaterial} */ (this.skydome.material).color.copy(skyCol).multiplyScalar(L.dome);
    this.rain.visible = type === 'rain';
  }

  /** 每幀：雨下落 + 跟焦點（飛機/相機）移動。 @param {number} dt @param {{x:number,y:number,z:number}} [focus] */
  update(dt, focus) {
    if (!this.rain.visible) return;
    if (focus) this._center = focus;
    const arr = /** @type {Float32Array} */ (this.rain.geometry.attributes.position.array);
    const fall = RAIN_FALL * dt;
    for (let i = 1; i < arr.length; i += 3) { arr[i] -= fall; if (arr[i] < 0) arr[i] += RAIN_SPAN.y; }
    this.rain.geometry.attributes.position.needsUpdate = true;
    this.rain.position.set(this._center.x, this._center.y - RAIN_SPAN.y * 0.45, this._center.z);
  }
}
