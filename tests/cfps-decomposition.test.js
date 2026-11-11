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

describe('Regra 3 & 4: Validação Determinística de Pós-Processamento, Catálogos AR e Quarentena RNF/Infra', () => {
  it('sobrepõe qualquer inferência errônea de complexidade/PF vinda da IA e isola brokers RabbitMQ/Kafka/SQS/CSS em 0 PF', () => {
    const res = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas',
        userRole: 'Atendente',
        userWant: 'registrar demanda validando contra Catálogo de Produtos via RabbitMQ com SLA < 3s e tags visuais CSS',
        userBenefit: 'padronização',
        boundarySummary: 'Sistema interno',
        detectedFields: ['Protocolo', 'Produto', 'Descrição', 'Prioridade', 'Status', 'Solicitante'],
        functions: [
          {
            functionType: 'ALI',
            name: 'ALI - Broker RabbitMQ / Fila SQS',
            operationType: 'ADD',
            primaryIntent: 'Mensageria',
            td: 3,
            arTr: 1,
            tdList: ['fila', 'payload', 'sla'],
            arTrList: ['RabbitMQ'],
            rationale: 'Alucinação infra'
          },
          {
            functionType: 'ALI',
            name: 'ALI - Demandas',
            operationType: 'ADD',
            primaryIntent: 'Manter demandas',
            td: 6,
            arTr: 1,
            tdList: ['Protocolo', 'Produto', 'Descrição', 'Prioridade', 'Status', 'Solicitante'],
            arTrList: ['Demandas'],
            rationale: 'Entidade principal'
          },
          {
            functionType: 'EE',
            name: 'EE - Registrar Demanda Validada',
            operationType: 'ADD',
            primaryIntent: 'Validar contra catálogo e persistir demanda',
            td: 7,
            arTr: 4,
            complexity: 'Alta', // valor errôneo proposital vindo da IA
            rawPf: 99,          // valor errôneo proposital vindo da IA
            finalPf: 99,        // valor errôneo proposital vindo da IA
            tdList: ['Protocolo', 'Produto', 'Descrição', 'Prioridade', 'Status', 'Acionamento', 'Retorno'],
            arTrList: ['ALI - Demandas', 'ALI - Catálogo de Produtos', 'AIE - Tabela de Risco', 'Broker Kafka'],
            rationale: 'EE validando catálogo'
          }
        ],
        inmItems: [
          { catalogKey: 'webhook_tecnico', quantity: 1, absorbed: false, justification: 'RabbitMQ/SQS e SLA < 3s' },
          { catalogKey: 'layout_alteracao', quantity: 1, absorbed: false, justification: 'Tags visuais CSS' }
        ],
        auditorNotes: []
      },
      latencyMs: 120,
      provider: 'gemini',
      providerLabel: 'Google Gemini',
      model: 'gemini-3.5-flash-lite'
    }, { title: 'Registrar demanda com validação de catálogo' }, { countingType: 'Desenvolvimento' });

    // Broker RabbitMQ/SQS como ALI deve ser removido
    assert.equal(res.candidates.some(c => /rabbitmq|sqs/i.test(c.name)), false);

    // EE recebeu 3 ARs reais (Broker Kafka removido dos 4) e 7 TDs -> matriz oficial DEVE impor Média (4 PF), ignorando 'Alta'/99
    const ee = res.candidates.find(c => c.functionType === 'EE');
    assert.equal(ee.arTr, 3);
    assert.equal(ee.td, 7);
    assert.equal(ee.complexity, 'Média');
    assert.equal(ee.rawPf, 4);
    assert.equal(ee.finalPf, 4);

    // RNF/FPN acompanhados de IFPUG devem estar absorvidos com 0 PF
    assert.equal(res.totalInmPf, 0);
    assert.ok(res.absorbedInmCandidates.length >= 2);
  });

  it('motor heurístico local conta >= 2 ARs quando formulário valida dados contra catálogo/tabela padronizada (2 AR, 8 TD -> Média 4 PF)', () => {
    const localRes = analyzeCfpsSpecification({
      title: 'Cadastrar Demanda com Validação em Catálogo',
      userStory: 'Como: Atendente\nQuero: registrar demanda (protocolo, produto, categoria, prioridade, descrição, status) validando contra catálogo de produtos e tabela de risco com mensageria RabbitMQ, SLA < 3s e tags visuais CSS.',
      bdd: 'Quando o atendente clicar em "Salvar" o sistema valida no catálogo de produtos e grava a demanda.'
    }, { countingType: 'Desenvolvimento', operationType: '' });

    const ee = localRes.candidates.find(c => c.functionType === 'EE');
    assert.ok(ee, 'Deve gerar EE');
    assert.equal(ee.arTr, 2);
    assert.equal(ee.td, 8);
    assert.equal(ee.complexity, 'Média');
    assert.equal(ee.rawPf, 4);
    assert.equal(localRes.totalInmPf, 0);
    assert.ok(localRes.absorbedInmCandidates.length >= 1, 'RabbitMQ/SLA/CSS devem constar como INM absorvido (0 PF)');
  });
});

