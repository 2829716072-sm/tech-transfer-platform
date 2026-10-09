import { getQuery, escapeHtml, projectCard } from '/common.js';

const grid = document.getElementById('grid');
const pager = document.getElementById('pager');
const count = document.getElementById('resultCount');
const fTechField = document.getElementById('fTechField');
const fMaturity = document.getElementById('fMaturity');
const fType = document.getElementById('fType');
const fQ = document.getElementById('fQ');

let curPage = 1;

function syncFiltersFromUrl() {
  if (getQuery('techField')) fTechField.value = getQuery('techField');
  if (getQuery('maturity')) fMaturity.value = getQuery('maturity');
  if (getQuery('projectType')) fType.value = getQuery('projectType');
  if (getQuery('q')) fQ.value = getQuery('q');
}

async function load(page = 1) {
  curPage = Math.max(1, page);
  grid.innerHTML = '<div class="empty-state">加载中…</div>';
  const params = new URLSearchParams({ page: curPage, pageSize: 12 });
  if (fTechField.value && fTechField.value !== 'all') params.set('techField', fTechField.value);
  if (fMaturity.value && fMaturity.value !== 'all') params.set('maturity', fMaturity.value);
  if (fType.value && fType.value !== 'all') params.set('projectType', fType.value);
  if (fQ.value.trim()) params.set('q', fQ.value.trim());
  try {
    const res = await fetch('/api/projects?' + params.toString());
    const data = await res.json();
    if (!data.ok) { grid.innerHTML = `<div class="empty-state">${escapeHtml(data.error || '加载失败')}</div>`; return; }
    count.textContent = `共 ${data.total} 项成果`;
    if (!data.list.length) {
      grid.innerHTML = '<div class="empty-state"><p>暂无符合条件的成果</p><a class="btn-ghost btn-sm" href="/submit.html">提交一个</a></div>';
      pager.innerHTML = '';
      return;
    }
    grid.innerHTML = data.list.map(projectCard).join('');
    renderPager(data.page, data.pageCount);
  } catch {
    grid.innerHTML = '<div class="empty-state">网络异常</div>';
  }
}

function renderPager(page, pageCount) {
  if (pageCount <= 1) { pager.innerHTML = ''; return; }
  let html = '';
  html += `<button class="page-btn" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>上一页</button>`;
  // 简单数字页码（最多展示 7 个）
  const start = Math.max(1, page - 3);
  const end = Math.min(pageCount, start + 6);
  for (let i = start; i <= end; i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" data-p="${i}">${i}</button>`;
  }
  html += `<button class="page-btn" data-p="${page + 1}" ${page >= pageCount ? 'disabled' : ''}>下一页</button>`;
  pager.innerHTML = html;
}

pager.addEventListener('click', (e) => {
  const t = e.target.closest('.page-btn');
  if (!t || t.disabled) return;
  load(Number(t.dataset.p));
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

[fTechField, fMaturity, fType].forEach(el => el.addEventListener('change', () => load(1)));
let qTimer = null;
fQ.addEventListener('input', () => { clearTimeout(qTimer); qTimer = setTimeout(() => load(1), 350); });
document.getElementById('resetFilters').addEventListener('click', () => {
  fTechField.value = 'all'; fMaturity.value = 'all'; fType.value = 'all'; fQ.value = '';
  load(1);
});

syncFiltersFromUrl();
load(curPage);
