import { requireAuth, showMsg, getQuery } from '/common.js';

const u = await requireAuth('/submit.html');
if (!u) throw new Error('redirecting to login');

const form = document.getElementById('form');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');
const token = () => localStorage.getItem('tt_user_token') || '';

const FIELDS = [
  'projectName', 'companyName', 'projectInfo', 'projectStatus', 'requirements',
  'managerName', 'managerComment', 'projectType', 'techField', 'maturity',
  'contactName', 'contactPhone', 'contactEmail',
];
const REQUIRED = ['projectName', 'companyName', 'managerName', 'contactName', 'techField', 'maturity', 'projectType'];

// 编辑模式：?id=xxx
const editId = getQuery('id', '');
let isEdit = false;

if (editId) {
  try {
    const res = await fetch('/api/projects/' + encodeURIComponent(editId), {
      headers: { Authorization: 'Bearer ' + token() },
    });
    if (res.ok) {
      const d = await res.json();
      if (d.ok && d.isOwner) {
        isEdit = true;
        const p = d.project;
        FIELDS.forEach(f => { const el = document.getElementById(f); if (el && p[f] != null) el.value = p[f]; });
        document.getElementById('formTitle').textContent = '编辑项目信息';
        document.getElementById('formDesc').textContent =
          p.status === 'pending'
            ? '修改后将重新进入审核，审核通过前不会公开展示'
            : '当前为已发布项目，修改后将重新进入审核（审核期间暂停公开展示）';
        submitBtn.textContent = '保存修改';
        resetBtn.textContent = '还原';
      }
    }
  } catch {}
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (const f of REQUIRED) {
    const el = document.getElementById(f);
    if (!el.value.trim()) { showMsg(msg, 'err', '请填写带 * 的必填项'); el.focus(); return; }
  }
  const payload = {};
  FIELDS.forEach(f => payload[f] = document.getElementById(f).value.trim());

  submitBtn.disabled = true; submitBtn.textContent = isEdit ? '保存中…' : '提交中…';
  try {
    const url = isEdit ? '/api/my/projects/' + encodeURIComponent(editId) : '/api/projects';
    const method = isEdit ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      showMsg(msg, 'ok', isEdit ? '修改已保存，等待重新审核' : '提交成功，等待审核后发布');
      setTimeout(() => { location.href = '/my.html'; }, 1200);
    } else {
      showMsg(msg, 'err', '操作失败：' + (data.error || '未知错误'));
    }
  } catch {
    showMsg(msg, 'err', '网络异常，请稍后重试');
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = isEdit ? '保存修改' : '提交登记';
  }
});

resetBtn.addEventListener('click', () => {
  if (isEdit) { location.reload(); return; }
  if (confirm('确定清空所有已填写内容？')) form.reset();
});
