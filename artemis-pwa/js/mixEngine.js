// Mix Suggestion Engine for Artemis
// Combines user-defined rules with historical data

class MixEngine {
  constructor() {
    this.defaultMix = {
      101: 4,
      102: 2,
      103: 2,
      104: 2, // Bolos
      201: 3,
      202: 3,
      203: 2,
      204: 2,
      205: 2, // Brownies
      301: 0,
      302: 3,
      305: 2, // Brigadeiros (avulso 0, caixas)
      401: 2,
      402: 2, // Mousses
      501: 1,
      502: 1,
      503: 1, // Copos
      601: 4,
      602: 4,
      603: 2,
      604: 2, // Sacolés
      701: 1,
      702: 1,
      704: 1,
      705: 1,
      708: 1,
      709: 1, // Bebidas
    };
  }

  // Main method: generate mix suggestion
  async generateSuggestion(context) {
    const { data, diaSemana, clima, temperatura, produtos, regras } = context;
    this.produtos = produtos; // guarda referência para uso nos helpers
    
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
    
    // 🔥 NOVA LÓGICA: Converte para unidades base, ajusta eficiência e converte de volta
    // 1. Converter mix atual para unidades base equivalentes
    const mixEmUnidadesBase = {};
    for (const [id, qtd] of Object.entries(suggestedMix)) {
        const produto = produtos.find(p => p.id === id);
        if (!produto) continue;
        const baseId = produto.unidade_base_id || id;
        const fator = produto.fator_conversao || 1;
        mixEmUnidadesBase[baseId] = (mixEmUnidadesBase[baseId] || 0) + qtd * fator;
    }
    
    // 2. Ajustar cada unidade base com eficiência histórica
    if (historico.length >= 7) {
        for (const [baseId, qtdBase] of Object.entries(mixEmUnidadesBase)) {
            const eficiencia = await this.calcularEficienciaUnidadeBase(baseId, historico);
            // Aumenta se eficiência > 80%, diminui se < 50%
            let fatorAjuste = 1.0;
            if (eficiencia > 0.8) fatorAjuste = 1.2;
            else if (eficiencia < 0.5) fatorAjuste = 0.8;
            mixEmUnidadesBase[baseId] = Math.round(qtdBase * fatorAjuste);
        }
    }
    
    // 3. Converter de volta para embalagens comerciais
    const mixFinal = {};
    for (const [baseId, qtdBase] of Object.entries(mixEmUnidadesBase)) {
        const embalagensConvertidas = this.converterUnidadesBaseParaEmbalagens(qtdBase, baseId, produtos);
        Object.assign(mixFinal, embalagensConvertidas);
    }
    
    // 4. Para produtos que não participam dessa dinâmica (unidade_base_id === próprio id), mantém valor original
    for (const [id, qtd] of Object.entries(suggestedMix)) {
        const produto = produtos.find(p => p.id === id);
        if (!produto) continue;
        // Se o produto não foi incluído na conversão (ex: não tem embalagens derivadas), preserva
        if (!mixFinal[id] && produto.unidade_base_id === id) {
            mixFinal[id] = qtd;
        }
    }
    
    // Finalize (round, ensure minimums)
    suggestedMix = this.finalizeMix(mixFinal);
    
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
    const diasSimilares = historico.filter((h) => {
      const mesmoDia = h.diaSemana === contexto.diaSemana;
      const climaSimilar =
        !contexto.clima ||
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
      if (
        this.defaultMix[produtoId] &&
        valor === 0 &&
        this.defaultMix[produtoId] > 0
      ) {
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
      partes.push(
        `Clima: ${condicao.name} ${condicao.icon} (${contexto.clima.current.temperature}°C)`,
      );
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
          ajustes.push(`${diff > 0 ? "+" : ""}${diff} ${nome}`);
        }
      }
    }

    if (ajustes.length > 0) {
      partes.push(`Ajustes: ${ajustes.join(", ")}`);
    }

    return partes.join(" | ");
  }

