/**
 * views/entry.js — 记账：金额键盘 + 分类宫格 + 日期/备注/支付方式
 */

import * as models from '../models.js';
import { esc } from '../charts.js';
import { addTransaction, go, toast } from '../app.js';

const state = {
  type: 'expense',
  account: 'life',
  amount: '',
  date: models.todayStr(),
  note: '',
  payMethod: '微信',
  goalId: null,
};

function moneyStr() {
  if (!state.amount) return '0';
  const [i, d] = state.amount.split('.');
  const int = i.replace(/^0+(?=\d)/, '');
  return (int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') || '0') + (d !== undefined ? '.' + d : '');
}

function accountsForType() {
  if (state.type === 'income') return models.INCOME_ACCOUNTS;
  if (state.type === 'deposit') return { wish: models.ACCOUNTS.wish };
  return models.ACCOUNTS;
}

export function render(app) {
  const presetGoal = sessionStorage.getItem('ledger:goal');
  state.goalId = presetGoal || null;
  if (presetGoal) sessionStorage.removeItem('ledger:goal');
  const accts = accountsForType();
  const goals = models.goalProgress(app.data.goals, app.data.transactions)
    .filter((g) => g.remain > 0);

  const grid = Object.entries(accts).map(([key, a]) => `
    <button class="acct-cell ${state.type !== 'income' && state.account === key ? 'sel' : ''}" data-acct="${esc(key)}">
      <span class="acct-ico" style="background:${esc(a.color)}22">${esc(a.icon)}</span>
      <span class="acct-name">${esc(a.name)}</span>
    </button>`).join('');

  const goalPicker = state.type === 'deposit'
    ? `<div class="field">
        <label>存入哪个愿望</label>
        ${goals.length
          ? `<div class="chip-row">${goals.map((g) => `<button class="chip goal-chip ${state.goalId === g.id ? 'sel' : ''}" data-goal="${esc(g.id)}">${esc(g.name)}</button>`).join('')}</div>`
          : `<div class="empty-hint">还没有待实现的愿望，<button class="link-btn" data-goto="wishes">去创建 ›</button></div>`}
      </div>`
    : '';

  const payRow = state.type === 'expense'
    ? `<div class="field">
        <label>支付方式</label>
        <div class="chip-row">${models.PAY_METHODS.map((m) => `<button class="chip ${state.payMethod === m ? 'sel' : ''}" data-pay="${esc(m)}">${esc(m)}</button>`).join('')}</div>
      </div>`
    : '';

  return `
  <div class="seg">
    <button class="seg-btn ${state.type === 'expense' ? 'sel' : ''}" data-type="expense">支出</button>
    <button class="seg-btn ${state.type === 'income' ? 'sel' : ''}" data-type="income">收入</button>
    <button class="seg-btn ${state.type === 'deposit' ? 'sel' : ''}" data-type="deposit">存入愿望</button>
  </div>

  <div class="amount-box">
    <div class="amount-display"><span class="amount-cur">¥</span><span id="amount-text">${moneyStr()}</span></div>
  </div>

  <div class="card acct-grid">${grid}</div>

  ${goalPicker}
  ${payRow}

  <div class="card form-card">
    <div class="form-row">
      <label>日期</label>
      <input type="date" id="tx-date" value="${esc(state.date)}">
    </div>
    <div class="form-row">
      <label>备注</label>
      <input type="text" id="tx-note" placeholder="可选" maxlength="200" value="${esc(state.note)}">
    </div>
  </div>

  <div class="numpad" id="numpad">
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="num" data-num="${n}">${n}</button>`).join('')}
    <button class="num" data-num=".">.</button>
    <button class="num" data-num="0">0</button>
    <button class="num del" data-del aria-label="退格">⌫</button>
  </div>

  <button class="btn primary big" id="save-tx">保存</button>`;
}

export function bind(app) {
  // 类型切换
  document.querySelectorAll('.seg-btn').forEach((b) => {
    b.addEventListener('click', () => {
      state.type = b.dataset.type;
      state.account = state.type === 'income' ? 'salary' : state.type === 'deposit' ? 'wish' : 'life';
      state.goalId = null;
      rerenderEntry();
    });
  });

  // 分类选择
  document.querySelectorAll('.acct-cell').forEach((b) => {
    b.addEventListener('click', () => {
      state.account = b.dataset.acct;
      rerenderEntry();
    });
  });

  // 愿望 / 支付方式
  document.querySelectorAll('[data-goal]').forEach((b) => {
    b.addEventListener('click', () => {
      state.goalId = b.dataset.goal;
      document.querySelectorAll('.goal-chip').forEach((c) => c.classList.toggle('sel', c === b));
    });
  });
  document.querySelectorAll('[data-pay]').forEach((b) => {
    b.addEventListener('click', () => {
      state.payMethod = b.dataset.pay;
      document.querySelectorAll('.chip[data-pay]').forEach((c) => c.classList.toggle('sel', c === b));
    });
  });

  const amountText = document.getElementById('amount-text');
  document.querySelectorAll('.num').forEach((b) => {
    b.addEventListener('click', () => {
      if (b.dataset.del) {
        state.amount = state.amount.slice(0, -1);
      } else {
        const k = b.dataset.num;
        if (k === '.') {
          if (!state.amount.includes('.')) state.amount += '.';
        } else if (state.amount.includes('.') && state.amount.split('.')[1].length >= 2) {
          // 最多两位小数
        } else if (state.amount === '0' && k === '0') {
          // 保持 0
        } else {
          state.amount += k;
        }
      }
      amountText.textContent = moneyStr();
    });
  });

  document.getElementById('tx-date').addEventListener('change', (e) => { state.date = e.target.value; });
  document.getElementById('tx-note').addEventListener('input', (e) => { state.note = e.target.value; });

  document.getElementById('save-tx').addEventListener('click', async () => {
    const amount = parseFloat(state.amount);
    if (!(amount > 0)) return toast('请输入金额', 'err');
    if (state.type === 'deposit' && !state.goalId) return toast('请选择存入的愿望', 'err');
    try {
      await addTransaction({
        date: state.date || models.todayStr(),
        type: state.type,
        account: state.account,
        amount,
        note: state.note,
        payMethod: state.type === 'expense' ? state.payMethod : '',
        goalId: state.type === 'deposit' ? state.goalId : null,
      });
      state.amount = '';
      state.note = '';
      toast(state.type === 'income' ? '收入已记录' : state.type === 'deposit' ? '已存入愿望基金' : '支出已记录');
      go('home');
    } catch (e) {
      toast(e.message, 'err');
    }
  });
}

function rerenderEntry() {
  // 重绘分类/愿望/支付区块（金额输入状态保留在 state 中）
  const main = document.getElementById('main');
  main.innerHTML = render(app);
  bind(app);
}
