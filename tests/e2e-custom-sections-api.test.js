'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

describe('E2E API Roundtrip: Regras de Negócio e Seções Customizadas', async () => {
  const PORT = 3001;

  function apiRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
      const data = body ? JSON.stringify(body) : null;
      const req = http.request({
        hostname: '127.0.0.1',
        port: PORT,
        path: urlPath,
        method,
        headers: {
          'Content-Type': 'application/json',
          'x-user-role': 'admin',
          ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
        }
      }, (res) => {
        let respBody = '';
        res.on('data', chunk => { respBody += chunk; });
        res.on('end', () => {
          let parsed;
          try { parsed = JSON.parse(respBody); } catch (_) { parsed = respBody; }
          resolve({ status: res.statusCode, body: parsed });
        });
      });
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }

  it('salva e recupera projeto com template de seções customizadas', async () => {
    const projRes = await apiRequest('GET', '/api/projects');
    assert.equal(projRes.status, 200);
    const projects = projRes.body;
    assert.ok(projects.length > 0);
    const pId = projects[0].id;

    const templatePayload = [
      {
        id: 'tmpl_sec_1',
        tituloSecao: 'Configurações de Faturamento',
        ordem: 0,
        campos: [
          { id: 'fld_1', nomeCampo: 'Centro de Custo', tipoCampo: 'Texto Curto', obrigatorio: true, valor: '' },
          { id: 'fld_2', nomeCampo: 'Alíquota ISS (%)', tipoCampo: 'Numérico', obrigatorio: false, valor: '5' }
        ]
      }
    ];

    const saveTmplRes = await apiRequest('POST', `/api/projects/${pId}/sections-template`, { template: templatePayload });
    assert.equal(saveTmplRes.status, 200);
    assert.equal(saveTmplRes.body.success, true);

    const getProjRes = await apiRequest('GET', '/api/projects');
    const updatedProj = getProjRes.body.find(p => p.id === pId);
    assert.ok(updatedProj);
    assert.deepEqual(updatedProj.customSectionsTemplate, templatePayload);
  });

  it('cria, recupera e atualiza requisito com descrição, pré/pós-condições, RNs e seções customizadas', async () => {
    const projRes = await apiRequest('GET', '/api/projects');
    const pId = projRes.body[0].id;

    const newReqPayload = {
      title: 'Emissão de Guia de Recolhimento Pix E2E',
      code: 'RF-E2E-01',
      projectId: pId,
      feature: 'Arrecadação',
      type: 'functional',
      moscow: 'Must',
      numeroProcessMaker: '9999/2026',
      versaoAtual: '1.0',
      descricaoRequisito: 'Permite gerar QR Code dinâmico Pix para quitação instantânea de guias.',
      preCondicoes: 'Guia tributária deve estar em aberto e validada na SEFA.',
      posCondicoes: 'Status da guia passa para Quitado em até 10 segundos após confirmação do BACEN.',
      fluxoPrincipal: '1. Acessar Guia\n2. Clicar em Pagar com Pix\n3. Apresentar QR Code',
      regrasNegocio: [
        { codigo: 'RN001', descricao: 'QR Code expira em 30 minutos após geração.' },
        { codigo: 'RN002', descricao: 'Valor do Pix não pode sofrer alteração manual pelo contribuinte.' }
      ],
      secoesCustomizadas: [
        {
          id: 'sec_pix',
          tituloSecao: 'Parâmetros BACEN Pix',
          ordem: 0,
          campos: [
            { id: 'f_chave', nomeCampo: 'Chave Pix SEFAZ', tipoCampo: 'Texto Curto', obrigatorio: true, valor: 'arrecadacao@sefa.pa.gov.br' },
            { id: 'f_timeout', nomeCampo: 'Polling Bacen (s)', tipoCampo: 'Numérico', obrigatorio: true, valor: '3' }
          ]
        }
      ],
      telas: [
        { id: 't_1', title: 'Tela QR Code', url: 'https://cdn.flow.com.br/screen1.png' }
      ],
      entradas: [
        { campo: 'Número da Guia', descricao: 'Identificador único', tipoCampo: 'Numérico', obrigatorio: true, regra: 'Visível: Sim | Editável: Não' }
      ],
      saidas: [
        { campo: 'Status Pix', descricao: 'Situação da transação', tipoCampo: 'Status', obrigatorio: true, regra: 'Pendente / Pago / Expirado' }
      ],
      criteriosAceite: [
        { item: 'CA001', tipo: 'Negócio (N)', categoria: 'Específico', descricao: 'Liquidação da guia no ERP em até 5 segundos.' }
      ]
    };

    const createRes = await apiRequest('POST', '/api/requirements', newReqPayload);
    assert.equal(createRes.status, 201);
    const createdReq = createRes.body;
    assert.ok(createdReq.id);
    assert.equal(createdReq.code, 'RF-E2E-01');
    assert.equal(createdReq.descricaoRequisito, newReqPayload.descricaoRequisito);
    assert.equal(createdReq.preCondicoes, newReqPayload.preCondicoes);
    assert.equal(createdReq.posCondicoes, newReqPayload.posCondicoes);
    assert.equal(createdReq.regrasNegocio.length, 2);
    assert.equal(createdReq.regrasNegocio[0].codigo, 'RN001');
    assert.equal(createdReq.secoesCustomizadas.length, 1);
    assert.equal(createdReq.secoesCustomizadas[0].tituloSecao, 'Parâmetros BACEN Pix');

    // Recupera todos os dados pelo endpoint geral
    const getRes = await apiRequest('GET', '/api/requirements');
    const fetched = getRes.body.find(r => r.id === createdReq.id);
    assert.ok(fetched);
    assert.equal(fetched.descricaoRequisito, newReqPayload.descricaoRequisito);
    assert.equal(fetched.preCondicoes, newReqPayload.preCondicoes);
    assert.equal(fetched.posCondicoes, newReqPayload.posCondicoes);
    assert.equal(fetched.regrasNegocio.length, 2);
    assert.equal(fetched.regrasNegocio[0].codigo, 'RN001');
    assert.equal(fetched.regrasNegocio[1].codigo, 'RN002');
    assert.equal(fetched.secoesCustomizadas.length, 1);
    assert.equal(fetched.secoesCustomizadas[0].campos.length, 2);

    // Atualiza o requisito via PUT
    const updatePayload = {
      ...newReqPayload,
      versaoAtual: '1.1',
      regrasNegocio: [
        { codigo: 'RN001', descricao: 'QR Code expira em 15 minutos.' },
        { codigo: 'RN002', descricao: 'Valor do Pix não pode sofrer alteração manual pelo contribuinte.' },
        { codigo: 'RN003', descricao: 'Notificar via Webhook em caso de estorno.' }
      ]
    };

    const putRes = await apiRequest('PUT', `/api/requirements/${createdReq.id}`, updatePayload);
    assert.equal(putRes.status, 200);

    const getUpdatedRes = await apiRequest('GET', '/api/requirements');
    const updated = getUpdatedRes.body.find(r => r.id === createdReq.id);
    assert.ok(updated);
    assert.equal(updated.versaoAtual, '1.1');
    assert.equal(updated.regrasNegocio.length, 3);
    assert.equal(updated.regrasNegocio[0].descricao, 'QR Code expira em 15 minutos.');
    assert.equal(updated.regrasNegocio[2].codigo, 'RN003');

    // Limpa o requisito de teste criado
    await apiRequest('DELETE', `/api/requirements/${createdReq.id}`);
  });
});
