/**
 * ==============================================================================
 * Synchro PRO - Servidor Backend REST API & Banco Relacional SQLite
 * Arquitetura Cliente-Servidor com persistência transacional em synchro.db
 * ==============================================================================
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const aiAgent = require('./ai-cfps-agent');

aiAgent.loadDotEnv(path.join(__dirname, '.env'));

const PORT = process.env.PORT || 3001;
const HOST = process.env.HOST || '0.0.0.0';

let defaultDbPath = path.join(__dirname, 'synchro.db');
const DB_PATH = process.env.DB_PATH || defaultDbPath;

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// --------------------------------------------------------------------------
// Migração Segura e Transparente do Banco Legado (devsquad.db -> synchro.db)
// --------------------------------------------------------------------------
const legacyCandidates = [
  path.join(dbDir, 'devsquad.db'),
  path.join(__dirname, 'devsquad.db'),
  '/app/data/devsquad.db'
];
const foundLegacyPath = legacyCandidates.find(p => fs.existsSync(p));

if (foundLegacyPath && foundLegacyPath !== DB_PATH) {
  const targetExists = fs.existsSync(DB_PATH);
  let shouldMigrate = !targetExists;

  if (targetExists) {
    try {
      const targetStat = fs.statSync(DB_PATH);
      const legacyStat = fs.statSync(foundLegacyPath);
      // Se o target for menor ou igual a 64KB (recém-inicializado vazio) e a base legada tiver mais dados
      if (targetStat.size <= 65536 && legacyStat.size > targetStat.size) {
        shouldMigrate = true;
      } else {
        // Verificar se a base atual tem 0 projetos enquanto a legada possui projetos
        const testTarget = new DatabaseSync(DB_PATH);
        const pCount = testTarget.prepare("SELECT count(*) as count FROM projects").get()?.count || 0;
        testTarget.close();
        if (pCount === 0) {
          const testLegacy = new DatabaseSync(foundLegacyPath);
          const legacyPCount = testLegacy.prepare("SELECT count(*) as count FROM projects").get()?.count || 0;
          testLegacy.close();
          if (legacyPCount > 0) {
            shouldMigrate = true;
            console.log(`📦 Banco legado possui ${legacyPCount} projetos e o atual possui 0. Disparando migração.`);
          }
        }
      }
    } catch (checkErr) {
      // Ignora erro de inspeção prévia
    }
  }

  if (shouldMigrate) {
    try {
      console.log(`🔄 Migrando banco legado devsquad.db (${foundLegacyPath}) para synchro.db (${DB_PATH})...`);
      fs.copyFileSync(foundLegacyPath, DB_PATH);
      if (fs.existsSync(foundLegacyPath + '-wal')) fs.copyFileSync(foundLegacyPath + '-wal', DB_PATH + '-wal');
      if (fs.existsSync(foundLegacyPath + '-shm')) fs.copyFileSync(foundLegacyPath + '-shm', DB_PATH + '-shm');
      console.log('✅ Banco legado devsquad.db migrado com sucesso para synchro.db!');
    } catch (migErr) {
      console.warn('⚠️ Falha ao migrar arquivo de banco legado:', migErr.message);
    }
  }
}

console.log('--------------------------------------------------');
console.log('🚀 Inicializando Synchro PRO Backend Server...');
console.log('📁 Banco de Dados SQLite:', DB_PATH);
console.log('--------------------------------------------------');

// Inicialização da Conexão com o Banco SQLite
const db = new DatabaseSync(DB_PATH);

// Configuração de Performance e Confiabilidade (WAL Mode)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
`);

// ==============================================================================
// 1. Criação das Tabelas Relacionais (Schema DDL)
// ==============================================================================
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    dev_role TEXT,
    seniority TEXT,
    skills TEXT,
    avatar_bg TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    desc TEXT,
    color TEXT,
    status TEXT,
    deadline TEXT,
    features TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    project_id TEXT,
    feature TEXT,
    type TEXT,
    moscow TEXT,
    user_story TEXT,
    bdd TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    role TEXT NOT NULL,
    seniority TEXT,
    skills TEXT,
    capacity REAL DEFAULT 40,
    avatar_bg TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    project_id TEXT,
    req_id TEXT,
    role TEXT,
    assignee_id TEXT,
    priority TEXT,
    complexity TEXT DEFAULT 'Média',
    hours REAL DEFAULT 8,
    hours_spent REAL DEFAULT 0,
    status TEXT DEFAULT 'backlog',
    desc TEXT,
    impediment TEXT,
    qa_approved INTEGER DEFAULT 0,
    qa_notes TEXT,
    qa_reviewer TEXT,
    qa_date TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE SET NULL,
    FOREIGN KEY (assignee_id) REFERENCES team_members(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS task_timesheet (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    hours REAL NOT NULL,
    date TEXT NOT NULL,
    notes TEXT,
    impediment TEXT,
    author TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS test_cases (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    type TEXT,
    req_id TEXT,
    task_id TEXT,
    status TEXT DEFAULT 'pending',
    steps TEXT,
    expected TEXT,
    FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE SET NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    entity_title TEXT,
    action TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT NOT NULL,
    actor_role TEXT,
    details TEXT NOT NULL,
    previous_state TEXT,
    new_state TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
  CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);

  CREATE TABLE IF NOT EXISTS promotion_goals (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    target_seniority TEXT NOT NULL,
    category TEXT NOT NULL,
    metric_key TEXT NOT NULL,
    target_value REAL NOT NULL,
    target_unit TEXT,
    weight INTEGER DEFAULT 2,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_goals_seniority ON promotion_goals(target_seniority);

  CREATE TABLE IF NOT EXISTS career_tracks (
    id TEXT PRIMARY KEY,
    role_name TEXT NOT NULL,
    discipline TEXT NOT NULL,
    icon TEXT DEFAULT '🧭',
    mission TEXT NOT NULL,
    levels TEXT NOT NULL,
    is_custom INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_career_tracks_created ON career_tracks(created_at DESC);

  CREATE TABLE IF NOT EXISTS document_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    is_default INTEGER DEFAULT 0,
    logo_url TEXT,
    doc_title TEXT NOT NULL,
    doc_subtitle TEXT,
    header_institution TEXT,
    primary_color TEXT DEFAULT '#0284c7',
    footer_text TEXT,
    approval_terms TEXT,
    signee_contratada_title TEXT DEFAULT 'PELA CONTRATADA (SYNCHRO)',
    signee_contratante_title TEXT DEFAULT 'PELA CONTRATANTE (CLIENTE)',
    include_user_story INTEGER DEFAULT 1,
    include_acceptance_criteria INTEGER DEFAULT 1,
    include_qa_evidence INTEGER DEFAULT 1,
    include_signatures INTEGER DEFAULT 1,
    include_kpis INTEGER DEFAULT 1,
    include_status_banner INTEGER DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_doc_templates_created ON document_templates(created_at ASC);

  CREATE TABLE IF NOT EXISTS apf_items (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    project_id TEXT,
    feature TEXT,
    req_id TEXT,
    function_type TEXT NOT NULL,
    category TEXT NOT NULL,
    td INTEGER NOT NULL DEFAULT 1,
    ar_tr INTEGER NOT NULL DEFAULT 1,
    complexity TEXT NOT NULL,
    raw_pf REAL NOT NULL DEFAULT 0,
    counting_type TEXT NOT NULL DEFAULT 'Desenvolvimento',
    operation_type TEXT NOT NULL DEFAULT 'ADD',
    factor REAL NOT NULL DEFAULT 1.0,
    final_pf REAL NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_apf_project ON apf_items(project_id);
  CREATE INDEX IF NOT EXISTS idx_apf_feature ON apf_items(feature);
  CREATE INDEX IF NOT EXISTS idx_apf_type ON apf_items(function_type);

  CREATE TABLE IF NOT EXISTS apf_inm_items (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    project_id TEXT,
    feature TEXT,
    req_id TEXT,
    category TEXT NOT NULL,
    catalog_key TEXT NOT NULL,
    item_name TEXT NOT NULL,
    description TEXT,
    quantity REAL NOT NULL DEFAULT 1,
    unit_weight REAL NOT NULL DEFAULT 0.8,
    calculated_pf REAL NOT NULL DEFAULT 0.8,
    evidence TEXT,
    status TEXT NOT NULL DEFAULT 'Aprovado',
    created_by TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (req_id) REFERENCES requirements(id) ON DELETE SET NULL
  );
  CREATE INDEX IF NOT EXISTS idx_apf_inm_project ON apf_inm_items(project_id);
  CREATE INDEX IF NOT EXISTS idx_apf_inm_req ON apf_inm_items(req_id);
  CREATE INDEX IF NOT EXISTS idx_apf_inm_created ON apf_inm_items(created_at ASC);

  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS cfps_ai_cache (
    cache_key TEXT PRIMARY KEY,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_cfps_cache_created ON cfps_ai_cache(created_at DESC);
`);

// Migrações seguras de colunas em bases já existentes
try { db.exec("ALTER TABLE tasks ADD COLUMN complexity TEXT DEFAULT 'Média'"); } catch (e) { }
try { db.exec("ALTER TABLE tasks ADD COLUMN dev_notes TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE tasks ADD COLUMN created_at TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE tasks ADD COLUMN updated_at TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE requirements ADD COLUMN feature TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE projects ADD COLUMN features TEXT"); } catch (e) { }
try { db.exec("ALTER TABLE apf_items ADD COLUMN operation_type TEXT DEFAULT 'ADD'"); } catch (e) { }

// ==============================================================================
// 2. Inicialização Segura do Banco (Apenas conta de Administrador se vazio)
// ==============================================================================
function seedDefaultGoals(force = false) {
  if (force) {
    db.prepare('DELETE FROM promotion_goals').run();
  }
  const count = db.prepare('SELECT count(*) as count FROM promotion_goals').get().count;
  if (count === 0 || force) {
    console.log('🌱 Inicializando Metas Padrão de Promoção no SQLite...');
    const insertGoal = db.prepare(`
      INSERT INTO promotion_goals (id, title, description, target_seniority, category, metric_key, target_value, target_unit, weight, is_active, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultGoals = [
      {
        id: "goal_1",
        title: "Autonomia em Média Complexidade",
        description: "Entrega consistente de tarefas de complexidade média com pouca necessidade de supervisão direta.",
        target_seniority: "Pleno",
        category: "volume",
        metric_key: "med_tasks",
        target_value: 2,
        target_unit: "demandas",
        weight: 3,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_2",
        title: "Iniciação em Alta Complexidade",
        description: "Capacidade comprovada de assumir e concluir com sucesso ao menos uma tarefa de Alta Complexidade no ciclo.",
        target_seniority: "Pleno",
        category: "complexity",
        metric_key: "high_tasks",
        target_value: 1,
        target_unit: "demandas",
        weight: 2,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_3",
        title: "Qualidade & Aprovação em QA",
        description: "Índice de aprovação direta em validações de QA e casos de testes sem bloqueios impeditivos.",
        target_seniority: "Pleno",
        category: "qa",
        metric_key: "qa_rate",
        target_value: 75,
        target_unit: "%",
        weight: 2,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_4",
        title: "Domínio de Alta Complexidade",
        description: "Liderança de entrega e resolução de problemas técnicos críticos de Alta Complexidade no sistema.",
        target_seniority: "Sênior",
        category: "complexity",
        metric_key: "high_tasks",
        target_value: 3,
        target_unit: "demandas",
        weight: 3,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_5",
        title: "Predomínio de Tarefas Críticas",
        description: "Proporção de tarefas de Alta Complexidade em relação ao volume total de demandas entregues pelo dev.",
        target_seniority: "Sênior",
        category: "complexity",
        metric_key: "high_percent",
        target_value: 25,
        target_unit: "%",
        weight: 2,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_6",
        title: "Acurácia de Estimativas & Horas",
        description: "Manter o equilíbrio de esforço com baixo desvio entre as horas estimadas e as horas apontadas na demanda.",
        target_seniority: "Sênior",
        category: "hours",
        metric_key: "hours_variance",
        target_value: 20,
        target_unit: "%",
        weight: 2,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_7",
        title: "Governança & Arquitetura de Software",
        description: "Liderança em soluções arquiteturais de alta criticidade e mentorias técnicas para os demais devs da squad.",
        target_seniority: "Tech Lead",
        category: "complexity",
        metric_key: "high_tasks",
        target_value: 5,
        target_unit: "demandas",
        weight: 3,
        is_active: 1,
        created_at: new Date().toISOString()
      },
      {
        id: "goal_8",
        title: "Excelência de Qualidade de Código",
        description: "Altíssimo rigor técnico com taxa de aprovação em QA superior a 90% em todas as entregas do ciclo.",
        target_seniority: "Tech Lead",
        category: "qa",
        metric_key: "qa_rate",
        target_value: 90,
        target_unit: "%",
        weight: 2,
        is_active: 1,
        created_at: new Date().toISOString()
      }
    ];

    defaultGoals.forEach(g => {
      insertGoal.run(g.id, g.title, g.description, g.target_seniority, g.category, g.metric_key, g.target_value, g.target_unit, g.weight, g.is_active, g.created_at);
    });
  }
}

function seedDefaultCareers(force = false) {
  if (force) {
    db.prepare('DELETE FROM career_tracks WHERE is_custom = 0').run();
  }
  const count = db.prepare('SELECT count(*) as count FROM career_tracks').get().count;
  if (count === 0 || force) {
    console.log('🌱 Inicializando Estruturas e Trilhas Padrão de Carreira no SQLite...');
    const insertTrack = db.prepare(`
      INSERT INTO career_tracks (id, role_name, discipline, icon, mission, levels, is_custom, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const defaultCareers = [
      {
        id: "frontend",
        roleName: "Desenvolvedor(a) Front-end",
        icon: "🎨",
        discipline: "Front-end Engineering",
        mission: "Criar interfaces responsivas, rápidas, acessíveis e robustas, conectando regras de negócio a experiências de usuário fluidas e confiáveis.",
        levels: [
          {
            key: "junior",
            name: "Front-end Júnior",
            nextLevel: "Front-end Pleno",
            tag: "Iniciação & Execução Guiada",
            focus: "Construção de componentes, correção de bugs de interface e consumo de APIs.",
            missionDetail: "Atua na implementação de componentes reutilizáveis, telas responsivas e consumo de endpoints REST definidos nos Requisitos/BDD.",
            hardSkills: ["HTML5 Semântico", "CSS3 / Flexbox / Grid", "JavaScript Moderno (ES6+)", "Consumo de APIs REST (Fetch/JSON)", "Git Básico", "Responsividade Mobile-first"],
            softSkills: ["Curiosidade técnica ativa", "Comunicação transparente nas dailies", "Atenção a feedbacks em Code Reviews"],
            metrics: { tasks: "4+ demandas", complexity: "2+ Médias e 1+ Alta", qaRate: "≥ 75% aprovação em QA", hoursVariance: "Desvio ≤ 25%" },
            triggers: ["Entrega consistente de demandas de Média Complexidade", "Capacidade de assumir 1 demanda de Alta Complexidade", "Aprovação em testes de QA ≥ 75%"]
          },
          {
            key: "pleno",
            name: "Front-end Pleno",
            nextLevel: "Front-end Sênior",
            tag: "Autonomia & Domínio de Soluções",
            focus: "Arquitetura clientside, performance Web Vitals, testes de componentes e Design System.",
            missionDetail: "Lidera a implementação de features completas de ponta a ponta com autonomia e conformidade arquitetural.",
            hardSkills: ["Arquitetura de Estado (Global & Local)", "Core Web Vitals (LCP, FID/INP, CLS)", "Acessibilidade Web (WCAG)", "Design Systems & Tokenização", "Testes de Componentes"],
            softSkills: ["Comunicação propositiva com Produto e QA", "Capacidade de dar mentorias a juniores", "Resolução independente de problemas"],
            metrics: { tasks: "6+ demandas", complexity: "3+ Altas (25%+ do volume)", qaRate: "≥ 85% aprovação em QA", hoursVariance: "Desvio ≤ 20%" },
            triggers: ["Domínio de Alta Complexidade com 3+ entregas críticas", "Mínimo de 25% de demandas de alta criticidade", "Aprovação em QA > 85%"]
          },
          {
            key: "senior",
            name: "Front-end Sênior",
            nextLevel: "Tech Lead Front-end",
            tag: "Excelência Técnica & Mentoria",
            focus: "Decisões arquiteturais, segurança front-end, tooling de build e governança de qualidade.",
            missionDetail: "Referência técnica da disciplina na squad. Define padrões de código, antecipa riscos arquiteturais e combate o débito técnico.",
            hardSkills: ["Decisões Arquiteturais Avançadas", "Segurança Front-end (XSS, CSP)", "Tooling de Build & Bundlers", "Otimização Extrema de Performance", "Code Reviews Formativos"],
            softSkills: ["Liderança técnica e influência positiva", "Resiliência na resolução de incidentes", "Habilidade de traduzir negócio em arquitetura"],
            metrics: { tasks: "Volume de alto impacto", complexity: "5+ Demandas Altas", qaRate: "≥ 90% aprovação em QA", readinessScore: "Score ≥ 85%" },
            triggers: ["Liderança em 5+ demandas de Alta Complexidade", "Taxa de aprovação em QA ≥ 90%", "Revisões de código de alto padrão formativo"]
          },
          {
            key: "lead",
            name: "Tech Lead Front-end / Staff",
            nextLevel: "Principal / Engineering Manager",
            tag: "Liderança de Engenharia & Impacto",
            focus: "Estratégia tecnológica, governança de squads, alinhamento executivo e desenvolvimento de talentos.",
            missionDetail: "Guia a evolução tecnológica transversal da plataforma, alinhando governança de engenharia aos objetivos estratégicos do negócio.",
            hardSkills: ["Arquitetura Corporativa Front-end", "Estratégia de Plataforma & Microfrontends", "Auditoria de Segurança & Compliance", "Definição de Métricas de Engenharia"],
            softSkills: ["Visão de negócio e impacto", "Gestão de conflitos e negociação", "Inspiração e atração de talentos"],
            metrics: { tasks: "Governança transversal", complexity: "Impacto arquitetural estratégico", qaRate: "≥ 95% aprovação em QA", readinessScore: "Score ≥ 90%" },
            triggers: ["Definição de diretrizes arquiteturais adotadas por múltiplas squads", "Zero incidentes críticos de arquitetura", "Formação e promoção comprovada de desenvolvedores plenos e sêniores"]
          }
        ]
      },
      {
        id: "backend",
        roleName: "Desenvolvedor(a) Back-end",
        icon: "⚙️",
        discipline: "Back-end & Systems Engineering",
        mission: "Projetar e construir serviços confiáveis, regras de negócio determinísticas, APIs de alto desempenho e persistência de dados com integridade transacional ACID.",
        levels: [
          {
            key: "junior",
            name: "Back-end Júnior",
            nextLevel: "Back-end Pleno",
            tag: "Iniciação & Execução Guiada",
            focus: "Criação de endpoints REST, migrations relacionais e testes unitários.",
            missionDetail: "Desenvolve rotas de API, regras de validação de dados e queries SQL otimizadas com orientação técnica.",
            hardSkills: ["Node.js / Go / Python", "SQL Relacional & Índices", "APIs RESTful & HTTP Status", "Git & Conventional Commits", "Testes Unitários"],
            softSkills: ["Curiosidade técnica ativa", "Transparência de bloqueios", "Disciplina em code review"],
            metrics: { tasks: "4+ demandas", complexity: "2+ Médias e 1+ Alta", qaRate: "≥ 75% aprovação em QA", hoursVariance: "Desvio ≤ 25%" },
            triggers: ["Entrega consistente de endpoints e queries sem gargalos", "Resolução de pelo menos 1 demanda de Alta Complexidade", "Aprovação em QA ≥ 75%"]
          },
          {
            key: "pleno",
            name: "Back-end Pleno",
            nextLevel: "Back-end Sênior",
            tag: "Autonomia & Confiabilidade de Serviços",
            focus: "Arquitetura de microsserviços, cache distribuído, transações ACID e mensageria.",
            missionDetail: "Projeta fluxos de ponta a ponta, modelagem de banco de dados e estratégias de resiliência e concorrência.",
            hardSkills: ["Modelagem Relacional Avançada", "Transações ACID & Concorrência", "Redis / Cache & Invalidação", "Docker & Containers", "Testes de Integração"],
            softSkills: ["Autonomia técnica", "Comunicação com QA e Front-end", "Resolução pragmática de problemas"],
            metrics: { tasks: "6+ demandas", complexity: "3+ Altas (25%+ do volume)", qaRate: "≥ 85% aprovação em QA", hoursVariance: "Desvio ≤ 20%" },
            triggers: ["Modelagem de banco de dados e fluxos complexos sem falhas", "Pelo menos 25% de demandas críticas", "Aprovação em QA > 85%"]
          },
          {
            key: "senior",
            name: "Back-end Sênior",
            nextLevel: "Tech Lead Back-end",
            tag: "Arquitetura Distribuída & Escalabilidade",
            focus: "Sistemas distribuídos, alta disponibilidade, observabilidade e segurança de dados.",
            missionDetail: "Lidera as decisões arquiteturais de back-end, combate débito técnico e atua como mentor de engenharia.",
            hardSkills: ["Sistemas Distribuídos & Event-driven", "Observabilidade (OpenTelemetry, Tracing)", "Segurança de APIs & OAuth/JWT", "Tuning de Banco de Dados & Query Plans"],
            softSkills: ["Liderança por influência", "Capacidade analítica aprofundada", "Mentoria ativa"],
            metrics: { tasks: "Volume crítico", complexity: "5+ Demandas Altas", qaRate: "≥ 90% aprovação em QA", readinessScore: "Score ≥ 85%" },
            triggers: ["Liderança em 5+ demandas críticas e arquiteturais", "Zero falhas graves de concorrência ou integridade", "Formação de novos plenos"]
          }
        ]
      },
      {
        id: "qa",
        roleName: "Analista de Qualidade / QA Engineer",
        icon: "🧪",
        discipline: "Quality Engineering & Testing",
        mission: "Assegurar que cada entrega atenda aos mais altos padrões de funcionalidade, usabilidade e segurança antes de alcançar o usuário final.",
        levels: [
          {
            key: "junior",
            name: "QA Analyst Júnior",
            nextLevel: "QA Engineer Pleno",
            tag: "Execução de Testes & Validação Funcional",
            focus: "Execução de casos de teste, escrita de cenários BDD e reporte de bugs claros.",
            missionDetail: "Valida critérios de aceitação, registra bugs com evidências reprodutíveis e atua na homologação formal de demandas.",
            hardSkills: ["Cenários BDD (Dado/Quando/Então)", "Testes Funcionais & Regressão", "Postman / Testes de API", "Critérios de Aceite"],
            softSkills: ["Atenção rigorosa aos detalhes", "Comunicação empática com desenvolvedores", "Pensamento crítico orientado ao usuário"],
            metrics: { tasks: "15+ casos de teste executados", complexity: "Validação em múltiplas demandas", qaRate: "Acurácia de reporte > 85%", hoursVariance: "Desvio ≤ 20%" },
            triggers: ["Execução consistente de testes sem deixar escapar bugs críticos", "Validação formal de requisitos BDD", "Reportes com passos de reprodução perfeitos"]
          },
          {
            key: "pleno",
            name: "QA Engineer Pleno",
            nextLevel: "Senior QA / QA Lead",
            tag: "Automação & Qualidade Shift-Left",
            focus: "Automação de testes E2E/API, esteiras CI/CD de qualidade e testes não-funcionais.",
            missionDetail: "Implementa suítes automatizadas de teste, antecipa riscos na fase de especificação e garante estabilidade nas releases.",
            hardSkills: ["Automação de Testes (Playwright/Cypress)", "Automação de APIs REST", "Integração Contínua (CI/CD Quality Gates)", "Testes de Performance Básicos"],
            softSkills: ["Disseminação de boas práticas de qualidade", "Proatividade em refinamentos", "Autonomia em automações"],
            metrics: { tasks: "Suíte automatizada ativa", complexity: "Testes automatizados em releases", qaRate: "Cobertura de testes > 75%", hoursVariance: "Desvio ≤ 15%" },
            triggers: ["Redução comprovada de bugs que chegam à homologação", "Implementação de automação de testes estável", "Participação ativa na validação de critérios de requisitos"]
          }
        ]
      },
      {
        id: "pm",
        roleName: "Product Manager (PM / Scrum Master)",
        icon: "📊",
        discipline: "Product Management & Agile Delivery",
        mission: "Maximizar o valor entregue pela squad, conectando os anseios do negócio e usuários a um fluxo contínuo, previsível e sustentável de engenharia.",
        levels: [
          {
            key: "junior",
            name: "Associate PM / Scrum Master",
            nextLevel: "Product Manager Pleno",
            tag: "Facilitação Ágil & Escrita de Requisitos",
            focus: "Especificação de requisitos BDD claros, facilitação de cerimônias e acompanhamento de métricas do Kanban.",
            missionDetail: "Garante que a squad tenha histórias refinadas, critérios de aceite objetivos e desbloqueio ágil de impedimentos.",
            hardSkills: ["Especificação BDD & User Stories", "Métricas Ágeis (Throughput, Lead Time)", "Gestão de Backlog & Priorização", "Facilitação de Rituais (Dailies, Retros)"],
            softSkills: ["Comunicação transparente", "Escuta ativa e empatia", "Organização e disciplina"],
            metrics: { tasks: "Backlog refinado para 2 sprints", complexity: "Requisitos BDD 100% especificados", qaRate: "Zero bloqueios por falta de especificação", hoursVariance: "Previsibilidade da squad > 80%" },
            triggers: ["Requisitos BDD completos e validados por tech leads", "Redução de ruído e retrabalho nas demandas", "Facilitação pontual das cerimônias da squad"]
          }
        ]
      },
      {
        id: "techlead",
        roleName: "Tech Lead & Liderança Técnica",
        icon: "👑",
        discipline: "Technical Leadership & Software Governance",
        mission: "Multiplicar o impacto da engenharia, equilibrando excelência arquitetural, governança de dados, desbloqueio de pessoas e velocidade de entrega.",
        levels: [
          {
            key: "lead",
            name: "Tech Lead",
            nextLevel: "Staff Engineer / Engineering Manager",
            tag: "Multiplicação Técnica & Excelência da Squad",
            focus: "Direcionamento arquitetural da squad, mentoria técnica, revisão de código e alinhamento com Produto.",
            missionDetail: "Garante a sustentabilidade técnica dos sistemas da squad, orienta desenvolvedores juniores e plenos, e viabiliza soluções robustas.",
            hardSkills: ["Arquitetura de Software & Microsserviços", "Code Review Formativo", "Gestão de Débito Técnico", "Observabilidade & SRE"],
            softSkills: ["Mentoria e desenvolvimento de talentos", "Comunicação assertiva e influência", "Resolução ágil de impedimentos"],
            metrics: { tasks: "Liderança de iniciativas complexas", complexity: "Arquitetura e governança transversal", qaRate: "Aprovação em QA > 90%", hoursVariance: "Estabilidade de prazos" },
            triggers: ["Evolução e promoção de membros da squad", "Arquitetura sem retrabalho crítico", "Governança e qualidade técnica reconhecidas"]
          }
        ]
      }
    ];

    for (const c of defaultCareers) {
      insertTrack.run(
        c.id,
        c.roleName,
        c.discipline,
        c.icon || '🧭',
        c.mission,
        JSON.stringify(c.levels),
        0,
        now,
        now
      );
    }
  }
}

function seedDatabaseIfEmpty() {
  const usersCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (usersCount === 0) {
    console.log('🌱 Criando conta raiz de Administrador no SQLite...');
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password, role, dev_role, seniority, skills, avatar_bg, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultUsers = [
      { id: "u_admin", name: "Carlos Valois (Admin)", email: "admin@synchro.com", password: "admin123", role: "admin", dev_role: null, seniority: "Workspace Owner / Diretor", skills: JSON.stringify(["Arquitetura", "Governança", "DevOps", "Segurança", "Go"]), avatar_bg: "#f59e0b", created_at: "2026-01-01T00:00:00.000Z" }
    ];

    defaultUsers.forEach(u => {
      insertUser.run(u.id, u.name, u.email, u.password, u.role, u.dev_role, u.seniority, u.skills, u.avatar_bg, u.created_at);
    });
  }

  seedDefaultGoals(false);
  seedDefaultCareers(false);
  seedDefaultDocumentTemplates(false);

  // Auto-migração transparente de registros legados DevSquad -> Synchro
  try {
    db.prepare(`
      UPDATE document_templates
      SET 
        name = REPLACE(name, 'DevSquad', 'Synchro'),
        description = REPLACE(description, 'DevSquad', 'Synchro'),
        header_institution = REPLACE(header_institution, 'DEVSQUAD', 'SYNCHRO'),
        footer_text = REPLACE(REPLACE(footer_text, 'DevSquad', 'Synchro'), 'DEVSQUAD', 'SYNCHRO'),
        signee_contratada_title = REPLACE(signee_contratada_title, 'DEVSQUAD', 'SYNCHRO')
      WHERE name LIKE '%DevSquad%' OR header_institution LIKE '%DEVSQUAD%' OR footer_text LIKE '%DevSquad%' OR signee_contratada_title LIKE '%DEVSQUAD%'
    `).run();

    db.prepare(`
      UPDATE users
      SET email = REPLACE(email, '@devsquad.com', '@synchro.com')
      WHERE email LIKE '%@devsquad.com'
    `).run();
  } catch (e) { }

  console.log('✅ Banco de dados SQLite verificado e pronto para operações!');
}

function seedDefaultDocumentTemplates(force = false) {
  if (force) {
    db.prepare('DELETE FROM document_templates').run();
  }
  const count = db.prepare('SELECT count(*) as count FROM document_templates').get().count;
  if (count === 0 || force) {
    console.log('🌱 Inicializando Templates Padrão de Documento no SQLite...');
    const insertTpl = db.prepare(`
      INSERT INTO document_templates (
        id, name, description, is_default, logo_url, doc_title, doc_subtitle,
        header_institution, primary_color, footer_text, approval_terms,
        signee_contratada_title, signee_contratante_title,
        include_user_story, include_acceptance_criteria, include_qa_evidence,
        include_signatures, include_kpis, include_status_banner,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const defaultTemplates = [
      {
        id: "tpl_default",
        name: "Padrão Corporativo Synchro (Oficial)",
        description: "Template institucional padrão do Synchro ALM com paleta Sky Blue (#0284c7), todos os blocos ativados e termo padrão de aceite contratual e medição.",
        is_default: 1,
        logo_url: "",
        doc_title: "RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS",
        doc_subtitle: "Artefato Oficial de Comprovação de Entrega Técnica para Fins de Faturamento & Aceite",
        header_institution: "SYNCHRO ALM PRO — PLATAFORMA INTEGRADA DE ENGENHARIA DE SOFTWARE",
        primary_color: "#0284c7",
        footer_text: "Synchro ALM Pro — Artefato Formal de Medição & Aceite Técnico",
        approval_terms: "Pelo presente instrumento, a CONTRATANTE atesta expressamente o pleno recebimento, homologação técnica e aceite formal dos requisitos de software e critérios de aceite descritos neste Relatório de Medição correspondentes à Feature / Marco acima especificado. Declara que os entregáveis foram devidamente verificados e aprovados pelo controle de qualidade (QA), em conformidade com as especificações contratadas, autorizando a emissão da respectiva Nota Fiscal de Serviços para faturamento.",
        signee_contratada_title: "PELA CONTRATADA (SYNCHRO)",
        signee_contratante_title: "PELA CONTRATANTE (CLIENTE)",
        include_user_story: 1,
        include_acceptance_criteria: 1,
        include_qa_evidence: 1,
        include_signatures: 1,
        include_kpis: 1,
        include_status_banner: 1,
        created_at: now,
        updated_at: now
      },
      {
        id: "tpl_exec_contract",
        name: "Executivo & Contratual Rigoroso (Enterprise)",
        description: "Modelo jurídico-técnico formal para grandes contas, auditorias de conformidade e contratos enterprise com termos de garantia de SLA e laudo de entrega.",
        is_default: 0,
        logo_url: "",
        doc_title: "DOCUMENTO TÉCNICO DE ESPECIFICAÇÃO & HOMOLOGAÇÃO DE REQUISITOS",
        doc_subtitle: "Laudo Pericial de Engenharia de Software, Rastreabilidade e Evidências de Qualidade Assegurada",
        header_institution: "DIRETORIA DE TECNOLOGIA, COMPLIANCE & AUDITORIA DE SISTEMAS",
        primary_color: "#1e3a8a",
        footer_text: "Documento Registrado e Auditado — Validade Contratual Plena — Confidencial",
        approval_terms: "A CONTRATANTE atesta expressamente para os devidos fins de direito que os requisitos e casos de teste foram homologados com total rigor técnico, estando em estrita conformidade com o escopo pactuado no Contrato Principal. Fica expressamente autorizado o faturamento financeiro do respectivo marco de entrega, iniciando-se nesta data o período regulamentar de garantia de software e suporte pós-implantação conforme SLA estipulado.",
        signee_contratada_title: "PELA CONTRATADA (DIRETORIA TÉCNICA)",
        signee_contratante_title: "PELA CONTRATANTE (FISCAL DO CONTRATO / C-LEVEL)",
        include_user_story: 1,
        include_acceptance_criteria: 1,
        include_qa_evidence: 1,
        include_signatures: 1,
        include_kpis: 1,
        include_status_banner: 1,
        created_at: now,
        updated_at: now
      },
      {
        id: "tpl_agile_spec",
        name: "Especificação Ágil & Enxuta (Sprint Spec)",
        description: "Modelo dinâmico focado no squad de desenvolvimento e Product Owner, priorizando Histórias de Usuário e Critérios BDD com layout leve e direto.",
        is_default: 0,
        logo_url: "",
        doc_title: "ESPECIFICAÇÃO FUNCIONAL DE REQUISITOS & SPRINT BACKLOG",
        doc_subtitle: "Alinhamento Contínuo de Escopo, Critérios de Aceite e Histórias de Usuário",
        header_institution: "SQUAD DE ENGENHARIA DE PRODUTO & ARQUITETURA ÁGIL",
        primary_color: "#059669",
        footer_text: "Synchro Agile Spec — Uso Interno e Alinhamento Técnico de Produto",
        approval_terms: "Os requisitos funcionais descritos neste documento foram refinados e validados conjuntamente pelo time de produto e engenharia, servindo como especificação oficial e critérios de aceite da sprint corrente.",
        signee_contratada_title: "PRODUCT OWNER (PO)",
        signee_contratante_title: "TECH LEAD / ENGENHEIRO RESPONSÁVEL",
        include_user_story: 1,
        include_acceptance_criteria: 1,
        include_qa_evidence: 0,
        include_signatures: 0,
        include_kpis: 1,
        include_status_banner: 0,
        created_at: now,
        updated_at: now
      }
    ];

    defaultTemplates.forEach(t => {
      insertTpl.run(
        t.id, t.name, t.description, t.is_default, t.logo_url, t.doc_title, t.doc_subtitle,
        t.header_institution, t.primary_color, t.footer_text, t.approval_terms,
        t.signee_contratada_title, t.signee_contratante_title,
        t.include_user_story, t.include_acceptance_criteria, t.include_qa_evidence,
        t.include_signatures, t.include_kpis, t.include_status_banner,
        t.created_at, t.updated_at
      );
    });
  }
}

seedDatabaseIfEmpty();

// ==============================================================================
// 2.1 Deduplicação e Integridade de Dados Automática
// ==============================================================================
function deduplicateEntities() {
  try {
    // 1. Deduplicar membros da equipe por nome normalizado (lower + trim)
    const members = db.prepare('SELECT * FROM team_members').all();
    const mapByName = new Map();

    for (const m of members) {
      const normName = (m.name || '').trim().toLowerCase();
      if (!normName) continue;
      if (!mapByName.has(normName)) {
        mapByName.set(normName, []);
      }
      mapByName.get(normName).push(m);
    }

    for (const [normName, group] of mapByName.entries()) {
      if (group.length > 1) {
        console.log(`🧹 [Deduplicação] Detectada duplicidade na equipe para "${group[0].name}" (${group.length} registros). Mesclando...`);
        // Escolhe o membro primário: prefere o que tiver demandas atribuídas ou skills
        let primary = group.find(m => {
          const taskCount = db.prepare('SELECT count(*) as c FROM tasks WHERE assignee_id = ?').get(m.id)?.c || 0;
          return taskCount > 0;
        });

        if (!primary) {
          primary = group.find(m => {
            let s = [];
            try { s = JSON.parse(m.skills); } catch (e) { }
            return Array.isArray(s) && s.length > 0;
          }) || group[0];
        }

        // Consolida habilidades e dados mais completos
        const mergedSkillsSet = new Set();
        let bestSeniority = primary.seniority;
        let bestRole = primary.role;
        let bestAvatarBg = primary.avatar_bg;

        for (const m of group) {
          try {
            const s = JSON.parse(m.skills);
            if (Array.isArray(s)) s.forEach(skill => mergedSkillsSet.add(skill));
          } catch (e) { }
          if (m.seniority && m.seniority !== 'Pleno') bestSeniority = m.seniority;
          if (m.role) bestRole = m.role;
          if (m.avatar_bg) bestAvatarBg = m.avatar_bg;
        }

        const mergedSkills = Array.from(mergedSkillsSet);

        // Atualiza o registro primário com os dados consolidados
        db.prepare(`
          UPDATE team_members
          SET role = ?, seniority = ?, skills = ?, avatar_bg = ?
          WHERE id = ?
        `).run(bestRole, bestSeniority, JSON.stringify(mergedSkills), bestAvatarBg, primary.id);

        // Reatribui tarefas associadas aos registros duplicados e remove os clones
        for (const m of group) {
          if (m.id !== primary.id) {
            db.prepare('UPDATE tasks SET assignee_id = ? WHERE assignee_id = ?').run(primary.id, m.id);
            db.prepare('DELETE FROM team_members WHERE id = ?').run(m.id);
            console.log(`   ↳ Clone removido: ID ${m.id} | Mantido ID principal: ${primary.id}`);
          }
        }
      }
    }

    // 2. Deduplicar usuários por e-mail normalizado (lower + trim)
    const users = db.prepare('SELECT * FROM users').all();
    const mapByEmail = new Map();
    for (const u of users) {
      const normEmail = (u.email || '').trim().toLowerCase();
      if (!normEmail) continue;
      if (!mapByEmail.has(normEmail)) {
        mapByEmail.set(normEmail, []);
      }
      mapByEmail.get(normEmail).push(u);
    }

    for (const [normEmail, group] of mapByEmail.entries()) {
      if (group.length > 1) {
        console.log(`🧹 [Deduplicação] Detectada duplicidade de usuário para "${normEmail}" (${group.length} registros).`);
        const primary = group[0];
        for (let i = 1; i < group.length; i++) {
          db.prepare('DELETE FROM users WHERE id = ?').run(group[i].id);
          console.log(`   ↳ Clone de usuário removido: ID ${group[i].id} | Mantido: ${primary.id}`);
        }
      }
    }
  } catch (err) {
    console.error('Erro na rotina de deduplicação:', err);
  }
}

deduplicateEntities();

// ==============================================================================
// 3. Utilitários para Respostas HTTP & Parsing
// ==============================================================================
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getActorFromReq(req) {
  const actorId = req.headers['x-user-id'] || null;
  let actorName = 'Usuário';
  if (req.headers['x-user-name']) {
    try {
      actorName = decodeURIComponent(req.headers['x-user-name']);
    } catch (e) {
      actorName = req.headers['x-user-name'];
    }
  }
  const actorRole = req.headers['x-user-role'] || null;
  return { actorId, actorName, actorRole, role: actorRole };
}

function logAudit({ entityType, entityId, entityTitle, action, actorId, actorName, actorRole, details, prevState, newState }) {
  try {
    const id = 'aud_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO audit_logs (id, entity_type, entity_id, entity_title, action, actor_id, actor_name, actor_role, details, previous_state, new_state, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      entityType || 'system',
      String(entityId || ''),
      entityTitle || null,
      action || 'ACTION',
      actorId || null,
      actorName || 'Sistema',
      actorRole || null,
      details || '',
      typeof prevState === 'object' ? JSON.stringify(prevState) : (prevState || null),
      typeof newState === 'object' ? JSON.stringify(newState) : (newState || null),
      now
    );
    return id;
  } catch (err) {
    console.error('[AUDIT ERROR]', err);
    return null;
  }
}

// ==============================================================================
// 4. Mapeamento de Entidades do Banco para o Frontend
// ==============================================================================
function getFullTasks() {
  const tasks = db.prepare('SELECT * FROM tasks').all();
  const timesheets = db.prepare('SELECT * FROM task_timesheet ORDER BY created_at DESC').all();

  return tasks.map(t => {
    const taskTs = timesheets
      .filter(ts => ts.task_id === t.id)
      .map(ts => ({
        id: ts.id,
        hours: ts.hours,
        date: ts.date,
        notes: ts.notes,
        impediment: ts.impediment,
        author: ts.author,
        timestamp: ts.created_at
      }));

    return {
      id: t.id,
      title: t.title,
      projectId: t.project_id,
      reqId: t.req_id,
      role: t.role,
      assigneeId: t.assignee_id,
      priority: t.priority,
      complexity: t.complexity || 'Média',
      hours: t.hours,
      hoursSpent: t.hours_spent,
      status: t.status,
      desc: t.desc,
      impediment: t.impediment,
      devNotes: t.dev_notes || '',
      qaApproved: Boolean(t.qa_approved),
      qaNotes: t.qa_notes || '',
      qaReviewer: t.qa_reviewer || '',
      qaDate: t.qa_date || null,
      createdAt: t.created_at || null,
      updatedAt: t.updated_at || null,
      timesheet: taskTs
    };
  });
}

function getFullAuditLogs(limit = 150) {
  try {
    const rows = db.prepare('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?').all(limit);
    return rows.map(r => ({
      id: r.id,
      entityType: r.entity_type,
      entityId: r.entity_id,
      entityTitle: r.entity_title,
      action: r.action,
      actorId: r.actor_id,
      actorName: r.actor_name,
      actorRole: r.actor_role,
      details: r.details,
      previousState: r.previous_state,
      newState: r.new_state,
      createdAt: r.created_at
    }));
  } catch (e) {
    return [];
  }
}

function getFullRequirements() {
  return db.prepare('SELECT * FROM requirements ORDER BY created_at DESC, id DESC').all().map(r => ({
    id: r.id,
    code: r.code,
    title: r.title,
    projectId: r.project_id,
    feature: r.feature || '',
    type: r.type,
    moscow: r.moscow,
    userStory: r.user_story,
    bdd: r.bdd,
    createdAt: r.created_at
  }));
}

function getFullTeamMembers() {
  const members = db.prepare('SELECT * FROM team_members').all();
  const seen = new Set();
  const unique = [];

  for (const m of members) {
    const key = (m.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let skills = [];
    try { skills = JSON.parse(m.skills); } catch (e) { }
    unique.push({
      id: m.id,
      name: m.name.trim(),
      role: m.role,
      seniority: m.seniority,
      skills: Array.isArray(skills) ? skills : [],
      capacity: m.capacity,
      avatarBg: m.avatar_bg
    });
  }
  return unique;
}

function getFullProjects() {
  return db.prepare('SELECT * FROM projects').all().map(p => {
    let features = [];
    if (p.features) {
      try {
        features = typeof p.features === 'string' ? JSON.parse(p.features) : p.features;
      } catch (e) {
        features = String(p.features).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      desc: p.desc,
      color: p.color,
      status: p.status,
      deadline: p.deadline,
      features: Array.isArray(features) ? features : []
    };
  });
}

function getFullTestCases() {
  return db.prepare('SELECT * FROM test_cases').all().map(tc => ({
    id: tc.id,
    title: tc.title,
    type: tc.type,
    reqId: tc.req_id,
    taskId: tc.task_id,
    status: tc.status,
    steps: tc.steps,
    expected: tc.expected
  }));
}

function getFullUsers() {
  const users = db.prepare('SELECT * FROM users').all();
  const seen = new Set();
  const unique = [];

  for (const u of users) {
    const key = (u.email || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let skills = [];
    try { skills = JSON.parse(u.skills); } catch (e) { }
    unique.push({
      id: u.id,
      name: u.name.trim(),
      email: u.email.trim(),
      password: u.password,
      role: u.role,
      devRole: u.dev_role,
      seniority: u.seniority,
      skills: Array.isArray(skills) ? skills : [],
      avatarBg: u.avatar_bg,
      createdAt: u.created_at
    });
  }
  return unique;
}

function getFullGoals() {
  const rows = db.prepare("SELECT * FROM promotion_goals ORDER BY CASE target_seniority WHEN 'Pleno' THEN 1 WHEN 'Sênior' THEN 2 WHEN 'Tech Lead' THEN 3 ELSE 4 END, weight DESC, created_at ASC").all();
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    targetSeniority: r.target_seniority,
    category: r.category,
    metricKey: r.metric_key,
    targetValue: r.target_value,
    targetUnit: r.target_unit,
    weight: r.weight,
    isActive: r.is_active === 1,
    createdAt: r.created_at
  }));
}

function getFullCareerTracks() {
  const rows = db.prepare("SELECT * FROM career_tracks ORDER BY is_custom ASC, created_at ASC").all();
  return rows.map(r => {
    let parsedLevels = [];
    try { parsedLevels = JSON.parse(r.levels); } catch (e) { parsedLevels = []; }
    return {
      id: r.id,
      roleName: r.role_name,
      discipline: r.discipline,
      icon: r.icon || '🧭',
      mission: r.mission,
      levels: parsedLevels,
      isCustom: r.is_custom === 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    };
  });
}

function getFullDocumentTemplates() {
  const rows = db.prepare('SELECT * FROM document_templates ORDER BY is_default DESC, created_at ASC').all();
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    description: r.description || '',
    isDefault: r.is_default === 1,
    logoUrl: r.logo_url || '',
    docTitle: r.doc_title,
    docSubtitle: r.doc_subtitle || '',
    headerInstitution: r.header_institution || '',
    primaryColor: r.primary_color || '#0284c7',
    footerText: r.footer_text || '',
    approvalTerms: r.approval_terms || '',
    signeeContratadaTitle: r.signee_contratada_title || 'PELA CONTRATADA (SYNCHRO)',
    signeeContratanteTitle: r.signee_contratante_title || 'PELA CONTRATANTE (CLIENTE)',
    includeUserStory: r.include_user_story === 1,
    includeAcceptanceCriteria: r.include_acceptance_criteria === 1,
    includeQaEvidence: r.include_qa_evidence === 1,
    includeSignatures: r.include_signatures === 1,
    includeKpis: r.include_kpis === 1,
    includeStatusBanner: r.include_status_banner === 1,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

// ------------------------------------------------------------------------------
// Funções de Cálculo e Matrizes de Decisão IFPUG CPM 4.3.1 (APF)
// ------------------------------------------------------------------------------
function getApfCategory(type) {
  const t = (type || '').toUpperCase().trim();
  if (t === 'ALI' || t === 'AIE') return 'Dados';
  return 'Transação'; // EE, SE, CE
}

function calculateApfComplexity(type, arTr, td) {
  const normType = (type || '').toUpperCase().trim();
  const arTrVal = Math.max(0, parseInt(arTr, 10) || 0);
  const tdVal = Math.max(1, parseInt(td, 10) || 1);

  // ALI / AIE: Arquivo Lógico Interno e Arquivo de Interface Externa
  // TRs \ TDs | 1 a 19 TDs | 20 a 50 TDs | 51+ TDs
  // 1 TR      |   Baixa    |    Baixa    |  Média
  // 2 a 5 TRs |   Baixa    |    Média    |  Alta
  // 6+ TRs    |   Média    |    Alta     |  Alta
  if (normType === 'ALI' || normType === 'AIE') {
    const tr = Math.max(1, arTrVal);
    if (tr === 1) {
      if (tdVal <= 19) return 'Baixa';
      if (tdVal <= 50) return 'Baixa';
      return 'Média'; // 51+
    } else if (tr >= 2 && tr <= 5) {
      if (tdVal <= 19) return 'Baixa';
      if (tdVal <= 50) return 'Média';
      return 'Alta'; // 51+
    } else { // tr >= 6
      if (tdVal <= 19) return 'Média';
      if (tdVal <= 50) return 'Alta';
      return 'Alta'; // 51+
    }
  }

  // EE: Entrada Externa
  // ARs \ TDs | 1 a 4 TDs | 5 a 15 TDs | 16+ TDs
  // 0 ou 1 AR |   Baixa   |   Baixa    |  Média
  // 2 ARs     |   Baixa   |   Média    |  Alta
  // 3+ ARs    |   Média   |   Alta     |  Alta
  if (normType === 'EE') {
    const ar = arTrVal;
    if (ar <= 1) {
      if (tdVal <= 4) return 'Baixa';
      if (tdVal <= 15) return 'Baixa';
      return 'Média'; // 16+
    } else if (ar === 2) {
      if (tdVal <= 4) return 'Baixa';
      if (tdVal <= 15) return 'Média';
      return 'Alta'; // 16+
    } else { // ar >= 3
      if (tdVal <= 4) return 'Média';
      if (tdVal <= 15) return 'Alta';
      return 'Alta'; // 16+
    }
  }

  // SE: Saída Externa
  // ARs \ TDs | 1 a 5 TDs | 6 a 19 TDs | 20+ TDs
  // 0 ou 1 AR |   Baixa   |   Baixa    |  Média
  // 2 ou 3 ARs|   Baixa   |   Média    |  Alta
  // 4+ ARs    |   Média   |   Alta     |  Alta
  if (normType === 'SE') {
    const ar = arTrVal;
    if (ar <= 1) {
      if (tdVal <= 5) return 'Baixa';
      if (tdVal <= 19) return 'Baixa';
      return 'Média'; // 20+
    } else if (ar >= 2 && ar <= 3) {
      if (tdVal <= 5) return 'Baixa';
      if (tdVal <= 19) return 'Média';
      return 'Alta'; // 20+
    } else { // ar >= 4
      if (tdVal <= 5) return 'Média';
      if (tdVal <= 19) return 'Alta';
      return 'Alta'; // 20+
    }
  }

  // CE: Consulta Externa
  // ARs \ TDs | 1 a 4 TDs | 5 a 19 TDs | 20+ TDs
  // 0 ou 1 AR |   Baixa   |   Baixa    |  Média
  // 2 ou 3 ARs|   Baixa   |   Média    |  Alta
  // 4+ ARs    |   Média   |   Alta     |  Alta
  if (normType === 'CE') {
    const ar = arTrVal;
    if (ar <= 1) {
      if (tdVal <= 4) return 'Baixa';
      if (tdVal <= 19) return 'Baixa';
      return 'Média'; // 20+
    } else if (ar >= 2 && ar <= 3) {
      if (tdVal <= 4) return 'Baixa';
      if (tdVal <= 19) return 'Média';
      return 'Alta'; // 20+
    } else { // ar >= 4
      if (tdVal <= 4) return 'Média';
      if (tdVal <= 19) return 'Alta';
      return 'Alta'; // 20+
    }
  }

  return 'Média';
}

const IFPUG_RAW_PF = {
  ALI: { 'Baixa': 7, 'Média': 10, 'Alta': 15 },
  AIE: { 'Baixa': 5, 'Média': 7, 'Alta': 10 },
  EE: { 'Baixa': 3, 'Média': 4, 'Alta': 6 },
  SE: { 'Baixa': 4, 'Média': 5, 'Alta': 7 },
  CE: { 'Baixa': 3, 'Média': 4, 'Alta': 6 }
};

function calculateApfRawPf(type, complexity) {
  const normType = (type || '').toUpperCase().trim();
  const c = complexity || 'Média';
  if (IFPUG_RAW_PF[normType] && IFPUG_RAW_PF[normType][c] !== undefined) {
    return IFPUG_RAW_PF[normType][c];
  }
  return 4;
}

// Tabela de Deflatores Contratuais por Tipo de Contagem e Operação de Melhoria (IFPUG CPM 4.3.1 + SISP v2.3)
const COUNTING_TYPE_FACTORS = {
  'Desenvolvimento': 1.00,
  'Melhoria': 0.50, // Padrão de Alteração (CHG) em melhoria quando não especificado ADD/DEL
  'Melhoria - Inclusão (ADD)': 1.00,
  'Melhoria - Alteração (CHG)': 0.50,
  'Melhoria - Exclusão (DEL)': 0.40,
  'Testes': 0.30,
  'Transferência Tecnológica': 0.20
};

// Deflatores de Impacto de Melhoria/Manutenção previstos nas tabelas contratuais do Padrão SISP
const SISP_ENHANCEMENT_FACTORS = {
  ADD: {
    code: 'ADD',
    label: 'Inclusão (ADD)',
    dataFactor: 1.00,
    transFactor: 1.00,
    defaultFactor: 1.00
  },
  CHG: {
    code: 'CHG',
    label: 'Alteração (CHG)',
    dataFactor: 0.35,   // Alteração padrão de Arquivo Lógico (ALI/AIE) no SISP: 35%
    transFactor: 0.50,  // Alteração padrão de Processo Elementar (EE/SE/CE) no SISP: 50%
    lowImpactFactor: 0.25,
    highImpactFactor: 0.75,
    defaultFactor: 0.50
  },
  DEL: {
    code: 'DEL',
    label: 'Exclusão (DEL)',
    dataFactor: 0.40,   // Exclusão funcional no SISP: 40%
    transFactor: 0.40,
    defaultFactor: 0.40
  }
};

function resolveApfOperationType(countingType, explicitOpType, text = '') {
  const normOp = (explicitOpType || '').toUpperCase().trim();
  if (normOp === 'ADD' || normOp === 'CHG' || normOp === 'DEL') {
    return normOp;
  }
  const ct = (countingType || '').trim();
  if (/\bADD\b|inclus[ãa]o/i.test(ct)) return 'ADD';
  if (/\bDEL\b|exclus[ãa]o/i.test(ct)) return 'DEL';
  if (/\bCHG\b|altera[çc][ãa]o/i.test(ct)) return 'CHG';

  const lower = (text || '').toLowerCase();
  // Auto-detecção semântica de Projeto de Melhoria (Operação CHG / DEL) mesmo quando o seletor padrão ainda está em "Desenvolvimento"
  const hasExplicitEvolutionaryChange = /(?:(?:^|\n)\s*(?:\[[^\]]+\]\s*)?(?:alterar|modificar|atualizar|evoluir|refatorar)\s+(?:o\s+|a\s+)?(?:processo|funcionalidade|fluxo|cadastro|relat[óo]rio|rotina|tela|m[óo]dulo|regra)|altera[çc][ãa]o\s+d[aeo]\s+(?:l[óo]gica|processo|fluxo|regra|funcionalidade)|modificar\s+(?:o\s+|a\s+)?(?:processo|fluxo|funcionalidade|regra)\s+existente|novos\s+atributos|atualizar\s+funcionalidade\s+existente|suportar\s+segundo\s+fator)/i.test(text);
  const hasExplicitFunctionRemoval = /(?:(?:^|\n)\s*(?:descontinuar|eliminar|depreciar|remover|excluir)\s+(?:a\s+|o\s+)?(?:fun[çc][ãa]o|funcionalidade|processo|tela|relat[óo]rio|m[óo]dulo)|exclus[ãa]o\s+d[ae]\s+fun[çc][ãa]o)/i.test(text);

  if (hasExplicitFunctionRemoval) {
    return 'DEL';
  }
  if (hasExplicitEvolutionaryChange) {
    return 'CHG';
  }

  if (ct.toLowerCase().startsWith('melhoria')) {
    if (/(?:descontinuar|remover\s+(?:a\s+)?(?:fun[çc][ãa]o|funcionalidade|tela|relat[óo]rio|consulta|rotina|m[óo]dulo|entidade|tabela)|excluir\s+(?:a\s+)?(?:fun[çc][ãa]o|funcionalidade|tela|relat[óo]rio|consulta|m[óo]dulo)|eliminar\s+(?:a\s+)?(?:tela|relat[óo]rio|fun[çc][ãa]o)|depreciar|exclus[ãa]o\s+d[ae]\s+fun[çc][ãa]o)/i.test(lower)) {
      return 'DEL';
    }
    if (/(?:nova\s+(?:fun[çc][ãa]o|funcionalidade|tela|consulta|entidade|tabela|integra[çc][ãa]o)|novo\s+(?:relat[óo]rio|m[óo]dulo|cadastro|processo)|criar\s+nova\s+(?:tela|funcionalidade|entidade))/i.test(lower) &&
      !/(?:alterar|modificar|ajustar|evoluir|manuten[çc][ãa]o|refatorar|existente)/i.test(lower)) {
      return 'ADD';
    }
    return 'CHG';
  }

  return 'ADD';
}

function getSispEnhancementFactor(operationType = 'CHG', functionType = 'EE', text = '') {
  const op = (operationType || 'CHG').toUpperCase().trim();
  const fnType = (functionType || 'EE').toUpperCase().trim();
  const isDataFn = fnType === 'ALI' || fnType === 'AIE';
  const lower = (text || '').toLowerCase();

  if (op === 'ADD') return SISP_ENHANCEMENT_FACTORS.ADD.defaultFactor;
  if (op === 'DEL') return SISP_ENHANCEMENT_FACTORS.DEL.defaultFactor;

  // Para CHG (Alteração): avalia se há menção explícita de impacto baixo/alto ou aplica tabela SISP por categoria (35% Dados / 50% Transação)
  if (/(?:baixo\s+impacto|ajuste\s+pontual|pequena\s+altera[çc][ãa]o|25%)/i.test(lower)) {
    return SISP_ENHANCEMENT_FACTORS.CHG.lowImpactFactor;
  }
  if (/(?:alto\s+impacto|reestrutura[çc][ãa]o\s+profunda|75%)/i.test(lower)) {
    return SISP_ENHANCEMENT_FACTORS.CHG.highImpactFactor;
  }
  return isDataFn ? SISP_ENHANCEMENT_FACTORS.CHG.dataFactor : SISP_ENHANCEMENT_FACTORS.CHG.transFactor;
}

function getCountingTypeFactor(countingType, customFactor, operationType = null, functionType = null, text = '') {
  const ct = (countingType || 'Desenvolvimento').trim();
  const isMelhoria = ct.toLowerCase().startsWith('melhoria');
  const resolvedOp = resolveApfOperationType(ct, operationType, text);

  if (customFactor !== undefined && customFactor !== null && !isNaN(parseFloat(customFactor))) {
    const parsed = Math.max(0, parseFloat(customFactor));
    // Se for operação CHG ou DEL (por seleção ou auto-detecção semântica) e o fator enviado for 1.0 por herança de default sem override explícito, aplica o deflator SISP correspondente
    if (parsed === 1.0 && (resolvedOp === 'CHG' || resolvedOp === 'DEL')) {
      return getSispEnhancementFactor(resolvedOp, functionType, text);
    }
    return parsed;
  }

  if (isMelhoria || resolvedOp === 'CHG' || resolvedOp === 'DEL') {
    return getSispEnhancementFactor(resolvedOp, functionType, text);
  }

  return COUNTING_TYPE_FACTORS[ct] !== undefined ? COUNTING_TYPE_FACTORS[ct] : 1.0;
}

function calculateApfFinalPf(rawPf, factor) {
  const f = parseFloat(factor);
  const factorVal = isNaN(f) ? 1.0 : f;
  return Math.round((rawPf * factorVal) * 100) / 100;
}

function getFullApfItems() {
  try {
    return db.prepare(`
      SELECT a.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
      FROM apf_items a
      LEFT JOIN projects p ON a.project_id = p.id
      LEFT JOIN requirements r ON a.req_id = r.id
      ORDER BY a.created_at DESC, a.id DESC
    `).all().map(a => ({
      id: a.id,
      code: a.code,
      name: a.name,
      projectId: a.project_id || '',
      projectName: a.project_name || '',
      projectCode: a.project_code || '',
      feature: a.feature || '',
      reqId: a.req_id || '',
      reqCode: a.req_code || '',
      reqTitle: a.req_title || '',
      functionType: a.function_type,
      category: a.category,
      td: a.td,
      arTr: a.ar_tr,
      complexity: a.complexity,
      rawPf: a.raw_pf,
      countingType: a.counting_type,
      operationType: a.operation_type || 'ADD',
      factor: a.factor,
      finalPf: a.final_pf,
      notes: a.notes || '',
      createdAt: a.created_at,
      updatedAt: a.updated_at
    }));
  } catch (e) {
    console.error('Erro ao buscar itens de APF:', e);
    return [];
  }
}

// Catálogo Pré-Definido de Itens Não-Mensuráveis (FPN • Métricas SISP / Contratuais)
const DEFAULT_INM_CATALOG = [
  {
    key: 'code_table_inclusao',
    name: 'Code Table - Inclusão / Nova Tabela de Apoio',
    category: 'Tabelas de Apoio',
    unitWeight: 0.80,
    unitLabel: 'Tabela',
    description: 'Criação ou configuração de nova tabela de domínio/código/apoio com carga inicial.'
  },
  {
    key: 'code_table_alteracao',
    name: 'Code Table - Alteração / Manutenção de Tabela',
    category: 'Tabelas de Apoio',
    unitWeight: 0.40,
    unitLabel: 'Tabela',
    description: 'Inclusão ou alteração de colunas/registros em tabela de código/apoio existente.'
  },
  {
    key: 'menu_item',
    name: 'Menus / Submenus - Inclusão ou Reestruturação',
    category: 'Interface & Menus',
    unitWeight: 0.10,
    unitLabel: 'Item de Menu',
    description: 'Inclusão, remoção ou reordenamento de item ou nó na árvore de menus da aplicação.'
  },
  {
    key: 'layout_alteracao',
    name: 'Layout / Template / Telas - Alteração Estética',
    category: 'Interface & Menus',
    unitWeight: 0.50,
    unitLabel: 'Tela/Layout',
    description: 'Modificação de layout visual, identidade CSS, template de apresentação sem alteração de regra transacional.'
  },
  {
    key: 'componente_ui',
    name: 'Componente Visual / Validação / Máscara de Campo',
    category: 'Interface & Menus',
    unitWeight: 0.25,
    unitLabel: 'Componente',
    description: 'Inclusão de máscara, formatador, validação de campo cliente ou ajuste simples de widget.'
  },
  {
    key: 'parametro_sistema',
    name: 'Parâmetro de Configuração / Setup de Sistema',
    category: 'Parâmetros & Configuração',
    unitWeight: 0.30,
    unitLabel: 'Parâmetro',
    description: 'Criação ou atualização de parâmetro global de configuração, chave de flag ou setup operacional.'
  },
  {
    key: 'perfil_seguranca',
    name: 'Perfis de Acesso / Permissões / Grupos de Segurança',
    category: 'Parâmetros & Configuração',
    unitWeight: 0.40,
    unitLabel: 'Perfil',
    description: 'Configuração de novo perfil funcional, grupo de segurança ou matriz de permissões.'
  },
  {
    key: 'db_view_indice',
    name: 'Criação / Ajuste de Views ou Índices de Banco',
    category: 'Banco de Dados',
    unitWeight: 0.50,
    unitLabel: 'View/Índice',
    description: 'Definição técnica de view, materialized view ou índice de performance em banco relacional.'
  },
  {
    key: 'db_trigger_proc',
    name: 'Triggers / Procedures / Rotinas de Banco',
    category: 'Banco de Dados',
    unitWeight: 1.00,
    unitLabel: 'Procedure/Trigger',
    description: 'Criação ou alteração de Stored Procedure, Function ou Trigger de banco de dados.'
  },
  {
    key: 'script_saneamento',
    name: 'Carga de Dados / Saneamento / Scripts de Migração',
    category: 'Scripts & Migração',
    unitWeight: 0.80,
    unitLabel: 'Script',
    description: 'Script de migração pontual, carga inicial de dados ou rotina técnica de saneamento.'
  },
  {
    key: 'relatorio_simples',
    name: 'Relatório Simples / Extração Direta / Exportação',
    category: 'Integrações & Relatórios',
    unitWeight: 0.60,
    unitLabel: 'Relatório',
    description: 'Extração tabular direta de dados ou relatório sem agregação multidimensional complexa.'
  },
  {
    key: 'webhook_tecnico',
    name: 'Webhook / Endpoint Auxiliar Técnico / Job de Fundo',
    category: 'Integrações & Relatórios',
    unitWeight: 0.75,
    unitLabel: 'Endpoint/Job',
    description: 'Configuração de webhook de notificação ou rotina de fila/job assíncrono auxiliar.'
  }
];

function getFullApfInmItems() {
  try {
    return db.prepare(`
      SELECT i.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
      FROM apf_inm_items i
      LEFT JOIN projects p ON i.project_id = p.id
      LEFT JOIN requirements r ON i.req_id = r.id
      ORDER BY i.created_at DESC, i.id DESC
    `).all().map(i => ({
      id: i.id,
      code: i.code,
      projectId: i.project_id || '',
      projectName: i.project_name || '',
      projectCode: i.project_code || '',
      feature: i.feature || '',
      reqId: i.req_id || '',
      reqCode: i.req_code || '',
      reqTitle: i.req_title || '',
      category: i.category,
      catalogKey: i.catalog_key,
      itemName: i.item_name,
      description: i.description || '',
      quantity: i.quantity,
      unitWeight: i.unit_weight,
      calculatedPf: i.calculated_pf,
      evidence: i.evidence || '',
      status: i.status || 'Aprovado',
      createdBy: i.created_by || '',
      createdAt: i.created_at,
      updatedAt: i.updated_at
    }));
  } catch (e) {
    console.error('Erro ao buscar itens não-mensuráveis de APF:', e);
    return [];
  }
}


/**
 * ==============================================================================
 * MOTOR ESPECIALISTA CFPS (Certified Function Point Specialist)
 * Decomposição baseada em IFPUG CPM 4.3.1 e Itens Não-Mensuráveis (Padrão SISP)
 * ==============================================================================
 */