describe('Regra 5: SE Parametrizada (Templates, Tags Dinâmicas {{...}} e Lógica Derivada/Condicional -> 2 ARs / Média 5 PF)', () => {
  const rf06Spec = {
    code: 'RF-06',
    title: 'Notificação Dinâmica de Subsídio por E-mail com Tags Estruturadas',
    feature: 'NOTIFICAÇÃO E SUBSÍDIO DA ÁREA TÉCNICA',
    userStory: `Como: Analista de Área Técnica / Retaguarda
Quero: receber e-mails de solicitação de subsídio contendo Protocolo, Nome do Cliente, Resumo do Relato e Indicador SARB 27
Para que: eu identifique o contexto, o contrato e a urgência da demanda direto da minha caixa de entrada, sem a obrigação de logar no CRM apenas para a leitura prévia.
Regras de Negócio (RN)
RN06.1: O template de e-mail deve mapear obrigatoriamente as tags: {{numero_protocolo}}, {{nome_cliente}}, {{resumo_demanda}} e {{indicador_sarb27}}.
RN06.2: A tag {{resumo_demanda}} deve ser montada concatenando a classificação inicial (Produto + Motivo) com o relato sintético da manifestação.`,
    bdd: `Cenário: Disparo automático de e-mail para a área técnica
  Dado que o coordenador solicitou subsídio para a Gerência responsável
  Quando o e-mail de notificação for despachado pelo sistema
  Então o assunto do e-mail deve conter "[Ouvidoria] Solicitação de Subsídio - Protocolo {{numero_protocolo}}"
  E o corpo do e-mail deve exibir o Nome Completo do Titular e o Resumo Conciso da Demanda
  E, caso a demanda seja SARB 27, deve conter um banner de alerta de atendimento prioritário regulatório.`
  };

  it('reconcileAiCfpsResult promove SE com 6 TDs e 1 AR para 2 ARs (Média / 5 PF) em RF-06 totalizando 12.00 PF com ALI', () => {
    const res = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Solicitação de Subsídio',
        userRole: 'Analista de Área Técnica',
        userWant: 'receber e-mails de solicitação de subsídio',
        userBenefit: 'identificar urgência',
        boundarySummary: 'CRM e canal SMTP externo',
        detectedFields: ['numero_protocolo', 'nome_cliente', 'resumo_demanda', 'indicador_sarb27'],
        functions: [
          {
            functionType: 'ALI',
            name: 'ALI - Estrutura de Dados: Solicitação de Subsídio',
            operationType: 'ADD',
            primaryIntent: 'Manter solicitações de subsídio',
            td: 4,
            arTr: 1,
            tdList: ['numero_protocolo', 'nome_cliente', 'resumo_demanda', 'indicador_sarb27'],
            arTrList: ['Solicitação de Subsídio'],
            rationale: 'ALI transacional'
          },
          {
            functionType: 'SE',
            name: 'SE - Enviar E-mail de Notificação de Subsídio',
            operationType: 'ADD',
            primaryIntent: 'Disparar e-mail com tags dinâmicas e banner condicional',
            td: 6,
            arTr: 1, // IA subestimou para 1 AR
            tdList: ['numero_protocolo', 'nome_cliente', 'resumo_demanda', 'indicador_sarb27', 'Acionamento', 'Retorno'],
            arTrList: ['ALI - Estrutura de Dados: Solicitação de Subsídio'],
            rationale: 'SE notificação'
          }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 80,
      provider: 'gemini',
      providerLabel: 'Google Gemini',
      model: 'gemini-3.5-flash-lite'
    }, rf06Spec, { countingType: 'Desenvolvimento' });

    const ali = res.candidates.find(c => c.functionType === 'ALI');
    const se = res.candidates.find(c => c.functionType === 'SE');
    assert.ok(ali);
    assert.equal(ali.finalPf, 7);
    assert.ok(se);
    assert.equal(se.name, 'SE - Enviar E-mail de Notificação de Subsídio');
    assert.equal(se.td, 6);
    assert.equal(se.arTr, 2);
    assert.equal(se.complexity, 'Média');
    assert.equal(se.rawPf, 5);
    assert.equal(se.finalPf, 5);
    assert.equal(res.totalGlobalPf, 12);
  });

  it('motor heurístico local calcula RF-06 como ALI (7 PF) + SE parametrizada (6 TD, 2 AR -> Média / 5 PF) = 12.00 PF', () => {
    const localRes = analyzeCfpsSpecification(rf06Spec, { countingType: 'Desenvolvimento', operationType: '' });
    const ali = localRes.candidates.find(c => c.functionType === 'ALI');
    const se = localRes.candidates.find(c => c.functionType === 'SE');
    assert.ok(ali, 'RF-06 em Desenvolvimento Novo deve conter ALI');
    assert.equal(ali.finalPf, 7);
    assert.ok(se, 'RF-06 deve detectar SE de notificação por e-mail');
    assert.equal(se.td, 6);
    assert.equal(se.arTr, 2);
    assert.equal(se.complexity, 'Média');
    assert.equal(se.rawPf, 5);
    assert.equal(se.finalPf, 5);
    assert.equal(localRes.totalGlobalPf, 12);
  });
});

