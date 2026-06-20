// @ts-check
// V4 松山滑行道網路（地面作業的 B1）—— 純資料 + 純尋路，vitest 直測、零 THREE/DOM。
// 換機場＝換這份 graph，引擎零改動（schema 支援他場）。北極星 handoff v4.0-1 P2 / ROADMAP §4 V4。
//
// 座標：節點以「跑道座標」(along, lateral) 表示（公尺）——
//   along ＝沿跑道起飛方向(RWY10→28，+X=heading)；中心 0、兩端 ±length/2。
//   lateral＝垂直跑道，跑道中線 0；**停機坪/航廈在 lateral 負側**（與 airport.js 既有 apron 同側）。
// 轉世界座標靠 nodeWorld(node, runwayDir)（注入 RUNWAY_DIR，保持本檔對 THREE/airport 零依賴）。
//
// 松山真實結構（handoff v4.0-1，代號待對 AIP/FlightAware 微調）：
//   跑道 10/28 單跑道 2605m；南側全長平行滑行道；數條聯絡道/快速脫離道；
//   南側客運航廈停機坪約 6 個登機門；兩端跑道頭 + 中段快速脫離。

/**
 * @typedef {'runway'|'exit'|'hold'|'parallel'|'apron'|'gate'} NodeKind
 *   runway=跑道中線點(含門檻)；exit=快速脫離道接點；hold=等待點(進跑道前)；
 *   parallel=平行滑行道；apron=停機坪滑行線；gate=登機門停機位。
 * @typedef {{ id:string, kind:NodeKind, along:number, lateral:number, label?:string }} TaxiNode
 * @typedef {{ nodes: Map<string, TaxiNode>, edges:[string,string][], adj: Map<string, string[]> }} TaxiGraph
 */

export const DEFAULT_RUNWAY_LENGTH = 2605; // 松山跑道全長（與 airport.js RUNWAY.length 同值）
const PAR_LAT = -90;          // 平行滑行道側距（跑道中線南側）
const HOLD_LAT = -45;         // 等待點（跑道邊與平行道之間）
const APRON_LAT = -200;       // 停機坪滑行線
const GATE_LAT = -290;        // 登機門停機位（貼近航廈；HITL 2026-06-20：原 -250 離航廈太遠、空橋接不到）

/**
 * 機場滑行道節點表（along 依跑道長等比、lateral 固定）。松山＝預設 2605；V5 他場傳各自跑道長。
 * 結構不變（同 id／kind／連通）＝引擎/到場/離場流程零改動，只是按跑道縮放（B1）。
 * @param {number} runwayLength @returns {TaxiNode[]}
 */
