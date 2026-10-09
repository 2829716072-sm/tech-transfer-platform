// 全站共享工具 · ES module
// 各页面：<script type="module" src="/common.js"></script> 后 import 调用

export const ROLE_LABELS = { researcher: '科研人员', enterprise: '企业方', investor: '投资人' };
export const TYPE_LABELS = { supply: '成果供给', demand: '技术需求' };
export const STATUS_LABELS = { pending: '待审核', published: '已发布', rejected: '已驳回' };

export function roleLabel(r) { return ROLE_LABELS[r] || r || ''; }
export function typeLabel(t) { return TYPE_LABELS[t] || t || ''; }
export function statusLabel(s) { return STATUS_LABELS[s] || s || ''; }

export function roleClass(r) {
  return { researcher: 'badge-role-r', enterprise: 'badge-role-e', investor: 'badge-role-i' }[r] || '';
}
export function statusClass(s) {
  return { pending: 'badge-warn', published: 'badge-ok', rejected: 'badge-err' }[s] || '';
}

export function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ===== Token 存储 =====
const USER_TOKEN_KEY = 'tt_user_token';
const ADMIN_TOKEN_KEY = 'tt_admin_token';

export function getToken() { return localStorage.getItem(USER_TOKEN_KEY) || ''; }
export function setToken(t) { if (t) localStorage.setItem(USER_TOKEN_KEY, t); else localStorage.removeItem(USER_TOKEN_KEY); }
export function getAdminToken() { return localStorage.getItem(ADMIN_TOKEN_KEY) || ''; }
export function setAdminToken(t) { if (t) localStorage.setItem(ADMIN_TOKEN_KEY, t); else localStorage.removeItem(ADMIN_TOKEN_KEY); }

// 带用户鉴权头的 fetch
export async function authFetch(url, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const t = getToken();
  if (t) headers['Authorization'] = 'Bearer ' + t;
  return fetch(url, { ...opts, headers });
}

// 当前登录用户（缓存在内存，避免重复请求）
let _meCache = null;
export async function currentUser() {
  if (_meCache) return _meCache;
  const t = getToken();
  if (!t) return null;
  try {
    const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + t } });
    if (res.status === 401) { setToken(null); return null; }
    const data = await res.json();
    _meCache = data.ok ? data.user : null;
    return _meCache;
  } catch { return null; }
}
export function clearCurrentUser() { _meCache = null; }

// 需登录才能访问：未登录跳 auth.html，返回 true 表示已登录
export async function requireAuth(redirect) {
  const u = await currentUser();
  if (!u) {
    const r = redirect || location.pathname + location.search;
    location.href = '/auth.html?redirect=' + encodeURIComponent(r);
    return null;
  }
  return u;
}

// ===== URL 工具 =====
export function getQuery(key, def) {
  const v = new URLSearchParams(location.search).get(key);
  return v == null ? def : v;
}

export function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return iso; }
}
export function formatDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('zh-CN', { hour12: false });
  } catch { return iso; }
}

// ===== 导航与页脚 =====
const NAV_LINKS = [
  { href: '/', label: '首页' },
  { href: '/projects.html', label: '成果展示' },
  { href: '/submit.html', label: '提交成果' },
  { href: '/my.html', label: '我的项目' },
];

export async function mountNav(mountId = 'nav') {
  const el = document.getElementById(mountId);
  if (!el) return;
  const u = await currentUser();
  const linksHtml = NAV_LINKS.map(l =>
    ` <a class="nav-link" href="${l.href}">${l.label}</a>`).join('');
  const right = u
    ? `<span class="nav-user">
         <a class="nav-bell" href="/notifications.html" title="消息通知">🔔<span class="bell-badge" id="bellBadge" style="display:none"></span></a>
         <span class="badge-role ${roleClass(u.role)}">${roleLabel(u.role)}</span>
         <span class="nav-name">${escapeHtml(u.name)}</span>
         <a class="nav-link dim" href="/my.html">我的项目</a>
         <button class="btn-ghost btn-sm" id="navLogout">退出</button>
       </span>`
    : `<a class="btn-ghost btn-sm" href="/auth.html">登录 / 注册</a>`;
  // 未读消息数
  if (u) {
    try {
      const res = await fetch('/api/notifications/unread-count', { headers: { Authorization: 'Bearer ' + getToken() } });
      const d = await res.json();
      if (d.ok && d.count > 0) {
        const badge = document.getElementById('bellBadge');
        if (badge) { badge.textContent = d.count > 99 ? '99+' : d.count; badge.style.display = ''; }
      }
    } catch {}
  }
  el.innerHTML = `
    <div class="navbar">
      <a class="brand" href="/">
        <span class="brand-mark">◆</span>
        <span class="brand-text">科技成果转化平台</span>
      </a>
      <nav class="nav-links">${linksHtml}</nav>
      <div class="nav-right">${right}</div>
    </div>`;
  const lo = document.getElementById('navLogout');
  if (lo) lo.addEventListener('click', () => { setToken(null); clearCurrentUser(); location.href = '/'; });
}

export function mountFooter(mountId = 'footer') {
  const el = document.getElementById(mountId);
  if (!el) return;
  el.innerHTML = `
    <footer class="site-footer">
      <div class="footer-inner">
        <div class="footer-col">
          <div class="footer-brand"><span class="brand-mark">◆</span> 科技成果转化平台</div>
          <p class="footer-desc">面向科研人员、企业方与投资人的成果转化信息发布与对接平台，促进科技成果从实验室走向产业。</p>
        </div>
        <div class="footer-col">
          <h4>快速链接</h4>
          <a href="/">首页</a><a href="/projects.html">成果展示</a><a href="/submit.html">提交成果</a>
        </div>
        <div class="footer-col">
          <h4>关于</h4>
          <a href="/auth.html">登录 / 注册</a><a href="/admin.html">管理后台</a>
        </div>
      </div>
      <div class="footer-copy">© ${new Date().getFullYear()} 科技成果转化平台 · 信息发布与对接服务</div>
    </footer>`;
}

// 通用消息提示
export function showMsg(el, type, text) {
  if (!el) return;
  el.className = `msg show ${type}`;
  el.textContent = text;
  if (type === 'ok') setTimeout(() => { el.className = 'msg'; }, 6000);
}

// 卡片公共片段
export function projectCard(p) {
  const typeTag = p.projectType === 'demand' ? '需求' : '供给';
  const field = escapeHtml(p.techField) || '未分类';
  const mat = escapeHtml(p.maturity) || '';
  const info = escapeHtml((p.projectInfo || '').slice(0, 120)) || '暂无简介';
  return `
    <a class="project-card type-${escapeHtml(p.projectType)}" href="/project.html?id=${encodeURIComponent(p.id)}">
      <div class="card-bar"></div>
      <div class="card-top">
        <span class="chip-field">${field}</span>
        <span class="card-type">${typeTag}</span>
      </div>
      <h3 class="card-title">${escapeHtml(p.projectName) || '未命名项目'}</h3>
      <p class="card-info">${info}${(p.projectInfo || '').length > 120 ? '…' : ''}</p>
      <div class="card-meta">
        <span class="meta-co">${escapeHtml(p.companyName) || '—'}</span>
        ${mat ? `<span class="meta-mat">${mat}</span>` : ''}
      </div>
    </a>`;
}

// 自动挂载导航与页脚（页面加载后）
if (document.readyState !== 'loading') {
  mountNav();
  mountFooter();
} else {
  document.addEventListener('DOMContentLoaded', () => { mountNav(); mountFooter(); });
}
