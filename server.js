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
`);

// Migrações seguras de colunas em bases já existentes
try { db.exec("ALTER TABLE tasks ADD COLUMN complexity TEXT DEFAULT 'Média'"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN dev_notes TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN created_at TEXT"); } catch (e) {}
try { db.exec("ALTER TABLE tasks ADD COLUMN updated_at TEXT"); } catch (e) {}

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

function seedDatabaseIfEmpty() {
  const usersCount = db.prepare('SELECT count(*) as count FROM users').get().count;
  if (usersCount === 0) {
    console.log('🌱 Criando conta raiz de Administrador no SQLite...');
    const insertUser = db.prepare(`
      INSERT INTO users (id, name, email, password, role, dev_role, seniority, skills, avatar_bg, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const defaultUsers = [
      { id: "u_admin", name: "Carlos Valois (Admin)", email: "admin@devsquad.com", password: "admin123", role: "admin", dev_role: null, seniority: "Workspace Owner / Diretor", skills: JSON.stringify(["Arquitetura", "Governança", "DevOps", "Segurança", "Go"]), avatar_bg: "#f59e0b", created_at: "2026-01-01T00:00:00.000Z" }
    ];

    defaultUsers.forEach(u => {
      insertUser.run(u.id, u.name, u.email, u.password, u.role, u.dev_role, u.seniority, u.skills, u.avatar_bg, u.created_at);
    });
  }

  seedDefaultGoals(false);

  console.log('✅ Banco de dados SQLite verificado e pronto para operações!');
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
            try { s = JSON.parse(m.skills); } catch(e) {}
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
          } catch(e) {}
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
    } catch(e) {
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
  const members = db.prepare('SELECT * FROM team_members').all();
  const seen = new Set();
  const unique = [];

  for (const m of members) {
    const key = (m.name || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let skills = [];
    try { skills = JSON.parse(m.skills); } catch(e) {}
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
  const users = db.prepare('SELECT * FROM users').all();
  const seen = new Set();
  const unique = [];

  for (const u of users) {
    const key = (u.email || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let skills = [];
    try { skills = JSON.parse(u.skills); } catch(e) {}
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
        database: 'SQLite (devsquad.db)',
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
        try { parsedSkills = JSON.parse(data.skills); } catch(e) { parsedSkills = data.skills.split(',').map(s=>s.trim()).filter(Boolean); }
      }
      const skillsStr = JSON.stringify(parsedSkills);
      const createdAt = new Date().toISOString();
      const randomBg = data.avatarBg || '#6366f1';

      db.prepare(`
        INSERT INTO users (id, name, email, password, role, dev_role, seniority, skills, avatar_bg, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, name, email, data.password, data.role || 'dev', data.devRole || null, data.seniority || 'Pleno', skillsStr, randomBg, createdAt);

      // Se for perfil desenvolvedor, sincroniza na equipe sem criar duplicidade
      if (data.role === 'dev') {
        const memberExists = db.prepare('SELECT id, skills, role, seniority FROM team_members WHERE lower(trim(name)) = lower(trim(?))').get(name);
        if (memberExists) {
          let existingSkills = [];
          try { existingSkills = JSON.parse(memberExists.skills); } catch(e) {}
          const mergedSkills = parsedSkills.length > 0 ? parsedSkills : existingSkills;
          db.prepare(`
            UPDATE team_members
            SET role = ?, seniority = ?, skills = ?, avatar_bg = ?
            WHERE id = ?
          `).run(data.devRole || memberExists.role || 'frontend', data.seniority || memberExists.seniority || 'Pleno', JSON.stringify(mergedSkills), randomBg, memberExists.id);
        } else {
          db.prepare(`
            INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
            VALUES (?, ?, ?, ?, ?, 40, ?)
          `).run('m_' + Date.now(), name, data.devRole || 'frontend', data.seniority || 'Pleno', skillsStr, randomBg);
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
      const newDevRole = (callerRole === 'admin' && typeof data.devRole !== 'undefined') ? (newRole === 'dev' ? data.devRole : null) : user.dev_role;
      const newSeniority = data.seniority || user.seniority;
      const skillsStr = JSON.stringify(Array.isArray(data.skills) ? data.skills : (typeof data.skills === 'string' ? data.skills.split(',').map(s=>s.trim()).filter(Boolean) : []));
      const newAvatarBg = data.avatarBg || user.avatar_bg;
      const newPassword = (data.password && data.password.trim()) ? data.password.trim() : user.password;

      db.prepare(`
        UPDATE users
        SET name = ?, role = ?, dev_role = ?, seniority = ?, skills = ?, avatar_bg = ?, password = ?
        WHERE id = ?
      `).run(newName, newRole, newDevRole, newSeniority, skillsStr, newAvatarBg, newPassword, targetUserId);

      // Sincroniza também na tabela de equipe se for dev
      if (newRole === 'dev') {
        const teamMember = db.prepare('SELECT id FROM team_members WHERE id = ? OR lower(name) = lower(?)').get(targetUserId, user.name);
        if (teamMember) {
          db.prepare(`
            UPDATE team_members
            SET name = ?, role = ?, seniority = ?, skills = ?, avatar_bg = ?
            WHERE id = ?
          `).run(newName, newDevRole || 'frontend', newSeniority, skillsStr, newAvatarBg, teamMember.id);
        } else {
          db.prepare(`
            INSERT INTO team_members (id, name, role, seniority, skills, capacity, avatar_bg)
            VALUES (?, ?, ?, ?, ?, 40, ?)
          `).run('m_' + Date.now(), newName, newDevRole || 'frontend', newSeniority, skillsStr, newAvatarBg);
        }
      }

      let parsedSkills = [];
      try { parsedSkills = JSON.parse(skillsStr); } catch(e) {}

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
        db.prepare(`
          INSERT INTO projects (id, code, name, desc, color, status, deadline, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, p.code || 'PROJ', p.name, p.desc || '', p.color || '#3b82f6', p.status || 'Ativo', p.deadline || '', now);

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
        db.prepare(`
          UPDATE projects
          SET name = ?, code = ?, desc = ?, color = ?, status = ?, deadline = ?
          WHERE id = ?
        `).run(p.name || '', p.code || '', p.desc || '', p.color || '#3b82f6', p.status || 'Ativo', p.deadline || '', projId);

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
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO requirements (id, code, title, project_id, type, moscow, user_story, bdd, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, r.code || 'RF', r.title, r.projectId || null, r.type || 'functional', r.moscow || 'Must', r.userStory || '', r.bdd || '', now);

        const actor = getActorFromReq(req);
        logAudit({
          entityType: 'requirement',
          entityId: id,
          entityTitle: r.title,
          action: 'CREATE',
          ...actor,
          details: `Especificou novo requisito: [${r.code || 'RF'}] "${r.title}".`,
          newState: r
        });

        return sendJson(res, 201, { id, ...r });
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
        db.prepare(`
          UPDATE requirements
          SET code = ?, title = ?, project_id = ?, type = ?, moscow = ?, user_story = ?, bdd = ?
          WHERE id = ?
        `).run(r.code || 'RF', r.title || '', r.projectId || null, r.type || 'functional', r.moscow || 'Must', r.userStory || '', r.bdd || '', reqId);

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
          try { parsedSkills = JSON.parse(m.skills); } catch(e) { parsedSkills = m.skills.split(',').map(s=>s.trim()).filter(Boolean); }
        }

        const existing = db.prepare('SELECT * FROM team_members WHERE id = ? OR lower(trim(name)) = lower(trim(?))').get(m.id || '', cleanName);

        if (existing) {
          let existingSkills = [];
          try { existingSkills = JSON.parse(existing.skills); } catch(e) {}
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
        `).run(m.name, m.role, m.seniority, skillsStr, parseFloat(m.capacity) || 40, memberId);

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
          SET title = ?, type = ?, req_id = ?, steps = ?, expected = ?
          WHERE id = ?
        `).run(tc.title || '', tc.type || 'Geral', tc.reqId || null, tc.steps || '', tc.expected || '', testId);

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