function nodeDefs(runwayLength) {
  const HALF = runwayLength / 2;
  const q = HALF * 0.5;        // 快速脫離道在四分點（跑道越短越靠中）
  const aSpread = HALF * 0.23; // 停機坪三接點間距
  const gStep = HALF * 0.077;  // 登機門間距（松山 ≈100m，他場等比）
  return /** @type {TaxiNode[]} */ ([
    // 跑道中線：兩端門檻 + 三個快速脫離接點
    { id: 'r10', kind: 'runway', along: -HALF + 50, lateral: 0, label: 'RWY10 頭' },
    { id: 'x1', kind: 'exit', along: -q, lateral: 0, label: '脫離道 A' },
    { id: 'x2', kind: 'exit', along: 0, lateral: 0, label: '脫離道 B' },
    { id: 'x3', kind: 'exit', along: q, lateral: 0, label: '脫離道 C' },
    { id: 'r28', kind: 'runway', along: HALF - 50, lateral: 0, label: 'RWY28 頭' },
    // 等待點（進跑道前 hold short）
    { id: 'h10', kind: 'hold', along: -HALF + 70, lateral: HOLD_LAT, label: 'RWY10 等待點' },
    { id: 'h28', kind: 'hold', along: HALF - 70, lateral: HOLD_LAT, label: 'RWY28 等待點' },
    // 平行滑行道（南側全長）
    { id: 'pA', kind: 'parallel', along: -HALF + 70, lateral: PAR_LAT },
    { id: 'pB', kind: 'parallel', along: -q, lateral: PAR_LAT },
    { id: 'pC', kind: 'parallel', along: 0, lateral: PAR_LAT },
    { id: 'pD', kind: 'parallel', along: q, lateral: PAR_LAT },
    { id: 'pE', kind: 'parallel', along: HALF - 70, lateral: PAR_LAT },
    // 停機坪滑行線（三接點）
    { id: 'aW', kind: 'apron', along: -aSpread, lateral: APRON_LAT },
    { id: 'aM', kind: 'apron', along: 0, lateral: APRON_LAT },
    { id: 'aE', kind: 'apron', along: aSpread, lateral: APRON_LAT },
    // 6 個登機門
    { id: 'g1', kind: 'gate', along: -2.5 * gStep, lateral: GATE_LAT, label: '1 號門' },
    { id: 'g2', kind: 'gate', along: -1.5 * gStep, lateral: GATE_LAT, label: '2 號門' },
    { id: 'g3', kind: 'gate', along: -0.5 * gStep, lateral: GATE_LAT, label: '3 號門' },
    { id: 'g4', kind: 'gate', along: 0.5 * gStep, lateral: GATE_LAT, label: '4 號門' },
    { id: 'g5', kind: 'gate', along: 1.5 * gStep, lateral: GATE_LAT, label: '5 號門' },
    { id: 'g6', kind: 'gate', along: 2.5 * gStep, lateral: GATE_LAT, label: '6 號門' },
  ]);
}

/** 無向邊（滑行道連通）。 @type {[string,string][]} */
const EDGE_DEFS = [
  // 跑道中線串
  ['r10', 'x1'], ['x1', 'x2'], ['x2', 'x3'], ['x3', 'r28'],
  // 門檻 ↔ 等待點 ↔ 平行道端（進/出跑道）
  ['r10', 'h10'], ['h10', 'pA'], ['r28', 'h28'], ['h28', 'pE'],
  // 快速脫離道：跑道接點 → 平行道
  ['x1', 'pB'], ['x2', 'pC'], ['x3', 'pD'],
  // 平行滑行道串
  ['pA', 'pB'], ['pB', 'pC'], ['pC', 'pD'], ['pD', 'pE'],
  // 平行道 → 停機坪聯絡
  ['pB', 'aW'], ['pC', 'aM'], ['pD', 'aE'],
  // 停機坪滑行線串
  ['aW', 'aM'], ['aM', 'aE'],
  // 登機門 → 最近停機坪接點
  ['g1', 'aW'], ['g2', 'aW'], ['g3', 'aM'], ['g4', 'aM'], ['g5', 'aE'], ['g6', 'aE'],
];

/**
 * 建滑行道 graph（節點 Map + 邊 + 鄰接表）。每次回新物件（呼叫端可安全改）。
 * @param {number} [runwayLength] 跑道全長（m）；缺省＝松山 2605。V5 他場傳各自跑道長 → 等比縮放。
 * @returns {TaxiGraph}
 */
export function makeTaxiwayGraph(runwayLength = DEFAULT_RUNWAY_LENGTH) {
  /** @type {Map<string, TaxiNode>} */
  const nodes = new Map();
  for (const n of nodeDefs(runwayLength)) nodes.set(n.id, { ...n });
  /** @type {Map<string, string[]>} */
  const adj = new Map();
  for (const id of nodes.keys()) adj.set(id, []);
  /** @type {[string,string][]} */
  const edges = [];
  for (const [a, b] of EDGE_DEFS) {
    if (!nodes.has(a) || !nodes.has(b)) continue; // 防呆：壞邊跳過
    edges.push([a, b]);
    adj.get(a)?.push(b);
    adj.get(b)?.push(a);
  }
  return { nodes, edges, adj };
}

