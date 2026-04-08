// Health Check - Artemis PWA
// Executa apenas APÓS o app estar inicializado

document.addEventListener('DOMContentLoaded', () => {
    // Aguarda 1 segundo para o app inicializar
    setTimeout(async () => {
        await runHealthCheck();
    }, 1000);
});

async function runHealthCheck() {
    const results = {
        indexedDB: checkIndexedDB(),
        serviceWorker: checkServiceWorker(),
        localStorage: checkLocalStorage(),
        chartJS: checkChartJS(),
        https: checkHTTPS()
    };
    
    console.group('🏥 Artemis Health Check');
    for (const [key, value] of Object.entries(results)) {
        console.log(`${value.ok ? '✅' : '❌'} ${key}: ${value.message}`);
    }
    console.groupEnd();
    
    // Mostra warning se algo crítico falhar
    if (!results.indexedDB.ok && typeof app !== 'undefined' && typeof app.showToast === 'function') {
    app.showToast('Banco de dados não inicializado. Recarregue a página.', 'error');
}
}

function checkIndexedDB() {
    try {
        if (typeof db === 'undefined') {
            return { ok: false, message: 'db não carregado' };
        }
        if (!db.db) {
            return { ok: false, message: 'IndexedDB aguardando inicialização...' };
        }
        return { ok: true, message: 'IndexedDB funcional' };
    } catch (e) {
        return { ok: false, message: `Erro: ${e.message}` };
    }
}

function checkServiceWorker() {
    if (!('serviceWorker' in navigator)) {
        return { ok: false, message: 'Não suportado' };
    }
    const reg = navigator.serviceWorker.controller;
    return { 
        ok: !!reg, 
        message: reg ? 'SW ativo' : 'SW registrado (sem controle)' 
    };
}

function checkLocalStorage() {
    try {
        localStorage.setItem('test', '1');
        localStorage.removeItem('test');
        return { ok: true, message: 'OK' };
    } catch {
        return { ok: false, message: 'Bloqueado' };
    }
}

function checkChartJS() {
    return { 
        ok: typeof Chart !== 'undefined', 
        message: typeof Chart !== 'undefined' ? 'Carregado' : 'Não encontrado' 
    };
}

function checkHTTPS() {
    const isSecure = window.location.protocol === 'https:' || 
                    window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';
    return { 
        ok: isSecure, 
        message: isSecure ? 'Conexão segura' : 'HTTPS necessário' 
    };
}