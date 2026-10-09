// 管理后台逻辑
const TOKEN_KEY = 'tt_admin_token';
const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const setToken = (t) => { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); };
const authHeaders = () => ({ Authorization: 'Bearer ' + getToken() });

function escapeHtml(s) {
  if (s == null) return '';
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showMsg(el, type, text) {
  el.className = `msg show ${type}`; el.textContent = text;
}
function fmtDate(iso) { if (!iso) return '—'; try { return new Date(iso).toLocaleString('zh-CN', { hour12: false }); } catch { return iso; } }
const STATUS_LABELS = { pending: '待审核', published: '已发布', rejected: '已驳回' };
const STATUS_CLASS = { pending: 'badge-warn', published: 'badge-ok', rejected: 'badge-err' };
const ROLE_LABELS = { researcher: '科研人员', enterprise: '企业方', investor: '投资人' };

const loginView = document.getElementById('loginView');
const mainView = document.getElementById('mainView');
const loginForm = document.getElementById('loginForm');
const loginMsg = document.getElementById('loginMsg');
const loginBtn = document.getElementById('loginBtn');

// 登录
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  loginBtn.disabled = true; loginBtn.textContent = '登录中…';
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (data.ok) { setToken(data.token); enterMain(); }
    else showMsg(loginMsg, 'err', data.error || '登录失败');
  } catch { showMsg(loginMsg, 'err', '网络异常'); }
  finally { loginBtn.disabled = false; loginBtn.textContent = '登录'; }
});

function enterMain() {
  loginView.style.display = 'none';
  mainView.style.display = '';
  loadReview();
}

// Tab 切换
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const name = t.dataset.tab;
    document.getElementById('tab-' + name).classList.add('active');
    if (name === 'review') loadReview();
    if (name === 'intents') loadIntents();
    if (name === 'users') loadUsers();
    if (name === 'stats') loadStats();
  });
});

// ===== 审核队列 =====
async function loadReview() {
  const list = document.getElementById('reviewList');
  const filter = document.getElementById('reviewFilter').value;
  const count = document.getElementById('reviewCount');
  list.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await fetch('/api/admin/list', { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await res.json();
    if (!data.ok) { list.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    let items = data.list;
    if (filter !== 'all') items = items.filter(it => it.status === filter);
    count.textContent = `共 ${items.length} 条`;
    // 顶部统计待审核数
    const pendingN = data.list.filter(it => it.status === 'pending').length;
    document.getElementById('pendingCount').textContent = pendingN ? `(${pendingN})` : '';
    if (!items.length) { list.innerHTML = '<div class="empty-state">暂无记录</div>'; return; }
    list.innerHTML = items.map(reviewCard).join('');
  } catch { list.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

function reviewCard(it) {
  const cells = [
    ['项目名称', it.projectName], ['公司', it.companyName], ['类型', it.projectType === 'demand' ? '技术需求' : '成果供给'],
    ['技术领域', it.techField], ['成熟度', it.maturity], ['联系人', it.contactName], ['电话', it.contactPhone], ['邮箱', it.contactEmail],
    ['技术经理人', it.managerName], ['项目信息', it.projectInfo], ['最新情况', it.projectStatus], ['需求', it.requirements], ['经理人评价', it.managerComment],
  ];
  const isPending = it.status === 'pending';
  const actions = isPending
    ? `<button class="btn-primary btn-sm" data-review="${escapeHtml(it.id)}" data-st="published">通过</button>
       <button class="btn-danger btn-sm" data-review="${escapeHtml(it.id)}" data-st="rejected">驳回</button>`
    : `<span class="meta-review">审核于 ${fmtDate(it.reviewedAt)}</span>`;
  return `
    <div class="admin-entry card ${isPending ? 'pending' : ''}">
      <div class="entry-head">
        <div class="entry-title">${escapeHtml(it.projectName) || '（未填）'} · ${escapeHtml(it.companyName) || '—'}</div>
        <div class="entry-meta">
          <span class="badge-status ${STATUS_CLASS[it.status]}">${STATUS_LABELS[it.status]}</span>
          <span>${fmtDate(it.submittedAt)}</span>
          ${actions}
          <button class="btn-ghost btn-sm" data-del="${escapeHtml(it.id)}">删除</button>
        </div>
      </div>
      <div class="entry-grid">${cells.map(([k, v]) => `<div><div class="k">${k}</div><div class="v">${escapeHtml(v || '—')}</div></div>`).join('')}</div>
    </div>`;
}

document.getElementById('reviewList').addEventListener('click', async (e) => {
  const t = e.target;
  if (t.dataset.review) {
    const id = t.dataset.review, st = t.dataset.st;
    try {
      const res = await fetch('/api/admin/review', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id, status: st }),
      });
      if (res.status === 401) return logout();
      const data = await res.json();
      if (data.ok) loadReview(); else alert(data.error || '操作失败');
    } catch { alert('网络异常'); }
  } else if (t.dataset.del) {
    if (!confirm('确定删除该记录？不可撤销。')) return;
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ id: t.dataset.del }),
      });
      if (res.status === 401) return logout();
      const data = await res.json();
      if (data.ok) loadReview(); else alert(data.error || '删除失败');
    } catch { alert('网络异常'); }
  }
});