/** 兩節點的平面距離（沿跑道座標等距於世界座標，因為只是旋轉）。 @param {TaxiNode} a @param {TaxiNode} b */
export function nodeDist(a, b) {
  return Math.hypot(a.along - b.along, a.lateral - b.lateral);
}

/**
 * 節點 → 世界座標（注入 RUNWAY_DIR 保持本檔零 THREE 依賴）。
 * world = RUNWAY_DIR*along + NORMAL*lateral，NORMAL = (-dir.z, dir.x)（與 airport.js spawnPose 同制）。
 * @param {TaxiNode} node @param {{x:number,z:number}} runwayDir RUNWAY_DIR
 * @returns {{x:number, z:number}}
 */
export function nodeWorld(node, runwayDir) {
  const nx = -runwayDir.z, nz = runwayDir.x;
  return {
    x: runwayDir.x * node.along + nx * node.lateral,
    z: runwayDir.z * node.along + nz * node.lateral,
  };
}

/**
 * 最短路徑（Dijkstra，邊權＝節點距離）。回節點 id 陣列（含起終點）；不可達 → []。
 * @param {TaxiGraph} graph @param {string} fromId @param {string} toId
 * @returns {string[]}
 */
export function shortestPath(graph, fromId, toId) {
  const { nodes, adj } = graph;
  if (!nodes.has(fromId) || !nodes.has(toId)) return [];
  if (fromId === toId) return [fromId];
  /** @type {Map<string, number>} */
  const dist = new Map();
  /** @type {Map<string, string|null>} */
  const prev = new Map();
  const unvisited = new Set(nodes.keys());
  for (const id of nodes.keys()) dist.set(id, Infinity);
  dist.set(fromId, 0);

  while (unvisited.size) {
    // 取未訪問中距離最小者（小圖 O(V²) 足矣）
    let u = null; let best = Infinity;
    for (const id of unvisited) { const d = dist.get(id) ?? Infinity; if (d < best) { best = d; u = id; } }
    if (u === null || best === Infinity) break; // 剩下的都不可達
    if (u === toId) break;
    unvisited.delete(u);
    const uNode = /** @type {TaxiNode} */ (nodes.get(u));
    for (const v of adj.get(u) ?? []) {
      if (!unvisited.has(v)) continue;
      const alt = best + nodeDist(uNode, /** @type {TaxiNode} */ (nodes.get(v)));
      if (alt < (dist.get(v) ?? Infinity)) { dist.set(v, alt); prev.set(v, u); }
    }
  }
  if ((dist.get(toId) ?? Infinity) === Infinity) return [];
  // 回溯：toId → … → fromId（fromId 無 prev → null 收尾），最後反轉。
  /** @type {string[]} */
  const path = [];
  let cur = /** @type {string|null|undefined} */ (toId);
  while (cur != null) { path.unshift(cur); cur = prev.get(cur) ?? null; }
  return path;
}

/** 路徑總長（公尺）。 @param {TaxiGraph} graph @param {string[]} path */
export function pathLength(graph, path) {
  let len = 0;
  for (let i = 1; i < path.length; i++) {
    const a = graph.nodes.get(path[i - 1]); const b = graph.nodes.get(path[i]);
    if (a && b) len += nodeDist(a, b);
  }
  return len;
}

/** 某 kind 的所有節點 id。 @param {TaxiGraph} graph @param {NodeKind} kind */
export function nodesOfKind(graph, kind) {
  return [...graph.nodes.values()].filter((n) => n.kind === kind).map((n) => n.id);
}

/** 登機門 id 清單。 @param {TaxiGraph} graph */
export function gates(graph) { return nodesOfKind(graph, 'gate'); }

/**
 * 離某世界點最近的「跑道脫離接點」id（落地後選哪個脫離道）。
 * @param {TaxiGraph} graph @param {{x:number,z:number}} worldPos @param {{x:number,z:number}} runwayDir
 * @returns {string|null}
 */
