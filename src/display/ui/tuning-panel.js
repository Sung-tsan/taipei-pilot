// @ts-check
// v5.2 調參面板 UI（dev 工具）：F2 開關（或網址加 ?tune=1 直接開）。
// 拉桿即時生效 + localStorage 暫存（重整仍在）+ 📋 匯出定稿值 + 還原預設。
// 孩子不會誤開（F2/URL 參數），家長/開發校完把匯出值寫回源頭常數＝定稿。
import { TUNING, KNOBS, applyKnob, saveTuning, resetTuning, exportTuning } from '../tuning.js';

/** 建面板（附進 body、預設隱藏）；回傳 { toggle }。 */
export function initTuningPanel() {
  const el = document.createElement('div');
  el.id = 'tuningPanel';
  el.style.cssText = [
    'position:fixed', 'right:12px', 'top:56px', 'z-index:60', 'display:none',
    'background:rgba(20,26,40,.94)', 'color:#f2ecdc', 'padding:14px 16px', 'border-radius:12px',
    'font:13px/1.6 "PingFang TC", sans-serif', 'min-width:280px', 'box-shadow:0 6px 24px rgba(0,0,0,.4)',
  ].join(';');
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">🎛 手感調參（dev）<span style="float:right;opacity:.6;font-weight:400">F2 關</span></div>
    <div id="tuneRows"></div>
    <div style="margin-top:10px;display:flex;gap:8px">
      <button id="tuneExport" style="flex:1">📋 匯出定稿值</button>
      <button id="tuneReset" style="flex:1">↩️ 還原預設</button>
    </div>
    <div id="tuneMsg" style="margin-top:6px;font-size:11px;opacity:.7">調完請回報給 Claude 寫回源頭常數定稿</div>`;
  document.body.appendChild(el);

  const rows = /** @type {HTMLElement} */ (el.querySelector('#tuneRows'));
  for (const k of KNOBS) {
    const row = document.createElement('label');
    row.style.cssText = 'display:block;margin:6px 0';
    row.innerHTML = `<span>${k.label}</span>
      <span style="float:right" data-val="${k.key}">${(/** @type {any} */ (TUNING)[k.key])}</span>
      <input type="range" min="${k.min}" max="${k.max}" step="${k.step}" value="${(/** @type {any} */ (TUNING)[k.key])}" data-knob="${k.key}" style="width:100%">`;
    rows.appendChild(row);
  }
  rows.addEventListener('input', (e) => {
    const t = /** @type {HTMLInputElement} */ (e.target);
    const key = t.getAttribute('data-knob');
    if (!key) return;
    applyKnob(key, Number(t.value));
    const v = el.querySelector(`[data-val="${key}"]`);
    if (v) v.textContent = t.value;
    saveTuning();
  });
  /** @type {HTMLElement} */ (el.querySelector('#tuneExport')).addEventListener('click', () => {
    const json = exportTuning();
    try { navigator.clipboard?.writeText(json); } catch { /* ignore */ }
    console.log('[tuning export]', json);
    /** @type {HTMLElement} */ (el.querySelector('#tuneMsg')).textContent = '✅ 已複製到剪貼簿（也印在 console）';
  });
  /** @type {HTMLElement} */ (el.querySelector('#tuneReset')).addEventListener('click', () => {
    resetTuning();
    for (const k of KNOBS) {
      const input = /** @type {HTMLInputElement|null} */ (el.querySelector(`[data-knob="${k.key}"]`));
      const val = el.querySelector(`[data-val="${k.key}"]`);
      if (input) input.value = String(/** @type {any} */ (TUNING)[k.key]);
      if (val) val.textContent = String(/** @type {any} */ (TUNING)[k.key]);
    }
  });

  const toggle = () => { el.style.display = el.style.display === 'none' ? 'block' : 'none'; };
  window.addEventListener('keydown', (e) => { if (e.code === 'F2') { e.preventDefault(); toggle(); } });
  if (new URLSearchParams(location.search).get('tune') === '1') el.style.display = 'block';
  return { toggle };
}
