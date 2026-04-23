// =============================================================================
// PROJETO DE ESTUDOS: Service Worker (sw.js) – Luminar PWA
// =============================================================================
// Este arquivo é o coração do funcionamento offline do aplicativo.
// Um Service Worker é um script que o navegador executa em segundo plano,
// separado da página, permitindo recursos como cache, sincronização em
// segundo plano e notificações push – essenciais para uma PWA.
//
// Aqui você vai encontrar:
// • Ciclo de vida do SW: install, activate, fetch
// • Estratégias de cache: Cache First, Network First, Cache Only para assets
// • Limpeza automática de cache (evita acumular muitos arquivos)
// • Integração com Background Sync e Push Notifications
// • Gerenciamento de atualizações do próprio Service Worker
// =============================================================================

// Nome do cache – alterar a versão força uma nova instalação
const CACHE_NAME = "luminar-v2";
// Número máximo de itens no cache. Quando ultrapassar, os mais antigos são removidos.
const CACHE_LIMIT = 50;

// Lista de recursos estáticos que serão pré-cacheados na instalação.
// Esses arquivos são essenciais para a aplicação funcionar mesmo sem internet.
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

// Padrões de URL que NUNCA devem ser cacheados
// (ex.: tokens de autenticação, exportações, rotas de backup)
const NEVER_CACHE_PATTERNS = [/\/api\/.*token/, /\/export\/.*json/, /\/backup/];

// ============================================================================
// EVENTO: INSTALL (quando o SW é instalado pela primeira vez ou atualizado)
// ============================================================================
self.addEventListener("install", (event) => {
  console.log("[SW] Instalando...");
  // waitUntil() garante que a instalação não termine até a promessa resolver
  event.waitUntil(
    caches
      .open(CACHE_NAME)                 // Abre (ou cria) o cache com o nome definido
      .then((cache) => cache.addAll(STATIC_ASSETS)) // Adiciona todos os assets estáticos
      .then(() => self.skipWaiting())    // Força o novo SW a assumir o controle imediatamente
      .catch((err) => console.error("[SW] Cache failed:", err)),
  );
});

// ============================================================================
// EVENTO: ACTIVATE (quando o SW assume o controle das páginas)
// ============================================================================
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()                           // Lista todas as chaves (nomes de cache) existentes
      .then((keys) => {
        // Remove caches antigos (versões anteriores) para não ocupar espaço
        return Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        );
      })
      .then(() => {
        // Aplica o limite máximo de itens no cache atual
        return trimCache(CACHE_NAME, CACHE_LIMIT);
      })
      .then(() => self.clients.claim()), // Permite que o SW controle as páginas abertas imediatamente
  );
  console.log("[SW] Ativado e controlando clientes");
});

// ============================================================================
// FUNÇÃO AUXILIAR: trimCache (remove itens mais antigos do cache)
// ============================================================================
// Mantém o cache dentro de um limite, excluindo os primeiros registros (FIFO).
async function trimCache(cacheName, limit) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();            // Obtém todas as entradas (Request)
  if (keys.length > limit) {
    const toDelete = keys.slice(0, keys.length - limit); // Seleciona os excedentes do início
    await Promise.all(toDelete.map((key) => cache.delete(key)));
    console.log(`[SW] Cache trimmed: removidos ${toDelete.length} itens`);
  }
}

// ============================================================================
// EVENTO: FETCH (intercepta todas as requisições da página)
// ============================================================================
// Aqui definimos como cada tipo de recurso será obtido. O SW pode servir do
// cache, buscar na rede ou combinar as duas coisas.
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Apenas requisições GET são manipuladas (POST, PUT etc. passam direto)
  if (request.method !== "GET") return;

  // 2. Rotas sensíveis: nunca cache, sempre tenta a rede
  if (NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // 3. API de clima (externa): Network First, fallback offline
  //    Se a rede falhar, retorna um JSON indicando que está offline
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

  // 4. Assets estáticos (js, css, imagens): Cache First
  //    Sempre tenta o cache primeiro. Se não encontrar, busca na rede e atualiza o cache.
  if (/\.(js|css|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;                 // Cache hit!
        return fetch(request)                       // Cache miss → rede
          .then((response) => {
            if (
              response.ok &&
              (response.type === "basic" || response.type === "cors")  // Evita salvar respostas opacas
            ) {
              const clone = response.clone();       // Clona a resposta (o stream só pode ser lido uma vez)
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, clone);
                trimCache(CACHE_NAME, CACHE_LIMIT); // Mantém o cache enxuto
              });
            }
            return response;
          })
          .catch(() => {
            // Se rede falhar, retorna um erro genérico para evitar espera infinita
            return new Response("Recurso não disponível offline", { status: 404 });
          });
      }),
    );
    return;
  }

  // 5. HTML e tudo mais: Network First, fallback para cache (ou index.html offline)
  //    Prioriza a rede, mas se falhar, tenta o cache; se for navegação, usa o index.html offline.
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
        // Tenta encontrar no cache
        const cached = await caches.match(request);
        if (cached) return cached;
        // Se for uma navegação (ex.: recarregou a página), serve o index.html offline
        if (request.mode === "navigate") {
          const offlinePage = await caches.match("/index.html");
          if (offlinePage) return offlinePage;
        }
        // Fallback final: resposta de erro 503 (Serviço Indisponível)
        return new Response("Offline", { status: 503 });
      }),
  );
});

// ============================================================================
// BACKGROUND SYNC (sincronização em segundo plano)
// ============================================================================
// Permite agendar tarefas quando a rede estiver disponível novamente.
// Aqui apenas avisa os clientes que o SW foi ativado.
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

// ============================================================================
// PUSH NOTIFICATIONS (notificações push)
// ============================================================================
// Recebe uma notificação push do servidor e exibe no sistema.
self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};   // Dados enviados pelo servidor
  event.waitUntil(
    self.registration.showNotification(data.title || "Artemis", {
      body: data.body || "Nova notificação",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      data: data.data,                     // Dados extras que podem ser usados no clique
    }),
  );
});

// Quando o usuário clica na notificação, abre a página inicial do app.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow("/"));
});

// ============================================================================
// ATUALIZAÇÃO AUTOMÁTICA DO SERVICE WORKER
// ============================================================================
// Mensagens entre a página e o SW podem ser usadas para forçar a atualização.
// Aqui, se a página enviar { type: "SKIP_WAITING" }, o novo SW assume o controle.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Quando um novo SW assume o controle, o evento 'controllerchange' é disparado.
// Pode ser usado na página para sugerir uma recarga.
self.addEventListener("controllerchange", () => {
  // O cliente (página) pode ouvir e recarregar, se desejar.
});
