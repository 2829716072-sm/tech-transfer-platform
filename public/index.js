import { escapeHtml, projectCard } from '/common.js';

// 统计
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const d = await res.json();
    if (!d.ok) return;
    const nums = [d.projectCount, d.userCount, 8, d.pendingCount];
    const cards = document.querySelectorAll('#stats .stat-card');
    cards.forEach((c, i) => { if (nums[i] != null) c.querySelector('.stat-num').textContent = nums[i]; });
  } catch {}
}

// 最新成果
async function loadLatest() {
  const el = document.getElementById('latest');
  try {
    const res = await fetch('/api/projects?page=1&pageSize=6');
    const d = await res.json();
    if (!d.ok) { el.innerHTML = `<div class="empty-state">${escapeHtml(d.error || '加载失败')}</div>`; return; }
    if (!d.list.length) {
      el.innerHTML = '<div class="empty-state"><p>暂无发布成果</p><a class="btn-ghost btn-sm" href="/submit.html">提交第一个</a></div>';
      return;
    }
    el.innerHTML = d.list.map(projectCard).join('');
  } catch { el.innerHTML = '<div class="empty-state">网络异常</div>'; }
}

loadStats();
loadLatest();
