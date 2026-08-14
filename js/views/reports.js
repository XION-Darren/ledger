/**
 * views/reports.js — 报表：分类占比、收支趋势、CSV 导出
 */

import * as models from '../models.js';
import { donut, bars, esc } from '../charts.js';
import { rerender } from '../app.js';

const state = { month: models.monthKey(models.todayStr()) };

export function render(app) {
  const s = models.summarize(app.data.transactions, state.month);

  const acctItems = Object.entries(models.ACCOUNTS)
    .map(([key, a]) => ({ key, ...a, value: s.byAccount[key] || 0 }))
    .filter((it) => it.value > 0)
    .sort((a, b) => b.value - a.value);

  const donutSvg = donut(acctItems.map(({ name, value, color }) => ({ label: name, value, color })), {
    centerLabel: models.fmtMoney(s.expense).replace('¥', ''),
    centerSub: '本月支出',
  });

  const legend = acctItems.length
    ? acctItems.map((it) => `
        <div class="legend-row">
          <span class="legend-dot" style="background:${esc(it.color)}"></span>
          <span class="legend-name">${esc(it.name)}</span>
          <span class="legend-val">${esc(models.fmtMoney(it.value))}</span>
          <span class="legend-pct">${((it.value / (s.expense || 1)) * 100).toFixed(1)}%</span>
        </div>`).join('')
    : '<div class="empty-hint">本月暂无支出</div>';

  // 近 6 个月趋势
  const months6 = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const ms = models.summarize(app.data.transactions, mk);
    months6.push({ label: `${d.getMonth() + 1}月`, income: ms.income, expense: ms.expense });
  }

  const net = s.income - s.expense - s.deposit;

  const insights = models.generateInsights(app.data.transactions);

  return `
  <div class="month-nav">
    <button class="icon-btn" data-month-dir="-1" aria-label="上一月">‹</button>
    <div class="month-title">${esc(state.month)}</div>
    <button class="icon-btn" data-month-dir="1" aria-label="下一月">›</button>
  </div>

  <section class="card hero mini">
    <div class="hero-row">
      <div><span class="hero-dot in"></span>收入 <b>${esc(models.fmtMoney(s.income))}</b></div>
      <div><span class="hero-dot out"></span>支出 <b>${esc(models.fmtMoney(s.expense))}</b></div>
      <div>结余 <b class="${net >= 0 ? 'positive' : 'negative'}">${esc(models.fmtMoney(net))}</b></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>支出构成（${esc(state.month)}）</h2></div>
    <div class="card chart-card">
      <div class="donut-wrap">${donutSvg}</div>
      <div class="legend">${legend}</div>
    </div>
    ${insightBlock('ins-comp', '支出小结', insights.composition)}
  </section>

  <section class="section">
    <div class="section-head"><h2>近 6 个月趋势</h2></div>
    <div class="card chart-card">
      ${bars(months6)}
      <div class="trend-legend"><span class="trend-dot inc"></span>收入 <span class="trend-dot exp"></span>支出</div>
    </div>
    ${insightBlock('ins-trend', '趋势小结', insights.trend)}
  </section>`;
}

function insightBlock(id, title, insight) {
  return `
  <div class="insight-head collapsible" data-collapse="${id}">
    <span class="insight-title">💡 ${esc(title)}</span><span class="chev">›</span>
  </div>
  <div class="collapsible-body" id="${id}" hidden>
    <div class="card insight-card">
      <div class="insight-summary">${esc(insight.summary)}</div>
      ${insight.advice.length ? `<div class="insight-advice">${insight.advice.map((a) => `<div class="insight-advice-line">· ${esc(a)}</div>`).join('')}</div>` : ''}
    </div>
  </div>`;
}

export function bind(app) {
  // 折叠小结
  document.querySelectorAll('[data-collapse]').forEach((head) => {
    head.addEventListener('click', () => {
      const body = document.getElementById(head.dataset.collapse);
      if (!body) return;
      body.hidden = !body.hidden;
      head.classList.toggle('open', !body.hidden);
    });
  });

  document.querySelectorAll('[data-month-dir]').forEach((b) => {
    b.addEventListener('click', () => {
      const [y, mo] = state.month.split('-').map(Number);
      const d = new Date(y, mo - 1 + Number(b.dataset.monthDir), 1);
      state.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      rerender();
    });
  });
}
