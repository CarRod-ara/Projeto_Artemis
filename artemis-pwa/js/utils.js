// js/utils.js
const SecurityUtils = {
    // Previne XSS
    escapeHtml(text) {
        if (typeof text !== 'string') return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },
    
    // Sanitiza para Markdown
    sanitizeForMarkdown(text) {
        return String(text || '')
            .replace(/"/g, '\\"')
            .replace(/\n/g, ' ')
            .replace(/[<>]/g, '')
            .trim();
    },
    
    // Valida números
    safeNumber(value, fallback = 0) {
        const num = parseFloat(value);
        return (isNaN(num) || num < 0) ? fallback : num;
    },
    
    // Valida email
    isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    },
    
    // Gera ID único seguro
    generateId(prefix = '') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },
    
    // Debounce para inputs
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

// Formato de moeda
const FormatUtils = {
    currency(value) {
        return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
        }).format(value || 0);
    },
    
    date(dateStr) {
        return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR');
    },
    
    relativeTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        
        if (days === 0) return 'Hoje';
        if (days === 1) return 'Ontem';
        if (days < 7) return `${days} dias atrás`;
        return this.date(dateStr);
    }
};

// Exportar globalmente
window.SecurityUtils = SecurityUtils;
window.FormatUtils = FormatUtils;