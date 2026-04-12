// Main Application Controller for Luminar PWA
// Security-hardened version with XSS protection and null safety

class LuminarApp {
  constructor() {
    this.currentPage = "dashboard";
    this.currentUserId = null;
    this.currentUser = null;
    this.produtos = [];
    this.metas = {};
    this.regrasMix = [];
    this.weatherData = null;
    this.chartInstances = {};
    this.initialized = false;
  }

  // === UTILITÁRIOS DE SEGURANÇA ===

  // Previne XSS ao inserir texto no HTML
  escapeHtml(text) {
    if (typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // Sanitiza texto para Markdown (Obsidian export)
  sanitizeForMarkdown(text) {
    return String(text || "")
      .replace(/"/g, '\\"')
      .replace(/\n/g, " ")
      .replace(/[<>]/g, "")
      .trim();
  }

  // Valida e converte números com fallback seguro
  safeNumber(value, fallback = 0) {
    const num = parseFloat(value);
    return isNaN(num) || num < 0 ? fallback : num;
  }

  // === INICIALIZAÇÃO ===

  async init() {
    try {
      if (typeof db === "undefined") throw new Error("Database não carregado");
      console.log("Iniciando Luminar...");
      await db.init();
      console.log("DB inicializado");

      // Verifica se já existe usuário logado
      const savedUserId = localStorage.getItem("luminar_userId");
      if (savedUserId) {
        const users = await db.getAllUsers();
        this.currentUser = users.find((u) => u.id === savedUserId);
        if (this.currentUser) {
          this.currentUserId = savedUserId;
          await this.loadUserData();
          this.hideLoginScreenAndShowApp();
          this.setupConnectivityListeners();
          this.setupHeaderMenu();
          this.initialized = true;
          console.log("✅ Luminar initialized successfully");
          return;
        } else {
          localStorage.removeItem("luminar_userId");
        }
      }
      // Se não logado, mostra tela de login
      this.showLoginScreen();
      this.setupConnectivityListeners();
      // Listener para atualização do Service Worker
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          console.log("🔄 Nova versão detectada! Recarregando...");
          window.location.reload();
        });

        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data && event.data.type === "SW_ACTIVATED") {
            console.log(
              "🔄 SW assumiu controle. Recarregando para aplicar nova versão...",
            );
            window.location.reload();
          }
        });

