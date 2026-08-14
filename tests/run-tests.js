/**
 * run-tests.js — 单元测试（Node 直接运行：node tests/run-tests.js）
 * 覆盖 models.js 全部纯逻辑：汇总、愿望进度、存钱计划、CSV、校验、工具函数。
 */

import assert from 'node:assert/strict';
import * as m from '../js/models.js';

let passed = 0;
let failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

async function runAll() {
  for (const t of tests) {
    try {
      await t.fn();
      passed++;
      console.log(`  ✓ ${t.name}`);
    } catch (e) {
      failed++;
      failures.push({ name: t.name, error: e });
      console.error(`  ✗ ${t.name}\n    ${e.message}`);
    }
  }
  console.log(`\n${passed} 通过, ${failed} 失败`);
  if (failed > 0) {
    process.exit(1);
  }
}

/* ---------------- 工具函数 ---------------- */

test('fmtMoney 千分位与两位小数', () => {
  assert.equal(m.fmtMoney(1234567.8), '¥1,234,567.8');
  assert.equal(m.fmtMoney(0), '¥0');
  assert.equal(m.fmtMoney(12.345), '¥12.35');
});

test('monthKey / daysBetween', () => {
  assert.equal(m.monthKey('2026-08-14'), '2026-08');
  assert.equal(m.daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(m.daysBetween('2026-01-31', '2026-01-01'), -30);
});

/* ---------------- 金额键盘（pressAmountKey） ---------------- */

test('pressAmountKey 数字输入与退格', () => {
  assert.equal(m.pressAmountKey('', '5'), '5');
  assert.equal(m.pressAmountKey('123', 'del'), '12');
  assert.equal(m.pressAmountKey('1', 'del'), '');
  assert.equal(m.pressAmountKey('', 'del'), ''); // 空退格不报错
});

test('pressAmountKey 小数点与两位小数限制', () => {
  assert.equal(m.pressAmountKey('12', '.'), '12.');
  assert.equal(m.pressAmountKey('12.', '.'), '12.'); // 已有小数点不再加
  assert.equal(m.pressAmountKey('12.3', '4'), '12.34');
  assert.equal(m.pressAmountKey('12.34', '5'), '12.34'); // 超两位小数忽略
});

test('pressAmountKey 0 处理', () => {
  assert.equal(m.pressAmountKey('0', '0'), '0'); // 0 后不再加 0
  assert.equal(m.pressAmountKey('0', '5'), '5'); // 0 开头替换，避免 "05"
  assert.equal(m.pressAmountKey('', '0'), '0');
});

/* ---------------- 汇总 ---------------- */

const txs = [
  { id: '1', date: '2026-08-01', type: 'income', account: 'salary', amount: 8000, note: '', payMethod: '', goalId: null },
  { id: '2', date: '2026-08-02', type: 'expense', account: 'life', amount: 30, note: '午饭', payMethod: '微信', goalId: null },
  { id: '3', date: '2026-08-03', type: 'expense', account: 'fun', amount: 100, note: '游戏', payMethod: '支付宝', goalId: null },
  { id: '4', date: '2026-08-04', type: 'deposit', account: 'wish', amount: 500, note: '', payMethod: '', goalId: 'g1' },
  { id: '5', date: '2026-07-20', type: 'expense', account: 'life', amount: 60, note: '', payMethod: '', goalId: null },
];

test('summarize 当月（deposit 不计入开销）', () => {
  const s = m.summarize(txs, '2026-08');
  assert.equal(s.income, 8000);
  assert.equal(s.expense, 130); // 30 + 100
  assert.equal(s.deposit, 500);
  assert.deepEqual(s.byAccount, { life: 30, fun: 100 });
});

test('summarize 全部月份', () => {
  const s = m.summarize(txs);
  assert.equal(s.expense, 190);
});

/* ---------------- 愿望进度 ---------------- */

test('goalProgress 计算已存（存入 - 购买）', () => {
  const goals = [{ id: 'g1', name: '新电脑', target: 8000, deadline: '2027-08-01', createdAt: 1 }];
  const all = [
    ...txs,
    { id: '6', date: '2026-08-05', type: 'expense', account: 'wish', amount: 200, note: '外设', payMethod: '', goalId: 'g1' },
  ];
  const [g] = m.goalProgress(goals, all);
  assert.equal(g.saved, 300); // 500 - 200
  assert.equal(g.remain, 7700);
});

/* ---------------- 存钱计划 ---------------- */

test('planGoal 正常计划（每月需存=剩余/月数）', () => {
  const plan = m.planGoal(
    { target: 12000, saved: 0, deadline: '2027-08-14' },
    { monthlyIncome: 10000, monthlyEssential: 4000 },
    '2026-08-14'
  );
  assert.equal(plan.ok, true);
  assert.equal(plan.months, 13); // ceil(365天 / 30)
  assert.equal(plan.monthly, 923.08); // 12000 / 13 向上取整到分
  assert.equal(plan.monthlyAffordable, 6000);
  assert.ok(plan.monthly <= plan.monthlyAffordable);
  assert.equal(plan.finishBy, '2027-08-14'); // 目标日期
});

test('planGoal 已存部分参与计算', () => {
  const plan = m.planGoal(
    { target: 12000, saved: 3000, deadline: '2027-08-14' },
    { monthlyIncome: 10000, monthlyEssential: 4000 },
    '2026-08-14'
  );
  assert.equal(plan.monthly, 692.31); // 9000 / 13
});

test('planGoal 超支风险提示', () => {
  const plan = m.planGoal(
    { target: 120000, saved: 0, deadline: '2027-08-14' },
    { monthlyIncome: 5000, monthlyEssential: 3000 },
    '2026-08-14'
  );
  assert.equal(plan.ok, false);
  assert.match(plan.note, /超出可支配/);
});

test('planGoal 可支配为 0', () => {
  const plan = m.planGoal(
    { target: 1000, saved: 0, deadline: '2027-08-14' },
    { monthlyIncome: 0, monthlyEssential: 0 },
    '2026-08-14'
  );
  assert.equal(plan.ok, false);
  assert.match(plan.note, /可支配为零/);
});

test('planGoal 目标日期已到', () => {
  const plan = m.planGoal(
    { target: 1000, saved: 0, deadline: '2026-01-01' },
    { monthlyIncome: 5000, monthlyEssential: 2000 },
    '2026-08-14'
  );
  assert.equal(plan.ok, false);
  assert.match(plan.note, /目标日期已到/);
});

/* ---------------- 估算 ---------------- */

test('estimateEssential 近 3 个月均值', () => {
  // 动态构造与当前月份匹配的数据，避免测试依赖具体日期
  const now = new Date();
  const ym = (offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const sample = [
    { id: 'a', date: `${ym(0)}-05`, type: 'expense', account: 'life', amount: 30, note: '', payMethod: '', goalId: null },
    { id: 'b', date: `${ym(1)}-10`, type: 'expense', account: 'life', amount: 60, note: '', payMethod: '', goalId: null },
    { id: 'c', date: `${ym(0)}-06`, type: 'expense', account: 'fun', amount: 200, note: '', payMethod: '', goalId: null },
  ];
  // 只统计 life/study/urgent：(30 + 60) / 3 个月窗口 = 30
  assert.equal(m.estimateEssential(sample, 3), 30);
});

/* ---------------- 校验 ---------------- */

test('validateTransaction 通过合法记录', () => {
  assert.deepEqual(
    m.validateTransaction({ id: 'x', date: '2026-08-01', type: 'expense', account: 'life', amount: 25 }),
    []
  );
});

test('validateTransaction 拒绝非法记录', () => {
  assert.ok(m.validateTransaction({ id: 'x', date: 'bad', type: 'expense', account: 'life', amount: 25 }).length > 0);
  assert.ok(m.validateTransaction({ id: 'x', date: '2026-08-01', type: 'expense', account: 'nope', amount: 25 }).length > 0);
  assert.ok(m.validateTransaction({ id: 'x', date: '2026-08-01', type: 'expense', account: 'life', amount: -5 }).length > 0);
  assert.ok(m.validateTransaction({ id: 'x', date: '2026-08-01', type: 'deposit', account: 'wish', amount: 100 }).length > 0); // 缺 goalId
});

/* ---------------- CSV ---------------- */

test('transactionsCsv 生成带 BOM 的明细', () => {
  const csv = m.transactionsCsv(txs, [{ id: 'g1', name: '新电脑' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('日期,类型,账户,金额(元),备注,支付方式,关联愿望'));
  assert.ok(csv.includes('-30'));
  assert.ok(csv.includes('存入愿望'));
});

test('transactionsCsv 转义逗号引号', () => {
  const csv = m.transactionsCsv(
    [{ id: 'x', date: '2026-08-01', type: 'expense', account: 'life', amount: 10, note: '带,逗号"和引号', payMethod: '', goalId: null }],
    []
  );
  assert.ok(csv.includes('"带,逗号""和引号"'));
});

test('transactionsCsv 防公式注入（= + - @ 前缀单引号）', () => {
  const csv = m.transactionsCsv(
    [
      { id: 'a', date: '2026-08-01', type: 'expense', account: 'life', amount: 1, note: '=HYPERLINK("x")', payMethod: '', goalId: null },
      { id: 'b', date: '2026-08-02', type: 'expense', account: 'life', amount: 1, note: '+SUM(1,1)', payMethod: '', goalId: null },
      { id: 'c', date: '2026-08-03', type: 'expense', account: 'life', amount: 1, note: '-SUM(1,1)', payMethod: '', goalId: null },
      { id: 'd', date: '2026-08-04', type: 'expense', account: 'life', amount: 1, note: '@cmd', payMethod: '', goalId: null },
    ],
    []
  );
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+SUM"));
  assert.ok(csv.includes("'-SUM"));
  assert.ok(csv.includes("'@cmd"));
});

test('transactionsCsv 金额列保持数值（- 后接数字不加引号前缀）', () => {
  const csv = m.transactionsCsv(
    [{ id: 'x', date: '2026-08-01', type: 'expense', account: 'life', amount: 30.5, note: '午饭', payMethod: '', goalId: null }],
    []
  );
  assert.ok(csv.includes(',-30.5,'), '支出金额应输出裸 -30.5 便于 Excel 求和');
  assert.ok(!csv.includes("'-30.5"), '金额不应被单引号前缀');
});

test('summaryCsv 汇总输出', () => {
  const csv = m.summaryCsv(txs);
  assert.ok(csv.includes('合计收入,income,8000'));
  assert.ok(csv.includes('合计支出,expense,190')); // 8月130 + 7月60
  assert.ok(csv.includes('存入愿望基金,deposit,500'));
});

/* ---------------- 空账本 ---------------- */

test('emptyLedger 结构完整', () => {
  const l = m.emptyLedger();
  assert.equal(l.version, 1);
  assert.ok(Array.isArray(l.transactions));
  assert.ok(Array.isArray(l.goals));
  assert.ok(l.settings);
  assert.ok(l.meta);
});

/* ---------------- 存储层（mock GitHub API） ---------------- */

import { storage } from '../js/storage.js';

function mockLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
}

/** 内存版 GitHub contents API mock；可注入 failFirstPut 模拟 409；真实模拟 422（文件存在但缺 sha） */
function mockGitHub({ failFirstPut = false } = {}) {
  let file = null;
  let putCount = 0;
  return async (url, opts = {}) => {
    const method = opts.method || 'GET';
    if (url.includes('/contents/data/ledger.json')) {
      if (method === 'GET') {
        if (!file) return { ok: false, status: 404, json: async () => ({ message: 'Not Found' }) };
        return { ok: true, status: 200, json: async () => ({ content: btoa(JSON.stringify(file.data)), sha: file.sha }) };
      }
      if (method === 'PUT') {
        putCount++;
        const body = JSON.parse(opts.body);
        if (failFirstPut && putCount === 1) {
          return { ok: false, status: 409, json: async () => ({ message: 'sha mismatch' }) };
        }
        // 真实 GitHub 行为：文件已存在但未提供 sha → 422
        if (file && !body.sha) {
          return { ok: false, status: 422, json: async () => ({ message: "sha wasn't supplied" }) };
        }
        // 提供的 sha 与当前不符 → 409
        if (file && body.sha && body.sha !== file.sha) {
          return { ok: false, status: 409, json: async () => ({ message: 'sha mismatch' }) };
        }
        const jsonStr = decodeURIComponent(escape(atob(body.content)));
        file = { data: JSON.parse(jsonStr), sha: 'sha-' + putCount };
        return { ok: true, status: 201, json: async () => ({ content: { sha: file.sha } }) };
      }
    }
    if (url.includes('/repos/')) {
      const m = url.match(/\/repos\/([^/]+)\/([^/?]+)/);
      const full = m ? `${m[1]}/${m[2]}` : 'me/ledger';
      return { ok: true, status: 200, json: async () => ({ full_name: full, private: true, default_branch: 'main' }) };
    }
    return { ok: false, status: 404, json: async () => ({ message: 'not found' }) };
  };
}

const mockLocal = mockLocalStorage();

function setupStorage() {
  globalThis.localStorage = mockLocalStorage(); // 每次全新缓存，测试隔离
  const fetcher = mockGitHub();
  globalThis.fetch = fetcher;
  storage.setConfig({ owner: 'me', repo: 'ledger', token: 'ghp_test' });
  return fetcher;
}

test('storage 未配置时 isConfigured=false', () => {
  globalThis.localStorage = mockLocalStorage();
  storage.setConfig({ owner: '', repo: '', token: '' });
  assert.equal(storage.isConfigured(), false);
});

test('storage save 更新本地缓存并推送远端', async () => {
  const fetcher = setupStorage();
  const data = { version: 1, transactions: [{ id: 't1' }], goals: [], settings: {}, meta: { updatedAt: 1 } };
  const r = await storage.save(data);
  assert.equal(r.ok, true);
  assert.ok(r.sha);
  // 本地缓存已更新
  assert.equal(storage.loadLocal().transactions.length, 1);
  // 远端数据一致
  const remote = await storage.fetchRemote();
  assert.equal(remote.exists, true);
  assert.equal(remote.data.transactions[0].id, 't1');
});

test('storage sync 远端为空时返回本地数据', async () => {
  const fetcher = setupStorage();
  const local = { version: 1, transactions: [{ id: 'local1' }], goals: [], settings: {}, meta: { updatedAt: 100 } };
  storage.saveLocal(local);
  const r = await storage.sync();
  assert.equal(r.source, 'local');
  assert.equal(r.data.transactions[0].id, 'local1');
});

test('storage sync 远端更新时覆盖本地', async () => {
  const fetcher = setupStorage();
  // 先推送一条远端数据（updatedAt 较大）
  await storage.save({ version: 1, transactions: [{ id: 'remote1' }], goals: [], settings: {}, meta: { updatedAt: 999 } });
  // 本地放旧数据
  storage.saveLocal({ version: 1, transactions: [{ id: 'stale' }], goals: [], settings: {}, meta: { updatedAt: 1 } });
  const r = await storage.sync();
  assert.equal(r.source, 'remote');
  assert.equal(r.data.transactions[0].id, 'remote1');
});

test('storage pushRemote 409 冲突自动重试', async () => {
  globalThis.localStorage = mockLocal;
  const fetcher = mockGitHub({ failFirstPut: true });
  globalThis.fetch = fetcher;
  storage.setConfig({ owner: 'me', repo: 'ledger', token: 'ghp_test' });
  const r = await storage.save({ version: 1, transactions: [{ id: 'x' }], goals: [], settings: {}, meta: { updatedAt: 1 } });
  assert.equal(r.ok, true); // 重试后成功
  const remote = await storage.fetchRemote();
  assert.equal(remote.data.transactions[0].id, 'x');
});

test('storage 连续 save 覆盖已存在文件（422 自动补 sha 重试）', async () => {
  setupStorage();
  const r1 = await storage.save({ version: 1, transactions: [{ id: 'a' }], goals: [], settings: {}, meta: { updatedAt: 1 } });
  assert.equal(r1.ok, true);
  // 第二次 save 不传 shaHint：pushRemote 首次 PUT 缺 sha → 422 → 内部 fetchRemote 补 sha 重试成功
  const r2 = await storage.save({ version: 1, transactions: [{ id: 'a' }, { id: 'b' }], goals: [], settings: {}, meta: { updatedAt: 2 } });
  assert.equal(r2.ok, true);
  const remote = await storage.fetchRemote();
  assert.equal(remote.exists, true);
  assert.equal(remote.data.transactions.length, 2);
});

test('storage testConnection 返回仓库信息', async () => {
  setupStorage();
  const info = await storage.testConnection();
  assert.equal(info.ok, true);
  assert.equal(info.fullName, 'me/ledger');
});

test('storage 独立数据仓库配置生效（代码/数据分离）', async () => {
  globalThis.localStorage = mockLocalStorage();
  globalThis.fetch = mockGitHub();
  storage.setConfig({ owner: 'me', repo: 'app', token: 'ghp_test', dataOwner: 'me', dataRepo: 'app-data' });
  // 数据写入应落在数据仓库
  const r = await storage.save({ version: 1, transactions: [{ id: 'a' }], goals: [], settings: {}, meta: { updatedAt: 1 } });
  assert.equal(r.ok, true);
  const remote = await storage.fetchRemote();
  assert.equal(remote.exists, true);
  assert.equal(remote.data.transactions[0].id, 'a');
  // 连接测试同时校验代码仓库与数据仓库
  const info = await storage.testConnection();
  assert.equal(info.fullName, 'me/app');        // 代码仓库
  assert.equal(info.dataRepo, 'me/app-data');   // 数据仓库
  assert.equal(info.dataPrivate, true);
});

test('storage 数据仓库留空时回退代码仓库', async () => {
  setupStorage(); // 配置无 dataOwner/dataRepo
  const r = await storage.save({ version: 1, transactions: [], goals: [], settings: {}, meta: { updatedAt: 1 } });
  assert.equal(r.ok, true);
  const info = await storage.testConnection();
  assert.equal(info.fullName, 'me/ledger');
  assert.equal(info.dataRepo, 'me/ledger'); // 回退同一仓库
});

/* ---------------- 汇总 ---------------- */

await runAll();
