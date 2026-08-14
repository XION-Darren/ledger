/**
 * views/entry.js — 记账：金额键盘 + 分类宫格 + 日期/备注/支付方式
 */

import * as models from '../models.js';
import { esc } from '../charts.js';
import { app, addTransaction, go, toast } from '../app.js';

const state = {
  type: 'expense',
  account: 'life',
  amount: '',
  date: models.todayStr(),
  note: '',
  payMethod: '微信',
  goalId: null,
};

/** 每次进入记账页时重置为初始状态（金额/备注归零，类型回到支出） */
function resetState() {
  const presetGoal = sessionStorage.getItem('ledger:goal');
  state.type = 'expense';
  state.account = 'life';
  state.amount = '';
  state.date = models.todayStr();
  state.note = '';
  state.payMethod = '微信';
  state.goalId = presetGoal || null;
  if (presetGoal) sessionStorage.removeItem('ledger:goal');
}

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

/** 当前账户的高频备注词 */
function currentTags() {
  const accts = accountsForType();
  const a = accts[state.account] || {};
  return a.tags || [];
}

export function render(app) {
  resetState(); // 首次进入：回归初始状态
  return renderBody(app);
}

function renderBody(app) {
  const accts = accountsForType();
  const goals = models.goalProgress(app.data.goals, app.data.transactions)
    .filter((g) => g.remain > 0);

  const grid = Object.entries(accts).map(([key, a]) => `
    <button class="acct-cell ${state.account === key ? 'sel' : ''}" data-acct="${esc(key)}">
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

  const curTags = currentTags();
  const tagsRow = curTags.length
    ? `<div class="note-tags">
        ${curTags.map((t) => `<button class="chip ${state.note === t ? 'sel' : ''}" data-tag="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>`
    : '';

  return `
  <div class="seg">
    <button class="seg-btn ${state.type === 'expense' ? 'sel' : ''}" data-type="expense">支出</button>
    <button class="seg-btn ${state.type === 'income' ? 'sel' : ''}" data-type="income">收入</button>
    <button class="seg-btn ${state.type === 'deposit' ? 'sel' : ''}" data-type="deposit">愿望</button>
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
    ${tagsRow}
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

  // 分类选择（收入/支出通用，点击即高亮，备注为空时自动填高频词）
  document.querySelectorAll('.acct-cell').forEach((b) => {
    b.addEventListener('click', () => {
      state.account = b.dataset.acct;
      if (!state.note) {
        const tags = currentTags();
        if (tags.length) state.note = tags[0];
      }
      rerenderEntry();
    });
  });

  // 备注高频词候选（点击填入）
  document.querySelectorAll('[data-tag]').forEach((b) => {
    b.addEventListener('click', () => {
      state.note = b.dataset.tag;
      document.getElementById('tx-note').value = state.note;
      document.querySelectorAll('[data-tag]').forEach((c) => c.classList.toggle('sel', c === b));
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
      if (b.dataset.del !== undefined) {
        state.amount = models.pressAmountKey(state.amount, 'del');
      } else {
        state.amount = models.pressAmountKey(state.amount, b.dataset.num);
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
      toast(state.type === 'income' ? '收入已记录' : state.type === 'deposit' ? '已存入愿望基金' : '支出已记录');
      go('home');
    } catch (e) {
      toast(e.message, 'err');
    }
  });
}

/** 内部重绘（不重置 state，保留已输入内容） */
function rerenderEntry() {
  const main = document.getElementById('main');
  main.innerHTML = renderBody(app);
  bind(app);
}
