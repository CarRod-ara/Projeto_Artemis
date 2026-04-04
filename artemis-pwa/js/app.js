// Main Application Controller for Artemis PWA

class ArtemisApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentUser = null;
        this.produtos = [];
        this.metas = {};
        this.regrasMix = [];
        this.weatherData = null;
        this.chartInstances = {};
    }

    // Initialize app
    async init() {
        try {
            // Initialize database
            await db.init();
            await db.initDefaultConfig();
            
            // Load config
            this.currentUser = await db.getConfig('user');
            this.metas = await db.getConfig('metas');
            this.produtos = await db.getConfig('produtos');
            this.regrasMix = await db.getConfig('regrasMix');
            
            // Update date display
            this.updateDateDisplay();
            
            // Load weather
            this.weatherData = await weather.getWeather();
            
            // Navigate to dashboard
            this.navigate('dashboard');
            
            // Setup online/offline listeners
            this.setupConnectivityListeners();
            
            console.log('Artemis initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Erro ao inicializar. Recarregue a página.', 'error');
        }
    }

    // Update date display in header
    updateDateDisplay() {
        const hoje = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDate').textContent = hoje.toLocaleDateString('pt-BR', options);
    }

    // Setup online/offline listeners
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

    // Navigation
    navigate(page) {
        this.currentPage = page;
        
        // Update nav buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.classList.remove('text-purple-600', 'tab-active');
            btn.classList.add('text-gray-500');
        });
        const activeBtn = document.querySelector(`[data-page="${page}"]`);
        if (activeBtn) {
            activeBtn.classList.remove('text-gray-500');
            activeBtn.classList.add('text-purple-600', 'tab-active');
        }
        
        // Load page content
        const mainContent = document.getElementById('mainContent');
        mainContent.innerHTML = '';
        
        switch (page) {
            case 'dashboard':
                this.renderDashboard(mainContent);
                break;
            case 'registrar':
                this.renderRegistrar(mainContent);
                break;
            case 'fiados':
                this.renderFiados(mainContent);
                break;
            case 'relatorios':
                this.renderRelatorios(mainContent);
                break;
        }
    }

    // ==================== DASHBOARD ====================
    async renderDashboard(container) {
        const hoje = new Date().toISOString().split('T')[0];
        const registroHoje = await db.getRegistro(hoje);
        
        // Calculate totals
        const registros = await db.getAllRegistros();
        const vendasSemana = this.calcularVendasSemana(registros);
        const vendasMes = this.calcularVendasMes(registros);
        
        // Get mix suggestion
        const sugestaoMix = await mixEngine.generateSuggestion({
            data: hoje,
            diaSemana: new Date().toLocaleDateString('pt-BR', { weekday: 'long' }),
            clima: this.weatherData,
            temperatura: this.weatherData?.current?.temperature,
            produtos: this.produtos,
            regras: this.regrasMix
        });

        container.innerHTML = `
            <!-- Progress Card -->
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-semibold text-gray-700">Meta Diária</h2>
                    <span class="text-sm text-gray-500">${registroHoje ? '✅ Registrado' : '⏳ Pendente'}</span>
                </div>
                
                <div class="text-center mb-4">
                    <span class="text-3xl font-bold text-gray-800">
                        R$ ${(registroHoje?.fluxo?.pagosDia || 0).toFixed(2)}
                    </span>
                    <span class="text-gray-500">/ R$ ${this.metas.ideal.toFixed(2)}</span>
                </div>
                
                <!-- Progress Bar -->
                <div class="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div class="h-full progress-gradient rounded-full transition-all duration-500" 
                         style="width: ${Math.min(100, ((registroHoje?.fluxo?.pagosDia || 0) / this.metas.ideal) * 100)}%"></div>
                </div>
                
                <!-- Goals Grid -->
                <div class="grid grid-cols-3 gap-2 text-center">
                    <div class="bg-yellow-100 rounded-lg p-2">
                        <div class="text-xs text-yellow-700 font-medium">Sobrevivência</div>
                        <div class="text-sm font-bold text-yellow-800">R$ ${this.metas.survival}</div>
                    </div>
                    <div class="bg-orange-100 rounded-lg p-2">
                        <div class="text-xs text-orange-700 font-medium">Confortável</div>
                        <div class="text-sm font-bold text-orange-800">R$ ${this.metas.comfortable}</div>
                    </div>
                    <div class="bg-green-100 rounded-lg p-2">
                        <div class="text-xs text-green-700 font-medium">Ideal</div>
                        <div class="text-sm font-bold text-green-800">R$ ${this.metas.ideal}</div>
                    </div>
                </div>
            </div>

            <!-- Weather & Mix Card -->
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex items-center justify-between mb-3">
                    <h2 class="font-semibold text-gray-700">Sugestão de Mix</h2>
                    <span class="text-2xl">${this.weatherData?.current?.condition?.icon || '🌡️'}</span>
                </div>
                
                <p class="text-sm text-gray-600 mb-3">
                    ${this.weatherData?.current?.condition?.name || 'Carregando...'} • 
                    ${this.weatherData?.current?.temperature || '--'}°C
                    ${this.weatherData?.cached ? '(cache)' : ''}
                </p>
                
                <p class="text-xs text-gray-500 mb-3">${sugestaoMix.explicacao}</p>
                
                <!-- Mix Preview -->
                <div class="space-y-2 mb-4">
                    ${this.renderMixPreview(sugestaoMix.mix)}
                </div>
                
                <div class="flex justify-between items-center text-sm">
                    <span class="text-gray-600">Total: <strong>${sugestaoMix.totalItens}</strong> itens</span>
                    <span class="text-green-600">Estimativa: R$ ${sugestaoMix.estimativaFaturamento}</span>
                </div>
            </div>

            <!-- Weekly Chart -->
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">Vendas da Semana</h2>
                <div class="h-48">
                    <canvas id="weeklyChart"></canvas>
                </div>
            </div>

            <!-- Weekly & Monthly Summary -->
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-2xl p-4 card-shadow">
                    <div class="text-sm text-gray-500 mb-1">Esta Semana</div>
                    <div class="text-xl font-bold text-gray-800">R$ ${vendasSemana.toFixed(2)}</div>
                    <div class="text-xs text-gray-400">Meta: R$ ${(this.metas.ideal * 7).toFixed(2)}</div>
                </div>
                <div class="bg-white rounded-2xl p-4 card-shadow">
                    <div class="text-sm text-gray-500 mb-1">Este Mês</div>
                    <div class="text-xl font-bold text-gray-800">R$ ${vendasMes.toFixed(2)}</div>
                    <div class="text-xs text-gray-400">Meta: R$ ${(this.metas.ideal * 30).toFixed(2)}</div>
                </div>
            </div>
        `;

        // Render chart
        this.renderWeeklyChart(registros);
    }

    renderMixPreview(mix) {
        const categorias = { bolos: [], brownies: [], brigadeiros: [], outros: [] };
        
        for (const [id, qtd] of Object.entries(mix)) {
            if (qtd <= 0) continue;
            const produto = this.produtos.find(p => p.id === id);
            if (!produto) continue;
            
            if (produto.categoria === 'bolos') categorias.bolos.push({ nome: produto.nome, qtd });
            else if (produto.categoria === 'brownies') categorias.brownies.push({ nome: produto.nome, qtd });
            else if (produto.categoria === 'brigadeiros') categorias.brigadeiros.push({ nome: produto.nome, qtd });
            else categorias.outros.push({ nome: produto.nome, qtd });
        }
        
        let html = '';
        
        if (categorias.bolos.length > 0) {
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Bolos:</span> ${categorias.bolos.map(b => `<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">${b.nome} ${b.qtd}</span>`).join('')}</div>`;
        }
        if (categorias.brownies.length > 0) {
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brownies:</span> ${categorias.brownies.map(b => `<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">${b.nome} ${b.qtd}</span>`).join('')}</div>`;
        }
        if (categorias.brigadeiros.length > 0) {
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brigadeiros:</span> ${categorias.brigadeiros.map(b => `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">${b.nome} ${b.qtd}</span>`).join('')}</div>`;
        }
        
        return html || '<span class="text-gray-400 text-sm">Nenhum item sugerido</span>';
    }

    renderWeeklyChart(registros) {
        const canvas = document.getElementById('weeklyChart');
        if (!canvas) return;
        
        // Get last 7 days
        const dias = [];
        const valores = [];
        
        for (let i = 6; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            const dataStr = data.toISOString().split('T')[0];
            const diaLabel = data.toLocaleDateString('pt-BR', { weekday: 'short' });
            
            const registro = registros.find(r => r.id === dataStr);
            const valor = registro?.fluxo?.pagosDia || 0;
            
            dias.push(diaLabel);
            valores.push(valor);
        }
        
        if (this.chartInstances.weekly) {
            this.chartInstances.weekly.destroy();
        }
        
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
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => 'R$ ' + value
                        }
                    }
                }
            }
        });
    }

    // ==================== REGISTRAR ====================
    async renderRegistrar(container) {
        const hoje = new Date().toISOString().split('T')[0];
        const diaSemana = new Date().toLocaleDateString('pt-BR', { weekday: 'long' });
        const registroExistente = await db.getRegistro(hoje);
        
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
                
                <form id="registroForm" onsubmit="app.salvarRegistro(event)">
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
            const data = new Date(e.target.value);
            const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'long' });
            document.getElementById('regDiaSemana').value = diaSemana;
        });
    }

    renderItensForm(sugestaoMix, itensExistentes) {
        const categorias = {
            bolos: { nome: '🎂 Bolos', produtos: [] },
            brownies: { nome: '🍫 Brownies', produtos: [] },
            brigadeiros: { nome: '🍬 Brigadeiros', produtos: [] },
            mousses: { nome: '🧁 Mousses', produtos: [] },
            copos: { nome: '🍧 Copos da Felicidade', produtos: [] },
            sacoles: { nome: '🍨 Sacolés', produtos: [] },
            bebidas: { nome: '🥤 Bebidas', produtos: [] }
        };
        
        // Group products by category
        for (const produto of this.produtos) {
            if (categorias[produto.categoria]) {
                const sugestao = sugestaoMix[produto.id] || 0;
                const existente = itensExistentes?.find(i => i.codigo === produto.codigo);
                
                categorias[produto.categoria].produtos.push({
                    ...produto,
                    sugestao,
                    levado: existente?.levado || 0,
                    vendido: existente?.vendido || 0
                });
            }
        }
        
        let html = '';
        
        for (const [catKey, categoria] of Object.entries(categorias)) {
            if (categoria.produtos.length === 0) continue;
            
            html += `
                <div class="bg-gray-50 rounded-lg p-3 mb-3">
                    <h4 class="font-medium text-gray-700 mb-2">${categoria.nome}</h4>
                    <div class="grid grid-cols-2 gap-2">
            `;
            
            for (const prod of categoria.produtos) {
                html += `
                    <div class="bg-white rounded-lg p-2 border border-gray-200">
                        <div class="text-xs text-gray-600 mb-1">${prod.nome} (${prod.codigo})</div>
                        <div class="flex gap-2">
                            <input type="number" min="0" 
                                   name="levado_${prod.id}" 
                                   value="${prod.levado || ''}"
                                   placeholder="Lev"
                                   class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded">
                            <input type="number" min="0" 
                                   name="vendido_${prod.id}" 
                                   value="${prod.vendido || ''}"
                                   placeholder="Vend"
                                   class="w-1/2 px-2 py-1 text-sm border border-gray-300 rounded">
                        </div>
                        ${prod.sugestao > 0 ? `<div class="text-xs text-purple-600 mt-1">Sugestão: ${prod.sugestao}</div>` : ''}
                    </div>
                `;
            }
            
            html += `</div></div>`;
        }
        
        return html;
    }

    async salvarRegistro(event) {
        event.preventDefault();
        
        const data = document.getElementById('regData').value;
        
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
            agentesFeedback: this.gerarFeedbackAgentes(itensVendidos, eficiera, data)
        };
        
        try {
            await db.saveRegistro(registro);
            this.showToast('Registro salvo com sucesso!', 'success');
            this.navigate('dashboard');
        } catch (error) {
            console.error('Error saving registro:', error);
            this.showToast('Erro ao salvar registro', 'error');
        }
    }

    calcularEficiencia(itens) {
        let totalLevado = 0;
        let totalVendido = 0;
        const porCategoria = {};
        const porProduto = {};
        
        for (const item of itens) {
            totalLevado += item.levado;
            totalVendido += item.vendido;
            
            // By category
            if (!porCategoria[item.categoria]) {
                porCategoria[item.categoria] = { levado: 0, vendido: 0 };
            }
            porCategoria[item.categoria].levado += item.levado;
            porCategoria[item.categoria].vendido += item.vendido;
            
            // By product
            porProduto[item.codigo] = item.levado > 0 ? item.vendido / item.levado : 0;
        }
        
        // Calculate category efficiencies
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
        return (h2 * 60 + m2) - (h1 * 60 + m1);
    }

    gerarFeedbackAgentes(itens, eficiencia, data) {
        // Simplified agent feedback (can be expanded)
        const efGeral = Math.round(eficiencia.geral * 100);
        
        return {
            imperius: `Eficiência geral de ${efGeral}%. Análise baseada nos dados do dia.`,
            markus: `Dica operacional: ${efGeral > 80 ? 'Ótimo desempenho!' : 'Ajuste o mix para melhorar.'}`,
            phil: `Você está no caminho certo. Continue registrando!`
        };
    }

    // ==================== FIADOS ====================
    async renderFiados(container) {
        const fiadosAtivos = await db.getFiadosAtivos();
        const fiadosVencidos = await db.getFiadosVencidos();
        const totalDevido = fiadosAtivos.reduce((sum, f) => sum + f.valor, 0);

        container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="font-semibold text-gray-700">👥 Controle de Fiados</h2>
                    <button onclick="app.openModal('novoFiado')" 
                            class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        + Novo
                    </button>
                </div>
                
                <!-- Summary -->
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-yellow-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-yellow-700">${fiadosAtivos.length}</div>
                        <div class="text-xs text-yellow-600">Fiados Ativos</div>
                    </div>
                    <div class="bg-red-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-red-700">${fiadosVencidos.length}</div>
                        <div class="text-xs text-red-600">Vencidos</div>
                    </div>
                </div>
                
                <div class="bg-gray-100 rounded-lg p-3 mb-4 text-center">
                    <div class="text-sm text-gray-600">Total a Receber</div>
                    <div class="text-2xl font-bold text-gray-800">R$ ${totalDevido.toFixed(2)}</div>
                </div>
                
                <!-- Lista de Fiados -->
                <div class="space-y-3">
                    ${fiadosAtivos.length === 0 ? 
                        '<p class="text-center text-gray-500 py-4">Nenhum fiado ativo</p>' :
                        fiadosAtivos.map(f => this.renderFiadoCard(f)).join('')
                    }
                </div>
            </div>
        `;
    }

    renderFiadoCard(fiado) {
        const hoje = new Date().toISOString().split('T')[0];
        const vencido = fiado.dataVencimento < hoje;
        
        return `
            <div class="border border-gray-200 rounded-lg p-3 ${vencido ? 'bg-red-50 border-red-200' : 'bg-white'}">
                <div class="flex justify-between items-start">
                    <div>
                        <div class="font-medium text-gray-800">${fiado.clienteNome}</div>
                        <div class="text-sm text-gray-500">
                            R$ ${fiado.valor.toFixed(2)} • 
                            Vence: ${new Date(fiado.dataVencimento).toLocaleDateString('pt-BR')}
                            ${vencido ? ' <span class="text-red-600 font-medium">(VENCIDO)</span>' : ''}
                        </div>
                    </div>
                    <button onclick="app.quitarFiado('${fiado.id}')" 
                            class="text-green-600 hover:bg-green-50 px-3 py-1 rounded-lg text-sm font-medium">
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
        
        await db.saveFiado(fiado);
        this.showToast('Fiado quitado!', 'success');
        this.renderFiados(document.getElementById('mainContent'));
    }

    // ==================== RELATÓRIOS ====================
    async renderRelatorios(container) {
        const registros = await db.getAllRegistros();
        const ultimos30 = registros.filter(r => {
            const dataReg = new Date(r.data);
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - 30);
            return dataReg >= dataLimite;
        });

        container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">📈 Relatórios</h2>
                
                <!-- Quick Stats -->
                <div class="grid grid-cols-2 gap-3 mb-4">
                    <div class="bg-purple-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-purple-700">${registros.length}</div>
                        <div class="text-xs text-purple-600">Dias Registrados</div>
                    </div>
                    <div class="bg-green-50 rounded-lg p-3 text-center">
                        <div class="text-2xl font-bold text-green-700">${ultimos30.length}</div>
                        <div class="text-xs text-green-600">Últimos 30 dias</div>
                    </div>
                </div>
                
                <!-- Actions -->
                <div class="space-y-2">
                    <button onclick="app.exportData()" 
                            class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition">
                        💾 Exportar Todos os Dados (JSON)
                    </button>
                    
                    <button onclick="app.exportObsidian()" 
                            class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition">
                        📝 Exportar para Obsidian (Markdown)
                    </button>
                    
                    <button onclick="app.openModal('importar')" 
                            class="w-full py-3 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium transition">
                        📥 Importar Dados
                    </button>
                </div>
            </div>
        `;
    }

    // ==================== MODALS ====================
    openModal(type) {
        const modal = document.getElementById('modal');
        const content = document.getElementById('modalContent');
        
        modal.classList.remove('hidden');
        
        switch (type) {
            case 'novoFiado':
                content.innerHTML = this.renderNovoFiadoModal();
                break;
            case 'importar':
                content.innerHTML = this.renderImportarModal();
                break;
            case 'settings':
                content.innerHTML = this.renderSettingsModal();
                break;
        }
    }

    closeModal() {
        document.getElementById('modal').classList.add('hidden');
    }

    renderNovoFiadoModal() {
        const hoje = new Date().toISOString().split('T')[0];
        const vencimento = new Date();
        vencimento.setDate(vencimento.getDate() + 7);
        
        return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">Novo Fiado</h3>
                    <button onclick="app.closeModal()" class="text-gray-500 text-2xl">&times;</button>
                </div>
                
                <form onsubmit="app.salvarFiado(event)">
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-600 mb-1">Nome do Cliente</label>
                        <input type="text" id="fiadoNome" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    
                    <div class="mb-3">
                        <label class="block text-sm font-medium text-gray-600 mb-1">Valor (R$)</label>
                        <input type="number" step="0.01" id="fiadoValor" required
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3 mb-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-600 mb-1">Data</label>
                            <input type="date" id="fiadoData" value="${hoje}" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-600 mb-1">Vencimento</label>
                            <input type="date" id="fiadoVencimento" value="${vencimento.toISOString().split('T')[0]}" required
                                   class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                        </div>
                    </div>
                    
                    <button type="submit" class="w-full btn-primary text-white py-3 rounded-xl font-semibold">
                        Salvar Fiado
                    </button>
                </form>
            </div>
        `;
    }

    async salvarFiado(event) {
        event.preventDefault();
        
        const fiado = {
            id: 'fiado_' + Date.now(),
            clienteNome: document.getElementById('fiadoNome').value,
            valor: parseFloat(document.getElementById('fiadoValor').value),
            dataEmprestimo: document.getElementById('fiadoData').value,
            dataVencimento: document.getElementById('fiadoVencimento').value,
            pago: false
        };
        
        await db.saveFiado(fiado);
        this.closeModal();
        this.showToast('Fiado registrado!', 'success');
        this.renderFiados(document.getElementById('mainContent'));
    }

    renderSettingsModal() {
        return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">⚙️ Configurações</h3>
                    <button onclick="app.closeModal()" class="text-gray-500 text-2xl">&times;</button>
                </div>
                
                <div class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-600 mb-2">Metas Diárias</label>
                        <div class="grid grid-cols-3 gap-2">
                            <div>
                                <label class="text-xs text-yellow-600">Sobrevivência</label>
                                <input type="number" id="metaSurvival" value="${this.metas.survival}"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            </div>
                            <div>
                                <label class="text-xs text-orange-600">Confortável</label>
                                <input type="number" id="metaComfortable" value="${this.metas.comfortable}"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            </div>
                            <div>
                                <label class="text-xs text-green-600">Ideal</label>
                                <input type="number" id="metaIdeal" value="${this.metas.ideal}"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            </div>
                        </div>
                    </div>
                    
                    <button onclick="app.salvarConfiguracoes()" 
                            class="w-full btn-primary text-white py-3 rounded-xl font-semibold">
                        Salvar Configurações
                    </button>
                </div>
            </div>
        `;
    }

    async salvarConfiguracoes() {
        this.metas = {
            survival: parseInt(document.getElementById('metaSurvival').value),
            comfortable: parseInt(document.getElementById('metaComfortable').value),
            ideal: parseInt(document.getElementById('metaIdeal').value)
        };
        
        await db.setConfig('metas', this.metas);
        this.closeModal();
        this.showToast('Configurações salvas!', 'success');
    }

    // ==================== EXPORT/IMPORT ====================
    async exportData() {
        const data = await db.exportAllData();
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
        const registros = await db.getAllRegistros();
        let markdown = '';
        
        for (const reg of registros.sort((a, b) => new Date(b.data) - new Date(a.data))) {
            markdown += this.registroToMarkdown(reg);
            markdown += '\n---\n\n';
        }
        
        const blob = new Blob([markdown], { type: 'text/markdown' };
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `artemis_registros_${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.showToast('Exportado para Obsidian!', 'success');
    }

    registroToMarkdown(reg) {
        let md = `#financeiro\n---\ndata: "${reg.data}"\ndia_da_semana: "${reg.diaSemana}"\ntipo: diário\n---\n\n`;
        md += `# 📓 Vendas ${new Date(reg.data).toLocaleDateString('pt-BR')}\n\n`;
        md += `## 💰 FLUXO DO DIA\n`;
        md += `**🟢 PAGOS NO DIA:** R$ ${reg.fluxo.pagosDia.toFixed(2)}\n`;
        md += `**🟡 FIADOS HOJE:** R$ ${reg.fluxo.fiadosHoje.toFixed(2)}\n`;
        md += `**🔵 RECEBIDOS (fiados anteriores):** R$ ${reg.fluxo.recebidosFiados.toFixed(2)}\n\n`;
        
        md += `## ⏳ TEMPO OPERACIONAL\n`;
        md += `**🕒 INÍCIO DAS VENDAS:** ${reg.tempoOperacional.inicio}\n`;
        md += `**🕔 FIM DAS VENDAS:** ${reg.tempoOperacional.fim}\n`;
        const horas = Math.floor(reg.tempoOperacional.totalMinutos / 60);
        const mins = reg.tempoOperacional.totalMinutos % 60;
        md += `**⏳ TEMPO ATIVO TOTAL:** ${horas}h ${mins}min\n\n`;
        
        md += `## 🍰 ITENS VENDIDOS\n\n`;
        
        // Group by category
        const byCat = {};
        for (const item of reg.itensVendidos) {
            if (!byCat[item.categoria]) byCat[item.categoria] = [];
            byCat[item.categoria].push(item);
        }
        
        for (const [cat, items] of Object.entries(byCat)) {
            md += `### ${this.getCategoriaEmoji(cat)} ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n`;
            for (const item of items) {
                const ef = item.levado > 0 ? Math.round((item.vendido / item.levado) * 100) : 0;
                md += `- **${item.nome} (${item.codigo}):** ${item.vendido} unidades (levado: ${item.levado}, ef: ${ef}%)\n`;
            }
            md += '\n';
        }
        
        md += `## 🌡️ CLIMA\n`;
        md += `**REAL:** ${reg.clima.real.condicao}, ${reg.clima.real.temperatura}°C\n`;
        md += `**PREVISÃO:** ${reg.clima.previsao.condicao}, ${reg.clima.previsao.temperatura}°C (${reg.clima.previsao.fonte})\n\n`;
        
        md += `## 📝 OBSERVAÇÕES\n${reg.observacoes || 'Nenhuma observação.'}\n\n`;
        
        md += `## 🤖 FEEDBACK DOS AGENTES\n`;
        md += `- **IMPERIUS:** ${reg.agentesFeedback.imperius}\n`;
        md += `- **MARKUS:** ${reg.agentesFeedback.markus}\n`;
        md += `- **PHIL:** ${reg.agentesFeedback.phil}\n`;
        
        return md;
    }

    getCategoriaEmoji(cat) {
        const emojis = {
            bolos: '🎂', brownies: '🍫', brigadeiros: '🍬',
            mousses: '🧁', copos: '🍧', sacoles: '🍨', bebidas: '🥤'
        };
        return emojis[cat] || '📦';
    }

    // ==================== UTILITIES ====================
    calcularVendasSemana(registros) {
        const hoje = new Date();
        const inicioSemana = new Date(hoje);
        inicioSemana.setDate(hoje.getDate() - hoje.getDay());
        inicioSemana.setHours(0, 0, 0, 0);
        
        return registros
            .filter(r => new Date(r.data) >= inicioSemana)
            .reduce((sum, r) => sum + (r.fluxo?.pagosDia || 0), 0);
    }

    calcularVendasMes(registros) {
        const hoje = new Date();
        const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
        
        return registros
            .filter(r => new Date(r.data) >= inicioMes)
            .reduce((sum, r) => sum + (r.fluxo?.pagosDia || 0), 0);
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            warning: 'bg-yellow-500',
            info: 'bg-blue-500'
        };
        
        toast.className = `${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium animate-bounce`;
        toast.textContent = message;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    openSettings() {
        this.openModal('settings');
    }

    async syncData() {
        // Placeholder for future sync functionality
        this.showToast('Dados sincronizados localmente', 'success');
    }
}

// Create global app instance
const app = new ArtemisApp();

// Close modal on outside click
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') {
        app.closeModal();
    }
});
