// =============================================================================
// PROJETO DE ESTUDOS: Health Check (health-check.js) – Luminar PWA
// =============================================================================
// Este pequeno módulo executa uma verificação de integridade do ambiente
// da aplicação. É uma prática recomendada em PWAs: conferir se os
// pré-requisitos estão funcionando (banco de dados, Service Worker,
// armazenamento, bibliotecas carregadas) logo após a inicialização.
//
// Se algo crítico falhar, o health check avisa o usuário, ajudando a
// identificar problemas sem precisar abrir o DevTools.
//
// Conceitos presentes aqui:
//   - Acesso a APIs do navegador: IndexedDB, Service Worker, localStorage
//   - Verificação de existência de variáveis globais (db, Chart)
//   - Teste prático de gravação/leitura no localStorage
//   - Detecção de protocolo seguro (HTTPS) – PWAs exigem HTTPS ou localhost
//   - Uso de console.group para organizar logs no DevTools
// =============================================================================

// Aguarda o DOM estar completamente carregado antes de executar.
// Isso garante que o HTML, CSS e scripts já foram processados.
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay (1 segundo) para o app ter tempo de inicializar.
    // Assim, db, app e outros módulos já devem estar disponíveis.
    setTimeout(async () => {
        await runHealthCheck();
    }, 1000);
});

async function runHealthCheck() {
    // Coleta o status de cada componente do sistema
    const results = {
        indexedDB: checkIndexedDB(),
        serviceWorker: checkServiceWorker(),
        localStorage: checkLocalStorage(),
        chartJS: checkChartJS(),
        https: checkHTTPS()
    };
    
    // Exibe um bloco organizado no console (agrupado)
    console.group('🏥 Luminar Health Check');
    for (const [key, value] of Object.entries(results)) {
        console.log(`${value.ok ? '✅' : '❌'} ${key}: ${value.message}`);
    }
    console.groupEnd();
    
    // Se o banco de dados falhou, tenta mostrar um toast para o usuário.
    // Verifica se a instância global 'app' já existe e se showToast está disponível.
    if (!results.indexedDB.ok && typeof app !== 'undefined' && typeof app.showToast === 'function') {
        app.showToast('Banco de dados não inicializado. Recarregue a página.', 'error');
    }
}

// -------- Verificações individuais --------

function checkIndexedDB() {
    try {
        // Verifica se o objeto db (instância do LuminarDB) foi carregado
        if (typeof db === 'undefined') {
            return { ok: false, message: 'db não carregado' };
        }
        // Verifica se a conexão com o IndexedDB já foi estabelecida
        if (!db.db) {
            return { ok: false, message: 'IndexedDB aguardando inicialização...' };
        }
        return { ok: true, message: 'IndexedDB funcional' };
    } catch (e) {
        return { ok: false, message: `Erro: ${e.message}` };
    }
}

function checkServiceWorker() {
    // Primeiro, verifica se o navegador suporta Service Workers
    if (!('serviceWorker' in navigator)) {
        return { ok: false, message: 'Não suportado' };
    }
    // Verifica se há um Service Worker controlando a página atual
    const reg = navigator.serviceWorker.controller;
    return { 
        ok: !!reg, 
        message: reg ? 'SW ativo' : 'SW registrado (sem controle)' 
    };
}

function checkLocalStorage() {
    try {
        // Teste prático: tenta escrever e apagar um valor temporário
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        return { ok: true, message: 'OK' };
    } catch {
        // Pode falhar se estiver em modo anônimo, com cota excedida ou bloqueado
        return { ok: false, message: 'Bloqueado' };
    }
}

function checkChartJS() {
    // Chart.js é carregado via CDN e expõe a variável global Chart
    return { 
        ok: typeof Chart !== 'undefined', 
        message: typeof Chart !== 'undefined' ? 'Carregado' : 'Não encontrado' 
    };
}

function checkHTTPS() {
    // PWAs exigem HTTPS para funcionar (Service Worker, manifest etc.)
    // Exceto em localhost, que é permitido para desenvolvimento.
    const isSecure = window.location.protocol === 'https:' || 
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';
    return { 
        ok: isSecure, 
        message: isSecure ? 'Conexão segura' : 'HTTPS necessário' 
    };
}
