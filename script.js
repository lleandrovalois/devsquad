/**
 * ==============================================================================
 * DevSquad - Plataforma de Gestão de Requisitos, Equipe, Demandas e Testes
 * CRUD COMPLETO para:
 * 1. Projetos
 * 2. Quadro de Demandas (Tarefas)
 * 3. Equipe de Desenvolvedores
 * 4. Requisitos & Especificações (Specs)
 * 5. Qualidade & Casos de Teste (QA)
 * ==============================================================================
 */

const STORAGE_KEY = 'devsquad_pro_state_v3';

// Dados Iniciais Ricos de Exemplo (Seed Data em PT-BR)
const initialSeedData = {
  projects: [
    {
      id: "p1",
      code: "ECOMM",
      name: "SuperApp E-Commerce",
      desc: "Plataforma integrada de vendas e pagamentos omnichannel para web e mobile.",
      color: "#3b82f6",
      status: "Ativo",
      deadline: "2026-12-15"
    },
    {
      id: "p2",
      code: "APIGW",
      name: "API Gateway & Microsserviços",
      desc: "Camada de roteamento de alto desempenho, autenticação centralizada e controle de taxa de requisições.",
      color: "#10b981",
      status: "Ativo",
      deadline: "2026-11-30"
    },
    {
      id: "p3",
      code: "ANALYTICS",
      name: "Portal de Relatórios & Analytics",
      desc: "Painel gerencial com indicadores estratégicos em tempo real e exportações personalizadas.",
      color: "#8b5cf6",
      status: "Em Planejamento",
      deadline: "2027-01-20"
    }
  ],
  teamMembers: [
    // Desenvolvedores Back-end
    { id: "m1", name: "Carlos Valois", role: "backend", seniority: "Líder Técnico", skills: ["Go", "Node.js", "Redis", "Kafka", "PostgreSQL"], capacity: 40, avatarBg: "#059669" },
    { id: "m2", name: "Rodrigo Silva", role: "backend", seniority: "Sênior", skills: ["Python", "FastAPI", "Docker", "AWS", "SQLAlchemy"], capacity: 40, avatarBg: "#047857" },
    { id: "m3", name: "Mariana Costa", role: "backend", seniority: "Pleno", skills: ["Java", "Spring Boot", "RabbitMQ", "MongoDB"], capacity: 40, avatarBg: "#0f766e" },
    // Desenvolvedores Front-end
    { id: "m4", name: "Lucas Mendes", role: "frontend", seniority: "Sênior", skills: ["React", "TypeScript", "Next.js", "TailwindCSS", "Jest"], capacity: 40, avatarBg: "#0284c7" },
    { id: "m5", name: "Beatriz Rocha", role: "frontend", seniority: "Pleno", skills: ["Vue 3", "Vite", "Pinia", "CSS Moderno", "Cypress"], capacity: 40, avatarBg: "#0369a1" },
    { id: "m6", name: "Gabriel Souza", role: "frontend", seniority: "Júnior", skills: ["HTML5", "CSS3", "JavaScript", "React", "Figma"], capacity: 40, avatarBg: "#0e7490" }
  ],
  requirements: [
    {
      id: "req1",
      code: "RF-01",
      title: "Autenticação Segura com Segundo Fator (2FA)",
      projectId: "p1",
      type: "functional",
      moscow: "Must",
      userStory: "Como cliente do e-commerce, quero poder fazer login com e-mail/senha e código de segundo fator (2FA), para manter meus dados e pagamentos protegidos contra acessos indevidos.",
      bdd: "Dado que o cliente insere credenciais válidas e o código OTP de 6 dígitos\nQuando clica no botão de confirmação\nEntão o sistema autentica com sucesso, emite o token JWT com validade de 24 horas e redireciona para a área logada"
    },
    {
      id: "req2",
      code: "RF-02",
      title: "Checkout Transparente com Pagamento Pix Instantâneo",
      projectId: "p1",
      type: "functional",
      moscow: "Must",
      userStory: "Como comprador, quero pagar minhas compras via Pix através de QR Code dinâmico com confirmação automática, para que meu pedido seja aprovado imediatamente.",
      bdd: "Dado que o comprador seleciona a opção de pagamento Pix na finalização do pedido\nQuando confirma o pedido\nEntão o sistema gera o QR Code dinâmico e a chave copia-e-cola com expiração de 15 minutos e ouvinte de webhook ativo"
    },
    {
      id: "req3",
      code: "RNF-01",
      title: "Latência de Resposta do Gateway Inferior a 80ms no P99",
      projectId: "p2",
      type: "non-functional",
      moscow: "Must",
      userStory: "Como arquiteto de software, quero que o Gateway processe as requisições com sobrecarga mínima, para assegurar alta performance aos microsserviços.",
      bdd: "Dado que o Gateway recebe 5.000 requisições simultâneas por segundo\nQuando valida o cabeçalho de autenticação e repassa ao serviço de destino\nEntão o tempo de trânsito adicionado pelo Gateway não ultrapassa 80ms no percentil 99"
    },
    {
      id: "req4",
      code: "RF-03",
      title: "Controle de Taxa de Requisições (Rate Limiting) por Cliente",
      projectId: "p2",
      type: "functional",
      moscow: "Should",
      userStory: "Como engenheiro de segurança, quero limitar o volume de chamadas por cliente, para proteger a infraestrutura contra abusos e ataques de negação de serviço.",
      bdd: "Dado que um cliente atingiu o limite de 100 requisições em 60 segundos\nQuando tenta efetuar uma nova requisição\nEntão o Gateway bloqueia a chamada retornando HTTP 429 Demasiadas Requisições com cabeçalho de tempo para nova tentativa"
    },
    {
      id: "req5",
      code: "RF-04",
      title: "Exportação de Relatórios Gerenciais em PDF e Planilha Excel",
      projectId: "p3",
      type: "functional",
      moscow: "Should",
      userStory: "Como gestor de operações, quero exportar relatórios consolidados em PDF e planilhas em Excel, para compartilhar os resultados mensais com a diretoria.",
      bdd: "Dado que o gestor aplicou filtros de período e departamento no relatório\nQuando clica em 'Exportar Planilha Excel'\nEntão o sistema processa a consulta de forma assíncrona e disponibiliza o download do arquivo .xlsx formatado em menos de 5 segundos"
    },
    {
      id: "req6",
      code: "RNF-02",
      title: "Conformidade Total de Acessibilidade Web (WCAG 2.1 Nível AA)",
      projectId: "p3",
      type: "non-functional",
      moscow: "Could",
      userStory: "Como usuário que utiliza leitores de tela ou navegação apenas por teclado, quero navegar pelos relatórios e gráficos sem obstáculos visuais ou motores.",
      bdd: "Dado que um usuário navega pelo painel usando apenas a tecla Tab e leitor de tela\nQuando interage com tabelas, filtros e gráficos\nEntão todos os controles possuem rótulos descritivos, contraste de cores superior a 4.5:1 e indicador visual de foco nítido"
    }
  ],
  tasks: [
    {
      id: "t1",
      title: "Endpoint de Autenticação JWT e Validação de OTP 2FA",
      projectId: "p1",
      reqId: "req1",
      role: "backend",
      assigneeId: "m2",
      priority: "Alta",
      hours: 16,
      status: "dev",
      desc: "Desenvolver endpoints seguros em FastAPI com hash de senha Argon2 e emissão de JWT assimétrico."
    },
    {
      id: "t2",
      title: "Tela de Login Responsiva com Diálogo de Verificação 2FA",
      projectId: "p1",
      reqId: "req1",
      role: "frontend",
      assigneeId: "m4",
      priority: "Alta",
      hours: 14,
      status: "dev",
      desc: "Implementar formulário de login com React/Next.js, validação com Zod e modal com 6 campos automáticos para código OTP."
    },
    {
      id: "t3",
      title: "Serviço de Cobrança Pix e Webhook de Confirmação Bancária",
      projectId: "p1",
      reqId: "req2",
      role: "backend",
      assigneeId: "m3",
      priority: "Alta",
      hours: 18,
      status: "qa",
      desc: "Integrar API bancária para emissão de Pix dinâmico e listener de webhook com validação HMAC de assinatura."
    },
    {
      id: "t4",
      title: "Componente de QR Code Pix com Contador e Copiar Chave",
      projectId: "p1",
      reqId: "req2",
      role: "frontend",
      assigneeId: "m5",
      priority: "Média",
      hours: 10,
      status: "done",
      desc: "Criar componente Vue com renderização de SVG de QR Code, botão de cópia com aviso visual e cronômetro de 15 minutos."
    },
    {
      id: "t5",
      title: "Middleware de Rate Limiting com Algoritmo Token Bucket em Redis",
      projectId: "p2",
      reqId: "req4",
      role: "backend",
      assigneeId: "m1",
      priority: "Alta",
      hours: 24,
      status: "dev",
      desc: "Implementar middleware de gateway em Go com conexão ao Redis Cluster para controle de requisições por API Key."
    },
    {
      id: "t6",
      title: "Painel de Configuração de Políticas de Tráfego e Limites",
      projectId: "p2",
      reqId: "req4",
      role: "frontend",
      assigneeId: "m6",
      priority: "Média",
      hours: 16,
      status: "spec",
      desc: "Construir tela de gerenciamento de cotas de APIs com formulários dinâmicos e validação em tempo real."
    },
    {
      id: "t7",
      title: "Pipeline de Benchmark e Testes de Carga com k6",
      projectId: "p2",
      reqId: "req3",
      role: "backend",
      assigneeId: "m1",
      priority: "Média",
      hours: 16,
      status: "backlog",
      desc: "Criar suíte de testes de estresse em k6 e painéis no Grafana para auditar métricas de latência P95 e P99."
    },
    {
      id: "t8",
      title: "Processador Assíncrono para Geração de Planilhas e Relatórios PDF",
      projectId: "p3",
      reqId: "req5",
      role: "backend",
      assigneeId: "m2",
      priority: "Média",
      hours: 14,
      status: "backlog",
      desc: "Estruturar fila em RabbitMQ com processador em segundo plano para compilação de dados e upload para bucket com URL assinada."
    },
    {
      id: "t9",
      title: "Tabela Interativa de Indicadores com Filtros e Exportação",
      projectId: "p3",
      reqId: "req5",
      role: "frontend",
      assigneeId: "m4",
      priority: "Alta",
      hours: 18,
      status: "qa",
      desc: "Criar tabela de alta densidade com paginação, ordenação multidimensional e gatilho para download de relatórios."
    },
    {
      id: "t10",
      title: "Auditoria e Ajustes de Acessibilidade (ARIA & Teclado)",
      projectId: "p3",
      reqId: "req6",
      role: "frontend",
      assigneeId: "m5",
      priority: "Baixa",
      hours: 12,
      status: "dev",
      desc: "Revisar estrutura de tags semânticas, navegação por teclado e compatibilidade com leitores de tela."
    }
  ],
  testCases: [
    {
      id: "tc1",
      title: "Validação de Geração e Assinatura de Token JWT",
      type: "API de Back-end",
      reqId: "req1",
      taskId: "t1",
      status: "pass",
      steps: "1. Enviar requisição POST /auth/login com credenciais corretas\n2. Inspecionar o token JWT retornado no payload\n3. Validar a assinatura com a chave pública",
      expected: "Código HTTP 200 com token JWT válido, claims corretas e expiração em 24h"
    },
    {
      id: "tc2",
      title: "Bloqueio Temporário após 5 Tentativas Inválidas de Login",
      type: "API de Back-end",
      reqId: "req1",
      taskId: "t1",
      status: "pass",
      steps: "1. Disparar 5 requisições consecutivas com senhas erradas\n2. Realizar a 6ª tentativa de login",
      expected: "Código HTTP 423 Bloqueado com mensagem de suspensão temporária por 15 minutos"
    },
    {
      id: "tc3",
      title: "Preenchimento Automático dos 6 Dígitos de OTP no Front-end",
      type: "Interface de Front-end",
      reqId: "req1",
      taskId: "t2",
      status: "pass",
      steps: "1. Acessar o modal de confirmação 2FA\n2. Colar o código '123456' no primeiro campo\n3. Verificar se todos os campos são preenchidos e o formulário submetido",
      expected: "Distribuição instantânea dos 6 dígitos nos campos e foco automático no botão de confirmação"
    },
    {
      id: "tc4",
      title: "Recebimento e Processamento Idempotente de Webhook Pix",
      type: "Integração",
      reqId: "req2",
      taskId: "t3",
      status: "pending",
      steps: "1. Simular notificação de Pix pago com assinatura HMAC\n2. Enviar a mesma notificação duas vezes seguidas",
      expected: "A primeira requisição marca o pedido como PAGO; a segunda requisição identifica duplicidade e responde com sucesso sem creditar novamente"
    },
    {
      id: "tc5",
      title: "Renderização do QR Code e Ação de Copiar Código Pix",
      type: "Interface de Front-end",
      reqId: "req2",
      taskId: "t4",
      status: "pass",
      steps: "1. Navegar até a tela de finalização de pagamento\n2. Clicar no botão 'Copiar Chave Pix'",
      expected: "Chave copiada para a área de transferência e exibição do aviso 'Código copiado com sucesso!'"
    },
    {
      id: "tc6",
      title: "Disparo de HTTP 429 quando Limite de Requisições for Ultrapassado",
      type: "API de Back-end",
      reqId: "req4",
      taskId: "t5",
      status: "pass",
      steps: "1. Enviar 101 requisições em 60 segundos com a mesma chave de API",
      expected: "A 101ª requisição retorna HTTP 429 Demasiadas Requisições com cabeçalho Retry-After"
    },
    {
      id: "tc7",
      title: "Download e Validação de Estrutura da Planilha Excel Exportada",
      type: "Homologação / Aceite",
      reqId: "req5",
      taskId: "t9",
      status: "pending",
      steps: "1. Aplicar filtros na tabela de relatórios\n2. Clicar no botão 'Exportar para Excel'\n3. Abrir o arquivo gerado",
      expected: "Arquivo .xlsx válido com formatação monetária correta, cabeçalhos de colunas e dados consistentes"
    },
    {
      id: "tc8",
      title: "Auditoria Automatizada de Contraste e Foco de Acessibilidade",
      type: "Interface de Front-end",
      reqId: "req6",
      taskId: "t10",
      status: "fail",
      steps: "1. Executar auditoria de acessibilidade axe-core na página de relatórios",
      expected: "Nenhuma violação de contraste encontrada e todos os botões com foco visível no teclado"
    }
  ]
};

// ==============================================================================
// 1.0 Camada de Conexão com a API REST Backend & Banco Relacional SQLite
// ==============================================================================
class DevSquadAPI {
  constructor() {
    this.baseUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:')
      ? ''
      : 'http://localhost:3001';
    this.isOnline = false;
  }

  async checkHealth() {
    try {
      const res = await fetch(`${this.baseUrl}/api/health`, { method: 'GET' });
      if (res.ok) {
        this.isOnline = true;
        this.updatePillUI(true);
        return true;
      }
    } catch (e) {
      this.isOnline = false;
    }
    this.updatePillUI(false);
    return false;
  }

  updatePillUI(online) {
    const pill = document.getElementById('db-status-pill');
    const text = document.getElementById('db-status-text');
    if (pill && text) {
      if (online) {
        pill.className = 'db-status-pill online';
        text.textContent = '🟢 SQLite (devsquad.db)';
        pill.title = 'Conectado ao Banco Relacional SQLite Local (:3001)';
      } else {
        pill.className = 'db-status-pill offline';
        text.textContent = '🟡 Cache Local';
        pill.title = 'Servidor local offline - operando com cache do navegador (LocalStorage)';
      }
    }
  }

  async fetchBootstrap() {
    try {
      const res = await fetch(`${this.baseUrl}/api/bootstrap`);
      if (res.ok) {
        this.isOnline = true;
        this.updatePillUI(true);
        return await res.json();
      }
    } catch (e) {
      this.isOnline = false;
      this.updatePillUI(false);
    }
    return null;
  }

  async apiRequest(endpoint, method = 'GET', body = null) {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (typeof authStore !== 'undefined') {
        const u = authStore.getCurrentUser();
        if (u) {
          headers['x-user-id'] = u.id;
          headers['x-user-role'] = u.role;
        }
      }
      const options = {
        method,
        headers
      };
      if (body) options.body = JSON.stringify(body);
      const res = await fetch(`${this.baseUrl}${endpoint}`, options);
      if (res.ok) {
        this.isOnline = true;
        this.updatePillUI(true);
        return await res.json();
      }
    } catch (e) {
      this.isOnline = false;
      this.updatePillUI(false);
    }
    return null;
  }
}

const api = new DevSquadAPI();
window.api = api;

// ==============================================================================
// 1. Gerenciador de Estado Reativo (Store)
// ==============================================================================
class ALMStore {
  constructor() {
    this.state = this.loadState();
    this.activeView = 'dashboard';
    this.selectedProject = 'all';
    this.searchQuery = '';
    this.projectStatusFilter = 'all';
    this.reqTypeFilter = 'all';
    this.reqMoscowFilter = 'all';
    this.kanbanRoleFilter = 'all';
    this.kanbanPriorityFilter = 'all';
    this.teamRoleFilter = 'all';
    this.testTypeFilter = 'all';
    this.kanbanScopeFilter = 'all';
  }

