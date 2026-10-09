import { setToken, clearCurrentUser, showMsg, getQuery } from '/common.js';

const tabs = document.querySelectorAll('.auth-tab');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

function switchMode(mode) {
  tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
  loginForm.style.display = mode === 'login' ? '' : 'none';
  registerForm.style.display = mode === 'register' ? '' : 'none';
}
tabs.forEach(t => t.addEventListener('click', () => switchMode(t.dataset.mode)));

function redirectAfter() {
  const r = getQuery('redirect', '');
  location.href = r ? decodeURIComponent(r) : '/';
}

// 登录
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('loginMsg');
  const btn = document.getElementById('loginBtn');
  const phone = document.getElementById('loginPhone').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!phone || !password) { showMsg(msg, 'err', '请填写手机号和密码'); return; }
  btn.disabled = true; btn.textContent = '登录中…';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, password }),
    });
    const data = await res.json();
    if (data.ok) {
      setToken(data.token);
      clearCurrentUser();
      redirectAfter();
    } else {
      showMsg(msg, 'err', data.error || '登录失败');
    }
  } catch {
    showMsg(msg, 'err', '网络异常，请稍后重试');
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
});

// 注册
registerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('regMsg');
  const btn = document.getElementById('registerBtn');
  const name = document.getElementById('regName').value.trim();
  const phone = document.getElementById('regPhone').value.trim();
  const password = document.getElementById('regPassword').value;
  const roleEl = registerForm.querySelector('input[name=role]:checked');
  if (!name) { showMsg(msg, 'err', '请填写姓名'); return; }
  if (!/^1[3-9]\d{9}$/.test(phone)) { showMsg(msg, 'err', '请填写正确的 11 位手机号'); return; }
  if (password.length < 6) { showMsg(msg, 'err', '密码至少 6 位'); return; }
  if (!roleEl) { showMsg(msg, 'err', '请选择身份'); return; }
  btn.disabled = true; btn.textContent = '注册中…';
  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone, password, role: roleEl.value }),
    });
    const data = await res.json();
    if (data.ok) {
      setToken(data.token);
      clearCurrentUser();
      redirectAfter();
    } else {
      showMsg(msg, 'err', data.error || '注册失败');
    }
  } catch {
    showMsg(msg, 'err', '网络异常，请稍后重试');
  } finally {
    btn.disabled = false; btn.textContent = '注册并登录';
  }
});

// 若已登录直接跳走
import('/common.js').then(async ({ currentUser }) => {
  const u = await currentUser();
  if (u) redirectAfter();
});
