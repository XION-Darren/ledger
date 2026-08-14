/**
 * charts.js — 零依赖 SVG 图表（环形图 / 柱状图 / 进度环）
 * 所有用户文本经 esc() 转义，防止 XSS。
 */

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 环形图：items = [{label, value, color}]，返回 SVG 字符串 */
export function donut(items, { size = 180, thickness = 26, centerLabel = '', centerSub = '' } = {}) {
  const total = items.reduce((s, it) => s + (Number(it.value) || 0), 0);
  const r = (size - thickness) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const segs = items
    .filter((it) => Number(it.value) > 0)
    .map((it) => {
      const frac = Number(it.value) / (total || 1);
      const seg = `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke="${esc(it.color || '#8E8E93')}" stroke-width="${thickness}"
          stroke-dasharray="${(frac * C).toFixed(2)} ${(C * (1 - frac)).toFixed(2)}"
          stroke-dashoffset="${(-offset * C).toFixed(2)}"
          transform="rotate(-90 ${cx} ${cy})">
          <title>${esc(it.label)}: ${esc(it.value)}</title>
        </circle>`;
      offset += frac;
      return seg;
    })
    .join('');

  return `
  <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(centerLabel || '占比图')}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="${thickness}"/>
    ${segs}
    <text x="${cx}" y="${cy - 2}" text-anchor="middle" class="chart-center-main">${esc(centerLabel)}</text>
    <text x="${cx}" y="${cy + 16}" text-anchor="middle" class="chart-center-sub">${esc(centerSub)}</text>
  </svg>`;
}

/** 双色柱状图：months = [{label, income, expense}] */
export function bars(months, { height = 180 } = {}) {
  const max = Math.max(1, ...months.flatMap((m) => [Number(m.income) || 0, Number(m.expense) || 0]));
  const pad = 26;
  const inner = height - 36;
  const groupW = 44;
  const barW = 16;
  const totalW = Math.max(months.length * groupW, 220);
  const yZero = pad + inner;

  const cols = months
    .map((m, i) => {
      const x = i * groupW + (groupW - 2 * barW - 6) / 2;
      const hInc = ((Number(m.income) || 0) / max) * inner;
      const hExp = ((Number(m.expense) || 0) / max) * inner;
      return `
        <g>
          <rect x="${x}" y="${(yZero - hInc).toFixed(1)}" width="${barW}" height="${hInc.toFixed(1)}" rx="4" fill="#30D158"/>
          <rect x="${x + barW + 6}" y="${(yZero - hExp).toFixed(1)}" width="${barW}" height="${hExp.toFixed(1)}" rx="4" fill="#FF9500"/>
          <text x="${x + barW + 3}" y="${yZero + 18}" text-anchor="middle" class="chart-axis">${esc(m.label)}</text>
        </g>`;
    })
    .join('');

  return `
  <svg viewBox="0 0 ${Math.max(totalW, 280)} ${height}" role="img" aria-label="收支趋势">
    <line x1="0" y1="${yZero}" x2="${totalW}" y2="${yZero}" stroke="rgba(0,0,0,0.1)"/>
    ${cols}
  </svg>`;
}

/** 进度环：percent 0-100 */
export function ring(percent, { size = 120, thickness = 12, color = '#007AFF', label = '' } = {}) {
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent));
  return `
  <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="进度 ${p.toFixed(0)}%">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="${thickness}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="${esc(color)}" stroke-width="${thickness}" stroke-linecap="round"
      stroke-dasharray="${(C * p / 100).toFixed(2)} ${C.toFixed(2)}"
      transform="rotate(-90 ${size / 2} ${size / 2})"/>
    <text x="${size / 2}" y="${size / 2 + 4}" text-anchor="middle" class="ring-pct">${p.toFixed(0)}%</text>
    <text x="${size / 2}" y="${size / 2 + 24}" text-anchor="middle" class="ring-label">${esc(label)}</text>
  </svg>`;
}
