// @ts-check
// v5.2 排隊環境機：scripted 起飛運動學（停一拍→加速→抬頭爬升→despawn），THREE.Scene 直測。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AmbientDeparture } from '../src/display/scene/ambient-departure.js';

const DIR = { x: Math.sin((100 * Math.PI) / 180), z: -Math.cos((100 * Math.PI) / 180) }; // 松山 RWY10

describe('AmbientDeparture — hold short 前面那架', () => {
  it('start 後啟用、初始在跑道頭且停一拍不動', () => {
    const a = new AmbientDeparture(new THREE.Scene());
    expect(a.active).toBe(false);
    a.start(DIR, 2605);
    expect(a.active).toBe(true);
    const g = /** @type {any} */ (a.group);
    const p0 = g.position.clone();
    a.update(0.3); // 停一拍窗內
    expect(g.position.distanceTo(p0)).toBeLessThan(1e-6);
  });

  it('沿跑道方向加速、達 Vr 後爬升、爬到高度 despawn', () => {
    const a = new AmbientDeparture(new THREE.Scene());
    a.start(DIR, 2605);
    const g = /** @type {any} */ (a.group);
    const p0 = g.position.clone();
    for (let i = 0; i < 60; i++) a.update(1 / 30); // 2s：滾行中
    const moved = { x: g.position.x - p0.x, z: g.position.z - p0.z };
    const along = moved.x * DIR.x + moved.z * DIR.z;
    const lateral = Math.abs(moved.x * -DIR.z + moved.z * DIR.x);
    expect(along).toBeGreaterThan(2);      // 往跑道方向前進
    expect(lateral).toBeLessThan(1e-6);    // 不歪出跑道
    for (let i = 0; i < 60 * 40 && a.active; i++) a.update(1 / 30); // 跑到 despawn
    expect(a.active).toBe(false);          // 爬到高度自動收掉
  });

  it('重複 start 一次一架、clear 冪等不爆', () => {
    const scene = new THREE.Scene();
    const a = new AmbientDeparture(scene);
    a.start(DIR, 2605);
    const g1 = a.group;
    a.start(DIR, 2605);
    expect(a.group).toBe(g1); // 已在飛＝忽略
    a.clear();
    expect(a.active).toBe(false);
    expect(() => a.clear()).not.toThrow();
    expect(() => a.update(0.033)).not.toThrow();
  });
});
