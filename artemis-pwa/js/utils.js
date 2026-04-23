// =============================================================================
// PROJETO DE ESTUDOS: Utilitários (utils.js) – Luminar PWA
// =============================================================================
// Este arquivo reúne funções auxiliares usadas em toda a aplicação,
// divididas em dois grupos principais:
//
//   SecurityUtils: ferramentas para evitar vulnerabilidades (XSS) e lidar
//                  com dados de forma segura.
//   FormatUtils:   formatação de moeda, datas e tempo relativo.
//
// São pequenas funções puras (sem efeitos colaterais) que encapsulam
// práticas defensivas comuns em PWAs.
// =============================================================================

const SecurityUtils = {
    // Previne ataques XSS (Cross-Site Scripting) ao inserir texto
    // vindo do usuário no HTML. Força o tratamento como texto, não HTML.
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;   // Escapa automaticamente <, >, ", etc.
        return div.innerHTML;
    },
    
    // Prepara texto para exportação Markdown, removendo caracteres
    // que poderiam quebrar a sintaxe do Obsidian.
    sanitizeForMarkdown(text) {
        return String(text || '')
            .replace(/"/g, '\\"')      // Escapa aspas duplas
            .replace(/\n/g, ' ')       // Remove quebras de linha
            .replace(/[<>]/g, '')      // Remove < e > (evita conflitos)
            .trim();
    },
    
    // Converte valor para número com fallback seguro.
    // Retorna o fallback se o valor não for um número válido ou for negativo.
    safeNumber(value, fallback = 0) {
        const num = parseFloat(value);
        return (isNaN(num) || num < 0) ? fallback : num;
    },
    
    // Valida formato de e-mail (básico, não exaustivo)
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    
    // Gera um identificador único combinando timestamp e string aleatória.
    // O prefixo opcional ajuda a identificar o tipo de entidade (ex: "fiado_").
    generateId(prefix = '') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    // Função debounce: limita a execução de uma função a cada X milissegundos.
    // Útil para evitar chamadas excessivas em eventos como digitação (input).
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
};

// ========== UTILITÁRIOS DE FORMATAÇÃO ==========
const FormatUtils = {
    // Formata valor numérico como moeda brasileira (R$).
    // Usa Intl.NumberFormat, que é nativo e faz a formatação correta.
    currency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value || 0);
    },
    
    // Formata uma data ISO (ou yyyy-mm-dd) para o formato brasileiro.
    // O "+T12:00:00" evita problemas de fuso horário ao criar a data.
    date(dateStr) {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
    },
    
    // Retorna uma string de tempo relativo (ex: "Hoje", "Ontem", "3 dias atrás").
    relativeTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Hoje';
        if (days === 1) return 'Ontem';
        if (days < 7) return `${days} dias atrás`;
        return this.date(dateStr);  // Para mais de 7 dias, mostra data completa
    }
};

// Torna as utilidades acessíveis globalmente (a aplicação as usa sem import)
window.SecurityUtils = SecurityUtils;
window.FormatUtils = FormatUtils;
