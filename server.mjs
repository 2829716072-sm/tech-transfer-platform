// 科技成果转化信息收集与展示平台 · 纯 Node.js 内置模块，零依赖
// 启动：node server.mjs   或   npm start
// 配置：通过环境变量 ADMIN_PASSWORD（默认 tech-transfer-2026）、PORT（默认 7101）
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { extname, join, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { networkInterfaces } from 'node:os';

const root = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(root, 'public');
const dataDir = process.env.DATA_DIR || join(root, 'data');
const usersFile = join(dataDir, 'users.json');
const projectsFile = join(dataDir, 'projects.json');
const intentsFile = join(dataDir, 'intents.json');        // 合作意向
const favoritesFile = join(dataDir, 'favorites.json');    // 收藏
const notificationsFile = join(dataDir, 'notifications.json'); // 站内消息
const submissionsFile = join(dataDir, 'submissions.json'); // 旧文件，仅作迁移源/备份

// ====== 配置 ======
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'tech-transfer-2026';
const PORT = Number(process.env.PORT || 7101);
const HOST = process.env.HOST || '0.0.0.0';
const SECRET = process.env.SECRET || randomBytes(16).toString('hex');
const TOKEN_TTL = 7 * 24 * 60 * 60 * 1000; // 7 天

// ====== 常量（字段定义，与前端一致） ======
const TECH_FIELDS = ['新一代信息技术', '高端装备', '新材料', '生物医药', '新能源', '节能环保', '数字创意', '其他'];
const MATURITY_LEVELS = ['实验室阶段', '小试阶段', '中试阶段', '产业化阶段'];
const ROLES = [
  { value: 'researcher', label: '科研人员' },
  { value: 'enterprise', label: '企业方' },
  { value: 'investor', label: '投资人' },
];
const PROJECT_TYPES = [
  { value: 'supply', label: '成果供给' },
  { value: 'demand', label: '技术需求' },
  { value: 'service', label: '服务案例' },
];
const ROLE_VALUES = ROLES.map(r => r.value);
const PROJECT_TYPE_VALUES = PROJECT_TYPES.map(r => r.value);

// 项目可由用户提交的字段（富文本 + 结构化）
const PROJECT_INPUT_FIELDS = [
  'projectName', 'companyName', 'projectInfo', 'projectStatus', 'requirements',
  'managerName', 'managerComment',
  'projectType', 'techField', 'maturity', 'contactName', 'contactPhone', 'contactEmail',
];
const PROJECT_FIELD_LABELS = {
  projectName: '项目名称', companyName: '公司名称', projectInfo: '项目基本信息',
  projectStatus: '项目最新情况', requirements: '需求', managerName: '技术经理人名称',
  managerComment: '技术经理人评价', projectType: '类型', techField: '技术领域',
  maturity: '成熟度', contactName: '联系人', contactPhone: '联系电话', contactEmail: '联系邮箱',
};
const CONTACT_FIELDS = ['contactName', 'contactPhone', 'contactEmail'];

// ====== 数据读写 ======
async function ensureFile(filePath, init = '[]') {
  try {
    await mkdir(dirname(filePath), { recursive: true });
  } catch {}
  try {
    await access(filePath, constants.F_OK);
  } catch {
    await writeFile(filePath, init, 'utf8');
  }
}
async function readJson(filePath, fallback) {
  try {
    await ensureFile(filePath);
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}
async function writeJson(filePath, data) {
  await ensureFile(filePath);
  await writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}
const readProjects = () => readJson(projectsFile, []);
const saveProjects = (list) => writeJson(projectsFile, list);
const readUsers = () => readJson(usersFile, []);
const saveUsers = (list) => writeJson(usersFile, list);
const readIntents = () => readJson(intentsFile, []);
const saveIntents = (list) => writeJson(intentsFile, list);
const readFavorites = () => readJson(favoritesFile, []);
const saveFavorites = (list) => writeJson(favoritesFile, list);
const readNotifications = () => readJson(notificationsFile, []);
const saveNotifications = (list) => writeJson(notificationsFile, list);

// 旧 submissions.json → projects.json 一次性迁移
async function migrateSubmissions() {
  try {
    await access(projectsFile, constants.F_OK);
    return; // 已存在 projects.json，无需迁移
  } catch {}
  let old = [];
  try {
    const raw = await readFile(submissionsFile, 'utf8');
    old = JSON.parse(raw || '[]');
  } catch {
    old = [];
  }
  const migrated = old.map((it) => ({
    ...it,
    projectType: it.projectType || 'supply',
    techField: it.techField || '',
    maturity: it.maturity || '',
    contactName: it.contactName || it.managerName || '',
    contactPhone: it.contactPhone || '',
    contactEmail: it.contactEmail || '',
    status: it.status || 'published', // 旧数据默认发布，避免突然消失
    submittedBy: it.submittedBy || null,
    submitterRole: it.submitterRole || 'researcher',
    reviewer: it.reviewer || null,
    reviewedAt: it.reviewedAt || null,
  }));
  await saveProjects(migrated);
}

// ====== Token（HMAC 双轨：admin / user） ======
function sign(payload) {
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${sig}`).toString('base64');
}
function signAdminToken() {
  return sign(`admin:${Date.now()}`);
}
function signUserToken(userId, role) {
  return sign(`user:${userId}:${role}:${Date.now()}`);
}
// 返回 { type:'admin'|'user', userId?, role?, ts } 或 null
function verifyToken(token) {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const idx = decoded.lastIndexOf(':');
    if (idx < 0) return null;
    const payload = decoded.slice(0, idx);
    const sig = decoded.slice(idx + 1);
    const expected = createHmac('sha256', SECRET).update(payload).digest('hex');
    if (sig.length !== expected.length) return null;
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    // 解析 payload
    if (payload.startsWith('admin:')) {
      const ts = Number(payload.slice(6));
      if (Number.isNaN(ts) || Date.now() - ts > TOKEN_TTL) return null;
      return { type: 'admin', ts };
    }
    if (payload.startsWith('user:')) {
      const parts = payload.split(':'); // ['user', userId, role, ts]
      if (parts.length < 4) return null;
      const userId = parts[1];
      const role = parts[2];
      const ts = Number(parts.slice(3).join(':'));
      if (Number.isNaN(ts) || Date.now() - ts > TOKEN_TTL) return null;
      if (!ROLE_VALUES.includes(role)) return null;
      return { type: 'user', userId, role, ts };
    }
    return null;
  } catch {
    return null;
  }
}
function getAuthPayload(req) {
  const auth = (req.headers['authorization'] || '').toString();
  if (!auth.startsWith('Bearer ')) return null;
  return verifyToken(auth.slice(7));
}
function requireAdmin(req, res) {
  const p = getAuthPayload(req);
  if (!p || p.type !== 'admin') { json(res, 401, { ok: false, error: '未登录或登录已过期' }); return null; }
  return p;
}
function requireUser(req, res) {
  const p = getAuthPayload(req);
  if (!p || p.type !== 'user') { json(res, 401, { ok: false, error: '请先登录' }); return null; }
  return p;
}

// ====== 密码（scrypt + 随机 salt） ======
function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [saltHex, hashHex] = stored.split(':');
    if (!saltHex || !hashHex) return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = scryptSync(password, salt, 64);
    if (actual.length !== expected.length) return false;
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// ====== 工具 ======
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
async function sendStatic(req, res) {
  try {
    let p = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    if (p === '/') p = '/index.html';
    const file = normalize(join(publicDir, p));
    if (!file.startsWith(publicDir)) { res.writeHead(403); return res.end('Forbidden'); }
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404); res.end('Not Found');
  }
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', c => {
      buf += c;
      if (buf.length > 2e6) { reject(new Error('请求体过大')); req.destroy(); }
    });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}
function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${randomBytes(4).toString('hex')}`;
}
function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
function isPhone(s) {
  return /^1[3-9]\d{9}$/.test(s);
}
// 项目公开投影：剔除 ip；联系方式按 withContact 决定
function publicProject(p, { withContact = false } = {}) {
  const out = { ...p };
  delete out.ip;
  if (!withContact) {
    for (const f of CONTACT_FIELDS) delete out[f];
  }
  return out;
}
function publicUser(u) {
  const { salt, hash, ...rest } = u;
  return rest;
}
function roleLabelOf(v) {
  return ROLES.find(r => r.value === v)?.label || v || '';
}
// 站内消息写入
async function notify(userId, type, title, body, link) {
  if (!userId) return;
  const list = await readNotifications();
  list.push({
    id: genId('n'), userId, type, title,
    body: String(body || '').slice(0, 500),
    link: link || '', read: false,
    createdAt: new Date().toISOString(),
  });
  await saveNotifications(list);
}
// CSV 转义
function csvCell(s) {
  if (s == null) s = '';
  s = String(s);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCSV(list) {
  const cols = ['序号', '提交时间', '状态', ...PROJECT_INPUT_FIELDS.map(f => PROJECT_FIELD_LABELS[f])];
  const rows = list.map((it, i) => [
    String(i + 1),
    new Date(it.submittedAt).toLocaleString('zh-CN', { hour12: false }),
    it.status || '',
    ...PROJECT_INPUT_FIELDS.map(f => it[f] ?? ''),
  ].map(csvCell).join(','));
  return '\uFEFF' + cols.map(csvCell).join(',') + '\r\n' + rows.join('\r\n');
}
// 公开列表筛选 + 分页
function filterProjects(list, q) {
  let r = list.filter(it => it.status === 'published');
  const { techField, maturity, projectType, keyword } = q;
  if (techField && techField !== 'all') r = r.filter(it => it.techField === techField);
  if (maturity && maturity !== 'all') r = r.filter(it => it.maturity === maturity);
  if (projectType && projectType !== 'all') r = r.filter(it => it.projectType === projectType);
  if (keyword) {
    const k = keyword.toLowerCase();
    r = r.filter(it =>
      (it.projectName || '').toLowerCase().includes(k) ||
      (it.companyName || '').toLowerCase().includes(k) ||
      (it.projectInfo || '').toLowerCase().includes(k) ||
      (it.techField || '').toLowerCase().includes(k)
    );
  }
  // 最新优先
  r.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  return r;
}

// ====== 路由 ======
const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method || 'GET';
  const query = Object.fromEntries(url.searchParams.entries());

  // ---------- 健康检查（托管平台探活用） ----------
  if (path === '/healthz' && method === 'GET') {
    return json(res, 200, { ok: true, uptime: process.uptime() });
  }

  // ---------- 公开统计 ----------
  if (path === '/api/stats' && method === 'GET') {
    const [projects, users] = await Promise.all([readProjects(), readUsers()]);
    const published = projects.filter(p => p.status === 'published');
    const fieldDistribution = {};
    for (const f of TECH_FIELDS) fieldDistribution[f] = 0;
    for (const p of published) fieldDistribution[p.techField] = (fieldDistribution[p.techField] || 0) + 1;
    const typeDistribution = { supply: 0, demand: 0 };
    for (const p of published) typeDistribution[p.projectType] = (typeDistribution[p.projectType] || 0) + 1;
    return json(res, 200, {
      ok: true,
      projectCount: published.length,
      userCount: users.length,
      pendingCount: projects.filter(p => p.status === 'pending').length,
      fieldDistribution,
      typeDistribution,
    });
  }

  // ---------- 认证：注册 ----------
  if (path === '/api/auth/register' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const phone = String(body.phone || '').trim();
      const password = String(body.password || '');
      const name = String(body.name || '').trim().slice(0, 100);
      const role = String(body.role || '').trim();
      if (!isPhone(phone)) return json(res, 400, { ok: false, error: '手机号格式不正确' });
      if (password.length < 6) return json(res, 400, { ok: false, error: '密码至少 6 位' });
      if (!name) return json(res, 400, { ok: false, error: '请填写姓名' });
      if (!ROLE_VALUES.includes(role)) return json(res, 400, { ok: false, error: '请选择有效身份' });
      const users = await readUsers();
      if (users.some(u => u.phone === phone)) return json(res, 400, { ok: false, error: '该手机号已注册' });
      const user = {
        id: genId('u'),
        phone, name, role,
        hash: hashPassword(password),
        status: 'active',
        createdAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      users.push(user);
      await saveUsers(users);
      return json(res, 200, { ok: true, token: signUserToken(user.id, user.role), user: publicUser(user) });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 认证：登录 ----------
  if (path === '/api/auth/login' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const phone = String(body.phone || '').trim();
      const password = String(body.password || '');
      if (!phone || !password) return json(res, 400, { ok: false, error: '请填写手机号和密码' });
      const users = await readUsers();
      const user = users.find(u => u.phone === phone);
      if (!user || !verifyPassword(password, user.hash)) {
        return json(res, 401, { ok: false, error: '手机号或密码错误' });
      }
      if (user.status === 'disabled') return json(res, 403, { ok: false, error: '账号已被禁用' });
      user.lastLoginAt = new Date().toISOString();
      await saveUsers(users);
      return json(res, 200, { ok: true, token: signUserToken(user.id, user.role), user: publicUser(user) });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 认证：当前用户 ----------
  if (path === '/api/auth/me' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const users = await readUsers();
    const user = users.find(u => u.id === p.userId);
    if (!user) return json(res, 401, { ok: false, error: '用户不存在' });
    return json(res, 200, { ok: true, user: publicUser(user) });
  }

  // ---------- 项目：公开列表 ----------
  if (path === '/api/projects' && method === 'GET') {
    const list = await readProjects();
    const filtered = filterProjects(list, {
      techField: query.techField,
      maturity: query.maturity,
      projectType: query.projectType,
      keyword: query.q,
    });
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(48, Math.max(1, Number(query.pageSize) || 12));
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const pageItems = filtered.slice(start, start + pageSize).map(p => publicProject(p, { withContact: false }));
    return json(res, 200, { ok: true, list: pageItems, total, page, pageSize, pageCount: Math.ceil(total / pageSize) });
  }

  // ---------- 项目：详情 ----------
  if (path.startsWith('/api/projects/') && method === 'GET') {
    const id = decodeURIComponent(path.slice('/api/projects/'.length));
    const list = await readProjects();
    const p = list.find(it => it.id === id);
    if (!p) return json(res, 404, { ok: false, error: '项目不存在' });
    const payload = getAuthPayload(req);
    const isOwner = payload && payload.type === 'user' && payload.userId === p.submittedBy;
    // 非 published 仅本人可见
    if (p.status !== 'published' && !isOwner) {
      return json(res, 404, { ok: false, error: '项目不存在' });
    }
    const withContact = !!(payload && payload.type === 'user');
    // 附加状态：是否本人项目 / 是否已收藏 / 是否已提交过意向
    let favorited = false, myIntent = null;
    if (withContact) {
      const favs = await readFavorites();
      favorited = favs.some(f => f.userId === payload.userId && f.projectId === p.id);
      const intents = await readIntents();
      const mine = intents.find(i => i.projectId === p.id && i.userId === payload.userId);
      if (mine) myIntent = { message: mine.message, contact: mine.contact, createdAt: mine.createdAt };
    }
    return json(res, 200, {
      ok: true, project: publicProject(p, { withContact }),
      loggedIn: !!withContact, isOwner: !!isOwner, favorited, myIntent,
    });
  }

  // ---------- 项目：提交（需登录） ----------
  if (path === '/api/projects' && method === 'POST') {
    const p = requireUser(req, res);
    if (!p) return;
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const rec = {};
      for (const f of PROJECT_INPUT_FIELDS) {
        rec[f] = String(body[f] ?? '').trim().slice(0, 8000);
      }
      // 必填校验
      const required = ['projectName', 'companyName', 'managerName', 'contactName', 'techField', 'maturity', 'projectType'];
      for (const f of required) {
        if (!rec[f]) return json(res, 400, { ok: false, error: `请填写${PROJECT_FIELD_LABELS[f]}` });
      }
      // 白名单校验
      if (!PROJECT_TYPE_VALUES.includes(rec.projectType)) return json(res, 400, { ok: false, error: '类型无效' });
      if (!TECH_FIELDS.includes(rec.techField)) return json(res, 400, { ok: false, error: '技术领域无效' });
      if (!MATURITY_LEVELS.includes(rec.maturity)) return json(res, 400, { ok: false, error: '成熟度无效' });
      if (rec.contactEmail && !isEmail(rec.contactEmail)) return json(res, 400, { ok: false, error: '联系邮箱格式不正确' });

      rec.id = genId('p');
      rec.submittedBy = p.userId;
      rec.submitterRole = p.role;
      rec.status = 'pending';
      rec.reviewer = null;
      rec.reviewedAt = null;
      rec.submittedAt = new Date().toISOString();
      rec.ip = (req.headers['x-forwarded-for'] || '').toString().split(',')[0] || req.socket.remoteAddress || '';

      const list = await readProjects();
      list.push(rec);
      await saveProjects(list);
      return json(res, 200, { ok: true, id: rec.id });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 我的项目（需登录） ----------
  if (path === '/api/my/projects' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const list = await readProjects();
    const mine = list.filter(it => it.submittedBy === p.userId)
      .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt))
      .map(it => publicProject(it, { withContact: true }));
    return json(res, 200, { ok: true, list: mine, total: mine.length });
  }

  // 撤回自己的项目（仅本人）
  if (path === '/api/my/delete' && method === 'POST') {
    const p = requireUser(req, res);
    if (!p) return;
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const id = String(body.id || '');
      const list = await readProjects();
      const it = list.find(x => x.id === id);
      if (!it) return json(res, 404, { ok: false, error: '项目不存在' });
      if (it.submittedBy !== p.userId) return json(res, 403, { ok: false, error: '无权操作' });
      const next = list.filter(x => x.id !== id);
      await saveProjects(next);
      return json(res, 200, { ok: true, total: next.length });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 编辑自己的项目（仅本人；编辑后重新进入审核） ----------
  if (path.startsWith('/api/my/projects/') && method === 'PUT') {
    const p = requireUser(req, res);
    if (!p) return;
    try {
      const id = decodeURIComponent(path.slice('/api/my/projects/'.length));
      const body = JSON.parse(await readBody(req) || '{}');
      const list = await readProjects();
      const it = list.find(x => x.id === id);
      if (!it) return json(res, 404, { ok: false, error: '项目不存在' });
      if (it.submittedBy !== p.userId) return json(res, 403, { ok: false, error: '无权操作' });

      const rec = {};
      for (const f of PROJECT_INPUT_FIELDS) rec[f] = String(body[f] ?? '').trim().slice(0, 8000);
      const required = ['projectName', 'companyName', 'managerName', 'contactName', 'techField', 'maturity', 'projectType'];
      for (const f of required) {
        if (!rec[f]) return json(res, 400, { ok: false, error: `请填写${PROJECT_FIELD_LABELS[f]}` });
      }
      if (!PROJECT_TYPE_VALUES.includes(rec.projectType)) return json(res, 400, { ok: false, error: '类型无效' });
      if (!TECH_FIELDS.includes(rec.techField)) return json(res, 400, { ok: false, error: '技术领域无效' });
      if (!MATURITY_LEVELS.includes(rec.maturity)) return json(res, 400, { ok: false, error: '成熟度无效' });
      if (rec.contactEmail && !isEmail(rec.contactEmail)) return json(res, 400, { ok: false, error: '联系邮箱格式不正确' });

      Object.assign(it, rec);
      // 任何编辑后都需重新审核
      it.status = 'pending';
      it.reviewer = null;
      it.reviewedAt = null;
      it.updatedAt = new Date().toISOString();
      await saveProjects(list);
      return json(res, 200, { ok: true });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 合作意向：提交（需登录，同项目重复提交则更新） ----------
  if (path.startsWith('/api/projects/') && path.endsWith('/intents') && method === 'POST') {
    const p = requireUser(req, res);
    if (!p) return;
    try {
      const pid = decodeURIComponent(path.slice('/api/projects/'.length, -'/intents'.length));
      const body = JSON.parse(await readBody(req) || '{}');
      const message = String(body.message || '').trim().slice(0, 2000);
      const contact = String(body.contact || '').trim().slice(0, 200);
      if (!message) return json(res, 400, { ok: false, error: '请填写合作意向说明' });

      const projects = await readProjects();
      const proj = projects.find(x => x.id === pid);
      if (!proj || proj.status !== 'published') return json(res, 404, { ok: false, error: '项目不存在或未发布' });
      if (proj.submittedBy === p.userId) return json(res, 400, { ok: false, error: '不能对自己发布的项目提交意向' });

      const users = await readUsers();
      const me = users.find(u => u.id === p.userId);
      const intents = await readIntents();
      const exist = intents.find(i => i.projectId === pid && i.userId === p.userId);
      if (exist) {
        exist.message = message;
        exist.contact = contact;
        exist.updatedAt = new Date().toISOString();
      } else {
        intents.push({
          id: genId('i'), projectId: pid, projectName: proj.projectName,
          userId: p.userId, userName: me?.name || '', userRole: p.role,
          userPhone: me?.phone || '', contact, message,
          createdAt: new Date().toISOString(), updatedAt: null,
        });
      }
      await saveIntents(intents);
      await notify(
        proj.submittedBy, 'intent', '收到新的合作意向',
        `${me?.name || '用户'}（${roleLabelOf(p.role)}）对项目「${proj.projectName}」表达了合作意向`,
        '/my.html?tab=received'
      );
      return json(res, 200, { ok: true, updated: !!exist });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 收到的意向（我的项目收到的） ----------
  if (path === '/api/my/received-intents' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const [projects, intents] = await Promise.all([readProjects(), readIntents()]);
    const myProjectIds = new Set(projects.filter(x => x.submittedBy === p.userId).map(x => x.id));
    const received = intents
      .filter(i => myProjectIds.has(i.projectId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(res, 200, { ok: true, list: received, total: received.length });
  }

  // ---------- 我发出的意向 ----------
  if (path === '/api/my/sent-intents' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const intents = await readIntents();
    const sent = intents
      .filter(i => i.userId === p.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(res, 200, { ok: true, list: sent, total: sent.length });
  }

  // ---------- 收藏：切换（需登录） ----------
  if (path === '/api/favorites' && method === 'POST') {
    const p = requireUser(req, res);
    if (!p) return;
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const pid = String(body.projectId || '');
      const projects = await readProjects();
      if (!projects.some(x => x.id === pid)) return json(res, 404, { ok: false, error: '项目不存在' });
      const favs = await readFavorites();
      const idx = favs.findIndex(f => f.userId === p.userId && f.projectId === pid);
      let favorited;
      if (idx >= 0) { favs.splice(idx, 1); favorited = false; }
      else { favs.push({ userId: p.userId, projectId: pid, createdAt: new Date().toISOString() }); favorited = true; }
      await saveFavorites(favs);
      return json(res, 200, { ok: true, favorited });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 收藏：项目 ID 集合 ----------
  if (path === '/api/favorites/ids' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const favs = await readFavorites();
    return json(res, 200, { ok: true, ids: favs.filter(f => f.userId === p.userId).map(f => f.projectId) });
  }

  // ---------- 收藏：列表（仅显示仍公开的项目） ----------
  if (path === '/api/favorites' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const [favs, projects] = await Promise.all([readFavorites(), readProjects()]);
    const pubMap = new Map(projects.filter(x => x.status === 'published').map(x => [x.id, x]));
    const list = favs
      .filter(f => f.userId === p.userId && pubMap.has(f.projectId))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(f => publicProject(pubMap.get(f.projectId), { withContact: false }));
    return json(res, 200, { ok: true, list, total: list.length });
  }

  // ---------- 消息：未读数 ----------
  if (path === '/api/notifications/unread-count' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const list = await readNotifications();
    const n = list.filter(x => x.userId === p.userId && !x.read).length;
    return json(res, 200, { ok: true, count: n });
  }

  // ---------- 消息：列表 ----------
  if (path === '/api/notifications' && method === 'GET') {
    const p = requireUser(req, res);
    if (!p) return;
    const list = await readNotifications();
    const mine = list
      .filter(x => x.userId === p.userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(res, 200, { ok: true, list: mine, total: mine.length, unread: mine.filter(x => !x.read).length });
  }

  // ---------- 消息：全部已读 ----------
  if (path === '/api/notifications/read-all' && method === 'POST') {
    const p = requireUser(req, res);
    if (!p) return;
    const list = await readNotifications();
    let changed = false;
    for (const x of list) {
      if (x.userId === p.userId && !x.read) { x.read = true; changed = true; }
    }
    if (changed) await saveNotifications(list);
    return json(res, 200, { ok: true });
  }

  // ---------- 管理员登录 ----------
  if (path === '/api/admin/login' && method === 'POST') {
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const pwd = String(body.password || '');
      if (pwd === ADMIN_PASSWORD) {
        return json(res, 200, { ok: true, token: signAdminToken() });
      }
      return json(res, 401, { ok: false, error: '密码错误' });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ===== 以下管理员接口需 admin token =====

  if (path === '/api/admin/list' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const list = await readProjects();
    list.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
    return json(res, 200, { ok: true, total: list.length, list });
  }

  if (path === '/api/admin/review' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const id = String(body.id || '');
      const status = String(body.status || '');
      if (!['published', 'rejected'].includes(status)) {
        return json(res, 400, { ok: false, error: '审核状态无效' });
      }
      const list = await readProjects();
      const it = list.find(x => x.id === id);
      if (!it) return json(res, 404, { ok: false, error: '项目不存在' });
      it.status = status;
      it.reviewer = 'admin';
      it.reviewedAt = new Date().toISOString();
      await saveProjects(list);
      if (it.submittedBy) {
        await notify(
          it.submittedBy, 'review',
          status === 'published' ? '项目审核通过' : '项目审核未通过',
          status === 'published'
            ? `「${it.projectName}」已通过审核并公开展示`
            : `「${it.projectName}」未通过审核，可修改后重新提交`,
          status === 'published' ? `/project.html?id=${it.id}` : `/submit.html?id=${it.id}`
        );
      }
      return json(res, 200, { ok: true, status });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  // ---------- 管理员：全部合作意向 ----------
  if (path === '/api/admin/intents' && method === 'GET') {
    const ap = getAuthPayload(req);
    if (!ap || ap.type !== 'admin') return json(res, 403, { ok: false, error: '需要管理员权限' });
    const intents = await readIntents();
    const list = intents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(res, 200, { ok: true, list, total: list.length });
  }

  if (path === '/api/admin/users' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const users = await readUsers();
    users.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return json(res, 200, { ok: true, total: users.length, list: users.map(publicUser) });
  }

  if (path === '/api/admin/stats' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const [projects, users] = await Promise.all([readProjects(), readUsers()]);
    const byStatus = { pending: 0, published: 0, rejected: 0 };
    for (const p of projects) byStatus[p.status] = (byStatus[p.status] || 0) + 1;
    const byRole = { researcher: 0, enterprise: 0, investor: 0 };
    for (const u of users) byRole[u.role] = (byRole[u.role] || 0) + 1;
    const byField = {};
    for (const f of TECH_FIELDS) byField[f] = 0;
    for (const p of projects) byField[p.techField] = (byField[p.techField] || 0) + 1;
    return json(res, 200, {
      ok: true,
      projectTotal: projects.length,
      userTotal: users.length,
      byStatus, byRole, byField,
    });
  }

  if (path === '/api/admin/download' && method === 'GET') {
    if (!requireAdmin(req, res)) return;
    const list = await readProjects();
    const csv = toCSV(list);
    const fname = `项目信息_${new Date().toISOString().slice(0, 10)}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fname)}`,
    });
    return res.end(csv);
  }

  if (path === '/api/admin/delete' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    try {
      const body = JSON.parse(await readBody(req) || '{}');
      const id = String(body.id || '');
      const list = await readProjects();
      const next = list.filter(x => x.id !== id);
      await saveProjects(next);
      return json(res, 200, { ok: true, total: next.length });
    } catch (e) {
      return json(res, 400, { ok: false, error: e.message });
    }
  }

  if (path === '/api/admin/clear' && method === 'POST') {
    if (!requireAdmin(req, res)) return;
    await saveProjects([]);
    return json(res, 200, { ok: true });
  }

  // ---------- 静态文件 ----------
  return sendStatic(req, res);
});

function getLAN() {
  try {
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const n of nets[name] || []) {
        if (n.family === 'IPv4' && !n.internal) return n.address;
      }
    }
  } catch {}
  return '0.0.0.0';
}

// 启动前迁移旧数据
migrateSubmissions().finally(() => {
  server.listen(PORT, HOST, () => {
    console.log(`科技成果转化平台已启动：`);
    console.log(`  首页：      http://127.0.0.1:${PORT}/`);
    console.log(`  成果展示：  http://127.0.0.1:${PORT}/projects.html`);
    console.log(`  管理后台：  http://127.0.0.1:${PORT}/admin.html`);
    console.log(`  局域网访问：http://${getLAN()}:${PORT} （同 WiFi 设备可填）`);
    console.log(`  管理密码：  ${ADMIN_PASSWORD}（请通过环境变量 ADMIN_PASSWORD 修改）`);
  });
});
