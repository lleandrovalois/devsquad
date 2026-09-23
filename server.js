/**
 * ==============================================================================
 * DevSquad PRO - Servidor Backend REST API & Banco Relacional SQLite
 * Arquitetura Cliente-Servidor com persistência transacional em devsquad.db
 * ==============================================================================
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3001;
const DB_PATH = path.join(__dirname, 'devsquad.db');

console.log('--------------------------------------------------');
console.log('🚀 Inicializando DevSquad PRO Backend Server...');
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
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS requirements (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    title TEXT NOT NULL,
    project_id TEXT,
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
`);

// ==============================================================================
// 2. Migração Inicial de Dados (Seed Data em PT-BR)
// ==============================================================================
function seedDatabaseIfEmpty() {
  const usersCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (usersCount === 0) {
    console.log('🌱 Populando contas padrão de usuários no SQLite...');
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password, role, dev_role, seniority, skills, avatar_bg, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultUsers = [
      { id: "u_admin", name: "Carlos Valois (Admin)", email: "admin@devsquad.com", password: "admin123", role: "admin", dev_role: null, seniority: "Workspace Owner / Diretor", skills: JSON.stringify(["Arquitetura", "Governança", "DevOps", "Segurança", "Go"]), avatar_bg: "#f59e0b", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "u_gestor", name: "Fernanda Lima", email: "gestor@devsquad.com", password: "pm123", role: "pm", dev_role: null, seniority: "Gerente de Projetos (PM / Scrum Master)", skills: JSON.stringify(["Scrum", "Kanban", "Gestão de Escopo", "Métricas Ágeis", "Planejamento"]), avatar_bg: "#8b5cf6", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "u_carlos", name: "Carlos Valois", email: "carlos@devsquad.com", password: "dev123", role: "dev", dev_role: "backend", seniority: "Líder Técnico Back-end", skills: JSON.stringify(["Go", "Node.js", "Redis", "Kafka", "PostgreSQL"]), avatar_bg: "#059669", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "u_lucas", name: "Lucas Mendes", email: "lucas@devsquad.com", password: "dev123", role: "dev", dev_role: "frontend", seniority: "Desenvolvedor Front-end Sênior", skills: JSON.stringify(["React", "TypeScript", "Next.js", "TailwindCSS", "Jest"]), avatar_bg: "#0284c7", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "u_qa", name: "Juliana Paiva", email: "qa@devsquad.com", password: "qa123", role: "qa", dev_role: null, seniority: "QA Lead / Homologadora", skills: JSON.stringify(["Testes Automatizados", "Cypress", "Postman", "BDD", "Jest"]), avatar_bg: "#ec4899", created_at: "2026-01-01T00:00:00.000Z" }
    ];

    defaultUsers.forEach(u => {
      insertUser.run(u.id, u.name, u.email, u.password, u.role, u.dev_role, u.seniority, u.skills, u.avatar_bg, u.created_at);
    });
  }

  const projectsCount = db.prepare('SELECT count(*) as count FROM projects').get().count;
  if (projectsCount === 0) {
    console.log('🌱 Populando projetos, equipe, requisitos e demandas de exemplo...');
    
    // Projetos
    const insertProj = db.prepare('INSERT INTO projects (id, code, name, desc, color, status, deadline, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertProj.run("p1", "ECOMM", "SuperApp E-Commerce", "Plataforma integrada de vendas e pagamentos omnichannel para web e mobile.", "#3b82f6", "Ativo", "2026-12-15", "2026-01-01T00:00:00.000Z");
    insertProj.run("p2", "APIGW", "API Gateway & Microsserviços", "Camada de roteamento de alto desempenho, autenticação centralizada e controle de taxa de requisições.", "#10b981", "Ativo", "2026-11-30", "2026-01-01T00:00:00.000Z");
    insertProj.run("p3", "ANALYTICS", "Portal de Relatórios & Analytics", "Painel gerencial com indicadores estratégicos em tempo real e exportações personalizadas.", "#8b5cf6", "Em Planejamento", "2027-01-20", "2026-01-01T00:00:00.000Z");

    // Equipe
    const insertMember = db.prepare('INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg) VALUES (?, ?, ?, ?, ?, ?, ?)');
    insertMember.run("m1", "Carlos Valois", "backend", "Líder Técnico", JSON.stringify(["Go", "Node.js", "Redis", "Kafka", "PostgreSQL"]), 40, "#059669");
    insertMember.run("m2", "Rodrigo Silva", "backend", "Sênior", JSON.stringify(["Python", "FastAPI", "Docker", "AWS", "SQLAlchemy"]), 40, "#047857");
    insertMember.run("m3", "Mariana Costa", "backend", "Pleno", JSON.stringify(["Java", "Spring Boot", "RabbitMQ", "MongoDB"]), 40, "#0f766e");
    insertMember.run("m4", "Lucas Mendes", "frontend", "Sênior", JSON.stringify(["React", "TypeScript", "Next.js", "TailwindCSS", "Jest"]), 40, "#0284c7");
    insertMember.run("m5", "Beatriz Rocha", "frontend", "Pleno", JSON.stringify(["Vue 3", "Vite", "Pinia", "CSS Moderno", "Cypress"]), 40, "#0369a1");
    insertMember.run("m6", "Gabriel Souza", "frontend", "Júnior", JSON.stringify(["HTML5", "CSS3", "JavaScript", "React", "Figma"]), 40, "#0e7490");

    // Requisitos
    const insertReq = db.prepare('INSERT INTO requirements (id, code, title, project_id, type, moscow, user_story, bdd, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    insertReq.run("req1", "RF-01", "Autenticação Segura com Segundo Fator (2FA)", "p1", "functional", "Must", "Como cliente do e-commerce, quero poder fazer login com e-mail/senha e código de segundo fator (2FA), para manter meus dados e pagamentos protegidos contra acessos indevidos.", "Dado que o cliente insere credenciais válidas e o código OTP de 6 dígitos\nQuando clica no botão de confirmação\nEntão o sistema autentica com sucesso, emite o token JWT com validade de 24 horas e redireciona para a área logada", "2026-01-01T00:00:00.000Z");
    insertReq.run("req2", "RF-02", "Checkout Transparente com Pagamento Pix Instantâneo", "p1", "functional", "Must", "Como comprador, quero pagar minhas compras via Pix através de QR Code dinâmico com confirmação automática, para que meu pedido seja aprovado imediatamente.", "Dado que o comprador seleciona a opção de pagamento Pix na finalização do pedido\nQuando confirma o pedido\nEntão o sistema gera o QR Code dinâmico e a chave copia-e-cola com expiração de 15 minutos e ouvinte de webhook ativo", "2026-01-01T00:00:00.000Z");
    insertReq.run("req3", "RNF-01", "Latência de Resposta do Gateway Inferior a 80ms no P99", "p2", "non-functional", "Must", "Como arquiteto de software, quero que o Gateway processe as requisições com sobrecarga mínima, para assegurar alta performance aos microsserviços.", "Dado que o Gateway recebe 5.000 requisições simultâneas por segundo\nQuando valida o cabeçalho de autenticação e repassa ao serviço de destino\nEntão o tempo de trânsito adicionado pelo Gateway não ultrapassa 80ms no percentil 99", "2026-01-01T00:00:00.000Z");
    insertReq.run("req4", "RF-03", "Controle de Taxa de Requisições (Rate Limiting) por Cliente", "p2", "functional", "Should", "Como engenheiro de segurança, quero limitar o volume de chamadas por cliente, para proteger a infraestrutura contra abusos e ataques de negação de serviço.", "Dado que um cliente atingiu o limite de 100 requisições em 60 segundos\nQuando tenta efetuar uma nova requisição\nEntão o Gateway bloqueia a chamada retornando HTTP 429 Demasiadas Requisições com cabeçalho de tempo para nova tentativa", "2026-01-01T00:00:00.000Z");
    insertReq.run("req5", "RF-04", "Exportação de Relatórios Gerenciais em PDF e Planilha Excel", "p3", "functional", "Should", "Como gestor de operações, quero exportar relatórios consolidados em PDF e planilhas em Excel, para compartilhar os resultados mensais com a diretoria.", "Dado que o gestor aplicou filtros de período e departamento no relatório\nQuando clica em 'Exportar Planilha Excel'\nEntão o sistema processa a consulta de forma assíncrona e disponibiliza o download do arquivo .xlsx formatado em menos de 5 segundos", "2026-01-01T00:00:00.000Z");
    insertReq.run("req6", "RNF-02", "Conformidade Total de Acessibilidade Web (WCAG 2.1 Nível AA)", "p3", "non-functional", "Could", "Como usuário que utiliza leitores de tela ou navegação apenas por teclado, quero navegar pelos relatórios e gráficos sem obstáculos visuais ou motores.", "Dado que um usuário navega pelo painel usando apenas a tecla Tab e leitor de tela\nQuando interage com tabelas, filtros e gráficos\nEntão todos os controles possuem rótulos descritivos, contraste de cores superior a 4.5:1 e indicador visual de foco nítido", "2026-01-01T00:00:00.000Z");

    // Demandas (Tarefas)
    const insertTask = db.prepare(`
      INSERT INTO tasks (id, title, project_id, req_id, role, assignee_id, priority, hours, hours_spent, status, desc, impediment, qa_approved, qa_notes, qa_reviewer, qa_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertTask.run("t1", "Endpoint de Autenticação JWT e Validação de OTP 2FA", "p1", "req1", "backend", "m2", "Alta", 16, 0, "dev", "Desenvolver endpoints seguros em FastAPI com hash de senha Argon2 e emissão de JWT assimétrico.", null, 0, null, null, null);
    insertTask.run("t2", "Tela de Login Responsiva com Diálogo de Verificação 2FA", "p1", "req1", "frontend", "m4", "Alta", 14, 0, "dev", "Implementar formulário de login com React/Next.js, validação com Zod e modal com 6 campos automáticos para código OTP.", null, 0, null, null, null);
    insertTask.run("t3", "Serviço de Cobrança Pix e Webhook de Confirmação Bancária", "p1", "req2", "backend", "m3", "Alta", 18, 0, "qa", "Integrar API bancária para emissão de Pix dinâmico e listener de webhook com validação HMAC de assinatura.", null, 0, null, null, null);
    insertTask.run("t4", "Componente de QR Code Pix com Contador e Copiar Chave", "p1", "req2", "frontend", "m5", "Média", 10, 0, "done", "Criar componente Vue com renderização de SVG de QR Code, botão de cópia com aviso visual e cronômetro de 15 minutos.", null, 1, "Homologado em produção", "Juliana Paiva", "2026-01-10T10:00:00.000Z");
    insertTask.run("t5", "Middleware de Rate Limiting com Algoritmo Token Bucket em Redis", "p2", "req4", "backend", "m1", "Alta", 24, 0, "dev", "Implementar middleware de gateway em Go com conexão ao Redis Cluster para controle de requisições por API Key.", null, 0, null, null, null);
    insertTask.run("t6", "Painel de Configuração de Políticas de Tráfego e Limites", "p2", "req4", "frontend", "m6", "Média", 16, 0, "spec", "Construir tela de gerenciamento de cotas de APIs com formulários dinâmicos e validação em tempo real.", null, 0, null, null, null);
    insertTask.run("t7", "Pipeline de Benchmark e Testes de Carga com k6", "p2", "req3", "backend", "m1", "Média", 16, 0, "backlog", "Criar suíte de testes de estresse em k6 e painéis no Grafana para auditar métricas de latência P95 e P99.", null, 0, null, null, null);
    insertTask.run("t8", "Processador Assíncrono para Geração de Planilhas e Relatórios PDF", "p3", "req5", "backend", "m2", "Média", 14, 0, "backlog", "Estruturar fila em RabbitMQ com processador em segundo plano para compilação de dados e upload para bucket com URL assinada.", null, 0, null, null, null);
    insertTask.run("t9", "Tabela Interativa de Indicadores com Filtros e Exportação", "p3", "req5", "frontend", "m4", "Alta", 18, 0, "qa", "Criar tabela de alta densidade com paginação, ordenação multidimensional e gatilho para download de relatórios.", null, 0, null, null, null);
    insertTask.run("t10", "Auditoria e Ajustes de Acessibilidade (ARIA & Teclado)", "p3", "req6", "frontend", "m5", "Baixa", 12, 0, "dev", "Revisar estrutura de tags semânticas, navegação por teclado e compatibilidade com leitores de tela.", null, 0, null, null, null);

    // Casos de Testes QA
    const insertTest = db.prepare('INSERT INTO test_cases (id, title, type, req_id, task_id, status, steps, expected) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    insertTest.run("tc1", "Validação de Geração e Assinatura de Token JWT", "API de Back-end", "req1", "t1", "pass", "1. Enviar requisição POST /auth/login com credenciais corretas\n2. Inspecionar o token JWT retornado no payload\n3. Validar a assinatura com a chave pública", "Código HTTP 200 com token JWT válido, claims corretas e expiração em 24h");
    insertTest.run("tc2", "Tentativa de Autenticação com Código 2FA Expirado", "Segurança", "req1", "t1", "pass", "1. Gerar OTP de 2FA\n2. Aguardar 300 segundos para expiração\n3. Submeter formulário com código expirado", "Sistema rejeita com HTTP 401 e mensagem 'Código de verificação expirado'");
    insertTest.run("tc3", "Simulação de Resposta do Webhook Pix com Assinatura Inválida", "Integração", "req2", "t3", "fail", "1. Disparar payload simulado de confirmação de pagamento Pix\n2. Fornecer assinatura HMAC corrompida no cabeçalho", "O endpoint deve rejeitar com HTTP 403 e registrar tentativa suspeita no log de segurança");
    insertTest.run("tc4", "Teste de Carga de Rate Limiting com k6 (120 req/min)", "Performance", "req4", "t5", "pass", "1. Configurar cliente com cota de 100 req/min\n2. Executar k6 com 120 requisições sequenciais", "As primeiras 100 requisições retornam HTTP 200; as 20 excedentes recebem HTTP 429");
  }

  console.log('✅ Banco de dados SQLite verificado e pronto para operações!');
}

seedDatabaseIfEmpty();

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
      hours: t.hours,
      hoursSpent: t.hours_spent,
      status: t.status,
      desc: t.desc,
      impediment: t.impediment,
      qaApproved: Boolean(t.qa_approved),
      qaNotes: t.qa_notes,
      qaReviewer: t.qa_reviewer,
      qaDate: t.qa_date,
      timesheet: taskTs
    };
  });
}

function getFullRequirements() {
  return db.prepare('SELECT * FROM requirements').all().map(r => ({
    id: r.id,
    code: r.code,
    title: r.title,
    projectId: r.project_id,
    type: r.type,
    moscow: r.moscow,
    userStory: r.user_story,
    bdd: r.bdd
  }));
}

function getFullTeamMembers() {
  return db.prepare('SELECT * FROM team_members').all().map(m => {
    let skills = [];
    try { skills = JSON.parse(m.skills); } catch(e) {}
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      seniority: m.seniority,
      skills: Array.isArray(skills) ? skills : [],
      capacity: m.capacity,
      avatarBg: m.avatar_bg
    };
  });
}

function getFullProjects() {
  return db.prepare('SELECT * FROM projects').all().map(p => ({
    id: p.id,
    code: p.code,
    name: p.name,
    desc: p.desc,
    color: p.color,
    status: p.status,
    deadline: p.deadline
  }));
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
  return db.prepare('SELECT * FROM users').all().map(u => {
    let skills = [];
    try { skills = JSON.parse(u.skills); } catch(e) {}
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      password: u.password,
      role: u.role,
      devRole: u.dev_role,
      seniority: u.seniority,
      skills: Array.isArray(skills) ? skills : [],
      avatarBg: u.avatar_bg,
      createdAt: u.created_at
    };
  });
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
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
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
        database: 'SQLite (devsquad.db)',
        engine: 'node:sqlite (ACID)',
        timestamp: new Date().toISOString()
      });
    }

    // 2. Bootstrap Consolidado (Carga Rápida de Todo o Estado)
    if (method === 'GET' && pathname === '/api/bootstrap') {
      return sendJson(res, 200, {
        projects: getFullProjects(),
        requirements: getFullRequirements(),
        teamMembers: getFullTeamMembers(),
        tasks: getFullTasks(),
        testCases: getFullTestCases(),
        users: getFullUsers()
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
      try { skills = JSON.parse(user.skills); } catch(e) {}
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

      return sendJson(res, 200, { success: true, user: safeUser });
    }

    if (method === 'POST' && pathname === '/api/auth/register') {
      const data = await parseJsonBody(req);
      const email = data.email?.trim().toLowerCase();
      if (!data.name || !email || !data.password) {
        return sendJson(res, 400, { success: false, message: 'Dados cadastrais incompletos.' });
      }

      const existing = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(email);
      if (existing) {
        return sendJson(res, 409, { success: false, message: 'Já existe um usuário cadastrado com este e-mail.' });
      }

      const newId = 'u_' + Date.now();
      const skillsStr = JSON.stringify(Array.isArray(data.skills) ? data.skills : []);
      const createdAt = new Date().toISOString();
      const randomBg = data.avatarBg || '#6366f1';

      db.prepare(`
        INSERT INTO users (id, name, email, password, role, dev_role, seniority, skills, avatar_bg, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, data.name, email, data.password, data.role || 'dev', data.devRole || null, data.seniority || 'Pleno', skillsStr, randomBg, createdAt);

      // Se for perfil desenvolvedor, sincroniza na equipe
      if (data.role === 'dev') {
        const memberExists = db.prepare('SELECT id FROM team_members WHERE lower(name) = lower(?)').get(data.name);
        if (!memberExists) {
          db.prepare(`
            INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
            VALUES (?, ?, ?, ?, ?, 40, ?)
          `).run('m_' + Date.now(), data.name, data.devRole || 'frontend', data.seniority || 'Pleno', skillsStr, randomBg);
        }
      }

      const safeUser = {
        id: newId,
        name: data.name,
        email: email,
        role: data.role || 'dev',
        devRole: data.devRole || null,
        seniority: data.seniority || 'Pleno',
        skills: Array.isArray(data.skills) ? data.skills : [],
        avatarBg: randomBg,
        createdAt: createdAt
      };

      return sendJson(res, 201, { success: true, user: safeUser });
    }

    if (method === 'GET' && pathname === '/api/users') {
      return sendJson(res, 200, getFullUsers());
    }

    // 4. CRUD: Projetos
    if (pathname === '/api/projects') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullProjects());
      }
      if (method === 'POST') {
        const p = await parseJsonBody(req);
        const id = p.id || 'p_' + Date.now();
        db.prepare(`
          INSERT INTO projects (id, code, name, desc, color, status, deadline, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, p.code || 'PROJ', p.name, p.desc || '', p.color || '#3b82f6', p.status || 'Ativo', p.deadline || '', new Date().toISOString());
        return sendJson(res, 201, { id, ...p });
      }
    }

    if (pathname.startsWith('/api/projects/')) {
      const projId = pathname.split('/')[3];
      if (method === 'PUT') {
        const p = await parseJsonBody(req);
        db.prepare(`
          UPDATE projects
          SET name = ?, code = ?, desc = ?, color = ?, status = ?, deadline = ?
          WHERE id = ?
        `).run(p.name, p.code, p.desc, p.color, p.status, p.deadline, projId);
        return sendJson(res, 200, { id: projId, ...p });
      }
      if (method === 'DELETE') {
        db.prepare('DELETE FROM projects WHERE id = ?').run(projId);
        return sendJson(res, 200, { success: true, id: projId });
      }
    }

    // 5. CRUD: Requisitos
    if (pathname === '/api/requirements') {
      if (method === 'GET') {
        return sendJson(res, 200, getFullRequirements());
      }
      if (method === 'POST') {
        const r = await parseJsonBody(req);
        const id = r.id || 'req_' + Date.now();
        db.prepare(`
          INSERT INTO requirements (id, code, title, project_id, type, moscow, user_story, bdd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, r.code || 'RF', r.title, r.projectId || null, r.type || 'functional', r.moscow || 'Must', r.userStory || '', r.bdd || '', new Date().toISOString());
        return sendJson(res, 201, { id, ...r });
      }
    }

    if (pathname.startsWith('/api/requirements/')) {
      const reqId = pathname.split('/')[3];
      if (method === 'PUT') {
        const r = await parseJsonBody(req);
        db.prepare(`
          UPDATE requirements
          SET code = ?, title = ?, project_id = ?, type = ?, moscow = ?, user_story = ?, bdd = ?
          WHERE id = ?
        `).run(r.code, r.title, r.projectId || null, r.type, r.moscow, r.userStory, r.bdd, reqId);
        return sendJson(res, 200, { id: reqId, ...r });
      }
      if (method === 'DELETE') {
        db.prepare('DELETE FROM requirements WHERE id = ?').run(reqId);
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
        db.prepare(`
          INSERT INTO tasks (id, title, project_id, req_id, role, assignee_id, priority, hours, hours_spent, status, desc, impediment, qa_approved)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, null, 0)
        `).run(id, t.title, t.projectId || null, t.reqId || null, t.role || 'backend', t.assigneeId || null, t.priority || 'Média', parseFloat(t.hours) || 8, t.status || 'backlog', t.desc || '');
        return sendJson(res, 201, { id, ...t });
      }
    }

    if (pathname.startsWith('/api/tasks/')) {
      const parts = pathname.split('/');
      const taskId = parts[3];
      const action = parts[4];

      // Mover status do Kanban
      if (action === 'move' && method === 'PUT') {
        const { status } = await parseJsonBody(req);
        db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run(status, taskId);
        return sendJson(res, 200, { success: true, id: taskId, status });
      }

      // Apontamento de Horas (Timesheet)
      if (action === 'timesheet' && method === 'POST') {
        const { hours, date, notes, impediment, author } = await parseJsonBody(req);
        const h = parseFloat(hours) || 0;
        const tsId = 'ts_' + Date.now();
        const now = new Date().toISOString();

        db.prepare(`
          INSERT INTO task_timesheet (id, task_id, hours, date, notes, impediment, author, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tsId, taskId, h, date || now.split('T')[0], notes || '', impediment || null, author || 'Dev', now);

        // Atualiza horas acumuladas da demanda
        db.prepare(`
          UPDATE tasks
          SET hours_spent = hours_spent + ?,
              impediment = CASE WHEN ? != '' THEN ? ELSE impediment END
          WHERE id = ?
        `).run(h, impediment || '', impediment || null, taskId);

        return sendJson(res, 200, { success: true, tsId });
      }

      // Validação Formal de QA
      if (action === 'qa-validate' && method === 'POST') {
        const { decision, notes, reviewer } = await parseJsonBody(req);
        const now = new Date().toISOString();
        if (decision === 'approve') {
          db.prepare(`
            UPDATE tasks
            SET status = 'done', qa_approved = 1, qa_notes = ?, qa_reviewer = ?, qa_date = ?, impediment = null
            WHERE id = ?
          `).run(notes || 'Aprovado por QA', reviewer || 'QA Lead', now, taskId);
        } else {
          db.prepare(`
            UPDATE tasks
            SET status = 'dev', qa_approved = 0, qa_notes = ?, qa_reviewer = ?, qa_date = ?, impediment = ?
            WHERE id = ?
          `).run(notes || 'Bloqueio QA', reviewer || 'QA Lead', now, `Bloqueio QA: ${notes || 'Critérios não cumpridos'}`, taskId);
        }
        return sendJson(res, 200, { success: true, decision });
      }

      if (method === 'PUT') {
        const t = await parseJsonBody(req);
        db.prepare(`
          UPDATE tasks
          SET title = ?, project_id = ?, req_id = ?, role = ?, assignee_id = ?, priority = ?, hours = ?, desc = ?
          WHERE id = ?
        `).run(t.title, t.projectId || null, t.reqId || null, t.role, t.assigneeId || null, t.priority, parseFloat(t.hours) || 8, t.desc, taskId);
        return sendJson(res, 200, { id: taskId, ...t });
      }

      if (method === 'DELETE') {
        db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
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
        const id = m.id || 'm_' + Date.now();
        const skillsStr = JSON.stringify(Array.isArray(m.skills) ? m.skills : []);
        db.prepare(`
          INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(id, m.name, m.role || 'frontend', m.seniority || 'Pleno', skillsStr, parseFloat(m.capacity) || 40, m.avatarBg || '#0284c7');
        return sendJson(res, 201, { id, ...m });
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
        `).run(m.name, m.role, m.seniority, skillsStr, parseFloat(m.capacity) || 40, memberId);
        return sendJson(res, 200, { id: memberId, ...m });
      }
      if (method === 'DELETE') {
        db.prepare('DELETE FROM team_members WHERE id = ?').run(memberId);
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
        return sendJson(res, 201, { id, ...tc });
      }
    }

    if (pathname.startsWith('/api/tests/')) {
      const parts = pathname.split('/');
      const testId = parts[3];
      const action = parts[4];

      if (action === 'status' && method === 'PUT') {
        const { status } = await parseJsonBody(req);
        db.prepare('UPDATE test_cases SET status = ? WHERE id = ?').run(status, testId);
        return sendJson(res, 200, { success: true, id: testId, status });
      }

      if (method === 'PUT') {
        const tc = await parseJsonBody(req);
        db.prepare(`
          UPDATE test_cases
          SET title = ?, type = ?, req_id = ?, steps = ?, expected = ?
          WHERE id = ?
        `).run(tc.title, tc.type, tc.reqId || null, tc.steps, tc.expected, testId);
        return sendJson(res, 200, { id: testId, ...tc });
      }

      if (method === 'DELETE') {
        db.prepare('DELETE FROM test_cases WHERE id = ?').run(testId);
        return sendJson(res, 200, { success: true, id: testId });
      }
    }

    // --------------------------------------------------------------------------
    // SERVIDOR DE ARQUIVOS ESTÁTICOS (Frontend DevSquad PRO)
    // --------------------------------------------------------------------------
    let filePath = path.join(__dirname, pathname === '/' ? 'index.html' : pathname);
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

// Inicialização do Servidor na Porta Definida (Dual Stack IPv4 + IPv6)
server.listen(PORT, () => {
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
  console.log(`🌐 Servidor DevSquad PRO rodando com sucesso!`);
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
