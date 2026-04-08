// Main Application Controller for Artemis PWA — v1.1
// Novidades: tabela de eficiência, alocação 50/30/10/10, feedback IA dos agentes, métricas semanais

class ArtemisApp {
    constructor() {
        this.currentPage = 'dashboard';
        this.currentUser = null;
        this.produtos = [];
        this.metas = {};
        this.metasSemana = {};
        this.regrasMix = [];
        this.weatherData = null;
        this.chartInstances = {};
        this.feedbackLoading = false;
        this._feedbackRegistroId = null;
    }

    // ==================== INIT ====================
    async init() {
        try {
            await db.init();
            await db.initDefaultConfig();

            this.currentUser = await db.getConfig('user');
            this.metas = await db.getConfig('metas');
            this.produtos = await db.getConfig('produtos');
            this.regrasMix = await db.getConfig('regrasMix');

            // Carregar ou inicializar metas semanais
            this.metasSemana = await db.getConfig('metasSemana') || {
                survival: 550,
                realistic: 750,
                ideal: 1300
            };
            if (!await db.getConfig('metasSemana')) {
                await db.setConfig('metasSemana', this.metasSemana);
            }

            this.updateDateDisplay();
            this.weatherData = await weather.getWeather();
            this.navigate('dashboard');
            this.setupConnectivityListeners();

            console.log('Artemis v1.1 inicializado');
        } catch (error) {
            console.error('Initialization error:', error);
            this.showToast('Erro ao inicializar. Recarregue a página.', 'error');
        }
    }

    updateDateDisplay() {
        const hoje = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('currentDate').textContent = hoje.toLocaleDateString('pt-BR', options);
    }

    setupConnectivityListeners() {
        window.addEventListener('online', () => {
            document.body.classList.remove('offline');
            this.showToast('Conectado! Sincronizando...', 'success');
            this.syncData();
        });
        window.addEventListener('offline', () => {
            document.body.classList.add('offline');
            this.showToast('Modo offline ativado', 'warning');
        });
        if (!navigator.onLine) document.body.classList.add('offline');
    }

