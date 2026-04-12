// Luminar PWA - Service Worker (Versão Estável)
const CACHE_NAME = "luminar-v2";
const CACHE_LIMIT = 50; // ← Definido

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/sw.js",
  "/js/db.js",
  "/js/weather.js",
  "/js/mixEngine.js",
  "/js/app.js",
  "/js/utils.js",
  "/js/health-check.js",
];

const NEVER_CACHE_PATTERNS = [/\/api\/.*token/, /\/export\/.*json/, /\/backup/];

// ========== INSTALL ==========
self.addEventListener("install", (event) => {
  console.log("[SW] Instalando...");
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
      .catch((err) => console.error("[SW] Cache failed:", err)),
  );
});

// ========== ACTIVATE ==========
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => {
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => {
        // Limita o cache a CACHE_LIMIT itens (remove os mais antigos)
        return trimCache(CACHE_NAME, CACHE_LIMIT);
      })
      .then(() => self.clients.claim()),
  );
  console.log("[SW] Ativado e controlando clientes");
});

// Função auxiliar: remove itens excedentes do cache (FIFO simples)
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > limit) {
    const toDelete = keys.slice(0, keys.length - limit);
    await Promise.all(toDelete.map((key) => cache.delete(key)));
    console.log(`[SW] Cache trimmed: removidos ${toDelete.length} itens`);
  }
}

// ========== FETCH ==========
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Apenas GET
  if (request.method !== "GET") return;

  // 2. Rotas sensíveis (nunca cachear)
  if (NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. API de clima: network first, fallback offline
  if (url.hostname.includes("api.open-meteo.com")) {
    event.respondWith(
      fetch(request).catch(() => {
        return new Response(JSON.stringify({ offline: true }), {
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    return;
  }

  // 4. Assets estáticos (js, css, imagens) -> Cache First
  if (/\.(js|css|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request)
          .then((response) => {
            if (
              response.ok &&
              (response.type === "basic" || response.type === "cors")
            ) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
                trimCache(CACHE_NAME, CACHE_LIMIT); // evita crescimento infinito
              });
            }
            return response;
          })
          .catch(() => {
            // Fallback offline: retorna uma resposta simples para evitar pending forever
            return new Response("Recurso não disponível offline", {
              status: 404,
            });
          });
      }),
    );
    return;
  }

  // 5. HTML e demais: Network First, fallback para index.html
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (response.type === "basic" || response.type === "cors")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, clone);
            trimCache(CACHE_NAME, CACHE_LIMIT);
          });
        }
        return response;
      })
      .catch(async () => {
        // Fallback: tenta o cache, se não for navegação
        const cached = await caches.match(request);
        if (cached) return cached;
        // Se for navegação (HTML), serve o index.html do cache
        if (request.mode === "navigate") {
          const offlinePage = await caches.match("/index.html");
          if (offlinePage) return offlinePage;
        }
        return new Response("Offline", { status: 503 });
      }),
  );
});

// ========== BACKGROUND SYNC (opcional, mantido) ==========
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-data") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({ type: "SW_ACTIVATED" }),
        );
      }),
    );
  }
});

// ========== PUSH NOTIFICATIONS (opcional, mantido) ==========
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification(data.title || "Artemis", {
      body: data.body || "Nova notificação",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      data: data.data,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});

// ========== ATUALIZAÇÃO AUTOMÁTICA ==========
// Quando uma nova versão do SW é encontrada e instalada, avisa o cliente
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Quando uma nova versão assume o controle, avisa todos os clientes para recarregar
self.addEventListener("controllerchange", () => {
  // Isso será ouvido pelo cliente
});
