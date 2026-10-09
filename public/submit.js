import { requireAuth, showMsg } from '/common.js';

const u = await requireAuth('/submit.html');
if (!u) throw new Error('redirecting to login');

const form = document.getElementById('form');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const resetBtn = document.getElementById('resetBtn');

const FIELDS = [
  'projectName', 'companyName', 'projectInfo', 'projectStatus', 'requirements',
  'managerName', 'managerComment', 'projectType', 'techField', 'maturity',
  'contactName', 'contactPhone', 'contactEmail',
];
const REQUIRED = ['projectName', 'companyName', 'managerName', 'contactName', 'techField', 'maturity', 'projectType'];

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  for (const f of REQUIRED) {
    const el = document.getElementById(f);
    if (!el.value.trim()) { showMsg(msg, 'err', '请填写带 * 的必填项'); el.focus(); return; }
  }
  const payload = {};
  FIELDS.forEach(f => payload[f] = document.getElementById(f).value.trim());

  submitBtn.disabled = true; submitBtn.textContent = '提交中…';
  try {
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('tt_user_token') },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.ok) {
      showMsg(msg, 'ok', '提交成功，等待审核后发布');
      setTimeout(() => { location.href = '/my.html'; }, 1200);
    } else {
      showMsg(msg, 'err', '提交失败：' + (data.error || '未知错误'));
    }
  } catch {
    showMsg(msg, 'err', '网络异常，请稍后重试');
  } finally {
    submitBtn.disabled = false; submitBtn.textContent = '提交登记';
  }
});

resetBtn.addEventListener('click', () => {
  if (confirm('确定清空所有已填写内容？')) form.reset();
});
