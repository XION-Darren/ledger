/**
 * views/home.js — 首页：本月概览 + 最近记录
 */

import * as models from '../models.js';
import { esc } from '../charts.js';
import { go, deleteTransaction, toast, rerender } from '../app.js';

export function render(app) {
  const m = models.monthKey(models.todayStr());
  const s = models.summarize(app.data.transactions, m);
  const net = s.income - s.expense - s.deposit;

  const recent = [...app.data.transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt)
    .slice(0, 10);

  const list = recent.length
    ? recent.map((t) => {
        const label = models.accountLabel(t.type, t.account);
        const icon = t.type === 'income'
          ? (models.INCOME_ACCOUNTS[t.account] || {}).icon
          : (models.ACCOUNTS[t.account] || {}).icon;
        const sign = t.type === 'expense' ? '-' : '+';
        const color = t.type === 'income' ? '#30D158' : t.type === 'deposit' ? '#AF52DE' : '#1C1C1E';
        return `
        <div class="tx-row" data-id="${esc(t.id)}">
          <div class="tx-icon">${icon || '📌'}</div>
          <div class="tx-main">
            <div class="tx-note">${esc(t.note || label)}</div>
            <div class="tx-sub">${esc(label)} · ${esc(t.date)}${t.payMethod ? ' · ' + esc(t.payMethod) : ''}</div>
          </div>
          <div class="tx-amount" style="color:${color}">${sign}${esc(models.fmtMoney(t.amount).replace('¥', ''))}</div>
          <button class="tx-del" data-del="${esc(t.id)}" aria-label="删除">✕</button>
        </div>`;
      }).join('')
    : `<div class="empty-hint">还没有记录，点下方「记一笔」开始吧</div>`;

  const diff = s.income - s.expense;
  const diffCls = diff >= 0 ? 'positive' : 'negative';

  return `
  <section class="card hero">
    <div class="hero-label">本月结余</div>
    <div class="hero-net">${esc(models.fmtMoney(net))}</div>
    <div class="hero-row">
      <div><span class="hero-dot in"></span>收入 <b>${esc(models.fmtMoney(s.income))}</b></div>
      <div><span class="hero-dot out"></span>支出 <b>${esc(models.fmtMoney(s.expense))}</b></div>
      <div class="${diffCls}">存愿望 <b>${esc(models.fmtMoney(s.deposit))}</b></div>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>最近记录</h2><button class="link-btn" data-goto="reports">全部报表 ›</button></div>
    <div class="card list-card">${list}</div>
  </section>

  <button class="fab" data-goto="entry" aria-label="记一笔">
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>`;
}

export function bind(app) {
  document.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.goto));
  });
  document.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = b.dataset.del;
      if (!confirm('删除这条记录？')) return;
      try {
        await deleteTransaction(id);
        toast('已删除');
        rerender();
      } catch (err) {
        toast(err.message, 'err');
      }
    });
  });
}
