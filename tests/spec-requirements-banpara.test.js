'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const aiAgent = require('../ai-cfps-agent');

const ROOT_DIR = path.join(__dirname, '..');

function loadSpecFormatters() {
  const scriptSource = fs.readFileSync(path.join(ROOT_DIR, 'script.js'), 'utf8');
  const start = scriptSource.indexOf('function parseRequirementNarrative');
  const end = scriptSource.indexOf('window.currentReqViewerState');
  assert.ok(start > -1 && end > start, 'Parsers de requisitos devem existir em script.js');

  const sandbox = {
    window: {},
    document: {},
    store: {
      getProjectById: (id) => (id === 'p_crm' ? { id: 'p_crm', code: 'CRM', name: 'CRM 3.0', processMakerNumber: '0838/2022' } : null)
    },
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

describe('Especificação de Requisitos (Padrão SUSIS / Banpará)', () => {
  const fmt = loadSpecFormatters();

  const sampleBanparaReq = {
    id: 'req_rf016',
    code: 'RF016',
    title: 'Importar Mailling Devedores',
    projectId: 'p_crm',
    feature: 'Importação de Cobrança',
    type: 'functional',
    moscow: 'Must',
    numeroProcessMaker: '0838/2022',
    versaoAtual: '1.1',
    criadoPor: {
      id: 'u_1',
      nome: 'Cyntia Caroline Coelho França',
      cargo: 'Analista de Requisitos',
      email: 'cyntia.franca@voxdatati.com.br'
    },
    historicoAtualizacoes: [
      { data: '2025-03-02', versao: '1.0', descricao: 'Primeira versão dos requisitos.', responsavelNome: 'Cyntia Caroline Coelho França' },
      { data: '2025-05-15', versao: '1.1', descricao: 'Atualização de versão', responsavelNome: 'Jorlina Silva' }
    ],
    fluxoPrincipal: '1. Acessar o Sistema:\n• Selecionar o perfil "Régua de Cobrança".\n2. Clicar no botão "Adicionar".',
    telas: [
      { id: 'scr_1', title: 'Listagem de Importações', url: 'data:image/png;base64,iVBORw0KGgo=' }
    ],
    entradas: [
      { id: 'e_1', campo: 'Valor', descricao: 'Valor a ser buscado', tipoCampo: 'Alfanumérico', obrigatorio: true, regra: 'Campo - Visível: Sim Campo - Editável: Sim' }
    ],
    saidas: [
      { id: 's_1', campo: 'Descrição', descricao: 'Nome do arquivo importado', tipoCampo: 'Alfanumérico', obrigatorio: true, regra: 'Campo - Visível: Sim Campo - Editável: Não' },
      { id: 's_2', campo: 'Ações', descricao: 'Menu suspenso', tipoCampo: 'Menu Dropdown', obrigatorio: true, regra: 'Visualizar (RF035)' }
    ],
    criteriosAceite: [
      { id: 'ca_1', item: 'CA001', tipo: 'Interface (I)', categoria: 'Geral', descricao: 'A listagem de arquivo deve ser exibida ao acessar a tela.' },
      { id: 'ca_2', item: 'CA002', tipo: 'Negócio (N)', categoria: 'Específico', descricao: 'Planilha CSV sem limite de importação.' }
    ]
  };

  it('reconhece tipos RF, RNF e RN corretamente via getRequirementTypeInfo', () => {
    assert.deepEqual(JSON.parse(JSON.stringify(fmt.getRequirementTypeInfo('functional'))), { abbr: 'RF', label: 'Funcional (RF)' });
    assert.deepEqual(JSON.parse(JSON.stringify(fmt.getRequirementTypeInfo('non-functional'))), { abbr: 'RNF', label: 'Não-Funcional (RNF)' });
    assert.deepEqual(JSON.parse(JSON.stringify(fmt.getRequirementTypeInfo('business-rule'))), { abbr: 'RN', label: 'Regra de Negócio (RN)' });
  });

  it('distingue requisitos estruturados SUSIS/Banpará dos requisitos ágeis legados', () => {
    assert.equal(fmt.hasStructuredSpecContent(sampleBanparaReq), true);
    assert.equal(fmt.hasStructuredSpecContent({ code: 'RF-01', userStory: 'Como admin...', bdd: 'Dado que...' }), false);
  });

  it('renderiza resumo compacto no card e especificação completa no Visualizador Harmonioso com escape XSS', () => {
    const cardSummary = fmt.renderRequirementSpecSummaryHtml(sampleBanparaReq, { compact: true, reqId: 'req_rf016' });
    assert.ok(cardSummary.includes('0838/2022'));
    assert.ok(cardSummary.includes('1.1 Fluxo'));
    assert.ok(cardSummary.includes('CA001'));
    assert.ok(cardSummary.includes('<strong>2</strong> saídas'));

    const fullHtml = fmt.renderRequirementBanparaViewerHtml(sampleBanparaReq, { code: 'CRM', name: 'CRM 3.0' });
    assert.ok(fullHtml.includes('Histórico de Atualizações (2)'));
    assert.ok(fullHtml.includes('1.2 Telas / Protótipos (1)'));
    assert.ok(fullHtml.includes('1.3.1 Atributos — Entradas (1)'));
    assert.ok(fullHtml.includes('1.3.2 Atributos — Saídas (2)'));
    assert.ok(fullHtml.includes('1.4 Critérios de Aceite (2)'));
    assert.ok(fullHtml.includes('Anexo 01 – Lista de Critérios de Aceite'));

    const xssReq = {
      ...sampleBanparaReq,
      fluxoPrincipal: '<script>alert(1)</script>',
      entradas: [{ campo: '<img onerror=alert(1)>', descricao: 'desc', tipoCampo: 'Alfanumérico', obrigatorio: true, regra: '' }]
    };
    const xssHtml = fmt.renderRequirementBanparaViewerHtml(xssReq, { code: 'CRM', name: 'CRM 3.0' });
    assert.ok(!xssHtml.includes('<script>alert(1)</script>'));
    assert.ok(xssHtml.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!xssHtml.includes('<img onerror=alert(1)>'));
  });

  it('gera Markdown estruturado contendo Histórico, Fluxo, Telas, Entradas, Saídas e Critérios de Aceite', () => {
    const md = fmt.buildRequirementMarkdown(sampleBanparaReq);
    assert.ok(md.includes('# [RF016] Importar Mailling Devedores'));
    assert.ok(md.includes('- **Número do ProcessMaker:** 0838/2022'));
    assert.ok(md.includes('## Histórico de Atualizações'));
    assert.ok(md.includes('## 1.1 Fluxo'));
    assert.ok(md.includes('## 1.3.1 Entradas'));
    assert.ok(md.includes('## 1.3.2 Saídas'));
    assert.ok(md.includes('## 1.4 Critérios de Aceite'));
    assert.ok(md.includes('| CA001 | Interface (I) | Geral |'));
  });

  it('integra campos SUSIS/Banpará no prompt CFPS e altera cache key quando atributos ou critérios mudam', () => {
    const prompt = aiAgent.buildCfpsUserPrompt(sampleBanparaReq, { countingType: 'Desenvolvimento' });
    assert.ok(prompt.includes('0838/2022'));
    assert.ok(prompt.includes('1.1 Fluxo (Passo a Passo)'));
    assert.ok(prompt.includes('1.3.1 Atributos — Entradas'));
    assert.ok(prompt.includes('1.3.2 Atributos — Saídas'));
    assert.ok(prompt.includes('CA001 [Interface (I) | Geral]'));

    const key1 = aiAgent.computeCfpsCacheKey(sampleBanparaReq, { countingType: 'Desenvolvimento' }, { provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    const modifiedReq = {
      ...sampleBanparaReq,
      entradas: [...sampleBanparaReq.entradas, { campo: 'CPF/CNPJ', tipoCampo: 'CPF/CNPJ', obrigatorio: true, descricao: 'Documento' }]
    };
    const key2 = aiAgent.computeCfpsCacheKey(modifiedReq, { countingType: 'Desenvolvimento' }, { provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    assert.notEqual(key1, key2, 'Cache key CFPS deve invalidar ao alterar entradas SUSIS');
  });

  it('valida presença da migration 002, tabelas filhas e estrutura das 4 abas e rodapé fixo no HTML', () => {
    const upSql = fs.readFileSync(path.join(ROOT_DIR, 'migrations', '002_spec_requirements_banpara.sql'), 'utf8');
    const downSql = fs.readFileSync(path.join(ROOT_DIR, 'migrations', '002_spec_requirements_banpara.rollback.sql'), 'utf8');
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS requirement_updates_history'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS requirement_screens'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS requirement_attributes'));
    assert.ok(upSql.includes('CREATE TABLE IF NOT EXISTS requirement_acceptance_criteria'));
    assert.ok(downSql.includes('DROP TABLE IF EXISTS requirement_acceptance_criteria'));

    const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
    ['data-req-tab="general"', 'data-req-tab="business-rules"', 'data-req-tab="attributes"', 'data-req-tab="criteria"', 'data-req-tab="custom-sections"', 'data-req-tab="history"', 'id="btn-save-req"', 'id="req-anexo01-legend-panel"', 'id="modal-screen-lightbox"', 'id="req-desc"', 'id="req-pre-conditions"', 'id="req-post-conditions"', 'id="req-rn-tbody"', 'id="req-custom-sections-container"'].forEach(marker => {
      assert.ok(html.includes(marker), `index.html deve conter ${marker}`);
    });
  });

  it('suporta Regras de Negócio (RN) e Seções Customizadas no Leitor Harmonioso, Markdown e CFPS Agent', () => {
    const fullSpecReq = {
      ...sampleBanparaReq,
      descricaoRequisito: 'Permite ao analista importar a régua de devedores diariamente.',
      preCondicoes: 'O usuário deve estar autenticado com perfil Régua de Cobrança.',
      posCondicoes: 'O arquivo será enfileirado para processamento assíncrono.',
      regrasNegocio: [
        { id: 'rn_1', codigo: 'RN001', descricao: 'O arquivo deve estar no formato CSV UTF-8.' },
        { id: 'rn_2', codigo: 'RN002', descricao: 'Não são permitidos registros com CPF duplicado.' }
      ],
      secoesCustomizadas: [
        {
          id: 'sec_1',
          tituloSecao: 'Parâmetros de Integração',
          ordem: 0,
          campos: [
            { id: 'fld_1', nomeCampo: 'Endpoint API', tipoCampo: 'Texto Curto', obrigatorio: true, valor: 'https://api.cobranca.banpara.b.br/v1/import' },
            { id: 'fld_2', nomeCampo: 'Timeout Máximo (s)', tipoCampo: 'Numérico', obrigatorio: false, valor: '60' }
          ]
        }
      ]
    };

    assert.equal(fmt.hasStructuredSpecContent(fullSpecReq), true);

    const viewerHtml = fmt.renderRequirementBanparaViewerHtml(fullSpecReq, { code: 'CRM', name: 'CRM 3.0' });
    assert.ok(viewerHtml.includes('Descrição Geral do Requisito'));
    assert.ok(viewerHtml.includes('Contexto de Execução (Pré e Pós-condições)'));
    assert.ok(viewerHtml.includes('Regras de Negócio (2)'));
    assert.ok(viewerHtml.includes('RN001'));
    assert.ok(viewerHtml.includes('O arquivo deve estar no formato CSV UTF-8.'));
    assert.ok(viewerHtml.includes('Parâmetros de Integração'));
    assert.ok(viewerHtml.includes('https://api.cobranca.banpara.b.br/v1/import'));

    const md = fmt.buildRequirementMarkdown(fullSpecReq);
    assert.ok(md.includes('## Descrição do Requisito'));
    assert.ok(md.includes('## Pré-condições'));
    assert.ok(md.includes('## Pós-condições'));
    assert.ok(md.includes('## Regras de Negócio'));
    assert.ok(md.includes('| RN001 | O arquivo deve estar no formato CSV UTF-8. |'));
    assert.ok(md.includes('## Parâmetros de Integração'));
    assert.ok(md.includes('- **Endpoint API:** https://api.cobranca.banpara.b.br/v1/import'));

    const prompt = aiAgent.buildCfpsUserPrompt(fullSpecReq, { countingType: 'Desenvolvimento' });
    assert.ok(prompt.includes('Permite ao analista importar a régua'));
    assert.ok(prompt.includes('RN001: O arquivo deve estar no formato CSV UTF-8.'));
    assert.ok(prompt.includes('Parâmetros de Integração'));
    assert.ok(prompt.includes('Endpoint API (Texto Curto): https://api.cobranca.banpara.b.br/v1/import'));

    const key1 = aiAgent.computeCfpsCacheKey(fullSpecReq, { countingType: 'Desenvolvimento' }, { provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    const fullSpecReqModifiedRN = {
      ...fullSpecReq,
      regrasNegocio: [...fullSpecReq.regrasNegocio, { codigo: 'RN003', descricao: 'Notificar gestor em caso de falha.' }]
    };
    const key2 = aiAgent.computeCfpsCacheKey(fullSpecReqModifiedRN, { countingType: 'Desenvolvimento' }, { provider: 'gemini', model: 'gemini-3.5-flash-lite' });
    assert.notEqual(key1, key2, 'Cache key CFPS deve invalidar ao alterar Regras de Negócio');

    // Valida arquivos da migration 003
    const upSql003 = fs.readFileSync(path.join(ROOT_DIR, 'migrations', '003_custom_sections_and_business_rules.sql'), 'utf8');
    const downSql003 = fs.readFileSync(path.join(ROOT_DIR, 'migrations', '003_custom_sections_and_business_rules.rollback.sql'), 'utf8');
    assert.ok(upSql003.includes('CREATE TABLE IF NOT EXISTS requirement_business_rules'));
    assert.ok(upSql003.includes('CREATE TABLE IF NOT EXISTS requirement_custom_sections'));
    assert.ok(downSql003.includes('DROP TABLE IF EXISTS requirement_business_rules'));
    assert.ok(downSql003.includes('DROP TABLE IF EXISTS requirement_custom_sections'));
  });
});

