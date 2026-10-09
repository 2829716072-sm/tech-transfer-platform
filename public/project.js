import { getQuery, escapeHtml, formatDate, typeLabel } from '/common.js';

const wrap = document.getElementById('detailWrap');
const id = getQuery('id');
const token = () => localStorage.getItem('tt_user_token') || '';

if (!id) {
  wrap.innerHTML = '<div class="empty-state"><p>缺少项目 ID</p><a class="btn-primary btn-sm" href="/projects.html">返回列表</a></div>';
} else {
  loadDetail();
}

async function loadDetail() {
  try {
    const res = await fetch('/api/projects/' + encodeURIComponent(id), { headers: token() ? { Authorization: 'Bearer ' + token() } : {} });
    if (res.status === 404) {
      wrap.innerHTML = '<div class="empty-state"><p>项目不存在或尚未发布</p><a class="btn-primary btn-sm" href="/projects.html">返回列表</a></div>';
      return;
    }
    const data = await res.json();
    if (!data.ok) {
      wrap.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`;
      return;
    }
    render(data.project, data);
  } catch {
    wrap.innerHTML = '<div class="empty-state">网络异常</div>';
  }
}

function render(p, meta) {
  const hasContact = !!(p.contactName || p.contactPhone || p.contactEmail);
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

  const contactHtml = hasContact ? `
      <div class="contact-list">
        <div class="info-row"><span class="info-k">联系人</span><span class="info-v">${escapeHtml(p.contactName || '—')}</span></div>
        <div class="info-row"><span class="info-k">电话</span><span class="info-v">${escapeHtml(p.contactPhone || '—')}</span></div>
        <div class="info-row"><span class="info-k">邮箱</span><span class="info-v">${escapeHtml(p.contactEmail || '—')}</span></div>
        <div class="info-row"><span class="info-k">技术经理人</span><span class="info-v">${escapeHtml(p.managerName || '—')}</span></div>
      </div>
      <a class="btn-primary btn-block" href="mailto:${encodeURIComponent(p.contactEmail || '')}">联系对方</a>
    ` : !hasContact ? `
      <div class="contact-lock-body">
        <div class="lock-icon">📋</div>
        <p>联系方式待补充</p>
        <p class="lock-sub">可通过下方「合作意向」与对方建立联系</p>
      </div>` : `
      <div class="contact-lock-body">
        <div class="lock-icon">🔒</div>
        <p>登录后查看联系方式</p>
        <p class="lock-sub">登录账号即可获取联系人、电话与邮箱</p>
        <a class="btn-primary btn-block" href="/auth.html?redirect=${encodeURIComponent(location.pathname + location.search)}">登录 / 注册</a>
      </div>`;

  const intentHtml = !meta.loggedIn ? `
      <p class="intent-tip">登录后可向对方表达合作意向</p>
      <a class="btn-secondary btn-block" href="/auth.html?redirect=${encodeURIComponent(location.pathname + location.search)}">登录后操作</a>
    ` : meta.isOwner ? `
      <p class="intent-tip">这是你发布的项目</p>
      <a class="btn-ghost btn-block" href="/submit.html?id=${encodeURIComponent(p.id)}">编辑此项目</a>
    ` : meta.myIntent ? `
      <p class="intent-ok">✓ 已提交合作意向（${formatDate(meta.myIntent.createdAt)}）</p>
      <p class="intent-tip">意向内容可修改：</p>
      <form id="intentForm">
        <textarea id="intentMsg" maxlength="2000" required placeholder="说明你的合作想法、可提供的资源…">${escapeHtml(meta.myIntent.message)}</textarea>
        <input type="text" id="intentContact" maxlength="200" placeholder="补充联系方式：微信 / 邮箱（选填）" value="${escapeHtml(meta.myIntent.contact || '')}" />
        <button type="submit" class="btn-secondary btn-block" id="intentBtn">更新意向</button>
      </form>
    ` : `
      <form id="intentForm">
        <textarea id="intentMsg" maxlength="2000" required placeholder="说明你的合作想法、可提供的资源或需求…"></textarea>
        <input type="text" id="intentContact" maxlength="200" placeholder="补充联系方式：微信 / 邮箱（选填）" />
        <button type="submit" class="btn-secondary btn-block" id="intentBtn">提交合作意向</button>
      </form>
      <p class="intent-tip">提交后对方会收到通知，你的姓名与注册手机号将随意向一并发送</p>
    `;

  wrap.innerHTML = `
    <a class="back-link" href="/projects.html">← 返回列表</a>
    <article class="detail">
      <header class="detail-head card">
        <div class="detail-head-row">
          <div class="detail-tags">
            <span class="chip-field">${field}</span>
            <span class="card-type">${typeLabel(p.projectType)}</span>
            ${mat ? `<span class="chip-maturity">${mat}</span>` : ''}
          </div>
          ${meta.loggedIn && !meta.isOwner ? `<button class="fav-btn ${meta.favorited ? 'active' : ''}" id="favBtn" title="收藏">${meta.favorited ? '★ 已收藏' : '☆ 收藏'}</button>` : ''}
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
            ${contactHtml}
          </div>
          <div class="card intent-card">
            <h3>合作意向</h3>
            ${intentHtml}
          </div>
        </aside>
      </section>
    </article>`;

  bindEvents(p, meta);
}

function bindEvents(p, meta) {
  // 收藏
  const favBtn = document.getElementById('favBtn');
  if (favBtn) {
    favBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ projectId: p.id }),
        });
        const d = await res.json();
        if (d.ok) {
          favBtn.classList.toggle('active', d.favorited);
          favBtn.textContent = d.favorited ? '★ 已收藏' : '☆ 收藏';
        } else if (res.status === 401) {
          location.href = '/auth.html?redirect=' + encodeURIComponent(location.pathname + location.search);
        } else alert(d.error || '操作失败');
      } catch { alert('网络异常'); }
    });
  }
  // 意向
  const intentForm = document.getElementById('intentForm');
  if (intentForm) {
    intentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('intentBtn');
      const message = document.getElementById('intentMsg').value.trim();
      const contact = document.getElementById('intentContact').value.trim();
      if (!message) { alert('请填写合作意向说明'); return; }
      btn.disabled = true;
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(p.id)}/intents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ message, contact }),
        });
        const d = await res.json();
        if (d.ok) { alert('合作意向已提交，对方将收到通知'); loadDetail(); }
        else alert(d.error || '提交失败');
      } catch { alert('网络异常'); }
      finally { btn.disabled = false; }
    });
  }
}
