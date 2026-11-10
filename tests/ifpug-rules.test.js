'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  IFPUG_RAW_PF,
  calculateApfComplexity,
  calculateApfRawPf,
  calculateApfFinalPf
} = require('../ifpug-rules');

describe('IFPUG CPM 4.3.1 - Matriz Entrada Externa (EE)', () => {
  it('deve classificar 3 ARs e 7 TDs estritamente como Média (4 PF)', () => {
    const complexity = calculateApfComplexity('EE', 3, 7);
    const rawPf = calculateApfRawPf('EE', complexity);
    const finalPf = calculateApfFinalPf(rawPf, 1.0);
    assert.equal(complexity, 'Média');
    assert.equal(rawPf, 4);
    assert.equal(finalPf, 4);
  });

  const eeBoundaryCases = [
    // 0 a 1 AR
    [0, 1, 'Baixa', 3],
    [0, 4, 'Baixa', 3],
    [1, 5, 'Baixa', 3],
    [1, 15, 'Baixa', 3],
    [1, 16, 'Média', 4],
    // 2 ARs
    [2, 1, 'Baixa', 3],
    [2, 4, 'Baixa', 3],
    [2, 5, 'Média', 4],
    [2, 15, 'Média', 4],
    [2, 16, 'Alta', 6],
    // 3+ ARs
    [3, 1, 'Média', 4],
    [3, 4, 'Média', 4],
    [3, 5, 'Média', 4],
    [3, 7, 'Média', 4],
    [3, 15, 'Média', 4],
    [4, 15, 'Média', 4],
    [3, 16, 'Alta', 6],
    [5, 25, 'Alta', 6]
  ];

  for (const [ar, td, expectedComp, expectedPf] of eeBoundaryCases) {
    it(`EE (${ar} AR, ${td} TD) -> ${expectedComp} (${expectedPf} PF)`, () => {
      const comp = calculateApfComplexity('EE', ar, td);
      assert.equal(comp, expectedComp);
      assert.equal(calculateApfRawPf('EE', comp), expectedPf);
    });
  }
});

describe('IFPUG CPM 4.3.1 - Matriz Saída Externa (SE)', () => {
  const seBoundaryCases = [
    // 0 a 1 AR
    [0, 1, 'Baixa', 4],
    [1, 5, 'Baixa', 4],
    [1, 6, 'Baixa', 4],
    [1, 19, 'Baixa', 4],
    [1, 20, 'Média', 5],
    // 2 a 3 ARs
    [2, 1, 'Baixa', 4],
    [3, 5, 'Baixa', 4],
    [2, 6, 'Média', 5],
    [3, 19, 'Média', 5],
    [2, 20, 'Alta', 7],
    [3, 25, 'Alta', 7],
    // > 3 ARs (4+)
    [4, 1, 'Média', 5],
    [4, 5, 'Média', 5],
    [4, 6, 'Alta', 7],
    [4, 19, 'Alta', 7],
    [4, 20, 'Alta', 7],
    [6, 30, 'Alta', 7]
  ];

  for (const [ar, td, expectedComp, expectedPf] of seBoundaryCases) {
    it(`SE (${ar} AR, ${td} TD) -> ${expectedComp} (${expectedPf} PF)`, () => {
      const comp = calculateApfComplexity('SE', ar, td);
      assert.equal(comp, expectedComp);
      assert.equal(calculateApfRawPf('SE', comp), expectedPf);
    });
  }
});

