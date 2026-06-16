// @ts-check
// V4 松山滑行道網路：純資料 + 純尋路（連通性 / 最短路 / 到場·離場路線 / 世界座標轉換）。
import { describe, it, expect } from 'vitest';
import {
  makeTaxiwayGraph, shortestPath, pathLength, gates, nodesOfKind,
  nearestExit, arrivalRoute, departureRoute, routeWorldPoints, nodeWorld, isConnected,
} from '../src/display/scene/taxiway.js';

// 跑道方向（heading 100°，與 airport.js RUNWAY_DIR 同制）
const RUNWAY_DIR = { x: Math.sin((100 * Math.PI) / 180), z: -Math.cos((100 * Math.PI) / 180) };

describe('松山滑行道網路', () => {
  it('graph 全連通（每個節點都互達）', () => {
    expect(isConnected(makeTaxiwayGraph())).toBe(true);
  });

  it('恰有 6 個登機門 + 3 個快速脫離接點', () => {
    const g = makeTaxiwayGraph();
    expect(gates(g)).toHaveLength(6);
    expect(nodesOfKind(g, 'exit')).toHaveLength(3);
    expect(nodesOfKind(g, 'runway')).toHaveLength(2); // r10 / r28 兩門檻
  });

  it('每個登機門都能從兩端跑道頭到達（到場可達性）', () => {
    const g = makeTaxiwayGraph();
    for (const gate of gates(g)) {
      expect(shortestPath(g, 'r10', gate).length).toBeGreaterThan(1);
      expect(shortestPath(g, 'r28', gate).length).toBeGreaterThan(1);
    }
  });

  it('最短路：起終點正確、節點相鄰（路徑連續）', () => {
    const g = makeTaxiwayGraph();
    const path = shortestPath(g, 'x2', 'g4'); // 中段脫離道 → 4 號門
    expect(path[0]).toBe('x2');
    expect(path.at(-1)).toBe('g4');
    // 路徑每一步都是 graph 上的相鄰邊
    for (let i = 1; i < path.length; i++) {
      expect(g.adj.get(path[i - 1])).toContain(path[i]);
    }
    expect(pathLength(g, path)).toBeGreaterThan(0);
  });

  it('到場路線 arrivalRoute：脫離道 → gate；離場路線 departureRoute：gate → 跑道頭等待點', () => {
    const g = makeTaxiwayGraph();
    const arr = arrivalRoute(g, 'x1', 'g1');
    expect(arr[0]).toBe('x1');
    expect(arr.at(-1)).toBe('g1');
    const dep = departureRoute(g, 'g6', 'r28');
    expect(dep[0]).toBe('g6');
    expect(dep.at(-1)).toBe('h28'); // 到 RWY28 等待點 hold short
  });

  it('nearestExit：落地點選最近脫離道', () => {
    const g = makeTaxiwayGraph();
    // x3 的世界座標附近 → 應選 x3
    const wx3 = nodeWorld(/** @type {any} */ (g.nodes.get('x3')), RUNWAY_DIR);
    expect(nearestExit(g, wx3, RUNWAY_DIR)).toBe('x3');
  });

  it('nodeWorld：along 沿 RUNWAY_DIR、lateral 沿法線；routeWorldPoints 對齊路徑長度', () => {
    const g = makeTaxiwayGraph();
    // r10 在 along 負側 → 世界座標應落在 -RUNWAY_DIR 方向（西端）
    const w10 = nodeWorld(/** @type {any} */ (g.nodes.get('r10')), RUNWAY_DIR);
    expect(Math.sign(w10.x)).toBe(Math.sign(-RUNWAY_DIR.x));
    const path = shortestPath(g, 'r10', 'g3');
    expect(routeWorldPoints(g, path, RUNWAY_DIR)).toHaveLength(path.length);
  });

  it('防呆：未知節點 → 空路徑、相同起終點 → 單點', () => {
    const g = makeTaxiwayGraph();
    expect(shortestPath(g, 'nope', 'g1')).toEqual([]);
    expect(shortestPath(g, 'g1', 'nope')).toEqual([]);
    expect(shortestPath(g, 'g1', 'g1')).toEqual(['g1']);
  });
});