        // Verifica se há uma atualização pendente
        navigator.serviceWorker.ready.then((registration) => {
          registration.addEventListener("updatefound", () => {
            const newWorker = registration.installing;
            newWorker.addEventListener("statechange", () => {
              if (
                newWorker.state === "installed" &&
                navigator.serviceWorker.controller
              ) {
                // Nova versão instalada e pronta. Pergunta se quer atualizar agora?
                if (
                  confirm(
                    "Uma nova versão do Luminar está disponível! Deseja atualizar agora?",
                  )
                ) {
                  newWorker.postMessage({ type: "SKIP_WAITING" });
                }
              }
            });
          });
        });
      }
    } catch (error) {
      console.error("❌ Initialization error:", error);
      this.showToast(
        "Erro crítico. Recarregue a página (Ctrl+Shift+R)",
        "error",
      );
    }
  }

  // Setup modal event listeners (após DOM estar pronto)
  setupModalListeners() {
    const modal = document.getElementById("modal");
    if (modal) {
      modal.addEventListener("click", (e) => {
        if (e.target.id === "modal") {
          this.closeModal();
        }
      });
    }
  }

  updateDateDisplay() {
    const hoje = new Date();
    const options = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const el = document.getElementById("currentDate");
    if (el) el.textContent = hoje.toLocaleDateString("pt-BR", options);
  }

  setupConnectivityListeners() {
    window.addEventListener("online", () => {
      document.body.classList.remove("offline");
      this.showToast("Conectado! Sincronizando dados...", "success");
      this.syncData();
    });

    window.addEventListener("offline", () => {
      document.body.classList.add("offline");
      this.showToast("Modo offline ativado", "warning");
    });

    if (!navigator.onLine) {
      document.body.classList.add("offline");
    }
  }
  showLoginScreen() {
    const mainContent = document.getElementById("mainContent");
    const header = document.querySelector("header");
    const nav = document.querySelector("nav");
    if (header) {
      header.classList.add("nav-hidden");
      header.classList.remove("nav-visible");
    }
    if (nav) {
      nav.classList.add("nav-hidden");
      nav.classList.remove("nav-visible");
    }

    mainContent.innerHTML = `
        <div class="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div class="bg-white rounded-2xl p-6 w-full max-w-md card-shadow">
                <h1 class="text-2xl font-bold text-center text-purple-700 mb-6">Luminar</h1>
                <div id="loginFormContainer">
                    <form id="loginForm">
                        <input type="text" id="loginUsername" placeholder="Usuário" class="w-full mb-3 px-4 py-2 border rounded-lg">
                        <input type="password" id="loginPassword" placeholder="Senha" class="w-full mb-3 px-4 py-2 border rounded-lg">
                        <button type="submit" class="w-full btn-primary text-white py-2 rounded-lg font-semibold">Entrar</button>
                    </form>
                    <p class="text-center text-sm text-gray-500 mt-4">
                        Não tem conta? <button id="showRegisterBtn" class="text-purple-600 font-medium">Cadastrar</button>
                    </p>
                </div>
                <div id="registerFormContainer" style="display:none;">
                    <form id="registerForm">
                        <input type="text" id="regUsername" placeholder="Usuário" class="w-full mb-3 px-4 py-2 border rounded-lg" required>
                        <input type="password" id="regPassword" placeholder="Senha" class="w-full mb-3 px-4 py-2 border rounded-lg" required>
                        <input type="text" id="regLojaNome" placeholder="Nome da Loja" class="w-full mb-3 px-4 py-2 border rounded-lg" required>
                        <input type="text" id="regVendedorNome" placeholder="Seu Nome" class="w-full mb-3 px-4 py-2 border rounded-lg" required>
                        <button type="submit" class="w-full btn-primary text-white py-2 rounded-lg font-semibold">Cadastrar</button>
                    </form>
                    <p class="text-center text-sm text-gray-500 mt-4">
                        Já tem conta? <button id="showLoginBtn" class="text-purple-600 font-medium">Entrar</button>
                    </p>
                </div>
            </div>
        </div>
    `;

    document
      .getElementById("loginForm")
      .addEventListener("submit", (e) => this.doLogin(e));
    document.getElementById("showRegisterBtn").addEventListener("click", () => {
      document.getElementById("loginFormContainer").style.display = "none";
      document.getElementById("registerFormContainer").style.display = "block";
    });
    document
      .getElementById("registerForm")
      .addEventListener("submit", (e) => this.doRegister(e));
    document.getElementById("showLoginBtn").addEventListener("click", () => {
      document.getElementById("registerFormContainer").style.display = "none";
      document.getElementById("loginFormContainer").style.display = "block";
    });
  }

  async doLogin(event) {
    event.preventDefault();
    const username = document.getElementById("loginUsername").value.trim();
    const password = document.getElementById("loginPassword").value;

    const user = await db.getUserByUsername(username);
    if (!user || user.password !== password) {
      this.showToast("Usuário ou senha inválidos", "error");
      return;
    }

    this.currentUserId = user.id;
    this.currentUser = user;
    localStorage.setItem("luminar_userId", user.id);
    localStorage.setItem("luminar_username", username);

    await this.loadUserData();
    this.hideLoginScreenAndShowApp();
  }

  async doRegister(event) {
    event.preventDefault();
    const username = document.getElementById("regUsername").value.trim();
    const password = document.getElementById("regPassword").value;
    const lojaNome = document.getElementById("regLojaNome").value.trim();
    const vendedorNome = document
      .getElementById("regVendedorNome")
      .value.trim();

    const existing = await db.getUserByUsername(username);
    if (existing) {
      this.showToast("Usuário já existe", "error");
      return;
    }

    const userId = "user_" + Date.now();
    const newUser = {
      id: userId,
      username,
      password,
      lojaNome,
      vendedorNome,
      createdAt: new Date().toISOString(),
    };
    await db.createUser(newUser);
    await db.initDefaultConfigForUser(userId);

    this.showToast("Cadastro realizado! Faça login.", "success");
    this.currentUserId = userId;
    this.currentUser = newUser;
    localStorage.setItem("luminar_userId", userId);
    await this.loadUserData(); // Carrega produtos e metas padrão
    this.startOnboarding(); // Novo método
    //document.getElementById("registerFormContainer").style.display = "none";
    //document.getElementById("loginFormContainer").style.display = "block";
  }

  async loadUserData() {
    this.metas = (await db.getConfig(this.currentUserId, "metas")) || {
      survival: 110,
      comfortable: 150,
      ideal: 260,
      semanal: 750,
      mensal: 3000,
    };
    this.climaConfig = (await db.getConfig(
      this.currentUserId,
      "climaConfig",
    )) || {
      cidade: "Rio de Janeiro",
      lat: -22.9455,
      lon: -43.3627,
    };
    // Em loadUserData, após carregar climaConfig:
    this.weatherData = await weather.getWeather(
      this.climaConfig?.lat || -22.9455,
      this.climaConfig?.lon || -43.3627,
    );
    this.indicadores = (await db.getConfig(
      this.currentUserId,
      "indicadores",
    )) || {
      usarClima: true,
      usarDiaSemana: true,
    };
    this.produtos = (await db.getConfig(this.currentUserId, "produtos")) || [];
    this.regrasMix =
      (await db.getConfig(this.currentUserId, "regrasMix")) || [];

    if (this.produtos.length === 0) {
      this.produtos = db.getDefaultProdutos();
      await db.setConfig(this.currentUserId, "produtos", this.produtos);
    }
    if (this.regrasMix.length === 0) {
      this.regrasMix = db.getDefaultRegrasMix();
      await db.setConfig(this.currentUserId, "regrasMix", this.regrasMix);
    }

    this.updateDateDisplay();
    this.navigate("dashboard");
  }

  hideLoginScreenAndShowApp() {
    const header = document.querySelector("header");
    const nav = document.querySelector("nav");
    if (header) {
      header.classList.remove("nav-hidden");
      header.classList.add("nav-visible");
      // Atualiza o título com o nome da loja
      const lojaNome = this.currentUser?.lojaNome || "Luminar";
      const h1 = header.querySelector("h1");
      if (h1) h1.textContent = lojaNome;
    }
    if (nav) {
      nav.classList.remove("nav-hidden");
      nav.classList.add("nav-visible");
    }
  }
  // === NAVEGAÇÃO ===

  navigate(page) {
    this.currentPage = page;

    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.remove("text-purple-600", "tab-active");
      btn.classList.add("text-gray-500");
    });
    const activeBtn = document.querySelector(`[data-page="${page}"]`);
    if (activeBtn) {
      activeBtn.classList.remove("text-gray-500");
      activeBtn.classList.add("text-purple-600", "tab-active");
    }

    const mainContent = document.getElementById("mainContent");
    if (!mainContent) return;
    mainContent.innerHTML = "";

    switch (page) {
      case "dashboard":
        this.renderDashboard(mainContent);
        break;
      case "registrar":
        this.renderRegistrar(mainContent);
        break;
      case "fiados":
        this.renderFiados(mainContent);
        break;
      case "relatorios":
        this.renderRelatorios(mainContent);
        break;
    }
  }

  // === DASHBOARD ===

  async renderDashboard(container) {
    const hoje = new Date().toISOString().split("T")[0];
    const registroHoje = await db.getRegistro(hoje, this.currentUserId);
    const registros = await db.getAllRegistros(this.currentUserId);
    const vendasSemana = this.calcularVendasSemana(registros);
    const vendasMes = this.calcularVendasMes(registros);

    const sugestaoMix = await mixEngine.generateSuggestion({
      data: hoje,
      diaSemana: new Date().toLocaleDateString("pt-BR", { weekday: "long" }),
      clima: this.weatherData,
      temperatura: this.weatherData?.current?.temperature,
      produtos: this.produtos,
      regras: this.regrasMix,
    });

    const metas = this.metas || { survival: 110, comfortable: 150, ideal: 260 };
    const valorDia = registroHoje?.fluxo?.pagosDia || 0;
    const progressPct =
      metas.ideal > 0 ? Math.min(100, (valorDia / metas.ideal) * 100) : 0;

    container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-semibold text-gray-700">Meta Diária</h2>
                    <span class="text-sm text-gray-500">${registroHoje ? "✅ Registrado" : "⏳ Pendente"}</span>
                </div>
                <div class="text-center mb-4">
                    <span class="text-3xl font-bold text-gray-800">R$ ${valorDia.toFixed(2)}</span>
                    <span class="text-gray-500">/ R$ ${(metas.ideal ?? 260).toFixed(2)}</span>
                </div>
                <div class="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div class="h-full progress-gradient rounded-full transition-all duration-500" 
                         style="width: ${progressPct}%"></div>
                </div>
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-yellow-100 rounded-lg p-2">
                        <div class="text-xs text-yellow-700 font-medium">Sobrevivência</div>
                        <div class="text-sm font-bold text-yellow-800">R$ ${metas.survival ?? 110}</div>
                    </div>
                    <div class="bg-orange-100 rounded-lg p-2">
                        <div class="text-xs text-orange-700 font-medium">Confortável</div>
                        <div class="text-sm font-bold text-orange-800">R$ ${metas.comfortable ?? 150}</div>
                    </div>
                    <div class="bg-green-100 rounded-lg p-2">
                        <div class="text-xs text-green-700 font-medium">Ideal</div>
                        <div class="text-sm font-bold text-green-800">R$ ${metas.ideal ?? 260}</div>
                    </div>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-semibold text-gray-700">Sugestão de Mix</h2>
                    <span class="text-2xl">${this.weatherData?.current?.condition?.icon || "🌡️"}</span>
                </div>
                <p class="text-sm text-gray-600 mb-3">
                    ${this.weatherData?.current?.condition?.name || "Carregando..."} • 
                    ${this.weatherData?.current?.temperature ?? "--"}°C
                    ${this.weatherData?.cached ? "(cache)" : ""}
                </p>
                <p class="text-xs text-gray-500 mb-3">${this.escapeHtml(sugestaoMix.explicacao || "")}</p>
                <div class="space-y-2 mb-4">${this.renderMixPreview(sugestaoMix.mix)}</div>
                <div class="flex justify-between items-center text-sm">
                    <span class="text-gray-600">Total: <strong>${sugestaoMix.totalItens ?? 0}</strong> itens</span>
                    <span class="text-green-600">Estimativa: R$ ${sugestaoMix.estimativaFaturamento ?? 0}</span>
                </div>
            </div>

            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">Vendas da Semana</h2>
                <div class="h-48"><canvas id="weeklyChart"></canvas></div>
            </div>

            <div class="grid grid-cols-2 gap-4">
    <div class="bg-white rounded-2xl p-4 card-shadow">
        <div class="text-sm text-gray-500 mb-1">Esta Semana</div>
        <div class="text-xl font-bold text-gray-800">R$ ${vendasSemana.toFixed(2)}</div>
        <div class="text-xs text-gray-400">Meta: R$ ${(metas.semanal ?? 750).toFixed(2)}</div>
    </div>
    <div class="bg-white rounded-2xl p-4 card-shadow">
        <div class="text-sm text-gray-500 mb-1">Este Mês</div>
        <div class="text-xl font-bold text-gray-800">R$ ${vendasMes.toFixed(2)}</div>
        <div class="text-xs text-gray-400">Meta: R$ ${(metas.mensal ?? 3000).toFixed(2)}</div>
    </div>
</div>
        `;

    this.renderWeeklyChart(registros);
  }

  renderMixPreview(mix) {
    const categorias = { bolos: [], brownies: [], brigadeiros: [], outros: [] };

    for (const [id, qtd] of Object.entries(mix || {})) {
      if (!qtd || qtd <= 0) continue;
      const produto = this.produtos?.find((p) => p.id === id);
      if (!produto) continue;

      if (produto.categoria === "bolos")
        categorias.bolos.push({ nome: produto.nome, qtd });
      else if (produto.categoria === "brownies")
        categorias.brownies.push({ nome: produto.nome, qtd });
      else if (produto.categoria === "brigadeiros")
        categorias.brigadeiros.push({ nome: produto.nome, qtd });
      else categorias.outros.push({ nome: produto.nome, qtd });
    }

    let html = "";
    const renderBadge = (nome, qtd, color) =>
      `<span class="text-xs bg-${color}-100 text-${color}-700 px-2 py-0.5 rounded">${this.escapeHtml(nome)} ${qtd}</span>`;

    if (categorias.bolos.length > 0) {
      html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Bolos:</span> ${categorias.bolos.map((b) => renderBadge(b.nome, b.qtd, "yellow")).join("")}</div>`;
    }
    if (categorias.brownies.length > 0) {
      html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brownies:</span> ${categorias.brownies.map((b) => renderBadge(b.nome, b.qtd, "amber")).join("")}</div>`;
    }
    if (categorias.brigadeiros.length > 0) {
      html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brigadeiros:</span> ${categorias.brigadeiros.map((b) => renderBadge(b.nome, b.qtd, "purple")).join("")}</div>`;
    }

    return (
      html || '<span class="text-gray-400 text-sm">Nenhum item sugerido</span>'
    );
  }

  renderWeeklyChart(registros) {
    const canvas = document.getElementById("weeklyChart");
    if (!canvas || typeof Chart === "undefined") return;

    const dias = [],
      valores = [];
    for (let i = 6; i >= 0; i--) {
      const data = new Date();
      data.setDate(data.getDate() - i);
      const dataStr = data.toISOString().split("T")[0];
      const diaLabel = data.toLocaleDateString("pt-BR", { weekday: "short" });
      const registro = registros?.find((r) => r.id === dataStr);
      dias.push(diaLabel);
      valores.push(registro?.fluxo?.pagosDia || 0);
    }

    if (this.chartInstances.weekly) this.chartInstances.weekly.destroy();

    this.chartInstances.weekly = new Chart(canvas, {
      type: "bar",
      data: {
        labels: dias,
        datasets: [
          {
            label: "Vendas (R$)",
            data: valores,
            backgroundColor: "rgba(102, 126, 234, 0.8)",
            borderColor: "rgba(102, 126, 234, 1)",
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: (v) => "R$ " + v } },
        },
      },
    });
  }

  // === REGISTRAR ===

  async renderRegistrar(container) {
    // CORREÇÃO: Usar data local ao invés de UTC
    const hoje = new Date()
      .toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
      .split("/")
      .reverse()
      .join("-");
    const diaSemana = new Date().toLocaleDateString("pt-BR", {
      weekday: "long",
      timeZone: "America/Sao_Paulo",
    });
    const registroExistente = await db.getRegistro(hoje, this.currentUserId);

    // Get mix suggestion for pre-fill
    const sugestaoMix = await mixEngine.generateSuggestion({
      data: hoje,
      diaSemana: diaSemana,
      clima: this.weatherData,
      temperatura: this.weatherData?.current?.temperature,
      produtos: this.produtos,
      regras: this.regrasMix,
    });

    container.innerHTML = `
        <div class="bg-white rounded-2xl p-5 card-shadow">
            <h2 class="font-semibold text-gray-700 mb-4">📓 Registro Diário</h2>
            
            <form id="registroForm">
                <!-- Data e Dia -->
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">Data</label>
                        <input type="date" id="regData" value="${hoje}" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">Dia</label>
                        <input type="text" id="regDiaSemana" value="${diaSemana}" readonly
                               class="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-500">
                    </div>
                </div>

                <!-- Fluxo do Dia -->
                <div class="mb-4">
                    <h3 class="font-medium text-gray-700 mb-2">💰 Fluxo do Dia</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">🟢 Pagos (R$)</label>
                            <input type="number" step="0.01" id="regPagos" required
                                   value="${registroExistente?.fluxo?.pagosDia || ""}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">🟡 Fiados (R$)</label>
                            <input type="number" step="0.01" id="regFiados"
                                   value="${registroExistente?.fluxo?.fiadosHoje || "0"}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                    </div>
                    <div class="mt-2">
                        <label class="block text-sm text-gray-600 mb-1">🔵 Recebidos de Fiados (R$)</label>
                        <input type="number" step="0.01" id="regRecebidos"
                               value="${registroExistente?.fluxo?.recebidosFiados || "0"}"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                    </div>
                </div>

                <!-- Tempo Operacional -->
                <div class="mb-4">
                    <h3 class="font-medium text-gray-700 mb-2">⏳ Tempo Operacional</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Início</label>
                            <input type="time" id="regInicio" required
                                   value="${registroExistente?.tempoOperacional?.inicio || ""}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Fim</label>
                            <input type="time" id="regFim" required
                                   value="${registroExistente?.tempoOperacional?.fim || ""}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                    </div>
                </div>

                <!-- Itens Vendidos -->
                <div class="mb-4">
                    <h3 class="font-medium text-gray-700 mb-2">🍰 Itens Vendidos</h3>
                    <p class="text-xs text-gray-500 mb-2">Preencha: Levado → Vendido</p>
                    
                    ${this.renderItensForm(sugestaoMix.mix, registroExistente?.itensVendidos)}
                </div>

                <!-- Clima -->
                <div class="mb-4">
                    <h3 class="font-medium text-gray-700 mb-2">🌡️ Clima</h3>
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Condição</label>
                            <select id="regClimaCondicao" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                                <option value="sol" ${this.weatherData?.current?.condition?.category === "sol" ? "selected" : ""}>☀️ Sol</option>
                                <option value="nublado" ${this.weatherData?.current?.condition?.category === "nublado" ? "selected" : ""}>☁️ Nublado</option>
                                <option value="chuva" ${this.weatherData?.current?.condition?.category === "chuva" ? "selected" : ""}>🌧️ Chuva</option>
                                <option value="tempestade" ${this.weatherData?.current?.condition?.category === "tempestade" ? "selected" : ""}>⛈️ Tempestade</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Temperatura (°C)</label>
                            <input type="number" id="regClimaTemp" step="1" 
                                value="${Math.round(this.weatherData?.current?.temperature || 25)}"
                                class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                </div>

                <!-- Observações -->
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-600 mb-1">📝 Observações</label>
                    <textarea id="regObservacoes" rows="3"
                              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                              placeholder="O que aconteceu de diferente hoje?">${registroExistente?.observacoes || ""}</textarea>
                </div>

                <!-- Submit -->
                <button type="submit" class="w-full btn-primary text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition">
                    ${registroExistente ? "💾 Atualizar Registro" : "✅ Salvar Registro"}
                </button>
            </form>
        </div>
    `;

    // Update dia da semana when date changes
    document.getElementById("regData").addEventListener("change", (e) => {
      const data = new Date(e.target.value + "T12:00:00"); // Força meio-dia para evitar timezone
      const diaSemana = data.toLocaleDateString("pt-BR", { weekday: "long" });
      document.getElementById("regDiaSemana").value = diaSemana;
    });

    // CORREÇÃO: Adicionar event listener no form
    document
      .getElementById("registroForm")
      .addEventListener("submit", (e) => this.salvarRegistro(e));
  }

  renderItensForm(sugestaoMix, itensExistentes) {
    const categorias = {
      bolos: { nome: "🎂 Bolos", produtos: [], emoji: "🎂" },
      brownies: { nome: "🍫 Brownies", produtos: [], emoji: "🍫" },
      brigadeiros: { nome: "🍬 Brigadeiros", produtos: [], emoji: "🍬" },
      mousses: { nome: "🧁 Mousses", produtos: [], emoji: "🧁" },
      copos: { nome: "🍧 Copos", produtos: [], emoji: "🍧" },
      sacoles: { nome: "🍨 Sacolés", produtos: [], emoji: "🍨" },
      bebidas: { nome: "🥤 Bebidas", produtos: [], emoji: "🥤" },
    };

    for (const produto of this.produtos || []) {
      if (categorias[produto.categoria]) {
        const sugestao = sugestaoMix?.[produto.id] || 0;
        const existente = itensExistentes?.find(
          (i) => i.codigo === produto.codigo,
        );
        categorias[produto.categoria].produtos.push({
          ...produto,
          sugestao,
          levado: existente?.levado || sugestao || 0, // Pré-preenche com sugestão se não houver existente
          vendido: existente?.vendido || 0,
        });
      }
    }

    let html = "";
    for (const [catKey, categoria] of Object.entries(categorias)) {
      if (categoria.produtos.length === 0) continue;
      // Usa <details> para accordion nativo – aberto por padrão se houver sugestão > 0 ou itens já preenchidos
      const temSugestaoOuPreenchido = categoria.produtos.some(
        (p) => p.sugestao > 0 || p.levado > 0,
      );
      const openAttr = temSugestaoOuPreenchido ? "open" : "";

      html += `<details class="bg-gray-50 rounded-lg p-3 mb-3" ${openAttr}>
            <summary class="font-medium text-gray-700 cursor-pointer list-none flex items-center">
                <span class="mr-2">${openAttr ? "▼" : "▶"}</span> ${categoria.nome} (${categoria.produtos.length} itens)
            </summary>
            <div class="grid grid-cols-2 gap-2 mt-3">`;

      for (const prod of categoria.produtos) {
        html += `
                <div class="bg-white rounded-lg p-2 border border-gray-200">
                    <div class="text-xs text-gray-600 mb-1">${this.escapeHtml(prod.nome)} (${prod.codigo})</div>
                    <div class="flex gap-2">
                        <input type="number" min="0" name="levado_${prod.id}" value="${prod.levado || ""}" placeholder="Lev" class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded">
                        <input type="number" min="0" name="vendido_${prod.id}" value="${prod.vendido || ""}" placeholder="Vend" class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded">
                    </div>
                    ${prod.sugestao > 0 ? `<div class="text-xs text-purple-600 mt-1">Sugestão: ${prod.sugestao}</div>` : ""}
                </div>`;
      }
      html += `</div></details>`;
    }
    return html;
  }

  async salvarRegistro(event) {
    event.preventDefault();

    const data = document.getElementById("regData").value;

    // CORREÇÃO: Validar data antes de salvar
    if (!data || data.trim() === "") {
      this.showToast("Data inválida", "error");
      return;
    }

    // Collect items vendidos
    const itensVendidos = [];
    for (const produto of this.produtos) {
      const levado =
        parseInt(
          document.querySelector(`[name="levado_${produto.id}"]`)?.value,
        ) || 0;
      const vendido =
        parseInt(
          document.querySelector(`[name="vendido_${produto.id}"]`)?.value,
        ) || 0;

      if (levado > 0 || vendido > 0) {
        itensVendidos.push({
          categoria: produto.categoria,
          codigo: produto.codigo,
          nome: produto.nome,
          levado,
          vendido,
          precoUnitario: produto.preco,
        });
      }
    }

    // Calculate efficiency
    const eficiencia = this.calcularEficiencia(itensVendidos);

    // CORREÇÃO: Verificar se já existe registro antes de sobrescrever
    const registroExistente = await db.getRegistro(data, this.currentUserId);
    if (
      registroExistente &&
      !confirm("Já existe um registro para esta data. Deseja sobrescrever?")
    ) {
      return;
    }

    const registro = {
      id: data,
      data: data,
      diaSemana: document.getElementById("regDiaSemana").value,
      fluxo: {
        pagosDia: parseFloat(document.getElementById("regPagos").value) || 0,
        fiadosHoje: parseFloat(document.getElementById("regFiados").value) || 0,
        recebidosFiados:
          parseFloat(document.getElementById("regRecebidos").value) || 0,
      },
      tempoOperacional: {
        inicio: document.getElementById("regInicio").value,
        fim: document.getElementById("regFim").value,
        totalMinutos: this.calcularMinutos(
          document.getElementById("regInicio").value,
          document.getElementById("regFim").value,
        ),
      },
      itensVendidos,
      clima: {
        real: {
          condicao: document.getElementById("regClimaCondicao").value,
          temperatura: parseFloat(
            document.getElementById("regClimaTemp").value,
          ),
        },
        previsao: {
          condicao:
            this.weatherData?.forecast?.[0]?.condition?.category || "nublado",
          temperatura: this.weatherData?.forecast?.[0]?.maxTemp || 25,
          fonte: "Open-Meteo",
        },
      },
      observacoes: document.getElementById("regObservacoes").value,
      eficiencia,
      agentesFeedback: this.gerarFeedbackAgentes(
        itensVendidos,
        eficiencia,
        data,
      ),
    };

    try {
      await db.saveRegistro(registro, this.currentUserId);
      this.showToast("Registro salvo com sucesso!", "success");
      this.navigate("dashboard");
    } catch (error) {
      console.error("Error saving registro:", error);
      this.showToast("Erro ao salvar registro", "error");
    }
  }

  calcularEficiencia(itens) {
    let totalLevado = 0,
      totalVendido = 0;
    const porCategoria = {},
      porProduto = {};

    for (const item of itens) {
      totalLevado += item.levado;
      totalVendido += item.vendido;
      if (!porCategoria[item.categoria])
        porCategoria[item.categoria] = { levado: 0, vendido: 0 };
      porCategoria[item.categoria].levado += item.levado;
      porCategoria[item.categoria].vendido += item.vendido;
      porProduto[item.codigo] =
        item.levado > 0 ? item.vendido / item.levado : 0;
    }

    const efPorCategoria = {};
    for (const [cat, vals] of Object.entries(porCategoria)) {
      efPorCategoria[cat] = vals.levado > 0 ? vals.vendido / vals.levado : 0;
    }

    return {
      geral: totalLevado > 0 ? totalVendido / totalLevado : 0,
      porCategoria: efPorCategoria,
      porProduto,
    };
  }

  calcularMinutos(inicio, fim) {
    if (!inicio || !fim) return 0;
    const [h1, m1] = inicio.split(":").map(Number);
    const [h2, m2] = fim.split(":").map(Number);
    return Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
  }

  gerarFeedbackAgentes(itens, eficiencia) {
    const efGeral = Math.round((eficiencia?.geral || 0) * 100);
    return {
      imperius: `Eficiência geral de ${efGeral}%. Análise baseada nos dados do dia.`,
      markus: `Dica operacional: ${efGeral > 80 ? "Ótimo desempenho!" : "Ajuste o mix para melhorar."}`,
      phil: "Você está no caminho certo. Continue registrando!",
    };
  }

  // === FIADOS ===

  async renderFiados(container) {
    const fiadosAtivos = await db.getFiadosAtivos(this.currentUserId);
    const fiadosVencidos = await db.getFiadosVencidos(this.currentUserId);
    const totalDevido = (fiadosAtivos || []).reduce(
      (sum, f) => sum + (f.valor || 0),
      0,
    );

    container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="font-semibold text-gray-700">👥 Controle de Fiados</h2>
                    <button id="btnNovoFiado" class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium">+ Novo</button>
                </div>
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-yellow-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-yellow-700">${fiadosAtivos?.length || 0}</div>
                        <div class="text-xs text-yellow-600">Fiados Ativos</div>
                    </div>
                    <div class="bg-red-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-red-700">${fiadosVencidos?.length || 0}</div>
                        <div class="text-xs text-red-600">Vencidos</div>
                    </div>
                </div>
                <div class="bg-gray-100 rounded-lg p-3 mb-4 text-center">
                    <div class="text-sm text-gray-600">Total a Receber</div>
                    <div class="text-2xl font-bold text-gray-800">R$ ${totalDevido.toFixed(2)}</div>
                </div>
                <div class="space-y-3">
                    ${
                      fiadosAtivos?.length === 0
                        ? '<p class="text-center text-gray-500 py-4">Nenhum fiado ativo</p>'
                        : (fiadosAtivos || [])
                            .map((f) => this.renderFiadoCard(f))
                            .join("")
                    }
                </div>
            </div>
        `;

    document
      .getElementById("btnNovoFiado")
      ?.addEventListener("click", () => this.openModal("novoFiado"));
    // 🔥 Delegação de eventos para o botão Quitar (com confirmação)
    container.addEventListener("click", (e) => {
      const btnQuitar = e.target.closest(".btn-quitar");
      if (btnQuitar) {
        const fiadoId = btnQuitar.dataset.fiadoId;
        if (fiadoId) {
          this.confirmarQuitarFiado(fiadoId); // <- chama o novo método
        }
      }
    });
  }

  renderFiadoCard(fiado) {
    const hoje = new Date().toISOString().split("T")[0];
    const vencido = fiado.dataVencimento < hoje;

    return `
            <div class="border border-gray-200 rounded-lg p-3 ${vencido ? "bg-red-50 border-red-200" : "bg-white"}">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-medium text-gray-800">${this.escapeHtml(fiado.clienteNome)}</div>
                        <div class="text-sm text-gray-500">
                            R$ ${(fiado.valor || 0).toFixed(2)} • 
                            Vence: ${new Date(fiado.dataVencimento + "T12:00:00").toLocaleDateString("pt-BR")}
                            ${vencido ? ' <span class="text-red-600 font-medium">(VENCIDO)</span>' : ""}
                        </div>
                    </div>
                    <button data-fiado-id="${fiado.id}" class="btn-quitar text-green-600 hover:bg-green-50 px-3 py-1 rounded-lg text-sm font-medium">
                        Quitar
                    </button>
                </div>
            </div>
        `;
  }

  // Novo método: exibe diálogo de confirmação antes de quitar
  async confirmarQuitarFiado(fiadoId) {
    const fiado = await db.getFiado(fiadoId);
    if (!fiado) {
      this.showToast("Fiado não encontrado.", "error");
      return;
    }

    const valorFormatado = fiado.valor.toFixed(2);
    const nomeCliente = this.escapeHtml(fiado.clienteNome);

    // Cria um modal de confirmação personalizado
    const modal = document.getElementById("modal");
    const content = document.getElementById("modalContent");
    if (!modal || !content) return;

    content.innerHTML = `
        <div class="p-5">
            <h3 class="text-lg font-bold text-gray-800 mb-3">Confirmar Quitação</h3>
            <p class="text-gray-700 mb-2">
                Confirmar quitação de <strong>R$ ${valorFormatado}</strong> de <strong>${nomeCliente}</strong>?
            </p>
            <p class="text-gray-700 mb-4">
                Deseja registrar este valor como recebido no fluxo de caixa de hoje?
            </p>
            <div class="flex gap-3">
                <button id="btnQuitarComFluxo" class="flex-1 bg-green-600 text-white py-2 rounded-lg font-medium">
                    Sim, adicionar ao dia
                </button>
                <button id="btnQuitarSemFluxo" class="flex-1 bg-gray-600 text-white py-2 rounded-lg font-medium">
                    Não, apenas quitar
                </button>
            </div>
            <button id="btnCancelarQuitar" class="w-full mt-3 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium">
                Cancelar
            </button>
        </div>
    `;

    modal.classList.remove("hidden");

    // Listener para "Sim, adicionar ao dia"
    document
      .getElementById("btnQuitarComFluxo")
      .addEventListener("click", async () => {
        modal.classList.add("hidden");
        await this.executarQuitarFiado(fiado, true);
      });

    // Listener para "Não, apenas quitar"
    document
      .getElementById("btnQuitarSemFluxo")
      .addEventListener("click", async () => {
        modal.classList.add("hidden");
        await this.executarQuitarFiado(fiado, false);
      });

    // Listener para "Cancelar"
    document
      .getElementById("btnCancelarQuitar")
      .addEventListener("click", () => {
        modal.classList.add("hidden");
      });
  }

  // Executa a quitação e opcionalmente adiciona ao fluxo de caixa
  async executarQuitarFiado(fiado, adicionarAoFluxo) {
    // Marca como quitado
    fiado.pago = true;
    fiado.dataPagamento = new Date().toISOString().split("T")[0];
    fiado.quitado_automaticamente = adicionarAoFluxo; // campo novo
    await db.saveFiado(fiado, this.currentUserId);

    if (adicionarAoFluxo) {
      // Adiciona ao registro do dia atual como "Recebidos de Fiados"
      const hoje = new Date().toISOString().split("T")[0];
      let registroHoje = await db.getRegistro(hoje, this.currentUserId);

      if (!registroHoje) {
        // Cria um registro mínimo se não existir
        registroHoje = {
          id: hoje,
          data: hoje,
          diaSemana: new Date().toLocaleDateString("pt-BR", {
            weekday: "long",
          }),
          fluxo: { pagosDia: 0, fiadosHoje: 0, recebidosFiados: 0 },
          tempoOperacional: { inicio: "", fim: "", totalMinutos: 0 },
          itensVendidos: [],
          clima: {
            real: { condicao: "nublado", temperatura: 25 },
            previsao: {
              condicao: "nublado",
              temperatura: 25,
              fonte: "Open-Meteo",
            },
          },
          observacoes: `Quitação automática do fiado de ${fiado.clienteNome}`,
          eficiencia: { geral: 0, porCategoria: {}, porProduto: {} },
          agentesFeedback: this.gerarFeedbackAgentes([], { geral: 0 }, hoje),
        };
      }

      // Garante que a estrutura existe
      if (!registroHoje.fluxo)
        registroHoje.fluxo = { pagosDia: 0, fiadosHoje: 0, recebidosFiados: 0 };

      // Adiciona o valor ao campo recebidosFiados
      registroHoje.fluxo.recebidosFiados =
        (registroHoje.fluxo.recebidosFiados || 0) + fiado.valor;

      // Adiciona uma observação sobre a quitação automática
      if (!registroHoje.observacoes) registroHoje.observacoes = "";
      registroHoje.observacoes += `\n[Auto] Quitação de fiado: ${fiado.clienteNome} - R$ ${fiado.valor.toFixed(2)}`;

      await db.saveRegistro(registroHoje, this.currentUserId);
      this.showToast(
        `Fiado quitado e R$ ${fiado.valor.toFixed(2)} adicionado ao caixa de hoje!`,
        "success",
      );
    } else {
      this.showToast("Fiado quitado com sucesso!", "success");
    }

    // Recarrega a tela de fiados
    this.renderFiados(document.getElementById("mainContent"));
  }

  async quitarFiado(id) {
    const fiado = await db.getFiado(id);
    if (!fiado) return;
    fiado.pago = true;
    fiado.dataPagamento = new Date().toISOString().split("T")[0];
    await db.saveFiado(fiado, this.currentUserId);
    this.showToast("Fiado quitado!", "success");
    this.renderFiados(document.getElementById("mainContent"));
  }

  // === RELATÓRIOS ===

  async renderRelatorios(container) {
    const registros = await db.getAllRegistros(this.currentUserId);
    const dataLimite = new Date();
    dataLimite.setDate(dataLimite.getDate() - 30);
    const ultimos30 = (registros || []).filter(
      (r) => new Date(r.data) >= dataLimite,
    );

    container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">📈 Relatórios</h2>
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-purple-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-purple-700">${registros?.length || 0}</div>
                        <div class="text-xs text-purple-600">Dias Registrados</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-green-700">${ultimos30?.length || 0}</div>
                        <div class="text-xs text-green-600">Últimos 30 dias</div>
                    </div>
                </div>
                <div class="space-y-2">
                    <button id="btnExportJson" class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition">💾 Backup (JSON)</button>
                    <button id="btnExportMd" class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition">📝 Obsidian (MD)</button>
                    <button id="btnImportar" class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition">📥 Importar Dados</button>
                </div>
            </div>
        `;

    document
      .getElementById("btnExportJson")
      ?.addEventListener("click", () => this.exportData());
    document
      .getElementById("btnExportMd")
      ?.addEventListener("click", () => this.exportObsidian());
    document
      .getElementById("btnImportar")
      ?.addEventListener("click", () => this.openModal("importar"));
  }

  // === MODALS ===

  openModal(type, tab = null) {
    const modal = document.getElementById("modal");
    const content = document.getElementById("modalContent");
    if (!modal || !content) return;

    modal.classList.remove("hidden");

    switch (type) {
      case "novoFiado":
        content.innerHTML = this.renderNovoFiadoModal();
        document
          .getElementById("formNovoFiado")
          ?.addEventListener("submit", (e) => this.salvarFiado(e));
        // Fecha ao clicar no X
        const btnClose = content.querySelector("#btnCloseModal");
        if (btnClose)
          btnClose.addEventListener("click", () => this.closeModal());
        break;
      case "importar":
        content.innerHTML = this.renderImportarModal();
        document
          .getElementById("btnDoImport")
          ?.addEventListener("click", () => this.doImport());
        const btnCloseImport = content.querySelector("#btnCloseModal");
        if (btnCloseImport)
          btnCloseImport.addEventListener("click", () => this.closeModal());

        break;
      case "settings":
        content.innerHTML = this.renderSettingsModal();
        // Listeners das abas
        content.querySelectorAll(".tab-settings").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const tab = e.currentTarget.dataset.tab;
            content.querySelectorAll(".tab-settings").forEach((b) => {
              b.classList.remove(
                "text-purple-600",
                "border-b-2",
                "border-purple-600",
              );
              b.classList.add("text-gray-500");
            });
            e.currentTarget.classList.add(
              "text-purple-600",
              "border-b-2",
              "border-purple-600",
            );
            e.currentTarget.classList.remove("text-gray-500");

            content
              .querySelectorAll(".tab-content")
              .forEach((c) => c.classList.add("hidden"));
            content
              .querySelector(
                `#tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`,
              )
              .classList.remove("hidden");
          });
        });
        // Listener salvar metas
        document
          .getElementById("btnSaveSettings")
          ?.addEventListener("click", () => this.salvarConfiguracoes());

        // Listener salvar clima
        document
          .getElementById("btnSaveClima")
          ?.addEventListener("click", () => this.salvarConfigClima());
        // 🔥 Listener para o botão de localização GPS
        document
          .getElementById("btnUsarLocalizacao")
          ?.addEventListener("click", async () => {
            try {
              const coords = await this.obterLocalizacaoAtual();
              const cidadeInput = document.getElementById("cidadeClima");
              if (cidadeInput) {
                cidadeInput.value = `${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}`;
              }
              this.showToast("Localização obtida com sucesso!", "success");
            } catch (error) {
              console.error("Erro ao obter localização:", error);
              this.showToast(
                "Não foi possível obter sua localização. Verifique as permissões.",
                "error",
              );
            }
          });
        // Listeners CRUD de produtos
        document
          .getElementById("btnAddProduto")
          ?.addEventListener("click", () => this.abrirModalProduto());
        document.querySelectorAll(".btn-edit-produto").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const id = e.currentTarget.dataset.produtoId;
            const produto = this.produtos.find((p) => p.id === id);
            if (produto) this.abrirModalProduto(produto);
          });
        });
        document.querySelectorAll(".btn-delete-produto").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            const id = e.currentTarget.dataset.produtoId;
            this.excluirProduto(id);
          });
        });
        // Se uma tab específica foi solicitada, ativa-a
        if (tab) {
          const tabBtn = content.querySelector(
            `.tab-settings[data-tab="${tab}"]`,
          );
          if (tabBtn) tabBtn.click();
        }
        // Listener logout
        document
          .getElementById("btnLogout")
          ?.addEventListener("click", () => this.logout());
        const btnCloseSettings = content.querySelector("#btnCloseModal");
        if (btnCloseSettings)
          btnCloseSettings.addEventListener("click", () => this.closeModal());
        break;
    }
  }

  closeModal() {
    document.getElementById("modal")?.classList.add("hidden");
  }

  renderNovoFiadoModal() {
    const hoje = new Date().toISOString().split("T")[0];
    const vencimento = new Date();
    vencimento.setDate(vencimento.getDate() + 7);

    return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">Novo Fiado</h3>
                    <button id="btnCloseModal" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <form id="formNovoFiado">
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-600 mb-1">Nome do Cliente</label>
                        <input type="text" id="fiadoNome" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-600 mb-1">Valor (R$)</label>
                        <input type="number" step="0.01" id="fiadoValor" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-600 mb-1">Data</label>
                            <input type="date" id="fiadoData" value="${hoje}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-600 mb-1">Vencimento</label>
                            <input type="date" id="fiadoVencimento" value="${vencimento.toISOString().split("T")[0]}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                    <button type="submit" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Salvar Fiado</button>
                </form>
            </div>
        `;
  }

  async salvarFiado(event) {
    event.preventDefault();
    const nome = document.getElementById("fiadoNome")?.value?.trim();
    const valor = this.safeNumber(document.getElementById("fiadoValor")?.value);

    if (!nome || valor <= 0) {
      this.showToast("Preencha nome e valor válidos", "error");
      return;
    }

    const fiado = {
      id: "fiado_" + Date.now(),
      clienteNome: this.escapeHtml(nome),
      valor,
      dataEmprestimo:
        document.getElementById("fiadoData")?.value ||
        new Date().toISOString().split("T")[0],
      dataVencimento: document.getElementById("fiadoVencimento")?.value,
      pago: false,
    };

    await db.saveFiado(fiado, this.currentUserId);
    this.closeModal();
    this.showToast("Fiado registrado!", "success");
    this.renderFiados(document.getElementById("mainContent"));
  }

  renderSettingsModal() {
    const metas = this.metas || {
      survival: 110,
      comfortable: 150,
      ideal: 260,
      semanal: 750,
      mensal: 3000,
    };
    // Carrega configurações de clima e indicadores (se existirem)
    const climaConfig = this.climaConfig || {
      cidade: "Rio de Janeiro",
      lat: -22.9455,
      lon: -43.3627,
    };
    const indicadores = this.indicadores || {
      usarClima: true,
      usarDiaSemana: true,
    };

    return `
        <div class="p-5">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-gray-800">⚙️ Configurações</h3>
                <button id="btnCloseModal" class="text-gray-500 text-2xl">&times;</button>
            </div>
            
            <!-- Abas -->
            <div class="flex border-b border-gray-200 mb-4">
                <button class="tab-settings active flex-1 py-2 text-center font-medium text-purple-600 border-b-2 border-purple-600" data-tab="metas">Metas</button>
                <button class="tab-settings flex-1 py-2 text-center font-medium text-gray-500" data-tab="cardapio">Cardápio</button>
                <button class="tab-settings flex-1 py-2 text-center font-medium text-gray-500" data-tab="clima">Clima</button>
                <button class="tab-settings flex-1 py-2 text-center font-medium text-gray-500" data-tab="perfil">Perfil</button>
            </div>
            
            <!-- Conteúdo da Aba Metas -->
            <div id="tabMetas" class="tab-content">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-2">Metas Diárias</label>
                        <div class="grid grid-cols-3 gap-2">
                            <div><label class="text-xs text-yellow-600">Sobrevivência</label><input type="number" id="metaSurvival" value="${metas.survival}" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></div>
                            <div><label class="text-xs text-orange-600">Confortável</label><input type="number" id="metaComfortable" value="${metas.comfortable}" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></div>
                            <div><label class="text-xs text-green-600">Ideal</label><input type="number" id="metaIdeal" value="${metas.ideal}" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></div>
                        </div>
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-2">Meta Semanal</label>
                        <input type="number" id="metaSemanal" value="${metas.semanal || 750}" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-2">Meta Mensal</label>
                        <input type="number" id="metaMensal" value="${metas.mensal || 3000}" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <button id="btnSaveSettings" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Salvar Metas</button>
                </div>
            </div>
            
            <!-- Conteúdo da Aba Cardápio -->
            <div id="tabCardapio" class="tab-content hidden">
                <div class="space-y-3">
                    <button id="btnAddProduto" class="w-full py-2 bg-green-100 text-green-700 rounded-lg font-medium text-sm">➕ Adicionar Produto</button>
                    <div id="listaProdutosSettings" class="max-h-80 overflow-y-auto space-y-2">
                        ${this.renderListaProdutosSettings()}
                    </div>
                </div>
            </div>
            
            <!-- Conteúdo da Aba Clima & Indicadores -->
            <div id="tabClima" class="tab-content hidden">
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">Cidade para previsão do tempo</label>
            <input type="text" id="cidadeClima" value="${this.escapeHtml(climaConfig.cidade || "")}" placeholder="Ex: Freguesia, Rio de Janeiro" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            <p class="text-xs text-gray-500 mt-1">Usado para sugerir o mix de produtos.</p>
            <button type="button" id="btnUsarLocalizacao" class="w-full py-2 bg-blue-100 text-blue-700 rounded-lg text-sm mt-2">📍 Usar minha localização atual</button>
        </div>
                    <div class="border-t pt-4">
                        <label class="block text-sm font-medium text-gray-600 mb-2">Indicadores de Impacto</label>
                        <div class="space-y-2">
                            <label class="flex items-center">
                                <input type="checkbox" id="indClima" ${indicadores.usarClima ? "checked" : ""} class="mr-2"> Considerar clima na sugestão de mix
                            </label>
                            <label class="flex items-center">
                                <input type="checkbox" id="indDiaSemana" ${indicadores.usarDiaSemana ? "checked" : ""} class="mr-2"> Considerar dia da semana
                            </label>
                        </div>
                    </div>
                    <button id="btnSaveClima" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Salvar Configurações de Clima</button>
                </div>
            </div>
            
            <!-- Conteúdo da Aba Perfil (placeholder) -->
            <div id="tabPerfil" class="tab-content hidden">
                <p class="text-gray-500 text-center py-4">Em breve: editar nome da loja e vendedor.</p>
            </div>
            
            <button id="btnLogout" class="w-full bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-semibold mt-4">🚪 Sair da conta</button>
        </div>
    `;
  }

  async salvarConfiguracoes() {
    this.metas = {
      survival: parseInt(document.getElementById("metaSurvival")?.value) || 110,
      comfortable:
        parseInt(document.getElementById("metaComfortable")?.value) || 150,
      ideal: parseInt(document.getElementById("metaIdeal")?.value) || 260,
      semanal: parseInt(document.getElementById("metaSemanal")?.value) || 750,
      mensal: parseInt(document.getElementById("metaMensal")?.value) || 3000,
    };
    await db.setConfig(this.currentUserId, "metas", this.metas);
    this.closeModal();
    this.showToast("Metas salvas!", "success");
    if (this.currentPage === "dashboard")
      this.renderDashboard(document.getElementById("mainContent"));
  }

  renderImportarModal() {
    return `
        <div class="p-5">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-gray-800">📥 Importar Dados</h3>
                <button id="btnCloseModal" class="text-gray-500 text-2xl">&times;</button>
            </div>
            <p class="text-sm font-medium text-gray-600 mb-1">Arquivo JSON</p>
            <input type="file" id="importFile" accept=".json" class="w-full mb-3 p-2 border rounded-lg">
            <p class="text-sm font-medium text-gray-600 mb-1">...ou cole o JSON aqui</p>
            <textarea id="importTextArea" rows="6" class="w-full p-2 border rounded-lg text-sm mb-3" placeholder='Cole aqui o JSON gerado pela IA...'></textarea>
            <button id="btnDoImport" class="w-full py-3 bg-gray-800 text-white rounded-xl font-semibold">Importar</button>
        </div>
    `;
  }

  async doImport() {
    // 1. Tenta pegar dados da TEXTAREA primeiro (colagem)
    const textArea = document.getElementById("importTextArea");
    let jsonData = null;

    if (textArea && textArea.value.trim() !== "") {
      try {
        jsonData = JSON.parse(textArea.value.trim());
      } catch (e) {
        this.showToast(
          "JSON inválido na área de texto. Verifique a formatação.",
          "error",
        );
        return;
      }
    } else {
      // 2. Se não colou nada, tenta ler o ARQUIVO selecionado
      const fileInput = document.getElementById("importFile");
      const file = fileInput?.files?.[0];
      if (!file) {
        this.showToast(
          "Selecione um arquivo JSON ou cole o conteúdo na caixa de texto.",
          "error",
        );
        return;
      }
      try {
        const text = await file.text();
        jsonData = JSON.parse(text);
      } catch (e) {
        this.showToast("Arquivo JSON inválido ou corrompido.", "error");
        return;
      }
    }

    // 3. Processa os dados
    try {
      // Caso 1: Registro único (formato do prompt de IA)
      if (jsonData.data && jsonData.fluxo) {
        // 🔥 CORREÇÃO: Adiciona o campo 'id' obrigatório
        if (!jsonData.id) {
          jsonData.id = jsonData.data;
        }

        const registroExistente = await db.getRegistro(
          jsonData.id,
          this.currentUserId,
        );
        if (registroExistente) {
          if (
            !confirm(
              `Registro do dia ${jsonData.data} já existe. Deseja sobrescrever?`,
            )
          ) {
            this.showToast("Importação cancelada.", "info");
            this.closeModal();
            return;
          }
        }
        await db.saveRegistro(jsonData, this.currentUserId);
        this.showToast(
          `Registro de ${jsonData.data} importado com sucesso!`,
          "success",
        );
      }
      // Caso 2: Backup completo (contém arrays "registros" ou "fiados")
      else if (jsonData.registros || jsonData.fiados) {
        if (jsonData.registros) {
          for (const r of jsonData.registros) {
            // Garante que cada registro tenha id (fallback para data)
            if (!r.id && r.data) r.id = r.data;
            await db.saveRegistro(r, this.currentUserId);
          }
        }
        if (jsonData.fiados) {
          for (const f of jsonData.fiados) {
            await db.saveFiado(f, this.currentUserId);
          }
        }
        if (jsonData.config) {
          for (const [k, v] of Object.entries(jsonData.config)) {
            await db.setConfig(this.currentUserId, k, v);
          }
        }
        this.showToast("Backup completo importado!", "success");
      } else {
        this.showToast(
          'Formato de arquivo não reconhecido. O JSON deve conter "data" e "fluxo" ou "registros"/"fiados".',
          "error",
        );
        return;
      }

      // 4. Fecha o modal e recarrega a página atual
      this.closeModal();
      if (this.currentPage === "dashboard") {
        this.renderDashboard(document.getElementById("mainContent"));
      } else {
        this.navigate(this.currentPage);
      }
    } catch (e) {
      console.error("Erro durante a importação:", e);
      this.showToast("Erro ao processar os dados. Tente novamente.", "error");
    }
  }

  // === EXPORT/UTILITIES ===

  async exportData() {
    const data = await db.exportAllData(this.currentUserId);
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luminar_backup_${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Backup exportado!", "success");
  }

  async exportObsidian() {
    const registros = await db.getAllRegistros(this.currentUserId);
    let markdown = "";

    for (const reg of (registros || []).sort(
      (a, b) => new Date(b.data) - new Date(a.data),
    )) {
      markdown += this.registroToMarkdown(reg);
      markdown += "\n---\n\n";
    }

    const blob = new Blob([markdown], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `luminar_registros_${new Date().toISOString().split("T")[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
    this.showToast("Exportado para Obsidian!", "success");
  }

  registroToMarkdown(reg) {
    if (!reg) return "";
    let md = `#financeiro\n---\ndata: "${this.sanitizeForMarkdown(reg.data)}"\ndia_da_semana: "${this.sanitizeForMarkdown(reg.diaSemana)}"\ntipo: diário\n---\n\n`;
    md += `# 📓 Vendas ${new Date(reg.data + "T12:00:00").toLocaleDateString("pt-BR")}\n\n`;
    md += `## 💰 FLUXO DO DIA\n`;
    md += `**🟢 PAGOS NO DIA:** R$ ${this.safeNumber(reg.fluxo?.pagosDia).toFixed(2)}\n`;
    md += `**🟡 FIADOS HOJE:** R$ ${this.safeNumber(reg.fluxo?.fiadosHoje).toFixed(2)}\n`;
    md += `**🔵 RECEBIDOS:** R$ ${this.safeNumber(reg.fluxo?.recebidosFiados).toFixed(2)}\n\n`;
    md += `## ⏳ TEMPO OPERACIONAL\n`;
    md += `**🕒 INÍCIO:** ${reg.tempoOperacional?.inicio || "--"}\n`;
    md += `**🕔 FIM:** ${reg.tempoOperacional?.fim || "--"}\n`;
    if (reg.tempoOperacional?.totalMinutos) {
      const h = Math.floor(reg.tempoOperacional.totalMinutos / 60);
      const m = reg.tempoOperacional.totalMinutos % 60;
      md += `**⏳ TOTAL:** ${h}h ${m}min\n\n`;
    }
    md += `## 🍰 ITENS VENDIDOS\n\n`;
    const byCat = {};
    for (const item of reg.itensVendidos || []) {
      if (!byCat[item.categoria]) byCat[item.categoria] = [];
      byCat[item.categoria].push(item);
    }
    const emojis = {
      bolos: "🎂",
      brownies: "🍫",
      brigadeiros: "🍬",
      mousses: "🧁",
      copos: "🍧",
      sacoles: "🍨",
      bebidas: "🥤",
    };
    for (const [cat, items] of Object.entries(byCat)) {
      md += `### ${emojis[cat] || "📦"} ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
      for (const item of items) {
        const ef =
          item.levado > 0 ? Math.round((item.vendido / item.levado) * 100) : 0;
        md += `- **${this.sanitizeForMarkdown(item.nome)} (${item.codigo}):** ${item.vendido}un (lev: ${item.levado}, ef: ${ef}%)\n`;
      }
      md += "\n";
    }
    md += `## 🌡️ CLIMA\n`;
    md += `**REAL:** ${reg.clima?.real?.condicao}, ${reg.clima?.real?.temperatura}°C\n`;
    md += `**PREVISÃO:** ${reg.clima?.previsao?.condicao}, ${reg.clima?.previsao?.temperatura}°C\n\n`;
    md += `## 📝 OBSERVAÇÕES\n${this.sanitizeForMarkdown(reg.observacoes) || "Nenhuma."}\n\n`;
    if (reg.agentesFeedback) {
      md += `## 🤖 FEEDBACK\n`;
      md += `- **IMPERIUS:** ${this.sanitizeForMarkdown(reg.agentesFeedback.imperius)}\n`;
      md += `- **MARKUS:** ${this.sanitizeForMarkdown(reg.agentesFeedback.markus)}\n`;
      md += `- **PHIL:** ${this.sanitizeForMarkdown(reg.agentesFeedback.phil)}\n`;
    }
    return md;
  }

  calcularVendasSemana(registros) {
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(hoje.getDate() - hoje.getDay());
    inicio.setHours(0, 0, 0, 0);
    return (registros || [])
      .filter((r) => new Date(r.data) >= inicio)
      .reduce((sum, r) => sum + this.safeNumber(r.fluxo?.pagosDia), 0);
  }

  calcularVendasMes(registros) {
    const hoje = new Date();
    const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    return (registros || [])
      .filter((r) => new Date(r.data) >= inicio)
      .reduce((sum, r) => sum + this.safeNumber(r.fluxo?.pagosDia), 0);
  }

  showToast(message, type = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;
    const toast = document.createElement("div");
    const colors = {
      success: "bg-green-500",
      error: "bg-red-500",
      warning: "bg-yellow-500",
      info: "bg-blue-500",
    };
    toast.className = `${colors[type] || colors.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-bounce`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  openSettings() {
    this.openModal("settings");
  }

  // ========== ONBOARDING ==========
  startOnboarding() {
    this.onboardingStep = 0;
    this.onboardingData = {
      modo: null, // 'expresso' ou 'personalizado'
    };
    this.renderOnboardingScreen();
  }

  renderOnboardingScreen() {
    const modal = document.getElementById("modal");
    const content = document.getElementById("modalContent");
    if (!modal || !content) return;

    modal.classList.remove("hidden");

    const steps = [
      this.renderStepWelcome(),
      this.renderStepIdentificacao(),
      this.renderStepModo(),
      this.renderStepConfirmacao(),
    ];

    const step = this.onboardingStep;
    content.innerHTML = steps[step];

    // Configura listeners específicos para cada step
    this.bindOnboardingListeners(step, content);
  }

  bindOnboardingListeners(step, content) {
    switch (step) {
      case 0: // Welcome
        document
          .getElementById("btnComecar")
          ?.addEventListener("click", () => this.nextOnboardingStep());
        document
          .getElementById("btnPular")
          ?.addEventListener("click", () => this.finishOnboarding("expresso"));
        break;
      case 1: // Identificação
        document
          .getElementById("btnProximoIdent")
          ?.addEventListener("click", async () => {
            const nome = document
              .getElementById("onboardVendedorNome")
              .value.trim();
            const loja = document
              .getElementById("onboardLojaNome")
              .value.trim();
            const tipoVendedor = document.getElementById(
              "onboardTipoVendedor",
            ).value;
            const horarioInicio = document.getElementById(
              "onboardHorarioInicio",
            ).value;

            if (nome) this.currentUser.vendedorNome = nome;
            if (loja) this.currentUser.lojaNome = loja;
            this.currentUser.tipoVendedor = tipoVendedor;
            this.currentUser.horarioInicio = horarioInicio;

            // Atualiza no banco
            await db.createUser(this.currentUser);
            // Salva também em config para facilitar consultas futuras
            await db.setConfig(this.currentUserId, "perfil_vendedor", {
              tipoVendedor,
              horarioInicio,
            });
            this.nextOnboardingStep();
          });
        break;
      case 2: // Modo
        document
          .getElementById("btnModoExpresso")
          ?.addEventListener("click", () => {
            this.onboardingData.modo = "expresso";
            this.nextOnboardingStep();
          });
        document
          .getElementById("btnModoPersonalizado")
          ?.addEventListener("click", () => {
            this.onboardingData.modo = "personalizado";
            this.nextOnboardingStep();
          });
        break;
      case 3: // Confirmação
        document
          .getElementById("btnIrDashboard")
          ?.addEventListener("click", () => {
            if (this.onboardingData.modo === "expresso") {
              this.finishOnboarding("expresso");
            } else {
              this.finishOnboarding("personalizado");
            }
          });
        break;
    }
  }

  nextOnboardingStep() {
    this.onboardingStep++;
    this.renderOnboardingScreen();
  }

  finishOnboarding(modo) {
    localStorage.setItem("luminar_onboarding_completed", "true");
    this.closeModal();

    if (modo === "expresso") {
      this.hideLoginScreenAndShowApp();
      this.navigate("dashboard");
    } else {
      this.hideLoginScreenAndShowApp();
      // Abre Configurações diretamente na aba Cardápio
      this.openModal("settings", "cardapio");
      this.showToast(
        "Agora cadastre seus produtos na aba Cardápio. Depois ajuste as metas.",
        "info",
      );
    }
  }

  // Métodos de renderização das telas (HTML)
  renderStepWelcome() {
    return `
      <div class="p-5 text-center">
        <span class="text-4xl mb-3 block">🍰</span>
        <h2 class="text-xl font-bold text-gray-800 mb-2">Bem-vindo(a) ao Luminar!</h2>
        <p class="text-gray-600 mb-6">Vamos configurar sua loja em 2 minutos?</p>
        <button id="btnComecar" class="w-full btn-primary text-white py-3 rounded-xl font-semibold mb-2">Começar</button>
        <button id="btnPular" class="w-full bg-gray-200 text-gray-700 py-3 rounded-xl font-semibold">Pular (usar dados de exemplo)</button>
      </div>
    `;
  }

  renderStepIdentificacao() {
    const tipoVendedor = this.currentUser?.tipoVendedor || "fixo";
    const horarioInicio = this.currentUser?.horarioInicio || "16:00";

    return `
        <div class="p-5">
            <h3 class="text-lg font-bold text-gray-800 mb-4">Conte-nos um pouco sobre você</h3>
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-600 mb-1">Seu nome (ou apelido)</label>
                <input type="text" id="onboardVendedorNome" value="${this.escapeHtml(this.currentUser?.vendedorNome || "")}" placeholder="Ex: Ana" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-600 mb-1">Nome da sua loja</label>
                <input type="text" id="onboardLojaNome" value="${this.escapeHtml(this.currentUser?.lojaNome || "")}" placeholder="Ex: Doces da Ana" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <div class="mb-3">
                <label class="block text-sm font-medium text-gray-600 mb-1">Como você costuma vender?</label>
                <select id="onboardTipoVendedor" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    <option value="fixo" ${tipoVendedor === "fixo" ? "selected" : ""}>🏪 Ponto fixo (barraca, loja, quiosque)</option>
                    <option value="ambulante" ${tipoVendedor === "ambulante" ? "selected" : ""}>🚶 Ambulante (rota, isopor, porta a porta)</option>
                </select>
                <p class="text-xs text-gray-500 mt-1">Usado futuramente para mapas de calor e estatísticas.</p>
            </div>
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-600 mb-1">Horário habitual de início das vendas</label>
                <input type="time" id="onboardHorarioInicio" value="${horarioInicio}" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
            </div>
            <button id="btnProximoIdent" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Próximo</button>
        </div>
    `;
  }

  renderStepModo() {
    return `
      <div class="p-5">
        <h3 class="text-lg font-bold text-gray-800 mb-4">Escolha o modo de configuração</h3>
        <div class="space-y-3">
          <button id="btnModoExpresso" class="w-full p-4 bg-green-50 border border-green-200 rounded-xl text-left">
            <div class="font-bold text-green-700 text-lg mb-1">🚀 Modo Expresso</div>
            <div class="text-sm text-gray-600">Usar cardápio e metas padrão da Doçuras de Artemis. Você pode editar depois.</div>
          </button>
          <button id="btnModoPersonalizado" class="w-full p-4 bg-blue-50 border border-blue-200 rounded-xl text-left">
            <div class="font-bold text-blue-700 text-lg mb-1">🛠️ Modo Personalizado</div>
            <div class="text-sm text-gray-600">Configurar metas, produtos e preferências manualmente agora.</div>
          </button>
        </div>
      </div>
    `;
  }

  renderStepConfirmacao() {
    const modo = this.onboardingData.modo;
    const titulo = modo === "expresso" ? "Tudo pronto!" : "Modo Personalizado";
    const descricao =
      modo === "expresso"
        ? "Seu app está configurado com os produtos e metas padrão. Você já pode começar a vender!"
        : "Agora você pode definir suas metas e cadastrar seus produtos nas Configurações.";

    return `
      <div class="p-5 text-center">
        <span class="text-4xl mb-3 block">🎉</span>
        <h3 class="text-lg font-bold text-gray-800 mb-2">${titulo}</h3>
        <p class="text-gray-600 mb-6">${descricao}</p>
        <button id="btnIrDashboard" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Ir para o Dashboard</button>
      </div>
    `;
  }

  async salvarConfigClima() {
    const cidade = document.getElementById("cidadeClima").value.trim();
    const usarClima = document.getElementById("indClima").checked;
    const usarDiaSemana = document.getElementById("indDiaSemana").checked;

    let lat = this.climaConfig?.lat;
    let lon = this.climaConfig?.lon;

    if (cidade && cidade !== this.climaConfig?.cidade) {
      // Verifica se é coordenada (contém vírgula e números)
      if (cidade.includes(",")) {
        const partes = cidade.split(",").map((s) => parseFloat(s.trim()));
        if (partes.length === 2 && !isNaN(partes[0]) && !isNaN(partes[1])) {
          lat = partes[0];
          lon = partes[1];
        }
      } else {
        try {
          const coords = await weather.buscarCoordenadas(cidade);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
        } catch (e) {
          console.warn(
            "Não foi possível obter coordenadas, mantendo anteriores.",
          );
        }
      }
    }

    this.climaConfig = { cidade, lat, lon };
    this.indicadores = { usarClima, usarDiaSemana };

    await db.setConfig(this.currentUserId, "climaConfig", this.climaConfig);
    await db.setConfig(this.currentUserId, "indicadores", this.indicadores);

    // Atualiza o weatherData com a nova localização
    if (lat && lon) {
      this.weatherData = await weather.getWeather(lat, lon);
    }

    this.closeModal();
    this.showToast("Configurações de clima salvas!", "success");
    if (this.currentPage === "dashboard")
      this.renderDashboard(document.getElementById("mainContent"));
  }

  async syncData() {
    this.showToast("Dados sincronizados localmente", "success");
  }

  // === CRUD DE PRODUTOS (Modal Configurações) ===

  renderListaProdutosSettings() {
    if (!this.produtos || this.produtos.length === 0) {
      return '<p class="text-gray-500 text-center py-2">Nenhum produto cadastrado.</p>';
    }
    return this.produtos
      .map((prod) => {
        // Busca o nome da unidade base, se diferente do próprio produto
        let infoExtra = "";
        if (prod.unidade_base_id && prod.unidade_base_id !== prod.id) {
          const base = this.produtos.find((p) => p.id === prod.unidade_base_id);
          if (base) {
            infoExtra = `<div class="text-xs text-purple-600 mt-1">⚡ 1 un = ${prod.fator_conversao || 1} x ${this.escapeHtml(base.nome)}</div>`;
          }
        }
        return `
            <div class="flex items-center justify-between bg-gray-50 p-2 rounded-lg">
                <div class="flex-1">
                    <div class="font-medium text-sm">${this.escapeHtml(prod.nome)}</div>
                    <div class="text-xs text-gray-500">${prod.codigo} • R$ ${prod.preco.toFixed(2)} • ${prod.categoria}</div>
                    ${infoExtra}
                </div>
                <div class="flex gap-1">
                    <button data-produto-id="${prod.id}" class="btn-edit-produto text-blue-600 p-1">✏️</button>
                    <button data-produto-id="${prod.id}" class="btn-delete-produto text-red-600 p-1">🗑️</button>
                </div>
            </div>
        `;
      })
      .join("");
  }

  abrirModalProduto(produto = null) {
    const modal = document.getElementById("modal");
    const content = document.getElementById("modalContent");
    if (!modal || !content) return;

    const categorias = [
      "bolos",
      "brownies",
      "brigadeiros",
      "mousses",
      "copos",
      "sacoles",
      "bebidas",
    ];
    const isEdit = produto !== null;

    // Lista de produtos disponíveis para selecionar como "Unidade Base"
    const opcoesUnidadeBase = this.produtos
      .filter((p) => p.id !== (produto?.id || null)) // evita referência circular
      .map(
        (p) =>
          `<option value="${p.id}" ${isEdit && produto.unidade_base_id === p.id ? "selected" : ""}>${this.escapeHtml(p.nome)} (${p.codigo})</option>`,
      )
      .join("");

    content.innerHTML = `
        <div class="p-5">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-lg font-bold text-gray-800">${isEdit ? "Editar" : "Novo"} Produto</h3>
                <button id="btnCloseModal" class="text-gray-500 text-2xl">&times;</button>
            </div>
            <form id="formProduto">
                <input type="hidden" id="produtoId" value="${isEdit ? produto.id : ""}">
                <div class="mb-3">
                    <label class="block text-sm font-medium text-gray-600 mb-1">Nome</label>
                    <input type="text" id="produtoNome" value="${isEdit ? this.escapeHtml(produto.nome) : ""}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                </div>
                <div class="grid grid-cols-2 gap-3 mb-3">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">Código</label>
                        <input type="text" id="produtoCodigo" value="${isEdit ? produto.codigo : ""}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-1">Preço (R$)</label>
                        <input type="number" step="0.01" id="produtoPreco" value="${isEdit ? produto.preco : ""}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                </div>
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-600 mb-1">Categoria</label>
                    <select id="produtoCategoria" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        ${categorias.map((cat) => `<option value="${cat}" ${isEdit && produto.categoria === cat ? "selected" : ""}>${cat}</option>`).join("")}
                    </select>
                </div>

                <!-- 🔥 Novos campos: Unidade Base e Fator de Conversão -->
                <div class="border-t border-gray-200 pt-4 mt-2">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-gray-700">⚙️ Configuração Avançada</span>
                        <button type="button" id="btnHelpAvancado" class="text-gray-400 hover:text-gray-600 text-lg" title="O que é isso?">❓</button>
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-600 mb-1">Unidade Base (referência de produção)</label>
                        <select id="produtoUnidadeBase" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            <option value="" ${!isEdit || !produto.unidade_base_id ? "selected" : ""}>-- Nenhuma (produto independente) --</option>
                            ${opcoesUnidadeBase}
                        </select>
                        <p class="text-xs text-gray-500 mt-1">Ex: para "Caixa de Brigadeiro", selecione "Brigadeiro Avulso".</p>
                    </div>
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-600 mb-1">Fator de Conversão</label>
                        <input type="number" min="1" step="1" id="produtoFatorConversao" value="${isEdit && produto.fator_conversao ? produto.fator_conversao : 1}" class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        <p class="text-xs text-gray-500 mt-1">Quantas unidades base formam 1 unidade deste produto? (Ex: 1 Caixa = 4 Avulsos → fator 4)</p>
                    </div>
                </div>

                <button type="submit" class="w-full btn-primary text-white py-3 rounded-xl font-semibold mt-4">
                    ${isEdit ? "Salvar Alterações" : "Adicionar Produto"}
                </button>
            </form>
        </div>
    `;

    // Listener para o botão de ajuda
    document
      .getElementById("btnHelpAvancado")
      ?.addEventListener("click", () => {
        alert(
          "🔍 Unidade Base e Fator de Conversão:\n\n" +
            "Use isto para produtos que são vendidos em embalagens diferentes da unidade de produção.\n\n" +
            "Exemplo: Você produz 'Brigadeiro Avulso' (unidade base), mas vende 'Caixa com 4'.\n" +
            "- Unidade Base: 'Brigadeiro Avulso'\n" +
            "- Fator de Conversão: 4\n\n" +
            "O sistema usará essas informações para sugerir quantas caixas levar com base na eficiência do avulso.",
        );
      });

    document
      .getElementById("formProduto")
      .addEventListener("submit", (e) => this.salvarProduto(e));
    document
      .getElementById("btnCloseModal")
      .addEventListener("click", () => this.closeModal());
  }

  async salvarProduto(event) {
    event.preventDefault();
    const id = document.getElementById("produtoId").value;
    const nome = document.getElementById("produtoNome").value.trim();
    const codigo = document.getElementById("produtoCodigo").value.trim();
    const preco = parseFloat(document.getElementById("produtoPreco").value);
    const categoria = document.getElementById("produtoCategoria").value;
    const unidadeBaseId = document.getElementById("produtoUnidadeBase").value;
    const fatorConversao =
      parseInt(document.getElementById("produtoFatorConversao").value) || 1;

    if (!nome || !codigo || isNaN(preco) || preco <= 0) {
      this.showToast(
        "Preencha todos os campos obrigatórios corretamente.",
        "error",
      );
      return;
    }

    const produto = {
      id: id || `prod_${Date.now()}`,
      categoria,
      nome,
      codigo,
      preco,
      unidade_base_id: unidadeBaseId || id, // se vazio, assume o próprio id
      fator_conversao: fatorConversao,
    };

    if (id) {
      const index = this.produtos.findIndex((p) => p.id === id);
      if (index !== -1) this.produtos[index] = produto;
    } else {
      this.produtos.push(produto);
    }

    await db.setConfig(this.currentUserId, "produtos", this.produtos);
    this.closeModal();
    this.showToast("Produto salvo!", "success");
    if (this.currentPage === "dashboard" || this.currentPage === "registrar") {
      this.openModal("settings");
    }
  }

  async excluirProduto(produtoId) {
    if (!confirm("Tem certeza que deseja excluir este produto?")) return;
    this.produtos = this.produtos.filter((p) => p.id !== produtoId);
    await db.setConfig(this.currentUserId, "produtos", this.produtos);
    this.showToast("Produto removido.", "info");
    // Recarrega a lista no modal de configurações
    this.openModal("settings");
  }
  // Solicita permissão e obtém coordenadas atuais do dispositivo
  async obterLocalizacaoAtual() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocalização não suportada pelo navegador."));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          });
        },
        (error) => {
          reject(error);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
      );
    });
  }

  setupHeaderMenu() {
    const menuBtn = document.getElementById("headerMenuBtn");
    const dropdown = document.getElementById("headerMenuDropdown");
    if (!menuBtn || !dropdown) return;

    // Toggle dropdown
    menuBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });

    // Fecha ao clicar fora
    document.addEventListener("click", () => {
      dropdown.classList.add("hidden");
    });

    // Impede que cliques dentro do dropdown o fechem
    dropdown.addEventListener("click", (e) => e.stopPropagation());

    // Ações dos itens
    document.getElementById("menuSync")?.addEventListener("click", () => {
      dropdown.classList.add("hidden");
      this.syncData();
    });
    document.getElementById("menuBackup")?.addEventListener("click", () => {
      dropdown.classList.add("hidden");
      this.exportData();
    });
    document.getElementById("menuSettings")?.addEventListener("click", () => {
      dropdown.classList.add("hidden");
      this.openSettings();
    });
    document.getElementById("menuLogout")?.addEventListener("click", () => {
      dropdown.classList.add("hidden");
      this.logout();
    });
  }

  logout() {
    localStorage.removeItem("luminar_userId");
    localStorage.removeItem("luminar_username");
    this.currentUserId = null;
    this.currentUser = null;
    this.closeModal();
    this.showLoginScreen();
  }
}

// Create global instance
const app = new LuminarApp();

// Initialize after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
