/**
 * ==============================================================================
 * Synchro PRO - Regras Normativas e Matrizes IFPUG (CPM 4.3.1)
 * Módulo isomórfico (Node.js CommonJS e Browser) com fonte única da verdade para
 * determinação de complexidade funcional e Pontos de Função Não Ajustados (PF).
 * ==============================================================================
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IfpugRules = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /**
   * Peso oficial de Pontos de Função Não Ajustados (PF Bruto) por tipo e complexidade.
   */
  const IFPUG_RAW_PF = {
    ALI: { 'Baixa': 7, 'Média': 10, 'Alta': 15 },
    AIE: { 'Baixa': 5, 'Média': 7,  'Alta': 10 },
    EE:  { 'Baixa': 3, 'Média': 4,  'Alta': 6  },
    SE:  { 'Baixa': 4, 'Média': 5,  'Alta': 7  },
    CE:  { 'Baixa': 3, 'Média': 4,  'Alta': 6  }
  };

  /**
   * Matrizes oficiais de decisão (linhas = TR/AR, colunas = TD).
   * rowMax / colMax contêm os limites superiores das duas primeiras faixas;
   * valores acima caem automaticamente na terceira faixa (índice 2).
   */
  const COMPLEXITY_DATA_SPEC = {
    minRow: 1,
    rowMax: [1, 5],
    colMax: [19, 50],
    grid: [
      ['Baixa', 'Baixa', 'Média'], // 1 RLR (RET)
      ['Baixa', 'Média', 'Alta'],  // 2 a 5 RLRs
      ['Média', 'Alta',  'Alta']   // > 5 RLRs
    ]
  };

  const IFPUG_COMPLEXITY_MATRICES = {
    ALI: COMPLEXITY_DATA_SPEC,
    AIE: COMPLEXITY_DATA_SPEC,
    EE: {
      minRow: 0,
      rowMax: [1, 2],
      colMax: [4, 15],
      grid: [
        ['Baixa', 'Baixa', 'Média'], // 0 a 1 AR: 1-4 | 5-15 | >15
        ['Baixa', 'Média', 'Alta'],  // 2 ARs:    1-4 | 5-15 | >15
        ['Média', 'Média', 'Alta']   // 3+ ARs:   1-4 | 5-15 | >15
      ]
    },
    SE: {
      minRow: 0,
      rowMax: [1, 3],
      colMax: [5, 19],
      grid: [
        ['Baixa', 'Baixa', 'Média'], // 0 a 1 AR: 1-5 | 6-19 | >19
        ['Baixa', 'Média', 'Alta'],  // 2 a 3 ARs:1-5 | 6-19 | >19
        ['Média', 'Alta',  'Alta']   // > 3 ARs:  1-5 | 6-19 | >19
      ]
    },
    CE: {
      minRow: 0,
      rowMax: [1, 3],
      colMax: [5, 19],
      grid: [
        ['Baixa', 'Baixa', 'Média'], // 0 a 1 AR: 1-5 | 6-19 | >19
        ['Baixa', 'Média', 'Alta'],  // 2 a 3 ARs:1-5 | 6-19 | >19
        ['Média', 'Média', 'Alta']   // > 3 ARs:  1-5 | 6-19 | >19
      ]
    }
  };

  /**
   * Mapeia um valor numérico inteiro para o índice de faixa (0, 1 ou 2).
   */
  function resolveBandIndex(value, upperBounds) {
    if (value <= upperBounds[0]) return 0;
    if (value <= upperBounds[1]) return 1;
    return 2;
  }

  /**
   * Determina a complexidade funcional ('Baixa', 'Média' ou 'Alta') para uma função IFPUG.
   */
  function calculateApfComplexity(type, arTr, td) {
    const normType = (type || '').toUpperCase().trim();
    const spec = IFPUG_COMPLEXITY_MATRICES[normType];
    if (!spec) return 'Média';

    const rawArTr = parseInt(arTr, 10);
    const arTrVal = Math.max(spec.minRow, isNaN(rawArTr) ? spec.minRow : rawArTr);
    const rawTd = parseInt(td, 10);
    const tdVal = Math.max(1, isNaN(rawTd) ? 1 : rawTd);

    const rowIdx = resolveBandIndex(arTrVal, spec.rowMax);
    const colIdx = resolveBandIndex(tdVal, spec.colMax);
    return spec.grid[rowIdx][colIdx];
  }

  /**
   * Retorna o PF Bruto (Não Ajustado) correspondente ao tipo funcional e complexidade.
   */
  function calculateApfRawPf(type, complexity) {
    const normType = (type || '').toUpperCase().trim();
    const level = complexity || 'Média';
    if (IFPUG_RAW_PF[normType] && IFPUG_RAW_PF[normType][level] !== undefined) {
      return IFPUG_RAW_PF[normType][level];
    }
    return 4;
  }

  /**
   * Aplica o fator contratual/deflator SISP sobre o PF Bruto com arredondamento de 2 casas decimais.
   */
  function calculateApfFinalPf(rawPf, factor) {
    const f = parseFloat(factor);
    const factorVal = isNaN(f) ? 1.0 : f;
    return Math.round((rawPf * factorVal) * 100) / 100;
  }

  /**
   * Calcula de forma determinística (ignorando quaisquer desvios prévios)
   * Complexidade, PF Bruto e PF Final conforme matriz IFPUG CPM 4.3.1.
   */
  function evaluateApfMetrics(type, arTr, td, factor = 1.0) {
    const complexity = calculateApfComplexity(type, arTr, td);
    const rawPf = calculateApfRawPf(type, complexity);
    const finalPf = calculateApfFinalPf(rawPf, factor);
    return { complexity, rawPf, finalPf };
  }

  return {
    IFPUG_RAW_PF,
    IFPUG_COMPLEXITY_MATRICES,
    calculateApfComplexity,
    calculateApfRawPf,
    calculateApfFinalPf,
    evaluateApfMetrics
  };
});

