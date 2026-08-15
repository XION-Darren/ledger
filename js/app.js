/**
 * app.js — 应用入口：状态管理、hash 路由、导航、数据持久化
 */

import { storage } from './storage.js';
import * as models from './models.js';
import { esc } from './charts.js';
import * as homeView from './views/home.js';
import * as entryView from './views/entry.js';
import * as reportsView from './views/reports.js';
import * as wishesView from './views/wishes.js';
import * as settingsView from './views/settings.js';

const ROUTES = {
  home: { title: '流水账', view: homeView },
  entry: { title: '记一笔', view: entryView },
  reports: { title: '报表', view: reportsView },
  wishes: { title: '愿望', view: wishesView },
  settings: { title: '设置', view: settingsView },
};

export const app = {
  data: null,        // 当前账本
  sha: null,         // 远端文件 sha
  pending: false,    // 是否有未推送的本地修改
  connected: false,  // 是否已配置 GitHub
  current: 'home',
  _toastTimer: null,
};

/* ---------------- 数据操作（共享） ---------------- */

export async function persist(updateFn) {
  updateFn(app.data);
  app.data.meta = { ...(app.data.meta || {}), updatedAt: Date.now() };
  const r = await storage.save(app.data, app.sha);
  app.pending = !r.ok;
  if (r.ok && r.sha) app.sha = r.sha;
  updateSyncBadge();
  return r;
}

export function addTransaction(raw) {
  const t = models.normalizeTransaction(raw);
  const errs = models.validateTransaction(t);
  if (errs.length) throw new Error(errs.join('；'));
  return persist((d) => d.transactions.push(t)).then(() => t);
}

export function updateTransaction(id, patch) {
  return persist((d) => {
    const i = d.transactions.findIndex((t) => t.id === id);
    if (i < 0) throw new Error('记录不存在');
    d.transactions[i] = { ...d.transactions[i], ...patch, updatedAt: Date.now() };
  });
}

export function deleteTransaction(id) {
  return persist((d) => {
    d.transactions = d.transactions.filter((t) => t.id !== id);
  });
}

export function addGoal(raw) {
  const g = {
    id: models.uid('g'),
    name: String(raw.name || '').trim().slice(0, 60),
    target: Math.round((Number(raw.target) || 0) * 100) / 100,
    deadline: raw.deadline,
    createdAt: Date.now(),
  };
  if (!g.name) throw new Error('请填写愿望名称');
  if (!(g.target > 0)) throw new Error('请填写目标金额');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.deadline || '')) throw new Error('请选择目标日期');
  return persist((d) => d.goals.push(g)).then(() => g);
}

export function deleteGoal(id) {
  return persist((d) => {
    d.goals = d.goals.filter((g) => g.id !== id);
    // 不删除该愿望的存入记录：资金保留在愿望基金，跨期累计
  });
}

/* ---------------- 界面基础 ---------------- */

export function updateSyncBadge() {
  const el = document.getElementById('sync-badge');
  if (!el) return;
  if (!app.connected) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  el.textContent = app.pending ? '待同步' : '已同步';
  el.className = `sync-badge ${app.pending ? 'pending' : 'ok'}`;
}

export function toast(msg, kind = 'ok') {
  let box = document.getElementById('toast-box');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast-box';
    document.body.appendChild(box);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  clearTimeout(app._toastTimer);
  app._toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 200);
  }, 2200);
}

export function go(route) {
  location.hash = `#/${route}`;
}

/** 重绘当前路由视图 */
export function rerender() {
  render();
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* ---------------- 路由与渲染 ---------------- */

function render() {
  const route = (location.hash.replace(/^#\/?/, '') || 'home').split('?')[0];
  app.current = ROUTES[route] ? route : 'home';
  const def = ROUTES[app.current];
  document.getElementById('page-title').textContent = def.title;
  const main = document.getElementById('main');
  try {
    main.innerHTML = def.view.render(app);
    def.view.bind?.(app);
  } catch (e) {
    console.error(e);
    main.innerHTML = `<div class="card error-card">渲染出错：${esc(e.message)}</div>`;
  }
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.route === app.current);
  });
  window.scrollTo(0, 0);
  updateSyncBadge();
}

function bindNav() {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.addEventListener('click', () => go(b.dataset.route));
  });
}

export async function boot() {
  app.connected = storage.isConfigured();
  if (app.connected) {
    try {
      const r = await storage.sync();
      if (r.data) {
        app.data = r.data;
        app.sha = r.sha;
        app.pending = false;
      }
    } catch (e) {
      console.warn('同步失败，使用本地缓存', e);
      app.pending = true;
    }
  }
  if (!app.data) {
    app.data = storage.loadLocal() || models.emptyLedger();
    if (app.connected) app.pending = true; // 本地有数据未同步
  }
  window.addEventListener('hashchange', render);
  bindNav();
  render();
}
