import { getQuery, escapeHtml, formatDate, typeLabel, roleLabel } from '/common.js';

const wrap = document.getElementById('detailWrap');
const id = getQuery('id');

if (!id) {
  wrap.innerHTML = '<div class="empty-state"><p>缺少项目 ID</p><a class="btn-primary btn-sm" href="/projects.html">返回列表</a></div>';
} else {
  loadDetail();
}

async function loadDetail() {
  try {
    const res = await fetch('/api/projects/' + encodeURIComponent(id));
    if (res.status === 404) {
      wrap.innerHTML = '<div class="empty-state"><p>项目不存在或尚未发布</p><a class="btn-primary btn-sm" href="/projects.html">返回列表</a></div>';
      return;
    }
    const data = await res.json();
    if (!data.ok) {
      wrap.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`;
      return;
    }
    render(data.project, data.loggedIn);
  } catch {
    wrap.innerHTML = '<div class="empty-state">网络异常</div>';
  }
}

function render(p, loggedIn) {
  const hasContact = p.contactName != null;
  const field = escapeHtml(p.techField) || '未分类';
  const mat = escapeHtml(p.maturity) || '';
  const rows = [
    ['项目名称', p.projectName],
    ['公司 / 机构', p.companyName],
    ['技术领域', p.techField],
    ['成熟度', p.maturity],
    ['类型', typeLabel(p.projectType)],
    ['提交时间', formatDate(p.submittedAt)],
  ];
  const textBlocks = [
    ['项目基本信息', p.projectInfo],
    ['项目最新情况', p.projectStatus],
    ['需求', p.requirements],
    ['技术经理人评价', p.managerComment],
  ];

  wrap.innerHTML = `
    <a class="back-link" href="/projects.html">← 返回列表</a>
    <article class="detail">
      <header class="detail-head card">
        <div class="detail-tags">
          <span class="chip-field">${field}</span>
          <span class="card-type">${typeLabel(p.projectType)}</span>
          ${mat ? `<span class="chip-maturity">${mat}</span>` : ''}
        </div>
        <h1 class="detail-title">${escapeHtml(p.projectName) || '未命名项目'}</h1>
        <div class="detail-sub">${escapeHtml(p.companyName) || '—'} · 提交于 ${formatDate(p.submittedAt)}</div>
      </header>

      <section class="detail-grid">
        <div class="detail-main">
          <div class="info-grid card">
            ${rows.map(([k, v]) => `
              <div class="info-row">
                <span class="info-k">${escapeHtml(k)}</span>
                <span class="info-v">${escapeHtml(v || '—')}</span>
              </div>`).join('')}
          </div>
          ${textBlocks.map(([k, v]) => v ? `
            <div class="card text-block">
              <h3>${escapeHtml(k)}</h3>
              <div class="text-content">${escapeHtml(v)}</div>
            </div>` : '').join('')}
        </div>

        <aside class="detail-side">
          <div class="card contact-card ${hasContact ? '' : 'contact-locked'}">
            <h3>联系方式</h3>
            ${hasContact ? `
              <div class="contact-list">
                <div class="info-row"><span class="info-k">联系人</span><span class="info-v">${escapeHtml(p.contactName || '—')}</span></div>
                <div class="info-row"><span class="info-k">电话</span><span class="info-v">${escapeHtml(p.contactPhone || '—')}</span></div>
                <div class="info-row"><span class="info-k">邮箱</span><span class="info-v">${escapeHtml(p.contactEmail || '—')}</span></div>
                <div class="info-row"><span class="info-k">技术经理人</span><span class="info-v">${escapeHtml(p.managerName || '—')}</span></div>
              </div>
              <a class="btn-primary btn-block" href="mailto:${encodeURIComponent(p.contactEmail || '')}">联系对方</a>
            ` : `
              <div class="contact-lock-body">
                <div class="lock-icon">🔒</div>
                <p>登录后查看联系方式</p>
                <p class="lock-sub">登录账号即可获取联系人、电话与邮箱</p>
                <a class="btn-primary btn-block" href="/auth.html?redirect=${encodeURIComponent(location.pathname + location.search)}">登录 / 注册</a>
              </div>
            `}
          </div>
        </aside>
      </section>
    </article>`;
}
