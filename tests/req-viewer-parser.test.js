'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadRequirementFormatters() {
  const scriptSource = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');
  const start = scriptSource.indexOf('function parseRequirementNarrative');
  const end = scriptSource.indexOf('window.currentReqViewerState');
  assert.ok(start > -1 && end > start, 'Parsers de requisitos devem existir em script.js');

  const sandbox = {
    window: {},
    document: {},
    escapeHtml: (str) => String(str || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[ch]))
  };
  vm.runInNewContext(scriptSource.slice(start, end), sandbox);
  return sandbox;
}

describe('Parsers e Visualizador Harmonioso de Requisitos', () => {
  const fmt = loadRequirementFormatters();

  it('separa Como / Quero / Para que e Regras de Negócio (RN) de história contínua (RF-09)', () => {
    const raw = 'Como: Agente de Ouvidoria Quero: gerar rascunho com IA Para que: reduza tempo de resposta. Regras de Negócio (RN) RN09.1: Receber contexto obrigatório. RN09.2: Aplicar linguagem simples.';
    const parsed = fmt.parseRequirementNarrative(raw);

    assert.equal(parsed.como, 'Agente de Ouvidoria');
    assert.equal(parsed.quero, 'gerar rascunho com IA');
    assert.equal(parsed.paraQue, 'reduza tempo de resposta.');
    assert.equal(parsed.rules.length, 2);
    assert.equal(parsed.rules[0].code, 'RN09.1');
    assert.equal(parsed.rules[0].text, 'Receber contexto obrigatório.');
    assert.equal(parsed.rules[1].code, 'RN09.2');
  });

  it('preserva fallback seguro com escape XSS quando texto não usa Como/Quero/Para que', () => {
    const html = fmt.renderRequirementNarrativeHtml('Texto livre <script>alert(1)</script>');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  });

  it('estrutura múltiplos cenários BDD (multilinha e linha única) com palavras-chave semânticas', () => {
    const multi = `Cenário: Envio com sucesso
  Dado que o ouvidor finalizou a resposta
  Quando clicar em "Enviar Resposta"
  Então o sistema registra o protocolo
  E atualiza o status para Respondida`;
    const scenarios = fmt.parseRequirementBddScenarios(multi);
    assert.equal(scenarios.length, 1);
    assert.equal(scenarios[0].title, 'Envio com sucesso');
    assert.deepEqual(Array.from(scenarios[0].steps, s => s.kwClass), ['kw-given', 'kw-when', 'kw-then', 'kw-and']);

    const inline = 'Cenário: Falha HTTP Dado que a API retorna erro Quando enviar resposta Então entra em contingência';
    const inlineScenarios = fmt.parseRequirementBddScenarios(inline);
    assert.equal(inlineScenarios.length, 1);
    assert.equal(inlineScenarios[0].steps.length, 3);
    assert.equal(inlineScenarios[0].steps[1].keyword, 'Quando');
  });

  it('exibe botão de expansão no modo compacto quando há mais cenários ou RNs', () => {
    const bdd = 'Cenário: A\nDado que x\nCenário: B\nQuando y\nCenário: C\nEntão z';
    const compactHtml = fmt.renderRequirementBddHtml(bdd, { compact: true, reqId: 'req_1', maxScenarios: 2 });
    assert.ok(compactHtml.includes('openRequirementViewer(\'req_1\')'));
    assert.ok(compactHtml.includes('3 cenários'));

    const fullHtml = fmt.renderRequirementBddHtml(bdd, { compact: false });
    assert.ok(!fullHtml.includes('Exibir todos os'));
  });
});