  // Estimate potential revenue
  estimateRevenue(mix, produtos) {
    let total = 0;

    for (const [produtoId, quantidade] of Object.entries(mix)) {
      const produto = produtos.find((p) => p.id === produtoId);
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
      1: "bolos",
      2: "brownies",
      3: "brigadeiros",
      4: "mousses",
      5: "copos",
      6: "sacoles",
      7: "bebidas",
    };
    return map[prefix] || "outros";
  }

  // Helper: Get product name from ID
  getNomeProduto(id) {
    const nomes = {
      101: "Bolo Choc",
      102: "Bolo Cen",
      103: "Bolo Coco",
      104: "Bolo Amendoim",
      201: "Brownie Trad",
      202: "Brownie Choc",
      203: "Brownie Ninho",
      301: "Brig Avulso",
      302: "Brig Caixa",
      305: "Brig Jumbo",
      401: "Mousse Limão",
      402: "Mousse Maracujá",
      501: "Copo Morango",
      502: "Copo Uva",
      503: "Copo Duo",
      601: "Sacolé Choc/Ninho",
      602: "Sacolé Maracujá",
      701: "Coca Zero",
      704: "Coca Normal",
    };
    return nomes[id] || `Produto ${id}`;
  }

  // Helper: Get abbreviated day of week
  getDiaSemanaAbrev(dia) {
    const map = {
      domingo: "dom",
      "segunda-feira": "seg",
      "terça-feira": "ter",
      "quarta-feira": "qua",
      "quinta-feira": "qui",
      "sexta-feira": "sex",
      sábado: "sab",
    };
    return map[dia?.toLowerCase()] || "";
  }

  // Helper: Get period of month
  getPeriodoMes(dataStr) {
    const dia = parseInt(dataStr?.split("-")[2] || "15");
    if (dia <= 10) return "inicio";
    if (dia <= 20) return "meio";
    return "fim";
  }
  // Converte quantidade em unidades base para a melhor combinação de embalagens
  converterUnidadesBaseParaEmbalagens(
    unidadesBase,
    produtoBaseId,
    produtosDisponiveis,
  ) {
    // Filtra embalagens derivadas da mesma unidade base (exclui a própria unidade base)
    const embalagens = produtosDisponiveis
      .filter(
        (p) => p.unidade_base_id === produtoBaseId && p.id !== produtoBaseId,
      )
      .sort((a, b) => b.fator_conversao - a.fator_conversao); // maiores fatores primeiro

    const resultado = {};
    let restante = unidadesBase;

    for (const emb of embalagens) {
      const qtd = Math.floor(restante / emb.fator_conversao);
      if (qtd > 0) {
        resultado[emb.id] = qtd;
        restante -= qtd * emb.fator_conversao;
      }
    }
    // Se sobrar unidades base (avulsos), mantém como avulso
    if (restante > 0) {
      resultado[produtoBaseId] = restante;
    }
    return resultado;
  }

  // Calcula eficiência histórica de uma unidade base (ex: '301')
  async calcularEficienciaUnidadeBase(baseId, historico) {
    let totalBaseLevado = 0,
      totalBaseVendido = 0;
    for (const dia of historico.slice(-7)) {
      for (const item of dia.itensVendidos || []) {
        const produto = this.produtos?.find((p) => p.codigo === item.codigo);
        if (!produto) continue;
        const baseIdItem = produto.unidade_base_id || produto.id;
        if (baseIdItem === baseId) {
          const fator = produto.fator_conversao || 1;
          totalBaseLevado += (item.levado || 0) * fator;
          totalBaseVendido += (item.vendido || 0) * fator;
        }
      }
    }
    return totalBaseLevado > 0 ? totalBaseVendido / totalBaseLevado : 0.7;
  }
}

// Create global instance
const mixEngine = new MixEngine();
