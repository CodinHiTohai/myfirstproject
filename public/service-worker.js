const CACHE_NAME = 'eyein-cache-v3';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
    '/results.html',
    '/driver-login.html',
    '/driver-register.html',
    '/forgot-password.html',
    '/css/style.css',
    '/css/home.css',
    '/js/user.js',
    '/js/driver.js',
    '/js/lang.js',
    '/js/pwa.js',
    '/manifest.json',
    '/img/icon-192x192.png'
];

// ─── Install: Cache static assets ─────────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Installing Eye In v3...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.allSettled(
                STATIC_ASSETS.map(url =>
                    cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
                )
            );
        })
    );
    self.skipWaiting();
});

// ─── Activate: Cleanup old caches ─────────────────────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// ─── Fetch: Network-first for API, Cache-first for assets ────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip non-GET, API calls, socket.io
    if (request.method !== 'GET') return;
    if (url.pathname.startsWith('/api/') || url.pathname.includes('socket.io')) return;
    // Skip external requests (maps, fonts, CDN)
    if (!url.origin.includes(self.location.origin)) return;

    event.respondWith(
        fetch(request)
            .then(response => {
                // Cache successful responses
                if (response && response.status === 200 && response.type === 'basic') {
                    const toCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, toCache));
                }
                return response;
            })
            .catch(async () => {
                // Network failed — try cache
                const cached = await caches.match(request);
                if (cached) return cached;

                // For HTML page requests, serve offline page
                if (request.headers.get('accept') && request.headers.get('accept').includes('text/html')) {
                    const offlinePage = await caches.match('/offline.html');
                    if (offlinePage) return offlinePage;
                }

                // Return a simple offline response
                return new Response(
                    '<h1>Offline</h1><p>Internet connection nahi hai.</p>',
                    { headers: { 'Content-Type': 'text/html' } }
                );
            })
    );
});

// ─── Push Notifications ───────────────────────────────────────────────────
self.addEventListener('push', event => {
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'Eye In';
    const options = {
        body: data.body || 'Aapki ride update aayi hai!',
        icon: '/img/icon-192x192.png',
        badge: '/img/icon-192x192.png',
        vibrate: [100, 50, 100],
        data: { url: data.url || '/' },
        actions: data.actions || []
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const url = event.notification.data.url || '/';
    event.waitUntil(clients.openWindow(url));
});