describe('Regra 6: Conversão CE -> SE por Lógica Derivada e Cálculo Dinâmico de SLA/Dias Úteis (2 ARs / Média 5 PF)', () => {
  const rf07Spec = {
    code: 'RF-07',
    title: 'Painel Operacional da Caixa de Entrada do Agente de Ouvidoria',
    feature: 'CAIXA DE ENTRADA DO AGENTE & GESTÃO DA FILA',
    userStory: `Como: Agente de Ouvidoria

Quero: visualizar uma caixa de trabalho dedicada exclusivamente aos meus casos pendentes de ação ("Pendente Retorno Área" e "Pronta para Resposta"), com contagem regressiva de SLA e controle de prorrogação

Para que: eu gerencie meus prazos regulatórios com clareza, distinguindo minha fila de trabalho das telas de pesquisa geral.
Regras de Negócio (RN)
RN07.1: A tela "Minha Caixa de Entrada" deve listar apenas demandas atribuídas ao agente logado com status em aberto.
RN07.2: Cada linha deve exibir: Data/hora de entrada. Tempo restante (contagem regressiva em dias úteis e horas, com código de cores: verde > 48h, amarelo entre 24h e 48h, vermelho < 24h). Status do subsídio (Pendente de Retorno da Área ou Pronta para Resposta). Flag de Prorrogação (Sim ou Não).`,
    bdd: `Cenário: Visualização de prazos e contagem regressiva
  Dado que o agente acessa a sua Caixa de Entrada
  Quando o grid for renderizado
  Então deve exibir a coluna "Tempo Restante" com a contagem decrescente para o vencimento do prazo regulatório
  E destacar em vermelho casos com menos de 24 horas restantes.

Cenário: Indicação de prorrogação utilizada
  Dado que uma demanda já teve seu prazo prorrogado uma vez
  Quando exibida na caixa de entrada
  Então a coluna "Prorrogado" deve conter a tag "Sim"
  E o botão de solicitar nova prorrogação deve permanecer desabilitado caso atinja o teto da regra de negócio.`
  };

  it('reconcileAiCfpsResult converte CE com SLA regressivo em dias úteis para SE com >= 2 ARs (Média / 5 PF) e total 12.00 PF em RF-07', () => {
    const res = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas de Ouvidoria',
        userRole: 'Agente de Ouvidoria',
        userWant: 'visualizar caixa de entrada com contagem regressiva de SLA',
        userBenefit: 'gerenciar prazos regulatórios',
        boundarySummary: 'Sistema interno de Ouvidoria',
        detectedFields: ['Demanda', 'Agente', 'Data/hora de entrada', 'Tempo restante', 'Status do subsídio', 'Flag de prorrogação'],
        functions: [
          {
            functionType: 'ALI',
            name: 'ALI - Demandas de Ouvidoria',
            operationType: 'ADD',
            primaryIntent: 'Armazenar demandas de ouvidoria',
            td: 6,
            arTr: 1,
            tdList: ['Demanda', 'Agente', 'Data/hora de entrada', 'SLA Regulatório', 'Status do subsídio', 'Flag de prorrogação'],
            arTrList: ['Demandas de Ouvidoria'],
            rationale: 'ALI principal'
          },
          {
            functionType: 'CE', // Alucinação conceitual: IA classificou SLA regressivo como CE com 1 AR
            name: 'CE - Painel da Caixa de Entrada com SLA Regressivo',
            operationType: 'ADD',
            primaryIntent: 'Consultar casos com contagem regressiva de tempo restante em dias úteis',
            td: 8,
            arTr: 1,
            tdList: ['Demanda', 'Agente', 'Data/hora de entrada', 'Tempo restante', 'Status do subsídio', 'Flag de prorrogação', 'Acionamento', 'Mensagem'],
            arTrList: ['ALI - Demandas de Ouvidoria'],
            rationale: 'IA classificou incorretamente como CE'
          }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 90,
      provider: 'gemini',
      providerLabel: 'Google Gemini',
      model: 'gemini-3.5-flash-lite'
    }, rf07Spec, { countingType: 'Desenvolvimento' });

    assert.equal(res.candidates.some(c => c.functionType === 'CE'), false, 'CE deve ser convertida em SE quando houver cálculo dinâmico de SLA');
    const ali = res.candidates.find(c => c.functionType === 'ALI');
    const se = res.candidates.find(c => c.functionType === 'SE');
    assert.ok(ali);
    assert.equal(ali.td, 6);
    assert.equal(ali.arTr, 1);
    assert.equal(ali.complexity, 'Baixa');
    assert.equal(ali.finalPf, 7);

    assert.ok(se);
    assert.equal(se.name, 'SE - Painel da Caixa de Entrada com SLA Regressivo');
    assert.equal(se.td, 8);
    assert.equal(se.arTr, 2);
    assert.equal(se.complexity, 'Média');
    assert.equal(se.rawPf, 5);
    assert.equal(se.finalPf, 5);
    assert.equal(res.totalGlobalPf, 12);
  });

  it('motor heurístico local calcula RF-07 como ALI (1 RET, 6 DET -> Baixa / 7 PF) + SE (2 FTR, 8 DET -> Média / 5 PF) = 12.00 PF', () => {
    const localRes = analyzeCfpsSpecification(rf07Spec, { countingType: 'Desenvolvimento', operationType: '' });
    assert.equal(localRes.candidates.some(c => c.functionType === 'CE'), false, 'Não deve gerar CE em painel com contagem regressiva de SLA');

    const ali = localRes.candidates.find(c => c.functionType === 'ALI');
    const se = localRes.candidates.find(c => c.functionType === 'SE');
    assert.ok(ali, 'Desenvolvimento Novo deve incluir ALI de Demandas');
    assert.equal(ali.arTr, 1);
    assert.equal(ali.td, 6);
    assert.equal(ali.complexity, 'Baixa');
    assert.equal(ali.finalPf, 7);

    assert.ok(se, 'Deve classificar painel com cálculo de SLA em dias úteis como SE');
    assert.equal(se.arTr, 2);
    assert.equal(se.td, 8);
    assert.equal(se.complexity, 'Média');
    assert.equal(se.rawPf, 5);
    assert.equal(se.finalPf, 5);
    assert.equal(localRes.totalGlobalPf, 12);
  });

  it('mantém como CE quando houver negação explícita de cálculos ou fórmulas matemáticas', () => {
    const pureCe = analyzeCfpsSpecification({
      title: 'Listagem Informativa de Demandas Sem Cálculo',
      userStory: 'Como: Atendente\nQuero: listar demandas com protocolo, status, data e tempo restante fixo sem cálculo de SLA e sem fórmulas matemáticas no grid.'
    }, { countingType: 'Melhoria', operationType: 'ADD' });

    assert.equal(pureCe.candidates.some(c => c.functionType === 'SE'), false);
    assert.ok(pureCe.candidates.some(c => c.functionType === 'CE'));
  });

  it('reconcileAiCfpsResult remove ALI secundário de Parâmetros de SLA quando usado apenas como AR 2 da SE em RF-07 (total 12.00 PF)', () => {
    const res = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas',
        userRole: 'Agente de Ouvidoria',
        userWant: 'visualizar caixa de entrada com SLA regressivo',
        userBenefit: 'gerenciar prazos',
        boundarySummary: 'Sistema interno',
        detectedFields: ['Demanda', 'Agente', 'Data/hora entrada', 'Tempo restante', 'Status', 'Prorrogado'],
        functions: [
          {
            functionType: 'ALI',
            name: 'ALI - Estrutura de Dados: Demandas',
            operationType: 'ADD',
            primaryIntent: 'Armazenar demandas',
            td: 6,
            arTr: 1,
            tdList: ['Demanda', 'Agente', 'Data/hora entrada', 'Prazo SLA', 'Status', 'Prorrogado'],
            arTrList: ['Demandas'],
            rationale: 'ALI principal'
          },
          {
            functionType: 'ALI',
            name: 'ALI - Estrutura de Dados: Parâmetros de SLA',
            operationType: 'ADD',
            primaryIntent: 'Tabela auxiliar de SLA',
            td: 3,
            arTr: 1,
            tdList: ['id_regra', 'dias_uteis', 'horario_limite'],
            arTrList: ['Parametros_SLA'],
            rationale: 'ALI auxiliar indevido'
          },
          {
            functionType: 'SE',
            name: 'SE - Painel da Caixa de Entrada com SLA Regressivo',
            operationType: 'ADD',
            primaryIntent: 'Exibir painel com cálculo de SLA em dias úteis',
            td: 8,
            arTr: 2,
            tdList: ['Demanda', 'Agente', 'Data/hora entrada', 'Tempo restante', 'Status', 'Prorrogado', 'Acionamento', 'Retorno'],
            arTrList: ['ALI - Demandas', 'ALI - Parâmetros de SLA'],
            rationale: 'SE painel SLA'
          }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 80,
      provider: 'gemini',
      providerLabel: 'Gemini',
      model: 'gemini-3.5-flash-lite'
    }, rf07Spec, { countingType: 'Desenvolvimento' });

    const alis = res.candidates.filter(c => c.functionType === 'ALI');
    assert.equal(alis.length, 1);
    assert.equal(alis[0].name, 'ALI - Estrutura de Dados: Demandas');
    assert.equal(res.totalGlobalPf, 12);
  });
});

