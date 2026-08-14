/**
 * views/settings.js — 设置：GitHub 连接、同步、导入导出（分层折叠）
 */

import { storage } from '../storage.js';
import * as models from '../models.js';
import { esc } from '../charts.js';
import { toast, rerender, app, updateSyncBadge } from '../app.js';

export function render() {
  const cfg = storage.getConfig();
  const masked = cfg.token ? cfg.token.slice(0, 4) + '••••' + cfg.token.slice(-4) : '';
  const conn = app.connected
    ? `<div class="conn-state ok">已连接：<b>${esc(cfg.owner)}/${esc(cfg.repo)}</b>${cfg.dataRepo ? ` · 数据 <b>${esc(cfg.dataOwner || cfg.owner)}/${esc(cfg.dataRepo)}</b>` : ''}</div>`
    : `<div class="conn-state warn">未连接 GitHub，数据仅保存在本设备</div>`;

  const syncState = app.connected
    ? `<div class="sync-line">同步状态：<b class="${app.pending ? 'negative' : 'positive'}">${app.pending ? '有本地修改待推送' : '已同步'}</b>
       <button class="btn outline small" id="btn-sync">立即同步</button></div>`
    : `<div class="sync-line">配置 GitHub 后，手机与电脑将自动同步同一份数据。</div>`;

  return `
  <section class="section">
    <div class="section-head collapsible" data-collapse="sec-gh">
      <h2>GitHub 同步</h2><span class="chev">›</span>
    </div>
    <div class="collapsible-body" id="sec-gh" hidden>
      <div class="card form-card">
        ${conn}
        ${syncState}
        <div class="form-row"><label>仓库所有者</label><input type="text" id="cfg-owner" placeholder="GitHub 用户名" value="${esc(cfg.owner)}" autocomplete="off"></div>
        <div class="form-row"><label>仓库名</label><input type="text" id="cfg-repo" placeholder="如 ledger" value="${esc(cfg.repo)}" autocomplete="off"></div>
        <div class="form-row">
          <label>Access Token${masked ? ` <span class="masked">${esc(masked)}</span>` : ''}</label>
          <input type="password" id="cfg-token" placeholder="ghp_... 仅保存在本浏览器" value="" autocomplete="off">
        </div>
        <div class="form-row"><label>数据所有者</label><input type="text" id="cfg-data-owner" placeholder="留空=同代码仓库" value="${esc(cfg.dataOwner || '')}" autocomplete="off"></div>
        <div class="form-row"><label>数据仓库名</label><input type="text" id="cfg-data-repo" placeholder="如 ledger-data（建议私有）" value="${esc(cfg.dataRepo || '')}" autocomplete="off"></div>
        <div class="btn-row">
          <button class="btn primary" id="btn-test">测试连接并保存</button>
          <button class="btn outline" id="btn-clear">断开</button>
        </div>
        <div class="hint">💡 <b>隐私建议</b>：代码仓库（公开，用于网页）与<b>数据仓库（私有，存 <code>data/ledger.json</code>）</b>分离——数据所有者/数据仓库名留空则数据存在代码仓库。Token 创建：GitHub → Settings → Developer settings → Personal access tokens → 勾选 <code>repo</code> 权限，<b>建议有效期 90 天以上</b>。Token 只保存在你浏览器的 localStorage，不会写入代码或仓库。</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head collapsible" data-collapse="sec-backup">
      <h2>数据备份</h2><span class="chev">›</span>
    </div>
    <div class="collapsible-body" id="sec-backup" hidden>
      <div class="card form-card">
        <div class="btn-row">
          <button class="btn outline" id="btn-export-json">导出 JSON 备份</button>
          <button class="btn outline" id="btn-import-json">导入 JSON</button>
          <input type="file" id="import-file" accept=".json,application/json" hidden>
        </div>
        <div class="hint">导出完整账本（含全部记录与愿望），可随时导入恢复。</div>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head collapsible" data-collapse="sec-about">
      <h2>关于</h2><span class="chev">›</span>
    </div>
    <div class="collapsible-body" id="sec-about" hidden>
      <div class="card form-card about">
        <div class="about-line">流水账 Ledger v1.0 · 纯静态 PWA · 零依赖</div>
        <div class="about-line">五类账户：生活 / 学习 / 娱乐 / 应急 / 愿望</div>
        <div class="about-line">数据文件：数据仓库 <code>data/ledger.json</code>（建议私有）</div>
        <div class="about-line"><button class="link-btn" id="btn-reset-local">清除本机缓存数据</button></div>
      </div>
    </div>
  </section>`;
}

