/**
 * ==============================================================================
 * Flow PRO - Agente Especialista CFPS & Mensuração IFPUG / SISP via IA
 * Motor multi-provedor (Google Gemini Interactions API, OpenAI, Anthropic,
 * Ollama / Compatíveis OpenAI) com Saída Estruturada JSON e Zero Dependências.
 * ==============================================================================
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const CFPS_PROMPT_VERSION = '2026-11-11-v10';

const PROVIDER_CATALOG = {
  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-3.5-flash-lite',
    suggestedModels: ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.8-flash', 'gemini-3.1-flash-lite'],
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    requiresApiKey: true,
    envKeys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY']
  },
  openai: {
    id: 'openai',
    label: 'OpenAI (ChatGPT / GPT)',
    defaultModel: 'gpt-4.1',
    suggestedModels: ['gpt-4.1', 'gpt-4o', 'o4-mini'],
    defaultBaseUrl: 'https://api.openai.com/v1',
    requiresApiKey: true,
    envKeys: ['OPENAI_API_KEY']
  },
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-5',
    suggestedModels: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-3-7-sonnet-latest'],
    defaultBaseUrl: 'https://api.anthropic.com',
    requiresApiKey: true,
    envKeys: ['ANTHROPIC_API_KEY']
  },
  openai_compatible: {
    id: 'openai_compatible',
    label: 'Ollama / OpenRouter / Compatível OpenAI',
    defaultModel: 'llama3.1',
    suggestedModels: ['llama3.1', 'qwen2.5', 'deepseek-r1', 'openai/gpt-4.1'],
    defaultBaseUrl: 'http://localhost:11434/v1',
    requiresApiKey: false,
    envKeys: ['AI_API_KEY', 'OPENROUTER_API_KEY', 'GROQ_API_KEY']
  }
};

const CFPS_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    operationType: {
      type: 'string',
      enum: ['ADD', 'CHG', 'DEL'],
      description: 'Tipo de operação predominante: ADD (inclusão/novo), CHG (alteração/melhoria) ou DEL (exclusão).'
    },
    entityName: {
      type: 'string',
      description: 'Nome limpo da entidade de negócio principal tratada pelo requisito.'
    },
    userRole: {
      type: 'string',
      description: 'Papel ou ator principal da história de usuário.'
    },
    userWant: {
      type: 'string',
      description: 'Objetivo funcional desejado pelo usuário.'
    },
    userBenefit: {
      type: 'string',
      description: 'Benefício ou valor de negócio esperado.'
    },
    boundarySummary: {
      type: 'string',
      description: 'Explicação objetiva da fronteira da aplicação (o que é interno vs externo).'
    },
    detectedFields: {
      type: 'array',
      items: { type: 'string' },
      description: 'Lista de atributos/campos de negócio identificados (sem incluir os +2 TDs de controle).'
    },
    functions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          functionType: {
            type: 'string',
            enum: ['ALI', 'AIE', 'EE', 'SE', 'CE'],
            description: 'Classificação oficial IFPUG CPM 4.3.1.'
          },
          name: {
            type: 'string',
            description: 'Nome claro da função no padrão "<TIPO> - <Descrição>" (ex: "ALI - Estrutura de Dados: Demandas (CRM)", "AIE - Interface Externa: API Reclame Aqui", "EE - Incluir/Processar Reclamações").'
          },
          operationType: {
            type: 'string',
            enum: ['ADD', 'CHG', 'DEL']
          },
          primaryIntent: {
            type: 'string',
            description: 'Intenção primária segundo o manual IFPUG CPM 4.3.1.'
          },
          td: {
            type: 'integer',
            description: 'Quantidade de Tipos de Dados (DETs). Em ALI/AIE contar apenas campos de negócio persistidos/referenciados; em EE/SE/CE somar campos de negócio que cruzam a fronteira + 2 TDs de controle (acionamento + mensagem/log de retorno).'
          },
          arTr: {
            type: 'integer',
            description: 'Quantidade de TRs (RETs) para ALI/AIE, ou de ARs (FTRs = total de ALIs e AIEs lidos/mantidos) para EE/SE/CE.'
          },
          tdList: {
            type: 'array',
            items: { type: 'string' },
            description: 'Atributos/campos específicos que justificam o td.'
          },
          arTrList: {
            type: 'array',
            items: { type: 'string' },
            description: 'Arquivos lógicos (ALIs/AIEs) ou subgrupos (TRs) referenciados que justificam o arTr.'
          },
          rationale: {
            type: 'string',
            description: 'Justificativa técnica pericial CFPS citando a regra do IFPUG CPM 4.3.1.'
          }
        },
        required: ['functionType', 'name', 'operationType', 'primaryIntent', 'td', 'arTr', 'tdList', 'arTrList', 'rationale'],
        additionalProperties: false
      }
    },
    inmItems: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          catalogKey: {
            type: 'string',
            enum: [
              'code_table_inclusao',
              'code_table_alteracao',
              'menu_item',
              'layout_alteracao',
              'componente_ui',
              'parametro_sistema',
              'perfil_seguranca',
              'db_view_indice',
              'db_trigger_proc',
              'script_saneamento',
              'relatorio_simples',
              'webhook_tecnico'
            ]
          },
          quantity: { type: 'number' },
          absorbed: {
            type: 'boolean',
            description: 'true quando o item técnico/UI/webhook faz parte de um processo elementar IFPUG já medido (exclusão mútua SISP).'
          },
          justification: { type: 'string' }
        },
        required: ['catalogKey', 'quantity', 'absorbed', 'justification'],
        additionalProperties: false
      }
    },
    auditorNotes: {
      type: 'array',
      items: { type: 'string' },
      description: 'Notas técnicas consolidadas do auditor CFPS sobre fronteira, ciclo de vida de dados e travas SISP.'
    }
  },
  required: [
    'operationType',
    'entityName',
    'userRole',
    'userWant',
    'userBenefit',
    'boundarySummary',
    'detectedFields',
    'functions',
    'inmItems',
    'auditorNotes'
  ],
  additionalProperties: false
};

/**
 * Carrega variáveis de um arquivo .env local sem sobrescrever variáveis já definidas no ambiente.
 */
function loadDotEnv(envPath = path.join(__dirname, '.env')) {
  try {
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    raw.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) return;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    });
  } catch (err) {
    console.warn('⚠️ Falha ao carregar .env:', err.message);
  }
}

/**
 * Mascara API keys para retorno seguro em respostas HTTP ao frontend.
 */
