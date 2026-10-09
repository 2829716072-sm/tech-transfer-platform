import { requireAuth, escapeHtml, formatDateTime } from '/common.js';

const u = await requireAuth('/notifications.html');
if (!u) throw new Error('redirecting');

const token = () => localStorage.getItem('tt_user_token') || '';
const listEl = document.getElementById('notifList');
const countEl = document.getElementById('notifCount');

async function load() {
  listEl.innerHTML = '<div class="empty-state">加载中…</div>';
  try {
    const res = await fetch('/api/notifications', { headers: { Authorization: 'Bearer ' + token() } });
    if (res.status === 401) { location.href = '/auth.html?redirect=/notifications.html'; return; }
    const data = await res.json();
    if (!data.ok) { listEl.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    countEl.textContent = `共 ${data.total} 条，未读 ${data.unread} 条`;
    if (!data.list.length) { listEl.innerHTML = '<div class="empty-state"><p>暂无消息</p></div>'; return; }
    listEl.innerHTML = data.list.map(card).join('');
  } catch { listEl.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

function card(n) {
  const icon = n.type === 'intent' ? '🤝' : n.type === 'review' ? '📋' : '🔔';
  return `
    <a class="notif-row card ${n.read ? '' : 'unread'}" href="${escapeHtml(n.link || '/my.html')}">
      <span class="notif-icon">${icon}</span>
      <span class="notif-body">
        <span class="notif-title">${escapeHtml(n.title)}${n.read ? '' : '<span class="dot"></span>'}</span>
        <span class="notif-text">${escapeHtml(n.body)}</span>
      </span>
      <span class="notif-time">${formatDateTime(n.createdAt)}</span>
    </a>`;
}

document.getElementById('readAllBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/notifications/read-all', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token() },
    });
    load();
  } catch { alert('网络异常'); }
});

load();