  loadState() {
    let state = null;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        state = JSON.parse(stored);
      }
    } catch (e) {
      console.warn("Falha ao carregar estado do localStorage, usando dados padrão:", e);
    }
    if (!state) state = JSON.parse(JSON.stringify(initialSeedData));

    // Deduplicação defensiva de membros ao carregar estado local
    if (Array.isArray(state.teamMembers)) {
      const seen = new Set();
      state.teamMembers = state.teamMembers.filter(m => {
        const key = (m.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    return state;
  }

  saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (e) {
      console.error("Falha ao salvar estado no localStorage:", e);
    }
  }

  async syncWithBackend() {
    const data = await api.fetchBootstrap();
    if (data) {
      if (Array.isArray(data.projects)) this.state.projects = data.projects;
      if (Array.isArray(data.requirements)) this.state.requirements = data.requirements;
      if (Array.isArray(data.teamMembers)) {
        const seen = new Set();
        this.state.teamMembers = data.teamMembers.filter(m => {
          const key = (m.name || '').trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      if (Array.isArray(data.tasks)) this.state.tasks = data.tasks;
      if (Array.isArray(data.testCases)) this.state.testCases = data.testCases;
      this.saveState();

      if (Array.isArray(data.users) && typeof authStore !== 'undefined') {
        const seenEmails = new Set();
        const uniqueUsers = data.users.filter(u => {
          const key = (u.email || '').trim().toLowerCase();
          if (!key || seenEmails.has(key)) return false;
          seenEmails.add(key);
          return true;
        });
        authStore.saveUsers(uniqueUsers);
      }
      refreshAllUI();
    }
  }

  // --- CRUD: PROJETOS ---
  getProjects() {
    let list = this.state.projects;
    if (this.projectStatusFilter !== 'all') {
      list = list.filter(p => p.status === this.projectStatusFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q) || (p.code && p.code.toLowerCase().includes(q)) || p.desc.toLowerCase().includes(q));
    }
    return list;
  }

  getProjectById(id) {
    return this.state.projects.find(p => p.id === id);
  }

  addProject(data) {
    const newProject = {
      id: "p" + Date.now(),
      code: (data.code || "PRJ").toUpperCase(),
      name: data.name,
      desc: data.desc || "",
      color: data.color || "#3b82f6",
      status: data.status || "Ativo",
      deadline: data.deadline || ""
    };
    this.state.projects.push(newProject);
    this.saveState();
    api.apiRequest('/api/projects', 'POST', newProject);
    return newProject;
  }

  updateProject(id, data) {
    const project = this.getProjectById(id);
    if (project) {
      project.name = data.name;
      project.code = (data.code || project.code).toUpperCase();
      project.desc = data.desc;
      project.color = data.color;
      project.status = data.status;
      project.deadline = data.deadline;
      this.saveState();
      api.apiRequest(`/api/projects/${id}`, 'PUT', data);
      return true;
    }
    return false;
  }

  deleteProject(id) {
    const index = this.state.projects.findIndex(p => p.id === id);
    if (index !== -1) {
      this.state.projects.splice(index, 1);
      if (this.selectedProject === id) {
        this.selectedProject = 'all';
      }
      this.saveState();
      api.apiRequest(`/api/projects/${id}`, 'DELETE');
      return true;
    }
    return false;
  }

  // --- CRUD: EQUIPE DE DESENVOLVEDORES ---
  getTeamMembers() {
    let list = this.state.teamMembers;
    // Deduplica membros por nome normalizado para nunca exibir cartões duplicados
    const seenNames = new Set();
    const unique = [];
    for (const m of list) {
      const key = (m.name || '').trim().toLowerCase();
      if (!key || seenNames.has(key)) continue;
      seenNames.add(key);
      unique.push(m);
    }
    list = unique;

    if (this.teamRoleFilter !== 'all') {
      list = list.filter(m => m.role === this.teamRoleFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(m => m.name.toLowerCase().includes(q) || (Array.isArray(m.skills) && m.skills.some(s => s.toLowerCase().includes(q))));
    }
    return list;
  }

  getMemberById(id) {
    let m = this.state.teamMembers.find(m => m.id === id);
    if (!m && typeof authStore !== 'undefined') {
      const u = authStore.getUsers().find(u => u.id === id || u.name === id);
      if (u) {
        return {
          id: u.id,
          name: u.name,
          role: u.devRole || u.role || 'dev',
          seniority: u.seniority,
          avatarBg: u.avatarBg || '#6366f1'
        };
      }
    }
    return m;
  }

  addMember(memberData) {
    const cleanName = (memberData.name || '').trim();
    if (!cleanName) return null;

    // Se já existir membro com este nome ou ID, atualiza os dados em vez de duplicar
    const existing = this.state.teamMembers.find(
      m => (memberData.id && m.id === memberData.id) || m.name.toLowerCase().trim() === cleanName.toLowerCase()
    );
    if (existing) {
      this.updateMember(existing.id, memberData);
      return existing;
    }

    let parsedSkills = [];
    if (Array.isArray(memberData.skills)) {
      parsedSkills = memberData.skills;
    } else if (typeof memberData.skills === 'string') {
      try { parsedSkills = JSON.parse(memberData.skills); } catch(e) { parsedSkills = memberData.skills.split(',').map(s => s.trim()).filter(Boolean); }
    }
    const newMember = {
      id: memberData.id || ("m" + Date.now()),
      name: cleanName,
      role: memberData.role || 'frontend',
      seniority: memberData.seniority || 'Pleno',
      skills: parsedSkills,
      capacity: parseInt(memberData.capacity, 10) || 40,
      avatarBg: memberData.avatarBg || (memberData.role === 'frontend' ? '#0284c7' : '#059669')
    };
    this.state.teamMembers.push(newMember);
    this.saveState();
    api.apiRequest('/api/team', 'POST', newMember);
    return newMember;
  }

  updateMember(id, memberData) {
    const member = this.getMemberById(id);
    if (member) {
      if (memberData.name !== undefined) member.name = memberData.name;
      if (memberData.role !== undefined) {
        member.role = memberData.role;
        member.avatarBg = memberData.role === 'frontend' ? '#0284c7' : '#059669';
      }
      if (memberData.seniority !== undefined) member.seniority = memberData.seniority;
      if (memberData.skills !== undefined) {
        if (Array.isArray(memberData.skills)) {
          member.skills = memberData.skills;
        } else if (typeof memberData.skills === 'string') {
          member.skills = memberData.skills.split(',').map(s => s.trim()).filter(Boolean);
        }
      }
      if (memberData.capacity !== undefined) member.capacity = parseInt(memberData.capacity, 10) || 40;
      this.saveState();
      api.apiRequest(`/api/team/${id}`, 'PUT', memberData);
      return true;
    }
    return false;
  }

  deleteMember(id) {
    const index = this.state.teamMembers.findIndex(m => m.id === id);
    if (index !== -1) {
      // Desvincular demandas que estavam atribuídas a este dev
      this.state.tasks.forEach(t => {
        if (t.assigneeId === id) t.assigneeId = null;
      });
      this.state.teamMembers.splice(index, 1);
      this.saveState();
      api.apiRequest(`/api/team/${id}`, 'DELETE');
      return true;
    }
    return false;
  }

  // --- CRUD: REQUISITOS & SPECS ---
  getRequirements() {
    let list = this.state.requirements;
    if (this.selectedProject !== 'all') {
      list = list.filter(r => r.projectId === this.selectedProject);
    }
    if (this.reqTypeFilter !== 'all') {
      list = list.filter(r => r.type === this.reqTypeFilter);
    }
    if (this.reqMoscowFilter !== 'all') {
      list = list.filter(r => r.moscow === this.reqMoscowFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(r => r.title.toLowerCase().includes(q) || r.code.toLowerCase().includes(q) || r.userStory.toLowerCase().includes(q));
    }
    return list;
  }

  getRequirementById(id) {
    return this.state.requirements.find(r => r.id === id);
  }

  addRequirement(data) {
    const newReq = {
      id: "req" + Date.now(),
      code: (data.code || "RF-01").toUpperCase(),
      title: data.title,
      projectId: data.projectId,
      type: data.type,
      moscow: data.moscow,
      userStory: data.userStory,
      bdd: data.bdd
    };
    this.state.requirements.push(newReq);
    this.saveState();
    api.apiRequest('/api/requirements', 'POST', newReq);
    return newReq;
  }

  updateRequirement(id, data) {
    const req = this.getRequirementById(id);
    if (req) {
      if (data.title !== undefined) req.title = data.title;
      if (data.code !== undefined) req.code = (data.code || req.code).toUpperCase();
      if (data.projectId !== undefined) req.projectId = data.projectId;
      if (data.type !== undefined) req.type = data.type;
      if (data.moscow !== undefined) req.moscow = data.moscow;
      if (data.userStory !== undefined) req.userStory = data.userStory;
      if (data.bdd !== undefined) req.bdd = data.bdd;
      this.saveState();
      api.apiRequest(`/api/requirements/${id}`, 'PUT', data);
      return true;
    }
    return false;
  }

  deleteRequirement(id) {
    const index = this.state.requirements.findIndex(r => r.id === id);
    if (index !== -1) {
      // Desvincular das demandas e testes
      this.state.tasks.forEach(t => {
        if (t.reqId === id) t.reqId = null;
      });
      this.state.testCases.forEach(tc => {
        if (tc.reqId === id) tc.reqId = null;
      });
      this.state.requirements.splice(index, 1);
      this.saveState();
      api.apiRequest(`/api/requirements/${id}`, 'DELETE');
      return true;
    }
    return false;
  }

  // --- CRUD: QUADRO DE DEMANDAS (TASKS) ---
  getTasks() {
    let list = this.state.tasks;

    if (this.selectedProject !== 'all') {
      list = list.filter(t => t.projectId === this.selectedProject);
    }
    if (this.kanbanRoleFilter !== 'all') {
      list = list.filter(t => t.role === this.kanbanRoleFilter);
    }
    if (this.kanbanPriorityFilter !== 'all') {
      list = list.filter(t => t.priority === this.kanbanPriorityFilter);
    }
    if (this.kanbanScopeFilter === 'mine' && typeof authStore !== 'undefined') {
      const current = authStore.getCurrentUser();
      if (current) {
        const member = this.state.teamMembers.find(m => m.name.toLowerCase() === current.name.toLowerCase());
        const memberId = member ? member.id : null;
        list = list.filter(t => (memberId && t.assigneeId === memberId) || t.assigneeId === current.id);
      }
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q));
    }
    return list;
  }

  getTaskById(id) {
    return this.state.tasks.find(t => t.id === id);
  }

  addTask(data) {
    if (typeof authStore !== 'undefined') {
      const currentUser = authStore.getCurrentUser();
      if (currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa')) {
        console.warn("Permissão negada: Desenvolvedores e QAs não podem criar demandas.");
        return null;
      }
    }
    const newTask = {
      id: "t" + Date.now(),
      title: data.title,
      projectId: data.projectId,
      reqId: data.reqId || null,
      role: data.role,
      assigneeId: data.assigneeId || null,
      priority: data.priority || 'Média',
      hours: parseInt(data.hours, 10) || 8,
      status: 'backlog',
      desc: data.desc || ''
    };
    this.state.tasks.push(newTask);
    this.saveState();
    api.apiRequest('/api/tasks', 'POST', newTask);
    return newTask;
  }

  updateTask(id, data) {
    const task = this.getTaskById(id);
    if (task) {
      if (data.title !== undefined) task.title = data.title;
      if (data.projectId !== undefined) task.projectId = data.projectId;
      if (data.reqId !== undefined) task.reqId = data.reqId || null;
      if (data.role !== undefined) task.role = data.role;
      if (data.assigneeId !== undefined) task.assigneeId = data.assigneeId || null;
      if (data.priority !== undefined) task.priority = data.priority;
      if (data.hours !== undefined) task.hours = parseInt(data.hours, 10) || 8;
      if (data.hoursSpent !== undefined) task.hoursSpent = Math.max(0, parseFloat(data.hoursSpent) || 0);
      if (data.desc !== undefined) task.desc = data.desc || '';
      this.saveState();
      api.apiRequest(`/api/tasks/${id}`, 'PUT', data);
      return true;
    }
    return false;
  }

  adjustTaskHours(taskId, newHoursSpent, reason) {
    const task = this.getTaskById(taskId);
    if (!task) return false;
    const oldHours = task.hoursSpent || 0;
    const nh = Math.max(0, parseFloat(newHoursSpent) || 0);
    task.hoursSpent = nh;

    const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
    const authorName = currentUser ? currentUser.name : 'Administrador';
    const entry = {
      id: "ts_" + Date.now(),
      hours: nh - oldHours,
      date: new Date().toISOString().split('T')[0],
      notes: `[Ajuste Administrativo] Saldo alterado de ${oldHours}h para ${nh}h. Motivo: ${reason || 'Ajuste de horas apontadas'}`,
      impediment: null,
      author: authorName,
      timestamp: new Date().toISOString()
    };
    task.timesheet = task.timesheet || [];
    task.timesheet.push(entry);

    this.saveState();
    api.apiRequest(`/api/tasks/${taskId}/adjust-hours`, 'POST', {
      newHoursSpent: nh,
      reason: reason || 'Ajuste de horas apontadas',
      author: authorName
    });
    return true;
  }

  deleteTask(id) {
    const index = this.state.tasks.findIndex(t => t.id === id);
    if (index !== -1) {
      // Desvincular de eventuais testes vinculados
      this.state.testCases.forEach(tc => {
        if (tc.taskId === id) tc.taskId = null;
      });
      this.state.tasks.splice(index, 1);
      this.saveState();
      api.apiRequest(`/api/tasks/${id}`, 'DELETE');
      return true;
    }
    return false;
  }

  moveTask(taskId, targetStatus) {
    const task = this.getTaskById(taskId);
    if (task) {
      task.status = targetStatus;
      this.saveState();
      api.apiRequest(`/api/tasks/${taskId}/move`, 'PUT', { status: targetStatus });
      return true;
    }
    return false;
  }

  logTaskTime(taskId, hours, date, notes, impediment, authorName) {
    const task = this.getTaskById(taskId);
    if (task) {
      const h = parseFloat(hours) || 0;
      task.hoursSpent = (task.hoursSpent || 0) + h;
      task.timesheet = task.timesheet || [];
      const entry = {
        id: "ts_" + Date.now(),
        hours: h,
        date: date || new Date().toISOString().split('T')[0],
        notes: notes || "",
        impediment: impediment || null,
        author: authorName || "Desenvolvedor",
        timestamp: new Date().toISOString()
      };
      task.timesheet.push(entry);
      if (impediment && impediment.trim()) {
        task.impediment = impediment.trim();
      } else if (impediment === "") {
        task.impediment = null;
      }
      this.saveState();
      api.apiRequest(`/api/tasks/${taskId}/timesheet`, 'POST', {
        hours: h,
        date: entry.date,
        notes: entry.notes,
        impediment: entry.impediment,
        author: entry.author
      });
      return true;
    }
    return false;
  }

  validateTaskQA(taskId, decision, notes, reviewerName) {
    const task = this.getTaskById(taskId);
    if (task) {
      if (decision === 'approve') {
        task.status = 'done';
        task.qaApproved = true;
        task.qaNotes = notes;
        task.qaReviewer = reviewerName || "QA Lead";
        task.qaDate = new Date().toISOString();
        task.impediment = null;
      } else {
        task.status = 'dev';
        task.qaApproved = false;
        task.qaNotes = notes;
        task.impediment = `Bloqueio QA: ${notes}`;
        task.qaReviewer = reviewerName || "QA Lead";
        task.qaDate = new Date().toISOString();
      }
      this.saveState();
      api.apiRequest(`/api/tasks/${taskId}/qa-validate`, 'POST', {
        decision,
        notes,
        reviewer: reviewerName
      });
      return true;
    }
    return false;
  }

  // --- CRUD: QUALIDADE E CASOS DE TESTES (QA) ---
  getTestCases() {
    let list = this.state.testCases;
    if (this.selectedProject !== 'all') {
      const projectReqIds = this.state.requirements.filter(r => r.projectId === this.selectedProject).map(r => r.id);
      list = list.filter(tc => projectReqIds.includes(tc.reqId));
    }
    if (this.testTypeFilter !== 'all') {
      list = list.filter(tc => tc.type === this.testTypeFilter);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(tc => tc.title.toLowerCase().includes(q) || tc.type.toLowerCase().includes(q));
    }
    return list;
  }

  getTestCaseById(id) {
    return this.state.testCases.find(t => t.id === id);
  }

  addTestCase(data) {
    const newTest = {
      id: "tc" + Date.now(),
      title: data.title,
      type: data.type,
      reqId: data.reqId,
      taskId: data.taskId || null,
      status: 'pending',
      steps: data.steps,
      expected: data.expected
    };
    this.state.testCases.push(newTest);
    this.saveState();
    api.apiRequest('/api/tests', 'POST', newTest);
    return newTest;
  }

  updateTestCase(id, data) {
    const tc = this.getTestCaseById(id);
    if (tc) {
      if (data.title !== undefined) tc.title = data.title;
      if (data.type !== undefined) tc.type = data.type;
      if (data.reqId !== undefined) tc.reqId = data.reqId;
      if (data.steps !== undefined) tc.steps = data.steps;
      if (data.expected !== undefined) tc.expected = data.expected;
      if (data.status !== undefined) tc.status = data.status;
      this.saveState();
      api.apiRequest(`/api/tests/${id}`, 'PUT', data);
      return true;
    }
    return false;
  }

  deleteTestCase(id) {
    const index = this.state.testCases.findIndex(t => t.id === id);
    if (index !== -1) {
      this.state.testCases.splice(index, 1);
      this.saveState();
      api.apiRequest(`/api/tests/${id}`, 'DELETE');
      return true;
    }
    return false;
  }

  setTestStatus(testId, status) {
    const tc = this.getTestCaseById(testId);
    if (tc) {
      tc.status = status;
      this.saveState();
      api.apiRequest(`/api/tests/${testId}/status`, 'PUT', { status });
      return true;
    }
    return false;
  }

  // --- CÁLCULO DE CAPACIDADE DA EQUIPE ---
  calculateDevWorkload(devId) {
    const dev = this.getMemberById(devId);
    const devName = dev ? (dev.name || '').toLowerCase().trim() : '';
    const devTasks = this.state.tasks.filter(t => {
      if (t.assigneeId === devId) return true;
      if (dev && t.assigneeId === dev.id) return true;
      if (devName && t.assigneeId) {
        const assignedMember = this.getMemberById(t.assigneeId);
        if (assignedMember && (assignedMember.name || '').toLowerCase().trim() === devName) return true;
      }
      return false;
    });

    let totalEstimated = 0;
    let totalSpent = 0;
    let totalHours = 0;

    devTasks.forEach(t => {
      const est = parseFloat(t.hours) || 0;
      const spent = parseFloat(t.hoursSpent) || 0;
      totalEstimated += est;
      totalSpent += spent;

      // Para tarefas concluídas ('done'), consideramos o total de horas já consumidas/apontadas.
      // Para tarefas ativas (backlog, spec, dev, qa), a carga real é o maior valor entre o estimado e o apontado,
      // refletindo o impacto real caso o desenvolvedor já tenha excedido a estimativa original.
      if (t.status === 'done') {
        totalHours += spent;
      } else {
        totalHours += Math.max(est, spent);
      }
    });

    const capacity = dev ? (parseFloat(dev.capacity) || 40) : 40;
    const percentage = capacity > 0 ? Math.round((totalHours / capacity) * 100) : 0;

    return {
      hours: totalHours,
      hoursEstimated: totalEstimated,
      hoursSpent: totalSpent,
      capacity: capacity,
      percentage: percentage,
      isOverloaded: totalHours > capacity,
      overloadHours: Math.max(0, totalHours - capacity),
      activeTasksCount: devTasks.filter(t => t.status !== 'done').length,
      totalTasksCount: devTasks.length
    };
  }

  // --- ESTATÍSTICAS GERAIS ---
  getDashboardStats() {
    const tasks = this.state.tasks;
    const reqs = this.state.requirements;
    const tests = this.state.testCases;
    const members = this.state.teamMembers;

    const frontTasks = tasks.filter(t => t.role === 'frontend').length;
    const backTasks = tasks.filter(t => t.role === 'backend').length;

    const frontDevs = members.filter(m => m.role === 'frontend').length;
    const backDevs = members.filter(m => m.role === 'backend').length;

    const passedTests = tests.filter(t => t.status === 'pass').length;
    const passRate = tests.length ? Math.round((passedTests / tests.length) * 100) : 0;

    const reqsWithTest = new Set(tests.map(tc => tc.reqId)).size;
    const reqCoverageRate = reqs.length ? Math.round((reqsWithTest / reqs.length) * 100) : 0;

    return {
      requirementsCount: reqs.length,
      frontTasksCount: frontTasks,
      backTasksCount: backTasks,
      frontDevsCount: frontDevs,
      backDevsCount: backDevs,
      testsCount: tests.length,
      testsPassRate: passRate,
      reqCoverageRate: reqCoverageRate
    };
  }
}

// Instância Global do Store
const store = new ALMStore();
window.store = store;

// ==============================================================================
// 1.1 Gerenciador de Usuários e Autenticação (UserAuthStore)
// ==============================================================================

const defaultAuthUsers = [
  {
    id: "u_admin",
    name: "Carlos Valois",
    email: "admin@devsquad.com",
    password: "admin123",
    role: "admin",
    devRole: null,
    seniority: "Workspace Owner / Diretor",
    skills: ["Arquitetura", "Governança", "DevOps", "Segurança", "Go"],
    avatarBg: "#f59e0b",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "u_gestor",
    name: "Fernanda Lima",
    email: "gestor@devsquad.com",
    password: "pm123",
    role: "pm",
    devRole: null,
    seniority: "Gerente de Projetos (PM / Scrum Master)",
    skills: ["Scrum", "Kanban", "Gestão de Escopo", "Métricas Ágeis", "Planejamento"],
    avatarBg: "#8b5cf6",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "u_carlos",
    name: "Carlos Valois",
    email: "carlos@devsquad.com",
    password: "dev123",
    role: "dev",
    devRole: "backend",
    seniority: "Líder Técnico Back-end",
    skills: ["Go", "Node.js", "Redis", "Kafka", "PostgreSQL"],
    avatarBg: "#059669",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "u_lucas",
    name: "Lucas Mendes",
    email: "lucas@devsquad.com",
    password: "dev123",
    role: "dev",
    devRole: "frontend",
    seniority: "Desenvolvedor Front-end Sênior",
    skills: ["React", "TypeScript", "Next.js", "TailwindCSS", "Jest"],
    avatarBg: "#0284c7",
    createdAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "u_qa",
    name: "Juliana Paiva",
    email: "qa@devsquad.com",
    password: "qa123",
    role: "qa",
    devRole: null,
    seniority: "QA Lead / Homologadora",
    skills: ["Testes Automatizados", "Cypress", "Postman", "BDD", "Jest"],
    avatarBg: "#ec4899",
    createdAt: "2026-01-01T00:00:00.000Z"
  }
];

// ==============================================================================
// 1.2 Matriz de Regras de Acesso e Permissões por Papel (RBAC)
// ==============================================================================
const RolePermissions = {
  admin: {
    label: "👑 Administrador do Sistema",
    category: "Governança & Administração",
    badgeClass: "tag-admin",
    canCreateProject: true,
    canEditProject: true,
    canDeleteProject: true,
    canCreateReq: true,
    canEditReq: true,
    canDeleteReq: true,
    canCreateTask: true,
    canDeleteTask: true,
    canAssignTask: true,
    canEditTaskHoursSpent: true,
    canLogTime: true,
    canValidateQA: true,
    canRunTests: true,
    canCreateTest: true,
    canManageTeam: true,
    canManageGovernance: true,
    allowedViews: ['dashboard', 'projects', 'requirements', 'kanban', 'team', 'testing', 'governance'],
    allowedNewItems: ['project', 'task', 'req', 'test', 'member']
  },
  pm: {
    label: "📊 Gerente de Projetos (PM / Scrum Master)",
    category: "Governança & Administração",
    badgeClass: "tag-pm",
    canCreateProject: true,
    canEditProject: true,
    canDeleteProject: false,
    canCreateReq: true,
    canEditReq: true,
    canDeleteReq: false,
    canCreateTask: true,
    canDeleteTask: false,
    canAssignTask: true,
    canEditTaskHoursSpent: false,
    canLogTime: true,
    canValidateQA: false,
    canRunTests: false,
    canCreateTest: false,
    canManageTeam: true,
    canManageGovernance: false,
    allowedViews: ['dashboard', 'projects', 'requirements', 'kanban', 'team', 'testing'],
    allowedNewItems: ['project', 'task', 'req', 'member']
  },
  dev: {
    label: "💻 Membro Executor (Desenvolvedor)",
    category: "Execução & Operação",
    badgeClass: "tag-back",
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canCreateReq: false,
    canEditReq: false,
    canDeleteReq: false,
    canCreateTask: false,
    canDeleteTask: false,
    canAssignTask: false,
    canSelfAssign: true,
    canEditSelf: true,
    canEditTaskHoursSpent: false,
    canLogTime: true,
    canValidateQA: false,
    canRunTests: false,
    canCreateTest: false,
    canManageTeam: false,
    canManageGovernance: false,
    allowedViews: ['dashboard', 'projects', 'requirements', 'kanban'],
    allowedNewItems: []
  },
  qa: {
    label: "🧪 Revisor / Validador (QA / Tech Lead)",
    category: "Execução & Operação",
    badgeClass: "tag-qa",
    canCreateProject: false,
    canEditProject: false,
    canDeleteProject: false,
    canCreateReq: false,
    canEditReq: false,
    canDeleteReq: false,
    canCreateTask: false,
    canDeleteTask: false,
    canAssignTask: false,
    canSelfAssign: true,
    canEditSelf: true,
    canEditTaskHoursSpent: false,
    canLogTime: false,
    canValidateQA: true,
    canRunTests: true,
    canCreateTest: true,
    canManageTeam: false,
    canManageGovernance: false,
    allowedViews: ['dashboard', 'projects', 'requirements', 'kanban', 'testing'],
    allowedNewItems: ['test']
  }
};

class UserAuthStore {
  constructor() {
    this.usersKey = 'devsquad_users_v1';
    this.sessionKey = 'devsquad_session_user';
    this.initUsers();
  }

  initUsers() {
    try {
      const stored = localStorage.getItem(this.usersKey);
      if (!stored) {
        localStorage.setItem(this.usersKey, JSON.stringify(defaultAuthUsers));
      } else {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed) || parsed.length === 0) {
          localStorage.setItem(this.usersKey, JSON.stringify(defaultAuthUsers));
        } else {
          let updated = false;
          defaultAuthUsers.forEach(defUser => {
            if (!parsed.some(u => u.email.toLowerCase() === defUser.email.toLowerCase())) {
              parsed.push(defUser);
              updated = true;
            }
          });
          if (updated) {
            localStorage.setItem(this.usersKey, JSON.stringify(parsed));
          }
        }
      }
    } catch (e) {
      console.error("Erro ao inicializar usuários no localStorage:", e);
    }
  }

  getUsers() {
    try {
      const stored = localStorage.getItem(this.usersKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const seen = new Set();
          return parsed.filter(u => {
            const key = (u.email || '').trim().toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      }
      return defaultAuthUsers;
    } catch (e) {
      return defaultAuthUsers;
    }
  }

  saveUsers(users) {
    try {
      if (Array.isArray(users)) {
        const seen = new Set();
        users = users.filter(u => {
          const key = (u.email || '').trim().toLowerCase();
          if (!key || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }
      localStorage.setItem(this.usersKey, JSON.stringify(users));
    } catch (e) {
      console.error("Erro ao salvar lista de usuários:", e);
    }
  }

  getCurrentUser() {
    try {
      const session = localStorage.getItem(this.sessionKey);
      return session ? JSON.parse(session) : null;
    } catch (e) {
      return null;
    }
  }

  setSession(user) {
    try {
      const safeUser = { ...user };
      delete safeUser.password;
      localStorage.setItem(this.sessionKey, JSON.stringify(safeUser));
      return safeUser;
    } catch (e) {
      console.error("Erro ao salvar sessão:", e);
      return null;
    }
  }

  clearSession() {
    try {
      localStorage.removeItem(this.sessionKey);
    } catch (e) {
      console.error("Erro ao limpar sessão:", e);
    }
  }

  async login(email, password) {
    const cleanEmail = (email || '').trim().toLowerCase();

    // 1. Autenticação direta no Backend SQLite quando online
    if (typeof api !== 'undefined' && api.isOnline) {
      try {
        const res = await api.apiRequest('/api/auth/login', 'POST', { email: cleanEmail, password });
        if (res && res.success && res.user) {
          const sessionUser = this.setSession(res.user);
          const users = this.getUsers();
          const idx = users.findIndex(u => u.email.toLowerCase() === cleanEmail);
          const fullUser = { ...res.user, password };
          if (idx !== -1) {
            users[idx] = fullUser;
          } else {
            users.push(fullUser);
          }
          this.saveUsers(users);
          return { success: true, user: sessionUser };
        } else if (res && res.message) {
          return { success: false, message: res.message };
        }
      } catch (e) {
        console.warn("Falha na chamada de login via API, tentando fallback local:", e);
      }
    }

    // 2. Fallback de Autenticação Offline (LocalStorage)
    const users = this.getUsers();
    const user = users.find(u => u.email.toLowerCase() === cleanEmail);

    if (!user) {
      return { success: false, message: 'Usuário não encontrado com este e-mail. Verifique a digitação ou contate o Administrador.' };
    }

    if (user.password !== password) {
      return { success: false, message: 'Senha incorreta. Verifique suas credenciais de acesso.' };
    }

    const sessionUser = this.setSession(user);
    return { success: true, user: sessionUser };
  }

  async createUserByAdmin({ name, email, role, devRole, seniority, skills, password }) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanName = (name || '').trim();

    if (!cleanName || !cleanEmail || !password) {
      return { success: false, message: 'Por favor, preencha todos os campos obrigatórios (*).' };
    }

    if (password.length < 6) {
      return { success: false, message: 'A senha deve conter no mínimo 6 caracteres.' };
    }

    const users = this.getUsers();
    if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
      return { success: false, message: 'Já existe um usuário cadastrado com este e-mail no workspace.' };
    }

    const palette = ['#3b82f6', '#10b981', '#8b5cf6', '#0284c7', '#059669', '#d97706', '#ec4899', '#06b6d4'];
    const randomBg = palette[Math.floor(Math.random() * palette.length)];

    let parsedSkills = [];
    if (typeof skills === 'string' && skills.trim()) {
      parsedSkills = skills.split(',').map(s => s.trim()).filter(Boolean);
    } else if (Array.isArray(skills)) {
      parsedSkills = skills;
    }

    if (parsedSkills.length === 0) {
      parsedSkills = role === 'admin' ? ['Gestão', 'Arquitetura', 'DevOps'] : ['JavaScript', 'Git', 'Clean Code'];
    }

    const newUser = {
      id: 'u_' + Date.now(),
      name: cleanName,
      email: cleanEmail,
      password: password,
      role: role || 'dev',
      devRole: (role === 'admin' || role === 'pm' || role === 'qa') ? null : (devRole || 'backend'),
      seniority: seniority || 'Pleno',
      skills: parsedSkills,
      avatarBg: randomBg,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);

    if (typeof api !== 'undefined') {
      await api.apiRequest('/api/auth/register', 'POST', newUser);
    }

    // Sincronização automática com a equipe de desenvolvimento se for Dev
    if (newUser.role === 'dev' && typeof store !== 'undefined' && store.state && Array.isArray(store.state.teamMembers)) {
      const cleanDevName = newUser.name.trim().toLowerCase();
      const existingInTeam = store.state.teamMembers.find(
        m => (m.name || '').trim().toLowerCase() === cleanDevName
      );
      if (!existingInTeam) {
        store.addMember({
          name: newUser.name,
          role: newUser.devRole || 'frontend',
          seniority: newUser.seniority,
          skills: newUser.skills,
          capacity: 40,
          avatarBg: newUser.avatarBg
        });
      } else {
        store.updateMember(existingInTeam.id, {
          role: newUser.devRole || existingInTeam.role,
          seniority: newUser.seniority || existingInTeam.seniority,
          skills: newUser.skills || existingInTeam.skills
        });
      }
    }

    return { success: true, user: newUser };
  }

  async updateUserByAdmin(id, { name, role, devRole, seniority, skills, password }) {
    const users = this.getUsers();
    const idx = users.findIndex(u => u.id === id);
    if (idx === -1) return { success: false, message: 'Usuário não encontrado.' };

    const user = users[idx];
    if (name) user.name = name.trim();
    if (role) {
      user.role = role;
      user.devRole = (role === 'admin' || role === 'pm' || role === 'qa') ? null : (devRole || 'backend');
    }
    if (seniority) user.seniority = seniority;
    if (skills) {
      user.skills = Array.isArray(skills) ? skills : skills.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (password && password.trim()) user.password = password.trim();

    users[idx] = user;
    this.saveUsers(users);

    if (typeof api !== 'undefined') {
      await api.apiRequest(`/api/users/${id}`, 'PUT', user);
    }

    // Sincroniza na equipe se for perfil dev
    if (user.role === 'dev' && typeof store !== 'undefined' && store.state && Array.isArray(store.state.teamMembers)) {
      const teamMember = store.state.teamMembers.find(m => m.id === id || (m.name || '').toLowerCase() === user.name.toLowerCase());
      if (teamMember) {
        store.updateMember(teamMember.id, {
          name: user.name,
          role: user.devRole || 'backend',
          seniority: user.seniority,
          skills: user.skills
        });
      } else {
        store.addMember({
          name: user.name,
          role: user.devRole || 'backend',
          seniority: user.seniority,
          skills: user.skills,
          capacity: 40,
          avatarBg: user.avatarBg
        });
      }
    }

    // Se o usuário editado for o da sessão ativa, atualiza sessão
    const current = this.getCurrentUser();
    if (current && current.id === id) {
      this.setSession(user);
      updateLoggedUserUI(user);
    }

    return { success: true, user };
  }

  async deleteUserByAdmin(id) {
    const current = this.getCurrentUser();
    if (current && current.id === id) {
      return { success: false, message: 'Você não pode excluir sua própria conta enquanto estiver logado.' };
    }

    let users = this.getUsers();
    const targetUser = users.find(u => u.id === id);
    users = users.filter(u => u.id !== id);
    this.saveUsers(users);

    if (typeof api !== 'undefined') {
      await api.apiRequest(`/api/users/${id}`, 'DELETE');
    }

    // Remove também da equipe se houver
    if (targetUser && typeof store !== 'undefined' && store.state && Array.isArray(store.state.teamMembers)) {
      const teamMember = store.state.teamMembers.find(m => m.id === id || (m.name || '').toLowerCase() === targetUser.name.toLowerCase());
      if (teamMember) {
        store.deleteMember(teamMember.id);
      }
    }

    return { success: true, id };
  }

  register(data) {
    return this.createUserByAdmin(data);
  }

  logout() {
    this.clearSession();
  }
}

// Instância Global de Autenticação
const authStore = new UserAuthStore();
window.authStore = authStore;

// ==============================================================================
// 2. Renderização das Telas
// ==============================================================================

// --- RENDERIZAR PAINEL GERAL (DASHBOARD) ---
function renderDashboard() {
  const stats = store.getDashboardStats();

  document.getElementById('kpi-requirements-count').textContent = stats.requirementsCount;
  document.getElementById('kpi-front-tasks-count').textContent = stats.frontTasksCount;
  document.getElementById('kpi-front-devs-count').textContent = `${stats.frontDevsCount} Desenvolvedores`;
  document.getElementById('kpi-back-tasks-count').textContent = stats.backTasksCount;
  document.getElementById('kpi-back-devs-count').textContent = `${stats.backDevsCount} Desenvolvedores`;
  document.getElementById('kpi-tests-pass-rate').textContent = `${stats.testsPassRate}%`;
  document.getElementById('kpi-tests-count').textContent = `${stats.testsCount} Casos de Teste`;

  const projectsListEl = document.getElementById('dashboard-projects-list');
  projectsListEl.innerHTML = '';

  const projects = store.getProjects();
  let totalTasksAll = 0;
  let completedTasksAll = 0;

  if (projects.length === 0) {
    projectsListEl.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Nenhum projeto cadastrado no momento.</p>';
  }

  projects.forEach(project => {
    const pTasks = store.state.tasks.filter(t => t.projectId === project.id);
    const completed = pTasks.filter(t => t.status === 'done').length;
    const total = pTasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    totalTasksAll += total;
    completedTasksAll += completed;

    const item = document.createElement('div');
    item.className = 'project-item';
    item.innerHTML = `
      <div class="project-meta-row">
        <span class="project-name">${project.name}</span>
        <span class="project-counts">${completed}/${total} demandas concluídas (${percent}%)</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: ${percent}%; background: ${project.color || 'var(--gradient-brand)'};"></div>
      </div>
    `;
    projectsListEl.appendChild(item);
  });

  const overallPercent = totalTasksAll > 0 ? Math.round((completedTasksAll / totalTasksAll) * 100) : 0;
  const sidebarProgressEl = document.getElementById('sidebar-overall-progress');
  const sidebarPercentEl = document.getElementById('sidebar-completed-percent');
  const sidebarProjectsCountText = document.getElementById('sidebar-active-projects-text');

  if (sidebarProgressEl) sidebarProgressEl.style.width = `${overallPercent}%`;
  if (sidebarPercentEl) sidebarPercentEl.textContent = `${overallPercent}%`;
  if (sidebarProjectsCountText) sidebarProjectsCountText.textContent = `${projects.length} Projetos Ativos`;

  const workloadListEl = document.getElementById('dashboard-team-workload');
  workloadListEl.innerHTML = '';

  const members = store.state.teamMembers;
  let totalOverloadedCount = 0;

  members.forEach(member => {
    const workload = store.calculateDevWorkload(member.id);
    if (workload.isOverloaded) totalOverloadedCount++;

    const roleLabel = member.role === 'frontend' ? 'Front-end' : 'Back-end';
    const statusColor = workload.percentage > 100 ? '#f43f5e' : (workload.percentage > 80 ? '#f59e0b' : '#10b981');

    const overloadBadge = workload.isOverloaded 
      ? `<span class="badge-overload" style="background: rgba(244, 63, 94, 0.2); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.4); font-size: 0.68rem; padding: 2px 6px; border-radius: 4px; font-weight: 700; margin-left: 6px; display: inline-flex; align-items: center; gap: 3px;">⚠️ Carga Excedida (+${workload.overloadHours}h)</span>` 
      : '';

    const item = document.createElement('div');
    item.className = 'workload-item';
    item.innerHTML = `
      <div class="workload-avatar" style="background: ${member.avatarBg}; color: #fff;">
        ${member.name.charAt(0)}
      </div>
      <div class="workload-info">
        <div class="workload-name-row">
          <span>${member.name} <small style="color: var(--text-muted); font-weight: normal;">(${roleLabel} • ${member.seniority})</small>${overloadBadge}</span>
          <span style="color: ${statusColor}; font-weight: 700;">${workload.hours}h / ${workload.capacity}h <small style="font-size: 0.72rem; opacity: 0.85;">(${workload.percentage}%)</small></span>
        </div>
        <div class="progress-track" title="Carga total: ${workload.hours}h (Apontadas: ${workload.hoursSpent}h, Estimadas: ${workload.hoursEstimated}h)">
          <div class="progress-fill" style="width: ${Math.min(workload.percentage, 100)}%; background: ${statusColor}; ${workload.isOverloaded ? 'box-shadow: 0 0 10px rgba(244, 63, 94, 0.5);' : ''}"></div>
        </div>
      </div>
    `;
    workloadListEl.appendChild(item);
  });

  const workloadBadge = document.getElementById('dashboard-workload-badge');
  if (workloadBadge) {
    if (totalOverloadedCount > 0) {
      workloadBadge.innerHTML = `⚠️ ${totalOverloadedCount} Profissional(is) com Carga Excedida`;
      workloadBadge.style.background = 'rgba(244, 63, 94, 0.2)';
      workloadBadge.style.color = '#f43f5e';
      workloadBadge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
      workloadBadge.style.fontWeight = '700';
    } else {
      workloadBadge.textContent = 'Capacidade Saudável';
      workloadBadge.style.background = '';
      workloadBadge.style.color = '';
      workloadBadge.style.borderColor = '';
      workloadBadge.style.fontWeight = '';
    }
  }

  const traceTableBody = document.getElementById('trace-table-body');
  traceTableBody.innerHTML = '';

  const sampleTasks = store.state.tasks.slice(0, 6);
  sampleTasks.forEach(task => {
    const req = store.getRequirementById(task.reqId);
    const project = store.getProjectById(task.projectId);
    const assignee = store.getMemberById(task.assigneeId);
    const hasTest = store.state.testCases.some(tc => tc.reqId === task.reqId);

    const isTaskOver = task.hoursSpent && (parseFloat(task.hoursSpent) > (parseFloat(task.hours) || 8));
    const hoursBadge = task.hoursSpent 
      ? `<span style="font-size: 0.72rem; ${isTaskOver ? 'color: #f43f5e; font-weight: 700;' : 'color: var(--text-muted);'} margin-left: 6px;" title="${isTaskOver ? `Horas apontadas (${task.hoursSpent}h) excederam a estimativa (${task.hours || 8}h)` : 'Horas apontadas / estimadas'}">⏱️ ${task.hoursSpent}/${task.hours || 8}h${isTaskOver ? ' ⚠️' : ''}</span>`
      : `<span style="font-size: 0.72rem; color: var(--text-muted); margin-left: 6px;">⏱️ ${task.hours || 8}h</span>`;

    const statusLabels = {
      backlog: 'A Fazer',
      spec: 'Especificação',
      dev: 'Desenvolvimento',
      qa: 'Validação / QA',
      done: 'Concluído'
    };

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${req ? req.code : 'Avulso'}</strong> - ${req ? req.title : task.title}</td>
      <td><span class="badge-subtle">${project ? project.name : '-'}</span></td>
      <td>${task.title} ${hoursBadge} <br><small style="color: var(--text-muted);">Responsável: ${assignee ? assignee.name : 'Não Atribuído'}</small></td>
      <td><span class="task-role-tag ${task.role === 'frontend' ? 'role-front' : 'role-back'}">${task.role === 'frontend' ? 'Front-end' : 'Back-end'}</span></td>
      <td><span class="status-pill status-${task.status === 'done' ? 'pass' : 'pending'}">${statusLabels[task.status] || task.status}</span></td>
      <td><span class="status-pill ${hasTest ? 'status-pass' : 'status-pending'}">${hasTest ? '✓ Coberto' : '⏳ Pendente'}</span></td>
    `;
    traceTableBody.appendChild(tr);
  });
}

// --- RENDERIZAR ABA: PROJETOS (CRUD) ---
function renderProjects() {
  const container = document.getElementById('projects-cards-container');
  container.innerHTML = '';

  const projects = store.getProjects();
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1;">
        <p style="font-size: 1.15rem; margin-bottom: 0.85rem;">Nenhum projeto encontrado com os filtros aplicados.</p>
        ${perms.canCreateProject ? '<button class="btn btn-primary" onclick="openProjectModalForCreate()">+ Cadastrar Novo Projeto</button>' : ''}
      </div>
    `;
    return;
  }

  projects.forEach(project => {
    const pTasks = store.state.tasks.filter(t => t.projectId === project.id);
    const pReqs = store.state.requirements.filter(r => r.projectId === project.id);
    const reqIds = pReqs.map(r => r.id);
    const pTests = store.state.testCases.filter(tc => reqIds.includes(tc.reqId));

    const completedTasks = pTasks.filter(t => t.status === 'done').length;
    const progressPercent = pTasks.length > 0 ? Math.round((completedTasks / pTasks.length) * 100) : 0;
    const statusBadgeClass = project.status === 'Ativo' ? 'status-pass' : (project.status === 'Concluído' ? 'status-pass' : 'status-pending');

    const canEditProject = perms.canEditProject;
    const canDeleteProject = perms.canDeleteProject;

    let actionsHtml = '';
    if (canEditProject) {
      actionsHtml += `<button class="btn btn-secondary btn-sm" onclick="openProjectModalForEdit('${project.id}')" title="Editar Projeto">✏️ Editar</button>`;
    }
    if (canDeleteProject) {
      actionsHtml += `<button class="btn btn-danger btn-sm" onclick="confirmDeleteProject('${project.id}', '${project.name}')" title="Excluir Projeto">🗑️ Excluir</button>`;
    }

    const card = document.createElement('article');
    card.className = 'project-card glass-panel';
    card.innerHTML = `
      <div class="project-card-top-bar" style="background: ${project.color || '#3b82f6'};"></div>
      
      <div class="project-card-header">
        <div>
          <span class="project-code-tag">${project.code || 'PROJ'}</span>
          <h2 class="project-card-title">${project.name}</h2>
        </div>
        <span class="status-pill ${statusBadgeClass}">${project.status}</span>
      </div>

      <p class="project-card-desc">${project.desc || 'Sem descrição cadastrada.'}</p>

      <div class="project-card-metrics">
        <div class="project-metric-item">
          <span class="project-metric-val">${pReqs.length}</span>
          <span class="project-metric-lbl">Requisitos</span>
        </div>
        <div class="project-metric-item">
          <span class="project-metric-val">${pTasks.length}</span>
          <span class="project-metric-lbl">Demandas</span>
        </div>
        <div class="project-metric-item">
          <span class="project-metric-val">${pTests.length}</span>
          <span class="project-metric-lbl">Testes QA</span>
        </div>
      </div>

      <div style="margin-bottom: 1rem;">
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 600; margin-bottom: 0.35rem;">
          <span>Progresso do Projeto</span>
          <span style="color: ${project.color || 'var(--text-main)'};">${progressPercent}% (${completedTasks}/${pTasks.length})</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width: ${progressPercent}%; background: ${project.color || '#3b82f6'};"></div>
        </div>
      </div>

      <div class="project-card-footer">
        <span class="project-deadline-text">📅 Entrega: ${project.deadline ? formatDateBR(project.deadline) : 'A definir'}</span>
        ${actionsHtml ? `<div class="project-actions-group">${actionsHtml}</div>` : '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">🔒 Somente leitura</span>'}
      </div>
    `;
    container.appendChild(card);
  });
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

// Funções de CRUD de Projetos
window.openProjectModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  if (!perms.canCreateProject) {
    showToast('Desenvolvedores não possuem permissão para cadastrar projetos.');
    return;
  }

  document.getElementById('modal-project-title').textContent = "📁 Cadastrar Novo Projeto";
  document.getElementById('project-id-edit').value = "";
  document.getElementById('form-project').reset();
  document.getElementById('project-color-input').value = "#3b82f6";
  document.getElementById('project-status-input').value = "Ativo";
  openModal('modal-project');
};

window.openProjectModalForEdit = function(projectId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  if (!perms.canEditProject) {
    showToast('Desenvolvedores não possuem permissão para editar projetos.');
    return;
  }

  const project = store.getProjectById(projectId);
  if (!project) return;

  document.getElementById('modal-project-title').textContent = "✏️ Editar Projeto";
  document.getElementById('project-id-edit').value = project.id;
  document.getElementById('project-name-input').value = project.name;
  document.getElementById('project-code-input').value = project.code || "";
  document.getElementById('project-desc-input').value = project.desc || "";
  document.getElementById('project-status-input').value = project.status || "Ativo";
  document.getElementById('project-deadline-input').value = project.deadline || "";
  document.getElementById('project-color-input').value = project.color || "#3b82f6";

  openModal('modal-project');
};

window.confirmDeleteProject = function(projectId, projectName) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  if (!perms.canDeleteProject) {
    showToast('Desenvolvedores não possuem permissão para excluir projetos.');
    return;
  }

  if (confirm(`Tem certeza que deseja excluir o projeto "${projectName}"?\n\nAs demandas e requisitos associados permanecerão salvos como referências avulsas.`)) {
    store.deleteProject(projectId);
    refreshAllUI();
    showToast(`Projeto "${projectName}" excluído com sucesso.`);
  }
};

// --- RENDERIZAR ABA: REQUISITOS (CRUD) ---
function renderRequirements() {
  const container = document.getElementById('requirements-container');
  container.innerHTML = '';

  const requirements = store.getRequirements();
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (requirements.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
        <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Nenhum requisito encontrado para os filtros selecionados.</p>
        ${perms.canCreateReq ? '<button class="btn btn-secondary btn-sm" onclick="openReqModalForCreate()">+ Especificar Primeiro Requisito</button>' : ''}
      </div>
    `;
    return;
  }

  const moscowLabels = {
    Must: "Obrigatório (Must Have)",
    Should: "Importante (Should Have)",
    Could: "Desejável (Could Have)",
    "Won't": "Não Prioritário"
  };

  requirements.forEach(req => {
    const project = store.getProjectById(req.projectId);
    const linkedTasks = store.state.tasks.filter(t => t.reqId === req.id);
    const linkedTests = store.state.testCases.filter(tc => tc.reqId === req.id);
    const moscowClass = req.moscow === 'Must' ? 'moscow-must' : (req.moscow === 'Should' ? 'moscow-should' : 'moscow-could');

    let reqActionsHtml = '';
    if (perms.canEditReq) {
      reqActionsHtml += `<button class="card-btn-action" onclick="openReqModalForEdit('${req.id}')" title="Editar Requisito">✏️ Editar</button>`;
    }
    if (perms.canDeleteReq) {
      reqActionsHtml += `<button class="card-btn-action btn-del" onclick="confirmDeleteRequirement('${req.id}', '${req.code}', '${req.title}')" title="Excluir Requisito">🗑️ Excluir</button>`;
    }

    const card = document.createElement('article');
    card.className = 'requirement-card glass-panel';
    card.innerHTML = `
      <div class="req-header-row">
        <span class="req-code-badge">${req.code}</span>
        <h3 class="req-title">${req.title}</h3>
        <span class="moscow-badge ${moscowClass}">${moscowLabels[req.moscow] || req.moscow}</span>
        <span class="badge-subtle">${project ? project.name : 'Geral'}</span>
        
        <div class="card-header-actions" style="margin-left: auto;">
          ${reqActionsHtml ? reqActionsHtml : '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">🔒 Somente leitura</span>'}
        </div>
      </div>

      <div class="user-story-quote">
        <strong>História de Usuário:</strong> ${req.userStory || 'Não preenchida.'}
      </div>

      <div class="bdd-container">
        <div class="bdd-title">Critérios de Aceite (Cenário: Dado / Quando / Então):</div>
        <div class="bdd-content">${req.bdd || 'Critérios não documentados.'}</div>
      </div>

      <div class="req-footer-row">
        <div>
          <span>🔗 Demandas Vinculadas (${linkedTasks.length}):</span>
          ${linkedTasks.map(t => `<span class="task-role-tag ${t.role === 'frontend' ? 'role-front' : 'role-back'}" style="margin-left: 4px;">${t.role === 'frontend' ? 'Front-end' : 'Back-end'} #${t.id}</span>`).join('') || '<span style="color: var(--text-muted); margin-left: 4px;">Nenhuma</span>'}
        </div>
        <div>
          <span>🧪 Casos de Teste QA: <strong>${linkedTests.length}</strong></span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Funções de CRUD de Requisitos
window.openReqModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  if (!perms.canCreateReq) {
    showToast('Desenvolvedores não possuem permissão para criar requisitos.');
    return;
  }

  document.getElementById('modal-req-title').textContent = "📋 Especificar Novo Requisito";
  document.getElementById('req-id-edit').value = "";
  document.getElementById('form-new-req').reset();
  document.getElementById('btn-save-req').textContent = "Registrar Requisito";
  openModal('modal-requirement');
};

window.openReqModalForEdit = function(reqId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  if (!perms.canEditReq) {
    showToast('Desenvolvedores não possuem permissão para editar requisitos.');
    return;
  }

  const req = store.getRequirementById(reqId);
  if (!req) return;

  document.getElementById('modal-req-title').textContent = "✏️ Editar Requisito / Especificação";
  document.getElementById('req-id-edit').value = req.id;
  document.getElementById('req-title').value = req.title;
  document.getElementById('req-code').value = req.code;
  document.getElementById('req-project').value = req.projectId;
  document.getElementById('req-type').value = req.type;
  document.getElementById('req-moscow').value = req.moscow;
  document.getElementById('req-user-story').value = req.userStory || "";
  document.getElementById('req-bdd').value = req.bdd || "";
  document.getElementById('btn-save-req').textContent = "Atualizar Requisito";

  openModal('modal-requirement');
};

window.confirmDeleteRequirement = function(reqId, reqCode, reqTitle) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  if (!perms.canDeleteReq) {
    showToast('Desenvolvedores não possuem permissão para excluir requisitos.');
    return;
  }

  if (confirm(`Deseja realmente excluir o requisito [${reqCode}] "${reqTitle}"?\n\nAs demandas e testes associados a ele terão o vínculo desfeito.`)) {
    store.deleteRequirement(reqId);
    refreshAllUI();
    showToast(`Requisito ${reqCode} excluído com sucesso.`);
  }
};

// --- RENDERIZAR ABA: KANBAN (CRUD DE DEMANDAS) ---
function renderKanban() {
  const columns = ['backlog', 'spec', 'dev', 'qa', 'done'];
  const tasks = store.getTasks();

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRoleKey = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRoleKey] || RolePermissions.dev;

  columns.forEach(col => {
    const zone = document.getElementById(`zone-${col}`);
    if (zone) zone.innerHTML = '';
    const countEl = document.getElementById(`count-col-${col}`);
    if (countEl) countEl.textContent = '0';
  });

  const counts = { backlog: 0, spec: 0, dev: 0, qa: 0, done: 0 };

  tasks.forEach(task => {
    const colStatus = task.status || 'backlog';
    counts[colStatus] = (counts[colStatus] || 0) + 1;

    const zone = document.getElementById(`zone-${colStatus}`);
    if (!zone) return;

    const project = store.getProjectById(task.projectId);
    const assignee = store.getMemberById(task.assigneeId);
    const priorityClass = task.priority === 'Alta' ? 'pri-alta' : (task.priority === 'Média' ? 'pri-media' : 'pri-baixa');
    const roleBorderClass = task.role === 'frontend' ? 'task-front' : 'task-back';
    const roleLabel = task.role === 'frontend' ? 'Front-end' : 'Back-end';

    const card = document.createElement('div');
    card.className = `task-card ${roleBorderClass}`;
    card.setAttribute('draggable', 'true');
    card.dataset.taskId = task.id;

    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', task.id);
      card.style.opacity = '0.4';
    });
    card.addEventListener('dragend', () => {
      card.style.opacity = '1';
    });

    const prevCol = getAdjacentColumn(colStatus, -1);
    const nextCol = getAdjacentColumn(colStatus, 1);

    // Badges operacionais de RBAC (Impedimento / QA Aprovado)
    let badgesHtml = '';
    if (task.impediment) {
      badgesHtml += `<div class="task-impediment-badge" title="${task.impediment}">⚠️ ${task.impediment}</div>`;
    }
    if (task.qaApproved) {
      badgesHtml += `<div class="task-qa-approved-badge" title="Aprovado por ${task.qaReviewer || 'QA'}">✓ QA Aprovado</div>`;
    }

    // Botões operacionais contextuais
    let opBtnsHtml = '';
    if (perms.canLogTime) {
      opBtnsHtml += `<button class="task-timesheet-btn" onclick="openTimesheetModal('${task.id}')" title="Apontar Horas Gastas e Impedimentos">⏱️ Apontar</button>`;
    }
    if (colStatus === 'qa' && perms.canValidateQA) {
      opBtnsHtml += `<button class="task-qa-btn" onclick="openQAModal('${task.id}')" title="Validação Formal de QA">🧪 Validar QA</button>`;
    }

    // Auto-atribuição de demanda para Dev / QA
    let assignBtnHtml = '';
    const isAssignedToMe = currentUser && (
      task.assigneeId === currentUser.id ||
      (assignee && (assignee.id === currentUser.id || assignee.name.toLowerCase() === currentUser.name.toLowerCase()))
    );

    if (perms.canSelfAssign) {
      if (isAssignedToMe) {
        assignBtnHtml = `<button class="task-assigned-me-btn" onclick="unassignTask('${task.id}')" title="Demanda atribuída a você (clique para desatribuir se desejar)">✓ Minha Demanda</button>`;
      } else {
        assignBtnHtml = `<button class="task-self-assign-btn" onclick="selfAssignTask('${task.id}')" title="Assumir esta demanda para mim">🙋 Assumir</button>`;
      }
    }

    const isAdmin = currentUser && currentUser.role === 'admin';
    const isOverEstimated = task.hoursSpent && (parseFloat(task.hoursSpent) > (parseFloat(task.hours) || 8));
    const hoursText = task.hoursSpent ? `${task.hoursSpent}/${task.hours || 8}h` : `${task.hours || 8}h`;
    const hoursColor = isOverEstimated ? '#f43f5e' : 'var(--text-muted)';
    const hoursFontWeight = isOverEstimated ? '700' : 'normal';
    const hoursTitle = isAdmin 
      ? `👑 Admin: ${task.hoursSpent || 0}h apontadas / ${task.hours || 8}h estimadas. Clique para alterar o saldo de horas.` 
      : (isOverEstimated ? `⚠️ Horas apontadas (${task.hoursSpent}h) excederam a estimativa (${task.hours || 8}h)!` : 'Horas gastas / estimadas');

    card.innerHTML = `
      <div class="task-tags-row">
        <span class="task-role-tag ${task.role === 'frontend' ? 'role-front' : 'role-back'}">${roleLabel}</span>
        <span class="task-priority-tag ${priorityClass}">${task.priority}</span>
        <span style="font-size: 0.7rem; color: ${hoursColor}; font-weight: ${hoursFontWeight}; margin-left: auto; ${isAdmin ? 'cursor: pointer;' : ''}" title="${hoursTitle}" ${isAdmin ? `onclick="openTimesheetModal('${task.id}')"` : ''}>⏱️ ${hoursText}${isOverEstimated ? ' ⚠️' : ''}</span>
        
        <div class="card-header-actions" style="margin-left: 0.35rem;">
          <button class="card-btn-action" onclick="openTaskModalForEdit('${task.id}')" title="${perms.canCreateTask ? 'Editar Demanda' : 'Ver Detalhes'}">${perms.canCreateTask ? '✏️' : '👁️'}</button>
          ${perms.canDeleteTask ? `<button class="card-btn-action btn-del" onclick="confirmDeleteTask('${task.id}', '${task.title}')" title="Excluir Demanda">🗑️</button>` : ''}
        </div>
      </div>

      <div class="task-title">${task.title}</div>
      <div class="task-project-name">📁 ${project ? project.name : 'Geral'}</div>

      ${badgesHtml}

      <div class="task-footer-row">
        <div class="task-assignee-wrap" title="${assignee ? assignee.name : 'Sem responsável'}">
          <div class="task-avatar-mini" style="background: ${assignee ? assignee.avatarBg : '#64748b'}; color: #fff;">
            ${assignee ? assignee.name.charAt(0) : '?'}
          </div>
          <span style="color: var(--text-secondary);">${assignee ? assignee.name.split(' ')[0] : 'Livre'}</span>
        </div>
        ${assignBtnHtml}

        <div style="display: flex; align-items: center; gap: 0.35rem; margin-left: auto;">
          ${opBtnsHtml}
          <div class="task-actions-btn-group">
            ${prevCol ? `<button class="task-move-btn" onclick="moveTaskAction('${task.id}', '${prevCol}')" title="Mover para coluna anterior">◀</button>` : ''}
            ${nextCol ? `<button class="task-move-btn" onclick="moveTaskAction('${task.id}', '${nextCol}')" title="Mover para próxima coluna">▶</button>` : ''}
          </div>
        </div>
      </div>
    `;

    zone.appendChild(card);
  });

  columns.forEach(col => {
    const countEl = document.getElementById(`count-col-${col}`);
    if (countEl) countEl.textContent = counts[col] || 0;
  });
}

function getAdjacentColumn(current, direction) {
  const cols = ['backlog', 'spec', 'dev', 'qa', 'done'];
  const idx = cols.indexOf(current);
  const targetIdx = idx + direction;
  if (targetIdx >= 0 && targetIdx < cols.length) {
    return cols[targetIdx];
  }
  return null;
}

window.moveTaskAction = function(taskId, targetCol) {
  const colNames = {
    backlog: 'A Fazer (Backlog)',
    spec: 'Em Especificação',
    dev: 'Em Desenvolvimento',
    qa: 'Em Testes / Validação',
    done: 'Concluído'
  };
  store.moveTask(taskId, targetCol);
  renderKanban();
  renderDashboard();
  showToast(`Demanda movida para "${colNames[targetCol] || targetCol}"!`);
};

// Funções de CRUD & Auto-Atribuição de Demandas (Tarefas)
window.selfAssignTask = function(taskId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser) {
    showToast('Você precisa estar conectado para assumir uma demanda.');
    return;
  }

  const task = store.getTaskById(taskId);
  if (!task) return;

  let member = store.getTeamMembers().find(m => m.id === currentUser.id || m.name.toLowerCase() === currentUser.name.toLowerCase());
  let assigneeId = member ? member.id : currentUser.id;

  if (!member && currentUser.role === 'dev') {
    member = store.addMember({
      id: currentUser.id,
      name: currentUser.name,
      role: currentUser.devRole || 'frontend',
      seniority: currentUser.seniority || 'Pleno',
      skills: currentUser.skills || [],
      capacity: 40,
      avatarBg: currentUser.avatarBg || '#6366f1'
    });
    assigneeId = member.id;
  }

  task.assigneeId = assigneeId;
  store.saveState();
  if (typeof api !== 'undefined') {
    api.apiRequest(`/api/tasks/${taskId}/assign`, 'PUT', { assigneeId });
  }

  renderKanban();
  renderDashboard();
  showToast(`Demanda "${task.title}" atribuída a você com sucesso! 🙋`);
};

window.unassignTask = function(taskId) {
  const task = store.getTaskById(taskId);
  if (!task) return;

  task.assigneeId = null;
  store.saveState();
  if (typeof api !== 'undefined') {
    api.apiRequest(`/api/tasks/${taskId}/assign`, 'PUT', { assigneeId: null });
  }

  renderKanban();
  renderDashboard();
  showToast(`Demanda desatribuída com sucesso.`);
};

window.openTaskModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
  if (isDevOrQa) {
    showToast('Desenvolvedores e QAs não possuem permissão para criar demandas.');
    return;
  }

  ['task-title', 'task-project', 'task-requirement', 'task-role', 'task-assignee', 'task-priority', 'task-hours', 'task-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });

  const groupHoursSpent = document.getElementById('group-task-hours-spent');
  if (groupHoursSpent) groupHoursSpent.style.display = 'none';

  document.getElementById('modal-task-title').textContent = "🚀 Cadastrar Nova Demanda";
  document.getElementById('task-id-edit').value = "";
  document.getElementById('form-new-task').reset();
  document.getElementById('btn-save-task').textContent = "Salvar Demanda";
  document.getElementById('btn-save-task').style.display = 'inline-flex';
  openModal('modal-task');
};

window.openTaskModalForEdit = function(taskId) {
  const task = store.getTaskById(taskId);
  if (!task) return;

  populateModalSelects();

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
  const isAdmin = currentUser && currentUser.role === 'admin';

  document.getElementById('task-id-edit').value = task.id;
  document.getElementById('task-title').value = task.title;
  document.getElementById('task-project').value = task.projectId;
  document.getElementById('task-requirement').value = task.reqId || "";
  document.getElementById('task-role').value = task.role;
  document.getElementById('task-assignee').value = task.assigneeId || "";
  document.getElementById('task-priority').value = task.priority;
  document.getElementById('task-hours').value = task.hours || 8;
  document.getElementById('task-desc').value = task.desc || "";

  ['task-title', 'task-project', 'task-requirement', 'task-role', 'task-priority', 'task-hours', 'task-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isDevOrQa;
  });

  // Campo de Horas Apontadas (Apenas Admin pode editar)
  const groupHoursSpent = document.getElementById('group-task-hours-spent');
  const hoursSpentInput = document.getElementById('task-hours-spent');
  const badgeAdminHours = document.getElementById('badge-admin-hours');
  const hintAdminHours = document.getElementById('task-hours-spent-hint');

  if (groupHoursSpent) groupHoursSpent.style.display = 'block';
  if (hoursSpentInput) {
    hoursSpentInput.value = task.hoursSpent || 0;
    hoursSpentInput.disabled = !isAdmin;
  }
  if (badgeAdminHours) {
    badgeAdminHours.textContent = isAdmin ? '👑 Admin (Editável)' : '🔒 Apenas Admin';
    badgeAdminHours.style.background = isAdmin ? 'rgba(99, 102, 241, 0.25)' : 'rgba(148, 163, 184, 0.15)';
    badgeAdminHours.style.color = isAdmin ? '#818cf8' : '#94a3b8';
  }
  if (hintAdminHours) {
    hintAdminHours.textContent = isAdmin 
      ? 'Como Administrador, você pode alterar diretamente o total de horas apontadas desta demanda.' 
      : 'Apenas Administradores podem alterar o saldo de horas apontadas.';
  }

  if (isDevOrQa) {
    document.getElementById('modal-task-title').textContent = "📄 Detalhes da Demanda";
    const assigneeSelect = document.getElementById('task-assignee');
    if (assigneeSelect) assigneeSelect.disabled = false;
    document.getElementById('btn-save-task').textContent = "Salvar Atribuição";
    document.getElementById('btn-save-task').style.display = 'inline-flex';
  } else {
    document.getElementById('modal-task-title').textContent = "✏️ Editar Demanda";
    const assigneeSelect = document.getElementById('task-assignee');
    if (assigneeSelect) assigneeSelect.disabled = false;
    document.getElementById('btn-save-task').textContent = "Atualizar Demanda";
    document.getElementById('btn-save-task').style.display = 'inline-flex';
  }

  openModal('modal-task');
};

