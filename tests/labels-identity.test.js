// @ts-check
// P1-4 labels: multiline airport nameplate + world-space distance
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { LandmarkLabels, makeTextSprite } from "../src/display/render/labels.js";

describe("labels P1-4 identity", () => {
  it("airport sprite larger than landmark", () => {
    const apt = makeTextSprite("KHH\nRCKH", { kind: "airport" });
    const lm = makeTextSprite("crane", { kind: "landmark" });
    const pl = makeTextSprite("P1", { kind: "plane", fill: "#e0533d" });
    expect(/** @type {any} */ (apt).isSprite).toBe(true);
    expect(/** @type {any} */ (lm).isSprite).toBe(true);
    expect(/** @type {any} */ (pl).isSprite).toBe(true);
    expect(apt.scale.x).toBeGreaterThan(lm.scale.x);
  });

  it("LandmarkLabels distance uses world position under parent yaw", () => {
    const parent = new THREE.Group();
    parent.rotation.y = Math.PI / 2;
    parent.updateMatrixWorld(true);
    const labels = new LandmarkLabels(parent, [
      { id: "a", name: "TPE\nRCTP", x: 100, z: 0, topY: 20, clear: 100, kind: "airport",
        aabb: { minX: 0, maxX: 0, minZ: 0, maxZ: 0, h: 20 } },
    ]);
    const wp = new THREE.Vector3();
    labels.items[0].sprite.getWorldPosition(wp);
    labels.update([{ x: wp.x, z: wp.z }]);
    expect(labels.items[0].d).toBeLessThan(5);
    expect(labels.items[0].sprite.visible).toBe(true);
  });
});
