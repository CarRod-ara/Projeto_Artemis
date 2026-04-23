// =============================================================================
// PROJETO DE ESTUDOS: Motor de Sugestão de Mix (mixEngine.js) – Luminar PWA
// =============================================================================
// Este módulo implementa a inteligência central da aplicação: sugerir quantos
// itens de cada produto o vendedor deve levar para a rua em um determinado dia.
//
// A sugestão considera múltiplos fatores:
//   • Um mix padrão (fallback inicial)
//   • Regras definidas pelo usuário (ex: "se chover, levar menos sacolés")
//   • Impacto do clima (via módulo weather.js)
//   • Dados históricos de eficiência (calculados a partir dos registros)
//   • Conversão entre unidades base e embalagens comerciais
//       (ex: 1 caixa de brigadeiro = 4 brigadeiros avulsos)
//   • Ajuste para atingir um valor mínimo de faturamento estimado
//
// É um ótimo exemplo de sistema especialista simples, onde regras explícitas
// e estatísticas básicas se combinam para uma recomendação prática.
// =============================================================================

class MixEngine {
  constructor() {
    // Mix padrão usado como ponto de partida quando não há histórico.
    // Mapeia ID do produto → quantidade sugerida.
    this.defaultMix = {
      101: 4, 102: 2, 103: 2, 104: 2,       // Bolos
      201: 3, 202: 3, 203: 2, 204: 2, 205: 2, // Brownies
      301: 0, 302: 3, 305: 2,                 // Brigadeiros (avulso 0, foco em caixas)
      401: 2, 402: 2,                         // Mousses
      501: 1, 502: 1, 503: 1,                 // Copos da Felicidade
      601: 4, 602: 4, 603: 2, 604: 2,         // Sacolés Gourmet
      701: 1, 702: 1, 704: 1, 705: 1, 708: 1, 709: 1 // Bebidas
    };
  }

  // ========== MÉTODO PRINCIPAL ==========
  // Recebe o contexto (data, clima, produtos, regras) e retorna um objeto
  // com o mix sugerido, explicação, total de itens e estimativa de faturamento.

