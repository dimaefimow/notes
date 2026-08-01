// ==================== SERVICE WORKER ====================
// Обеспечивает оффлайн-режим приложения: кеширует статические файлы
// (app shell) при установке и отдаёт их из кеша, когда сеть недоступна.

const CACHE_VERSION = 'tasks-app-v1';
const CACHE_NAME = CACHE_VERSION;

// Файлы, которые нужно закешировать сразу при установке (app shell)
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js'
];

// Внешние ресурсы (кешируем в режиме no-cors, ответ будет "opaque").
// Сейчас у приложения нет внешних CDN-зависимостей, но механизм оставлен
// на будущее — просто добавьте URL сюда при необходимости.
const EXTERNAL_ASSETS = [];

// ==================== УСТАНОВКА ====================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Не удалось закешировать часть app shell:', err);
      }).then(() => {
        // Внешние ресурсы кешируем отдельно и не блокируем установку при ошибке
        return Promise.all(
          EXTERNAL_ASSETS.map((url) =>
            fetch(url, { mode: 'no-cors' })
              .then((resp) => cache.put(url, resp))
              .catch(() => {})
          )
        );
      });
    })
  );
  self.skipWaiting();
});

// ==================== АКТИВАЦИЯ (очистка старых кешей) ====================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// ==================== СТРАТЕГИЯ ЗАПРОСОВ ====================
// Для навигационных запросов (HTML) и файлов app shell — "network first,
// fallback to cache", чтобы пользователь получал свежую версию, когда есть
// сеть, но приложение продолжало работать оффлайн.
// Для остальных запросов — "cache first, fallback to network".

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Игнорируем не-GET запросы
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isAppShellFile = isSameOrigin && APP_SHELL.some((path) => {
    const normalized = path.replace('./', '');
    return url.pathname.endsWith(normalized) || (normalized === '' && url.pathname === '/');
  });
  const isNavigation = request.mode === 'navigate';

  if (isNavigation || isAppShellFile) {
    event.respondWith(networkFirst(request));
  } else {
    event.respondWith(cacheFirst(request));
  }
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    const cached = await cache.match(request);
    if (cached) return cached;

    // Фолбэк на главную страницу для навигационных запросов оффлайн
    if (request.mode === 'navigate') {
      const indexCached = await cache.match('./index.html');
      if (indexCached) return indexCached;
    }

    return new Response(
      '<h1>Оффлайн</h1><p>Нет соединения с сетью, и страница ещё не закеширована.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (err) {
    // Нет ни кеша, ни сети — отдаём пустой ответ, чтобы не ломать приложение
    return new Response('', { status: 408, statusText: 'Offline' });
  }
}
