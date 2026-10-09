import { requireAuth, escapeHtml, formatDate, formatDateTime, statusLabel, statusClass, typeLabel, roleLabel, projectCard } from '/common.js';

const u = await requireAuth('/my.html');
if (!u) throw new Error('redirecting');

const token = () => localStorage.getItem('tt_user_token') || '';
const authFetch = (url, opts = {}) => fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token() } });

// ===== Tab 切换 =====
const tabs = document.querySelectorAll('.tabs .tab');
tabs.forEach(t => t.addEventListener('click', () => {
  tabs.forEach(x => x.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
  t.classList.add('active');
  document.getElementById('tab-' + t.dataset.tab).classList.add('active');
  load(t.dataset.tab);
}));

// 支持 ?tab=received 直达（消息通知跳转用）
const initTab = new URLSearchParams(location.search).get('tab');
if (initTab && document.querySelector(`.tab[data-tab="${initTab}"]`)) {
  document.querySelector(`.tab[data-tab="${initTab}"]`).click();
}

function load(tab) {
  if (tab === 'projects') loadProjects();
  else if (tab === 'received') loadReceived();
  else if (tab === 'sent') loadSent();
  else if (tab === 'favorites') loadFavorites();
}

// ===== 我的项目 =====
async function loadProjects() {
  const listEl = document.getElementById('myList');
  const countEl = document.getElementById('myCount');
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await authFetch('/api/my/projects');
    if (res.status === 401) { location.href = '/auth.html?redirect=/my.html'; return; }
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    countEl.textContent = `共 ${data.total} 项`;
    if (!data.list.length) {
      listEl.innerHTML = '<div class="empty-state"><p>你还没有提交过项目</p><a class="btn-primary btn-sm" href="/submit.html">提交第一个</a></div>';
      return;
    }
    listEl.innerHTML = data.list.map(card).join('');
  } catch { listEl.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

function card(p) {
  const reviewInfo = p.status === 'pending'
    ? `提交于 ${formatDateTime(p.submittedAt)}`
    : p.status === 'published'
      ? `审核通过 · 发布于 ${formatDate(p.reviewedAt)}`
      : `已驳回 · ${formatDate(p.reviewedAt)}`;
  return `
    <div class="my-card card">
      <div class="my-head">
        <div>
          <div class="my-tags">
            <span class="badge-status ${statusClass(p.status)}">${statusLabel(p.status)}</span>
            <span class="chip-field">${escapeHtml(p.techField) || '未分类'}</span>
            <span class="card-type">${typeLabel(p.projectType)}</span>
          </div>
          <h3 class="my-title">${escapeHtml(p.projectName) || '未命名项目'}</h3>
          <div class="my-sub">${escapeHtml(p.companyName) || '—'} · ${reviewInfo}</div>
        </div>
        <div class="my-actions">
          ${p.status === 'published' ? `<a class="btn-ghost btn-sm" href="/project.html?id=${encodeURIComponent(p.id)}">查看</a>` : ''}
          <a class="btn-ghost btn-sm" href="/submit.html?id=${encodeURIComponent(p.id)}" title="编辑后将重新审核">编辑</a>
          <button class="btn-danger btn-sm" data-del="${escapeHtml(p.id)}">撤回</button>
        </div>
      </div>
    </div>`;
}

document.getElementById('myList').addEventListener('click', async (e) => {
  const t = e.target.closest('[data-del]');
  if (!t) return;
  if (!confirm('确定撤回该项目？此操作不可撤销。')) return;
  try {
    const res = await authFetch('/api/my/delete', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: t.dataset.del }),
    });
    const data = await res.json();
    if (data.ok) loadProjects();
    else alert(data.error || '撤回失败');
  } catch { alert('网络异常'); }
});

// ===== 收到的意向 =====
async function loadReceived() {
  const listEl = document.getElementById('receivedList');
  const totalEl = document.getElementById('receivedTotal');
  const countEl = document.getElementById('receivedCount');
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await authFetch('/api/my/received-intents');
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    totalEl.textContent = `共 ${data.total} 条意向`;
    countEl.textContent = data.total ? `(${data.total})` : '';
    if (!data.list.length) { listEl.innerHTML = '<div class="empty-state"><p>暂无合作意向</p><p class="empty-sub">发布更多成果，或分享链接给潜在合作方</p></div>'; return; }
    listEl.innerHTML = data.list.map(receivedCard).join('');
  } catch { listEl.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

function receivedCard(i) {
  return `
    <div class="intent-item card">
      <div class="intent-head">
        <div>
          <div class="intent-who">
            <span class="badge-role">${roleLabel(i.userRole)}</span>
            <strong>${escapeHtml(i.userName)}</strong>
            <span class="intent-phone">📱 ${escapeHtml(i.userPhone)}</span>
          </div>
          <div class="intent-project">意向项目：<a href="/project.html?id=${encodeURIComponent(i.projectId)}">${escapeHtml(i.projectName)}</a></div>
        </div>
        <span class="meta-review">${formatDateTime(i.createdAt)}</span>
      </div>
      <div class="intent-msg">${escapeHtml(i.message)}</div>
      ${i.contact ? `<div class="intent-contact">补充联系方式：${escapeHtml(i.contact)}</div>` : ''}
    </div>`;
}

// ===== 发出的意向 =====
async function loadSent() {
  const listEl = document.getElementById('sentList');
  const totalEl = document.getElementById('sentTotal');
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await authFetch('/api/my/sent-intents');
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    totalEl.textContent = `共 ${data.total} 条意向`;
    if (!data.list.length) { listEl.innerHTML = '<div class="empty-state"><p>你还没有表达过合作意向</p><a class="btn-ghost btn-sm" href="/projects.html">去逛逛成果</a></div>'; return; }
    listEl.innerHTML = data.list.map(sentCard).join('');
  } catch { listEl.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

function sentCard(i) {
  return `
    <div class="intent-item card">
      <div class="intent-head">
        <div>
          <div class="intent-project">意向项目：<a href="/project.html?id=${encodeURIComponent(i.projectId)}">${escapeHtml(i.projectName)}</a></div>
        </div>
        <span class="meta-review">提交于 ${formatDateTime(i.createdAt)}</span>
      </div>
      <div class="intent-msg">${escapeHtml(i.message)}</div>
    </div>`;
}

// ===== 我的收藏 =====
async function loadFavorites() {
  const listEl = document.getElementById('favList');
  const totalEl = document.getElementById('favTotal');
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await authFetch('/api/favorites');
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    totalEl.textContent = `共 ${data.total} 项`;
    if (!data.list.length) { listEl.innerHTML = '<div class="empty-state"><p>暂无收藏</p><a class="btn-ghost btn-sm" href="/projects.html">发现感兴趣的项目</a></div>'; return; }
    listEl.innerHTML = data.list.map(projectCard).join('');
  } catch { listEl.innerHTML = '<div class="empty-state">网络异常</div>'; }
}