window.confirmDeleteTask = function(taskId, taskTitle) {
  if (confirm(`Tem certeza que deseja excluir a demanda "${taskTitle}"?`)) {
    store.deleteTask(taskId);
    refreshAllUI();
    showToast(`Demanda excluída com sucesso.`);
  }
};

window.openTimesheetModal = function(taskId) {
  const task = store.getTaskById(taskId);
  if (!task) return;

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isAdmin = currentUser && currentUser.role === 'admin';

  const idInput = document.getElementById('timesheet-task-id');
  const titleEl = document.getElementById('timesheet-task-title');
  const hoursInput = document.getElementById('timesheet-hours');
  const dateInput = document.getElementById('timesheet-date');
  const notesInput = document.getElementById('timesheet-notes');
  const impInput = document.getElementById('timesheet-impediment');

  if (idInput) idInput.value = task.id;
  if (titleEl) {
    const isOver = task.hoursSpent && (parseFloat(task.hoursSpent) > (parseFloat(task.hours) || 8));
    titleEl.innerHTML = `
      <div style="font-weight: 700; color: var(--text-primary); font-size: 0.95rem;">#${task.id} - ${task.title}</div>
      <div style="font-size: 0.8rem; font-weight: 500; margin-top: 4px; color: ${isOver ? '#f43f5e' : 'var(--text-secondary)'};">
        Total Apontado: <strong>${task.hoursSpent || 0}h</strong> / Estimativa: <strong>${task.hours || 8}h</strong>
        ${isOver ? ' <span style="background: rgba(244,63,94,0.2); padding: 1px 6px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; color: #fb7185;">⚠️ Carga Excedida</span>' : ''}
      </div>
    `;
  }
  if (hoursInput) hoursInput.value = "2";
  if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
  if (notesInput) notesInput.value = "";
  if (impInput) impInput.value = task.impediment || "";

  // Painel de ajuste exclusivo para Administrador
  const adminPanel = document.getElementById('timesheet-admin-adjust-panel');
  const adminTotalInput = document.getElementById('timesheet-admin-total-hours');
  const adminReasonInput = document.getElementById('timesheet-admin-reason');
  const adminFields = document.getElementById('timesheet-admin-fields');
  const toggleBtn = document.getElementById('btn-toggle-timesheet-mode');

  if (adminPanel) {
    if (isAdmin) {
      adminPanel.style.display = 'block';
      if (adminTotalInput) adminTotalInput.value = task.hoursSpent || 0;
      if (adminReasonInput) adminReasonInput.value = "";
      if (adminFields) adminFields.style.display = 'none';
      if (toggleBtn) toggleBtn.textContent = '✏️ Alterar Total';
    } else {
      adminPanel.style.display = 'none';
    }
  }

  openModal('modal-timesheet');
};