  async generateSuggestion(context) {
    const { data, diaSemana, clima, temperatura, produtos, regras } = context;
    this.produtos = produtos; // guarda referência para uso nos helpers

    // 1. Começa com o mix padrão
    let suggestedMix = { ...this.defaultMix };

    // 2. Aplica regras definidas pelo usuário
    suggestedMix = this.applyRules(
      suggestedMix,
      {
        clima: clima?.condition?.category,
        diaSemana: this.getDiaSemanaAbrev(diaSemana),
        temperatura: temperatura,
        periodoMes: this.getPeriodoMes(data),
      },
      regras,
    );

    // 3. Aplica impacto do clima (via weather.js)
    if (clima) {
      suggestedMix = this.applyWeatherImpact(suggestedMix, clima);
    }

    // 4. Ajustes baseados em histórico (se houver ao menos 7 registros)
    const historico = await db.getAllRegistros();
    if (historico.length >= 7) {
      suggestedMix = await this.applyHistoricalData(
        suggestedMix,
        {
          diaSemana,
          clima: clima?.condition?.category,
        },
        historico,
      );
    }

    // 5. 🔥 LÓGICA DE CONVERSÃO PARA UNIDADES BASE
    //    Converte o mix para "unidades base" (ex.: brigadeiros avulsos),
    //    ajusta pela eficiência histórica e converte de volta para embalagens.
    const mixEmUnidadesBase = {};
    for (const [id, qtd] of Object.entries(suggestedMix)) {
      const produto = produtos.find((p) => p.id === id);
      if (!produto) continue;
      const baseId = produto.unidade_base_id || id;
      const fator = produto.fator_conversao || 1;
      mixEmUnidadesBase[baseId] = (mixEmUnidadesBase[baseId] || 0) + qtd * fator;
    }

    // Ajusta por eficiência histórica (se >= 7 registros)
    if (historico.length >= 7) {
      for (const [baseId, qtdBase] of Object.entries(mixEmUnidadesBase)) {
        const eficiencia = await this.calcularEficienciaUnidadeBase(baseId, historico);
        let fatorAjuste = 1.0;
        if (eficiencia > 0.8) fatorAjuste = 1.2;   // produto vendendo bem → levar mais
        else if (eficiencia < 0.5) fatorAjuste = 0.8; // produto encalhando → levar menos
        mixEmUnidadesBase[baseId] = Math.round(qtdBase * fatorAjuste);
      }
    }

    // Converte de volta para embalagens comerciais
    const mixFinal = {};
    for (const [baseId, qtdBase] of Object.entries(mixEmUnidadesBase)) {
      const embalagensConvertidas = this.converterUnidadesBaseParaEmbalagens(
        qtdBase,
        baseId,
        produtos,
      );
      Object.assign(mixFinal, embalagensConvertidas);
    }

    // Preserva produtos independentes que não entraram na conversão
    for (const [id, qtd] of Object.entries(suggestedMix)) {
      const produto = produtos.find((p) => p.id === id);
      if (!produto) continue;
      if (!mixFinal[id] && produto.unidade_base_id === id) {
        mixFinal[id] = qtd;
      }
    }

    // 6. Finaliza (arredonda, garante mínimos)
    suggestedMix = this.finalizeMix(mixFinal);

    // 7. Ajuste para valor mínimo de faturamento (se configurado)
    if (context.valorMinimo) {
      let estimativa = this.estimateRevenue(suggestedMix, produtos);
      if (estimativa < context.valorMinimo) {
        const fatorAumento = context.valorMinimo / estimativa;
        for (const id in suggestedMix) {
          suggestedMix[id] = Math.ceil(suggestedMix[id] * fatorAumento);
        }
        estimativa = this.estimateRevenue(suggestedMix, produtos);
      }
    }

    // 8. Retorna resultado completo
    return {
      mix: suggestedMix,
      explicacao: this.generateExplanation(context, suggestedMix),
      totalItens: Object.values(suggestedMix).reduce((a, b) => a + b, 0),
      estimativaFaturamento: this.estimateRevenue(suggestedMix, produtos),
    };
  }

  // ========== APLICAÇÃO DE REGRAS DO USUÁRIO ==========
  // Percorre a lista de regras e, se as condições batem, aplica os fatores
  // de multiplicação sobre as quantidades.
  applyRules(mix, contexto, regras) {
    if (!regras || !Array.isArray(regras)) return mix;

    const newMix = { ...mix };

    for (const regra of regras) {
      if (!regra.ativa) continue;

      if (this.matchesConditions(regra.condicoes, contexto)) {
        for (const acao of regra.acoes) {
          if (newMix[acao.produtoId] !== undefined) {
            const valorAtual = newMix[acao.produtoId];
            let novoValor = Math.round(valorAtual * acao.fator);

            if (acao.minimo !== undefined) novoValor = Math.max(novoValor, acao.minimo);
            if (acao.maximo !== undefined) novoValor = Math.min(novoValor, acao.maximo);

            newMix[acao.produtoId] = novoValor;
          }
        }
      }
    }

    return newMix;
  }

  // Verifica se as condições de uma regra são atendidas pelo contexto atual
  matchesConditions(condicoes, contexto) {
    if (condicoes.clima && condicoes.clima.length > 0) {
      if (!condicoes.clima.includes(contexto.clima)) return false;
    }
    if (condicoes.diaSemana && condicoes.diaSemana.length > 0) {
      if (!condicoes.diaSemana.includes(contexto.diaSemana)) return false;
    }
    if (condicoes.temperaturaMin !== undefined) {
      if (contexto.temperatura < condicoes.temperaturaMin) return false;
    }
    if (condicoes.temperaturaMax !== undefined) {
      if (contexto.temperatura > condicoes.temperaturaMax) return false;
    }
    if (condicoes.periodoMes && condicoes.periodoMes.length > 0) {
      if (!condicoes.periodoMes.includes(contexto.periodoMes)) return false;
    }
    return true;
  }

