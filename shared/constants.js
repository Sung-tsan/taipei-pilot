// @ts-check
// 三端（server / display / remote）共用常數。

export const PORT = 8443;

/** 空域半徑（公尺），圓心 = 松山機場跑道中心 */
export const WORLD_RADIUS = 10000;

/** server → client ws ping 間隔；連續 2 次無 pong 視為斷線 */
export const HEARTBEAT_MS = 3000;

/** remote 斷線後 slot 保留時間（token 重連可回原 slot） */
export const GRACE_MS = 30000;

/** remote 控制訊息發送頻率（LAN 上 60Hz 毫無壓力，砍掉一截輸入延遲） */
export const INPUT_HZ = 60;

/** display 端：輸入斷流超過此毫秒數視同放手（自動回平） */
export const INPUT_STALE_MS = 500;

export const MAX_SLOTS = 2;

/** 襟翼段數（複雜版控制 + flight-model 共用，單一來源） */
export const MAX_FLAPS = 2;

/** slot 視覺識別（機身色 / 遙控器主題色） */
export const SLOT_COLORS = ['#e0533d', '#3d7be0'];
export const SLOT_NAMES = ['紅機', '藍機'];
