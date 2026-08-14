/**
 * views/home.js — 首页：本月概览 + 最近记录
 */

import * as models from '../models.js';
import { esc } from '../charts.js';
import { go, deleteTransaction, toast, rerender, persist } from '../app.js';

export function render(app) {
  const m = models.monthKey(models.todayStr());
  const s = models.summarize(app.data.transactions, m);
  const net = s.income - s.expense - s.deposit;

  // 能力配置（月收入 - 必要开销 = 可支配，供愿望计划用）
  const settings = app.data.settings || {};
  const income = Number(settings.monthlyIncome) || 0;
  let essential = Number(settings.monthlyEssential) || 0;
  if (!essential && app.data.transactions.length) {
    essential = models.estimateEssential(app.data.transactions);
  }
  const affordable = Math.max(0, income - essential);
  const abilityConfigured = !!(income || essential);

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
          <div class="tx-icon">${icon || '记'}</div>
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

  <section class="card ability-card">
    <div class="ability-head">
      <div>
        <div class="ability-label">每月可支配</div>
        <div class="ability-amount">${income ? esc(models.fmtMoney(affordable)) : '—'}</div>
      </div>
      <button class="link-btn" data-toggle-ability>${abilityConfigured ? '调整 ›' : '设置 ›'}</button>
    </div>
    <div class="ability-meta">${income ? `月收入 ${esc(models.fmtMoney(income))}` : '未设收入'}${essential ? ` · 必要开销 ${esc(models.fmtMoney(essential))}` : ''}</div>
    <div class="ability-form" id="ability-form" hidden>
      <div class="form-row"><label>月收入（元）</label><input type="number" id="set-income" min="0" step="100" value="${income || ''}" placeholder="如 8000"></div>
      <div class="form-row"><label>月必要开销（元）</label><input type="number" id="set-essential" min="0" step="100" value="${essential || ''}" placeholder="留空则按近 3 个月自动估算"></div>
      <button class="btn primary small" id="save-ability">保存</button>
    </div>
  </section>

  <section class="section">
    <div class="section-head"><h2>最近记录</h2><button class="link-btn" data-goto="reports">全部报表 ›</button></div>
    <div class="card list-card">${list}</div>
  </section>

  <button class="fab" data-goto="entry" aria-label="记一笔">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="white" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
  </button>`;
}

export function bind(app) {
  document.querySelectorAll('[data-goto]').forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.goto));
  });
  const toggleAbility = document.querySelector('[data-toggle-ability]');
  if (toggleAbility) {
    toggleAbility.addEventListener('click', () => {
      const form = document.getElementById('ability-form');
      if (form) form.hidden = !form.hidden;
    });
  }
  const saveAbility = document.getElementById('save-ability');
  if (saveAbility) {
    saveAbility.addEventListener('click', async () => {
      const incomeVal = parseFloat(document.getElementById('set-income').value) || 0;
      const essentialRaw = document.getElementById('set-essential').value;
      const essentialVal = essentialRaw === '' ? null : parseFloat(essentialRaw) || 0;
      try {
        await persist((d) => {
          d.settings = { ...(d.settings || {}), monthlyIncome: incomeVal, monthlyEssential: essentialVal };
        });
        toast('能力配置已保存');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  }
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
