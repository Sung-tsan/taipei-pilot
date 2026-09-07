// @ts-check
// P1-4 plane identity: GLB accent + slot nameplate
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { PlaneEntity } from "../src/display/planes/plane-entity.js";
import { planeSpec } from "../src/display/planes/plane-specs.js";
import { SLOT_COLORS, SLOT_NAMES } from "../shared/constants.js";

const GLB_ATR = { glb: "/models/atr72.glb", lengthM: 27, yaw: 0 };

describe("PlaneEntity P1-4 identity", () => {
  it("has slot nameplate and accent", () => {
    const e0 = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    const e1 = new PlaneEntity(new THREE.Scene(), 1, /** @type {any} */ (GLB_ATR));
    expect(e0.nameplate).not.toBeNull();
    expect(e1.nameplate).not.toBeNull();
    expect(/** @type {any} */ (e0.nameplate).isSprite).toBe(true);
    expect(e0.accent).toBe(SLOT_COLORS[0]);
    expect(e1.accent).toBe(SLOT_COLORS[1]);
    expect(SLOT_NAMES.length).toBe(2);
  });

  it("setVisible toggles nameplate", () => {
    const e = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    e.setVisible(true);
    expect(/** @type {any} */ (e.nameplate).visible).toBe(true);
    e.setVisible(false);
    expect(/** @type {any} */ (e.nameplate).visible).toBe(false);
  });

  it("GLB to voxel clears accent mark, keeps nameplate", () => {
    const glb = new PlaneEntity(new THREE.Scene(), 0, /** @type {any} */ (GLB_ATR));
    expect(() => glb.setModel(planeSpec("t34c").model)).not.toThrow();
    expect(glb._glbAccentMark).toBeNull();
    expect(glb.nameplate).not.toBeNull();
  });

  it("_applyGlbAccent clones material and leans toward accent", () => {
    const e = new PlaneEntity(new THREE.Scene(), 0);
    const mat = new THREE.MeshLambertMaterial({ color: "#ffffff" });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
    const root = new THREE.Group();
    root.add(mesh);
    e._applyGlbAccent(root);
    expect(mesh.material).not.toBe(mat);
    const c = /** @type {THREE.MeshLambertMaterial} */ (mesh.material).color;
    expect(c.r).toBeGreaterThan(c.g);
    expect(c.r).toBeGreaterThan(c.b);
  });

  it("_buildGlbAccentMark creates fin stripe; _clearGlb removes", () => {
    const e = new PlaneEntity(new THREE.Scene(), 1, planeSpec("t34c").model);
    e._buildGlbAccentMark(27);
    expect(e._glbAccentMark).not.toBeNull();
    expect(/** @type {any} */ (e._glbAccentMark).isMesh).toBe(true);
    e._clearGlb();
    expect(e._glbAccentMark).toBeNull();
  });
});
