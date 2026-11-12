const { describe, it } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

describe('Persistência e Exportação de Seções Customizadas e Regras de Negócio', () => {
  const scriptContent = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8');

  it('script.js deve incluir secoesCustomizadas e regrasNegocio em store.addRequirement', () => {
    assert.ok(
      scriptContent.includes('secoesCustomizadas: Array.isArray(data.secoesCustomizadas) ? data.secoesCustomizadas : []'),
      'store.addRequirement deve incluir secoesCustomizadas'
    );
    assert.ok(
      scriptContent.includes('regrasNegocio: Array.isArray(data.regrasNegocio) ? data.regrasNegocio : []'),
      'store.addRequirement deve incluir regrasNegocio'
    );
    assert.ok(
      scriptContent.includes('descricaoRequisito: data.descricaoRequisito || \'\''),
      'store.addRequirement deve incluir descricaoRequisito'
    );
  });

  it('script.js deve atualizar secoesCustomizadas e regrasNegocio em store.updateRequirement', () => {
    assert.ok(
      scriptContent.includes('if (Array.isArray(data.secoesCustomizadas)) req.secoesCustomizadas = data.secoesCustomizadas;'),
      'store.updateRequirement deve atualizar req.secoesCustomizadas'
    );
    assert.ok(
      scriptContent.includes('if (Array.isArray(data.regrasNegocio)) req.regrasNegocio = data.regrasNegocio;'),
      'store.updateRequirement deve atualizar req.regrasNegocio'
    );
  });

  it('script.js deve possuir coletores do DOM para secoesCustomizadas e regrasNegocio', () => {
    assert.ok(
      scriptContent.includes('window.collectReqCustomSectionsFromDOM'),
      'window.collectReqCustomSectionsFromDOM deve estar definido'
    );
    assert.ok(
      scriptContent.includes('window.collectReqBusinessRulesFromDOM'),
      'window.collectReqBusinessRulesFromDOM deve estar definido'
    );
    // Verificar que o typo campos[fIdx] foi corrigido
    assert.ok(
      !scriptContent.includes('reqFormDraft.secoesCustomizadas[${sIdx}].campos[fIdx].nomeCampo'),
      'Typo campos[fIdx] deve ser corrigido para campos[${fIdx}]'
    );
  });

  it('exportSingleRequirementSpecPDF deve renderizar seções customizadas sem emojis que quebram fontes Helvetica do jsPDF', () => {
    assert.ok(
      scriptContent.includes('Seção Personalizada: ${sec.tituloSecao || \'Seção\'}:'),
      'exportSingleRequirementSpecPDF deve usar texto limpo para seções customizadas'
    );
  });

  it('exportMeasurementReportPDF e printMeasurementReport devem incluir secoesCustomizadas e regrasNegocio', () => {
    assert.ok(
      scriptContent.includes('r.secoesCustomizadas.forEach(sec => {'),
      'exportMeasurementReportPDF deve incluir seções customizadas no relatório de medição'
    );
    assert.ok(
      scriptContent.includes('req.secoesCustomizadas.map(sec =>'),
      'printMeasurementReport deve incluir seções customizadas na impressão'
    );
  });
});
