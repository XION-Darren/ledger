/**
 * models.js — 数据模型与纯逻辑（无 DOM 依赖，可在 Node 中单测）
 *
 * 导出：ACCOUNTS / INCOME_ACCOUNTS / PAY_METHODS / 校验 / 汇总 / 愿望计划算法 / CSV
 */

export const SCHEMA_VERSION = 1;

/** 支出账户（五大类 + 兜底） */
export const ACCOUNTS = {
  life:   { name: '生活账户', essential: true,  icon: '🍜', color: '#34C759', desc: '吃饭、交通、水果等必要开销' },
  study:  { name: '学习账户', essential: true,  icon: '📚', color: '#007AFF', desc: '学习、技能提升等变动开销' },
  fun:    { name: '娱乐账户', essential: false, icon: '🎮', color: '#FF9500', desc: '娱乐、零食等非必要开销' },
  urgent: { name: '应急账户', essential: true,  icon: '🩺', color: '#FF3B30', desc: '医疗、意外等开销' },
  wish:   { name: '愿望账户', essential: false, icon: '⭐', color: '#AF52DE', desc: '想买但非刚需的愿望基金' },
  other:  { name: '其他支出', essential: false, icon: '📦', color: '#8E8E93', desc: '无法归类的支出' },
};

/** 收入账户 */
export const INCOME_ACCOUNTS = {
  salary:  { name: '工资',     icon: '💼', color: '#30D158' },
  bonus:   { name: '奖金',     icon: '🎁', color: '#64D2FF' },
  side:    { name: '兼职/副业', icon: '🛠️', color: '#BF5AF2' },
  invest:  { name: '理财收益', icon: '📈', color: '#0A84FF' },
  otherIn: { name: '其他收入', icon: '💰', color: '#A2845E' },
};

export const PAY_METHODS = ['微信', '支付宝', '云闪付', '京东', '现金', '银行卡'];

export const TX_TYPES = {
  income:  '收入',
  expense: '支出',
  deposit: '存入愿望',
};

/** 默认空账本 */
export function emptyLedger() {
  return {
    version: SCHEMA_VERSION,
    transactions: [],
    goals: [],
    settings: { monthlyIncome: null, monthlyEssential: null },
    meta: { createdAt: Date.now(), updatedAt: Date.now(), nextId: 1 },
  };
}

/* ---------------- 工具 ---------------- */

export const uid = (prefix) =>
  `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function todayStr(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

export function monthKey(dateStr) {
  return (dateStr || '').slice(0, 7); // "2026-08"
}

/** 金额键盘按键处理（纯函数，供单测）。key ∈ {'0'..'9', '.', 'del'}，返回新金额字符串 */
export function pressAmountKey(amount, key) {
  const cur = String(amount ?? '');
  if (key === 'del') return cur.slice(0, -1);
  if (key === '.') {
    if (cur.includes('.')) return cur;
    return cur + '.';
  }
  if (cur.includes('.') && cur.split('.')[1].length >= 2) return cur; // 最多两位小数
  if (cur === '0' && key === '0') return cur; // 0 后不能再输入 0
  if (cur === '0') return key; // 0 开头替换为数字，避免 "05"
  return cur + key;
}

export function fmtMoney(n, currency = '¥') {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  return `${currency}${v.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr).getTime();
  const b = new Date(toStr).getTime();
  return Math.round((b - a) / 86400000);
}

/* ---------------- 交易校验 ---------------- */

export function validateTransaction(t) {
  const errs = [];
  if (!t || typeof t !== 'object') return ['交易对象无效'];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date || '')) errs.push('日期格式应为 YYYY-MM-DD');
  if (!['income', 'expense', 'deposit'].includes(t.type)) errs.push('类型无效');
  if (t.type === 'income') {
    if (!INCOME_ACCOUNTS[t.account]) errs.push('收入账户无效');
  } else if (t.type === 'expense') {
    if (!ACCOUNTS[t.account]) errs.push('支出账户无效');
  } else {
    if (t.account !== 'wish') errs.push('存入愿望必须使用愿望账户');
    if (!t.goalId) errs.push('存入愿望必须关联目标');
    if (Number(t.amount) <= 0) errs.push('存入金额须为正数');
  }
  if (!Number.isFinite(Number(t.amount)) || Number(t.amount) <= 0) errs.push('金额须为正数');
  return errs;
}