function maskApiKey(key) {
  const clean = (key || '').trim();
  if (!clean) return '';
  if (clean.length <= 10) return '••••••';
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

/**
 * Resolve a configuração efetiva de IA mesclando SQLite (app_settings) com variáveis de ambiente.
 */
function resolveEffectiveAiConfig(savedConfig = {}) {
  const envProvider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  const providerCandidate = (savedConfig.provider || envProvider || 'gemini').trim().toLowerCase();
  const providerMeta = PROVIDER_CATALOG[providerCandidate] || PROVIDER_CATALOG.gemini;

  const model = (savedConfig.model || process.env.AI_MODEL || '').trim() || providerMeta.defaultModel;
  const baseUrl = (savedConfig.baseUrl || process.env.AI_BASE_URL || (providerMeta.id === 'openai_compatible' ? process.env.OLLAMA_BASE_URL : '') || '').trim() || providerMeta.defaultBaseUrl;

  let envApiKey = (process.env.AI_API_KEY || '').trim();
  if (!envApiKey) {
    for (const k of providerMeta.envKeys) {
      if (process.env[k] && process.env[k].trim()) {
        envApiKey = process.env[k].trim();
        break;
      }
    }
  }

  const savedApiKey = (savedConfig.apiKey || '').trim();
  const effectiveApiKey = savedApiKey || envApiKey;
  const enabled = savedConfig.enabled !== undefined ? Boolean(savedConfig.enabled) : true;
  const fallbackEnabled = savedConfig.fallbackEnabled !== undefined ? Boolean(savedConfig.fallbackEnabled) : true;

  const isReady = enabled && (Boolean(effectiveApiKey) || !providerMeta.requiresApiKey);

  return {
    enabled,
    fallbackEnabled,
    provider: providerMeta.id,
    providerLabel: providerMeta.label,
    model,
    baseUrl,
    apiKey: effectiveApiKey,
    hasApiKey: Boolean(effectiveApiKey),
    apiKeySource: savedApiKey ? 'database' : (envApiKey ? 'env' : 'none'),
    apiKeyMasked: maskApiKey(effectiveApiKey),
    requiresApiKey: providerMeta.requiresApiKey,
    isReady
  };
}

/**
 * Constrói a instrução de sistema do Agente Auditor CFPS (IFPUG CPM 4.3.1 + SISP v2.3).
 */
function buildCfpsSystemInstruction() {
  return `Você é um Especialista Certificado em Análise de Pontos de Função (CFPS - Certified Function Point Specialist) seguindo rigorosamente o Manual de Práticas de Contagem IFPUG CPM 4.3.1 e o Roteiro de Métricas SISP v2.3.

Sua missão é decompor o escopo funcional informado (Requisito, Feature ou História BDD) em Funções de Dados (ALI, AIE), Funções Transacionais (EE, SE, CE) e eventuais Itens Não-Mensuráveis (FPN/SISP), fornecendo contagens exatas e defensáveis de TDs (DETs) e ARs/TRs (FTRs/RETs).

DIRETRIZES OBRIGATÓRIAS DE CONTAGEM (IFPUG CPM 4.3.1 + SISP):

1. FRONTEIRA DA APLICAÇÃO (BOUNDARY):
   - Identifique com clareza o que pertence ao sistema sendo medido versus o que reside em sistemas/APIs/plataformas externas de terceiros (ex.: Reclame Aqui, Web Service RDR/BCB, Correios, Receita Federal, Gateways de Pagamento, APIs/LLMs de IA Generativa).
   - Atenção: APIs, webhooks, serviços externos de IA Generativa / LLM (ex.: OpenAI, Gemini, provedores externos de IA/Copiloto onde o CRM envia prompt/contexto e recebe texto/metadados gerados) ou bancos externos de TERCEIROS consumidos/lidos pela aplicação caracterizam dados mantidos FORA da fronteira (candidatos obrigatórios a AIE). Já APIs internas, portais do próprio sistema ("Portal Externo de Ouvidoria"), estilizações CSS e brokers/filas internas (RabbitMQ, Kafka, SQS) pertencem à camada técnica/fronteira da aplicação e NUNCA são AIE.
   - REGRA MANDATÓRIA PARA SERVIÇOS EXTERNOS DE IA GENERATIVA / LLM (AIE): Toda integração com provedores de IA Generativa / LLM ou assistente/copiloto via serviço externo onde o sistema envia payloads estruturados (prompts, contexto, diretrizes) e recebe respostas geradas e metadados DEVE gerar o respectivo AIE ("AIE - API do Serviço de IA Generativa", 1 TR/RLR, ~4 a 6 TDs/DLRs [Prompt de entrada, Diretrizes, Resposta gerada, Parâmetros/Tokens] ➔ Complexidade BAIXA / 5 PF), salvo se já existir equivalente em existingAies.

2. FUNÇÕES DE DADOS — ALI e AIE (RESPEITAR O TIPO DE CONTAGEM!):
   - ALI (Arquivo Lógico Interno): Grupo lógico de dados mantido DENTRO da fronteira da aplicação por meio de pelo menos um processo elementar.
   - AIE (Arquivo de Interface Externa): Grupo lógico de dados apenas referenciado/lido pela aplicação, mantido por OUTRA aplicação fora da fronteira.
   - REGRA CRÍTICA POR TIPO DE CONTAGEM (DESENVOLVIMENTO NOVO vs MELHORIA):
     * QUANDO "Tipo de Contagem" FOR "Desenvolvimento" (Desenvolvimento Novo): NÃO assuma que tabelas/ALIs já sejam pré-existentes! É MANDATÓRIO gerar o ALI correspondente à entidade de negócio criada ou mantida pelo requisito (ex.: ALI Demanda = Baixa / 7 PF, ou "ALI - Rascunho / Resposta Oficial" em editores assistidos), contando cada ALI distinto uma única vez no escopo auditado (operação ADD). Quando o requisito mantiver explicitamente duas entidades lógicas autônomas com propósitos e atributos distintos (ex.: ALI de Demandas de Ouvidoria E ALI de Auditoria / Histórico de Atendimento com campos próprios como executor, data/hora e justificativa), gere ambos os ALIs separadamente. Atenção: não conte como novo ALI entidades pré-cadastradas lidas APENAS como contexto/insumo sem manutenção no requisito (ex.: "minuta institucional homologada cadastrada", "subsídio/parecer já devolvido pela área" ou "classificação da demanda" lidos pelo Copiloto de IA onde apenas "ALI - Rascunho / Resposta Oficial" é gravado/alterado — cite tais insumos apenas como AR/FTR nas EEs). Só não crie ALI em fluxos estritamente de Login/Autenticação ou consultas CE 100% somente leitura sem entidade de negócio mantida no sistema (painéis operacionais com cálculo de SLA em Desenvolvimento Novo referenciam e incluem o ALI principal da entidade, ex.: Demandas, quando não existir em existingAlis).
     * CADASTROS DE APOIO E CATÁLOGOS PADRONIZADOS: Se o requisito citar cadastros de apoio ou catálogos padronizados obrigatórios (ex.: Catálogo de Produtos, Tabela de Risco, Naturezas/Motivos padronizados), identifique o respectivo ALI de apoio (em Desenvolvimento Novo quando criado/mantido) ou compute a Consulta Externa (CE) associada utilizada para alimentar/carregar a tela.
     * QUANDO "Tipo de Contagem" FOR "Melhoria" / manutenção: Consulte a lista de ALIs já cadastrados no inventário do projeto. Se o ALI equivalente já existe no inventário e não sofre alteração estrutural de campos/TRs, NÃO gere novo ALI (assuma-o como pré-existente e referencie apenas como AR/FTR nas transações).
     * PARA AIEs: Consulte existingAies — não duplique AIE se uma interface externa do MESMO sistema/provedor de terceiros já estiver cadastrada no inventário (ex.: "API RDR/BCB", "Web Service do BCB", "Endpoint RDR" e "API de Anexos do RDR BCB" representam o mesmo sistema externo RDR/BCB; só gere novo AIE se for outro provedor externo ou CHG estrutural).
   - CONTAGEM DE TDs E TRs EM ALI/AIE:
     * Conte estritamente os atributos/campos de negócio persistidos ou referenciados (incluindo origem/status/chaves reconhecíveis pelo usuário).
     * NUNCA some os +2 TDs de controle de tela/mensagem em funções de dados (ALI/AIE).
     * TRs (RETs): Use 1 TR por padrão; use 2+ TRs apenas se houver explicitamente subgrupos/subtabelas mestre-detalhe reconhecíveis pelo usuário.

3. FUNÇÕES TRANSACIONAIS (PROCESSOS ELEMENTARES) — EE, SE, CE:
   - REGRA DE OPERAÇÃO (ADD vs CHG vs DEL):
     * Quando o Tipo de Contagem for "Desenvolvimento" (Desenvolvimento Novo) e o usuário não selecionar explicitamente CHG ou DEL, processos criados pela primeira vez para a aplicação são SEMPRE operação "ADD" (100%).
     * ATENÇÃO: Transicionar/atualizar o status de um registro ou persistir recibo/protocolo em um ALI (ex.: "alterando o status da demanda para Respondida", "manter o status em Erro", "persistir o protocolo no histórico") faz parte da lógica normal de uma nova EE (ADD) — NUNCA classifique isso como "CHG" (Melhoria) em um projeto de Desenvolvimento Novo!
     * Só use "CHG" em contagens de Melhoria/Manutenção ou quando o requisito pedir explicitamente alterar/evoluir um processo elementar já implementado anteriormente.
   - Cada processo elementar deve ser a menor unidade de atividade significativa para o usuário e autocontida (que deixa o negócio em estado consistente).
   - EE (Entrada Externa): Processa dados ou informações de controle vindos de fora da fronteira (usuário, formulário/portal, arquivo, scheduler/webhook consumindo API externa) com intenção primária de manter um ou mais ALIs ou alterar comportamento do sistema.
     * ATOMICIDADE DE ENTRADAS EXTERNAS (EE) — PROIBIÇÃO DE AGRUPAMENTO INDEVIDO:
       Nunca agrupe em uma única EE operações que possuam intenções primárias independentes, gatilhos/telas operacionais distintos ou mantêm entidades/propósitos de negócio diferentes apenas por estarem no mesmo requisito!
       REGRA MANDATÓRIA DE SEPARAÇÃO (Andamento/Atuação vs Transferência de Custódia): Se o requisito descrever "Registrar andamento / atuação assistida" (registro na linha do tempo/auditoria) E TAMBÉM descrever "Transferir / reatribuir agente responsável" (alteração de custódia/caixa do analista), decomponha OBRIGATORIAMENTE em **duas EEs separadas**:
       1. EE - Registrar Atuação Assistida com Log de Auditoria (grava andamento/atuação + auditoria; referencia Demandas e Auditoria ➔ >= 2 ARs, 5–15 TDs = Complexidade MÉDIA / 4 PF);
       2. EE - Transferir Agente Responsável (atualiza titularidade no ALI de Demandas, valida novo Agente/Auditoria e move de caixa ➔ >= 2 ARs, 5–15 TDs = Complexidade MÉDIA / 4 PF).
       Se o requisito também exigir busca global interativa (ex.: "Busca Global Assistida"), gere a CE autônoma correspondente (CE - Busca Global Assistida de Demandas).
       REGRA MANDATÓRIA DE COMANDOS INTERATIVOS DE COPILOTO / EDIÇÃO POR IA (NUNCA CLASSIFICAR COMO SE):
       Quando o usuário acionar botões de comando ("Gerar Rascunho com IA", "Tornar mais formal", "Simplificar vocabulário", "Resumir justificativa", "Ajustar tom") ou enviar prompts livres para gerar/reescrever/atualizar conteúdo no editor (ex.: Rascunho / Resposta Oficial):
       - O processo elementar é OBRIGATORIAMENTE uma **ENTRADA EXTERNA (EE)**, e NUNCA uma SE, pois recebe comandos/parâmetros vindos de fora da fronteira para criar ou alterar/atualizar dados mantidos no ALI de Rascunho / Resposta Oficial!
       - Decomponha geração inicial vs refinamento interativo como EEs atômicas separadas:
         1. "EE - Gerar Rascunho Inicial com IA" (2 a 3 ARs [ALI Rascunho/Resposta, Demanda/Minuta, AIE IA Generativa], 6–10 TDs ➔ **Média / 4 PF**);
         2. "EE - Refinar Resposta via Comandos do Copiloto" (2 a 3 ARs [ALI Rascunho/Resposta, AIE IA Generativa, Parâmetros], 6–8 TDs ➔ **Média / 4 PF**).
     * VALIDAÇÃO CONTRA TABELAS DE DOMÍNIO / CATÁLOGOS: Quando um formulário ou processo de entrada valida dados contra tabelas de domínio ou catálogos padronizados antes de persistir, conte obrigatoriamente 2 ou mais ARs: 1 AR para a entidade de negócio mantida (ex.: Demanda) + 1 AR para cada tabela/catálogo lido para validação (ex.: Catálogo de Produtos, Tabela de Risco). Lembre-se: 2 ARs com 5 a 15 TDs resulta em Complexidade MÉDIA (4 PF) para EE.
     * Exemplo típico de integração/ingestão via API externa: um único processo elementar EE que captura os registros da API externa (1 AR = AIE), valida duplicidade/idempotência e grava no banco interno (1 AR = ALI) = 2 ARs (FTRs) no total! Não quebre verificação de duplicidade ou disparo interno de contador SLA em uma CE ou EE separada se fizerem parte do mesmo processo elementar indivisível.
     * Exemplo típico de envio/transmissão externa com confirmação e contingência (ex.: enviar resposta/anexos ao Web Service BCB/RDR, receber protocolo oficial, atualizar status para "Respondida" ou tratar erro HTTP 4xx/5xx mantendo "Erro no Envio" / fila de contingência + alerta visual na tela): TODOS esses caminhos (sucesso e falha) são ramificações lógicas do MESMO processo elementar EE acionado pelo botão/gatilho de envio. NUNCA fragmente erro HTTP, entrada em fila de contingência ou alerta amigável na tela em uma segunda EE, SE ou CE separada!
   - SE (Saída Externa): Envia dados para fora da fronteira contendo pelo menos um cálculo matemático, fórmula, dado derivado, totalizador, manutenção adicional de ALI quando a intenção primária for apresentar/transmitir informação derivada ao usuário/externo, OU **disparo formal de e-mail / notificação por canal externo**:
     * REGRA MANDATÓRIA DE CONVERSÃO CE ➔ SE POR LÓGICA DERIVADA E CÁLCULO DE PRAZOS (IFPUG CPM 4.3.1):
       Se uma tela de consulta, grid, fila de trabalho ou painel envolver:
       1. Cálculos de SLA dinâmicos, contagem regressiva/decrescente, apuração de tempo restante, tempo decorrido ou cálculo de dias úteis/horas corridas em tempo real;
       2. Fórmulas matemáticas ou algoritmos que combinem datas/horários com calendários operacionais ou tabelas de prazo/feriados (ex.: cálculo de SLA, fórmula de prazo regulatório);
       3. Campos derivados calculados em tempo de execução (ou renderização condicional baseada em cálculo temporal, como código de cores >48h / 24-48h / <24h) que não existem como coluna estática persistida direta;
       ➔ A TRANSAÇÃO DEVE SER CLASSIFICADA OBRIGATORIAMENTE COMO **SAÍDA EXTERNA (SE)**, e **NUNCA como Consulta Externa (CE)**!
     * CONTAGEM DE ARs (FTRs) EM PAINÉIS / GRIDS COM CÁLCULO DE PRAZO EM DIAS ÚTEIS:
       Painéis/consultas com cálculo de prazo regulatório em dias úteis referenciam no mínimo **2 Arquivos (ARs / FTRs)** em arTrList:
       1. AR 1: ALI principal de Demandas/Tarefas (dados do caso, status e data/hora de abertura);
       2. AR 2: ALI/Tabela de Parâmetros de SLA ou Calendário de Feriados/Dias Úteis (cite-o em arTrList da SE sem criar um segundo ALI CRUD separado de Parâmetros/Calendário caso o requisito não especifique manutenção/cadastro dessa tabela).
       Impacto na Matriz SE (CPM 4.3.1): 2 ARs com 6 a 19 TDs (DET) resulta obrigatoriamente em Complexidade **MÉDIA (5 PF)**.
     * REGRA DE DISPARO FORMAL DE E-MAIL / NOTIFICAÇÕES EXTERNAS: Toda regra que exigir envio de notificação estruturada para fora da fronteira do sistema (ex.: disparo de e-mail ao cidadão/manifestante com número de protocolo, e-mail de solicitação de subsídio, SMS formal ou push notification) DEVE ser decomposta como uma SAÍDA EXTERNA (SE) autônoma, INCLUSIVE quando houver uma EE no mesmo requisito — nunca absorvida apenas como detalhe da EE.
     * REGRA DE ARs EM E-MAILS / NOTIFICAÇÕES PARAMETRIZADAS (OBRIGATÓRIA): Sempre que um processo de notificação externa (SE) envolver preenchimento de templates, layouts pré-configurados, parâmetros de disparo ou tags dinâmicas estruturadas (ex.: {{protocolo}}, {{numero_protocolo}}, {{nome_cliente}}, {{resumo_demanda}}, {{indicador_sarb27}}), considere no mínimo 2 Arquivos Referenciados (ARs / FTRs) em arTrList:
       1. AR 1: O ALI transacional que fornece os dados da ocorrência/negócio (ex.: Demanda, Solicitação de Subsídio, Cliente);
       2. AR 2: O ALI/Tabela de Configuração que armazena os modelos, cabeçalhos, tags dinâmicas e parâmetros de disparo (ex.: Templates de E-mail, Parâmetros do Sistema — cite-o em arTrList da SE sem criar um ALI CRUD separado de templates caso não haja requisito de manutenção desse cadastro).
       Impacto na Matriz SE (CPM 4.3.1): 2 a 3 ARs com 6 a 19 TDs (DET) classifica obrigatoriamente como Complexidade MÉDIA (5 PF).
     * LÓGICA DERIVADA E REGRAS CONDICIONAIS EM SE: Se houver derivação ou concatenação de campos (ex.: junção de Produto + Motivo + Relato para compor {{resumo_demanda}}) ou renderização condicional (ex.: banner visual de alerta para SARB 27), classifique estritamente como SAÍDA EXTERNA (SE), e NUNCA como Consulta Externa (CE).
     * NÃO confunda com avisos internos, toasts de tela ou flags de contingência sem canal externo/layout próprio (ex.: "exibir mensagem amigável na tela" ou "entrar em fila de contingência com alerta para a coordenação" sem menção a e-mail/SMS/push continuam sendo apenas tratamento de erro/feedback da própria EE).
   - CE (Consulta Externa): Recupera e exibe dados existentes de ALIs/AIEs estritamente SEM fórmulas matemáticas, SEM cálculos temporais em tempo real (SLA/dias úteis/contagem regressiva), SEM dados derivados e SEM atualizar ALIs. Inclua CE de carregamento quando a interface consultar catálogos padronizados/tabelas de apoio obrigatórias para exibição/seleção na tela.
   - NÃO DUPLICAR SE E CE para a mesma visualização/relatório.
   - FLUXOS DE AUTENTICAÇÃO (Login / Senha / 2FA): Gerar apenas EE, sem criar ALI nem CE fantasma.
   - ESPECIFICAÇÃO ESTRUTURAL PURA DE DADOS (apenas modelagem de tabela/ALI): Não inventar transações EE/SE/CE se nenhuma operação transacional for especificada.
   - CONTAGEM DE TDs E ARs EM TRANSAÇÕES:
     * TDs (DETs): Liste os campos de negócio que atravessam a fronteira na entrada/saída (inclua atributos citados explicitamente no BDD/regras, como identificador, origem, status, protocolo, mensagem de erro externa, prazo/SLA quando mantidos/exibidos na transação) + 2 TDs de controle (1 para acionamento/botão/gatilho e 1 para mensagem/feedback/log de retorno). Garanta que "td" seja igual ao número de campos de negócio da transação + 2.
     * ARs (FTRs): Conte rigorosamente CADA arquivo lógico distinto do inventário (ALIs + AIEs + catálogos de domínio validados/lidos) efetivamente lido ou mantido durante o processo elementar! Se a transação envia dados de um ALI principal + anexos de um ALI auxiliar (ex.: "ALI - Anexos de Demandas") + interage com uma AIE externa (ex.: "AIE - API RDR/BCB"), liste os 3 arquivos distintos em arTrList (arTr = 3). Se mantém 1 ALI e valida 1 catálogo de apoio ou lê 1 AIE, liste os 2 (arTr = 2).

4. ITENS NÃO-MENSURÁVEIS (FPN / SISP v2.3) E TRATAMENTO RIGOROSO DE RNF / INFRAESTRUTURA:
   - Mantenha rigorosamente isolados como Itens Não-Mensuráveis (FPN / 0 PF quando acompanhados de processo elementar IFPUG, com "absorbed": true): tecnologias de infraestrutura, brokers de mensageria (RabbitMQ, Kafka, filas AWS SQS), Redis/cache, SLAs de tempo de resposta (ex.: "< 3s"), estilizações visuais de CSS (cores, badges/tags visuais), máscaras, componentes UI e menus.
   - NUNCA converta RabbitMQ, Kafka, filas SQS, Redis, SLA de latência ou estilos CSS em ALI, AIE, EE ou AR!
   - Só retorne inmItems com "absorbed": false quando a demanda for puramente técnica/infraestrutura sem nenhum processo elementar IFPUG (ex.: criação avulsa de índice de banco, script SQL isolado, ajuste estritamente estético de CSS). Use as chaves do catálogo SISP (webhook_tecnico, db_view_indice, script_saneamento, layout_alteracao, componente_ui, menu_item, code_table_inclusao, code_table_alteracao, parametro_sistema, perfil_seguranca, db_trigger_proc, relatorio_simples).

5. PRECISÃO NUMÉRICA E CONSISTÊNCIA CFPS (OBRIGATÓRIAS):
   - INVENTÁRIO vs SUBENTIDADES: Compare entidades por núcleo lógico exato. Por exemplo, um ALI "Anexos de Demandas" (subentidade 1:N) NÃO substitui nem representa o ALI principal "Demandas / Reclamações"; só suprima o ALI se a mesma entidade principal já constar no inventário do projeto.
   - NÃO FRAGMENTAR PROCESSO ELEMENTAR: Se uma rotina/scheduler/webhook consulta uma API externa para capturar e gravar registros no banco interno (mesmo checando duplicidade e disparando SLA na gravação), tudo compõe UM ÚNICO processo elementar EE com 2 ARs (AIE externa + ALI interno). Só crie CE adicional se houver explícita exibição/listagem interativa para usuário final (ex.: listar arquivos com botão de download).
   - CONSISTÊNCIA ESTRITA DE TDs E ARs/TRs:
     * Em ALI e AIE: tdList deve conter APENAS atributos de negócio persistidos/referenciados (NUNCA inclua acionamento/botão/mensagem/log de controle), e o inteiro "td" deve ser exatamente tdList.length (mínimo 1).
     * Em EE, SE e CE: tdList deve conter os campos de negócio que cruzam a fronteira + exatamente 2 TDs de controle (Acionamento/Gatilho e Mensagem/Log de Retorno), e o inteiro "td" deve ser exatamente tdList.length (mínimo 3).
     * Em EE, SE e CE: arTrList deve listar nominalmente cada ALI e AIE distinto lido ou mantido, e "arTr" deve ser exatamente arTrList.length (mínimo 1).
   - ORDEM CANÔNICA: Ordene o array "functions" nesta sequência fixa: ALI, AIE, EE, SE, CE.
   - NÃO tente calcular complexidade ou PF final no JSON — o motor determinístico do sistema aplicará as matrizes oficiais IFPUG CPM 4.3.1 e os deflatores SISP sobre os valores exatos informados por você.
   - Responda exclusivamente em Português do Brasil conforme o schema JSON exigido.`;
}

/**
 * Serializa campos estruturados do padrão SUSIS / Banpará (Fluxo, Telas, Entradas, Saídas, CAs) em texto limpo para prompt/cache.
 */
function formatStructuredSpecSections(req = {}) {
  const parts = [];
  const pm = (req.numeroProcessMaker || req.numero_process_maker || '').trim();
  const ver = (req.versaoAtual || req.versao_atual || '').trim();
  const desc = (req.descricaoRequisito || req.descricao_requisito || '').trim();
  const pre = (req.preCondicoes || req.pre_condicoes || '').trim();
  const pos = (req.posCondicoes || req.pos_condicoes || '').trim();
  const flow = (req.fluxoRequisito || req.fluxo_requisito || req.fluxoPrincipal || req.fluxo_principal || '').trim();
  const rnList = Array.isArray(req.regrasNegocio) ? req.regrasNegocio : [];
  const telas = Array.isArray(req.telas) ? req.telas : [];
  const entradas = Array.isArray(req.entradas) ? req.entradas : [];
  const saidas = Array.isArray(req.saidas) ? req.saidas : [];
  const criterios = Array.isArray(req.criteriosAceite) ? req.criteriosAceite : [];
  const customSecs = Array.isArray(req.secoesCustomizadas) ? req.secoesCustomizadas : [];

  if (pm) parts.push(`- **Número ProcessMaker:** ${pm}`);
  if (ver) parts.push(`- **Versão:** ${ver}`);
  if (desc) parts.push(`**Visão Geral / Descrição do Requisito:**\n${desc}`);
  if (pre) parts.push(`**Pré-condições:**\n${pre}`);
  if (pos) parts.push(`**Pós-condições:**\n${pos}`);
  if (rnList.length > 0) {
    const rnRows = rnList.map((rn, i) => `- ${rn.codigo || `RN${String(i + 1).padStart(3, '0')}`}: ${rn.descricao || ''}`);
    parts.push(`**Regras de Negócio (RN):**\n${rnRows.join('\n')}`);
  }
  if (flow) parts.push(`**1.1 Fluxo (Passo a Passo):**\n${flow}`);
  if (telas.length > 0) {
    parts.push(`**1.2 Telas / Protótipos (${telas.length}):** ${telas.map((t, i) => t.title || t.tituloTela || `Tela ${i + 1}`).join(', ')}`);
  }
  if (entradas.length > 0) {
    const rows = entradas.map(e => `- ${e.campo} (${e.tipoCampo || 'Alfanumérico'}, ${e.obrigatorio ? 'Obrigatório' : 'Opcional'}): ${e.descricao || ''}${e.regra ? ` [Regra: ${e.regra}]` : ''}`);
    parts.push(`**1.3.1 Atributos — Entradas:**\n${rows.join('\n')}`);
  }
  if (saidas.length > 0) {
    const rows = saidas.map(s => `- ${s.campo} (${s.tipoCampo || 'Alfanumérico'}, ${s.obrigatorio ? 'Obrigatório' : 'Opcional'}): ${s.descricao || ''}${s.regra ? ` [Regra: ${s.regra}]` : ''}`);
    parts.push(`**1.3.2 Atributos — Saídas:**\n${rows.join('\n')}`);
  }
  if (criterios.length > 0) {
    const rows = criterios.map((c, idx) => `- ${c.item || `CA${String(idx + 1).padStart(3, '0')}`} [${c.tipo || 'Negócio (N)'} | ${c.categoria || 'Específico'}]: ${c.descricao || ''}`);
    parts.push(`**1.4 Critérios de Aceite Estruturados:**\n${rows.join('\n')}`);
  }
  if (customSecs.length > 0) {
    const customParts = customSecs.map((sec, idx) => {
      const title = sec.tituloSecao || sec.titulo_secao || `Seção ${idx + 1}`;
      const fields = (sec.campos || []).map(f => `  * ${f.nomeCampo || f.nome_campo || 'Campo'} (${f.tipoCampo || f.tipo_campo || 'Texto'}): ${f.valor !== undefined && f.valor !== null ? (typeof f.valor === 'object' ? JSON.stringify(f.valor) : f.valor) : '—'}`);
      return `**${title}:**\n${fields.length > 0 ? fields.join('\n') : '  *(Sem campos preenchidos)*'}`;
    });
    parts.push(`**Seções Personalizadas:**\n${customParts.join('\n')}`);
  }
  return parts.join('\n');
}

/**
 * Monta o prompt de usuário com especificação, inventário do projeto e parâmetros de contagem.
 */
function buildCfpsUserPrompt(spec, context = {}) {
  const {
    countingType = 'Desenvolvimento',
    operationType = '',
    existingAlis = [],
    existingAies = [],
    featureRequirements = []
  } = context;

  const isDevCount = /^desenvolvimento$/i.test((countingType || '').trim());
  const opPromptText = operationType
    || (isDevCount
      ? 'ADD (100% — Projeto de Desenvolvimento Novo; nunca usar CHG apenas por atualização de status/campos durante nova transação)'
      : 'Auto-inferir pelo requisito (ADD / CHG / DEL)');

  const sections = [
    `### PARÂMETROS DA CONTAGEM`,
    `- **Tipo de Contagem:** ${countingType}`,
    `- **Operação Informada pelo Usuário:** ${opPromptText}`,
    `- **Escopo:** ${featureRequirements.length > 0 ? `Feature consolidada "${spec.feature}" (${featureRequirements.length} requisitos)` : 'Requisito / Especificação individual'}`
  ];

  sections.push(``, `### INVENTÁRIO DE DADOS E REGRA DO TIPO DE CONTAGEM`);
  if (isDevCount && featureRequirements.length === 0) {
    sections.push(`- **ALIs (Desenvolvimento Novo):** Como o Tipo de Contagem é Desenvolvimento Novo, NÃO assuma que os ALIs já são pré-existentes! Inclua obrigatoriamente os ALIs criados ou mantidos pelas transações identificadas neste requisito (cada entidade distinta 1x).`);
  } else if (existingAlis.length > 0) {
    sections.push(`- **ALIs já cadastrados no projeto (não duplicar em Melhoria):** ${existingAlis.map(a => `${a.name} (${a.td} TDs, ${a.ar_tr} TRs)`).join(' | ')}`);
  } else {
    sections.push(`- **ALIs já cadastrados no projeto:** Nenhum — inclua os ALIs criados ou mantidos pelas transações identificadas.`);
  }
  if (existingAies.length > 0) {
    sections.push(`- **AIEs já cadastrados no projeto:** ${existingAies.map(a => `${a.name} (${a.td} TDs, ${a.ar_tr} TRs)`).join(' | ')}`);
  } else {
    sections.push(`- **AIEs já cadastrados no projeto:** Nenhum.`);
  }

  sections.push(``, `### ESPECIFICAÇÃO FUNCIONAL A AUDITAR`);
  if (featureRequirements.length > 0) {
    featureRequirements.forEach((req, idx) => {
      sections.push(`\n#### Requisito ${idx + 1}: [${req.code || 'RF'}] ${req.title || ''}`);
      if (req.userStory || req.user_story) sections.push(`**História de Usuário / Regras:**\n${req.userStory || req.user_story}`);
      if (req.bdd) sections.push(`**Cenários BDD / Critérios de Aceitação:**\n${req.bdd}`);
      const structured = formatStructuredSpecSections(req);
      if (structured) sections.push(structured);
    });
  } else {
    if (spec.code) sections.push(`- **Código:** ${spec.code}`);
    if (spec.title) sections.push(`- **Título:** ${spec.title}`);
    if (spec.feature) sections.push(`- **Feature/Módulo:** ${spec.feature}`);
    if (spec.userStory || spec.user_story) sections.push(`\n**História de Usuário / Regras de Negócio:**\n${spec.userStory || spec.user_story}`);
    if (spec.bdd) sections.push(`\n**Cenários BDD / Critérios de Aceitação:**\n${spec.bdd}`);
    const structured = formatStructuredSpecSections(spec);
    if (structured) sections.push(`\n${structured}`);
    if (spec.text || spec.specification) {
      const extraText = spec.text || spec.specification;
      if (extraText !== (spec.userStory || spec.user_story)) {
        sections.push(`\n**Especificação Adicional:**\n${extraText}`);
      }
    }
  }

  const inventoryInstruction = isDevCount && featureRequirements.length === 0
    ? 'Em Desenvolvimento Novo, INCLUA obrigatoriamente os ALIs mantidos/criados pelas transações identificadas (e só não duplique AIE externo cujo sistema já conste em existingAies acima).'
    : 'NÃO inclua no array "functions" nenhum ALI ou AIE que já conste no inventário pré-existente listado acima — apenas referencie-os como AR/FTR em arTrList.';
  sections.push(``, `Execute a auditoria CFPS completa e retorne o JSON estritamente estruturado. IMPORTANTE: ${inventoryInstruction}`);
  return sections.join('\n');
}

/**
 * Extrai e faz parse seguro de JSON retornado por modelos de IA (lida com blocos ```json caso ocorram).
 */
function safeParseAiJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Resposta vazia recebida do provedor de IA.');
  }
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced && fenced[1]) {
      return JSON.parse(fenced[1].trim());
    }
    const firstBrace = trimmed.indexOf('{');
    const lastBrace = trimmed.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
    }
    throw new Error('O agente de IA retornou texto fora do formato JSON esperado.');
  }
}