  // ========== IMPACTO DO CLIMA ==========
  // Usa a função getWeatherImpact do módulo weather para ajustar quantidades
  // por categoria (ex.: calor aumenta sacolés, chuva reduz).
  applyWeatherImpact(mix, clima) {
    const impact = weather.getWeatherImpact(clima);
    const newMix = { ...mix };

    for (const [produtoId, quantidade] of Object.entries(newMix)) {
      const categoria = this.getCategoriaFromId(produtoId);
      if (impact[categoria]) {
        newMix[produtoId] = Math.round(quantidade * impact[categoria]);
      }
    }

    return newMix;
  }

  // ========== AJUSTE POR HISTÓRICO ==========
  // Busca dias similares (mesmo dia da semana, clima parecido) e calcula a
  // eficiência média de cada produto. Ajusta o mix com base nesses números.
  async applyHistoricalData(mix, contexto, historico) {
    const newMix = { ...mix };

    const diasSimilares = historico.filter((h) => {
      const mesmoDia = h.diaSemana === contexto.diaSemana;
      const climaSimilar =
        !contexto.clima ||
        (h.clima && h.clima.real && h.clima.real.condicao === contexto.clima);
      return mesmoDia && (climaSimilar || historico.length < 30);
    });

    if (diasSimilares.length < 3) return newMix;

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

    for (const [produtoId, efData] of Object.entries(eficienciaPorProduto)) {
      if (efData.count < 2) continue;
      const eficienciaMedia = efData.total / efData.count;
      if (eficienciaMedia > 0.9) {
        newMix[produtoId] = Math.round(newMix[produtoId] * 1.1);
      } else if (eficienciaMedia < 0.5) {
        newMix[produtoId] = Math.round(newMix[produtoId] * 0.8);
      }
    }

    return newMix;
  }

  // ========== FINALIZAÇÃO DO MIX ==========
  // Arredonda valores, garante >= 0 e mantém ao menos 1 para produtos
  // que já estavam no mix padrão (evita zerar itens importantes).
  finalizeMix(mix) {
    const finalized = {};

    for (const [produtoId, quantidade] of Object.entries(mix)) {
      let valor = Math.round(quantidade);
      valor = Math.max(0, valor);

      if (this.defaultMix[produtoId] && valor === 0 && this.defaultMix[produtoId] > 0) {
        valor = 1;
      }

      finalized[produtoId] = valor;
    }

    return finalized;
  }

