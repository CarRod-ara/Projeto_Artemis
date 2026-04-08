// Main Application Controller for Artemis PWA
// Security-hardened version with XSS protection and null safety

class ArtemisApp {
    constructor() {
        this.currentPage = 'dashboard';
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
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Sanitiza texto para Markdown (Obsidian export)
    sanitizeForMarkdown(text) {
        return String(text || '')
            .replace(/"/g, '\\"')
            .replace(/\n/g, ' ')
            .replace(/[<>]/g, '')
            .trim();
    }

    // Valida e converte números com fallback seguro
    safeNumber(value, fallback = 0) {
        const num = parseFloat(value);
        return (isNaN(num) || num < 0) ? fallback : num;
    }

    // === INICIALIZAÇÃO ===
    
    async init() {
    try {
        if (typeof db === 'undefined') throw new Error('Database não carregado');
        console.log('Iniciando Artemis...');
        await db.init();
        console.log('DB inicializado');

        // Verifica se já existe usuário logado
        const savedUserId = localStorage.getItem('artemis_userId');
        if (savedUserId) {
            const users = await db.getAllUsers();
            this.currentUser = users.find(u => u.id === savedUserId);
            if (this.currentUser) {
                this.currentUserId = savedUserId;
                await this.loadUserData();
                this.hideLoginScreenAndShowApp();
                this.setupConnectivityListeners();
                this.initialized = true;
                console.log('✅ Artemis initialized successfully');
                return;
            } else {
                localStorage.removeItem('artemis_userId');
            }
        }
        // Se não logado, mostra tela de login
        this.showLoginScreen();
        this.setupConnectivityListeners();
    } catch (error) {
        console.error('❌ Initialization error:', error);
        this.showToast('Erro crítico. Recarregue a página (Ctrl+Shift+R)', 'error');
    }
}

    // Setup modal event listeners (após DOM estar pronto)
    setupModalListeners() {
        const modal = document.getElementById('modal');
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target.id === 'modal') {
                    this.closeModal();
                }
            });
        }
    }

    updateDateDisplay() {
        const hoje = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const el = document.getElementById('currentDate');
        if (el) el.textContent = hoje.toLocaleDateString('pt-BR', options);
    }

    setupConnectivityListeners() {
        window.addEventListener('online', () => {
            document.body.classList.remove('offline');
            this.showToast('Conectado! Sincronizando dados...', 'success');
            this.syncData();
        });
        
        window.addEventListener('offline', () => {
            document.body.classList.add('offline');
            this.showToast('Modo offline ativado', 'warning');
        });
        
        if (!navigator.onLine) {
            document.body.classList.add('offline');
        }
    }
    showLoginScreen() {
    const mainContent = document.getElementById('mainContent');
    const header = document.querySelector('header');
    const nav = document.querySelector('nav');
    if (header) header.style.display = 'none';
    if (nav) nav.style.display = 'none';

    mainContent.innerHTML = `
        <div class="flex items-center justify-center min-h-screen bg-gray-100 p-4">
            <div class="bg-white rounded-2xl p-6 w-full max-w-md card-shadow">
                <h1 class="text-2xl font-bold text-center text-purple-700 mb-6">Artemis</h1>
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

    document.getElementById('loginForm').addEventListener('submit', (e) => this.doLogin(e));
    document.getElementById('showRegisterBtn').addEventListener('click', () => {
        document.getElementById('loginFormContainer').style.display = 'none';
        document.getElementById('registerFormContainer').style.display = 'block';
    });
    document.getElementById('registerForm').addEventListener('submit', (e) => this.doRegister(e));
    document.getElementById('showLoginBtn').addEventListener('click', () => {
        document.getElementById('registerFormContainer').style.display = 'none';
        document.getElementById('loginFormContainer').style.display = 'block';
    });
}

async doLogin(event) {
    event.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    const user = await db.getUserByUsername(username);
    if (!user || user.password !== password) {
        this.showToast('Usuário ou senha inválidos', 'error');
        return;
    }

    this.currentUserId = user.id;
    this.currentUser = user;
    localStorage.setItem('artemis_userId', user.id);
    localStorage.setItem('artemis_username', username);

    await this.loadUserData();
    this.hideLoginScreenAndShowApp();
}

async doRegister(event) {
    event.preventDefault();
    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value;
    const lojaNome = document.getElementById('regLojaNome').value.trim();
    const vendedorNome = document.getElementById('regVendedorNome').value.trim();

    const existing = await db.getUserByUsername(username);
    if (existing) {
        this.showToast('Usuário já existe', 'error');
        return;
    }

    const userId = 'user_' + Date.now();
    const newUser = {
        id: userId,
        username,
        password,
        lojaNome,
        vendedorNome,
        createdAt: new Date().toISOString()
    };
    await db.createUser(newUser);
    await db.initDefaultConfigForUser(userId);

    this.showToast('Cadastro realizado! Faça login.', 'success');
    document.getElementById('registerFormContainer').style.display = 'none';
    document.getElementById('loginFormContainer').style.display = 'block';
}

async loadUserData() {
    this.metas = await db.getConfig(this.currentUserId, 'metas') || { survival: 110, comfortable: 150, ideal: 260 };
    this.produtos = await db.getConfig(this.currentUserId, 'produtos') || [];
    this.regrasMix = await db.getConfig(this.currentUserId, 'regrasMix') || [];

    if (this.produtos.length === 0) {
        this.produtos = db.getDefaultProdutos();
        await db.setConfig(this.currentUserId, 'produtos', this.produtos);
    }
    if (this.regrasMix.length === 0) {
    this.regrasMix = db.getDefaultRegrasMix();
    await db.setConfig(this.currentUserId, 'regrasMix', this.regrasMix);
}

    this.updateDateDisplay();
    this.weatherData = await weather.getWeather();
    this.navigate('dashboard');
}

hideLoginScreenAndShowApp() {
    const header = document.querySelector('header');
    const nav = document.querySelector('nav');
    if (header) header.style.display = 'flex';
    if (nav) nav.style.display = 'flex';
}
    // === NAVEGAÇÃO ===
    
    navigate(page) {
        this.currentPage = page;
        
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('text-purple-600', 'tab-active');
            btn.classList.add('text-gray-500');
        });
        const activeBtn = document.querySelector(`[data-page="${page}"]`);
        if (activeBtn) {
            activeBtn.classList.remove('text-gray-500');
            activeBtn.classList.add('text-purple-600', 'tab-active');
        }
        
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;
        mainContent.innerHTML = '';
        
        switch (page) {
            case 'dashboard': this.renderDashboard(mainContent); break;
            case 'registrar': this.renderRegistrar(mainContent); break;
            case 'fiados': this.renderFiados(mainContent); break;
            case 'relatorios': this.renderRelatorios(mainContent); break;
        }
    }

    // === DASHBOARD ===
    
    async renderDashboard(container) {
        const hoje = new Date().toISOString().split('T')[0];
        const registroHoje = await db.getRegistro(hoje, this.currentUserId);
        const registros = await db.getAllRegistros(this.currentUserId);
        const vendasSemana = this.calcularVendasSemana(registros);
        const vendasMes = this.calcularVendasMes(registros);
        
        const sugestaoMix = await mixEngine.generateSuggestion({
            data: hoje,
            diaSemana: new Date().toLocaleDateString('pt-BR', { weekday: 'long' }),
            clima: this.weatherData,
            temperatura: this.weatherData?.current?.temperature,
            produtos: this.produtos,
            regras: this.regrasMix
        });

        const metas = this.metas || { survival: 110, comfortable: 150, ideal: 260 };
        const valorDia = registroHoje?.fluxo?.pagosDia || 0;
        const progressPct = metas.ideal > 0 ? Math.min(100, (valorDia / metas.ideal) * 100) : 0;

        container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-semibold text-gray-700">Meta Diária</h2>
                    <span class="text-sm text-gray-500">${registroHoje ? '✅ Registrado' : '⏳ Pendente'}</span>
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
                    <span class="text-2xl">${this.weatherData?.current?.condition?.icon || '🌡️'}</span>
                </div>
                <p class="text-sm text-gray-600 mb-3">
                    ${this.weatherData?.current?.condition?.name || 'Carregando...'} • 
                    ${this.weatherData?.current?.temperature ?? '--'}°C
                    ${this.weatherData?.cached ? '(cache)' : ''}
                </p>
                <p class="text-xs text-gray-500 mb-3">${this.escapeHtml(sugestaoMix.explicacao || '')}</p>
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
                    <div class="text-xs text-gray-400">Meta: R$ ${((metas.ideal ?? 260) * 7).toFixed(2)}</div>
                </div>
                <div class="bg-white rounded-2xl p-4 card-shadow">
                    <div class="text-sm text-gray-500 mb-1">Este Mês</div>
                    <div class="text-xl font-bold text-gray-800">R$ ${vendasMes.toFixed(2)}</div>
                    <div class="text-xs text-gray-400">Meta: R$ ${((metas.ideal ?? 260) * 30).toFixed(2)}</div>
                </div>
            </div>
        `;

        this.renderWeeklyChart(registros);
    }

    renderMixPreview(mix) {
        const categorias = { bolos: [], brownies: [], brigadeiros: [], outros: [] };
        
        for (const [id, qtd] of Object.entries(mix || {})) {
            if (!qtd || qtd <= 0) continue;
            const produto = this.produtos?.find(p => p.id === id);
            if (!produto) continue;
            
            if (produto.categoria === 'bolos') categorias.bolos.push({ nome: produto.nome, qtd });
            else if (produto.categoria === 'brownies') categorias.brownies.push({ nome: produto.nome, qtd });
            else if (produto.categoria === 'brigadeiros') categorias.brigadeiros.push({ nome: produto.nome, qtd });
            else categorias.outros.push({ nome: produto.nome, qtd });
        }
        
        let html = '';
        const renderBadge = (nome, qtd, color) => 
            `<span class="text-xs bg-${color}-100 text-${color}-700 px-2 py-0.5 rounded">${this.escapeHtml(nome)} ${qtd}</span>`;
        
        if (categorias.bolos.length > 0) {
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Bolos:</span> ${categorias.bolos.map(b => renderBadge(b.nome, b.qtd, 'yellow')).join('')}</div>`;
        }
        if (categorias.brownies.length > 0) {
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brownies:</span> ${categorias.brownies.map(b => renderBadge(b.nome, b.qtd, 'amber')).join('')}</div>`;
        }
        if (categorias.brigadeiros.length > 0) {
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brigadeiros:</span> ${categorias.brigadeiros.map(b => renderBadge(b.nome, b.qtd, 'purple')).join('')}</div>`;
        }
        
        return html || '<span class="text-gray-400 text-sm">Nenhum item sugerido</span>';
    }

    renderWeeklyChart(registros) {
        const canvas = document.getElementById('weeklyChart');
        if (!canvas || typeof Chart === 'undefined') return;
        
        const dias = [], valores = [];
        for (let i = 6; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            const dataStr = data.toISOString().split('T')[0];
            const diaLabel = data.toLocaleDateString('pt-BR', { weekday: 'short' });
            const registro = registros?.find(r => r.id === dataStr);
            dias.push(diaLabel);
            valores.push(registro?.fluxo?.pagosDia || 0);
        }
        
        if (this.chartInstances.weekly) this.chartInstances.weekly.destroy();
        
        this.chartInstances.weekly = new Chart(canvas, {
            type: 'bar',
            data: {
                labels: dias,
                datasets: [{
                    label: 'Vendas (R$)',
                    data: valores,
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => 'R$ ' + v } }
                }
            }
        });
    }

    // === REGISTRAR ===
    
    async renderRegistrar(container) {
    // CORREÇÃO: Usar data local ao invés de UTC
    const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }).split('/').reverse().join('-');
    const diaSemana = new Date().toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'America/Sao_Paulo' });
    const registroExistente = await db.getRegistro(hoje, this.currentUserId);
    
    // Get mix suggestion for pre-fill
    const sugestaoMix = await mixEngine.generateSuggestion({
        data: hoje,
        diaSemana: diaSemana,
        clima: this.weatherData,
        temperatura: this.weatherData?.current?.temperature,
        produtos: this.produtos,
        regras: this.regrasMix
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
                                   value="${registroExistente?.fluxo?.pagosDia || ''}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">🟡 Fiados (R$)</label>
                            <input type="number" step="0.01" id="regFiados"
                                   value="${registroExistente?.fluxo?.fiadosHoje || '0'}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                    </div>
                    <div class="mt-2">
                        <label class="block text-sm text-gray-600 mb-1">🔵 Recebidos de Fiados (R$)</label>
                        <input type="number" step="0.01" id="regRecebidos"
                               value="${registroExistente?.fluxo?.recebidosFiados || '0'}"
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
                                   value="${registroExistente?.tempoOperacional?.inicio || ''}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500">
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Fim</label>
                            <input type="time" id="regFim" required
                                   value="${registroExistente?.tempoOperacional?.fim || ''}"
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
                                <option value="sol" ${this.weatherData?.current?.condition?.category === 'sol' ? 'selected' : ''}>☀️ Sol</option>
                                <option value="nublado" ${this.weatherData?.current?.condition?.category === 'nublado' ? 'selected' : ''}>☁️ Nublado</option>
                                <option value="chuva" ${this.weatherData?.current?.condition?.category === 'chuva' ? 'selected' : ''}>🌧️ Chuva</option>
                                <option value="tempestade" ${this.weatherData?.current?.condition?.category === 'tempestade' ? 'selected' : ''}>⛈️ Tempestade</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm text-gray-600 mb-1">Temperatura (°C)</label>
                            <input type="number" id="regClimaTemp" 
                                   value="${this.weatherData?.current?.temperature || 25}"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                </div>

                <!-- Observações -->
                <div class="mb-4">
                    <label class="block text-sm font-medium text-gray-600 mb-1">📝 Observações</label>
                    <textarea id="regObservacoes" rows="3"
                              class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                              placeholder="O que aconteceu de diferente hoje?">${registroExistente?.observacoes || ''}</textarea>
                </div>

                <!-- Submit -->
                <button type="submit" class="w-full btn-primary text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition">
                    ${registroExistente ? '💾 Atualizar Registro' : '✅ Salvar Registro'}
                </button>
            </form>
        </div>
    `;
    
    // Update dia da semana when date changes
    document.getElementById('regData').addEventListener('change', (e) => {
        const data = new Date(e.target.value + 'T12:00:00'); // Força meio-dia para evitar timezone
        const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'long' });
        document.getElementById('regDiaSemana').value = diaSemana;
    });
    
    // CORREÇÃO: Adicionar event listener no form
    document.getElementById('registroForm').addEventListener('submit', (e) => this.salvarRegistro(e));
}

    renderItensForm(sugestaoMix, itensExistentes) {
        const categorias = {
            bolos: { nome: '🎂 Bolos', produtos: [] },
            brownies: { nome: '🍫 Brownies', produtos: [] },
            brigadeiros: { nome: '🍬 Brigadeiros', produtos: [] },
            mousses: { nome: '🧁 Mousses', produtos: [] },
            copos: { nome: '🍧 Copos', produtos: [] },
            sacoles: { nome: '🍨 Sacolés', produtos: [] },
            bebidas: { nome: '🥤 Bebidas', produtos: [] }
        };
        
        for (const produto of (this.produtos || [])) {
            if (categorias[produto.categoria]) {
                const sugestao = sugestaoMix?.[produto.id] || 0;
                const existente = itensExistentes?.find(i => i.codigo === produto.codigo);
                categorias[produto.categoria].produtos.push({
                    ...produto, sugestao,
                    levado: existente?.levado || 0,
                    vendido: existente?.vendido || 0
                });
            }
        }
        
        let html = '';
        for (const [catKey, categoria] of Object.entries(categorias)) {
            if (categoria.produtos.length === 0) continue;
            html += `<div class="bg-gray-50 rounded-lg p-3 mb-3"><h4 class="font-medium text-gray-700 mb-2">${categoria.nome}</h4><div class="grid grid-cols-2 gap-2">`;
            for (const prod of categoria.produtos) {
                html += `
                    <div class="bg-white rounded-lg p-2 border border-gray-200">
                        <div class="text-xs text-gray-600 mb-1">${this.escapeHtml(prod.nome)} (${prod.codigo})</div>
                        <div class="flex gap-2">
                            <input type="number" min="0" name="levado_${prod.id}" value="${prod.levado || ''}" placeholder="Lev" class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded">
                            <input type="number" min="0" name="vendido_${prod.id}" value="${prod.vendido || ''}" placeholder="Vend" class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded">
                        </div>
                        ${prod.sugestao > 0 ? `<div class="text-xs text-purple-600 mt-1">Sugestão: ${prod.sugestao}</div>` : ''}
                    </div>`;
            }
            html += `</div></div>`;
        }
        return html;
    }

    async salvarRegistro(event) {
    event.preventDefault();
    
    const data = document.getElementById('regData').value;
    
    // CORREÇÃO: Validar data antes de salvar
    if (!data || data.trim() === '') {
        this.showToast('Data inválida', 'error');
        return;
    }
    
    // Collect items vendidos
    const itensVendidos = [];
    for (const produto of this.produtos) {
        const levado = parseInt(document.querySelector(`[name="levado_${produto.id}"]`)?.value) || 0;
        const vendido = parseInt(document.querySelector(`[name="vendido_${produto.id}"]`)?.value) || 0;
        
        if (levado > 0 || vendido > 0) {
            itensVendidos.push({
                categoria: produto.categoria,
                codigo: produto.codigo,
                nome: produto.nome,
                levado,
                vendido,
                precoUnitario: produto.preco
            });
        }
    }
    
    // Calculate efficiency
    const eficiencia = this.calcularEficiencia(itensVendidos);
    
    // CORREÇÃO: Verificar se já existe registro antes de sobrescrever
    const registroExistente = await db.getRegistro(data, this.currentUserId);
    if (registroExistente && !confirm('Já existe um registro para esta data. Deseja sobrescrever?')) {
        return;
    }
    
    const registro = {
        id: data,
        data: data,
        diaSemana: document.getElementById('regDiaSemana').value,
        fluxo: {
            pagosDia: parseFloat(document.getElementById('regPagos').value) || 0,
            fiadosHoje: parseFloat(document.getElementById('regFiados').value) || 0,
            recebidosFiados: parseFloat(document.getElementById('regRecebidos').value) || 0
        },
        tempoOperacional: {
            inicio: document.getElementById('regInicio').value,
            fim: document.getElementById('regFim').value,
            totalMinutos: this.calcularMinutos(
                document.getElementById('regInicio').value,
                document.getElementById('regFim').value
            )
        },
        itensVendidos,
        clima: {
            real: {
                condicao: document.getElementById('regClimaCondicao').value,
                temperatura: parseFloat(document.getElementById('regClimaTemp').value)
            },
            previsao: {
                condicao: this.weatherData?.forecast?.[0]?.condition?.category || 'nublado',
                temperatura: this.weatherData?.forecast?.[0]?.maxTemp || 25,
                fonte: 'Open-Meteo'
            }
        },
        observacoes: document.getElementById('regObservacoes').value,
        eficiencia,
        agentesFeedback: this.gerarFeedbackAgentes(itensVendidos, eficiencia, data)
    };
    
    try {
        await db.saveRegistro(registro, this.currentUserId);
        this.showToast('Registro salvo com sucesso!', 'success');
        this.navigate('dashboard');
    } catch (error) {
        console.error('Error saving registro:', error);
        this.showToast('Erro ao salvar registro', 'error');
    }
}

    calcularEficiencia(itens) {
        let totalLevado = 0, totalVendido = 0;
        const porCategoria = {}, porProduto = {};
        
        for (const item of itens) {
            totalLevado += item.levado;
            totalVendido += item.vendido;
            if (!porCategoria[item.categoria]) porCategoria[item.categoria] = { levado: 0, vendido: 0 };
            porCategoria[item.categoria].levado += item.levado;
            porCategoria[item.categoria].vendido += item.vendido;
            porProduto[item.codigo] = item.levado > 0 ? item.vendido / item.levado : 0;
        }
        
        const efPorCategoria = {};
        for (const [cat, vals] of Object.entries(porCategoria)) {
            efPorCategoria[cat] = vals.levado > 0 ? vals.vendido / vals.levado : 0;
        }
        
        return {
            geral: totalLevado > 0 ? totalVendido / totalLevado : 0,
            porCategoria: efPorCategoria,
            porProduto
        };
    }

    calcularMinutos(inicio, fim) {
        if (!inicio || !fim) return 0;
        const [h1, m1] = inicio.split(':').map(Number);
        const [h2, m2] = fim.split(':').map(Number);
        return Math.max(0, (h2 * 60 + m2) - (h1 * 60 + m1));
    }

    gerarFeedbackAgentes(itens, eficiencia) {
        const efGeral = Math.round((eficiencia?.geral || 0) * 100);
        return {
            imperius: `Eficiência geral de ${efGeral}%. Análise baseada nos dados do dia.`,
            markus: `Dica operacional: ${efGeral > 80 ? 'Ótimo desempenho!' : 'Ajuste o mix para melhorar.'}`,
            phil: 'Você está no caminho certo. Continue registrando!'
        };
    }

    // === FIADOS ===
    
    async renderFiados(container) {
        const fiadosAtivos = await db.getFiadosAtivos(this.currentUserId);
        const fiadosVencidos = await db.getFiadosVencidos(this.currentUserId);
        const totalDevido = (fiadosAtivos || []).reduce((sum, f) => sum + (f.valor || 0), 0);

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
                    ${fiadosAtivos?.length === 0 ? 
                        '<p class="text-center text-gray-500 py-4">Nenhum fiado ativo</p>' :
                        (fiadosAtivos || []).map(f => this.renderFiadoCard(f)).join('')
                    }
                </div>
            </div>
        `;

        document.getElementById('btnNovoFiado')?.addEventListener('click', () => this.openModal('novoFiado'));
    }

    renderFiadoCard(fiado) {
        const hoje = new Date().toISOString().split('T')[0];
        const vencido = fiado.dataVencimento < hoje;
        
        return `
            <div class="border border-gray-200 rounded-lg p-3 ${vencido ? 'bg-red-50 border-red-200' : 'bg-white'}">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-medium text-gray-800">${this.escapeHtml(fiado.clienteNome)}</div>
                        <div class="text-sm text-gray-500">
                            R$ ${(fiado.valor || 0).toFixed(2)} • 
                            Vence: ${new Date(fiado.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            ${vencido ? ' <span class="text-red-600 font-medium">(VENCIDO)</span>' : ''}
                        </div>
                    </div>
                    <button data-fiado-id="${fiado.id}" class="btn-quitar text-green-600 hover:bg-green-50 px-3 py-1 rounded-lg text-sm font-medium">
                        Quitar
                    </button>
                </div>
            </div>
        `;
    }

    async quitarFiado(id) {
        const fiado = await db.getFiado(id);
        if (!fiado) return;
        fiado.pago = true;
        fiado.dataPagamento = new Date().toISOString().split('T')[0];
        await db.saveFiado(fiado, this.currentUserId);
        this.showToast('Fiado quitado!', 'success');
        this.renderFiados(document.getElementById('mainContent'));
    }

    // === RELATÓRIOS ===
    
    async renderRelatorios(container) {
        const registros = await db.getAllRegistros(this.currentUserId);
        const dataLimite = new Date();
        dataLimite.setDate(dataLimite.getDate() - 30);
        const ultimos30 = (registros || []).filter(r => new Date(r.data) >= dataLimite);

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

        document.getElementById('btnExportJson')?.addEventListener('click', () => this.exportData());
        document.getElementById('btnExportMd')?.addEventListener('click', () => this.exportObsidian());
        document.getElementById('btnImportar')?.addEventListener('click', () => this.openModal('importar'));
    }

    // === MODALS ===
    
    openModal(type) {
        const modal = document.getElementById('modal');
        const content = document.getElementById('modalContent');
        if (!modal || !content) return;
        
        modal.classList.remove('hidden');
        
        switch (type) {
            case 'novoFiado':
                content.innerHTML = this.renderNovoFiadoModal();
                document.getElementById('formNovoFiado')?.addEventListener('submit', (e) => this.salvarFiado(e));
                break;
            case 'importar':
                content.innerHTML = this.renderImportarModal();
                document.getElementById('btnDoImport')?.addEventListener('click', () => this.doImport());
                break;
            case 'settings':
                content.innerHTML = this.renderSettingsModal();
                document.getElementById('btnSaveSettings')?.addEventListener('click', () => this.salvarConfiguracoes());
                break;
        }
    }

    closeModal() {
        document.getElementById('modal')?.classList.add('hidden');
    }

    renderNovoFiadoModal() {
        const hoje = new Date().toISOString().split('T')[0];
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
                            <input type="date" id="fiadoVencimento" value="${vencimento.toISOString().split('T')[0]}" required class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                    <button type="submit" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Salvar Fiado</button>
                </form>
            </div>
        `;
    }

    async salvarFiado(event) {
        event.preventDefault();
        const nome = document.getElementById('fiadoNome')?.value?.trim();
        const valor = this.safeNumber(document.getElementById('fiadoValor')?.value);
        
        if (!nome || valor <= 0) {
            this.showToast('Preencha nome e valor válidos', 'error');
            return;
        }
        
        const fiado = {
            id: 'fiado_' + Date.now(),
            clienteNome: this.escapeHtml(nome),
            valor,
            dataEmprestimo: document.getElementById('fiadoData')?.value || new Date().toISOString().split('T')[0],
            dataVencimento: document.getElementById('fiadoVencimento')?.value,
            pago: false
        };
        
        await db.saveFiado(fiado, this.currentUserId);
        this.closeModal();
        this.showToast('Fiado registrado!', 'success');
        this.renderFiados(document.getElementById('mainContent'));
    }

    renderSettingsModal() {
        const metas = this.metas || { survival: 110, comfortable: 150, ideal: 260 };
        return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">⚙️ Configurações</h3>
                    <button id="btnCloseModal" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-2">Metas Diárias</label>
                        <div class="grid grid-cols-3 gap-2">
                            <div><label class="text-xs text-yellow-600">Sobrevivência</label><input type="number" id="metaSurvival" value="${metas.survival}" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></div>
                            <div><label class="text-xs text-orange-600">Confortável</label><input type="number" id="metaComfortable" value="${metas.comfortable}" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></div>
                            <div><label class="text-xs text-green-600">Ideal</label><input type="number" id="metaIdeal" value="${metas.ideal}" class="w-full px-3 py-2 border border-gray-300 rounded-lg"></div>
                        </div>
                    </div>
                    <button id="btnSaveSettings" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">Salvar Configurações</button>
                </div>
            </div>
        `;
    }

    async salvarConfiguracoes() {
        this.metas = {
            survival: parseInt(document.getElementById('metaSurvival')?.value) || 110,
            comfortable: parseInt(document.getElementById('metaComfortable')?.value) || 150,
            ideal: parseInt(document.getElementById('metaIdeal')?.value) || 260
        };
        await db.setConfig(this.currentUserId, 'metas', this.metas);
        this.closeModal();
        this.showToast('Configurações salvas!', 'success');
        if (this.currentPage === 'dashboard') this.renderDashboard(document.getElementById('mainContent'));
    }

    renderImportarModal() {
        return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">📥 Importar Dados</h3>
                    <button id="btnCloseModal" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <input type="file" id="importFile" accept=".json" class="w-full mb-3 p-2 border rounded-lg">
                <p class="text-xs text-gray-500 mb-3">Selecione um arquivo de backup JSON válido.</p>
                <button id="btnDoImport" class="w-full py-3 bg-gray-800 text-white rounded-xl font-semibold">Importar</button>
            </div>
        `;
    }

    async doImport() {
        const file = document.getElementById('importFile')?.files?.[0];
        if (!file) { this.showToast('Selecione um arquivo', 'error'); return; }
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.registros) for (const r of data.registros) await db.saveRegistro(r, this.currentUserId);
            if (data.fiados) for (const f of data.fiados) await db.saveFiado(f, this.currentUserId);
            if (data.config) for (const [k, v] of Object.entries(data.config)) await db.setConfig(this.currentUserId, k, v);
            this.closeModal();
            this.showToast('Dados importados com sucesso!', 'success');
            this.init(); // Reload app with new data
        } catch (e) {
            console.error('Import error:', e);
            this.showToast('Erro ao importar arquivo', 'error');
        }
    }

    // === EXPORT/UTILITIES ===
    
    async exportData() {
        const data = await db.exportAllData(this.currentUserId);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `artemis_backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Backup exportado!', 'success');
    }

    async exportObsidian() {
        const registros = await db.getAllRegistros(this.currentUserId);
        let markdown = '';
        
        for (const reg of (registros || []).sort((a, b) => new Date(b.data) - new Date(a.data))) {
            markdown += this.registroToMarkdown(reg);
            markdown += '\n---\n\n';
        }
        
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `artemis_registros_${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Exportado para Obsidian!', 'success');
    }

    registroToMarkdown(reg) {
        if (!reg) return '';
        let md = `#financeiro\n---\ndata: "${this.sanitizeForMarkdown(reg.data)}"\ndia_da_semana: "${this.sanitizeForMarkdown(reg.diaSemana)}"\ntipo: diário\n---\n\n`;
        md += `# 📓 Vendas ${new Date(reg.data + 'T12:00:00').toLocaleDateString('pt-BR')}\n\n`;
        md += `## 💰 FLUXO DO DIA\n`;
        md += `**🟢 PAGOS NO DIA:** R$ ${this.safeNumber(reg.fluxo?.pagosDia).toFixed(2)}\n`;
        md += `**🟡 FIADOS HOJE:** R$ ${this.safeNumber(reg.fluxo?.fiadosHoje).toFixed(2)}\n`;
        md += `**🔵 RECEBIDOS:** R$ ${this.safeNumber(reg.fluxo?.recebidosFiados).toFixed(2)}\n\n`;
        md += `## ⏳ TEMPO OPERACIONAL\n`;
        md += `**🕒 INÍCIO:** ${reg.tempoOperacional?.inicio || '--'}\n`;
        md += `**🕔 FIM:** ${reg.tempoOperacional?.fim || '--'}\n`;
        if (reg.tempoOperacional?.totalMinutos) {
            const h = Math.floor(reg.tempoOperacional.totalMinutos / 60);
            const m = reg.tempoOperacional.totalMinutos % 60;
            md += `**⏳ TOTAL:** ${h}h ${m}min\n\n`;
        }
        md += `## 🍰 ITENS VENDIDOS\n\n`;
        const byCat = {};
        for (const item of (reg.itensVendidos || [])) {
            if (!byCat[item.categoria]) byCat[item.categoria] = [];
            byCat[item.categoria].push(item);
        }
        const emojis = { bolos: '🎂', brownies: '🍫', brigadeiros: '🍬', mousses: '🧁', copos: '🍧', sacoles: '🍨', bebidas: '🥤' };
        for (const [cat, items] of Object.entries(byCat)) {
            md += `### ${emojis[cat] || '📦'} ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
            for (const item of items) {
                const ef = item.levado > 0 ? Math.round((item.vendido / item.levado) * 100) : 0;
                md += `- **${this.sanitizeForMarkdown(item.nome)} (${item.codigo}):** ${item.vendido}un (lev: ${item.levado}, ef: ${ef}%)\n`;
            }
            md += '\n';
        }
        md += `## 🌡️ CLIMA\n`;
        md += `**REAL:** ${reg.clima?.real?.condicao}, ${reg.clima?.real?.temperatura}°C\n`;
        md += `**PREVISÃO:** ${reg.clima?.previsao?.condicao}, ${reg.clima?.previsao?.temperatura}°C\n\n`;
        md += `## 📝 OBSERVAÇÕES\n${this.sanitizeForMarkdown(reg.observacoes) || 'Nenhuma.'}\n\n`;
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
            .filter(r => new Date(r.data) >= inicio)
            .reduce((sum, r) => sum + this.safeNumber(r.fluxo?.pagosDia), 0);
    }

    calcularVendasMes(registros) {
        const hoje = new Date();
        const inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        return (registros || [])
            .filter(r => new Date(r.data) >= inicio)
            .reduce((sum, r) => sum + this.safeNumber(r.fluxo?.pagosDia), 0);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
        toast.className = `${colors[type] || colors.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-bounce`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    openSettings() { this.openModal('settings'); }
    async syncData() { this.showToast('Dados sincronizados localmente', 'success'); }
}

// Create global instance
const app = new ArtemisApp();

// Initialize after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    app.init();
});