/**
 * Executa chamada via Google Gemini Interactions API (/v1beta/interactions).
 */
async function callGeminiInteractions({ apiKey, model, baseUrl, systemInstruction, userPrompt, responseSchema, timeoutMs = 45000 }) {
  const cleanBase = (baseUrl || PROVIDER_CATALOG.gemini.defaultBaseUrl).replace(/\/+$/, '');
  const endpoint = `${cleanBase}/v1beta/interactions`;
  const resolvedModel = model || PROVIDER_CATALOG.gemini.defaultModel;
  const isDeepCfpsCall = Boolean(responseSchema?.properties?.functions);
  const generationConfig = {
    seed: 42,
    thinking_level: isDeepCfpsCall ? 'low' : 'minimal'
  };
  if (!/gemini-(?:3\.8|4)/i.test(resolvedModel)) {
    generationConfig.temperature = 0;
  }

  const body = {
    model: resolvedModel,
    system_instruction: systemInstruction,
    input: userPrompt,
    store: false,
    generation_config: generationConfig
  };
  if (responseSchema) {
    body.response_format = {
      type: 'text',
      mime_type: 'application/json',
      schema: responseSchema
    };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
      'Api-Revision': '2026-05-20'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const rawBody = await res.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (_) {
    throw new Error(`Gemini HTTP ${res.status}: resposta inválida (${rawBody.slice(0, 200)})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(`Gemini API: ${msg}`);
  }

  if (data.status && ['failed', 'cancelled'].includes(data.status)) {
    throw new Error(`Gemini Interaction falhou (${data.status}): ${data.error?.message || 'erro desconhecido'}`);
  }

  const steps = Array.isArray(data.steps) ? data.steps : [];
  const textChunks = [];
  for (const step of steps) {
    if (step?.type === 'model_output' && Array.isArray(step.content)) {
      for (const part of step.content) {
        if (part?.type === 'text' && typeof part.text === 'string') {
          textChunks.push(part.text);
        }
      }
    }
  }
  const outputText = textChunks.join('\n').trim() || (typeof data.output_text === 'string' ? data.output_text.trim() : '');
  if (!outputText) {
    throw new Error('Gemini Interactions API não retornou conteúdo de texto em model_output.');
  }
  return outputText;
}

/**
 * Executa chamada via OpenAI Chat Completions ou endpoint compatível (Ollama, OpenRouter, Groq).
 */
async function callOpenAiCompatible({ apiKey, model, baseUrl, systemInstruction, userPrompt, responseSchema, isOfficialOpenAi, timeoutMs = 45000 }) {
  const cleanBase = (baseUrl || (isOfficialOpenAi ? PROVIDER_CATALOG.openai.defaultBaseUrl : PROVIDER_CATALOG.openai_compatible.defaultBaseUrl)).replace(/\/+$/, '');
  const endpoint = cleanBase.endsWith('/chat/completions') ? cleanBase : `${cleanBase}/chat/completions`;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const buildPayload = (useStrictSchema) => {
    const resolvedModel = model || (isOfficialOpenAi ? PROVIDER_CATALOG.openai.defaultModel : PROVIDER_CATALOG.openai_compatible.defaultModel);
    const payload = {
      model: resolvedModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: userPrompt }
      ]
    };
    if (!/^(?:o\d|gpt-5)/i.test(resolvedModel)) {
      payload.temperature = 0;
    }
    if (isOfficialOpenAi) {
      payload.seed = 42;
    }
    if (responseSchema) {
      payload.response_format = useStrictSchema
        ? { type: 'json_schema', json_schema: { name: 'cfps_analysis', strict: true, schema: responseSchema } }
        : { type: 'json_object' };
    }
    return payload;
  };

  let res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildPayload(Boolean(responseSchema))),
    signal: AbortSignal.timeout(timeoutMs)
  });

  // Servidores compatíveis (ex.: Ollama antigo) podem recusar json_schema e aceitar json_object
  if (!res.ok && res.status === 400 && responseSchema && !isOfficialOpenAi) {
    res = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(buildPayload(false)),
      signal: AbortSignal.timeout(timeoutMs)
    });
  }

  const rawBody = await res.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (_) {
    throw new Error(`OpenAI/Compatible HTTP ${res.status}: resposta inválida (${rawBody.slice(0, 200)})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(`API OpenAI/Compatível: ${msg}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('API OpenAI/Compatível não retornou mensagem de resposta.');
  }
  return content;
}

/**
 * Executa chamada via Anthropic Messages API com Tool Use forçado para JSON Schema estruturado.
 */
async function callAnthropicMessages({ apiKey, model, baseUrl, systemInstruction, userPrompt, responseSchema, timeoutMs = 45000 }) {
  const cleanBase = (baseUrl || PROVIDER_CATALOG.anthropic.defaultBaseUrl).replace(/\/+$/, '');
  const endpoint = `${cleanBase}/v1/messages`;

  const body = {
    model: model || PROVIDER_CATALOG.anthropic.defaultModel,
    max_tokens: 4096,
    temperature: 0,
    system: systemInstruction,
    messages: [{ role: 'user', content: userPrompt }]
  };

  if (responseSchema) {
    body.tools = [{
      name: 'emit_cfps_analysis',
      description: 'Emite o resultado estruturado da auditoria CFPS segundo IFPUG CPM 4.3.1 e SISP.',
      input_schema: responseSchema
    }];
    body.tool_choice = { type: 'tool', name: 'emit_cfps_analysis' };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });

  const rawBody = await res.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (_) {
    throw new Error(`Anthropic HTTP ${res.status}: resposta inválida (${rawBody.slice(0, 200)})`);
  }

  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(`Anthropic API: ${msg}`);
  }

  const blocks = Array.isArray(data.content) ? data.content : [];
  if (responseSchema) {
    const toolBlock = blocks.find(b => b.type === 'tool_use' && b.name === 'emit_cfps_analysis');
    if (toolBlock && toolBlock.input) {
      return JSON.stringify(toolBlock.input);
    }
  }
  const textBlock = blocks.find(b => b.type === 'text' && b.text);
  if (!textBlock) {
    throw new Error('Anthropic API não retornou conteúdo estruturado.');
  }
  return textBlock.text;
}

/**
 * Despacha uma requisição de inferência para o provedor configurado.
 */
async function invokeProvider({ config, systemInstruction, userPrompt, responseSchema, timeoutMs = 45000 }) {
  if (config.requiresApiKey && !config.apiKey) {
    throw new Error(`API Key não configurada para o provedor ${config.providerLabel}.`);
  }

  switch (config.provider) {
    case 'gemini':
      return await callGeminiInteractions({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemInstruction,
        userPrompt,
        responseSchema,
        timeoutMs
      });
    case 'openai':
      return await callOpenAiCompatible({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemInstruction,
        userPrompt,
        responseSchema,
        isOfficialOpenAi: true,
        timeoutMs
      });
    case 'openai_compatible':
      return await callOpenAiCompatible({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemInstruction,
        userPrompt,
        responseSchema,
        isOfficialOpenAi: false,
        timeoutMs
      });
    case 'anthropic':
      return await callAnthropicMessages({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        systemInstruction,
        userPrompt,
        responseSchema,
        timeoutMs
      });
    default:
      throw new Error(`Provedor de IA não suportado: ${config.provider}`);
  }
}

/**
 * Executa análise semântica CFPS via Agente de IA retornando JSON validado.
 */
async function runAiCfpsAnalysis(spec, context, effectiveConfig) {
  const startedAt = Date.now();
  const systemInstruction = buildCfpsSystemInstruction();
  const userPrompt = buildCfpsUserPrompt(spec, context);

  const fallbackModels = effectiveConfig.provider === 'gemini'
    ? ['gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.8-flash'].filter(m => m !== effectiveConfig.model)
    : [];
  const modelsToTry = [effectiveConfig.model, ...fallbackModels];

  let usedModel = effectiveConfig.model;
  let rawOutput;
  let lastErr = null;
  for (let i = 0; i < modelsToTry.length; i++) {
    usedModel = modelsToTry[i];
    try {
      rawOutput = await invokeProvider({
        config: { ...effectiveConfig, model: usedModel },
        systemInstruction,
        userPrompt,
        responseSchema: CFPS_RESPONSE_SCHEMA,
        timeoutMs: 60000
      });
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      const isTransient = /(?:high demand|rate limit|quota|overloaded|unavailable|timed?\s*out|aborted|econnreset|etimedout|fetch\s+failed|502|503|504|429)/i.test(err.message);
      if (!isTransient || i === modelsToTry.length - 1) {
        throw err;
      }
    }
  }
  if (lastErr) throw lastErr;

  const parsed = safeParseAiJson(rawOutput);
  if (!parsed || !Array.isArray(parsed.functions)) {
    throw new Error('JSON retornado pela IA não contém a lista de funções IFPUG.');
  }

  return {
    parsed,
    latencyMs: Date.now() - startedAt,
    provider: effectiveConfig.provider,
    providerLabel: effectiveConfig.providerLabel,
    model: usedModel
  };
}

/**
 * Testa conectividade e credenciais do provedor de IA configurado.
 */
async function testAiConnection(effectiveConfig) {
  const startedAt = Date.now();
  const text = await invokeProvider({
    config: effectiveConfig,
    systemInstruction: 'Responda apenas com um JSON contendo {"status":"ok"}.',
    userPrompt: 'Ping de verificação CFPS.',
    responseSchema: {
      type: 'object',
      properties: { status: { type: 'string' } },
      required: ['status'],
      additionalProperties: false
    },
    timeoutMs: 15000
  });
  const parsed = safeParseAiJson(text);
  return {
    ok: true,
    latencyMs: Date.now() - startedAt,
    provider: effectiveConfig.provider,
    providerLabel: effectiveConfig.providerLabel,
    model: effectiveConfig.model,
    response: parsed
  };
}

/**
 * Gera chave SHA-256 determinística representando exatamente especificação, inventário e parâmetros da contagem.
 */
function computeCfpsCacheKey(spec = {}, context = {}, effectiveConfig = {}, options = {}) {
  const canonicalPayload = {
    promptVersion: CFPS_PROMPT_VERSION,
    provider: effectiveConfig.provider || 'gemini',
    model: effectiveConfig.model || '',
    countingType: context.countingType || options.countingType || 'Desenvolvimento',
    operationType: (context.operationType || options.operationType || '').toUpperCase().trim(),
    factor: options.factor !== undefined ? options.factor : null,
    spec: {
      code: (spec.code || '').trim(),
      title: (spec.title || '').trim(),
      feature: (spec.feature || '').trim(),
      userStory: (spec.userStory || spec.user_story || '').trim(),
      bdd: (spec.bdd || '').trim(),
      structuredSpec: formatStructuredSpecSections(spec),
      text: (spec.text || spec.specification || '').trim()
    },
    featureRequirements: (context.featureRequirements || [])
      .map(r => ({
        code: (r.code || '').trim(),
        title: (r.title || '').trim(),
        userStory: (r.userStory || r.user_story || '').trim(),
        bdd: (r.bdd || '').trim(),
        structuredSpec: formatStructuredSpecSections(r)
      }))
      .sort((a, b) => `${a.code}:${a.title}`.localeCompare(`${b.code}:${b.title}`)),
    existingAlis: (context.existingAlis || []).map(a => `${a.name}|${a.td}|${a.ar_tr}`).sort(),
    existingAies: (context.existingAies || []).map(a => `${a.name}|${a.td}|${a.ar_tr}`).sort()
  };
  return crypto.createHash('sha256').update(JSON.stringify(canonicalPayload)).digest('hex');
}

module.exports = {
  PROVIDER_CATALOG,
  CFPS_PROMPT_VERSION,
  CFPS_RESPONSE_SCHEMA,
  loadDotEnv,
  maskApiKey,
  resolveEffectiveAiConfig,
  formatStructuredSpecSections,
  buildCfpsUserPrompt,
  computeCfpsCacheKey,
  runAiCfpsAnalysis,
  testAiConnection
};
