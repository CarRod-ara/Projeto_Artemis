// =============================================================================
// PROJETO DE ESTUDOS: Serviço de Clima (weather.js) – Luminar PWA
// =============================================================================
// Este módulo integra a aplicação com a API gratuita Open-Meteo, que fornece
// previsão do tempo sem exigir chave de API. Ele também implementa:
//
//   • Cache local (localStorage) com duração configurável (30 min)
//   • Fallback offline (dados padrão quando não há internet)
//   • Conversão de códigos meteorológicos WMO para ícones e categorias
//   • Geocodificação (via Open-Meteo e Nominatim) para coordenadas
//   • Cálculo de impacto do clima nas vendas (usado pelo motor de mix)
//
// É um bom exemplo de como trabalhar com APIs externas de forma resiliente.
// =============================================================================

class WeatherService {
    constructor() {
        this.baseUrl = 'https://api.open-meteo.com/v1';
        this.geocodingUrl = 'https://geocoding-api.open-meteo.com/v1';
        this.cacheKey = 'weatherCache';
        this.cacheDuration = 30 * 60 * 1000; // 30 minutos
    }

    // ========== OBTENÇÃO DE CLIMA ==========
    // Busca clima atual e previsão para 3 dias. Usa cache para reduzir
    // chamadas à API e tem fallback completo para funcionamento offline.
    async getWeather(latitude = -22.9455, longitude = -43.3627) {
        try {
            // Verifica cache antes de chamar a API
            const cached = this.getCachedWeather();
            if (cached) {
                console.log('Using cached weather data');
                return cached;
            }

            const url = `${this.baseUrl}/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=America/Sao_Paulo&forecast_days=3`;
            
            const response = await fetch(url);
            if (!response.ok) throw new Error('Weather API error');
            
            const data = await response.json();
            const processed = this.processWeatherData(data);
            
            // Salva no cache local
            this.cacheWeather(processed);
            
            return processed;
        } catch (error) {
            console.error('Weather fetch error:', error);
            // Se falhar, tenta usar cache mesmo vencido
            const cached = this.getCachedWeather(true);
            if (cached) return cached;
            
            // Fallback final: dados inventados para não quebrar a aplicação
            return this.getFallbackWeather();
        }
    }

    // ========== PROCESSAMENTO DOS DADOS ==========
    // Transforma o JSON da API em um formato mais amigável para o resto da app.
    processWeatherData(data) {
        const current = data.current;
        const daily = data.daily;
        
        return {
            current: {
                temperature: current.temperature_2m,
                humidity: current.relative_humidity_2m,
                condition: this.getWeatherCondition(current.weather_code),
                conditionCode: current.weather_code,
                timestamp: new Date().toISOString()
            },
            forecast: daily.time.map((date, index) => ({
                date: date,
                maxTemp: daily.temperature_2m_max[index],
                minTemp: daily.temperature_2m_min[index],
                condition: this.getWeatherCondition(daily.weather_code[index]),
                conditionCode: daily.weather_code[index]
            })),
            source: 'Open-Meteo',
            cached: false
        };
    }

    // ========== CONVERSÃO DE CÓDIGO WMO ==========
    // Mapeia os códigos padronizados da OMM para nome, ícone e categoria.
    getWeatherCondition(code) {
        const conditions = {
            0: { name: 'Céu limpo', icon: '☀️', category: 'sol' },
            1: { name: 'Principalmente limpo', icon: '🌤️', category: 'sol' },
            2: { name: 'Parcialmente nublado', icon: '⛅', category: 'nublado' },
            3: { name: 'Nublado', icon: '☁️', category: 'nublado' },
            45: { name: 'Nevoeiro', icon: '🌫️', category: 'nublado' },
            48: { name: 'Nevoeiro com geada', icon: '🌫️', category: 'nublado' },
            51: { name: 'Chuvisco leve', icon: '🌦️', category: 'chuva' },
            53: { name: 'Chuvisco moderado', icon: '🌦️', category: 'chuva' },
            55: { name: 'Chuvisco intenso', icon: '🌧️', category: 'chuva' },
            61: { name: 'Chuva leve', icon: '🌧️', category: 'chuva' },
            63: { name: 'Chuva moderada', icon: '🌧️', category: 'chuva' },
            65: { name: 'Chuva forte', icon: '⛈️', category: 'chuva' },
            71: { name: 'Neve leve', icon: '🌨️', category: 'chuva' },
            73: { name: 'Neve moderada', icon: '🌨️', category: 'chuva' },
            75: { name: 'Neve forte', icon: '❄️', category: 'chuva' },
            80: { name: 'Pancadas de chuva leves', icon: '🌦️', category: 'chuva' },
            81: { name: 'Pancadas de chuva moderadas', icon: '🌧️', category: 'chuva' },
            82: { name: 'Pancadas de chuva fortes', icon: '⛈️', category: 'tempestade' },
            95: { name: 'Tempestade', icon: '⛈️', category: 'tempestade' },
            96: { name: 'Tempestade com granizo', icon: '⛈️', category: 'tempestade' },
            99: { name: 'Tempestade com granizo forte', icon: '⛈️', category: 'tempestade' }
        };
        
        return conditions[code] || { name: 'Desconhecido', icon: '❓', category: 'nublado' };
    }

