/**
 * views/wishes.js — 愿望账户：目标管理 + 存钱计划
 */

import * as models from '../models.js';
import { esc } from '../charts.js';
import { addGoal, deleteGoal, go, toast, rerender } from '../app.js';

const newGoal = { name: '', target: '', deadline: '' };

export function render(app) {
  const s = app.data.settings || {};
  const income = Number(s.monthlyIncome) || 0;
  let essential = Number(s.monthlyEssential) || 0;
  if (!essential && app.data.transactions.length) {
    essential = models.estimateEssential(app.data.transactions);
  }

  const goals = models.goalProgress(app.data.goals, app.data.transactions);
  const today = models.todayStr();

  const goalCards = goals.length
    ? goals.map((g) => {
        const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
        const plan = models.planGoal(g, { monthlyIncome: income, monthlyEssential: essential }, today);
        const daysLeft = Math.max(0, models.daysBetween(today, g.deadline));
        return `
        <div class="card wish-card" data-gid="${esc(g.id)}">
          <div class="wish-head">
            <h3>${esc(g.name)}</h3>
            <button class="tx-del" data-delgoal="${esc(g.id)}" aria-label="删除愿望">✕</button>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${pct.toFixed(1)}%"></div></div>
          <div class="wish-nums">
            <span>已存 <b>${esc(models.fmtMoney(g.saved))}</b></span>
            <span class="wish-pct">${pct.toFixed(0)}%</span>
            <span>目标 <b>${esc(models.fmtMoney(g.target))}</b></span>
          </div>
          <div class="wish-plan ${plan.ok ? 'ok' : 'warn'}">${esc(plan.note)}</div>
          <div class="wish-actions">
            <button class="btn primary small" data-deposit="${esc(g.id)}">存入一笔</button>
            <span class="wish-sub">剩余 ${esc(models.fmtMoney(g.remain))} · 还差 ${daysLeft} 天</span>
          </div>
        </div>`;
      }).join('')
    : `<div class="card empty-hint">还没有愿望。把想买的东西写下来，按计划存钱实现它吧</div>`;

  return `
  <section class="section">
    <div class="section-head"><h2>我的愿望</h2><button class="link-btn" data-toggle-new>+ 新建愿望</button></div>
    <div class="new-goal-form card" id="new-goal-form" hidden>
      <div class="form-row"><label>愿望名称</label><input type="text" id="goal-name" placeholder="如：换一台新电脑" maxlength="60"></div>
      <div class="form-row"><label>目标金额（元）</label><input type="number" id="goal-target" min="1" step="100" placeholder="如 8000"></div>
      <div class="form-row"><label>目标日期</label><input type="date" id="goal-deadline" min="${esc(models.todayStr())}"></div>
      <button class="btn primary" id="create-goal">创建愿望并生成计划</button>
    </div>
    ${goalCards}
  </section>`;
}

export function bind(app) {
  const toggleNew = document.querySelector('[data-toggle-new]');
  if (toggleNew) {
    toggleNew.addEventListener('click', () => {
      document.getElementById('new-goal-form').hidden = !document.getElementById('new-goal-form').hidden;
    });
  }
  const createGoal = document.getElementById('create-goal');
  if (createGoal) {
    createGoal.addEventListener('click', async () => {
      try {
        await addGoal({
          name: document.getElementById('goal-name').value,
          target: document.getElementById('goal-target').value,
          deadline: document.getElementById('goal-deadline').value,
        });
        toast('愿望已创建，开始按计划存钱吧');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  }

  document.querySelectorAll('[data-deposit]').forEach((b) => {
    b.addEventListener('click', () => {
      sessionStorage.setItem('ledger:goal', b.dataset.deposit);
      go('entry');
    });
  });

  document.querySelectorAll('[data-delgoal]').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('删除该愿望及其所有存入记录？')) return;
      try {
        await deleteGoal(b.dataset.delgoal);
        toast('愿望已删除');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  });
}