document.getElementById('reviewFilter').addEventListener('change', loadReview);

// ===== 合作意向 =====
async function loadIntents() {
  const listEl = document.getElementById('intentList');
  const totalEl = document.getElementById('intentTotal');
  const countEl = document.getElementById('intentCount');
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await fetch('/api/admin/intents', { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    totalEl.textContent = `共 ${data.total} 条意向`;
    countEl.textContent = data.total ? `(${data.total})` : '';
    if (!data.list.length) { listEl.innerHTML = '<div class="empty-state"><p>暂无合作意向</p></div>'; return; }
    const fmt = (s) => s ? String(s).slice(0, 16).replace('T', ' ') : '';
    const roleLabel = (v) => ({ researcher: '科研人员', enterprise: '企业方', investor: '投资人' }[v] || v || '');
    listEl.innerHTML = data.list.map(i => `
      <div class="intent-item card">
        <div class="intent-head">
          <div>
            <div class="intent-who">
              <span class="badge-role">${escapeHtml(roleLabel(i.userRole))}</span>
              <strong>${escapeHtml(i.userName)}</strong>
              <span class="intent-phone">📱 ${escapeHtml(i.userPhone)}</span>
            </div>
            <div class="intent-project">意向项目：<a href="/project.html?id=${encodeURIComponent(i.projectId)}">${escapeHtml(i.projectName)}</a></div>
          </div>
          <span class="meta-review">${fmt(i.createdAt)}</span>
        </div>
        <div class="intent-msg">${escapeHtml(i.message)}</div>
        ${i.contact ? `<div class="intent-contact">补充联系方式：${escapeHtml(i.contact)}</div>` : ''}
      </div>`).join('');
  } catch { listEl.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

// ===== 用户管理 =====
async function loadUsers() {
  const list = document.getElementById('userList');
  const count = document.getElementById('userCount');
  list.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await fetch('/api/admin/users', { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await res.json();
    if (!data.ok) { list.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    count.textContent = `共 ${data.total} 位用户`;
    if (!data.list.length) { list.innerHTML = '<div class="empty-state">暂无用户</div>'; return; }
    list.innerHTML = data.list.map(u => `
      <div class="user-row card">
        <div><div class="k">姓名</div><div class="v">${escapeHtml(u.name)}</div></div>
        <div><div class="k">手机号</div><div class="v">${escapeHtml(u.phone)}</div></div>
        <div><div class="k">身份</div><div class="v">${ROLE_LABELS[u.role] || u.role}</div></div>
        <div><div class="k">注册时间</div><div class="v">${fmtDate(u.createdAt)}</div></div>
        <div><div class="k">最近登录</div><div class="v">${fmtDate(u.lastLoginAt)}</div></div>
      </div>`).join('');
  } catch { list.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

// ===== 统计 =====
async function loadStats() {
  const el = document.getElementById('statsPanel');
  el.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await fetch('/api/admin/stats', { headers: authHeaders() });
    if (res.status === 401) return logout();
    const data = await res.json();
    if (!data.ok) { el.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    const sCards = [
      ['项目总数', data.projectTotal],
      ['待审核', data.byStatus.pending],
      ['已发布', data.byStatus.published],
      ['已驳回', data.byStatus.rejected],
      ['用户总数', data.userTotal],
      ['科研人员', data.byRole.researcher],
      ['企业方', data.byRole.enterprise],
      ['投资人', data.byRole.investor],
    ];
    el.innerHTML = `
      <div class="stat-grid">${sCards.map(([k, v]) => `<div class="stat-card"><div class="stat-num">${v}</div><div class="stat-label">${k}</div></div>`).join('')}</div>
      <div class="card" style="margin-top:20px">
        <h3 style="margin-top:0">技术领域分布</h3>
        ${Object.entries(data.byField).map(([k, v]) => `
          <div class="bar-row"><span class="bar-label">${escapeHtml(k)}</span>
            <div class="bar-track"><div class="bar-fill" style="width:${data.projectTotal ? Math.round(v / data.projectTotal * 100) : 0}%"></div></div>
            <span class="bar-val">${v}</span>
          </div>`).join('')}
      </div>`;
  } catch { el.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

// ===== 工具栏 =====
document.getElementById('refreshBtn').addEventListener('click', () => {
  const active = document.querySelector('.tab.active').dataset.tab;
  if (active === 'review') loadReview(); else if (active === 'users') loadUsers(); else loadStats();
});
document.getElementById('logoutBtn').addEventListener('click', logout);
function logout() { setToken(null); location.reload(); }

document.getElementById('downloadBtn').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const res = await fetch('/api/admin/download', { headers: authHeaders() });
    if (res.status === 401) return logout();
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `项目信息_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  } catch { alert('下载失败'); }
});

// 启动
if (getToken()) enterMain();
else loginView.style.display = '';
