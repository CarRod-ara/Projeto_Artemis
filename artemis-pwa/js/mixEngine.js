// Mix Suggestion Engine for Artemis
// Combines user-defined rules with historical data

class MixEngine {
    constructor() {
        this.defaultMix = {
            '101': 4, '102': 2, '103': 2, '104': 2,  // Bolos
            '201': 3, '202': 3, '203': 2, '204': 2, '205': 2,  // Brownies
            '301': 10, '302': 2, '305': 1,  // Brigadeiros
            '401': 2, '402': 2,  // Mousses
            '501': 1, '502': 1, '503': 1,  // Copos
            '601': 4, '602': 4, '603': 2, '604': 2,  // Sacolés
            '701': 1, '702': 1, '704': 1, '705': 1, '708': 1, '709': 1  // Bebidas
        };
    }

    // Main method: generate mix suggestion
    async generateSuggestion(context) {
        const { data, diaSemana, clima, temperatura, produtos, regras } = context;
        
        // Start with default mix
        let suggestedMix = { ...this.defaultMix };
        
        // Apply user-defined rules
        suggestedMix = this.applyRules(suggestedMix, {
            clima: clima?.condition?.category,
            diaSemana: this.getDiaSemanaAbrev(diaSemana),
            temperatura: temperatura,
            periodoMes: this.getPeriodoMes(data)
        }, regras);
        
        // Apply weather impact
        if (clima) {
            suggestedMix = this.applyWeatherImpact(suggestedMix, clima);
        }
        
        // Apply historical adjustments (if we have enough data)
        const historico = await db.getAllRegistros();
        if (historico.length >= 7) {
            suggestedMix = await this.applyHistoricalData(suggestedMix, {
                diaSemana,
                clima: clima?.condition?.category
            }, historico);
        }
        
        // Round values and ensure minimums
        suggestedMix = this.finalizeMix(suggestedMix);
        
        return {
            mix: suggestedMix,
            explicacao: this.generateExplanation(context, suggestedMix),
            totalItens: Object.values(suggestedMix).reduce((a, b) => a + b, 0),
            estimativaFaturamento: this.estimateRevenue(suggestedMix, produtos)
        };
    }

    // Apply user-defined rules
    applyRules(mix, contexto, regras) {
        if (!regras || !Array.isArray(regras)) return mix;
        
        const newMix = { ...mix };
        
        for (const regra of regras) {
            if (!regra.ativa) continue;
            
            // Check if rule conditions match
            if (this.matchesConditions(regra.condicoes, contexto)) {
                // Apply rule actions
                for (const acao of regra.acoes) {
                    if (newMix[acao.produtoId] !== undefined) {
                        const valorAtual = newMix[acao.produtoId];
                        let novoValor = Math.round(valorAtual * acao.fator);
                        
                        // Apply min/max constraints
                        if (acao.minimo !== undefined) {
                            novoValor = Math.max(novoValor, acao.minimo);
                        }
                        if (acao.maximo !== undefined) {
                            novoValor = Math.min(novoValor, acao.maximo);
                        }
                        
                        newMix[acao.produtoId] = novoValor;
                    }
                }
            }
        }
        
        return newMix;
    }

    // Check if context matches rule conditions
    matchesConditions(condicoes, contexto) {
        // Check clima
        if (condicoes.clima && condicoes.clima.length > 0) {
            if (!condicoes.clima.includes(contexto.clima)) return false;
        }
        
        // Check dia da semana
        if (condicoes.diaSemana && condicoes.diaSemana.length > 0) {
            if (!condicoes.diaSemana.includes(contexto.diaSemana)) return false;
        }
        
        // Check temperatura
        if (condicoes.temperaturaMin !== undefined) {
            if (contexto.temperatura < condicoes.temperaturaMin) return false;
        }
        if (condicoes.temperaturaMax !== undefined) {
            if (contexto.temperatura > condicoes.temperaturaMax) return false;
        }
        
        // Check periodo do mes
        if (condicoes.periodoMes && condicoes.periodoMes.length > 0) {
            if (!condicoes.periodoMes.includes(contexto.periodoMes)) return false;
        }
        
        return true;
    }

    // Apply weather-based adjustments
    applyWeatherImpact(mix, clima) {
        const impact = weather.getWeatherImpact(clima);
        const newMix = { ...mix };
        
        // Apply category-level impacts
        for (const [produtoId, quantidade] of Object.entries(newMix)) {
            const categoria = this.getCategoriaFromId(produtoId);
            if (impact[categoria]) {
                newMix[produtoId] = Math.round(quantidade * impact[categoria]);
            }
        }
        
        return newMix;
    }