    // ==================== NAVIGATION ====================
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
        mainContent.innerHTML = '';
        switch (page) {
            case 'dashboard':   this.renderDashboard(mainContent); break;
            case 'registrar':   this.renderRegistrar(mainContent); break;
            case 'fiados':      this.renderFiados(mainContent); break;
            case 'relatorios':  this.renderRelatorios(mainContent); break;
        }
    }

    // ==================== DASHBOARD ====================
    async renderDashboard(container) {
        const hoje = new Date().toISOString().split('T')[0];
        const registroHoje = await db.getRegistro(hoje);
        const registros = await db.getAllRegistros();
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

        const temItensHoje = registroHoje?.itensVendidos?.filter(i => i.levado > 0).length > 0;

        container.innerHTML = `
            <!-- ========== META DIÁRIA ========== -->
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
                <div class="h-3 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <div class="h-full progress-gradient rounded-full transition-all duration-500"
                         style="width: ${Math.min(100, ((registroHoje?.fluxo?.pagosDia || 0) / this.metas.ideal) * 100)}%"></div>
                </div>
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

            <!-- ========== METAS SEMANAIS (NOVO) ========== -->
            ${this.renderMetasSemanaisCard(registros, vendasSemana)}

            <!-- ========== SUGESTÃO DE MIX ========== -->
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
                <div class="space-y-2 mb-4">
                    ${this.renderMixPreview(sugestaoMix.mix)}
                </div>
                <div class="flex justify-between items-center text-sm">
                    <span class="text-gray-600">Total: <strong>${sugestaoMix.totalItens}</strong> itens</span>
                    <span class="text-green-600">Estimativa: R$ ${sugestaoMix.estimativaFaturamento}</span>
                </div>
            </div>

            <!-- ========== EFICIÊNCIA DO DIA (NOVO) ========== -->
            ${temItensHoje ? `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">📊 Eficiência do Dia</h2>
                ${this.renderEficienciaTable(registroHoje.itensVendidos)}
            </div>
            ` : ''}

            <!-- ========== ALOCAÇÃO SUGERIDA (NOVO) ========== -->
            ${registroHoje ? this.renderAlocacaoCard(registroHoje.alocacao || this.calcularAlocacao(registroHoje.fluxo)) : ''}

            <!-- ========== FEEDBACK DOS AGENTES (NOVO) ========== -->
            ${registroHoje ? `
            <div id="agentesCard">
                ${this.renderAgentesCard(
                    registroHoje.agentesFeedback,
                    this.feedbackLoading && this._feedbackRegistroId === registroHoje.id
                )}
            </div>
            ` : ''}

            <!-- ========== GRÁFICO SEMANAL ========== -->
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">Vendas da Semana</h2>
                <div class="h-48">
                    <canvas id="weeklyChart"></canvas>
                </div>
            </div>

            <!-- ========== RESUMO SEMANA / MÊS ========== -->
            <div class="grid grid-cols-2 gap-4">
                <div class="bg-white rounded-2xl p-4 card-shadow">
                    <div class="text-sm text-gray-500 mb-1">Esta Semana</div>
                    <div class="text-xl font-bold text-gray-800">R$ ${vendasSemana.toFixed(2)}</div>
                    <div class="text-xs text-gray-400">Meta: R$ ${this.metasSemana.ideal}</div>
                </div>
                <div class="bg-white rounded-2xl p-4 card-shadow">
                    <div class="text-sm text-gray-500 mb-1">Este Mês</div>
                    <div class="text-xl font-bold text-gray-800">R$ ${vendasMes.toFixed(2)}</div>
                    <div class="text-xs text-gray-400">Meta: R$ ${(this.metas.ideal * 30).toFixed(2)}</div>
                </div>
            </div>
        `;

        this.renderWeeklyChart(registros);
    }

    // ==================== METAS SEMANAIS (NOVO) ====================
    renderMetasSemanaisCard(registros, vendasSemana) {
        const ms = this.metasSemana;
        const pct = (val, meta) => Math.min(100, Math.round((val / meta) * 100));

        const getBarColor = (pct) => {
            if (pct >= 100) return 'bg-green-500';
            if (pct >= 60)  return 'bg-yellow-500';
            return 'bg-red-400';
        };

        const diasSemana = this.calcularDiasTrabalhados(registros);
        const ticketMedio = diasSemana > 0 ? (vendasSemana / diasSemana).toFixed(2) : '—';

        const metaRow = (label, meta, color) => {
            const p = pct(vendasSemana, meta);
            return `
                <div class="mb-3">
                    <div class="flex justify-between text-xs mb-1">
                        <span class="${color} font-medium">${label}</span>
                        <span class="text-gray-600">R$ ${vendasSemana.toFixed(2)} / R$ ${meta} <span class="font-bold">(${p}%)</span></span>
                    </div>
                    <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="${getBarColor(p)} h-full rounded-full transition-all duration-500" style="width:${p}%"></div>
                    </div>
                </div>
            `;
        };

        return `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="font-semibold text-gray-700">🎯 Metas da Semana</h2>
                    <span class="text-xs text-gray-400">${diasSemana} dia${diasSemana !== 1 ? 's' : ''} trabalhado${diasSemana !== 1 ? 's' : ''}</span>
                </div>
                ${metaRow('Conforto', ms.ideal, 'text-green-700')}
                ${metaRow('Realista', ms.realistic, 'text-orange-600')}
                ${metaRow('Sobrevivência', ms.survival, 'text-yellow-700')}
                <div class="flex justify-between text-xs text-gray-500 mt-2 pt-2 border-t border-gray-100">
                    <span>Ticket médio: <strong>R$ ${ticketMedio}</strong></span>
                    <span>Meta diária ideal: <strong>R$ ${this.metas.ideal}</strong></span>
                </div>
            </div>
        `;
    }

    // ==================== TABELA DE EFICIÊNCIA (NOVO) ====================
    renderEficienciaTable(itens) {
        const ativos = itens.filter(i => i.levado > 0);
        if (ativos.length === 0) return '<p class="text-gray-400 text-sm">Nenhum item levado hoje.</p>';

        const totalLevado  = ativos.reduce((s, i) => s + i.levado, 0);
        const totalVendido = ativos.reduce((s, i) => s + i.vendido, 0);
        const efTotal = totalLevado > 0 ? (totalVendido / totalLevado * 100) : 0;

        const badge = (ef) => {
            const emoji = ef >= 90 ? '🟢' : ef >= 70 ? '🔵' : ef >= 50 ? '🟡' : ef >= 30 ? '🟠' : '🔴';
            return `<span>${ef}% ${emoji}</span>`;
        };

        const rows = ativos.map(item => {
            const ef = item.levado > 0 ? Math.round(item.vendido / item.levado * 100) : 0;
            const sobrou = item.levado - item.vendido;
            return `
                <tr class="border-b border-gray-100 hover:bg-gray-50">
                    <td class="py-2 pr-2 text-xs text-gray-700 leading-tight">${item.nome}<br>
                        <span class="text-gray-400">(${item.codigo})</span>
                    </td>
                    <td class="py-2 text-xs text-center text-gray-600">${item.levado}</td>
                    <td class="py-2 text-xs text-center font-medium text-gray-800">${item.vendido}</td>
                    <td class="py-2 text-xs text-center ${sobrou > 0 ? 'text-red-400' : 'text-gray-400'}">${sobrou}</td>
                    <td class="py-2 text-xs text-center">${badge(ef)}</td>
                </tr>
            `;
        }).join('');

        return `
            <div class="overflow-x-auto -mx-1">
                <table class="w-full">
                    <thead>
                        <tr class="border-b-2 border-gray-200 text-left">
                            <th class="py-2 text-xs text-gray-400 font-medium">Produto</th>
                            <th class="py-2 text-xs text-center text-gray-400 font-medium">Lev</th>
                            <th class="py-2 text-xs text-center text-gray-400 font-medium">Vend</th>
                            <th class="py-2 text-xs text-center text-gray-400 font-medium">Sobra</th>
                            <th class="py-2 text-xs text-center text-gray-400 font-medium">Ef%</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                    <tfoot>
                        <tr class="border-t-2 border-gray-300 bg-gray-50 font-bold">
                            <td class="py-2 text-xs text-gray-800">TOTAL</td>
                            <td class="py-2 text-xs text-center">${totalLevado}</td>
                            <td class="py-2 text-xs text-center">${totalVendido}</td>
                            <td class="py-2 text-xs text-center ${totalLevado - totalVendido > 0 ? 'text-red-400' : 'text-gray-400'}">${totalLevado - totalVendido}</td>
                            <td class="py-2 text-xs text-center">${badge(Math.round(efTotal))}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
            <p class="text-xs text-gray-400 mt-2">🟢90+ &nbsp;🔵70+ &nbsp;🟡50+ &nbsp;🟠30+ &nbsp;🔴0+</p>
        `;
    }

    // ==================== ALOCAÇÃO 50/30/10/10 (NOVO) ====================
    calcularAlocacao(fluxo) {
        const valorBase = (fluxo?.pagosDia || 0) + (fluxo?.recebidosFiados || 0);
        const threshold = 130;
        return {
            valorBase,
            empresa:  parseFloat((valorBase * 0.50).toFixed(2)),
            casa:     parseFloat((valorBase * 0.30).toFixed(2)),
            reserva:  parseFloat((valorBase * 0.10).toFixed(2)),
            dividas:  parseFloat((valorBase * 0.10).toFixed(2)),
            ativada: valorBase >= threshold,
            threshold
        };
    }

    renderAlocacaoCard(alocacao) {
        if (!alocacao) return '';
        const { valorBase, empresa, casa, reserva, dividas, ativada, threshold } = alocacao;

        const item = (cor, emoji, label, valor, pct) => `
            <div class="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                <div>
                    <span class="${cor} font-medium text-sm">${emoji} ${label}</span>
                    <span class="text-xs text-gray-400 ml-1">(${pct}%)</span>
                </div>
                <span class="font-bold text-gray-800">R$ ${valor.toFixed(2)}</span>
            </div>
        `;

        return `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-3">
                    <h2 class="font-semibold text-gray-700">💸 Alocação Sugerida</h2>
                    <span class="text-sm ${ativada ? 'text-green-600' : 'text-gray-400'}">
                        ${ativada ? '✅ Ativada' : `⬜ Base < R$${threshold}`}
                    </span>
                </div>
                <div class="bg-gray-50 rounded-lg px-4 py-3 mb-3">
                    <div class="flex justify-between items-center">
                        <span class="text-sm text-gray-600">Valor Base (pagos + fiados recebidos)</span>
                        <span class="text-lg font-bold text-gray-800">R$ ${valorBase.toFixed(2)}</span>
                    </div>
                </div>
                <div class="px-1">
                    ${item('text-blue-600',   '🏢', 'Empresa / Reinvestimento', empresa, 50)}
                    ${item('text-orange-600', '🏠', 'Casa / Custos Pessoais',   casa,    30)}
                    ${item('text-yellow-600', '🛡️', 'Reserva de Emergência',    reserva, 10)}
                    ${item('text-red-500',    '💳', 'Quitar Dívidas',            dividas, 10)}
                </div>
                ${!ativada ? `<p class="text-xs text-gray-400 mt-3 text-center">Ativa automaticamente quando base ≥ R$${threshold}</p>` : ''}
            </div>
        `;
    }

    // ==================== FEEDBACK DOS AGENTES (NOVO) ====================
    renderAgentesCard(feedback, isLoading = false) {
        if (isLoading) {
            return `
                <div class="bg-white rounded-2xl p-5 card-shadow">
                    <h2 class="font-semibold text-gray-700 mb-4">🤖 Feedback dos Agentes</h2>
                    <div class="flex items-center justify-center py-8 gap-3 text-gray-400">
                        <div class="animate-spin text-2xl">⚙️</div>
                        <span class="text-sm">Gerando análise dos agentes...</span>
                    </div>
                </div>
            `;
        }

        if (!feedback || (!feedback.imperius && !feedback.markus && !feedback.phil)) {
            return `
                <div class="bg-white rounded-2xl p-5 card-shadow">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="font-semibold text-gray-700">🤖 Feedback dos Agentes</h2>
                        <button onclick="app.regenerarFeedback()"
                                class="text-xs text-purple-600 hover:underline">🔄 Gerar</button>
                    </div>
                    <p class="text-sm text-gray-400 text-center py-4">Feedback ainda não gerado para este dia.</p>
                </div>
            `;
        }

        const agente = (cor, bg, icone, nome, subtitulo, texto) => `
            <div class="${bg} rounded-xl p-4 mb-3 last:mb-0">
                <div class="flex items-center gap-2 mb-2">
                    <span class="text-lg">${icone}</span>
                    <div>
                        <span class="${cor} font-bold text-sm">${nome}</span>
                        <span class="text-xs text-gray-400 ml-1">— ${subtitulo}</span>
                    </div>
                </div>
                <p class="text-sm text-gray-700 leading-relaxed">${texto}</p>
            </div>
        `;

        return `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="font-semibold text-gray-700">🤖 Feedback dos Agentes</h2>
                    <button onclick="app.regenerarFeedback()"
                            class="text-xs text-purple-600 hover:underline bg-purple-50 px-2 py-1 rounded">
                        🔄 Regenerar
                    </button>
                </div>
                ${agente('text-blue-700',   'bg-blue-50',   '⚔️', 'IMPERIUS', 'Análise Estratégica', feedback.imperius || '—')}
                ${agente('text-green-700',  'bg-green-50',  '🎯', 'MARKUS',   'Execução Tática',     feedback.markus  || '—')}
                ${agente('text-purple-700', 'bg-purple-50', '💜', 'PHIL',     'Gestão de Energia',   feedback.phil    || '—')}
            </div>
        `;
    }

    async gerarFeedbackAgentesAI(registro) {
        try {
            const contextData = {
                data: registro.data,
                diaSemana: registro.diaSemana,
                fluxo: registro.fluxo,
                tempoOperacional: registro.tempoOperacional,
                eficienciaGeral: Math.round((registro.eficiencia?.geral || 0) * 100),
                eficienciaPorCategoria: registro.eficiencia?.porCategoria
                    ? Object.entries(registro.eficiencia.porCategoria).reduce((acc, [k, v]) => {
                        acc[k] = Math.round(v * 100);
                        return acc;
                    }, {}) : {},
                topItensVendidos: registro.itensVendidos
                    ?.filter(i => i.levado > 0)
                    ?.map(i => ({
                        nome: i.nome,
                        levado: i.levado,
                        vendido: i.vendido,
                        ef: i.levado > 0 ? Math.round(i.vendido / i.levado * 100) : 0
                    })),
                alocacao: registro.alocacao,
                clima: registro.clima,
                observacoes: registro.observacoes,
                metaDia: this.metas
            };

            const response = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ registro: contextData })
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();

        } catch (error) {
            console.error('Feedback AI error:', error);
            return this.gerarFeedbackEstatico(registro);
        }
    }

    gerarFeedbackEstatico(registro) {
        const efGeral = Math.round((registro.eficiencia?.geral || 0) * 100);
        const valorBase = (registro.fluxo?.pagosDia || 0) + (registro.fluxo?.recebidosFiados || 0);
        const pagos = (registro.fluxo?.pagosDia || 0).toFixed(2);

        return {
            imperius: `Eficiência geral de ${efGeral}% com faturamento de R$${pagos} (base R$${valorBase.toFixed(2)}). ${efGeral >= 80 ? 'Mix bem calibrado.' : 'Mix com espaço para otimização.'} Análise detalhada disponível quando online.`,
            markus: `${efGeral > 80 ? 'Ótimo desempenho hoje! Mantenha o mix.' : 'Revise o mix para amanhã.'} Saída até 16h pode ampliar o faturamento. Registro feito — dados guardados.`,
            phil: `Você foi hoje e isso vale muito. ${efGeral >= 90 ? 'Vendeu quase tudo — seu feeling de mix está afiado!' : 'Cada dia é aprendizado.'} Descansa e já pensa no próximo.`
        };
    }

    async regenerarFeedback() {
        const hoje = new Date().toISOString().split('T')[0];
        const registro = await db.getRegistro(hoje);
        if (!registro) return;

        this.feedbackLoading = true;
        this._feedbackRegistroId = registro.id;

        const card = document.getElementById('agentesCard');
        if (card) card.innerHTML = this.renderAgentesCard(null, true);

        const feedback = await this.gerarFeedbackAgentesAI(registro);
        registro.agentesFeedback = feedback;
        await db.saveRegistro(registro);

        this.feedbackLoading = false;
        this._feedbackRegistroId = null;

        if (card) card.innerHTML = this.renderAgentesCard(feedback, false);
        this.showToast('Feedback dos agentes atualizado!', 'success');
    }

    // ==================== MIX PREVIEW ====================
    renderMixPreview(mix) {
        const categorias = { bolos: [], brownies: [], brigadeiros: [], outros: [] };
        for (const [id, qtd] of Object.entries(mix)) {
            if (qtd <= 0) continue;
            const produto = this.produtos.find(p => p.id === id);
            if (!produto) continue;
            if (produto.categoria === 'bolos')          categorias.bolos.push({ nome: produto.nome, qtd });
            else if (produto.categoria === 'brownies')  categorias.brownies.push({ nome: produto.nome, qtd });
            else if (produto.categoria === 'brigadeiros') categorias.brigadeiros.push({ nome: produto.nome, qtd });
            else categorias.outros.push({ nome: produto.nome, qtd });
        }
        let html = '';
        if (categorias.bolos.length > 0)
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Bolos:</span> ${categorias.bolos.map(b => `<span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">${b.nome} ${b.qtd}</span>`).join('')}</div>`;
        if (categorias.brownies.length > 0)
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brownies:</span> ${categorias.brownies.map(b => `<span class="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">${b.nome} ${b.qtd}</span>`).join('')}</div>`;
        if (categorias.brigadeiros.length > 0)
            html += `<div class="flex flex-wrap gap-1"><span class="text-xs font-medium text-gray-500">Brigadeiros:</span> ${categorias.brigadeiros.map(b => `<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">${b.nome} ${b.qtd}</span>`).join('')}</div>`;
        return html || '<span class="text-gray-400 text-sm">Nenhum item sugerido</span>';
    }

    renderWeeklyChart(registros) {
        const canvas = document.getElementById('weeklyChart');
        if (!canvas) return;
        const dias = [], valores = [];
        for (let i = 6; i >= 0; i--) {
            const data = new Date();
            data.setDate(data.getDate() - i);
            const dataStr = data.toISOString().split('T')[0];
            dias.push(data.toLocaleDateString('pt-BR', { weekday: 'short' }));
            const registro = registros.find(r => r.id === dataStr);
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
                    y: {
                        beginAtZero: true,
                        ticks: { callback: v => 'R$ ' + v }
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

        const sugestaoMix = await mixEngine.generateSuggestion({
            data: hoje,
            diaSemana,
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

                    <!-- Fluxo -->
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
                        <!-- Preview alocação ao vivo -->
                        <div id="alocacaoPreview" class="mt-2 bg-gray-50 rounded-lg p-3 hidden">
                            <div class="text-xs text-gray-500 font-medium mb-1">💸 Alocação estimada</div>
                            <div id="alocacaoPreviewContent" class="grid grid-cols-2 gap-1 text-xs text-gray-600"></div>
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
                                    <option value="sol"        ${this.weatherData?.current?.condition?.category === 'sol'        ? 'selected' : ''}>☀️ Sol</option>
                                    <option value="nublado"    ${this.weatherData?.current?.condition?.category === 'nublado'    ? 'selected' : ''}>☁️ Nublado</option>
                                    <option value="chuva"      ${this.weatherData?.current?.condition?.category === 'chuva'      ? 'selected' : ''}>🌧️ Chuva</option>
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

                    <button type="submit" id="btnSalvar"
                            class="w-full btn-primary text-white py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition">
                        ${registroExistente ? '💾 Atualizar Registro' : '✅ Salvar Registro'}
                    </button>
                </form>
            </div>
        `;

        // Listener: atualiza dia da semana quando muda data
        document.getElementById('regData').addEventListener('change', (e) => {
            const data = new Date(e.target.value + 'T12:00:00');
            document.getElementById('regDiaSemana').value = data.toLocaleDateString('pt-BR', { weekday: 'long' });
        });

        // Listener: preview de alocação ao vivo
        const atualizarPreviewAlocacao = () => {
            const pagos = parseFloat(document.getElementById('regPagos').value) || 0;
            const recebidos = parseFloat(document.getElementById('regRecebidos').value) || 0;
            const a = this.calcularAlocacao({ pagosDia: pagos, recebidosFiados: recebidos });
            const preview = document.getElementById('alocacaoPreview');
            const content = document.getElementById('alocacaoPreviewContent');
            if (pagos > 0 || recebidos > 0) {
                preview.classList.remove('hidden');
                content.innerHTML = `
                    <span>🏢 Empresa: <b>R$ ${a.empresa.toFixed(2)}</b></span>
                    <span>🏠 Casa: <b>R$ ${a.casa.toFixed(2)}</b></span>
                    <span>🛡️ Reserva: <b>R$ ${a.reserva.toFixed(2)}</b></span>
                    <span>💳 Dívidas: <b>R$ ${a.dividas.toFixed(2)}</b></span>
                `;
            } else {
                preview.classList.add('hidden');
            }
        };
        document.getElementById('regPagos').addEventListener('input', atualizarPreviewAlocacao);
        document.getElementById('regRecebidos').addEventListener('input', atualizarPreviewAlocacao);
        atualizarPreviewAlocacao();
    }

    renderItensForm(sugestaoMix, itensExistentes) {
        const categorias = {
            bolos:       { nome: '🎂 Bolos',              produtos: [] },
            brownies:    { nome: '🍫 Brownies',            produtos: [] },
            brigadeiros: { nome: '🍬 Brigadeiros',         produtos: [] },
            mousses:     { nome: '🧁 Mousses',             produtos: [] },
            copos:       { nome: '🍧 Copos da Felicidade', produtos: [] },
            sacoles:     { nome: '🍨 Sacolés',             produtos: [] },
            bebidas:     { nome: '🥤 Bebidas',             produtos: [] }
        };
        for (const produto of this.produtos) {
            if (!categorias[produto.categoria]) continue;
            const sugestao = sugestaoMix[produto.id] || 0;
            const existente = itensExistentes?.find(i => i.codigo === produto.codigo);
            categorias[produto.categoria].produtos.push({
                ...produto, sugestao,
                levado:  existente?.levado  || 0,
                vendido: existente?.vendido || 0
            });
        }
        let html = '';
        for (const [, categoria] of Object.entries(categorias)) {
            if (!categoria.produtos.length) continue;
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

        const btnSalvar = document.getElementById('btnSalvar');
        if (btnSalvar) {
            btnSalvar.disabled = true;
            btnSalvar.textContent = '⏳ Salvando...';
        }

        const data = document.getElementById('regData').value;
        const fluxo = {
            pagosDia:        parseFloat(document.getElementById('regPagos').value)     || 0,
            fiadosHoje:      parseFloat(document.getElementById('regFiados').value)    || 0,
            recebidosFiados: parseFloat(document.getElementById('regRecebidos').value) || 0
        };

        // Coletar itens vendidos
        const itensVendidos = [];
        for (const produto of this.produtos) {
            const levado  = parseInt(document.querySelector(`[name="levado_${produto.id}"]`)?.value)  || 0;
            const vendido = parseInt(document.querySelector(`[name="vendido_${produto.id}"]`)?.value) || 0;
            if (levado > 0 || vendido > 0) {
                itensVendidos.push({
                    categoria: produto.categoria,
                    codigo: produto.codigo,
                    nome: produto.nome,
                    levado, vendido,
                    precoUnitario: produto.preco
                });
            }
        }

        const eficiencia = this.calcularEficiencia(itensVendidos);
        const alocacao   = this.calcularAlocacao(fluxo);

        const registro = {
            id: data,
            data,
            diaSemana: document.getElementById('regDiaSemana').value,
            fluxo,
            tempoOperacional: {
                inicio: document.getElementById('regInicio').value,
                fim:    document.getElementById('regFim').value,
                totalMinutos: this.calcularMinutos(
                    document.getElementById('regInicio').value,
                    document.getElementById('regFim').value
                )
            },
            itensVendidos,
            clima: {
                real: {
                    condicao:     document.getElementById('regClimaCondicao').value,
                    temperatura:  parseFloat(document.getElementById('regClimaTemp').value)
                },
                previsao: {
                    condicao:    this.weatherData?.forecast?.[0]?.condition?.category || 'nublado',
                    temperatura: this.weatherData?.forecast?.[0]?.maxTemp || 25,
                    fonte: 'Open-Meteo'
                }
            },
            observacoes: document.getElementById('regObservacoes').value,
            eficiencia,
            alocacao,
            agentesFeedback: { imperius: null, markus: null, phil: null }
        };

        try {
            // 1. Salva o registro imediatamente
            await db.saveRegistro(registro);
            this.showToast('Registro salvo! Gerando feedback...', 'success');

            // 2. Navega para dashboard (já com efficiency table e alocação)
            this.feedbackLoading = true;
            this._feedbackRegistroId = registro.id;
            this.navigate('dashboard');

            // 3. Gera feedback IA em background e atualiza o card
            const feedback = await this.gerarFeedbackAgentesAI(registro);
            registro.agentesFeedback = feedback;
            await db.saveRegistro(registro);

            this.feedbackLoading = false;
            this._feedbackRegistroId = null;

            const agentesCard = document.getElementById('agentesCard');
            if (agentesCard) {
                agentesCard.innerHTML = this.renderAgentesCard(feedback, false);
                this.showToast('Agentes online!', 'success');
            }

        } catch (error) {
            console.error('Erro ao salvar registro:', error);
            this.showToast('Erro ao salvar registro', 'error');
            if (btnSalvar) {
                btnSalvar.disabled = false;
                btnSalvar.textContent = '✅ Salvar Registro';
            }
        }
    }

    calcularEficiencia(itens) {
        let totalLevado = 0, totalVendido = 0;
        const porCategoria = {}, porProduto = {};
        for (const item of itens) {
            totalLevado  += item.levado;
            totalVendido += item.vendido;
            if (!porCategoria[item.categoria]) porCategoria[item.categoria] = { levado: 0, vendido: 0 };
            porCategoria[item.categoria].levado  += item.levado;
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
        return (h2 * 60 + m2) - (h1 * 60 + m1);
    }

    // ==================== FIADOS ====================
    async renderFiados(container) {
        const fiadosAtivos  = await db.getFiadosAtivos();
        const fiadosVencidos = await db.getFiadosVencidos();
        const totalDevido   = fiadosAtivos.reduce((sum, f) => sum + f.valor, 0);

        container.innerHTML = `
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="font-semibold text-gray-700">👥 Controle de Fiados</h2>
                    <button onclick="app.openModal('novoFiado')"
                            class="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        + Novo
                    </button>
                </div>
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
                <div class="space-y-3">
                    ${fiadosAtivos.length === 0
                        ? '<p class="text-center text-gray-500 py-4">Nenhum fiado ativo</p>'
                        : fiadosAtivos.map(f => this.renderFiadoCard(f)).join('')}
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
                            Vence: ${new Date(fiado.dataVencimento + 'T12:00:00').toLocaleDateString('pt-BR')}
                            ${vencido ? '<span class="text-red-600 font-medium"> (VENCIDO)</span>' : ''}
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
        const vendasSemana = this.calcularVendasSemana(registros);

        const ultimos30 = registros.filter(r => {
            const dataReg   = new Date(r.data);
            const dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - 30);
            return dataReg >= dataLimite;
        });

        // Calcular métricas da semana
        const registrosSemana = this.getRegistrosSemanaAtual(registros);
        const diasTrabalhados = registrosSemana.length;
        const melhorDia = registrosSemana.reduce((best, r) => (!best || r.fluxo?.pagosDia > best.fluxo?.pagosDia) ? r : best, null);
        const piorDia   = registrosSemana.reduce((worst, r) => (!worst || r.fluxo?.pagosDia < worst.fluxo?.pagosDia) ? r : worst, null);
        const ticketMedio = diasTrabalhados > 0 ? vendasSemana / diasTrabalhados : 0;

        // Eficiência média da semana
        const eficienciaSemana = registrosSemana.reduce((sum, r) => sum + (r.eficiencia?.geral || 0), 0) / (diasTrabalhados || 1);

        // Top produtos da semana
        const vendasPorProduto = {};
        for (const reg of registrosSemana) {
            for (const item of (reg.itensVendidos || [])) {
                if (!vendasPorProduto[item.nome]) vendasPorProduto[item.nome] = 0;
                vendasPorProduto[item.nome] += item.vendido;
            }
        }
        const topProdutos = Object.entries(vendasPorProduto)
            .filter(([, v]) => v > 0)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3);

        const medals = ['🥇', '🥈', '🥉'];
        const ms = this.metasSemana;
        const pct = (v, m) => Math.min(100, Math.round((v / m) * 100));
        const bar = (v, m, color) => `
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden mt-1">
                <div class="${color} h-full rounded-full" style="width:${pct(v, m)}%"></div>
            </div>
        `;

        container.innerHTML = `
            <!-- ========== MÉTRICAS SEMANAIS ========== -->
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">🎯 Metas da Semana</h2>

                <div class="space-y-3 mb-4">
                    <div>
                        <div class="flex justify-between text-xs">
                            <span class="text-green-700 font-medium">Conforto — R$ ${ms.ideal}</span>
                            <span class="text-gray-600 font-bold">${pct(vendasSemana, ms.ideal)}%</span>
                        </div>
                        ${bar(vendasSemana, ms.ideal, 'bg-green-500')}
                    </div>
                    <div>
                        <div class="flex justify-between text-xs">
                            <span class="text-orange-600 font-medium">Realista — R$ ${ms.realistic}</span>
                            <span class="text-gray-600 font-bold">${pct(vendasSemana, ms.realistic)}%</span>
                        </div>
                        ${bar(vendasSemana, ms.realistic, 'bg-orange-400')}
                    </div>
                    <div>
                        <div class="flex justify-between text-xs">
                            <span class="text-yellow-700 font-medium">Sobrevivência — R$ ${ms.survival}</span>
                            <span class="text-gray-600 font-bold">${pct(vendasSemana, ms.survival)}%</span>
                        </div>
                        ${bar(vendasSemana, ms.survival, 'bg-yellow-400')}
                    </div>
                </div>

                <div class="grid grid-cols-2 gap-2 text-center text-xs border-t border-gray-100 pt-3">
                    <div class="bg-gray-50 rounded-lg p-2">
                        <div class="text-gray-500">Dias trabalhados</div>
                        <div class="font-bold text-gray-800 text-base">${diasTrabalhados}</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2">
                        <div class="text-gray-500">Ticket médio</div>
                        <div class="font-bold text-gray-800 text-base">R$ ${ticketMedio.toFixed(2)}</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2">
                        <div class="text-gray-500">Melhor dia</div>
                        <div class="font-bold text-green-700 text-sm">${melhorDia ? `R$ ${melhorDia.fluxo.pagosDia.toFixed(2)}` : '—'}</div>
                    </div>
                    <div class="bg-gray-50 rounded-lg p-2">
                        <div class="text-gray-500">Eficiência média</div>
                        <div class="font-bold ${eficienciaSemana >= 0.9 ? 'text-green-600' : eficienciaSemana >= 0.7 ? 'text-blue-600' : 'text-yellow-600'} text-base">
                            ${Math.round(eficienciaSemana * 100)}%
                        </div>
                    </div>
                </div>

                ${topProdutos.length > 0 ? `
                <div class="mt-3 pt-3 border-t border-gray-100">
                    <div class="text-xs text-gray-500 font-medium mb-2">🏆 Top Produtos da Semana</div>
                    ${topProdutos.map(([nome, qtd], i) => `
                        <div class="flex justify-between text-sm py-1">
                            <span>${medals[i]} ${nome}</span>
                            <span class="font-bold text-gray-700">${qtd} un</span>
                        </div>
                    `).join('')}
                </div>
                ` : ''}
            </div>

            <!-- ========== RESUMO GERAL ========== -->
            <div class="bg-white rounded-2xl p-5 card-shadow">
                <h2 class="font-semibold text-gray-700 mb-4">📈 Histórico Geral</h2>
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
        const modal   = document.getElementById('modal');
        const content = document.getElementById('modalContent');
        modal.classList.remove('hidden');
        switch (type) {
            case 'novoFiado': content.innerHTML = this.renderNovoFiadoModal(); break;
            case 'importar':  content.innerHTML = this.renderImportarModal();  break;
            case 'settings':  content.innerHTML = this.renderSettingsModal();  break;
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

    renderImportarModal() {
        return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">📥 Importar Dados</h3>
                    <button onclick="app.closeModal()" class="text-gray-500 text-2xl">&times;</button>
                </div>
                <p class="text-sm text-gray-600 mb-4">Selecione um arquivo de backup JSON exportado pelo Artemis.</p>
                <input type="file" id="importFile" accept=".json"
                       class="w-full mb-4 text-sm text-gray-600">
                <button onclick="app.importarDados()"
                        class="w-full btn-primary text-white py-3 rounded-xl font-semibold">
                    Importar
                </button>
            </div>
        `;
    }

    async importarDados() {
        const file = document.getElementById('importFile').files[0];
        if (!file) { this.showToast('Selecione um arquivo', 'error'); return; }
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                await db.importAllData(data);
                this.closeModal();
                this.showToast('Dados importados!', 'success');
                this.navigate('dashboard');
            } catch (err) {
                this.showToast('Arquivo inválido', 'error');
            }
        };
        reader.readAsText(file);
    }

    renderSettingsModal() {
        return `
            <div class="p-5">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-lg font-bold text-gray-800">⚙️ Configurações</h3>
                    <button onclick="app.closeModal()" class="text-gray-500 text-2xl">&times;</button>
                </div>

                <div class="space-y-5">
                    <!-- Metas Diárias -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">🎯 Metas Diárias</label>
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

                    <!-- Metas Semanais -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">📅 Metas Semanais</label>
                        <div class="grid grid-cols-3 gap-2">
                            <div>
                                <label class="text-xs text-yellow-600">Sobrevivência</label>
                                <input type="number" id="metaSemanaSurvival" value="${this.metasSemana.survival}"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            </div>
                            <div>
                                <label class="text-xs text-orange-600">Realista</label>
                                <input type="number" id="metaSemanaRealistic" value="${this.metasSemana.realistic}"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-lg">
                            </div>
                            <div>
                                <label class="text-xs text-green-600">Conforto</label>
                                <input type="number" id="metaSemanaIdeal" value="${this.metasSemana.ideal}"
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
            survival:    parseInt(document.getElementById('metaSurvival').value),
            comfortable: parseInt(document.getElementById('metaComfortable').value),
            ideal:       parseInt(document.getElementById('metaIdeal').value)
        };
        this.metasSemana = {
            survival: parseInt(document.getElementById('metaSemanaSurvival').value),
            realistic: parseInt(document.getElementById('metaSemanaRealistic').value),
            ideal:    parseInt(document.getElementById('metaSemanaIdeal').value)
        };
        await db.setConfig('metas', this.metas);
        await db.setConfig('metasSemana', this.metasSemana);
        this.closeModal();
        this.showToast('Configurações salvas!', 'success');
    }

    // ==================== EXPORT / IMPORT ====================
    async exportData() {
        const data = await db.exportAllData();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
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
        const blob = new Blob([markdown], { type: 'text/markdown' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `artemis_registros_${new Date().toISOString().split('T')[0]}.md`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Exportado para Obsidian!', 'success');
    }

    registroToMarkdown(reg) {
        let md = `#financeiro\n---\ndata: "${reg.data}"\ndia_da_semana: "${reg.diaSemana}"\ntipo: diário\n---\n\n`;
        md += `# 📓 Vendas ${new Date(reg.data + 'T12:00:00').toLocaleDateString('pt-BR')}\n\n`;
        md += `## 💰 FLUXO DO DIA\n`;
        md += `**🟢 PAGOS NO DIA:** R$ ${reg.fluxo.pagosDia.toFixed(2)}\n`;
        md += `**🟡 FIADOS HOJE:** R$ ${reg.fluxo.fiadosHoje.toFixed(2)}\n`;
        md += `**🔵 RECEBIDOS (fiados anteriores):** R$ ${reg.fluxo.recebidosFiados.toFixed(2)}\n\n`;

        const horas = Math.floor((reg.tempoOperacional?.totalMinutos || 0) / 60);
        const mins  = (reg.tempoOperacional?.totalMinutos || 0) % 60;
        md += `## ⏳ TEMPO OPERACIONAL\n`;
        md += `**🕒 INÍCIO DAS VENDAS:** ${reg.tempoOperacional?.inicio || '—'}\n`;
        md += `**🕔 FIM DAS VENDAS:** ${reg.tempoOperacional?.fim || '—'}\n`;
        md += `**⏳ TEMPO ATIVO TOTAL:** ${horas}h ${mins}min\n\n`;

        md += `## 🍰 ITENS VENDIDOS\n\n`;
        const byCat = {};
        for (const item of (reg.itensVendidos || [])) {
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

        // Tabela de eficiência
        if (reg.itensVendidos?.some(i => i.levado > 0)) {
            md += `### 📊 Eficiência\n`;
            md += `| Produto | Levado | Vendido | Eficiência |\n`;
            md += `|---------|--------|---------|------------|\n`;
            let totL = 0, totV = 0;
            for (const item of reg.itensVendidos.filter(i => i.levado > 0)) {
                const ef = Math.round(item.vendido / item.levado * 100);
                const em = ef >= 90 ? '🟢' : ef >= 70 ? '🔵' : ef >= 50 ? '🟡' : ef >= 30 ? '🟠' : '🔴';
                md += `| ${item.nome} (${item.codigo}) | ${item.levado} | ${item.vendido} | ${ef}% ${em} |\n`;
                totL += item.levado; totV += item.vendido;
            }
            const efTotal = totL > 0 ? Math.round(totV / totL * 100) : 0;
            const emTotal = efTotal >= 90 ? '🟢' : efTotal >= 70 ? '🔵' : efTotal >= 50 ? '🟡' : efTotal >= 30 ? '🟠' : '🔴';
            md += `| **TOTAL** | **${totL}** | **${totV}** | **${efTotal}% ${emTotal}** |\n\n`;
        }

        // Alocação
        if (reg.alocacao) {
            const a = reg.alocacao;
            md += `## 💸 ALOCAÇÃO SUGERIDA\n`;
            md += `**Valor Base:** R$ ${a.valorBase.toFixed(2)}\n`;
            md += `- **50% Empresa/Reinvestimento:** R$ ${a.empresa.toFixed(2)}\n`;
            md += `- **30% Casa/Custos Pessoais:** R$ ${a.casa.toFixed(2)}\n`;
            md += `- **10% Reserva Emergência:** R$ ${a.reserva.toFixed(2)}\n`;
            md += `- **10% Quitar Dívidas:** R$ ${a.dividas.toFixed(2)}\n`;
            md += `**Status:** ${a.ativada ? '✅ Ativada' : `⬜ Não ativada – base < R$${a.threshold}`}\n\n`;
        }

        md += `## 🌡️ CLIMA\n`;
        md += `**REAL:** ${reg.clima?.real?.condicao || '—'}, ${reg.clima?.real?.temperatura || '—'}°C\n`;
        md += `**PREVISÃO:** ${reg.clima?.previsao?.condicao || '—'}, ${reg.clima?.previsao?.temperatura || '—'}°C (${reg.clima?.previsao?.fonte || '—'})\n\n`;

        md += `## 📝 OBSERVAÇÕES\n${reg.observacoes || 'Nenhuma observação.'}\n\n`;

        md += `## 🤖 FEEDBACK DOS AGENTES\n`;
        md += `- **IMPERIUS (ANÁLISE ESTRATÉGICA):**\n  *${reg.agentesFeedback?.imperius || '—'}*\n\n`;
        md += `- **MARKUS (EXECUÇÃO TÁTICA):**\n  *${reg.agentesFeedback?.markus || '—'}*\n\n`;
        md += `- **PHIL (GESTÃO DE ENERGIA):**\n  *${reg.agentesFeedback?.phil || '—'}*\n`;

        return md;
    }

    getCategoriaEmoji(cat) {
        const emojis = { bolos: '🎂', brownies: '🍫', brigadeiros: '🍬', mousses: '🧁', copos: '🍧', sacoles: '🍨', bebidas: '🥤' };
        return emojis[cat] || '📦';
    }

    // ==================== UTILITIES ====================
    calcularVendasSemana(registros) {
        return this.getRegistrosSemanaAtual(registros).reduce((sum, r) => sum + (r.fluxo?.pagosDia || 0), 0);
    }

    calcularVendasMes(registros) {
        const inicioMes = new Date();
        inicioMes.setDate(1);
        inicioMes.setHours(0, 0, 0, 0);
        return registros.filter(r => new Date(r.data) >= inicioMes).reduce((sum, r) => sum + (r.fluxo?.pagosDia || 0), 0);
    }

    getRegistrosSemanaAtual(registros) {
        const hoje = new Date();
        const inicioSemana = new Date(hoje);
        // Semana começa na segunda-feira
        const diaSemana = hoje.getDay(); // 0 = domingo
        const offset = diaSemana === 0 ? 6 : diaSemana - 1;
        inicioSemana.setDate(hoje.getDate() - offset);
        inicioSemana.setHours(0, 0, 0, 0);
        return registros.filter(r => new Date(r.data) >= inicioSemana);
    }

    calcularDiasTrabalhados(registros) {
        return this.getRegistrosSemanaAtual(registros).length;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500', info: 'bg-blue-500' };
        toast.className = `${colors[type]} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    openSettings() { this.openModal('settings'); }

    async syncData() {
        this.showToast('Dados sincronizados localmente', 'success');
    }
}

// Create global app instance
const app = new ArtemisApp();

// Close modal on outside click
document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') app.closeModal();
});