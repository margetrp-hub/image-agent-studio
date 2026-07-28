import {
  AiGatewayClient,
  clearSession,
  getLoginUrl,
  loadSession,
  STUDIO_STANDALONE
} from './aiGatewayClient.js';
import { safeSameOriginRedirect } from './studio/authRedirect.js';
import './styles/studio.login.css';

const form = document.querySelector('#studio-login-form');
const identifierField = document.querySelector('#studio-login-identifier-field');
const identifierInput = document.querySelector('#studio-login-identifier');
const emailField = document.querySelector('#studio-login-email-field');
const emailInput = document.querySelector('#studio-login-email');
const usernameField = document.querySelector('#studio-login-username-field');
const usernameInput = document.querySelector('#studio-login-username');
const passwordInput = document.querySelector('#studio-login-password');
const submitButton = document.querySelector('#studio-login-submit');
const status = document.querySelector('#studio-login-status');
const modeButtons = [...document.querySelectorAll('.studioLoginMode [data-mode]')];
const appBase = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
const defaultRedirect = new URL('studio.html', appBase).pathname;
const redirect = safeSameOriginRedirect(new URLSearchParams(window.location.search).get('redirect'), {
  origin: window.location.origin,
  fallback: defaultRedirect
});
let mode = 'login';

function setStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function openStudio() {
  window.location.replace(redirect);
}

function setFieldActive(field, input, active) {
  field.hidden = !active;
  input.required = active;
  input.disabled = !active;
}

function setMode(nextMode) {
  mode = nextMode === 'register' ? 'register' : 'login';
  const isRegister = mode === 'register';
  setFieldActive(identifierField, identifierInput, !isRegister);
  setFieldActive(emailField, emailInput, isRegister);
  setFieldActive(usernameField, usernameInput, isRegister);
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  submitButton.textContent = isRegister ? '创建并进入' : '登录';
  setStatus('');
  for (const button of modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  }
  window.requestAnimationFrame(() => {
    (isRegister ? emailInput : identifierInput).focus();
  });
}

function errorMessage(error) {
  const code = error?.payload?.error || error?.code || error?.message || '';
  if (error?.status === 429 || code === 'LOGIN_RATE_LIMITED' || code === 'LOGIN_BUSY') {
    return '尝试次数过多，请稍后再试。';
  }
  if (code === 'USER_EXISTS') return '这个邮箱或用户名已经被使用。';
  if (code === 'REGISTRATION_DISABLED') return '当前部署没有开放自助注册。';
  if (['INVALID_EMAIL', 'INVALID_USERNAME', 'INVALID_PASSWORD'].includes(code)) {
    return '请检查邮箱、用户名和密码。';
  }
  if (code === 'ACCOUNT_DISABLED') return '这个账号已被禁用，请联系管理员。';
  return mode === 'register' ? '创建失败，请检查信息后再试。' : '账号或密码不正确。';
}

async function submitLogin() {
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;
  if (!identifier || !password) {
    setStatus('请输入账号和密码。', 'error');
    return;
  }
  const client = new AiGatewayClient({ session: null });
  await client.login({ identifier, password });
}

async function submitRegister() {
  const email = emailInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!email || !username || !password) {
    setStatus('请输入邮箱、用户名和密码。', 'error');
    return;
  }
  const client = new AiGatewayClient({ session: null });
  await client.register({ email, username, password });
}

if (!STUDIO_STANDALONE) {
  window.location.replace(getLoginUrl());
} else {
  setMode('login');
  const existingSession = loadSession();
  if (existingSession?.accessToken) {
    const existingClient = new AiGatewayClient({ session: existingSession });
    existingClient.me().then(openStudio).catch(() => clearSession());
  }

  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;

    submitButton.disabled = true;
    setStatus(mode === 'register' ? '正在创建账号...' : '正在登录...', 'loading');
    try {
      await (mode === 'register' ? submitRegister() : submitLogin());
      passwordInput.value = '';
      setStatus(mode === 'register' ? '账号已创建，正在进入工作站。' : '登录成功，正在进入工作站。', 'success');
      openStudio();
    } catch (error) {
      passwordInput.value = '';
      passwordInput.focus();
      setStatus(errorMessage(error), 'error');
    } finally {
      submitButton.disabled = false;
    }
  });
}