export function normalizeTransaction(raw) {
  const t = {
    id: raw.id || uid('t'),
    date: raw.date || todayStr(),
    type: raw.type,
    account: raw.account,
    amount: Math.round((Number(raw.amount) || 0) * 100) / 100,
    note: (raw.note || '').trim().slice(0, 200),
    payMethod: raw.payMethod || '',
    goalId: raw.goalId || null,
    createdAt: raw.createdAt || Date.now(),
    updatedAt: Date.now(),
  };
  return t;
}

/* ---------------- 汇总统计 ---------------- */

export function accountLabel(type, key) {
  return type === 'income'
    ? (INCOME_ACCOUNTS[key] || {}).name || key
    : (ACCOUNTS[key] || {}).name || key;
}

/**
 * 汇总某月（或全部）收支。
 * @param {Array} txs 交易数组
 * @param {string} [m] 月份 'YYYY-MM'，省略则全部
 * @returns {{income, expense, deposit, byAccount:Object, byIncome:Object}}
 */
export function summarize(txs, m) {
  const out = { income: 0, expense: 0, deposit: 0, byAccount: {}, byIncome: {} };
  for (const t of txs) {
    if (m && monthKey(t.date) !== m) continue;
    const amt = Number(t.amount) || 0;
    if (t.type === 'income') {
      out.income += amt;
      out.byIncome[t.account] = (out.byIncome[t.account] || 0) + amt;
    } else if (t.type === 'expense') {
      out.expense += amt;
      out.byAccount[t.account] = (out.byAccount[t.account] || 0) + amt;
    } else {
      out.deposit += amt; // 存入愿望基金 = 储蓄，不计入开销
    }
  }
  return out;
}

/** 计算每个愿望的已存金额与剩余 */
export function goalProgress(goals, txs) {
  const byGoal = {};
  for (const g of goals) byGoal[g.id] = { deposit: 0, spent: 0 };
  for (const t of txs) {
    if (!t.goalId || !byGoal[t.goalId]) continue;
    if (t.type === 'deposit') byGoal[t.goalId].deposit += Number(t.amount) || 0;
    if (t.type === 'expense' && t.account === 'wish') byGoal[t.goalId].spent += Number(t.amount) || 0;
  }
  return goals.map((g) => {
    const d = byGoal[g.id] || { deposit: 0, spent: 0 };
    const saved = Math.max(0, d.deposit - d.spent);
    const remain = Math.max(0, g.target - saved);
    return { ...g, saved, spent: d.spent, remain };
  });
}

/* ---------------- 愿望存钱计划算法 ---------------- */

/**
 * 计算某愿望的存钱计划。
 * @param {object} goal 愿望 {target, deadline, saved}
 * @param {object} cfg 能力配置 {monthlyIncome, monthlyEssential}
 * @param {string} [today] 今天 'YYYY-MM-DD'
 * @returns {{ok, months, monthly, affordable, weekly, monthlyAffordable, note, finishBy}}
 */