window.openQAModal = function(taskId) {
  const task = store.getTaskById(taskId);
  if (!task) return;

  const idInput = document.getElementById('qa-validation-task-id');
  const titleEl = document.getElementById('qa-task-title');
  const notesInput = document.getElementById('qa-validation-notes');
  const decisionSelect = document.getElementById('qa-decision');

  if (idInput) idInput.value = task.id;
  if (titleEl) titleEl.textContent = `#${task.id} - ${task.title}`;
  if (notesInput) notesInput.value = task.qaNotes || "";
  if (decisionSelect) decisionSelect.value = "approve";

  openModal('modal-qa-validation');
};

// --- RENDERIZAR ABA: EQUIPE (CRUD DE DESENVOLVEDORES) ---
function renderTeam() {
  const container = document.getElementById('team-cards-container');
  container.innerHTML = '';

  const members = store.getTeamMembers();

  if (members.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1;">
        <p style="font-size: 1.15rem; margin-bottom: 0.85rem;">Nenhum desenvolvedor encontrado com os filtros aplicados.</p>
        <button class="btn btn-primary" onclick="openMemberModalForCreate()">+ Adicionar Desenvolvedor</button>
      </div>
    `;
    return;
  }

  members.forEach(member => {
    const workload = store.calculateDevWorkload(member.id);
    const roleIcon = member.role === 'frontend' ? '🎨' : '⚙️';
    const roleColor = member.role === 'frontend' ? 'var(--front-accent)' : 'var(--back-accent)';
    const roleLabel = member.role === 'frontend' ? 'FRONT-END' : 'BACK-END';
    const statusBg = workload.percentage > 100 ? '#f43f5e' : (workload.percentage > 80 ? '#f59e0b' : '#10b981');

    const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
    const currentRole = currentUser ? currentUser.role : 'dev';
    const perms = RolePermissions[currentRole] || RolePermissions.dev;
    const isSelf = currentUser && (member.id === currentUser.id || member.name.toLowerCase() === currentUser.name.toLowerCase());

    const canEditMember = perms.canManageTeam || (perms.canEditSelf && isSelf);
    const canDeleteMember = perms.canManageTeam && !isSelf;

    let memberActionButtons = '';
    if (canEditMember) {
      memberActionButtons += `<button class="card-btn-action" onclick="openMemberModalForEdit('${member.id}')" title="${isSelf ? 'Editar Meus Dados de Equipe' : 'Editar Desenvolvedor'}">✏️</button>`;
    }
    if (canDeleteMember) {
      memberActionButtons += `<button class="card-btn-action btn-del" onclick="confirmDeleteMember('${member.id}', '${member.name}')" title="Excluir Desenvolvedor">🗑️</button>`;
    }

    const card = document.createElement('div');
    card.className = 'team-card glass-panel';
    card.innerHTML = `
      <div class="team-card-header">
        <div class="dev-avatar-lg" style="background: ${member.avatarBg}; color: #ffffff;">
          ${member.name.charAt(0)}
          <span class="dev-status-indicator" style="background: ${statusBg};" title="${workload.percentage > 100 ? 'Sobrecarga' : 'Disponível'}"></span>
        </div>
        <div class="dev-meta">
          <h3>${member.name}</h3>
          <div class="dev-role-title">
            <span style="color: ${roleColor}; font-weight: 700;">${roleIcon} ${roleLabel}</span>
            <span>•</span>
            <span>${member.seniority}</span>
          </div>
        </div>

        <div class="card-header-actions" style="margin-left: auto;">
          ${memberActionButtons}
        </div>
      </div>

      <div class="skills-pill-group">
        ${member.skills.map(s => `<span class="skill-pill">${s}</span>`).join('')}
      </div>

      <div class="capacity-section">
        <div class="capacity-text-row">
          <span>Carga Alocada: <strong>${workload.hours}h / ${workload.capacity}h</strong></span>
          <span style="color: ${statusBg}; font-weight: 700;">${workload.percentage}%</span>
        </div>
        <div class="progress-track" title="Total alocado/consumido: ${workload.hours}h (${workload.hoursSpent}h apontadas, ${workload.hoursEstimated}h estimadas)">
          <div class="progress-fill" style="width: ${Math.min(workload.percentage, 100)}%; background: ${statusBg}; ${workload.isOverloaded ? 'box-shadow: 0 0 10px rgba(244, 63, 94, 0.5);' : ''}"></div>
        </div>
        <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 0.4rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
          <span>${workload.activeTasksCount} demandas ativas atribuídas</span>
          <span>⏱️ ${workload.hoursSpent}h apontadas</span>
        </div>
        ${workload.isOverloaded ? `
          <div style="margin-top: 0.6rem; padding: 0.45rem 0.75rem; border-radius: 6px; background: rgba(244, 63, 94, 0.15); border: 1px solid rgba(244, 63, 94, 0.4); color: #f43f5e; font-size: 0.75rem; font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <span>⚠️</span>
            <span><strong>Sobrecarga:</strong> Carga horária semanal excedida em +${workload.overloadHours}h (${workload.percentage}% da capacidade).</span>
          </div>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });
}

// Funções de CRUD de Desenvolvedores
window.openMemberModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
  if (isDevOrQa) {
    showToast('Desenvolvedores e QAs não possuem permissão para cadastrar membros.');
    return;
  }
  document.getElementById('modal-member-title').textContent = "👤 Adicionar Desenvolvedor à Equipe";
  document.getElementById('member-id-edit').value = "";
  document.getElementById('form-new-member').reset();
  document.getElementById('member-capacity').value = 40;
  document.getElementById('btn-save-member').textContent = "Cadastrar Desenvolvedor";
  openModal('modal-member');
};

window.openMemberModalForEdit = function(memberId) {
  const member = store.getMemberById(memberId);
  if (!member) return;

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
  const isSelf = currentUser && (member.id === currentUser.id || member.name.toLowerCase() === currentUser.name.toLowerCase());

  if (isDevOrQa && !isSelf) {
    showToast('Você só possui permissão para editar o seu próprio perfil de usuário.');
    return;
  }

  document.getElementById('modal-member-title').textContent = isSelf ? "👤 Editar Meus Dados de Equipe" : "✏️ Editar Desenvolvedor";
  document.getElementById('member-id-edit').value = member.id;
  document.getElementById('member-name').value = member.name;
  document.getElementById('member-role').value = member.role;
  document.getElementById('member-seniority').value = member.seniority;
  document.getElementById('member-skills').value = Array.isArray(member.skills) ? member.skills.join(', ') : member.skills;
  document.getElementById('member-capacity').value = member.capacity;
  document.getElementById('btn-save-member').textContent = "Atualizar Desenvolvedor";
  openModal('modal-member');
};

window.confirmDeleteMember = function(memberId, memberName) {
  if (confirm(`Deseja remover "${memberName}" da equipe?\n\nAs demandas atribuídas a este desenvolvedor ficarão sem responsável.`)) {
    store.deleteMember(memberId);
    refreshAllUI();
    showToast(`Desenvolvedor "${memberName}" removido com sucesso.`);
  }
};

// --- RENDERIZAR ABA: TESTES & QA (CRUD DE CASOS DE TESTE) ---
function renderTesting() {
  const tests = store.getTestCases();
  const passed = tests.filter(t => t.status === 'pass').length;
  const pending = tests.filter(t => t.status === 'pending').length;
  const failed = tests.filter(t => t.status === 'fail').length;

  const reqs = store.state.requirements;
  const coveredReqs = new Set(tests.map(t => t.reqId)).size;
  const coveragePercent = reqs.length ? Math.round((coveredReqs / reqs.length) * 100) : 0;

  document.getElementById('tests-passed-count').textContent = passed;
  document.getElementById('tests-pending-count').textContent = pending;
  document.getElementById('tests-failed-count').textContent = failed;
  document.getElementById('tests-coverage-percent').textContent = `${coveragePercent}%`;

  // Alerta preventivo de carga horária excedida na tela de testes
  const members = store.state.teamMembers;
  const overloadedMembers = [];
  members.forEach(m => {
    const workload = store.calculateDevWorkload(m.id);
    if (workload.isOverloaded) {
      overloadedMembers.push(`${m.name} (${workload.hours}h / ${workload.capacity}h • ${workload.percentage}%)`);
    }
  });

  const testAlertBox = document.getElementById('testing-workload-alert');
  const testAlertText = document.getElementById('testing-workload-alert-text');
  if (testAlertBox && testAlertText) {
    if (overloadedMembers.length > 0) {
      testAlertBox.style.display = 'flex';
      testAlertText.textContent = `Atenção: ${overloadedMembers.length} profissional(is) com carga horária semanal excedida detectado(s): ${overloadedMembers.join(', ')}.`;
    } else {
      testAlertBox.style.display = 'none';
    }
  }

  const tbody = document.getElementById('test-cases-table-body');
  tbody.innerHTML = '';

  if (tests.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum caso de teste cadastrado.</td></tr>`;
    return;
  }

  tests.forEach(tc => {
    const req = store.getRequirementById(tc.reqId);
    const task = store.getTaskById(tc.taskId);
    const statusClass = tc.status === 'pass' ? 'status-pass' : (tc.status === 'fail' ? 'status-fail' : 'status-pending');
    const statusLabel = tc.status === 'pass' ? 'Aprovado' : (tc.status === 'fail' ? 'Reprovado' : 'Pendente');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="badge-subtle font-mono">${tc.id}</span></td>
      <td><strong>${tc.title}</strong><br><small style="color: var(--text-muted);">${tc.expected || ''}</small></td>
      <td><span class="badge-subtle">${tc.type}</span></td>
      <td>${req ? `<strong>${req.code}</strong>` : '-'}</td>
      <td>${task ? `#${task.id}` : '-'}</td>
      <td><span class="status-pill ${statusClass}">${statusLabel}</span></td>
      <td>
        <div class="task-actions-btn-group">
          <button class="task-move-btn" onclick="toggleTestStatusAction('${tc.id}', 'pass')" title="Marcar como Aprovado">✅</button>
          <button class="task-move-btn" onclick="toggleTestStatusAction('${tc.id}', 'fail')" title="Marcar como Reprovado">❌</button>
          <button class="task-move-btn" onclick="toggleTestStatusAction('${tc.id}', 'pending')" title="Marcar como Pendente">⏳</button>
          <button class="task-move-btn" onclick="openTestModalForEdit('${tc.id}')" title="Editar Caso de Teste">✏️</button>
          <button class="task-move-btn" onclick="confirmDeleteTestCase('${tc.id}', '${tc.title}')" title="Excluir Caso de Teste" style="color: #fb7185;">🗑️</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.toggleTestStatusAction = function(testId, status) {
  const statusNames = { pass: 'Aprovado', fail: 'Reprovado', pending: 'Pendente' };
  store.setTestStatus(testId, status);
  renderTesting();
  renderDashboard();
  showToast(`Caso de teste atualizado para "${statusNames[status] || status}"!`);
};

// Funções de CRUD de Casos de Testes
window.openTestModalForCreate = function() {
  document.getElementById('modal-test-title').textContent = "🧪 Cadastrar Caso de Teste";
  document.getElementById('test-id-edit').value = "";
  document.getElementById('form-new-test').reset();
  document.getElementById('btn-save-test').textContent = "Salvar Caso de Teste";
  openModal('modal-testcase');
};

window.openTestModalForEdit = function(testId) {
  const tc = store.getTestCaseById(testId);
  if (!tc) return;

  populateModalSelects();
  document.getElementById('modal-test-title').textContent = "✏️ Editar Caso de Teste";
  document.getElementById('test-id-edit').value = tc.id;
  document.getElementById('test-title').value = tc.title;
  document.getElementById('test-type-select').value = tc.type;
  document.getElementById('test-req-select').value = tc.reqId;
  document.getElementById('test-steps').value = tc.steps || "";
  document.getElementById('test-expected').value = tc.expected || "";
  document.getElementById('btn-save-test').textContent = "Atualizar Caso de Teste";

  openModal('modal-testcase');
};

window.confirmDeleteTestCase = function(testId, testTitle) {
  if (confirm(`Deseja realmente excluir o teste "${testTitle}"?`)) {
    store.deleteTestCase(testId);
    refreshAllUI();
    showToast(`Caso de teste excluído com sucesso.`);
  }
};

// --- RENDERIZAR ABA: GOVERNANÇA, SEGURANÇA E MATRIZ RBAC ---
function renderGovernance() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRoleKey = currentUser ? currentUser.role : 'admin';
  const perms = RolePermissions[currentRoleKey] || RolePermissions.admin;

  const badgeEl = document.getElementById('gov-current-role-badge');
  if (badgeEl) {
    badgeEl.textContent = `Seu Perfil Atual: ${perms.label}`;
    badgeEl.className = `badge-role-current ${perms.badgeClass}`;
  }

  const btnOpenUser = document.getElementById('btn-open-user-modal');
  if (btnOpenUser) {
    btnOpenUser.style.display = perms.canManageGovernance ? 'inline-flex' : 'none';
  }

  const allUsers = typeof authStore !== 'undefined' ? authStore.getUsers() : [];
  const usersCountEl = document.getElementById('gov-users-count');
  const usersSummaryEl = document.getElementById('gov-users-summary');
  if (usersCountEl) usersCountEl.textContent = allUsers.length;
  if (usersSummaryEl) usersSummaryEl.textContent = `${allUsers.length} usuários cadastrados`;

  const tbody = document.getElementById('gov-users-tbody');
  if (tbody) {
    tbody.innerHTML = '';
    allUsers.forEach(u => {
      const p = RolePermissions[u.role] || RolePermissions.dev;
      const tr = document.createElement('tr');
      const isYou = currentUser && currentUser.email.toLowerCase() === u.email.toLowerCase();

      let actionsHtml = '';
      if (perms.canManageGovernance) {
        actionsHtml = `
          <div style="display: flex; gap: 0.35rem; align-items: center;">
            <button class="btn btn-secondary btn-sm" onclick="openUserModalForEdit('${u.id}')" title="Editar Usuário e Papel">✏️ Editar</button>
            ${!isYou ? `<button class="btn btn-danger btn-sm" onclick="confirmDeleteUser('${u.id}', '${u.name}')" title="Excluir Usuário">🗑️ Excluir</button>` : ''}
          </div>
        `;
      } else {
        actionsHtml = `<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">🔒 Restrito</span>`;
      }

      const devRoleBadge = u.devRole ? ` <span class="task-role-tag ${u.devRole === 'backend' ? 'role-back' : 'role-front'}" style="margin-left: 4px;">${u.devRole === 'backend' ? 'Back' : 'Front'}</span>` : '';

      tr.innerHTML = `
        <td>
          <div style="display: flex; align-items: center; gap: 0.65rem;">
            <div style="width: 32px; height: 32px; border-radius: 50%; background: ${u.avatarBg || '#6366f1'}; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 0.8rem;">
              ${getInitials(u.name)}
            </div>
            <div>
              <strong>${u.name}</strong>
              ${isYou ? ' <span style="font-size: 0.72rem; color: var(--accent-primary); font-weight: 700; background: rgba(99, 102, 241, 0.15); padding: 1px 6px; border-radius: 4px;">Você</span>' : ''}
            </div>
          </div>
        </td>
        <td style="color: var(--text-secondary); font-size: 0.85rem;">${u.email}</td>
        <td><span class="user-badge-tag ${p.badgeClass}">${p.label}</span></td>
        <td style="color: var(--text-secondary); font-size: 0.85rem;">${u.seniority || '-'}${devRoleBadge}</td>
        <td><span class="status-pill status-pass">Ativo</span></td>
        <td>${actionsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// Funções de Gestão de Usuários (Administrador / Workspace Owner)
window.openUserModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem cadastrar novos usuários.');
    return;
  }

  document.getElementById('modal-admin-user-title').textContent = "👤 Cadastrar Novo Usuário";
  document.getElementById('admin-user-id-edit').value = "";
  document.getElementById('form-admin-user').reset();
  document.getElementById('admin-user-email').disabled = false;
  document.getElementById('label-admin-user-password').textContent = "Senha de Acesso *";
  document.getElementById('admin-user-password').required = true;
  document.getElementById('admin-user-password').placeholder = "Mínimo 6 caracteres";
  document.getElementById('hint-admin-user-password').style.display = 'none';
  document.getElementById('group-admin-user-devrole').style.display = 'block';
  document.getElementById('btn-save-admin-user').textContent = "Salvar Usuário";
  openModal('modal-admin-user');
};

window.openUserModalForEdit = function(userId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem gerenciar usuários.');
    return;
  }

  const user = typeof authStore !== 'undefined' ? authStore.getUsers().find(u => u.id === userId) : null;
  if (!user) {
    showToast('Usuário não localizado.');
    return;
  }

  document.getElementById('modal-admin-user-title').textContent = "✏️ Editar Usuário & Papel";
  document.getElementById('admin-user-id-edit').value = user.id;
  document.getElementById('admin-user-name').value = user.name;
  document.getElementById('admin-user-email').value = user.email;
  document.getElementById('admin-user-email').disabled = true; // Email fixo
  document.getElementById('admin-user-role').value = user.role || 'dev';
  document.getElementById('admin-user-devrole').value = user.devRole || 'backend';
  document.getElementById('admin-user-seniority').value = user.seniority || 'Pleno';
  document.getElementById('admin-user-password').value = "";
  document.getElementById('admin-user-password').required = false;
  document.getElementById('label-admin-user-password').textContent = "Nova Senha (Opcional)";
  document.getElementById('admin-user-password').placeholder = "Deixe em branco para manter a senha atual";
  document.getElementById('hint-admin-user-password').style.display = 'block';
  document.getElementById('admin-user-skills').value = Array.isArray(user.skills) ? user.skills.join(', ') : (user.skills || '');

  const isDev = user.role === 'dev';
  document.getElementById('group-admin-user-devrole').style.display = isDev ? 'block' : 'none';
  document.getElementById('btn-save-admin-user').textContent = "Atualizar Usuário";

  openModal('modal-admin-user');
};

window.confirmDeleteUser = async function(userId, userName) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem excluir usuários.');
    return;
  }

  if (confirm(`Tem certeza que deseja excluir o usuário "${userName}" do workspace?\n\nEle perderá imediatamente o acesso ao sistema.`)) {
    const res = await authStore.deleteUserByAdmin(userId);
    if (!res.success) {
      showToast(res.message);
      return;
    }
    showToast(`Usuário "${userName}" excluído com sucesso.`);
    refreshAllUI();
  }
};

// ==============================================================================
// 3. Executor Automatizado de Testes (Test Runner)
// ==============================================================================
async function runAutomatedTestSuite() {
  const runnerConsole = document.getElementById('runner-console');
  const runnerProgress = document.getElementById('runner-progress-bar');
  const statusBadge = document.getElementById('runner-status-badge');

  runnerConsole.innerHTML = '';
  runnerProgress.style.width = '0%';
  statusBadge.textContent = 'Executando testes automatizados...';
  statusBadge.style.color = '#38bdf8';

  function appendLog(message, type = 'info') {
    const time = new Date().toLocaleTimeString('pt-BR');
    const line = document.createElement('p');
    line.className = `console-line log-${type}`;
    line.innerHTML = `[${time}] ${message}`;
    runnerConsole.appendChild(line);
    runnerConsole.scrollTop = runnerConsole.scrollHeight;
  }

  appendLog("Iniciando Bateria de Testes de Qualidade do DevSquad v3.0 (CRUD Engine)...", "info");
  await delay(250);

  const testSteps = [
    {
      name: "1. Integridade de Schema e Cadastro dos Projetos (CRUD)",
      run: () => {
        const projects = store.getProjects();
        if (!projects || projects.length === 0) throw new Error("Nenhum projeto cadastrado no sistema.");
        const invalid = projects.filter(p => !p.id || !p.name);
        if (invalid.length > 0) throw new Error(`${invalid.length} projetos possuem dados cadastrais incompletos.`);
        return `${projects.length} projetos verificados com identificadores e códigos válidos.`;
      }
    },
    {
      name: "2. Validação de Requisitos Funcionais (RF) e Não-Funcionais (RNF)",
      run: () => {
        const reqs = store.state.requirements;
        if (!reqs || reqs.length === 0) throw new Error("Lista de requisitos vazia.");
        const invalid = reqs.filter(r => !r.code || !r.title || !r.bdd);
        if (invalid.length > 0) throw new Error(`${invalid.length} requisitos com dados obrigatórios ausentes.`);
        return `${reqs.length} especificações validadas (RF e RNF em conformidade).`;
      }
    },
    {
      name: "3. Sintaxe dos Critérios de Aceite BDD (Dado / Quando / Então)",
      run: () => {
        const reqs = store.state.requirements;
        let bddCount = 0;
        reqs.forEach(r => {
          if (r.bdd && r.bdd.includes("Dado") && r.bdd.includes("Quando") && r.bdd.includes("Então")) {
            bddCount++;
          }
        });
        return `${bddCount}/${reqs.length} requisitos possuem cenários com sintaxe válida (Dado/Quando/Então).`;
      }
    },
    {
      name: "4. Equilíbrio de Especialidades da Equipe (Front-end vs Back-end)",
      run: () => {
        const members = store.state.teamMembers;
        const front = members.filter(m => m.role === 'frontend').length;
        const back = members.filter(m => m.role === 'backend').length;
        if (front === 0 || back === 0) throw new Error("A equipe deve ter no mínimo 1 desenvolvedor Front-end e 1 Back-end.");
        return `Equipe balanceada: ${front} Front-ends e ${back} Back-ends ativos.`;
      }
    },
    {
      name: "5. Auditoria de Carga Horária e Alocação dos Desenvolvedores",
      run: () => {
        const members = store.state.teamMembers;
        const overloadedList = [];
        members.forEach(m => {
          const workload = store.calculateDevWorkload(m.id);
          if (workload.isOverloaded) {
            overloadedList.push(`${m.name} (${workload.hours}h / ${workload.capacity}h • ${workload.percentage}%)`);
          }
        });
        if (overloadedList.length > 0) {
          throw new Error(`ALERTA DE SOBRECARGA: ${overloadedList.length} profissional(is) com carga horária semanal excedida (> 40h/semana): ${overloadedList.join(', ')}.`);
        }
        return `Todos os ${members.length} profissionais estão com alocação saudável dentro da capacidade semanal.`;
      }
    },
    {
      name: "6. Máquina de Estados e Fluxo do Kanban",
      run: () => {
        const validStates = ['backlog', 'spec', 'dev', 'qa', 'done'];
        const invalidTasks = store.state.tasks.filter(t => !validStates.includes(t.status));
        if (invalidTasks.length > 0) throw new Error("Demandas com status incompatível com o fluxo.");
        return `Todas as ${store.state.tasks.length} demandas respeitam os estágios oficiais do fluxo.`;
      }
    }
  ];

  let passedTests = 0;

  for (let i = 0; i < testSteps.length; i++) {
    const step = testSteps[i];
    await delay(300);
    try {
      const resultMessage = step.run();
      appendLog(`✔ SUCESSO: ${step.name} - ${resultMessage}`, "pass");
      passedTests++;
    } catch (err) {
      appendLog(`✖ FALHA: ${step.name} - ${err.message}`, "fail");
    }
    const percent = Math.round(((i + 1) / testSteps.length) * 100);
    runnerProgress.style.width = `${percent}%`;
  }

  await delay(200);
  if (passedTests === testSteps.length) {
    statusBadge.textContent = '100% dos Testes Aprovados!';
    statusBadge.style.color = '#34d399';
    appendLog("🎉 Bateria de testes automatizados concluída com APROVAÇÃO TOTAL!", "pass");
  } else {
    statusBadge.textContent = `⚠️ ${passedTests}/${testSteps.length} Aprovados (${testSteps.length - passedTests} Alerta/Falha)`;
    statusBadge.style.color = '#f43f5e';
    appendLog(`⚠️ ATENÇÃO: ${testSteps.length - passedTests} teste(s) reprovaram ou emitiram alerta crítico de conformidade/sobrecarga.`, "warn");
  }
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==============================================================================
// 4. Modais, Formulários e Sincronização
// ==============================================================================

function populateModalSelects() {
  const projects = store.getProjects();
  const reqs = store.state.requirements;
  const members = store.state.teamMembers;

  const projectFilterSelect = document.getElementById('project-filter-select');
  if (projectFilterSelect) {
    const currentVal = store.selectedProject;
    projectFilterSelect.innerHTML = `<option value="all">📁 Todos os Projetos</option>`;
    projects.forEach(p => {
      projectFilterSelect.innerHTML += `<option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>${p.name}</option>`;
    });
  }

  const taskProjectSelect = document.getElementById('task-project');
  if (taskProjectSelect) {
    taskProjectSelect.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  const taskReqSelect = document.getElementById('task-requirement');
  if (taskReqSelect) {
    taskReqSelect.innerHTML = `<option value="">Nenhum (Demanda Avulsa)</option>` + 
      reqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
  }

  const taskAssigneeSelect = document.getElementById('task-assignee');
  if (taskAssigneeSelect) {
    taskAssigneeSelect.innerHTML = `<option value="">Sem responsável</option>` + 
      members.map(m => `<option value="${m.id}">${m.name} (${m.role === 'frontend' ? 'Front-end' : 'Back-end'})</option>`).join('');
  }

  const reqProjectSelect = document.getElementById('req-project');
  if (reqProjectSelect) {
    reqProjectSelect.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  }

  const testReqSelect = document.getElementById('test-req-select');
  if (testReqSelect) {
    testReqSelect.innerHTML = reqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
  }
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    populateModalSelects();
    modal.classList.add('show');
  }
}
window.openModal = openModal;

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('show');
  }
}
window.closeModal = closeModal;

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>✨</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function updateSidebarCounters() {
  const projCounter = document.getElementById('counter-nav-projects');
  const reqCounter = document.getElementById('counter-nav-req');
  const taskCounter = document.getElementById('counter-nav-tasks');
  const teamCounter = document.getElementById('counter-nav-team');
  const testCounter = document.getElementById('counter-nav-tests');
  const govCounter = document.getElementById('counter-nav-governance');

  if (projCounter) projCounter.textContent = store.state.projects.length;
  if (reqCounter) reqCounter.textContent = store.state.requirements.length;
  if (taskCounter) taskCounter.textContent = store.state.tasks.length;
  if (teamCounter) teamCounter.textContent = store.state.teamMembers.length;
  if (testCounter) testCounter.textContent = store.state.testCases.length;
  if (govCounter && typeof authStore !== 'undefined') {
    govCounter.textContent = authStore.getUsers().length;
  }
}

function switchView(viewName) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (perms && perms.allowedViews && !perms.allowedViews.includes(viewName)) {
    showToast(`Acesso restrito: seu perfil (${perms.label}) não tem permissão para acessar esta área.`);
    const fallbackView = perms.allowedViews.includes('kanban') ? 'kanban' : perms.allowedViews[0];
    switchView(fallbackView);
    return;
  }

  store.activeView = viewName;

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  document.querySelectorAll('.view-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  const activePanel = document.getElementById(`view-${viewName}`);
  if (activePanel) {
    activePanel.classList.add('active');
  }

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'projects') renderProjects();
  if (viewName === 'requirements') renderRequirements();
  if (viewName === 'kanban') renderKanban();
  if (viewName === 'team') renderTeam();
  if (viewName === 'testing') renderTesting();
  if (viewName === 'governance') renderGovernance();
}
window.switchView = switchView;

function applyRolePermissions(user) {
  if (!user) return;
  const roleKey = user.role || 'dev';
  const perms = RolePermissions[roleKey] || RolePermissions.dev;

  // 0. Sidebar de Navegação - Controle de Visibilidade por Perfil
  const allNavViews = [
    { id: 'nav-dashboard', view: 'dashboard' },
    { id: 'nav-projects', view: 'projects' },
    { id: 'nav-requirements', view: 'requirements' },
    { id: 'nav-kanban', view: 'kanban' },
    { id: 'nav-team', view: 'team' },
    { id: 'nav-testing', view: 'testing' },
    { id: 'nav-governance', view: 'governance' }
  ];

  allNavViews.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      const isAllowed = !perms.allowedViews || perms.allowedViews.includes(item.view);
      el.style.display = isAllowed ? 'flex' : 'none';
    }
  });

  // Se a aba atualmente ativa for restrita para o perfil, redireciona
  if (perms.allowedViews && !perms.allowedViews.includes(store.activeView)) {
    store.activeView = perms.allowedViews.includes('kanban') ? 'kanban' : perms.allowedViews[0];
  }

  // 1. Dropdown "+ Novo Item"
  const itemProject = document.getElementById('action-new-project');
  const itemTask = document.getElementById('action-new-task');
  const itemReq = document.getElementById('action-new-requirement');
  const itemTest = document.getElementById('action-new-test');
  const itemMember = document.getElementById('action-new-member');

  if (itemProject) itemProject.style.display = perms.canCreateProject ? 'flex' : 'none';
  if (itemTask) itemTask.style.display = perms.canCreateTask ? 'flex' : 'none';
  if (itemReq) itemReq.style.display = perms.canCreateReq ? 'flex' : 'none';
  if (itemTest) itemTest.style.display = perms.canCreateTest ? 'flex' : 'none';
  if (itemMember) itemMember.style.display = perms.canManageTeam ? 'flex' : 'none';

  // 2. Botões de Ação Direta nas Telas
  const btnProj = document.getElementById('btn-open-project-modal');
  const btnTask = document.getElementById('btn-open-task-modal');
  const btnReq = document.getElementById('btn-open-req-modal');
  const btnMember = document.getElementById('btn-open-member-modal');
  const btnTest = document.getElementById('btn-open-test-modal');
  const btnRunTests = document.getElementById('btn-run-all-tests');

  if (btnProj) btnProj.style.display = perms.canCreateProject ? 'inline-flex' : 'none';
  if (btnTask) btnTask.style.display = perms.canCreateTask ? 'inline-flex' : 'none';
  if (btnReq) btnReq.style.display = perms.canCreateReq ? 'inline-flex' : 'none';
  if (btnMember) btnMember.style.display = perms.canManageTeam ? 'inline-flex' : 'none';
  if (btnTest) btnTest.style.display = perms.canCreateTest ? 'inline-flex' : 'none';
  if (btnRunTests) btnRunTests.style.display = perms.canRunTests ? 'inline-flex' : 'none';

  const btnNewMenu = document.getElementById('btn-open-new-menu');
  if (btnNewMenu) {
    btnNewMenu.style.display = perms.allowedNewItems.length > 0 ? 'inline-flex' : 'none';
  }
}

function refreshAllUI() {
  populateModalSelects();
  updateSidebarCounters();
  if (typeof authStore !== 'undefined') {
    applyRolePermissions(authStore.getCurrentUser());
  }
  switchView(store.activeView);
}

// ==============================================================================
// 4.1 Utilitários de Interface para Autenticação & Usuários
// ==============================================================================

function getInitials(name) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function showAuthAlert(message, type = 'error') {
  const alertEl = document.getElementById('auth-alert');
  if (!alertEl) return;
  alertEl.className = `auth-alert ${type}`;
  const icon = type === 'error' ? '⚠️' : (type === 'success' ? '✅' : 'ℹ️');
  alertEl.innerHTML = `
    <span class="alert-icon">${icon}</span>
    <span class="alert-message">${message}</span>
  `;
  alertEl.style.display = 'flex';
}

function clearAuthAlert() {
  const alertEl = document.getElementById('auth-alert');
  if (alertEl) {
    alertEl.style.display = 'none';
    alertEl.className = 'auth-alert';
    alertEl.innerHTML = '';
  }
}

function switchAuthTab(tab) {
  clearAuthAlert();
  const tabLoginContent = document.getElementById('auth-tab-login');
  if (tabLoginContent) tabLoginContent.style.display = 'block';
  document.getElementById('login-email')?.focus();
}

function updateTopbarUserUI(user) {
  if (!user) return;
  const initials = getInitials(user.name);

  const topbarAvatar = document.getElementById('topbar-user-avatar');
  const topbarName = document.getElementById('topbar-user-name');
  const topbarRole = document.getElementById('topbar-user-role');

  const dropAvatar = document.getElementById('dropdown-user-avatar-lg');
  const dropName = document.getElementById('dropdown-user-name');
  const dropEmail = document.getElementById('dropdown-user-email');
  const dropBadge = document.getElementById('dropdown-user-badge');

  let roleLabel = '💻 Desenvolvedor';
  let badgeClass = 'tag-back';

  if (user.role === 'admin') {
    roleLabel = '👑 Administrador';
    badgeClass = 'tag-admin';
  } else if (user.role === 'pm') {
    roleLabel = '📊 Gestor (PM)';
    badgeClass = 'tag-pm';
  } else if (user.role === 'qa') {
    roleLabel = '🧪 QA Lead';
    badgeClass = 'tag-qa';
  } else if (user.devRole === 'backend') {
    roleLabel = '⚙️ Dev Back-end';
    badgeClass = 'tag-back';
  } else if (user.devRole === 'frontend') {
    roleLabel = '🎨 Dev Front-end';
    badgeClass = 'tag-front';
  }

  if (topbarAvatar) {
    topbarAvatar.textContent = initials;
    if (user.avatarBg) topbarAvatar.style.backgroundColor = user.avatarBg;
  }
  if (topbarName) topbarName.textContent = user.name;
  if (topbarRole) topbarRole.textContent = roleLabel;

  if (dropAvatar) {
    dropAvatar.textContent = initials;
    if (user.avatarBg) dropAvatar.style.backgroundColor = user.avatarBg;
  }
  if (dropName) dropName.textContent = user.name;
  if (dropEmail) dropEmail.textContent = user.email;
  if (dropBadge) {
    const seniorityText = user.seniority ? ` (${user.seniority})` : '';
    dropBadge.textContent = `${roleLabel}${seniorityText}`;
    dropBadge.className = `user-badge-tag ${badgeClass}`;
  }

  applyRolePermissions(user);
}

function setupAuthEventListeners() {
  // 1. Chips de Contas Demo (1 clique)
  document.querySelectorAll('.demo-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const email = chip.dataset.demoEmail;
      const pass = chip.dataset.demoPass;
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput && passInput) {
        emailInput.value = email;
        passInput.value = pass;
        clearAuthAlert();
        chip.style.transform = 'scale(0.96)';
        setTimeout(() => { chip.style.transform = ''; }, 150);
        document.getElementById('btn-submit-login')?.focus();
      }
    });
  });

  // 2. Mostrar / Ocultar Senha
  document.querySelectorAll('.btn-toggle-pwd').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });

  // 3. Submissão do Formulário de Login Corporativo
  const loginForm = document.getElementById('form-auth-login');
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearAuthAlert();

      const email = document.getElementById('login-email')?.value.trim();
      const password = document.getElementById('login-password')?.value;

      if (!email || !password) {
        showAuthAlert('Preencha seu e-mail e senha de acesso.', 'error');
        return;
      }

      const result = await authStore.login(email, password);
      if (!result.success) {
        showAuthAlert(result.message, 'error');
        return;
      }

      showToast(`Login realizado com sucesso! Bem-vindo(a), ${result.user.name}!`);
      document.getElementById('auth-screen')?.classList.add('hidden');
      document.getElementById('alm-container')?.classList.remove('hidden');
      updateTopbarUserUI(result.user);
      loginForm.reset();
      refreshAllUI();
    });
  }

  // 4. Gestão de Usuários (Administrador / Workspace Owner)
  const adminRoleSelect = document.getElementById('admin-user-role');
  const adminSenioritySelect = document.getElementById('admin-user-seniority');
  const groupAdminDevRole = document.getElementById('group-admin-user-devrole');

  if (adminRoleSelect) {
    adminRoleSelect.addEventListener('change', () => {
      const val = adminRoleSelect.value;
      if (groupAdminDevRole) {
        groupAdminDevRole.style.display = val === 'dev' ? 'block' : 'none';
      }
      if (adminSenioritySelect) {
        if (val === 'admin') {
          adminSenioritySelect.innerHTML = `
            <option value="Workspace Owner / Diretor" selected>Workspace Owner / Diretor</option>
            <option value="Tech Lead / Gestão">Tech Lead / Gestão</option>
            <option value="Gerente de Engenharia">Gerente de Engenharia</option>
          `;
        } else if (val === 'pm') {
          adminSenioritySelect.innerHTML = `
            <option value="Scrum Master" selected>Scrum Master</option>
            <option value="Project Manager (PM)">Project Manager (PM)</option>
            <option value="Agile Coach">Agile Coach</option>
          `;
        } else if (val === 'qa') {
          adminSenioritySelect.innerHTML = `
            <option value="QA Lead / Homologadora" selected>QA Lead / Homologadora</option>
            <option value="Analista de Qualidade Pleno">Analista de Qualidade Pleno</option>
            <option value="Engenheiro de Automação de Testes">Engenheiro de Automação de Testes</option>
          `;
        } else {
          adminSenioritySelect.innerHTML = `
            <option value="Júnior">Júnior</option>
            <option value="Pleno" selected>Pleno</option>
            <option value="Sênior">Sênior</option>
            <option value="Especialista">Especialista / Lead</option>
          `;
        }
      }
    });
  }

  const btnOpenUserModal = document.getElementById('btn-open-user-modal');
  if (btnOpenUserModal) {
    btnOpenUserModal.addEventListener('click', () => {
      window.openUserModalForCreate();
    });
  }

  const formAdminUser = document.getElementById('form-admin-user');
  if (formAdminUser) {
    formAdminUser.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentUser = authStore.getCurrentUser();
      if (!currentUser || currentUser.role !== 'admin') {
        showToast('Apenas administradores do sistema possuem permissão para gerenciar contas.');
        return;
      }

      const id = document.getElementById('admin-user-id-edit')?.value;
      const name = document.getElementById('admin-user-name')?.value.trim();
      const email = document.getElementById('admin-user-email')?.value.trim();
      const role = document.getElementById('admin-user-role')?.value;
      const devRole = role === 'dev' ? document.getElementById('admin-user-devrole')?.value : null;
      const seniority = document.getElementById('admin-user-seniority')?.value;
      const skills = document.getElementById('admin-user-skills')?.value;
      const password = document.getElementById('admin-user-password')?.value;

      if (!name) {
        showToast('Por favor, informe o nome completo.');
        return;
      }

      if (!id) {
        // Novo Usuário
        if (!email || !password) {
          showToast('E-mail corporativo e senha são obrigatórios.');
          return;
        }
        if (password.length < 6) {
          showToast('A senha deve conter no mínimo 6 caracteres.');
          return;
        }

        const res = await authStore.createUserByAdmin({
          name,
          email,
          role,
          devRole,
          seniority,
          skills,
          password
        });

        if (!res.success) {
          showToast(res.message || 'Erro ao cadastrar usuário.');
          return;
        }

        showToast(`Usuário "${name}" cadastrado com sucesso!`);
      } else {
        // Edição de Usuário Existente
        if (password && password.length < 6) {
          showToast('A nova senha deve conter no mínimo 6 caracteres.');
          return;
        }

        const res = await authStore.updateUserByAdmin(id, {
          name,
          role,
          devRole,
          seniority,
          skills,
          password: password ? password : undefined
        });

        if (!res.success) {
          showToast(res.message || 'Erro ao atualizar usuário.');
          return;
        }

        showToast(`Usuário "${name}" atualizado com sucesso!`);
      }

      closeModal('modal-admin-user');
      refreshAllUI();
    });
  }

  // 8. Dropdown do Perfil no Topbar
  const btnUserProfile = document.getElementById('btn-user-profile');
  const userProfileMenu = document.getElementById('user-profile-menu');
  const dropdownUserProfile = document.getElementById('dropdown-user-profile');

  if (btnUserProfile && userProfileMenu) {
    btnUserProfile.addEventListener('click', (e) => {
      e.stopPropagation();
      userProfileMenu.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
      if (!dropdownUserProfile?.contains(e.target)) {
        userProfileMenu.classList.remove('show');
      }
    });
  }

  // 8.1 Botão Meu Perfil (Edição do próprio usuário)
  const btnMyProfile = document.getElementById('btn-open-my-profile');
  if (btnMyProfile) {
    btnMyProfile.addEventListener('click', () => {
      userProfileMenu?.classList.remove('show');
      openMyProfileModal();
    });
  }

  // 9. Botão Sair da Conta (Logout)
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      userProfileMenu?.classList.remove('show');
      authStore.logout();
      document.getElementById('alm-container')?.classList.add('hidden');
      document.getElementById('auth-screen')?.classList.remove('hidden');
      switchAuthTab('login');
      showAuthAlert('Sessão encerrada com sucesso.', 'info');
      showToast('Você saiu da sua conta.');
    });
  }
}

// ==============================================================================
// 5. Inicialização e Event Listeners
// ==============================================================================
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('devsquad_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  // Inicializa Listeners de Autenticação e Topbar
  setupAuthEventListeners();

  // Verificação de Sessão Ativa
  const currentUser = authStore.getCurrentUser();
  if (currentUser) {
    document.getElementById('auth-screen')?.classList.add('hidden');
    document.getElementById('alm-container')?.classList.remove('hidden');
    updateTopbarUserUI(currentUser);
    refreshAllUI();
  } else {
    document.getElementById('alm-container')?.classList.add('hidden');
    document.getElementById('auth-screen')?.classList.remove('hidden');
    switchAuthTab('login');
  }

  // Checagem de Conexão com Backend SQLite e Sincronização Automática
  if (typeof api !== 'undefined') {
    api.checkHealth().then(online => {
      if (online && typeof store !== 'undefined') {
        store.syncWithBackend();
      }
    });

    // Monitoramento periódico (heartbeat) a cada 15s
    setInterval(() => {
      api.checkHealth();
    }, 15000);
  }

  // Navegação da Sidebar
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const view = item.dataset.view;
      if (view) switchView(view);
      document.getElementById('alm-sidebar').classList.remove('mobile-open');
    });
  });

  // Toggle da Sidebar Lateral
  const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
  const sidebar = document.getElementById('alm-sidebar');
  if (sidebarToggleBtn && sidebar) {
    sidebarToggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      sidebarToggleBtn.textContent = sidebar.classList.contains('collapsed') ? '▶' : '◀';
    });
  }

  // Menu Mobile
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  if (mobileMenuBtn && sidebar) {
    mobileMenuBtn.addEventListener('click', () => {
      sidebar.classList.toggle('mobile-open');
    });
  }

  // Dropdown "+ Novo Item"
  const btnNewMenu = document.getElementById('btn-open-new-menu');
  const newMenuDropdown = document.getElementById('new-item-menu');
  if (btnNewMenu && newMenuDropdown) {
    btnNewMenu.addEventListener('click', (e) => {
      e.stopPropagation();
      newMenuDropdown.classList.toggle('show');
    });

    document.addEventListener('click', () => {
      newMenuDropdown.classList.remove('show');
    });
  }

  // Ações do Dropdown "+ Novo"
  document.getElementById('action-new-project')?.addEventListener('click', () => openProjectModalForCreate());
  document.getElementById('action-new-task')?.addEventListener('click', () => openTaskModalForCreate());
  document.getElementById('action-new-requirement')?.addEventListener('click', () => openReqModalForCreate());
  document.getElementById('action-new-test')?.addEventListener('click', () => openTestModalForCreate());
  document.getElementById('action-new-member')?.addEventListener('click', () => openMemberModalForCreate());

  // Botões de Ação Direta nas Telas
  document.getElementById('btn-open-project-modal')?.addEventListener('click', () => openProjectModalForCreate());
  document.getElementById('btn-open-task-modal')?.addEventListener('click', () => openTaskModalForCreate());
  document.getElementById('btn-open-req-modal')?.addEventListener('click', () => openReqModalForCreate());
  document.getElementById('btn-open-member-modal')?.addEventListener('click', () => openMemberModalForCreate());
  document.getElementById('btn-open-test-modal')?.addEventListener('click', () => openTestModalForCreate());

  // Fechamento de Modais
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      closeModal(btn.dataset.close);
    });
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.classList.remove('show');
    });
  });

  // Alternador de Tema
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('devsquad_theme', newTheme);
  });

  // Filtro Global de Projetos no Topbar
  document.getElementById('project-filter-select')?.addEventListener('change', (e) => {
    store.selectedProject = e.target.value;
    refreshAllUI();
  });

  // Busca Global Instantânea
  document.getElementById('global-search-input')?.addEventListener('input', (e) => {
    store.searchQuery = e.target.value;
    refreshAllUI();
  });

  // Filtros da Aba de Projetos
  document.querySelectorAll('#project-status-filter .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#project-status-filter .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.projectStatusFilter = btn.dataset.status;
      renderProjects();
    });
  });

  // Filtros de Requisitos
  document.querySelectorAll('#req-type-filter .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#req-type-filter .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.reqTypeFilter = btn.dataset.type;
      renderRequirements();
    });
  });

  document.getElementById('req-moscow-filter')?.addEventListener('change', (e) => {
    store.reqMoscowFilter = e.target.value;
    renderRequirements();
  });

  // Filtros do Kanban
  document.querySelectorAll('#kanban-role-filter .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#kanban-role-filter .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.kanbanRoleFilter = btn.dataset.role;
      renderKanban();
    });
  });

  document.getElementById('kanban-priority-filter')?.addEventListener('change', (e) => {
    store.kanbanPriorityFilter = e.target.value;
    renderKanban();
  });

  // Filtro de Escopo do Kanban (Todas vs Minhas Demandas)
  document.querySelectorAll('#kanban-scope-filter .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#kanban-scope-filter .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.kanbanScopeFilter = btn.dataset.scope;
      renderKanban();
    });
  });

  // Filtros da Equipe
  document.querySelectorAll('#team-role-filter .segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#team-role-filter .segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.teamRoleFilter = btn.dataset.teamRole;
      renderTeam();
    });
  });

  // Filtros de Testes
  document.getElementById('test-type-filter')?.addEventListener('change', (e) => {
    store.testTypeFilter = e.target.value;
    renderTesting();
  });

  // Botões do Test Runner
  document.getElementById('btn-run-all-tests')?.addEventListener('click', () => {
    runAutomatedTestSuite();
  });

  document.getElementById('btn-clear-runner-logs')?.addEventListener('click', () => {
    document.getElementById('runner-console').innerHTML = '<p class="console-line text-muted">Console limpo. Pronto para nova execução.</p>';
    document.getElementById('runner-progress-bar').style.width = '0%';
    document.getElementById('runner-status-badge').textContent = 'Pronto para Execução';
    document.getElementById('runner-status-badge').style.color = '#fbbf24';
  });

  // Drag & Drop no Kanban
  document.querySelectorAll('.kanban-cards-dropzone').forEach(zone => {
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });

    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const taskId = e.dataTransfer.getData('text/plain');
      const colStatus = zone.closest('.kanban-column').dataset.status;

      if (taskId && colStatus) {
        store.moveTask(taskId, colStatus);
        renderKanban();
        renderDashboard();
        showToast(`Demanda movida com sucesso!`);
      }
    });
  });

  // ============================================================================
  // SUBMISSÃO DOS FORMULÁRIOS DE CRUD (CRIAÇÃO OU ATUALIZAÇÃO)
  // ============================================================================

  // 1. FORMULÁRIO DE PROJETO (CRUD)
  document.getElementById('form-project')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
    const currentRole = currentUser ? currentUser.role : 'dev';
    const perms = RolePermissions[currentRole] || RolePermissions.dev;
    const editId = document.getElementById('project-id-edit').value;

    if (editId && !perms.canEditProject) {
      showToast('Desenvolvedores não possuem permissão para editar projetos.');
      return;
    }
    if (!editId && !perms.canCreateProject) {
      showToast('Desenvolvedores não possuem permissão para cadastrar projetos.');
      return;
    }

    const name = document.getElementById('project-name-input').value;
    const code = document.getElementById('project-code-input').value;
    const desc = document.getElementById('project-desc-input').value;
    const status = document.getElementById('project-status-input').value;
    const deadline = document.getElementById('project-deadline-input').value;
    const color = document.getElementById('project-color-input').value;

    if (editId) {
      store.updateProject(editId, { name, code, desc, status, deadline, color });
      showToast(`Projeto "${name}" atualizado com sucesso!`);
    } else {
      store.addProject({ name, code, desc, status, deadline, color });
      showToast(`Novo projeto "${name}" criado com sucesso!`);
    }

    closeModal('modal-project');
    refreshAllUI();
  });

  // 2. FORMULÁRIO DE DEMANDA / KANBAN (CRUD & ATRIBUIÇÃO)
  document.getElementById('form-new-task')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentUser = authStore.getCurrentUser();
    const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
    const editId = document.getElementById('task-id-edit').value;

    if (!editId && isDevOrQa) {
      showToast('Desenvolvedores e QAs não possuem permissão para criar demandas.');
      return;
    }

    if (editId && isDevOrQa) {
      const assigneeId = document.getElementById('task-assignee').value;
      store.updateTask(editId, { assigneeId });
      showToast('Atribuição da demanda atualizada com sucesso!');
      closeModal('modal-task');
      refreshAllUI();
      return;
    }

    const title = document.getElementById('task-title').value;
    const projectId = document.getElementById('task-project').value;
    const reqId = document.getElementById('task-requirement').value;
    const role = document.getElementById('task-role').value;
    const assigneeId = document.getElementById('task-assignee').value;
    const priority = document.getElementById('task-priority').value;
    const hours = document.getElementById('task-hours').value;
    const desc = document.getElementById('task-desc').value;

    if (editId) {
      const updateData = { title, projectId, reqId, role, assigneeId, priority, hours, desc };
      const isAdmin = currentUser && currentUser.role === 'admin';
      if (isAdmin) {
        const spentVal = document.getElementById('task-hours-spent')?.value;
        if (spentVal !== undefined && spentVal !== '') {
          updateData.hoursSpent = Math.max(0, parseFloat(spentVal) || 0);
        }
      }
      store.updateTask(editId, updateData);
      showToast(`Demanda "${title}" atualizada com sucesso!`);
    } else {
      store.addTask({ title, projectId, reqId, role, assigneeId, priority, hours, desc });
      showToast(`Nova demanda "${title}" criada com sucesso!`);
    }

    closeModal('modal-task');
    e.target.reset();
    refreshAllUI();
  });

  // 3. FORMULÁRIO DE REQUISITO (CRUD)
  document.getElementById('form-new-req')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
    const currentRole = currentUser ? currentUser.role : 'dev';
    const perms = RolePermissions[currentRole] || RolePermissions.dev;
    const editId = document.getElementById('req-id-edit').value;

    if (editId && !perms.canEditReq) {
      showToast('Desenvolvedores não possuem permissão para editar requisitos.');
      return;
    }
    if (!editId && !perms.canCreateReq) {
      showToast('Desenvolvedores não possuem permissão para cadastrar requisitos.');
      return;
    }

    const title = document.getElementById('req-title').value;
    const code = document.getElementById('req-code').value;
    const projectId = document.getElementById('req-project').value;
    const type = document.getElementById('req-type').value;
    const moscow = document.getElementById('req-moscow').value;
    const userStory = document.getElementById('req-user-story').value;
    const bdd = document.getElementById('req-bdd').value;

    if (editId) {
      store.updateRequirement(editId, { title, code, projectId, type, moscow, userStory, bdd });
      showToast(`Requisito ${code} atualizado com sucesso!`);
    } else {
      store.addRequirement({ title, code, projectId, type, moscow, userStory, bdd });
      showToast(`Requisito ${code} registrado com sucesso!`);
    }

    closeModal('modal-requirement');
    e.target.reset();
    refreshAllUI();
  });

  // 4. FORMULÁRIO DE CASO DE TESTE (CRUD)
  document.getElementById('form-new-test')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('test-id-edit').value;
    const title = document.getElementById('test-title').value;
    const type = document.getElementById('test-type-select').value;
    const reqId = document.getElementById('test-req-select').value;
    const steps = document.getElementById('test-steps').value;
    const expected = document.getElementById('test-expected').value;

    if (editId) {
      store.updateTestCase(editId, { title, type, reqId, steps, expected });
      showToast(`Caso de teste atualizado com sucesso!`);
    } else {
      store.addTestCase({ title, type, reqId, steps, expected });
      showToast(`Novo caso de teste registrado com sucesso!`);
    }

    closeModal('modal-testcase');
    e.target.reset();
    refreshAllUI();
  });

  // 5. FORMULÁRIO DE DESENVOLVEDOR (CRUD)
  document.getElementById('form-new-member')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('member-id-edit').value;
    const name = document.getElementById('member-name').value;
    const role = document.getElementById('member-role').value;
    const seniority = document.getElementById('member-seniority').value;
    const skills = document.getElementById('member-skills').value;
    const capacity = document.getElementById('member-capacity').value;

    const currentUser = authStore.getCurrentUser();
    const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');

    if (!editId && isDevOrQa) {
      showToast('Desenvolvedores e QAs não possuem permissão para cadastrar membros.');
      return;
    }

    if (editId) {
      const member = store.getMemberById(editId);
      const isSelf = currentUser && (editId === currentUser.id || (member && member.name.toLowerCase() === currentUser.name.toLowerCase()));
      if (isDevOrQa && !isSelf) {
        showToast('Você só pode editar o seu próprio perfil de usuário.');
        return;
      }
      store.updateMember(editId, { name, role, seniority, skills, capacity });
      showToast(`Desenvolvedor "${name}" atualizado com sucesso!`);
    } else {
      const cleanName = (name || '').trim();
      const existing = store.state.teamMembers.find(m => m.name.toLowerCase().trim() === cleanName.toLowerCase());
      if (existing) {
        showToast(`Membro "${cleanName}" já existe na equipe. Dados atualizados!`);
        store.updateMember(existing.id, { name: cleanName, role, seniority, skills, capacity });
      } else {
        store.addMember({ name: cleanName, role, seniority, skills, capacity });
        showToast(`Desenvolvedor "${cleanName}" adicionado à equipe!`);
      }
    }

    closeModal('modal-member');
    e.target.reset();
    refreshAllUI();
  });

  // 6. FORMULÁRIO DE APONTAMENTO DE HORAS / TIMESHEET (MEMBRO EXECUTOR / DEV)
  document.getElementById('form-timesheet')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const taskId = document.getElementById('timesheet-task-id').value;
    const hours = document.getElementById('timesheet-hours').value;
    const date = document.getElementById('timesheet-date').value;
    const notes = document.getElementById('timesheet-notes').value;
    const impediment = document.getElementById('timesheet-impediment').value;
    const currentUser = authStore.getCurrentUser();
    const author = currentUser ? currentUser.name : "Desenvolvedor";

    store.logTaskTime(taskId, hours, date, notes, impediment, author);
    closeModal('modal-timesheet');
    e.target.reset();
    refreshAllUI();
    showToast(`Apontamento de ${hours}h registrado com sucesso!`);
  });

  // Alternar painel de ajuste de horas do administrador no timesheet
  document.getElementById('btn-toggle-timesheet-mode')?.addEventListener('click', () => {
    const adminFields = document.getElementById('timesheet-admin-fields');
    const toggleBtn = document.getElementById('btn-toggle-timesheet-mode');
    if (adminFields) {
      const isHidden = adminFields.style.display === 'none';
      adminFields.style.display = isHidden ? 'block' : 'none';
      if (toggleBtn) {
        toggleBtn.textContent = isHidden ? '✕ Fechar Ajuste' : '✏️ Alterar Total';
      }
    }
  });

  // Salvar ajuste administrativo de horas apontadas
  document.getElementById('btn-save-admin-hours-override')?.addEventListener('click', () => {
    const taskId = document.getElementById('timesheet-task-id')?.value;
    const totalVal = document.getElementById('timesheet-admin-total-hours')?.value;
    const reason = document.getElementById('timesheet-admin-reason')?.value || 'Ajuste administrativo de horas';
    
    if (!taskId) return;
    if (totalVal === '' || isNaN(parseFloat(totalVal)) || parseFloat(totalVal) < 0) {
      showToast('Por favor, informe um valor válido de horas (maior ou igual a zero).');
      return;
    }

    const newHoursSpent = parseFloat(totalVal);
    store.adjustTaskHours(taskId, newHoursSpent, reason);
    closeModal('modal-timesheet');
    refreshAllUI();
    showToast(`Horas apontadas da demanda #${taskId} atualizadas para ${newHoursSpent}h!`);
  });

  // 7. FORMULÁRIO DE VALIDAÇÃO FORMAL DE QUALIDADE (QA / REVISOR)
  document.getElementById('form-qa-validation')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const taskId = document.getElementById('qa-validation-task-id').value;
    const decision = document.getElementById('qa-decision').value;
    const notes = document.getElementById('qa-validation-notes').value;
    const currentUser = authStore.getCurrentUser();
    const reviewer = currentUser ? currentUser.name : "QA Lead";

    store.validateTaskQA(taskId, decision, notes, reviewer);
    closeModal('modal-qa-validation');
    e.target.reset();
    refreshAllUI();
    if (decision === 'approve') {
      showToast(`Demanda aprovada pela Qualidade e movida para Concluído!`);
    } else {
      showToast(`Demanda reprovada com bloqueio e retornada para Desenvolvimento.`);
    }
  });

  // 8. FORMULÁRIO DE EDIÇÃO DO MEU PERFIL DE USUÁRIO
  document.getElementById('form-user-profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const currentUser = authStore.getCurrentUser();
    if (!currentUser) return;

    const newName = document.getElementById('profile-name').value.trim();
    const newSeniority = document.getElementById('profile-seniority').value.trim();
    const newSkillsStr = document.getElementById('profile-skills').value.trim();
    const newPassword = document.getElementById('profile-password').value;

    if (!newName || !newSeniority) {
      showToast('Preencha os campos obrigatórios (*).');
      return;
    }

    if (newPassword && newPassword.length < 6) {
      showToast('A nova senha deve ter no mínimo 6 caracteres.');
      return;
    }

    const parsedSkills = newSkillsStr ? newSkillsStr.split(',').map(s => s.trim()).filter(Boolean) : [];

    const updatedData = {
      name: newName,
      seniority: newSeniority,
      skills: parsedSkills
    };
    if (newPassword) {
      updatedData.password = newPassword;
    }

    // Atualiza via API backend no SQLite
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.apiRequest(`/api/users/${currentUser.id}`, 'PUT', updatedData);
      if (res && res.success && res.user) {
        currentUser.name = res.user.name;
        currentUser.seniority = res.user.seniority;
        currentUser.skills = res.user.skills;
        if (newPassword) currentUser.password = newPassword;
      }
    } else {
      currentUser.name = newName;
      currentUser.seniority = newSeniority;
      currentUser.skills = parsedSkills;
      if (newPassword) currentUser.password = newPassword;
    }

    // Salva na sessão e na lista local de usuários
    authStore.setSession(currentUser);
    const users = authStore.getUsers();
    const uIdx = users.findIndex(u => u.id === currentUser.id);
    if (uIdx !== -1) {
      users[uIdx] = { ...users[uIdx], ...currentUser };
      if (newPassword) users[uIdx].password = newPassword;
      authStore.saveUsers(users);
    }

    // Sincroniza também no teamMember correspondente
    const member = store.getTeamMembers().find(m => m.id === currentUser.id || m.name.toLowerCase() === currentUser.name.toLowerCase());
    if (member) {
      store.updateMember(member.id, {
        name: newName,
        seniority: newSeniority,
        skills: parsedSkills
      });
    }

    closeModal('modal-user-profile');
    updateTopbarUserUI(currentUser);
    refreshAllUI();
    showToast('Seu perfil foi atualizado com sucesso! ✨');
  });
});

window.openMyProfileModal = function() {
  const currentUser = authStore.getCurrentUser();
  if (!currentUser) return;

  const nameInput = document.getElementById('profile-name');
  const emailInput = document.getElementById('profile-email');
  const roleInput = document.getElementById('profile-role');
  const seniorityInput = document.getElementById('profile-seniority');
  const skillsInput = document.getElementById('profile-skills');
  const pwdInput = document.getElementById('profile-password');

  if (nameInput) nameInput.value = currentUser.name || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (roleInput) {
    const roleLabels = {
      admin: '👑 Administrador',
      pm: '📊 Gerente de Projetos (PM)',
      dev: `💻 Desenvolvedor (${currentUser.devRole === 'backend' ? 'Back-end' : 'Front-end'})`,
      qa: '🧪 QA Lead / Homologador'
    };
    roleInput.value = roleLabels[currentUser.role] || currentUser.role;
  }
  if (seniorityInput) seniorityInput.value = currentUser.seniority || '';
  if (skillsInput) skillsInput.value = Array.isArray(currentUser.skills) ? currentUser.skills.join(', ') : (currentUser.skills || '');
  if (pwdInput) pwdInput.value = '';

  openModal('modal-user-profile');
};
