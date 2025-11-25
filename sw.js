const CACHE_NAME = 'aquaflow-pro-v2.2.1'; // Incremented version
const urlsToCache = [
  '/aquaflowpro/',
  '/aquaflowpro/index.html',
  '/aquaflowpro/auth.html',
  '/aquaflowpro/app.html',
  '/aquaflowpro/styles.css',
  '/aquaflowpro/firebase-config.js',
  '/aquaflowpro/auth.js',
  '/aquaflowpro/app.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode@1.5.0/build/qrcode.min.js',
  'https://www.gstatic.com/firebasejs/9.1.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.1.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/9.1.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.1.0/firebase-remote-config-compat.js'
];

// Install event - cache resources
self.addEventListener('install', (event) => {
  console.log('Service Worker installing... v2.2.0');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache v2.2.0');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('All resources cached successfully v2.2.0');
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating v2.2.0...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      console.log('Service Worker activated v2.2.0');
      return self.clients.claim();
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and external URLs
  if (event.request.method !== 'GET') {
    return;
  }

  // For same-origin requests, use cache-first strategy
  if (event.request.url.includes('mnrdevelopers.github.io/aquaflowpro')) {
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Return cached version if available
          if (response) {
            return response;
          }

          // Fetch from network
          return fetch(event.request).then((response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone for cache
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          });
        }).catch(() => {
          // Fallback for HTML pages
          if (event.request.destination === 'document') {
            return caches.match('/aquaflowpro/index.html');
          }
        })
    );
  }
});

// Handle messages from the client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('Skipping waiting - activating new service worker');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage(CACHE_NAME);
  }
});