  // ========== EXPLICAÇÃO LEGÍVEL ==========
  // Gera um texto resumindo os fatores que influenciaram a sugestão.
  generateExplanation(contexto, mix) {
    const partes = [];

    if (contexto.clima) {
      const condicao = contexto.clima.current.condition;
      partes.push(`Clima: ${condicao.name} ${condicao.icon} (${contexto.clima.current.temperature}°C)`);
    }

    partes.push(`Dia: ${contexto.diaSemana}`);

    const ajustes = [];
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

  // ========== ESTIMATIVA DE FATURAMENTO ==========
  // Calcula quanto dinheiro o mix sugerido pode gerar, assumindo uma
  // taxa de venda de 80% (sell-through rate típico de vendas de rua).
  estimateRevenue(mix, produtos) {
    let total = 0;

    for (const [produtoId, quantidade] of Object.entries(mix)) {
      const produto = produtos.find((p) => p.id === produtoId);
      if (produto && quantidade > 0) {
        total += produto.preco * quantidade * 0.8;
      }
    }

    return Math.round(total);
  }

  // ========== HELPERS ==========

  // Extrai a categoria a partir do prefixo do ID (1=bolos, 2=brownies...)
  getCategoriaFromId(id) {
    const prefix = id.charAt(0);
    const map = {
      1: "bolos", 2: "brownies", 3: "brigadeiros",
      4: "mousses", 5: "copos", 6: "sacoles", 7: "bebidas",
    };
    return map[prefix] || "outros";
  }

  // Nome curto para exibição nos relatórios de ajuste
  getNomeProduto(id) {
    const nomes = {
      101: "Bolo Choc", 102: "Bolo Cen", 103: "Bolo Coco", 104: "Bolo Amendoim",
      201: "Brownie Trad", 202: "Brownie Choc", 203: "Brownie Ninho",
      301: "Brig Avulso", 302: "Brig Caixa", 305: "Brig Jumbo",
      401: "Mousse Limão", 402: "Mousse Maracujá",
      501: "Copo Morango", 502: "Copo Uva", 503: "Copo Duo",
      601: "Sacolé Choc/Ninho", 602: "Sacolé Maracujá",
      701: "Coca Zero", 704: "Coca Normal",
    };
    return nomes[id] || `Produto ${id}`;
  }

  // Converte nome do dia da semana para abreviação (seg, ter...)
  getDiaSemanaAbrev(dia) {
    const map = {
      domingo: "dom", "segunda-feira": "seg", "terça-feira": "ter",
      "quarta-feira": "qua", "quinta-feira": "qui", "sexta-feira": "sex",
      sábado: "sab",
    };
    return map[dia?.toLowerCase()] || "";
  }

  // Classifica o período do mês: inicio (1-10), meio (11-20), fim (21-31)
  getPeriodoMes(dataStr) {
    const dia = parseInt(dataStr?.split("-")[2] || "15");
    if (dia <= 10) return "inicio";
    if (dia <= 20) return "meio";
    return "fim";
  }

  // ========== CONVERSÃO DE UNIDADES BASE PARA EMBALAGENS ==========
  // Exemplo: se temos 14 brigadeiros avulsos (unidade base), o sistema
  // sugere 2 caixas de 6 + 1 caixa de 4 (ou combinação ótima), sem avulsos.
  converterUnidadesBaseParaEmbalagens(unidadesBase, produtoBaseId, produtosDisponiveis) {
    const embalagens = produtosDisponiveis
      .filter((p) => p.unidade_base_id === produtoBaseId && p.id !== produtoBaseId)
      .sort((a, b) => a.fator_conversao - b.fator_conversao);

    const resultado = {};

    if (embalagens.length === 0) {
      resultado[produtoBaseId] = unidadesBase;
      return resultado;
    }

    const menorEmbalagem = embalagens[0];
    if (unidadesBase < menorEmbalagem.fator_conversao) {
      resultado[menorEmbalagem.id] = 1;
      return resultado;
    }

    let restante = unidadesBase;
    const embalagensDecrescente = [...embalagens].sort(
      (a, b) => b.fator_conversao - a.fator_conversao,
    );

    for (const emb of embalagensDecrescente) {
      const fator = emb.fator_conversao;
      const qtd = Math.floor(restante / fator);
      if (qtd > 0) {
        resultado[emb.id] = qtd;
        restante -= qtd * fator;
      }
    }

    if (restante > 0) {
      const idMenor = menorEmbalagem.id;
      resultado[idMenor] = (resultado[idMenor] || 0) + 1;
    }

    if (Object.keys(resultado).length === 0 && unidadesBase > 0) {
      resultado[menorEmbalagem.id] = 1;
    }

    return resultado;
  }

  // Calcula a eficiência de venda de um produto base (ex.: brigadeiro avulso)
  // considerando os últimos 7 registros.
  async calcularEficienciaUnidadeBase(baseId, historico) {
    let totalBaseLevado = 0, totalBaseVendido = 0;
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

// Cria instância global para uso em toda a aplicação
const mixEngine = new MixEngine();
