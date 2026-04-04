// IndexedDB Database Manager for Artemis
// Zero external dependencies, works offline

class ArtemisDB {
    constructor() {
        this.dbName = 'ArtemisDB';
        this.dbVersion = 1;
        this.db = null;
    }

    // Initialize database
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                console.log('Database initialized');
                resolve(this.db);
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store: Config (user settings, products, rules)
                if (!db.objectStoreNames.contains('config')) {
                    const configStore = db.createObjectStore('config', { keyPath: 'key' });
                    configStore.createIndex('key', 'key', { unique: true });
                }
                
                // Store: Registros (daily sales records)
                if (!db.objectStoreNames.contains('registros')) {
                    const regStore = db.createObjectStore('registros', { keyPath: 'id' });
                    regStore.createIndex('data', 'data', { unique: false });
                    regStore.createIndex('diaSemana', 'diaSemana', { unique: false });
                }
                
                // Store: Fiados (debts)
                if (!db.objectStoreNames.contains('fiados')) {
                    const fiadoStore = db.createObjectStore('fiados', { keyPath: 'id' });
                    fiadoStore.createIndex('clienteNome', 'clienteNome', { unique: false });
                    fiadoStore.createIndex('pago', 'pago', { unique: false });
                    fiadoStore.createIndex('dataEmprestimo', 'dataEmprestimo', { unique: false });
                }
                
                // Store: Historico (for ML/training data)
                if (!db.objectStoreNames.contains('historico')) {
                    const histStore = db.createObjectStore('historico', { keyPath: 'id' });
                    histStore.createIndex('data', 'data', { unique: false });
                }
                
