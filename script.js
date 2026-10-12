/**
 * ==============================================================================
 * Synchro - Plataforma de Gestão de Requisitos, Equipe, Demandas e Testes
 * CRUD COMPLETO para:
 * 1. Projetos
 * 2. Quadro de Demandas (Tarefas)
 * 3. Equipe de Desenvolvedores
 * 4. Requisitos & Especificações (Specs)
 * 5. Qualidade & Casos de Teste (QA)
 * ==============================================================================
 */

const STORAGE_KEY = 'synchro_pro_state_v3';
// Migração retrocompatível do LocalStorage legado se existir
try {
  if (!localStorage.getItem(STORAGE_KEY) && localStorage.getItem('devsquad_pro_state_v3')) {
    localStorage.setItem(STORAGE_KEY, localStorage.getItem('devsquad_pro_state_v3'));
  }
} catch (e) {}

// Dados Iniciais Limpos (Apenas entidades cadastradas pelo usuário)
const initialSeedData = {
  projects: [],
  teamMembers: [],
  requirements: [],
  tasks: [],
  testCases: [],
  goals: [],
  documentTemplates: [],
  apfItems: [],
  apfInmItems: [],
  inmCatalog: []
};

// ==============================================================================
// 1.0 Camada de Conexão com a API REST Backend & Banco Relacional SQLite
// ==============================================================================
class SynchroAPI {
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
        text.textContent = '🟢 SQLite (synchro.db)';
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
          headers['x-user-name'] = encodeURIComponent(u.name || 'Usuário');
        } else {
          headers['x-user-id'] = 'usr_admin_demo';
          headers['x-user-role'] = 'admin';
          headers['x-user-name'] = encodeURIComponent('Administrador');
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

  async createApfItem(item) {
    return await this.apiRequest('/api/apf', 'POST', item);
  }

  async updateApfItem(id, item) {
    return await this.apiRequest(`/api/apf/${id}`, 'PUT', item);
  }

  async deleteApfItem(id) {
    return await this.apiRequest(`/api/apf/${id}`, 'DELETE');
  }

  async previewAutoApf(payload) {
    return await this.apiRequest('/api/apf/auto-generate/preview', 'POST', payload);
  }

  async batchCreateApf(payload) {
    return await this.apiRequest('/api/apf/auto-generate/batch', 'POST', payload);
  }

  // --- MÉTODOS DE ITENS NÃO-MENSURÁVEIS (FPN) ---
  async getApfInmCatalog() {
    return await this.apiRequest('/api/apf/inm/catalog', 'GET');
  }

  async getApfInmItems(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await this.apiRequest(`/api/apf/inm${query ? '?' + query : ''}`, 'GET');
  }

  async createApfInmItem(item) {
    return await this.apiRequest('/api/apf/inm', 'POST', item);
  }

  async updateApfInmItem(id, item) {
    return await this.apiRequest(`/api/apf/inm/${id}`, 'PUT', item);
  }

  async deleteApfInmItem(id) {
    return await this.apiRequest(`/api/apf/inm/${id}`, 'DELETE');
  }
}

const api = new SynchroAPI();
window.api = api;
window.DevSquadAPI = SynchroAPI;

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
    this.reqFeatureFilter = 'all';
    this.kanbanRoleFilter = 'all';
    this.kanbanPriorityFilter = 'all';
    this.teamRoleFilter = 'all';
    this.testTypeFilter = 'all';
    this.kanbanScopeFilter = 'all';
    this.apfSearchQuery = '';
    this.apfTypeFilter = 'all';
    this.apfCategoryFilter = 'all';
    this.apfComplexityFilter = 'all';
    this.apfCountingFilter = 'all';
    this.apfFeatureFilter = 'all';
    this.apfViewMode = 'table';
    this.apfInmCategoryFilter = 'all';
    this.apfInmSearchQuery = '';
    this.apfSubnavTab = 'ifpug';
    this.apfInmViewMode = 'table';
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

    // Limpeza de IDs mockados legados para garantir que fiquem no sistema somente dados reais cadastrados
    const mockIds = new Set([
      'p1', 'p2', 'p3',
      'req1', 'req2', 'req3', 'req4', 'req5', 'req6',
      't1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10',
      'tc1', 'tc2', 'tc3', 'tc4', 'tc5', 'tc6', 'tc7', 'tc8',
      'm1', 'm2', 'm3', 'm4', 'm5', 'm6',
      't_demo1', 't_demo2', 't_demo3'
    ]);

    if (Array.isArray(state.projects)) {
      state.projects = state.projects.filter(p => !mockIds.has(p.id));
    }
    if (Array.isArray(state.requirements)) {
      state.requirements = state.requirements.filter(r => !mockIds.has(r.id)).map(r => {
        if (!r.createdAt) {
          const match = String(r.id || '').match(/\d{10,}/);
          if (match) {
            try {
              const d = new Date(parseInt(match[0], 10));
              if (!isNaN(d.getTime())) r.createdAt = d.toISOString();
            } catch(e) {}
          }
        }
        return r;
      });
    }
    if (Array.isArray(state.tasks)) {
      state.tasks = state.tasks.filter(t => !mockIds.has(t.id)).map(t => {
        const ref = t.reqId || t.req_id || t.requirementId || t.reqCode || null;
        return { ...t, reqId: ref, req_id: ref };
      });
    }
    if (Array.isArray(state.testCases)) {
      state.testCases = state.testCases.filter(tc => !mockIds.has(tc.id));
    }
    if (Array.isArray(state.teamMembers)) {
      const seen = new Set();
      state.teamMembers = state.teamMembers.filter(m => {
        if (mockIds.has(m.id)) return false;
        const key = (m.name || '').trim().toLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
    state.documentTemplates = Array.isArray(state.documentTemplates) ? state.documentTemplates : [];
    state.apfItems = Array.isArray(state.apfItems) ? state.apfItems : [];
    state.apfInmItems = Array.isArray(state.apfInmItems) ? state.apfInmItems : [];
    state.inmCatalog = Array.isArray(state.inmCatalog) ? state.inmCatalog : [];
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
      if (Array.isArray(data.tasks)) {
        this.state.tasks = data.tasks.map(t => {
          const ref = t.reqId || t.req_id || t.requirementId || t.reqCode || null;
          return { ...t, reqId: ref, req_id: ref };
        });
      }
      if (Array.isArray(data.testCases)) this.state.testCases = data.testCases;
      if (Array.isArray(data.goals)) this.state.goals = data.goals;
      if (Array.isArray(data.documentTemplates || data.templates)) this.state.documentTemplates = data.documentTemplates || data.templates;
      if (Array.isArray(data.apfItems)) this.state.apfItems = data.apfItems;
      if (Array.isArray(data.apfInmItems)) this.state.apfInmItems = data.apfInmItems;
      if (Array.isArray(data.inmCatalog)) this.state.inmCatalog = data.inmCatalog;
      if (Array.isArray(data.auditLogs)) this.auditLogs = data.auditLogs;
      if (Array.isArray(data.careers) && typeof careerTracksData !== 'undefined') {
        data.careers.forEach(c => {
          careerTracksData[c.id] = {
            id: c.id,
            roleName: c.roleName,
            discipline: c.discipline,
            icon: c.icon,
            mission: c.mission,
            levels: c.levels,
            isCustom: !!c.isCustom
          };
          if (typeof syncCareerSelects === 'function') {
            syncCareerSelects(c);
          }
        });
        if (typeof renderCareerNav === 'function') {
          renderCareerNav();
        }
      }
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

  async fetchAuditLogs(filters = {}) {
    let url = '/api/audit-logs';
    const params = new URLSearchParams();
    if (filters.entityType && filters.entityType !== 'all') params.append('entityType', filters.entityType);
    if (filters.entityId) params.append('entityId', filters.entityId);
    if (filters.limit) params.append('limit', filters.limit);
    const qs = params.toString();
    if (qs) url += `?${qs}`;
    const logs = await api.apiRequest(url);
    if (Array.isArray(logs)) {
      if (!filters.entityId) {
        this.auditLogs = logs;
      }
      return logs;
    }
    return [];
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
      deadline: data.deadline || "",
      features: Array.isArray(data.features) ? data.features : []
    };
    this.state.projects.push(newProject);
    this.saveState();
    api.apiRequest('/api/projects', 'POST', newProject);
    return newProject;
  }

  updateProject(id, data) {
    const project = this.getProjectById(id);
    if (project) {
      if (data.name !== undefined) project.name = data.name;
      if (data.code !== undefined) project.code = (data.code || project.code).toUpperCase();
      if (data.desc !== undefined) project.desc = data.desc;
      if (data.color !== undefined) project.color = data.color;
      if (data.status !== undefined) project.status = data.status;
      if (data.deadline !== undefined) project.deadline = data.deadline;
      if (data.features !== undefined) project.features = Array.isArray(data.features) ? data.features : [];
      this.saveState();
      api.apiRequest(`/api/projects/${id}`, 'PUT', data);
      return true;
    }
    return false;
  }

  getProjectFeatures(projectId) {
    const set = new Set();
    if (!projectId || projectId === 'all') {
      (this.state.projects || []).forEach(p => {
        if (Array.isArray(p.features)) p.features.forEach(f => f && set.add(f.trim()));
      });
      (this.state.requirements || []).forEach(r => {
        if (r.feature) set.add(r.feature.trim());
      });
    } else {
      const project = this.getProjectById(projectId);
      if (project && Array.isArray(project.features)) {
        project.features.forEach(f => f && set.add(f.trim()));
      }
      (this.state.requirements || []).filter(r => r.projectId === projectId).forEach(r => {
        if (r.feature) set.add(r.feature.trim());
      });
    }
    return Array.from(set).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  addFeatureToProject(projectId, featureName) {
    if (!projectId || !featureName) return;
    const trimmed = String(featureName).trim();
    if (!trimmed) return;
    const project = this.getProjectById(projectId);
    if (project) {
      if (!Array.isArray(project.features)) project.features = [];
      if (!project.features.some(f => f.toLowerCase() === trimmed.toLowerCase())) {
        project.features.push(trimmed);
        this.saveState();
        api.apiRequest(`/api/projects/${projectId}`, 'PUT', { features: project.features });
      }
    }
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
    const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(memberData.role || 'backend') : null;
    const newMember = {
      id: memberData.id || ("m" + Date.now()),
      name: cleanName,
      role: memberData.role || 'backend',
      seniority: memberData.seniority || 'Pleno',
      skills: parsedSkills,
      capacity: parseInt(memberData.capacity, 10) || 40,
      avatarBg: memberData.avatarBg || (spec && spec.color ? spec.color : '#6366f1')
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
        const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(memberData.role) : null;
        member.avatarBg = memberData.avatarBg || (spec && spec.color ? spec.color : '#6366f1');
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
    let list = this.state.requirements || [];
    if (this.selectedProject !== 'all') {
      list = list.filter(r => r.projectId === this.selectedProject);
    }
    if (this.reqTypeFilter !== 'all') {
      list = list.filter(r => r.type === this.reqTypeFilter);
    }
    if (this.reqMoscowFilter !== 'all') {
      list = list.filter(r => r.moscow === this.reqMoscowFilter);
    }
    if (this.reqFeatureFilter && this.reqFeatureFilter !== 'all') {
      list = list.filter(r => (r.feature || '').trim().toLowerCase() === this.reqFeatureFilter.trim().toLowerCase());
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      list = list.filter(r => (r.title && r.title.toLowerCase().includes(q)) || 
                              (r.code && r.code.toLowerCase().includes(q)) || 
                              (r.feature && r.feature.toLowerCase().includes(q)) || 
                              (r.userStory && r.userStory.toLowerCase().includes(q)));
    }
    return [...list].sort((a, b) => {
      // 1. Ordenação padrão cronológica decrescente (createdAt DESC)
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      const validTimeA = (!isNaN(timeA) && timeA > 0) ? timeA : (parseInt(String(a.id || '').replace(/\D/g, ''), 10) || 0);
      const validTimeB = (!isNaN(timeB) && timeB > 0) ? timeB : (parseInt(String(b.id || '').replace(/\D/g, ''), 10) || 0);

      if (validTimeB !== validTimeA) {
        return validTimeB - validTimeA;
      }

      // 2. Fallback: Código identificador decrescente (ex: RF-02 > RF-01)
      const codeA = a.code || '';
      const codeB = b.code || '';
      const codeComp = codeB.localeCompare(codeA, undefined, { numeric: true, sensitivity: 'base' });
      if (codeComp !== 0) return codeComp;

      // 3. Fallback: ID decrescente
      return String(b.id || '').localeCompare(String(a.id || ''), undefined, { numeric: true });
    });
  }

  findRequirement(identifier) {
    if (!identifier) return null;
    const str = String(identifier).trim();
    if (!str) return null;
    const lower = str.toLowerCase();
    const upper = str.toUpperCase();
    const reqs = this.state.requirements || [];

    // 1. Busca exata por ID (ex: 'req1791558280650')
    let found = reqs.find(r => r.id === str);
    if (found) return found;

    // 2. Busca exata por Código (ex: 'WER', 'wer', 'RF-01')
    found = reqs.find(r => r.code && r.code.toUpperCase() === upper);
    if (found) return found;

    // 3. Busca por Título completo
    found = reqs.find(r => r.title && r.title.toLowerCase() === lower);
    if (found) return found;

    // 4. Busca se a string informada contém o código ou id (ex: '[WER] wer')
    found = reqs.find(r => {
      if (r.code && (upper.includes(`[${r.code.toUpperCase()}]`) || upper.includes(r.code.toUpperCase()))) return true;
      if (r.id && str.includes(r.id)) return true;
      return false;
    });
    if (found) return found;

    return null;
  }

  getRequirementById(id) {
    return this.findRequirement(id);
  }

  addRequirement(data) {
    const now = new Date().toISOString();
    const feature = (data.feature || '').trim();
    const newReq = {
      id: "req" + Date.now(),
      code: (data.code || "RF-01").toUpperCase(),
      title: data.title,
      projectId: data.projectId,
      feature: feature,
      type: data.type,
      moscow: data.moscow,
      userStory: data.userStory,
      bdd: data.bdd,
      createdAt: data.createdAt || now
    };
    if (data.projectId && feature) {
      this.addFeatureToProject(data.projectId, feature);
    }
    this.state.requirements.unshift(newReq);
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
      if (data.feature !== undefined) {
        req.feature = (data.feature || '').trim();
        if (req.projectId && req.feature) {
          this.addFeatureToProject(req.projectId, req.feature);
        }
      }
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
    const resolvedReq = this.findRequirement(data.reqId || data.req_id || data.requirementId);
    const reqRef = resolvedReq ? resolvedReq.id : (data.reqId || data.req_id || null);
    const newTask = {
      id: "t" + Date.now(),
      title: data.title,
      projectId: data.projectId || (resolvedReq ? resolvedReq.projectId : null),
      reqId: reqRef,
      req_id: reqRef,
      role: data.role,
      assigneeId: data.assigneeId || null,
      priority: data.priority || 'Média',
      complexity: data.complexity || 'Média',
      hours: parseInt(data.hours, 10) || 8,
      status: 'backlog',
      desc: data.desc || '',
      devNotes: data.devNotes || '',
      qaNotes: data.qaNotes || '',
      qaReviewer: data.qaReviewer || null,
      qaDate: data.qaDate || null,
      qaApproved: data.qaApproved ? 1 : 0
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
      if (data.reqId !== undefined || data.req_id !== undefined) {
        const raw = data.reqId !== undefined ? data.reqId : data.req_id;
        const resolved = this.findRequirement(raw);
        const val = resolved ? resolved.id : (raw || null);
        task.reqId = val;
        task.req_id = val;
        data.reqId = val;
      }
      if (data.role !== undefined) task.role = data.role;
      if (data.assigneeId !== undefined) task.assigneeId = data.assigneeId || null;
      if (data.priority !== undefined) task.priority = data.priority;
      if (data.complexity !== undefined) task.complexity = data.complexity;
      if (data.hours !== undefined) task.hours = parseInt(data.hours, 10) || 8;
      if (data.hoursSpent !== undefined) task.hoursSpent = Math.max(0, parseFloat(data.hoursSpent) || 0);
      if (data.desc !== undefined) task.desc = data.desc || '';
      if (data.devNotes !== undefined) task.devNotes = data.devNotes || '';
      if (data.qaNotes !== undefined) task.qaNotes = data.qaNotes || '';
      if (data.qaReviewer !== undefined) task.qaReviewer = data.qaReviewer || null;
      if (data.qaDate !== undefined) task.qaDate = data.qaDate || null;
      if (data.qaApproved !== undefined) task.qaApproved = data.qaApproved ? 1 : 0;
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
      if (targetStatus === 'done' && !task.qaDate) {
        task.qaDate = new Date().toISOString();
      }
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
      if (data.taskId !== undefined) tc.taskId = data.taskId;
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

  // --- GESTÃO DE METAS DE PROMOÇÃO (GOALS) ---
  getGoals() {
    return Array.isArray(this.state.goals) ? this.state.goals : [];
  }

  getGoalById(id) {
    return (this.state.goals || []).find(g => g.id === id);
  }

  async addGoal(data) {
    const newGoal = {
      id: data.id || 'goal_' + Date.now(),
      title: data.title,
      description: data.description || '',
      targetSeniority: data.targetSeniority || 'Pleno',
      category: data.category || 'complexity',
      metricKey: data.metricKey || 'high_tasks',
      targetValue: parseFloat(data.targetValue) || 0,
      targetUnit: data.targetUnit || 'demandas',
      weight: parseInt(data.weight, 10) || 2,
      isActive: data.isActive !== false,
      createdAt: new Date().toISOString()
    };
    this.state.goals = this.state.goals || [];
    this.state.goals.push(newGoal);
    this.saveState();
    if (typeof api !== 'undefined') {
      await api.apiRequest('/api/goals', 'POST', newGoal);
    }
    return newGoal;
  }

  async updateGoal(id, data) {
    const goal = this.getGoalById(id);
    if (!goal) return false;
    if (data.title !== undefined) goal.title = data.title;
    if (data.description !== undefined) goal.description = data.description;
    if (data.targetSeniority !== undefined) goal.targetSeniority = data.targetSeniority;
    if (data.category !== undefined) goal.category = data.category;
    if (data.metricKey !== undefined) goal.metricKey = data.metricKey;
    if (data.targetValue !== undefined) goal.targetValue = parseFloat(data.targetValue) || 0;
    if (data.targetUnit !== undefined) goal.targetUnit = data.targetUnit;
    if (data.weight !== undefined) goal.weight = parseInt(data.weight, 10) || 2;
    if (data.isActive !== undefined) goal.isActive = !!data.isActive;
    this.saveState();
    if (typeof api !== 'undefined') {
      await api.apiRequest(`/api/goals/${id}`, 'PUT', data);
    }
    return true;
  }

  async deleteGoal(id) {
    const idx = (this.state.goals || []).findIndex(g => g.id === id);
    if (idx !== -1) {
      this.state.goals.splice(idx, 1);
      this.saveState();
      if (typeof api !== 'undefined') {
        await api.apiRequest(`/api/goals/${id}`, 'DELETE');
      }
      return true;
    }
    return false;
  }

  async resetDefaultGoals() {
    if (typeof api !== 'undefined') {
      const res = await api.apiRequest('/api/goals/reset-defaults', 'POST');
      if (Array.isArray(res)) {
        this.state.goals = res;
        this.saveState();
        return res;
      }
    }
    return this.state.goals;
  }

  // --- CRUD: TEMPLATES DE DOCUMENTO & IDENTIDADE VISUAL ---
  getDocumentTemplates() {
    return Array.isArray(this.state.documentTemplates) ? this.state.documentTemplates : [];
  }

  getTemplateById(id) {
    return (this.state.documentTemplates || []).find(t => t.id === id);
  }

  getDefaultTemplate() {
    const list = this.getDocumentTemplates();
    return list.find(t => t.isDefault) || list[0] || null;
  }

  async createTemplate(templateData) {
    const payload = {
      name: templateData.name,
      description: templateData.description || '',
      isDefault: Boolean(templateData.isDefault),
      logoUrl: templateData.logoUrl || '',
      docTitle: templateData.docTitle,
      docSubtitle: templateData.docSubtitle || '',
      headerInstitution: templateData.headerInstitution || '',
      primaryColor: templateData.primaryColor || '#0284c7',
      footerText: templateData.footerText || '',
      approvalTerms: templateData.approvalTerms || '',
      signeeContratadaTitle: templateData.signeeContratadaTitle || 'PELA CONTRATADA (SYNCHRO)',
      signeeContratanteTitle: templateData.signeeContratanteTitle || 'PELA CONTRATANTE (CLIENTE)',
      includeUserStory: templateData.includeUserStory !== false,
      includeAcceptanceCriteria: templateData.includeAcceptanceCriteria !== false,
      includeQaEvidence: templateData.includeQaEvidence !== false,
      includeSignatures: templateData.includeSignatures !== false,
      includeKpis: templateData.includeKpis !== false,
      includeStatusBanner: templateData.includeStatusBanner !== false
    };

    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.apiRequest('/api/templates', 'POST', payload);
      if (res && res.template) {
        if (payload.isDefault) {
          (this.state.documentTemplates || []).forEach(t => { t.isDefault = false; });
        }
        this.state.documentTemplates = this.state.documentTemplates || [];
        this.state.documentTemplates.push(res.template);
        this.saveState();
        return res.template;
      }
    }

    // Fallback Local
    const id = 'tpl_' + Date.now();
    const newTemplate = {
      id,
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (newTemplate.isDefault) {
      (this.state.documentTemplates || []).forEach(t => { t.isDefault = false; });
    }
    this.state.documentTemplates = this.state.documentTemplates || [];
    this.state.documentTemplates.push(newTemplate);
    this.saveState();
    return newTemplate;
  }

  async updateTemplate(id, templateData) {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.apiRequest(`/api/templates/${id}`, 'PUT', templateData);
      if (res && res.template) {
        if (templateData.isDefault) {
          (this.state.documentTemplates || []).forEach(t => { if (t.id !== id) t.isDefault = false; });
        }
        const idx = (this.state.documentTemplates || []).findIndex(t => t.id === id);
        if (idx !== -1) {
          this.state.documentTemplates[idx] = res.template;
        } else {
          this.state.documentTemplates.push(res.template);
        }
        this.saveState();
        return res.template;
      }
    }

    // Fallback Local
    const idx = (this.state.documentTemplates || []).findIndex(t => t.id === id);
    if (idx !== -1) {
      if (templateData.isDefault) {
        this.state.documentTemplates.forEach(t => { if (t.id !== id) t.isDefault = false; });
      }
      this.state.documentTemplates[idx] = {
        ...this.state.documentTemplates[idx],
        ...templateData,
        updatedAt: new Date().toISOString()
      };
      this.saveState();
      return this.state.documentTemplates[idx];
    }
    return null;
  }

  async deleteTemplate(id) {
    const list = this.getDocumentTemplates();
    if (list.length <= 1) {
      return { success: false, message: 'Não é possível excluir o único template restante no sistema.' };
    }

    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.apiRequest(`/api/templates/${id}`, 'DELETE');
      if (res && res.success) {
        const deletedWasDefault = (this.getTemplateById(id) || {}).isDefault;
        this.state.documentTemplates = (this.state.documentTemplates || []).filter(t => t.id !== id);
        if (deletedWasDefault && this.state.documentTemplates.length > 0) {
          this.state.documentTemplates[0].isDefault = true;
        }
        this.saveState();
        return { success: true };
      }
      return res || { success: false, message: 'Erro ao excluir template.' };
    }

    const deletedWasDefault = (this.getTemplateById(id) || {}).isDefault;
    this.state.documentTemplates = (this.state.documentTemplates || []).filter(t => t.id !== id);
    if (deletedWasDefault && this.state.documentTemplates.length > 0) {
      this.state.documentTemplates[0].isDefault = true;
    }
    this.saveState();
    return { success: true };
  }

  async setDefaultTemplate(id) {
    if (typeof api !== 'undefined' && api.isOnline) {
      await api.apiRequest(`/api/templates/${id}/set-default`, 'POST');
    }
    (this.state.documentTemplates || []).forEach(t => {
      t.isDefault = (t.id === id);
    });
    this.saveState();
  }

  async resetDefaultTemplates() {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.apiRequest('/api/templates/reset-defaults', 'POST');
      if (res && Array.isArray(res.templates)) {
        this.state.documentTemplates = res.templates;
        this.saveState();
        return res.templates;
      }
    }
    return this.getDocumentTemplates();
  }

  // --- CRUD: ANÁLISE DE PONTOS DE FUNÇÃO (APF • IFPUG CPM 4.3.1) ---
  getApfItems(filters = {}) {
    let list = Array.isArray(this.state.apfItems) ? this.state.apfItems : [];

    const proj = filters.projectId !== undefined ? filters.projectId : this.selectedProject;
    if (proj && proj !== 'all') {
      list = list.filter(it => it.projectId === proj);
    }

    const feat = filters.feature !== undefined ? filters.feature : this.apfFeatureFilter;
    if (feat && feat !== 'all') {
      list = list.filter(it => (it.feature || '').toLowerCase() === feat.toLowerCase());
    }

    const type = filters.functionType !== undefined ? filters.functionType : this.apfTypeFilter;
    if (type && type !== 'all') {
      list = list.filter(it => (it.functionType || '').toUpperCase() === type.toUpperCase());
    }

    const cat = filters.category !== undefined ? filters.category : this.apfCategoryFilter;
    if (cat && cat !== 'all') {
      list = list.filter(it => (it.category || '').toLowerCase() === cat.toLowerCase());
    }

    const comp = filters.complexity !== undefined ? filters.complexity : this.apfComplexityFilter;
    if (comp && comp !== 'all') {
      list = list.filter(it => (it.complexity || '').toLowerCase() === comp.toLowerCase());
    }

    const counting = filters.countingType !== undefined ? filters.countingType : this.apfCountingFilter;
    if (counting && counting !== 'all') {
      list = list.filter(it => (it.countingType || '').toLowerCase() === counting.toLowerCase());
    }

    const q = filters.search !== undefined ? filters.search : this.apfSearchQuery;
    if (q) {
      const term = q.toLowerCase().trim();
      list = list.filter(it =>
        (it.code && it.code.toLowerCase().includes(term)) ||
        (it.name && it.name.toLowerCase().includes(term)) ||
        (it.feature && it.feature.toLowerCase().includes(term)) ||
        (it.notes && it.notes.toLowerCase().includes(term)) ||
        (it.reqCode && it.reqCode.toLowerCase().includes(term))
      );
    }

    return list;
  }

  getApfItemById(id) {
    return (this.state.apfItems || []).find(it => it.id === id);
  }

  async addApfItem(itemData) {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.createApfItem(itemData);
      if (res && res.success && res.item) {
        if (!Array.isArray(this.state.apfItems)) this.state.apfItems = [];
        this.state.apfItems.unshift(res.item);
        this.saveState();
        return res.item;
      }
    }
    // Fallback offline / LocalStorage
    const id = itemData.id || 'apf_' + Date.now();
    const functionType = (itemData.functionType || 'EE').toUpperCase().trim();
    const category = typeof getApfCategory === 'function' ? getApfCategory(functionType) : (functionType === 'ALI' || functionType === 'AIE' ? 'Dados' : 'Transação');
    const td = Math.max(1, parseInt(itemData.td, 10) || 1);
    const arTr = Math.max(0, parseInt(itemData.arTr !== undefined ? itemData.arTr : itemData.ar_tr, 10) || 0);
    const complexity = typeof calculateApfComplexity === 'function' ? calculateApfComplexity(functionType, arTr, td) : 'Média';
    const rawPf = typeof calculateApfRawPf === 'function' ? calculateApfRawPf(functionType, complexity) : 4;
    const countingType = itemData.countingType || 'Desenvolvimento';
    const factor = typeof getCountingTypeDefaultFactor === 'function' ? getCountingTypeDefaultFactor(countingType, itemData.factor) : (parseFloat(itemData.factor) || 1.0);
    const finalPf = typeof calculateApfFinalPf === 'function' ? calculateApfFinalPf(rawPf, factor) : Math.round(rawPf * factor * 100) / 100;
    const now = new Date().toISOString();

    const proj = this.getProjectById(itemData.projectId);
    const req = (this.state.requirements || []).find(r => r.id === itemData.reqId);

    let code = (itemData.code || '').trim();
    if (!code) {
      const count = (this.state.apfItems || []).filter(it => it.functionType === functionType).length + 1;
      code = `${functionType}-${String(count).padStart(2, '0')}`;
    }

    const newItem = {
      id,
      code,
      name: (itemData.name || '').trim(),
      projectId: itemData.projectId || '',
      projectName: proj ? proj.name : '',
      projectCode: proj ? proj.code : '',
      feature: (itemData.feature || '').trim(),
      reqId: itemData.reqId || '',
      reqCode: req ? req.code : '',
      reqTitle: req ? req.title : '',
      functionType,
      category,
      td,
      arTr,
      complexity,
      rawPf,
      countingType,
      factor,
      finalPf,
      notes: itemData.notes || '',
      createdAt: now,
      updatedAt: now
    };

    if (!Array.isArray(this.state.apfItems)) this.state.apfItems = [];
    this.state.apfItems.unshift(newItem);
    this.saveState();
    return newItem;
  }

  async updateApfItem(id, updates) {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.updateApfItem(id, updates);
      if (res && res.success && res.item) {
        const idx = (this.state.apfItems || []).findIndex(it => it.id === id);
        if (idx !== -1) {
          this.state.apfItems[idx] = res.item;
          this.saveState();
        }
        return res.item;
      }
    }
    // Fallback offline
    const idx = (this.state.apfItems || []).findIndex(it => it.id === id);
    if (idx !== -1) {
      const existing = this.state.apfItems[idx];
      const functionType = ((updates.functionType !== undefined ? updates.functionType : existing.functionType) || 'EE').toUpperCase().trim();
      const category = typeof getApfCategory === 'function' ? getApfCategory(functionType) : existing.category;
      const td = Math.max(1, parseInt(updates.td !== undefined ? updates.td : existing.td, 10) || 1);
      const arTr = Math.max(0, parseInt(updates.arTr !== undefined ? updates.arTr : existing.arTr, 10) || 0);
      const complexity = typeof calculateApfComplexity === 'function' ? calculateApfComplexity(functionType, arTr, td) : existing.complexity;
      const rawPf = typeof calculateApfRawPf === 'function' ? calculateApfRawPf(functionType, complexity) : existing.rawPf;
      const countingType = updates.countingType !== undefined ? updates.countingType : existing.countingType;
      const factor = typeof getCountingTypeDefaultFactor === 'function' ? getCountingTypeDefaultFactor(countingType, updates.factor !== undefined ? updates.factor : existing.factor) : existing.factor;
      const finalPf = typeof calculateApfFinalPf === 'function' ? calculateApfFinalPf(rawPf, factor) : Math.round(rawPf * factor * 100) / 100;

      const proj = updates.projectId ? this.getProjectById(updates.projectId) : (existing.projectId ? this.getProjectById(existing.projectId) : null);
      const req = updates.reqId ? (this.state.requirements || []).find(r => r.id === updates.reqId) : (existing.reqId ? (this.state.requirements || []).find(r => r.id === existing.reqId) : null);

      const updated = {
        ...existing,
        ...updates,
        functionType,
        category,
        td,
        arTr,
        complexity,
        rawPf,
        countingType,
        factor,
        finalPf,
        projectName: proj ? proj.name : existing.projectName,
        projectCode: proj ? proj.code : existing.projectCode,
        reqCode: req ? req.code : existing.reqCode,
        reqTitle: req ? req.title : existing.reqTitle,
        updatedAt: new Date().toISOString()
      };
      this.state.apfItems[idx] = updated;
      this.saveState();
      return updated;
    }
    return null;
  }

  async deleteApfItem(id) {
    if (typeof api !== 'undefined' && api.isOnline) {
      await api.deleteApfItem(id);
    }
    this.state.apfItems = (this.state.apfItems || []).filter(it => it.id !== id);
    this.saveState();
    return true;
  }

  async previewAutoApf(payload) {
    if (typeof api !== 'undefined' && api.isOnline) {
      return await api.previewAutoApf(payload);
    }
    return { success: false, message: 'Serviço offline.' };
  }

  async batchCreateApf(payload) {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.batchCreateApf(payload);
      if (res && res.success && Array.isArray(res.items)) {
        if (!Array.isArray(this.state.apfItems)) this.state.apfItems = [];
        res.items.forEach(it => {
          this.state.apfItems.unshift(it);
        });
        this.saveState();
        return res;
      }
    }
    // Fallback offline
    const items = payload.items || [];
    const created = [];
    for (const it of items) {
      const saved = await this.addApfItem({
        ...it,
        projectId: it.projectId || payload.projectId,
        feature: it.feature || payload.feature,
        reqId: it.reqId || payload.reqId
      });
      created.push(saved);
    }
    return { success: true, count: created.length, items: created };
  }

  // --- CRUD: ITENS NÃO-MENSURÁVEIS (FPN • MÉTRICAS CONTRATUAIS / SISP) ---
  getApfInmItems(filters = {}) {
    let list = Array.isArray(this.state.apfInmItems) ? this.state.apfInmItems : [];

    const proj = filters.projectId !== undefined ? filters.projectId : this.selectedProject;
    if (proj && proj !== 'all') {
      list = list.filter(it => it.projectId === proj);
    }

    const feat = filters.feature !== undefined ? filters.feature : this.apfFeatureFilter;
    if (feat && feat !== 'all') {
      list = list.filter(it => (it.feature || '').toLowerCase() === feat.toLowerCase());
    }

    const cat = filters.category !== undefined ? filters.category : this.apfInmCategoryFilter;
    if (cat && cat !== 'all') {
      list = list.filter(it => (it.category || '').toLowerCase() === cat.toLowerCase());
    }

    const q = filters.search !== undefined ? filters.search : this.apfInmSearchQuery;
    if (q) {
      const term = q.toLowerCase().trim();
      list = list.filter(it =>
        (it.code && it.code.toLowerCase().includes(term)) ||
        (it.itemName && it.itemName.toLowerCase().includes(term)) ||
        (it.description && it.description.toLowerCase().includes(term)) ||
        (it.feature && it.feature.toLowerCase().includes(term)) ||
        (it.evidence && it.evidence.toLowerCase().includes(term)) ||
        (it.reqCode && it.reqCode.toLowerCase().includes(term))
      );
    }

    return list;
  }

  getApfInmItemById(id) {
    return (this.state.apfInmItems || []).find(it => it.id === id);
  }

  getInmCatalog() {
    if (Array.isArray(this.state.inmCatalog) && this.state.inmCatalog.length > 0) {
      return this.state.inmCatalog;
    }
    return DEFAULT_INM_CATALOG_CLIENT;
  }

  async addApfInmItem(itemData) {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.createApfInmItem(itemData);
      if (res && res.success && res.item) {
        if (!Array.isArray(this.state.apfInmItems)) this.state.apfInmItems = [];
        this.state.apfInmItems.unshift(res.item);
        this.saveState();
        return res.item;
      }
    }
    // Fallback offline
    const id = itemData.id || 'inm_' + Date.now();
    const count = (this.state.apfInmItems || []).length + 1;
    const code = (itemData.code || '').trim() || `INM-${String(count).padStart(2, '0')}`;
    const quantity = Math.max(0.01, parseFloat(itemData.quantity) || 1);
    const unitWeight = Math.max(0, parseFloat(itemData.unitWeight !== undefined ? itemData.unitWeight : 0.8));
    const calculatedPf = Math.round((quantity * unitWeight) * 100) / 100;
    const now = new Date().toISOString();

    const proj = this.getProjectById(itemData.projectId);
    const req = (this.state.requirements || []).find(r => r.id === itemData.reqId);

    const newItem = {
      id,
      code,
      projectId: itemData.projectId || '',
      projectName: proj ? proj.name : '',
      projectCode: proj ? proj.code : '',
      feature: (itemData.feature || '').trim(),
      reqId: itemData.reqId || '',
      reqCode: req ? req.code : '',
      reqTitle: req ? req.title : '',
      category: itemData.category || 'Tabelas de Apoio',
      catalogKey: itemData.catalogKey || 'custom',
      itemName: (itemData.itemName || '').trim(),
      description: (itemData.description || '').trim(),
      quantity,
      unitWeight,
      calculatedPf,
      evidence: (itemData.evidence || '').trim(),
      status: itemData.status || 'Aprovado',
      createdBy: (typeof authStore !== 'undefined' && authStore.getCurrentUser()) ? authStore.getCurrentUser().name : 'Sistema',
      createdAt: now,
      updatedAt: now
    };

    if (!Array.isArray(this.state.apfInmItems)) this.state.apfInmItems = [];
    this.state.apfInmItems.unshift(newItem);
    this.saveState();
    return newItem;
  }

  async updateApfInmItem(id, updates) {
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.updateApfInmItem(id, updates);
      if (res && res.success && res.item) {
        const idx = (this.state.apfInmItems || []).findIndex(it => it.id === id);
        if (idx !== -1) {
          this.state.apfInmItems[idx] = res.item;
          this.saveState();
        }
        return res.item;
      }
    }
    // Fallback offline
    const idx = (this.state.apfInmItems || []).findIndex(it => it.id === id);
    if (idx !== -1) {
      const existing = this.state.apfInmItems[idx];
      const quantity = Math.max(0.01, parseFloat(updates.quantity !== undefined ? updates.quantity : existing.quantity) || 1);
      const unitWeight = Math.max(0, parseFloat(updates.unitWeight !== undefined ? updates.unitWeight : existing.unitWeight));
      const calculatedPf = Math.round((quantity * unitWeight) * 100) / 100;
      const proj = updates.projectId ? this.getProjectById(updates.projectId) : (existing.projectId ? this.getProjectById(existing.projectId) : null);
      const req = updates.reqId ? (this.state.requirements || []).find(r => r.id === updates.reqId) : null;

      const updated = {
        ...existing,
        ...updates,
        quantity,
        unitWeight,
        calculatedPf,
        projectName: proj ? proj.name : existing.projectName,
        projectCode: proj ? proj.code : existing.projectCode,
        reqCode: req ? req.code : existing.reqCode,
        reqTitle: req ? req.title : existing.reqTitle,
        updatedAt: new Date().toISOString()
      };
      this.state.apfInmItems[idx] = updated;
      this.saveState();
      return updated;
    }
    return null;
  }

  async deleteApfInmItem(id) {
    if (typeof api !== 'undefined' && api.isOnline) {
      await api.deleteApfInmItem(id);
    }
    this.state.apfInmItems = (this.state.apfInmItems || []).filter(it => it.id !== id);
    this.saveState();
    return true;
  }
}

const DEFAULT_INM_CATALOG_CLIENT = [
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

// Instância Global do Store
const store = new ALMStore();
window.store = store;

// ==============================================================================
// 1.1 Gerenciador de Usuários e Autenticação (UserAuthStore)
// ==============================================================================

const defaultAuthUsers = [
  {
    id: "u_admin",
    name: "Carlos Valois (Admin)",
    email: "admin@synchro.com",
    password: "admin123",
    role: "admin",
    devRole: null,
    seniority: "Workspace Owner / Diretor",
    skills: ["Arquitetura", "Governança", "DevOps", "Segurança", "Go"],
    avatarBg: "#f59e0b",
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
    canManageGoals: true,
    canManageTemplates: true,
    canManageApf: true,
    allowedViews: ['dashboard', 'projects', 'requirements', 'templates', 'apf', 'kanban', 'team', 'testing', 'governance', 'performance', 'goals', 'audit', 'career'],
    allowedNewItems: ['project', 'task', 'req', 'test', 'member', 'apf']
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
    canValidateQA: true,
    canRunTests: true,
    canCreateTest: true,
    canManageTeam: true,
    canManageGovernance: false,
    canManageTemplates: true,
    canManageApf: true,
    allowedViews: ['dashboard', 'projects', 'requirements', 'templates', 'apf', 'kanban', 'team', 'testing', 'career'],
    allowedNewItems: ['project', 'task', 'req', 'test', 'member', 'apf']
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
    canValidateQA: true,
    canRunTests: true,
    canCreateTest: true,
    canManageTeam: false,
    canManageGovernance: false,
    canManageApf: false,
    allowedViews: ['dashboard', 'projects', 'requirements', 'apf', 'kanban', 'team', 'testing', 'career'],
    allowedNewItems: ['test']
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
    canManageApf: false,
    allowedViews: ['dashboard', 'projects', 'requirements', 'apf', 'kanban', 'team', 'testing', 'career'],
    allowedNewItems: ['test']
  }
};

class UserAuthStore {
  constructor() {
    this.usersKey = 'synchro_users_v1';
    this.sessionKey = 'synchro_session_user';
    // Migração de dados de usuário legados se existirem
    try {
      if (!localStorage.getItem(this.usersKey) && localStorage.getItem('devsquad_users_v1')) {
        localStorage.setItem(this.usersKey, localStorage.getItem('devsquad_users_v1'));
      }
      if (!localStorage.getItem(this.sessionKey) && localStorage.getItem('devsquad_session_user')) {
        localStorage.setItem(this.sessionKey, localStorage.getItem('devsquad_session_user'));
      }
    } catch (e) {}
    this.initUsers();
  }

  initUsers() {
    try {
      const stored = localStorage.getItem(this.usersKey);
      let users = [];
      if (stored) {
        users = JSON.parse(stored);
      }
      if (!Array.isArray(users) || users.length === 0) {
        users = JSON.parse(JSON.stringify(defaultAuthUsers));
      } else {
        // Remover contas de demonstração que não foram cadastradas pelo usuário
        const mockEmails = new Set(['gestor@synchro.com', 'lucas@synchro.com', 'qa@synchro.com', 'gestor@devsquad.com', 'lucas@devsquad.com', 'qa@devsquad.com']);
        users = users.filter(u => !mockEmails.has(u.email.toLowerCase()));
        if (!users.some(u => u.email.toLowerCase() === 'admin@synchro.com' || u.email.toLowerCase() === 'admin@devsquad.com')) {
          users.unshift(defaultAuthUsers[0]);
        }
      }
      localStorage.setItem(this.usersKey, JSON.stringify(users));
    } catch (e) {}
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
      devRole: (role === 'admin' || role === 'pm') ? null : (devRole || (role === 'qa' ? 'qa' : 'backend')),
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

    // Sincronização automática com a equipe de desenvolvimento se for Dev ou QA
    if ((newUser.role === 'dev' || newUser.role === 'qa') && typeof store !== 'undefined' && store.state && Array.isArray(store.state.teamMembers)) {
      const cleanDevName = newUser.name.trim().toLowerCase();
      const existingInTeam = store.state.teamMembers.find(
        m => (m.name || '').trim().toLowerCase() === cleanDevName
      );
      if (!existingInTeam) {
        store.addMember({
          name: newUser.name,
          role: newUser.devRole || (newUser.role === 'qa' ? 'qa' : 'backend'),
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
      user.devRole = (role === 'admin' || role === 'pm') ? null : (devRole || user.devRole || (role === 'qa' ? 'qa' : 'backend'));
    } else if (devRole !== undefined) {
      user.devRole = devRole;
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

    // Sincroniza na equipe se for perfil dev ou qa
    if ((user.role === 'dev' || user.role === 'qa') && typeof store !== 'undefined' && store.state && Array.isArray(store.state.teamMembers)) {
      const teamMember = store.state.teamMembers.find(m => m.id === id || (m.name || '').toLowerCase() === user.name.toLowerCase());
      if (teamMember) {
        store.updateMember(teamMember.id, {
          name: user.name,
          role: user.devRole || teamMember.role || (user.role === 'qa' ? 'qa' : 'backend'),
          seniority: user.seniority,
          skills: user.skills
        });
      } else {
        store.addMember({
          name: user.name,
          role: user.devRole || (user.role === 'qa' ? 'qa' : 'backend'),
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

    const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(member.role) : null;
    const roleLabel = spec ? spec.label : (member.role === 'frontend' ? 'Front-end' : 'Back-end');
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

  // Determinar status inteligente de Cobertura e Homologação de Testes
  function getTaskTestCoverage(task) {
    const linkedTests = store.state.testCases.filter(tc => {
      if (tc.taskId && tc.taskId === task.id) return true;
      if (task.reqId && tc.reqId && tc.reqId === task.reqId) return true;
      return false;
    });

    const hasFailedTest = linkedTests.some(tc => tc.status === 'fail');
    const hasPassedTest = linkedTests.some(tc => tc.status === 'pass');
    const hasPendingTest = linkedTests.some(tc => tc.status === 'pending');

    // 1. Falha em bateria ou caso de teste vinculado
    if (hasFailedTest) {
      const failCount = linkedTests.filter(tc => tc.status === 'fail').length;
      return {
        cssClass: 'status-fail',
        label: '✖ Teste Reprovado',
        title: `${failCount} teste(s) reprovado(s). Clique para revisar homologação de QA.`
      };
    }

    // 2. Demanda com bloqueio formal de QA
    if (task.impediment && task.impediment.toLowerCase().includes('qa')) {
      return {
        cssClass: 'status-fail',
        label: '⚠️ Bloqueio QA',
        title: `${task.impediment}. Clique para revisar ou alterar validação.`
      };
    }

    // 3. Demanda formalmente homologada e aprovada em QA (qaApproved = 1 / true)
    if (task.qaApproved == 1 || task.qaApproved === true) {
      const reviewer = task.qaReviewer || 'QA';
      const notes = task.qaNotes ? `: "${task.qaNotes}"` : '';
      return {
        cssClass: 'status-pass',
        label: '✓ QA Aprovado',
        title: `Homologado por ${reviewer}${notes}. Clique para alterar status de validação.`
      };
    }

    // 4. Casos de teste concluídos com sucesso (pass)
    if (linkedTests.length > 0 && hasPassedTest && !hasPendingTest) {
      return {
        cssClass: 'status-pass',
        label: '✓ Teste Aprovado',
        title: `${linkedTests.length} caso(s) de teste aprovado(s). Clique para ver detalhes.`
      };
    }

    // 5. Demanda em estágio de QA aguardando homologação
    if (task.status === 'qa') {
      return {
        cssClass: 'status-pending',
        label: '🔍 Em Validação QA',
        title: 'Demanda aguardando validação formal de QA. Clique para validar agora.'
      };
    }

    // 6. Casos de testes cadastrados aguardando execução
    if (linkedTests.length > 0 && hasPendingTest) {
      return {
        cssClass: 'status-pending',
        label: '⏳ Teste Pendente',
        title: `${linkedTests.length} teste(s) vinculado(s) aguardando execução. Clique para validar.`
      };
    }

    // 7. Padrão: Nenhum teste realizado ainda
    return {
      cssClass: 'status-pending',
      label: '⏳ Pendente',
      title: 'Nenhum teste homologado ou cadastrado ainda. Clique para validar QA.'
    };
  }

  const sampleTasks = store.state.tasks.slice(0, 6);
  sampleTasks.forEach(task => {
    const req = store.getRequirementById(task.reqId);
    const project = store.getProjectById(task.projectId);
    const assignee = store.getMemberById(task.assigneeId);
    const cov = getTaskTestCoverage(task);

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

    const taskSpec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(task.role) : { tagClass: 'role-back', icon: '💻', shortLabel: 'Dev' };
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${req ? req.code : 'Avulso'}</strong> - ${req ? req.title : task.title}</td>
      <td><span class="badge-subtle">${project ? project.name : '-'}</span></td>
      <td>${task.title} ${hoursBadge} <br><small style="color: var(--text-muted);">Responsável: ${assignee ? assignee.name : 'Não Atribuído'}</small></td>
      <td><span class="task-role-tag ${taskSpec.tagClass}">${taskSpec.icon} ${taskSpec.shortLabel || taskSpec.label}</span></td>
      <td><span class="status-pill status-${task.status === 'done' ? 'pass' : 'pending'}">${statusLabels[task.status] || task.status}</span></td>
      <td>
        <span class="status-pill clickable ${cov.cssClass}" 
              onclick="openQAModal('${task.id}')" 
              title="${cov.title}">
          ${cov.label}
        </span>
      </td>
    `;
    traceTableBody.appendChild(tr);
  });
}

// ==============================================================================
// GESTÃO DE MODO DE EXIBIÇÃO: BLOCOS (CARDS) VS LISTA COMPACTA
// Persistência em LocalStorage e Sincronização entre Áreas
// ==============================================================================

function getViewLayoutMode(viewName) {
  try {
    return localStorage.getItem(`synchro_view_layout_${viewName}`) || localStorage.getItem(`devsquad_view_layout_${viewName}`) || 'cards';
  } catch (e) {
    return 'cards';
  }
}
window.getViewLayoutMode = getViewLayoutMode;

function setViewLayoutMode(viewName, mode) {
  try {
    localStorage.setItem(`synchro_view_layout_${viewName}`, mode);
  } catch (e) {
    console.error('Erro ao salvar preferência de layout:', e);
  }
  updateViewLayoutToggleUI(viewName, mode);
  if (viewName === 'projects') renderProjects();
  else if (viewName === 'requirements') renderRequirements();
  else if (viewName === 'kanban') renderKanban();
  else if (viewName === 'team') renderTeam();
}
window.setViewLayoutMode = setViewLayoutMode;

function updateViewLayoutToggleUI(viewName, currentMode) {
  const mode = currentMode || getViewLayoutMode(viewName);
  const toggle = document.querySelector(`.view-layout-toggle[data-view="${viewName}"]`);
  if (!toggle) return;
  toggle.querySelectorAll('.view-mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}
window.updateViewLayoutToggleUI = updateViewLayoutToggleUI;

// --- RENDERIZAR ABA: PROJETOS (CRUD) ---
function renderProjects() {
  const container = document.getElementById('projects-cards-container');
  if (!container) return;
  container.innerHTML = '';

  const mode = getViewLayoutMode('projects');
  updateViewLayoutToggleUI('projects', mode);
  container.classList.toggle('is-list-view', mode === 'list');

  const projects = store.getProjects();
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1; width: 100%;">
        <p style="font-size: 1.15rem; margin-bottom: 0.85rem;">Nenhum projeto encontrado com os filtros aplicados.</p>
        ${perms.canCreateProject ? '<button class="btn btn-primary" onclick="openProjectModalForCreate()">+ Cadastrar Novo Projeto</button>' : ''}
      </div>
    `;
    return;
  }

  if (mode === 'list') {
    // Modo Lista: Tabela compacta de alta densidade
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-responsive list-mode-table-wrap';

    let rowsHtml = '';
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
        actionsHtml += `<button class="btn btn-secondary btn-xs" onclick="openProjectModalForEdit('${project.id}')" title="Editar Projeto">✏️ Editar</button>`;
      }
      if (canDeleteProject) {
        actionsHtml += `<button class="btn btn-danger btn-xs" onclick="confirmDeleteProject('${project.id}', '${escapeHtml(project.name)}')" title="Excluir Projeto">🗑️ Excluir</button>`;
      }
      if (!actionsHtml) {
        actionsHtml = `<span style="font-size: 0.72rem; color: var(--text-muted);">🔒 Leitura</span>`;
      }

      rowsHtml += `
        <tr>
          <td>
            <span class="project-code-tag" style="border-left: 3px solid ${project.color || '#3b82f6'};">${escapeHtml(project.code || 'PROJ')}</span>
          </td>
          <td>
            <div class="cell-title-group">
              <strong class="cell-main-title" ${canEditProject ? `onclick="openProjectModalForEdit('${project.id}')" style="cursor: pointer;"` : ''}>${escapeHtml(project.name)}</strong>
              <span class="cell-sub-desc" title="${escapeHtml(project.desc || '')}">${escapeHtml(project.desc || 'Sem descrição cadastrada.')}</span>
            </div>
          </td>
          <td>
            <span class="status-pill ${statusBadgeClass}">${project.status}</span>
          </td>
          <td>
            <div class="mini-progress-row">
              <div style="display: flex; justify-content: space-between; font-size: 0.74rem; font-weight: 600;">
                <span>${progressPercent}%</span>
                <span style="color: var(--text-muted); font-size: 0.7rem;">(${completedTasks}/${pTasks.length} dem.)</span>
              </div>
              <div class="progress-track mini-track">
                <div class="progress-fill" style="width: ${progressPercent}%; background: ${project.color || '#3b82f6'};"></div>
              </div>
              <div class="mini-metrics-chips">
                <span class="metric-mini-tag" title="Requisitos">📋 ${pReqs.length} reqs</span>
                <span class="metric-mini-tag" title="Demandas">💻 ${pTasks.length} dem.</span>
                <span class="metric-mini-tag" title="Casos de Teste QA">🧪 ${pTests.length} testes</span>
                <span class="metric-mini-tag deadline-tag" title="Data de Entrega">📅 ${project.deadline ? formatDateBR(project.deadline) : 'A definir'}</span>
              </div>
            </div>
          </td>
          <td>
            <div class="table-actions-cell">${actionsHtml}</div>
          </td>
        </tr>
      `;
    });

    tableWrap.innerHTML = `
      <table class="compact-data-table">
        <thead>
          <tr>
            <th style="width: 110px;">Identificador</th>
            <th>Nome / Título</th>
            <th style="width: 140px;">Status</th>
            <th style="width: 270px;">Métricas / Progresso</th>
            <th style="width: 140px; text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
    container.appendChild(tableWrap);
  } else {
    // Modo Cards (Grelha original)
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
}

function formatDateBR(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function formatDateTimeBR(isoOrDateStr) {
  if (!isoOrDateStr) return '';
  try {
    const d = new Date(isoOrDateStr);
    if (isNaN(d.getTime())) return isoOrDateStr;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch (e) {
    return isoOrDateStr;
  }
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
  const featInput = document.getElementById('project-features-input');
  if (featInput) featInput.value = "";
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
  const featInput = document.getElementById('project-features-input');
  if (featInput) {
    featInput.value = Array.isArray(project.features) ? project.features.join(', ') : (project.features || "");
  }

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
  if (!container) return;
  container.innerHTML = '';

  const mode = getViewLayoutMode('requirements');
  updateViewLayoutToggleUI('requirements', mode);
  container.classList.toggle('is-list-view', mode === 'list');

  const requirements = store.getRequirements();
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (requirements.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 2.5rem; text-align: center; color: var(--text-muted); width: 100%;">
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

  if (mode === 'list') {
    // Modo Lista: Tabela compacta de alta densidade
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-responsive list-mode-table-wrap';

    let rowsHtml = '';
    requirements.forEach(req => {
      const project = store.getProjectById(req.projectId);
      const linkedTasks = store.state.tasks.filter(t => t.reqId === req.id);
      const linkedTests = store.state.testCases.filter(tc => tc.reqId === req.id);
      const linkedApfs = (store.state.apfItems || []).filter(a => a.reqId === req.id);
      const totalReqPf = linkedApfs.reduce((s, a) => s + (a.finalPf || 0), 0);
      const moscowClass = req.moscow === 'Must' ? 'moscow-must' : (req.moscow === 'Should' ? 'moscow-should' : 'moscow-could');

      let reqActionsHtml = '';
      if (perms.canCreateTask) {
        reqActionsHtml += `<button class="btn-add-task-xs" onclick="openTaskModalForCreate('${req.id}')" title="Criar Demanda vinculada a este Requisito">➕ Tarefa</button>`;
      }
      if (perms.canManageApf) {
        reqActionsHtml += `<button class="card-btn-action btn-xs" style="color: #c084fc; border-color: rgba(168,85,247,0.35);" onclick="openApfAutoModal('${req.id}')" title="Gerar Pontos de Função automaticamente para este Requisito">⚡ APF</button>`;
      }
      if (perms.canEditReq) {
        reqActionsHtml += `<button class="card-btn-action btn-xs" onclick="openReqModalForEdit('${req.id}')" title="Editar Requisito">✏️ Editar</button>`;
      }
      if (perms.canDeleteReq) {
        reqActionsHtml += `<button class="card-btn-action btn-del btn-xs" onclick="confirmDeleteRequirement('${req.id}', '${req.code}', '${escapeHtml(req.title)}')" title="Excluir Requisito">🗑️ Excluir</button>`;
      }
      if (!reqActionsHtml) {
        reqActionsHtml = `<span style="font-size: 0.72rem; color: var(--text-muted);">🔒 Leitura</span>`;
      }

      rowsHtml += `
        <tr id="req-row-${req.id}">
          <td>
            <div style="display: flex; flex-direction: column; gap: 2px;">
              <span class="req-code-badge">${escapeHtml(req.code)}</span>
              <span class="badge-subtle" style="font-size: 0.68rem; align-self: flex-start;">${req.type === 'non-functional' ? 'RNF' : 'RF'}</span>
            </div>
          </td>
          <td>
            <div class="cell-title-group">
              <strong class="cell-main-title" ${perms.canEditReq ? `onclick="openReqModalForEdit('${req.id}')" style="cursor: pointer;"` : ''}>${escapeHtml(req.title)}</strong>
              <div class="cell-sub-meta">
                <span class="badge-subtle" style="font-size: 0.7rem;">${project ? escapeHtml(project.name) : 'Geral'}</span>
                ${req.feature ? `<span class="badge-feature-pill" title="Feature / Módulo de Negócio">🧩 ${escapeHtml(req.feature)}</span>` : ''}
                ${req.createdAt ? `<span class="badge-subtle req-date-badge" style="font-size: 0.7rem; color: var(--text-muted);" title="Data de Criação: ${formatDateTimeBR(req.createdAt)}">🕒 ${formatDateTimeBR(req.createdAt)}</span>` : ''}
                <span class="cell-sub-desc" title="História de Usuário: ${escapeHtml(req.userStory || '')}">📖 ${escapeHtml(req.userStory || 'Sem User Story')}</span>
              </div>
            </div>
          </td>
          <td>
            <span class="moscow-badge ${moscowClass}">${moscowLabels[req.moscow] || req.moscow}</span>
          </td>
          <td>
            <div class="mini-metrics-chips">
              <span class="metric-mini-tag" title="Demandas Vinculadas">🔗 <strong>${linkedTasks.length}</strong> demandas</span>
              <span class="metric-mini-tag" title="Casos de Teste QA">🧪 <strong>${linkedTests.length}</strong> testes</span>
              ${linkedApfs.length > 0 ? `<span class="metric-mini-tag" style="color: #c084fc; border-color: rgba(168,85,247,0.35);" title="${linkedApfs.length} Funções APF vinculadas">📐 <strong>${totalReqPf.toFixed(1)}</strong> PF</span>` : ''}
            </div>
            ${linkedTasks.length > 0 ? `
              <div style="margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px;">
                ${linkedTasks.slice(0, 3).map(t => `
                  <span class="task-role-tag ${t.role ? 'role-' + t.role : 'role-back'}" onclick="openTaskModalForEdit('${t.id}')" title="Demanda #${t.id}: ${escapeHtml(t.title)}" style="cursor: pointer; font-size: 0.68rem; padding: 1px 5px;">#${t.id.slice(-4)}</span>
                `).join('')}
                ${linkedTasks.length > 3 ? `<span style="font-size: 0.7rem; color: var(--text-muted);">+${linkedTasks.length - 3}</span>` : ''}
              </div>
            ` : ''}
          </td>
          <td>
            <div class="table-actions-cell">${reqActionsHtml}</div>
          </td>
        </tr>
      `;
    });

    tableWrap.innerHTML = `
      <table class="compact-data-table">
        <thead>
          <tr>
            <th style="width: 100px;">Identificador</th>
            <th>Nome / Título</th>
            <th style="width: 160px;">Status</th>
            <th style="width: 250px;">Métricas / Progresso</th>
            <th style="width: 180px; text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
    container.appendChild(tableWrap);
  } else {
    // Modo Cards (Grelha original)
    requirements.forEach(req => {
      const project = store.getProjectById(req.projectId);
      const linkedTasks = store.state.tasks.filter(t => t.reqId === req.id);
      const linkedTests = store.state.testCases.filter(tc => tc.reqId === req.id);
      const linkedApfs = (store.state.apfItems || []).filter(a => a.reqId === req.id);
      const totalReqPf = linkedApfs.reduce((s, a) => s + (a.finalPf || 0), 0);
      const moscowClass = req.moscow === 'Must' ? 'moscow-must' : (req.moscow === 'Should' ? 'moscow-should' : 'moscow-could');

      let reqActionsHtml = '';
      if (perms.canCreateTask) {
        reqActionsHtml += `<button class="card-btn-action btn-add-task" onclick="openTaskModalForCreate('${req.id}')" title="Criar Demanda vinculada a este Requisito">➕ Criar Tarefa</button>`;
      }
      if (perms.canManageApf) {
        reqActionsHtml += `<button class="card-btn-action" style="color: #c084fc; border-color: rgba(168,85,247,0.35);" onclick="openApfAutoModal('${req.id}')" title="Gerar Pontos de Função automaticamente para este Requisito">⚡ Gerar APF</button>`;
      }
      if (perms.canEditReq) {
        reqActionsHtml += `<button class="card-btn-action" onclick="openReqModalForEdit('${req.id}')" title="Editar Requisito">✏️ Editar</button>`;
      }
      if (perms.canDeleteReq) {
        reqActionsHtml += `<button class="card-btn-action btn-del" onclick="confirmDeleteRequirement('${req.id}', '${req.code}', '${escapeHtml(req.title)}')" title="Excluir Requisito">🗑️ Excluir</button>`;
      }

      const card = document.createElement('article');
      card.className = 'requirement-card glass-panel';
      card.id = `req-card-${req.id}`;
      card.setAttribute('data-req-id', req.id);
      card.innerHTML = `
        <div class="req-header-row">
          <span class="req-code-badge">${req.code}</span>
          <h3 class="req-title">${escapeHtml(req.title)}</h3>
          <span class="moscow-badge ${moscowClass}">${moscowLabels[req.moscow] || req.moscow}</span>
          <span class="badge-subtle">${project ? escapeHtml(project.name) : 'Geral'}</span>
          ${req.feature ? `<span class="badge-feature" title="Feature / Módulo de Negócio">🧩 ${escapeHtml(req.feature)}</span>` : ''}
          ${linkedApfs.length > 0 ? `<span class="badge-subtle badge-apf-counter" title="${linkedApfs.length} Funções APF vinculadas">📐 ${linkedApfs.length} APF (${totalReqPf.toFixed(1)} PF)</span>` : ''}
          ${req.createdAt ? `<span class="badge-subtle req-date-badge" style="font-size: 0.72rem; color: var(--text-muted);" title="Data de Criação: ${formatDateTimeBR(req.createdAt)}">🕒 ${formatDateTimeBR(req.createdAt)}</span>` : ''}
          
          <div class="card-header-actions" style="margin-left: auto;">
            ${reqActionsHtml ? reqActionsHtml : '<span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600;">🔒 Somente leitura</span>'}
          </div>
        </div>

        <div class="user-story-quote">
          <strong>História de Usuário:</strong> ${escapeHtml(req.userStory || 'Não preenchida.')}
        </div>

        <div class="bdd-container">
          <div class="bdd-title">Critérios de Aceite (Cenário: Dado / Quando / Então):</div>
          <div class="bdd-content">${escapeHtml(req.bdd || 'Critérios não documentados.')}</div>
        </div>

        <div class="req-footer-row">
          <div class="req-linked-tasks-block">
            <div class="req-linked-tasks-header" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
              <span class="req-linked-tasks-label">🔗 <strong>Demandas Vinculadas (${linkedTasks.length}):</strong></span>
              ${perms.canCreateTask ? `
                <button class="card-btn-action btn-add-task-pill" onclick="openTaskModalForCreate('${req.id}')" title="Criar Tarefa para este Requisito">
                  ➕ Criar Tarefa
                </button>
              ` : ''}
            </div>
            <div class="req-linked-tasks-list" style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${linkedTasks.length > 0 ? linkedTasks.map(t => {
                const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(t.role) : { tagClass: 'role-back', icon: '💻', shortLabel: 'Dev' };
                return `
                  <span class="task-role-tag ${spec.tagClass} linked-task-chip" onclick="openTaskModalForEdit('${t.id}')" title="Demanda #${t.id}: ${escapeHtml(t.title)} (Clique para inspecionar)" style="cursor: pointer;">
                    ${spec.icon} ${spec.shortLabel || spec.label} <strong>#${t.id.slice(-5)}</strong>: ${escapeHtml(t.title)}
                  </span>
                `;
              }).join('') : '<span style="color: var(--text-muted); font-size: 0.82rem; font-style: italic;">Nenhuma demanda vinculada</span>'}
            </div>
          </div>
          <div class="req-linked-tests-block" style="margin-left: auto; align-self: flex-start;">
            <span>🧪 Casos de Teste QA: <strong>${linkedTests.length}</strong></span>
          </div>
        </div>
      `;
      container.appendChild(card);
    });
  }
}

// ==============================================================================
// Controle de incremento e trava automática do Código do Requisito
// ==============================================================================
let isManualReqCode = false;

function getNextRequirementCode(projectId, reqType) {
  const prefix = reqType === 'non-functional' ? 'RNF' : 'RF';
  if (!projectId) return `${prefix}-01`;

  // Consulta requisitos cadastrados especificamente para o projeto
  const projectReqs = (store.state.requirements || []).filter(r => r.projectId === projectId);
  
  let maxNum = 0;
  let detectedPadding = 2; // Padrão RF-01, RF-08, etc.

  projectReqs.forEach(r => {
    const rawCode = (r.code || '').trim();
    if (!rawCode) return;

    // 1. Tentar casar com o prefixo do tipo (ex: RF-07, RF07, RF_07, RNF-02)
    const prefixRegex = new RegExp(`^${prefix}[-_\\s]?(\\d+)`, 'i');
    const match = rawCode.match(prefixRegex);

    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxNum) {
        maxNum = num;
        if (match[1].length > detectedPadding) {
          detectedPadding = match[1].length;
        }
      }
    } else if (r.type === reqType) {
      // 2. Se for do mesmo tipo mas código sem prefixo fixo, extrai qualquer sufixo numérico
      const numMatch = rawCode.match(/(\d+)/);
      if (numMatch) {
        const num = parseInt(numMatch[1], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
  });

  const nextNum = maxNum + 1;
  const padLength = Math.max(2, detectedPadding);
  const formattedNum = String(nextNum).padStart(padLength, '0');
  return `${prefix}-${formattedNum}`;
}

function updateAutoReqCode() {
  if (isManualReqCode) return;
  const editId = document.getElementById('req-id-edit')?.value;
  if (editId) return; // Não sobrescreve código na edição de requisito existente

  const projectId = document.getElementById('req-project')?.value;
  const reqType = document.getElementById('req-type')?.value || 'functional';

  if (!projectId) return;

  const nextCode = getNextRequirementCode(projectId, reqType);
  const codeInput = document.getElementById('req-code');
  if (codeInput) {
    codeInput.value = nextCode;
  }
}

function setReqCodeMode(manual) {
  isManualReqCode = manual;
  const codeInput = document.getElementById('req-code');
  const lockIcon = document.getElementById('req-code-lock-icon');
  const lockLabel = document.getElementById('req-code-lock-label');
  const pill = document.getElementById('req-code-status-pill');

  if (manual) {
    if (codeInput) {
      codeInput.readOnly = false;
      codeInput.style.background = 'transparent';
      codeInput.style.cursor = 'text';
      codeInput.style.color = 'var(--text-main)';
    }
    if (lockIcon) lockIcon.textContent = '🔓';
    if (lockLabel) lockLabel.textContent = 'Manual';
    if (pill) {
      pill.textContent = 'Manual';
      pill.style.background = 'rgba(245, 158, 11, 0.15)';
      pill.style.color = '#f59e0b';
      pill.style.borderColor = 'rgba(245, 158, 11, 0.3)';
    }
  } else {
    if (codeInput) {
      codeInput.readOnly = true;
      codeInput.style.background = 'rgba(255, 255, 255, 0.04)';
      codeInput.style.cursor = 'not-allowed';
      codeInput.style.color = '#a5b4fc';
    }
    if (lockIcon) lockIcon.textContent = '🔒';
    if (lockLabel) lockLabel.textContent = 'Auto';
    if (pill) {
      pill.textContent = 'Auto';
      pill.style.background = 'rgba(16, 185, 129, 0.15)';
      pill.style.color = '#34d399';
      pill.style.borderColor = 'rgba(16, 185, 129, 0.3)';
    }
  }
}

function toggleReqCodeLock() {
  const editId = document.getElementById('req-id-edit')?.value;
  if (editId) return;

  setReqCodeMode(!isManualReqCode);
  if (!isManualReqCode) {
    updateAutoReqCode();
    showToast('Modo automático ativado: código sequencial gerado.');
  } else {
    document.getElementById('req-code')?.focus();
    showToast('Modo manual ativado: você pode ajustar o código.');
  }
}
window.toggleReqCodeLock = toggleReqCodeLock;
window.updateAutoReqCode = updateAutoReqCode;

function updateModalFeaturesDropdown(selectedProjectId, currentFeatureValue = '') {
  const featureSelect = document.getElementById('req-feature');
  const customInput = document.getElementById('req-feature-custom');
  if (!featureSelect) return;

  const features = store.getProjectFeatures(selectedProjectId);
  featureSelect.innerHTML = '';

  const defaultOpt = document.createElement('option');
  defaultOpt.value = '';
  defaultOpt.textContent = features.length === 0 
    ? '-- Nenhuma feature cadastrada neste projeto --' 
    : '-- Selecione a Feature / Módulo --';
  featureSelect.appendChild(defaultOpt);

  let hasSelected = false;
  features.forEach(feat => {
    const opt = document.createElement('option');
    opt.value = feat;
    opt.textContent = `🧩 ${feat}`;
    if (currentFeatureValue && feat.toLowerCase() === currentFeatureValue.toLowerCase()) {
      opt.selected = true;
      hasSelected = true;
    }
    featureSelect.appendChild(opt);
  });

  const newOpt = document.createElement('option');
  newOpt.value = '__new__';
  newOpt.textContent = '➕ Cadastrar Nova Feature / Módulo...';
  featureSelect.appendChild(newOpt);

  if (currentFeatureValue && !hasSelected) {
    const customOpt = document.createElement('option');
    customOpt.value = currentFeatureValue;
    customOpt.textContent = `🧩 ${currentFeatureValue}`;
    customOpt.selected = true;
    featureSelect.insertBefore(customOpt, newOpt);
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  } else {
    if (customInput) {
      customInput.style.display = 'none';
      customInput.value = '';
    }
  }
}
window.updateModalFeaturesDropdown = updateModalFeaturesDropdown;

function populateFeatureFilterOptions() {
  const select = document.getElementById('req-feature-filter');
  if (!select) return;

  const currentVal = store.reqFeatureFilter || 'all';
  const features = store.getProjectFeatures(store.selectedProject);

  select.innerHTML = '<option value="all">Todas as Features</option>';
  features.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = `🧩 ${f}`;
    if (f.toLowerCase() === currentVal.toLowerCase()) {
      opt.selected = true;
    }
    select.appendChild(opt);
  });

  if (currentVal !== 'all' && !features.some(f => f.toLowerCase() === currentVal.toLowerCase())) {
    store.reqFeatureFilter = 'all';
    select.value = 'all';
  }
}
window.populateFeatureFilterOptions = populateFeatureFilterOptions;

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

  // Se houver um projeto selecionado no filtro geral, pré-seleciona ele
  if (store.selectedProject && store.selectedProject !== 'all') {
    const projSelect = document.getElementById('req-project');
    if (projSelect) projSelect.value = store.selectedProject;
  }

  const currentProjId = document.getElementById('req-project')?.value;
  updateModalFeaturesDropdown(currentProjId, '');

  // Define modo automático bloqueado e calcula o próximo código sequencial
  setReqCodeMode(false);
  updateAutoReqCode();
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
  updateModalFeaturesDropdown(req.projectId, req.feature || '');
  document.getElementById('req-type').value = req.type;
  document.getElementById('req-moscow').value = req.moscow;
  document.getElementById('req-user-story').value = req.userStory || "";
  document.getElementById('req-bdd').value = req.bdd || "";
  document.getElementById('btn-save-req').textContent = "Atualizar Requisito";

  openModal('modal-requirement');

  // Na edição de requisito já existente, permite edição livre do código
  setReqCodeMode(true);
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
  const kanbanBoard = document.getElementById('kanban-board');
  const listContainer = document.getElementById('kanban-list-container');

  const mode = getViewLayoutMode('kanban');
  updateViewLayoutToggleUI('kanban', mode);

  if (mode === 'list') {
    if (kanbanBoard) kanbanBoard.style.display = 'none';
    if (listContainer) listContainer.style.display = 'block';
  } else {
    if (kanbanBoard) kanbanBoard.style.display = 'grid';
    if (listContainer) listContainer.style.display = 'none';
  }

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

  const colNames = {
    backlog: 'A Fazer (Backlog)',
    spec: 'Em Especificação',
    dev: 'Em Desenvolvimento',
    qa: 'Em Testes / Validação',
    done: 'Concluído'
  };

  if (mode === 'list' && listContainer) {
    if (tasks.length === 0) {
      listContainer.innerHTML = `
        <div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-muted); width: 100%;">
          <p style="font-size: 1.15rem; margin-bottom: 0.85rem;">Nenhuma demanda encontrada com os filtros aplicados.</p>
          ${perms.canCreateTask ? '<button class="btn btn-primary" onclick="openTaskModalForCreate()">+ Nova Demanda</button>' : ''}
        </div>
      `;
    } else {
      let rowsHtml = '';
      tasks.forEach(task => {
        const colStatus = task.status || 'backlog';
        counts[colStatus] = (counts[colStatus] || 0) + 1;

        const project = store.getProjectById(task.projectId);
        const assignee = store.getMemberById(task.assigneeId);
        const priorityClass = task.priority === 'Alta' ? 'pri-alta' : (task.priority === 'Média' ? 'pri-media' : 'pri-baixa');
        const taskSpec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(task.role) : { borderClass: 'task-back', tagClass: 'role-back', icon: '💻', label: 'Geral', shortLabel: 'Dev' };

        const isAdmin = currentUser && currentUser.role === 'admin';
        const isOverEstimated = task.hoursSpent && (parseFloat(task.hoursSpent) > (parseFloat(task.hours) || 8));
        const hoursText = task.hoursSpent ? `${task.hoursSpent}/${task.hours || 8}h` : `${task.hours || 8}h`;
        const hoursColor = isOverEstimated ? '#f43f5e' : 'var(--text-muted)';
        const hoursFontWeight = isOverEstimated ? '700' : 'normal';
        const hoursTitle = isAdmin 
          ? `👑 Admin: ${task.hoursSpent || 0}h apontadas / ${task.hours || 8}h estimadas. Clique para alterar o saldo de horas.` 
          : (isOverEstimated ? `⚠️ Horas apontadas (${task.hoursSpent}h) excederam a estimativa (${task.hours || 8}h)!` : 'Horas gastas / estimadas');

        let badgesHtml = '';
        if (task.impediment) {
          badgesHtml += `<span class="task-impediment-badge" style="font-size: 0.68rem; padding: 1px 5px;" title="${escapeHtml(task.impediment)}">⚠️ Impedimento</span>`;
        }
        if (task.qaApproved) {
          badgesHtml += `<span class="task-qa-approved-badge" style="font-size: 0.68rem; padding: 1px 5px;">✓ QA</span>`;
        }

        let opBtnsHtml = '';
        if (perms.canLogTime) {
          opBtnsHtml += `<button class="card-btn-action btn-xs" onclick="openTimesheetModal('${task.id}')" title="Apontar Horas">⏱️</button>`;
        }
        if (colStatus === 'qa' && perms.canValidateQA && !task.qaApproved) {
          opBtnsHtml += `<button class="card-btn-action btn-xs" onclick="openQAModal('${task.id}')" title="Validar QA">🧪</button>`;
        }
        opBtnsHtml += `<button class="card-btn-action btn-xs" onclick="openTaskModalForEdit('${task.id}')" title="${perms.canCreateTask ? 'Editar Demanda' : 'Ver Detalhes'}">${perms.canCreateTask ? '✏️' : '👁️'}</button>`;
        if (perms.canDeleteTask) {
          opBtnsHtml += `<button class="card-btn-action btn-del btn-xs" onclick="confirmDeleteTask('${task.id}', '${escapeHtml(task.title)}')" title="Excluir Demanda">🗑️</button>`;
        }

        rowsHtml += `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                <span class="task-id-badge">#${task.id.slice(-5)}</span>
                <span class="task-role-tag ${taskSpec.tagClass}" style="font-size: 0.72rem; padding: 2px 6px;">${taskSpec.icon} ${taskSpec.shortLabel || taskSpec.label}</span>
                <span class="task-priority-tag ${priorityClass}" style="font-size: 0.7rem; padding: 2px 6px;">${task.priority}</span>
              </div>
            </td>
            <td>
              <div class="cell-title-group">
                <strong class="cell-main-title" onclick="openTaskModalForEdit('${task.id}')" style="cursor: pointer;">${escapeHtml(task.title)}</strong>
                <div class="cell-sub-meta">
                  <span style="color: var(--text-muted); font-size: 0.73rem;">📁 ${project ? escapeHtml(project.name) : 'Geral'}</span>
                  ${badgesHtml}
                </div>
              </div>
            </td>
            <td>
              <select class="task-status-select" onchange="moveTaskAction('${task.id}', this.value)" title="Alterar status da demanda">
                <option value="backlog" ${colStatus === 'backlog' ? 'selected' : ''}>⚪ A Fazer</option>
                <option value="spec" ${colStatus === 'spec' ? 'selected' : ''}>🟣 Em Especificação</option>
                <option value="dev" ${colStatus === 'dev' ? 'selected' : ''}>🔵 Em Desenvolvimento</option>
                <option value="qa" ${colStatus === 'qa' ? 'selected' : ''}>🟡 Em Testes / QA</option>
                <option value="done" ${colStatus === 'done' ? 'selected' : ''}>🟢 Concluído</option>
              </select>
            </td>
            <td>
              <div class="task-list-assignee-metrics">
                <div class="task-assignee-wrap" title="${assignee ? escapeHtml(assignee.name) : 'Sem responsável'}">
                  <div class="task-avatar-mini" style="background: ${assignee ? assignee.avatarBg : '#64748b'}; color: #fff; width: 22px; height: 22px; font-size: 0.7rem;">
                    ${assignee ? assignee.name.charAt(0) : '?'}
                  </div>
                  <span class="task-assignee-name" style="font-size: 0.78rem;">${assignee ? escapeHtml(assignee.name.split(' ')[0]) : 'Livre'}</span>
                </div>
                <span class="task-hours-badge" style="color: ${hoursColor}; font-weight: ${hoursFontWeight}; font-size: 0.74rem;" title="${hoursTitle}">⏱️ ${hoursText}${isOverEstimated ? ' ⚠️' : ''}</span>
                <span class="task-complexity-tag ${task.complexity === 'Alta' ? 'complexity-high' : (task.complexity === 'Baixa' ? 'complexity-low' : 'complexity-med')}" style="font-size: 0.7rem; padding: 1px 5px;">⚡ ${task.complexity || 'Média'}</span>
              </div>
            </td>
            <td>
              <div class="table-actions-cell">${opBtnsHtml}</div>
            </td>
          </tr>
        `;
      });

      listContainer.innerHTML = `
        <div class="table-responsive list-mode-table-wrap">
          <table class="compact-data-table">
            <thead>
              <tr>
                <th style="width: 170px;">Identificador</th>
                <th>Nome / Título</th>
                <th style="width: 170px;">Status</th>
                <th style="width: 250px;">Métricas / Responsável</th>
                <th style="width: 150px; text-align: right;">Ações</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>
      `;
    }
  } else {
    // Modo Cards (Quadro Kanban com colunas)
    tasks.forEach(task => {
      const colStatus = task.status || 'backlog';
      counts[colStatus] = (counts[colStatus] || 0) + 1;

      const zone = document.getElementById(`zone-${colStatus}`);
      if (!zone) return;

      const project = store.getProjectById(task.projectId);
      const assignee = store.getMemberById(task.assigneeId);
      const priorityClass = task.priority === 'Alta' ? 'pri-alta' : (task.priority === 'Média' ? 'pri-media' : 'pri-baixa');
      const taskSpec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(task.role) : { borderClass: 'task-back', tagClass: 'role-back', icon: '💻', label: 'Geral', shortLabel: 'Dev' };
      const roleBorderClass = taskSpec.borderClass;
      const roleLabel = taskSpec.label;

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

      // Badges operacionais de RBAC (Impedimento / QA Aprovado / Notas Dev / Notas QA)
      let badgesHtml = '';
      if (task.impediment) {
        badgesHtml += `<div class="task-impediment-badge" title="${task.impediment}">⚠️ ${task.impediment}</div>`;
      }
      if (task.qaApproved) {
        badgesHtml += `<div class="task-qa-approved-badge" ${perms.canValidateQA ? `onclick="openQAModal('${task.id}')" style="cursor: pointer;"` : ''} title="Aprovado por ${task.qaReviewer || 'QA'}. ${perms.canValidateQA ? 'Clique para revisar/alterar validação.' : ''}">✓ QA Aprovado</div>`;
      }
      if (task.devNotes && task.devNotes.trim()) {
        const devExcerpt = task.devNotes.replace(/"/g, '&quot;').substring(0, 100);
        badgesHtml += `<div class="task-notes-badge" onclick="openTaskModalForEdit('${task.id}')" style="cursor: pointer;" title="Notas do Desenvolvedor: ${devExcerpt}">💻 Notas Dev</div>`;
      }
      if (task.qaNotes && task.qaNotes.trim() && !task.qaApproved) {
        const qaExcerpt = task.qaNotes.replace(/"/g, '&quot;').substring(0, 100);
        badgesHtml += `<div class="task-qa-notes-badge" onclick="openTaskModalForEdit('${task.id}')" style="cursor: pointer;" title="Notas de QA: ${qaExcerpt}">🔍 Notas QA</div>`;
      }

      // Botões operacionais contextuais
      let opBtnsHtml = '';
      if (perms.canLogTime) {
        opBtnsHtml += `<button class="task-timesheet-btn" onclick="openTimesheetModal('${task.id}')" title="Apontar Horas Gastas e Impedimentos">⏱️ Apontar</button>`;
      }
      if (colStatus === 'qa' && perms.canValidateQA && !task.qaApproved) {
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

      const hasControls = opBtnsHtml || prevCol || nextCol;
      const controlsRowHtml = hasControls ? `
        <div class="task-controls-row">
          <div class="task-ops-group">
            ${opBtnsHtml}
          </div>
          <div class="task-actions-btn-group">
            ${prevCol ? `<button class="task-move-btn" onclick="moveTaskAction('${task.id}', '${prevCol}')" title="Mover para: ${colNames[prevCol]}">◀</button>` : ''}
            ${nextCol ? `<button class="task-move-btn" onclick="moveTaskAction('${task.id}', '${nextCol}')" title="Mover para: ${colNames[nextCol]}">▶</button>` : ''}
          </div>
        </div>
      ` : '';

      card.innerHTML = `
        <div class="task-tags-row">
          <div class="task-tags-left">
            <span class="task-role-tag ${taskSpec.tagClass}">${taskSpec.icon} ${taskSpec.shortLabel || taskSpec.label}</span>
            <span class="task-priority-tag ${priorityClass}">${task.priority}</span>
            <span class="task-complexity-tag ${task.complexity === 'Alta' ? 'complexity-high' : (task.complexity === 'Baixa' ? 'complexity-low' : 'complexity-med')}" title="Complexidade Técnica">⚡ ${task.complexity || 'Média'}</span>
          </div>
          <div class="task-tags-right">
            <span class="task-hours-badge" style="color: ${hoursColor}; font-weight: ${hoursFontWeight}; ${isAdmin ? 'cursor: pointer;' : ''}" title="${hoursTitle}" ${isAdmin ? `onclick="openTimesheetModal('${task.id}')"` : ''}>⏱️ ${hoursText}${isOverEstimated ? ' ⚠️' : ''}</span>
            <div class="card-header-actions">
              <button class="card-btn-action" onclick="openTaskModalForEdit('${task.id}')" title="${perms.canCreateTask ? 'Editar Demanda' : 'Ver Detalhes'}">${perms.canCreateTask ? '✏️' : '👁️'}</button>
              ${perms.canDeleteTask ? `<button class="card-btn-action btn-del" onclick="confirmDeleteTask('${task.id}', '${task.title}')" title="Excluir Demanda">🗑️</button>` : ''}
            </div>
          </div>
        </div>

        <div class="task-title">${task.title}</div>
        <div class="task-project-name">📁 ${project ? project.name : 'Geral'}</div>

        ${badgesHtml ? `<div class="task-badges-row">${badgesHtml}</div>` : ''}

        <div class="task-card-footer">
          <div class="task-assignee-row">
            <div class="task-assignee-wrap" title="${assignee ? assignee.name : 'Sem responsável'}">
              <div class="task-avatar-mini" style="background: ${assignee ? assignee.avatarBg : '#64748b'}; color: #fff;">
                ${assignee ? assignee.name.charAt(0) : '?'}
              </div>
              <span class="task-assignee-name">${assignee ? assignee.name.split(' ')[0] : 'Livre'}</span>
            </div>
            <div class="task-assign-action">
              ${assignBtnHtml}
            </div>
          </div>
          ${controlsRowHtml}
        </div>
      `;

      zone.appendChild(card);
    });
  }

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

// ==============================================================================
// GESTÃO DE ABAS & HISTÓRICO NO MODAL DE DEMANDA
// ==============================================================================

window.switchTaskModalTab = function(tabName) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isAdmin = currentUser && currentUser.role === 'admin';

  if (tabName === 'history' && !isAdmin) {
    showToast('Acesso restrito: apenas o Administrador do Sistema pode visualizar a auditoria.');
    return;
  }

  const btnForm = document.getElementById('tab-btn-task-form');
  const btnHist = document.getElementById('tab-btn-task-history');
  const btnReq = document.getElementById('tab-btn-task-req');
  const paneForm = document.getElementById('pane-task-form');
  const paneHist = document.getElementById('pane-task-history');
  const paneReq = document.getElementById('pane-task-req');

  btnForm?.classList.remove('active');
  btnHist?.classList.remove('active');
  btnReq?.classList.remove('active');

  if (paneForm) paneForm.style.display = 'none';
  if (paneHist) paneHist.style.display = 'none';
  if (paneReq) paneReq.style.display = 'none';

  if (tabName === 'history') {
    btnHist?.classList.add('active');
    if (paneHist) {
      paneHist.style.display = 'flex';
      paneHist.scrollTop = 0;
    }
  } else if (tabName === 'requirement') {
    btnReq?.classList.add('active');
    if (paneReq) {
      paneReq.style.display = 'flex';
      paneReq.scrollTop = 0;
    }
    renderTaskRequirementTab();
  } else {
    // Padrão: aba do formulário da demanda
    btnForm?.classList.add('active');
    if (paneForm) {
      paneForm.style.display = 'flex';
      const formEl = document.getElementById('form-new-task');
      if (formEl) formEl.scrollTop = 0;
    }
  }
};

window.updateTaskRequirementPreview = function(explicitReqOrId) {
  const reqSelect = document.getElementById('task-requirement');
  let reqRef = explicitReqOrId || (reqSelect ? reqSelect.value : null);

  // Se não foi passado explicitamente e o select está vazio, busca da demanda em edição
  if (!reqRef) {
    const editTaskId = document.getElementById('task-id-edit')?.value;
    if (editTaskId) {
      const t = store.getTaskById(editTaskId);
      if (t) reqRef = t.reqId || t.req_id || t.requirementId || t.reqCode || null;
    }
  }

  const btnToggle = document.getElementById('btn-toggle-req-spec-preview');
  const btnQuick = document.getElementById('btn-quick-expand-req');
  const tabBtnReq = document.getElementById('tab-btn-task-req');
  const tabBadge = document.getElementById('task-req-code-tab-badge');
  const panel = document.getElementById('task-req-preview-panel');

  if (!reqRef) {
    if (btnToggle) btnToggle.style.display = 'none';
    if (btnQuick) btnQuick.style.display = 'none';
    if (tabBtnReq) tabBtnReq.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  const req = (typeof explicitReqOrId === 'object' && explicitReqOrId && explicitReqOrId.code)
    ? explicitReqOrId
    : store.findRequirement(reqRef);

  if (!req) {
    if (btnToggle) btnToggle.style.display = 'none';
    if (btnQuick) btnQuick.style.display = 'none';
    if (tabBtnReq) tabBtnReq.style.display = 'none';
    if (panel) panel.style.display = 'none';
    return;
  }

  // Sincroniza o select com o ID do requisito
  if (reqSelect && reqSelect.value !== req.id) {
    reqSelect.value = req.id;
  }

  // Ativa botões e aba dedicada
  if (btnToggle) btnToggle.style.display = 'inline-flex';
  if (btnQuick) btnQuick.style.display = 'inline-flex';
  if (tabBtnReq) {
    tabBtnReq.style.display = 'inline-flex';
    if (tabBadge) tabBadge.textContent = req.code || 'RF';
  }

  const project = store.getProjectById ? store.getProjectById(req.projectId) : null;
  const projectName = project ? project.name : (req.project || 'Geral');

  const moscowLabels = {
    Must: "Must Have",
    Should: "Should Have",
    Could: "Could Have",
    "Won't": "Won't Have"
  };

  const moscowClasses = {
    Must: "moscow-must",
    Should: "moscow-should",
    Could: "moscow-could",
    "Won't": "badge-subtle"
  };

  const isRnf = req.type === 'RNF' || (req.code && req.code.startsWith('RNF'));

  // Preenche dados do painel inline/drawer
  const elCode = document.getElementById('preview-req-code');
  if (elCode) elCode.textContent = req.code || 'RF';

  const elTitle = document.getElementById('preview-req-title');
  if (elTitle) elTitle.textContent = req.title || '';

  const elType = document.getElementById('preview-req-type');
  if (elType) {
    elType.textContent = isRnf ? 'Não-Funcional (RNF)' : 'Funcional (RF)';
    elType.className = isRnf ? 'badge-subtle badge-rnf' : 'badge-subtle badge-rf';
  }

  const elMoscow = document.getElementById('preview-req-moscow');
  if (elMoscow) {
    elMoscow.textContent = moscowLabels[req.moscow] || req.moscow || 'Prioridade';
    elMoscow.className = `moscow-badge ${moscowClasses[req.moscow] || 'moscow-must'}`;
  }

  const elProject = document.getElementById('preview-req-project');
  if (elProject) elProject.textContent = `📁 ${projectName}`;

  const elUserStory = document.getElementById('preview-req-user-story');
  if (elUserStory) elUserStory.textContent = req.userStory || 'História de usuário não informada.';

  const elBdd = document.getElementById('preview-req-bdd');
  if (elBdd) elBdd.textContent = req.bdd || 'Critérios de aceite (Dado / Quando / Então) não documentados.';
};

window.toggleTaskReqPreview = function(forceOpen) {
  const panel = document.getElementById('task-req-preview-panel');
  if (!panel) return;

  const btnText = document.getElementById('btn-req-spec-text');
  const btnIcon = document.getElementById('btn-req-spec-icon');
  const btnQuick = document.getElementById('btn-quick-expand-req');

  const isCurrentlyOpen = panel.style.display !== 'none';
  const shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !isCurrentlyOpen;

  if (shouldOpen) {
    updateTaskRequirementPreview();
    panel.style.display = 'block';
    if (btnText) btnText.textContent = 'Ocultar Especificação';
    if (btnIcon) btnIcon.textContent = '🔼';
    if (btnQuick) {
      btnQuick.innerHTML = '✕';
      btnQuick.title = 'Recolher especificação do requisito';
    }
  } else {
    panel.style.display = 'none';
    if (btnText) btnText.textContent = 'Ver Especificação';
    if (btnIcon) btnIcon.textContent = '📖';
    if (btnQuick) {
      btnQuick.innerHTML = '👁️';
      btnQuick.title = 'Expandir especificação do requisito';
    }
  }
};

window.renderTaskRequirementTab = function() {
  const reqSelect = document.getElementById('task-requirement');
  let reqRef = reqSelect ? reqSelect.value : null;

  const editTaskId = document.getElementById('task-id-edit')?.value;
  let currentTask = null;
  if (editTaskId) {
    currentTask = store.getTaskById(editTaskId);
    if (!reqRef && currentTask) {
      reqRef = currentTask.reqId || currentTask.req_id || currentTask.requirementId || currentTask.reqCode || null;
    }
  }

  const contentEl = document.getElementById('task-req-tab-content');
  if (!contentEl) return;

  const req = store.findRequirement(reqRef);

  if (!req) {
    contentEl.innerHTML = `
      <div style="text-align: center; padding: 2.5rem 1.5rem; color: var(--text-muted);">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📋</div>
        <h4 style="color: var(--text-main); margin-bottom: 0.5rem; font-size: 1.1rem;">Nenhum Requisito Vinculado a Esta Demanda</h4>
        <p style="font-size: 0.85rem; max-width: 480px; margin: 0 auto 1.5rem auto; line-height: 1.5;">
          Esta demanda está configurada como avulsa. Vincule um requisito no seletor de "Requisito Vinculado" na aba anterior para visualizar a especificação técnica completa aqui.
        </p>
        <button type="button" class="btn btn-secondary btn-sm" onclick="switchTaskModalTab('form')">Voltar ao Formulário</button>
      </div>
    `;
    return;
  }

  // Sincroniza o select
  if (reqSelect && reqSelect.value !== req.id) {
    reqSelect.value = req.id;
  }

  const project = store.getProjectById ? store.getProjectById(req.projectId) : null;
  const projectName = project ? project.name : (req.project || 'Geral');

  const moscowLabels = {
    Must: "Obrigatório (Must Have)",
    Should: "Importante (Should Have)",
    Could: "Desejável (Could Have)",
    "Won't": "Não Prioritário"
  };

  const moscowClasses = {
    Must: "moscow-must",
    Should: "moscow-should",
    Could: "moscow-could",
    "Won't": "badge-subtle"
  };

  const isRnf = req.type === 'RNF' || (req.code && req.code.startsWith('RNF'));
  const typeLabel = isRnf ? 'Não-Funcional (RNF)' : 'Funcional (RF)';
  const linkedTasks = (store.state.tasks || []).filter(t => (t.reqId === req.id || t.req_id === req.id || t.reqId === req.code || t.req_id === req.code));

  contentEl.innerHTML = `
    <div class="task-req-tab-card glass-panel" style="padding: 1.25rem; border: 1px solid rgba(99, 102, 241, 0.3); background: rgba(15, 23, 42, 0.65); border-radius: var(--radius-lg);">
      <!-- Cabeçalho -->
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 0.85rem;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <span class="req-code-badge" style="font-size: 0.95rem; font-weight: 800; padding: 4px 10px;">${escapeHtml(req.code || 'REQ')}</span>
          <h3 style="margin: 0; font-size: 1.15rem; color: var(--text-main); font-weight: 700;">${escapeHtml(req.title || '')}</h3>
          <span class="badge-subtle" style="font-size: 0.75rem;">${typeLabel}</span>
          <span class="moscow-badge ${moscowClasses[req.moscow] || 'moscow-must'}" style="font-size: 0.75rem;">${moscowLabels[req.moscow] || req.moscow}</span>
          <span class="badge-subtle" style="font-size: 0.75rem;">📁 ${escapeHtml(projectName)}</span>
        </div>
      </div>

      <!-- História de Usuário -->
      <div style="margin-bottom: 1.25rem;">
        <div style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; color: #a78bfa; margin-bottom: 0.4rem; letter-spacing: 0.5px;">
          👤 História de Usuário
        </div>
        <div class="user-story-quote" style="font-size: 0.9rem; line-height: 1.5; padding: 0.85rem 1rem; margin: 0; background: rgba(139, 92, 246, 0.08); border-left: 4px solid #8b5cf6; border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
          ${escapeHtml(req.userStory || 'História de usuário não cadastrada.')}
        </div>
      </div>

      <!-- Critérios de Aceite BDD -->
      <div style="margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
          <div style="font-size: 0.78rem; text-transform: uppercase; font-weight: 700; color: #38bdf8; letter-spacing: 0.5px;">
            🧪 Critérios de Aceite (BDD / Gherkin)
          </div>
          <span style="font-size: 0.7rem; color: var(--text-muted); font-family: var(--font-mono);">Cenário: Dado / Quando / Então</span>
        </div>
        <div class="bdd-container" style="margin: 0; padding: 1rem; background: #050811; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: var(--radius-md);">
          <div class="bdd-content font-mono" style="font-size: 0.85rem; line-height: 1.6; white-space: pre-wrap; color: #bae6fd;">${escapeHtml(req.bdd || 'Critérios de aceite não documentados.')}</div>
        </div>
      </div>

      <!-- Demanda Atual e Outras Demandas Vinculadas -->
      <div style="border-top: 1px solid rgba(255, 255, 255, 0.08); padding-top: 0.85rem; margin-top: 1rem;">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-secondary); margin-bottom: 0.5rem;">
          🔗 Demandas Vinculadas a este Requisito (${linkedTasks.length}):
        </div>
        <div style="display: flex; flex-wrap: wrap; gap: 6px;">
          ${linkedTasks.length > 0 ? linkedTasks.map(t => {
            const isCurrent = t.id === editTaskId;
            const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(t.role) : { tagClass: 'role-back', icon: '💻', shortLabel: 'Dev' };
            return `
              <span class="task-role-tag ${spec.tagClass}" style="padding: 4px 8px; font-size: 0.78rem; ${isCurrent ? 'outline: 2px solid #818cf8; background: rgba(99, 102, 241, 0.35);' : ''}">
                ${spec.icon} ${spec.shortLabel || spec.label} <strong>#${t.id.slice(-5)}</strong>: ${escapeHtml(t.title)} ${isCurrent ? '<em>(Atual)</em>' : ''}
              </span>
            `;
          }).join('') : '<span style="color: var(--text-muted); font-size: 0.82rem; font-style: italic;">Nenhuma outra demanda associada.</span>'}
        </div>
      </div>
    </div>
  `;
};

window.reloadCurrentTaskHistory = async function() {
  const taskId = document.getElementById('task-id-edit')?.value;
  if (taskId) {
    await loadTaskAuditTimeline(taskId);
  }
};

async function loadTaskAuditTimeline(taskId) {
  const container = document.getElementById('task-audit-timeline');
  const countBadge = document.getElementById('task-history-count');
  if (!container) return;

  container.innerHTML = '<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.85rem;">⏳ Carregando histórico da demanda...</div>';

  try {
    const logs = await store.fetchAuditLogs({ entityType: 'task', entityId: taskId });
    if (countBadge) countBadge.textContent = logs.length;

    if (!logs || logs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 2rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📜</div>
          <div style="font-weight: 600; font-size: 0.9rem;">Nenhum evento registrado ainda</div>
          <div style="font-size: 0.78rem;">Alterações nesta demanda serão automaticamente registradas na trilha de auditoria.</div>
        </div>
      `;
      return;
    }

    const actionIcons = {
      CREATE: '✨',
      UPDATE: '✏️',
      STATUS_CHANGE: '🔄',
      QA_VALIDATE: '🧪',
      TIMESHEET_POINT: '⏱️',
      HOURS_ADJUST: '👑',
      ASSIGN: '👤',
      DELETE: '🗑️'
    };

    const actionBadges = {
      CREATE: 'audit-tag-create',
      UPDATE: 'audit-tag-update',
      STATUS_CHANGE: 'audit-tag-status',
      QA_VALIDATE: 'audit-tag-qa',
      TIMESHEET_POINT: 'audit-tag-timesheet',
      HOURS_ADJUST: 'audit-tag-hours',
      ASSIGN: 'audit-tag-assign',
      DELETE: 'audit-tag-delete'
    };

    let html = '';
    logs.forEach(log => {
      const icon = actionIcons[log.action] || '📌';
      const badgeClass = actionBadges[log.action] || 'audit-tag-update';
      const dateFormatted = new Date(log.createdAt).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const hasDiff = log.prevState || log.newState;

      html += `
        <div class="audit-timeline-item">
          <div class="audit-timeline-badge" style="background: rgba(99, 102, 241, 0.2); border: 1px solid rgba(99, 102, 241, 0.4); color: #c7d2fe;">
            ${icon}
          </div>
          <div class="audit-timeline-card">
            <div class="audit-timeline-meta">
              <div class="audit-timeline-actor">
                <span>👤 ${escapeHtml(log.actorName || 'Sistema')}</span>
                <span class="user-role-badge ${getRoleBadgeClass(log.actorRole)}">${getRoleLabel(log.actorRole)}</span>
                <span class="audit-action-tag ${badgeClass}">${log.action}</span>
              </div>
              <div class="audit-timeline-time">${dateFormatted}</div>
            </div>
            <div class="audit-timeline-details">${escapeHtml(log.details || 'Evento registrado.')}</div>
            ${hasDiff ? `
              <div style="margin-top: 0.4rem;">
                <button type="button" class="audit-diff-btn" onclick="openAuditDiffModal('${log.id}')">
                  🔍 Ver Diferença de Estado
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<div style="color: #f43f5e; text-align: center; padding: 1rem;">Erro ao carregar histórico: ${escapeHtml(err.message)}</div>`;
  }
}

window.openTaskModalForCreate = function(prefillReqId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
  if (isDevOrQa) {
    showToast('Desenvolvedores e QAs não possuem permissão para criar demandas.');
    return;
  }

  openModal('modal-task');
  switchTaskModalTab('form');
  const tabHistoryBtn = document.getElementById('tab-btn-task-history');
  if (tabHistoryBtn) tabHistoryBtn.style.display = 'none';

  ['task-title', 'task-project', 'task-requirement', 'task-role', 'task-assignee', 'task-priority', 'task-complexity', 'task-hours', 'task-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });

  const devNotesInput = document.getElementById('task-dev-notes');
  if (devNotesInput) {
    devNotesInput.value = "";
    devNotesInput.disabled = false;
  }

  const qaNotesInput = document.getElementById('task-qa-notes');
  if (qaNotesInput) {
    qaNotesInput.value = "";
    qaNotesInput.disabled = false;
  }

  const qaPill = document.getElementById('task-qa-status-pill');
  if (qaPill) {
    qaPill.className = 'badge-qa-pill pending';
    qaPill.textContent = '🟡 Pendente';
  }

  const qaMeta = document.getElementById('task-qa-reviewer-meta');
  if (qaMeta) qaMeta.textContent = '';

  const compCreateEl = document.getElementById('task-complexity');
  if (compCreateEl) compCreateEl.value = 'Média';

  const groupHoursSpent = document.getElementById('group-task-hours-spent');
  if (groupHoursSpent) groupHoursSpent.style.display = 'none';

  document.getElementById('task-id-edit').value = "";
  document.getElementById('form-new-task').reset();
  document.getElementById('btn-save-task').textContent = "Salvar Demanda";
  document.getElementById('btn-save-task').style.display = 'inline-flex';
  
  toggleTaskReqPreview(false);

  // Pré-vínculo do requisito quando disparado via atalho do card ou ID/código
  if (prefillReqId) {
    const req = store.findRequirement(prefillReqId);
    const reqSelect = document.getElementById('task-requirement');
    if (reqSelect && req) {
      reqSelect.value = req.id;
    }
    if (req && req.projectId) {
      const projSelect = document.getElementById('task-project');
      if (projSelect) {
        projSelect.value = req.projectId;
      }
    }
    const modalTitleEl = document.getElementById('modal-task-title');
    if (modalTitleEl && req) {
      modalTitleEl.textContent = `🚀 Cadastrar Demanda para [${req.code}] ${req.title}`;
    }
    updateTaskRequirementPreview(req);
  } else {
    document.getElementById('modal-task-title').textContent = "🚀 Cadastrar Nova Demanda";
    updateTaskRequirementPreview();
  }

  // Foco imediato no título da demanda para máxima agilidade
  setTimeout(() => {
    const titleInput = document.getElementById('task-title');
    if (titleInput) titleInput.focus();
  }, 100);
};

// Alias de atalho explícito para requisitos
window.openTaskModalForReq = function(reqId) {
  openTaskModalForCreate(reqId);
};


window.openTaskModalForEdit = function(taskId) {
  const task = store.getTaskById(taskId);
  if (!task) return;

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
  const isDev = currentUser && currentUser.role === 'dev';
  const isAdmin = currentUser && currentUser.role === 'admin';

  // 1. Abrir modal (popula selects) e alternar para aba inicial
  openModal('modal-task');
  switchTaskModalTab('form');
  const tabHistoryBtn = document.getElementById('tab-btn-task-history');
  if (tabHistoryBtn) tabHistoryBtn.style.display = isAdmin ? 'inline-flex' : 'none';

  // 2. Preencher campos principais da demanda
  document.getElementById('task-id-edit').value = task.id;
  document.getElementById('task-title').value = task.title;
  if (task.projectId) {
    document.getElementById('task-project').value = task.projectId;
  }

  // 3. Resolver e selecionar automaticamente o requisito vinculado correspondente
  const reqRef = task.reqId || task.req_id || task.requirementId || task.reqCode || null;
  const linkedReq = reqRef ? store.findRequirement(reqRef) : null;
  const reqSelect = document.getElementById('task-requirement');
  if (reqSelect) {
    reqSelect.value = linkedReq ? linkedReq.id : (reqRef || "");
  }

  toggleTaskReqPreview(false);
  updateTaskRequirementPreview(linkedReq || reqRef);

  document.getElementById('task-role').value = task.role || "frontend";
  document.getElementById('task-assignee').value = task.assigneeId || "";
  document.getElementById('task-priority').value = task.priority || "Média";
  const compEditEl = document.getElementById('task-complexity');
  if (compEditEl) compEditEl.value = task.complexity || "Média";
  document.getElementById('task-hours').value = task.hours || 8;
  document.getElementById('task-desc').value = task.desc || "";

  ['task-title', 'task-project', 'task-requirement', 'task-role', 'task-priority', 'task-complexity', 'task-hours', 'task-desc'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = isDevOrQa;
  });

  // Campo de Notas do Desenvolvedor (Dev Notes)
  const devNotesInput = document.getElementById('task-dev-notes');
  if (devNotesInput) {
    devNotesInput.value = task.devNotes || "";
    devNotesInput.disabled = false;
  }

  // Campo de Notas & Validação de QA
  const qaNotesInput = document.getElementById('task-qa-notes');
  if (qaNotesInput) {
    qaNotesInput.value = task.qaNotes || "";
    qaNotesInput.disabled = isDev;
  }

  const qaPill = document.getElementById('task-qa-status-pill');
  if (qaPill) {
    if (task.qaApproved) {
      qaPill.className = 'badge-qa-pill approved';
      qaPill.textContent = '✓ Aprovado';
    } else if (task.impediment && task.impediment.includes('Bloqueio QA')) {
      qaPill.className = 'badge-qa-pill rejected';
      qaPill.textContent = '⚠️ Bloqueado';
    } else {
      qaPill.className = 'badge-qa-pill pending';
      qaPill.textContent = '🟡 Pendente';
    }
  }

  const qaMeta = document.getElementById('task-qa-reviewer-meta');
  if (qaMeta) {
    if (task.qaReviewer) {
      const qd = task.qaDate ? new Date(task.qaDate).toLocaleDateString('pt-BR') : '';
      qaMeta.textContent = `Revisado por ${task.qaReviewer}${qd ? ` em ${qd}` : ''}`;
    } else {
      qaMeta.textContent = 'Aguardando validação formal de QA';
    }
  }

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
    document.getElementById('btn-save-task').textContent = isDev ? "Salvar Notas & Atribuição" : "Salvar Validação & Notas";
    document.getElementById('btn-save-task').style.display = 'inline-flex';
  } else {
    document.getElementById('modal-task-title').textContent = "✏️ Editar Demanda";
    const assigneeSelect = document.getElementById('task-assignee');
    if (assigneeSelect) assigneeSelect.disabled = false;
    document.getElementById('btn-save-task').textContent = "Atualizar Demanda";
    document.getElementById('btn-save-task').style.display = 'inline-flex';
  }

  // Carregar histórico de auditoria desta demanda (apenas para Admin)
  if (isAdmin) {
    loadTaskAuditTimeline(task.id);
  }
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
  if (!container) return;
  container.innerHTML = '';

  const mode = getViewLayoutMode('team');
  updateViewLayoutToggleUI('team', mode);
  container.classList.toggle('is-list-view', mode === 'list');

  const members = store.getTeamMembers();

  if (members.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1; width: 100%;">
        <p style="font-size: 1.15rem; margin-bottom: 0.85rem;">Nenhum desenvolvedor encontrado com os filtros aplicados.</p>
        <button class="btn btn-primary" onclick="openMemberModalForCreate()">+ Adicionar Desenvolvedor</button>
      </div>
    `;
    return;
  }

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (mode === 'list') {
    // Modo Lista: Tabela compacta
    const tableWrap = document.createElement('div');
    tableWrap.className = 'table-responsive list-mode-table-wrap';

    let rowsHtml = '';
    members.forEach(member => {
      const workload = store.calculateDevWorkload(member.id);
      const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(member.role) : { icon: '💻', color: 'var(--accent-primary)', label: 'Dev' };
      const roleIcon = spec.icon;
      const roleColor = spec.color;
      const roleLabel = (spec.shortLabel || spec.label).toUpperCase();
      const statusBg = workload.percentage > 100 ? '#f43f5e' : (workload.percentage > 80 ? '#f59e0b' : '#10b981');

      const isSelf = currentUser && (member.id === currentUser.id || member.name.toLowerCase() === currentUser.name.toLowerCase());
      const canEditMember = perms.canManageTeam || (perms.canEditSelf && isSelf);
      const canDeleteMember = perms.canManageTeam && !isSelf;

      let memberActionButtons = '';
      if (canEditMember) {
        memberActionButtons += `<button class="card-btn-action btn-xs" onclick="openMemberModalForEdit('${member.id}')" title="${isSelf ? 'Editar Meus Dados de Equipe' : 'Editar Desenvolvedor'}">✏️</button>`;
      }
      if (canDeleteMember) {
        memberActionButtons += `<button class="card-btn-action btn-del btn-xs" onclick="confirmDeleteMember('${member.id}', '${escapeHtml(member.name)}')" title="Excluir Desenvolvedor">🗑️</button>`;
      }

      rowsHtml += `
        <tr>
          <td>
            <div style="display: flex; align-items: center; gap: 8px;">
              <div class="task-avatar-mini" style="background: ${member.avatarBg}; color: #ffffff; width: 28px; height: 28px; font-size: 0.8rem; position: relative;">
                ${member.name.charAt(0)}
                <span class="dev-status-indicator" style="background: ${statusBg}; width: 8px; height: 8px; position: absolute; bottom: -1px; right: -1px;" title="${workload.percentage > 100 ? 'Sobrecarga' : 'Disponível'}"></span>
              </div>
              <span class="task-id-badge" style="font-size: 0.72rem;">#${member.id.slice(-4)}</span>
            </div>
          </td>
          <td>
            <div class="cell-title-group">
              <strong class="cell-main-title" ${canEditMember ? `onclick="openMemberModalForEdit('${member.id}')" style="cursor: pointer;"` : ''}>${escapeHtml(member.name)}</strong>
              <div style="display: flex; gap: 4px; flex-wrap: wrap; margin-top: 2px;">
                ${(member.skills || []).slice(0, 3).map(s => `<span class="skill-pill" style="font-size: 0.68rem; padding: 1px 5px;">${escapeHtml(s)}</span>`).join('')}
                ${(member.skills || []).length > 3 ? `<span style="font-size: 0.68rem; color: var(--text-muted);">+${member.skills.length - 3}</span>` : ''}
              </div>
            </div>
          </td>
          <td>
            <span style="color: ${roleColor}; font-weight: 700; font-size: 0.8rem;">${roleIcon} ${roleLabel}</span>
            <div style="font-size: 0.72rem; color: var(--text-muted);">${member.seniority}</div>
          </td>
          <td>
            <div class="mini-progress-row">
              <div style="display: flex; justify-content: space-between; font-size: 0.74rem; font-weight: 600;">
                <span>${workload.hours}h / ${workload.capacity}h</span>
                <span style="color: ${statusBg};">${workload.percentage}%</span>
              </div>
              <div class="progress-track mini-track">
                <div class="progress-fill" style="width: ${Math.min(workload.percentage, 100)}%; background: ${statusBg};"></div>
              </div>
              <div class="mini-metrics-chips">
                <span class="metric-mini-tag">💻 ${workload.activeTasksCount} demandas ativas</span>
                <span class="metric-mini-tag">⏱️ ${workload.hoursSpent}h apontadas</span>
                ${workload.isOverloaded ? `<span class="metric-mini-tag" style="color: #f43f5e; border-color: rgba(244, 63, 94, 0.3);">⚠️ +${workload.overloadHours}h</span>` : ''}
              </div>
            </div>
          </td>
          <td>
            <div class="table-actions-cell">${memberActionButtons || '<span style="font-size: 0.72rem; color: var(--text-muted);">🔒</span>'}</div>
          </td>
        </tr>
      `;
    });

    tableWrap.innerHTML = `
      <table class="compact-data-table">
        <thead>
          <tr>
            <th style="width: 110px;">Identificador</th>
            <th>Nome / Membro</th>
            <th style="width: 150px;">Status / Cargo</th>
            <th style="width: 260px;">Métricas / Carga Horária</th>
            <th style="width: 120px; text-align: right;">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    `;
    container.appendChild(tableWrap);
  } else {
    // Modo Cards (Grelha original)
    members.forEach(member => {
      const workload = store.calculateDevWorkload(member.id);
      const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(member.role) : { icon: '💻', color: 'var(--accent-primary)', label: 'Dev' };
      const roleIcon = spec.icon;
      const roleColor = spec.color;
      const roleLabel = (spec.shortLabel || spec.label).toUpperCase();
      const statusBg = workload.percentage > 100 ? '#f43f5e' : (workload.percentage > 80 ? '#f59e0b' : '#10b981');

      const isSelf = currentUser && (member.id === currentUser.id || member.name.toLowerCase() === currentUser.name.toLowerCase());
      const canEditMember = perms.canManageTeam || (perms.canEditSelf && isSelf);
      const canDeleteMember = perms.canManageTeam && !isSelf;

      let memberActionButtons = '';
      if (canEditMember) {
        memberActionButtons += `<button class="card-btn-action" onclick="openMemberModalForEdit('${member.id}')" title="${isSelf ? 'Editar Meus Dados de Equipe' : 'Editar Desenvolvedor'}">✏️</button>`;
      }
      if (canDeleteMember) {
        memberActionButtons += `<button class="card-btn-action btn-del" onclick="confirmDeleteMember('${member.id}', '${escapeHtml(member.name)}')" title="Excluir Desenvolvedor">🗑️</button>`;
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
            <h3>${escapeHtml(member.name)}</h3>
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
          ${(member.skills || []).map(s => `<span class="skill-pill">${escapeHtml(s)}</span>`).join('')}
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
  const taskSel = document.getElementById('test-task-select');
  if (taskSel) taskSel.value = tc.taskId || "";
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

      const devRoleBadge = u.devRole ? (() => {
        const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(u.devRole) : { tagClass: 'role-back', icon: '💻', shortLabel: u.devRole };
        return ` <span class="task-role-tag ${spec.tagClass}" style="margin-left: 4px;">${spec.icon} ${spec.shortLabel || spec.label}</span>`;
      })() : '';

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

// ==============================================================================
// 2.7 MÓDULO DE DESEMPENHO INDIVIDUAL & AVALIAÇÃO DE PROMOÇÕES (ADMIN)
// ==============================================================================

window.selectedPerfDevId = null;
window.perfPeriod = 'sprints';
window.perfSeries = { high: true, medium: true, low: true, total: true };

function renderPerformance() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  // Acesso exclusivo para Administradores
  if (currentRole !== 'admin') {
    showToast('Acesso restrito: apenas Administradores têm permissão para acessar a área de Desempenho e Promoções.');
    switchView(perms.allowedViews && perms.allowedViews.includes('kanban') ? 'kanban' : (perms.allowedViews ? perms.allowedViews[0] : 'dashboard'));
    return;
  }

  const members = store.getTeamMembers();
  if (!members || members.length === 0) {
    const heroEl = document.getElementById('perf-dev-hero');
    if (heroEl) {
      heroEl.innerHTML = '<p class="text-muted" style="padding: 1.5rem; text-align: center;">Nenhum desenvolvedor cadastrado no workspace.</p>';
    }
    return;
  }

  // 1. Popular Seletor de Desenvolvedores
  const devSelect = document.getElementById('perf-dev-select');
  if (devSelect) {
    if (!window.selectedPerfDevId || !members.some(m => m.id === window.selectedPerfDevId)) {
      window.selectedPerfDevId = members[0].id;
    }

    devSelect.innerHTML = members.map(m => {
      const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(m.role) : { icon: '💻', shortLabel: 'Dev' };
      return `<option value="${m.id}" ${m.id === window.selectedPerfDevId ? 'selected' : ''}>${m.name} (${spec.icon} ${spec.shortLabel || spec.label} • ${m.seniority})</option>`;
    }).join('');

    if (!devSelect.dataset.listener) {
      devSelect.dataset.listener = 'true';
      devSelect.addEventListener('change', (e) => {
        window.selectedPerfDevId = e.target.value;
        renderPerformance();
      });
    }
  }

  // 2. Seletor de Período (Sprints / Meses)
  const periodSelect = document.getElementById('perf-period-select');
  if (periodSelect) {
    periodSelect.value = window.perfPeriod || 'sprints';
    if (!periodSelect.dataset.listener) {
      periodSelect.dataset.listener = 'true';
      periodSelect.addEventListener('change', (e) => {
        window.perfPeriod = e.target.value;
        renderPerformance();
      });
    }
  }

  const dev = store.getMemberById(window.selectedPerfDevId) || members[0];
  if (!dev) return;

  // 3. Atualizar Hero Banner do Desenvolvedor
  const avatarEl = document.getElementById('perf-dev-avatar');
  if (avatarEl) {
    avatarEl.textContent = dev.name.charAt(0);
    avatarEl.style.backgroundColor = dev.avatarBg || '#3b82f6';
  }

  const heroAvatar = document.getElementById('perf-hero-avatar');
  if (heroAvatar) {
    heroAvatar.textContent = dev.name.charAt(0);
    heroAvatar.style.backgroundColor = dev.avatarBg || '#3b82f6';
  }

  const heroName = document.getElementById('perf-hero-name');
  if (heroName) heroName.textContent = dev.name;

  const heroSeniority = document.getElementById('perf-hero-seniority-badge');
  if (heroSeniority) heroSeniority.textContent = dev.seniority || 'Pleno';

  const heroRole = document.getElementById('perf-hero-role-badge');
  if (heroRole) {
    const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(dev.role) : { tagClass: 'role-back', icon: '💻', label: 'Desenvolvedor' };
    heroRole.className = `task-role-tag ${spec.tagClass}`;
    heroRole.textContent = `${spec.icon} ${spec.label}`;
  }

  const heroSkills = document.getElementById('perf-hero-skills');
  if (heroSkills) {
    const skillsList = Array.isArray(dev.skills) && dev.skills.length > 0 ? dev.skills.join(', ') : 'JavaScript, Git, Clean Code';
    heroSkills.textContent = `Especialidades: ${skillsList}`;
  }

  // 4. Extrair e Compilar Métricas por Complexidade do Desenvolvedor
  const devTasks = store.state.tasks.filter(t => t.assigneeId === dev.id || (t.assigneeId && dev.name && t.assigneeId.toLowerCase() === dev.name.toLowerCase()));
  const realDoneTasks = devTasks.filter(t => t.status === 'done');

  // Helper para identificar a data de conclusão/execução da tarefa
  function getTaskCompletionDate(t) {
    if (t.qaDate) {
      const d = new Date(t.qaDate);
      if (!isNaN(d.getTime())) return d;
    }
    if (Array.isArray(t.timesheet) && t.timesheet.length > 0) {
      let latestTime = 0;
      for (const ts of t.timesheet) {
        const d = new Date(ts.date || ts.timestamp);
        if (!isNaN(d.getTime()) && d.getTime() > latestTime) {
          latestTime = d.getTime();
        }
      }
      if (latestTime > 0) return new Date(latestTime);
    }
    if (t.id) {
      const digits = String(t.id).replace(/\D/g, '');
      if (digits.length >= 12) {
        const epoch = parseInt(digits, 10);
        if (!isNaN(epoch) && epoch > 1500000000000 && epoch < 2500000000000) {
          return new Date(epoch);
        }
      }
    }
    return null;
  }

  const isSprints = window.perfPeriod === 'sprints';
  const now = new Date();
  let cycles = [];
  let monthBuckets = [];

  if (isSprints) {
    cycles = ['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 4', 'Sprint 5', 'Sprint 6'];
  } else {
    // Modo "Últimos 6 Meses": calcula dinamicamente os 6 meses retroativos a partir da data atual
    const shortMonthNames = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0 a 11

    monthBuckets = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - i, 1);
      const m = d.getMonth();
      const y = d.getFullYear();
      const yShort = String(y).slice(-2);
      monthBuckets.push({
        year: y,
        month: m,
        label: `${shortMonthNames[m]}/${yShort}`,
        startTime: new Date(y, m, 1, 0, 0, 0, 0).getTime(),
        endTime: new Date(y, m + 1, 0, 23, 59, 59, 999).getTime()
      });
    }
    cycles = monthBuckets.map(b => b.label);
  }

  // 4.1 Dados de Séries Temporais calculados ESTRITAMENTE a partir das demandas reais concluídas
  const seriesData = {
    high: [0, 0, 0, 0, 0, 0],
    medium: [0, 0, 0, 0, 0, 0],
    low: [0, 0, 0, 0, 0, 0],
    total: [0, 0, 0, 0, 0, 0]
  };

  realDoneTasks.forEach((t, idx) => {
    const comp = t.complexity || 'Média';
    let cycleIdx = -1;
    const taskDate = getTaskCompletionDate(t);

    if (isSprints) {
      if (taskDate) {
        const daysAgo = Math.floor((now.getTime() - taskDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo < 0) {
          cycleIdx = 5; // Sprint atual
        } else {
          const sprintDiff = Math.floor(daysAgo / 14);
          if (sprintDiff >= 0 && sprintDiff < 6) {
            cycleIdx = 5 - sprintDiff;
          }
        }
      }
      if (cycleIdx === -1) {
        if (realDoneTasks.length > 1) {
          cycleIdx = Math.max(0, Math.min(5, 5 - (realDoneTasks.length - 1 - idx)));
        } else {
          cycleIdx = 5;
        }
      }
    } else {
      if (taskDate) {
        const tTime = taskDate.getTime();
        for (let b = 0; b < 6; b++) {
          if (tTime >= monthBuckets[b].startTime && tTime <= monthBuckets[b].endTime) {
            cycleIdx = b;
            break;
          }
        }
        if (cycleIdx === -1 && tTime > monthBuckets[5].endTime) {
          cycleIdx = 5;
        }
      } else {
        cycleIdx = 5;
      }
    }

    if (cycleIdx >= 0 && cycleIdx <= 5) {
      if (comp === 'Alta') seriesData.high[cycleIdx]++;
      else if (comp === 'Baixa') seriesData.low[cycleIdx]++;
      else seriesData.medium[cycleIdx]++;
    }
  });

  for (let i = 0; i < 6; i++) {
    seriesData.total[i] = seriesData.high[i] + seriesData.medium[i] + seriesData.low[i];
  }

  // Totais agregados calculados EXCLUSIVAMENTE a partir das demandas reais
  const sumHigh = seriesData.high.reduce((a, b) => a + b, 0);
  const sumMed = seriesData.medium.reduce((a, b) => a + b, 0);
  const sumLow = seriesData.low.reduce((a, b) => a + b, 0);
  const sumPeriodTotal = sumHigh + sumMed + sumLow;
  const sumTotal = isSprints ? realDoneTasks.length : sumPeriodTotal;
  
  // Total de horas produtivas reais apontadas nas tarefas do desenvolvedor
  const totalHoursProd = Math.round(devTasks.reduce((acc, t) => acc + (parseFloat(t.hoursSpent) || 0), 0));
  const highPercent = sumTotal > 0 ? Math.round((sumHigh / sumTotal) * 100) : 0;
  const avgPerCycle = (sumTotal / 6).toFixed(1);

  // 5. Atualizar Contadores da Legenda
  const countHighEl = document.getElementById('legend-count-high');
  const countMedEl = document.getElementById('legend-count-medium');
  const countLowEl = document.getElementById('legend-count-low');
  const countTotEl = document.getElementById('legend-count-total');
  if (countHighEl) countHighEl.textContent = sumHigh;
  if (countMedEl) countMedEl.textContent = sumMed;
  if (countLowEl) countLowEl.textContent = sumLow;
  if (countTotEl) countTotEl.textContent = sumTotal;

  // 6. Atualizar Cards de KPIs do Topo
  const kpiTotal = document.getElementById('perf-kpi-total-tasks');
  const kpiTotalSub = document.getElementById('perf-kpi-total-sub');
  if (kpiTotal) kpiTotal.textContent = sumTotal;
  if (kpiTotalSub) kpiTotalSub.textContent = `~${avgPerCycle} tarefas/${isSprints ? 'sprint' : 'mês'}`;

  const kpiHours = document.getElementById('perf-kpi-total-hours');
  if (kpiHours) kpiHours.textContent = `${totalHoursProd}h`;

  const kpiHigh = document.getElementById('perf-kpi-high-tasks');
  const kpiHighSub = document.getElementById('perf-kpi-high-sub');
  if (kpiHigh) kpiHigh.textContent = sumHigh;
  if (kpiHighSub) kpiHighSub.textContent = `${highPercent}% do total entregue`;

  const summaryTag = document.getElementById('perf-chart-summary-tag');
  if (summaryTag) summaryTag.textContent = `Taxa de Alta Complexidade: ${highPercent}% (${sumHigh} entregas)`;

  // 7. Algoritmo de Avaliação de Prontidão para Promoção Baseado em Metas Reais do Gestor
  const devSeniority = (dev.seniority || '').toLowerCase();
  let targetSeniority = 'Pleno';
  if (devSeniority.includes('júnior') || devSeniority.includes('junior')) {
    targetSeniority = 'Pleno';
  } else if (devSeniority.includes('pleno')) {
    targetSeniority = 'Sênior';
  } else if (devSeniority.includes('sênior') || devSeniority.includes('senior')) {
    targetSeniority = 'Tech Lead';
  } else {
    targetSeniority = 'Tech Lead';
  }

  let promotionScore = 0;
  let statusText = '⚪ Sem Entregas no Período';
  let opinionText = '';
  const criteria = [];

  // Métricas complementares para cruzamento com as metas do gestor
  const qaApprovedTasks = devTasks.filter(t => t.status === 'done' && (t.qaApproved === 1 || t.qaApproved === true)).length;
  const qaPassRate = sumTotal > 0 ? Math.round((qaApprovedTasks / sumTotal) * 100) : 0;

  let totalEstHours = 0;
  let totalSpentHours = 0;
  devTasks.forEach(t => {
    if (t.status === 'done') {
      totalEstHours += (parseFloat(t.hours) || 8);
      totalSpentHours += (parseFloat(t.hoursSpent) || 0);
    }
  });
  const hoursVariance = totalEstHours > 0 ? Math.round(Math.abs(totalSpentHours - totalEstHours) / totalEstHours * 100) : 0;

  // Busca as metas ativas configuradas pelo gestor para a senioridade alvo
  const allConfiguredGoals = typeof store.getGoals === 'function' ? store.getGoals() : [];
  const activeDevGoals = allConfiguredGoals.filter(g => g.isActive && (g.targetSeniority === targetSeniority || g.targetSeniority === 'Todos'));

  if (activeDevGoals.length > 0) {
    let totalWeight = 0;
    let earnedScore = 0;

    activeDevGoals.forEach(goal => {
      const w = parseInt(goal.weight, 10) || 2;
      totalWeight += w;
      let actual = 0;
      let pass = false;
      let detailText = '';

      switch (goal.metricKey) {
        case 'high_tasks':
          actual = sumHigh;
          pass = actual >= goal.targetValue;
          detailText = `${actual}/${goal.targetValue} ${goal.targetUnit || 'demandas'}`;
          break;
        case 'med_tasks':
          actual = sumMed;
          pass = actual >= goal.targetValue;
          detailText = `${actual}/${goal.targetValue} ${goal.targetUnit || 'demandas'}`;
          break;
        case 'total_tasks':
          actual = sumTotal;
          pass = actual >= goal.targetValue;
          detailText = `${actual}/${goal.targetValue} ${goal.targetUnit || 'demandas'}`;
          break;
        case 'high_percent':
          actual = highPercent;
          pass = actual >= goal.targetValue;
          detailText = `${actual}% (mín. ${goal.targetValue}%)`;
          break;
        case 'qa_rate':
          actual = qaPassRate;
          pass = actual >= goal.targetValue;
          detailText = `${actual}% (mín. ${goal.targetValue}%)`;
          break;
        case 'hours_variance':
          actual = hoursVariance;
          pass = actual <= goal.targetValue;
          detailText = `Desvio: ${actual}% (limite: ${goal.targetValue}%)`;
          break;
        case 'custom':
        default:
          actual = !store.calculateDevWorkload(dev.id).isOverloaded && sumTotal > 0 ? 100 : 50;
          pass = actual >= (goal.targetValue || 70);
          detailText = pass ? 'Conforme diretriz' : 'Pendente de validação';
          break;
      }

      let progressRatio = 0;
      if (goal.metricKey === 'hours_variance') {
        progressRatio = pass ? 1 : Math.max(0, 1 - ((actual - goal.targetValue) / (goal.targetValue || 1)));
      } else {
        progressRatio = pass ? 1 : Math.min(1, Math.max(0, (actual / (goal.targetValue || 1))));
      }

      earnedScore += progressRatio * w;
      criteria.push({
        text: `${goal.title} [${detailText}]`,
        pass: pass,
        weight: w
      });
    });

    promotionScore = totalWeight > 0 ? Math.min(100, Math.round((earnedScore / totalWeight) * 100)) : 0;
    const isReady = promotionScore >= 80;

    if (sumTotal === 0) {
      statusText = '⚪ Aguardando Conclusão de Demandas';
      opinionText = `O(A) desenvolvedor(a) ${dev.name} possui ${devTasks.length} demanda(s) atribuída(s), porém nenhuma com status 'Concluído' ainda. A avaliação de promoção será calculada automaticamente conforme as entregas forem homologadas.`;
    } else if (isReady) {
      statusText = `🟢 Elegível para Promoção a ${targetSeniority}`;
      opinionText = `O(A) profissional ${dev.name} atingiu ${criteria.filter(c => c.pass).length} de ${criteria.length} metas ativas configuradas pelo gestor (Score de Prontidão: ${promotionScore}%). Cumpre os requisitos para a transição de carreira para ${targetSeniority}.`;
    } else {
      statusText = `🟡 Em Evolução Técnica para ${targetSeniority}`;
      opinionText = `O(A) profissional ${dev.name} atingiu ${criteria.filter(c => c.pass).length} de ${criteria.length} metas ativas (Score de Prontidão: ${promotionScore}%). Recomenda-se focar nas métricas pendentes do checklist acima para consolidar a promoção para ${targetSeniority}.`;
    }
  } else if (sumTotal === 0) {
    promotionScore = 0;
    statusText = '⚪ Aguardando Conclusão de Demandas';
    opinionText = `O(A) desenvolvedor(a) ${dev.name} possui ${devTasks.length} demanda(s) atribuída(s), porém nenhuma com status 'Concluído' ainda. A avaliação de promoção será calculada automaticamente conforme as entregas forem homologadas.`;

    criteria.push({ text: `Volume de entregas satisfatório (≥ 1 demanda entregue: 0)`, pass: false });
    criteria.push({ text: `Domínio técnico em média/alta complexidade: 0`, pass: false });
    criteria.push({ text: `Alocação dentro da capacidade máxima semanal`, pass: !store.calculateDevWorkload(dev.id).isOverloaded });
    criteria.push({ text: `Horas produtivas apontadas no projeto (${totalHoursProd}h registradas)`, pass: totalHoursProd > 0 });
  } else if (devSeniority.includes('júnior') || devSeniority.includes('junior')) {
    targetSeniority = 'Pleno';
    const c1 = sumTotal >= 1;
    const c2 = sumMed >= 1 || sumHigh >= 1;
    const c3 = sumHigh >= 1;
    const c4 = sumTotal > 0 && ((sumMed + sumHigh) / sumTotal) >= 0.5;

    let passCount = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0) + (c4 ? 1 : 0);
    promotionScore = Math.min(100, Math.round((passCount / 4) * 80 + highPercent * 0.2));

    criteria.push({ text: `Volume de entregas satisfatório (${sumTotal} demanda(s) concluída(s))`, pass: c1 });
    criteria.push({ text: `Domínio de Média Complexidade (${sumMed} entregue(s))`, pass: c2 });
    criteria.push({ text: `Evolução para Alta Complexidade (${sumHigh} entregue(s))`, pass: c3 });
    criteria.push({ text: `Autonomia produtiva (Média+Alta ≥ 50%: ${Math.round(((sumMed + sumHigh) / sumTotal) * 100)}%)`, pass: c4 });

    if (promotionScore >= 75) {
      statusText = '🟢 Elegível para Promoção a Pleno';
      opinionText = `O(A) desenvolvedor(a) ${dev.name} atingiu os critérios de autonomia com entregas consistentes no sistema. Apto(a) para atuar como Desenvolvedor(a) Pleno.`;
    } else {
      statusText = '🟡 Em Desenvolvimento Técnico';
      opinionText = `O(A) profissional ${dev.name} demonstra evolução técnica. Recomenda-se dar continuidade às demandas em andamento para consolidar os critérios de promoção para Pleno.`;
    }
  } else if (devSeniority.includes('pleno')) {
    targetSeniority = 'Sênior';
    const c1 = sumTotal >= 2;
    const c2 = sumHigh >= 1;
    const c3 = highPercent >= 25;
    const c4 = !store.calculateDevWorkload(dev.id).isOverloaded;

    let passCount = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0) + (c4 ? 1 : 0);
    promotionScore = Math.min(100, Math.round((passCount / 4) * 75 + highPercent * 0.25));

    criteria.push({ text: `Consistência de entregas (${sumTotal} demanda(s) entregue(s))`, pass: c1 });
    criteria.push({ text: `Capacidade em Alta Complexidade (${sumHigh} demanda(s) de Alta)`, pass: c2 });
    criteria.push({ text: `Foco predominante em Alta Complexidade (${highPercent}% do total)`, pass: c3 });
    criteria.push({ text: `Equilíbrio de carga horária sem sobrecarga excessiva`, pass: c4 });

    if (promotionScore >= 75) {
      statusText = '🟢 Elegível para Promoção a Sênior';
      opinionText = `Comprovado domínio em demandas arquiteturais e de Alta Complexidade no projeto. O(A) desenvolvedor(a) ${dev.name} entrega soluções robustas e pode assumir formalmente a senioridade Sênior.`;
    } else {
      statusText = '🟡 Consolidando Entregas Críticas';
      opinionText = `Desempenho estável no workspace. Para alcançar a senioridade Sênior, sugere-se avançar na conclusão das demandas de Alta Complexidade.`;
    }
  } else if (devSeniority.includes('sênior') || devSeniority.includes('senior')) {
    targetSeniority = 'Tech Lead / Especialista';
    const c1 = sumHigh >= 1;
    const c2 = highPercent >= 40;
    const c3 = sumTotal >= 2;
    const c4 = true;

    promotionScore = Math.min(100, Math.round(75 + (highPercent * 0.25)));
    criteria.push({ text: `Liderança em Alta Complexidade (${sumHigh} demanda(s) entregue(s))`, pass: c1 });
    criteria.push({ text: `Predomínio em tarefas críticas (${highPercent}% de alta complexidade)`, pass: c2 });
    criteria.push({ text: `Volume de entregas concluídas (${sumTotal} tarefas no total)`, pass: c3 });
    criteria.push({ text: `Referência técnica e mentoria de outros desenvolvedores`, pass: c4 });

    statusText = '🟢 Apto para Tech Lead / Especialista';
    opinionText = `${dev.name} atua como pilar técnico da squad, concentrando demandas de alta complexidade. Plenamente apto(a) para atuar como Tech Lead ou Arquiteto(a) Especialista.`;
  } else {
    targetSeniority = 'Tech Lead / Especialista';
    promotionScore = sumTotal > 0 ? 98 : 85;
    statusText = '👑 Liderança Técnica Consolidada';
    opinionText = `${dev.name} já ocupa o nível de liderança técnica no workspace, orientando padrões de engenharia, arquitetura e desenvolvimento da equipe.`;
    criteria.push({ text: `Domínio pleno de governança técnica e arquitetura de software`, pass: true });
    criteria.push({ text: `Liderança estratégica e gestão da qualidade de entregas`, pass: true });
    criteria.push({ text: `Mentoria contínua de desenvolvedores`, pass: true });
  }

  // Atualizar Banner e Diagnóstico
  const heroStatusPill = document.getElementById('perf-hero-status-pill');
  if (heroStatusPill) heroStatusPill.textContent = statusText;

  const kpiScore = document.getElementById('perf-kpi-score');
  if (kpiScore) kpiScore.textContent = `${promotionScore}%`;

  const diagCurrent = document.getElementById('diag-current-seniority');
  if (diagCurrent) diagCurrent.textContent = dev.seniority || 'Pleno';

  const diagTarget = document.getElementById('diag-target-seniority');
  if (diagTarget) diagTarget.textContent = targetSeniority;

  const diagScoreText = document.getElementById('diag-score-text');
  if (diagScoreText) {
    const isReady = promotionScore >= 80;
    diagScoreText.textContent = `${promotionScore}% (${isReady ? 'Elegível' : 'Em Evolução'})`;
    diagScoreText.style.color = isReady ? '#34d399' : '#fbbf24';
  }

  const diagProgress = document.getElementById('diag-score-progress');
  if (diagProgress) {
    diagProgress.style.width = `${promotionScore}%`;
  }

  const diagOpinion = document.getElementById('diag-opinion-text');
  if (diagOpinion) diagOpinion.textContent = opinionText;

  const diagList = document.getElementById('diag-criteria-list');
  if (diagList) {
    diagList.innerHTML = criteria.map(c => `
      <li class="perf-checklist-item ${c.pass ? 'checked' : ''}">
        <span class="perf-check-icon ${c.pass ? 'pass' : 'pending'}">${c.pass ? '✓' : '○'}</span>
        <span>${c.text}</span>
      </li>
    `).join('');
  }

  const targetSenioritySelect = document.getElementById('perf-target-seniority');
  if (targetSenioritySelect) {
    targetSenioritySelect.value = targetSeniority;
  }

  // 8. Renderizar Gráfico de Linha SVG Vetorial
  renderPerfSvgChart(cycles, seriesData);

  // 9. Configurar Cliques nas Legendas (Toggle de Linhas)
  setupLegendToggleListeners(cycles, seriesData);

  // 10. Renderizar Tabela de Demandas Concluídas
  renderPerfTasksTable(dev, devTasks, realDoneTasks);
}
window.renderPerformance = renderPerformance;

// Renderizador do Gráfico de Linha Vetorial Dinâmico em SVG
function renderPerfSvgChart(cycles, seriesData) {
  const container = document.getElementById('perf-line-chart-svg-container');
  if (!container) return;

  const width = 880;
  const height = 340;
  const padLeft = 60;
  const padRight = 35;
  const padTop = 30;
  const padBottom = 45;
  const plotWidth = width - padLeft - padRight;
  const plotHeight = height - padTop - padBottom;

  // Determina o valor máximo de Y com base nas séries visíveis
  const allVals = [];
  if (window.perfSeries.high) allVals.push(...seriesData.high);
  if (window.perfSeries.medium) allVals.push(...seriesData.medium);
  if (window.perfSeries.low) allVals.push(...seriesData.low);
  if (window.perfSeries.total) allVals.push(...seriesData.total);
  const maxVal = allVals.length > 0 ? Math.max(...allVals) : 8;
  const yMax = Math.max(8, Math.ceil((maxVal + 2) / 2) * 2);

  // Mapeamento de coordenadas
  function getX(index) {
    return padLeft + (index * (plotWidth / 5));
  }

  function getY(val) {
    return (padTop + plotHeight) - ((val / yMax) * plotHeight);
  }

  // Gera caminho suave Bezier cúbico
  function getSmoothPath(values, closeBottom = false) {
    const points = values.map((v, i) => ({ x: getX(i), y: getY(v) }));
    if (points.length === 0) return '';
    let d = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cp1x = p0.x + (p1.x - p0.x) / 2;
      const cp1y = p0.y;
      const cp2x = p0.x + (p1.x - p0.x) / 2;
      const cp2y = p1.y;
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p1.x} ${p1.y}`;
    }
    if (closeBottom) {
      d += ` L ${points[points.length - 1].x} ${padTop + plotHeight} L ${points[0].x} ${padTop + plotHeight} Z`;
    }
    return d;
  }

  // Linhas de Grade e Eixo Y
  const gridSteps = 4;
  let gridLinesHtml = '';
  for (let s = 0; s <= gridSteps; s++) {
    const stepVal = Math.round((yMax / gridSteps) * s);
    const stepY = getY(stepVal);
    gridLinesHtml += `
      <line x1="${padLeft}" y1="${stepY}" x2="${width - padRight}" y2="${stepY}" class="chart-grid-line" />
      <text x="${padLeft - 12}" y="${stepY + 4}" text-anchor="end" class="chart-axis-text">${stepVal}</text>
    `;
  }

  // Rótulos do Eixo X (Ciclos / Sprints)
  let xAxisHtml = '';
  cycles.forEach((cycle, i) => {
    const cx = getX(i);
    xAxisHtml += `
      <text x="${cx}" y="${height - 12}" text-anchor="middle" class="chart-axis-text" style="font-weight: 600;">${cycle}</text>
      <circle cx="${cx}" cy="${padTop + plotHeight}" r="2" fill="rgba(255,255,255,0.2)" />
    `;
  });

  // Séries a renderizar
  const seriesConfig = [
    { key: 'total', label: 'Total Geral', color: '#818cf8', gradId: 'grad-total', values: seriesData.total, visible: window.perfSeries.total, strokeWidth: 3 },
    { key: 'high', label: 'Alta Complexidade', color: '#f43f5e', gradId: 'grad-high', values: seriesData.high, visible: window.perfSeries.high, strokeWidth: 3.5 },
    { key: 'medium', label: 'Média Complexidade', color: '#f59e0b', gradId: 'grad-med', values: seriesData.medium, visible: window.perfSeries.medium, strokeWidth: 3 },
    { key: 'low', label: 'Baixa Complexidade', color: '#10b981', gradId: 'grad-low', values: seriesData.low, visible: window.perfSeries.low, strokeWidth: 2.5 }
  ];

  let areasHtml = '';
  let curvesHtml = '';
  let dotsHtml = '';

  seriesConfig.forEach(sc => {
    if (!sc.visible) return;

    // Área translúcida
    const areaPath = getSmoothPath(sc.values, true);
    areasHtml += `<path d="${areaPath}" fill="url(#${sc.gradId})" class="chart-area-path" />`;

    // Curva principal
    const curvePath = getSmoothPath(sc.values, false);
    curvesHtml += `<path d="${curvePath}" stroke="${sc.color}" class="chart-curve-path" style="stroke-width: ${sc.strokeWidth};" />`;

    // Pontos interativos
    sc.values.forEach((v, i) => {
      const px = getX(i);
      const py = getY(v);
      const cycleName = cycles[i];
      const tot = seriesData.total[i];
      const pct = tot > 0 ? Math.round((v / tot) * 100) : 0;

      dotsHtml += `
        <g class="chart-dot-group" 
           data-series-label="${sc.label}" 
           data-color="${sc.color}" 
           data-val="${v}" 
           data-total="${tot}" 
           data-pct="${pct}" 
           data-cycle="${cycleName}"
           data-px="${px}"
           data-py="${py}">
          <circle cx="${px}" cy="${py}" r="12" fill="transparent" />
          <circle cx="${px}" cy="${py}" r="5" fill="${sc.color}" stroke="#0b0f19" class="chart-dot" />
        </g>
      `;
    });
  });

  const svgTemplate = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad-high" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f43f5e" stop-opacity="0.32" />
          <stop offset="100%" stop-color="#f43f5e" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="grad-med" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f59e0b" stop-opacity="0.25" />
          <stop offset="100%" stop-color="#f59e0b" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="grad-low" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#10b981" stop-opacity="0.20" />
          <stop offset="100%" stop-color="#10b981" stop-opacity="0.0" />
        </linearGradient>
        <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#818cf8" stop-opacity="0.18" />
          <stop offset="100%" stop-color="#818cf8" stop-opacity="0.0" />
        </linearGradient>
      </defs>

      <!-- Grade de Fundo -->
      <g class="chart-grid">${gridLinesHtml}</g>

      <!-- Áreas Preenchidas em Gradiente -->
      <g class="chart-areas">${areasHtml}</g>

      <!-- Linhas por Complexidade -->
      <g class="chart-curves">${curvesHtml}</g>

      <!-- Eixo X -->
      <g class="chart-xaxis">${xAxisHtml}</g>

      <!-- Pontos de Dados Interativos -->
      <g class="chart-dots">${dotsHtml}</g>
    </svg>
  `;

  container.innerHTML = svgTemplate;

  // Interatividade do Tooltip ao passar o mouse sobre os pontos
  const tooltip = document.getElementById('perf-chart-tooltip');
  const tooltipTitle = document.getElementById('perf-tooltip-title');
  const tooltipBody = document.getElementById('perf-tooltip-body');
  const chartWrapper = container.closest('.perf-chart-wrapper');

  container.querySelectorAll('.chart-dot-group').forEach(dotGroup => {
    dotGroup.addEventListener('mouseenter', () => {
      if (!tooltip || !chartWrapper) return;
      const cycle = dotGroup.dataset.cycle;
      const label = dotGroup.dataset.seriesLabel;
      const color = dotGroup.dataset.color;
      const val = dotGroup.dataset.val;
      const total = dotGroup.dataset.total;
      const pct = dotGroup.dataset.pct;
      const px = parseFloat(dotGroup.dataset.px);
      const py = parseFloat(dotGroup.dataset.py);

      const wrapperRect = chartWrapper.getBoundingClientRect();
      const leftPos = (px / width) * wrapperRect.width;
      const topPos = (py / height) * wrapperRect.height;

      tooltipTitle.textContent = `${cycle} - Desempenho`;
      tooltipBody.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700; color: ${color};">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${color};"></span>
          <span>${label}: ${val} ${val === '1' ? 'tarefa' : 'tarefas'}</span>
        </div>
        <div style="font-size: 0.75rem; margin-top: 4px; color: var(--text-secondary);">
          Total entregue no ciclo: <strong>${total}</strong> (${pct}%)
        </div>
      `;

      tooltip.style.left = `${leftPos}px`;
      tooltip.style.top = `${topPos - 55}px`;
      tooltip.style.display = 'block';
    });

    dotGroup.addEventListener('mouseleave', () => {
      if (tooltip) tooltip.style.display = 'none';
    });
  });
}

// Configuração dos Botões de Legenda Interativa (Show/Hide Series)
function setupLegendToggleListeners(cycles, seriesData) {
  window.perfCurrentCycles = cycles;
  window.perfCurrentSeriesData = seriesData;

  const seriesKeys = ['high', 'medium', 'low', 'total'];
  seriesKeys.forEach(key => {
    const btn = document.getElementById(`legend-${key}`);
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = 'true';
      btn.addEventListener('click', () => {
        window.perfSeries[key] = !window.perfSeries[key];
        btn.classList.toggle('active', window.perfSeries[key]);
        btn.classList.toggle('muted', !window.perfSeries[key]);
        renderPerfSvgChart(window.perfCurrentCycles, window.perfCurrentSeriesData);
      });
    }
  });
}

// Tabela de Histórico de Demandas Realizadas pelo Desenvolvedor
function renderPerfTasksTable(dev, allDevTasks, realDoneTasks) {
  const tbody = document.getElementById('perf-tasks-tbody');
  const countBadge = document.getElementById('perf-tasks-table-count');
  if (!tbody) return;

  tbody.innerHTML = '';

  const displayTasks = allDevTasks;

  if (countBadge) {
    countBadge.textContent = `${displayTasks.length} ${displayTasks.length === 1 ? 'demanda registrada' : 'demandas registradas'}`;
  }

  if (displayTasks.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2.5rem 1rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📋</div>
          Nenhuma demanda atribuída a este desenvolvedor ainda.
        </td>
      </tr>
    `;
    return;
  }

  displayTasks.forEach(task => {
    const project = store.getProjectById(task.projectId);
    const comp = task.complexity || 'Média';
    const compClass = comp === 'Alta' ? 'complexity-high' : (comp === 'Baixa' ? 'complexity-low' : 'complexity-med');
    const priorityClass = task.priority === 'Alta' ? 'priority-high' : (task.priority === 'Baixa' ? 'priority-low' : 'priority-med');

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="font-weight: 600; color: var(--text-main);">#${task.id} - ${task.title}</div>
      </td>
      <td><span style="color: var(--text-secondary); font-size: 0.85rem;">📁 ${project ? project.name : 'Geral'}</span></td>
      <td><span class="task-complexity-tag ${compClass}">⚡ ${comp}</span></td>
      <td><span class="task-priority-tag ${priorityClass}">${task.priority}</span></td>
      <td><strong>${task.hoursSpent || task.hours || 8}h</strong></td>
      <td>
        <span class="status-pill ${task.status === 'done' || task.qaApproved ? 'status-pass' : 'status-pending'}">
          ${task.qaApproved ? '✓ QA Homologado' : (task.status === 'done' ? '✓ Concluído' : 'Em Andamento')}
        </span>
      </td>
      <td>
        <button class="card-btn-action" onclick="openTaskModalForEdit('${task.id}')" title="Inspecionar Demanda">✏️</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Ação Administrativa: Efetivar Promoção do Desenvolvedor
window.promoteCurrentDev = async function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores possuem autorização para alterar o nível de senioridade e promover membros.');
    return;
  }

  const devId = window.selectedPerfDevId;
  const dev = store.getMemberById(devId);
  if (!dev) {
    showToast('Desenvolvedor não encontrado.');
    return;
  }

  const targetSenioritySelect = document.getElementById('perf-target-seniority');
  const justificationInput = document.getElementById('perf-promotion-justification');
  const targetSeniority = targetSenioritySelect ? targetSenioritySelect.value : 'Pleno';
  const justification = justificationInput ? justificationInput.value.trim() : '';

  if (dev.seniority === targetSeniority) {
    showToast(`O desenvolvedor ${dev.name} já possui a senioridade "${targetSeniority}".`);
    return;
  }

  const confirmMsg = `Confirmar promoção de cargo para ${dev.name}?\n\n• De: ${dev.seniority || 'Júnior'}\n• Para: ${targetSeniority}\n${justification ? `\nJustificativa: "${justification}"` : ''}\n\nEsta alteração será registrada no banco de dados SQLite e refletirá em todo o workspace.`;
  if (!confirm(confirmMsg)) return;

  // 1. Atualizar no estado local da equipe
  store.updateMember(devId, { seniority: targetSeniority });

  // 2. Se houver usuário correspondente no authStore, atualizar também
  if (typeof authStore !== 'undefined') {
    const users = authStore.getUsers();
    const u = users.find(user => user.id === devId || user.name.toLowerCase().trim() === dev.name.toLowerCase().trim());
    if (u) {
      u.seniority = targetSeniority;
      authStore.saveUsers(users);
    }
  }

  // 3. Persistir no Backend SQLite
  if (typeof api !== 'undefined' && api.isOnline) {
    await api.apiRequest(`/api/team/${devId}`, 'PUT', {
      name: dev.name,
      role: dev.role,
      seniority: targetSeniority,
      skills: dev.skills,
      capacity: dev.capacity
    });
  }

  showToast(`🎉 Promoção Concluída com Sucesso! ${dev.name} agora é ${targetSeniority}!`);
  
  const lastInfo = document.getElementById('perf-last-promotion-info');
  if (lastInfo) {
    const nowStr = new Date().toLocaleDateString('pt-BR');
    lastInfo.innerHTML = `<strong>Promoção Registrada:</strong> Promovido(a) a <strong>${targetSeniority}</strong> em ${nowStr} por ${currentUser.name}.`;
    lastInfo.style.color = '#34d399';
  }

  refreshAllUI();
  renderPerformance();
};

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
  document.getElementById('admin-user-devrole').value = user.devRole || (user.role === 'qa' ? 'qa' : 'backend');
  document.getElementById('admin-user-seniority').value = user.seniority || 'Pleno';
  document.getElementById('admin-user-password').value = "";
  document.getElementById('admin-user-password').required = false;
  document.getElementById('label-admin-user-password').textContent = "Nova Senha (Opcional)";
  document.getElementById('admin-user-password').placeholder = "Deixe em branco para manter a senha atual";
  document.getElementById('hint-admin-user-password').style.display = 'block';
  document.getElementById('admin-user-skills').value = Array.isArray(user.skills) ? user.skills.join(', ') : (user.skills || '');

  const showDevRole = user.role === 'dev' || user.role === 'qa' || !!user.devRole;
  document.getElementById('group-admin-user-devrole').style.display = showDevRole ? 'block' : 'none';
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

  appendLog("Iniciando Bateria de Testes de Qualidade do Synchro v3.0 (CRUD Engine)...", "info");
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
      name: "4. Equilíbrio de Especialidades da Equipe Multidisciplinar",
      run: () => {
        const members = store.state.teamMembers;
        if (members.length === 0) throw new Error("A equipe deve ter membros cadastrados.");
        const roles = new Set(members.map(m => m.role));
        return `Equipe multidisciplinar ativa com ${members.length} colaboradores e ${roles.size} especialidades técnicas.`;
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
  const reqs = store.state.requirements || [];
  const members = store.state.teamMembers || [];

  const projectFilterSelect = document.getElementById('project-filter-select');
  if (projectFilterSelect) {
    const currentVal = projectFilterSelect.value || store.selectedProject || 'all';
    projectFilterSelect.innerHTML = `<option value="all">📁 Todos os Projetos</option>` +
      projects.map(p => `<option value="${p.id}" ${p.id === currentVal ? 'selected' : ''}>${p.name}</option>`).join('');
    if (currentVal) projectFilterSelect.value = currentVal;
  }

  const taskProjectSelect = document.getElementById('task-project');
  if (taskProjectSelect) {
    const curVal = taskProjectSelect.value;
    taskProjectSelect.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (curVal && projects.some(p => p.id === curVal)) {
      taskProjectSelect.value = curVal;
    }
  }

  const taskReqSelect = document.getElementById('task-requirement');
  if (taskReqSelect) {
    const curVal = taskReqSelect.value;
    taskReqSelect.innerHTML = `<option value="">Nenhum (Demanda Avulsa)</option>` + 
      reqs.map(r => `<option value="${r.id}" data-code="${r.code || ''}">[${r.code || 'REQ'}] ${r.title}</option>`).join('');
    if (curVal) {
      const match = reqs.find(r => r.id === curVal || (r.code && r.code.toUpperCase() === curVal.toUpperCase()));
      if (match) taskReqSelect.value = match.id;
      else taskReqSelect.value = curVal;
    }
  }

  const taskAssigneeSelect = document.getElementById('task-assignee');
  if (taskAssigneeSelect) {
    const curVal = taskAssigneeSelect.value;
    taskAssigneeSelect.innerHTML = `<option value="">Sem responsável</option>` + 
      members.map(m => {
        const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(m.role) : { icon: '💻', shortLabel: 'Dev' };
        return `<option value="${m.id}">${m.name} (${spec.icon} ${spec.shortLabel || spec.label})</option>`;
      }).join('');
    if (curVal && members.some(m => m.id === curVal)) {
      taskAssigneeSelect.value = curVal;
    }
  }

  const reqProjectSelect = document.getElementById('req-project');
  if (reqProjectSelect) {
    const curVal = reqProjectSelect.value;
    reqProjectSelect.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (curVal && projects.some(p => p.id === curVal)) {
      reqProjectSelect.value = curVal;
    }
    const currentProjId = reqProjectSelect.value || (projects[0] ? projects[0].id : '');
    updateModalFeaturesDropdown(currentProjId);
  }

  populateFeatureFilterOptions();

  const testReqSelect = document.getElementById('test-req-select');
  if (testReqSelect) {
    const curVal = testReqSelect.value;
    testReqSelect.innerHTML = reqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
    if (curVal && reqs.some(r => r.id === curVal)) {
      testReqSelect.value = curVal;
    }
  }

  const testTaskSelect = document.getElementById('test-task-select');
  if (testTaskSelect) {
    const curVal = testTaskSelect.value;
    testTaskSelect.innerHTML = `<option value="">Todas as demandas do requisito / Geral</option>` + 
      (store.state.tasks || []).map(t => `<option value="${t.id}">#${t.id.slice(-6)} - ${t.title}</option>`).join('');
    if (curVal && (store.state.tasks || []).some(t => t.id === curVal)) {
      testTaskSelect.value = curVal;
    }
  }

  // --- População de Selects do Módulo de APF ---
  const apfProjectSelect = document.getElementById('apf-project-select');
  if (apfProjectSelect) {
    const curVal = apfProjectSelect.value || (store.selectedProject !== 'all' ? store.selectedProject : (projects[0] ? projects[0].id : ''));
    apfProjectSelect.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
    if (curVal && projects.some(p => p.id === curVal)) {
      apfProjectSelect.value = curVal;
    }
  }

  const apfScopeFeatureSelect = document.getElementById('apf-scope-feature-select');
  if (apfScopeFeatureSelect) {
    const activeProjId = store.selectedProject;
    const curVal = apfScopeFeatureSelect.value || store.apfFeatureFilter || 'all';
    const features = store.getProjectFeatures ? store.getProjectFeatures(activeProjId) : [];
    apfScopeFeatureSelect.innerHTML = `<option value="all">Todas as Features</option>` +
      features.map(f => `<option value="${f}" ${f === curVal ? 'selected' : ''}>${f}</option>`).join('');
    if (curVal && (curVal === 'all' || features.includes(curVal))) {
      apfScopeFeatureSelect.value = curVal;
    }
  }

  const apfReqSelect = document.getElementById('apf-req-select');
  if (apfReqSelect) {
    const curVal = apfReqSelect.value;
    const currentProjId = apfProjectSelect ? apfProjectSelect.value : (projects[0] ? projects[0].id : '');
    const filteredReqs = currentProjId ? reqs.filter(r => r.projectId === currentProjId) : reqs;
    apfReqSelect.innerHTML = `<option value="">Nenhum requisito vinculado (Geral / Livre)</option>` +
      filteredReqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
    if (curVal && filteredReqs.some(r => r.id === curVal)) {
      apfReqSelect.value = curVal;
    }
  }

  const apfFeaturesDatalist = document.getElementById('apf-features-datalist');
  if (apfFeaturesDatalist) {
    const currentProjId = apfProjectSelect ? apfProjectSelect.value : '';
    const features = store.getProjectFeatures ? store.getProjectFeatures(currentProjId) : [];
    apfFeaturesDatalist.innerHTML = features.map(f => `<option value="${f}">`).join('');
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

// ==============================================================================
// 4.2 Trilha de Auditoria & Conformidade (Audit Logs Engine)
// ==============================================================================

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getRoleLabel(role) {
  const map = {
    admin: 'Admin',
    pm: 'PM / Scrum',
    dev: 'Dev',
    qa: 'QA / Lead'
  };
  return map[role] || role || 'Usuário';
}

function getRoleBadgeClass(role) {
  const map = {
    admin: 'tag-admin',
    pm: 'tag-pm',
    dev: 'tag-back',
    qa: 'tag-qa'
  };
  return map[role] || 'tag-back';
}

window.refreshAuditLogsUI = async function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Acesso restrito: apenas o Administrador do Sistema tem acesso aos registros de auditoria.');
    return;
  }

  const tbody = document.getElementById('audit-logs-tbody');
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-muted);">⏳ Carregando registros de auditoria do banco de dados...</td></tr>';
  }

  const logs = await store.fetchAuditLogs({ limit: 300 });
  
  // Atualizar cards de métricas
  const totalEl = document.getElementById('audit-stat-total');
  const tasksEl = document.getElementById('audit-stat-tasks');
  const qaEl = document.getElementById('audit-stat-qa');
  const timesheetEl = document.getElementById('audit-stat-timesheet');
  const counterNav = document.getElementById('counter-nav-audit');

  if (totalEl) totalEl.textContent = logs.length;
  if (tasksEl) tasksEl.textContent = logs.filter(l => l.entityType === 'task').length;
  if (qaEl) qaEl.textContent = logs.filter(l => l.action === 'QA_VALIDATE').length;
  if (timesheetEl) timesheetEl.textContent = logs.filter(l => l.action === 'TIMESHEET_POINT' || l.action === 'HOURS_ADJUST').length;
  if (counterNav) counterNav.textContent = logs.length;

  renderAuditTable();
};

function getFilteredAuditLogs() {
  const entityFilter = document.getElementById('audit-filter-entity')?.value || 'all';
  const actionFilter = document.getElementById('audit-filter-action')?.value || 'all';
  const search = (document.getElementById('audit-search-input')?.value || '').trim().toLowerCase();

  let logs = store.auditLogs || [];

  if (entityFilter !== 'all') {
    logs = logs.filter(l => l.entityType === entityFilter);
  }

  if (actionFilter !== 'all') {
    logs = logs.filter(l => l.action === actionFilter);
  }

  if (search) {
    logs = logs.filter(l => {
      const actor = (l.actorName || '').toLowerCase();
      const entity = (l.entityTitle || '').toLowerCase();
      const details = (l.details || '').toLowerCase();
      const action = (l.action || '').toLowerCase();
      return actor.includes(search) || entity.includes(search) || details.includes(search) || action.includes(search);
    });
  }

  return logs;
}

window.renderAuditTable = function() {
  const tbody = document.getElementById('audit-logs-tbody');
  if (!tbody) return;

  const logs = getFilteredAuditLogs();

  if (logs.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          <div style="font-size: 2rem; margin-bottom: 0.5rem;">📜</div>
          <div style="font-weight: 600; font-size: 0.95rem;">Nenhum registro de auditoria encontrado</div>
          <div style="font-size: 0.8rem; margin-top: 4px;">Tente ajustar os filtros ou a busca textual acima.</div>
        </td>
      </tr>
    `;
    return;
  }

  const actionBadges = {
    CREATE: 'audit-tag-create',
    UPDATE: 'audit-tag-update',
    STATUS_CHANGE: 'audit-tag-status',
    QA_VALIDATE: 'audit-tag-qa',
    TIMESHEET_POINT: 'audit-tag-timesheet',
    HOURS_ADJUST: 'audit-tag-hours',
    ASSIGN: 'audit-tag-assign',
    DELETE: 'audit-tag-delete',
    AUTH_LOGIN: 'audit-tag-auth',
    AUTH_REGISTER: 'audit-tag-auth'
  };

  const entityIcons = {
    task: '🚀',
    project: '📁',
    requirement: '📋',
    test: '🧪',
    team: '👥',
    auth: '🔐'
  };

  let rowsHtml = '';
  logs.forEach(log => {
    const d = new Date(log.createdAt);
    const dateFormatted = d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const badgeClass = actionBadges[log.action] || 'audit-tag-update';
    const entityIcon = entityIcons[log.entityType] || '📌';
    const hasDiff = log.prevState || log.newState;

    rowsHtml += `
      <tr>
        <td style="font-size: 0.8rem; color: var(--text-muted); font-family: 'Fira Code', monospace; white-space: nowrap;">
          ${dateFormatted}
        </td>
        <td>
          <div class="audit-actor-chip">
            <span>👤 ${escapeHtml(log.actorName || 'Sistema')}</span>
            <span class="user-role-badge ${getRoleBadgeClass(log.actorRole)}">${getRoleLabel(log.actorRole)}</span>
          </div>
        </td>
        <td>
          <div class="audit-entity-chip" title="ID: ${escapeHtml(log.entityId || '')}">
            <span>${entityIcon}</span>
            <span style="font-weight: 600; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${escapeHtml(log.entityTitle || log.entityId || log.entityType)}
            </span>
          </div>
        </td>
        <td>
          <span class="audit-action-tag ${badgeClass}">${escapeHtml(log.action)}</span>
        </td>
        <td style="color: var(--text-secondary); line-height: 1.45;">
          ${escapeHtml(log.details || '-')}
        </td>
        <td style="text-align: center;">
          ${hasDiff ? `
            <button type="button" class="audit-diff-btn" onclick="openAuditDiffModal('${log.id}')" title="Ver Diferença de Estado (Antes vs Depois)">
              🔍 Diff
            </button>
          ` : '<span style="color: var(--text-muted); font-size: 0.75rem;">-</span>'}
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
};

window.openAuditDiffModal = function(logId) {
  const log = (store.auditLogs || []).find(l => l.id === logId);
  if (!log) return;

  const metaEl = document.getElementById('audit-diff-meta');
  const prevEl = document.getElementById('audit-diff-prev');
  const nextEl = document.getElementById('audit-diff-next');

  if (metaEl) {
    const d = new Date(log.createdAt).toLocaleString('pt-BR');
    metaEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <span style="font-weight: 700; color: var(--text-main); font-size: 0.95rem;">${escapeHtml(log.entityTitle || log.entityId)}</span>
          <span class="audit-entity-chip" style="margin-left: 6px;">${escapeHtml(log.entityType)}</span>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); font-family: 'Fira Code', monospace;">${d}</div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 0.35rem;">
        <span class="audit-action-tag audit-tag-update">${escapeHtml(log.action)}</span>
        <span style="font-size: 0.82rem; color: var(--text-secondary);">Executado por <strong>${escapeHtml(log.actorName || 'Sistema')}</strong> (${getRoleLabel(log.actorRole)})</span>
      </div>
      <div style="font-size: 0.84rem; color: var(--text-main); line-height: 1.4;">${escapeHtml(log.details || '')}</div>
    `;
  }

  if (prevEl) {
    let prevText = 'Nenhum estado anterior registrado.';
    if (log.prevState) {
      try {
        const obj = typeof log.prevState === 'string' ? JSON.parse(log.prevState) : log.prevState;
        prevText = JSON.stringify(obj, null, 2);
      } catch (e) {
        prevText = String(log.prevState);
      }
    }
    prevEl.textContent = prevText;
  }

  if (nextEl) {
    let nextText = 'Nenhum novo estado registrado.';
    if (log.newState) {
      try {
        const obj = typeof log.newState === 'string' ? JSON.parse(log.newState) : log.newState;
        nextText = JSON.stringify(obj, null, 2);
      } catch (e) {
        nextText = String(log.newState);
      }
    }
    nextEl.textContent = nextText;
  }

  openModal('modal-audit-diff');
};

// ==============================================================================
// 4.3 Exportação de Relatórios de Auditoria (XLSX, PDF e CSV) - Exclusivo Admin
// ==============================================================================

window.exportAuditLogsXLSX = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Acesso restrito: apenas o Administrador do Sistema pode exportar a trilha de auditoria.');
    return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Aviso: Biblioteca XLSX não carregada no navegador.');
    return;
  }

  const logs = getFilteredAuditLogs();
  if (logs.length === 0) {
    showToast('Nenhum registro de auditoria disponível para exportação.');
    return;
  }

  const data = logs.map((l, index) => ({
    '#': index + 1,
    'Data / Hora': new Date(l.createdAt).toLocaleString('pt-BR'),
    'Usuário': l.actorName || 'Sistema',
    'Papel': getRoleLabel(l.actorRole),
    'Entidade': (l.entityType || '').toUpperCase(),
    'ID Entidade': l.entityId || '-',
    'Título / Referência': l.entityTitle || '-',
    'Ação': l.action,
    'Detalhes Operacionais': l.details || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);

  // Largura calculada das colunas
  worksheet['!cols'] = [
    { wch: 6 },  // #
    { wch: 20 }, // Data/Hora
    { wch: 22 }, // Usuário
    { wch: 14 }, // Papel
    { wch: 14 }, // Entidade
    { wch: 16 }, // ID Entidade
    { wch: 32 }, // Título
    { wch: 18 }, // Ação
    { wch: 55 }  // Detalhes
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Trilha de Auditoria');

  const today = new Date().toISOString().split('T')[0];
  const filename = `auditoria_synchro_${today}.xlsx`;
  XLSX.writeFile(workbook, filename);

  showToast(`Relatório XLSX gerado com sucesso (${logs.length} registros exportados)!`);
};

window.exportAuditLogsPDF = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Acesso restrito: apenas o Administrador do Sistema pode exportar a trilha de auditoria.');
    return;
  }

  const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
  if (!jsPDFClass) {
    showToast('Aviso: Biblioteca jsPDF não disponível no navegador.');
    return;
  }

  const logs = getFilteredAuditLogs();
  if (logs.length === 0) {
    showToast('Nenhum registro de auditoria disponível para exportação.');
    return;
  }

  const doc = new jsPDFClass({
    orientation: 'landscape',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Cabeçalho estilizado Premium
  doc.setFillColor(15, 23, 42); // slate-900
  doc.rect(0, 0, pageWidth, 56, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.text('SYNCHRO PRO - RELATÓRIO OFICIAL DE AUDITORIA & CONFORMIDADE', 30, 30);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(148, 163, 184); // slate-400
  const exportDate = new Date().toLocaleString('pt-BR');
  doc.text(`Gerado em: ${exportDate} por ${currentUser ? currentUser.name : 'Administrador'} (Admin) | Total: ${logs.length} registros auditados`, 30, 46);

  // Estrutura de dados para o relatório tabular autoTable
  const head = [['Data / Hora', 'Usuário / Papel', 'Entidade / ID', 'Ação', 'Detalhes Operacionais']];
  const body = logs.map(l => [
    new Date(l.createdAt).toLocaleString('pt-BR'),
    `${l.actorName || 'Sistema'}\n(${getRoleLabel(l.actorRole)})`,
    `[${(l.entityType || '').toUpperCase()}]\n${l.entityTitle || l.entityId || '-'}`,
    l.action || '-',
    l.details || '-'
  ]);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      head: head,
      body: body,
      startY: 68,
      margin: { top: 68, bottom: 35, left: 30, right: 30 },
      theme: 'grid',
      styles: {
        fontSize: 8,
        cellPadding: 6,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        overflow: 'linebreak',
        font: 'helvetica'
      },
      headStyles: {
        fillColor: [30, 41, 59],
        textColor: [248, 250, 252],
        fontStyle: 'bold',
        fontSize: 8.5
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: {
        0: { cellWidth: 105 },
        1: { cellWidth: 120 },
        2: { cellWidth: 160 },
        3: { cellWidth: 110 },
        4: { cellWidth: 'auto' }
      },
      didDrawPage: function(data) {
        // Rodapé de paginação
        const total = doc.internal.getNumberOfPages();
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        doc.text('Synchro ALM Pro - Trilha de Auditoria Imutável do Sistema', 30, pageHeight - 16);
        doc.text(`Página ${data.pageNumber} de ${total}`, pageWidth - 30, pageHeight - 16, { align: 'right' });
      }
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(`Página ${i} de ${totalPages}`, pageWidth - 30, pageHeight - 16, { align: 'right' });
    }
  } else {
    // Fallback texto caso o plugin autoTable não carregue
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(9);
    let y = 80;
    logs.forEach((l, i) => {
      if (y > pageHeight - 35) {
        doc.addPage();
        y = 40;
      }
      const line = `${i + 1}. [${new Date(l.createdAt).toLocaleString('pt-BR')}] ${l.actorName} - ${l.action} - ${l.details || ''}`;
      doc.text(line.slice(0, 130), 30, y);
      y += 16;
    });
  }

  const today = new Date().toISOString().split('T')[0];
  doc.save(`auditoria_synchro_${today}.pdf`);
  showToast(`Relatório PDF gerado com sucesso (${logs.length} registros)!`);
};

window.exportAuditLogsCSV = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Acesso restrito: apenas o Administrador do Sistema pode exportar a trilha de auditoria.');
    return;
  }

  const logs = getFilteredAuditLogs();
  if (logs.length === 0) {
    showToast('Nenhum registro de auditoria disponível para exportação.');
    return;
  }

  let csv = '\uFEFF'; // BOM para Excel UTF-8
  csv += 'ID;Data e Hora;Autor;Papel;Entidade;ID Entidade;Título;Ação;Detalhes\r\n';

  logs.forEach(l => {
    const row = [
      l.id,
      new Date(l.createdAt).toLocaleString('pt-BR'),
      l.actorName || 'Sistema',
      getRoleLabel(l.actorRole),
      (l.entityType || '').toUpperCase(),
      l.entityId || '-',
      (l.entityTitle || '').replace(/;/g, ' '),
      l.action,
      (l.details || '').replace(/;/g, ' ').replace(/\n/g, ' ')
    ];
    csv += row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(';') + '\r\n';
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `auditoria_synchro_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Trilha de auditoria exportada em CSV com sucesso (${logs.length} registros)!`);
};

// ==============================================================================
// 4.2.5 Relatório de Medição & Documento de Requisitos (Faturamento & Aceite Formal)
// ==============================================================================

function getRequirementValidationStatus(req) {
  if (!req) {
    return {
      isValidated: false,
      statusLabel: 'Não Especificado',
      statusColor: '#64748b',
      badgeClass: 'badge-measurement-untested',
      detailNote: 'Sem dados',
      linkedTasks: [],
      linkedTests: [],
      hasBdd: false
    };
  }

  const linkedTasks = (store.state.tasks || []).filter(t => t.reqId === req.id);
  const linkedTests = (store.state.testCases || []).filter(tc => tc.reqId === req.id);

  const hasTasks = linkedTasks.length > 0;
  const hasTests = linkedTests.length > 0;

  const allTasksDone = hasTasks && linkedTasks.every(t => t.status === 'done' || t.qaApproved);
  const anyTaskApproved = linkedTasks.some(t => t.qaApproved);
  const allTestsPass = hasTests && linkedTests.every(tc => tc.status === 'pass');
  const hasFailedTests = linkedTests.some(tc => tc.status === 'fail');

  let isValidated = false;
  let statusLabel = 'Em Homologação / Testes';
  let badgeClass = 'badge-measurement-pending';
  let statusColor = '#f59e0b';
  let detailNote = '';

  if (hasFailedTests) {
    isValidated = false;
    statusLabel = 'Reprovado QA (Falhas em Testes)';
    badgeClass = 'badge-measurement-pending';
    statusColor = '#ef4444';
    const failedCount = linkedTests.filter(tc => tc.status === 'fail').length;
    detailNote = `Falha em ${failedCount} caso(s) de teste`;
  } else if ((allTasksDone && (!hasTests || allTestsPass)) || (hasTests && allTestsPass) || anyTaskApproved) {
    isValidated = true;
    statusLabel = 'Concluído & Validado pelo QA';
    badgeClass = 'badge-measurement-approved';
    statusColor = '#10b981';
    const qaApprovedTask = linkedTasks.find(t => t.qaApproved);
    if (qaApprovedTask && qaApprovedTask.qaReviewer) {
      detailNote = `Validado formalmente por ${qaApprovedTask.qaReviewer}`;
    } else {
      detailNote = `Critérios e tarefas 100% cumpridos`;
    }
  } else if (!hasTasks && !hasTests) {
    isValidated = false;
    statusLabel = 'Especificado (Aguardando Tarefas/Testes)';
    badgeClass = 'badge-measurement-untested';
    statusColor = '#94a3b8';
    detailNote = 'Sem execuções vinculadas';
  } else {
    isValidated = false;
    statusLabel = 'Em Execução / Homologação';
    badgeClass = 'badge-measurement-pending';
    statusColor = '#f59e0b';
    const doneTasks = linkedTasks.filter(t => t.status === 'done').length;
    detailNote = `${doneTasks}/${linkedTasks.length} tarefas concluídas`;
  }

  return {
    isValidated,
    statusLabel,
    badgeClass,
    statusColor,
    detailNote,
    linkedTasks,
    linkedTests,
    hasBdd: !!(req.bdd && req.bdd.trim())
  };
}

function openMeasurementReportModal() {
  const projectSelect = document.getElementById('measurement-project-select');
  const featureSelect = document.getElementById('measurement-feature-select');
  if (!projectSelect || !featureSelect) return;

  projectSelect.innerHTML = '';
  const projects = store.state.projects || [];
  if (projects.length === 0) {
    showToast('Cadastre ao menos um projeto antes de emitir relatório de medição.');
    return;
  }

  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.code ? `[${p.code}] ` : ''}${p.name}`;
    projectSelect.appendChild(opt);
  });

  const initialProjectId = (store.selectedProject && store.selectedProject !== 'all')
    ? store.selectedProject
    : projects[0].id;
  projectSelect.value = initialProjectId;

  populateMeasurementFeatures(initialProjectId);

  if (store.reqFeatureFilter && store.reqFeatureFilter !== 'all') {
    featureSelect.value = store.reqFeatureFilter;
  }

  const project = store.getProjectById(initialProjectId) || projects[0];
  const clientInput = document.getElementById('measurement-client-name');
  if (clientInput) {
    clientInput.value = project.client || 'Banco Alpha S.A. / Diretoria de Tecnologia';
  }

  const milestoneInput = document.getElementById('measurement-milestone-name');
  if (milestoneInput) {
    const activeFeature = featureSelect.value !== 'all' ? featureSelect.value : 'Entregáveis Principais';
    milestoneInput.value = `Marco 01 - ${activeFeature} (Sprint de Homologação)`;
  }

  const contractInput = document.getElementById('measurement-contract-ref');
  if (contractInput) {
    contractInput.value = `CTR-${project.code || 'DEV'}-MED01`;
  }

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const managerInput = document.getElementById('measurement-manager-name');
  if (managerInput) {
    managerInput.value = currentUser ? currentUser.name : 'Gestor de Projetos / Scrum Master';
  }

  const clientSigneeInput = document.getElementById('measurement-client-signee');
  if (clientSigneeInput && !clientSigneeInput.value) {
    clientSigneeInput.value = 'Product Owner / Fiscal do Contrato (Cliente)';
  }

  // Popula seletor de templates de documento
  const templateSelect = document.getElementById('measurement-template-select');
  if (templateSelect) {
    templateSelect.innerHTML = '';
    const templates = store.getDocumentTemplates();
    const defaultTpl = store.getDefaultTemplate();
    templates.forEach(tpl => {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = `${tpl.isDefault ? '⭐ ' : ''}${tpl.name} [${tpl.primaryColor}]`;
      if (tpl.isDefault) opt.selected = true;
      templateSelect.appendChild(opt);
    });
    if (defaultTpl && (!templateSelect.value || !store.getTemplateById(templateSelect.value))) {
      templateSelect.value = defaultTpl.id;
    }
  }
  updateMeasurementTemplateInfo();

  updateMeasurementReportPreview();
  openModal('modal-measurement-report');
}

function updateMeasurementTemplateInfo() {
  const templateSelect = document.getElementById('measurement-template-select');
  const infoBar = document.getElementById('measurement-template-info-bar');
  if (!templateSelect || !infoBar) return;

  const tplId = templateSelect.value;
  const tpl = (tplId ? store.getTemplateById(tplId) : null) || store.getDefaultTemplate();
  if (!tpl) {
    infoBar.innerHTML = '';
    return;
  }

  const primColor = tpl.primaryColor || '#0284c7';
  const hasLogo = Boolean(tpl.logoUrl);

  const pills = [
    tpl.includeUserStory !== false ? '<span class="template-sec-pill active" title="História de Usuário visível">✓ US</span>' : '<span class="template-sec-pill inactive" title="História de Usuário oculta">✕ US</span>',
    tpl.includeAcceptanceCriteria !== false ? '<span class="template-sec-pill active" title="Critérios BDD visíveis">✓ BDD</span>' : '<span class="template-sec-pill inactive" title="Critérios BDD ocultos">✕ BDD</span>',
    tpl.includeQaEvidence !== false ? '<span class="template-sec-pill active" title="Evidências de QA visíveis">✓ QA</span>' : '<span class="template-sec-pill inactive" title="Evidências de QA ocultas">✕ QA</span>',
    tpl.includeSignatures !== false ? '<span class="template-sec-pill active" title="Bloco de assinaturas visível">✓ Assinaturas</span>' : '<span class="template-sec-pill inactive" title="Bloco de assinaturas oculto">✕ Assinaturas</span>',
    tpl.includeKpis !== false ? '<span class="template-sec-pill active" title="Quadro de KPIs visível">✓ KPIs</span>' : '<span class="template-sec-pill inactive" title="Quadro de KPIs oculto">✕ KPIs</span>'
  ].join('');

  infoBar.innerHTML = `
    <span class="template-info-chip" style="display: inline-flex; align-items: center; gap: 5px;">
      <span class="color-swatch-circle" style="background: ${primColor}; width: 11px; height: 11px;"></span>
      <strong style="color: var(--text-main);">${escapeHtml(tpl.name)}</strong>
    </span>
    <span class="template-info-chip">${hasLogo ? '🖼️ Logotipo Ativo' : '🏢 Marca Padrão'}</span>
    <span style="display: inline-flex; gap: 4px; flex-wrap: wrap;">${pills}</span>
  `;
}
window.updateMeasurementTemplateInfo = updateMeasurementTemplateInfo;

function populateMeasurementFeatures(projectId) {
  const featureSelect = document.getElementById('measurement-feature-select');
  if (!featureSelect) return;
  featureSelect.innerHTML = '';

  const features = store.getProjectFeatures(projectId);

  const optAll = document.createElement('option');
  optAll.value = 'all';
  optAll.textContent = '🌟 Todas as Features do Projeto';
  featureSelect.appendChild(optAll);

  features.forEach(feat => {
    const opt = document.createElement('option');
    opt.value = feat;
    opt.textContent = `🧩 ${feat}`;
    featureSelect.appendChild(opt);
  });

  if (features.length > 0) {
    featureSelect.value = features[0];
  } else {
    featureSelect.value = 'all';
  }
}

function updateMeasurementReportPreview() {
  const projectId = document.getElementById('measurement-project-select')?.value;
  const feature = document.getElementById('measurement-feature-select')?.value;
  const statusFilter = document.getElementById('measurement-status-filter')?.value || 'qa_approved';

  if (!projectId) return;

  const project = store.getProjectById(projectId);
  let allReqsInScope = (store.state.requirements || []).filter(r => r.projectId === projectId);
  if (feature && feature !== 'all') {
    allReqsInScope = allReqsInScope.filter(r => r.feature === feature);
  }

  allReqsInScope.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

  const analyzed = allReqsInScope.map(r => ({
    req: r,
    val: getRequirementValidationStatus(r)
  }));

  const totalInScope = analyzed.length;
  const qaApprovedCount = analyzed.filter(item => item.val.isValidated).length;
  const bddCount = analyzed.filter(item => item.val.hasBdd).length;
  const completionRate = totalInScope > 0 ? Math.round((qaApprovedCount / totalInScope) * 100) : 0;

  const totalEl = document.getElementById('m-preview-total-reqs');
  const qaEl = document.getElementById('m-preview-qa-approved');
  const bddEl = document.getElementById('m-preview-bdd-count');
  const rateEl = document.getElementById('m-preview-rate');
  const barEl = document.getElementById('m-preview-progress-bar');
  const badgeEl = document.getElementById('measurement-billing-badge');

  if (totalEl) totalEl.textContent = totalInScope;
  if (qaEl) qaEl.textContent = qaApprovedCount;
  if (bddEl) bddEl.textContent = bddCount;
  if (rateEl) rateEl.textContent = `${completionRate}%`;
  if (barEl) barEl.style.width = `${completionRate}%`;

  if (badgeEl) {
    if (totalInScope === 0) {
      badgeEl.textContent = 'Sem requisitos no escopo';
      badgeEl.className = 'badge-subtle';
      badgeEl.style.color = '#94a3b8';
      badgeEl.style.background = 'rgba(148, 163, 184, 0.15)';
    } else if (completionRate === 100) {
      badgeEl.textContent = '🟢 100% Homologado — Apto para Faturamento & Aceite';
      badgeEl.className = 'badge-subtle';
      badgeEl.style.color = '#34d399';
      badgeEl.style.background = 'rgba(16, 185, 129, 0.18)';
      badgeEl.style.border = '1px solid rgba(16, 185, 129, 0.4)';
    } else if (completionRate > 0) {
      badgeEl.textContent = `🟡 Medição Parcial (${completionRate}% Homologado)`;
      badgeEl.className = 'badge-subtle';
      badgeEl.style.color = '#fbbf24';
      badgeEl.style.background = 'rgba(245, 158, 11, 0.18)';
      badgeEl.style.border = '1px solid rgba(245, 158, 11, 0.4)';
    } else {
      badgeEl.textContent = '⚪ Em Homologação Técnica (0% Validado QA)';
      badgeEl.className = 'badge-subtle';
      badgeEl.style.color = '#94a3b8';
      badgeEl.style.background = 'rgba(148, 163, 184, 0.15)';
      badgeEl.style.border = '1px solid rgba(148, 163, 184, 0.3)';
    }
  }

  let displayItems = analyzed;
  if (statusFilter === 'qa_approved') {
    displayItems = analyzed.filter(item => item.val.isValidated);
  }

  const itemsListContainer = document.getElementById('m-preview-items-list');
  if (itemsListContainer) {
    if (displayItems.length === 0) {
      itemsListContainer.innerHTML = `
        <div style="padding: 1rem; text-align: center; color: var(--text-muted); font-size: 0.8rem; font-style: italic;">
          ${statusFilter === 'qa_approved' && totalInScope > 0
            ? 'Nenhum requisito com validação concluída pelo QA nesta feature ainda. Alterne o filtro para "Todos os Requisitos" ou valide as demandas e testes vinculados.'
            : 'Nenhum requisito cadastrado para os parâmetros selecionados.'}
        </div>
      `;
    } else {
      itemsListContainer.innerHTML = displayItems.map(item => `
        <div class="m-preview-item-row">
          <div class="m-preview-item-info">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="req-code-badge" style="font-size: 0.72rem; padding: 1px 6px;">${escapeHtml(item.req.code)}</span>
              <strong class="m-preview-item-title">${escapeHtml(item.req.title)}</strong>
            </div>
            <div class="m-preview-item-sub">
              <span>Prioridade: <strong>${item.req.moscow || 'Must'}</strong></span>
              ${item.req.feature ? `<span>🧩 ${escapeHtml(item.req.feature)}</span>` : ''}
              ${item.val.hasBdd ? `<span class="badge-bdd-valid">✓ BDD Documentado</span>` : `<span style="color: var(--text-muted);">Sem BDD</span>`}
              <span>${escapeHtml(item.val.detailNote)}</span>
            </div>
          </div>
          <div>
            <span class="${item.val.badgeClass}">${item.val.statusLabel}</span>
          </div>
        </div>
      `).join('');
    }
  }
}

window.exportMeasurementReportPDF = function() {
  const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
  if (!jsPDFClass) {
    showToast('Aviso: Biblioteca jsPDF não disponível no navegador.');
    return;
  }

  const projectId = document.getElementById('measurement-project-select')?.value;
  const feature = document.getElementById('measurement-feature-select')?.value;
  const statusFilter = document.getElementById('measurement-status-filter')?.value || 'qa_approved';

  if (!projectId) {
    showToast('Selecione um projeto válido para emissão do relatório.');
    return;
  }

  const project = store.getProjectById(projectId);
  if (!project) {
    showToast('Projeto não encontrado.');
    return;
  }

  let allReqsInScope = (store.state.requirements || []).filter(r => r.projectId === projectId);
  if (feature && feature !== 'all') {
    allReqsInScope = allReqsInScope.filter(r => r.feature === feature);
  }

  if (allReqsInScope.length === 0) {
    showToast('Nenhum requisito cadastrado para este projeto/feature.');
    return;
  }

  allReqsInScope.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

  const analyzed = allReqsInScope.map(r => ({
    req: r,
    val: getRequirementValidationStatus(r)
  }));

  let exportItems = analyzed;
  if (statusFilter === 'qa_approved') {
    exportItems = analyzed.filter(i => i.val.isValidated);
  }

  if (exportItems.length === 0) {
    showToast('Nenhum requisito concluído e validado pelo QA encontrado no escopo selecionado.');
    return;
  }

  const totalInScope = analyzed.length;
  const qaApprovedCount = analyzed.filter(i => i.val.isValidated).length;
  const bddCount = analyzed.filter(i => i.val.hasBdd).length;
  const completionRate = totalInScope > 0 ? Math.round((qaApprovedCount / totalInScope) * 100) : 0;

  const clientName = document.getElementById('measurement-client-name')?.value.trim() || project.client || 'Empresa Contratante S.A.';
  const milestoneName = document.getElementById('measurement-milestone-name')?.value.trim() || (feature !== 'all' ? `Marco: ${feature}` : 'Marco de Entrega do Projeto');
  const contractRef = document.getElementById('measurement-contract-ref')?.value.trim() || `CTR-${project.code || 'DEV'}-MED01`;
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const managerName = document.getElementById('measurement-manager-name')?.value.trim() || (currentUser ? currentUser.name : 'Gestor de Projetos');
  const clientSignee = document.getElementById('measurement-client-signee')?.value.trim() || 'Product Owner / Fiscal do Contrato (Cliente)';
  const featureLabel = (feature && feature !== 'all') ? feature : 'Todas as Features do Escopo';
  const issueDate = new Date().toLocaleString('pt-BR');

  // Resgata o template de documento selecionado
  const templateId = document.getElementById('measurement-template-select')?.value;
  const template = (templateId ? store.getTemplateById(templateId) : null) || store.getDefaultTemplate() || {
    name: 'Padrão Corporativo',
    primaryColor: '#0284c7',
    docTitle: 'RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS',
    docSubtitle: 'Artefato Oficial de Comprovação de Entrega Técnica para Fins de Faturamento & Aceite',
    headerInstitution: 'SYNCHRO ALM PRO — PLATAFORMA INTEGRADA DE ENGENHARIA DE SOFTWARE',
    footerText: 'Synchro ALM Pro — Artefato Formal de Medição & Aceite Técnico',
    approvalTerms: 'Pelo presente instrumento, a CONTRATANTE atesta expressamente o pleno recebimento, homologação técnica e aceite formal dos requisitos de software e critérios de aceite descritos neste Relatório de Medição correspondentes à Feature / Marco acima especificado. Declara que os entregáveis foram devidamente verificados e aprovados pelo controle de qualidade (QA), em conformidade com as cláusulas contratuais, autorizando a emissão da Nota Fiscal de Serviços e o respectivo faturamento financeiro.',
    signeeContratadaTitle: 'PELA CONTRATADA (SYNCHRO)',
    signeeContratanteTitle: 'PELA CONTRATANTE (CLIENTE)',
    includeUserStory: true,
    includeAcceptanceCriteria: true,
    includeQaEvidence: true,
    includeSignatures: true,
    includeKpis: true,
    includeStatusBanner: true
  };

  function parseHexToRgb(hex) {
    let clean = (hex || '#0284c7').replace('#', '').trim();
    if (clean.length === 3) clean = clean.split('').map(c => c + c).join('');
    const num = parseInt(clean, 16);
    return [ (num >> 16) & 255, (num >> 8) & 255, num & 255 ];
  }
  const primRgb = parseHexToRgb(template.primaryColor);

  const doc = new jsPDFClass({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Cabeçalho Principal (com cor primária e logo customizáveis)
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 64, 'F');

  doc.setFillColor(primRgb[0], primRgb[1], primRgb[2]);
  doc.rect(0, 61, pageWidth, 3, 'F');

  let headerTextX = 36;
  if (template.logoUrl) {
    try {
      doc.addImage(template.logoUrl, 'PNG', 36, 13, 38, 38, undefined, 'FAST');
      headerTextX = 84;
    } catch(e) {
      console.warn('Erro ao inserir logo no PDF:', e);
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(primRgb[0], primRgb[1], primRgb[2]);
  doc.text((template.headerInstitution || 'SYNCHRO ALM PRO — PLATAFORMA DE ENGENHARIA').slice(0, 75), headerTextX, 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(template.docTitle && template.docTitle.length > 55 ? 10.5 : 12.5);
  doc.setTextColor(255, 255, 255);
  doc.text((template.docTitle || 'RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS').slice(0, 65), headerTextX, 40);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(148, 163, 184);
  doc.text((template.docSubtitle || 'Artefato Oficial de Comprovação de Entrega Técnica').slice(0, 85), headerTextX, 52);

  // 2. Quadro de Metadados do Projeto, Contrato e Partes
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(36, 76, pageWidth - 72, 74, 3, 3, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(36, 76, pageWidth - 72, 74, 3, 3, 'S');

  // Coluna Esquerda
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text('Projeto:', 46, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(`${project.code ? `[${project.code}] ` : ''}${project.name}`.slice(0, 45), 90, 92);

  doc.setFont('helvetica', 'bold');
  doc.text('Feature / Módulo:', 46, 107);
  doc.setFont('helvetica', 'normal');
  doc.text(featureLabel.slice(0, 38), 130, 107);

  doc.setFont('helvetica', 'bold');
  doc.text('Marco de Entrega:', 46, 122);
  doc.setFont('helvetica', 'normal');
  doc.text(milestoneName.slice(0, 38), 130, 122);

  doc.setFont('helvetica', 'bold');
  doc.text('Contratante / Cliente:', 46, 137);
  doc.setFont('helvetica', 'normal');
  doc.text(clientName.slice(0, 35), 145, 137);

  // Coluna Direita
  doc.setFont('helvetica', 'bold');
  doc.text('Ref. Contratual:', 310, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(contractRef.slice(0, 28), 390, 92);

  doc.setFont('helvetica', 'bold');
  doc.text('Data de Emissão:', 310, 107);
  doc.setFont('helvetica', 'normal');
  doc.text(issueDate, 395, 107);

  doc.setFont('helvetica', 'bold');
  doc.text('Responsável Técnico:', 310, 122);
  doc.setFont('helvetica', 'normal');
  doc.text(managerName.slice(0, 26), 415, 122);

  doc.setFont('helvetica', 'bold');
  doc.text('Fiscal do Contrato:', 310, 137);
  doc.setFont('helvetica', 'normal');
  doc.text(clientSignee.slice(0, 26), 405, 137);

  // 3. Indicadores de Medição & Aderência (Mini Cards - se ativado no template)
  let currentY = 158;
  if (template.includeKpis !== false) {
    const tileH = 38;
    const tileW = (pageWidth - 72 - 18) / 4;

    const metricsData = [
      { label: 'TOTAL REQUISITOS', val: `${totalInScope}`, color: [30, 41, 59] },
      { label: 'VALIDADOS QA', val: `${qaApprovedCount}`, color: [16, 185, 129] },
      { label: 'CRITÉRIOS BDD', val: `${bddCount}`, color: primRgb },
      { label: 'TAXA CONCLUSÃO', val: `${completionRate}%`, color: [168, 85, 247] }
    ];

    metricsData.forEach((m, idx) => {
      const x = 36 + idx * (tileW + 6);
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(x, currentY, tileW, tileH, 3, 3, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, currentY, tileW, tileH, 3, 3, 'S');

      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(100, 116, 139);
      doc.text(m.label, x + tileW / 2, currentY + 12, { align: 'center' });

      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(m.color[0], m.color[1], m.color[2]);
      doc.text(m.val, x + tileW / 2, currentY + 30, { align: 'center' });
    });
    currentY += 44;
  }

  // Banner de Status da Medição (se ativado no template)
  if (template.includeStatusBanner !== false) {
    const is100 = completionRate === 100;
    if (is100) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(16, 185, 129);
      doc.roundedRect(36, currentY, pageWidth - 72, 20, 3, 3, 'FD');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text('STATUS: 100% HOMOLOGADO & APROVADO PELO QA — APTO PARA EMISSÃO DE FATURA & ACEITE DEFINITIVO', pageWidth / 2, currentY + 13, { align: 'center' });
    } else {
      doc.setFillColor(254, 243, 199);
      doc.setDrawColor(245, 158, 11);
      doc.roundedRect(36, currentY, pageWidth - 72, 20, 3, 3, 'FD');
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(180, 83, 9);
      doc.text(`STATUS: MEDIÇÃO PARCIAL (${completionRate}% HOMOLOGADO) — COMPROVAÇÃO DE ENTREGA PROPORCIONAL`, pageWidth / 2, currentY + 13, { align: 'center' });
    }
    currentY += 26;
  }

  // 4. Tabela Estruturada de Requisitos & Critérios de Aceite via autoTable (Colunas Dinâmicas)
  const headRow = ['Identificador'];
  headRow.push(template.includeUserStory !== false ? 'Especificação & História de Usuário' : 'Especificação do Requisito');
  if (template.includeAcceptanceCriteria !== false) {
    headRow.push('Critérios de Aceite (BDD / Cenários)');
  }
  if (template.includeQaEvidence !== false) {
    headRow.push('Status de Validação QA');
  }

  const head = [headRow];
  const body = exportItems.map(item => {
    const r = item.req;
    const v = item.val;
    const idCell = `${r.code || 'RF'}\n${r.type === 'non-functional' ? 'RNF' : 'RF'}\n[${r.moscow || 'Must'}]`;
    
    let specCell = r.title || '-';
    if (template.includeUserStory !== false) {
      specCell += `\n\nUser Story:\n${r.userStory ? r.userStory : 'Não informada'}`;
    }

    const row = [idCell, specCell];

    if (template.includeAcceptanceCriteria !== false) {
      const bddCell = r.bdd && r.bdd.trim() ? r.bdd.trim() : 'Critérios de aceite não documentados formalmente.';
      row.push(bddCell);
    }

    if (template.includeQaEvidence !== false) {
      const qaCell = `${v.isValidated ? 'VALIDADO QA\nAprovado' : 'EM HOMOLOGAÇÃO'}\n\n${v.detailNote}\nDemandas: ${v.linkedTasks.length}\nTestes: ${v.linkedTests.length}`;
      row.push(qaCell);
    }

    return row;
  });

  const colStyles = {
    0: { cellWidth: 70, fontStyle: 'bold' }
  };
  if (template.includeAcceptanceCriteria !== false && template.includeQaEvidence !== false) {
    colStyles[1] = { cellWidth: 155 };
    colStyles[2] = { cellWidth: 178 };
    colStyles[3] = { cellWidth: 120 };
  } else if (template.includeAcceptanceCriteria !== false) {
    colStyles[1] = { cellWidth: 230 };
    colStyles[2] = { cellWidth: 223 };
  } else if (template.includeQaEvidence !== false) {
    colStyles[1] = { cellWidth: 310 };
    colStyles[2] = { cellWidth: 143 };
  } else {
    colStyles[1] = { cellWidth: 453 };
  }

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      head: head,
      body: body,
      startY: currentY + 6,
      margin: { top: 70, bottom: 40, left: 36, right: 36 },
      theme: 'grid',
      styles: {
        fontSize: 7.2,
        cellPadding: 5,
        textColor: [30, 41, 59],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
        overflow: 'linebreak',
        font: 'helvetica'
      },
      headStyles: {
        fillColor: primRgb,
        textColor: [248, 250, 252],
        fontStyle: 'bold',
        fontSize: 7.8
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: colStyles
    });

    let finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 16 : 450;
    if (finalY + 140 > pageHeight - 35) {
      doc.addPage();
      finalY = 50;
    }

    // 5. Termo de Aceite Formal & Autorização de Faturamento
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(36, finalY, pageWidth - 72, 48, 3, 3, 'F');
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(36, finalY, pageWidth - 72, 48, 3, 3, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    doc.text('TERMO FORMAL DE HOMOLOGAÇÃO, ACEITE E AUTORIZAÇÃO DE FATURAMENTO', 46, finalY + 13);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    const termo = template.approvalTerms || 'Pelo presente instrumento, a CONTRATANTE atesta expressamente o pleno recebimento, homologação técnica e aceite formal dos requisitos de software e critérios de aceite descritos neste Relatório de Medição correspondentes à Feature / Marco acima especificado. Declara que os entregáveis foram devidamente verificados e aprovados pelo controle de qualidade (QA), em conformidade com as cláusulas contratuais, autorizando a emissão da Nota Fiscal de Serviços e o respectivo faturamento financeiro.';
    const splitTermo = doc.splitTextToSize(termo, pageWidth - 92);
    doc.text(splitTermo, 46, finalY + 24);

    // 6. Campos Formais de Assinatura (se ativado no template)
    if (template.includeSignatures !== false) {
      const signY = finalY + 48 + 36;
      doc.setDrawColor(148, 163, 184);

      // Assinatura Contratada
      doc.line(48, signY, 260, signY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(template.signeeContratadaTitle || 'PELA CONTRATADA (SYNCHRO)', 154, signY + 11, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(managerName, 154, signY + 21, { align: 'center' });
      doc.text('Gestor de Projetos / Scrum Master', 154, signY + 30, { align: 'center' });
      doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 154, signY + 39, { align: 'center' });

      // Assinatura Contratante
      doc.line(335, signY, 547, signY);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(template.signeeContratanteTitle || 'PELA CONTRATANTE (CLIENTE)', 441, signY + 11, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(71, 85, 105);
      doc.text(clientSignee, 441, signY + 21, { align: 'center' });
      doc.text('Fiscal do Contrato / Responsável pelo Aceite', 441, signY + 30, { align: 'center' });
      doc.text('Data: _____ / _____ / _________', 441, signY + 39, { align: 'center' });
    }

    // Rodapé de Paginação e Autenticidade
    const totalPages = doc.internal.getNumberOfPages();
    const docHash = `DSQ-MED-${Date.now().toString(36).toUpperCase()}`;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(6.8);
      doc.setTextColor(148, 163, 184);
      doc.text(template.footerText || 'Synchro ALM Pro — Artefato Formal de Medição & Aceite Técnico de Entrega', 36, pageHeight - 16);
      doc.text(`Doc Ref: ${docHash} | Página ${i} de ${totalPages}`, pageWidth - 36, pageHeight - 16, { align: 'right' });
    }
  }

  const dateStr = new Date().toISOString().split('T')[0];
  const cleanFeature = featureLabel.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  const filename = `medicao_${project.code || 'proj'}_${cleanFeature}_${dateStr}.pdf`;
  doc.save(filename);
  showToast(`Relatório Formal de Medição gerado com sucesso via template "${template.name}"! Arquivo: ${filename}`);
};

window.printMeasurementReport = function() {
  const projectId = document.getElementById('measurement-project-select')?.value;
  const feature = document.getElementById('measurement-feature-select')?.value;
  const statusFilter = document.getElementById('measurement-status-filter')?.value || 'qa_approved';

  if (!projectId) {
    showToast('Selecione um projeto válido para visualização.');
    return;
  }

  const project = store.getProjectById(projectId);
  if (!project) return;

  let allReqsInScope = (store.state.requirements || []).filter(r => r.projectId === projectId);
  if (feature && feature !== 'all') {
    allReqsInScope = allReqsInScope.filter(r => r.feature === feature);
  }

  allReqsInScope.sort((a, b) => (a.code || '').localeCompare(b.code || '', undefined, { numeric: true }));

  const analyzed = allReqsInScope.map(r => ({
    req: r,
    val: getRequirementValidationStatus(r)
  }));

  let exportItems = analyzed;
  if (statusFilter === 'qa_approved') {
    exportItems = analyzed.filter(i => i.val.isValidated);
  }

  if (exportItems.length === 0) {
    showToast('Nenhum requisito no escopo selecionado para impressão.');
    return;
  }

  const totalInScope = analyzed.length;
  const qaApprovedCount = analyzed.filter(i => i.val.isValidated).length;
  const bddCount = analyzed.filter(i => i.val.hasBdd).length;
  const completionRate = totalInScope > 0 ? Math.round((qaApprovedCount / totalInScope) * 100) : 0;

  const clientName = document.getElementById('measurement-client-name')?.value.trim() || project.client || 'Empresa Contratante S.A.';
  const milestoneName = document.getElementById('measurement-milestone-name')?.value.trim() || (feature !== 'all' ? `Marco: ${feature}` : 'Marco de Entrega do Projeto');
  const contractRef = document.getElementById('measurement-contract-ref')?.value.trim() || `CTR-${project.code || 'DEV'}-MED01`;
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const managerName = document.getElementById('measurement-manager-name')?.value.trim() || (currentUser ? currentUser.name : 'Gestor de Projetos');
  const clientSignee = document.getElementById('measurement-client-signee')?.value.trim() || 'Product Owner / Fiscal do Contrato (Cliente)';
  const featureLabel = (feature && feature !== 'all') ? feature : 'Todas as Features do Escopo';
  const issueDate = new Date().toLocaleString('pt-BR');

  // Resgata o template de documento selecionado
  const templateId = document.getElementById('measurement-template-select')?.value;
  const template = (templateId ? store.getTemplateById(templateId) : null) || store.getDefaultTemplate() || {
    name: 'Padrão Corporativo',
    primaryColor: '#0284c7',
    docTitle: 'RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS',
    docSubtitle: 'Artefato Oficial de Comprovação de Entrega Técnica para Fins de Faturamento & Aceite',
    headerInstitution: 'SYNCHRO ALM PRO — PLATAFORMA INTEGRADA DE ENGENHARIA DE SOFTWARE',
    footerText: 'Synchro ALM Pro — Artefato Formal de Medição & Aceite Técnico',
    approvalTerms: 'Pelo presente instrumento, a CONTRATANTE atesta expressamente o pleno recebimento, homologação técnica e aceite formal dos requisitos de software e critérios de aceite descritos neste Relatório de Medição correspondentes à Feature / Marco acima especificado. Declara que os entregáveis foram devidamente verificados e aprovados pelo controle de qualidade (QA), em conformidade com as especificações contratadas, autorizando a emissão da respectiva Nota Fiscal de Serviços para faturamento.',
    signeeContratadaTitle: 'PELA CONTRATADA (SYNCHRO)',
    signeeContratanteTitle: 'PELA CONTRATANTE (CLIENTE)',
    includeUserStory: true,
    includeAcceptanceCriteria: true,
    includeQaEvidence: true,
    includeSignatures: true,
    includeKpis: true,
    includeStatusBanner: true
  };

  const primColor = template.primaryColor || '#0284c7';

  const rowsHtml = exportItems.map(item => {
    let cellsHtml = `
      <td style="font-weight: 700; width: 85px;">
        <div>${escapeHtml(item.req.code)}</div>
        <small style="color: #64748b;">${item.req.type === 'non-functional' ? 'RNF' : 'RF'} [${item.req.moscow || 'Must'}]</small>
      </td>
      <td>
        <strong>${escapeHtml(item.req.title)}</strong>
        ${template.includeUserStory !== false ? `
          <div style="margin-top: 4px; font-size: 0.8rem; color: #475569;">
            <em>User Story:</em> ${escapeHtml(item.req.userStory || 'Não documentada')}
          </div>
        ` : ''}
      </td>
    `;

    if (template.includeAcceptanceCriteria !== false) {
      cellsHtml += `
        <td style="white-space: pre-wrap; font-family: monospace; font-size: 0.78rem; color: #1e293b; background: #f8fafc;">${escapeHtml(item.req.bdd || 'Critérios não documentados.')}</td>
      `;
    }

    if (template.includeQaEvidence !== false) {
      cellsHtml += `
        <td style="width: 140px;">
          <span style="font-weight: 700; color: ${item.val.isValidated ? '#059669' : '#d97706'};">
            ${item.val.isValidated ? '✓ VALIDADO QA' : 'EM HOMOLOGAÇÃO'}
          </span>
          <div style="font-size: 0.72rem; color: #64748b; margin-top: 3px;">${escapeHtml(item.val.detailNote)}</div>
          <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 2px;">Demandas: ${item.val.linkedTasks.length} | Testes: ${item.val.linkedTests.length}</div>
        </td>
      `;
    }

    return `<tr>${cellsHtml}</tr>`;
  }).join('');

  let tableHeaderHtml = `
    <tr>
      <th>Identificador</th>
      <th>${template.includeUserStory !== false ? 'Especificação & User Story' : 'Especificação do Requisito'}</th>
      ${template.includeAcceptanceCriteria !== false ? '<th>Critérios de Aceite (BDD)</th>' : ''}
      ${template.includeQaEvidence !== false ? '<th>Status de Validação QA</th>' : ''}
    </tr>
  `;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    showToast('Aviso: Pop-up bloqueado. Permita pop-ups para imprimir o relatório.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>${escapeHtml(template.docTitle)} - ${escapeHtml(project.name)}</title>
      <style>
        @page { size: A4 portrait; margin: 15mm; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; font-size: 12px; line-height: 1.4; background: #fff; }
        .header { border-bottom: 3px solid ${primColor}; padding-bottom: 12px; margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; }
        .header-content { flex: 1; }
        .header-logo { max-height: 48px; max-width: 120px; object-fit: contain; margin-left: 15px; }
        .brand { font-size: 11px; font-weight: 800; color: ${primColor}; text-transform: uppercase; letter-spacing: 0.5px; }
        .title { font-size: 18px; font-weight: 800; color: #0f172a; margin: 4px 0 2px 0; }
        .subtitle { font-size: 11px; color: #64748b; margin: 0; }
        .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 15px; font-size: 11px; }
        .meta-row { display: flex; gap: 6px; }
        .meta-label { font-weight: 700; color: #334155; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 15px; }
        .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px; text-align: center; }
        .kpi-title { font-size: 9px; font-weight: 700; color: #64748b; text-transform: uppercase; }
        .kpi-val { font-size: 18px; font-weight: 800; margin-top: 2px; }
        .banner { background: #ecfdf5; border: 1px solid #10b981; color: #065f46; border-radius: 6px; padding: 8px 12px; font-weight: 700; font-size: 11px; text-align: center; margin-bottom: 15px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background: ${primColor}; color: #fff; font-weight: 700; text-align: left; padding: 8px; border: 1px solid ${primColor}; font-size: 10px; }
        td { border: 1px solid #e2e8f0; padding: 8px; vertical-align: top; }
        tr:nth-child(even) td { background: #fcfdfe; }
        .termo-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 30px; font-size: 10px; color: #334155; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 40px; text-align: center; }
        .sig-line { border-top: 1px solid #64748b; margin-bottom: 6px; }
        .sig-title { font-weight: 800; font-size: 11px; color: #0f172a; }
        .sig-sub { font-size: 10px; color: #64748b; }
        .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 9px; color: #94a3b8; display: flex; justify-content: space-between; }
        @media print {
          body { padding: 0; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div class="no-print" style="margin-bottom: 15px; text-align: right;">
        <button onclick="window.print()" style="padding: 8px 16px; background: ${primColor}; color: #fff; border: none; border-radius: 4px; font-weight: 700; cursor: pointer;">🖨️ Imprimir / Salvar em PDF</button>
      </div>

      <div class="header">
        <div class="header-content">
          <div class="brand">${escapeHtml(template.headerInstitution || 'Synchro ALM Pro')}</div>
          <h1 class="title">${escapeHtml(template.docTitle)}</h1>
          <p class="subtitle">${escapeHtml(template.docSubtitle || '')}</p>
        </div>
        ${template.logoUrl ? `<img src="${template.logoUrl}" class="header-logo" alt="Logo">` : ''}
      </div>

      <div class="meta-box">
        <div>
          <div class="meta-row"><span class="meta-label">Projeto:</span> <span>${escapeHtml(project.code ? `[${project.code}] ` : '')}${escapeHtml(project.name)}</span></div>
          <div class="meta-row"><span class="meta-label">Feature / Módulo:</span> <span>${escapeHtml(featureLabel)}</span></div>
          <div class="meta-row"><span class="meta-label">Marco de Entrega:</span> <span>${escapeHtml(milestoneName)}</span></div>
          <div class="meta-row"><span class="meta-label">Cliente / Contratante:</span> <span>${escapeHtml(clientName)}</span></div>
        </div>
        <div>
          <div class="meta-row"><span class="meta-label">Ref. Contratual:</span> <span>${escapeHtml(contractRef)}</span></div>
          <div class="meta-row"><span class="meta-label">Data de Emissão:</span> <span>${issueDate}</span></div>
          <div class="meta-row"><span class="meta-label">Responsável Técnico:</span> <span>${escapeHtml(managerName)}</span></div>
          <div class="meta-row"><span class="meta-label">Fiscal do Contrato:</span> <span>${escapeHtml(clientSignee)}</span></div>
        </div>
      </div>

      ${template.includeKpis !== false ? `
        <div class="kpi-row">
          <div class="kpi-box">
            <div class="kpi-title">Total Requisitos</div>
            <div class="kpi-val" style="color: #0f172a;">${totalInScope}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Validados QA</div>
            <div class="kpi-val" style="color: #059669;">${qaApprovedCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Critérios BDD</div>
            <div class="kpi-val" style="color: ${primColor};">${bddCount}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-title">Taxa Conclusão</div>
            <div class="kpi-val" style="color: #9333ea;">${completionRate}%</div>
          </div>
        </div>
      ` : ''}

      ${template.includeStatusBanner !== false ? `
        <div class="banner">
          ${completionRate === 100 
            ? 'STATUS: 100% HOMOLOGADO & APROVADO PELO QA — APTO PARA FATURAMENTO INTEGRAL & ACEITE DEFINITIVO' 
            : `STATUS: MEDIÇÃO PARCIAL (${completionRate}% HOMOLOGADO) — COMPROVAÇÃO DE ENTREGA PROPORCIONAL`}
        </div>
      ` : ''}

      <table>
        <thead>
          ${tableHeaderHtml}
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="termo-box">
        <strong>TERMO FORMAL DE HOMOLOGAÇÃO, ACEITE E AUTORIZAÇÃO DE FATURAMENTO</strong><br>
        ${escapeHtml(template.approvalTerms)}
      </div>

      ${template.includeSignatures !== false ? `
        <div class="signatures">
          <div>
            <div class="sig-line"></div>
            <div class="sig-title">${escapeHtml(template.signeeContratadaTitle || 'PELA CONTRATADA (SYNCHRO)')}</div>
            <div class="sig-sub">${escapeHtml(managerName)}</div>
            <div class="sig-sub">Gestor de Projetos / Scrum Master</div>
            <div class="sig-sub">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
          </div>
          <div>
            <div class="sig-line"></div>
            <div class="sig-title">${escapeHtml(template.signeeContratanteTitle || 'PELA CONTRATANTE (CLIENTE)')}</div>
            <div class="sig-sub">${escapeHtml(clientSignee)}</div>
            <div class="sig-sub">Fiscal do Contrato / PO Cliente</div>
            <div class="sig-sub">Data: _____ / _____ / _________</div>
          </div>
        </div>
      ` : ''}

      <div class="footer">
        <span>${escapeHtml(template.footerText || 'Synchro ALM Pro — Artefato Formal de Medição & Aceite Técnico')}</span>
        <span>Código de Autenticidade: DSQ-MED-${Date.now().toString(36).toUpperCase()}</span>
      </div>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
};

window.openMeasurementReportModal = openMeasurementReportModal;
window.populateMeasurementFeatures = populateMeasurementFeatures;
window.updateMeasurementReportPreview = updateMeasurementReportPreview;
window.getRequirementValidationStatus = getRequirementValidationStatus;

// ==============================================================================
// 4.3 Gestão de Metas & Métricas de Promoção (Promotion Goals Engine - Admin RBAC)
// ==============================================================================

window.renderGoals = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    return;
  }

  const seniorityFilter = document.getElementById('goals-filter-seniority')?.value || 'all';
  const categoryFilter = document.getElementById('goals-filter-category')?.value || 'all';
  const search = (document.getElementById('goals-search-input')?.value || '').trim().toLowerCase();

  const allGoals = typeof store.getGoals === 'function' ? store.getGoals() : [];

  // 1. Atualizar contadores e cards de resumo
  const totalEl = document.getElementById('goals-stat-total');
  const plenoEl = document.getElementById('goals-stat-pleno');
  const seniorEl = document.getElementById('goals-stat-senior');
  const leadEl = document.getElementById('goals-stat-lead');
  const navCounter = document.getElementById('counter-nav-goals');

  if (totalEl) totalEl.textContent = allGoals.length;
  if (plenoEl) plenoEl.textContent = allGoals.filter(g => g.targetSeniority === 'Pleno').length;
  if (seniorEl) seniorEl.textContent = allGoals.filter(g => g.targetSeniority === 'Sênior').length;
  if (leadEl) leadEl.textContent = allGoals.filter(g => g.targetSeniority === 'Tech Lead').length;
  if (navCounter) navCounter.textContent = allGoals.filter(g => g.isActive).length;

  // 2. Filtragem de Metas
  const filteredGoals = allGoals.filter(goal => {
    if (seniorityFilter !== 'all' && goal.targetSeniority !== seniorityFilter) return false;
    if (categoryFilter !== 'all' && goal.category !== categoryFilter) return false;
    if (search) {
      const t = (goal.title || '').toLowerCase();
      const d = (goal.description || '').toLowerCase();
      const m = (goal.metricKey || '').toLowerCase();
      const s = (goal.targetSeniority || '').toLowerCase();
      if (!t.includes(search) && !d.includes(search) && !m.includes(search) && !s.includes(search)) return false;
    }
    return true;
  });

  // 3. Renderizar Grid de Cards
  const container = document.getElementById('goals-cards-container');
  if (!container) return;

  if (filteredGoals.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="padding: 3rem; text-align: center; color: var(--text-muted); grid-column: 1 / -1;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🎯</div>
        <p style="font-size: 1.1rem; margin-bottom: 0.85rem; color: var(--text-main);">Nenhuma meta de promoção encontrada com os filtros selecionados.</p>
        <div style="display: flex; gap: 0.75rem; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary btn-sm" onclick="openGoalModalForCreate()">+ Cadastrar Nova Meta</button>
          <button class="btn btn-secondary btn-sm" onclick="resetDefaultGoalsAction()">🔄 Restaurar Matriz Padrão</button>
        </div>
      </div>
    `;
    return;
  }

  const categoryLabels = {
    complexity: '🚀 Complexidade Técnica',
    volume: '📦 Volume & Entregas',
    qa: '🧪 Qualidade & QA',
    hours: '⏱️ Horas & Prazos',
    skills: '🧠 Habilidades & Mentoria'
  };

  const metricKeyLabels = {
    high_tasks: 'Demandas de Alta Complexidade',
    med_tasks: 'Demandas de Média Complexidade',
    total_tasks: 'Volume Total de Demandas Concluídas',
    high_percent: 'Percentual em Alta Complexidade',
    qa_rate: 'Taxa Mínima de Aprovação em QA',
    hours_variance: 'Desvio Máximo de Horas Apontadas',
    custom: 'Critério Qualitativo do Gestor'
  };

  let html = '';
  filteredGoals.forEach(goal => {
    let seniorityClass = 'seniority-pleno';
    let seniorityIcon = '🌱';
    let seniorityLabel = 'Requisito Pleno';

    if (goal.targetSeniority === 'Sênior') {
      seniorityClass = 'seniority-senior';
      seniorityIcon = '⭐';
      seniorityLabel = 'Requisito Sênior';
    } else if (goal.targetSeniority === 'Tech Lead') {
      seniorityClass = 'seniority-lead';
      seniorityIcon = '👑';
      seniorityLabel = 'Requisito Tech Lead';
    } else if (goal.targetSeniority === 'Todos') {
      seniorityClass = 'seniority-todos';
      seniorityIcon = '🌐';
      seniorityLabel = 'Todos os Níveis';
    }

    const catLabel = categoryLabels[goal.category] || '🎯 Desempenho';
    const metricLabel = metricKeyLabels[goal.metricKey] || goal.metricKey;
    const isInactive = !goal.isActive;
    const weightVal = parseInt(goal.weight, 10) || 2;
    const stars = '⭐'.repeat(Math.min(3, Math.max(1, weightVal)));
    const weightText = `${stars} Peso ${weightVal}x`;

    html += `
      <div class="goal-card glass-panel ${isInactive ? 'goal-inactive' : ''}" id="goal-card-${goal.id}">
        <div class="goal-card-header">
          <div class="goal-header-left">
            <span class="goal-seniority-badge ${seniorityClass}">
              ${seniorityIcon} ${seniorityLabel}
            </span>
            <span class="goal-category-tag">
              ${catLabel}
            </span>
          </div>
          <div>
            ${goal.isActive 
              ? '<span class="goal-status-pill goal-status-active">● Ativa</span>' 
              : '<span class="goal-status-pill goal-status-paused">⏸️ Pausada</span>'
            }
          </div>
        </div>

        <div>
          <h3 class="goal-title-h3">${escapeHtml(goal.title)}</h3>
          <p class="goal-desc-p" style="margin-top: 0.35rem;">${escapeHtml(goal.description || 'Critério calibrado para avaliação de prontidão de promoção.')}</p>
        </div>

        <div class="goal-benchmark-box">
          <div class="goal-benchmark-left">
            <span class="goal-benchmark-label">${metricLabel}</span>
            <div class="goal-benchmark-target">
              ${goal.metricKey === 'hours_variance' ? '≤' : '≥'} ${goal.targetValue}
              <small>${escapeHtml(goal.targetUnit || 'unidades')}</small>
            </div>
          </div>
          <div class="goal-weight-chip" title="Peso de relevância no Score de Prontidão (%)">
            ${weightText}
          </div>
        </div>

        <div class="goal-card-footer">
          <button class="btn btn-ghost btn-sm" onclick="toggleGoalActive('${goal.id}')" title="${goal.isActive ? 'Pausar esta meta (não será computada no score)' : 'Ativar esta meta no cálculo de promoção'}">
            ${goal.isActive ? '⏸️ Pausar' : '▶️ Ativar'}
          </button>
          <div class="goal-actions-group">
            <button class="card-btn-action" onclick="openGoalModalForEdit('${goal.id}')" title="Editar Meta e Parâmetros">
              ✏️ Editar
            </button>
            <button class="card-btn-action btn-del" onclick="confirmDeleteGoal('${goal.id}', '${escapeHtml(goal.title)}')" title="Excluir Meta">
              🗑️
            </button>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
};

window.openGoalModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem cadastrar metas.');
    return;
  }

  const editIdInput = document.getElementById('goal-id-edit');
  const titleEl = document.getElementById('modal-goal-title');
  const btnSave = document.getElementById('btn-save-goal');
  const titleInput = document.getElementById('goal-title');
  const senInput = document.getElementById('goal-target-seniority');
  const catInput = document.getElementById('goal-category');
  const keyInput = document.getElementById('goal-metric-key');
  const valInput = document.getElementById('goal-target-value');
  const unitInput = document.getElementById('goal-target-unit');
  const weightInput = document.getElementById('goal-weight');
  const activeInput = document.getElementById('goal-is-active');
  const descInput = document.getElementById('goal-description');

  if (editIdInput) editIdInput.value = '';
  if (titleEl) titleEl.textContent = '🎯 Cadastrar Nova Meta de Promoção';
  if (btnSave) btnSave.textContent = 'Salvar Meta';
  if (titleInput) titleInput.value = '';
  if (senInput) senInput.value = 'Pleno';
  if (catInput) catInput.value = 'complexity';
  if (keyInput) keyInput.value = 'high_tasks';
  if (valInput) valInput.value = '2';
  if (unitInput) unitInput.value = 'demandas';
  if (weightInput) weightInput.value = '2';
  if (activeInput) activeInput.checked = true;
  if (descInput) descInput.value = '';

  openModal('modal-goal');
};

window.openGoalModalForEdit = function(goalId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem editar metas.');
    return;
  }

  const goal = store.getGoalById(goalId);
  if (!goal) {
    showToast('Meta não encontrada.');
    return;
  }

  const editIdInput = document.getElementById('goal-id-edit');
  const titleEl = document.getElementById('modal-goal-title');
  const btnSave = document.getElementById('btn-save-goal');
  const titleInput = document.getElementById('goal-title');
  const senInput = document.getElementById('goal-target-seniority');
  const catInput = document.getElementById('goal-category');
  const keyInput = document.getElementById('goal-metric-key');
  const valInput = document.getElementById('goal-target-value');
  const unitInput = document.getElementById('goal-target-unit');
  const weightInput = document.getElementById('goal-weight');
  const activeInput = document.getElementById('goal-is-active');
  const descInput = document.getElementById('goal-description');

  if (editIdInput) editIdInput.value = goal.id;
  if (titleEl) titleEl.textContent = '✏️ Editar Meta de Promoção';
  if (btnSave) btnSave.textContent = 'Atualizar Meta';
  if (titleInput) titleInput.value = goal.title || '';
  if (senInput) senInput.value = goal.targetSeniority || 'Pleno';
  if (catInput) catInput.value = goal.category || 'complexity';
  if (keyInput) keyInput.value = goal.metricKey || 'high_tasks';
  if (valInput) valInput.value = goal.targetValue !== undefined ? goal.targetValue : 1;
  if (unitInput) unitInput.value = goal.targetUnit || 'demandas';
  if (weightInput) weightInput.value = String(goal.weight || 2);
  if (activeInput) activeInput.checked = goal.isActive !== false;
  if (descInput) descInput.value = goal.description || '';

  openModal('modal-goal');
};

window.handleGoalMetricKeyChange = function() {
  const key = document.getElementById('goal-metric-key')?.value;
  const catEl = document.getElementById('goal-category');
  const unitEl = document.getElementById('goal-target-unit');
  const valEl = document.getElementById('goal-target-value');
  if (!key) return;

  if (key === 'high_tasks') {
    if (catEl) catEl.value = 'complexity';
    if (unitEl) unitEl.value = 'demandas';
    if (valEl && !valEl.value) valEl.value = '2';
  } else if (key === 'med_tasks') {
    if (catEl) catEl.value = 'complexity';
    if (unitEl) unitEl.value = 'demandas';
    if (valEl && !valEl.value) valEl.value = '3';
  } else if (key === 'total_tasks') {
    if (catEl) catEl.value = 'volume';
    if (unitEl) unitEl.value = 'demandas';
    if (valEl && !valEl.value) valEl.value = '4';
  } else if (key === 'high_percent') {
    if (catEl) catEl.value = 'complexity';
    if (unitEl) unitEl.value = '%';
    if (valEl && !valEl.value) valEl.value = '30';
  } else if (key === 'qa_rate') {
    if (catEl) catEl.value = 'qa';
    if (unitEl) unitEl.value = '%';
    if (valEl && !valEl.value) valEl.value = '85';
  } else if (key === 'hours_variance') {
    if (catEl) catEl.value = 'hours';
    if (unitEl) unitEl.value = '%';
    if (valEl && !valEl.value) valEl.value = '15';
  } else if (key === 'custom') {
    if (catEl) catEl.value = 'skills';
    if (unitEl) unitEl.value = 'pts';
    if (valEl && !valEl.value) valEl.value = '100';
  }
};

window.saveGoalModal = async function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem gerenciar metas de promoção.');
    return;
  }

  const editId = document.getElementById('goal-id-edit')?.value;
  const title = (document.getElementById('goal-title')?.value || '').trim();
  const targetSeniority = document.getElementById('goal-target-seniority')?.value || 'Pleno';
  const category = document.getElementById('goal-category')?.value || 'complexity';
  const metricKey = document.getElementById('goal-metric-key')?.value || 'high_tasks';
  const targetValue = parseFloat(document.getElementById('goal-target-value')?.value) || 0;
  const targetUnit = (document.getElementById('goal-target-unit')?.value || 'demandas').trim();
  const weight = parseInt(document.getElementById('goal-weight')?.value, 10) || 2;
  const isActive = document.getElementById('goal-is-active')?.checked ? 1 : 0;
  const description = (document.getElementById('goal-description')?.value || '').trim();

  if (!title) {
    showToast('Por favor, informe o título da meta.');
    return;
  }

  const payload = {
    title,
    targetSeniority,
    category,
    metricKey,
    targetValue,
    targetUnit,
    weight,
    isActive,
    description
  };

  if (editId) {
    await store.updateGoal(editId, payload);
    showToast(`Meta "${title}" atualizada com sucesso!`);
  } else {
    await store.addGoal(payload);
    showToast(`Meta "${title}" cadastrada com sucesso!`);
  }

  closeModal('modal-goal');
  renderGoals();
  updateSidebarCounters();

  const currentDev = store.getMemberById(store.selectedDevId) || store.getTeamMembers()[0];
  if (currentDev && typeof renderPerformance === 'function') {
    renderPerformance();
  }
};

window.toggleGoalActive = async function(goalId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem pausar/ativar metas.');
    return;
  }

  const goal = store.getGoalById(goalId);
  if (!goal) return;

  const newActive = !goal.isActive;
  await store.updateGoal(goalId, { isActive: newActive });
  showToast(`Meta "${goal.title}" ${newActive ? 'ativada' : 'pausada'} com sucesso.`);
  renderGoals();
  updateSidebarCounters();

  if (typeof renderPerformance === 'function') {
    renderPerformance();
  }
};

window.confirmDeleteGoal = async function(goalId, title) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem excluir metas.');
    return;
  }

  if (confirm(`Tem certeza que deseja excluir a meta "${title}"?\n\nEsta alteração impactará imediatamente os cálculos de promoção dos desenvolvedores.`)) {
    await store.deleteGoal(goalId);
    showToast(`Meta "${title}" excluída com sucesso.`);
    renderGoals();
    updateSidebarCounters();

    if (typeof renderPerformance === 'function') {
      renderPerformance();
    }
  }
};

window.resetDefaultGoalsAction = async function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('Apenas administradores podem restaurar metas.');
    return;
  }

  if (confirm('Deseja restaurar as 8 metas padrão recomendadas para avaliação dos desenvolvedores?\n\nIsso recriará as métricas calibradas para Pleno, Sênior e Tech Lead.')) {
    await store.resetDefaultGoals();
    showToast('Metas padrão recomendadas restauradas com sucesso!');
    renderGoals();
    updateSidebarCounters();

    if (typeof renderPerformance === 'function') {
      renderPerformance();
    }
  }
};

function updateSidebarCounters() {
  const projCounter = document.getElementById('counter-nav-projects');
  const reqCounter = document.getElementById('counter-nav-req');
  const taskCounter = document.getElementById('counter-nav-tasks');
  const teamCounter = document.getElementById('counter-nav-team');
  const testCounter = document.getElementById('counter-nav-tests');
  const govCounter = document.getElementById('counter-nav-governance');
  const auditCounter = document.getElementById('counter-nav-audit');

  if (projCounter) projCounter.textContent = store.state.projects.length;
  if (reqCounter) reqCounter.textContent = store.state.requirements.length;
  if (taskCounter) taskCounter.textContent = store.state.tasks.length;
  if (teamCounter) teamCounter.textContent = store.state.teamMembers.length;
  if (testCounter) testCounter.textContent = store.state.testCases.length;
  if (govCounter && typeof authStore !== 'undefined') {
    govCounter.textContent = authStore.getUsers().length;
  }
  if (auditCounter) {
    auditCounter.textContent = store.auditLogs ? `${store.auditLogs.length}` : '0';
  }
  const goalsCounter = document.getElementById('counter-nav-goals');
  if (goalsCounter) {
    const activeCount = store.state.goals ? store.state.goals.filter(g => g.isActive).length : 0;
    goalsCounter.textContent = activeCount > 0 ? `${activeCount}` : 'Admin';
  }
  const careerCounter = document.getElementById('counter-nav-career');
  if (careerCounter) {
    const trackCount = typeof careerTracksData !== 'undefined' ? Object.keys(careerTracksData).length : 5;
    careerCounter.textContent = `${trackCount} Trilhas`;
  }
  const tplCounter = document.getElementById('counter-nav-templates');
  if (tplCounter && typeof store !== 'undefined' && typeof store.getDocumentTemplates === 'function') {
    tplCounter.textContent = store.getDocumentTemplates().length;
  }
  const statTotalTpl = document.getElementById('badge-stat-total-templates');
  if (statTotalTpl && typeof store !== 'undefined' && typeof store.getDocumentTemplates === 'function') {
    statTotalTpl.textContent = `${store.getDocumentTemplates().length} Modelos Cadastrados`;
  }
  const apfCounter = document.getElementById('counter-nav-apf');
  if (apfCounter && typeof store !== 'undefined') {
    const ifpugPf = (store.state.apfItems || []).reduce((acc, it) => acc + (parseFloat(it.finalPf) || 0), 0);
    const inmPf = (store.state.apfInmItems || []).reduce((acc, it) => acc + (parseFloat(it.calculatedPf) || 0), 0);
    const totalGlobal = Math.round((ifpugPf + inmPf) * 10) / 10;
    apfCounter.textContent = `${totalGlobal} PF`;
  }
}

function switchView(viewName) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (viewName === 'goals' && currentRole !== 'admin') {
    showToast('Acesso restrito: a gestão de metas é visível apenas para o Administrador do Sistema.');
    const fallbackView = perms.allowedViews.includes('kanban') ? 'kanban' : perms.allowedViews[0];
    switchView(fallbackView);
    return;
  }

  if (viewName === 'audit' && currentRole !== 'admin') {
    showToast('Acesso restrito: a ferramenta de auditoria é visível apenas para o Administrador do Sistema.');
    const fallbackView = perms.allowedViews.includes('kanban') ? 'kanban' : perms.allowedViews[0];
    switchView(fallbackView);
    return;
  }

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
  if (viewName === 'performance') renderPerformance();
  if (viewName === 'goals') renderGoals();
  if (viewName === 'audit') refreshAuditLogsUI();
  if (viewName === 'career') renderCareer();
  if (viewName === 'templates') renderTemplates();
  if (viewName === 'apf') renderApf();
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
    { id: 'nav-doc-templates', view: 'templates' },
    { id: 'nav-apf', view: 'apf' },
    { id: 'nav-kanban', view: 'kanban' },
    { id: 'nav-team', view: 'team' },
    { id: 'nav-testing', view: 'testing' },
    { id: 'nav-governance', view: 'governance' },
    { id: 'nav-performance', view: 'performance' },
    { id: 'nav-goals', view: 'goals' },
    { id: 'nav-audit', view: 'audit' },
    { id: 'nav-career', view: 'career' }
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
  const itemApf = document.getElementById('action-new-apf');
  const itemTest = document.getElementById('action-new-test');
  const itemMember = document.getElementById('action-new-member');

  if (itemProject) itemProject.style.display = perms.canCreateProject ? 'flex' : 'none';
  if (itemTask) itemTask.style.display = perms.canCreateTask ? 'flex' : 'none';
  if (itemReq) itemReq.style.display = perms.canCreateReq ? 'flex' : 'none';
  if (itemApf) itemApf.style.display = perms.canManageApf ? 'flex' : 'none';
  if (itemTest) itemTest.style.display = perms.canCreateTest ? 'flex' : 'none';
  if (itemMember) itemMember.style.display = perms.canManageTeam ? 'flex' : 'none';

  // 2. Botões de Ação Direta nas Telas
  const btnProj = document.getElementById('btn-open-project-modal');
  const btnTask = document.getElementById('btn-open-task-modal');
  const btnReq = document.getElementById('btn-open-req-modal');
  const btnApf = document.getElementById('btn-open-apf-modal');
  const btnMember = document.getElementById('btn-open-member-modal');
  const btnTest = document.getElementById('btn-open-test-modal');
  const btnRunTests = document.getElementById('btn-run-all-tests');
  const btnMeasurement = document.getElementById('btn-open-measurement-modal');
  const btnQuickTpl = document.getElementById('btn-quick-templates');
  const btnTpl = document.getElementById('btn-open-template-modal');
  const btnResetTpl = document.getElementById('btn-reset-default-templates');

  if (btnProj) btnProj.style.display = perms.canCreateProject ? 'inline-flex' : 'none';
  if (btnTask) btnTask.style.display = perms.canCreateTask ? 'inline-flex' : 'none';
  if (btnReq) btnReq.style.display = perms.canCreateReq ? 'inline-flex' : 'none';
  if (btnApf) btnApf.style.display = perms.canManageApf ? 'inline-flex' : 'none';
  if (btnMember) btnMember.style.display = perms.canManageTeam ? 'inline-flex' : 'none';
  if (btnTest) btnTest.style.display = perms.canCreateTest ? 'inline-flex' : 'none';
  if (btnMeasurement) btnMeasurement.style.display = 'inline-flex';
  if (btnQuickTpl) btnQuickTpl.style.display = perms.canManageTemplates ? 'inline-flex' : 'none';
  if (btnTpl) btnTpl.style.display = perms.canManageTemplates ? 'inline-flex' : 'none';
  if (btnResetTpl) btnResetTpl.style.display = perms.canManageTemplates ? 'inline-flex' : 'none';
  const btnCareerAdmin = document.getElementById('btn-open-career-modal');
  if (btnCareerAdmin) {
    btnCareerAdmin.style.display = (roleKey === 'admin') ? 'inline-flex' : 'none';
  }

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
  if (typeof renderCareerNav === 'function') {
    renderCareerNav();
  }
  if (typeof populateSimulatorRoleOptions === 'function') {
    populateSimulatorRoleOptions();
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

function getSpecialtyInfo(roleKey) {
  const key = (roleKey || '').toLowerCase();
  switch (key) {
    case 'frontend':
    case 'front':
      return { 
        key: 'frontend', 
        label: 'Front-end', 
        shortLabel: 'Front', 
        icon: '🎨', 
        tagClass: 'role-front', 
        borderClass: 'task-front', 
        color: 'var(--front-accent, #06b6d4)' 
      };
    case 'backend':
    case 'back':
      return { 
        key: 'backend', 
        label: 'Back-end', 
        shortLabel: 'Back', 
        icon: '⚙️', 
        tagClass: 'role-back', 
        borderClass: 'task-back', 
        color: 'var(--back-accent, #10b981)' 
      };
    case 'fullstack':
    case 'full':
      return { 
        key: 'fullstack', 
        label: 'Full-Stack', 
        shortLabel: 'Full-Stack', 
        icon: '🌐', 
        tagClass: 'role-fullstack', 
        borderClass: 'task-fullstack', 
        color: 'var(--fullstack-accent, #818cf8)' 
      };
    case 'dba':
    case 'database':
    case 'dados':
      return { 
        key: 'dba', 
        label: 'DBA / Banco de Dados', 
        shortLabel: 'DBA', 
        icon: '🗄️', 
        tagClass: 'role-dba', 
        borderClass: 'task-dba', 
        color: 'var(--dba-accent, #f472b6)' 
      };
    case 'analyst':
    case 'requisitos':
    case 'requirements':
    case 'produto':
      return { 
        key: 'analyst', 
        label: 'Analista de Requisitos / Produto', 
        shortLabel: 'Requisitos', 
        icon: '📋', 
        tagClass: 'role-analyst', 
        borderClass: 'task-analyst', 
        color: 'var(--analyst-accent, #a78bfa)' 
      };
    case 'qa':
    case 'testing':
    case 'testes':
      return { 
        key: 'qa', 
        label: 'QA / Testes', 
        shortLabel: 'QA', 
        icon: '🧪', 
        tagClass: 'role-qa', 
        borderClass: 'task-qa', 
        color: 'var(--qa-accent, #fbbf24)' 
      };
    case 'devops':
    case 'infra':
    case 'sre':
      return { 
        key: 'devops', 
        label: 'DevOps / Infra', 
        shortLabel: 'DevOps', 
        icon: '🚀', 
        tagClass: 'role-devops', 
        borderClass: 'task-devops', 
        color: 'var(--devops-accent, #fb923c)' 
      };
    default:
      if (typeof careerTracksData !== 'undefined' && careerTracksData[key]) {
        const c = careerTracksData[key];
        return { 
          key: c.id || key, 
          label: c.roleName, 
          shortLabel: c.discipline || c.roleName, 
          icon: c.icon || '💻', 
          tagClass: 'role-back', 
          borderClass: 'task-back', 
          color: 'var(--accent-primary, #6366f1)' 
        };
      }
      return { 
        key: roleKey || 'backend', 
        label: roleKey || 'Geral', 
        shortLabel: roleKey || 'Dev', 
        icon: '💻', 
        tagClass: 'role-back', 
        borderClass: 'task-back', 
        color: 'var(--accent-primary, #6366f1)' 
      };
  }
}
window.getSpecialtyInfo = getSpecialtyInfo;

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
  } else if (user.role === 'qa' && !user.devRole) {
    roleLabel = '🧪 QA Lead';
    badgeClass = 'tag-qa';
  } else if (user.devRole) {
    const spec = getSpecialtyInfo(user.devRole);
    roleLabel = `${spec.icon} ${spec.label}`;
    badgeClass = spec.tagClass;
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
        const showDevRole = val === 'dev' || val === 'qa';
        groupAdminDevRole.style.display = showDevRole ? 'block' : 'none';
        if (val === 'qa' && document.getElementById('admin-user-devrole')) {
          document.getElementById('admin-user-devrole').value = 'qa';
        }
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
      const devRole = (role === 'dev' || role === 'qa') ? document.getElementById('admin-user-devrole')?.value : null;
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
  const savedTheme = localStorage.getItem('synchro_theme') || localStorage.getItem('devsquad_theme') || 'dark';
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

    // Verificação instantânea ao clicar no badge de status
    document.getElementById('db-status-pill')?.addEventListener('click', async () => {
      const online = await api.checkHealth();
      if (online) {
        showToast('🟢 Backend Online: Conexão ativa com synchro.db!');
      } else {
        showToast('🟠 Backend Offline: Servidor desconectado. Operando em Cache Local.');
      }
    });
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
  document.getElementById('btn-open-measurement-modal')?.addEventListener('click', () => openMeasurementReportModal());

  // Listeners do Modal de Relatório de Medição
  document.getElementById('measurement-project-select')?.addEventListener('change', (e) => {
    populateMeasurementFeatures(e.target.value);
    updateMeasurementReportPreview();
  });
  document.getElementById('measurement-feature-select')?.addEventListener('change', () => {
    updateMeasurementReportPreview();
  });
  document.getElementById('measurement-status-filter')?.addEventListener('change', () => {
    updateMeasurementReportPreview();
  });
  document.getElementById('btn-generate-measurement-pdf')?.addEventListener('click', () => {
    exportMeasurementReportPDF();
  });
  document.getElementById('btn-print-measurement-doc')?.addEventListener('click', () => {
    printMeasurementReport();
  });

  // Listeners do Módulo de Templates de Documentos
  document.getElementById('btn-open-template-modal')?.addEventListener('click', () => openTemplateModalForCreate());
  document.getElementById('btn-reset-default-templates')?.addEventListener('click', () => handleResetDefaultTemplates());
  document.getElementById('measurement-template-select')?.addEventListener('change', () => {
    updateMeasurementTemplateInfo();
    updateMeasurementReportPreview();
  });
  if (typeof setupTemplateEventListeners === 'function') {
    setupTemplateEventListeners();
  }

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

  // Suporte de rolagem fluida via roda do mouse ou trackpad sobre o cabeçalho e abas do modal
  document.querySelectorAll('.modal-dialog').forEach(dialog => {
    dialog.addEventListener('wheel', (e) => {
      const activeScrollable = dialog.querySelector('.modal-tab-pane:not([style*="display: none"]) > .modal-body')
        || dialog.querySelector('.modal-tab-pane:not([style*="display: none"])')
        || dialog.querySelector('.modal-body');
      if (activeScrollable && !activeScrollable.contains(e.target)) {
        activeScrollable.scrollTop += e.deltaY;
      }
    }, { passive: true });
  });

  // Alternador de Tema
  document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('synchro_theme', newTheme);
  });

  // Filtro Global de Projetos no Topbar
  document.getElementById('project-filter-select')?.addEventListener('change', (e) => {
    store.selectedProject = e.target.value;
    store.reqFeatureFilter = 'all';
    populateFeatureFilterOptions();
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

  // Alternadores de Modo de Exibição (Cards vs Lista Compacta)
  document.querySelectorAll('.view-layout-toggle .view-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const toggle = btn.closest('.view-layout-toggle');
      if (!toggle) return;
      const viewName = toggle.dataset.view;
      const mode = btn.dataset.mode;
      if (viewName && mode) {
        setViewLayoutMode(viewName, mode);
      }
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
    const featuresRaw = document.getElementById('project-features-input')?.value || '';
    const features = featuresRaw.split(',').map(s => s.trim()).filter(Boolean);

    if (editId) {
      store.updateProject(editId, { name, code, desc, status, deadline, color, features });
      showToast(`Projeto "${name}" atualizado com sucesso!`);
    } else {
      store.addProject({ name, code, desc, status, deadline, color, features });
      showToast(`Novo projeto "${name}" criado com sucesso!`);
    }

    closeModal('modal-project');
    refreshAllUI();
  });

  // 2. FORMULÁRIO DE DEMANDA / KANBAN (CRUD, ATRIBUIÇÃO & NOTAS DEV/QA)
  document.getElementById('form-new-task')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentUser = authStore.getCurrentUser();
    const isDevOrQa = currentUser && (currentUser.role === 'dev' || currentUser.role === 'qa');
    const editId = document.getElementById('task-id-edit').value;

    if (!editId && isDevOrQa) {
      showToast('Desenvolvedores e QAs não possuem permissão para criar demandas.');
      return;
    }

    const devNotes = document.getElementById('task-dev-notes')?.value || '';
    const qaNotes = document.getElementById('task-qa-notes')?.value || '';

    if (editId && isDevOrQa) {
      const assigneeId = document.getElementById('task-assignee').value;
      const updateData = { assigneeId, devNotes };
      if (currentUser.role === 'qa') {
        updateData.qaNotes = qaNotes;
      }
      store.updateTask(editId, updateData);
      showToast('Demanda atualizada com sucesso (notas e atribuição salvas)!');
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
    const complexity = document.getElementById('task-complexity')?.value || 'Média';
    const hours = document.getElementById('task-hours').value;
    const desc = document.getElementById('task-desc').value;

    if (editId) {
      const updateData = { title, projectId, reqId, role, assigneeId, priority, complexity, hours, desc, devNotes, qaNotes };
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
      store.addTask({ title, projectId, reqId, role, assigneeId, priority, complexity, hours, desc, devNotes, qaNotes });
      showToast(`Nova demanda "${title}" criada com sucesso!`);
    }

    closeModal('modal-task');
    e.target.reset();
    refreshAllUI();

    // Se a demanda foi criada a partir de um requisito, destaca e rola suavemente até o card
    if (reqId && store.activeView === 'requirements') {
      setTimeout(() => {
        const cardEl = document.getElementById(`req-card-${reqId}`);
        if (cardEl) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          cardEl.classList.add('highlight-pulse');
          setTimeout(() => cardEl.classList.remove('highlight-pulse'), 2500);
        }
      }, 100);
    }
  });

  // Sincronização inteligente: selecionou um requisito, vincula automaticamente o projeto associado
  document.getElementById('task-requirement')?.addEventListener('change', (e) => {
    const selectedReqId = e.target.value;
    if (selectedReqId) {
      const r = (store.state.requirements || []).find(item => item.id === selectedReqId);
      if (r && r.projectId) {
        const projEl = document.getElementById('task-project');
        if (projEl) projEl.value = r.projectId;
      }
    }
    updateTaskRequirementPreview();
    const paneReq = document.getElementById('pane-task-req');
    if (paneReq && paneReq.style.display !== 'none') {
      renderTaskRequirementTab();
    }
  });

  document.getElementById('btn-toggle-req-spec-preview')?.addEventListener('click', () => {
    toggleTaskReqPreview();
  });

  document.getElementById('btn-quick-expand-req')?.addEventListener('click', () => {
    toggleTaskReqPreview();
  });

  document.getElementById('btn-close-req-preview')?.addEventListener('click', () => {
    toggleTaskReqPreview(false);
  });

  // Recálculo automático do código do requisito e atualização de features ao trocar Projeto ou Tipo
  document.getElementById('req-project')?.addEventListener('change', (e) => {
    updateAutoReqCode();
    updateModalFeaturesDropdown(e.target.value);
  });

  document.getElementById('req-feature')?.addEventListener('change', (e) => {
    const customInput = document.getElementById('req-feature-custom');
    if (e.target.value === '__new__') {
      if (customInput) {
        customInput.style.display = 'block';
        customInput.value = '';
        customInput.focus();
      }
    } else {
      if (customInput) {
        customInput.style.display = 'none';
        customInput.value = '';
      }
    }
  });

  document.getElementById('req-feature-filter')?.addEventListener('change', (e) => {
    store.reqFeatureFilter = e.target.value;
    renderRequirements();
  });

  document.getElementById('req-type')?.addEventListener('change', () => {
    updateAutoReqCode();
  });

  document.getElementById('btn-toggle-req-code-lock')?.addEventListener('click', () => {
    toggleReqCodeLock();
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

    let feature = document.getElementById('req-feature')?.value || '';
    const customFeature = document.getElementById('req-feature-custom')?.value?.trim();
    if (feature === '__new__' && customFeature) {
      feature = customFeature;
    } else if (feature === '__new__') {
      feature = '';
    }

    let newReq = null;
    if (editId) {
      store.updateRequirement(editId, { title, code, projectId, feature, type, moscow, userStory, bdd });
      showToast(`Requisito ${code} atualizado com sucesso!`);
    } else {
      newReq = store.addRequirement({ title, code, projectId, feature, type, moscow, userStory, bdd });

      // Garante que o item recém-criado seja imediatamente visível ajustando filtros conflitantes
      if (store.selectedProject !== 'all' && projectId && store.selectedProject !== projectId) {
        store.selectedProject = projectId;
        const mainProjSelect = document.getElementById('project-filter-select');
        if (mainProjSelect) mainProjSelect.value = projectId;
      }
      if (store.reqTypeFilter !== 'all' && store.reqTypeFilter !== type) {
        store.reqTypeFilter = 'all';
        document.querySelectorAll('#req-type-filter .segment-btn').forEach(b => {
          b.classList.toggle('active', b.dataset.type === 'all');
        });
      }
      if (store.reqMoscowFilter !== 'all' && store.reqMoscowFilter !== moscow) {
        store.reqMoscowFilter = 'all';
        const moscowSelect = document.getElementById('req-moscow-filter');
        if (moscowSelect) moscowSelect.value = 'all';
      }
      if (store.reqFeatureFilter !== 'all' && store.reqFeatureFilter !== feature) {
        store.reqFeatureFilter = 'all';
        const featFilter = document.getElementById('req-feature-filter');
        if (featFilter) featFilter.value = 'all';
      }
      if (store.searchQuery) {
        store.searchQuery = '';
        const searchInput = document.getElementById('global-search-input');
        if (searchInput) searchInput.value = '';
      }

      showToast(`Requisito ${code} registrado com sucesso!`);
    }

    closeModal('modal-requirement');
    e.target.reset();
    refreshAllUI();

    // Rola para o topo e destaca visualmente o requisito recém-criado na primeira posição
    if (newReq && store.activeView === 'requirements') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const reqContainer = document.getElementById('requirements-container');
      if (reqContainer) reqContainer.scrollTop = 0;
      setTimeout(() => {
        const topEl = document.getElementById(`req-card-${newReq.id}`) || document.getElementById(`req-row-${newReq.id}`);
        if (topEl) {
          topEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          topEl.classList.add('highlight-pulse');
          setTimeout(() => topEl.classList.remove('highlight-pulse'), 2500);
        }
      }, 80);
    }
  });

  // 4. FORMULÁRIO DE CASO DE TESTE (CRUD)
  document.getElementById('form-new-test')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('test-id-edit').value;
    const title = document.getElementById('test-title').value;
    const type = document.getElementById('test-type-select').value;
    const reqId = document.getElementById('test-req-select').value;
    const taskId = document.getElementById('test-task-select')?.value || null;
    const steps = document.getElementById('test-steps').value;
    const expected = document.getElementById('test-expected').value;

    if (editId) {
      store.updateTestCase(editId, { title, type, reqId, taskId, steps, expected });
      showToast(`Caso de teste atualizado com sucesso!`);
    } else {
      store.addTestCase({ title, type, reqId, taskId, steps, expected });
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

  // 9. FORMULÁRIO DE CADASTRO DE NOVA ESTRUTURA E TRILHA DE CARREIRA
  document.getElementById('form-career-track')?.addEventListener('submit', handleCareerTrackSubmit);
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
    if (currentUser.role === 'admin') {
      roleInput.value = '👑 Administrador';
    } else if (currentUser.role === 'pm') {
      roleInput.value = '📊 Gerente de Projetos (PM)';
    } else if (currentUser.role === 'qa' && !currentUser.devRole) {
      roleInput.value = '🧪 QA Lead / Homologador';
    } else {
      const spec = (typeof getSpecialtyInfo === 'function') ? getSpecialtyInfo(currentUser.devRole || (currentUser.role === 'qa' ? 'qa' : 'backend')) : null;
      roleInput.value = spec ? `${spec.icon} ${spec.label} (${currentUser.role === 'qa' ? 'QA' : 'Dev'})` : (currentUser.role || 'Membro');
    }
  }
  if (seniorityInput) seniorityInput.value = currentUser.seniority || '';
  if (skillsInput) skillsInput.value = Array.isArray(currentUser.skills) ? currentUser.skills.join(', ') : (currentUser.skills || '');
  if (pwdInput) pwdInput.value = '';

  openModal('modal-user-profile');
};

// ==============================================================================
// 11. MÓDULO DE PROPOSTA DA PLATAFORMA & TRILHAS DE CARREIRA / PROMOÇÃO
// ==============================================================================

const careerTracksData = {
  frontend: {
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
        missionDetail: "Atua na implementação de componentes reutilizáveis, telas responsivas e consumo de endpoints REST definidos nos Requisitos/BDD. Trabalha com suporte técnico pontual de plenos e sêniores.",
        hardSkills: ["HTML5 Semântico", "CSS3 / Flexbox / Grid", "JavaScript Moderno (ES6+)", "Consumo de APIs REST (Fetch/JSON)", "Git Básico (Branches, Commits, PRs)", "Responsividade Mobile-first"],
        softSkills: ["Curiosidade técnica ativa", "Comunicação transparente nas dailies", "Atenção a feedbacks em Code Reviews", "Autonomia progressiva na depuração de erros"],
        metrics: {
          tasks: "4+ demandas concluídas",
          complexity: "2+ Médias e 1+ Alta",
          qaRate: "≥ 75% aprovação em QA",
          hoursVariance: "Desvio de horas ≤ 25%"
        },
        triggers: [
          "Entrega consistente de demandas de Média Complexidade sem necessidade de reescrita de código.",
          "Capacidade comprovada de assumir ao menos 1 demanda de Alta Complexidade e homologá-la com sucesso.",
          "Índice de aprovação direta em testes de QA igual ou superior a 75%.",
          "Acurácia nas estimativas de esforço, evitando estouros sistemáticos de prazo."
        ]
      },
      {
        key: "pleno",
        name: "Front-end Pleno",
        nextLevel: "Front-end Sênior",
        tag: "Autonomia & Domínio de Soluções",
        focus: "Arquitetura clientside, performance Web Vitals, testes de componentes e Design System.",
        missionDetail: "Lidera a implementação de features completas de ponta a ponta. Garante acessibilidade (a11y), otimização de performance, componentização escalável e alinhamento próximo com UI/UX e Back-end.",
        hardSkills: ["Arquitetura de Estado (Global & Local)", "Core Web Vitals (LCP, FID/INP, CLS)", "Acessibilidade Web (WCAG & ARIA)", "Design Systems & Tokenização", "Testes Automatizados de Componentes", "Tratamento Robusto de Offline/Loading/Erros"],
        softSkills: ["Comunicação propositiva com Produto e QA", "Capacidade de dar mentorias a juniores", "Resolução independente de problemas complexos", "Postura colaborativa e resolutiva"],
        metrics: {
          tasks: "6+ demandas concluídas no ciclo",
          complexity: "3+ Altas (25%+ do volume)",
          qaRate: "≥ 85% aprovação em QA",
          hoursVariance: "Desvio de horas ≤ 20%"
        },
        triggers: [
          "Domínio comprovado de Alta Complexidade com 3 ou mais entregas críticas concluídas.",
          "Mínimo de 25% de todo o volume de trabalho focado em demandas de alta criticidade técnica.",
          "Taxa de aprovação direta em validações de QA superior a 85%, com baixíssimo índice de bugs em produção.",
          "Apoio técnico e mentoria para desenvolvedores juniores da squad."
        ]
      },
      {
        key: "senior",
        name: "Front-end Sênior",
        nextLevel: "Tech Lead Front-end",
        tag: "Excelência Técnica & Mentoria",
        focus: "Decisões arquiteturais, segurança front-end, tooling de build e governança de qualidade.",
        missionDetail: "Referência técnica da disciplina na squad. Define padrões de código, antecipa riscos arquiteturais, otimiza bundles, combate ativamente o débito técnico e atua como mentor contínuo de toda a equipe.",
        hardSkills: ["Decisões Arquiteturais Avançadas", "Segurança Front-end (XSS, CSRF, CSP)", "Tooling de Build & Bundlers", "Otimização Extrema de Performance", "Code Reviews Formativos", "Especificação Técnica e Cenários BDD"],
        softSkills: ["Liderança técnica e influência positiva", "Resiliência e foco na resolução de incidentes", "Habilidade de traduzir negócio em arquitetura", "Facilidade de mentoria e formação de pessoas"],
        metrics: {
          tasks: "Volume expressivo com impacto",
          complexity: "5+ Demandas de Alta Complexidade",
          qaRate: "≥ 90% aprovação em QA",
          readinessScore: "Score de Prontidão ≥ 85%"
        },
        triggers: [
          "Liderança em 5 ou mais iniciativas ou demandas de Alta Complexidade e impacto sistêmico.",
          "Taxa de aprovação em QA igual ou superior a 90% em todas as entregas do ciclo.",
          "Condução de revisões de código de alto padrão que ensinam e elevam a barra técnica de todo o time.",
          "Score de prontidão auditado pelo sistema igual ou superior a 85%."
        ]
      },
      {
        key: "lead",
        name: "Tech Lead Front-end / Staff",
        nextLevel: "Principal / Engineering Manager",
        tag: "Liderança de Engenharia & Impacto",
        focus: "Estratégia tecnológica, governança de squads, alinhamento executivo e desenvolvimento de talentos.",
        missionDetail: "Equilibra excelência técnica de classe mundial e alinhamento com os objetivos estratégicos de negócio. É o guardião da arquitetura e da velocidade sustentável da equipe.",
        hardSkills: ["Arquitetura Corporativa Front-end", "Governança & Padronização ALM", "Modelagem de Capacidade Produtiva", "Gestão de Débito Técnico", "Observabilidade & Telemetria Clientside"],
        softSkills: ["Comunicação executiva com C-Level e PMs", "Gestão de conflitos técnicos", "Visão estratégica de produto", "Inspiração e cultura de alta performance"],
        metrics: {
          tasks: "Liderança de projetos ativos",
          complexity: "100% alinhamento arquitetural",
          qaRate: "Zero falhas críticas em releases",
          readinessScore: "Avaliação 360° e Governança"
        },
        triggers: [
          "Sustentação de múltiplos projetos simultâneos com saúde técnica verde.",
          "Calibração de metas de promoção justas e auditáveis para os desenvolvedores da squad.",
          "Condução de 1:1s e planos de desenvolvimento técnico individuais (PDI) baseados nos dados do sistema."
        ]
      }
    ]
  },
  backend: {
    roleName: "Desenvolvedor(a) Back-end",
    icon: "⚙️",
    discipline: "Back-end & Systems Engineering",
    mission: "Projetar e construir serviços confiáveis, regras de negócio determinísticas, APIs de alto desempenho e persistência de dados com integridade transacional ACID.",
    levels: [
      {
        key: "junior",
        name: "Back-end Júnior",
        nextLevel: "Back-end Pleno",
        tag: "Fundamentos & Execução de APIs",
        focus: "Endpoints RESTful, validação de entradas, consultas SQL e testes automatizados básicos.",
        missionDetail: "Implementa rotas de API, regras de negócio orientadas por especificações BDD e consultas a banco de dados relacional. Trabalha na correção de bugs e manutenção evolutiva de serviços.",
        hardSkills: ["Node.js / Go / Python / C#", "APIs RESTful (Status HTTP, JSON, Rotas)", "SQL Relacional (Tabelas, FKs, Índices)", "Validação e Sanitização de Dados", "Testes Unitários Básicos", "Git & Controle de Versão"],
        softSkills: ["Atenção a detalhes em regras de negócio", "Busca de entendimento do domínio da aplicação", "Comunicação clara de bloqueios", "Vontade constante de aprender"],
        metrics: {
          tasks: "4+ demandas concluídas",
          complexity: "2+ Médias e 1+ Alta",
          qaRate: "≥ 75% aprovação em QA",
          hoursVariance: "Desvio de horas ≤ 25%"
        },
        triggers: [
          "Capacidade de construir endpoints completos com validação de payload e tratamento de erros sem supervisão.",
          "Entrega de ao menos 1 demanda de Alta Complexidade (ex: transações, filtros compostos ou novas entidades).",
          "Taxa de aprovação em testes de QA ≥ 75%.",
          "Desvio de estimativas controlado dentro da margem de 25%."
        ]
      },
      {
        key: "pleno",
        name: "Back-end Pleno",
        nextLevel: "Back-end Sênior",
        tag: "Confiabilidade & Modelagem Relacional",
        focus: "Integridade ACID, otimização de queries, autenticação/segurança e concorrência.",
        missionDetail: "Desenvolve módulos de missão crítica, modela esquemas relacionais eficientes, cria integrações complexas e garante a performance sob concorrência e carga de trabalho intensa.",
        hardSkills: ["Modelagem de Dados Avançada (Normalização & Índices)", "Transações ACID & WAL Mode", "Segurança de APIs (RBAC, JWT, Rate Limiting)", "Otimização de Consultas & Query Plans", "Testes de Integração & Mocks", "Documentação OpenAPI/Swagger"],
        softSkills: ["Alinhamento técnico ágil com desenvolvedores front-end", "Capacidade analítica na depuração de incidentes", "Mentoria a desenvolvedores juniores", "Visão crítica sobre simplicidade arquitetural"],
        metrics: {
          tasks: "6+ demandas concluídas no ciclo",
          complexity: "3+ Altas (25%+ do volume)",
          qaRate: "≥ 85% aprovação em QA",
          hoursVariance: "Desvio de horas ≤ 20%"
        },
        triggers: [
          "Mínimo de 3 demandas de Alta Complexidade lideradas e homologadas com sucesso.",
          "Comprovação de domínio sobre o modelo de dados e consultas de alta performance.",
          "Taxa de aprovação em QA ≥ 85%, sem incidentes impeditivos em homologação.",
          "Acurácia de esforço estimada vs real mantida com desvio inferior a 20%."
        ]
      },
      {
        key: "senior",
        name: "Back-end Sênior",
        nextLevel: "Tech Lead Back-end",
        tag: "Arquitetura & Resiliência",
        focus: "Sistemas distribuídos, observabilidade, migrações sem downtime e liderança técnica.",
        missionDetail: "Arquiteta soluções robustas para requisitos complexos, define políticas de tolerância a falhas, implementa telemetria abrangente e atua como a referência técnica de dados e backend da squad.",
        hardSkills: ["Arquitetura Distribuída & Microsserviços", "Mensageria, Filas & Eventos", "Observabilidade (Logs Estruturados, Métricas)", "Zero-Downtime Database Migrations", "Design Defensivo e Segurança em Repouso", "Prevenção a Falhas em Cascata"],
        softSkills: ["Liderança técnica serena e estruturada", "Mentor de desenvolvedores plenos e juniores", "Excelente capacidade de síntese e documentação", "Tomada de decisão baseada em trade-offs"],
        metrics: {
          tasks: "Volume expressivo com impacto",
          complexity: "5+ Demandas de Alta Complexidade",
          qaRate: "≥ 90% aprovação em QA",
          readinessScore: "Score de Prontidão ≥ 85%"
        },
        triggers: [
          "Liderança de 5 ou mais iniciativas críticas de infraestrutura, arquitetura ou banco de dados.",
          "Taxa de homologação direta em QA igual ou superior a 90%.",
          "Condução de revisões de código aprofundadas com foco em segurança, integridade e performance.",
          "Score de prontidão oficial no Synchro PRO atingindo 85% ou mais."
        ]
      },
      {
        key: "lead",
        name: "Tech Lead Back-end / Arquiteto",
        nextLevel: "Principal / Head de Engenharia",
        tag: "Governança Corporativa & Escala",
        focus: "Estratégia corporativa de dados, escalabilidade, governança de microsserviços e liderança de pessoas.",
        missionDetail: "Garante a integridade, segurança e escalabilidade de todos os serviços do ecossistema. Alinha as capacidades técnicas aos objetivos de longo prazo da empresa.",
        hardSkills: ["Enterprise Architecture", "Governança de Dados & LGPD/Compliance", "Disaster Recovery & Alta Disponibilidade", "Estratégias de Cache Global & CDN", "Definição de SLAs e SLOs"],
        softSkills: ["Liderança estratégica e gestão de pessoas", "Ponte entre produto, diretoria e engenharia", "Resolução de impasses arquiteturais", "Desenvolvimento contínuo de talentos"],
        metrics: {
          tasks: "Governança de serviços e squads",
          complexity: "100% integridade transacional",
          qaRate: "Zero quebra de SLAs em produção",
          readinessScore: "Auditoria e Governança Plena"
        },
        triggers: [
          "Auditoria contínua de conformidade e integridade dos bancos de dados do workspace.",
          "Definição de metas e benchmarks de performance adotados por toda a engenharia.",
          "Mentoria formal de desenvolvedores seniores para a formação de novos líderes técnicos."
        ]
      }
    ]
  },
  qa: {
    roleName: "Analista de Qualidade / QA Engineer",
    icon: "🧪",
    discipline: "Quality Engineering & Testing",
    mission: "Assegurar que cada entrega atenda aos mais altos padrões de funcionalidade, usabilidade e segurança antes de alcançar o usuário final.",
    levels: [
      {
        key: "junior",
        name: "QA Engineer Júnior",
        nextLevel: "QA Engineer Pleno",
        tag: "Execução & Testes Funcionais",
        focus: "Execução de testes manuais, escrita de casos de teste a partir de BDD e relato estruturado de bugs.",
        missionDetail: "Analisa requisitos, cria e executa casos de teste funcionais e documenta não-conformidades de forma clara e reprodutível no quadro de Qualidade.",
        hardSkills: ["Escrita de Casos de Teste Estruturados", "Interpretação de Critérios BDD", "Testes de APIs (Postman/cURL)", "Reporte Detalhado de Bugs com Evidências", "Execução de Testes Exploratórios", "Matriz de Rastreabilidade Básica"],
        softSkills: ["Comunicação empática e construtiva com os devs", "Atenção cirúrgica aos detalhes", "Organização e pontualidade", "Foco em prevenção e não só detecção"],
        metrics: {
          tasks: "100% requisitos cobertos por testes",
          complexity: "Execução autônoma de suítes de teste",
          qaRate: "Bugs reportados com precisão ≥ 85%",
          hoursVariance: "Agilidade nas validações do Kanban"
        },
        triggers: [
          "Autonomia na criação de planos de teste completos para requisitos de média complexidade.",
          "Abertura de relatórios de bugs completos com steps-to-reproduce, payloads e prints sem ambiguidades.",
          "Manutenção tempestiva das validações das demandas no fluxo do Kanban sem gargalos.",
          "Domínio do uso dos casos de teste vinculados aos requisitos no Synchro PRO."
        ]
      },
      {
        key: "pleno",
        name: "QA Engineer Pleno",
        nextLevel: "QA Engineer Sênior",
        tag: "Automação & Cultura Shift-Left",
        focus: "Automação de testes de API/E2E, testes de regressão e participação ativa no refinamento de requisitos.",
        missionDetail: "Automatiza suítes de testes de regressão, integra testes aos fluxos de entrega contínua e atua antes do código ser escrito (Shift-Left), refinando cenários BDD junto aos PMs e Devs.",
        hardSkills: ["Automação E2E (Playwright, Cypress)", "Automação de APIs & Contratos", "Testes de Regressão Automatizados", "Integração Contínua (CI/CD Gates)", "Análise de Riscos de Homologação", "Refinamento BDD Avançado"],
        softSkills: ["Influência técnica para qualidade no time", "Capacidade de ensinar boas práticas de teste aos devs", "Visão crítica de cobertura vs custo", "Proatividade na mitigação de riscos"],
        metrics: {
          tasks: "Redução de bugs em produção a < 5%",
          complexity: "Suítes de automação ativas",
          qaRate: "Agilidade na homologação de demandas",
          hoursVariance: "Zero bloqueios críticos sem alerta"
        },
        triggers: [
          "Construção de suítes de teste automatizadas que reduzem o tempo de homologação manual em mais de 30%.",
          "Taxa de bugs que escapam para homologação externa mantida abaixo de 5%.",
          "Participação ativa na especificação dos requisitos garantindo critérios de teste claros antes da sprint.",
          "Mentoria em testes para desenvolvedores juniores e estagiários."
        ]
      },
      {
        key: "senior",
        name: "QA Engineer Sênior / Lead",
        nextLevel: "Head de Qualidade",
        tag: "Estratégia & Governança de Qualidade",
        focus: "Quality Gates, testes não funcionais (carga, segurança), governança de qualidade de múltiplos projetos.",
        missionDetail: "Define a estratégia corporativa de qualidade do workspace, estabelece métricas de confiabilidade (DORA metrics, escape rate) e capacita as squads na cultura de qualidade intrínseca.",
        hardSkills: ["Arquitetura de Testes & Frameworks", "Testes de Carga & Performance (k6, JMeter)", "Testes de Segurança de Aplicações", "Quality Gates Automatizados", "Métricas de Qualidade (Escape Rate, DORA)", "Auditoria e Conformidade"],
        softSkills: ["Liderança de capítulo de qualidade", "Alinhamento de qualidade com o valor de negócio", "Visão holística do ciclo de vida de software", "Mediação técnica em decisões de release"],
        metrics: {
          tasks: "Governança da qualidade de todos os projetos",
          complexity: "Zero falhas críticas pós-release",
          qaRate: "Conformidade em 100% dos Quality Gates",
          readinessScore: "Auditoria de QA Impecável"
        },
        triggers: [
          "Padronização e governança dos processos de teste em todos os projetos ativos no Synchro PRO.",
          "Implementação de Quality Gates que garantem zero paradas não planejadas após o deploy.",
          "Capacitação contínua das squads em técnicas avançadas de teste e BDD."
        ]
      }
    ]
  },
  pm: {
    roleName: "Product Manager (PM / Scrum Master)",
    icon: "📊",
    discipline: "Product Management & Agile Delivery",
    mission: "Maximizar o valor entregue pela squad, conectando os anseios do negócio e usuários a um fluxo contínuo, previsível e sustentável de engenharia.",
    levels: [
      {
        key: "junior",
        name: "Associate PM / Júnior",
        nextLevel: "Product Manager Pleno",
        tag: "Especificação & Facilitação Ágil",
        focus: "Histórias de usuário com BDD, facilitação de cerimônias ágeis e acompanhamento de demandas.",
        missionDetail: "Traduz necessidades de stakeholders em requisitos detalhados com critérios de aceitação claros, prioriza o backlog de tarefas e facilita as cerimônias da squad no dia a dia.",
        hardSkills: ["Escrita de Histórias de Usuário & BDD", "Gestão de Backlog & Priorização (MoSCoW, RICE)", "Facilitação de Dailies, Plannings e Retros", "Acompanhamento de Fluxo Kanban", "Mapeamento de Critérios de Aceite"],
        softSkills: ["Comunicação empática e clara com stakeholders", "Escuta ativa da equipe técnica", "Organização e rigor de prazos", "Remoção veloz de impedimentos"],
        metrics: {
          tasks: "Backlog refinado com 2+ sprints de antecedência",
          complexity: "Zero demandas sem critério de aceite",
          qaRate: "Redução de retrabalho por ambiguidade",
          hoursVariance: "Previsibilidade de entrega ≥ 80%"
        },
        triggers: [
          "Manutenção de um backlog saudável e detalhado sem lacunas conceituais para a squad.",
          "Condução autônoma de todas as cerimônias ágeis com participação e engajamento da equipe.",
          "Cumprimento dos prazos de entrega dos projetos com índice superior a 80%.",
          "Uso eficaz dos módulos de Requisitos, Projetos e Kanban do Synchro PRO."
        ]
      },
      {
        key: "pleno",
        name: "Product Manager Pleno",
        nextLevel: "Senior Product Manager",
        tag: "Gestão de Valor & Métricas de Fluxo",
        focus: "Métricas de entrega (Lead Time, Throughput), gestão de riscos e dependências entre squads.",
        missionDetail: "Gerencia produtos e projetos complexos com foco no impacto de negócio. Analisa métricas de eficiência do fluxo, prevê riscos técnicos e equilibra novas features com controle de débito técnico.",
        hardSkills: ["Métricas Ágeis (Lead Time, Cycle Time, CFD)", "Gestão de Riscos & Dependências Multi-Projeto", "Negociação de Escopo & Trade-offs Técnicos", "Análise de Impacto & Viabilidade Técnica", "Mapeamento de Jornadas e MVPs"],
        softSkills: ["Excelente capacidade de negociação", "Defesa técnica e cuidado com a saúde do time", "Visão holística de negócio e produto", "Resolução proativa de conflitos de prioridade"],
        metrics: {
          tasks: "Previsibilidade de releases ≥ 90%",
          complexity: "Gestão de iniciativas complexas",
          qaRate: "Baixo índice de retrabalho (< 5%)",
          hoursVariance: "Alinhamento contínuo de capacidade"
        },
        triggers: [
          "Previsibilidade de entrega acima de 90% ao longo dos ciclos de desenvolvimento.",
          "Gestão impecável de dependências técnicas e funcionais entre Front-end, Back-end e QA.",
          "Negociação transparente com stakeholders, garantindo que o time trabalhe com ritmo sustentável.",
          "Mentoria para novos Scrum Masters e analistas de produto."
        ]
      },
      {
        key: "senior",
        name: "Senior PM / Agile Chapter Lead",
        nextLevel: "Group PM / Head de Produto",
        tag: "Estratégia de Portfólio & Governança",
        focus: "Governança de portfólio multi-projetos, evolução metodológica e estratégia corporativa.",
        missionDetail: "Supervisiona múltiplos projetos e produtos simultâneos no Synchro PRO. Define as diretrizes ágeis da organização e garante o alinhamento estratégico com a diretoria executiva.",
        hardSkills: ["Gestão de Portfólio & Roadmaps Estratégicos", "Governança Ágil Organizacional", "Métricas de Negócio & ROI", "Design de Processos de Engenharia", "Auditoria de Projetos e Entregas"],
        softSkills: ["Liderança inspiradora e influente", "Comunicação executiva de alto nível", "Formação de novas lideranças ágeis", "Pensamento estratégico de longo prazo"],
        metrics: {
          tasks: "Governança plena de todos os projetos",
          complexity: "Saúde técnica e prazos no verde",
          qaRate: "Conformidade e auditoria corporativa",
          readinessScore: "Satisfação de stakeholders e time"
        },
        triggers: [
          "Garantia de saúde, previsibilidade e transparência em todos os projetos do workspace.",
          "Evolução comprovada dos processos ágeis e de qualidade adotados pela organização.",
          "Formação e mentoria de novos Product Managers e Scrum Masters."
        ]
      }
    ]
  },
  techlead: {
    roleName: "Tech Lead & Liderança Técnica",
    icon: "👑",
    discipline: "Technical Leadership & Software Governance",
    mission: "Multiplicar o impacto da engenharia, equilibrando excelência arquitetural, governança de dados, desbloqueio de pessoas e velocidade de entrega.",
    levels: [
      {
        key: "lead",
        name: "Tech Lead",
        nextLevel: "Staff / Principal Engineer",
        tag: "Multiplicador Técnico & Arquitetura",
        focus: "Liderança técnica da squad, desbloqueio de desenvolvedores, qualidade arquitetural e ponte com PM/QA.",
        missionDetail: "Atua como líder técnico da equipe, removendo bloqueios conceituais, garantindo que as melhores práticas de código e teste sejam seguidas e participando de decisões arquiteturais estratégicas.",
        hardSkills: ["Arquitetura de Software Ponta a Ponta", "Governança de Banco de Dados e APIs", "Facilitação de Technical Design Docs", "Pair Programming nos Problemas Mais Complexos", "Definição de Padrões e Linters", "Calibração de Metas de Promoção"],
        softSkills: ["Liderança servidora sem autoridade formal", "Excelente capacidade de comunicação e escuta", "Mentoria ativa e personalizada", "Gestão do equilíbrio entre velocidade e débito técnico"],
        metrics: {
          tasks: "Squad com 100% dos projetos saudáveis",
          complexity: "Liderança nos maiores desafios técnicos",
          qaRate: "Taxa média de QA da squad ≥ 85%",
          readinessScore: "Metas da equipe calibradas no SQLite"
        },
        triggers: [
          "Squad entregando com consistência, alta qualidade de código e conformidade em QA.",
          "Acompanhamento individual da evolução técnica de cada desenvolvedor através do módulo de Desempenho.",
          "Gestão proativa do débito técnico, mantendo a manutenibilidade do código elevada.",
          "Condução de sessões de mentoria e compartilhamento de conhecimento técnico."
        ]
      },
      {
        key: "staff",
        name: "Staff Engineer / Engineering Director",
        nextLevel: "VP of Engineering / CTO",
        tag: "Impacto Organizacional & Governança Global",
        focus: "Visão estratégica de tecnologia, resiliência corporativa, padrões globais de engenharia e cultura de excelência.",
        missionDetail: "Define o futuro tecnológico da empresa, estabelece padrões arquiteturais para todas as squads, fomenta a cultura de meritocracia técnica baseada em dados e desenvolve novas lideranças de engenharia.",
        hardSkills: ["Enterprise Architecture & Cloud Systems", "Segurança da Informação & Compliance", "Planejamento Estratégico de Engenharia", "Governança ALM Corporativa", "Auditoria Contínua de Processos e Dados"],
        softSkills: ["Visão de negócio e tecnologia unificadas", "Comunicação e presença executiva", "Atração e retenção dos melhores talentos", "Criação de cultura de alta confiança e entrega"],
        metrics: {
          tasks: "Eficiência e governança global da engenharia",
          complexity: "Zero riscos estruturais não mapeados",
          qaRate: "Excelência de qualidade em toda a organização",
          readinessScore: "Cultura meritocrática consolidada"
        },
        triggers: [
          "Criação e sustentação de uma cultura de engenharia onde promoções são transparentes, auditáveis e justas.",
          "Implementação de processos que garantem a escalabilidade e segurança de longo prazo do ecossistema.",
          "Formação comprovada de Tech Leads, PMs e desenvolvedores sêniores na organização."
        ]
      }
    ]
  }
};

let activeCareerRole = 'frontend';
let activeCareerLevel = 'junior';
let simulatedCriteriaState = {};

window.renderCareer = function() {
  const container = document.getElementById('career-role-content');
  if (!container) return;

  const roleData = careerTracksData[activeCareerRole] || careerTracksData.frontend;
  const currentLevels = roleData.levels || [];
  
  if (!currentLevels.some(l => l.key === activeCareerLevel)) {
    activeCareerLevel = currentLevels[0].key;
  }

  const activeLevelData = currentLevels.find(l => l.key === activeCareerLevel) || currentLevels[0];

  // 1. Atualizar abas dos cargos
  document.querySelectorAll('.career-role-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.role === activeCareerRole);
  });

  // 2. Renderizar Conteúdo do Cargo & Escada de Senioridade
  container.innerHTML = `
    <!-- Banner do Cargo -->
    <div class="career-role-banner">
      <div class="career-role-info">
        <div class="career-role-avatar">${roleData.icon}</div>
        <div class="career-role-titles">
          <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
            <h3>${roleData.roleName}</h3>
            <span class="career-tag">${roleData.discipline}</span>
          </div>
          <p>${roleData.mission}</p>
        </div>
      </div>
    </div>

    <!-- Stepper de Senioridade (Escada) -->
    <div class="career-stepper">
      <div class="career-stepper-line"></div>
      ${currentLevels.map((lvl, idx) => `
        <button class="career-step-btn ${lvl.key === activeCareerLevel ? 'active' : ''}" onclick="selectCareerLevel('${lvl.key}')" title="Clique para ver os requisitos de ${lvl.name}">
          <div class="career-step-circle">${idx + 1}</div>
          <span class="career-step-label">${lvl.name}</span>
        </button>
      `).join('')}
    </div>

    <!-- Detalhamento Completo do Nível Ativo -->
    <div class="career-level-display">
      
      <!-- Card: Missão & Escopo -->
      <div class="career-subcard">
        <div class="career-subcard-header">
          <span>🎯</span>
          <span>Missão & Escopo de Atuação</span>
        </div>
        <div class="career-subcard-body">
          <p style="margin-bottom: 0.75rem; font-weight: 600; color: var(--text-main);">${activeLevelData.focus}</p>
          <p>${activeLevelData.missionDetail}</p>
        </div>
      </div>

      <!-- Card: Hard Skills & Tecnologias -->
      <div class="career-subcard">
        <div class="career-subcard-header">
          <span>🛠️</span>
          <span>Hard Skills & Ferramentas Essenciais</span>
        </div>
        <div class="career-subcard-body">
          <p style="margin-bottom: 0.5rem; font-size: 0.8rem; color: var(--text-muted);">Competências técnicas esperadas para este nível:</p>
          <div class="career-skills-wrap">
            ${activeLevelData.hardSkills.map(s => `<span class="career-skill-badge highlight">${s}</span>`).join('')}
          </div>
        </div>
      </div>

      <!-- Card: Soft Skills & Atitudes -->
      <div class="career-subcard">
        <div class="career-subcard-header">
          <span>🤝</span>
          <span>Soft Skills & Postura Comportamental</span>
        </div>
        <div class="career-subcard-body">
          <ul>
            ${activeLevelData.softSkills.map(sk => `<li>${sk}</li>`).join('')}
          </ul>
        </div>
      </div>

      <!-- Card: Métricas no Synchro PRO para Promoção -->
      <div class="career-subcard">
        <div class="career-subcard-header">
          <span>📊</span>
          <span>Métricas no Synchro PRO para Subir</span>
        </div>
        <div class="career-subcard-body">
          <div class="career-metric-row">
            <div class="career-metric-box">
              <span class="label">Volume de Demandas</span>
              <span class="val">${activeLevelData.metrics.tasks}</span>
              <span class="desc">Entregas homologadas</span>
            </div>
            <div class="career-metric-box">
              <span class="label">Complexidade</span>
              <span class="val" style="color: #60a5fa;">${activeLevelData.metrics.complexity}</span>
              <span class="desc">Autonomia comprovada</span>
            </div>
            <div class="career-metric-box">
              <span class="label">Qualidade / QA</span>
              <span class="val" style="color: #fbbf24;">${activeLevelData.metrics.qaRate}</span>
              <span class="desc">Taxa de aprovação</span>
            </div>
            <div class="career-metric-box">
              <span class="label">Acurácia de Horas</span>
              <span class="val" style="color: #f472b6;">${activeLevelData.metrics.hoursVariance || activeLevelData.metrics.readinessScore}</span>
              <span class="desc">Esforço previsto vs real</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Gatilhos & Checklist Formal de Promoção -->
      <div class="career-promotion-trigger">
        <div class="career-trigger-header">
          <span class="career-trigger-title">
            <span>🚀</span>
            <span>Checklist & Gatilhos para Conquistar a Promoção para ${activeLevelData.nextLevel}</span>
          </span>
          <span class="career-tag success">Próximo Degrau: ${activeLevelData.nextLevel}</span>
        </div>
        <div style="font-size: 0.88rem; color: var(--text-secondary); line-height: 1.6;">
          <ul style="margin: 0; padding-left: 1.25rem;">
            ${activeLevelData.triggers.map(t => `<li style="margin-bottom: 0.45rem;"><strong>${t}</strong></li>`).join('')}
          </ul>
        </div>
      </div>

    </div>
  `;

  // Atualizar simulador interativo
  updateSimulatorChecklist();
};
window.renderCareer = renderCareer;

window.selectCareerRole = function(roleKey) {
  if (!careerTracksData[roleKey]) return;
  activeCareerRole = roleKey;
  activeCareerLevel = (careerTracksData[roleKey].levels && careerTracksData[roleKey].levels[0])
    ? careerTracksData[roleKey].levels[0].key
    : 'junior';
  if (typeof renderCareerNav === 'function') renderCareerNav();
  renderCareer();
};

window.selectCareerLevel = function(levelKey) {
  activeCareerLevel = levelKey;
  renderCareer();
};

window.updateSimulatorChecklist = function() {
  const roleSelect = document.getElementById('sim-role-select');
  const targetSelect = document.getElementById('sim-target-select');
  const checklistContainer = document.getElementById('career-checklist-container');
  const targetBadge = document.getElementById('sim-target-badge');

  if (!roleSelect || !targetSelect || !checklistContainer) return;

  const roleValue = roleSelect.value;
  const targetValue = targetSelect.value;

  const targetTitles = {
    pleno: 'Promoção a Pleno',
    senior: 'Promoção a Sênior',
    lead: 'Promoção a Tech Lead / Especialista'
  };

  if (targetBadge) {
    targetBadge.textContent = `Alvo: ${targetTitles[targetValue] || 'Promoção'}`;
  }

  const criteria = getSimulatorCriteriaFor(roleValue, targetValue);

  criteria.forEach(c => {
    if (simulatedCriteriaState[c.id] === undefined) {
      simulatedCriteriaState[c.id] = false;
    }
  });

  checklistContainer.innerHTML = criteria.map(c => `
    <div class="career-checklist-item ${simulatedCriteriaState[c.id] ? 'checked' : ''}" onclick="toggleSimulatorCriterion('${c.id}')">
      <div class="career-checkbox">
        ${simulatedCriteriaState[c.id] ? '✓' : ''}
      </div>
      <div class="career-check-meta">
        <strong>${c.title} <span style="font-size: 0.72rem; color: #818cf8; font-weight: normal; margin-left: 0.35rem;">(Peso ${c.weight}x)</span></strong>
        <small>${c.desc}</small>
      </div>
    </div>
  `).join('');

  calculateSimulatorScore(criteria);
};

window.toggleSimulatorCriterion = function(criterionId) {
  simulatedCriteriaState[criterionId] = !simulatedCriteriaState[criterionId];
  
  const roleSelect = document.getElementById('sim-role-select');
  const targetSelect = document.getElementById('sim-target-select');
  if (roleSelect && targetSelect) {
    const criteria = getSimulatorCriteriaFor(roleSelect.value, targetSelect.value);
    
    document.querySelectorAll('.career-checklist-item').forEach(item => {
      const onclickAttr = item.getAttribute('onclick') || '';
      if (onclickAttr.includes(criterionId)) {
        item.classList.toggle('checked', simulatedCriteriaState[criterionId]);
        const box = item.querySelector('.career-checkbox');
        if (box) box.textContent = simulatedCriteriaState[criterionId] ? '✓' : '';
      }
    });

    calculateSimulatorScore(criteria);
  }
};

function getSimulatorCriteriaFor(roleValue, targetSeniorityKey) {
  const seniorityMap = {
    pleno: 'Pleno',
    senior: 'Sênior',
    lead: 'Tech Lead'
  };
  const targetSeniority = seniorityMap[targetSeniorityKey] || 'Pleno';

  const dbGoals = typeof store.getGoals === 'function' ? store.getGoals() : [];
  const relevantGoals = dbGoals.filter(g => g.isActive && g.targetSeniority === targetSeniority);

  if (relevantGoals.length > 0) {
    return relevantGoals.map(g => ({
      id: g.id,
      title: g.title,
      desc: `${g.description || ''} • Meta Mínima: ${g.targetValue} ${g.targetUnit || ''}`,
      weight: g.weight || 2
    }));
  }

  // Se o cargo atual corresponder a uma trilha e nível cadastrados com triggers formais
  if (roleValue && typeof careerTracksData !== 'undefined') {
    const parts = roleValue.split('_');
    const trackId = parts[0];
    const levelKey = parts.slice(1).join('_');
    if (trackId && careerTracksData[trackId]) {
      const track = careerTracksData[trackId];
      const currentLevel = (track.levels || []).find(l => l.key === levelKey) || track.levels[0];
      if (currentLevel && Array.isArray(currentLevel.triggers) && currentLevel.triggers.length > 0) {
        return currentLevel.triggers.map((trig, idx) => ({
          id: `crit_${trackId}_${currentLevel.key}_${idx}`,
          title: trig,
          desc: `Critério da Trilha ${track.roleName} (${currentLevel.name}) • Meta: ${currentLevel.metrics?.tasks || 'Consistência de entregas'}`,
          weight: idx === 0 ? 3 : 2
        }));
      }
    }
  }

  if (targetSeniorityKey === 'pleno') {
    return [
      { id: 'crit_pleno_1', title: 'Autonomia em Média Complexidade', desc: 'Concluiu e entregou ao menos 2 demandas de complexidade Média com sucesso.', weight: 3 },
      { id: 'crit_pleno_2', title: 'Iniciação em Alta Complexidade', desc: 'Assumiu e concluiu com êxito ao menos 1 tarefa de Alta Complexidade no ciclo.', weight: 2 },
      { id: 'crit_pleno_3', title: 'Aprovação Direta em QA', desc: 'Manteve taxa de aprovação em validações de qualidade e testes igual ou superior a 75%.', weight: 2 },
      { id: 'crit_pleno_4', title: 'Precisão nas Estimativas', desc: 'Desvio médio entre horas estimadas e apontadas controlado dentro de 25%.', weight: 2 },
      { id: 'crit_pleno_5', title: 'Colaboração & Dailies', desc: 'Comunicação pontual nas cerimônias, transparência de bloqueios e proatividade.', weight: 1 }
    ];
  } else if (targetSeniorityKey === 'senior') {
    return [
      { id: 'crit_senior_1', title: 'Domínio de Alta Complexidade', desc: 'Concluiu com êxito 3 ou mais demandas de Alta Complexidade no ciclo.', weight: 3 },
      { id: 'crit_senior_2', title: 'Predomínio de Demandas Críticas', desc: 'Ao menos 25% do volume de tarefas concluídas foram de alta criticidade técnica.', weight: 2 },
      { id: 'crit_senior_3', title: 'Qualidade Rigorosa em QA', desc: 'Índice de aprovação direta em testes de QA igual ou superior a 85%.', weight: 3 },
      { id: 'crit_senior_4', title: 'Acurácia de Horas & Esforço', desc: 'Equilíbrio sólido de esforço com desvio de horas inferior a 20%.', weight: 2 },
      { id: 'crit_senior_5', title: 'Mentoria & Code Reviews', desc: 'Revisão ativa de código dos demais desenvolvedores e mentoria técnica a membros juniores.', weight: 2 }
    ];
  } else {
    return [
      { id: 'crit_lead_1', title: 'Governança & Arquitetura de Software', desc: 'Liderou soluções arquiteturais complexas e sustentou múltiplos projetos saudáveis.', weight: 3 },
      { id: 'crit_lead_2', title: 'Excelência em Qualidade (QA)', desc: 'Taxa de aprovação em QA superior a 90% em todas as entregas do ciclo.', weight: 3 },
      { id: 'crit_lead_3', title: 'Capacitação e Mentoria do Time', desc: 'Conduziu 1:1s técnicos e atuou como multiplicador da barra de excelência da squad.', weight: 2 },
      { id: 'crit_lead_4', title: 'Gestão de Débito Técnico & Riscos', desc: 'Mapeou e eliminou ativamente débitos técnicos antes que virassem incidentes de produção.', weight: 2 }
    ];
  }
}

function calculateSimulatorScore(criteria) {
  let earnedScore = 0;
  let totalWeight = 0;

  criteria.forEach(c => {
    const weight = c.weight || 1;
    totalWeight += weight;
    if (simulatedCriteriaState[c.id]) {
      earnedScore += weight;
    }
  });

  const score = totalWeight > 0 ? Math.min(100, Math.round((earnedScore / totalWeight) * 100)) : 0;

  const scoreNumberEl = document.getElementById('sim-score-number');
  const scoreStatusEl = document.getElementById('sim-score-status');
  const gaugeCircleEl = document.getElementById('sim-gauge-circle');
  const opinionBoxEl = document.getElementById('sim-opinion-box');

  if (scoreNumberEl) scoreNumberEl.textContent = `${score}%`;

  let statusText = 'Em Evolução';
  let opinionText = '';
  let color = '#6366f1';

  if (score >= 80) {
    statusText = '🟢 Elegível para Promoção!';
    color = '#10b981';
    opinionText = `Parabéns! Você cumpre os critérios técnicos e comportamentais fundamentais exigidos pelo Synchro PRO (Score: ${score}%). Suas entregas e histórico respaldam sua conversa de 1:1 para oficializar a promoção.`;
  } else if (score >= 50) {
    statusText = '🟡 Quase Lá (Em Consolidação)';
    color = '#f59e0b';
    opinionText = `Você já atingiu critérios importantes da trilha (Score: ${score}%). Recomendamos focar nas metas pendentes assinaladas acima nas próximas sprints para alcançar a prontidão plena (80%+).`;
  } else {
    statusText = '🔵 Desenvolvendo Habilidades';
    color = '#3b82f6';
    opinionText = `Você está no caminho do crescimento. Mantenha a consistência nas tarefas do Kanban, zele pelas validações em QA e aponte suas horas para consolidar os critérios deste nível.`;
  }

  if (scoreStatusEl) {
    scoreStatusEl.textContent = statusText;
    scoreStatusEl.style.color = color;
  }

  if (gaugeCircleEl) {
    gaugeCircleEl.style.borderColor = color;
    gaugeCircleEl.style.transform = `rotate(${45 + (score * 1.8)}deg)`;
  }

  if (opinionBoxEl) {
    opinionBoxEl.style.borderLeftColor = color;
    opinionBoxEl.textContent = opinionText;
  }
}

window.syncMyDevMetricsToSimulator = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser) {
    showToast('Você precisa estar autenticado para carregar suas métricas.');
    return;
  }

  const allMembers = store.getTeamMembers ? store.getTeamMembers() : [];
  const myMember = allMembers.find(m => m.id === currentUser.id || m.name.toLowerCase() === currentUser.name.toLowerCase()) || allMembers[0];

  if (!myMember) {
    showToast('Nenhum dado de desenvolvedor encontrado vinculado à sua conta.');
    return;
  }

  const roleSelect = document.getElementById('sim-role-select');
  const targetSelect = document.getElementById('sim-target-select');

  const myRole = (myMember.role || currentUser.devRole || 'frontend').toLowerCase();
  const mySeniority = (myMember.seniority || currentUser.seniority || 'Júnior').toLowerCase();

  let targetValue = 'pleno';
  if (mySeniority.includes('pleno')) targetValue = 'senior';
  else if (mySeniority.includes('sênior') || mySeniority.includes('senior')) targetValue = 'lead';

  if (targetSelect) targetSelect.value = targetValue;

  if (roleSelect) {
    const rolePrefix = myRole.includes('back') ? 'backend' : (myRole.includes('qa') ? 'qa' : 'frontend');
    const senioritySuffix = mySeniority.includes('sênior') || mySeniority.includes('senior') ? 'senior' : (mySeniority.includes('pleno') ? 'pleno' : 'junior');
    const combinedVal = `${rolePrefix}_${senioritySuffix}`;
    if (Array.from(roleSelect.options).some(o => o.value === combinedVal)) {
      roleSelect.value = combinedVal;
    }
  }

  const allTasks = store.getTasks ? store.getTasks() : [];
  const myTasks = allTasks.filter(t => t.assignedTo === myMember.id || t.assignedTo === myMember.name);
  const doneTasks = myTasks.filter(t => t.status === 'Concluído');
  
  const highTasks = doneTasks.filter(t => t.complexity === 'Alta').length;
  const medTasks = doneTasks.filter(t => t.complexity === 'Média').length;
  const totalHoursEstimated = doneTasks.reduce((acc, t) => acc + (parseFloat(t.estimatedHours) || 0), 0);
  const totalHoursSpent = doneTasks.reduce((acc, t) => acc + (parseFloat(t.hoursSpent) || 0), 0);

  const criteria = getSimulatorCriteriaFor(roleSelect ? roleSelect.value : 'frontend_junior', targetValue);

  criteria.forEach(c => {
    const titleLower = c.title.toLowerCase();
    if (titleLower.includes('média') && medTasks >= 2) {
      simulatedCriteriaState[c.id] = true;
    } else if (titleLower.includes('alta') && highTasks >= 1) {
      simulatedCriteriaState[c.id] = true;
    } else if (titleLower.includes('qa') && doneTasks.length >= 2) {
      simulatedCriteriaState[c.id] = true;
    } else if (titleLower.includes('horas') || titleLower.includes('estimativas')) {
      const diff = Math.abs(totalHoursEstimated - totalHoursSpent);
      const variance = totalHoursEstimated > 0 ? (diff / totalHoursEstimated) * 100 : 0;
      simulatedCriteriaState[c.id] = variance <= 25 && doneTasks.length > 0;
    } else if (titleLower.includes('colaboração') || titleLower.includes('dailies')) {
      simulatedCriteriaState[c.id] = true;
    } else {
      simulatedCriteriaState[c.id] = false;
    }
  });

  updateSimulatorChecklist();
  showToast(`Métricas reais de ${myMember.name} sincronizadas com o simulador! 🚀`);
};

// ==============================================================================
// 12. GESTÃO E CADASTRO DINÂMICO DE ESTRUTURAS E TRILHAS DE CARREIRA
// ==============================================================================

window.renderCareerNav = function() {
  const container = document.getElementById('career-role-nav-container');
  if (!container || typeof careerTracksData === 'undefined') return;

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const isAdmin = currentUser && currentUser.role === 'admin';
  const tracks = Object.values(careerTracksData);

  container.innerHTML = tracks.map(track => {
    const firstLevel = track.levels?.[0]?.name ? track.levels[0].name.split(' ')[0] : 'L1';
    const lastLevel = track.levels && track.levels.length > 1
      ? track.levels[track.levels.length - 1].name.split(' ')[0]
      : (track.levels?.[0]?.name ? track.levels[0].name.split(' ')[0] : 'Lead');
    const badgeText = `${firstLevel} ➔ ${lastLevel}`;
    const isActive = track.id === activeCareerRole;

    return `
      <button class="career-role-tab ${isActive ? 'active' : ''}" data-role="${track.id}" onclick="selectCareerRole('${track.id}')">
        <span>${track.icon || '💻'}</span>
        <span>${track.roleName}</span>
        <span class="career-tab-badge">${badgeText}</span>
        ${track.isCustom ? `<span style="font-size:0.62rem; background:rgba(99,102,241,0.25); color:#a5b4fc; padding:2px 6px; border-radius:4px; margin-left:4px;" title="Estrutura de carreira customizada">Custom</span>` : ''}
        ${track.isCustom && isAdmin ? `
          <span class="btn-delete-track" onclick="deleteCareerTrack('${track.id}', event)" title="Excluir carreira personalizada" style="color: #f43f5e; margin-left: 6px; font-size: 0.75rem; padding: 0 4px; border-radius: 3px;" onmouseover="this.style.background='rgba(244,63,94,0.2)'" onmouseout="this.style.background='transparent'">✕</span>
        ` : ''}
      </button>
    `;
  }).join('');

  const careerCounter = document.getElementById('counter-nav-career');
  if (careerCounter) {
    careerCounter.textContent = `${tracks.length} Trilhas`;
  }
};

window.populateSimulatorRoleOptions = function() {
  const simSelect = document.getElementById('sim-role-select');
  if (!simSelect || typeof careerTracksData === 'undefined') return;

  const currentVal = simSelect.value;
  let optionsHtml = '';

  Object.values(careerTracksData).forEach(track => {
    (track.levels || []).forEach(lvl => {
      const val = `${track.id}_${lvl.key}`;
      optionsHtml += `<option value="${val}">${track.icon || '💻'} ${lvl.name}</option>`;
    });
  });

  if (optionsHtml) {
    simSelect.innerHTML = optionsHtml;
    if (currentVal && Array.from(simSelect.options).some(o => o.value === currentVal)) {
      simSelect.value = currentVal;
    }
  }
};

window.syncCareerSelects = function(track) {
  if (!track || !track.id) return;
  const roleId = track.id;
  const roleLabel = `${track.icon || '💻'} ${track.roleName}`;

  // 1. Select de Especialidade no Cadastro/Edição de Usuários (Admin)
  const adminDevRoleSelect = document.getElementById('admin-user-devrole');
  if (adminDevRoleSelect && !adminDevRoleSelect.querySelector(`option[value="${roleId}"]`)) {
    const opt = document.createElement('option');
    opt.value = roleId;
    opt.textContent = roleLabel;
    adminDevRoleSelect.appendChild(opt);
  }

  // 2. Select de Especialidade no Cadastro/Edição de Membros da Equipe
  const memberRoleSelect = document.getElementById('member-role');
  if (memberRoleSelect && !memberRoleSelect.querySelector(`option[value="${roleId}"]`)) {
    const opt = document.createElement('option');
    opt.value = roleId;
    opt.textContent = roleLabel;
    memberRoleSelect.appendChild(opt);
  }

  // 3. Select de Especialidade Técnica na Criação de Demandas/Tarefas
  const taskRoleSelect = document.getElementById('task-role');
  if (taskRoleSelect && !taskRoleSelect.querySelector(`option[value="${roleId}"]`)) {
    const opt = document.createElement('option');
    opt.value = roleId;
    opt.textContent = roleLabel;
    taskRoleSelect.appendChild(opt);
  }

  // 4. Filtro de Especialidade no Kanban
  const kanbanFilter = document.getElementById('kanban-role-filter');
  if (kanbanFilter && !kanbanFilter.querySelector(`button[data-role="${roleId}"]`)) {
    const btn = document.createElement('button');
    btn.className = 'segment-btn';
    btn.dataset.role = roleId;
    btn.textContent = `${track.icon || '💻'} ${track.discipline || track.roleName}`;
    btn.addEventListener('click', () => {
      kanbanFilter.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.kanbanRoleFilter = roleId;
      if (typeof window.renderKanban === 'function') window.renderKanban();
    });
    kanbanFilter.appendChild(btn);
  }

  // 5. Filtro de Especialidade na Equipe
  const teamFilter = document.getElementById('team-role-filter');
  if (teamFilter && !teamFilter.querySelector(`button[data-team-role="${roleId}"]`)) {
    const btn = document.createElement('button');
    btn.className = 'segment-btn';
    btn.dataset.teamRole = roleId;
    btn.textContent = `${track.icon || '💻'} ${track.discipline || track.roleName}`;
    btn.addEventListener('click', () => {
      teamFilter.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      store.teamRoleFilter = roleId;
      if (typeof window.renderTeam === 'function') window.renderTeam();
    });
    teamFilter.appendChild(btn);
  }

  // 6. Atualizar opções do Simulador de Promoção
  populateSimulatorRoleOptions();
};

window.openNewCareerModal = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (currentUser && currentUser.role !== 'admin') {
    showToast('⚠️ Apenas Administradores do Sistema têm permissão para cadastrar novas estruturas de carreira.', 'error');
    return;
  }

  const form = document.getElementById('form-career-track');
  if (form) form.reset();

  const titleEl = document.getElementById('modal-career-title');
  if (titleEl) titleEl.textContent = '🧭 Cadastrar Nova Estrutura & Trilha de Carreira';

  const editIdEl = document.getElementById('career-id-edit');
  if (editIdEl) editIdEl.value = '';

  const container = document.getElementById('career-levels-form-container');
  if (container) {
    container.innerHTML = '';
    // Adiciona 3 níveis padrão para agilizar o cadastro de nova carreira
    addCareerLevelFormRow({
      name: 'Nível Júnior',
      nextLevel: 'Nível Pleno',
      tag: 'Iniciação & Execução Guiada',
      focus: 'Execução de demandas com acompanhamento técnico, resolução de bugs e suporte a entregas da squad.',
      hardSkills: 'Versionamento Git, Ferramentas Essenciais, Boas Práticas, Testes Básicos',
      softSkills: 'Comunicação transparente nas cerimônias, Curiosidade ativa, Colaboração',
      metrics: {
        tasks: '4+ demandas',
        complexity: '2+ Médias e 1+ Alta',
        qaRate: '≥ 75% aprovação em QA'
      },
      triggers: 'Homologação consistente de demandas sem reescrita de código\nAprovação em QA igual ou superior a 75%\nAlinhamento com as regras de governança e estimativas'
    });
    addCareerLevelFormRow({
      name: 'Nível Pleno',
      nextLevel: 'Nível Sênior',
      tag: 'Autonomia & Soluções Completas',
      focus: 'Desenvolvimento e entrega autônoma de funcionalidades completas de ponta a ponta, com domínio de arquitetura e qualidade.',
      hardSkills: 'Arquitetura de Soluções, Performance & Otimização, Testes Automatizados, Integração Contínua (CI/CD)',
      softSkills: 'Comunicação propositiva com Produto e QA, Resolução autônoma de bloqueios, Mentoria a juniores',
      metrics: {
        tasks: '6+ demandas no ciclo',
        complexity: '3+ Altas (25%+ do volume)',
        qaRate: '≥ 85% aprovação em QA'
      },
      triggers: 'Domínio comprovado de demandas de Alta Complexidade\nTaxa de aprovação direta em QA superior a 85%\nMentoria e suporte técnico ativo para membros juniores'
    });
    addCareerLevelFormRow({
      name: 'Nível Sênior',
      nextLevel: 'Liderança / Especialista Staff',
      tag: 'Liderança Técnica & Excelência',
      focus: 'Definição arquitetural, mitigação de riscos críticos, governança de código e elevação da barra técnica do time.',
      hardSkills: 'Sistemas Escaláveis & Resilientes, Segurança e Confiabilidade, Governança Técnica, Design Patterns Corporativos',
      softSkills: 'Liderança técnica situacional, Visão estratégica de negócio, Facilitação técnica em decisões complexas',
      metrics: {
        tasks: '8+ demandas estratégicas',
        complexity: '50%+ Alta Complexidade',
        qaRate: '≥ 90% aprovação em QA'
      },
      triggers: 'Liderança arquitetural em iniciativas críticas com zero incidentes impeditivos\nSustentação de altíssima qualidade técnica (> 90% aprovação em QA)\nFormação técnica comprovada de plenos e juniores'
    });
  }

  openModal('modal-career-track');
};

window.addCareerLevelFormRow = function(data = {}) {
  const container = document.getElementById('career-levels-form-container');
  if (!container) return;

  const currentCount = container.querySelectorAll('.career-level-form-card').length;
  const nextIdx = currentCount + 1;

  const card = document.createElement('div');
  card.className = 'career-level-form-card';
  card.dataset.levelIndex = nextIdx;

  const hardSkillsVal = Array.isArray(data.hardSkills) ? data.hardSkills.join(', ') : (data.hardSkills || '');
  const softSkillsVal = Array.isArray(data.softSkills) ? data.softSkills.join(', ') : (data.softSkills || '');
  const triggersVal = Array.isArray(data.triggers) ? data.triggers.join('\n') : (data.triggers || '');

  card.innerHTML = `
    <div class="career-level-form-header">
      <div style="display: flex; align-items: center; gap: 0.65rem;">
        <span class="career-level-number-badge">Nível ${nextIdx}</span>
        <strong class="level-card-title">${data.name || `Nível ${nextIdx}`}</strong>
      </div>
      <button type="button" class="btn btn-ghost btn-sm btn-remove-level" onclick="removeCareerLevelFormRow(this)" title="Remover este nível" style="color: #f43f5e; padding: 3px 8px; font-size: 0.8rem;">
        🗑️ Remover
      </button>
    </div>

    <div class="form-row">
      <div class="form-group flex-2">
        <label>Título do Nível *</label>
        <input type="text" class="custom-input level-name-input" required placeholder="Ex: Engenheiro(a) de Dados Pleno" value="${data.name || ''}" oninput="updateLevelCardTitle(this)">
      </div>
      <div class="form-group flex-2">
        <label>Próximo Nível (Alvo da Promoção)</label>
        <input type="text" class="custom-input level-next-input" placeholder="Ex: Engenheiro(a) de Dados Sênior" value="${data.nextLevel || ''}">
      </div>
      <div class="form-group flex-1">
        <label>Resumo / Foco Curto</label>
        <input type="text" class="custom-input level-tag-input" placeholder="Ex: Autonomia & Soluções" value="${data.tag || ''}">
      </div>
    </div>

    <div class="form-group">
      <label>Missão & Escopo de Atuação do Nível *</label>
      <textarea class="custom-input level-focus-input" required rows="2" placeholder="O que este profissional desenvolve e qual sua autonomia neste nível?">${data.focus || data.missionDetail || ''}</textarea>
    </div>

    <div class="form-row">
      <div class="form-group flex-1">
        <label>Competências Técnicas Necessárias (Hard Skills) * <span style="font-size:0.72rem; color:var(--text-muted);">(Separadas por vírgula)</span></label>
        <textarea class="custom-input level-hardskills-input" required rows="2" placeholder="Ex: SQL Avançado, Python, Airflow, Spark, Modelagem Dimensional, Git">${hardSkillsVal}</textarea>
      </div>
      <div class="form-group flex-1">
        <label>Soft Skills & Atitudes Esperadas <span style="font-size:0.72rem; color:var(--text-muted);">(Separadas por vírgula)</span></label>
        <textarea class="custom-input level-softskills-input" rows="2" placeholder="Ex: Comunicação clara nas dailies, Proatividade, Resolução analítica de problemas">${softSkillsVal}</textarea>
      </div>
    </div>

    <div class="form-row">
      <div class="form-group flex-1">
        <label style="font-size: 0.78rem;">Meta de Demandas</label>
        <input type="text" class="custom-input-sm level-metric-tasks" placeholder="Ex: 4+ demandas" value="${data.metrics?.tasks || '4+ demandas'}">
      </div>
      <div class="form-group flex-1">
        <label style="font-size: 0.78rem;">Complexidade Alvo</label>
        <input type="text" class="custom-input-sm level-metric-comp" placeholder="Ex: 2+ Médias e 1+ Alta" value="${data.metrics?.complexity || '2+ Médias e 1+ Alta'}">
      </div>
      <div class="form-group flex-1">
        <label style="font-size: 0.78rem;">Taxa de Aprovação em QA</label>
        <input type="text" class="custom-input-sm level-metric-qa" placeholder="Ex: ≥ 80% aprovação" value="${data.metrics?.qaRate || '≥ 80% aprovação em QA'}">
      </div>
    </div>

    <div class="form-group" style="margin-bottom: 0;">
      <label style="font-size: 0.78rem;">Gatilhos & Checklist Formal de Promoção <span style="font-size:0.72rem; color:var(--text-muted);">(1 critério por linha)</span></label>
      <textarea class="custom-input-sm level-triggers-input" rows="2" placeholder="Ex: Entrega consistente de pipelines de dados em produção&#10;Zero incidentes de perda de dados ou quebra de schemas&#10;Aprovação direta em QA superior a 80%">${triggersVal}</textarea>
    </div>
  `;

  container.appendChild(card);
  reindexCareerLevelFormRows();
};

window.removeCareerLevelFormRow = function(buttonEl) {
  const container = document.getElementById('career-levels-form-container');
  if (!container) return;
  const cards = container.querySelectorAll('.career-level-form-card');
  if (cards.length <= 1) {
    showToast('A carreira deve possuir ao menos 1 nível hierárquico.', 'warn');
    return;
  }
  const card = buttonEl.closest('.career-level-form-card');
  if (card) {
    card.remove();
    reindexCareerLevelFormRows();
  }
};

window.reindexCareerLevelFormRows = function() {
  const container = document.getElementById('career-levels-form-container');
  if (!container) return;
  const cards = container.querySelectorAll('.career-level-form-card');
  cards.forEach((card, idx) => {
    const badge = card.querySelector('.career-level-number-badge');
    if (badge) badge.textContent = `Nível ${idx + 1}`;
    card.dataset.levelIndex = idx + 1;
  });
};

window.updateLevelCardTitle = function(input) {
  const card = input.closest('.career-level-form-card');
  if (card) {
    const titleEl = card.querySelector('.level-card-title');
    if (titleEl) {
      titleEl.textContent = input.value.trim() || 'Nível Hierárquico';
    }
  }
};

window.handleCareerTrackSubmit = async function(e) {
  if (e && e.preventDefault) e.preventDefault();

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (currentUser && currentUser.role !== 'admin') {
    showToast('⚠️ Apenas Administradores do Sistema têm permissão para cadastrar novas carreiras.', 'error');
    return;
  }

  const roleName = document.getElementById('career-name')?.value.trim();
  const discipline = document.getElementById('career-discipline')?.value.trim();
  const icon = document.getElementById('career-icon')?.value.trim() || '🧭';
  const slug = document.getElementById('career-linked-specialty')?.value.trim();
  const mission = document.getElementById('career-mission')?.value.trim();

  if (!roleName) {
    showToast('Informe o nome da nova carreira.', 'warn');
    document.getElementById('career-name')?.focus();
    return;
  }
  if (!discipline) {
    showToast('Informe a área/disciplina técnica da carreira.', 'warn');
    document.getElementById('career-discipline')?.focus();
    return;
  }
  if (!mission) {
    showToast('Informe a descrição e missão da carreira.', 'warn');
    document.getElementById('career-mission')?.focus();
    return;
  }

  const levelCards = Array.from(document.querySelectorAll('#career-levels-form-container .career-level-form-card'));
  if (levelCards.length === 0) {
    showToast('Adicione ao menos um nível hierárquico com suas competências.', 'warn');
    return;
  }

  const levels = [];
  for (let idx = 0; idx < levelCards.length; idx++) {
    const card = levelCards[idx];
    const name = card.querySelector('.level-name-input')?.value.trim();
    const hardSkillsStr = card.querySelector('.level-hardskills-input')?.value.trim();

    if (!name) {
      showToast(`O nível ${idx + 1} deve ter um título preenchido.`, 'warn');
      card.querySelector('.level-name-input')?.focus();
      return;
    }
    if (!hardSkillsStr) {
      showToast(`O nível ${idx + 1} ("${name}") deve ter competências técnicas (Hard Skills) preenchidas.`, 'warn');
      card.querySelector('.level-hardskills-input')?.focus();
      return;
    }

    const nextLevel = card.querySelector('.level-next-input')?.value.trim() || 
      (idx < levelCards.length - 1 ? (levelCards[idx + 1].querySelector('.level-name-input')?.value.trim() || `Nível ${idx + 2}`) : 'Liderança / Especialista');
    const tag = card.querySelector('.level-tag-input')?.value.trim() || 'Evolução Profissional';
    const focus = card.querySelector('.level-focus-input')?.value.trim() || `Atuação e entregas de ${name}`;
    const softSkillsStr = card.querySelector('.level-softskills-input')?.value.trim() || '';
    const metricTasks = card.querySelector('.level-metric-tasks')?.value.trim() || '4+ demandas';
    const metricComp = card.querySelector('.level-metric-comp')?.value.trim() || 'Média e Alta';
    const metricQa = card.querySelector('.level-metric-qa')?.value.trim() || '≥ 80% aprovação';
    const triggersStr = card.querySelector('.level-triggers-input')?.value.trim() || '';

    const hardSkills = hardSkillsStr.split(',').map(s => s.trim()).filter(Boolean);
    const softSkills = softSkillsStr ? softSkillsStr.split(',').map(s => s.trim()).filter(Boolean) : ['Comunicação', 'Colaboração', 'Proatividade'];
    const triggers = triggersStr ? triggersStr.split('\n').map(s => s.trim()).filter(Boolean) : [
      `Entrega consistente de demandas no nível ${name}`,
      `Conformidade com os padrões de arquitetura e qualidade da squad`
    ];

    const lvlKey = name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '') || `lvl_${idx + 1}`;

    levels.push({
      key: lvlKey,
      name,
      nextLevel,
      tag,
      focus,
      missionDetail: focus,
      hardSkills,
      softSkills,
      metrics: {
        tasks: metricTasks,
        complexity: metricComp,
        qaRate: metricQa,
        hoursVariance: 'Desvio ≤ 25%'
      },
      triggers
    });
  }

  const payload = {
    roleName,
    discipline,
    icon,
    slug: slug || undefined,
    mission,
    levels
  };

  const saveBtn = document.getElementById('btn-save-career');
  const originalBtnHtml = saveBtn ? saveBtn.innerHTML : '';
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span> <span>Salvando Trilha...</span>';
  }

  try {
    let savedTrack = null;
    if (typeof api !== 'undefined' && api.isOnline) {
      const res = await api.apiRequest('/api/careers', 'POST', payload);
      if (res && res.success && res.track) {
        savedTrack = res.track;
      } else {
        throw new Error((res && res.message) || 'Erro ao registrar carreira no backend');
      }
    } else {
      // Modo offline / fallback local
      const generatedId = (payload.slug || payload.roleName.toLowerCase())
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '') || ('career_' + Date.now());
      savedTrack = {
        id: generatedId,
        roleName: payload.roleName,
        discipline: payload.discipline,
        icon: payload.icon,
        mission: payload.mission,
        levels: payload.levels,
        isCustom: true,
        createdAt: new Date().toISOString()
      };
    }

    // 1. Atualizar base de dados em memória
    careerTracksData[savedTrack.id] = savedTrack;

    // 2. Disponibilizar imediatamente para vinculação de colaboradores e demandas
    syncCareerSelects(savedTrack);

    // 3. Atualizar navegação de carreiras e contador
    renderCareerNav();

    // 4. Selecionar a nova trilha imediatamente no painel de carreiras
    activeCareerRole = savedTrack.id;
    activeCareerLevel = (savedTrack.levels && savedTrack.levels[0]) ? savedTrack.levels[0].key : 'junior';
    renderCareer();

    // 5. Fechar modal e limpar formulário
    closeModal('modal-career-track');
    document.getElementById('form-career-track')?.reset();

    showToast(`✅ Nova carreira "${savedTrack.roleName}" cadastrada e disponibilizada imediatamente!`, 'success');
  } catch (err) {
    console.error('Erro ao salvar carreira:', err);
    showToast(`❌ Falha ao cadastrar carreira: ${err.message || 'Erro inesperado'}`, 'error');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = originalBtnHtml;
    }
  }
};

window.deleteCareerTrack = async function(trackId, event) {
  if (event) event.stopPropagation();
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  if (!currentUser || currentUser.role !== 'admin') {
    showToast('⚠️ Apenas Administradores podem excluir estruturas de carreira.', 'error');
    return;
  }
  const track = careerTracksData[trackId];
  if (!track) return;
  if (!track.isCustom) {
    showToast('ℹ️ Trilhas padrão da plataforma não podem ser removidas.', 'warn');
    return;
  }
  if (!confirm(`Deseja realmente remover a trilha "${track.roleName}"?`)) {
    return;
  }

  if (typeof api !== 'undefined' && api.isOnline) {
    await api.apiRequest(`/api/careers/${trackId}`, 'DELETE');
  }
  delete careerTracksData[trackId];
  activeCareerRole = 'frontend';
  activeCareerLevel = 'junior';
  renderCareerNav();
  renderCareer();
  showToast(`Trilha "${track.roleName}" removida com sucesso.`, 'info');
};

// ==============================================================================
// 2.8 MÓDULO DE TEMPLATES DE DOCUMENTOS & IDENTIDADE VISUAL
// ==============================================================================

window.renderTemplates = function() {
  const container = document.getElementById('templates-cards-grid');
  if (!container) return;

  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  const templates = store.getDocumentTemplates();
  const defaultTpl = store.getDefaultTemplate();

  // Atualiza os contadores do topo da tela e da sidebar
  const statBadge = document.getElementById('badge-stat-total-templates');
  if (statBadge) {
    statBadge.textContent = `${templates.length} Modelo${templates.length === 1 ? '' : 's'} Cadastrado${templates.length === 1 ? '' : 's'}`;
  }
  const sideCounter = document.getElementById('counter-nav-templates');
  if (sideCounter) {
    sideCounter.textContent = templates.length;
  }

  container.innerHTML = '';

  if (!templates || templates.length === 0) {
    container.innerHTML = `
      <div class="glass-panel" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center; color: var(--text-muted); border-radius: 8px;">
        <div style="font-size: 2.8rem; margin-bottom: 0.75rem;">🎨</div>
        <h3 style="color: var(--text-main); margin-bottom: 0.5rem;">Nenhum template de documento cadastrado</h3>
        <p style="font-size: 0.85rem; max-width: 480px; margin: 0 auto 1.25rem auto;">Crie modelos com logotipos, paletas de cores e seções personalizadas para emissão de relatórios de medição e requisitos.</p>
        <div style="display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
          <button class="btn btn-primary" onclick="openTemplateModalForCreate()">+ Criar Novo Template</button>
          <button class="btn btn-secondary" onclick="handleResetDefaultTemplates()">🔄 Restaurar Padrões de Fábrica</button>
        </div>
      </div>
    `;
    return;
  }

  templates.forEach(tpl => {
    const isDefault = !!tpl.isDefault;
    const primColor = tpl.primaryColor || '#0284c7';
    const hasLogo = !!tpl.logoUrl;

    const card = document.createElement('div');
    card.className = `template-card glass-panel ${isDefault ? 'is-default-card' : ''}`;
    card.dataset.templateId = tpl.id;

    // Constrói pílulas das seções ativas
    const secPills = [
      tpl.includeUserStory !== false ? '<span class="template-sec-pill active" title="História de Usuário visível">✓ User Story</span>' : '<span class="template-sec-pill inactive" title="História de Usuário oculta">✕ US</span>',
      tpl.includeAcceptanceCriteria !== false ? '<span class="template-sec-pill active" title="Critérios de Aceite BDD visíveis">✓ BDD</span>' : '<span class="template-sec-pill inactive" title="Critérios BDD ocultos">✕ BDD</span>',
      tpl.includeQaEvidence !== false ? '<span class="template-sec-pill active" title="Evidências de QA visíveis">✓ QA</span>' : '<span class="template-sec-pill inactive" title="Evidências QA ocultas">✕ QA</span>',
      tpl.includeSignatures !== false ? '<span class="template-sec-pill active" title="Bloco de Assinaturas e Aceite visível">✓ Assinaturas</span>' : '<span class="template-sec-pill inactive" title="Bloco de Assinaturas oculto">✕ Assinaturas</span>',
      tpl.includeKpis !== false ? '<span class="template-sec-pill active" title="Quadro de Indicadores visível">✓ KPIs</span>' : '<span class="template-sec-pill inactive" title="Quadro de KPIs oculto">✕ KPIs</span>',
      tpl.includeStatusBanner !== false ? '<span class="template-sec-pill active" title="Faixa de Status da Medição visível">✓ Status</span>' : '<span class="template-sec-pill inactive" title="Faixa de Status oculta">✕ Status</span>'
    ].join(' ');

    // Termo de aprovação resumido
    const termSnippet = (tpl.approvalTerms || 'Termo padrão de aceite técnico e homologação contratual.')
      .slice(0, 140) + ((tpl.approvalTerms && tpl.approvalTerms.length > 140) ? '...' : '');

    card.innerHTML = `
      <div class="template-card-header-stripe" style="background: ${primColor}; height: 6px; border-radius: 8px 8px 0 0;"></div>
      
      <div class="template-card-body" style="padding: 1.25rem; display: flex; flex-direction: column; gap: 0.9rem; flex: 1;">
        
        <!-- Cabeçalho do Card: Logo + Título + Badge Padrão -->
        <div style="display: flex; align-items: flex-start; gap: 0.85rem;">
          <div class="template-logo-avatar" style="width: 46px; height: 46px; border-radius: 8px; background: rgba(255,255,255,0.06); border: 1px solid var(--border-medium); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;">
            ${hasLogo 
              ? `<img src="${tpl.logoUrl}" alt="Logo" style="max-width: 100%; max-height: 100%; object-fit: contain;">` 
              : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: ${primColor}22; color: ${primColor}; font-weight: 800; font-size: 1.1rem;">🏢</div>`}
          </div>

          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
              <h3 style="font-size: 1rem; font-weight: 700; margin: 0; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(tpl.name)}">
                ${escapeHtml(tpl.name)}
              </h3>
              ${isDefault ? `
                <span class="badge-subtle badge-default-template" style="font-size: 0.68rem; padding: 2px 7px; color: #38bdf8; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.35); font-weight: 700;">
                  ⭐ Padrão do Sistema
                </span>
              ` : ''}
            </div>
            <p style="font-size: 0.78rem; color: var(--text-secondary); margin: 3px 0 0 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${escapeHtml(tpl.description || '')}">
              ${escapeHtml(tpl.description || 'Modelo de especificação técnica e aceite de requisitos.')}
            </p>
          </div>
        </div>

        <!-- Metadados Visuais do Template -->
        <div class="glass-subpanel" style="padding: 0.65rem 0.85rem; border-radius: 6px; font-size: 0.76rem; display: flex; flex-direction: column; gap: 5px; border: 1px solid var(--border-subtle);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-muted);">Cor Primária:</span>
            <span style="display: inline-flex; align-items: center; gap: 6px; font-family: monospace; font-weight: 700;">
              <span style="width: 13px; height: 13px; border-radius: 3px; background: ${primColor}; display: inline-block; border: 1px solid rgba(255,255,255,0.2);"></span>
              ${primColor}
            </span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-muted);">Título do Documento:</span>
            <strong style="color: var(--text-main); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(tpl.docTitle || '')}">${escapeHtml(tpl.docTitle || 'RELATÓRIO DE MEDIÇÃO')}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="color: var(--text-muted);">Instituição:</span>
            <span style="color: var(--text-secondary); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(tpl.headerInstitution || 'Synchro ALM Pro')}</span>
          </div>
        </div>

        <!-- Seções & Blocos Impressos -->
        <div>
          <div style="font-size: 0.72rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 5px; letter-spacing: 0.3px;">
            Blocos Técnicos Impressos:
          </div>
          <div style="display: flex; gap: 4px; flex-wrap: wrap;">
            ${secPills}
          </div>
        </div>

        <!-- Termo de Aceite Excert -->
        <div style="font-size: 0.73rem; background: rgba(0,0,0,0.12); padding: 0.55rem 0.75rem; border-radius: 6px; border: 1px solid var(--border-subtle); color: var(--text-secondary); line-height: 1.4;">
          <strong style="display: block; font-size: 0.7rem; color: var(--text-muted); margin-bottom: 2px;">Termo de Aceite & Medição:</strong>
          <span style="font-style: italic;">"${escapeHtml(termSnippet)}"</span>
        </div>

        <!-- Ações do Card -->
        <div style="margin-top: auto; padding-top: 0.75rem; border-top: 1px solid var(--border-subtle); display: flex; gap: 6px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
          <div style="display: flex; gap: 4px;">
            ${perms.canManageTemplates ? `
              <button class="btn btn-secondary btn-sm" onclick="openTemplateModalForEdit('${tpl.id}')" title="Editar Configurações do Template">
                <span>✏️ Editar</span>
              </button>
            ` : ''}
            <button class="btn btn-ghost btn-sm" onclick="testTemplatePrint('${tpl.id}')" title="Visualizar Teste de Impressão com este Template">
              <span>🖨️ Prévia</span>
            </button>
            ${perms.canManageTemplates ? `
              <button class="btn btn-ghost btn-sm" onclick="duplicateTemplate('${tpl.id}')" title="Duplicar Template">
                <span>📋 Duplicar</span>
              </button>
            ` : ''}
          </div>

          <div style="display: flex; gap: 4px; align-items: center;">
            ${!isDefault && perms.canManageTemplates ? `
              <button class="btn btn-ghost btn-sm" onclick="setDefaultTemplateAction('${tpl.id}')" title="Tornar este template o padrão do sistema">
                <span>⭐ Padrão</span>
              </button>
            ` : ''}
            ${templates.length > 1 && perms.canManageTemplates ? `
              <button class="btn btn-ghost btn-sm btn-del" onclick="confirmDeleteTemplate('${tpl.id}', '${escapeHtml(tpl.name)}')" title="Excluir Template" style="color: #fb7185;">
                <span>🗑️</span>
              </button>
            ` : ''}
          </div>
        </div>

      </div>
    `;

    container.appendChild(card);
  });
};

// ==============================================================================
// FUNÇÕES DE CRUD E MODAL DE TEMPLATES
// ==============================================================================

window.openTemplateModalForCreate = function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (!perms.canManageTemplates) {
    showToast('Apenas Administradores e Gestores têm permissão para criar templates de documento.', 'error');
    return;
  }

  document.getElementById('modal-template-title').textContent = "🎨 Criar Novo Template de Documento";
  document.getElementById('template-id-edit').value = "";
  document.getElementById('template-logo-base64').value = "";

  const form = document.getElementById('form-document-template');
  if (form) form.reset();

  // Valores padrão de fábrica
  document.getElementById('template-name').value = "";
  document.getElementById('template-primary-color').value = "#0284c7";
  document.getElementById('template-color-picker').value = "#0284c7";
  document.getElementById('template-description').value = "";
  document.getElementById('template-is-default').checked = false;

  document.getElementById('template-doc-title').value = "RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS";
  document.getElementById('template-doc-subtitle').value = "Artefato Oficial de Comprovação de Entrega Técnica para Fins de Faturamento & Aceite";
  document.getElementById('template-header-institution').value = "SYNCHRO ALM PRO — PLATAFORMA INTEGRADA DE ENGENHARIA DE SOFTWARE";

  document.getElementById('toggle-user-story').checked = true;
  document.getElementById('toggle-acceptance-criteria').checked = true;
  document.getElementById('toggle-qa-evidence').checked = true;
  document.getElementById('toggle-signatures').checked = true;
  document.getElementById('toggle-kpis').checked = true;
  document.getElementById('toggle-status-banner').checked = true;

  document.getElementById('template-approval-terms').value = "Pelo presente instrumento, a CONTRATANTE atesta expressamente o pleno recebimento, homologação técnica e aceite formal dos requisitos de software e critérios de aceite descritos neste Relatório de Medição correspondentes à Feature / Marco acima especificado. Declara que os entregáveis foram devidamente verificados e aprovados pelo controle de qualidade (QA), em conformidade com as cláusulas contratuais, autorizando a emissão da Nota Fiscal de Serviços e o respectivo faturamento financeiro.";
  document.getElementById('template-signee-contratada').value = "PELA CONTRATADA (SYNCHRO)";
  document.getElementById('template-signee-contratante').value = "PELA CONTRATANTE (CLIENTE)";
  document.getElementById('template-footer-text').value = "Synchro ALM Pro — Artefato Formal de Medição & Aceite Técnico de Entrega";

  // Reseta visualizador de logo
  const logoImg = document.getElementById('template-logo-img');
  const logoPlaceholder = document.getElementById('template-logo-placeholder');
  const btnRemoveLogo = document.getElementById('btn-remove-logo');
  if (logoImg) { logoImg.src = ""; logoImg.style.display = "none"; }
  if (logoPlaceholder) logoPlaceholder.style.display = "block";
  if (btnRemoveLogo) btnRemoveLogo.style.display = "none";

  updateLiveTemplatePreview();
  openModal('modal-template');
};

window.openTemplateModalForEdit = function(templateId) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (!perms.canManageTemplates) {
    showToast('Apenas Administradores e Gestores têm permissão para editar templates.', 'error');
    return;
  }

  const tpl = store.getTemplateById(templateId);
  if (!tpl) {
    showToast('Template não encontrado.', 'error');
    return;
  }

  document.getElementById('modal-template-title').textContent = `✏️ Editar Template: ${tpl.name}`;
  document.getElementById('template-id-edit').value = tpl.id;
  document.getElementById('template-logo-base64').value = tpl.logoUrl || "";

  document.getElementById('template-name').value = tpl.name || "";
  const primColor = tpl.primaryColor || "#0284c7";
  document.getElementById('template-primary-color').value = primColor;
  document.getElementById('template-color-picker').value = primColor;
  document.getElementById('template-description').value = tpl.description || "";
  document.getElementById('template-is-default').checked = !!tpl.isDefault;

  document.getElementById('template-doc-title').value = tpl.docTitle || "RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS";
  document.getElementById('template-doc-subtitle').value = tpl.docSubtitle || "";
  document.getElementById('template-header-institution').value = tpl.headerInstitution || "SYNCHRO ALM PRO";

  document.getElementById('toggle-user-story').checked = tpl.includeUserStory !== false;
  document.getElementById('toggle-acceptance-criteria').checked = tpl.includeAcceptanceCriteria !== false;
  document.getElementById('toggle-qa-evidence').checked = tpl.includeQaEvidence !== false;
  document.getElementById('toggle-signatures').checked = tpl.includeSignatures !== false;
  document.getElementById('toggle-kpis').checked = tpl.includeKpis !== false;
  document.getElementById('toggle-status-banner').checked = tpl.includeStatusBanner !== false;

  document.getElementById('template-approval-terms').value = tpl.approvalTerms || "";
  document.getElementById('template-signee-contratada').value = tpl.signeeContratadaTitle || "PELA CONTRATADA (SYNCHRO)";
  document.getElementById('template-signee-contratante').value = tpl.signeeContratanteTitle || "PELA CONTRATANTE (CLIENTE)";
  document.getElementById('template-footer-text').value = tpl.footerText || "";

  // Visualizador de logo
  const logoImg = document.getElementById('template-logo-img');
  const logoPlaceholder = document.getElementById('template-logo-placeholder');
  const btnRemoveLogo = document.getElementById('btn-remove-logo');
  if (tpl.logoUrl) {
    if (logoImg) { logoImg.src = tpl.logoUrl; logoImg.style.display = "block"; }
    if (logoPlaceholder) logoPlaceholder.style.display = "none";
    if (btnRemoveLogo) btnRemoveLogo.style.display = "inline-flex";
  } else {
    if (logoImg) { logoImg.src = ""; logoImg.style.display = "none"; }
    if (logoPlaceholder) logoPlaceholder.style.display = "block";
    if (btnRemoveLogo) btnRemoveLogo.style.display = "none";
  }

  updateLiveTemplatePreview();
  openModal('modal-template');
};

window.updateLiveTemplatePreview = function() {
  const docTitle = document.getElementById('template-doc-title')?.value || 'RELATÓRIO DE MEDIÇÃO';
  const docSubtitle = document.getElementById('template-doc-subtitle')?.value || '';
  const institution = document.getElementById('template-header-institution')?.value || 'SYNCHRO ALM PRO';
  const color = document.getElementById('template-primary-color')?.value || '#0284c7';
  const logoBase64 = document.getElementById('template-logo-base64')?.value || '';

  const hasUS = document.getElementById('toggle-user-story')?.checked;
  const hasBDD = document.getElementById('toggle-acceptance-criteria')?.checked;
  const hasQA = document.getElementById('toggle-qa-evidence')?.checked;
  const hasSignatures = document.getElementById('toggle-signatures')?.checked;
  const hasKpis = document.getElementById('toggle-kpis')?.checked;
  const hasStatusBanner = document.getElementById('toggle-status-banner')?.checked;

  const terms = document.getElementById('template-approval-terms')?.value || 'Pelo presente instrumento, a CONTRATANTE atesta o pleno recebimento...';
  const sigContratada = document.getElementById('template-signee-contratada')?.value || 'CONTRATADA';
  const sigContratante = document.getElementById('template-signee-contratante')?.value || 'CONTRATANTE';
  const footerText = document.getElementById('template-footer-text')?.value || 'Synchro ALM Pro';

  // Aplica cores principais
  const miniHeader = document.getElementById('mini-header-bar');
  if (miniHeader) miniHeader.style.background = color;

  const miniTableHead = document.getElementById('mini-table-header');
  if (miniTableHead) miniTableHead.style.background = color;

  // Textos do topo
  const titleEl = document.getElementById('mini-title-text');
  if (titleEl) titleEl.textContent = docTitle;

  const instEl = document.getElementById('mini-institution-text');
  if (instEl) instEl.textContent = institution;

  // Logotipo
  const miniLogoImg = document.getElementById('mini-logo-img');
  const miniLogoPlaceholder = document.getElementById('mini-logo-placeholder');
  if (logoBase64) {
    if (miniLogoImg) { miniLogoImg.src = logoBase64; miniLogoImg.style.display = 'block'; }
    if (miniLogoPlaceholder) miniLogoPlaceholder.style.display = 'none';
  } else {
    if (miniLogoImg) { miniLogoImg.src = ''; miniLogoImg.style.display = 'none'; }
    if (miniLogoPlaceholder) miniLogoPlaceholder.style.display = 'block';
  }

  // Toggles de Blocos
  const kpisBox = document.getElementById('mini-kpis-box');
  if (kpisBox) kpisBox.style.display = hasKpis ? 'grid' : 'none';

  const statusBox = document.getElementById('mini-status-banner-box');
  if (statusBox) statusBox.style.display = hasStatusBanner ? 'block' : 'none';

  const userStoryRow = document.getElementById('mini-userstory-row');
  if (userStoryRow) userStoryRow.style.display = hasUS ? 'block' : 'none';

  const bddRow = document.getElementById('mini-bdd-row');
  if (bddRow) bddRow.style.display = hasBDD ? 'block' : 'none';

  const qaRow = document.getElementById('mini-qa-row');
  if (qaRow) qaRow.style.display = hasQA ? 'block' : 'none';

  const termsBox = document.getElementById('mini-terms-box');
  const termsText = document.getElementById('mini-terms-text');
  if (termsBox) termsBox.style.display = hasSignatures ? 'block' : 'none';
  if (termsText) termsText.textContent = terms.slice(0, 100) + (terms.length > 100 ? '...' : '');

  const signaturesBox = document.getElementById('mini-signatures-box');
  if (signaturesBox) signaturesBox.style.display = hasSignatures ? 'grid' : 'none';

  const sigContratadaEl = document.getElementById('mini-sig-contratada');
  if (sigContratadaEl) sigContratadaEl.textContent = sigContratada;

  const sigContratanteEl = document.getElementById('mini-sig-contratante');
  if (sigContratanteEl) sigContratanteEl.textContent = sigContratante;

  const footerTextEl = document.getElementById('mini-footer-text');
  if (footerTextEl) footerTextEl.textContent = footerText;
};

window.duplicateTemplate = async function(templateId) {
  const original = store.getTemplateById(templateId);
  if (!original) return;

  const copyPayload = {
    ...original,
    name: `${original.name} (Cópia)`,
    isDefault: false
  };
  delete copyPayload.id;
  delete copyPayload.createdAt;
  delete copyPayload.updatedAt;

  try {
    const created = await store.createTemplate(copyPayload);
    showToast(`Template duplicado com sucesso: "${created.name}"`);
    renderTemplates();
    updateSidebarCounters();
    openTemplateModalForEdit(created.id);
  } catch (err) {
    showToast(`Erro ao duplicar template: ${err.message}`, 'error');
  }
};

window.setDefaultTemplateAction = async function(templateId) {
  const tpl = store.getTemplateById(templateId);
  if (!tpl) return;

  try {
    await store.setDefaultTemplate(templateId);
    showToast(`O template "${tpl.name}" agora é o modelo padrão de exportação!`, 'success');
    renderTemplates();
    refreshAllUI();
  } catch (err) {
    showToast(`Erro ao definir template padrão: ${err.message}`, 'error');
  }
};

window.confirmDeleteTemplate = async function(templateId, templateName) {
  const templates = store.getDocumentTemplates();
  if (templates.length <= 1) {
    showToast('Não é possível excluir o único template restante no sistema.', 'warn');
    return;
  }

  if (confirm(`Deseja realmente excluir o template de documento "${templateName}"?\n\nEsta operação será registrada no log de auditoria.`)) {
    try {
      await store.deleteTemplate(templateId);
      showToast(`Template "${templateName}" excluído com sucesso.`, 'info');
      renderTemplates();
      updateSidebarCounters();
      refreshAllUI();
    } catch (err) {
      showToast(`Erro ao excluir template: ${err.message}`, 'error');
    }
  }
};

window.handleResetDefaultTemplates = async function() {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;

  if (!perms.canManageTemplates) {
    showToast('Apenas Administradores e Gestores podem restaurar templates.', 'error');
    return;
  }

  if (confirm('Deseja restaurar a coleção original de templates de fábrica da plataforma?\n\nOs templates padrão (Oficial, Enterprise e Sprint Spec) serão redefinidos.')) {
    try {
      await store.resetDefaultTemplates();
      showToast('Templates padrão restaurados com sucesso!', 'success');
      renderTemplates();
      updateSidebarCounters();
      refreshAllUI();
    } catch (err) {
      showToast(`Erro ao restaurar templates: ${err.message}`, 'error');
    }
  }
};

window.testTemplatePrint = function(templateId) {
  const tpl = store.getTemplateById(templateId) || store.getDefaultTemplate();
  if (!tpl) {
    showToast('Template não encontrado.', 'error');
    return;
  }

  // Gera uma janela de impressão de amostra com dados de demonstração
  const printWin = window.open('', '_blank', 'width=980,height=800');
  if (!printWin) {
    showToast('Bloqueador de popups impediu a pré-visualização. Permita popups para este site.', 'warn');
    return;
  }

  const primColor = tpl.primaryColor || '#0284c7';
  const htmlContent = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <title>Pré-visualização: ${escapeHtml(tpl.name)}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; padding: 30px; margin: 0; background: #fff; font-size: 13px; line-height: 1.5; }
        .doc-header { border-bottom: 2px solid ${primColor}; padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        .brand { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 700; }
        .title { font-size: 20px; font-weight: 800; color: ${primColor}; margin: 4px 0; }
        .subtitle { font-size: 12px; color: #475569; }
        .header-logo { max-height: 52px; max-width: 140px; object-fit: contain; }
        .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 18px; font-size: 12px; }
        .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
        .kpi-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center; }
        .kpi-card strong { display: block; font-size: 18px; color: ${primColor}; }
        .kpi-card span { font-size: 11px; color: #64748b; }
        .status-banner { background: #ecfdf5; border: 1px solid #10b981; color: #065f46; border-radius: 6px; padding: 10px 14px; font-weight: 700; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
        th { background: ${primColor}; color: #ffffff; text-align: left; padding: 9px 10px; font-size: 11.5px; text-transform: uppercase; }
        td { border-bottom: 1px solid #e2e8f0; padding: 10px; font-size: 12px; vertical-align: top; }
        .bdd-box { font-family: monospace; font-size: 11px; color: #0369a1; background: #f0f9ff; padding: 6px 8px; border-radius: 4px; margin-top: 4px; }
        .qa-approved { color: #059669; font-weight: 700; }
        .terms-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px; font-size: 11.5px; color: #334155; margin-top: 25px; line-height: 1.6; text-align: justify; }
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 50px; margin-top: 50px; text-align: center; }
        .sig-line { border-top: 1px solid #475569; padding-top: 6px; font-weight: 700; font-size: 11.5px; }
        .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
        @media print {
          body { padding: 0; }
          button.no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <div style="margin-bottom: 15px; display: flex; justify-content: space-between; align-items: center;" class="no-print">
        <span style="font-size: 12px; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 4px; font-weight: 600;">
          🎨 Visualizando com Template: <strong>${escapeHtml(tpl.name)}</strong>
        </span>
        <button onclick="window.print()" style="background: ${primColor}; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">
          🖨️ Imprimir / Salvar PDF
        </button>
      </div>

      <div class="doc-header">
        <div>
          <div class="brand">${escapeHtml(tpl.headerInstitution || 'Synchro ALM Pro')}</div>
          <h1 class="title">${escapeHtml(tpl.docTitle || 'RELATÓRIO FORMAL DE MEDIÇÃO')}</h1>
          <p class="subtitle">${escapeHtml(tpl.docSubtitle || '')}</p>
        </div>
        ${tpl.logoUrl ? `<img src="${tpl.logoUrl}" class="header-logo" alt="Logo">` : ''}
      </div>

      <div class="meta-box">
        <div><strong>Projeto Exemplo:</strong> Sistema Corporativo de Pagamentos</div>
        <div><strong>Data de Emissão:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
        <div><strong>Módulo / Feature:</strong> Autenticação & Pix Checkout</div>
        <div><strong>Status da Entrega:</strong> 100% Homologado pelo QA</div>
      </div>

      ${tpl.includeKpis !== false ? `
        <div class="kpi-row">
          <div class="kpi-card"><strong>3</strong><span>Requisitos no Escopo</span></div>
          <div class="kpi-card"><strong>3</strong><span>Validados em QA</span></div>
          <div class="kpi-card"><strong>3</strong><span>Cenários BDD</span></div>
          <div class="kpi-card"><strong>100%</strong><span>Taxa de Homologação</span></div>
        </div>
      ` : ''}

      ${tpl.includeStatusBanner !== false ? `
        <div class="status-banner">
          <span>STATUS: HOMOLOGAÇÃO TÉCNICA CONCLUÍDA</span>
          <span>Apto para Faturamento & Aceite Formal</span>
        </div>
      ` : ''}

      <table>
        <thead>
          <tr>
            <th style="width: 75px;">Código</th>
            <th style="width: 130px;">Título</th>
            <th>${tpl.includeUserStory !== false ? 'Especificação & User Story' : 'Especificação Técnica'}</th>
            ${tpl.includeAcceptanceCriteria !== false ? '<th>Critérios BDD</th>' : ''}
            ${tpl.includeQaEvidence !== false ? '<th>Validação QA</th>' : ''}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>RF-01</strong></td>
            <td><strong>Autenticação MFA</strong></td>
            <td>
              ${tpl.includeUserStory !== false ? '<p><strong>User Story:</strong> Como correntista, quero autenticação em 2 fatores para proteger transações.</p>' : ''}
              Requisito funcional de autenticação segura via TOTP e SMS.
            </td>
            ${tpl.includeAcceptanceCriteria !== false ? '<td><div class="bdd-box">Dado que o usuário insere a senha<br>Quando solicitar código OTP<br>Então o sistema valida em até 60s</div></td>' : ''}
            ${tpl.includeQaEvidence !== false ? '<td><span class="qa-approved">✓ Homologado</span><br><small>Testes unitários e E2E aprovados</small></td>' : ''}
          </tr>
          <tr>
            <td><strong>RF-02</strong></td>
            <td><strong>Chaves Pix</strong></td>
            <td>
              ${tpl.includeUserStory !== false ? '<p><strong>User Story:</strong> Como pagador, quero cadastrar chave aleatória para receber pagamentos.</p>' : ''}
              Mecanismo de consulta e validação no DICT do Bacen.
            </td>
            ${tpl.includeAcceptanceCriteria !== false ? '<td><div class="bdd-box">Dado uma chave válida<br>Quando registrar no DICT<br>Então confirma vínculo</div></td>' : ''}
            ${tpl.includeQaEvidence !== false ? '<td><span class="qa-approved">✓ Homologado</span><br><small>Mock Bacen aprovado</small></td>' : ''}
          </tr>
        </tbody>
      </table>

      ${tpl.approvalTerms ? `
        <div class="terms-box">
          <strong style="display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase;">Termo de Aceite & Medição Técnica:</strong>
          ${escapeHtml(tpl.approvalTerms)}
        </div>
      ` : ''}

      ${tpl.includeSignatures !== false ? `
        <div class="signatures">
          <div>
            <div class="sig-line">${escapeHtml(tpl.signeeContratadaTitle || 'PELA CONTRATADA (SYNCHRO)')}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 3px;">Assinatura do Responsável Técnico</div>
          </div>
          <div>
            <div class="sig-line">${escapeHtml(tpl.signeeContratanteTitle || 'PELA CONTRATANTE (CLIENTE)')}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 3px;">Assinatura do Gestor do Contrato / Fiscal</div>
          </div>
        </div>
      ` : ''}

      <div class="footer">
        <span>${escapeHtml(tpl.footerText || 'Synchro ALM Pro')}</span>
        <span>Folha 1 de 1</span>
      </div>
    </body>
    </html>
  `;

  printWin.document.open();
  printWin.document.write(htmlContent);
  printWin.document.close();
};

window.setupTemplateEventListeners = function() {
  const form = document.getElementById('form-document-template');
  if (form && !form.dataset.initialized) {
    form.dataset.initialized = 'true';

    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const id = document.getElementById('template-id-edit')?.value.trim();
      const name = document.getElementById('template-name')?.value.trim();
      const primaryColor = document.getElementById('template-primary-color')?.value.trim() || '#0284c7';
      const description = document.getElementById('template-description')?.value.trim();
      const isDefault = document.getElementById('template-is-default')?.checked;

      const logoUrl = document.getElementById('template-logo-base64')?.value || '';
      const docTitle = document.getElementById('template-doc-title')?.value.trim() || 'RELATÓRIO FORMAL DE MEDIÇÃO & DOCUMENTO DE REQUISITOS';
      const docSubtitle = document.getElementById('template-doc-subtitle')?.value.trim();
      const headerInstitution = document.getElementById('template-header-institution')?.value.trim();

      const includeUserStory = document.getElementById('toggle-user-story')?.checked;
      const includeAcceptanceCriteria = document.getElementById('toggle-acceptance-criteria')?.checked;
      const includeQaEvidence = document.getElementById('toggle-qa-evidence')?.checked;
      const includeSignatures = document.getElementById('toggle-signatures')?.checked;
      const includeKpis = document.getElementById('toggle-kpis')?.checked;
      const includeStatusBanner = document.getElementById('toggle-status-banner')?.checked;

      const approvalTerms = document.getElementById('template-approval-terms')?.value.trim();
      const signeeContratadaTitle = document.getElementById('template-signee-contratada')?.value.trim() || 'PELA CONTRATADA (SYNCHRO)';
      const signeeContratanteTitle = document.getElementById('template-signee-contratante')?.value.trim() || 'PELA CONTRATANTE (CLIENTE)';
      const footerText = document.getElementById('template-footer-text')?.value.trim();

      if (!name) {
        showToast('Informe o nome do template.', 'warn');
        document.getElementById('template-name')?.focus();
        return;
      }

      const payload = {
        name,
        primaryColor,
        description,
        isDefault,
        logoUrl,
        docTitle,
        docSubtitle,
        headerInstitution,
        includeUserStory,
        includeAcceptanceCriteria,
        includeQaEvidence,
        includeSignatures,
        includeKpis,
        includeStatusBanner,
        approvalTerms,
        signeeContratadaTitle,
        signeeContratanteTitle,
        footerText
      };

      const saveBtn = document.getElementById('btn-save-template');
      const originalText = saveBtn ? saveBtn.innerHTML : '';
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span>⏳ Salvando...</span>';
      }

      try {
        if (id) {
          await store.updateTemplate(id, payload);
          showToast(`Template "${name}" atualizado com sucesso!`, 'success');
        } else {
          const created = await store.createTemplate(payload);
          showToast(`Template "${name}" criado com sucesso!`, 'success');
        }

        closeModal('modal-template');
        renderTemplates();
        updateSidebarCounters();
        refreshAllUI();
      } catch (err) {
        showToast(`Erro ao salvar template: ${err.message}`, 'error');
      } finally {
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.innerHTML = originalText;
        }
      }
    });
  }

  // Seletor de Cores e Paletas Rápidas
  const colorPicker = document.getElementById('template-color-picker');
  const colorInput = document.getElementById('template-primary-color');

  if (colorPicker && !colorPicker.dataset.initialized) {
    colorPicker.dataset.initialized = 'true';
    colorPicker.addEventListener('input', (e) => {
      if (colorInput) colorInput.value = e.target.value.toUpperCase();
      updateLiveTemplatePreview();
    });
  }

  if (colorInput && !colorInput.dataset.initialized) {
    colorInput.dataset.initialized = 'true';
    colorInput.addEventListener('input', (e) => {
      let val = e.target.value;
      if (val && !val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
        if (colorPicker) colorPicker.value = val;
        updateLiveTemplatePreview();
      }
    });
  }

  document.querySelectorAll('.btn-color-swatch').forEach(swatch => {
    if (!swatch.dataset.initialized) {
      swatch.dataset.initialized = 'true';
      swatch.addEventListener('click', () => {
        const c = swatch.dataset.color;
        if (c) {
          if (colorPicker) colorPicker.value = c;
          if (colorInput) colorInput.value = c.toUpperCase();
          updateLiveTemplatePreview();
        }
      });
    }
  });

  // Upload e Remoção de Logotipo
  const logoFileInput = document.getElementById('template-logo-file');
  const btnChooseLogo = document.getElementById('btn-choose-logo');
  const btnRemoveLogo = document.getElementById('btn-remove-logo');
  const logoBase64Input = document.getElementById('template-logo-base64');
  const logoImg = document.getElementById('template-logo-img');
  const logoPlaceholder = document.getElementById('template-logo-placeholder');

  if (btnChooseLogo && logoFileInput && !btnChooseLogo.dataset.initialized) {
    btnChooseLogo.dataset.initialized = 'true';
    btnChooseLogo.addEventListener('click', () => {
      logoFileInput.click();
    });
  }

  if (logoFileInput && !logoFileInput.dataset.initialized) {
    logoFileInput.dataset.initialized = 'true';
    logoFileInput.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (file.size > 2.5 * 1024 * 1024) {
        showToast('O arquivo de imagem é muito grande. Escolha uma imagem de até 2MB.', 'warn');
        return;
      }

      const reader = new FileReader();
      reader.onload = function(evt) {
        const base64Data = evt.target.result;
        if (logoBase64Input) logoBase64Input.value = base64Data;
        if (logoImg) {
          logoImg.src = base64Data;
          logoImg.style.display = 'block';
        }
        if (logoPlaceholder) logoPlaceholder.style.display = 'none';
        if (btnRemoveLogo) btnRemoveLogo.style.display = 'inline-flex';
        updateLiveTemplatePreview();
        showToast('Logotipo carregado com sucesso!');
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnRemoveLogo && !btnRemoveLogo.dataset.initialized) {
    btnRemoveLogo.dataset.initialized = 'true';
    btnRemoveLogo.addEventListener('click', () => {
      if (logoBase64Input) logoBase64Input.value = '';
      if (logoFileInput) logoFileInput.value = '';
      if (logoImg) {
        logoImg.src = '';
        logoImg.style.display = 'none';
      }
      if (logoPlaceholder) logoPlaceholder.style.display = 'block';
      if (btnRemoveLogo) btnRemoveLogo.style.display = 'none';
      updateLiveTemplatePreview();
      showToast('Logotipo removido do modelo.', 'info');
    });
  }

  // Gatilhos de Live Preview para inputs de texto e checkboxes
  const livePreviewTriggers = [
    'template-name',
    'template-doc-title',
    'template-doc-subtitle',
    'template-header-institution',
    'template-approval-terms',
    'template-signee-contratada',
    'template-signee-contratante',
    'template-footer-text',
    'toggle-user-story',
    'toggle-acceptance-criteria',
    'toggle-qa-evidence',
    'toggle-signatures',
    'toggle-kpis',
    'toggle-status-banner'
  ];

  livePreviewTriggers.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.previewInit) {
      el.dataset.previewInit = 'true';
      el.addEventListener('input', updateLiveTemplatePreview);
      el.addEventListener('change', updateLiveTemplatePreview);
    }
  });
};

// ==============================================================================
// 15. MÓDULO DE ANÁLISE DE PONTOS DE FUNÇÃO (APF • IFPUG CPM 4.3.1)
// ==============================================================================

/**
 * Retorna a categoria da função IFPUG ('Dados' ou 'Transação')
 */
function getApfCategory(type) {
  const t = (type || '').toUpperCase().trim();
  if (t === 'ALI' || t === 'AIE') return 'Dados';
  return 'Transação';
}
window.getApfCategory = getApfCategory;

/**
 * Matrizes de Decisão de Complexidade Funcional do IFPUG (CPM 4.3.1)
 * @param {string} type Tipo de Função: 'ALI', 'AIE', 'EE', 'SE', 'CE'
 * @param {number} arTr Quantidade de Arquivos Referenciados (AR/FTR) ou Tipos de Registro (TR/RET)
 * @param {number} td Quantidade de Tipos de Dados (TD/DET)
 * @returns {string} 'Baixa', 'Média' ou 'Alta'
 */
function calculateApfComplexity(type, arTr, td) {
  const normType = (type || '').toUpperCase().trim();
  const arTrVal = Math.max(0, parseInt(arTr, 10) || 0);
  const tdVal = Math.max(1, parseInt(td, 10) || 1);

  // 1. Funções de Dados: ALI (Arquivo Lógico Interno) e AIE (Arquivo de Interface Externa)
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

  // 2. Função de Transação: EE (Entrada Externa)
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

  // 3. Função de Transação: SE (Saída Externa)
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

  // 4. Função de Transação: CE (Consulta Externa)
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
window.calculateApfComplexity = calculateApfComplexity;

// Tabela Oficial de Pontos de Função Não Ajustados (PF Bruto IFPUG)
const IFPUG_RAW_PF = {
  ALI: { 'Baixa': 7, 'Média': 10, 'Alta': 15 },
  AIE: { 'Baixa': 5, 'Média': 7,  'Alta': 10 },
  EE:  { 'Baixa': 3, 'Média': 4,  'Alta': 6  },
  SE:  { 'Baixa': 4, 'Média': 5,  'Alta': 7  },
  CE:  { 'Baixa': 3, 'Média': 4,  'Alta': 6  }
};
window.IFPUG_RAW_PF = IFPUG_RAW_PF;

function calculateApfRawPf(type, complexity) {
  const normType = (type || '').toUpperCase().trim();
  const c = complexity || 'Média';
  if (IFPUG_RAW_PF[normType] && IFPUG_RAW_PF[normType][c] !== undefined) {
    return IFPUG_RAW_PF[normType][c];
  }
  return 4;
}
window.calculateApfRawPf = calculateApfRawPf;

// Fatores de Redução Padrão por Tipo de Contagem
const COUNTING_TYPE_DEFAULT_FACTORS = {
  'Desenvolvimento': 1.0,
  'Melhoria': 1.0,
  'Testes': 0.30,
  'Transferência Tecnológica': 0.20
};
window.COUNTING_TYPE_DEFAULT_FACTORS = COUNTING_TYPE_DEFAULT_FACTORS;

function getCountingTypeDefaultFactor(countingType, customFactor) {
  if (customFactor !== undefined && customFactor !== null && !isNaN(parseFloat(customFactor))) {
    return Math.max(0, parseFloat(customFactor));
  }
  return COUNTING_TYPE_DEFAULT_FACTORS[countingType] !== undefined ? COUNTING_TYPE_DEFAULT_FACTORS[countingType] : 1.0;
}
window.getCountingTypeDefaultFactor = getCountingTypeDefaultFactor;

function calculateApfFinalPf(rawPf, factor) {
  const f = parseFloat(factor);
  const factorVal = isNaN(f) ? 1.0 : f;
  return Math.round((rawPf * factorVal) * 100) / 100;
}
window.calculateApfFinalPf = calculateApfFinalPf;

function getApfCalculationExplanation(type, arTr, td, complexity, rawPf, countingType, factor, finalPf) {
  const normType = (type || 'EE').toUpperCase().trim();
  const cat = getApfCategory(normType);
  const arTrLabel = (normType === 'ALI' || normType === 'AIE') ? `${arTr} TR(s)` : `${arTr} AR(s)`;
  const factorPct = Math.round((parseFloat(factor) || 1.0) * 100);
  return `Matriz IFPUG CPM 4.3.1: ${normType} (${cat}) com ${arTrLabel} e ${td} TD(s) ➔ Complexidade ${complexity} (${rawPf} PF Bruto). Redutor do Tipo de Contagem "${countingType}" (${factorPct}%) ➔ ${finalPf.toFixed(2)} PF Final.`;
}

/**
 * Renderização Principal da Tela de APF & Faturamento Global
 */
function renderApf() {
  const activeProjId = store.selectedProject;
  const projectLabel = document.getElementById('apf-current-project-label');
  if (projectLabel) {
    if (activeProjId === 'all') {
      projectLabel.textContent = 'Todos os Projetos';
    } else {
      const p = store.getProjectById(activeProjId);
      projectLabel.textContent = p ? p.name : 'Projeto Selecionado';
    }
  }

  // Atualiza opções do select de escopo de features
  const featureSelect = document.getElementById('apf-scope-feature-select');
  if (featureSelect) {
    const curVal = store.apfFeatureFilter || 'all';
    const features = store.getProjectFeatures ? store.getProjectFeatures(activeProjId) : [];
    featureSelect.innerHTML = `<option value="all">Todas as Features</option>` +
      features.map(f => `<option value="${f}" ${f === curVal ? 'selected' : ''}>${f}</option>`).join('');
  }

  // Obtém lista filtrada de Funções IFPUG e de Itens Não-Mensuráveis
  const items = store.getApfItems();
  const inmItems = store.getApfInmItems();

  // KPIs de Funções IFPUG
  let totalRawPf = 0;
  let totalFinalPf = 0;
  let dataItemsCount = 0;
  let dataPfSum = 0;
  let dataRawPf = 0;
  let transItemsCount = 0;
  let transPfSum = 0;
  let transRawPf = 0;
  let countLow = 0;
  let countMed = 0;
  let countHigh = 0;
  const countingMap = {
    'Desenvolvimento': 0,
    'Melhoria': 0,
    'Testes': 0,
    'Transferência Tecnológica': 0
  };

  items.forEach(it => {
    const raw = parseFloat(it.rawPf) || 0;
    const finalVal = parseFloat(it.finalPf) || 0;
    totalRawPf += raw;
    totalFinalPf += finalVal;

    if (it.category === 'Dados' || it.functionType === 'ALI' || it.functionType === 'AIE') {
      dataItemsCount++;
      dataPfSum += finalVal;
      dataRawPf += raw;
    } else {
      transItemsCount++;
      transPfSum += finalVal;
      transRawPf += raw;
    }

    if (it.complexity === 'Baixa') countLow++;
    else if (it.complexity === 'Alta') countHigh++;
    else countMed++;

    if (it.countingType && countingMap[it.countingType] !== undefined) {
      countingMap[it.countingType]++;
    }
  });

  // KPIs de Itens Não-Mensuráveis (FPN)
  let totalInmPf = 0;
  inmItems.forEach(it => {
    totalInmPf += parseFloat(it.calculatedPf) || 0;
  });
  totalInmPf = Math.round(totalInmPf * 100) / 100;

  // Total Global Faturável da Entrega: IFPUG Líquido + FPN
  const totalGlobalPf = Math.round((totalFinalPf + totalInmPf) * 100) / 100;

  // Atualiza badges e números dos KPIs Principais
  const elGlobalPf = document.getElementById('apf-kpi-global-pf');
  if (elGlobalPf) elGlobalPf.textContent = totalGlobalPf.toFixed(2);

  const elGlobalBreakdown = document.getElementById('apf-kpi-global-breakdown');
  if (elGlobalBreakdown) elGlobalBreakdown.textContent = `IFPUG: ${totalFinalPf.toFixed(2)} PF | FPN: ${totalInmPf.toFixed(2)} PF`;

  const elFinal = document.getElementById('apf-kpi-total-final');
  if (elFinal) elFinal.textContent = totalFinalPf.toFixed(2);

  const elTotalInm = document.getElementById('apf-kpi-total-inm');
  if (elTotalInm) elTotalInm.textContent = totalInmPf.toFixed(2);

  const elInmCount = document.getElementById('apf-kpi-inm-count');
  if (elInmCount) elInmCount.textContent = `${inmItems.length} Intervenç${inmItems.length === 1 ? 'ão' : 'ões'} técnica${inmItems.length === 1 ? '' : 's'}`;

  const elBadgeIfpug = document.getElementById('badge-tab-ifpug-count');
  if (elBadgeIfpug) elBadgeIfpug.textContent = items.length;

  const elBadgeInm = document.getElementById('badge-tab-inm-count');
  if (elBadgeInm) elBadgeInm.textContent = inmItems.length;

  const elRaw = document.getElementById('apf-kpi-total-raw');
  if (elRaw) elRaw.textContent = Math.round(totalRawPf);

  const elTotalItems = document.getElementById('apf-kpi-total-items');
  if (elTotalItems) elTotalItems.textContent = `${items.length} Função${items.length === 1 ? '' : 'ões'} cadastrada${items.length === 1 ? '' : 's'}`;

  const elAvgFactor = document.getElementById('apf-kpi-avg-factor');
  if (elAvgFactor) {
    const avgPct = totalRawPf > 0 ? Math.round((totalFinalPf / totalRawPf) * 100) : 100;
    elAvgFactor.textContent = `Fator médio ponderado: ${avgPct}%`;
  }

  const elDataTransPf = document.getElementById('apf-kpi-data-trans-pf');
  if (elDataTransPf) elDataTransPf.textContent = `${dataPfSum.toFixed(1)} / ${transPfSum.toFixed(1)}`;

  const elDataTransCount = document.getElementById('apf-kpi-data-trans-count');
  if (elDataTransCount) elDataTransCount.textContent = `${dataItemsCount} Dados | ${transItemsCount} Transações`;

  const elLow = document.getElementById('apf-kpi-low-count');
  if (elLow) elLow.textContent = `${countLow} Baixa`;
  const elMed = document.getElementById('apf-kpi-med-count');
  if (elMed) elMed.textContent = `${countMed} Média`;
  const elHigh = document.getElementById('apf-kpi-high-count');
  if (elHigh) elHigh.textContent = `${countHigh} Alta`;

  const elScopeBadge = document.getElementById('apf-scope-count-badge');
  if (elScopeBadge) elScopeBadge.textContent = `${items.length + inmItems.length} Itens (${totalGlobalPf.toFixed(2)} PF Global)`;

  // Atualiza contador da sidebar
  updateSidebarCounters();

  // Controle de Sub-Abas: IFPUG vs Não-Mensuráveis (FPN) vs Resumo
  const activeSubnavTab = store.apfSubnavTab || 'ifpug';
  const tabIfpug = document.getElementById('apf-ifpug-tab-content');
  const tabInm = document.getElementById('apf-inm-tab-content');
  const tabSummary = document.getElementById('apf-summary-tab-content');

  document.querySelectorAll('#apf-subnav-tabs .segment-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-apf-tab') === activeSubnavTab);
  });

  if (tabIfpug) tabIfpug.style.display = activeSubnavTab === 'ifpug' ? 'block' : 'none';
  if (tabInm) tabInm.style.display = activeSubnavTab === 'inm' ? 'block' : 'none';
  if (tabSummary) tabSummary.style.display = activeSubnavTab === 'summary' ? 'block' : 'none';

  if (activeSubnavTab === 'inm') {
    renderApfInm();
    return;
  }

  if (activeSubnavTab === 'summary') {
    renderApfSummary(items, inmItems, totalRawPf, totalFinalPf, totalInmPf, totalGlobalPf, dataItemsCount, dataRawPf, dataPfSum, transItemsCount, transRawPf, transPfSum);
    return;
  }

  // Renderização da Aba 1 (IFPUG): Alterna Empty State vs Tabela / Cards
  const emptyState = document.getElementById('apf-empty-state');
  const tableWrapper = document.getElementById('apf-table-wrapper');
  const cardsContainer = document.getElementById('apf-cards-container');

  if (items.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (cardsContainer) cardsContainer.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  const viewMode = store.apfViewMode || 'table';

  if (viewMode === 'cards') {
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (cardsContainer) {
      cardsContainer.style.display = 'grid';
      renderApfCardsView(items, cardsContainer);
    }
  } else {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (tableWrapper) {
      tableWrapper.style.display = 'block';
      const tbody = document.getElementById('apf-items-tbody');
      if (tbody) renderApfTableView(items, tbody);
    }
  }
}
window.renderApf = renderApf;

/**
 * Renderização dos Itens Não-Mensuráveis (FPN)
 */
function renderApfInm() {
  const inmItems = store.getApfInmItems();
  const emptyState = document.getElementById('apf-inm-empty-state');
  const tableWrapper = document.getElementById('apf-inm-table-wrapper');
  const cardsContainer = document.getElementById('apf-inm-cards-container');
  const tbody = document.getElementById('apf-inm-tbody');

  if (inmItems.length === 0) {
    if (emptyState) emptyState.style.display = 'block';
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (cardsContainer) cardsContainer.style.display = 'none';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  const mode = store.apfInmViewMode || 'table';
  if (mode === 'cards') {
    if (tableWrapper) tableWrapper.style.display = 'none';
    if (cardsContainer) {
      cardsContainer.style.display = 'grid';
      renderApfInmCards(inmItems, cardsContainer);
    }
  } else {
    if (cardsContainer) cardsContainer.style.display = 'none';
    if (tableWrapper) {
      tableWrapper.style.display = 'block';
      if (tbody) renderApfInmTable(inmItems, tbody);
    }
  }
}
window.renderApfInm = renderApfInm;

function renderApfInmTable(items, tbody) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  const canManage = perms.canManageApf;

  tbody.innerHTML = items.map(it => {
    const badgeClass = getInmCategoryBadgeClass(it.category);
    const reqBadge = it.reqCode ?
      `<a href="javascript:void(0)" onclick="switchView('requirements');" title="${it.reqTitle || ''}" style="color: #38bdf8; text-decoration: none; font-size: 0.76rem; font-weight: 600;">📋 ${it.reqCode}</a>` :
      `<span style="color: var(--text-muted); font-size: 0.74rem;">-</span>`;

    const evidenceHtml = it.evidence ?
      `<span class="badge-subtle" title="${it.evidence}" style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: inline-block;">🔗 ${it.evidence}</span>` :
      `<span style="color: var(--text-muted); font-size: 0.74rem;">-</span>`;

    return `
      <tr data-inm-id="${it.id}">
        <td style="padding: 12px 14px;">
          <span class="apf-code-badge" style="background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 800;">${it.code}</span>
        </td>
        <td style="padding: 12px 14px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <strong style="color: var(--text-main); font-size: 0.88rem;">${it.itemName}</strong>
            <span class="tag-inm-badge ${badgeClass}" style="align-self: flex-start;">${it.category}</span>
          </div>
        </td>
        <td style="padding: 12px 14px; max-width: 260px;">
          <span style="color: var(--text-secondary); font-size: 0.82rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${it.description || 'Intervenção técnica sem descrição adicional.'}</span>
        </td>
        <td style="padding: 12px 14px;">
          <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 0.82rem; font-weight: 600; color: var(--text-main);">${it.projectCode || it.projectName || 'Geral'}</span>
            ${it.feature ? `<small style="color: var(--text-muted); font-size: 0.74rem;">🧩 ${it.feature}</small>` : ''}
            <div>${reqBadge}</div>
          </div>
        </td>
        <td style="padding: 12px 14px; text-align: center;">
          <strong style="font-size: 0.95rem; color: #38bdf8; font-family: 'Outfit', sans-serif;">${it.quantity}</strong>
        </td>
        <td style="padding: 12px 14px; text-align: center;">
          <span style="color: #818cf8; font-weight: 700; font-size: 0.88rem;">${parseFloat(it.unitWeight).toFixed(2)}</span>
          <small style="color: var(--text-muted); font-size: 0.72rem; display: block;">PF/un</small>
        </td>
        <td style="padding: 12px 14px; text-align: right;">
          <strong class="apf-final-pf-value" style="color: #10b981; font-size: 1.1rem;">${parseFloat(it.calculatedPf).toFixed(2)}</strong>
          <span style="color: #10b981; font-size: 0.78rem; font-weight: 700;">PF</span>
        </td>
        <td style="padding: 12px 14px;">
          ${evidenceHtml}
        </td>
        <td style="padding: 12px 14px; text-align: right; white-space: nowrap;">
          ${canManage ? `
            <div style="display: flex; gap: 6px; justify-content: flex-end;">
              <button class="btn btn-ghost btn-xs" onclick="openApfInmModal('${it.id}')" title="Editar item não-mensurável">
                <span>✏️</span>
              </button>
              <button class="btn btn-ghost btn-xs text-danger" onclick="handleDeleteApfInmItem('${it.id}')" title="Excluir item não-mensurável">
                <span>🗑️</span>
              </button>
            </div>
          ` : `<span style="color: var(--text-muted); font-size: 0.74rem;">Somente Leitura</span>`}
        </td>
      </tr>
    `;
  }).join('');
}

function renderApfInmCards(items, container) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  const canManage = perms.canManageApf;

  container.innerHTML = items.map(it => {
    const badgeClass = getInmCategoryBadgeClass(it.category);
    return `
      <div class="inm-item-card glass-panel" data-inm-id="${it.id}">
        <div class="inm-card-header">
          <div>
            <span class="apf-code-badge" style="background: rgba(16, 185, 129, 0.12); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); font-weight: 800;">${it.code}</span>
            <span class="tag-inm-badge ${badgeClass}" style="margin-left: 6px;">${it.category}</span>
          </div>
          <span class="badge-subtle" style="font-size: 0.72rem; color: #10b981;">${it.status || 'Aprovado'}</span>
        </div>

        <div>
          <strong style="color: var(--text-main); font-size: 0.95rem; display: block; margin-bottom: 4px;">${it.itemName}</strong>
          <p style="color: var(--text-secondary); font-size: 0.82rem; margin: 0; line-height: 1.4;">${it.description || 'Intervenção técnica sem descrição adicional.'}</p>
        </div>

        <div class="inm-card-metrics-grid">
          <div class="inm-card-metric-item">
            <small>Quantidade</small>
            <strong style="color: #38bdf8;">${it.quantity}</strong>
          </div>
          <div class="inm-card-metric-item">
            <small>Peso Unit.</small>
            <strong style="color: #818cf8;">${parseFloat(it.unitWeight).toFixed(2)} PF</strong>
          </div>
          <div class="inm-card-metric-item">
            <small>Total FPN</small>
            <strong style="color: #10b981; font-size: 1.1rem;">${parseFloat(it.calculatedPf).toFixed(2)} PF</strong>
          </div>
        </div>

        <div class="inm-card-footer">
          <div>
            <span style="font-weight: 600;">${it.projectCode || it.projectName || 'Geral'}</span>
            ${it.feature ? ` • ${it.feature}` : ''}
            ${it.evidence ? ` • 🔗 ${it.evidence}` : ''}
          </div>
          ${canManage ? `
            <div style="display: flex; gap: 4px;">
              <button class="btn btn-ghost btn-xs" onclick="openApfInmModal('${it.id}')" title="Editar">✏️</button>
              <button class="btn btn-ghost btn-xs text-danger" onclick="handleDeleteApfInmItem('${it.id}')" title="Excluir">🗑️</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function getInmCategoryBadgeClass(category) {
  const cat = (category || '').toLowerCase();
  if (cat.includes('tabela')) return 'tag-inm-tabelas';
  if (cat.includes('interface') || cat.includes('menu') || cat.includes('layout')) return 'tag-inm-interface';
  if (cat.includes('parâmetro') || cat.includes('configur')) return 'tag-inm-parametros';
  if (cat.includes('banco') || cat.includes('view') || cat.includes('trigger')) return 'tag-inm-banco';
  if (cat.includes('script') || cat.includes('migra') || cat.includes('saneamento')) return 'tag-inm-scripts';
  if (cat.includes('integra') || cat.includes('relat')) return 'tag-inm-integracoes';
  return 'tag-inm-outros';
}
window.getInmCategoryBadgeClass = getInmCategoryBadgeClass;

function openApfInmModal(inmId = null) {
  const catalog = store.getInmCatalog();
  const catalogSelect = document.getElementById('apf-inm-catalog-select');
  const projectSelect = document.getElementById('apf-inm-project-select');
  const reqSelect = document.getElementById('apf-inm-req-select');
  const datalist = document.getElementById('apf-inm-features-datalist');
  const modalTitle = document.getElementById('modal-apf-inm-title');

  // Popula Projetos
  if (projectSelect) {
    const projects = store.state.projects || [];
    projectSelect.innerHTML = `<option value="">Selecione um projeto...</option>` +
      projects.map(p => `<option value="${p.id}" ${store.selectedProject === p.id ? 'selected' : ''}>[${p.code}] ${p.name}</option>`).join('');
  }

  // Popula Features
  if (datalist) {
    const features = store.getProjectFeatures ? store.getProjectFeatures(store.selectedProject) : [];
    datalist.innerHTML = features.map(f => `<option value="${f}"></option>`).join('');
  }

  // Popula Requisitos
  if (reqSelect) {
    const reqs = store.getRequirements ? store.getRequirements({ projectId: store.selectedProject }) : (store.state.requirements || []);
    reqSelect.innerHTML = `<option value="">Nenhum requisito vinculado</option>` +
      reqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
  }

  // Popula Catálogo agrupado por categorias
  if (catalogSelect) {
    const grouped = {};
    catalog.forEach(item => {
      if (!grouped[item.category]) grouped[item.category] = [];
      grouped[item.category].push(item);
    });

    let optsHtml = '';
    for (const catName of Object.keys(grouped)) {
      optsHtml += `<optgroup label="${catName}">`;
      grouped[catName].forEach(it => {
        optsHtml += `<option value="${it.key}" data-category="${it.category}" data-weight="${it.unitWeight}" data-unit="${it.unitLabel}" data-desc="${it.description || ''}">${it.name} (${it.unitWeight} PF/${it.unitLabel})</option>`;
      });
      optsHtml += `</optgroup>`;
    }
    optsHtml += `<optgroup label="Personalizado"><option value="custom" data-category="Outros" data-weight="0.80" data-unit="Unidade">Outro Item Personalizado...</option></optgroup>`;
    catalogSelect.innerHTML = optsHtml;
  }

  if (inmId) {
    const item = store.getApfInmItemById(inmId);
    if (!item) {
      showToast('Item não encontrado.', 'error');
      return;
    }
    if (modalTitle) modalTitle.textContent = 'Editar Intervenção Técnica Não-Mensurável (FPN)';
    document.getElementById('apf-inm-id-edit').value = item.id;
    if (projectSelect) projectSelect.value = item.projectId || '';
    document.getElementById('apf-inm-feature-input').value = item.feature || '';
    if (reqSelect) reqSelect.value = item.reqId || '';
    if (catalogSelect) catalogSelect.value = item.catalogKey || 'custom';
    document.getElementById('apf-inm-category-input').value = item.category || 'Tabelas de Apoio';
    document.getElementById('apf-inm-desc-input').value = item.description || '';
    document.getElementById('apf-inm-quantity-input').value = item.quantity || 1;
    document.getElementById('apf-inm-weight-input').value = item.unitWeight || 0.8;
    document.getElementById('apf-inm-status-select').value = item.status || 'Aprovado';
    document.getElementById('apf-inm-evidence-input').value = item.evidence || '';
  } else {
    if (modalTitle) modalTitle.textContent = 'Registrar Intervenção Técnica Não-Mensurável (FPN)';
    document.getElementById('apf-inm-id-edit').value = '';
    document.getElementById('apf-inm-feature-input').value = (store.apfFeatureFilter && store.apfFeatureFilter !== 'all') ? store.apfFeatureFilter : '';
    document.getElementById('apf-inm-desc-input').value = '';
    document.getElementById('apf-inm-quantity-input').value = 1;
    document.getElementById('apf-inm-evidence-input').value = '';
    document.getElementById('apf-inm-status-select').value = 'Aprovado';

    // Dispara preenchimento padrão do primeiro item do catálogo
    if (catalogSelect && catalogSelect.options.length > 0) {
      const firstOpt = catalogSelect.options[0];
      catalogSelect.selectedIndex = 0;
      document.getElementById('apf-inm-category-input').value = firstOpt.dataset.category || 'Tabelas de Apoio';
      document.getElementById('apf-inm-weight-input').value = firstOpt.dataset.weight || '0.80';
      const unitLabel = document.getElementById('apf-inm-unit-label');
      if (unitLabel) unitLabel.textContent = `Unidade: ${firstOpt.dataset.unit || 'Tabela'}`;
    }
  }

  updateApfInmLiveCalc();
  openModal('modal-apf-inm');
}
window.openApfInmModal = openApfInmModal;

function updateApfInmLiveCalc() {
  const qtyInput = document.getElementById('apf-inm-quantity-input');
  const weightInput = document.getElementById('apf-inm-weight-input');

  const qty = Math.max(0, parseFloat(qtyInput ? qtyInput.value : 1) || 0);
  const weight = Math.max(0, parseFloat(weightInput ? weightInput.value : 0.8) || 0);
  const total = Math.round((qty * weight) * 100) / 100;

  const hudQty = document.getElementById('inm-hud-qty');
  if (hudQty) hudQty.textContent = qty;

  const hudWeight = document.getElementById('inm-hud-weight');
  if (hudWeight) hudWeight.textContent = weight.toFixed(2);

  const hudTotal = document.getElementById('inm-hud-total-pf');
  if (hudTotal) hudTotal.textContent = total.toFixed(2);
}
window.updateApfInmLiveCalc = updateApfInmLiveCalc;

async function handleSaveApfInmItem(e) {
  if (e) e.preventDefault();

  const editId = document.getElementById('apf-inm-id-edit')?.value || '';
  const projectId = document.getElementById('apf-inm-project-select')?.value || '';
  const feature = document.getElementById('apf-inm-feature-input')?.value.trim() || '';
  const reqId = document.getElementById('apf-inm-req-select')?.value || '';
  const catalogSelect = document.getElementById('apf-inm-catalog-select');
  const selectedOpt = catalogSelect ? catalogSelect.options[catalogSelect.selectedIndex] : null;
  const catalogKey = catalogSelect ? catalogSelect.value : 'custom';
  const itemName = selectedOpt ? selectedOpt.text.replace(/\s*\(.*?\)$/, '').trim() : 'Intervenção Técnica';
  const category = document.getElementById('apf-inm-category-input')?.value.trim() || 'Tabelas de Apoio';
  const description = document.getElementById('apf-inm-desc-input')?.value.trim() || '';
  const quantity = Math.max(0.01, parseFloat(document.getElementById('apf-inm-quantity-input')?.value) || 1);
  const unitWeight = Math.max(0, parseFloat(document.getElementById('apf-inm-weight-input')?.value) || 0.8);
  const status = document.getElementById('apf-inm-status-select')?.value || 'Aprovado';
  const evidence = document.getElementById('apf-inm-evidence-input')?.value.trim() || '';

  if (!description) {
    showToast('A descrição da intervenção técnica é obrigatória.', 'warn');
    return;
  }

  const payload = {
    projectId,
    feature,
    reqId,
    catalogKey,
    itemName,
    category,
    description,
    quantity,
    unitWeight,
    status,
    evidence
  };

  try {
    if (editId) {
      await store.updateApfInmItem(editId, payload);
      showToast('Item não-mensurável atualizado com sucesso!', 'success');
    } else {
      await store.addApfInmItem(payload);
      showToast('Intervenção técnica (FPN) registrada com sucesso!', 'success');
    }
    closeModal('modal-apf-inm');
    renderApf();
  } catch (err) {
    console.error('Erro ao salvar item não-mensurável:', err);
    showToast('Falha ao salvar item: ' + (err.message || 'Erro inesperado'), 'error');
  }
}
window.handleSaveApfInmItem = handleSaveApfInmItem;

async function handleDeleteApfInmItem(id) {
  const item = store.getApfInmItemById(id);
  if (!item) return;

  if (!confirm(`Confirma a exclusão da intervenção [${item.code}] "${item.itemName}" com ${item.calculatedPf} FPN?`)) {
    return;
  }

  try {
    await store.deleteApfInmItem(id);
    showToast(`Item [${item.code}] excluído com sucesso!`, 'info');
    renderApf();
  } catch (err) {
    console.error('Erro ao excluir item não-mensurável:', err);
    showToast('Falha ao excluir item: ' + (err.message || 'Erro inesperado'), 'error');
  }
}
window.handleDeleteApfInmItem = handleDeleteApfInmItem;

function renderApfSummary(items, inmItems, totalRawPf, totalFinalPf, totalInmPf, totalGlobalPf, dataCount, dataRaw, dataFinal, transCount, transRaw, transFinal) {
  const elDataCount = document.getElementById('summary-data-count');
  if (elDataCount) elDataCount.textContent = dataCount;
  const elDataRaw = document.getElementById('summary-data-raw');
  if (elDataRaw) elDataRaw.textContent = `${dataRaw.toFixed(1)} PF`;
  const elDataFinal = document.getElementById('summary-data-final');
  if (elDataFinal) elDataFinal.textContent = `${dataFinal.toFixed(2)} PF`;

  const elTransCount = document.getElementById('summary-trans-count');
  if (elTransCount) elTransCount.textContent = transCount;
  const elTransRaw = document.getElementById('summary-trans-raw');
  if (elTransRaw) elTransRaw.textContent = `${transRaw.toFixed(1)} PF`;
  const elTransFinal = document.getElementById('summary-trans-final');
  if (elTransFinal) elTransFinal.textContent = `${transFinal.toFixed(2)} PF`;

  const elIfpugItems = document.getElementById('summary-ifpug-total-items');
  if (elIfpugItems) elIfpugItems.textContent = items.length;
  const elIfpugAvg = document.getElementById('summary-ifpug-avg-factor');
  if (elIfpugAvg) {
    const avg = totalRawPf > 0 ? Math.round((totalFinalPf / totalRawPf) * 100) : 100;
    elIfpugAvg.textContent = `Fator: ${avg}%`;
  }
  const elIfpugRaw = document.getElementById('summary-ifpug-total-raw');
  if (elIfpugRaw) elIfpugRaw.textContent = `${totalRawPf.toFixed(1)} PF`;
  const elIfpugFinal = document.getElementById('summary-ifpug-total-final');
  if (elIfpugFinal) elIfpugFinal.textContent = `${totalFinalPf.toFixed(2)} PF`;

  const elInmCount = document.getElementById('summary-inm-count');
  if (elInmCount) elInmCount.textContent = `${inmItems.length} Intervenções`;
  const elInmFinal = document.getElementById('summary-inm-final');
  if (elInmFinal) elInmFinal.textContent = `${totalInmPf.toFixed(2)} PF`;

  const elGrandItems = document.getElementById('summary-grand-total-items');
  if (elGrandItems) elGrandItems.textContent = `${items.length + inmItems.length} Itens Totais`;
  const elGrandRaw = document.getElementById('summary-grand-raw');
  if (elGrandRaw) elGrandRaw.textContent = `${totalRawPf.toFixed(1)} PF`;
  const elGrandPf = document.getElementById('summary-grand-total-pf');
  if (elGrandPf) elGrandPf.textContent = `${totalGlobalPf.toFixed(2)} PF`;

  // Breakdown por categoria técnica
  const breakdownGrid = document.getElementById('summary-inm-breakdown-grid');
  if (breakdownGrid) {
    const catMap = {};
    inmItems.forEach(it => {
      const c = it.category || 'Outros';
      if (!catMap[c]) catMap[c] = { count: 0, pf: 0 };
      catMap[c].count++;
      catMap[c].pf += parseFloat(it.calculatedPf) || 0;
    });

    const cats = Object.keys(catMap);
    if (cats.length === 0) {
      breakdownGrid.innerHTML = `<span style="color: var(--text-muted); font-size: 0.82rem;">Nenhuma intervenção técnica não-mensurável registrada ainda.</span>`;
    } else {
      breakdownGrid.innerHTML = cats.map(c => {
        const info = catMap[c];
        const badgeClass = getInmCategoryBadgeClass(c);
        return `
          <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span class="tag-inm-badge ${badgeClass}" style="margin-bottom: 4px;">${c}</span>
              <small style="display: block; color: var(--text-muted); font-size: 0.72rem;">${info.count} intervenção${info.count === 1 ? '' : 'ões'}</small>
            </div>
            <strong style="color: #34d399; font-size: 1.1rem; font-family: 'Outfit', sans-serif;">${info.pf.toFixed(2)} PF</strong>
          </div>
        `;
      }).join('');
    }
  }
}
window.renderApfSummary = renderApfSummary;

function renderApfTableView(items, tbody) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  const canManage = perms.canManageApf;

  tbody.innerHTML = items.map(it => {
    const typeClass = `tag-${(it.functionType || 'ee').toLowerCase()}`;
    const compClass = `comp-${(it.complexity || 'media').toLowerCase()}`;
    const factorPct = Math.round((parseFloat(it.factor) || 1.0) * 100);
    const countingTagClass = (it.countingType === 'Testes') ? 'tag-counting-test' :
      (it.countingType === 'Transferência Tecnológica') ? 'tag-counting-transf' :
      (it.countingType === 'Melhoria') ? 'tag-counting-melh' : 'tag-counting-dev';

    const reqBadge = it.reqCode ?
      `<a href="javascript:void(0)" onclick="switchView('requirements');" title="${it.reqTitle || ''}" style="color: #38bdf8; text-decoration: none; font-size: 0.76rem; font-weight: 600;">📋 ${it.reqCode}</a>` :
      `<span style="color: var(--text-muted); font-size: 0.74rem;">-</span>`;

    const arTrLabel = (it.functionType === 'ALI' || it.functionType === 'AIE') ? 'TR' : 'AR';

    return `
      <tr data-apf-id="${it.id}">
        <td style="white-space: nowrap;">
          <span class="apf-code-badge">${it.code}</span>
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">${escapeHtml(it.name)}</div>
          ${it.notes ? `<div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(it.notes)}">💬 ${escapeHtml(it.notes)}</div>` : ''}
        </td>
        <td>
          <div style="font-size: 0.82rem; color: var(--text-secondary);">${escapeHtml(it.projectName || 'Geral')}</div>
          ${it.feature ? `<div style="font-size: 0.72rem; color: #818cf8; font-weight: 600;">🧩 ${escapeHtml(it.feature)}</div>` : ''}
        </td>
        <td style="text-align: center;">
          <span class="apf-type-tag ${typeClass}" title="${it.category || ''}">${it.functionType}</span>
        </td>
        <td style="text-align: center; font-weight: 700; color: var(--text-main);">
          ${it.td} <small style="font-size: 0.65rem; color: var(--text-muted);">DET</small>
        </td>
        <td style="text-align: center; font-weight: 700; color: var(--text-main);">
          ${it.arTr} <small style="font-size: 0.65rem; color: var(--text-muted);">${arTrLabel}</small>
        </td>
        <td style="text-align: center;">
          <span class="apf-badge-comp-sm ${compClass}">${it.complexity}</span>
        </td>
        <td style="text-align: center; font-weight: 700; color: #818cf8; font-size: 0.92rem;">
          ${it.rawPf} PF
        </td>
        <td style="text-align: center;">
          <span class="badge-subtle ${countingTagClass}" style="font-size: 0.72rem; padding: 2px 8px; font-weight: 600;" title="Fator: ${(parseFloat(it.factor) || 1).toFixed(2)}x">
            ${it.countingType || 'Desenvolvimento'} (${factorPct}%)
          </span>
        </td>
        <td style="text-align: right;">
          <span class="apf-final-pf-value">${(parseFloat(it.finalPf) || 0).toFixed(2)}</span>
          <small style="font-size: 0.7rem; color: #10b981; font-weight: 700;"> PF</small>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 4px; align-items: center;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="showApfDetails('${it.id}')" title="Ver Memória de Cálculo IFPUG Detalhada" style="padding: 4px 7px;">
              <span>ℹ️</span>
            </button>
            ${canManage ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="openApfModal('${it.id}')" title="Editar Função APF" style="padding: 4px 7px;">
                <span>✏️</span>
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="handleDeleteApfItem('${it.id}')" title="Excluir Função APF" style="padding: 4px 7px; color: #f43f5e;">
                <span>🗑️</span>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderApfCardsView(items, container) {
  const currentUser = typeof authStore !== 'undefined' ? authStore.getCurrentUser() : null;
  const currentRole = currentUser ? currentUser.role : 'dev';
  const perms = RolePermissions[currentRole] || RolePermissions.dev;
  const canManage = perms.canManageApf;

  container.innerHTML = items.map(it => {
    const typeClass = `tag-${(it.functionType || 'ee').toLowerCase()}`;
    const compClass = `comp-${(it.complexity || 'media').toLowerCase()}`;
    const factorPct = Math.round((parseFloat(it.factor) || 1.0) * 100);
    const arTrLabel = (it.functionType === 'ALI' || it.functionType === 'AIE') ? 'TR' : 'AR';

    return `
      <div class="apf-item-card glass-panel" data-apf-id="${it.id}">
        <div class="apf-card-header">
          <div>
            <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
              <span class="apf-code-badge">${it.code}</span>
              <span class="apf-type-tag ${typeClass}">${it.functionType}</span>
              <span class="apf-badge-comp-sm ${compClass}">${it.complexity}</span>
            </div>
            <strong style="font-size: 0.95rem; color: var(--text-main); line-height: 1.3; display: block;">${escapeHtml(it.name)}</strong>
          </div>
        </div>

        <div style="font-size: 0.76rem; color: var(--text-secondary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          <span>📁 ${escapeHtml(it.projectName || 'Geral')}</span>
          ${it.feature ? `<span style="color: #818cf8; font-weight: 600;">• 🧩 ${escapeHtml(it.feature)}</span>` : ''}
        </div>

        <div class="apf-card-metrics-grid">
          <div class="apf-card-metric-item">
            <small>TD (DET)</small>
            <strong>${it.td}</strong>
          </div>
          <div class="apf-card-metric-item">
            <small>${arTrLabel} (FTR)</small>
            <strong>${it.arTr}</strong>
          </div>
          <div class="apf-card-metric-item">
            <small>PF Bruto</small>
            <strong style="color: #818cf8;">${it.rawPf} PF</strong>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.78rem;">
          <span style="color: var(--text-muted);">${it.countingType || 'Desenvolvimento'}:</span>
          <strong style="color: var(--text-main);">${factorPct}% (${(parseFloat(it.factor) || 1).toFixed(2)}x)</strong>
        </div>

        <div class="apf-card-footer">
          <div>
            <small style="color: var(--text-muted); display: block; font-size: 0.66rem; text-transform: uppercase;">PF Líquido Final</small>
            <strong class="apf-final-pf-value" style="font-size: 1.25rem;">${(parseFloat(it.finalPf) || 0).toFixed(2)} PF</strong>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="showApfDetails('${it.id}')" title="Ver Memória de Cálculo">
              <span>ℹ️</span>
            </button>
            ${canManage ? `
              <button type="button" class="btn btn-secondary btn-sm" onclick="openApfModal('${it.id}')" title="Editar">
                <span>✏️</span>
              </button>
              <button type="button" class="btn btn-secondary btn-sm" onclick="handleDeleteApfItem('${it.id}')" title="Excluir" style="color: #f43f5e;">
                <span>🗑️</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Atualiza em Tempo Real o Painel de Cálculo Automático do Modal (Live HUD)
 */
function updateApfLiveCalc() {
  const form = document.getElementById('form-apf');
  if (!form) return;

  const typeRadio = form.querySelector('input[name="apf-type"]:checked');
  const type = typeRadio ? typeRadio.value : 'EE';

  const tdInput = document.getElementById('apf-td-input');
  const td = Math.max(1, parseInt(tdInput ? tdInput.value : 5, 10) || 1);

  const arTrInput = document.getElementById('apf-artr-input');
  const arTr = Math.max(0, parseInt(arTrInput ? arTrInput.value : 1, 10) || 0);

  const countingSelect = document.getElementById('apf-counting-type-select');
  const countingType = countingSelect ? countingSelect.value : 'Desenvolvimento';

  const factorInput = document.getElementById('apf-factor-percent-input');
  let factorPercent = parseFloat(factorInput ? factorInput.value : 100);
  if (isNaN(factorPercent) || factorPercent < 0) factorPercent = 100;
  const factor = factorPercent / 100;

  // Ajusta labels dinâmicos de TR vs AR
  const arTrLabel = document.getElementById('apf-artr-label');
  const arTrTooltip = document.getElementById('apf-artr-tooltip');
  const arTrHint = document.getElementById('apf-artr-hint');
  const categoryIndicator = document.getElementById('apf-category-indicator');

  if (type === 'ALI' || type === 'AIE') {
    if (arTrLabel) arTrLabel.textContent = 'Tipos de Registro (TR / RET) *';
    if (arTrTooltip) arTrTooltip.title = 'Subgrupos de dados ou tabelas reconhecidas pelo usuário mantidas no arquivo lógico';
    if (arTrHint) arTrHint.textContent = 'Subgrupos de dados (RETs)';
    if (categoryIndicator) {
      categoryIndicator.textContent = (type === 'ALI') ? 'Grupo de Dados Interno (ALI)' : 'Grupo de Dados Externo (AIE)';
      categoryIndicator.style.color = '#c084fc';
    }
  } else {
    if (arTrLabel) arTrLabel.textContent = 'Arquivos Referenciados (AR / FTR) *';
    if (arTrTooltip) arTrTooltip.title = 'Arquivos lógicos internos (ALIs) ou de interface externa (AIEs) lidos ou mantidos pela transação';
    if (arTrHint) arTrHint.textContent = 'ALIs / AIEs referenciados (FTRs)';
    if (categoryIndicator) {
      categoryIndicator.textContent = `Transação: Processo Elementar (${type})`;
      categoryIndicator.style.color = '#38bdf8';
    }
  }

  // Atualiza classes ativas nos cartões de tipo
  document.querySelectorAll('.apf-type-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.type === type);
  });

  // Aplica as Matrizes de Decisão do IFPUG
  const complexity = calculateApfComplexity(type, arTr, td);
  const rawPf = calculateApfRawPf(type, complexity);
  const finalPf = calculateApfFinalPf(rawPf, factor);

  // Atualiza o Display HUD
  const liveComp = document.getElementById('apf-live-complexity');
  if (liveComp) {
    liveComp.textContent = complexity;
    liveComp.className = `pill-value comp-${complexity.toLowerCase()}`;
  }

  const liveRaw = document.getElementById('apf-live-raw-pf');
  if (liveRaw) {
    liveRaw.textContent = `${rawPf} PF`;
  }

  const liveFactor = document.getElementById('apf-live-factor-disp');
  if (liveFactor) {
    liveFactor.textContent = `${Math.round(factorPercent)}% (${factor.toFixed(2)}x)`;
  }

  const liveFinal = document.getElementById('apf-live-final-pf');
  if (liveFinal) {
    liveFinal.textContent = `${finalPf.toFixed(2)} PF`;
  }

  const explanation = document.getElementById('apf-live-explanation');
  if (explanation) {
    explanation.textContent = getApfCalculationExplanation(type, arTr, td, complexity, rawPf, countingType, factor, finalPf);
  }

  const factorHint = document.getElementById('apf-factor-decimal-hint');
  if (factorHint) {
    factorHint.textContent = `Fator: ${factor.toFixed(2)}x`;
  }
}
window.updateApfLiveCalc = updateApfLiveCalc;

/**
 * Abertura e Inicialização do Modal de APF
 */
function openApfModal(apfIdToEdit = null, defaultProjectId = null, defaultFeature = null, defaultReqId = null) {
  const form = document.getElementById('form-apf');
  if (!form) return;
  form.reset();

  populateModalSelects();

  const titleEl = document.getElementById('modal-apf-title');
  const editIdInput = document.getElementById('apf-id-edit');
  const codeInput = document.getElementById('apf-code-input');
  const nameInput = document.getElementById('apf-name-input');
  const projectSelect = document.getElementById('apf-project-select');
  const featureInput = document.getElementById('apf-feature-input');
  const reqSelect = document.getElementById('apf-req-select');
  const tdInput = document.getElementById('apf-td-input');
  const arTrInput = document.getElementById('apf-artr-input');
  const countingSelect = document.getElementById('apf-counting-type-select');
  const factorInput = document.getElementById('apf-factor-percent-input');
  const notesInput = document.getElementById('apf-notes-input');

  if (apfIdToEdit) {
    const item = store.getApfItemById(apfIdToEdit);
    if (!item) {
      showToast('Item de APF não encontrado.', 'error');
      return;
    }
    if (titleEl) titleEl.textContent = '✏️ Editar Função de APF';
    if (editIdInput) editIdInput.value = item.id;
    if (codeInput) codeInput.value = item.code || '';
    if (nameInput) nameInput.value = item.name || '';
    if (projectSelect && item.projectId) projectSelect.value = item.projectId;
    if (featureInput) featureInput.value = item.feature || '';
    if (reqSelect && item.reqId) reqSelect.value = item.reqId;
    if (tdInput) tdInput.value = item.td || 5;
    if (arTrInput) arTrInput.value = item.arTr || 1;
    if (countingSelect) countingSelect.value = item.countingType || 'Desenvolvimento';
    if (factorInput) factorInput.value = Math.round((parseFloat(item.factor) || 1.0) * 100);
    if (notesInput) notesInput.value = item.notes || '';

    // Seleciona radio de tipo correspondente
    const radio = form.querySelector(`input[name="apf-type"][value="${item.functionType || 'EE'}"]`);
    if (radio) radio.checked = true;
  } else {
    if (titleEl) titleEl.textContent = '📐 Cadastrar Função APF (IFPUG)';
    if (editIdInput) editIdInput.value = '';

    const targetProjId = defaultProjectId || (store.selectedProject !== 'all' ? store.selectedProject : (store.state.projects[0] ? store.state.projects[0].id : ''));
    if (projectSelect && targetProjId) projectSelect.value = targetProjId;
    if (featureInput && defaultFeature) featureInput.value = defaultFeature;
    if (reqSelect && defaultReqId) reqSelect.value = defaultReqId;

    if (tdInput) tdInput.value = 5;
    if (arTrInput) arTrInput.value = 1;
    if (countingSelect) countingSelect.value = 'Desenvolvimento';
    if (factorInput) factorInput.value = 100;
    if (notesInput) notesInput.value = '';

    const defaultTypeRadio = form.querySelector('input[name="apf-type"][value="EE"]');
    if (defaultTypeRadio) defaultTypeRadio.checked = true;

    // Sugere próximo código automático sequencial
    suggestApfCode('EE');
  }

  updateApfLiveCalc();
  openModal('modal-apf');
}
window.openApfModal = openApfModal;

function suggestApfCode(type = 'EE') {
  const codeInput = document.getElementById('apf-code-input');
  if (!codeInput) return;
  const count = (store.state.apfItems || []).filter(it => (it.functionType || '').toUpperCase() === type.toUpperCase()).length + 1;
  codeInput.value = `${type.toUpperCase()}-${String(count).padStart(2, '0')}`;
}
window.suggestApfCode = suggestApfCode;

/**
 * Salva Item de APF (Criação ou Edição)
 */
async function handleSaveApfItem(e) {
  if (e) e.preventDefault();

  const form = document.getElementById('form-apf');
  if (!form) return;

  const editId = document.getElementById('apf-id-edit')?.value;
  const name = document.getElementById('apf-name-input')?.value.trim();
  const typeRadio = form.querySelector('input[name="apf-type"]:checked');
  const functionType = typeRadio ? typeRadio.value : 'EE';

  if (!name) {
    showToast('Informe o nome da função ou processo elementar.', 'warn');
    return;
  }

  const projectId = document.getElementById('apf-project-select')?.value || '';
  const feature = document.getElementById('apf-feature-input')?.value.trim() || '';
  const reqId = document.getElementById('apf-req-select')?.value || '';
  const code = document.getElementById('apf-code-input')?.value.trim() || `${functionType}-01`;
  const td = Math.max(1, parseInt(document.getElementById('apf-td-input')?.value, 10) || 1);
  const arTr = Math.max(0, parseInt(document.getElementById('apf-artr-input')?.value, 10) || 0);
  const countingType = document.getElementById('apf-counting-type-select')?.value || 'Desenvolvimento';
  const factorPct = parseFloat(document.getElementById('apf-factor-percent-input')?.value) || 100;
  const factor = factorPct / 100;
  const notes = document.getElementById('apf-notes-input')?.value.trim() || '';

  const itemPayload = {
    code,
    name,
    projectId,
    feature,
    reqId,
    functionType,
    td,
    arTr,
    countingType,
    factor,
    notes
  };

  try {
    if (editId) {
      await store.updateApfItem(editId, itemPayload);
      showToast(`Função APF [${code}] atualizada com sucesso!`);
    } else {
      await store.addApfItem(itemPayload);
      showToast(`Função APF [${code}] cadastrada com sucesso!`);
    }

    closeModal('modal-apf');
    renderApf();
    updateSidebarCounters();
    refreshAllUI();
  } catch (err) {
    console.error('Erro ao salvar item de APF:', err);
    showToast(`Erro ao salvar APF: ${err.message}`, 'error');
  }
}
window.handleSaveApfItem = handleSaveApfItem;

/**
 * Exclui Item de APF
 */
async function handleDeleteApfItem(id) {
  const item = store.getApfItemById(id);
  if (!item) return;

  if (confirm(`Deseja realmente excluir a função APF "${item.code} - ${item.name}"?\n\nEsta operação será registrada no log de auditoria.`)) {
    try {
      await store.deleteApfItem(id);
      showToast(`Função [${item.code}] excluída com sucesso.`, 'info');
      renderApf();
      updateSidebarCounters();
      refreshAllUI();
    } catch (err) {
      console.error('Erro ao excluir item de APF:', err);
      showToast(`Erro ao excluir: ${err.message}`, 'error');
    }
  }
}
window.handleDeleteApfItem = handleDeleteApfItem;

/**
 * Exibe Detalhes e Memória de Cálculo IFPUG
 */
function showApfDetails(id) {
  const item = store.getApfItemById(id);
  if (!item) return;

  const arTrLabel = (item.functionType === 'ALI' || item.functionType === 'AIE') ? 'Tipos de Registro (TR/RET)' : 'Arquivos Referenciados (AR/FTR)';
  const factorPct = Math.round((parseFloat(item.factor) || 1.0) * 100);

  const text = `
📐 MEMÓRIA DE CÁLCULO DE APF (IFPUG CPM 4.3.1)
==================================================
Identificador: [${item.code}] ${item.name}
Projeto:       ${item.projectName || 'Geral'} ${item.feature ? `(Feature: ${item.feature})` : ''}
Tipo:          ${item.functionType} (${item.category || getApfCategory(item.functionType)})
--------------------------------------------------
Variáveis de Entrada:
• Tipos de Dados (TD / DET): ${item.td}
• ${arTrLabel}: ${item.arTr}

Classificação IFPUG:
• Complexidade Funcional:   ${item.complexity}
• Pontos de Função Brutos:  ${item.rawPf} PF

Deflator Contratual:
• Tipo de Contagem:         ${item.countingType || 'Desenvolvimento'}
• Fator Aplicado:           ${factorPct}% (${(parseFloat(item.factor) || 1).toFixed(2)}x)

Resultado Final:
• PONTOS DE FUNÇÃO (PF):    ${(parseFloat(item.finalPf) || 0).toFixed(2)} PF
--------------------------------------------------
Notas / Justificativa Técnica:
${item.notes || 'Nenhuma observação técnica registrada.'}
==================================================
  `;
  alert(text.trim());
}
window.showApfDetails = showApfDetails;

/**
 * Insere Conjunto de Demonstração Didático de Funções APF (IFPUG)
 */
async function seedSampleApfData() {
  const currentProjId = store.selectedProject !== 'all' ? store.selectedProject : (store.state.projects[0] ? store.state.projects[0].id : '');
  const proj = store.getProjectById(currentProjId);
  const projName = proj ? proj.name : 'Iniciativa Synchro';

  const sampleFunctions = [
    {
      code: 'ALI-01',
      name: 'Tabela de Contas e Usuários do Sistema',
      functionType: 'ALI',
      feature: 'Segurança & Acesso',
      td: 28,
      arTr: 3, // TR=3 e TD=28 -> Média -> 10 PF
      countingType: 'Desenvolvimento',
      factor: 1.0,
      notes: 'Grupo de dados interno contendo entidades de usuários, perfis, credenciais e trilhas de auditoria.'
    },
    {
      code: 'SE-01',
      name: 'Emissão de Extrato e Relatório Financeiro',
      functionType: 'SE',
      feature: 'Faturamento & Relatórios',
      td: 5,
      arTr: 1, // AR=1 e TD=5 -> Baixa -> 4 PF
      countingType: 'Desenvolvimento',
      factor: 1.0,
      notes: 'Processo elementar de saída com cálculo matemático de saldo, totais de impostos e ordenação por data.'
    },
    {
      code: 'EE-01',
      name: 'Cadastro de Novo Cliente ou Fornecedor',
      functionType: 'EE',
      feature: 'Cadastros Gerais',
      td: 12,
      arTr: 2, // AR=2 e TD=12 -> Média -> 4 PF
      countingType: 'Melhoria',
      factor: 1.0,
      notes: 'Processo elementar de inclusão de entidade com validação cadastral e atualização em dois ALIs.'
    },
    {
      code: 'CE-01',
      name: 'Consulta Rápida de Status de Pedido',
      functionType: 'CE',
      feature: 'Painel do Cliente',
      td: 3,
      arTr: 1, // AR=1 e TD=3 -> Baixa -> 3 PF
      countingType: 'Testes',
      factor: 0.30, // 3 * 0.30 = 0.90 PF
      notes: 'Recuperação direta de dados sem cálculos derivados; contratada para validação e fábrica de testes.'
    },
    {
      code: 'AIE-01',
      name: 'Base de Consulta de CEP e Logradouros (Correios)',
      functionType: 'AIE',
      feature: 'Integrações Externas',
      td: 8,
      arTr: 1, // TR=1 e TD=8 -> Baixa -> 5 PF
      countingType: 'Transferência Tecnológica',
      factor: 0.20, // 5 * 0.20 = 1.00 PF
      notes: 'Arquivo de interface externa referenciado pelo sistema para autocompletar endereços na tela.'
    }
  ];

  for (const item of sampleFunctions) {
    await store.addApfItem({
      ...item,
      projectId: currentProjId
    });
  }

  showToast('5 Funções de demonstração cadastradas com sucesso!');
  renderApf();
  updateSidebarCounters();
  refreshAllUI();
}
window.seedSampleApfData = seedSampleApfData;

/**
 * Inserção de Itens Não-Mensuráveis (FPN) de Exemplo / Demonstração
 */
async function seedSampleApfInmData() {
  const projects = store.getProjects ? store.getProjects() : (store.state.projects || []);
  const currentProjId = store.selectedProject !== 'all' ? store.selectedProject : (projects[0]?.id || null);

  const sampleInmItems = [
    {
      catalogKey: 'code_table_inclusao',
      itemName: 'Code Table - Inclusão / Nova Tabela de Apoio',
      category: 'Tabelas de Apoio',
      description: 'Criação de tabelas de domínio para status de intervenção e tipos de parametrização externa com script de carga inicial.',
      quantity: 2,
      unitWeight: 0.80,
      feature: 'Parametrização',
      evidence: 'PR #104 (db-migrations) - scripts/v2_code_tables.sql',
      status: 'Aprovado'
    },
    {
      catalogKey: 'menu_item',
      itemName: 'Menus / Submenus - Inclusão ou Reestruturação',
      category: 'Interface & Menus',
      description: 'Inclusão de 4 novos nós de submenu no painel de administração e auditoria de métricas de software.',
      quantity: 4,
      unitWeight: 0.10,
      feature: 'Navegação',
      evidence: 'PR #112 - sidebar-nav-update.tsx',
      status: 'Aprovado'
    },
    {
      catalogKey: 'layout_alteracao',
      itemName: 'Layout / Template / Telas - Alteração Estética',
      category: 'Interface & Menus',
      description: 'Reestilização visual do template de exportação e ajuste de responsividade no grid de cards de auditoria.',
      quantity: 1,
      unitWeight: 0.50,
      feature: 'Interface',
      evidence: 'Commit c8a19f2 - redesign_cards.css',
      status: 'Aprovado'
    },
    {
      catalogKey: 'parametro_sistema',
      itemName: 'Parâmetro de Configuração / Setup de Sistema',
      category: 'Parâmetros & Configuração',
      description: 'Definição de flags de configuração em runtime para timeout de relatórios e habilitação de deflatores automáticos.',
      quantity: 3,
      unitWeight: 0.30,
      feature: 'Configuração',
      evidence: 'Ticket JIRA-892 / config_runtime.json',
      status: 'Aprovado'
    },
    {
      catalogKey: 'db_trigger_proc',
      itemName: 'Triggers / Procedures / Rotinas de Banco',
      category: 'Banco de Dados',
      description: 'Procedure de recálculo em lote de saldos acumulados e triggers de auditoria em tabelas históricas.',
      quantity: 1,
      unitWeight: 1.00,
      feature: 'Banco de Dados',
      evidence: 'Migration 20261012_proc_recalc_balance.sql',
      status: 'Aprovado'
    }
  ];

  for (const item of sampleInmItems) {
    await store.addApfInmItem({
      ...item,
      projectId: currentProjId
    });
  }

  showToast('5 Intervenções técnicas não-mensuráveis cadastradas com sucesso!');
  renderApf();
  updateSidebarCounters();
  refreshAllUI();
}
window.seedSampleApfInmData = seedSampleApfInmData;

/**
 * Exportação Oficial de APF e Faturamento para Planilha Excel (.XLSX)
 * Gera 3 abas consolidadas: Funções IFPUG, Não-Mensuráveis (FPN) e Demonstrativo de Faturamento
 */
function exportApfToExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Biblioteca XLSX não carregada no navegador.', 'error');
    return;
  }

  const items = store.getApfItems();
  const inmItems = store.getApfInmItems();
  if (items.length === 0 && inmItems.length === 0) {
    showToast('Nenhum item de APF ou intervenção não-mensurável para exportar.', 'warn');
    return;
  }

  const activeProj = store.selectedProject !== 'all' ? store.getProjectById(store.selectedProject) : null;
  const projectName = activeProj ? activeProj.name : 'Todos os Projetos';

  const wb = XLSX.utils.book_new();

  // 1. Aba: Funções IFPUG (CPM 4.3.1)
  const dataRowsIfpug = items.map((it, idx) => ({
    'Nº': idx + 1,
    'Código': it.code,
    'Processo Elementar / Grupo de Dados': it.name,
    'Projeto': it.projectName || '',
    'Feature / Módulo': it.feature || '',
    'Requisito': it.reqCode || '',
    'Tipo IFPUG': it.functionType,
    'Categoria': it.category || getApfCategory(it.functionType),
    'TD (DET)': it.td,
    'AR / TR (FTR/RET)': it.arTr,
    'Complexidade': it.complexity,
    'PF Bruto': it.rawPf,
    'Tipo de Contagem': it.countingType || 'Desenvolvimento',
    'Redutor (%)': Math.round((parseFloat(it.factor) || 1.0) * 100) + '%',
    'PF Final (Líquido)': parseFloat(it.finalPf) || 0,
    'Notas / Justificativa Técnica': it.notes || ''
  }));

  const totalRaw = items.reduce((acc, it) => acc + (parseFloat(it.rawPf) || 0), 0);
  const totalFinal = items.reduce((acc, it) => acc + (parseFloat(it.finalPf) || 0), 0);

  dataRowsIfpug.push({
    'Nº': '',
    'Código': 'TOTAL IFPUG',
    'Processo Elementar / Grupo de Dados': `Total de ${items.length} itens mensurados`,
    'Projeto': '',
    'Feature / Módulo': '',
    'Requisito': '',
    'Tipo IFPUG': '',
    'Categoria': '',
    'TD (DET)': '',
    'AR / TR (FTR/RET)': '',
    'Complexidade': '',
    'PF Bruto': totalRaw,
    'Tipo de Contagem': '',
    'Redutor (%)': '',
    'PF Final (Líquido)': totalFinal,
    'Notas / Justificativa Técnica': 'Total apurado com deflatores IFPUG'
  });

  const wsIfpug = XLSX.utils.json_to_sheet(dataRowsIfpug);
  XLSX.utils.book_append_sheet(wb, wsIfpug, '1. Funções IFPUG');

  // 2. Aba: Não-Mensuráveis (FPN)
  const dataRowsInm = inmItems.map((it, idx) => ({
    'Nº': idx + 1,
    'Código': it.code,
    'Intervenção Técnica / Item': it.itemName,
    'Categoria': it.category,
    'Descrição Técnica': it.description || '',
    'Projeto': it.projectName || it.projectCode || '',
    'Feature / Módulo': it.feature || '',
    'Requisito': it.reqCode || '',
    'Quantidade': it.quantity,
    'Peso Unitário (PF)': it.unitWeight,
    'Total FPN (PF)': parseFloat(it.calculatedPf) || 0,
    'Evidência / Ref.': it.evidence || '',
    'Status': it.status || 'Aprovado'
  }));

  const totalInmQty = inmItems.reduce((acc, it) => acc + (parseFloat(it.quantity) || 0), 0);
  const totalInmPf = inmItems.reduce((acc, it) => acc + (parseFloat(it.calculatedPf) || 0), 0);

  dataRowsInm.push({
    'Nº': '',
    'Código': 'TOTAL FPN',
    'Intervenção Técnica / Item': `Total de ${inmItems.length} intervenções técnicas`,
    'Categoria': '',
    'Descrição Técnica': '',
    'Projeto': '',
    'Feature / Módulo': '',
    'Requisito': '',
    'Quantidade': totalInmQty,
    'Peso Unitário (PF)': '',
    'Total FPN (PF)': Math.round(totalInmPf * 100) / 100,
    'Evidência / Ref.': '',
    'Status': 'Apurado'
  });

  const wsInm = XLSX.utils.json_to_sheet(dataRowsInm);
  XLSX.utils.book_append_sheet(wb, wsInm, '2. Não-Mensuráveis (FPN)');

  // 3. Aba: Demonstrativo Consolidado de Faturamento
  const totalGlobalPf = Math.round((totalFinal + totalInmPf) * 100) / 100;
  const pctIfpug = totalGlobalPf > 0 ? ((totalFinal / totalGlobalPf) * 100).toFixed(1) + '%' : '0%';
  const pctInm = totalGlobalPf > 0 ? ((totalInmPf / totalGlobalPf) * 100).toFixed(1) + '%' : '0%';

  const dataRowsSummary = [
    {
      'Componente da Entrega': 'Funções de Dados (ALI / AIE)',
      'Método': 'IFPUG CPM 4.3.1',
      'Quantidade de Itens': items.filter(it => it.functionType === 'ALI' || it.functionType === 'AIE').length,
      'PF Bruto': items.filter(it => it.functionType === 'ALI' || it.functionType === 'AIE').reduce((acc, it) => acc + (parseFloat(it.rawPf) || 0), 0),
      'PF Faturável (Líquido / FPN)': items.filter(it => it.functionType === 'ALI' || it.functionType === 'AIE').reduce((acc, it) => acc + (parseFloat(it.finalPf) || 0), 0),
      '% do Total Global': totalGlobalPf > 0 ? ((items.filter(it => it.functionType === 'ALI' || it.functionType === 'AIE').reduce((acc, it) => acc + (parseFloat(it.finalPf) || 0), 0) / totalGlobalPf) * 100).toFixed(1) + '%' : '0%'
    },
    {
      'Componente da Entrega': 'Processos Elementares (EE / SE / CE)',
      'Método': 'IFPUG CPM 4.3.1',
      'Quantidade de Itens': items.filter(it => it.functionType === 'EE' || it.functionType === 'SE' || it.functionType === 'CE').length,
      'PF Bruto': items.filter(it => it.functionType === 'EE' || it.functionType === 'SE' || it.functionType === 'CE').reduce((acc, it) => acc + (parseFloat(it.rawPf) || 0), 0),
      'PF Faturável (Líquido / FPN)': items.filter(it => it.functionType === 'EE' || it.functionType === 'SE' || it.functionType === 'CE').reduce((acc, it) => acc + (parseFloat(it.finalPf) || 0), 0),
      '% do Total Global': totalGlobalPf > 0 ? ((items.filter(it => it.functionType === 'EE' || it.functionType === 'SE' || it.functionType === 'CE').reduce((acc, it) => acc + (parseFloat(it.finalPf) || 0), 0) / totalGlobalPf) * 100).toFixed(1) + '%' : '0%'
    },
    {
      'Componente da Entrega': 'SUBTOTAL IFPUG (CPM 4.3.1)',
      'Método': 'Tamanho Funcional',
      'Quantidade de Itens': items.length,
      'PF Bruto': totalRaw,
      'PF Faturável (Líquido / FPN)': totalFinal,
      '% do Total Global': pctIfpug
    },
    {
      'Componente da Entrega': 'INTERVENÇÕES NÃO-MENSURÁVEIS (FPN)',
      'Método': 'Tabela SISP / Contratual',
      'Quantidade de Itens': inmItems.length,
      'PF Bruto': '-',
      'PF Faturável (Líquido / FPN)': Math.round(totalInmPf * 100) / 100,
      '% do Total Global': pctInm
    },
    {
      'Componente da Entrega': 'TOTAL GERAL FATURÁVEL DA ENTREGA',
      'Método': 'PF Global = IFPUG Líquido + FPN',
      'Quantidade de Itens': items.length + inmItems.length,
      'PF Bruto': totalRaw,
      'PF Faturável (Líquido / FPN)': totalGlobalPf,
      '% do Total Global': '100.0%'
    }
  ];

  const wsSummary = XLSX.utils.json_to_sheet(dataRowsSummary);
  XLSX.utils.book_append_sheet(wb, wsSummary, '3. Faturamento Consolidado');

  const filename = `Synchro_APF_Faturamento_${(projectName || 'Geral').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSX.writeFile(wb, filename);
  showToast(`Planilha "${filename}" com 3 abas exportada com sucesso!`);
}
window.exportApfToExcel = exportApfToExcel;

/**
 * Inicialização dos Event Listeners do Módulo de APF
 */
function initApfEventListeners() {
  // 1. Botões do Header da View
  const btnOpenModal = document.getElementById('btn-open-apf-modal');
  if (btnOpenModal && !btnOpenModal.dataset.init) {
    btnOpenModal.dataset.init = 'true';
    btnOpenModal.addEventListener('click', () => openApfModal());
  }

  const btnOpenInmModal = document.getElementById('btn-open-apf-inm-modal');
  if (btnOpenInmModal && !btnOpenInmModal.dataset.init) {
    btnOpenInmModal.dataset.init = 'true';
    btnOpenInmModal.addEventListener('click', () => openApfInmModal());
  }

  const btnOpenGuide = document.getElementById('btn-open-ifpug-guide');
  if (btnOpenGuide && !btnOpenGuide.dataset.init) {
    btnOpenGuide.dataset.init = 'true';
    btnOpenGuide.addEventListener('click', () => openModal('modal-ifpug-guide'));
  }

  const btnExportXlsx = document.getElementById('btn-export-apf-xlsx');
  if (btnExportXlsx && !btnExportXlsx.dataset.init) {
    btnExportXlsx.dataset.init = 'true';
    btnExportXlsx.addEventListener('click', exportApfToExcel);
  }

  const actionNewApf = document.getElementById('action-new-apf');
  if (actionNewApf && !actionNewApf.dataset.init) {
    actionNewApf.dataset.init = 'true';
    actionNewApf.addEventListener('click', () => openApfModal());
  }

  // Alternador de Sub-Abas de APF (IFPUG vs FPN vs Demonstrativo de Faturamento)
  const subnavBtns = document.querySelectorAll('#apf-subnav-tabs .segment-btn');
  subnavBtns.forEach(btn => {
    if (!btn.dataset.init) {
      btn.dataset.init = 'true';
      btn.addEventListener('click', () => {
        subnavBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        store.apfSubnavTab = btn.getAttribute('data-apf-tab') || 'ifpug';
        renderApf();
      });
    }
  });

  // 2. Filtros da View de APF (IFPUG)
  const searchInput = document.getElementById('apf-search-input');
  if (searchInput && !searchInput.dataset.init) {
    searchInput.dataset.init = 'true';
    searchInput.addEventListener('input', (e) => {
      store.apfSearchQuery = e.target.value.trim();
      renderApf();
    });
  }

  const typeFilterBtns = document.querySelectorAll('#apf-type-filter .segment-btn');
  typeFilterBtns.forEach(btn => {
    if (!btn.dataset.init) {
      btn.dataset.init = 'true';
      btn.addEventListener('click', () => {
        typeFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        store.apfTypeFilter = btn.dataset.type || 'all';
        renderApf();
      });
    }
  });

  const catSelect = document.getElementById('apf-category-filter');
  if (catSelect && !catSelect.dataset.init) {
    catSelect.dataset.init = 'true';
    catSelect.addEventListener('change', (e) => {
      store.apfCategoryFilter = e.target.value;
      renderApf();
    });
  }

  const compSelect = document.getElementById('apf-complexity-filter');
  if (compSelect && !compSelect.dataset.init) {
    compSelect.dataset.init = 'true';
    compSelect.addEventListener('change', (e) => {
      store.apfComplexityFilter = e.target.value;
      renderApf();
    });
  }

  const countingSelect = document.getElementById('apf-counting-filter');
  if (countingSelect && !countingSelect.dataset.init) {
    countingSelect.dataset.init = 'true';
    countingSelect.addEventListener('change', (e) => {
      store.apfCountingFilter = e.target.value;
      renderApf();
    });
  }

  const scopeFeatureSelect = document.getElementById('apf-scope-feature-select');
  if (scopeFeatureSelect && !scopeFeatureSelect.dataset.init) {
    scopeFeatureSelect.dataset.init = 'true';
    scopeFeatureSelect.addEventListener('change', (e) => {
      store.apfFeatureFilter = e.target.value;
      renderApf();
    });
  }

  // Alternador de layout IFPUG (Tabela vs Cards)
  const layoutBtns = document.querySelectorAll('.view-layout-toggle[data-view="apf"] .view-mode-btn');
  layoutBtns.forEach(btn => {
    if (!btn.dataset.init) {
      btn.dataset.init = 'true';
      btn.addEventListener('click', () => {
        layoutBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        store.apfViewMode = btn.dataset.mode || 'table';
        renderApf();
      });
    }
  });

  // Filtros da Aba de Itens Não-Mensuráveis (FPN)
  const inmSearchInput = document.getElementById('apf-inm-search-input');
  if (inmSearchInput && !inmSearchInput.dataset.init) {
    inmSearchInput.dataset.init = 'true';
    inmSearchInput.addEventListener('input', (e) => {
      store.apfInmSearchQuery = e.target.value.trim();
      renderApfInm();
    });
  }

  const inmCatFilter = document.getElementById('apf-inm-category-filter');
  if (inmCatFilter && !inmCatFilter.dataset.init) {
    inmCatFilter.dataset.init = 'true';
    inmCatFilter.addEventListener('change', (e) => {
      store.apfInmCategoryFilter = e.target.value;
      renderApfInm();
    });
  }

  // Alternador de layout FPN (Tabela vs Cards)
  const inmLayoutBtns = document.querySelectorAll('.view-layout-toggle[data-view="apf-inm"] .view-mode-btn');
  inmLayoutBtns.forEach(btn => {
    if (!btn.dataset.init) {
      btn.dataset.init = 'true';
      btn.addEventListener('click', () => {
        inmLayoutBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        store.apfInmViewMode = btn.dataset.mode || 'table';
        renderApfInm();
      });
    }
  });

  // 3. Formulário do Modal de APF (IFPUG)
  const formApf = document.getElementById('form-apf');
  if (formApf && !formApf.dataset.init) {
    formApf.dataset.init = 'true';
    formApf.addEventListener('submit', handleSaveApfItem);
  }

  // 3.2 Formulário do Modal de Itens Não-Mensuráveis (FPN)
  const formInm = document.getElementById('form-apf-inm');
  if (formInm && !formInm.dataset.init) {
    formInm.dataset.init = 'true';
    formInm.addEventListener('submit', handleSaveApfInmItem);
  }

  // Mudança no catálogo pré-definido preenche automaticamente categoria, peso tabelado e unidade
  const inmCatalogSelect = document.getElementById('apf-inm-catalog-select');
  if (inmCatalogSelect && !inmCatalogSelect.dataset.init) {
    inmCatalogSelect.dataset.init = 'true';
    inmCatalogSelect.addEventListener('change', (e) => {
      const opt = e.target.options[e.target.selectedIndex];
      if (opt) {
        const catInput = document.getElementById('apf-inm-category-input');
        if (catInput) catInput.value = opt.dataset.category || 'Outros';
        const weightInput = document.getElementById('apf-inm-weight-input');
        if (weightInput) weightInput.value = opt.dataset.weight || '0.80';
        const unitLabel = document.getElementById('apf-inm-unit-label');
        if (unitLabel) unitLabel.textContent = `Unidade: ${opt.dataset.unit || 'Item'}`;
        const descInput = document.getElementById('apf-inm-desc-input');
        if (descInput && !descInput.value && opt.dataset.desc) {
          descInput.value = opt.dataset.desc;
        }
      }
      updateApfInmLiveCalc();
    });
  }

  // Select de projeto do modal FPN sincroniza datalist de features e requisitos
  const inmModalProjSelect = document.getElementById('apf-inm-project-select');
  if (inmModalProjSelect && !inmModalProjSelect.dataset.init) {
    inmModalProjSelect.dataset.init = 'true';
    inmModalProjSelect.addEventListener('change', (e) => {
      const pId = e.target.value;
      const datalist = document.getElementById('apf-inm-features-datalist');
      if (datalist) {
        const feats = store.getProjectFeatures ? store.getProjectFeatures(pId) : [];
        datalist.innerHTML = feats.map(f => `<option value="${f}">`).join('');
      }
      const reqSelect = document.getElementById('apf-inm-req-select');
      if (reqSelect) {
        const filteredReqs = pId ? (store.state.requirements || []).filter(r => r.projectId === pId) : store.state.requirements;
        reqSelect.innerHTML = `<option value="">Nenhum requisito vinculado</option>` +
          filteredReqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
      }
    });
  }

  // Botões Stepper de Quantidade FPN (+ / -)
  const btnInmQtyPlus = document.getElementById('btn-inm-qty-plus');
  if (btnInmQtyPlus && !btnInmQtyPlus.dataset.init) {
    btnInmQtyPlus.dataset.init = 'true';
    btnInmQtyPlus.addEventListener('click', () => {
      const input = document.getElementById('apf-inm-quantity-input');
      if (input) {
        const cur = parseFloat(input.value) || 0;
        input.value = (cur + 1).toString();
        input.dispatchEvent(new Event('input'));
      }
    });
  }

  const btnInmQtyMinus = document.getElementById('btn-inm-qty-minus');
  if (btnInmQtyMinus && !btnInmQtyMinus.dataset.init) {
    btnInmQtyMinus.dataset.init = 'true';
    btnInmQtyMinus.addEventListener('click', () => {
      const input = document.getElementById('apf-inm-quantity-input');
      if (input) {
        const cur = parseFloat(input.value) || 1;
        input.value = Math.max(0.5, cur - 1).toString();
        input.dispatchEvent(new Event('input'));
      }
    });
  }

  // Gatilhos de input do cálculo em tempo real FPN
  ['apf-inm-quantity-input', 'apf-inm-weight-input'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.init) {
      el.dataset.init = 'true';
      el.addEventListener('input', updateApfInmLiveCalc);
      el.addEventListener('change', updateApfInmLiveCalc);
    }
  });

  // Radios de Tipo
  const typeRadios = document.querySelectorAll('input[name="apf-type"]');
  typeRadios.forEach(r => {
    if (!r.dataset.init) {
      r.dataset.init = 'true';
      r.addEventListener('change', (e) => {
        if (!document.getElementById('apf-id-edit')?.value) {
          suggestApfCode(e.target.value);
        }
        updateApfLiveCalc();
      });
    }
  });

  // Botão de sugerir código
  const btnAutoCode = document.getElementById('btn-apf-autocode');
  if (btnAutoCode && !btnAutoCode.dataset.init) {
    btnAutoCode.dataset.init = 'true';
    btnAutoCode.addEventListener('click', () => {
      const typeRadio = document.querySelector('input[name="apf-type"]:checked');
      suggestApfCode(typeRadio ? typeRadio.value : 'EE');
    });
  }

  // Mudança no select de projeto do modal sincroniza features e requisitos
  const modalProjSelect = document.getElementById('apf-project-select');
  if (modalProjSelect && !modalProjSelect.dataset.init) {
    modalProjSelect.dataset.init = 'true';
    modalProjSelect.addEventListener('change', (e) => {
      const pId = e.target.value;
      const datalist = document.getElementById('apf-features-datalist');
      if (datalist) {
        const feats = store.getProjectFeatures ? store.getProjectFeatures(pId) : [];
        datalist.innerHTML = feats.map(f => `<option value="${f}">`).join('');
      }
      const reqSelect = document.getElementById('apf-req-select');
      if (reqSelect) {
        const filteredReqs = pId ? (store.state.requirements || []).filter(r => r.projectId === pId) : store.state.requirements;
        reqSelect.innerHTML = `<option value="">Nenhum requisito vinculado (Geral / Livre)</option>` +
          filteredReqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
      }
    });
  }

  // Gatilhos de input do cálculo em tempo real
  const liveInputs = [
    'apf-td-input',
    'apf-artr-input',
    'apf-factor-percent-input'
  ];
  liveInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.dataset.init) {
      el.dataset.init = 'true';
      el.addEventListener('input', updateApfLiveCalc);
      el.addEventListener('change', updateApfLiveCalc);
    }
  });

  // Mudança no Tipo de Contagem atualiza o redutor padrão percentual
  const countingTypeSelect = document.getElementById('apf-counting-type-select');
  if (countingTypeSelect && !countingTypeSelect.dataset.init) {
    countingTypeSelect.dataset.init = 'true';
    countingTypeSelect.addEventListener('change', (e) => {
      const defFactor = getCountingTypeDefaultFactor(e.target.value);
      const factorPercentInput = document.getElementById('apf-factor-percent-input');
      if (factorPercentInput) {
        factorPercentInput.value = Math.round(defFactor * 100);
      }
      updateApfLiveCalc();
    });
  }

  // Botões Stepper (+ / -)
  document.querySelectorAll('.btn-stepper').forEach(btn => {
    if (!btn.dataset.init) {
      btn.dataset.init = 'true';
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const step = parseInt(btn.dataset.step, 10) || 1;
        const input = document.getElementById(targetId);
        if (input) {
          const min = parseInt(input.min, 10) || 0;
          const max = parseInt(input.max, 10) || 999;
          const cur = parseInt(input.value, 10) || 0;
          const nextVal = Math.min(max, Math.max(min, cur + step));
          input.value = nextVal;
          input.dispatchEvent(new Event('input'));
        }
      });
    }
  });

  // Botão de abertura do Assistente de Geração Automática
  const btnOpenAuto = document.getElementById('btn-open-apf-auto-modal');
  if (btnOpenAuto && !btnOpenAuto.dataset.init) {
    btnOpenAuto.dataset.init = 'true';
    btnOpenAuto.addEventListener('click', () => openApfAutoModal());
  }

  // Botão de Auto-preencher por requisito no formulário manual
  const btnAutofillFromReq = document.getElementById('btn-apf-autofill-from-req');
  if (btnAutofillFromReq && !btnAutofillFromReq.dataset.init) {
    btnAutofillFromReq.dataset.init = 'true';
    btnAutofillFromReq.addEventListener('click', autofillApfFromRequirement);
  }

  // Alternador de modo (Por Requisito vs Por Feature)
  const autoModeToggle = document.getElementById('apf-auto-mode-toggle');
  if (autoModeToggle && !autoModeToggle.dataset.init) {
    autoModeToggle.dataset.init = 'true';
    autoModeToggle.querySelectorAll('.segment-btn').forEach(btn => {
      btn.addEventListener('click', () => setApfAutoMode(btn.dataset.mode));
    });
  }

  // Select de projeto do auto-generate sincroniza features e requisitos
  const autoProjSelect = document.getElementById('apf-auto-project-select');
  if (autoProjSelect && !autoProjSelect.dataset.init) {
    autoProjSelect.dataset.init = 'true';
    autoProjSelect.addEventListener('change', (e) => updateApfAutoFeatureAndReqSelects(e.target.value));
  }

  // Botão de executar análise automática
  const btnRunAnalysis = document.getElementById('btn-run-apf-auto-analysis');
  if (btnRunAnalysis && !btnRunAnalysis.dataset.init) {
    btnRunAnalysis.dataset.init = 'true';
    btnRunAnalysis.addEventListener('click', runApfAutoAnalysis);
  }

  // Botões Marcar Todos / Desmarcar Todos
  const btnSelectAll = document.getElementById('btn-apf-auto-select-all');
  if (btnSelectAll && !btnSelectAll.dataset.init) {
    btnSelectAll.dataset.init = 'true';
    btnSelectAll.addEventListener('click', () => {
      currentApfAutoCandidates.forEach(c => c.selected = true);
      document.querySelectorAll('.apf-auto-chk').forEach(chk => chk.checked = true);
      document.querySelectorAll('.apf-auto-card-row').forEach(row => row.classList.remove('is-unselected'));
      updateApfAutoSummaryHud();
    });
  }

  const btnDeselectAll = document.getElementById('btn-apf-auto-deselect-all');
  if (btnDeselectAll && !btnDeselectAll.dataset.init) {
    btnDeselectAll.dataset.init = 'true';
    btnDeselectAll.addEventListener('click', () => {
      currentApfAutoCandidates.forEach(c => c.selected = false);
      document.querySelectorAll('.apf-auto-chk').forEach(chk => chk.checked = false);
      document.querySelectorAll('.apf-auto-card-row').forEach(row => row.classList.add('is-unselected'));
      updateApfAutoSummaryHud();
    });
  }

  // Botão de confirmação de gravação em lote
  const btnConfirmBatch = document.getElementById('btn-confirm-save-apf-auto');
  if (btnConfirmBatch && !btnConfirmBatch.dataset.init) {
    btnConfirmBatch.dataset.init = 'true';
    btnConfirmBatch.addEventListener('click', handleSaveApfAutoBatch);
  }
}
window.initApfEventListeners = initApfEventListeners;

// ==============================================================================
// 13. Módulo de Geração Automática de APF (Heurística e Decomposição IFPUG)
// ==============================================================================
let currentApfAutoCandidates = [];

/**
 * Abre o Modal de Geração Automática de APF
 */
function openApfAutoModal(initialReqId = null, initialFeature = null) {
  const modal = document.getElementById('modal-apf-auto-generate');
  if (!modal) return;

  currentApfAutoCandidates = [];
  populateApfAutoSelects();

  const contextCard = document.getElementById('apf-auto-context-card');
  if (contextCard) contextCard.style.display = 'none';

  const summaryHud = document.getElementById('apf-auto-summary-hud');
  if (summaryHud) summaryHud.style.display = 'none';

  const resultsContainer = document.getElementById('apf-auto-results-container');
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
        <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚡</div>
        <p style="font-size: 0.95rem;">Selecione o Requisito ou Feature acima e clique em <strong>"Analisar e Identificar Funções"</strong>.</p>
        <small>O algoritmo examinará o vocabulário funcional, história de usuário e BDD para deduzir as funções de dados e transacionais.</small>
      </div>
    `;
  }

  // Se veio pré-selecionado por Requisito
  if (initialReqId) {
    setApfAutoMode('req');
    const req = (store.state.requirements || []).find(r => r.id === initialReqId);
    if (req) {
      const projSelect = document.getElementById('apf-auto-project-select');
      if (projSelect && req.projectId) {
        projSelect.value = req.projectId;
        updateApfAutoFeatureAndReqSelects(req.projectId);
      }
      const reqSelect = document.getElementById('apf-auto-req-select');
      if (reqSelect) reqSelect.value = initialReqId;
      const featSelect = document.getElementById('apf-auto-feature-select');
      if (featSelect && req.feature) featSelect.value = req.feature;

      openModal('modal-apf-auto-generate');
      setTimeout(() => runApfAutoAnalysis(), 100);
      return;
    }
  } else if (initialFeature) {
    setApfAutoMode('feature');
    const featSelect = document.getElementById('apf-auto-feature-select');
    if (featSelect) featSelect.value = initialFeature;
    openModal('modal-apf-auto-generate');
    setTimeout(() => runApfAutoAnalysis(), 100);
    return;
  }

  openModal('modal-apf-auto-generate');
}
window.openApfAutoModal = openApfAutoModal;

/**
 * Alterna entre Modo Requisito e Modo Feature
 */
function setApfAutoMode(mode) {
  const toggle = document.getElementById('apf-auto-mode-toggle');
  if (toggle) {
    toggle.querySelectorAll('.segment-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === mode);
    });
  }

  const reqGroup = document.getElementById('apf-auto-req-group');
  const featGroup = document.getElementById('apf-auto-feature-group');

  if (mode === 'req') {
    if (reqGroup) reqGroup.style.display = '';
    if (featGroup) featGroup.style.display = '';
  } else {
    if (reqGroup) reqGroup.style.display = 'none';
    if (featGroup) featGroup.style.display = '';
  }
}
window.setApfAutoMode = setApfAutoMode;

/**
 * Preenche os selects do modal de geração automática
 */
function populateApfAutoSelects() {
  const projects = store.getProjects ? store.getProjects() : (store.state.projects || []);
  const currentProjId = store.currentProjectId || (projects[0]?.id || '');

  const projSelect = document.getElementById('apf-auto-project-select');
  if (projSelect) {
    projSelect.innerHTML = `<option value="">Todos os Projetos</option>` +
      projects.map(p => `<option value="${p.id}" ${p.id === currentProjId ? 'selected' : ''}>${p.name}</option>`).join('');
  }

  updateApfAutoFeatureAndReqSelects(currentProjId);
}
window.populateApfAutoSelects = populateApfAutoSelects;

function updateApfAutoFeatureAndReqSelects(projectId) {
  const pId = projectId || document.getElementById('apf-auto-project-select')?.value;
  const features = store.getProjectFeatures ? store.getProjectFeatures(pId) : [];

  const featSelect = document.getElementById('apf-auto-feature-select');
  if (featSelect) {
    featSelect.innerHTML = `<option value="">Todas as Features</option>` +
      features.map(f => `<option value="${f}">${f}</option>`).join('');
  }

  const reqs = pId
    ? (store.state.requirements || []).filter(r => r.projectId === pId)
    : (store.state.requirements || []);

  const reqSelect = document.getElementById('apf-auto-req-select');
  if (reqSelect) {
    reqSelect.innerHTML = `<option value="">Selecione um Requisito...</option>` +
      reqs.map(r => `<option value="${r.id}">[${r.code}] ${r.title}</option>`).join('');
  }
}
window.updateApfAutoFeatureAndReqSelects = updateApfAutoFeatureAndReqSelects;

/**
 * Executa a análise heurística automática
 */
async function runApfAutoAnalysis() {
  const toggle = document.getElementById('apf-auto-mode-toggle');
  const activeBtn = toggle ? toggle.querySelector('.segment-btn.active') : null;
  const mode = activeBtn ? activeBtn.dataset.mode : 'req';

  const projectId = document.getElementById('apf-auto-project-select')?.value || '';
  const feature = document.getElementById('apf-auto-feature-select')?.value || '';
  const reqId = document.getElementById('apf-auto-req-select')?.value || '';
  const countingType = document.getElementById('apf-auto-counting-type')?.value || 'Desenvolvimento';
  const factorPct = parseFloat(document.getElementById('apf-auto-factor-percent')?.value) || 100;
  const factor = factorPct / 100;

  if (mode === 'req' && !reqId) {
    showToast('Selecione um requisito para executar a análise automática.', 'warn');
    return;
  }
  if (mode === 'feature' && !feature) {
    showToast('Selecione uma feature para executar a análise automática.', 'warn');
    return;
  }

  const resultsContainer = document.getElementById('apf-auto-results-container');
  if (resultsContainer) {
    resultsContainer.innerHTML = `
      <div style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
        <div class="spinner" style="margin: 0 auto 1rem; width: 36px; height: 36px; border: 3px solid rgba(168,85,247,0.2); border-top-color: #c084fc; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
        <p style="font-size: 0.95rem; color: var(--text-main); font-weight: 600;">Analisando semântica do requisito e regras IFPUG CPM 4.3.1...</p>
        <small style="color: var(--text-muted);">Identificando grupos de dados lógicos (ALI/AIE) e processos elementares (EE/SE/CE)...</small>
      </div>
    `;
  }

  try {
    const payload = {
      projectId,
      feature: mode === 'feature' ? feature : '',
      reqId: mode === 'req' ? reqId : '',
      countingType,
      factor
    };

    const res = await store.previewAutoApf(payload);
    if (!res || !res.success || !Array.isArray(res.candidates)) {
      showToast(res?.message || 'Não foi possível identificar funções para o escopo selecionado.', 'error');
      if (resultsContainer) {
        resultsContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Nenhuma função identificada.</div>`;
      }
      return;
    }

    currentApfAutoCandidates = res.candidates.map((c, i) => ({
      ...c,
      selected: true,
      index: i
    }));

    // Exibir Card de Contexto
    const contextCard = document.getElementById('apf-auto-context-card');
    if (contextCard) {
      contextCard.style.display = 'block';
      const titleEl = document.getElementById('apf-auto-context-title');
      if (titleEl) {
        titleEl.textContent = res.sourceCode ? `[${res.sourceCode}] ${res.sourceTitle}` : (res.feature ? `Feature: ${res.feature}` : 'Escopo Geral');
      }
      const metaEl = document.getElementById('apf-auto-context-meta');
      if (metaEl) {
        const pObj = store.getProjectById(res.projectId);
        metaEl.textContent = `Projeto: ${pObj ? pObj.name : 'Geral'} | Feature: ${res.feature || 'Geral'} | Tipo: ${countingType} (${Math.round(factor * 100)}%)`;
      }
      const badgeEl = document.getElementById('apf-auto-context-badge');
      if (badgeEl) {
        badgeEl.textContent = `${res.candidates.length} Funções Detectadas`;
        badgeEl.style.color = '#38bdf8';
        badgeEl.style.borderColor = 'rgba(56, 189, 248, 0.4)';
      }
      const descEl = document.getElementById('apf-auto-context-desc');
      if (descEl) {
        if (mode === 'req') {
          const reqObj = (store.state.requirements || []).find(r => r.id === reqId);
          descEl.textContent = reqObj ? (reqObj.userStory || reqObj.bdd || reqObj.title) : '';
        } else {
          descEl.textContent = `Análise consolidada para todos os fluxos e entidades sob a feature "${feature}".`;
        }
      }
      const tagsEl = document.getElementById('apf-auto-context-tags');
      if (tagsEl) {
        const fields = res.detectedFields || [];
        if (fields.length > 0) {
          tagsEl.innerHTML = fields.map(f => `<span class="apf-detected-pill">${f}</span>`).join('');
        } else {
          tagsEl.innerHTML = `<span style="font-size: 0.72rem; color: var(--text-muted);">Campos padrão inferidos por complexidade</span>`;
        }
      }
    }

    renderApfAutoCandidates(currentApfAutoCandidates);
    updateApfAutoSummaryHud();

  } catch (err) {
    console.error('Erro na análise automática de APF:', err);
    showToast(`Erro ao analisar APF: ${err.message}`, 'error');
    if (resultsContainer) {
      resultsContainer.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-danger);">Erro: ${err.message}</div>`;
    }
  }
}
window.runApfAutoAnalysis = runApfAutoAnalysis;

/**
 * Renderiza a lista de funções candidatas no modal de geração automática
 */
function renderApfAutoCandidates(candidates) {
  const container = document.getElementById('apf-auto-results-container');
  if (!container) return;

  if (candidates.length === 0) {
    container.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Nenhuma função identificada.</div>`;
    return;
  }

  let html = `
    <div class="apf-auto-card-header">
      <span>Sel.</span>
      <span>Tipo</span>
      <span>Nome da Função & Justificativa</span>
      <span>TD (DET)</span>
      <span>AR/TR (RET)</span>
      <span>Complexidade</span>
      <span>PF Bruto</span>
      <span>PF Final</span>
    </div>
  `;

  candidates.forEach((cand, idx) => {
    const typeClass = cand.functionType === 'ALI' ? 'tag-ali'
      : (cand.functionType === 'AIE' ? 'tag-aie'
      : (cand.functionType === 'EE' ? 'tag-ee'
      : (cand.functionType === 'SE' ? 'tag-se' : 'tag-ce')));

    const compClass = cand.complexity === 'Alta' ? 'comp-alta'
      : (cand.complexity === 'Média' ? 'comp-media' : 'comp-baixa');

    const arTrLabel = (cand.functionType === 'ALI' || cand.functionType === 'AIE') ? 'TR' : 'AR';

    html += `
      <div class="apf-auto-card-row ${cand.selected ? '' : 'is-unselected'}" id="apf-auto-row-${idx}">
        <div style="text-align: center;">
          <input type="checkbox" class="custom-checkbox apf-auto-chk" data-idx="${idx}" ${cand.selected ? 'checked' : ''}>
        </div>
        <div>
          <span class="apf-type-tag ${typeClass}" style="display: block; text-align: center; font-size: 0.72rem; padding: 3px 0;">${cand.functionType}</span>
        </div>
        <div>
          <input type="text" class="custom-input apf-auto-name-input" data-idx="${idx}" value="${escapeHtml(cand.name)}" style="font-size: 0.82rem; padding: 4px 8px; font-weight: 600;">
          <div class="apf-auto-rationale" title="${escapeHtml(cand.rationale || cand.notes)}">💡 ${escapeHtml(cand.rationale || cand.notes)}</div>
        </div>
        <div>
          <div class="mini-stepper">
            <button type="button" onclick="adjustApfAutoVal(${idx}, 'td', -1)">-</button>
            <input type="text" readonly id="apf-auto-td-${idx}" value="${cand.td}">
            <button type="button" onclick="adjustApfAutoVal(${idx}, 'td', 1)">+</button>
          </div>
        </div>
        <div>
          <div class="mini-stepper" title="${arTrLabel}">
            <button type="button" onclick="adjustApfAutoVal(${idx}, 'arTr', -1)">-</button>
            <input type="text" readonly id="apf-auto-artr-${idx}" value="${cand.arTr}">
            <button type="button" onclick="adjustApfAutoVal(${idx}, 'arTr', 1)">+</button>
          </div>
        </div>
        <div>
          <span class="apf-badge-comp-sm ${compClass}" id="apf-auto-comp-${idx}" style="font-size: 0.7rem;">${cand.complexity}</span>
        </div>
        <div>
          <strong id="apf-auto-raw-${idx}" style="font-size: 0.85rem; color: #f59e0b;">${cand.rawPf} PF</strong>
        </div>
        <div>
          <strong id="apf-auto-final-${idx}" style="font-size: 0.88rem; color: #10b981;">${cand.finalPf} PF</strong>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Event Listeners dos checkboxes e nomes
  container.querySelectorAll('.apf-auto-chk').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (currentApfAutoCandidates[idx]) {
        currentApfAutoCandidates[idx].selected = e.target.checked;
        const row = document.getElementById(`apf-auto-row-${idx}`);
        if (row) row.classList.toggle('is-unselected', !e.target.checked);
        updateApfAutoSummaryHud();
      }
    });
  });

  container.querySelectorAll('.apf-auto-name-input').forEach(input => {
    input.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (currentApfAutoCandidates[idx]) {
        currentApfAutoCandidates[idx].name = e.target.value.trim();
      }
    });
  });
}
window.renderApfAutoCandidates = renderApfAutoCandidates;

/**
 * Ajusta TD ou AR/TR de um candidato com recálculo dinâmico
 */
function adjustApfAutoVal(idx, prop, delta) {
  const cand = currentApfAutoCandidates[idx];
  if (!cand) return;

  const min = prop === 'td' ? 1 : 0;
  cand[prop] = Math.max(min, (cand[prop] || 0) + delta);

  // Recalcular métricas IFPUG
  cand.complexity = calculateApfComplexity(cand.functionType, cand.arTr, cand.td);
  cand.rawPf = calculateApfRawPf(cand.functionType, cand.complexity);
  cand.finalPf = calculateApfFinalPf(cand.rawPf, cand.factor || 1.0);

  // Atualizar visualização da linha
  const inputEl = document.getElementById(`apf-auto-${prop.toLowerCase()}-${idx}`);
  if (inputEl) inputEl.value = cand[prop];

  const compEl = document.getElementById(`apf-auto-comp-${idx}`);
  if (compEl) {
    compEl.textContent = cand.complexity;
    compEl.className = `apf-badge-comp-sm ${cand.complexity === 'Alta' ? 'comp-alta' : (cand.complexity === 'Média' ? 'comp-media' : 'comp-baixa')}`;
  }

  const rawEl = document.getElementById(`apf-auto-raw-${idx}`);
  if (rawEl) rawEl.textContent = `${cand.rawPf} PF`;

  const finalEl = document.getElementById(`apf-auto-final-${idx}`);
  if (finalEl) finalEl.textContent = `${cand.finalPf} PF`;

  updateApfAutoSummaryHud();
}
window.adjustApfAutoVal = adjustApfAutoVal;

/**
 * Atualiza o HUD de Totais do Modal de Geração Automática
 */
function updateApfAutoSummaryHud() {
  const summaryHud = document.getElementById('apf-auto-summary-hud');
  if (!summaryHud) return;

  summaryHud.style.display = 'block';

  const selected = currentApfAutoCandidates.filter(c => c.selected);
  const dataCount = selected.filter(c => c.functionType === 'ALI' || c.functionType === 'AIE').length;
  const txCount = selected.filter(c => c.functionType === 'EE' || c.functionType === 'SE' || c.functionType === 'CE').length;
  const rawSum = selected.reduce((s, c) => s + (c.rawPf || 0), 0);
  const finalSum = Math.round(selected.reduce((s, c) => s + (c.finalPf || 0), 0) * 100) / 100;

  const countEl = document.getElementById('apf-auto-hud-count');
  if (countEl) countEl.textContent = `${selected.length} de ${currentApfAutoCandidates.length}`;

  const dataEl = document.getElementById('apf-auto-hud-data');
  if (dataEl) dataEl.textContent = `${dataCount}`;

  const txEl = document.getElementById('apf-auto-hud-tx');
  if (txEl) txEl.textContent = `${txCount}`;

  const rawEl = document.getElementById('apf-auto-hud-raw');
  if (rawEl) rawEl.textContent = `${rawSum} PF`;

  const finalEl = document.getElementById('apf-auto-hud-final');
  if (finalEl) finalEl.textContent = `${finalSum.toFixed(1)} PF`;

  const btnSave = document.getElementById('btn-confirm-save-apf-auto');
  if (btnSave) {
    btnSave.disabled = selected.length === 0;
    btnSave.innerHTML = `<span>🚀 Gravar ${selected.length} Funções (${finalSum.toFixed(1)} PF)</span>`;
  }
}

/**
 * Salva em lote as funções de APF selecionadas
 */
async function handleSaveApfAutoBatch() {
  const selected = currentApfAutoCandidates.filter(c => c.selected);
  if (selected.length === 0) {
    showToast('Selecione ao menos uma função para cadastrar.', 'warn');
    return;
  }

  const projectId = document.getElementById('apf-auto-project-select')?.value || '';
  const feature = document.getElementById('apf-auto-feature-select')?.value || '';
  const reqId = document.getElementById('apf-auto-req-select')?.value || '';
  const countingType = document.getElementById('apf-auto-counting-type')?.value || 'Desenvolvimento';
  const factorPct = parseFloat(document.getElementById('apf-auto-factor-percent')?.value) || 100;
  const factor = factorPct / 100;

  const btnSave = document.getElementById('btn-confirm-save-apf-auto');
  if (btnSave) {
    btnSave.disabled = true;
    btnSave.innerHTML = `<span>⏳ Gravando Funções...</span>`;
  }

  try {
    const payload = {
      projectId,
      feature,
      reqId,
      countingType,
      factor,
      items: selected.map(c => ({
        name: c.name,
        functionType: c.functionType,
        td: c.td,
        arTr: c.arTr,
        countingType,
        factor,
        notes: c.rationale || c.notes,
        projectId: c.projectId || projectId,
        feature: c.feature || feature,
        reqId: c.reqId || reqId
      }))
    };

    const res = await store.batchCreateApf(payload);
    if (!res || !res.success) {
      showToast(res?.message || 'Erro ao gravar lote de funções APF.', 'error');
      if (btnSave) btnSave.disabled = false;
      return;
    }

    showToast(`Sucesso! ${res.count || selected.length} funções de APF geradas e cadastradas!`);
    closeModal('modal-apf-auto-generate');
    renderApf();
    updateSidebarCounters();
    if (typeof renderRequirements === 'function') renderRequirements();
    refreshAllUI();

  } catch (err) {
    console.error('Erro ao gravar lote de APF:', err);
    showToast(`Erro ao gravar lote: ${err.message}`, 'error');
    if (btnSave) btnSave.disabled = false;
  }
}
window.handleSaveApfAutoBatch = handleSaveApfAutoBatch;

/**
 * Auto-preenche o formulário manual modal-apf com base no requisito selecionado
 */
async function autofillApfFromRequirement() {
  const reqSelect = document.getElementById('apf-req-select');
  const reqId = reqSelect ? reqSelect.value : '';

  if (!reqId) {
    showToast('Selecione primeiro um requisito no campo acima.', 'warn');
    return;
  }

  try {
    showToast('Identificando sugestão pelo requisito...', 'info');
    const res = await store.previewAutoApf({ reqId });
    if (!res || !res.success || !Array.isArray(res.candidates) || res.candidates.length === 0) {
      showToast('Nenhuma sugestão automática encontrada para este requisito.', 'warn');
      return;
    }

    // Prefere uma transação EE ou a primeira candidata
    const cand = res.candidates.find(c => c.functionType === 'EE') || res.candidates[0];

    const nameInput = document.getElementById('apf-name-input');
    if (nameInput) nameInput.value = cand.name;

    // Selecionar radio do tipo
    const radio = document.querySelector(`input[name="apf-type"][value="${cand.functionType}"]`);
    if (radio) {
      radio.checked = true;
      document.querySelectorAll('.apf-type-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.type === cand.functionType);
      });
    }

    const tdInput = document.getElementById('apf-td-input');
    if (tdInput) tdInput.value = cand.td;

    const artrInput = document.getElementById('apf-artr-input');
    if (artrInput) artrInput.value = cand.arTr;

    const notesInput = document.getElementById('apf-notes-input');
    if (notesInput && !notesInput.value) {
      notesInput.value = cand.rationale || cand.notes || '';
    }

    updateApfLiveCalc();
    showToast(`Sugestão IFPUG aplicada: ${cand.functionType} (${cand.complexity}, ${cand.rawPf} PF)!`);

  } catch (err) {
    console.error('Erro no auto-preenchimento por requisito:', err);
    showToast(`Erro ao sugerir pelo requisito: ${err.message}`, 'error');
  }
}
window.autofillApfFromRequirement = autofillApfFromRequirement;

// Inicializa os event listeners do APF após carga do documento
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApfEventListeners);
} else {
  initApfEventListeners();
}




