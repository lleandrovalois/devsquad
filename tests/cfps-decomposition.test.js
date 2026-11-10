'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const tmpDbPath = path.join(os.tmpdir(), `synchro_cfps_test_${process.pid}_${Date.now()}.db`);
process.env.DB_PATH = tmpDbPath;

const {
  db,
  detectFormalExternalNotificationSe,
  analyzeCfpsSpecification,
  reconcileAiCfpsResult
} = require('../server');

after(() => {
  try { db.close(); } catch (_) { }
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(`${tmpDbPath}${suffix}`); } catch (_) { }
  }
});

describe('Regra 1: Disparo formal de e-mail / notificação externa como SE (Baixa / 4 PF)', () => {
  it('detecta disparo formal por e-mail e rejeita formulários simples ou alertas inline', () => {
    assert.equal(detectFormalExternalNotificationSe('O protocolo deve ser gerado e entregue em tela e por e-mail ao manifestante.', false), true);
    assert.equal(detectFormalExternalNotificationSe('Disparar e-mail de confirmação com layout próprio para o cliente.', false), true);
    assert.equal(detectFormalExternalNotificationSe('Informar e-mail e senha para autenticar no sistema.', true), false);
    assert.equal(detectFormalExternalNotificationSe('Exibir mensagem amigável de erro na tela para reprocessamento.', false), false);
    assert.equal(detectFormalExternalNotificationSe('Registrar demanda sem envio de e-mail ao solicitante.', false), false);
  });

  it('gera SE (Baixa / 4 PF) junto com EE e ALI em RF-04 no motor heurístico local', () => {
    const res = analyzeCfpsSpecification({
      code: 'RF-04',
      title: 'Resiliência e Fila de Entrada de Demandas do Portal Externo',
      feature: 'CAPTURA E INTEGRAÇÃO DE DEMANDAS (API)',
      userStory: 'Como: Cidadão / Cliente\nQuero: registrar minha manifestação pelo Portal Externo de Ouvidoria\nRN04.1: A recepção de demandas deve utilizar processamento orientado a filas.\nRN04.2: O protocolo de atendimento deve ser gerado e entregue em tela e por e-mail ao manifestante imediatamente.',
      bdd: 'Quando o cliente submeter o formulário\nEntão o sistema deve enfileirar a requisição e retornar o protocolo.'
    }, { countingType: 'Desenvolvimento', operationType: '' });

    const types = res.candidates.map(c => c.functionType);
    assert.ok(types.includes('ALI'), 'Desenvolvimento Novo deve incluir ALI');
    assert.ok(types.includes('EE'), 'Deve identificar EE de registro');
    assert.ok(types.includes('SE'), 'Deve identificar SE do e-mail formal');

    const se = res.candidates.find(c => c.functionType === 'SE');
    assert.equal(se.complexity, 'Baixa');
    assert.equal(se.rawPf, 4);
    assert.equal(se.finalPf, 4);
  });

  it('reconcileAiCfpsResult garante SE de disparo por e-mail quando a IA omitir', () => {
    const reconciled = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas',
        userRole: 'Cidadão',
        userWant: 'registrar manifestação e receber protocolo por e-mail',
        userBenefit: 'confirmação imediata',
        boundarySummary: 'Portal interno',
        detectedFields: ['Protocolo', 'Descrição', 'Status', 'E-mail'],
        functions: [
          {
            functionType: 'EE',
            name: 'EE - Registrar Manifestação',
            operationType: 'ADD',
            primaryIntent: 'Registrar demanda',
            td: 6,
            arTr: 1,
            tdList: ['Protocolo', 'Descrição', 'Status', 'E-mail', 'Acionamento', 'Retorno'],
            arTrList: ['ALI - Demandas'],
            rationale: 'EE de registro'
          }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 100,
      provider: 'gemini',
      providerLabel: 'Google Gemini',
      model: 'gemini-3.5-flash-lite'
    }, {
      title: 'Registro com protocolo por e-mail',
      userStory: 'O protocolo deve ser entregue por e-mail ao manifestante com dados da demanda.'
    }, { countingType: 'Desenvolvimento' });

    const se = reconciled.candidates.find(c => c.functionType === 'SE');
    assert.ok(se, 'Deve sintetizar SE formal de e-mail quando omitida');
    assert.equal(se.complexity, 'Baixa');
    assert.equal(se.finalPf, 4);
  });
});