export function planGoal(goal, cfg, today) {
  const todayStr0 = today || todayStr();
  const days = Math.max(0, daysBetween(todayStr0, goal.deadline || todayStr0));
  const months = Math.max(1, Math.ceil(days / 30));
  const remain = Math.max(0, Number(goal.target) - Number(goal.saved || 0));
  const monthly = Math.ceil((remain / months) * 100) / 100; // 向上取整到分

  const income = Number(cfg.monthlyIncome) || 0;
  const essential = Number(cfg.monthlyEssential) || 0;
  const monthlyAffordable = Math.max(0, income - essential);
  const weekly = Math.ceil((monthly / 4.33) * 100) / 100;

  const finishBy = goal.deadline || todayStr0;

  if (days <= 0) {
    return { ok: false, months, monthly, weekly, monthlyAffordable, finishBy, note: '目标日期已到，请调整期限' };
  }
  if (monthlyAffordable <= 0) {
    return { ok: false, months, monthly, weekly, monthlyAffordable, finishBy, note: '每月可支配为零，先调整收入/必要开销配置' };
  }
  if (monthly > monthlyAffordable) {
    return {
      ok: false, months, monthly, weekly, monthlyAffordable, finishBy,
      note: `每月需存 ${fmtMoney(monthly)}，超出可支配 ${fmtMoney(monthlyAffordable)}，建议延长期限或调低目标`,
    };
  }
  return {
    ok: true, months, monthly, weekly, monthlyAffordable, finishBy,
    note: `每月存 ${fmtMoney(monthly)}（约每周 ${fmtMoney(weekly)}），预计 ${finishBy} 达成`,
  };
}

/** 依据最近 3 个月的必要开销（生活+学习+应急）均值估算月必要开销 */
export function estimateEssential(txs, months = 3) {
  const now = new Date();
  const keys = [];
  for (let i = 1; i <= months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  let total = 0;
  for (const t of txs) {
    if (t.type !== 'expense') continue;
    if (!keys.includes(monthKey(t.date))) continue;
    if (['life', 'study', 'urgent'].includes(t.account)) total += Number(t.amount) || 0;
  }
  return Math.round((total / months) * 100) / 100;
}

/* ---------------- CSV 导出 ---------------- */

function csvEscape(v) {
  const s = String(v ?? '');
  // 防 CSV 公式注入：= + @ 开头、- 后接非数字、制表/回车开头 → 前缀单引号中性化（Excel/WPS 视为文本）
  // 注意：- 后接数字（如金额 -30）不处理，保证金额列仍是数值
  const dangerous = /^[=+@]/.test(s) || /^-(?!\d)/.test(s) || /^[\t\r]/.test(s);
  const escaped = s.replace(/"/g, '""');
  const needsQuote = /[",\n\r]/.test(escaped);
  if (dangerous) {
    return needsQuote ? `"'${escaped}"` : `'${escaped}`;
  }
  return needsQuote ? `"${escaped}"` : escaped;
}

/** 交易明细 CSV（UTF-8 BOM，Excel 可直接打开） */
export function transactionsCsv(txs, goals) {
  const goalName = (id) => (goals.find((g) => g.id === id) || {}).name || '';
  const head = ['日期', '类型', '账户', '金额(元)', '备注', '支付方式', '关联愿望'];
  const rows = txs.map((t) => [
    t.date,
    TX_TYPES[t.type] || t.type,
    accountLabel(t.type, t.account),
    t.type === 'expense' ? `-${t.amount}` : String(t.amount),
    t.note,
    t.payMethod,
    t.goalId ? goalName(t.goalId) : '',
  ]);
  const csv = [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n');
  return '\uFEFF' + csv;
}

/** 按账户汇总 CSV */
export function summaryCsv(txs) {
  const total = summarize(txs);
  const lines = [['账户', '类型', '金额(元)']];
  lines.push(['合计收入', 'income', String(total.income)]);
  lines.push(['合计支出', 'expense', String(total.expense)]);
  lines.push(['净结余', 'net', String(total.income - total.expense - total.deposit)]);
  lines.push(['存入愿望基金', 'deposit', String(total.deposit)]);
  lines.push([]);
  for (const key of Object.keys(ACCOUNTS)) {
    if (total.byAccount[key]) lines.push([ACCOUNTS[key].name, 'expense', String(total.byAccount[key])]);
  }
  for (const key of Object.keys(INCOME_ACCOUNTS)) {
    if (total.byIncome[key]) lines.push([INCOME_ACCOUNTS[key].name, 'income', String(total.byIncome[key])]);
  }
  const csv = lines.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  return '\uFEFF' + csv;
}
