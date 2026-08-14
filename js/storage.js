/**
 * storage.js — GitHub 数据存储层
 *
 * ★ 双仓库架构（代码公开 + 数据私有）：
 *   代码仓库 owner/repo 部署 GitHub Pages（公开）；数据文件存数据仓库
 *   dataOwner/dataRepo（建议私有）。两者可相同（单仓库模式，留空数据仓库即回退）。
 * 数据文件：数据仓库根目录 data/ledger.json（GitHub contents API）
 * 策略：localStorage 为本地缓存（离线可读写），GitHub 为权威备份；
 *       写操作更新本地后推送远端，推送失败标记「待同步」。
 * 安全：token 仅存于 localStorage，绝不写入代码/仓库/日志。
 */

import { emptyLedger } from './models.js';

const CONFIG_KEY = 'ledger:config';
const CACHE_KEY = 'ledger:cache';
const DATA_PATH = 'data/ledger.json';
const API = 'https://api.github.com';

export const storage = {
  /** @returns {{owner:string, repo:string, token:string, dataOwner:string, dataRepo:string}} */
  getConfig() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    } catch {
      return {};
    }
  },

  setConfig(cfg) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ owner: '', repo: '', token: '', dataOwner: '', dataRepo: '', ...cfg }));
  },

  isConfigured() {
    const c = this.getConfig();
    return !!(c.owner && c.repo && c.token);
  },

  /** 数据仓库：优先独立数据仓库，未配置则回退代码仓库 */
  _dataRepo() {
    const c = this.getConfig();
    return {
      owner: c.dataOwner || c.owner,
      repo: c.dataRepo || c.repo,
    };
  },

  /* ---------- 本地缓存 ---------- */

  loadLocal() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveLocal(data) {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  },

  clearLocal() {
    localStorage.removeItem(CACHE_KEY);
  },

  /* ---------- GitHub API ---------- */

  async _request(method, path, body) {
    const cfg = this.getConfig();
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ledger-app',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      let msg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j.message) msg += `: ${j.message}`;
      } catch { /* ignore */ }
      const err = new Error(msg);
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  },

  /** 读取远端数据文件；不存在返回 {exists:false} */
  async fetchRemote() {
    const d = this._dataRepo();
    try {
      const j = await this._request('GET', `/repos/${encodeURIComponent(d.owner)}/${encodeURIComponent(d.repo)}/contents/${DATA_PATH}`);
      // atob 返回 Latin-1 字符串，须按 UTF-8 解码，否则中文会乱码
      const binary = atob(j.content.replace(/\s/g, ''));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      const text = new TextDecoder('utf-8').decode(bytes);
      return { exists: true, sha: j.sha, data: JSON.parse(text) };
    } catch (e) {
      if (e.status === 404) return { exists: false, sha: null, data: null };
      throw e;
    }
  },

  /** 推送数据；sha 缺失则新建文件。422/409（缺 sha/冲突）时重新拉取 sha 重试（last-write-wins） */
  async pushRemote(data, sha, retries = 3) {
    const d = this._dataRepo();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
    const body = {
      message: `update ledger data`,
      content,
      ...(sha ? { sha } : {}),
    };
    try {
      const j = await this._request('PUT', `/repos/${encodeURIComponent(d.owner)}/${encodeURIComponent(d.repo)}/contents/${DATA_PATH}`, body);
      return { ok: true, sha: j.content.sha };
    } catch (e) {
      // 422 = 文件已存在但未提供 sha（仅当消息含 sha）；409 = sha 过期。都通过重新拉取最新 sha 重试
      const retryable = e.status === 409 || (e.status === 422 && /sha/i.test(e.message || ''));
      if (retryable && retries > 0) {
        const fresh = await this.fetchRemote();
        return this.pushRemote(data, fresh.exists ? fresh.sha : null, retries - 1);
      }
      throw e;
    }
  },

  /** 校验 token 与仓库可访问性（设置页「测试连接」：代码仓库 + 数据仓库都要可访问） */
  async testConnection() {
    const cfg = this.getConfig();
    const d = this._dataRepo();
    const j = await this._request('GET', `/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`);
    let dataInfo = null;
    try {
      const dj = await this._request('GET', `/repos/${encodeURIComponent(d.owner)}/${encodeURIComponent(d.repo)}`);
      dataInfo = { fullName: dj.full_name, private: dj.private };
    } catch (e) {
      throw new Error(`代码仓库 OK，但数据仓库访问失败：${e.message}`);
    }
    return { ok: true, fullName: j.full_name, private: j.private, defaultBranch: j.default_branch, dataRepo: dataInfo.fullName, dataPrivate: dataInfo.private };
  },

  /* ---------- 高层同步 ---------- */

  /**
   * 完整同步：本地无数据则拉远端；远端更新则覆盖本地。
   * @returns {{source:'remote'|'local', data:object, sha:string|null}}
   */
  async sync() {
    const remote = await this.fetchRemote();
    const local = this.loadLocal();
    if (remote.exists) {
      const remoteNewer = !local || (remote.data?.meta?.updatedAt || 0) >= (local.meta?.updatedAt || 0);
      const data = remoteNewer ? remote.data : local;
      this.saveLocal(data);
      return { source: 'remote', data, sha: remote.sha };
    }
    if (local) {
      return { source: 'local', data: local, sha: null };
    }
    return { source: 'local', data: null, sha: null };
  },

  /** 保存（本地即时生效 + 后台推送）。shaHint 为最近一次已知的远端文件 sha */
  async save(data, shaHint) {
    const prev = this.loadLocal() || {};
    const merged = {
      ...data,
      meta: { ...(prev.meta || {}), ...(data.meta || {}), updatedAt: Date.now() },
    };
    this.saveLocal(merged);
    try {
      const { sha } = await this.pushRemote(merged, shaHint);
      return { ok: true, sha };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};

/** 获取（本地为空时）初始账本 */
export function getInitialLedger() {
  return emptyLedger();
}
