const CACHE_NAME = 'artemis-v1';
const CACHE_LIMIT = 50;

const STATIC_ASSETS = [
    '/', '/index.html', '/manifest.json',
    '/js/db.js', '/js/weather.js', '/js/mixEngine.js', '/js/app.js'
];

const NEVER_CACHE_PATTERNS = [/\/api\/.*token/, /\/export\/.*json/, /\/backup/];

function swLog(level, msg, data = {}) {
    console.log(`[SW:${level}] ${msg}`, { ts: new Date().toISOString(), ...data });
}

self.addEventListener('install', e => {
    swLog('INFO', 'Installing SW');
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                swLog('INFO', 'Caching static assets', { count: STATIC_ASSETS.length });
                return cache.addAll(STATIC_ASSETS);
            })
            .catch(err => swLog('ERROR', 'Cache install failed', { err: err.message }))
    );
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(names => Promise.all(
                names.filter(n => n !== CACHE_NAME).map(n => caches.delete(n))
            ))
            .then(() => trimCache(CACHE_NAME, CACHE_LIMIT))
    );
    self.clients.claim();
    swLog('INFO', 'SW activated');
});

async function trimCache(name, limit) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    if (keys.length > limit) {
        for (let i = 0; i < keys.length - limit; i++) await cache.delete(keys[i]);
        swLog('INFO', 'Cache trimmed', { removed: keys.length - limit });
    }
}

self.addEventListener('fetch', e => {
    const { request } = e;
    if (request.method !== 'GET') return;
    
    // Nunca cachear rotas sensíveis
    if (NEVER_CACHE_PATTERNS.some(p => p.test(request.url))) {
        e.respondWith(fetch(request));
        return;
    }
    
    // API de clima: network only, fallback offline
    if (request.url.includes('api.open-meteo.com')) {
        e.respondWith(
            fetch(request).catch(() => 
                new Response(JSON.stringify({ offline: true }), { 
                    headers: { 'Content-Type': 'application/json' } 
                })
            )
        );
        return;
    }
    
    // Cache-first para assets estáticos
    if (/\.(js|css|png|svg|ico)$/.test(new URL(request.url).pathname)) {
        e.respondWith(
            caches.match(request).then(cached => {
                if (cached) {
                    swLog('DEBUG', 'Cache hit', { url: request.url });
                    return cached;
                }
                return fetch(request).then(res => {
                    if (res.status === 200 && res.type === 'basic') {
                        caches.open(CACHE_NAME).then(cache => cache.put(request, res.clone()));
                    }
                    return res;
                });
            })
        );
        return;
    }
    
    // Network-first para HTML, fallback para cache
    e.respondWith(
        fetch(request)
            .then(res => {
                if (res.status === 200) {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return res;
            })
            .catch(() => 
                caches.match(request).then(cached => 
                    cached || (request.mode === 'navigate' ? caches.match('/index.html') : null)
                ) || new Response('Offline', { status: 503 })
            )
    );
});

// Background sync
self.addEventListener('sync', e => {
    if (e.tag === 'sync-data') {
        e.waitUntil(
            self.clients.matchAll()
                .then(clients => clients.forEach(c => c.postMessage({ type: 'SYNC_COMPLETE' })))
        );
    }
});

// Push notifications
self.addEventListener('push', e => {
    const data = e.data?.json() || {};
    e.waitUntil(
        self.registration.showNotification(data.title || 'Artemis', {
            body: data.body || 'Nova notificação',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            data: data.data
        })
    );
});

self.addEventListener('notificationclick', e => {
    e.notification.close();
    e.waitUntil(clients.openWindow('/'));
});