describe('IFPUG CPM 4.3.1 - Matriz Consulta Externa (CE)', () => {
  const ceBoundaryCases = [
    // 0 a 1 AR
    [0, 1, 'Baixa', 3],
    [1, 5, 'Baixa', 3],
    [1, 6, 'Baixa', 3],
    [1, 19, 'Baixa', 3],
    [1, 20, 'Média', 4],
    // 2 a 3 ARs
    [2, 1, 'Baixa', 3],
    [3, 5, 'Baixa', 3],
    [2, 6, 'Média', 4],
    [3, 19, 'Média', 4],
    [2, 20, 'Alta', 6],
    [3, 25, 'Alta', 6],
    // > 3 ARs (4+)
    [4, 1, 'Média', 4],
    [4, 5, 'Média', 4],
    [4, 6, 'Média', 4],
    [4, 19, 'Média', 4],
    [5, 19, 'Média', 4],
    [4, 20, 'Alta', 6]
  ];

  for (const [ar, td, expectedComp, expectedPf] of ceBoundaryCases) {
    it(`CE (${ar} AR, ${td} TD) -> ${expectedComp} (${expectedPf} PF)`, () => {
      const comp = calculateApfComplexity('CE', ar, td);
      assert.equal(comp, expectedComp);
      assert.equal(calculateApfRawPf('CE', comp), expectedPf);
    });
  }
});

describe('IFPUG CPM 4.3.1 - Funções de Dados (ALI e AIE)', () => {
  const dataBoundaryCases = [
    // 1 RLR (incluindo clamp de 0 para 1 RLR)
    [0, 1, 'Baixa', 7, 5],
    [1, 19, 'Baixa', 7, 5],
    [1, 20, 'Baixa', 7, 5],
    [1, 50, 'Baixa', 7, 5],
    [1, 51, 'Média', 10, 7],
    // 2 a 5 RLRs
    [2, 19, 'Baixa', 7, 5],
    [5, 19, 'Baixa', 7, 5],
    [2, 20, 'Média', 10, 7],
    [5, 50, 'Média', 10, 7],
    [2, 51, 'Alta', 15, 10],
    [5, 60, 'Alta', 15, 10],
    // > 5 RLRs (6+)
    [6, 1, 'Média', 10, 7],
    [6, 19, 'Média', 10, 7],
    [6, 20, 'Alta', 15, 10],
    [6, 50, 'Alta', 15, 10],
    [6, 51, 'Alta', 15, 10],
    [8, 80, 'Alta', 15, 10]
  ];

  for (const [tr, td, expectedComp, expectedAliPf, expectedAiePf] of dataBoundaryCases) {
    it(`ALI/AIE (${tr} TR, ${td} TD) -> ${expectedComp} (ALI=${expectedAliPf}, AIE=${expectedAiePf})`, () => {
      assert.equal(calculateApfComplexity('ALI', tr, td), expectedComp);
      assert.equal(calculateApfComplexity('AIE', tr, td), expectedComp);
      assert.equal(calculateApfRawPf('ALI', expectedComp), expectedAliPf);
      assert.equal(calculateApfRawPf('AIE', expectedComp), expectedAiePf);
    });
  }
});

describe('Cálculo Final SISP e Carregamento Isomórfico Browser/UMD', () => {
  it('deve aplicar fatores de deflação com precisão de 2 casas decimais', () => {
    assert.equal(calculateApfFinalPf(4, 1.0), 4);
    assert.equal(calculateApfFinalPf(4, 0.5), 2);
    assert.equal(calculateApfFinalPf(7, 0.35), 2.45);
    assert.equal(calculateApfFinalPf(5, 0.4), 2);
  });

  it('deve expor window.IfpugRules em ambiente Browser sem module.exports', () => {
    const code = fs.readFileSync(path.join(__dirname, '..', 'ifpug-rules.js'), 'utf8');
    const sandbox = { window: {}, globalThis: null };
    sandbox.globalThis = sandbox;
    vm.runInNewContext(code, sandbox);

    assert.ok(sandbox.IfpugRules);
    assert.equal(sandbox.IfpugRules.calculateApfComplexity('EE', 3, 7), 'Média');
    assert.equal(sandbox.IfpugRules.calculateApfRawPf('EE', 'Média'), 4);
    assert.deepEqual(JSON.parse(JSON.stringify(sandbox.IfpugRules.IFPUG_RAW_PF)), IFPUG_RAW_PF);
  });
});
