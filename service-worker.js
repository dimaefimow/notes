// ==================== SERVICE WORKER ====================
// Кэширует «оболочку» приложения (HTML/CSS/JS/иконки), чтобы оно
// открывалось даже без интернета вообще — не только хранило данные
// локально (это уже делают localStorage/IndexedDB), но и само грузилось
// из кэша при первом открытии без сети.
//
// При каждом обновлении файлов приложения увеличивайте CACHE_VERSION —
// это заставит браузер скачать новые версии файлов и удалить старый кэш.

const CACHE_VERSION = 'v1';
const CACHE_NAME = `tasks-app-${CACHE_VERSION}`;

// Список файлов «оболочки» — то, без чего приложение не откроется.
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './icon.svg'
];

// ---------- установка: кладём оболочку в кэш ----------
self.addEventListener('install', (event) => {
  self.skipWaiting(); // не ждём закрытия старых вкладок — обновляемся сразу
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((e) => console.error('SW: не удалось закэшировать оболочку', e))
  );
});

// ---------- активация: чистим кэши от старых версий ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- запросы: кэш в приоритете, сеть — в фоне для обновления ----------
// Так приложение мгновенно открывается из кэша (в том числе офлайн),
// а если сеть есть — тихо обновляет кэш свежей версией файла.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // не трогаем запросы к другим доменам (например, если появятся внешние API)
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // сети нет — отдаём то, что есть в кэше

      return cached || networkFetch;
    })
  );
});