    // Apply historical data adjustments
    async applyHistoricalData(mix, contexto, historico) {
        const newMix = { ...mix };
        
        // Filter similar days (same day of week, similar weather)
        const diasSimilares = historico.filter(h => {
            const mesmoDia = h.diaSemana === contexto.diaSemana;
            const climaSimilar = !contexto.clima || 
                (h.clima && h.clima.real && h.clima.real.condicao === contexto.clima);
            return mesmoDia && (climaSimilar || historico.length < 30);
        });
        
        if (diasSimilares.length < 3) return newMix;
        
        // Calculate average efficiency per product
        const eficienciaPorProduto = {};
        
        for (const dia of diasSimilares) {
            if (!dia.itensVendidos) continue;
            
            for (const item of dia.itensVendidos) {
                if (!eficienciaPorProduto[item.codigo]) {
                    eficienciaPorProduto[item.codigo] = { total: 0, count: 0 };
                }
                const eficiencia = item.levado > 0 ? item.vendido / item.levado : 0;
                eficienciaPorProduto[item.codigo].total += eficiencia;
                eficienciaPorProduto[item.codigo].count++;
            }
        }
        
        // Adjust mix based on efficiency
        for (const [produtoId, efData] of Object.entries(eficienciaPorProduto)) {
            if (efData.count < 2) continue;
            
            const eficienciaMedia = efData.total / efData.count;
            
            // If efficiency > 90%, increase by 10%
            // If efficiency < 50%, decrease by 20%
            if (eficienciaMedia > 0.9) {
                newMix[produtoId] = Math.round(newMix[produtoId] * 1.1);
            } else if (eficienciaMedia < 0.5) {
                newMix[produtoId] = Math.round(newMix[produtoId] * 0.8);
            }
        }
        
        return newMix;
    }

    // Finalize mix (round, ensure minimums)
    finalizeMix(mix) {
        const finalized = {};
        
        for (const [produtoId, quantidade] of Object.entries(mix)) {
            // Round to integer
            let valor = Math.round(quantidade);
            
            // Ensure non-negative
            valor = Math.max(0, valor);
            
            // Minimum 1 for products that exist in default mix
            if (this.defaultMix[produtoId] && valor === 0 && this.defaultMix[produtoId] > 0) {
                valor = 1; // Keep at least 1 for testing
            }
            
            finalized[produtoId] = valor;
        }
        
        return finalized;
    }

    // Generate human-readable explanation
    generateExplanation(contexto, mix) {
        const partes = [];
        
        // Weather explanation
        if (contexto.clima) {
            const condicao = contexto.clima.current.condition;
            partes.push(`Clima: ${condicao.name} ${condicao.icon} (${contexto.clima.current.temperature}°C)`);
        }
        
        // Day of week
        partes.push(`Dia: ${contexto.diaSemana}`);
        
        // Key adjustments
        const ajustes = [];
        
        // Check for significant changes from default
        for (const [produtoId, quantidade] of Object.entries(mix)) {
            const padrao = this.defaultMix[produtoId] || 0;
            if (quantidade !== padrao) {
                const diff = quantidade - padrao;
                const nome = this.getNomeProduto(produtoId);
                if (Math.abs(diff) >= 2) {
                    ajustes.push(`${diff > 0 ? '+' : ''}${diff} ${nome}`);
                }
            }
        }
        
        if (ajustes.length > 0) {
            partes.push(`Ajustes: ${ajustes.join(', ')}`);
        }
        
        return partes.join(' | ');
    }

    // Estimate potential revenue
    estimateRevenue(mix, produtos) {
        let total = 0;
        
        for (const [produtoId, quantidade] of Object.entries(mix)) {
            const produto = produtos.find(p => p.id === produtoId);
            if (produto && quantidade > 0) {
                // Assume 80% sell-through rate for estimation
                total += produto.preco * quantidade * 0.8;
            }
        }
        
        return Math.round(total);
    }

    // Helper: Get category from product ID
    getCategoriaFromId(id) {
        const prefix = id.charAt(0);
        const map = {
            '1': 'bolos',
            '2': 'brownies',
            '3': 'brigadeiros',
            '4': 'mousses',
            '5': 'copos',
            '6': 'sacoles',
            '7': 'bebidas'
        };
        return map[prefix] || 'outros';
    }

    // Helper: Get product name from ID
    getNomeProduto(id) {
        const nomes = {
            '101': 'Bolo Choc', '102': 'Bolo Cen', '103': 'Bolo Coco', '104': 'Bolo Amendoim',
            '201': 'Brownie Trad', '202': 'Brownie Choc', '203': 'Brownie Ninho',
            '301': 'Brig Avulso', '302': 'Brig Caixa', '305': 'Brig Jumbo',
            '401': 'Mousse Limão', '402': 'Mousse Maracujá',
            '501': 'Copo Morango', '502': 'Copo Uva', '503': 'Copo Duo',
            '601': 'Sacolé Choc/Ninho', '602': 'Sacolé Maracujá',
            '701': 'Coca Zero', '704': 'Coca Normal'
        };
        return nomes[id] || `Produto ${id}`;
    }

    // Helper: Get abbreviated day of week
    getDiaSemanaAbrev(dia) {
        const map = {
            'domingo': 'dom', 'segunda-feira': 'seg', 'terça-feira': 'ter',
            'quarta-feira': 'qua', 'quinta-feira': 'qui', 'sexta-feira': 'sex', 'sábado': 'sab'
        };
        return map[dia?.toLowerCase()] || '';
    }

    // Helper: Get period of month
    getPeriodoMes(dataStr) {
        const dia = parseInt(dataStr?.split('-')[2] || '15');
        if (dia <= 10) return 'inicio';
        if (dia <= 20) return 'meio';
        return 'fim';
    }
}

// Create global instance
const mixEngine = new MixEngine();
