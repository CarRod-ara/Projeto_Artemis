// IndexedDB Database Manager for Luminar
// Zero external dependencies, works offline

class LuminarDB {
    constructor() {
        this.dbName = 'LuminarDB';
        this.dbVersion = 2;
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
                
                if (!db.objectStoreNames.contains('users')) {
                    const userStore = db.createObjectStore('users', { keyPath: 'id' });
                   userStore.createIndex('username', 'username', { unique: true });
              }

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
    async saveRegistro(registro, userId) {
    registro.userId = userId;
    return this.put('registros', registro);
}

async getRegistro(data, userId) {
    const all = await this.getAll('registros');
    return all.find(r => r.id === data && r.userId === userId);
}

async getAllRegistros(userId) {
    const all = await this.getAll('registros');
    return all.filter(r => r.userId === userId);
}

    async getRegistrosByDateRange(startDate, endDate, userId) {
    const all = await this.getAllRegistros(userId);
    return all.filter(r => r.data >= startDate && r.data <= endDate)
              .sort((a, b) => new Date(b.data) - new Date(a.data));
}

    // Specific methods for Fiados
    async getFiado(id) {
        return this.get('fiados', id);
    }

    async saveFiado(fiado, userId) {
    fiado.userId = userId;
    return this.put('fiados', fiado);
}

async getAllFiados(userId) {
    const all = await this.getAll('fiados');
    return all.filter(f => f.userId === userId);
}

async getFiadosAtivos(userId) {
    const all = await this.getAllFiados(userId);
    return all.filter(f => !f.pago);
}

async getFiadosVencidos(userId) {
    const ativos = await this.getFiadosAtivos(userId);
    const hoje = new Date().toISOString().split('T')[0];
    return ativos.filter(f => f.dataVencimento < hoje);
}

    // Config methods
    async getConfig(userId, key, defaultValue = null) {
    const compositeKey = `${userId}_${key}`;
    const result = await this.get('config', compositeKey);
    return result ? result.value : defaultValue;
}

async setConfig(userId, key, value) {
    const compositeKey = `${userId}_${key}`;
    return this.put('config', { key: compositeKey, userId, originalKey: key, value });
}

    //user methods
    async createUser(user) {
    return this.put('users', user);
}

async getUserByUsername(username) {
    const users = await this.getAll('users');
    return users.find(u => u.username === username);
}

async getAllUsers() {
    return this.getAll('users');
}


    // Initialize default config
   async initDefaultConfigForUser(userId) {
    const metas = await this.getConfig(userId, 'metas');
    if (metas) return;
    
    await this.setConfig(userId, 'user', { id: userId, name: 'Vendedor' });
    await this.setConfig(userId, 'metas', { survival: 110, comfortable: 150, ideal: 260 });
    await this.setConfig(userId, 'produtos', this.getDefaultProdutos());
    await this.setConfig(userId, 'regrasMix', this.getDefaultRegrasMix());
    await this.setConfig(userId, 'initialized', true);
    console.log('Default config initialized for user', userId);
}

        // Default products (based on your current catalog)
        getDefaultProdutos() {
    return [
        // Bolos
        { id: '101', categoria: 'bolos', nome: 'Chocolate', codigo: '101', preco: 8.00, unidade_base_id: '101', fator_conversao: 1 },
        { id: '102', categoria: 'bolos', nome: 'Cenoura', codigo: '102', preco: 8.00, unidade_base_id: '102', fator_conversao: 1 },
        { id: '103', categoria: 'bolos', nome: 'Coco', codigo: '103', preco: 8.00, unidade_base_id: '103', fator_conversao: 1 },
        { id: '104', categoria: 'bolos', nome: 'Amendoim', codigo: '104', preco: 8.00, unidade_base_id: '104', fator_conversao: 1 },
        
        // Brownies
        { id: '201', categoria: 'brownies', nome: 'Tradicional', codigo: '201', preco: 5.00, unidade_base_id: '201', fator_conversao: 1 },
        { id: '202', categoria: 'brownies', nome: 'Chocolate', codigo: '202', preco: 8.00, unidade_base_id: '202', fator_conversao: 1 },
        { id: '203', categoria: 'brownies', nome: 'Ninho', codigo: '203', preco: 8.00, unidade_base_id: '203', fator_conversao: 1 },
        { id: '204', categoria: 'brownies', nome: 'Beijinho', codigo: '204', preco: 8.00, unidade_base_id: '204', fator_conversao: 1 },
        { id: '205', categoria: 'brownies', nome: 'Prestígio', codigo: '205', preco: 8.00, unidade_base_id: '205', fator_conversao: 1 },
        { id: '206', categoria: 'brownies', nome: 'Choconinho', codigo: '206', preco: 8.00, unidade_base_id: '206', fator_conversao: 1 },
        { id: '207', categoria: 'brownies', nome: 'Amendoim Chocolate', codigo: '207', preco: 8.00, unidade_base_id: '207', fator_conversao: 1 },
        { id: '208', categoria: 'brownies', nome: 'Amendoim Ninho', codigo: '208', preco: 8.00, unidade_base_id: '208', fator_conversao: 1 },
        { id: '209', categoria: 'brownies', nome: 'Doce de Leite', codigo: '209', preco: 8.00, unidade_base_id: '209', fator_conversao: 1 },
        { id: '210', categoria: 'brownies', nome: 'Papai', codigo: '210', preco: 8.00, unidade_base_id: '210', fator_conversao: 1 },
        
        // Brigadeiros
        { id: '301', categoria: 'brigadeiros', nome: 'Avulso', codigo: '301', preco: 4.00, unidade_base_id: '301', fator_conversao: 1 },
        { id: '302', categoria: 'brigadeiros', nome: 'Caixa (4un)', codigo: '302', preco: 15.00, unidade_base_id: '301', fator_conversao: 4 },
        { id: '303', categoria: 'brigadeiros', nome: 'Cento Normal', codigo: '303', preco: 150.00, unidade_base_id: '301', fator_conversao: 100 },
        { id: '304', categoria: 'brigadeiros', nome: 'Cento Especial', codigo: '304', preco: 180.00, unidade_base_id: '301', fator_conversao: 100 },
        { id: '305', categoria: 'brigadeiros', nome: 'Caixa Jumbo (6un)', codigo: '305', preco: 20.00, unidade_base_id: '301', fator_conversao: 6 },
        
        // Mousses
        { id: '401', categoria: 'mousses', nome: 'Limão', codigo: '401', preco: 9.00, unidade_base_id: '401', fator_conversao: 1 },
        { id: '402', categoria: 'mousses', nome: 'Maracujá', codigo: '402', preco: 9.00, unidade_base_id: '402', fator_conversao: 1 },
        
        // Copos da Felicidade
        { id: '501', categoria: 'copos', nome: 'Morango', codigo: '501', preco: 18.00, unidade_base_id: '501', fator_conversao: 1 },
        { id: '502', categoria: 'copos', nome: 'Uva', codigo: '502', preco: 18.00, unidade_base_id: '502', fator_conversao: 1 },
        { id: '503', categoria: 'copos', nome: 'Duo', codigo: '503', preco: 18.00, unidade_base_id: '503', fator_conversao: 1 },
        
        // Sacolés Gourmet
        { id: '601', categoria: 'sacoles', nome: 'Chocolate com Ninho', codigo: '601', preco: 9.00, unidade_base_id: '601', fator_conversao: 1 },
        { id: '602', categoria: 'sacoles', nome: 'Maracujá', codigo: '602', preco: 9.00, unidade_base_id: '602', fator_conversao: 1 },
        { id: '603', categoria: 'sacoles', nome: 'Cookies and Cream', codigo: '603', preco: 9.00, unidade_base_id: '603', fator_conversao: 1 },
        { id: '604', categoria: 'sacoles', nome: 'Morango', codigo: '604', preco: 9.00, unidade_base_id: '604', fator_conversao: 1 },
        
        // Bebidas
        { id: '701', categoria: 'bebidas', nome: 'Coca-Cola Zero', codigo: '701', preco: 3.00, unidade_base_id: '701', fator_conversao: 1 },
        { id: '702', categoria: 'bebidas', nome: 'Pepsi Black', codigo: '702', preco: 3.00, unidade_base_id: '702', fator_conversao: 1 },
        { id: '703', categoria: 'bebidas', nome: 'Fanta Uva', codigo: '703', preco: 3.00, unidade_base_id: '703', fator_conversao: 1 },
        { id: '704', categoria: 'bebidas', nome: 'Coca Normal', codigo: '704', preco: 3.00, unidade_base_id: '704', fator_conversao: 1 },
        { id: '705', categoria: 'bebidas', nome: 'Fanta Laranja', codigo: '705', preco: 3.00, unidade_base_id: '705', fator_conversao: 1 },
        { id: '706', categoria: 'bebidas', nome: 'Sprite', codigo: '706', preco: 3.00, unidade_base_id: '706', fator_conversao: 1 },
        { id: '707', categoria: 'bebidas', nome: 'Pepsi Twist', codigo: '707', preco: 3.00, unidade_base_id: '707', fator_conversao: 1 },
        { id: '708', categoria: 'bebidas', nome: 'Del Valle Limão', codigo: '708', preco: 3.00, unidade_base_id: '708', fator_conversao: 1 },
        { id: '709', categoria: 'bebidas', nome: 'Del Valle Laranja', codigo: '709', preco: 3.00, unidade_base_id: '709', fator_conversao: 1 }
    ];
}

        // Default mix rules (you can customize these)
        getDefaultRegrasMix() {
    return [
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
        ];
    }


    // Export all data as JSON (for backup)
    async exportAllData(userId) {
    const data = {
        config: {},
        registros: await this.getAllRegistros(userId),
        fiados: await this.getAllFiados(userId),
        historico: await this.getAll('historico'), // se quiser filtrar depois
        exportDate: new Date().toISOString(),
        version: '1.0'
    };
    const allConfig = await this.getAll('config');
    const userConfigs = allConfig.filter(c => c.userId === userId);
    userConfigs.forEach(c => {
        data.config[c.originalKey] = c.value;
    });
    return data;
}

    // Import data from JSON
    async importAllData(jsonData, userId) {
    // Import config específica do usuário
    if (jsonData.config) {
        for (const [key, value] of Object.entries(jsonData.config)) {
            await this.setConfig(userId, key, value);
        }
    }
    // Import registros (assumindo que já têm userId ou forçando)
    if (jsonData.registros) {
        for (const registro of jsonData.registros) {
            registro.userId = userId;
            await this.saveRegistro(registro, userId);
        }
    }
    // Import fiados
    if (jsonData.fiados) {
        for (const fiado of jsonData.fiados) {
            fiado.userId = userId;
            await this.saveFiado(fiado, userId);
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
const db = new LuminarDB();
