import { requireAuth, escapeHtml, formatDate, formatDateTime, statusLabel, statusClass, typeLabel } from '/common.js';

const u = await requireAuth('/my.html');
if (!u) throw new Error('redirecting');

const listEl = document.getElementById('myList');
const countEl = document.getElementById('myCount');

async function load() {
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await fetch('/api/my/projects', { headers: { Authorization: 'Bearer ' + localStorage.getItem('tt_user_token') } });
    if (res.status === 401) { location.href = '/auth.html?redirect=/my.html'; return; }
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    countEl.textContent = `共 ${data.total} 项`;
    if (!data.list.length) {
      listEl.innerHTML = '<div class="empty-state"><p>你还没有提交过项目</p><a class="btn-primary btn-sm" href="/submit.html">提交第一个</a></div>';
      return;
    }
    listEl.innerHTML = data.list.map(card).join('');
  } catch {
    listEl.innerHTML = '<div class="empty-state">网络异常</div>';
  }
}

function card(p) {
  const reviewInfo = p.status === 'pending'
    ? `<span class="meta-review">提交于 ${formatDateTime(p.submittedAt)}</span>`
    : p.status === 'published'
      ? `<span class="meta-review">审核通过 · 发布于 ${formatDate(p.reviewedAt)}</span>`
      : `<span class="meta-review">已驳回 · ${formatDate(p.reviewedAt)}</span>`;
  const canWithdraw = p.status === 'pending';
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
          ${canWithdraw ? `<button class="btn-danger btn-sm" data-del="${escapeHtml(p.id)}">撤回</button>` : ''}
        </div>
      </div>
    </div>`;
}

listEl.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-del]');
  if (!t) return;
  if (!confirm('确定撤回该项目？此操作不可撤销。')) return;
  try {
    const res = await fetch('/api/my/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + localStorage.getItem('tt_user_token') },
      body: JSON.stringify({ id: t.dataset.del }),
    });
    const data = await res.json();
    if (data.ok) load();
    else alert(data.error || '撤回失败');
  } catch { alert('网络异常'); }
});

load();