export function nearestExit(graph, worldPos, runwayDir) {
  let best = null; let bd = Infinity;
  for (const id of nodesOfKind(graph, 'exit')) {
    const w = nodeWorld(/** @type {TaxiNode} */ (graph.nodes.get(id)), runwayDir);
    const d = Math.hypot(w.x - worldPos.x, w.z - worldPos.z);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/**
 * 離某世界點最近的「任一節點」id（地面任意位置接上 graph 用；含跑道門檻）。
 * @param {TaxiGraph} graph @param {{x:number,z:number}} worldPos @param {{x:number,z:number}} runwayDir
 * @returns {string|null}
 */
export function nearestNode(graph, worldPos, runwayDir) {
  let best = null; let bd = Infinity;
  for (const [id, node] of graph.nodes) {
    const w = nodeWorld(node, runwayDir);
    const d = Math.hypot(w.x - worldPos.x, w.z - worldPos.z);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/**
 * 世界座標 → 跑道座標 {along, lateral}（nodeWorld 的逆；同制 NORMAL=(-dir.z, dir.x)）。
 * @param {{x:number,z:number}} worldPos @param {{x:number,z:number}} runwayDir
 * @returns {{along:number, lateral:number}}
 */
export function runwayCoord(worldPos, runwayDir) {
  const nx = -runwayDir.z, nz = runwayDir.x;
  return {
    along: worldPos.x * runwayDir.x + worldPos.z * runwayDir.z,
    lateral: worldPos.x * nx + worldPos.z * nz,
  };
}

/**
 * 落地後選脫離道（v4.0-2 P1「落地→脫離」）：滾行方向「前方」最近的 exit 節點
 * （6 歲不回頭——永遠往前找下一個脫離道轉出跑道）；前方無 exit → 退回最近 exit。
 * @param {TaxiGraph} graph @param {{x:number,z:number}} worldPos 觸地點（世界）
 * @param {{x:number,z:number}} headingVec 機頭前向＝{sin(heading), -cos(heading)}
 * @param {{x:number,z:number}} runwayDir RUNWAY_DIR
 * @returns {string|null} exit 節點 id（無 exit → null）
 */
export function selectArrivalExit(graph, worldPos, headingVec, runwayDir) {
  const me = runwayCoord(worldPos, runwayDir);
  const sign = Math.sign(headingVec.x * runwayDir.x + headingVec.z * runwayDir.z) || 1; // 沿 along 滾行方向
  const exits = nodesOfKind(graph, 'exit')
    .map((id) => ({ id, node: /** @type {TaxiNode} */ (graph.nodes.get(id)) }));
  if (!exits.length) return null;
  const ahead = exits.filter(({ node }) => (node.along - me.along) * sign > 0); // 前方
  const pool = ahead.length ? ahead : exits;                                    // 無前方→全部（退回最近）
  let best = null; let bd = Infinity;
  for (const { id, node } of pool) {
    const d = Math.abs(node.along - me.along);
    if (d < bd) { bd = d; best = id; }
  }
  return best;
}

/**
 * 塔台指派登機門（v4.0-2 P2）：依到場序輪派（round-robin），每次到場停不同門
 * （變化＝replay 樂趣；deterministic＝可測）。gates 順序＝NODE_DEFS（g1…g6）。
 * @param {TaxiGraph} graph @param {number} seq 到場序（0-based；負值也安全 wrap）
 * @returns {string|null} 指派門 id（無門 → null）
 */
export function assignArrivalGate(graph, seq) {
  const gs = gates(graph);
  if (!gs.length) return null;
  const n = gs.length;
  return gs[((Math.trunc(seq) % n) + n) % n];
}

/** 脫離道相鄰的平行滑行道節點 id（綠線轉出跑道用）。 @param {TaxiGraph} graph @param {string} exitId */
export function exitParallel(graph, exitId) {
  for (const v of graph.adj.get(exitId) ?? []) {
    if (graph.nodes.get(v)?.kind === 'parallel') return v;
  }
  return null;
}

/**
 * 登機門停妥目標姿態（v4.0-2 P3）：世界座標 + 機鼻朝向（nose-in 朝航廈＝−lateral 方向）。
 * departure（spawn at gate）與 arrival（停妥判定）共用同一停機姿態。
 * @param {TaxiNode} gateNode @param {{x:number,z:number}} runwayDir
 * @returns {{x:number, z:number, heading:number}}
 */
export function gateParkPose(gateNode, runwayDir) {
  const w = nodeWorld(gateNode, runwayDir);
  // 朝航廈＝lateral 遞減方向 (runwayDir.z, -runwayDir.x)；heading 使 forward={sin h,-cos h} 對齊之。
  return { x: w.x, z: w.z, heading: Math.atan2(runwayDir.z, runwayDir.x) };
}

/**
 * 是否在指定門「停妥」（v4.0-2 P3 停妥判定）：位置在門框內 + 機鼻朝向對 + 速度≈0。
 * @param {{pos:{x:number,z:number}, heading:number, speed:number}} plane
 * @param {TaxiNode} gateNode @param {{x:number,z:number}} runwayDir
 * @param {{posTol?:number, headingTol?:number, speedTol?:number}} [opts]
 *   posTol＝門框半徑(m)；headingTol＝朝向容差(rad)；speedTol＝視為靜止的速度(m/s)
 * @returns {boolean}
 */
export function isParkedAtGate(plane, gateNode, runwayDir, opts = {}) {
  // 容差偏寬（6 歲）：飛機沿 apron→gate 斜進，朝向約 ±45° 仍算 nose-in；只擋「背對/側對」。
  const { posTol = 25, headingTol = 1.0, speedTol = 1.5 } = opts;
  if (plane.speed > speedTol) return false;
  const pose = gateParkPose(gateNode, runwayDir);
  if (Math.hypot(plane.pos.x - pose.x, plane.pos.z - pose.z) > posTol) return false;
  const dh = Math.atan2(Math.sin(plane.heading - pose.heading), Math.cos(plane.heading - pose.heading));
  return Math.abs(dh) <= headingTol;
}

/**
 * 到場滑行路線：落地脫離接點 → 指定登機門（節點 id 路徑）。
 * @param {TaxiGraph} graph @param {string} exitId @param {string} gateId
 */
export function arrivalRoute(graph, exitId, gateId) { return shortestPath(graph, exitId, gateId); }

/**
 * 離場滑行路線：登機門 → 指定跑道頭等待點（pushback 後 taxi 到跑道頭）。
 * @param {TaxiGraph} graph @param {string} gateId @param {'r10'|'r28'} runwayEnd
 */
export function departureRoute(graph, gateId, runwayEnd) {
  const hold = runwayEnd === 'r28' ? 'h28' : 'h10';
  return shortestPath(graph, gateId, hold);
}

/** 路徑 → 世界座標折線（跟我車/中線燈高亮用）。 @param {TaxiGraph} graph @param {string[]} path @param {{x:number,z:number}} runwayDir */
export function routeWorldPoints(graph, path, runwayDir) {
  return path.map((id) => nodeWorld(/** @type {TaxiNode} */ (graph.nodes.get(id)), runwayDir)).filter(Boolean);
}

/** 圖是否全連通（從任一節點 BFS 能到所有節點）。 @param {TaxiGraph} graph */
export function isConnected(graph) {
  const ids = [...graph.nodes.keys()];
  if (ids.length === 0) return true;
  const seen = new Set([ids[0]]);
  const queue = [ids[0]];
  while (queue.length) {
    const u = /** @type {string} */ (queue.shift());
    for (const v of graph.adj.get(u) ?? []) if (!seen.has(v)) { seen.add(v); queue.push(v); }
  }
  return seen.size === ids.length;
}
