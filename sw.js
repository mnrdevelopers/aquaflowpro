const CACHE_NAME = 'aquaflow-pro-v2.2.2'; // Incremented version
const urlsToCache = [
  '/aquaflowpro/',
  '/aquaflowpro/index.html',
  '/aquaflowpro/auth.html',
  '/aquaflowpro/app.html',
  '/aquaflowpro/styles.css',
  '/aquaflowpro/firebase-config.js',
  '/aquaflowpro/auth.js',
  '/aquaflowpro/app.js',
  '/aquaflowpro/pwa.js',
  '/aquaflowpro/manifest.json',
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
  console.log('Service Worker installing... v2.2.2');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache v2.2.2');
        return cache.addAll(urlsToCache);
      })
      .then(() => {
        console.log('All resources cached successfully v2.2.2');
        // Skip waiting to activate immediately
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error('Cache installation failed:', error);
      })
  );
});

// Activate event - clean up old caches and claim clients immediately
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating v2.2.2...');
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
      console.log('Service Worker activated v2.2.2 - claiming clients');
      // Immediately claim all clients to ensure the new SW controls the page
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
  if (event.request.url.startsWith(self.location.origin)) {
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
    console.log('Received SKIP_WAITING message - activating immediately');
    self.skipWaiting().then(() => {
      console.log('Skip waiting completed, claiming clients');
      return self.clients.claim();
    }).then(() => {
      // Notify all clients to reload
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SW_UPDATED',
            message: 'Service Worker updated - please reload'
          });
        });
      });
    });
  }
  
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage(CACHE_NAME);
  }
});