export function bind() {
  // 折叠分组
  document.querySelectorAll('[data-collapse]').forEach((head) => {
    head.addEventListener('click', () => {
      const body = document.getElementById(head.dataset.collapse);
      if (!body) return;
      body.hidden = !body.hidden;
      head.classList.toggle('open', !body.hidden);
    });
  });

  const btnTest = document.getElementById('btn-test');
  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      const owner = document.getElementById('cfg-owner').value.trim();
      const repo = document.getElementById('cfg-repo').value.trim();
      let token = document.getElementById('cfg-token').value.trim();
      const dataOwner = document.getElementById('cfg-data-owner').value.trim();
      const dataRepo = document.getElementById('cfg-data-repo').value.trim();
      const old = storage.getConfig();
      if (!token && old.token) token = old.token; // 未重新输入则沿用
      if (!owner || !repo || !token) return toast('请完整填写三项配置', 'err');
      storage.setConfig({ owner, repo, token, dataOwner, dataRepo });
      try {
        const info = await storage.testConnection();
        const remote = await storage.fetchRemote();
        if (!remote.exists && app.data) {
          // 远端无数据：把本地数据推上去
          const pushed = await storage.pushRemote(app.data, null);
          app.sha = pushed.sha;
        } else if (remote.exists) {
          // 远端有数据：加载到本地并刷新界面
          app.data = remote.data;
          app.sha = remote.sha;
          storage.saveLocal(remote.data);
        }
        app.connected = true;
        app.pending = false;
        toast(`连接成功：${info.fullName}${info.dataRepo ? ' / 数据 ' + info.dataRepo : ''}`);
        updateSyncBadge();
        rerender();
      } catch (e) {
        storage.setConfig(old); // 失败回滚旧配置
        toast(`连接失败：${e.message}`, 'err');
      }
    });
  }

  const btnClear = document.getElementById('btn-clear');
  if (btnClear) {
    btnClear.addEventListener('click', () => {
      if (!confirm('断开 GitHub 同步？本机数据保留。')) return;
      storage.setConfig({ owner: '', repo: '', token: '' });
      app.connected = false;
      toast('已断开同步');
      updateSyncBadge();
      rerender();
    });
  }

  const btnSync = document.getElementById('btn-sync');
  if (btnSync) {
    btnSync.addEventListener('click', async () => {
      try {
        await storage.save(app.data);
        app.pending = false;
        toast('同步完成');
        updateSyncBadge();
      } catch (e) {
        toast(`同步失败：${e.message}`, 'err');
      }
    });
  }

  const btnExport = document.getElementById('btn-export-json');
  if (btnExport) {
    btnExport.addEventListener('click', () => {
      download(`ledger_backup_${models.todayStr()}.json`, JSON.stringify(app.data, null, 2));
      toast('已导出备份');
    });
  }

  const btnImport = document.getElementById('btn-import-json');
  const fileInput = document.getElementById('import-file');
  if (btnImport) {
    btnImport.addEventListener('click', () => fileInput.click());
  }
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!Array.isArray(data.transactions) || !Array.isArray(data.goals)) throw new Error('文件结构无效');
        if (!confirm(`导入 ${data.transactions.length} 条记录、${data.goals.length} 个愿望？（将覆盖当前数据）`)) return;
        await storage.save(data);
        app.data = data;
        toast('导入成功');
        rerender();
      } catch (e) {
        toast(`导入失败：${e.message}`, 'err');
      }
      fileInput.value = '';
    });
  }

  const btnReset = document.getElementById('btn-reset-local');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (!confirm('清除本机缓存？远端数据不受影响。')) return;
      storage.clearLocal();
      toast('本机缓存已清除');
    });
  }
}

function download(filename, content) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