/**
 * Normaliza rótulos de entidade em Title Case preservando preposições em minúsculo.
 */
function formatApfEntityLabel(raw) {
  return (raw || '').trim().split(/\s+/).filter(Boolean).map(w => {
    if (['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'ao', 'aos', 'via'].includes(w.toLowerCase())) {
      return w.toLowerCase();
    }
    if (/^(?:api|crm|erp|sla|pix|cpf|cnpj|cep|rdr|bcb|http|rest|json|soap|sisp|ifpug)(?:\/(?:api|rdr|bcb))?$/i.test(w)) {
      return w.toUpperCase();
    }
    if (w.includes('/')) {
      return w.split('/').map(p => /^(?:api|rdr|bcb|crm|erp|sla|http|rest|json)$/i.test(p) ? p.toUpperCase() : (p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())).join('/');
    }
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * Identifica se a especificação referencia dados mantidos por sistema/API externa (AIE),
 * distinguindo chamadas a APIs oficiais/terceiros de cargas locais de arquivo ou APIs internas.
 */
function detectExternalInterfaceInfo(fullText, cleanTitle = '') {
  const text = `${cleanTitle}\n${fullText}`;
  const lowerText = text.toLowerCase();

  const isBatchOrConversionLoad = /(?:importar\s+(?:lote|um\s+arquivo)|anexa\s+um\s+arquivo\s+de\s+carga|via\s+arquivo\s+csv|carga\s+de\s+convers[ãa]o|carga\s+inicial\s+de\s+legado|dump\s+legado|migra[çc][ãa]o\s+de\s+dados)/i.test(lowerText)
    && !/(?:api|webservice|nuvem|receita\s+federal|governamental)/i.test(lowerText);
  if (isBatchOrConversionLoad) {
    return { isExternal: false, externalSourceName: '' };
  }

  const hasExplicitExternalKeyword = /(?:api\s+externa|api\s+de\s+[\p{L}\s]+hospedada\s+em\s+nuvem|integra[çc][ãa]o\s+externa|sistema\s+externo|servi[çc]o\s+externo|estrutura\s+externa|provedor\s+(?:de\s+software\s+)?externo|plataforma\s+externa|fonte\s+externa|base\s+externa|terceiros|gateway|correios|receita\s+federal|serasa|banco\s+central|sefaz|bacen|via\s*cep|gov\.br|open\s*finance|webservice\s+externo|web\s+service\s+do\s+bcb|sistema\s+legado|consulta\s+externa\s+via\s+api|\brdr\/?bcb\b)/iu.test(lowerText);

  // Detecta APIs oficiais ou nomeadas de terceiros sem cruzar quebras de linha (ex.: "via API Reclame Aqui", "API do BCB", "endpoint do RDR")
  const namedApiRegex = /(?:(?:via|na|no|da|do|pela|com[ \t]+a|atrav[ée]s[ \t]+d[aeo]|integr(?:ar|a[çc][ãa]o)[ \t]+com(?:[ \t]+a)?)[ \t]+)?(?:api(?:[ \t]+(?:oficial|p[úu]blica|externa|rest|graphql))?|web\s*service|endpoint)[ \t]+(?:(?:d[aeo]s?[ \t]+)?(?!(?:interna|interno|local|pr[óo]pria|pr[óo]prio|sistema|aplica[çc][ãa]o|plataforma|crm|erp|backend|rest|graphql|soap|http|json)\b)([\p{L}\p{N}_\/-]+(?:[ \t]+[\p{L}\p{N}_\/-]+){0,2}))/giu;
  let namedMatch;
  let capturedSource = '';
  while ((namedMatch = namedApiRegex.exec(text)) !== null) {
    const rawCandidate = (namedMatch[1] || '').split(/[\r\n]/)[0].trim()
      .split(/\s+(?:para|que|com|em|no|na|e|ou|dos|das|de|retornar|retorna|retorne|enviar|envia|envie|responder|responde|rejeitar|validar|emitir|falhar|for|estiver|enviando)\b/i)[0]
      .replace(/[.,;:()"\n]+$/g, '')
      .trim();
    if (rawCandidate && !/^(?:interna|interno|local|pr[óo]pria|pr[óo]prio|sistema|aplica[çc][ãa]o|plataforma|crm|erp|dados|consulta|consultas|integra[çc][ãa]o|rest|graphql|soap)$/i.test(rawCandidate)) {
      if (/\b(?:rdr|bcb|bacen|banco\s+central)\b/i.test(rawCandidate)) {
        capturedSource = /\b(?:rdr|bcb)\b/i.test(text) ? 'API RDR/BCB' : `API ${formatApfEntityLabel(rawCandidate)}`;
      } else {
        capturedSource = `API ${formatApfEntityLabel(rawCandidate)}`;
      }
      break;
    }
  }

  if (!capturedSource && /(?:\brdr\/?bcb\b|web\s*service\s+d[eo]\s+bcb|banco\s+central)/i.test(text)) {
    capturedSource = /\brdr\b/i.test(text) ? 'API RDR/BCB' : 'API Banco Central (BCB)';
  }

  const hasOfficialExternalApi = /\bapi\s+(?:oficial|p[úu]blica|de\s+terceiros)\b/i.test(lowerText);
  const isExternal = hasExplicitExternalKeyword || hasOfficialExternalApi || Boolean(capturedSource);

  return { isExternal, externalSourceName: capturedSource };
}

/**
 * Extrai tokens semânticos de um rótulo de ALI/AIE para comparação robusta de inventário.
 */
function extractDataFnTokens(label, functionType) {
  const cleaned = (label || '')
    .toLowerCase()
    .replace(/^(?:ali|aie)\s*-\s*(?:estrutura de dados|interface externa)\s*:\s*/i, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[\/\-_:.,;]+/g, ' ')
    .trim();
  const commonStop = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com', 'via', 'a', 'o', 'estrutura', 'dados', 'interface', 'externa', 'sistema', 'aplicacao', 'crm', 'tabela', 'arquivo', 'logico', 'cadastro', 'registro', 'registros']);
  if (functionType === 'AIE') {
    commonStop.add('api');
    commonStop.add('webservice');
    commonStop.add('web');
    commonStop.add('service');
    commonStop.add('endpoint');
    commonStop.add('oficial');
    commonStop.add('anexo');
    commonStop.add('anexos');
  }
  return cleaned
    .split(/\s+/)
    .map(t => {
      if (t === 'bacen' || t === 'bcb') return 'bcb';
      let norm = t.replace(/(?:ões|oes)$/i, 'ao').replace(/ais$/i, 'al');
      if (norm.length > 4 && norm.endsWith('s')) norm = norm.slice(0, -1);
      return norm;
    })
    .filter(t => t.length >= 2 && !commonStop.has(t));
}

/**
 * Verifica se já existe ALI ou AIE equivalente cadastrado no projeto para evitar dupla contagem.
 */
function projectHasDataFunction(projectId, functionType, candidateLabels = []) {
  if (!projectId || projectId === 'all') return false;
  try {
    const existingRows = db.prepare(`SELECT name FROM apf_items WHERE project_id = ? AND function_type = ?`).all(projectId, functionType);
    const normalizedTargets = candidateLabels
      .map(l => (l || '').toLowerCase().replace(/^(?:ali|aie)\s*-\s*(?:estrutura de dados|interface externa)\s*:\s*/i, '').replace(/\([^)]*\)/g, '').trim())
      .filter(l => l.length > 2);
    if (normalizedTargets.length === 0) return false;
    const targetTokenSets = candidateLabels.map(l => extractDataFnTokens(l, functionType)).filter(ts => ts.length > 0);

    return existingRows.some(row => {
      const cleanedRowName = (row.name || '')
        .toLowerCase()
        .replace(/^(?:ali|aie)\s*-\s*(?:estrutura de dados|interface externa)\s*:\s*/i, '')
        .replace(/\([^)]*\)/g, '')
        .trim();
      if (cleanedRowName.length <= 2) return false;

      if (normalizedTargets.some(target =>
        cleanedRowName === target
        || cleanedRowName.startsWith(`${target} `)
        || cleanedRowName.startsWith(`${target}/`)
        || target.startsWith(`${cleanedRowName} `)
        || target.startsWith(`${cleanedRowName}/`)
      )) {
        return true;
      }

      const rowTokens = extractDataFnTokens(row.name, functionType);
      if (rowTokens.length === 0) return false;

      if (functionType === 'AIE') {
        const rowSet = new Set(rowTokens);
        return targetTokenSets.some(ts => ts.some(t => rowSet.has(t)));
      }

      // Para ALI, exige equivalência estrita dos tokens principais (evitando confundir "Anexos de Demandas" com "Demandas")
      return targetTokenSets.some(ts => ts.length === rowTokens.length && ts.every(t => rowTokens.includes(t)));
    });
  } catch (e) {
    return false;
  }
}

/**
 * Realiza a análise semântica e mensuração precisa de Pontos de Função (PF)
 * conforme IFPUG CPM 4.3.1 e Padrão SISP / Roteiro de Métricas.
 */
function analyzeCfpsSpecification(spec, options = {}) {
  const countingType = options.countingType || spec.countingType || 'Desenvolvimento';
  const explicitOpType = options.operationType || spec.operationType || null;
  const customFactor = options.factor !== undefined ? options.factor : spec.factor;

  const title = (spec.title || '').trim();
  const userStory = (spec.userStory || spec.user_story || '').trim();
  const bdd = (spec.bdd || '').trim();
  const feature = (spec.feature || '').trim();
  const customText = (spec.text || spec.specification || '').trim();
  const reqId = spec.reqId || spec.id || '';
  const reqCode = spec.code || spec.reqCode || '';
  const projectId = spec.projectId || spec.project_id || '';

  const fullText = [title, feature, userStory, bdd, customText].filter(Boolean).join('\n');
  const lowerText = fullText.toLowerCase();

  const resolvedOpType = resolveApfOperationType(countingType, explicitOpType, fullText);
  // Se a análise semântica detectou CHG ou DEL e o countingType veio no default 'Desenvolvimento', promove para 'Melhoria'
  const effectiveCountingType = ((resolvedOpType === 'CHG' || resolvedOpType === 'DEL') && countingType === 'Desenvolvimento')
    ? 'Melhoria'
    : countingType;
  const getCandidateFactor = (fnType, candOpType = resolvedOpType) =>
    getCountingTypeFactor(effectiveCountingType, customFactor, candOpType, fnType, fullText);

  // 1. Análise de Fronteira e Intenção Primária (suporta formato clássico com vírgulas e bullets multilinha "Como: / Quero: / Para que:")
  let userRole = 'Usuário do Sistema';
  let userWant = title || 'operar processo de negócio';
  let userBenefit = 'atender aos objetivos operacionais e contratuais do negócio';

  const storyMatch = fullText.match(/(?:^|[\n•\-*])\s*como\s*:\s*([^\n]+?)\s*(?:[\n•\-*]+\s*)?quero\s*:\s*([^\n]+?)(?:\s*(?:[\n•\-*]+\s*)?para\s+que\s*:\s*([^\n]+))?(?=\n|$)/im)
    || fullText.match(/como\s*:?\s*([^,\n]+),\s*(?:eu\s+)?quero\s*:?\s*([^,\n]+)(?:,\s*para\s+que\s*:?\s*([^.\n]+))?/i);
  if (storyMatch) {
    userRole = storyMatch[1].trim().replace(/[.;]+$/, '');
    userWant = storyMatch[2].trim().replace(/[.;]+$/, '');
    if (storyMatch[3]) userBenefit = storyMatch[3].trim().replace(/[.;]+$/, '');
  }

  // 2. Extração de Entidade Principal e Identificação de Interface Externa
  const isTechFeatureSlug = /^feat[_\-\s]*\d+$/i.test(feature);
  const cleanTitle = (title || '').replace(/^\s*\[[^\]]+\]\s*/, '').trim();
  const titleWithoutTransport = cleanTitle.replace(/\s+(?:via|atrav[ée]s\s+d[ae]|pela|na)\s+(?:a\s+)?(?:api|webservice|webhook)\b.*$/i, '').trim() || cleanTitle;
  let entityName = (!isTechFeatureSlug && feature) ? feature : (titleWithoutTransport || 'Entidade de Negócio');
  const entityMatch = titleWithoutTransport.match(/(?:manter|estrutura|gestão|cadastro|cadastrar|módulo|controle|extensão|consulta|consultar|calendário|registro|registo|administração|relatório|demonstrativo|dashboard|painel|extrato|fluxo|trilha|manutenção|listagem|exclusão|excluir|remover|alteração|alterar|integrar|ingestão|captura|sincronização|integração|importação)(?:\s+[\p{L}]+){0,2}\s+(?:de|com|novo|nova)\s+([^,\.\n-]+?)(?:\s+para\s+incluir\s+.*)?$/iu)
    || titleWithoutTransport.match(/para\s+([^,\.\n-]+)/i);
  if (entityMatch && entityMatch[1] && entityMatch[1].trim().length > 2) {
    entityName = entityMatch[1].trim();
  } else if (!isTechFeatureSlug && feature && feature.length > 2) {
    entityName = feature;
  }
  entityName = formatApfEntityLabel(entityName);
  const externalInfo = detectExternalInterfaceInfo(fullText, cleanTitle);

  // 3. Detecção de Fluxo de Autenticação / Ação Única e Extração Rigorosa de TDs (DETs) de Negócio
  const isAuthFlow = /(?:^|\b)(?:login|logar|logout|deslogar|encerrar\s+sessão|autentica(?:r|ção)|recupera(?:r|ção)\s+de?\s*senha|esqueci\s+(?:a\s+|minha\s+)?senha|redefinir\s+senha|troca(?:r)?\s+de?\s*senha|alterar\s+senha)(?:\b|$)/i.test(`${title} ${userWant}`);

  const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const detectedFields = [];
  const externalAieFields = [];
  const seenNormalizedFields = new Set();

  // Limpa trechos narrativos que não representam entrada/saída de atributos de negócio na fronteira:
  // - Cabeçalho "Como <ator>," e cláusula de justificativa ", para que <benefício>"
  // - Rótulos de botões/ações entre aspas (ex.: clica em "Gerar Relatório", "Exportar Demonstrativo") — já contam no +1 TD de acionamento!
  // - Mensagens literais de erro/sucesso entre aspas (já cobertas pelo +1 TD de mensagem de sistema)
  // - Efeitos colaterais internos de log/timestamp ("registra a data/hora do último acesso", "atualiza o histórico de auditoria com a data/hora da emissão")
  // - Redirecionamentos de navegação ("redireciona o usuário para o dashboard")
  const cleanedFieldText = fullText
    .replace(/como\s+[^,]+,/gi, ' ')
    .replace(/,\s*para\s+que\s+[^.\n]+/gi, ' ')
    .replace(/(?:clica(?:r)?\s+(?:em|no\s+bot[ãa]o)|aciona(?:r)?(?:\s+o\s+bot[ãa]o)?|pressiona(?:r)?(?:\s+o\s+bot[ãa]o)?|bot[ãa]o|comando)\s*[:"]?\s*"[^"]*"/gi, ' ')
    .replace(/(?:mensagem(?:\s+de\s+(?:erro|sucesso|alerta|validação))?|alerta|erro|exibe\s+(?:a\s+)?mensagem[^"]*)\s*[:"]?\s*"[^"]*"/gi, ' ')
    .replace(/(?:registra(?:r)?|atualiza(?:r)?|grava(?:r)?)\s+(?:a\s+|o\s+)?(?:hist[óo]rico\s+de\s+auditoria\s+com\s+a\s+)?data(?:\s*\/\s*hora)?\s+d[aeo]\s+(?:[úu]ltimo\s+acesso|emiss[ãa]o|opera[çc][ãa]o|execu[çc][ãa]o)/gi, ' ')
    .replace(/redireciona(?:r)?\s+(?:o\s+[\p{L}]+\s+)?para\s+[^.,;\n]+/giu, ' ')
    .replace(/(?:dado\s+que\s+o\s+|quando\s+o\s+|então\s+o\s+|base\s+de\s+|cadastro\s+de\s+|tabela\s+de\s+)usu[áa]rios?\b/gi, ' ');

  if (isAuthFlow) {
    // Em fluxos de autenticação/login/senha, contabiliza os campos de credenciais, 2FA e atributos de controle de bloqueio/tentativas
    const hasPalavraPasse = /(?:^|[^\p{L}\p{N}_])palavra-passe(?:$|[^\p{L}\p{N}_])/iu.test(cleanedFieldText);
    const authCredentialPatterns = [
      { label: 'e-mail', canonical: 'email', regex: /(?:^|[^\p{L}\p{N}_])(?:e-mail|email)(?:$|[^\p{L}\p{N}_])/iu },
      { label: 'cpf', canonical: 'cpf', regex: /(?:^|[^\p{L}\p{N}_])cpf(?:$|[^\p{L}\p{N}_])/iu },
      { label: hasPalavraPasse ? 'palavra-passe' : 'senha', canonical: 'senha', regex: /(?:^|[^\p{L}\p{N}_])(?:senha|palavra-passe|password)(?:$|[^\p{L}\p{N}_])/iu },
      { label: 'nova senha', canonical: 'nova_senha', regex: /(?:^|[^\p{L}\p{N}_])(?:nova\s+senha|nova\s+palavra-passe)(?:$|[^\p{L}\p{N}_])/iu },
      { label: 'confirmação de senha', canonical: 'confirmacao_senha', regex: /(?:^|[^\p{L}\p{N}_])confirma(?:r|ção)\s+(?:de\s+|a\s+)?(?:senha|palavra-passe)(?:$|[^\p{L}\p{N}_])/iu },
      { label: 'código de segurança 2FA', canonical: 'token', regex: /(?:^|[^\p{L}\p{N}_])(?:token|otp|2fa|código\s+de\s+(?:verificação|segurança(?:\s+temporário)?(?:\s+2fa)?))(?:$|[^\p{L}\p{N}_])/iu },
      { label: 'contador de tentativas falhadas', canonical: 'contador_tentativas', regex: /\bcontador\s+de\s+tentativas(?:\s+falhadas)?\b/iu },
      { label: 'estado do perfil/bloqueado', canonical: 'estado_bloqueio', regex: /(?:estado\s+do\s+perfil|conta\s+bloqueada|atualizando\s+o\s+estado\s+do\s+perfil\s+para\s+"?bloqueado"?)/iu }
    ];
    authCredentialPatterns.forEach(pat => {
      if (pat.regex.test(cleanedFieldText) && !seenNormalizedFields.has(pat.canonical)) {
        seenNormalizedFields.add(pat.canonical);
        detectedFields.push(pat.label);
      }
    });
    // Caso utilize nome de usuário/utilizador no lugar de e-mail/cpf
    if (!seenNormalizedFields.has('email') && !seenNormalizedFields.has('cpf')) {
      if (/(?:nome\s+de\s+usu[áa]rio|campo\s+usu[áa]rio|campo\s+utilizador|username|\blogin\s+e\s+(?:senha|palavra-passe)\b)/i.test(cleanedFieldText)) {
        seenNormalizedFields.add('usuario');
        detectedFields.unshift('usuário');
      }
    }
    // Se for login padrão e apenas 1 credencial foi citada nominalmente, garante o par padrão (credencial + senha = 2 TDs de negócio)
    if (/login|autentica/i.test(`${title} ${userWant}`) && detectedFields.length === 0) {
      detectedFields.push('e-mail', 'senha');
    }
  } else {
    // 3.0. Parser de Listas Literais de Atributos Delimitadas por Parênteses no BDD / User Story
    // Exemplo: "(código do projeto, nome do projeto, data de início, ... e observações gerais)"
    // Preserva termos compostos e atributos distintos que compartilham palavras-chave (ex.: 3 datas distintas = 3 TDs).
    const parenRegex = /\(([^()]{8,500})\)/g;
    let parenMatch;
    let extractedFromParenthesesCount = 0;
    while ((parenMatch = parenRegex.exec(fullText)) !== null) {
      const inside = parenMatch[1].trim();
      const precedingContext = fullText.slice(Math.max(0, parenMatch.index - 120), parenMatch.index);
      // Ignora títulos de cenário ("Cenário 1 (...)") e orações negativas ("(sem alteração de telas, sem regras...)")
      if (/cen[áa]rio\s*\d*\s*$/i.test(precedingContext.trim())) continue;
      if (/\bsem\s+/i.test(inside)) continue;
      const isSingleIdExpr = /^(?:id|identificador|c[óo]digo)\s+d[eo]\s+[\p{L}\s]+$/iu.test(inside);
      // Aceita listas separadas por vírgula, pares de atributos ligados por " e ", ou identificador explícito entre parênteses
      if (!inside.includes(',') && !/\s+e\s+/i.test(inside) && !isSingleIdExpr) continue;
      const rawParts = inside
        .split(/\s*,\s*|\s+e\s+/i)
        .map(p => p.replace(/^[\s•\-:]+|[\s.;:]+$/g, '').trim())
        .filter(Boolean);

      // Verifica se os itens parecem nomes de atributos (1 a 6 palavras cada)
      const isSingleIdParen = rawParts.length === 1 && /^(?:id|identificador|c[óo]digo)\s+d[eo]\s+[\p{L}\s]+$/iu.test(rawParts[0]);
      if ((rawParts.length >= 2 || isSingleIdParen) && rawParts.every(p => p.split(/\s+/).length <= 6)) {
        const isExternalContext = /(?:servi[çc]o\s+externo|api\s+externa|sistema\s+externo|base\s+externa|interface\s+externa|estrutura\s+externa|feriados\s+referenciados|obtidos\s+via\s+api|subregistros?\s+subordinados?)/i.test(precedingContext);
        rawParts.forEach(attr => {
          const normAttr = attr.toLowerCase();
          if (isExternalContext && !externalAieFields.some(f => f.toLowerCase() === normAttr)) {
            externalAieFields.push(attr);
          }
          if (!seenNormalizedFields.has(normAttr)) {
            seenNormalizedFields.add(normAttr);
            detectedFields.push(attr);
            extractedFromParenthesesCount++;
          }
        });
      }
    }

    // Quando os atributos de saída/entidade foram listados entre parênteses, verifica também se há filtros de entrada explícitos
    // ou campos de resumo de processamento em lote citados fora dos parênteses no BDD
    if (extractedFromParenthesesCount >= 3 && !/(?:persist[êe]ncia\s+mestre[\s-]detalhe|^manter\s+estrutura\s+de\b)/i.test(`${cleanTitle}\n${lowerText}`)) {
      const textWithoutParenLists = cleanedFieldText.replace(/\([^()]{6,500}\)/g, ' ');
      const filterClauseRegex = /(?:selecion[ao](?:r)?|inform[ao](?:r)?(?:\s+o\s+filtro)?|filtr[ao](?:r)?\s+por)\s+([^,.;\n"]+)/gi;
      let filterMatch;
      const filterItemsToPrepend = [];
      const hasExplicitDateBounds = Array.from(seenNormalizedFields).some(f => /data\s+(?:inicial|final|de\s+in[íi]cio|de\s+t[ée]rmino)/i.test(f));
      while ((filterMatch = filterClauseRegex.exec(textWithoutParenLists)) !== null) {
        const rawFilterClause = filterMatch[1].trim();
        const parts = rawFilterClause
          .split(/\s*,\s*|\s+e\s+/i)
          .map(p => p.replace(/^(?:o|a|os|as|um|uma)\s+/i, '').replace(/[\s.;:]+$/g, '').trim())
          .filter(p => p && p.length > 2 && p.split(/\s+/).length <= 5);
        parts.forEach(fAttr => {
          const normF = fAttr.toLowerCase();
          // Ignora rótulos genéricos de agrupamento de filtros/campos quando os itens já estão entre parênteses
          if (/^(?:per[íi]odo|par[âa]metros?\s+de\s+busca|filtros?\s+de\s+busca|crit[ée]rios?\s+de\s+busca|dados?\s+cadastrais|novos?\s+campos?)$/i.test(normF)) {
            if (!/^per[íi]odo$/i.test(normF) || hasExplicitDateBounds) return;
          }
          if (!seenNormalizedFields.has(normF)) {
            seenNormalizedFields.add(normF);
            filterItemsToPrepend.push(fAttr);
          }
        });
      }
      if (filterItemsToPrepend.length > 0) {
        detectedFields.unshift(...filterItemsToPrepend);
      }

      // Captura campos de retorno/resumo de processamento em lote (ex.: "emite o resumo com o total de registros processados e total de inconsistências descartadas")
      const batchSummaryMatch = textWithoutParenLists.match(/(?:emite|exibe|apresenta|gera)\s+o\s+resumo\s+com\s+([^.;\n]+)/i);
      if (batchSummaryMatch && batchSummaryMatch[1]) {
        const summaryParts = batchSummaryMatch[1]
          .split(/\s*,\s*|\s+e\s+/i)
          .map(p => p.replace(/^(?:o|a|os|as|um|uma)\s+/i, '').replace(/[\s.;:]+$/g, '').trim())
          .filter(p => p && p.length > 3 && p.split(/\s+/).length <= 6);
        summaryParts.forEach(sAttr => {
          const normS = sAttr.toLowerCase();
          if (!seenNormalizedFields.has(normS)) {
            seenNormalizedFields.add(normS);
            detectedFields.push(sAttr);
          }
        });
      }
    }

    // Se a especificação não enumerou os atributos explicitamente entre parênteses, aplica os extratores semânticos e de palavras-chave
    if (extractedFromParenthesesCount < 2 && !/(?:100%\s+de\s+infraestrutura|estritamente\s+t[ée]cnica\s+de\s+infraestrutura|sem\s+processos\s+elementares)/i.test(lowerText)) {
      // 3.1. Padrões Semânticos Compostos (Filtros, Dimensões e Indicadores Calculados/Derivados)
      const semanticBusinessPatterns = [
        {
          label: 'equipa',
          canonical: 'equipa',
          excludes: [],
          regex: /(?:por\s+(?:per[íi]odo\s+e\s+)?equipa|por\s+(?:per[íi]odo\s+e\s+)?equipe|seleciona(?:r)?\s+(?:uma\s+|a\s+)?equipa|seleciona(?:r)?\s+(?:uma\s+|a\s+)?equipe|filtro\s+de\s+equipa|filtro\s+de\s+equipe)/i
        },
        {
          label: 'período/datas',
          canonical: 'periodo_datas',
          excludes: ['data'],
          regex: /(?:per[íi]odo\s+de\s+datas|por\s+per[íi]odo|define\s+um\s+per[íi]odo|intervalo\s+de\s+datas|data\s+inicial\s+e\s+final)/i
        },
        {
          label: 'colaborador/membro',
          canonical: 'colaborador_membro',
          excludes: [],
          regex: /(?:por\s+membro|por\s+colaborador|regist(?:r)?os\s+de\s+membros|dados\s+d[eo]\s+colaborador|produtividade\s+por\s+membro)/i
        },
        {
          label: 'horas apontadas',
          canonical: 'horas_apontadas',
          excludes: ['total', 'quantidade'],
          regex: /(?:total\s+de\s+horas\s+apontadas|horas\s+apontadas|soma\s+das\s+horas\s+trabalhadas|horas\s+trabalhadas|apontamentos\s+de\s+horas)/i
        },
        {
          label: 'média de PF',
          canonical: 'media_pf',
          excludes: ['pontuação'],
          regex: /(?:m[ée]dia(?:\s+aritm[ée]tica)?\s+de\s+pontos\s+de\s+fun[çc][ãa]o|m[ée]dia\s+de\s+pf|pontos\s+de\s+fun[çc][ãa]o\s+entregues)/i
        },
        {
          label: 'índice de eficiência',
          canonical: 'indice_eficiencia',
          excludes: ['taxa'],
          regex: /(?:[íi]ndice(?:\s+percentual)?\s+de\s+efici[êe]ncia|percentual\s+de\s+conformidade|taxa\s+de\s+efici[êe]ncia)/i
        }
      ];

      semanticBusinessPatterns.forEach(pat => {
        if (pat.regex.test(cleanedFieldText) && !seenNormalizedFields.has(pat.canonical)) {
          seenNormalizedFields.add(pat.canonical);
          (pat.excludes || []).forEach(ex => seenNormalizedFields.add(ex));
          detectedFields.push(pat.label);
        }
      });

      // 3.2. Extrator de Filtros Explícitos e Métricas Calculadas/Consolidadas em Painéis, Fechamentos e Submissões (ex.: "seleciono o código do projeto e o ano contábil", "calcula o somatório..., a variância... e o valor residual...")
      if (detectedFields.length < 3) {
        const textNoParen2 = cleanedFieldText.replace(/\([^()]{6,500}\)/g, ' ');
        const filterClauseRegex2 = /(?:selecion[ao](?:r)?|inform(?:a|o|ar|ando)(?:\s+o\s+filtro)?|filtr[ao](?:r)?\s+por)\s+([^.;\n"]+?)(?=,\s*quando\b|\bquando\b|\bent[ãa]o\b|,\s*o\s+sistema\b|\s+e\s+submete\b|,\s*para\s+|[.;\n"]|$)/gi;
        let fMatch2;
        while ((fMatch2 = filterClauseRegex2.exec(textNoParen2)) !== null) {
          const parts = fMatch2[1]
            .split(/\s*,\s*|\s+e\s+/i)
            .map(p => p.replace(/^(?:o|a|os|as|um|uma|seus|suas)\s+/i, '').replace(/[\s.;:]+$/g, '').trim())
            .filter(p => p && p.length > 2 && p.split(/\s+/).length <= 5 && !/^(?:usu[áa]rio|dados\s+pessoais|dados\s+contratuais)$/i.test(p));
          parts.forEach(fAttr => {
            const normF = fAttr.toLowerCase();
            if (!seenNormalizedFields.has(normF)) {
              seenNormalizedFields.add(normF);
              detectedFields.push(fAttr);
            }
          });
        }

        // Prefere a cláusula explícita do BDD ("calcula o ...") e complementa com métricas derivadas da User Story ("calculando os desvios...")
        const calcMatches = [...cleanedFieldText.matchAll(/\bcalcula(?:r|ndo)?\s+([^.;\n]+?)(?=,\s*para\s+|,\s*gravando|,\s*atualizando|\s+e\s+apresentando|\s+e\s+exibindo|[.;\n]|$)/gi)];
        if (calcMatches.length > 0) {
          // Se houver tanto "calculando..." (User Story) quanto "calcula..." (BDD detalhado), prioriza o BDD detalhado primeiro e adiciona apenas o consolidado principal da User Story se distinto
          const orderedCalcMatches = calcMatches.length > 1 ? [calcMatches[1], calcMatches[0]] : calcMatches;
          orderedCalcMatches.forEach((cm, idx) => {
            const rawCalc = cm[1];
            const calcParts = rawCalc
              .split(/\s*,\s*|\s+e\s+/i)
              .map(p => p.replace(/^(?:o|a|os|as|um|uma)\s+/i, '').replace(/[\s.;:]+$/g, '').trim())
              .filter(p => p && p.length > 3 && p.split(/\s+/).length <= 7);
            // Se já extraiu 5+ métricas detalhadas do BDD, do resumo da User Story aproveita apenas o 1º indicador síntese (ex.: "desvios orçamentários")
            const partsToUse = (idx === 1 && calcMatches.length > 1 && detectedFields.length >= 7) ? calcParts.slice(0, 1) : calcParts;
            partsToUse.forEach(cAttr => {
              const normC = cAttr.toLowerCase();
              if (!seenNormalizedFields.has(normC)) {
                seenNormalizedFields.add(normC);
                detectedFields.push(cAttr);
              }
            });
          });
        }

        const consolidMatch = cleanedFieldText.match(/consolidando\s+(?:o\s+|a\s+|os\s+|as\s+)?([^,.;\n]+?)\s+contra\s+(?:o\s+|a\s+|os\s+|as\s+)?([^,.;\n]+)/i);
        if (consolidMatch && consolidMatch[1]) {
          const cLabel = `${consolidMatch[1].trim()} vs ${consolidMatch[2].trim()}`;
          const normCLabel = cLabel.toLowerCase();
          if (!seenNormalizedFields.has(normCLabel)) {
            seenNormalizedFields.add(normCLabel);
            detectedFields.push(cLabel);
          }
        }
      }

      if (detectedFields.length < 3) {
        const commonFieldKeywords = [
          'nome', 'título', 'descrição', 'email', 'e-mail', 'cpf', 'cnpj', 'telefone', 'celular',
          'endereço', 'rua', 'número', 'bairro', 'cidade', 'estado', 'cep', 'país', 'senha',
          'cargo', 'departamento', 'data de nascimento', 'data de criação', 'data',
          'horário', 'status', 'situação', 'valor', 'preço', 'saldo', 'total', 'taxa', 'desconto',
          'código', 'identificador', 'categoria', 'observação', 'motivo',
          'anexo', 'foto', 'avatar', 'competência', 'nota', 'pontuação',
          'token', 'chave', 'quantidade', 'origem',
          'destino', 'agência', 'pix', 'cartão', 'responsável'
        ];

        commonFieldKeywords.forEach(k => {
          const regex = new RegExp(`(?:^|[^\\p{L}\\p{N}_])${escapeRegex(k)}(?:$|[^\\p{L}\\p{N}_])`, 'iu');
          if (regex.test(cleanedFieldText)) {
            const canonical = k === 'e-mail' ? 'email' : k.toLowerCase();
            if (!seenNormalizedFields.has(canonical)) {
              seenNormalizedFields.add(canonical);
              detectedFields.push(k);
            }
          }
        });

        const quotedMatches = cleanedFieldText.match(/"([^"]{2,30})"/g) || [];
        quotedMatches.forEach(q => {
          const clean = q.replace(/"/g, '').trim();
          const norm = clean.toLowerCase();
          // Ignora frases de erro/sucesso/validação e também rótulos de botões/ações entre aspas (ex.: "Gerar Relatório", "Exportar Demonstrativo")
          const isSystemMessage = /(?:inválid|incorret|obrigatóri|sucesso|erro|falha|não\s+encontrad|acesso\s+negado|bloquead)/i.test(clean);
          const isActionButtonLabel = /^(?:gerar|exportar|emitir|salvar|gravar|enviar|submeter|confirmar|cancelar|voltar|fechar|filtrar|buscar|pesquisar|limpar|entrar|acessar|sair|excluir|remover|editar|alterar|atualizar|novo|adicionar|incluir|imprimir|baixar|download|upload|visualizar|consultar)\b/i.test(clean);
          if (clean && !isSystemMessage && !isActionButtonLabel && !seenNormalizedFields.has(norm) && clean.length > 2 && clean.split(/\s+/).length <= 3) {
            seenNormalizedFields.add(norm);
            detectedFields.push(clean);
          }
        });
      }
    }
  }

  // Regra 1 (IFPUG CPM 4.3.1): Sem piso artificial de 6 TDs.
  // - Atributos de negócio identificados (mínimo de 1 atributo/dado quando nenhum campo explícito for citado).
  // - Para Transações (EE, CE, SE): soma estritamente os campos de negócio + 2 TDs de controle padrão
  //   (+1 TD para mecanismo de acionamento/submissão e +1 TD para mensagem/feedback do sistema).
  //   Se nenhum campo específico for detectado além da ação, o mínimo natural é de 3 TDs (1 dado + 1 acionamento + 1 mensagem).
  // - Para Funções de Dados (ALI, AIE): contabiliza estritamente os atributos de negócio persistidos (sem +2 TDs de controle).
  const businessTdCount = detectedFields.length > 0 ? detectedFields.length : 1;
  const transactionTd = businessTdCount + 2;
  const dataTd = businessTdCount;

  // Regra 4 (IFPUG CPM 4.3.1): Padrão inicial de 1 TR (a entidade principal) para ALIs e AIEs.
  // Só contabiliza 2+ TRs se o requisito descrever explicitamente subtabelas dependentes / subgrupos integrados / subregistros subordinados.
  const hasExplicitSubgroups = /(?:subtabela|sub-tabela|subgrupo|sub-grupo|subregistros?\s+subordinados?|mestre[\s-]detalhe|itens\s+d[eo]\s+\w+|dependentes\s+d[eo]\s+\w+|tabela\s+filha|entidade\s+filha|subtipo\s+integrado)/i.test(lowerText);
  const inferredDataTr = hasExplicitSubgroups ? 2 : 1;

  // Detecção Semântica de Múltiplos Arquivos Referenciados (AR / FTR):
  // Em relatórios consolidados, analíticos (SE), consultas (CE) ou transações que cruzam múltiplos contextos de negócio,
  // identifica os grupos lógicos (entidades de dados) lidos/mantidos citados no requisito.
  const detectedArEntities = [];
  const seenArKeys = new Set();

  if (!isAuthFlow) {
    // Limpa cabeçalho "Como <ator>,", cláusula de benefício ", para...", listas de colunas entre parênteses e efeitos colaterais técnicos de log na exportação
    const arScanText = fullText
      .replace(/como\s+[^,]+,/gi, ' ')
      .replace(/,\s*para\s+(?:que\s+|permitir\s+|desvincular\s+|verificar\s+|tomada\s+de\s+|obter\s+|melhorar\s+|garantir\s+|preservar\s+|registrar\s+)[^.\n]+/gi, ' ')
      .replace(/\([^()]{8,500}\)/g, ' ')
      .replace(/(?:atualiza(?:r)?|gravando)\s+(?:o\s+|a\s+)?(?:data\s+de\s+apura[çc][ãa]o\s+no\s+)?(?:hist[óo]rico|log)\s+de\s+auditoria(?:\s+com\s+a\s+data(?:\s*\/\s*hora)?\s+da\s+emiss[ãa]o)?/gi, ' ');

    const domainEntityGroups = [
      { key: 'projetos', label: 'Projetos', regex: /\b(?:projeto(?:s)?)\b/i },
      { key: 'equipa_colaborador', label: 'Equipa / Colaboradores (Membros)', regex: /\b(?:equipa(?:s)?|equipe(?:s)?|membro(?:s)?|colaborador(?:es)?|usu[áa]rio(?:s)?|aloca[çc][ãa]o\s+de\s+equipa)\b/i },
      { key: 'tarefas_requisitos', label: 'Tarefas / Requisitos / Entregas', regex: /\b(?:tarefa(?:s)?|requisito(?:s)?|demanda(?:s)?|item\s+de\s+backlog|pontos\s+de\s+fun[çc][ãa]o\s+(?:entregues|conclu[íi]dos))\b/i },
      { key: 'apontamentos_horas', label: 'Apontamentos de Horas / Timesheet', regex: /\b(?:apontamento(?:s)?(?:\s+de\s+horas)?|horas\s+(?:apontadas|trabalhadas|registradas)|timesheet|lan[çc]amento(?:s)?\s+de\s+horas)\b/i },
      { key: 'despesas_orcamento', label: 'Despesas / Custos / Orçamento', regex: /\b(?:despesa(?:s)?|or[çc]amento|gastos?\s+incorridos?|custos?\s+reais)\b/i },
      { key: 'aliquotas_tributarias', label: 'Alíquotas Tributárias', regex: /\b(?:al[íi]quotas?\s+tribut[áa]rias?|tabelas?\s+de\s+al[íi]quotas?)\b/i },
      { key: 'controle_financeiro_contabil', label: 'Controle Financeiro / Histórico Contábil', regex: /\b(?:controle\s+de\s+compet[êe]ncias?|hist[óo]rico\s+cont[áa]bil|per[íi]odo\s+financeiro)\b/i },
      { key: 'lote_importacao', label: 'Lote / Execuções de Importação', regex: /\b(?:execu[çc][õo]es\s+de\s+importa[çc][ãa]o|registro\s+de\s+lote)\b/i },
      { key: 'auditoria_log', label: 'Auditoria / Histórico de Logs e Acessos', regex: /\b(?:relat[óo]rio\s+de\s+auditoria|consultar\s+(?:hist[óo]rico|trilha)\s+de\s+auditoria|trilha\s+de\s+auditoria|log\s+de\s+revoga[çc][ãa]o|hist[óo]rico\s+de\s+acessos)\b/i },
      { key: 'clientes_fornecedores', label: 'Clientes / Fornecedores', regex: /\b(?:cliente(?:s)?|fornecedor(?:es)?)\b/i },
      { key: 'pedidos_contratos', label: 'Pedidos / Contratos / Faturas', regex: /\b(?:pedido(?:s)?|contrato(?:s)?|ordem\s+de\s+servi[çc]o|fatura(?:s)?|nota(?:s)?\s+fisca(?:l|is))\b/i },
      { key: 'produtos_catalogo', label: 'Produtos / Catálogo / Estoque', regex: /\b(?:produto(?:s)?|estoque|invent[áa]rio)\b/i }
    ];

    const isConsolidatedOrMultiContext = /(?:consolidad|agrega|cruza(?:r|ndo)?|m[úu]ltiplas\s+entidades|dois\s+arquivos\s+l[óo]gicos|duas\s+tabelas|l[êe]\s+os\s+registros\s+de|consulta(?:r)?\s+(?:o\s+|a\s+|os\s+|as\s+)?(?:regist(?:r)?os|dados|tabelas|listagem|hist[óo]rico)\s+de\s+[^.,;\n]+|relat[óo]rio\s+anal[íi]tico|demonstrativo\s+anal[íi]tico|balancete\s+anal[íi]tico|painel\s+anal[íi]tico|dashboard|gera\s+o\s+registro\s+de\s+lote|grava\s+o\s+log\s+de\s+revoga[çc][ãa]o)/i.test(lowerText);

    if (isConsolidatedOrMultiContext) {
      domainEntityGroups.forEach(grp => {
        if (grp.regex.test(arScanText) && !seenArKeys.has(grp.key)) {
          seenArKeys.add(grp.key);
          detectedArEntities.push(grp.label);
        }
      });
      // Quando uma consulta cruza explicitamente a entidade Equipe com a disponibilidade/alocação detalhada de Colaboradores, contabiliza os 2 ARs (Equipe + Colaborador/Alocação)
      if (detectedArEntities.length === 1 && seenArKeys.has('equipa_colaborador') && /(?:aloca[çc][ãa]o\s+de\s+equipes?.*colaborador(?:es)?|equipes?.*disponibilidade\s+(?:detalhada\s+)?de\s+colaborador(?:es)?)/i.test(arScanText)) {
        detectedArEntities.push('Colaboradores / Alocação');
      }
    }
  }

  const hasMultipleReferencedFiles = /(?:dois\s+arquivos\s+l[óo]gicos|duas\s+tabelas|m[úu]ltiplas\s+entidades|cruzando\s+dados\s+de|validar\s+no\s+cadastro\s+de\s+\w+\s+e\s+gravar\s+em)/i.test(lowerText);
  const inferredTransAr = detectedArEntities.length > 1
    ? detectedArEntities.length
    : (hasMultipleReferencedFiles ? 2 : 1);

  // 4. Detecção Inicial de Candidatos Não-Mensuráveis (FPN • Padrão SISP / Roteiro de Métricas)
  // Classificados em absorbableByIfpug (interface, menus, máscaras, CSS, parâmetros/tabelas de código derivados da tela)
  // vs itens técnicos avulsos de banco/scripts.
  const rawInmCandidates = [];
  const inmDefinitions = [
    {
      key: 'code_table_inclusao',
      name: 'Code Table - Inclusão / Nova Tabela de Apoio',
      category: 'Tabelas de Apoio',
      unitWeight: 0.80,
      absorbableByIfpug: true,
      regex: /(nova\s+tabela\s+de\s+(apoio|código|domínio)|criar\s+tabela\s+de\s+(apoio|código|domínio)|inclusão\s+de\s+tabela\s+de\s+código|code\s*table.*(nova|inclus|cri))/i,
      justification: 'Inclusão de tabela de domínio/código/apoio sem manutenção direta via interface de negócio (SISP/FPN).'
    },
    {
      key: 'code_table_alteracao',
      name: 'Code Table - Alteração / Manutenção de Tabela',
      category: 'Tabelas de Apoio',
      unitWeight: 0.40,
      absorbableByIfpug: true,
      regex: /(alterar\s+tabela\s+de\s+(apoio|código|domínio)|manutenção\s+de\s+tabela\s+de\s+(apoio|código|domínio)|ajuste\s+em\s+tabela\s+de\s+código|novos\s+registros\s+de\s+domínio|code\s*table.*(alter|manut|atualiz))/i,
      justification: 'Alteração pontual de estrutura ou valores em tabela de código/apoio já existente (SISP/FPN).'
    },
    {
      key: 'menu_item',
      name: 'Menus / Submenus - Inclusão ou Reestruturação',
      category: 'Interface & Menus',
      unitWeight: 0.10,
      absorbableByIfpug: true,
      regex: /(\bmenu\b|\bsubmenu\b|item\s+de\s+menu|barra\s+de\s+navegação|árvore\s+de\s+menus|reestrutur.*menu)/i,
      justification: 'Ajuste ou inserção de novos nós de navegação e hierarquia de menus no sistema (SISP/FPN).'
    },
    {
      key: 'layout_alteracao',
      name: 'Layout / Template / Telas - Alteração Estética',
      category: 'Interface & Menus',
      unitWeight: 0.50,
      absorbableByIfpug: true,
      regex: /(\blayout\b|\bcss\b|estética|identidade\s+visual|template\s+visual|responsiv|ajuste\s+de\s+layout|tema\s+escuro|tema\s+claro|estiliza)/i,
      justification: 'Intervenção visual e apresentação CSS/estética sem impacto na lógica transacional do sistema (SISP/FPN).'
    },
    {
      key: 'componente_ui',
      name: 'Componente Visual / Validação / Máscara de Campo',
      category: 'Interface & Menus',
      unitWeight: 0.25,
      absorbableByIfpug: true,
      regex: /(máscara|\bmask\b|validação\s+de\s+campo|autocomplete|formatador|tooltip|datepicker|date-picker|combo\s+dinâmico)/i,
      justification: 'Inclusão de máscara, formatador, validação de campo cliente ou ajuste simples de widget (SISP/FPN).'
    },
    {
      key: 'parametro_sistema',
      name: 'Parâmetro de Configuração / Setup de Sistema',
      category: 'Parâmetros & Configuração',
      unitWeight: 0.30,
      absorbableByIfpug: true,
      regex: /(parâmetro\s+de\s+sistema|configuração\s+global|chave\s+de\s+configuração|variável\s+de\s+ambiente|feature\s+toggle)/i,
      justification: 'Criação ou atualização de parâmetro global de configuração ou setup operacional (SISP/FPN).'
    },
    {
      key: 'perfil_seguranca',
      name: 'Perfis de Acesso / Permissões / Grupos de Segurança',
      category: 'Parâmetros & Configuração',
      unitWeight: 0.40,
      absorbableByIfpug: true,
      regex: /(novo\s+perfil\s+de\s+acesso|matriz\s+de\s+permissão|grupo\s+de\s+segurança|nível\s+de\s+permissão|configurar\s+role)/i,
      justification: 'Definição de novo perfil de acesso ou permissão na matriz de segurança (SISP/FPN).'
    },
    {
      key: 'db_view_indice',
      name: 'Criação / Ajuste de Views ou Índices de Banco',
      category: 'Banco de Dados',
      unitWeight: 0.50,
      absorbableByIfpug: false,
      regex: /(criar\s+índice|índice\s+de\s+(?:banco|performance)|view\s+de\s+banco|materialized\s+view|otimização\s+de\s+query|plano\s+de\s+execução)/i,
      justification: 'Criação técnica avulsa de view ou índice no banco de dados para desempenho (SISP/FPN).'
    },
    {
      key: 'db_trigger_proc',
      name: 'Triggers / Procedures / Rotinas de Banco',
      category: 'Banco de Dados',
      unitWeight: 1.00,
      absorbableByIfpug: false,
      qtyRegex: /\b(\d+)\s+(?:novos?\s+|novas?\s+)?(?:triggers?|procedures?|stored\s+procedures?|gatilhos?)\b/i,
      regex: /(\btriggers?\b|stored\s+procedures?|\bprocedures?\b|gatilhos?\s+de\s+banco|function\s+de\s+banco)/i,
      justification: 'Implementação técnica avulsa de Stored Procedure ou Trigger em nível de banco de dados (SISP/FPN).'
    },
    {
      key: 'job_webhook_rotina',
      name: 'Webhook / Job Agendado / Script de Banco',
      category: 'Banco de Dados',
      unitWeight: 0.75,
      absorbableByIfpug: false,
      qtyRegex: /\b(\d+)\s+(?:novos?\s+|novas?\s+)?(?:jobs?(?:\s+agendados?)?|webhooks?|rotinas?\s+de\s+expurgo)\b/i,
      regex: /(\bjobs?\s+agendados?\b|rotinas?\s+de\s+expurgo|\bwebhooks?\b|agendar\s+rotinas?\s+de\s+expurgo)/i,
      justification: 'Implementação técnica avulsa de Job agendado, Webhook ou rotina automatizada de expurgo/manutenção de banco (SISP/FPN).'
    },
    {
      key: 'script_saneamento',
      name: 'Carga de Dados / Saneamento / Scripts de Migração',
      category: 'Scripts & Migração',
      unitWeight: 0.80,
      absorbableByIfpug: false,
      qtyRegex: /\b(\d+)\s+(?:novos?\s+|novas?\s+)?(?:scripts?)\b/i,
      regex: /(script\s+de\s+migração|carga\s+de\s+dados|saneamento\s+de\s+dados|script\s+sql\s+avulso|migrar\s+dados|script\s+ddl|script\s+dml)/i,
      justification: 'Execução de script avulso para migração, higienização ou carga inicial de dados (SISP/FPN).'
    }
  ];

  inmDefinitions.forEach((pat, i) => {
    if (pat.regex.test(lowerText)) {
      let quantity = 1;
      if (!pat.absorbableByIfpug) {
        const specificQtyRegex = pat.qtyRegex || /\b(\d+)\s+(?:novos?\s+|novas?\s+)?(?:[íi]ndices?|views?)\b/i;
        const qtyMatch = lowerText.match(specificQtyRegex);
        if (qtyMatch && parseInt(qtyMatch[1], 10) > 0) {
          quantity = parseInt(qtyMatch[1], 10);
        }
      }
      const subtotalPf = Math.round((quantity * pat.unitWeight) * 100) / 100;
      rawInmCandidates.push({
        id: `cand_inm_${Date.now()}_${i}`,
        catalogKey: pat.key,
        itemName: pat.name,
        category: pat.category,
        absorbableByIfpug: pat.absorbableByIfpug,
        quantity,
        unitWeight: pat.unitWeight,
        calculatedPf: subtotalPf,
        subtotalPf,
        justification: pat.justification,
        evidence: `Identificado pelo termo correlato ao Roteiro de Métricas SISP.`
      });
    }
  });

  // 5. Contagem Tradicional IFPUG (CPM 4.3.1)
  const ifpugCandidates = [];

  // Remove orações negativas ("sem alterar...", "não deve criar...") antes de testar persistência e verbos de escrita
  const textWithoutWriteNegations = lowerText.replace(/\b(?:sem|nem|n[ãa]o\s+deve(?:\s+mais)?|n[ãa]o\s+pode)\s+(?:efetuar\s+|realizar\s+)?(?:altera(?:r|ção)|atualiza(?:r|ção)|modifica(?:r|ção)|excluir|remover|inativar|persistir|gravar|incluir|cadastrar|criar)\b[^.,;\n]*/gi, ' ');

  // Verifica se a demanda é exclusivamente técnica/cosmética (sem processo elementar ou função de dados de negócio)
  const isStrictlyDatabaseInfra = /(?:100%\s+de\s+infraestrutura|estritamente\s+t[ée]cnica\s+de\s+infraestrutura|sem\s+processos\s+elementares)/i.test(lowerText);
  const hasBusinessProcessVerbs = !isStrictlyDatabaseInfra && /(?:incluir|cadastrar|cadastra|criar\s+registro|criad[ao]\s+no\s+(?:crm|banco|sistema)|adicionar|registrar|registra|inserir|salvar|upload|importar|importad[ao]|carregar|carregando|carga\s+de\s+convers[ãa]o|migrar\s+os\s+[\p{L}]+|ingest[ãa]o|ingerir|capturar|capturad[ao]s?|integrar|integrad[ao]s?|autenticar|login|enviar|submeter|alterar|atualizar|atualiza|editar|modificar|aprovar|rejeitar|concluir|excluir|remover|deletar|inativar|desativar|cancelar|consultar|consultado|buscar|pesquisar|filtrar|listar|visualizar|exibir|exibe|detalhar|emitir|relatório|extrato|demonstrativo|calcular|cálculo|totalizar|manter|mantido|persistir|persiste|persista|persistid[ao]s?|\bali\b|\bcrud\b)/iu.test(textWithoutWriteNegations);
  const isPurelyTechnical = isStrictlyDatabaseInfra || (rawInmCandidates.length > 0 && !hasBusinessProcessVerbs);

  // AIE: Arquivo de Interface Externa (dados mantidos externamente, acessados via API oficial/externa, webservice ou plataforma de terceiros)
  const { isExternal, externalSourceName } = externalInfo;
  const externalLabel = externalSourceName || entityName;
  const aieAlreadyExistsInProject = isExternal && projectHasDataFunction(projectId, 'AIE', [externalSourceName, externalLabel, entityName]);

  if (isExternal && !isPurelyTechnical && (!aieAlreadyExistsInProject || resolvedOpType === 'CHG')) {
    const aieFields = externalAieFields.length > 0 ? externalAieFields : detectedFields;
    const aieTd = aieFields.length > 0 ? aieFields.length : dataTd;
    const aieTr = inferredDataTr;
    const complexity = calculateApfComplexity('AIE', aieTr, aieTd);
    const rawPf = calculateApfRawPf('AIE', complexity);
    const candFactor = getCandidateFactor('AIE', resolvedOpType);
    const finalPf = calculateApfFinalPf(rawPf, candFactor);
    ifpugCandidates.push({
      id: `cand_aie_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      functionType: 'AIE',
      name: `AIE - Interface Externa: ${externalLabel}`,
      category: 'Dados',
      operationType: resolvedOpType,
      primaryIntent: 'Referenciar dados lógicos mantidos e disponibilizados por sistema externo.',
      td: aieTd,
      arTr: aieTr,
      complexity,
      rawPf,
      countingType,
      factor: candFactor,
      finalPf,
      notes: `Grupo de dados mantido externamente referenciado pela aplicação via ${externalLabel} (${aieTd} TDs [${aieFields.join(', ')}], ${aieTr} TR).`,
      rationale: `Reconhecido como AIE (${resolvedOpType}): leitura/referência de dados mantidos fora da fronteira da aplicação (${externalLabel}, ${aieTd} TDs, ${aieTr} TR).`
    });
  }

  // Regra 3 (Ciclo de Vida do ALI):
  // Só gera um novo ALI se o requisito criar/estruturar ou persistir pela primeira vez a entidade no banco/CRM do projeto.
  // Se for apenas formulário de uso (ex.: login), busca, relatório ou transação sobre entidade já existente no projeto, referencia apenas como AR/FTR.
  const isUsageOrQueryOnly = /(?:^|\s)(?:login|autentica[çc][ãa]o|logar|recuperar\s+senha|esqueci\s+a\s+senha|consulta\s+de|listagem\s+de|busca\s+de|filtro\s+de|relat[óo]rio\s+de|extrato\s+de|dashboard\s+de|painel\s+de)/i.test(title)
    || (!/(?:criar\s+(?:nova\s+)?(?:tabela|entidade|estrutura)|nova\s+entidade|novo\s+arquivo\s+l[óo]gico|devem\s+ser\s+persistid)/i.test(lowerText) &&
      /^(?:que\s+(?:o|a)\s+[\p{L}]+\s+)?(?:autenticar|logar|fazer\s+login|consultar|buscar|pesquisar|filtrar|listar|visualizar|emitir|exportar|calcular|alterar\s+status|aprovar|rejeitar|excluir|cancelar)\b/iu.test(userWant));

  // Reconhecimento Estrutural de Funções de Dados (ALI):
  const isDataStructureSpecification = /(?:persist[êe]ncia\s+mestre[\s-]detalhe(?:\s+do\s+ali)?|grupo\s+l[óo]gico\s+de\s+dados|entidade\s+l[óo]gica\s+interna|integridade\s+referencial\s+do\s+subgrupo|subgrupos\s+l[óo]gicos\s+integrados|^manter\s+estrutura\s+de\b)/i.test(`${title}\n${lowerText}`);

  const hasExplicitInternalPersistence = resolvedOpType === 'ADD'
    && !isAuthFlow
    && !isUsageOrQueryOnly
    && (detectedFields.length >= 2 || /\b(?:crm|banco|entidade|demanda|manifesta[çc][ãa]o|reclama[çc][ãa]o)\b/i.test(lowerText))
    && /(?:dados?\s*(?:\([^)]+\))?\s*(?:devem\s+ser|ser[ãa]o|s[ãa]o)\s+persistid[ao]s?|persistir\s+(?:os\s+)?dados|gravar\s+(?:os\s+)?dados\s+no\s+(?:banco|crm|sistema)|nova\s+(?!sess[ãa]o\b|consulta\b|busca\b)[\p{L}]+\s+deve\s+ser\s+criad[ao]\s+no\s+(?:banco|crm|sistema)|integrad[ao]s?\s+(?:automaticamente\s+)?(?:ao|no)\s+(?:crm|banco)|(?:persistir|gravar|salvar|armazenar)\s+(?:os\s+)?(?:dados|registros?)\s+(?:no\s+banco|na\s+base|no\s+crm))/iu.test(textWithoutWriteNegations);

  const hasExplicitAliCreation = isDataStructureSpecification
    || hasExplicitInternalPersistence
    || /(?:criar\s+(?:nova\s+)?(?:tabela|entidade|estrutura\s+de\s+dados|arquivo\s+l[óo]gico|\bali\b)|nova\s+(?:entidade|tabela\s+de\s+neg[óo]cio)|implantar\s+cadastro\s+de|manter\s+(?:o\s+)?(?:cadastro|estrutura|registo|registro)(?:\s+completo)?\s+de|\bcrud\b|persistir\s+nova\s+entidade|armazenar\s+nova\s+entidade|persista\s+os\s+dados\s+cadastrais|armazena\s+internamente|(?:alterar|atualizar|atualiza|incluir\s+(?:novo\s+)?campo\s+n[ao])\s+(?:tabela|entidade|estrutura\s+de\s+dados|arquivo\s+l[óo]gico|\bali\b))/i.test(lowerText)
    || (/^(?:cadastro\s+de|manuten[çc][ãa]o\s+cadastral\s+de|gest[ãa]o\s+cadastral\s+de|manter\s+estrutura\s+de)\s+/i.test(title) && !isUsageOrQueryOnly && resolvedOpType === 'ADD');

  const aliLabelCandidates = [entityName];
  if (/\bdemanda/i.test(lowerText)) aliLabelCandidates.push('demandas');
  if (/\bmanifesta[çc]/i.test(lowerText)) aliLabelCandidates.push('manifestações');
  const aliAlreadyExistsInProject = projectHasDataFunction(projectId, 'ALI', aliLabelCandidates);

  if (hasExplicitAliCreation && !isAuthFlow && !isUsageOrQueryOnly && !isPurelyTechnical && (!aliAlreadyExistsInProject || resolvedOpType === 'CHG')) {
    const aliEntityLabel = (/\bcrm\b/i.test(lowerText) && !/\bcrm\b/i.test(entityName))
      ? `${entityName} (CRM)`
      : entityName;
    const aliTd = dataTd;
    const aliTr = inferredDataTr;
    const complexity = calculateApfComplexity('ALI', aliTr, aliTd);
    const rawPf = calculateApfRawPf('ALI', complexity);
    const candFactor = getCandidateFactor('ALI', resolvedOpType);
    const finalPf = calculateApfFinalPf(rawPf, candFactor);
    ifpugCandidates.push({
      id: `cand_ali_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      functionType: 'ALI',
      name: `ALI - Estrutura de Dados: ${aliEntityLabel}`,
      category: 'Dados',
      operationType: resolvedOpType,
      primaryIntent: 'Armazenar e manter dados lógicos relacionais de negócio dentro da fronteira da aplicação.',
      td: aliTd,
      arTr: aliTr,
      complexity,
      rawPf,
      countingType,
      factor: candFactor,
      finalPf,
      notes: `Arquivo Lógico Interno criado/mantido dentro da fronteira da aplicação (${aliTd} TDs [${detectedFields.join(', ')}], ${aliTr} TR(s) — sem +2 TDs de controle).`,
      rationale: `Reconhecido como ALI (${resolvedOpType}): requisito responsável pela estrutura/persistência da entidade no banco/CRM com ${aliTd} TD(s) de negócio e ${aliTr} TR(s) (${aliTr > 1 ? 'Mestre + Detalhe subordinado' : 'Entidade simples'}).`
    });
  }

  // Se o requisito for estritamente uma especificação estrutural de Função de Dados (ALI), não gera transações fantasmas (EE/CE/SE)
  if (!isPurelyTechnical && !isDataStructureSpecification) {
    const isFullCrud = /\bcrud\b|manter\s+cadastro\s+completo/i.test(lowerText);
    let txAr = isExternal ? Math.max(inferredTransAr, 2) : inferredTransAr;
    const readsAttachmentsAli = isExternal
      && /\benvi(?:ar|ando)\b[^.\n]*\banexos?\b/i.test(lowerText)
      && projectHasDataFunction(projectId, 'ALI', ['Anexos de Demandas', 'Anexos'])
      && projectHasDataFunction(projectId, 'ALI', ['Demandas', 'Demandas (CRM)']);
    if (readsAttachmentsAli) {
      txAr = Math.max(txAr, 3);
    }
    const eeArSummary = detectedArEntities.length > 1
      ? `${txAr} ARs (${detectedArEntities.join(', ')})`
      : (readsAttachmentsAli
        ? `${txAr} ARs (Demandas [ALI] + Anexos de Demandas [ALI] + ${externalLabel} [AIE])`
        : (isExternal && txAr >= 2
          ? `${txAr} ARs (${entityName} [ALI] + ${externalLabel} [AIE])`
          : `${txAr} AR referenciado`));

    if (isAuthFlow) {
      // Regra de Supressão de CE Fantasma e Escopo Estrito de EE em Autenticação / Login / 2FA:
      // Gera estritamente 1 Entrada Externa (EE), sem criar nem pontuar ALI em CHG e sem gerar CE fantasma.
      const is2faAuth = /\b2fa\b|segundo\s+fator|dois\s+passos/i.test(fullText);
      const eeAuthTd = transactionTd;
      // Em fluxos de autenticação com 2FA + bloqueio/auditoria de segurança, referencia 2 ARs (Perfil de Utilizador + Controle 2FA / Auditoria)
      const eeAuthAr = is2faAuth ? Math.max(txAr, 2) : txAr;
      const complexity = calculateApfComplexity('EE', eeAuthAr, eeAuthTd);
      const rawPf = calculateApfRawPf('EE', complexity);
      const candFactor = getCandidateFactor('EE', resolvedOpType);
      const finalPf = calculateApfFinalPf(rawPf, candFactor);
      const authFnName = (resolvedOpType === 'CHG' && is2faAuth)
        ? 'EE - Alterar/Processar Autenticação (2FA)'
        : `EE - ${resolvedOpType === 'CHG' ? 'Alterar/Processar' : 'Autenticar/Processar'} ${title || entityName}`;
      ifpugCandidates.push({
        id: `cand_ee_auth_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        functionType: 'EE',
        name: authFnName,
        category: 'Transação',
        operationType: resolvedOpType,
        primaryIntent: 'Processar credenciais ou submissão de autenticação através da fronteira e validar/atualizar sessão.',
        td: eeAuthTd,
        arTr: eeAuthAr,
        complexity,
        rawPf,
        countingType: effectiveCountingType,
        factor: candFactor,
        finalPf,
        notes: `Processo elementar de autenticação (${eeAuthTd} TDs = ${businessTdCount} negócio [${detectedFields.join(', ')}] + 1 envio/acionamento + 1 mensagem do sistema; ${eeAuthAr} AR(s) referenciado(s)).`,
        rationale: `Entrada Externa (EE • ${resolvedOpType}): ${eeAuthTd} TDs (${businessTdCount} negócio + 2 controle) e ${eeAuthAr} AR(s). Escopo estrito de transação de autenticação (${Math.round(candFactor * 100)}%).`
      });
    } else {
      // Detecta se o processo principal é uma Saída Externa analítica/demonstrativo/fechamento (onde gravações de status/log de fechamento fazem parte da própria SE)
      const isPrimaryAnalyticalOutput = /(?:balancete\s+anal[íi]tico|demonstrativo\s+(?:anal[íi]tico|consolidado)|relat[óo]rio\s+anal[íi]tico|painel\s+anal[íi]tico|dashboard\s+anal[íi]tico|fechamento\s+e\s+concilia[çc][ãa]o\s+financeira)/i.test(lowerText);
      // Detecta se o processo principal é estritamente uma exclusão ou inativação lógica (evitando duplicar EE de atualização + EE de inativação)
      const isPrimaryInactivationOrDeletion = /(?:inativa[çc][ãa]o\s+l[óo]gica|submete\s+a\s+inativa[çc][ãa]o|^excluir\s+|^remover\s+|^inativar\s+)/i.test(`${cleanTitle}\n${lowerText}`);

      // EE (Entrada Externa) - Inclusão / Registro / Submissão / Ingestão / Integração (CFP)
      const textWithoutFieldAddition = textWithoutWriteNegations
        .replace(/(?:incluir|adicionar|inserir)\s+(?:novo\s+|novos\s+)?(?:campo|campos|atributo|atributos|coluna|colunas)/gi, ' ')
        .replace(/registrar\s+a\s+compet[êe]ncia/gi, ' ');
      const hasInclusion = !isPrimaryAnalyticalOutput && !isPrimaryInactivationOrDeletion && (isFullCrud || /\b(?:incluir|cadastrar|cadastra|criar\s+novo|criad[ao]\s+no\s+(?:crm|banco|sistema)|adicionar|registrar|registra|inserir|salvar|upload|importar|importad[ao]|carregar|carregando|carga\s+de\s+convers[ãa]o|ingest[ãa]o|ingerir|capturar|capturad[ao]s?|integrar|integrad[ao]s?|persistid[ao]s?|autenticar|login|logar|enviar|submeter)\b/i.test(textWithoutFieldAddition));
      if (hasInclusion) {
        const eeAddTd = transactionTd;
        const eeAddAr = txAr;
        const complexity = calculateApfComplexity('EE', eeAddAr, eeAddTd);
        const rawPf = calculateApfRawPf('EE', complexity);
        const candFactor = getCandidateFactor('EE', resolvedOpType);
        const finalPf = calculateApfFinalPf(rawPf, candFactor);
        ifpugCandidates.push({
          id: `cand_ee_add_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          functionType: 'EE',
          name: `EE - Incluir/Processar ${entityName}`,
          category: 'Transação',
          operationType: resolvedOpType,
          primaryIntent: 'Processar dados de entrada através da fronteira e manter ALI ou validar comportamento do sistema.',
          td: eeAddTd,
          arTr: eeAddAr,
          complexity,
          rawPf,
          countingType,
          factor: candFactor,
          finalPf,
          notes: `Processo elementar de entrada (${eeAddTd} TDs = ${businessTdCount} atributo(s) + 1 acionamento + 1 mensagem; ${eeArSummary}).`,
          rationale: `Entrada Externa (EE • ${resolvedOpType}): ${eeAddTd} TDs (${businessTdCount} negócio + 2 controle) e ${eeArSummary}.`
        });
      }

      // EE (Entrada Externa) - Alteração / Atualização / Aprovação
      // Remove efeitos colaterais de log de auditoria e descritores de operação de melhoria (CHG) de processo existente para evitar gerar uma 2ª EE duplicada
      const textWithoutAuditAndChgMeta = textWithoutWriteNegations
        .replace(/(?:registra(?:r)?|atualiza(?:r)?|grava(?:r)?)\s+(?:a\s+|o\s+)?(?:hist[óo]rico|log|trilha)\s+de\s+auditoria/gi, ' ')
        .replace(/(?:alterar|modificar|atualizar|evoluir|refatorar)\s+(?:o\s+|a\s+)?(?:fluxo|processo|funcionalidade|regra|rotina|tela|m[óo]dulo)(?:\s+existente)?|altera[çc][ãa]o\s+d[aeo]\s+(?:processo|fluxo|l[óo]gica|funcionalidade)/gi, ' ');
      const hasUpdate = !isPrimaryAnalyticalOutput && !isPrimaryInactivationOrDeletion && (isFullCrud || /\b(?:alterar|atualizar|atualiza|editar|modificar|progresso|revisar|mudar\s+status|concluir|aprovar|rejeitar|homologar)\b/i.test(textWithoutAuditAndChgMeta));
      if (hasUpdate) {
        const eeUpdTd = transactionTd;
        const eeUpdAr = txAr;
        const complexity = calculateApfComplexity('EE', eeUpdAr, eeUpdTd);
        const rawPf = calculateApfRawPf('EE', complexity);
        const candFactor = getCandidateFactor('EE', resolvedOpType);
        const finalPf = calculateApfFinalPf(rawPf, candFactor);
        ifpugCandidates.push({
          id: `cand_ee_upd_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          functionType: 'EE',
          name: `EE - Atualizar/Editar ${entityName}`,
          category: 'Transação',
          operationType: resolvedOpType,
          primaryIntent: 'Processar dados recebidos de fora da fronteira para modificar registros em ALI referenciado.',
          td: eeUpdTd,
          arTr: eeUpdAr,
          complexity,
          rawPf,
          countingType,
          factor: candFactor,
          finalPf,
          notes: `Processo de manutenção/atualização (${eeUpdTd} TDs = ${businessTdCount} atributo(s) + 1 acionamento + 1 mensagem; ${eeUpdAr} AR).`,
          rationale: `Entrada Externa (EE • ${resolvedOpType}): Modifica estado no ALI referenciado (${eeUpdTd} TDs, ${eeUpdAr} AR).`
        });
      }

      // EE (Entrada Externa) - Exclusão / Inativação
      const hasDelete = !isPrimaryAnalyticalOutput && (isFullCrud || isPrimaryInactivationOrDeletion || /\b(?:excluir|remover|deletar|inativar|desativar|cancelar\s+registro|apagar)\b/i.test(lowerText));
      if (hasDelete) {
        // Se for CRUD completo junto com Inclusão/Alteração, exclusão simples tem 3 TDs e 1 AR; se for requisito dedicado de exclusão/inativação, usa os TDs e ARs reais do requisito
        const eeDelTd = (hasInclusion || hasUpdate) ? 3 : transactionTd;
        const eeDelAr = (hasInclusion || hasUpdate) ? 1 : txAr;
        const complexity = calculateApfComplexity('EE', eeDelAr, eeDelTd);
        const rawPf = calculateApfRawPf('EE', complexity);
        const candFactor = getCandidateFactor('EE', resolvedOpType);
        const finalPf = calculateApfFinalPf(rawPf, candFactor);
        ifpugCandidates.push({
          id: `cand_ee_del_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          functionType: 'EE',
          name: `EE - Excluir/Inativar ${entityName}`,
          category: 'Transação',
          operationType: resolvedOpType,
          primaryIntent: 'Processar comando de exclusão ou inativação lógica em ALI referenciado.',
          td: eeDelTd,
          arTr: eeDelAr,
          complexity,
          rawPf,
          countingType,
          factor: candFactor,
          finalPf,
          notes: `Processo elementar de exclusão/inativação (${eeDelTd} TDs = ${businessTdCount} negócio + 2 controle; ${eeDelAr} AR(s)).`,
          rationale: `Entrada Externa (EE • ${resolvedOpType}): Exclusão/inativação no ALI referenciado (${eeDelTd} TDs, ${eeDelAr} AR).`
        });
      }

      // Regra 3 (Rigor na Inferência Transacional: CE vs. SE e Supressão de CE Fantasma em Fluxos de Ação Única):
      const hasAnyEe = ifpugCandidates.some(c => c.functionType === 'EE');
      // Trava de Negação Semântica para SE: se o requisito contiver expressões como "sem cálculo", "sem fórmulas matemáticas",
      // "sem alteração de estado" ou "apenas listagem/apresentação informativa", desativa qualquer gatilho de SE e classifica como CE.
      const hasSemanticSeNegation = /(?:sem\s+(?:realizar\s+|efetuar\s+)?(?:altera[çc][ãa]o\s+de\s+estado|c[áa]lculos?(?:\s+matem[áa]ticos?|\s+anal[íi]ticos?)?|f[óo]rmulas?(?:\s+matem[áa]ticas?)?|totais|totaliza(?:r|ção|dores)?|soma\s+agregada|dados?\s+derivados?)|nem\s+(?:aplica[çc][ãa]o\s+de\s+)?f[óo]rmulas?(?:\s+matem[áa]ticas?)?|apenas\s+(?:listagem|apresenta[çc][ãa]o)(?:\s+informativa)?|listagem\s+informativa\s+no\s+(?:ecr[ãa]|tela)\s+sem)/i.test(lowerText);
      const textWithoutNegativeCalcClauses = lowerText
        .replace(/\b(?:sem|não\s+h[áa]|não\s+possui|não\s+realiza|isento\s+de)\s+[^.;\n]*?\b(?:fórmula|fórmulas|cálculo|cálculos|calculado|calculados|totais|totaliza(?:r|ção|dores)?|dado\s+derivado|dados\s+derivados|média|somatório|estatístic[ao]s?|indicador(?:es)?)\b[^.;\n]*/gi, ' ')
        .replace(/\bnem\s+(?:aplicação\s+de\s+|realização\s+de\s+|uso\s+de\s+)?(?:fórmula|fórmulas|cálculo|cálculos|totais|totaliza(?:r|ção|dores)?|dado\s+derivado|dados\s+derivados)\b[^.,;\n]*/gi, ' ');
      const hasExplicitCalculation = !hasSemanticSeNegation && !hasAnyEe && /(?:cálculo|calcular|calculado|calculando|\bcalcula\b|fórmula|média|somatório|totaliza(?:r|ção|dores)?|dado\s+derivado|consolida(?:r|ção)\s+analític|balancete\s+analític|taxa\s+calculada|percentual\s+calculado|projeção\s+matemática|estatístic|agregação\s+matemática|saldo\s+calculado|indicador\s+calculado|\bkpi\b|atualiza(?:r)?\s+o\s+hist[óo]rico\s+de\s+auditoria\s+com\s+a\s+data(?:\s*\/\s*hora)?\s+da\s+emiss[ãa]o)/i.test(textWithoutNegativeCalcClauses);
      const textWithoutRedirectsAndFeedback = lowerText
        .replace(/exib(?:ir|e)\s+(?:a\s+)?(?:mensagem|alerta|notificação|erro|sucesso|toast|feedback)[^.,;\n]*/gi, ' ')
        .replace(/redireciona(?:r)?\s+(?:o\s+[\p{L}]+\s+)?para\s+[^.,;\n]+/giu, ' ')
        .replace(/(?:na|da|em\s+uma)\s+tabela\s+de\b/gi, ' ');

      const hasExplicitMultiRecordReadView = isFullCrud || (!hasAnyEe && /\b(?:listar|listagem|visualizar\s+hist[óo]rico|consultar\s+hist[óo]rico|tabela\s+de|em\s+tabela|exibir\s+(?:a\s+)?tabela|grade\s+paginada|grid|grelha|consultar\s+regist(?:r)?os|buscar\s+lista|pesquisar\s+regist(?:r)?os|filtrar\s+(?:lista|regist(?:r)?os|tabela|grid|grelha|pedidos|itens|dados|capacidade)|exibir\s+(?:lista|grid|grelha|regist(?:r)?os))\b/i.test(textWithoutRedirectsAndFeedback));
      const hasStandaloneQueryIntent = !hasAnyEe && /\b(?:consultar|consulta|buscar|busca|pesquisar|pesquisa|filtrar|filtro|listar|listagem|visualizar|detalhar|grid|grelha|acompanhar|relatório|extrato|exportar|demonstrativo|painel|dashboard|gráfico)\b/i.test(textWithoutRedirectsAndFeedback);

      const arDetailText = detectedArEntities.length > 1
        ? `${txAr} ARs (${detectedArEntities.join(', ')})`
        : `${txAr} AR`;

      if (hasExplicitCalculation) {
        // Gera exclusivamente SE (Saída Externa) para a apresentação analítica/derivada
        const seTd = transactionTd;
        const seAr = txAr;
        const complexity = calculateApfComplexity('SE', seAr, seTd);
        const rawPf = calculateApfRawPf('SE', complexity);
        const candFactor = getCandidateFactor('SE', resolvedOpType);
        const finalPf = calculateApfFinalPf(rawPf, candFactor);
        ifpugCandidates.push({
          id: `cand_se_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          functionType: 'SE',
          name: `SE - Demonstrativo/Relatório Analítico de ${entityName}`,
          category: 'Transação',
          operationType: resolvedOpType,
          primaryIntent: 'Apresentar informações ao usuário com criação de dados derivados, totalizadores ou fórmulas matemáticas.',
          td: seTd,
          arTr: seAr,
          complexity,
          rawPf,
          countingType,
          factor: candFactor,
          finalPf,
          notes: `Saída Externa com processamento matemático/derivação explícita (${seTd} TDs = ${businessTdCount} negócio [${detectedFields.join(', ')}] + 2 controle; ${arDetailText}).`,
          rationale: `Saída Externa (SE • ${resolvedOpType}): ${seTd} TDs (${businessTdCount} negócio + 2 controle) e ${arDetailText}. Evidência explícita de cálculo matemático/dado derivado sem CE duplicada.`
        });
      } else if (hasExplicitMultiRecordReadView || hasStandaloneQueryIntent) {
        // Gera exclusivamente CE (Consulta Externa) para recuperação direta de dados sem cálculo derivado
        const ceTd = transactionTd;
        const ceAr = txAr;
        const complexity = calculateApfComplexity('CE', ceAr, ceTd);
        const rawPf = calculateApfRawPf('CE', complexity);
        const candFactor = getCandidateFactor('CE', resolvedOpType);
        const finalPf = calculateApfFinalPf(rawPf, candFactor);
        ifpugCandidates.push({
          id: `cand_ce_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          functionType: 'CE',
          name: `CE - Consultar/Listar ${entityName}`,
          category: 'Transação',
          operationType: resolvedOpType,
          primaryIntent: 'Recuperar e apresentar dados diretamente de AR(s) sem fórmulas matemáticas ou criação de dados derivados.',
          td: ceTd,
          arTr: ceAr,
          complexity,
          rawPf,
          countingType,
          factor: candFactor,
          finalPf,
          notes: `Consulta Externa direta (${ceTd} TDs = ${businessTdCount} atributo(s) [${detectedFields.join(', ')}] + 1 acionamento/filtro + 1 mensagem; ${arDetailText}).`,
          rationale: `Consulta Externa (CE • ${resolvedOpType}): ${ceTd} TDs (${businessTdCount} negócio + 2 controle) e ${arDetailText}. Recuperação direta de dados sem cálculo derivado.`
        });
      }
    }
  }

  // Regra 6 (Eliminação Rigorosa de Dupla Contagem — IFPUG vs. SISP INM/FPN):
  // Se qualquer função IFPUG (EE, CE, SE, ALI, AIE) for gerada para o requisito/módulo, zera e desativa a pontuação
  // de INMs, reservando FPN apenas quando o requisito for 100% técnico e isolado (sem nenhuma função IFPUG).
  const hasAnyIfpugFunction = ifpugCandidates.length > 0;
  const hasElementaryTransaction = ifpugCandidates.some(c => c.functionType === 'EE' || c.functionType === 'CE' || c.functionType === 'SE');
  const inmCandidates = [];
  const absorbedInmCandidates = [];

  rawInmCandidates.forEach(inm => {
    if (hasAnyIfpugFunction) {
      absorbedInmCandidates.push({
        ...inm,
        absorbed: true,
        selected: false,
        status: 'Absorvido pelo IFPUG',
        originalPf: inm.subtotalPf,
        calculatedPf: 0,
        subtotalPf: 0,
        justification: `[ABSORVIDO PELA FUNÇÃO IFPUG — SISP] ${inm.justification}`
      });
    } else {
      inmCandidates.push({
        ...inm,
        absorbed: false,
        selected: true,
        status: 'Aprovado'
      });
    }
  });

  // 6. Análise de Fronteira e Natureza da Demanda
  let nature = 'Pura IFPUG';
  let natureExplanation = '';
  if (ifpugCandidates.length > 0 && inmCandidates.length > 0) {
    nature = 'Híbrido';
    natureExplanation = 'A entrega contém processos elementares IFPUG e itens técnicos avulsos de banco/migração não absorvidos (SISP).';
  } else if (ifpugCandidates.length === 0 && inmCandidates.length > 0) {
    nature = 'Item Não-Mensurável';
    natureExplanation = 'A demanda trata exclusivamente de intervenção técnica avulsa tabelada pelo SISP, sem processo elementar IFPUG autônomo.';
  } else {
    nature = 'Pura IFPUG';
    natureExplanation = 'A demanda é mensurada estritamente por funções de negócio IFPUG CPM 4.3.1 (itens de interface/layout/máscaras são absorvidos pelo processo elementar).';
  }

  // 7. Totalizações Consolidadas
  const totalRawIfpugPf = ifpugCandidates.reduce((s, c) => s + (c.rawPf || 0), 0);
  const totalFinalIfpugPf = Math.round(ifpugCandidates.reduce((s, c) => s + (c.finalPf || 0), 0) * 100) / 100;
  const totalInmPf = Math.round(inmCandidates.reduce((s, c) => s + (c.subtotalPf || 0), 0) * 100) / 100;
  const totalGlobalPf = Math.round((totalFinalIfpugPf + totalInmPf) * 100) / 100;

  // 8. Notas Técnicas e Observações do Auditor CFPS
  const auditorNotes = [];
  if (ifpugCandidates.some(c => c.functionType === 'ALI' || c.functionType === 'AIE') && !hasElementaryTransaction) {
    auditorNotes.push(`Heurística de TDs e TRs para Função de Dados (IFPUG CPM 4.3.1): contabilizados estritamente ${dataTd} atributo(s) de negócio persistidos (sem somar os +2 TDs de controle de interface) e ${inferredDataTr} TR(s) (subgrupos lógicos reconhecidos pelo usuário).`);
  } else {
    auditorNotes.push(`Heurística de TDs (IFPUG CPM 4.3.1): contabilizados ${businessTdCount} atributo(s) de negócio identificado(s) + 2 TDs de controle nas transações (+1 acionamento/envio e +1 mensagem do sistema) = ${transactionTd} TDs por transação.`);
  }

  if (!ifpugCandidates.some(c => c.functionType === 'ALI') && hasElementaryTransaction) {
    const arNoteCount = isExternal ? Math.max(inferredTransAr, 2) : inferredTransAr;
    auditorNotes.push(`Ciclo de Vida do ALI: Como o requisito trata de transação/consulta sobre entidade já existente${aliAlreadyExistsInProject ? ' no projeto' : ''}, a entidade "${entityName}" foi contabilizada apenas como Arquivo Referenciado (${arNoteCount} AR/FTR), sem gerar novo ALI duplicado.`);
  }
  if (ifpugCandidates.some(c => c.functionType === 'ALI')) {
    auditorNotes.push(`Função de Dados Interna (ALI): Entidade lógica "${entityName}" mantida dentro da fronteira da aplicação contabilizada com ${dataTd} TD(s) de negócio (sem +2 TDs de controle).`);
  }
  if (ifpugCandidates.some(c => c.functionType === 'AIE')) {
    auditorNotes.push(`Arquivo de Interface Externa (AIE): Dados lógicos mantidos externamente por "${externalLabel}" e referenciados através da fronteira da aplicação.`);
  }
  if (absorbedInmCandidates.length > 0) {
    auditorNotes.push(`Trava de Exclusão Mútua (SISP): ${absorbedInmCandidates.length} item(ns) de interface/menu/máscara/apoio (${absorbedInmCandidates.map(a => a.itemName).join(', ')}) foram marcados como ABSORVIDOS (0,00 PF) pois já integram o Processo Elementar IFPUG mensurado.`);
  }
  if (countingType.toLowerCase().startsWith('melhoria') || resolvedOpType !== 'ADD') {
    auditorNotes.push(`Projeto de Melhoria (IFPUG CPM 4.3.1 / SISP): Operação classificada como ${resolvedOpType} (${SISP_ENHANCEMENT_FACTORS[resolvedOpType]?.label || resolvedOpType}), medindo o tamanho funcional final após a mudança com deflator contratual SISP.`);
  }
  if (ifpugCandidates.some(c => c.functionType === 'SE')) {
    auditorNotes.push('Rigor Transacional (SE vs. CE): Gerada exclusivamente Saída Externa (SE) devido à evidência explícita de cálculo matemático/dado derivado, sem duplicar Consulta Externa (CE).');
  }

  // 9. Construção do Laudo Oficial CFPS em Markdown
  let reportMarkdown = `## 1. Decomposição do Requisito\n`;
  reportMarkdown += `- **Resumo da Intenção do Usuário:** ${userRole ? `Como ${userRole}, necessita ${userWant} a fim de ${userBenefit}.` : title}\n`;
  reportMarkdown += `- **Fronteira da Aplicação:** Fronteira delimitada no sistema local (${effectiveCountingType} • Operação: ${resolvedOpType}).\n`;
  reportMarkdown += `- **Natureza da Demanda:** **${nature}** — ${natureExplanation}\n\n`;

  reportMarkdown += `## 2. Memória de Cálculo Detalhada\n\n`;

  if (ifpugCandidates.length > 0) {
    reportMarkdown += `### A. Funções de Negócio Tradicionais (IFPUG CPM 4.3.1)\n`;
    reportMarkdown += `| Tipo | Operação | Nome do Processo / Entidade | TDs (DET) | TRs/ARs | Complexidade | PF Bruto | Fator SISP | PF Líquido |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    ifpugCandidates.forEach(c => {
      const arTrLabel = (c.functionType === 'ALI' || c.functionType === 'AIE') ? `${c.arTr} TR` : `${c.arTr} AR`;
      const factorPct = `${Math.round((c.factor || 1) * 100)}%`;
      reportMarkdown += `| **${c.functionType}** | \`${c.operationType || 'ADD'}\` | ${c.name} | ${c.td} | ${arTrLabel} | ${c.complexity} | ${c.rawPf} PF | ${factorPct} | **${c.finalPf.toFixed(2)} PF** |\n`;
    });
    reportMarkdown += `\n`;
  }

  if (inmCandidates.length > 0 || absorbedInmCandidates.length > 0) {
    reportMarkdown += `### B. Itens Não-Mensuráveis / Complementares (FPN • Padrão SISP)\n`;
    reportMarkdown += `| Item Técnico Identificado | Status SISP | Qtd ($Q$) | Peso ($P$) | Justificativa / Regra de Exclusão Mútua | Subtotal (PF) |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    inmCandidates.forEach(inm => {
      reportMarkdown += `| ${inm.itemName} | **Pontuado** | ${inm.quantity} | ${inm.unitWeight.toFixed(2)} PF | ${inm.justification} | **${inm.subtotalPf.toFixed(2)} PF** |\n`;
    });
    absorbedInmCandidates.forEach(abs => {
      reportMarkdown += `| ~${abs.itemName}~ | **Absorvido** | ${abs.quantity} | ${abs.unitWeight.toFixed(2)} PF | ${abs.justification} | **0.00 PF** |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 3. Totalização Consolidada\n`;
  reportMarkdown += `- **PF de Negócio (IFPUG Líquido):** ${totalFinalIfpugPf.toFixed(2)} PF (PF Bruto: ${totalRawIfpugPf} PF)\n`;
  reportMarkdown += `- **PF Não-Mensuráveis (FPN Líquido Não Absorvido):** ${totalInmPf.toFixed(2)} PF\n`;
  reportMarkdown += `- **Total Global da Entrega:** **${totalGlobalPf.toFixed(2)} PF**\n\n`;

  reportMarkdown += `## 4. Notas Técnicas e Observações do Auditor\n`;
  auditorNotes.forEach(note => {
    reportMarkdown += `- ${note}\n`;
  });

  return {
    sourceType: reqId ? 'requirement' : (feature ? 'feature' : 'specification'),
    sourceId: reqId,
    sourceCode: reqCode,
    sourceTitle: title || feature || 'Especificação Funcional',
    feature,
    projectId,
    countingType: effectiveCountingType,
    operationType: resolvedOpType,
    nature,
    natureExplanation,
    userRole,
    userWant,
    userBenefit,
    detectedFields,
    candidates: ifpugCandidates,
    inmCandidates,
    absorbedInmCandidates,
    totalRawIfpugPf,
    totalFinalIfpugPf,
    totalInmPf,
    totalGlobalPf,
    auditorNotes,
    reportMarkdown,
    summary: {
      nature,
      operationType: resolvedOpType,
      totalFunctions: ifpugCandidates.length,
      totalInmCount: inmCandidates.length,
      totalAbsorbedInmCount: absorbedInmCandidates.length,
      totalRawPf: totalRawIfpugPf,
      totalFinalIfpugPf,
      totalInmPf,
      totalGlobalPf,
      countAli: ifpugCandidates.filter(c => c.functionType === 'ALI').length,
      countAie: ifpugCandidates.filter(c => c.functionType === 'AIE').length,
      countEe: ifpugCandidates.filter(c => c.functionType === 'EE').length,
      countSe: ifpugCandidates.filter(c => c.functionType === 'SE').length,
      countCe: ifpugCandidates.filter(c => c.functionType === 'CE').length
    }
  };
}

/**
 * Ponto de entrada para análise heurística de Requisitos existentes
 */
function inferApfFromRequirement(req, options = {}) {
  return analyzeCfpsSpecification(req, options);
}

/**
 * Analisa semanticamente uma Feature e extrai funções de APF de todos os seus requisitos
 */
function inferApfFromFeature(projectId, featureName, options = {}) {
  let query = 'SELECT * FROM requirements WHERE feature = ?';
  const params = [featureName];
  if (projectId && projectId !== 'all') {
    query += ' AND project_id = ?';
    params.push(projectId);
  }
  const requirements = db.prepare(query).all(...params);

  let allCandidates = [];
  let rawFeatureInmCandidates = [];
  const seenAliNames = new Set();
  const seenInmKeys = new Set();

  if (requirements.length > 0) {
    requirements.forEach(req => {
      const res = analyzeCfpsSpecification(req, options);
      res.candidates.forEach(cand => {
        if (cand.functionType === 'ALI' || cand.functionType === 'AIE') {
          if (seenAliNames.has(cand.name)) return;
          seenAliNames.add(cand.name);
        }
        cand.reqId = req.id;
        cand.reqCode = req.code;
        cand.reqTitle = req.title;
        cand.feature = featureName;
        cand.projectId = req.project_id;
        allCandidates.push(cand);
      });

      [...(res.inmCandidates || []), ...(res.absorbedInmCandidates || [])].forEach(inm => {
        if (seenInmKeys.has(inm.catalogKey)) return;
        seenInmKeys.add(inm.catalogKey);
        inm.reqId = req.id;
        inm.feature = featureName;
        inm.projectId = req.project_id;
        rawFeatureInmCandidates.push(inm);
      });
    });
  } else {
    const fakeReq = {
      id: '',
      code: '',
      title: featureName,
      feature: featureName,
      project_id: projectId,
      userStory: `Feature ${featureName}`,
      bdd: ''
    };
    const res = analyzeCfpsSpecification(fakeReq, options);
    allCandidates = res.candidates.map(c => ({
      ...c,
      feature: featureName,
      projectId: projectId || ''
    }));
    rawFeatureInmCandidates = [...(res.inmCandidates || []), ...(res.absorbedInmCandidates || [])].map(c => ({
      ...c,
      feature: featureName,
      projectId: projectId || ''
    }));
  }

  // Aplica a Trava de Exclusão Mútua (SISP) em nível da Feature consolidada:
  // Se a feature possui qualquer função IFPUG (EE, CE, SE, ALI, AIE), zera e absorve INMs associados.
  const hasFeatureIfpugFunctions = allCandidates.length > 0;
  const allInmCandidates = [];
  const absorbedInmCandidates = [];

  rawFeatureInmCandidates.forEach(inm => {
    if (hasFeatureIfpugFunctions) {
      absorbedInmCandidates.push({
        ...inm,
        absorbed: true,
        selected: false,
        status: 'Absorvido pelo IFPUG',
        calculatedPf: 0,
        subtotalPf: 0,
        justification: inm.justification.startsWith('[ABSORVIDO')
          ? inm.justification
          : `[ABSORVIDO PELA FUNÇÃO IFPUG — SISP] ${inm.justification}`
      });
    } else {
      allInmCandidates.push({
        ...inm,
        absorbed: false,
        selected: true,
        status: 'Aprovado'
      });
    }
  });

  const totalRawIfpugPf = allCandidates.reduce((s, c) => s + (c.rawPf || 0), 0);
  const totalFinalIfpugPf = Math.round(allCandidates.reduce((s, c) => s + (c.finalPf || 0), 0) * 100) / 100;
  const totalInmPf = Math.round(allInmCandidates.reduce((s, c) => s + (c.subtotalPf || 0), 0) * 100) / 100;
  const totalGlobalPf = Math.round((totalFinalIfpugPf + totalInmPf) * 100) / 100;

  let nature = 'Pura IFPUG';
  if (allCandidates.length > 0 && allInmCandidates.length > 0) nature = 'Híbrido';
  else if (allCandidates.length === 0 && allInmCandidates.length > 0) nature = 'Item Não-Mensurável';

  let reportMarkdown = `## 1. Decomposição do Requisito\n`;
  reportMarkdown += `- **Resumo da Intenção do Usuário:** Consolidação funcional para todos os fluxos e histórias da feature "${featureName}".\n`;
  reportMarkdown += `- **Fronteira da Aplicação:** Fronteira do módulo "${featureName}".\n`;
  reportMarkdown += `- **Natureza da Demanda:** **${nature}**\n\n`;

  reportMarkdown += `## 2. Memória de Cálculo Detalhada\n\n`;
  if (allCandidates.length > 0) {
    reportMarkdown += `### A. Funções de Negócio Tradicionais (IFPUG CPM 4.3.1)\n`;
    reportMarkdown += `| Tipo | Operação | Nome do Processo / Entidade | TDs (DET) | TRs/ARs | Complexidade | PF Bruto | Fator SISP | PF Líquido |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    allCandidates.forEach(c => {
      const arTrLabel = (c.functionType === 'ALI' || c.functionType === 'AIE') ? `${c.arTr} TR` : `${c.arTr} AR`;
      const factorPct = `${Math.round((c.factor || 1) * 100)}%`;
      reportMarkdown += `| **${c.functionType}** | \`${c.operationType || 'ADD'}\` | ${c.name} | ${c.td} | ${arTrLabel} | ${c.complexity} | ${c.rawPf} PF | ${factorPct} | **${c.finalPf.toFixed(2)} PF** |\n`;
    });
    reportMarkdown += `\n`;
  }
  if (allInmCandidates.length > 0 || absorbedInmCandidates.length > 0) {
    reportMarkdown += `### B. Itens Não-Mensuráveis / Complementares (FPN • Padrão SISP)\n`;
    reportMarkdown += `| Item Técnico Identificado | Status SISP | Quantidade ($Q$) | Peso Unitário ($P$) | Justificativa / Referência | Subtotal (PF) |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    allInmCandidates.forEach(inm => {
      reportMarkdown += `| ${inm.itemName} | **Pontuado** | ${inm.quantity} | ${inm.unitWeight.toFixed(2)} PF | ${inm.justification} | **${inm.subtotalPf.toFixed(2)} PF** |\n`;
    });
    absorbedInmCandidates.forEach(abs => {
      reportMarkdown += `| ~${abs.itemName}~ | **Absorvido** | ${abs.quantity} | ${abs.unitWeight.toFixed(2)} PF | ${abs.justification} | **0.00 PF** |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 3. Totalização Consolidada\n`;
  reportMarkdown += `- **PF de Negócio (IFPUG Tradicional):** ${totalFinalIfpugPf.toFixed(2)} PF\n`;
  reportMarkdown += `- **PF Não-Mensuráveis (FPN / Itens Técnicos):** ${totalInmPf.toFixed(2)} PF\n`;
  reportMarkdown += `- **Total Global da Entrega:** **${totalGlobalPf.toFixed(2)} PF**\n\n`;

  reportMarkdown += `## 4. Notas Técnicas e Observações do Auditor\n`;
  reportMarkdown += `- Análise consolidada cobrindo ${requirements.length} requisito(s) associados à feature.\n`;
  if (absorbedInmCandidates.length > 0) {
    reportMarkdown += `- Trava de Exclusão Mútua (SISP): ${absorbedInmCandidates.length} item(ns) de interface/menu/máscara foram absorvidos pelos Processos Elementares IFPUG.\n`;
  }

  return {
    sourceType: 'feature',
    feature: featureName,
    projectId: projectId || '',
    requirementsCount: requirements.length,
    nature,
    candidates: allCandidates,
    inmCandidates: allInmCandidates,
    absorbedInmCandidates,
    totalRawIfpugPf,
    totalFinalIfpugPf,
    totalInmPf,
    totalGlobalPf,
    reportMarkdown,
    summary: {
      nature,
      totalFunctions: allCandidates.length,
      totalInmCount: allInmCandidates.length,
      totalAbsorbedInmCount: absorbedInmCandidates.length,
      totalRawPf: totalRawIfpugPf,
      totalFinalIfpugPf,
      totalInmPf,
      totalGlobalPf,
      countAli: allCandidates.filter(c => c.functionType === 'ALI').length,
      countAie: allCandidates.filter(c => c.functionType === 'AIE').length,
      countEe: allCandidates.filter(c => c.functionType === 'EE').length,
      countSe: allCandidates.filter(c => c.functionType === 'SE').length,
      countCe: allCandidates.filter(c => c.functionType === 'CE').length
    }
  };
}

/**
 * Lê configurações salvas do Agente de IA CFPS no SQLite.
 */
function getSavedAiSettings() {
  try {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('ai_cfps_config');
    return row ? JSON.parse(row.value) : {};
  } catch (_) {
    return {};
  }
}

/**
 * Retorna a configuração efetiva de IA mesclando banco + variáveis de ambiente.
 */
function getEffectiveAiSettings() {
  return aiAgent.resolveEffectiveAiConfig(getSavedAiSettings());
}

/**
 * Persiste configurações de IA no SQLite preservando a chave anterior se não alterada.
 */
function saveAiSettings(data = {}) {
  const existing = getSavedAiSettings();
  const next = {
    enabled: data.enabled !== undefined ? Boolean(data.enabled) : (existing.enabled !== undefined ? existing.enabled : true),
    fallbackEnabled: data.fallbackEnabled !== undefined ? Boolean(data.fallbackEnabled) : (existing.fallbackEnabled !== undefined ? existing.fallbackEnabled : true),
    provider: (data.provider || existing.provider || 'gemini').trim().toLowerCase(),
    model: (data.model !== undefined ? data.model : (existing.model || '')).trim(),
    baseUrl: (data.baseUrl !== undefined ? data.baseUrl : (existing.baseUrl || '')).trim(),
    apiKey: existing.apiKey || ''
  };

  if (data.clearApiKey === true) {
    next.apiKey = '';
  } else if (typeof data.apiKey === 'string') {
    const incomingKey = data.apiKey.trim();
    if (incomingKey && !incomingKey.includes('••••')) {
      next.apiKey = incomingKey;
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run('ai_cfps_config', JSON.stringify(next), now);

  return aiAgent.resolveEffectiveAiConfig(next);
}

/**
 * Carrega inventário atual de ALIs e AIEs cadastrados no projeto para evitar dupla contagem pela IA.
 */
function getProjectDataInventory(projectId) {
  if (!projectId || projectId === 'all') {
    return { existingAlis: [], existingAies: [] };
  }
  try {
    const rows = db.prepare(`SELECT name, function_type, td, ar_tr FROM apf_items WHERE project_id = ? AND function_type IN ('ALI', 'AIE')`).all(projectId);
    return {
      existingAlis: rows.filter(r => r.function_type === 'ALI'),
      existingAies: rows.filter(r => r.function_type === 'AIE')
    };
  } catch (_) {
    return { existingAlis: [], existingAies: [] };
  }
}

/**
 * Reconcilia a decomposição semântica da IA com as matrizes matemáticas IFPUG CPM 4.3.1 e travas SISP.
 */
function reconcileAiCfpsResult(aiRun, spec, options = {}) {
  const { parsed, latencyMs, provider, providerLabel, model } = aiRun;
  const countingType = options.countingType || spec.countingType || 'Desenvolvimento';
  const explicitOpType = (options.operationType || spec.operationType || '').toUpperCase().trim();
  const customFactor = options.factor !== undefined ? options.factor : spec.factor;
  const projectId = spec.projectId || spec.project_id || options.projectId || '';

  const fullText = [spec.title, spec.feature, spec.userStory || spec.user_story, spec.bdd, spec.text || spec.specification].filter(Boolean).join('\n');
  const isDevCountAuto = /^desenvolvimento$/i.test(countingType.trim()) && !explicitOpType;
  const semanticDevOp = isDevCountAuto ? resolveApfOperationType(countingType, '', fullText) : null;

  // Em contagem de Desenvolvimento Novo sem escolha manual de CHG/DEL, trava em ADD (salvo diretriz semântica explícita de melhoria)
  let rootOpType;
  if (explicitOpType === 'ADD' || explicitOpType === 'CHG' || explicitOpType === 'DEL') {
    rootOpType = explicitOpType;
  } else if (isDevCountAuto) {
    rootOpType = (semanticDevOp === 'CHG' || semanticDevOp === 'DEL') ? semanticDevOp : 'ADD';
  } else {
    rootOpType = ['ADD', 'CHG', 'DEL'].includes(parsed.operationType) ? parsed.operationType : 'ADD';
  }

  const effectiveCountingType = ((rootOpType === 'CHG' || rootOpType === 'DEL') && countingType === 'Desenvolvimento')
    ? 'Melhoria'
    : countingType;

  const catalogByKey = new Map(DEFAULT_INM_CATALOG.map(it => [it.key, it]));
  if (catalogByKey.has('webhook_tecnico')) {
    catalogByKey.set('job_webhook_rotina', catalogByKey.get('webhook_tecnico'));
  }
  const fnOrder = { ALI: 1, AIE: 2, EE: 3, SE: 4, CE: 5 };
  const validFnTypes = new Set(Object.keys(fnOrder));
  const seenCandidateKeys = new Set();
  const dedupInventoryNotes = [];

  const ifpugCandidates = (parsed.functions || [])
    .filter(fn => fn && validFnTypes.has((fn.functionType || '').toUpperCase()))
    .map((fn, idx) => {
      const fnType = fn.functionType.toUpperCase();
      let candOp;
      if (explicitOpType === 'ADD' || explicitOpType === 'CHG' || explicitOpType === 'DEL') {
        candOp = explicitOpType;
      } else if (isDevCountAuto && semanticDevOp === 'ADD') {
        candOp = 'ADD';
      } else {
        candOp = ['ADD', 'CHG', 'DEL'].includes(fn.operationType) ? fn.operationType : rootOpType;
      }
      const isDataFn = fnType === 'ALI' || fnType === 'AIE';
      const rawTdList = Array.isArray(fn.tdList) ? fn.tdList.map(x => String(x || '').trim()).filter(Boolean) : [];
      const cleanedTdList = isDataFn
        ? rawTdList.filter(f => !/^(?:acionamento|gatilho|bot[ãa]o|submit|mensagem(?:\s+de\s+retorno)?|log\s+de\s+retorno|feedback)/i.test(f))
        : rawTdList;
      const rawArList = Array.isArray(fn.arTrList) ? fn.arTrList.map(x => String(x || '').trim()).filter(Boolean) : [];

      let td = Math.max(1, parseInt(fn.td, 10) || 1);
      if (isDataFn && cleanedTdList.length > 0 && cleanedTdList.length < rawTdList.length) {
        td = cleanedTdList.length;
      } else if (!isDataFn) {
        td = Math.max(3, td, cleanedTdList.length);
      }

      let arTr = Math.max(1, parseInt(fn.arTr, 10) || 1);
      if (rawArList.length > 0) {
        arTr = Math.max(arTr, rawArList.length);
      }

      const complexity = calculateApfComplexity(fnType, arTr, td);
      const rawPf = calculateApfRawPf(fnType, complexity);
      const factor = getCountingTypeFactor(effectiveCountingType, customFactor, candOp, fnType, fullText);
      const finalPf = calculateApfFinalPf(rawPf, factor);
      const tdDetail = cleanedTdList.join(', ');
      const arDetail = rawArList.join(', ');

      return {
        id: `cand_ai_${fnType.toLowerCase()}_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        functionType: fnType,
        name: (fn.name || `${fnType} - ${parsed.entityName || spec.title || 'Função'}`).trim(),
        category: isDataFn ? 'Dados' : 'Transação',
        operationType: candOp,
        primaryIntent: (fn.primaryIntent || '').trim(),
        td,
        arTr,
        complexity,
        rawPf,
        countingType: effectiveCountingType,
        factor,
        finalPf,
        notes: `${td} TD(s)${tdDetail ? ` [${tdDetail}]` : ''}; ${arTr} ${isDataFn ? 'TR(s)' : 'AR(s)'}${arDetail ? ` [${arDetail}]` : ''}.`,
        rationale: (fn.rationale || '').trim() || `Classificado via Agente CFPS (${model}) conforme IFPUG CPM 4.3.1.`
      };
    })
    .filter(cand => {
      if ((cand.functionType === 'ALI' || cand.functionType === 'AIE') && cand.operationType === 'ADD' && projectId && projectId !== 'all') {
        const labelsToCheck = [cand.name, cand.name.replace(/^(?:ali|aie)\s*-\s*(?:estrutura de dados|interface externa)\s*:\s*/i, '')];
        if (projectHasDataFunction(projectId, cand.functionType, labelsToCheck)) {
          dedupInventoryNotes.push(`Inventário do Projeto (IFPUG): ${cand.name} já cadastrado no projeto foi reutilizado apenas como AR/FTR sem dupla contagem.`);
          return false;
        }
      }
      const dedupKey = `${cand.functionType}:${cand.name.toLowerCase().replace(/\s+/g, ' ').trim()}`;
      if (seenCandidateKeys.has(dedupKey)) return false;
      seenCandidateKeys.add(dedupKey);
      return true;
    })
    .sort((a, b) => (fnOrder[a.functionType] || 99) - (fnOrder[b.functionType] || 99));

  const hasAnyIfpug = ifpugCandidates.length > 0;
  const inmCandidates = [];
  const absorbedInmCandidates = [];

  (parsed.inmItems || []).forEach((item, idx) => {
    const catItem = catalogByKey.get(item?.catalogKey);
    if (!catItem) return;
    const quantity = Math.max(0.1, Number(item.quantity) || 1);
    const baseSubtotal = Math.round(quantity * catItem.unitWeight * 100) / 100;
    const isAbsorbed = hasAnyIfpug || Boolean(item.absorbed);

    if (isAbsorbed) {
      absorbedInmCandidates.push({
        id: `cand_ai_inm_${Date.now()}_${idx}`,
        catalogKey: catItem.key,
        itemName: catItem.name,
        category: catItem.category,
        absorbableByIfpug: true,
        quantity,
        unitWeight: catItem.unitWeight,
        originalPf: baseSubtotal,
        calculatedPf: 0,
        subtotalPf: 0,
        absorbed: true,
        selected: false,
        status: 'Absorvido pelo IFPUG',
        justification: `[ABSORVIDO PELA FUNÇÃO IFPUG — SISP] ${item.justification || catItem.description}`,
        evidence: `Auditado pelo Agente IA (${model}).`
      });
    } else {
      inmCandidates.push({
        id: `cand_ai_inm_${Date.now()}_${idx}`,
        catalogKey: catItem.key,
        itemName: catItem.name,
        category: catItem.category,
        absorbableByIfpug: false,
        quantity,
        unitWeight: catItem.unitWeight,
        calculatedPf: baseSubtotal,
        subtotalPf: baseSubtotal,
        absorbed: false,
        selected: true,
        status: 'Aprovado',
        justification: item.justification || catItem.description,
        evidence: `Auditado pelo Agente IA (${model}).`
      });
    }
  });

  let nature = 'Pura IFPUG';
  let natureExplanation = 'Mensuração pericial IFPUG CPM 4.3.1 realizada por Agente Especialista IA com validação matemática determinística.';
  if (ifpugCandidates.length > 0 && inmCandidates.length > 0) {
    nature = 'Híbrido';
    natureExplanation = 'A entrega combina funções IFPUG tradicionais e itens não-mensuráveis SISP avulsos.';
  } else if (ifpugCandidates.length === 0 && inmCandidates.length > 0) {
    nature = 'Item Não-Mensurável';
    natureExplanation = 'Demanda exclusivamente técnica tabelada pelo Roteiro de Métricas SISP (FPN).';
  }

  const totalRawIfpugPf = ifpugCandidates.reduce((s, c) => s + (c.rawPf || 0), 0);
  const totalFinalIfpugPf = Math.round(ifpugCandidates.reduce((s, c) => s + (c.finalPf || 0), 0) * 100) / 100;
  const totalInmPf = Math.round(inmCandidates.reduce((s, c) => s + (c.subtotalPf || 0), 0) * 100) / 100;
  const totalGlobalPf = Math.round((totalFinalIfpugPf + totalInmPf) * 100) / 100;

  const detectedFields = Array.isArray(parsed.detectedFields) ? parsed.detectedFields : [];
  const auditorNotes = Array.isArray(parsed.auditorNotes) ? [...parsed.auditorNotes] : [];
  if (dedupInventoryNotes.length > 0) {
    auditorNotes.push(...dedupInventoryNotes);
  }
  if (parsed.boundarySummary) {
    auditorNotes.unshift(`Fronteira da Aplicação (IA): ${parsed.boundarySummary}`);
  }

  let reportMarkdown = `## 1. Decomposição do Requisito (Agente CFPS • ${providerLabel} / ${model})\n`;
  reportMarkdown += `- **Resumo da Intenção do Usuário:** Como ${parsed.userRole || 'Usuário'}, necessita ${parsed.userWant || spec.title || 'processo funcional'} a fim de ${parsed.userBenefit || 'atender ao objetivo de negócio'}.\n`;
  reportMarkdown += `- **Fronteira da Aplicação:** ${parsed.boundarySummary || 'Fronteira delimitada conforme IFPUG CPM 4.3.1.'} (${effectiveCountingType} • Operação: ${rootOpType}).\n`;
  reportMarkdown += `- **Natureza da Demanda:** **${nature}** — ${natureExplanation}\n\n`;
  reportMarkdown += `## 2. Memória de Cálculo Detalhada\n\n`;

  if (ifpugCandidates.length > 0) {
    reportMarkdown += `### A. Funções de Negócio Tradicionais (IFPUG CPM 4.3.1)\n`;
    reportMarkdown += `| Tipo | Operação | Nome do Processo / Entidade | TDs (DET) | TRs/ARs | Complexidade | PF Bruto | Fator SISP | PF Líquido |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    ifpugCandidates.forEach(c => {
      const arTrLabel = (c.functionType === 'ALI' || c.functionType === 'AIE') ? `${c.arTr} TR` : `${c.arTr} AR`;
      const factorPct = `${Math.round((c.factor || 1) * 100)}%`;
      reportMarkdown += `| **${c.functionType}** | \`${c.operationType}\` | ${c.name} | ${c.td} | ${arTrLabel} | ${c.complexity} | ${c.rawPf} PF | ${factorPct} | **${c.finalPf.toFixed(2)} PF** |\n`;
    });
    reportMarkdown += `\n`;
  }

  if (inmCandidates.length > 0 || absorbedInmCandidates.length > 0) {
    reportMarkdown += `### B. Itens Não-Mensuráveis / Complementares (FPN • Padrão SISP)\n`;
    reportMarkdown += `| Item Técnico Identificado | Status SISP | Qtd ($Q$) | Peso ($P$) | Justificativa / Regra de Exclusão Mútua | Subtotal (PF) |\n`;
    reportMarkdown += `| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    inmCandidates.forEach(inm => {
      reportMarkdown += `| ${inm.itemName} | **Pontuado** | ${inm.quantity} | ${inm.unitWeight.toFixed(2)} PF | ${inm.justification} | **${inm.subtotalPf.toFixed(2)} PF** |\n`;
    });
    absorbedInmCandidates.forEach(abs => {
      reportMarkdown += `| ~${abs.itemName}~ | **Absorvido** | ${abs.quantity} | ${abs.unitWeight.toFixed(2)} PF | ${abs.justification} | **0.00 PF** |\n`;
    });
    reportMarkdown += `\n`;
  }

  reportMarkdown += `## 3. Totalização Consolidada\n`;
  reportMarkdown += `- **PF de Negócio (IFPUG Líquido):** ${totalFinalIfpugPf.toFixed(2)} PF (PF Bruto: ${totalRawIfpugPf} PF)\n`;
  reportMarkdown += `- **PF Não-Mensuráveis (FPN Líquido Não Absorvido):** ${totalInmPf.toFixed(2)} PF\n`;
  reportMarkdown += `- **Total Global da Entrega:** **${totalGlobalPf.toFixed(2)} PF**\n\n`;

  if (auditorNotes.length > 0) {
    reportMarkdown += `## 4. Notas Técnicas e Observações do Auditor CFPS\n`;
    auditorNotes.forEach(note => { reportMarkdown += `- ${note}\n`; });
  }

  return {
    sourceType: spec.id ? 'requirement' : (spec.feature ? 'feature' : 'specification'),
    sourceId: spec.id || '',
    sourceCode: spec.code || '',
    sourceTitle: spec.title || spec.feature || 'Especificação Funcional',
    feature: spec.feature || '',
    projectId: spec.projectId || spec.project_id || '',
    countingType: effectiveCountingType,
    operationType: rootOpType,
    nature,
    natureExplanation,
    userRole: parsed.userRole || '',
    userWant: parsed.userWant || '',
    userBenefit: parsed.userBenefit || '',
    detectedFields,
    candidates: ifpugCandidates,
    inmCandidates,
    absorbedInmCandidates,
    totalRawIfpugPf,
    totalFinalIfpugPf,
    totalInmPf,
    totalGlobalPf,
    auditorNotes,
    reportMarkdown,
    aiMeta: {
      usedAi: true,
      cached: Boolean(aiRun.cached),
      provider,
      providerLabel,
      model,
      latencyMs,
      fallbackUsed: false,
      fallbackReason: ''
    },
    summary: {
      nature,
      operationType: rootOpType,
      totalFunctions: ifpugCandidates.length,
      totalInmCount: inmCandidates.length,
      totalAbsorbedInmCount: absorbedInmCandidates.length,
      totalRawPf: totalRawIfpugPf,
      totalFinalIfpugPf,
      totalInmPf,
      totalGlobalPf,
      countAli: ifpugCandidates.filter(c => c.functionType === 'ALI').length,
      countAie: ifpugCandidates.filter(c => c.functionType === 'AIE').length,
      countEe: ifpugCandidates.filter(c => c.functionType === 'EE').length,
      countSe: ifpugCandidates.filter(c => c.functionType === 'SE').length,
      countCe: ifpugCandidates.filter(c => c.functionType === 'CE').length
    }
  };
}

/**
 * Executa auditoria CFPS via Agente de IA com cache determinístico por conteúdo + fallback seguro.
 */
async function executeAiCfpsWithCache(spec, context, options, localFallbackFn) {
  const effectiveConfig = getEffectiveAiSettings();
  const forceLocal = options.engine === 'local';
  const forceRefresh = Boolean(options.forceRefresh);

  if (!forceLocal && effectiveConfig.isReady) {
    const cacheKey = aiAgent.computeCfpsCacheKey(spec, context, effectiveConfig, options);
    if (!forceRefresh) {
      try {
        const cachedRow = db.prepare('SELECT provider, model, payload_json FROM cfps_ai_cache WHERE cache_key = ?').get(cacheKey);
        if (cachedRow) {
          const parsedCached = JSON.parse(cachedRow.payload_json);
          return reconcileAiCfpsResult({
            parsed: parsedCached,
            latencyMs: 0,
            cached: true,
            provider: cachedRow.provider,
            providerLabel: effectiveConfig.providerLabel,
            model: cachedRow.model
          }, spec, options);
        }
      } catch (_) { }
    }

    try {
      const aiRun = await aiAgent.runAiCfpsAnalysis(spec, context, effectiveConfig);
      try {
        db.prepare(`
          INSERT INTO cfps_ai_cache (cache_key, provider, model, payload_json, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(cache_key) DO UPDATE SET provider = excluded.provider, model = excluded.model, payload_json = excluded.payload_json, created_at = excluded.created_at
        `).run(cacheKey, aiRun.provider, aiRun.model, JSON.stringify(aiRun.parsed), new Date().toISOString());
      } catch (_) { }
      return reconcileAiCfpsResult({ ...aiRun, cached: false }, spec, options);
    } catch (aiErr) {
      console.warn(`⚠️ Falha no Agente IA CFPS (${effectiveConfig.provider}/${effectiveConfig.model}):`, aiErr.message);
      if (!effectiveConfig.fallbackEnabled && options.engine === 'ai') {
        throw aiErr;
      }
      const fallback = localFallbackFn();
      fallback.aiMeta = {
        usedAi: false,
        cached: false,
        provider: effectiveConfig.provider,
        providerLabel: effectiveConfig.providerLabel,
        model: effectiveConfig.model,
        latencyMs: 0,
        fallbackUsed: true,
        fallbackReason: aiErr.message
      };
      return fallback;
    }
  }

  const localRes = localFallbackFn();
  localRes.aiMeta = {
    usedAi: false,
    cached: false,
    provider: effectiveConfig.provider,
    providerLabel: effectiveConfig.providerLabel,
    model: effectiveConfig.model,
    latencyMs: 0,
    fallbackUsed: false,
    fallbackReason: forceLocal
      ? 'Modo heurístico local selecionado manualmente.'
      : (effectiveConfig.enabled ? 'Nenhuma API Key configurada para o provedor de IA.' : 'Agente de IA desativado nas configurações.')
  };
  return localRes;
}

/**
 * Orquestra auditoria CFPS de um requisito ou especificação usando Agente de IA + cache + fallback.
 */
async function analyzeCfpsWithAiOrFallback(spec, options = {}) {
  const projectId = spec.projectId || spec.project_id || options.projectId || '';
  const { existingAlis, existingAies } = getProjectDataInventory(projectId);
  const context = {
    countingType: options.countingType || 'Desenvolvimento',
    operationType: options.operationType || '',
    existingAlis,
    existingAies
  };
  return await executeAiCfpsWithCache(spec, context, options, () => analyzeCfpsSpecification(spec, options));
}

/**
 * Orquestra auditoria CFPS de Feature consolidada usando Agente de IA + cache + fallback.
 */
async function analyzeFeatureWithAiOrFallback(projectId, featureName, options = {}) {
  let query = 'SELECT * FROM requirements WHERE feature = ?';
  const params = [featureName];
  if (projectId && projectId !== 'all') {
    query += ' AND project_id = ?';
    params.push(projectId);
  }
  const featureRequirements = db.prepare(query).all(...params);
  const spec = { title: featureName, feature: featureName, projectId };
  const { existingAlis, existingAies } = getProjectDataInventory(projectId);
  const context = {
    countingType: options.countingType || 'Desenvolvimento',
    operationType: options.operationType || '',
    existingAlis,
    existingAies,
    featureRequirements
  };

  const result = await executeAiCfpsWithCache(spec, context, options, () => inferApfFromFeature(projectId, featureName, options));
  result.sourceType = 'feature';
  result.requirementsCount = featureRequirements.length;
  return result;
}


// ==============================================================================
// 5. Servidor HTTP Principal & Roteamento da REST API
// ==============================================================================
const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role, x-user-name'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  const method = req.method;

  try {
    // --------------------------------------------------------------------------
    // ROTAS DA API REST (/api/*)
    // --------------------------------------------------------------------------

    // 1. Healthcheck da Conexão
    if (method === 'GET' && pathname === '/api/health') {
      return sendJson(res, 200, {
        status: 'online',
        database: `SQLite (${path.basename(DB_PATH)})`,
        engine: 'node:sqlite (ACID)',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Bootstrap Consolidado (Carga Rápida de Todo o Estado)
    if (method === 'GET' && pathname === '/api/bootstrap') {
      const actor = getActorFromReq(req);
      const isAdmin = actor && actor.role === 'admin';
      return sendJson(res, 200, {
        projects: getFullProjects(),
        requirements: getFullRequirements(),
        teamMembers: getFullTeamMembers(),
        tasks: getFullTasks(),
        testCases: getFullTestCases(),
        users: getFullUsers(),
        goals: getFullGoals(),
        careers: getFullCareerTracks(),
        documentTemplates: getFullDocumentTemplates(),
        templates: getFullDocumentTemplates(),
        apfItems: getFullApfItems(),
        apfInmItems: getFullApfInmItems(),
        inmCatalog: DEFAULT_INM_CATALOG,
        auditLogs: isAdmin ? getFullAuditLogs(150) : []
      });
    }

    // 3. Autenticação & Usuários
    if (method === 'POST' && pathname === '/api/auth/login') {
      const { email, password } = await parseJsonBody(req);
      if (!email || !password) {
        return sendJson(res, 400, { success: false, message: 'E-mail e senha são obrigatórios.' });
      }

      const user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim());
      if (!user || user.password !== password) {
        return sendJson(res, 401, { success: false, message: 'E-mail ou senha incorretos.' });
      }

      let skills = [];
      try { skills = JSON.parse(user.skills); } catch (e) { }
      const safeUser = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        devRole: user.dev_role,
        seniority: user.seniority,
        skills: Array.isArray(skills) ? skills : [],
        avatarBg: user.avatar_bg,
        createdAt: user.created_at
      };

      logAudit({
        entityType: 'auth',
        entityId: user.id,
        entityTitle: user.name,
        action: 'LOGIN',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        details: `Usuário ${user.name} (${user.role}) efetuou login no sistema.`
      });

      return sendJson(res, 200, { success: true, user: safeUser });
    }

    if (method === 'POST' && pathname === '/api/auth/register') {
      const callerRole = req.headers['x-user-role'];
      if (callerRole !== 'admin') {
        return sendJson(res, 403, {
          success: false,
          message: 'Apenas Administradores do Sistema (Workspace Owner) possuem permissão para cadastrar novos usuários e definir papéis.'
        });
      }

      const data = await parseJsonBody(req);
      const email = (data.email || '').trim().toLowerCase();
      const name = (data.name || '').trim();
      if (!name || !email || !data.password) {
        return sendJson(res, 400, { success: false, message: 'Dados cadastrais incompletos.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE lower(trim(email)) = ?').get(email);
      if (existing) {
        return sendJson(res, 409, { success: false, message: 'Já existe um usuário cadastrado com este e-mail.' });
      }

      const newId = 'u_' + Date.now();
      let parsedSkills = [];
      if (Array.isArray(data.skills)) parsedSkills = data.skills;
      else if (typeof data.skills === 'string') {
        try { parsedSkills = JSON.parse(data.skills); } catch (e) { parsedSkills = data.skills.split(',').map(s => s.trim()).filter(Boolean); }
      }
      const skillsStr = JSON.stringify(parsedSkills);
      const createdAt = new Date().toISOString();
      const randomBg = data.avatarBg || '#6366f1';

      db.prepare(`
        INSERT INTO users (id, name, email, password, role, dev_role, seniority, skills, avatar_bg, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, name, email, data.password, data.role || 'dev', data.devRole || null, data.seniority || 'Pleno', skillsStr, randomBg, createdAt);

      // Se for perfil desenvolvedor ou QA, sincroniza na equipe sem criar duplicidade
      if (data.role === 'dev' || data.role === 'qa') {
        const memberExists = db.prepare('SELECT id, skills, role, seniority FROM team_members WHERE lower(trim(name)) = lower(trim(?))').get(name);
        const resolvedRole = data.devRole || (data.role === 'qa' ? 'qa' : 'backend');
        if (memberExists) {
          let existingSkills = [];
          try { existingSkills = JSON.parse(memberExists.skills); } catch (e) { }
          const mergedSkills = parsedSkills.length > 0 ? parsedSkills : existingSkills;
          db.prepare(`
            UPDATE team_members
            SET role = ?, seniority = ?, skills = ?, avatar_bg = ?
            WHERE id = ?
          `).run(resolvedRole, data.seniority || memberExists.seniority || 'Pleno', JSON.stringify(mergedSkills), randomBg, memberExists.id);
        } else {
          db.prepare(`
            INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
            VALUES (?, ?, ?, ?, ?, 40, ?)
          `).run('m_' + Date.now(), name, resolvedRole, data.seniority || 'Pleno', skillsStr, randomBg);
        }
      }

      const safeUser = {
        id: newId,
        name: name,
        email: email,
        role: data.role || 'dev',
        devRole: data.devRole || null,
        seniority: data.seniority || 'Pleno',
        skills: Array.isArray(data.skills) ? data.skills : [],
        avatarBg: randomBg,
        createdAt: createdAt
      };

      const actor = getActorFromReq(req);
      logAudit({
        entityType: 'auth',
        entityId: newId,
        entityTitle: name,
        action: 'REGISTER',
        actorId: actor.actorId || newId,
        actorName: actor.actorName || name,
        actorRole: actor.actorRole || 'admin',
        details: `Novo usuário registrado: "${name}" (${email}) com perfil "${data.role || 'dev'}".`
      });

      return sendJson(res, 201, { success: true, user: safeUser });
    }

    if (method === 'GET' && pathname === '/api/users') {
      return sendJson(res, 200, getFullUsers());
    }

    // Atualização de Perfil de Usuário
    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
    if (userMatch && method === 'PUT') {
      const targetUserId = userMatch[1];
      const callerRole = req.headers['x-user-role'];
      const callerId = req.headers['x-user-id'];

      // Usuários comuns só editam seu próprio perfil. Apenas Admin pode editar qualquer um e alterar papéis.
      if (callerRole !== 'admin' && callerId !== targetUserId) {
        return sendJson(res, 403, { success: false, message: 'Você não possui permissão para editar outros usuários.' });
      }

      const data = await parseJsonBody(req);
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId);
      if (!user) {
        return sendJson(res, 404, { success: false, message: 'Usuário não encontrado.' });
      }

      const newName = (data.name || user.name).trim();
      const newRole = (callerRole === 'admin' && data.role) ? data.role : user.role;
      const newDevRole = (callerRole === 'admin' && typeof data.devRole !== 'undefined') ? ((newRole === 'dev' || newRole === 'qa') ? data.devRole : null) : user.dev_role;
      const newSeniority = data.seniority || user.seniority;
      const skillsStr = JSON.stringify(Array.isArray(data.skills) ? data.skills : (typeof data.skills === 'string' ? data.skills.split(',').map(s => s.trim()).filter(Boolean) : []));
      const newAvatarBg = data.avatarBg || user.avatar_bg;
      const newPassword = (data.password && data.password.trim()) ? data.password.trim() : user.password;

      db.prepare(`
        UPDATE users
        SET name = ?, role = ?, dev_role = ?, seniority = ?, skills = ?, avatar_bg = ?, password = ?
        WHERE id = ?
      `).run(newName, newRole, newDevRole, newSeniority, skillsStr, newAvatarBg, newPassword, targetUserId);

      // Sincroniza também na tabela de equipe se for dev ou qa
      if (newRole === 'dev' || newRole === 'qa') {
        const teamMember = db.prepare('SELECT id FROM team_members WHERE id = ? OR lower(name) = lower(?)').get(targetUserId, user.name);
        const resolvedRole = newDevRole || (newRole === 'qa' ? 'qa' : 'backend');
        if (teamMember) {
          db.prepare(`
            UPDATE team_members
            SET name = ?, role = ?, seniority = ?, skills = ?, avatar_bg = ?
            WHERE id = ?
          `).run(newName, resolvedRole, newSeniority, skillsStr, newAvatarBg, teamMember.id);
        } else {
          db.prepare(`
            INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
            VALUES (?, ?, ?, ?, ?, 40, ?)
          `).run('m_' + Date.now(), newName, resolvedRole, newSeniority, skillsStr, newAvatarBg);
        }
      }

      let parsedSkills = [];
      try { parsedSkills = JSON.parse(skillsStr); } catch (e) { }

      const safeUser = {
        id: targetUserId,
        name: newName,
        email: user.email,
        role: newRole,
        devRole: newDevRole,
        seniority: newSeniority,
        skills: parsedSkills,
        avatarBg: newAvatarBg,
        createdAt: user.created_at
      };

      return sendJson(res, 200, { success: true, user: safeUser });
    }

    // Exclusão de Usuário (Apenas Admin)
    if (userMatch && method === 'DELETE') {
      const callerRole = req.headers['x-user-role'];
      if (callerRole !== 'admin') {
        return sendJson(res, 403, { success: false, message: 'Apenas Administradores do Sistema (Workspace Owner) podem excluir usuários.' });
      }
      const targetUserId = userMatch[1];
      const callerId = req.headers['x-user-id'];
      if (callerId === targetUserId) {
        return sendJson(res, 400, { success: false, message: 'Você não pode excluir sua própria conta enquanto estiver logado.' });
      }

      const targetUser = db.prepare('SELECT name FROM users WHERE id = ?').get(targetUserId);
      db.prepare('DELETE FROM users WHERE id = ?').run(targetUserId);
      if (targetUser) {
        db.prepare('DELETE FROM team_members WHERE id = ? OR lower(name) = lower(?)').run(targetUserId, targetUser.name);
      }
      return sendJson(res, 200, { success: true, id: targetUserId });
    }

    // 4. CRUD: Projetos
    if (pathname === '/api/projects') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullProjects());
      }
      if (method === 'POST') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para cadastrar projetos.' });
        }
        const p = await parseJsonBody(req);
        const id = p.id || 'p_' + Date.now();
        const now = new Date().toISOString();
        const featuresJson = JSON.stringify(Array.isArray(p.features) ? p.features : []);
        db.prepare(`
          INSERT INTO projects (id, code, name, desc, color, status, deadline, features, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, p.code || 'PROJ', p.name, p.desc || '', p.color || '#3b82f6', p.status || 'Ativo', p.deadline || '', featuresJson, now);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'project',
          entityId: id,
          entityTitle: p.name,
          action: 'CREATE',
          ...actor,
          details: `Cadastrou novo projeto: [${p.code || 'PROJ'}] "${p.name}".`,
          newState: p
        });

        return sendJson(res, 201, { id, ...p });
      }
    }

    if (pathname.startsWith('/api/projects/')) {
      const projId = pathname.split('/')[3];
      if (method === 'PUT') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para editar projetos.' });
        }
        const p = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(projId);
        let featuresJson = existing ? (existing.features || '[]') : '[]';
        if (p.features !== undefined) {
          featuresJson = JSON.stringify(Array.isArray(p.features) ? p.features : []);
        }
        db.prepare(`
          UPDATE projects
          SET name = ?, code = ?, desc = ?, color = ?, status = ?, deadline = ?, features = ?
          WHERE id = ?
        `).run(
          p.name !== undefined ? p.name : (existing ? existing.name : ''),
          p.code !== undefined ? p.code : (existing ? existing.code : 'PROJ'),
          p.desc !== undefined ? p.desc : (existing ? existing.desc : ''),
          p.color !== undefined ? p.color : (existing ? existing.color : '#3b82f6'),
          p.status !== undefined ? p.status : (existing ? existing.status : 'Ativo'),
          p.deadline !== undefined ? p.deadline : (existing ? existing.deadline : ''),
          featuresJson,
          projId
        );

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'project',
          entityId: projId,
          entityTitle: p.name || (existing ? existing.name : projId),
          action: 'UPDATE',
          ...actor,
          details: `Atualizou configurações do projeto [${p.code || 'PROJ'}] "${p.name}".`,
          prevState: existing,
          newState: p
        });

        return sendJson(res, 200, { id: projId, ...p });
      }
      if (method === 'DELETE') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa' || callerRole === 'pm') {
          return sendJson(res, 403, { success: false, message: 'Seu perfil não possui permissão para excluir projetos.' });
        }
        const existing = db.prepare('SELECT name, code FROM projects WHERE id = ?').get(projId);
        db.prepare('DELETE FROM projects WHERE id = ?').run(projId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'project',
          entityId: projId,
          entityTitle: existing ? existing.name : projId,
          action: 'DELETE',
          ...actor,
          details: `Excluiu projeto [${existing ? existing.code : 'PROJ'}] "${existing ? existing.name : projId}".`,
          prevState: existing
        });

        return sendJson(res, 200, { success: true, id: projId });
      }
    }

    // 5. CRUD: Requisitos
    if (pathname === '/api/requirements') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullRequirements());
      }
      if (method === 'POST') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para cadastrar requisitos.' });
        }
        const r = await parseJsonBody(req);
        const id = r.id || 'req_' + Date.now();
        const now = r.createdAt || new Date().toISOString();
        const feature = (r.feature || '').trim();
        db.prepare(`
          INSERT INTO requirements (id, code, title, project_id, feature, type, moscow, user_story, bdd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, r.code || 'RF', r.title, r.projectId || null, feature, r.type || 'functional', r.moscow || 'Must', r.userStory || '', r.bdd || '', now);

        if (r.projectId && feature) {
          try {
            const proj = db.prepare('SELECT features FROM projects WHERE id = ?').get(r.projectId);
            if (proj) {
              let fList = [];
              try { fList = JSON.parse(proj.features || '[]'); } catch (e) { }
              if (!Array.isArray(fList)) fList = [];
              if (!fList.some(f => f.toLowerCase() === feature.toLowerCase())) {
                fList.push(feature);
                db.prepare('UPDATE projects SET features = ? WHERE id = ?').run(JSON.stringify(fList), r.projectId);
              }
            }
          } catch (e) { }
        }

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'requirement',
          entityId: id,
          entityTitle: r.title,
          action: 'CREATE',
          ...actor,
          details: `Especificou novo requisito: [${r.code || 'RF'}] "${r.title}".`,
          newState: { ...r, id, feature, createdAt: now }
        });

        return sendJson(res, 201, { id, ...r, feature, createdAt: now });
      }
    }

    if (pathname.startsWith('/api/requirements/')) {
      const reqId = pathname.split('/')[3];
      if (method === 'PUT') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para editar requisitos.' });
        }
        const r = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM requirements WHERE id = ?').get(reqId);
        const feature = r.feature !== undefined ? (r.feature || '').trim() : (existing ? (existing.feature || '') : '');
        db.prepare(`
          UPDATE requirements
          SET code = ?, title = ?, project_id = ?, feature = ?, type = ?, moscow = ?, user_story = ?, bdd = ?
          WHERE id = ?
        `).run(r.code || 'RF', r.title || '', r.projectId || null, feature, r.type || 'functional', r.moscow || 'Must', r.userStory || '', r.bdd || '', reqId);

        if (r.projectId && feature) {
          try {
            const proj = db.prepare('SELECT features FROM projects WHERE id = ?').get(r.projectId);
            if (proj) {
              let fList = [];
              try { fList = JSON.parse(proj.features || '[]'); } catch (e) { }
              if (!Array.isArray(fList)) fList = [];
              if (!fList.some(f => f.toLowerCase() === feature.toLowerCase())) {
                fList.push(feature);
                db.prepare('UPDATE projects SET features = ? WHERE id = ?').run(JSON.stringify(fList), r.projectId);
              }
            }
          } catch (e) { }
        }

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'requirement',
          entityId: reqId,
          entityTitle: r.title || (existing ? existing.title : reqId),
          action: 'UPDATE',
          ...actor,
          details: `Atualizou especificação do requisito [${r.code || 'RF'}] "${r.title}".`,
          prevState: existing,
          newState: r
        });

        return sendJson(res, 200, { id: reqId, ...r });
      }
      if (method === 'DELETE') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para excluir requisitos.' });
        }
        const existing = db.prepare('SELECT code, title FROM requirements WHERE id = ?').get(reqId);
        db.prepare('DELETE FROM requirements WHERE id = ?').run(reqId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'requirement',
          entityId: reqId,
          entityTitle: existing ? existing.title : reqId,
          action: 'DELETE',
          ...actor,
          details: `Excluiu requisito [${existing ? existing.code : 'RF'}] "${existing ? existing.title : reqId}".`,
          prevState: existing
        });

        return sendJson(res, 200, { success: true, id: reqId });
      }
    }

    // 6. CRUD: Demandas (Tarefas) & Operações
    if (pathname === '/api/tasks') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullTasks());
      }
      if (method === 'POST') {
        const t = await parseJsonBody(req);
        const id = t.id || 't_' + Date.now();
        const now = new Date().toISOString();
        const devNotes = t.devNotes || '';
        const qaNotes = t.qaNotes || '';
        const qaReviewer = t.qaReviewer || '';
        const qaDate = t.qaDate || null;
        const qaApproved = t.qaApproved ? 1 : 0;

        db.prepare(`
          INSERT INTO tasks (id, title, project_id, req_id, role, assignee_id, priority, complexity, hours, hours_spent, status, desc, impediment, qa_approved, qa_notes, qa_reviewer, qa_date, dev_notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, null, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, t.title, t.projectId || null, t.reqId || null, t.role || 'backend', t.assigneeId || null, t.priority || 'Média', t.complexity || 'Média', parseFloat(t.hours) || 8, t.status || 'backlog', t.desc || '', qaApproved, qaNotes, qaReviewer, qaDate, devNotes, now, now);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'task',
          entityId: id,
          entityTitle: t.title,
          action: 'CREATE',
          ...actor,
          details: `Criou nova demanda: "${t.title}" (${t.role || 'backend'}, ${t.priority || 'Média'}).${devNotes ? ' Possui notas técnicas iniciais.' : ''}`,
          newState: t
        });

        return sendJson(res, 201, { id, ...t, devNotes, qaNotes, qaReviewer, qaDate, qaApproved: Boolean(qaApproved), createdAt: now, updatedAt: now });
      }
    }

    if (pathname.startsWith('/api/tasks/')) {
      const parts = pathname.split('/');
      const taskId = parts[3];
      const action = parts[4];

      // Mover status do Kanban
      if (action === 'move' && method === 'PUT') {
        const { status } = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        const prevStatus = existing ? existing.status : 'desconhecido';
        const now = new Date().toISOString();

        if (status === 'done') {
          db.prepare('UPDATE tasks SET status = ?, qa_date = COALESCE(qa_date, ?), updated_at = ? WHERE id = ?').run(status, now, now, taskId);
        } else {
          db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(status, now, taskId);
        }

        const actor = getActorFromReq(req);
        const colNames = { backlog: 'A Fazer (Backlog)', spec: 'Em Especificação', dev: 'Em Desenvolvimento', qa: 'Em Testes / Validação', done: 'Concluído' };

        logAudit({
          entityType: 'task',
          entityId: taskId,
          entityTitle: existing ? existing.title : taskId,
          action: 'STATUS_CHANGE',
          ...actor,
          details: `Moveu status da demanda de "${colNames[prevStatus] || prevStatus}" para "${colNames[status] || status}".`,
          prevState: { status: prevStatus },
          newState: { status }
        });

        return sendJson(res, 200, { success: true, id: taskId, status });
      }

      // Apontamento de Horas (Timesheet)
      if (action === 'timesheet' && method === 'POST') {
        const { hours, date, notes, impediment, author } = await parseJsonBody(req);
        const h = parseFloat(hours) || 0;
        const tsId = 'ts_' + Date.now();
        const now = new Date().toISOString();
        const actor = getActorFromReq(req);
        const authorName = author || actor.actorName || 'Desenvolvedor';

        db.prepare(`
          INSERT INTO task_timesheet (id, task_id, hours, date, notes, impediment, author, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tsId, taskId, h, date || now.split('T')[0], notes || '', impediment || null, authorName, now);

        db.prepare(`
          UPDATE tasks
          SET hours_spent = hours_spent + ?,
              impediment = CASE WHEN ? != '' THEN ? ELSE impediment END,
              updated_at = ?
          WHERE id = ?
        `).run(h, impediment || '', impediment || null, now, taskId);

        const existing = db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId);

        logAudit({
          entityType: 'task',
          entityId: taskId,
          entityTitle: existing ? existing.title : taskId,
          action: 'TIMESHEET_POINT',
          ...actor,
          details: `Apontamento de ${h}h realizado por ${authorName}.${notes ? ` Observações: "${notes}".` : ''}${impediment ? ` ⚠️ Impedimento registrado: "${impediment}".` : ''}`,
          newState: { hours: h, date: date || now.split('T')[0], notes, impediment }
        });

        return sendJson(res, 200, { success: true, tsId });
      }

      // Validação Formal de QA
      if (action === 'qa-validate' && method === 'POST') {
        const { decision, notes, reviewer } = await parseJsonBody(req);
        const now = new Date().toISOString();
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        const actor = getActorFromReq(req);
        const reviewerName = reviewer || actor.actorName || 'QA Lead';
        const qaNotesText = (notes || '').trim() || (decision === 'approve' ? 'Homologado com sucesso nos testes de QA.' : 'Reprovado nos critérios de aceitação.');

        if (decision === 'approve') {
          db.prepare(`
            UPDATE tasks
            SET status = 'done', qa_approved = 1, qa_notes = ?, qa_reviewer = ?, qa_date = ?, impediment = null, updated_at = ?
            WHERE id = ?
          `).run(qaNotesText, reviewerName, now, now, taskId);
        } else {
          db.prepare(`
            UPDATE tasks
            SET status = 'dev', qa_approved = 0, qa_notes = ?, qa_reviewer = ?, qa_date = ?, impediment = ?, updated_at = ?
            WHERE id = ?
          `).run(qaNotesText, reviewerName, now, `Bloqueio QA: ${qaNotesText}`, now, taskId);
        }

        logAudit({
          entityType: 'task',
          entityId: taskId,
          entityTitle: existing ? existing.title : taskId,
          action: 'QA_VALIDATE',
          ...actor,
          details: decision === 'approve'
            ? `QA APROVADO: Demanda homologada por ${reviewerName}. Parecer: "${qaNotesText}".`
            : `QA REPROVADO: Demanda bloqueada por ${reviewerName} e retornada para Desenvolvimento. Motivo: "${qaNotesText}".`,
          prevState: { qaApproved: existing ? existing.qa_approved : 0, status: existing ? existing.status : 'qa' },
          newState: { qaApproved: decision === 'approve' ? 1 : 0, qaNotes: qaNotesText, qaReviewer: reviewerName, qaDate: now }
        });

        return sendJson(res, 200, { success: true, decision, notes: qaNotesText, reviewer: reviewerName, date: now });
      }

      // Atribuição de Demanda
      if (action === 'assign' && method === 'PUT') {
        const { assigneeId } = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        const now = new Date().toISOString();
        db.prepare('UPDATE tasks SET assignee_id = ?, updated_at = ? WHERE id = ?').run(assigneeId || null, now, taskId);

        const actor = getActorFromReq(req);
        let assigneeName = 'Livre (Desatribuída)';
        if (assigneeId) {
          const m = db.prepare('SELECT name FROM team_members WHERE id = ?').get(assigneeId);
          assigneeName = m ? m.name : assigneeId;
        }

        logAudit({
          entityType: 'task',
          entityId: taskId,
          entityTitle: existing ? existing.title : taskId,
          action: assigneeId ? 'ASSIGN' : 'UNASSIGN',
          ...actor,
          details: assigneeId ? `Demanda atribuída para o desenvolvedor "${assigneeName}".` : 'Demanda desatribuída (colocada como Livre).',
          prevState: { assigneeId: existing ? existing.assignee_id : null },
          newState: { assigneeId: assigneeId || null }
        });

        return sendJson(res, 200, { success: true, taskId, assigneeId });
      }

      // Ajuste de horas apontadas por Administrador
      if (action === 'adjust-hours' && method === 'POST') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole && callerRole !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Apenas Administradores podem ajustar as horas apontadas de uma demanda.' });
        }
        const { newHoursSpent, reason, author } = await parseJsonBody(req);
        const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (!task) {
          return sendJson(res, 404, { success: false, message: 'Demanda não encontrada.' });
        }
        const oldHours = task.hours_spent || 0;
        const nh = Math.max(0, parseFloat(newHoursSpent) || 0);
        const now = new Date().toISOString();
        db.prepare('UPDATE tasks SET hours_spent = ?, updated_at = ? WHERE id = ?').run(nh, now, taskId);

        // Registrar entrada de auditoria no timesheet
        const tsId = 'ts_' + Date.now();
        const diff = nh - oldHours;
        const notes = `[Ajuste Administrativo] Saldo de horas alterado de ${oldHours}h para ${nh}h. Motivo: ${reason || 'Ajuste de horas apontadas'}`;
        const actor = getActorFromReq(req);
        const authorName = author || actor.actorName || 'Administrador';

        db.prepare(`
          INSERT INTO task_timesheet (id, task_id, hours, date, notes, impediment, author, created_at)
          VALUES (?, ?, ?, ?, ?, null, ?, ?)
        `).run(tsId, taskId, diff, now.split('T')[0], notes, authorName, now);

        logAudit({
          entityType: 'task',
          entityId: taskId,
          entityTitle: task.title,
          action: 'HOURS_ADJUST',
          ...actor,
          details: `Saldo de horas apontadas ajustado de ${oldHours}h para ${nh}h. Motivo: "${reason || 'Sem justificativa preenchida'}".`,
          prevState: { hoursSpent: oldHours },
          newState: { hoursSpent: nh }
        });

        return sendJson(res, 200, { success: true, taskId, oldHours, newHours: nh, tsId });
      }

      if (method === 'PUT') {
        const t = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
        if (existing) {
          const actor = getActorFromReq(req);
          const callerRole = actor.actorRole;
          const newTitle = t.title !== undefined ? t.title : existing.title;
          const newProj = t.projectId !== undefined ? (t.projectId || null) : existing.project_id;
          const newReq = t.reqId !== undefined ? (t.reqId || null) : existing.req_id;
          const newRole = t.role !== undefined ? t.role : existing.role;
          const newAssignee = t.assigneeId !== undefined ? (t.assigneeId || null) : existing.assignee_id;
          const newPriority = t.priority !== undefined ? t.priority : existing.priority;
          const newComplexity = t.complexity !== undefined ? t.complexity : (existing.complexity || 'Média');
          const newHours = t.hours !== undefined ? parseFloat(t.hours) : existing.hours;

          let newHoursSpent = existing.hours_spent || 0;
          if (t.hoursSpent !== undefined) {
            if (callerRole === 'admin' || !callerRole) {
              const candidate = Math.max(0, parseFloat(t.hoursSpent) || 0);
              if (Math.abs(candidate - newHoursSpent) > 0.001) {
                const diff = candidate - newHoursSpent;
                const tsId = 'ts_' + Date.now();
                const now = new Date().toISOString();
                const notes = `[Ajuste Administrativo via Edição de Demanda] Saldo alterado de ${newHoursSpent}h para ${candidate}h`;
                db.prepare(`
                  INSERT INTO task_timesheet (id, task_id, hours, date, notes, impediment, author, created_at)
                  VALUES (?, ?, ?, ?, ?, null, ?, ?)
                `).run(tsId, taskId, diff, now.split('T')[0], notes, actor.actorName || 'Administrador', now);
                newHoursSpent = candidate;
              }
            }
          }

          const newDesc = t.desc !== undefined ? t.desc : existing.desc;
          const newDevNotes = t.devNotes !== undefined ? t.devNotes : (existing.dev_notes || '');
          const newQaNotes = t.qaNotes !== undefined ? t.qaNotes : (existing.qa_notes || '');
          const newQaReviewer = t.qaReviewer !== undefined ? t.qaReviewer : (existing.qa_reviewer || '');
          const newQaDate = t.qaDate !== undefined ? t.qaDate : (existing.qa_date || '');
          const newQaApproved = t.qaApproved !== undefined ? (t.qaApproved ? 1 : 0) : (existing.qa_approved || 0);
          const now = new Date().toISOString();

          db.prepare(`
            UPDATE tasks
            SET title = ?, project_id = ?, req_id = ?, role = ?, assignee_id = ?, priority = ?, complexity = ?, hours = ?, hours_spent = ?, desc = ?, dev_notes = ?, qa_notes = ?, qa_reviewer = ?, qa_date = ?, qa_approved = ?, updated_at = ?
            WHERE id = ?
          `).run(newTitle, newProj, newReq, newRole, newAssignee, newPriority, newComplexity, newHours, newHoursSpent, newDesc, newDevNotes, newQaNotes, newQaReviewer, newQaDate, newQaApproved, now, taskId);

          const changeItems = [];
          if (newTitle !== existing.title) changeItems.push(`Título alterado para "${newTitle}"`);
          if (newDevNotes !== (existing.dev_notes || '')) changeItems.push('Notas técnicas do desenvolvedor atualizadas');
          if (newQaNotes !== (existing.qa_notes || '')) changeItems.push(`Notas de QA atualizadas (${newQaReviewer || 'QA'})`);
          if (newHoursSpent !== existing.hours_spent) changeItems.push(`Horas apontadas: ${newHoursSpent}h`);
          if (newAssignee !== existing.assignee_id) changeItems.push('Responsável reatribuído');
          if (newPriority !== existing.priority) changeItems.push(`Prioridade: ${newPriority}`);
          if (newComplexity !== (existing.complexity || 'Média')) changeItems.push(`Complexidade: ${newComplexity}`);

          logAudit({
            entityType: 'task',
            entityId: taskId,
            entityTitle: newTitle,
            action: 'UPDATE',
            ...actor,
            details: changeItems.length > 0 ? `Atualizou demanda: ${changeItems.join(', ')}.` : `Atualizou informações da demanda "${newTitle}".`,
            prevState: { title: existing.title, devNotes: existing.dev_notes, qaNotes: existing.qa_notes },
            newState: { title: newTitle, devNotes: newDevNotes, qaNotes: newQaNotes }
          });

          return sendJson(res, 200, {
            success: true,
            id: taskId,
            ...t,
            title: newTitle,
            devNotes: newDevNotes,
            qaNotes: newQaNotes,
            qaReviewer: newQaReviewer,
            qaDate: newQaDate,
            qaApproved: Boolean(newQaApproved),
            hoursSpent: newHoursSpent,
            updatedAt: now
          });
        }
        return sendJson(res, 404, { success: false, message: 'Demanda não encontrada.' });
      }

      if (method === 'DELETE') {
        const existing = db.prepare('SELECT title FROM tasks WHERE id = ?').get(taskId);
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'task',
          entityId: taskId,
          entityTitle: existing ? existing.title : taskId,
          action: 'DELETE',
          ...actor,
          details: `Excluiu demanda #${taskId} - "${existing ? existing.title : taskId}".`,
          prevState: existing
        });

        return sendJson(res, 200, { success: true, id: taskId });
      }
    }

    // 7. CRUD: Equipe de Desenvolvedores
    if (pathname === '/api/team') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullTeamMembers());
      }
      if (method === 'POST') {
        const m = await parseJsonBody(req);
        const cleanName = (m.name || '').trim();
        if (!cleanName) {
          return sendJson(res, 400, { success: false, message: 'Nome do membro é obrigatório.' });
        }

        let parsedSkills = [];
        if (Array.isArray(m.skills)) parsedSkills = m.skills;
        else if (typeof m.skills === 'string') {
          try { parsedSkills = JSON.parse(m.skills); } catch (e) { parsedSkills = m.skills.split(',').map(s => s.trim()).filter(Boolean); }
        }

        const existing = db.prepare('SELECT * FROM team_members WHERE id = ? OR lower(trim(name)) = lower(trim(?))').get(m.id || '', cleanName);

        if (existing) {
          let existingSkills = [];
          try { existingSkills = JSON.parse(existing.skills); } catch (e) { }
          const mergedSkills = parsedSkills.length > 0 ? parsedSkills : existingSkills;
          const updatedRole = m.role || existing.role || 'frontend';
          const updatedSeniority = m.seniority || existing.seniority || 'Pleno';
          const updatedCapacity = parseFloat(m.capacity) || existing.capacity || 40;
          const updatedAvatarBg = m.avatarBg || existing.avatar_bg || (updatedRole === 'frontend' ? '#0284c7' : '#059669');

          db.prepare(`
            UPDATE team_members
            SET name = ?, role = ?, seniority = ?, skills = ?, capacity = ?, avatar_bg = ?
            WHERE id = ?
          `).run(cleanName, updatedRole, updatedSeniority, JSON.stringify(mergedSkills), updatedCapacity, updatedAvatarBg, existing.id);

          const actor = getActorFromReq(req);
          logAudit({
            entityType: 'team_member',
            entityId: existing.id,
            entityTitle: cleanName,
            action: 'UPDATE',
            ...actor,
            details: `Atualizou dados do membro "${cleanName}" (${updatedRole}, ${updatedSeniority}).`
          });

          return sendJson(res, 200, {
            id: existing.id,
            name: cleanName,
            role: updatedRole,
            seniority: updatedSeniority,
            skills: mergedSkills,
            capacity: updatedCapacity,
            avatarBg: updatedAvatarBg
          });
        }

        const id = m.id || 'm_' + Date.now();
        const role = m.role || 'frontend';
        const seniority = m.seniority || 'Pleno';
        const capacity = parseFloat(m.capacity) || 40;
        const avatarBg = m.avatarBg || (role === 'frontend' ? '#0284c7' : '#059669');

        db.prepare(`
          INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, cleanName, role, seniority, JSON.stringify(parsedSkills), capacity, avatarBg);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'team_member',
          entityId: id,
          entityTitle: cleanName,
          action: 'CREATE',
          ...actor,
          details: `Adicionou novo desenvolvedor na equipe: "${cleanName}" (${role}, ${seniority}).`
        });

        return sendJson(res, 201, {
          id,
          name: cleanName,
          role,
          seniority,
          skills: parsedSkills,
          capacity,
          avatarBg
        });
      }
    }

    if (pathname.startsWith('/api/team/')) {
      const memberId = pathname.split('/')[3];
      if (method === 'PUT') {
        const m = await parseJsonBody(req);
        const skillsStr = JSON.stringify(Array.isArray(m.skills) ? m.skills : []);
        db.prepare(`
          UPDATE team_members
          SET name = ?, role = ?, seniority = ?, skills = ?, capacity = ?
          WHERE id = ?
        `).run(m.name || '', m.role || 'backend', m.seniority || 'Pleno', skillsStr || '[]', parseFloat(m.capacity) || 40, memberId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'team_member',
          entityId: memberId,
          entityTitle: m.name,
          action: 'UPDATE',
          ...actor,
          details: `Atualizou informações do membro "${m.name}".`
        });

        return sendJson(res, 200, { id: memberId, ...m });
      }
      if (method === 'DELETE') {
        const existing = db.prepare('SELECT name FROM team_members WHERE id = ?').get(memberId);
        db.prepare('DELETE FROM team_members WHERE id = ?').run(memberId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'team_member',
          entityId: memberId,
          entityTitle: existing ? existing.name : memberId,
          action: 'DELETE',
          ...actor,
          details: `Removeu membro da equipe: "${existing ? existing.name : memberId}".`
        });

        return sendJson(res, 200, { success: true, id: memberId });
      }
    }

    // 8. CRUD: Casos de Testes QA
    if (pathname === '/api/tests') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullTestCases());
      }
      if (method === 'POST') {
        const tc = await parseJsonBody(req);
        const id = tc.id || 'tc_' + Date.now();
        db.prepare(`
          INSERT INTO test_cases (id, title, type, req_id, task_id, status, steps, expected)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, tc.title, tc.type || 'Geral', tc.reqId || null, tc.taskId || null, tc.status || 'pending', tc.steps || '', tc.expected || '');

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'test_case',
          entityId: id,
          entityTitle: tc.title,
          action: 'CREATE',
          ...actor,
          details: `Cadastrou caso de teste QA: "${tc.title}" (${tc.type || 'Geral'}).`
        });

        return sendJson(res, 201, { id, ...tc });
      }
    }

    if (pathname.startsWith('/api/tests/')) {
      const parts = pathname.split('/');
      const testId = parts[3];
      const action = parts[4];

      if (action === 'status' && method === 'PUT') {
        const { status } = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(testId);
        db.prepare('UPDATE test_cases SET status = ? WHERE id = ?').run(status, testId);

        const actor = getActorFromReq(req);
        const statusLabels = { pass: 'Aprovado', fail: 'Reprovado', pending: 'Pendente' };

        logAudit({
          entityType: 'test_case',
          entityId: testId,
          entityTitle: existing ? existing.title : testId,
          action: 'STATUS_CHANGE',
          ...actor,
          details: `Atualizou status do teste "${existing ? existing.title : testId}" para "${statusLabels[status] || status}".`
        });

        return sendJson(res, 200, { success: true, id: testId, status });
      }

      if (method === 'PUT') {
        const tc = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(testId);
        db.prepare(`
          UPDATE test_cases
          SET title = ?, type = ?, req_id = ?, task_id = ?, steps = ?, expected = ?
          WHERE id = ?
        `).run(tc.title || '', tc.type || 'Geral', tc.reqId || null, tc.taskId || null, tc.steps || '', tc.expected || '', testId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'test_case',
          entityId: testId,
          entityTitle: tc.title || (existing ? existing.title : testId),
          action: 'UPDATE',
          ...actor,
          details: `Editou caso de teste QA: "${tc.title}".`
        });

        return sendJson(res, 200, { id: testId, ...tc });
      }

      if (method === 'DELETE') {
        const existing = db.prepare('SELECT title FROM test_cases WHERE id = ?').get(testId);
        db.prepare('DELETE FROM test_cases WHERE id = ?').run(testId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'test_case',
          entityId: testId,
          entityTitle: existing ? existing.title : testId,
          action: 'DELETE',
          ...actor,
          details: `Excluiu caso de teste QA: "${existing ? existing.title : testId}".`
        });

        return sendJson(res, 200, { success: true, id: testId });
      }
    }

    // 9. API de Auditoria & Histórico de Operações (Compliance & Rastreabilidade)
    if (pathname === '/api/audit-logs') {
      if (method === 'GET') {
        const actor = getActorFromReq(req);
        if (!actor || actor.role !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Acesso restrito: apenas o Administrador do Sistema pode consultar a trilha de auditoria.' });
        }
        const entityType = url.searchParams.get('entityType');
        const entityId = url.searchParams.get('entityId');
        const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get('limit')) || 150));

        let query = 'SELECT * FROM audit_logs';
        const params = [];
        const conditions = [];

        if (entityType && entityType !== 'all') {
          conditions.push('entity_type = ?');
          params.push(entityType);
        }
        if (entityId) {
          conditions.push('entity_id = ?');
          params.push(entityId);
        }

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const rows = db.prepare(query).all(...params);
        return sendJson(res, 200, rows.map(r => ({
          id: r.id,
          entityType: r.entity_type,
          entityId: r.entity_id,
          entityTitle: r.entity_title,
          action: r.action,
          actorId: r.actor_id,
          actorName: r.actor_name,
          actorRole: r.actor_role,
          details: r.details,
          previousState: r.previous_state,
          newState: r.new_state,
          createdAt: r.created_at
        })));
      }
    }

    // 10. Gestão de Metas & Métricas de Promoção (Exclusivo Administrador)
    if (pathname === '/api/goals/reset-defaults' && method === 'POST') {
      const actor = getActorFromReq(req);
      if (!actor || actor.role !== 'admin') {
        return sendJson(res, 403, { success: false, message: 'Apenas Administradores podem restaurar metas padrão.' });
      }
      seedDefaultGoals(true);
      logAudit({
        entityType: 'goal',
        entityId: 'all',
        entityTitle: 'Metas Padrão de Promoção',
        action: 'UPDATE',
        ...actor,
        details: 'Restaurou a matriz padrão de metas e métricas de promoção de desenvolvedores.'
      });
      return sendJson(res, 200, getFullGoals());
    }

    if (pathname === '/api/goals') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullGoals());
      }
      if (method === 'POST') {
        const actor = getActorFromReq(req);
        if (!actor || actor.role !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Apenas Administradores podem cadastrar metas de promoção.' });
        }
        const data = await parseJsonBody(req);
        const id = data.id || 'goal_' + Date.now();
        const createdAt = new Date().toISOString();
        const targetValue = parseFloat(data.targetValue) || 0;
        const weight = parseInt(data.weight, 10) || 2;
        const isActive = data.isActive === false || data.isActive === 0 ? 0 : 1;

        db.prepare(`
          INSERT INTO promotion_goals (id, title, description, target_seniority, category, metric_key, target_value, target_unit, weight, is_active, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          data.title || 'Nova Meta',
          data.description || '',
          data.targetSeniority || 'Pleno',
          data.category || 'complexity',
          data.metricKey || 'high_tasks',
          targetValue,
          data.targetUnit || 'demandas',
          weight,
          isActive,
          createdAt
        );

        logAudit({
          entityType: 'goal',
          entityId: id,
          entityTitle: data.title,
          action: 'CREATE',
          ...actor,
          details: `Cadastrou meta de promoção: "${data.title}" para ${data.targetSeniority} (${targetValue} ${data.targetUnit || ''}, Peso ${weight}x).`
        });

        return sendJson(res, 201, {
          id,
          title: data.title,
          description: data.description,
          targetSeniority: data.targetSeniority || 'Pleno',
          category: data.category || 'complexity',
          metricKey: data.metricKey || 'high_tasks',
          targetValue,
          targetUnit: data.targetUnit || 'demandas',
          weight,
          isActive: isActive === 1,
          createdAt
        });
      }
    }

    if (pathname.startsWith('/api/goals/')) {
      const goalId = pathname.split('/')[3];
      if (method === 'PUT') {
        const actor = getActorFromReq(req);
        if (!actor || actor.role !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Apenas Administradores podem editar metas de promoção.' });
        }
        const data = await parseJsonBody(req);
        const existing = db.prepare('SELECT * FROM promotion_goals WHERE id = ?').get(goalId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Meta não encontrada.' });
        }

        const title = data.title !== undefined ? data.title : existing.title;
        const description = data.description !== undefined ? data.description : existing.description;
        const targetSeniority = data.targetSeniority !== undefined ? data.targetSeniority : existing.target_seniority;
        const category = data.category !== undefined ? data.category : existing.category;
        const metricKey = data.metricKey !== undefined ? data.metricKey : existing.metric_key;
        const targetValue = data.targetValue !== undefined ? parseFloat(data.targetValue) : existing.target_value;
        const targetUnit = data.targetUnit !== undefined ? data.targetUnit : existing.target_unit;
        const weight = data.weight !== undefined ? parseInt(data.weight, 10) : existing.weight;
        const isActive = data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active;

        db.prepare(`
          UPDATE promotion_goals
          SET title = ?, description = ?, target_seniority = ?, category = ?, metric_key = ?, target_value = ?, target_unit = ?, weight = ?, is_active = ?
          WHERE id = ?
        `).run(title, description, targetSeniority, category, metricKey, targetValue, targetUnit, weight, isActive, goalId);

        logAudit({
          entityType: 'goal',
          entityId: goalId,
          entityTitle: title,
          action: 'UPDATE',
          ...actor,
          details: `Atualizou meta de promoção: "${title}" (${targetValue} ${targetUnit}, Peso ${weight}x).`
        });

        return sendJson(res, 200, {
          id: goalId,
          title,
          description,
          targetSeniority,
          category,
          metricKey,
          targetValue,
          targetUnit,
          weight,
          isActive: isActive === 1,
          createdAt: existing.created_at
        });
      }

      if (method === 'DELETE') {
        const actor = getActorFromReq(req);
        if (!actor || actor.role !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Apenas Administradores podem excluir metas de promoção.' });
        }
        const existing = db.prepare('SELECT title FROM promotion_goals WHERE id = ?').get(goalId);
        db.prepare('DELETE FROM promotion_goals WHERE id = ?').run(goalId);

        logAudit({
          entityType: 'goal',
          entityId: goalId,
          entityTitle: existing ? existing.title : goalId,
          action: 'DELETE',
          ...actor,
          details: `Excluiu meta de promoção: "${existing ? existing.title : goalId}".`
        });

        return sendJson(res, 200, { success: true, id: goalId });
      }
    }

    // 11. API de Estruturas e Trilhas de Carreira
    if (pathname === '/api/careers') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullCareerTracks());
      }
      if (method === 'POST') {
        const actor = getActorFromReq(req);
        if (!actor || actor.role !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Apenas Administradores do Sistema possuem permissão para cadastrar novas estruturas e tipos de carreira.' });
        }
        const data = await parseJsonBody(req);
        const roleName = (data.roleName || data.name || '').trim();
        const discipline = (data.discipline || data.roleName || 'Engenharia').trim();
        const mission = (data.mission || data.description || '').trim();
        const icon = (data.icon || '🧭').trim();
        const levels = Array.isArray(data.levels) ? data.levels : [];

        if (!roleName) {
          return sendJson(res, 400, { success: false, message: 'O nome da carreira é obrigatório.' });
        }
        if (!mission) {
          return sendJson(res, 400, { success: false, message: 'A descrição/missão da carreira é obrigatória.' });
        }
        if (levels.length === 0) {
          return sendJson(res, 400, { success: false, message: 'Ao menos um nível hierárquico com competências deve ser definido.' });
        }

        // Gera ID / slug limpo
        const rawSlug = (data.id || data.slug || roleName.toLowerCase())
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '');
        const id = rawSlug || ('career_' + Date.now());

        // Processa níveis garantindo chaves e competências
        const processedLevels = levels.map((lvl, idx) => {
          const lvlKey = (lvl.key || lvl.name || `nivel_${idx + 1}`)
            .toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '') || `lvl_${idx + 1}`;

          let hardSkills = [];
          if (Array.isArray(lvl.hardSkills)) hardSkills = lvl.hardSkills;
          else if (typeof lvl.hardSkills === 'string') hardSkills = lvl.hardSkills.split(',').map(s => s.trim()).filter(Boolean);

          let softSkills = [];
          if (Array.isArray(lvl.softSkills)) softSkills = lvl.softSkills;
          else if (typeof lvl.softSkills === 'string') softSkills = lvl.softSkills.split(',').map(s => s.trim()).filter(Boolean);

          let triggers = [];
          if (Array.isArray(lvl.triggers)) triggers = lvl.triggers;
          else if (typeof lvl.triggers === 'string') triggers = lvl.triggers.split('\n').map(s => s.trim()).filter(Boolean);

          return {
            key: lvlKey,
            name: (lvl.name || `Nível ${idx + 1}`).trim(),
            nextLevel: (lvl.nextLevel || (idx < levels.length - 1 ? (levels[idx + 1].name || `Nível ${idx + 2}`) : 'Liderança / Especialista')).trim(),
            tag: (lvl.tag || 'Evolução Profissional').trim(),
            focus: (lvl.focus || lvl.missionDetail || 'Atuação e entregas do nível').trim(),
            missionDetail: (lvl.missionDetail || lvl.focus || '').trim(),
            hardSkills: hardSkills.length > 0 ? hardSkills : ['Competências técnicas do nível'],
            softSkills: softSkills.length > 0 ? softSkills : ['Comunicação', 'Colaboração', 'Proatividade'],
            metrics: lvl.metrics || {
              tasks: '4+ demandas',
              complexity: 'Média ou Alta',
              qaRate: '≥ 80% aprovação em QA',
              hoursVariance: 'Desvio ≤ 25%'
            },
            triggers: triggers.length > 0 ? triggers : ['Entrega consistente de demandas no nível', 'Conformidade com os padrões da squad']
          };
        });

        const now = new Date().toISOString();
        const levelsJson = JSON.stringify(processedLevels);

        const existing = db.prepare('SELECT id FROM career_tracks WHERE id = ?').get(id);
        if (existing) {
          db.prepare(`
            UPDATE career_tracks
            SET role_name = ?, discipline = ?, icon = ?, mission = ?, levels = ?, updated_at = ?
            WHERE id = ?
          `).run(roleName, discipline, icon, mission, levelsJson, now, id);
        } else {
          db.prepare(`
            INSERT INTO career_tracks (id, role_name, discipline, icon, mission, levels, is_custom, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
          `).run(id, roleName, discipline, icon, mission, levelsJson, now, now);
        }

        logAudit({
          entityType: 'career',
          entityId: id,
          entityTitle: roleName,
          action: existing ? 'UPDATE' : 'CREATE',
          ...actor,
          details: `${existing ? 'Atualizou' : 'Cadastrou nova'} estrutura de carreira: "${roleName}" (${processedLevels.length} níveis hierárquicos).`
        });

        const newTrack = {
          id,
          roleName,
          discipline,
          icon,
          mission,
          levels: processedLevels,
          isCustom: true,
          createdAt: now,
          updatedAt: now
        };

        return sendJson(res, 201, { success: true, track: newTrack });
      }
    }

    if (pathname.startsWith('/api/careers/')) {
      const careerId = pathname.split('/')[3];
      if (method === 'DELETE') {
        const actor = getActorFromReq(req);
        if (!actor || actor.role !== 'admin') {
          return sendJson(res, 403, { success: false, message: 'Apenas Administradores podem excluir estruturas de carreira.' });
        }
        const existing = db.prepare('SELECT * FROM career_tracks WHERE id = ?').get(careerId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Trilha de carreira não encontrada.' });
        }
        if (existing.is_custom === 0) {
          return sendJson(res, 400, { success: false, message: 'Trilhas padrão do sistema não podem ser removidas.' });
        }

        db.prepare('DELETE FROM career_tracks WHERE id = ?').run(careerId);

        logAudit({
          entityType: 'career',
          entityId: careerId,
          entityTitle: existing.role_name,
          action: 'DELETE',
          ...actor,
          details: `Excluiu trilha de carreira: "${existing.role_name}".`
        });

        return sendJson(res, 200, { success: true, id: careerId });
      }
    }

    // --------------------------------------------------------------------------
    // ROTAS DE TEMPLATES DE DOCUMENTO & IDENTIDADE VISUAL (/api/templates)
    // --------------------------------------------------------------------------
    if (pathname === '/api/templates/reset-defaults' && method === 'POST') {
      const actor = getActorFromReq(req);
      if (!actor || (actor.role !== 'admin' && actor.role !== 'pm')) {
        return sendJson(res, 403, { success: false, message: 'Apenas Gestores e Administradores podem restaurar templates padrão.' });
      }

      seedDefaultDocumentTemplates(true);
      const updatedList = getFullDocumentTemplates();

      logAudit({
        entityType: 'template',
        entityId: 'all',
        entityTitle: 'Templates de Documento',
        action: 'RESET_DEFAULTS',
        ...actor,
        details: 'Restaurou a coleção original de templates padrão de documentos de requisitos do sistema.'
      });

      return sendJson(res, 200, { success: true, templates: updatedList });
    }

    if (pathname === '/api/templates') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullDocumentTemplates());
      }

      if (method === 'POST') {
        const actor = getActorFromReq(req);
        if (!actor || (actor.role !== 'admin' && actor.role !== 'pm')) {
          return sendJson(res, 403, { success: false, message: 'Apenas Gestores e Administradores podem criar novos templates.' });
        }

        const data = await parseJsonBody(req);
        const name = (data.name || '').trim();
        const docTitle = (data.docTitle || data.doc_title || 'RELATÓRIO DE REQUISITOS').trim();

        if (!name) {
          return sendJson(res, 400, { success: false, message: 'O nome do template é obrigatório.' });
        }

        const id = 'tpl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
        const now = new Date().toISOString();
        const isDefault = Boolean(data.isDefault || data.is_default);

        if (isDefault) {
          db.prepare('UPDATE document_templates SET is_default = 0').run();
        }

        db.prepare(`
          INSERT INTO document_templates (
            id, name, description, is_default, logo_url, doc_title, doc_subtitle,
            header_institution, primary_color, footer_text, approval_terms,
            signee_contratada_title, signee_contratante_title,
            include_user_story, include_acceptance_criteria, include_qa_evidence,
            include_signatures, include_kpis, include_status_banner,
            created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          name,
          (data.description || '').trim(),
          isDefault ? 1 : 0,
          data.logoUrl || data.logo_url || null,
          docTitle,
          (data.docSubtitle || data.doc_subtitle || '').trim(),
          (data.headerInstitution || data.header_institution || '').trim(),
          (data.primaryColor || data.primary_color || '#0284c7').trim(),
          (data.footerText || data.footer_text || '').trim(),
          (data.approvalTerms || data.approval_terms || '').trim(),
          (data.signeeContratadaTitle || data.signee_contratada_title || 'PELA CONTRATADA (SYNCHRO)').trim(),
          (data.signeeContratanteTitle || data.signee_contratante_title || 'PELA CONTRATANTE (CLIENTE)').trim(),
          data.includeUserStory !== false ? 1 : 0,
          data.includeAcceptanceCriteria !== false ? 1 : 0,
          data.includeQaEvidence !== false ? 1 : 0,
          data.includeSignatures !== false ? 1 : 0,
          data.includeKpis !== false ? 1 : 0,
          data.includeStatusBanner !== false ? 1 : 0,
          now,
          now
        );

        const created = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(id);

        logAudit({
          entityType: 'template',
          entityId: id,
          entityTitle: name,
          action: 'CREATE',
          ...actor,
          details: `Criou novo template de documento: "${name}" com cor ${created.primary_color}.`,
          newState: created
        });

        const formatted = {
          id: created.id,
          name: created.name,
          description: created.description || '',
          isDefault: created.is_default === 1,
          logoUrl: created.logo_url || '',
          docTitle: created.doc_title,
          docSubtitle: created.doc_subtitle || '',
          headerInstitution: created.header_institution || '',
          primaryColor: created.primary_color || '#0284c7',
          footerText: created.footer_text || '',
          approvalTerms: created.approval_terms || '',
          signeeContratadaTitle: created.signee_contratada_title,
          signeeContratanteTitle: created.signee_contratante_title,
          includeUserStory: created.include_user_story === 1,
          includeAcceptanceCriteria: created.include_acceptance_criteria === 1,
          includeQaEvidence: created.include_qa_evidence === 1,
          includeSignatures: created.include_signatures === 1,
          includeKpis: created.include_kpis === 1,
          includeStatusBanner: created.include_status_banner === 1,
          createdAt: created.created_at,
          updatedAt: created.updated_at
        };

        return sendJson(res, 201, { success: true, template: formatted });
      }
    }

    if (pathname.startsWith('/api/templates/')) {
      const parts = pathname.split('/');
      const templateId = parts[3];
      const action = parts[4];

      if (action === 'set-default' && method === 'POST') {
        const actor = getActorFromReq(req);
        if (!actor || (actor.role !== 'admin' && actor.role !== 'pm')) {
          return sendJson(res, 403, { success: false, message: 'Apenas Gestores e Administradores podem definir template padrão.' });
        }
        const existing = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(templateId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Template não encontrado.' });
        }

        db.prepare('UPDATE document_templates SET is_default = 0').run();
        db.prepare('UPDATE document_templates SET is_default = 1, updated_at = ? WHERE id = ?').run(new Date().toISOString(), templateId);

        logAudit({
          entityType: 'template',
          entityId: templateId,
          entityTitle: existing.name,
          action: 'SET_DEFAULT',
          ...actor,
          details: `Definiu o template "${existing.name}" como padrão para novas exportações.`
        });

        return sendJson(res, 200, { success: true, id: templateId });
      }

      if (method === 'GET') {
        const row = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(templateId);
        if (!row) {
          return sendJson(res, 404, { success: false, message: 'Template não encontrado.' });
        }
        return sendJson(res, 200, {
          id: row.id,
          name: row.name,
          description: row.description || '',
          isDefault: row.is_default === 1,
          logoUrl: row.logo_url || '',
          docTitle: row.doc_title,
          docSubtitle: row.doc_subtitle || '',
          headerInstitution: row.header_institution || '',
          primaryColor: row.primary_color || '#0284c7',
          footerText: row.footer_text || '',
          approvalTerms: row.approval_terms || '',
          signeeContratadaTitle: row.signee_contratada_title,
          signeeContratanteTitle: row.signee_contratante_title,
          includeUserStory: row.include_user_story === 1,
          includeAcceptanceCriteria: row.include_acceptance_criteria === 1,
          includeQaEvidence: row.include_qa_evidence === 1,
          includeSignatures: row.include_signatures === 1,
          includeKpis: row.include_kpis === 1,
          includeStatusBanner: row.include_status_banner === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
      }

      if (method === 'PUT') {
        const actor = getActorFromReq(req);
        if (!actor || (actor.role !== 'admin' && actor.role !== 'pm')) {
          return sendJson(res, 403, { success: false, message: 'Apenas Gestores e Administradores podem editar templates.' });
        }

        const existing = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(templateId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Template não encontrado.' });
        }

        const data = await parseJsonBody(req);
        const name = (data.name || existing.name).trim();
        const docTitle = (data.docTitle || data.doc_title || existing.doc_title).trim();
        const now = new Date().toISOString();
        const isDefault = typeof data.isDefault !== 'undefined' ? Boolean(data.isDefault) : (existing.is_default === 1);

        if (isDefault) {
          db.prepare('UPDATE document_templates SET is_default = 0 WHERE id != ?').run(templateId);
        }

        const logoUrl = typeof data.logoUrl !== 'undefined' ? (data.logoUrl || null) : existing.logo_url;

        db.prepare(`
          UPDATE document_templates
          SET name = ?, description = ?, is_default = ?, logo_url = ?, doc_title = ?,
              doc_subtitle = ?, header_institution = ?, primary_color = ?, footer_text = ?,
              approval_terms = ?, signee_contratada_title = ?, signee_contratante_title = ?,
              include_user_story = ?, include_acceptance_criteria = ?, include_qa_evidence = ?,
              include_signatures = ?, include_kpis = ?, include_status_banner = ?, updated_at = ?
          WHERE id = ?
        `).run(
          name,
          typeof data.description !== 'undefined' ? (data.description || '').trim() : existing.description,
          isDefault ? 1 : 0,
          logoUrl,
          docTitle,
          typeof data.docSubtitle !== 'undefined' ? (data.docSubtitle || '').trim() : existing.doc_subtitle,
          typeof data.headerInstitution !== 'undefined' ? (data.headerInstitution || '').trim() : existing.header_institution,
          typeof data.primaryColor !== 'undefined' ? (data.primaryColor || '#0284c7').trim() : existing.primary_color,
          typeof data.footerText !== 'undefined' ? (data.footerText || '').trim() : existing.footer_text,
          typeof data.approvalTerms !== 'undefined' ? (data.approvalTerms || '').trim() : existing.approval_terms,
          typeof data.signeeContratadaTitle !== 'undefined' ? (data.signeeContratadaTitle || '').trim() : existing.signee_contratada_title,
          typeof data.signeeContratanteTitle !== 'undefined' ? (data.signeeContratanteTitle || '').trim() : existing.signee_contratante_title,
          typeof data.includeUserStory !== 'undefined' ? (data.includeUserStory ? 1 : 0) : existing.include_user_story,
          typeof data.includeAcceptanceCriteria !== 'undefined' ? (data.includeAcceptanceCriteria ? 1 : 0) : existing.include_acceptance_criteria,
          typeof data.includeQaEvidence !== 'undefined' ? (data.includeQaEvidence ? 1 : 0) : existing.include_qa_evidence,
          typeof data.includeSignatures !== 'undefined' ? (data.includeSignatures ? 1 : 0) : existing.include_signatures,
          typeof data.includeKpis !== 'undefined' ? (data.includeKpis ? 1 : 0) : existing.include_kpis,
          typeof data.includeStatusBanner !== 'undefined' ? (data.includeStatusBanner ? 1 : 0) : existing.include_status_banner,
          now,
          templateId
        );

        const updated = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(templateId);

        logAudit({
          entityType: 'template',
          entityId: templateId,
          entityTitle: name,
          action: 'UPDATE',
          ...actor,
          details: `Atualizou configurações do template: "${name}".`,
          prevState: existing,
          newState: updated
        });

        const formatted = {
          id: updated.id,
          name: updated.name,
          description: updated.description || '',
          isDefault: updated.is_default === 1,
          logoUrl: updated.logo_url || '',
          docTitle: updated.doc_title,
          docSubtitle: updated.doc_subtitle || '',
          headerInstitution: updated.header_institution || '',
          primaryColor: updated.primary_color || '#0284c7',
          footerText: updated.footer_text || '',
          approvalTerms: updated.approval_terms || '',
          signeeContratadaTitle: updated.signee_contratada_title,
          signeeContratanteTitle: updated.signee_contratante_title,
          includeUserStory: updated.include_user_story === 1,
          includeAcceptanceCriteria: updated.include_acceptance_criteria === 1,
          includeQaEvidence: updated.include_qa_evidence === 1,
          includeSignatures: updated.include_signatures === 1,
          includeKpis: updated.include_kpis === 1,
          includeStatusBanner: updated.include_status_banner === 1,
          createdAt: updated.created_at,
          updatedAt: updated.updated_at
        };

        return sendJson(res, 200, { success: true, template: formatted });
      }

      if (method === 'DELETE') {
        const actor = getActorFromReq(req);
        if (!actor || (actor.role !== 'admin' && actor.role !== 'pm')) {
          return sendJson(res, 403, { success: false, message: 'Apenas Gestores e Administradores podem excluir templates.' });
        }

        const totalCount = db.prepare('SELECT count(*) as count FROM document_templates').get().count;
        if (totalCount <= 1) {
          return sendJson(res, 400, { success: false, message: 'Não é possível excluir o único template restante no sistema.' });
        }

        const existing = db.prepare('SELECT * FROM document_templates WHERE id = ?').get(templateId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Template não encontrado.' });
        }

        db.prepare('DELETE FROM document_templates WHERE id = ?').run(templateId);

        // Se deletou o padrão, elege o primeiro restante como padrão
        if (existing.is_default === 1) {
          const firstRemaining = db.prepare('SELECT id FROM document_templates ORDER BY created_at ASC LIMIT 1').get();
          if (firstRemaining) {
            db.prepare('UPDATE document_templates SET is_default = 1 WHERE id = ?').run(firstRemaining.id);
          }
        }

        logAudit({
          entityType: 'template',
          entityId: templateId,
          entityTitle: existing.name,
          action: 'DELETE',
          ...actor,
          details: `Excluiu o template de documento: "${existing.name}".`
        });

        return sendJson(res, 200, { success: true, id: templateId });
      }
    }

    // 11.9. API de Configuração e Teste do Agente de IA CFPS
    if (pathname === '/api/ai/settings') {
      if (method === 'GET') {
        const eff = getEffectiveAiSettings();
        const providers = Object.values(aiAgent.PROVIDER_CATALOG).map(p => ({
          id: p.id,
          label: p.label,
          defaultModel: p.defaultModel,
          suggestedModels: p.suggestedModels,
          defaultBaseUrl: p.defaultBaseUrl,
          requiresApiKey: p.requiresApiKey
        }));
        return sendJson(res, 200, {
          success: true,
          settings: {
            enabled: eff.enabled,
            fallbackEnabled: eff.fallbackEnabled,
            provider: eff.provider,
            providerLabel: eff.providerLabel,
            model: eff.model,
            baseUrl: eff.baseUrl,
            hasApiKey: eff.hasApiKey,
            apiKeyMasked: eff.apiKeyMasked,
            apiKeySource: eff.apiKeySource,
            requiresApiKey: eff.requiresApiKey,
            isReady: eff.isReady
          },
          providers
        });
      }

      if (method === 'PUT') {
        const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para alterar configurações do Agente de IA.' });
        }
        const body = await parseJsonBody(req);
        const eff = saveAiSettings(body);
        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'ai_config',
          entityId: 'ai_cfps_config',
          entityTitle: `Agente CFPS (${eff.providerLabel})`,
          action: 'UPDATE',
          ...actor,
          details: `Atualizou configurações do Agente de IA CFPS: provedor ${eff.providerLabel}, modelo "${eff.model}", status ${eff.enabled ? 'Ativo' : 'Desativado'}.`
        });
        return sendJson(res, 200, {
          success: true,
          settings: {
            enabled: eff.enabled,
            fallbackEnabled: eff.fallbackEnabled,
            provider: eff.provider,
            providerLabel: eff.providerLabel,
            model: eff.model,
            baseUrl: eff.baseUrl,
            hasApiKey: eff.hasApiKey,
            apiKeyMasked: eff.apiKeyMasked,
            apiKeySource: eff.apiKeySource,
            requiresApiKey: eff.requiresApiKey,
            isReady: eff.isReady
          }
        });
      }
    }

    if (pathname === '/api/ai/test' && method === 'POST') {
      const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
      if (callerRole === 'dev' || callerRole === 'qa') {
        return sendJson(res, 403, { success: false, message: 'Permissão negada para testar credenciais de IA.' });
      }
      const body = await parseJsonBody(req);
      const saved = getSavedAiSettings();
      const candidateOverride = {
        ...saved,
        provider: (body.provider || saved.provider || 'gemini').trim().toLowerCase(),
        model: (body.model !== undefined ? body.model : (saved.model || '')).trim(),
        baseUrl: (body.baseUrl !== undefined ? body.baseUrl : (saved.baseUrl || '')).trim(),
        enabled: true
      };
      if (typeof body.apiKey === 'string' && body.apiKey.trim() && !body.apiKey.includes('••••')) {
        candidateOverride.apiKey = body.apiKey.trim();
      }
      const effTest = aiAgent.resolveEffectiveAiConfig(candidateOverride);
      try {
        const testRes = await aiAgent.testAiConnection(effTest);
        return sendJson(res, 200, { success: true, ...testRes });
      } catch (err) {
        return sendJson(res, 400, { success: false, message: err.message, provider: effTest.provider, model: effTest.model });
      }
    }

    // 12.0. API de Geração Automática de APF (Preview e Batch com Motor CFPS + Agente de IA)
    if (pathname === '/api/apf/auto-generate/preview' && method === 'POST') {
      const body = await parseJsonBody(req);
      const { reqId, feature, projectId, countingType, operationType, factor, text, userStory, bdd, specification, engine, forceRefresh } = body;

      let result;
      if (reqId) {
        const reqRow = db.prepare('SELECT * FROM requirements WHERE id = ?').get(reqId);
        if (!reqRow) {
          return sendJson(res, 404, { success: false, message: 'Requisito não encontrado.' });
        }
        result = await analyzeCfpsWithAiOrFallback(reqRow, { countingType, operationType, factor, engine, projectId, forceRefresh });
      } else if (text || userStory || bdd || specification) {
        // Modo Auditoria Direta de História de Usuário / BDD Livre
        result = await analyzeCfpsWithAiOrFallback({
          title: body.title || 'Especificação Sob Demanda',
          userStory: userStory || text || specification,
          bdd: bdd || '',
          text: text || specification || '',
          feature: feature || '',
          projectId: projectId || ''
        }, { countingType, operationType, factor, engine, projectId, forceRefresh });
      } else if (feature) {
        result = await analyzeFeatureWithAiOrFallback(projectId, feature, { countingType, operationType, factor, engine, forceRefresh });
      } else {
        return sendJson(res, 400, { success: false, message: 'Informe reqId, feature ou texto com a história/BDD para análise de APF.' });
      }

      return sendJson(res, 200, {
        success: true,
        sourceType: result.sourceType,
        sourceId: result.sourceId || '',
        sourceCode: result.sourceCode || '',
        sourceTitle: result.sourceTitle || '',
        feature: result.feature || '',
        projectId: result.projectId || '',
        countingType: result.countingType || countingType || 'Desenvolvimento',
        operationType: result.operationType || 'ADD',
        nature: result.nature,
        natureExplanation: result.natureExplanation,
        userRole: result.userRole || '',
        userWant: result.userWant || '',
        userBenefit: result.userBenefit || '',
        detectedFields: result.detectedFields || [],
        candidates: result.candidates,
        inmCandidates: result.inmCandidates || [],
        absorbedInmCandidates: result.absorbedInmCandidates || [],
        auditorNotes: result.auditorNotes || [],
        reportMarkdown: result.reportMarkdown || '',
        aiMeta: result.aiMeta || null,
        summary: result.summary
      });
    }

    if (pathname === '/api/apf/auto-generate/batch' && method === 'POST') {
      const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
      if (callerRole === 'dev' || callerRole === 'qa') {
        return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para cadastrar itens de APF.' });
      }

      const body = await parseJsonBody(req);
      const itemsToCreate = Array.isArray(body.items) ? body.items : [];
      // Trava de Exclusão Mútua (SISP): ignora itens marcados como absorvidos pelo IFPUG
      const inmItemsToCreate = (Array.isArray(body.inmItems) ? body.inmItems : []).filter(inm => !inm.absorbed);

      if (itemsToCreate.length === 0 && inmItemsToCreate.length === 0) {
        return sendJson(res, 400, { success: false, message: 'Nenhuma função de APF ou item não-mensurável informado para cadastro.' });
      }

      const defaultProjectId = body.projectId || null;
      const defaultFeature = body.feature || '';
      const defaultReqId = body.reqId || null;
      const createdItems = [];
      const createdInmItems = [];
      const now = new Date().toISOString();
      const actor = getActorFromReq(req);
      const actorName = (actor && actor.actorName) || 'Sistema';

      let resolvedProjectId = (defaultProjectId || '').trim() || null;
      if (resolvedProjectId) {
        const pExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(resolvedProjectId);
        if (!pExists) resolvedProjectId = null;
      }

      let resolvedReqId = (defaultReqId || '').trim() || null;
      if (resolvedReqId) {
        const rExists = db.prepare('SELECT id FROM requirements WHERE id = ?').get(resolvedReqId);
        if (!rExists) resolvedReqId = null;
      }

      // 1. Gravação das Funções Tradicionais IFPUG (apf_items)
      if (itemsToCreate.length > 0) {
        const insertStmt = db.prepare(`
          INSERT INTO apf_items (id, code, name, project_id, feature, req_id, function_type, category, td, ar_tr, complexity, raw_pf, counting_type, operation_type, factor, final_pf, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const item of itemsToCreate) {
          const functionType = (item.functionType || 'EE').toUpperCase().trim();
          const category = getApfCategory(functionType);
          const td = Math.max(1, parseInt(item.td, 10) || 1);
          const arTr = Math.max(0, parseInt(item.arTr !== undefined ? item.arTr : item.trAr, 10) || 0);
          const complexity = calculateApfComplexity(functionType, arTr, td);
          const rawPf = calculateApfRawPf(functionType, complexity);
          const countingType = item.countingType || body.countingType || 'Desenvolvimento';
          const operationType = resolveApfOperationType(countingType, item.operationType || body.operationType, item.name || '');
          const factor = getCountingTypeFactor(countingType, item.factor !== undefined ? item.factor : body.factor, operationType, functionType);
          const finalPf = calculateApfFinalPf(rawPf, factor);

          const count = db.prepare('SELECT count(*) as count FROM apf_items WHERE function_type = ?').get(functionType).count + 1;
          const code = item.code || `${functionType}-${String(count).padStart(2, '0')}`;
          const id = 'apf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

          let itemProjId = (item.projectId || resolvedProjectId || '').trim() || null;
          if (itemProjId && !db.prepare('SELECT id FROM projects WHERE id = ?').get(itemProjId)) itemProjId = null;

          let itemReqId = (item.reqId || resolvedReqId || '').trim() || null;
          if (itemReqId && !db.prepare('SELECT id FROM requirements WHERE id = ?').get(itemReqId)) itemReqId = null;

          const featureVal = (item.feature || defaultFeature || '').trim();
          const notes = (item.notes || item.rationale || '').trim();

          insertStmt.run(
            id, code, item.name.trim(), itemProjId, featureVal, itemReqId,
            functionType, category, td, arTr, complexity, rawPf, countingType, operationType, factor, finalPf,
            notes, now, now
          );

          createdItems.push({
            id, code, name: item.name.trim(), projectId: itemProjId, feature: featureVal, reqId: itemReqId,
            functionType, category, td, arTr, complexity, rawPf, countingType, operationType, factor, finalPf
          });
        }
      }

      // 2. Gravação de Itens Não-Mensuráveis (apf_inm_items)
      if (inmItemsToCreate.length > 0) {
        const insertInmStmt = db.prepare(`
          INSERT INTO apf_inm_items (
            id, code, project_id, feature, req_id, category, catalog_key,
            item_name, description, quantity, unit_weight, calculated_pf,
            evidence, status, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const inm of inmItemsToCreate) {
          const count = db.prepare('SELECT count(*) as count FROM apf_inm_items').get().count + 1;
          const code = inm.code || `INM-${String(count).padStart(2, '0')}`;
          const id = 'inm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          const catalogKey = (inm.catalogKey || 'custom').trim();
          const category = (inm.category || 'Tabelas de Apoio').trim();
          const quantity = Math.max(0.01, parseFloat(inm.quantity) || 1);
          const unitWeight = Math.max(0, parseFloat(inm.unitWeight !== undefined ? inm.unitWeight : 0.8));
          const calculatedPf = Math.round((quantity * unitWeight) * 100) / 100;
          const evidence = (inm.evidence || inm.justification || '').trim();
          const description = (inm.description || inm.justification || '').trim();

          insertInmStmt.run(
            id, code, resolvedProjectId, defaultFeature, resolvedReqId, category, catalogKey,
            inm.itemName || inm.name, description, quantity, unitWeight, calculatedPf,
            evidence, 'Aprovado', actorName, now, now
          );

          createdInmItems.push({
            id, code, itemName: inm.itemName || inm.name, category, quantity, unitWeight, calculatedPf
          });
        }
      }

      logAudit({
        entityType: 'apf',
        entityId: 'batch_' + Date.now(),
        entityTitle: `Geração CFPS: ${createdItems.length} Funções IFPUG & ${createdInmItems.length} FPN`,
        action: 'CREATE',
        ...actor,
        details: `Registrou ${createdItems.length} funções IFPUG (${createdItems.reduce((acc, c) => acc + c.finalPf, 0).toFixed(1)} PF) e ${createdInmItems.length} itens não-mensuráveis (${createdInmItems.reduce((acc, c) => acc + c.calculatedPf, 0).toFixed(1)} PF) para ${resolvedReqId ? 'Requisito ' + resolvedReqId : (defaultFeature ? 'Feature ' + defaultFeature : 'Projeto')}.`
      });

      return sendJson(res, 201, {
        success: true,
        count: createdItems.length + createdInmItems.length,
        itemsCount: createdItems.length,
        inmCount: createdInmItems.length,
        items: createdItems,
        inmItems: createdInmItems
      });
    }

    // 12. API de Análise de Pontos de Função (APF • IFPUG CPM 4.3.1)
    if (pathname === '/api/apf') {
      if (method === 'GET') {
        const projectId = url.searchParams.get('projectId');
        const feature = url.searchParams.get('feature');
        let items = getFullApfItems();
        if (projectId && projectId !== 'all') {
          items = items.filter(it => it.projectId === projectId);
        }
        if (feature && feature !== 'all') {
          items = items.filter(it => it.feature === feature);
        }
        return sendJson(res, 200, items);
      }

      if (method === 'POST') {
        const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para cadastrar itens de APF.' });
        }

        const body = await parseJsonBody(req);
        if (!body.name || !body.functionType) {
          return sendJson(res, 400, { success: false, message: 'Nome da função e Tipo de Função (EE, SE, CE, ALI, AIE) são obrigatórios.' });
        }

        const id = body.id || 'apf_' + Date.now();
        const functionType = (body.functionType || 'EE').toUpperCase().trim();
        const category = getApfCategory(functionType);
        const td = Math.max(1, parseInt(body.td, 10) || 1);
        const arTrRaw = body.arTr !== undefined ? body.arTr : (body.trAr !== undefined ? body.trAr : (body.ar_tr !== undefined ? body.ar_tr : (body.tr_ar !== undefined ? body.tr_ar : 0)));
        const arTr = Math.max(0, parseInt(arTrRaw, 10) || 0);
        const complexity = calculateApfComplexity(functionType, arTr, td);
        const rawPf = calculateApfRawPf(functionType, complexity);
        const countingType = body.countingType || 'Desenvolvimento';
        const operationType = resolveApfOperationType(countingType, body.operationType, body.name || '');
        const factor = getCountingTypeFactor(countingType, body.factor, operationType, functionType);
        const finalPf = calculateApfFinalPf(rawPf, factor);
        const now = new Date().toISOString();

        let code = (body.code || '').trim();
        if (!code) {
          const count = db.prepare('SELECT count(*) as count FROM apf_items WHERE function_type = ?').get(functionType).count + 1;
          code = `${functionType}-${String(count).padStart(2, '0')}`;
        }

        let resolvedProjectId = (body.projectId || '').trim() || null;
        if (resolvedProjectId) {
          const pExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(resolvedProjectId);
          if (!pExists) resolvedProjectId = null;
        }

        let resolvedReqId = (body.reqId || '').trim() || null;
        if (resolvedReqId) {
          const rExists = db.prepare('SELECT id FROM requirements WHERE id = ?').get(resolvedReqId);
          if (!rExists) resolvedReqId = null;
        }

        db.prepare(`
          INSERT INTO apf_items (id, code, name, project_id, feature, req_id, function_type, category, td, ar_tr, complexity, raw_pf, counting_type, operation_type, factor, final_pf, notes, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, code, body.name.trim(), resolvedProjectId, (body.feature || '').trim(), resolvedReqId,
          functionType, category, td, arTr, complexity, rawPf, countingType, operationType, factor, finalPf,
          body.notes || '', now, now
        );

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'apf',
          entityId: id,
          entityTitle: `${code} - ${body.name.trim()} (${functionType})`,
          action: 'CREATE',
          ...actor,
          details: `Cadastrou função ${functionType} [${code}] (${operationType}): TD=${td}, AR/TR=${arTr} ➔ Complexidade ${complexity}, ${rawPf} PF Bruto, Tipo: ${countingType} (${Math.round(factor * 100)}%), ${finalPf} PF Final.`
        });

        const created = db.prepare(`
          SELECT a.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
          FROM apf_items a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN requirements r ON a.req_id = r.id
          WHERE a.id = ?
        `).get(id);

        return sendJson(res, 201, {
          success: true,
          item: {
            id: created.id,
            code: created.code,
            name: created.name,
            projectId: created.project_id || '',
            projectName: created.project_name || '',
            projectCode: created.project_code || '',
            feature: created.feature || '',
            reqId: created.req_id || '',
            reqCode: created.req_code || '',
            reqTitle: created.req_title || '',
            functionType: created.function_type,
            category: created.category,
            td: created.td,
            arTr: created.ar_tr,
            complexity: created.complexity,
            rawPf: created.raw_pf,
            countingType: created.counting_type,
            operationType: created.operation_type || 'ADD',
            factor: created.factor,
            finalPf: created.final_pf,
            notes: created.notes || '',
            createdAt: created.created_at,
            updatedAt: created.updated_at
          }
        });
      }
    }

    if (pathname.startsWith('/api/apf/') && !pathname.startsWith('/api/apf/auto-generate') && !pathname.startsWith('/api/apf/inm')) {
      const apfId = pathname.slice('/api/apf/'.length);

      if (method === 'PUT') {
        const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para editar itens de APF.' });
        }

        const existing = db.prepare('SELECT * FROM apf_items WHERE id = ?').get(apfId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Item de APF não encontrado.' });
        }

        const body = await parseJsonBody(req);
        const functionType = ((body.functionType !== undefined ? body.functionType : existing.function_type) || 'EE').toUpperCase().trim();
        const category = getApfCategory(functionType);
        const td = Math.max(1, parseInt(body.td !== undefined ? body.td : existing.td, 10) || 1);
        const arTrRaw = body.arTr !== undefined ? body.arTr : (body.trAr !== undefined ? body.trAr : (body.ar_tr !== undefined ? body.ar_tr : (body.tr_ar !== undefined ? body.tr_ar : existing.ar_tr)));
        const arTr = Math.max(0, parseInt(arTrRaw, 10) || 0);
        const complexity = calculateApfComplexity(functionType, arTr, td);
        const rawPf = calculateApfRawPf(functionType, complexity);
        const countingType = body.countingType !== undefined ? body.countingType : existing.counting_type;
        const operationType = resolveApfOperationType(
          countingType,
          body.operationType !== undefined ? body.operationType : existing.operation_type,
          body.name !== undefined ? body.name : existing.name
        );
        const factor = body.factor !== undefined
          ? getCountingTypeFactor(countingType, body.factor, operationType, functionType)
          : (body.countingType !== undefined || body.operationType !== undefined
            ? getCountingTypeFactor(countingType, undefined, operationType, functionType)
            : existing.factor);
        const finalPf = calculateApfFinalPf(rawPf, factor);
        const now = new Date().toISOString();

        const code = body.code !== undefined ? (body.code || '').trim() : existing.code;
        const name = body.name !== undefined ? (body.name || '').trim() : existing.name;
        let resolvedProjectId = body.projectId !== undefined ? ((body.projectId || '').trim() || null) : existing.project_id;
        if (resolvedProjectId) {
          const pExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(resolvedProjectId);
          if (!pExists) resolvedProjectId = null;
        }

        const feature = body.feature !== undefined ? (body.feature || '').trim() : existing.feature;
        let resolvedReqId = body.reqId !== undefined ? ((body.reqId || '').trim() || null) : existing.req_id;
        if (resolvedReqId) {
          const rExists = db.prepare('SELECT id FROM requirements WHERE id = ?').get(resolvedReqId);
          if (!rExists) resolvedReqId = null;
        }

        const notes = body.notes !== undefined ? body.notes : existing.notes;

        db.prepare(`
          UPDATE apf_items
          SET code = ?, name = ?, project_id = ?, feature = ?, req_id = ?,
              function_type = ?, category = ?, td = ?, ar_tr = ?, complexity = ?,
              raw_pf = ?, counting_type = ?, operation_type = ?, factor = ?, final_pf = ?, notes = ?, updated_at = ?
          WHERE id = ?
        `).run(
          code, name, resolvedProjectId, feature, resolvedReqId,
          functionType, category, td, arTr, complexity,
          rawPf, countingType, operationType, factor, finalPf, notes, now,
          apfId
        );

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'apf',
          entityId: apfId,
          entityTitle: `${code} - ${name} (${functionType})`,
          action: 'UPDATE',
          ...actor,
          details: `Atualizou função ${functionType} [${code}] (${operationType}): TD=${td}, AR/TR=${arTr} ➔ Complexidade ${complexity}, ${rawPf} PF Bruto, Tipo: ${countingType} (${Math.round(factor * 100)}%), ${finalPf} PF Final.`
        });

        const updated = db.prepare(`
          SELECT a.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
          FROM apf_items a
          LEFT JOIN projects p ON a.project_id = p.id
          LEFT JOIN requirements r ON a.req_id = r.id
          WHERE a.id = ?
        `).get(apfId);

        return sendJson(res, 200, {
          success: true,
          item: {
            id: updated.id,
            code: updated.code,
            name: updated.name,
            projectId: updated.project_id || '',
            projectName: updated.project_name || '',
            projectCode: updated.project_code || '',
            feature: updated.feature || '',
            reqId: updated.req_id || '',
            reqCode: updated.req_code || '',
            reqTitle: updated.req_title || '',
            functionType: updated.function_type,
            category: updated.category,
            td: updated.td,
            arTr: updated.ar_tr,
            complexity: updated.complexity,
            rawPf: updated.raw_pf,
            countingType: updated.counting_type,
            operationType: updated.operation_type || 'ADD',
            factor: updated.factor,
            finalPf: updated.final_pf,
            notes: updated.notes || '',
            createdAt: updated.created_at,
            updatedAt: updated.updated_at
          }
        });
      }

      if (method === 'DELETE') {
        const callerRole = req.headers['x-user-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para excluir itens de APF.' });
        }

        const existing = db.prepare('SELECT * FROM apf_items WHERE id = ?').get(apfId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Item de APF não encontrado.' });
        }

        db.prepare('DELETE FROM apf_items WHERE id = ?').run(apfId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'apf',
          entityId: apfId,
          entityTitle: `${existing.code} - ${existing.name}`,
          action: 'DELETE',
          ...actor,
          details: `Excluiu função APF ${existing.function_type} [${existing.code}] com ${existing.final_pf} PF.`
        });

        return sendJson(res, 200, { success: true, id: apfId });
      }
    }

    // 13. API de Itens Não-Mensuráveis (FPN • Pontos de Função Não-Mensuráveis)
    if (pathname === '/api/apf/inm/catalog' && method === 'GET') {
      return sendJson(res, 200, DEFAULT_INM_CATALOG);
    }

    if (pathname === '/api/apf/inm') {
      if (method === 'GET') {
        const projectId = url.searchParams.get('projectId');
        const feature = url.searchParams.get('feature');
        const category = url.searchParams.get('category');
        let items = getFullApfInmItems();
        if (projectId && projectId !== 'all') {
          items = items.filter(it => it.projectId === projectId);
        }
        if (feature && feature !== 'all') {
          items = items.filter(it => it.feature === feature);
        }
        if (category && category !== 'all') {
          items = items.filter(it => it.category === category);
        }
        return sendJson(res, 200, items);
      }

      if (method === 'POST') {
        const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para cadastrar itens não-mensuráveis de APF.' });
        }

        const body = await parseJsonBody(req);
        if (!body.itemName) {
          return sendJson(res, 400, { success: false, message: 'O nome do item ou intervenção técnica é obrigatório.' });
        }

        const quantity = Math.max(0.01, parseFloat(body.quantity) || 1);
        const unitWeight = Math.max(0, parseFloat(body.unitWeight !== undefined ? body.unitWeight : 0.8));
        const calculatedPf = Math.round((quantity * unitWeight) * 100) / 100;
        const now = new Date().toISOString();

        let resolvedProjectId = (body.projectId || '').trim() || null;
        if (resolvedProjectId) {
          const pExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(resolvedProjectId);
          if (!pExists) resolvedProjectId = null;
        }

        let resolvedReqId = (body.reqId || '').trim() || null;
        if (resolvedReqId) {
          const rExists = db.prepare('SELECT id FROM requirements WHERE id = ?').get(resolvedReqId);
          if (!rExists) resolvedReqId = null;
        }

        const count = db.prepare('SELECT count(*) as count FROM apf_inm_items').get().count + 1;
        const code = (body.code || '').trim() || `INM-${String(count).padStart(2, '0')}`;
        const id = 'inm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const catalogKey = (body.catalogKey || 'custom').trim();
        const category = (body.category || 'Tabelas de Apoio').trim();
        const featureVal = (body.feature || '').trim();
        const description = (body.description || '').trim();
        const evidence = (body.evidence || '').trim();
        const status = (body.status || 'Aprovado').trim();
        const actor = getActorFromReq(req);

        db.prepare(`
          INSERT INTO apf_inm_items (
            id, code, project_id, feature, req_id, category, catalog_key,
            item_name, description, quantity, unit_weight, calculated_pf,
            evidence, status, created_by, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id, code, resolvedProjectId, featureVal, resolvedReqId, category, catalogKey,
          body.itemName.trim(), description, quantity, unitWeight, calculatedPf,
          evidence, status, (actor && actor.actorName) || 'Sistema', now, now
        );

        const createdItem = db.prepare(`
          SELECT i.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
          FROM apf_inm_items i
          LEFT JOIN projects p ON i.project_id = p.id
          LEFT JOIN requirements r ON i.req_id = r.id
          WHERE i.id = ?
        `).get(id);

        const formattedItem = {
          id: createdItem.id,
          code: createdItem.code,
          projectId: createdItem.project_id || '',
          projectName: createdItem.project_name || '',
          projectCode: createdItem.project_code || '',
          feature: createdItem.feature || '',
          reqId: createdItem.req_id || '',
          reqCode: createdItem.req_code || '',
          reqTitle: createdItem.req_title || '',
          category: createdItem.category,
          catalogKey: createdItem.catalog_key,
          itemName: createdItem.item_name,
          description: createdItem.description || '',
          quantity: createdItem.quantity,
          unitWeight: createdItem.unit_weight,
          calculatedPf: createdItem.calculated_pf,
          evidence: createdItem.evidence || '',
          status: createdItem.status || 'Aprovado',
          createdBy: createdItem.created_by || '',
          createdAt: createdItem.created_at,
          updatedAt: createdItem.updated_at
        };

        logAudit({
          entityType: 'apf_inm',
          entityId: id,
          entityTitle: `${code} - ${formattedItem.itemName}`,
          action: 'CREATE',
          ...actor,
          details: `Cadastrou item não-mensurável [${code}] "${formattedItem.itemName}": ${quantity} un x ${unitWeight} PF = ${calculatedPf} FPN.`
        });

        return sendJson(res, 201, { success: true, item: formattedItem });
      }
    }

    if (pathname.startsWith('/api/apf/inm/')) {
      const inmId = pathname.slice('/api/apf/inm/'.length);

      if (method === 'GET') {
        const item = db.prepare(`
          SELECT i.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
          FROM apf_inm_items i
          LEFT JOIN projects p ON i.project_id = p.id
          LEFT JOIN requirements r ON i.req_id = r.id
          WHERE i.id = ?
        `).get(inmId);

        if (!item) {
          return sendJson(res, 404, { success: false, message: 'Item não-mensurável de APF não encontrado.' });
        }

        return sendJson(res, 200, {
          id: item.id,
          code: item.code,
          projectId: item.project_id || '',
          projectName: item.project_name || '',
          projectCode: item.project_code || '',
          feature: item.feature || '',
          reqId: item.req_id || '',
          reqCode: item.req_code || '',
          reqTitle: item.req_title || '',
          category: item.category,
          catalogKey: item.catalog_key,
          itemName: item.item_name,
          description: item.description || '',
          quantity: item.quantity,
          unitWeight: item.unit_weight,
          calculatedPf: item.calculated_pf,
          evidence: item.evidence || '',
          status: item.status || 'Aprovado',
          createdBy: item.created_by || '',
          createdAt: item.created_at,
          updatedAt: item.updated_at
        });
      }

      if (method === 'PUT') {
        const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para atualizar itens não-mensuráveis de APF.' });
        }

        const existing = db.prepare('SELECT * FROM apf_inm_items WHERE id = ?').get(inmId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Item não-mensurável de APF não encontrado.' });
        }

        const body = await parseJsonBody(req);
        const itemName = (body.itemName !== undefined ? body.itemName : existing.item_name).trim();
        const category = (body.category !== undefined ? body.category : existing.category).trim();
        const catalogKey = (body.catalogKey !== undefined ? body.catalogKey : existing.catalog_key).trim();
        const description = (body.description !== undefined ? body.description : existing.description).trim();
        const featureVal = (body.feature !== undefined ? body.feature : existing.feature).trim();
        const evidence = (body.evidence !== undefined ? body.evidence : existing.evidence).trim();
        const status = (body.status !== undefined ? body.status : existing.status).trim();
        const quantity = Math.max(0.01, parseFloat(body.quantity !== undefined ? body.quantity : existing.quantity) || 1);
        const unitWeight = Math.max(0, parseFloat(body.unitWeight !== undefined ? body.unitWeight : existing.unit_weight));
        const calculatedPf = Math.round((quantity * unitWeight) * 100) / 100;
        const now = new Date().toISOString();

        let resolvedProjectId = body.projectId !== undefined ? (body.projectId || '').trim() || null : existing.project_id;
        if (resolvedProjectId) {
          const pExists = db.prepare('SELECT id FROM projects WHERE id = ?').get(resolvedProjectId);
          if (!pExists) resolvedProjectId = null;
        }

        let resolvedReqId = body.reqId !== undefined ? (body.reqId || '').trim() || null : existing.req_id;
        if (resolvedReqId) {
          const rExists = db.prepare('SELECT id FROM requirements WHERE id = ?').get(resolvedReqId);
          if (!rExists) resolvedReqId = null;
        }

        db.prepare(`
          UPDATE apf_inm_items
          SET item_name = ?, category = ?, catalog_key = ?, description = ?,
              feature = ?, project_id = ?, req_id = ?, quantity = ?,
              unit_weight = ?, calculated_pf = ?, evidence = ?, status = ?,
              updated_at = ?
          WHERE id = ?
        `).run(
          itemName, category, catalogKey, description,
          featureVal, resolvedProjectId, resolvedReqId, quantity,
          unitWeight, calculatedPf, evidence, status,
          now, inmId
        );

        const updatedItem = db.prepare(`
          SELECT i.*, p.name as project_name, p.code as project_code, r.code as req_code, r.title as req_title
          FROM apf_inm_items i
          LEFT JOIN projects p ON i.project_id = p.id
          LEFT JOIN requirements r ON i.req_id = r.id
          WHERE i.id = ?
        `).get(inmId);

        const formattedItem = {
          id: updatedItem.id,
          code: updatedItem.code,
          projectId: updatedItem.project_id || '',
          projectName: updatedItem.project_name || '',
          projectCode: updatedItem.project_code || '',
          feature: updatedItem.feature || '',
          reqId: updatedItem.req_id || '',
          reqCode: updatedItem.req_code || '',
          reqTitle: updatedItem.req_title || '',
          category: updatedItem.category,
          catalogKey: updatedItem.catalog_key,
          itemName: updatedItem.item_name,
          description: updatedItem.description || '',
          quantity: updatedItem.quantity,
          unitWeight: updatedItem.unit_weight,
          calculatedPf: updatedItem.calculated_pf,
          evidence: updatedItem.evidence || '',
          status: updatedItem.status || 'Aprovado',
          createdBy: updatedItem.created_by || '',
          createdAt: updatedItem.created_at,
          updatedAt: updatedItem.updated_at
        };

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'apf_inm',
          entityId: inmId,
          entityTitle: `${existing.code} - ${formattedItem.itemName}`,
          action: 'UPDATE',
          ...actor,
          details: `Atualizou item não-mensurável [${existing.code}] "${formattedItem.itemName}": Qtd ${quantity} x ${unitWeight} PF = ${calculatedPf} FPN.`
        });

        return sendJson(res, 200, { success: true, item: formattedItem });
      }

      if (method === 'DELETE') {
        const callerRole = req.headers['x-user-role'] || req.headers['x-role'];
        if (callerRole === 'dev' || callerRole === 'qa') {
          return sendJson(res, 403, { success: false, message: 'Usuários Dev e QA não possuem permissão para excluir itens não-mensuráveis de APF.' });
        }

        const existing = db.prepare('SELECT * FROM apf_inm_items WHERE id = ?').get(inmId);
        if (!existing) {
          return sendJson(res, 404, { success: false, message: 'Item não-mensurável de APF não encontrado.' });
        }

        db.prepare('DELETE FROM apf_inm_items WHERE id = ?').run(inmId);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'apf_inm',
          entityId: inmId,
          entityTitle: `${existing.code} - ${existing.item_name}`,
          action: 'DELETE',
          ...actor,
          details: `Excluiu item não-mensurável [${existing.code}] "${existing.item_name}" com ${existing.calculated_pf} FPN.`
        });

        return sendJson(res, 200, { success: true, id: inmId });
      }
    }

    // --------------------------------------------------------------------------
    // SERVIDOR DE ARQUIVOS ESTÁTICOS (Frontend Synchro PRO)
    // --------------------------------------------------------------------------
    const normalizedPath = pathname === '/' ? '/index.html' : pathname;
    const isProtectedAsset = normalizedPath.includes('/.')
      || /\.(db|db-wal|db-shm|env|sh)$/i.test(normalizedPath)
      || /^\/(?:server\.js|ai-cfps-agent\.js|package(?:-lock)?\.json|dockerfile|docker-compose\.yml)$/i.test(normalizedPath);

    let filePath = isProtectedAsset
      ? path.join(__dirname, 'index.html')
      : path.join(__dirname, normalizedPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(__dirname, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon'
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);

  } catch (err) {
    console.error('❌ Erro no processamento da requisição:', err);
    sendJson(res, 500, { error: 'Internal Server Error', message: err.message });
  }
});

// Inicialização do Servidor na Porta e Host Definidos (0.0.0.0 escuta em todas as interfaces de rede local)
server.listen(PORT, HOST, () => {
  const os = require('node:os');
  const nets = os.networkInterfaces();
  const lanIps = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        lanIps.push({ iface: name, ip: net.address });
      }
    }
  }

  console.log(`==================================================`);
  console.log(`🌐 Servidor Synchro PRO rodando com sucesso!`);
  console.log(`🔗 Acesso Local:        http://localhost:${PORT}`);
  console.log(`🔗 Acesso Loopback:     http://127.0.0.1:${PORT}`);
  if (lanIps.length > 0) {
    lanIps.forEach(item => {
      console.log(`📡 Acesso na Rede (${item.iface}): http://${item.ip}:${PORT}`);
    });
  }
  console.log(`⚡ API REST:            http://localhost:${PORT}/api/health`);
  console.log(`==================================================`);
});
