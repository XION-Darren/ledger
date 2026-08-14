/**
 * main.js — 入口：注册 Service Worker 并启动应用（独立文件以配合严格 CSP）
 */

import { boot } from './app.js';

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot().catch((e) => console.error(e));