    // ========== CONTROLE DE CACHE ==========
    cacheWeather(data) {
        const cacheData = {
            data: data,
            timestamp: Date.now()
        };
        localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
    }

    getCachedWeather(ignoreExpiry = false) {
        try {
            const cached = localStorage.getItem(this.cacheKey);
            if (!cached) return null;
            
            const cacheData = JSON.parse(cached);
            const age = Date.now() - cacheData.timestamp;
            
            if (!ignoreExpiry && age > this.cacheDuration) return null;
            
            cacheData.data.cached = true;
            cacheData.data.cacheAge = Math.round(age / 60000); // idade em minutos
            return cacheData.data;
        } catch (e) {
            return null;
        }
    }

    // Fallback usado quando não há internet nem cache disponível.
    getFallbackWeather() {
        return {
            current: {
                temperature: 25,
                humidity: 60,
                condition: { name: 'Dados offline', icon: '📡', category: 'nublado' },
                conditionCode: -1,
                timestamp: new Date().toISOString()
            },
            forecast: [],
            source: 'Offline',
            cached: true,
            offline: true
        };
    }

    // ========== GEOLOCALIZAÇÃO ==========
    // Busca coordenadas de uma cidade usando a API de geocodificação do Open-Meteo.
    async searchCity(query) {
        try {
            const url = `${this.geocodingUrl}/search?name=${encodeURIComponent(query)}&count=5&language=pt&format=json`;
            const response = await fetch(url);
            if (!response.ok) throw new Error('Geocoding error');
            
            const data = await response.json();
            return data.results || [];
        } catch (error) {
            console.error('City search error:', error);
            return [];
        }
    }

    // Alternativa usando Nominatim (OpenStreetMap), caso o Open-Meteo não encontre.
    async buscarCoordenadas(cidade) {
        try {
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade)}&format=json&limit=1`;
            const response = await fetch(url);
            const data = await response.json();
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lon: parseFloat(data[0].lon)
                };
            }
        } catch (e) {
            console.error("Erro ao buscar coordenadas:", e);
        }
        return null;
    }

    // ========== IMPACTO DO CLIMA NAS VENDAS ==========
    // Retorna fatores de ajuste por categoria de produto com base no clima.
    // Ex.: calor aumenta sacolés e bebidas; chuva reduz drasticamente.
    getWeatherImpact(weather) {
        const condition = weather.current.condition.category;
        const temp = weather.current.temperature;
        
        const impacts = {
            sol: { sacoles: 1.3, bebidas: 1.2, brigadeiros: 1.0, bolos: 1.0 },
            nublado: { sacoles: 1.0, bebidas: 0.9, brigadeiros: 1.0, bolos: 1.0 },
            chuva: { sacoles: 0.3, bebidas: 0.7, brigadeiros: 1.1, bolos: 0.9 },
            tempestade: { sacoles: 0.2, bebidas: 0.5, brigadeiros: 1.2, bolos: 0.8 }
        };
        
        let impact = impacts[condition] || impacts.nublado;
        
        // Ajustes adicionais pela temperatura
        if (temp >= 30) {
            impact.sacoles *= 1.3;
            impact.bebidas *= 1.2;
        } else if (temp <= 20) {
            impact.sacoles *= 0.7;
            impact.bebidas *= 0.8;
        }
        
        return impact;
    }
}

// Instância global usada em toda a aplicação
const weather = new WeatherService();