describe('Regra 7: Atomicidade de Entradas Externas (EE) — Separação Atuação Assistida vs Transferência (RF-08 -> 5 componentes / 25–26 PF)', () => {
  const rf08Spec = {
    code: 'RF-08',
    title: 'Acesso Global Assistido e Transferência de Agente Responsável',
    feature: 'CAIXA DE ENTRADA DO AGENTE & GESTÃO DA FILA',
    userStory: `Como: Agente / Coordenador de Ouvidoria

Quero: consultar e atuar de forma assistida em casos de outros colegas e poder reatribuir o agente responsável pela demanda

Para que: o atendimento presencial/telefônico de clientes recorrentes não seja interrompido e seja viável cobrir férias, licenças e escalas.

Regras de Negócio (RN)
RN08.1: Todo ouvidor com perfil autorizado pode buscar demandas de outros analistas via busca global assistida.

RN08.2: Qualquer interação realizada em demanda de outro agente deve gravar registro de auditoria (Quem atuou, data/hora e justificativa da ação).

RN08.3: Coordenadores e os próprios agentes podem transferir a responsabilidade da demanda para outro ouvidor, movendo o caso imediatamente para a caixa de trabalho do novo responsável.`,
    bdd: `Cenário: Atuação assistida em demanda de colega em férias
  Dado que o Agente "A" precisa atender um cliente presencial cuja demanda pertence ao Agente "B"
  Quando o Agente "A" localizar a demanda e registrar um andamento
  Então o sistema deve permitir o registro
  E gravar na linha do tempo da auditoria: "Andamento cadastrado por Agente A em cobertura/modo assistido".

Cenário: Repasse de demanda entre ouvidores
  Dado que um ouvidor precisa repassar seu caso para outro analista
  Quando selecionar a opção "Transferir Responsável" e escolher o novo agente
  Então a demanda deve desaparecer da Caixa de Entrada do ouvidor de origem
  E passar a figurar imediatamente na Caixa de Entrada do novo agente responsável com notificação interna.`
  };

  it('reconcileAiCfpsResult separa EE fundida pela IA em duas EEs Média (4 PF), garante ALI Auditoria e CE Busca Global (25.00 PF)', () => {
    const res = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas de Ouvidoria',
        userRole: 'Agente / Coordenador',
        userWant: 'atuar de forma assistida e transferir responsável',
        userBenefit: 'continuidade de atendimento',
        boundarySummary: 'CRM interno',
        detectedFields: ['Demanda', 'Agente Responsável', 'Quem atuou', 'Data/hora', 'Justificativa'],
        functions: [
          {
            functionType: 'ALI',
            name: 'ALI - Estrutura de Dados: Demandas de Ouvidoria',
            operationType: 'ADD',
            primaryIntent: 'Manter demandas de ouvidoria',
            td: 5,
            arTr: 1,
            tdList: ['ID Demanda', 'Status', 'Agente Responsável', 'Cliente', 'Descrição'],
            arTrList: ['Demandas'],
            rationale: 'ALI principal'
          },
          {
            functionType: 'EE', // Agrupamento indevido pela IA
            name: 'EE - Registrar Atuação Assistida e Transferir Responsável',
            operationType: 'ADD',
            primaryIntent: 'Registrar andamento e transferir agente responsável com auditoria',
            td: 8,
            arTr: 2,
            tdList: ['Demanda', 'Andamento', 'Novo Agente', 'Quem atuou', 'Data/hora', 'Justificativa', 'Acionamento', 'Retorno'],
            arTrList: ['ALI - Demandas', 'ALI - Auditoria'],
            rationale: 'Agrupamento indevido'
          }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 90,
      provider: 'gemini',
      providerLabel: 'Gemini',
      model: 'gemini-3.5-flash-lite'
    }, rf08Spec, { countingType: 'Desenvolvimento' });

    assert.equal(res.candidates.length, 5);
    const alis = res.candidates.filter(c => c.functionType === 'ALI');
    const ees = res.candidates.filter(c => c.functionType === 'EE');
    const ces = res.candidates.filter(c => c.functionType === 'CE');
    assert.equal(alis.length, 2, 'Deve conter ALI Demandas e ALI Auditoria/Histórico');
    assert.equal(ees.length, 2, 'Deve decompor em 2 EEs separadas');
    assert.equal(ces.length, 1, 'Deve incluir CE Busca Global Assistida');
    ees.forEach(ee => {
      assert.equal(ee.complexity, 'Média');
      assert.equal(ee.finalPf, 4);
    });
    assert.ok(res.totalGlobalPf >= 25 && res.totalGlobalPf <= 26, `Esperado 25..26 PF, obtido ${res.totalGlobalPf}`);
  });

  it('reconcileAiCfpsResult promove EE Transferir Responsável de 1 AR (Baixa 3 PF) para 2 ARs (Média 4 PF)', () => {
    const res = reconcileAiCfpsResult({
      parsed: {
        operationType: 'ADD',
        entityName: 'Demandas',
        userRole: 'Agente',
        userWant: 'atuar assistido e transferir responsável',
        userBenefit: 'continuidade',
        boundarySummary: 'CRM',
        detectedFields: ['Demanda', 'Agente', 'Justificativa'],
        functions: [
          { functionType: 'ALI', name: 'ALI - Demandas', operationType: 'ADD', td: 6, arTr: 1, tdList: ['id', 'status', 'agente', 'cliente', 'desc', 'data'], arTrList: ['Demandas'] },
          { functionType: 'ALI', name: 'ALI - Auditoria de Atendimento', operationType: 'ADD', td: 5, arTr: 1, tdList: ['id', 'demanda', 'executor', 'data', 'justificativa'], arTrList: ['Auditoria'] },
          { functionType: 'EE', name: 'EE - Registrar Atuação Assistida com Log de Auditoria', operationType: 'ADD', td: 6, arTr: 2, tdList: ['demanda', 'andamento', 'executor', 'justificativa', 'btn', 'msg'], arTrList: ['ALI - Demandas', 'ALI - Auditoria'] },
          { functionType: 'EE', name: 'EE - Transferir Agente Responsável', operationType: 'ADD', td: 5, arTr: 1, tdList: ['demanda', 'novo_agente', 'justificativa', 'btn', 'msg'], arTrList: ['ALI - Demandas'] },
          { functionType: 'CE', name: 'CE - Busca Global Assistida de Demandas', operationType: 'ADD', td: 5, arTr: 1, tdList: ['filtro', 'agente', 'status', 'btn', 'msg'], arTrList: ['ALI - Demandas'] }
        ],
        inmItems: [],
        auditorNotes: []
      },
      latencyMs: 70,
      provider: 'gemini',
      providerLabel: 'Gemini',
      model: 'gemini-3.5-flash-lite'
    }, rf08Spec, { countingType: 'Desenvolvimento' });

    const transferEe = res.candidates.find(c => c.functionType === 'EE' && /transfer/i.test(c.name));
    assert.ok(transferEe);
    assert.equal(transferEe.arTr, 2);
    assert.equal(transferEe.complexity, 'Média');
    assert.equal(transferEe.finalPf, 4);
    assert.equal(res.totalGlobalPf, 25);
  });

  it('motor heurístico local calcula RF-08 com 5 componentes (2 ALIs + 2 EEs Média + 1 CE) totalizando 25.00 PF', () => {
    const localRes = analyzeCfpsSpecification(rf08Spec, { countingType: 'Desenvolvimento', operationType: '' });
    assert.equal(localRes.candidates.length, 5);
    assert.equal(localRes.summary.countAli, 2);
    assert.equal(localRes.summary.countEe, 2);
    assert.equal(localRes.summary.countCe, 1);
    const ees = localRes.candidates.filter(c => c.functionType === 'EE');
    ees.forEach(ee => {
      assert.equal(ee.arTr, 2);
      assert.equal(ee.complexity, 'Média');
      assert.equal(ee.finalPf, 4);
    });
    assert.equal(localRes.totalGlobalPf, 25);
  });
});





