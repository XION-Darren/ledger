/**
 * sw.js — Service Worker：离线缓存静态资源
 * 注意：不缓存/拦截 api.github.com（跨域数据请求）与 data/ 目录。
 */

const CACHE = 'ledger-cache-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/main.js',
  './js/models.js',
  './js/storage.js',
  './js/charts.js',
  './js/views/home.js',
  './js/views/entry.js',
  './js/views/reports.js',
  './js/views/wishes.js',
  './js/views/settings.js',
  './assets/icon.svg',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/')) return; // 数据文件不缓存
  // 网络优先：有网时始终取最新版本；离线时回退缓存
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then((hit) => hit || Response.error()))
  );
});
