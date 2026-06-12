// @ts-check
// 分屏渲染：1 人滿版、2 人左右分屏（setScissorTest，同 scene 兩台相機各畫一次）。
import * as THREE from 'three';

export class ViewportRenderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false }); // 硬邊像素風
    // Retina 全解析度（之前 pixelRatio=1 在 2x 螢幕上等於半解析度 → 整體發糊）
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
  }

  /**
   * @param {THREE.Scene} scene
   * @param {{ cam: THREE.PerspectiveCamera }[]} views 1 或 2 個
   */
  render(scene, views) {
    const W = window.innerWidth, H = window.innerHeight;
    const r = this.renderer;
    if (views.length <= 1) {
      r.setScissorTest(false);
      r.setViewport(0, 0, W, H);
      if (views[0]) {
        setAspect(views[0].cam, W / H);
        r.render(scene, views[0].cam);
      }
      return;
    }
    r.setScissorTest(true);
    const half = Math.floor(W / 2);
    const rects = [
      [0, 0, half - 1, H],
      [half + 1, 0, W - half - 1, H],
    ];
    views.slice(0, 2).forEach((v, i) => {
      const [x, y, w, h] = rects[i];
      r.setViewport(x, y, w, h);
      r.setScissor(x, y, w, h);
      setAspect(v.cam, w / h);
      r.render(scene, v.cam);
    });
    r.setScissorTest(false);
  }

  get info() {
    return this.renderer.info;
  }
}

/**
 * @param {THREE.PerspectiveCamera} cam @param {number} aspect
 */
function setAspect(cam, aspect) {
  if (Math.abs(cam.aspect - aspect) > 1e-3) {
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
  }
}
