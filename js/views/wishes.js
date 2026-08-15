/**
 * views/wishes.js — 愿望账户：目标管理 + 存钱计划
 */

import * as models from '../models.js';
import { esc } from '../charts.js';
import { addGoal, deleteGoal, addTransaction, go, toast, rerender } from '../app.js';

const newGoal = { name: '', target: '', deadline: '' };

export function render(app) {
  const s = app.data.settings || {};
  // 本月可支配 = 当月实际收入汇总 − 月必要开销（未设则按近 3 个月估算）
  const cur = models.monthKey(models.todayStr());
  const curSum = models.summarize(app.data.transactions, cur);
  const income = curSum.income;
  let essential = Number(s.monthlyEssential) || 0;
  if (!essential && app.data.transactions.length) {
    essential = models.estimateEssential(app.data.transactions);
  }

  const goals = models.goalProgress(app.data.goals, app.data.transactions);
  const today = models.todayStr();
  const goalCards = goals.length
    ? goals.map((g) => {
        const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
        const plan = g.achieved
          ? { ok: true, note: `目标已达成，当前进度 ${pct.toFixed(0)}%（可继续存入或开始新愿望）` }
          : models.planGoal(g, { monthlyIncome: income, monthlyEssential: essential }, today);
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
    : `<div class="card empty-hint">还没有愿望。把想买的东西写下来，按计划存钱实现它吧 ✨</div>`;

  const fundBalance = models.wishFundBalance(app.data.transactions);

  return `
  <div class="card fund-balance-card">
    <div class="fund-label">愿望基金总余额</div>
    <div class="fund-amount">${esc(models.fmtMoney(fundBalance))}</div>
    <div class="fund-sub">全部存入 − 愿望支出，持续累计</div>
  </div>

  <section class="section">
    <div class="section-head"><h2>我的愿望</h2><button class="link-btn" data-toggle-new>+ 新建愿望</button></div>
    <div class="new-goal-form card" id="new-goal-form" hidden>
      <div class="form-row"><label>愿望名称</label><input type="text" id="goal-name" placeholder="如：换一台新电脑" maxlength="60"></div>
      <div class="form-row"><label>目标金额（元）</label><input type="number" id="goal-target" min="1" step="100" placeholder="如 8000"></div>
      <div class="form-row"><label>目标日期</label><input type="date" id="goal-deadline" min="${esc(models.todayStr())}"></div>
      <button class="btn primary" id="create-goal">创建愿望并生成计划</button>
    </div>
    ${goalCards}
  </section>

  <div class="modal-overlay" id="deposit-modal" hidden>
    <div class="modal-card">
      <div class="modal-title">存入愿望</div>
      <div class="modal-sub" id="modal-goal-name"></div>
      <div class="modal-amount"><span class="amount-cur">¥</span><span id="modal-amount-text">0</span></div>
      <div class="numpad modal-numpad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="num" data-num="${n}">${n}</button>`).join('')}
        <button class="num" data-num=".">.</button>
        <button class="num" data-num="0">0</button>
        <button class="num del" data-del aria-label="退格">⌫</button>
      </div>
      <div class="modal-actions">
        <button class="btn outline" id="modal-cancel">取消</button>
        <button class="btn primary" id="modal-confirm">确认存入</button>
      </div>
    </div>
  </div>`;
}

export function bind(app) {
  const modal = { goalId: null, amount: '' };

  // 存入一笔 → 弹出金额输入（不跳转）
  document.querySelectorAll('[data-deposit]').forEach((b) => {
    b.addEventListener('click', () => {
      modal.goalId = b.dataset.deposit;
      modal.amount = '';
      const g = app.data.goals.find((x) => x.id === modal.goalId);
      document.getElementById('modal-goal-name').textContent = g ? `「${g.name}」` : '';
      document.getElementById('modal-amount-text').textContent = '0';
      document.getElementById('deposit-modal').hidden = false;
    });
  });

  // 弹窗数字键盘
  document.querySelectorAll('#deposit-modal .num').forEach((b) => {
    b.addEventListener('click', () => {
      const key = b.dataset.del !== undefined ? 'del' : b.dataset.num;
      modal.amount = models.pressAmountKey(modal.amount, key);
      document.getElementById('modal-amount-text').textContent = modalAmountStr(modal.amount);
    });
  });

  // 确认存入
  const confirmBtn = document.getElementById('modal-confirm');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const amount = parseFloat(modal.amount);
      if (!(amount > 0)) return toast('请输入金额', 'err');
      if (!modal.goalId) return;
      try {
        await addTransaction({
          type: 'deposit',
          account: 'wish',
          goalId: modal.goalId,
          amount,
          date: models.todayStr(),
          note: '',
          payMethod: '',
        });
        document.getElementById('deposit-modal').hidden = true;
        toast('已存入愿望基金');
        rerender();
      } catch (e) {
        toast(e.message, 'err');
      }
    });
  }

  // 取消 / 点遮罩关闭
  const cancelBtn = document.getElementById('modal-cancel');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      document.getElementById('deposit-modal').hidden = true;
    });
  }
  const overlay = document.getElementById('deposit-modal');
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target.id === 'deposit-modal') overlay.hidden = true;
    });
  }

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

/** 弹窗金额显示（千分位，两位小数内） */
function modalAmountStr(amount) {
  if (!amount) return '0';
  const [i, d] = amount.split('.');
  const int = i.replace(/^0+(?=\d)/, '');
  return (int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0') + (d !== undefined ? '.' + d : '');
}