                console.log('Database schema created');
            };
        });
    }

    // Generic CRUD operations
    async get(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(key);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async put(storeName, data) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async delete(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(key);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // Specific methods for Registros
    async getRegistro(data) {
        return this.get('registros', data);
    }

    async saveRegistro(registro) {
        return this.put('registros', registro);
    }

    async getAllRegistros() {
        return this.getAll('registros');
    }

    async getRegistrosByDateRange(startDate, endDate) {
        const all = await this.getAllRegistros();
        return all.filter(r => r.data >= startDate && r.data <= endDate)
                  .sort((a, b) => new Date(b.data) - new Date(a.data));
    }

    // Specific methods for Fiados
    async getFiado(id) {
        return this.get('fiados', id);
    }

    async saveFiado(fiado) {
        return this.put('fiados', fiado);
    }

    async getAllFiados() {
        return this.getAll('fiados');
    }

    async getFiadosAtivos() {
        const all = await this.getAllFiados();
        return all.filter(f => !f.pago).sort((a, b) => new Date(a.dataVencimento) - new Date(b.dataVencimento));
    }

    async getFiadosVencidos() {
        const ativos = await this.getFiadosAtivos();
        const hoje = new Date().toISOString().split('T')[0];
        return ativos.filter(f => f.dataVencimento < hoje);
    }

    // Config methods
    async getConfig(key, defaultValue = null) {
        const result = await this.get('config', key);
        return result ? result.value : defaultValue;
    }

    async setConfig(key, value) {
        return this.put('config', { key, value });
    }

    // Initialize default config
    async initDefaultConfig() {
        const existing = await this.getConfig('initialized');
        if (existing) return;

        // Default user
        await this.setConfig('user', {
            id: 'meph',
            name: 'Meph',
            email: ''
        });

        // Default metas
        await this.setConfig('metas', {
            survival: 110,
            comfortable: 150,
            ideal: 260
        });

        // Default products (based on your current catalog)
        await this.setConfig('produtos', [
            // Bolos
            { id: '101', categoria: 'bolos', nome: 'Chocolate', codigo: '101', preco: 5.00 },
            { id: '102', categoria: 'bolos', nome: 'Cenoura', codigo: '102', preco: 5.00 },
            { id: '103', categoria: 'bolos', nome: 'Coco', codigo: '103', preco: 5.00 },
            { id: '104', categoria: 'bolos', nome: 'Amendoim', codigo: '104', preco: 5.00 },
            
            // Brownies
            { id: '201', categoria: 'brownies', nome: 'Tradicional', codigo: '201', preco: 6.00 },
            { id: '202', categoria: 'brownies', nome: 'Chocolate', codigo: '202', preco: 6.00 },
            { id: '203', categoria: 'brownies', nome: 'Ninho', codigo: '203', preco: 6.00 },
            { id: '204', categoria: 'brownies', nome: 'Beijinho', codigo: '204', preco: 6.00 },
            { id: '205', categoria: 'brownies', nome: 'Prestígio', codigo: '205', preco: 6.00 },
            { id: '206', categoria: 'brownies', nome: 'Choconinho', codigo: '206', preco: 6.00 },
            { id: '207', categoria: 'brownies', nome: 'Amendoim Chocolate', codigo: '207', preco: 6.00 },
            { id: '208', categoria: 'brownies', nome: 'Amendoim Ninho', codigo: '208', preco: 6.00 },
            { id: '209', categoria: 'brownies', nome: 'Doce de Leite', codigo: '209', preco: 6.00 },
            { id: '210', categoria: 'brownies', nome: 'Papai', codigo: '210', preco: 6.00 },
            
            // Brigadeiros
            { id: '301', categoria: 'brigadeiros', nome: 'Avulso', codigo: '301', preco: 1.00 },
            { id: '302', categoria: 'brigadeiros', nome: 'Caixa (10un)', codigo: '302', preco: 10.00 },
            { id: '303', categoria: 'brigadeiros', nome: 'Cento Normal', codigo: '303', preco: 80.00 },
            { id: '304', categoria: 'brigadeiros', nome: 'Cento Especial', codigo: '304', preco: 100.00 },
            { id: '305', categoria: 'brigadeiros', nome: 'Caixa Jumbo', codigo: '305', preco: 15.00 },
            
            // Mousses
            { id: '401', categoria: 'mousses', nome: 'Limão', codigo: '401', preco: 8.00 },
            { id: '402', categoria: 'mousses', nome: 'Maracujá', codigo: '402', preco: 8.00 },
            
            // Copos da Felicidade
            { id: '501', categoria: 'copos', nome: 'Morango', codigo: '501', preco: 12.00 },
            { id: '502', categoria: 'copos', nome: 'Uva', codigo: '502', preco: 12.00 },
            { id: '503', categoria: 'copos', nome: 'Duo', codigo: '503', preco: 15.00 },
            
            // Sacolés
            { id: '601', categoria: 'sacoles', nome: 'Chocolate com Ninho', codigo: '601', preco: 5.00 },
            { id: '602', categoria: 'sacoles', nome: 'Maracujá', codigo: '602', preco: 5.00 },
            { id: '603', categoria: 'sacoles', nome: 'Cookies and Cream', codigo: '603', preco: 5.00 },
            { id: '604', categoria: 'sacoles', nome: 'Morango', codigo: '604', preco: 5.00 },
            
            // Bebidas
            { id: '701', categoria: 'bebidas', nome: 'Coca-Cola Zero', codigo: '701', preco: 6.00 },
            { id: '702', categoria: 'bebidas', nome: 'Pepsi Black', codigo: '702', preco: 6.00 },
            { id: '703', categoria: 'bebidas', nome: 'Fanta Uva', codigo: '703', preco: 6.00 },
            { id: '704', categoria: 'bebidas', nome: 'Coca Normal', codigo: '704', preco: 6.00 },
            { id: '705', categoria: 'bebidas', nome: 'Fanta Laranja', codigo: '705', preco: 6.00 },
            { id: '706', categoria: 'bebidas', nome: 'Sprite', codigo: '706', preco: 6.00 },
            { id: '707', categoria: 'bebidas', nome: 'Pepsi Twist', codigo: '707', preco: 6.00 },
            { id: '708', categoria: 'bebidas', nome: 'Del Valle Limão', codigo: '708', preco: 5.00 },
            { id: '709', categoria: 'bebidas', nome: 'Del Valle Laranja', codigo: '709', preco: 5.00 }
        ]);

        // Default mix rules (you can customize these)
        await this.setConfig('regrasMix', [
            {
                id: 'regra-1',
                nome: 'Chuva Forte - Reduzir Sacolés',
                condicoes: { clima: ['chuva', 'tempestade'] },
                acoes: [
                    { produtoId: '601', fator: 0.2, minimo: 0 },
                    { produtoId: '602', fator: 0.2, minimo: 0 },
                    { produtoId: '603', fator: 0.2, minimo: 0 },
                    { produtoId: '604', fator: 0.2, minimo: 0 }
                ],
                ativa: true
            },
            {
                id: 'regra-2',
                nome: 'Calor - Aumentar Sacolés',
                condicoes: { temperaturaMin: 30 },
                acoes: [
                    { produtoId: '601', fator: 1.5 },
                    { produtoId: '602', fator: 1.5 },
                    { produtoId: '603', fator: 1.5 },
                    { produtoId: '604', fator: 1.5 }
                ],
                ativa: true
            },
            {
                id: 'regra-3',
                nome: 'Segunda-feira - Dia Fraco',
                condicoes: { diaSemana: ['seg'] },
                acoes: [
                    { produtoId: '101', fator: 0.7 },
                    { produtoId: '102', fator: 0.7 },
                    { produtoId: '103', fator: 0.7 },
                    { produtoId: '104', fator: 0.7 },
                    { produtoId: '201', fator: 0.8 },
                    { produtoId: '202', fator: 0.8 }
                ],
                ativa: true
            },
            {
                id: 'regra-4',
                nome: 'Sexta-feira - Dia Forte',
                condicoes: { diaSemana: ['sex'] },
                acoes: [
                    { produtoId: '302', fator: 1.3 },
                    { produtoId: '305', fator: 1.3 },
                    { produtoId: '301', fator: 1.2 }
                ],
                ativa: true
            }
        ]);

        await this.setConfig('initialized', true);
        console.log('Default config initialized');
    }

    // Export all data as JSON (for backup)
    async exportAllData() {
        const data = {
            config: {},
            registros: await this.getAllRegistros(),
            fiados: await this.getAllFiados(),
            historico: await this.getAll('historico'),
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        
        // Get all config keys
        const allConfig = await this.getAll('config');
        allConfig.forEach(c => {
            data.config[c.key] = c.value;
        });
        
        return data;
    }

    // Import data from JSON
    async importAllData(jsonData) {
        // Clear existing data
        const stores = ['config', 'registros', 'fiados', 'historico'];
        for (const storeName of stores) {
            const all = await this.getAll(storeName);
            for (const item of all) {
                await this.delete(storeName, item.id || item.key);
            }
        }
        
        // Import config
        if (jsonData.config) {
            for (const [key, value] of Object.entries(jsonData.config)) {
                await this.setConfig(key, value);
            }
        }
        
        // Import registros
        if (jsonData.registros) {
            for (const registro of jsonData.registros) {
                await this.saveRegistro(registro);
            }
        }
        
        // Import fiados
        if (jsonData.fiados) {
            for (const fiado of jsonData.fiados) {
                await this.saveFiado(fiado);
            }
        }
        
        // Import historico
        if (jsonData.historico) {
            for (const hist of jsonData.historico) {
                await this.put('historico', hist);
            }
        }
        
        return true;
    }
}

// Create global instance
const db = new ArtemisDB();
