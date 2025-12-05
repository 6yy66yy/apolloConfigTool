// 定义缓存名称和版本
const CACHE_NAME = 'config-editor-v1';
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json'
];

// 安装Service Worker并缓存资源
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        // 使用Promise.allSettled处理可能的请求失败
        const cachePromises = urlsToCache.map(url => {
          return fetch(url)
            .then(response => {
              if (!response.ok) {
                console.warn(`Failed to fetch ${url}: ${response.status}`);
                return null;
              }
              return cache.put(url, response);
            })
            .catch(error => {
              console.warn(`Error fetching ${url}: ${error.message}`);
              return null;
            });
        });
        return Promise.allSettled(cachePromises);
      })
      .then(() => self.skipWaiting())
  );
});

// 激活Service Worker并清理旧缓存
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截网络请求并返回缓存资源
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // 如果缓存中有资源，返回缓存资源
        if (response) {
          return response;
        }
        // 否则从网络请求
        return fetch(event.request)
          .catch((error) => {
            // 处理网络请求失败的情况
            console.warn('Fetch failed for', event.request.url, ': ', error);
            // 返回一个默认的错误响应
            return new Response('Network error happened', {
              status: 408,
              headers: { 'Content-Type': 'text/plain' }
            });
          });
      })
  );
});