describe('Regra 2: Respeito ao Tipo de Contagem (Desenvolvimento Novo vs Melhoria)', () => {
  it('Desenvolvimento Novo inclui ALI mesmo se já houver ALI cadastrado no projeto para outro requisito', () => {
    const now = new Date().toISOString();
    db.prepare('INSERT INTO projects (id, code, name, status, created_at) VALUES (?, ?, ?, ?, ?)').run('proj_dev_test', 'DEV-1', 'Projeto Teste', 'Ativo', now);
    db.prepare('INSERT INTO apf_items (id, code, name, project_id, function_type, category, td, ar_tr, complexity, raw_pf, counting_type, operation_type, factor, final_pf, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
      'apf_prev_ali', 'ALI-01', 'ALI - Estrutura de Dados: Demandas (CRM)', 'proj_dev_test', 'ALI', 'Dados', 6, 1, 'Baixa', 7, 'Desenvolvimento', 'ADD', 1, 7, now, now
    );

    const devRes = analyzeCfpsSpecification({
      title: 'Confirmação e Protocolo de Envio de Resposta Oficial no RDR/BCB',
      userStory: 'Quero enviar resposta oficial e persistir protocolo no histórico da demanda.',
      bdd: 'Quando clicar em "Enviar Resposta ao BCB" então deve persistir protocolo e status.',
      projectId: 'proj_dev_test'
    }, { projectId: 'proj_dev_test', countingType: 'Desenvolvimento' });

    assert.ok(devRes.candidates.some(c => c.functionType === 'ALI'), 'Em Desenvolvimento Novo, deve incluir ALI mantido pela EE em vez de assumir pré-existente');

    const enhRes = analyzeCfpsSpecification({
      title: 'Confirmação e Protocolo de Envio de Resposta Oficial no RDR/BCB',
      userStory: 'Quero enviar resposta oficial e persistir protocolo no histórico da demanda.',
      bdd: 'Quando clicar em "Enviar Resposta ao BCB" então deve persistir protocolo e status.',
      projectId: 'proj_dev_test'
    }, { projectId: 'proj_dev_test', countingType: 'Melhoria' });

    assert.equal(enhRes.candidates.some(c => c.functionType === 'ALI'), false, 'Em Melhoria, ALI pré-existente não alterado deve ser reutilizado como AR');
  });

  it('reconcileAiCfpsResult preserva/inclui ALI em Desenvolvimento Novo e reutiliza em Melhoria', () => {
    const aiPayload = {
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas',
        userRole: 'Cidadão',
        userWant: 'registrar manifestação',
        userBenefit: 'controle',
        boundarySummary: 'CRM',
        detectedFields: ['Protocolo', 'Descrição', 'Status', 'Data'],
        functions: [
          {
            functionType: 'EE',
            name: 'EE - Registrar Demanda',
            operationType: 'ADD',
            primaryIntent: 'Manter Demandas',
            td: 6,
            arTr: 1,
            tdList: ['Protocolo', 'Descrição', 'Status', 'Data', 'Acionamento', 'Retorno'],
            arTrList: ['ALI - Demandas'],
            rationale: 'EE'
          }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 50,
      provider: 'gemini',
      providerLabel: 'Gemini',
      model: 'gemini-3.5-flash-lite'
    };

    const devRec = reconcileAiCfpsResult(aiPayload, { projectId: 'proj_dev_test', title: 'Registro de Demanda' }, { projectId: 'proj_dev_test', countingType: 'Desenvolvimento' });
    assert.ok(devRec.candidates.some(c => c.functionType === 'ALI'), 'Deve sintetizar/manter ALI em Desenvolvimento Novo');

    const melRec = reconcileAiCfpsResult({
      ...aiPayload,
      parsed: {
        ...aiPayload.parsed,
        functions: [
          {
            functionType: 'ALI',
            name: 'ALI - Estrutura de Dados: Demandas (CRM)',
            operationType: 'ADD',
            primaryIntent: 'Manter Demandas',
            td: 6,
            arTr: 1,
            tdList: ['Protocolo', 'Descrição', 'Status', 'Data'],
            arTrList: ['Demandas'],
            rationale: 'ALI'
          },
          ...aiPayload.parsed.functions
        ]
      }
    }, { projectId: 'proj_dev_test', title: 'Melhoria em Demanda' }, { projectId: 'proj_dev_test', countingType: 'Melhoria' });
    assert.equal(melRec.candidates.some(c => c.functionType === 'ALI'), false, 'Em Melhoria, ALI já cadastrado no projeto deve ser tratado como pré-existente');
  });
});

