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
const passwordToggle = document.querySelector('#studio-login-password-toggle');
const passwordHint = document.querySelector('#studio-login-password-hint');
const submitButton = document.querySelector('#studio-login-submit');
const status = document.querySelector('#studio-login-status');
const reward = document.querySelector('#studio-login-reward');
const rewardAmount = document.querySelector('#studio-login-reward-amount');
const registerModeButton = document.querySelector('#studio-login-mode-register');
const modeButtons = [...document.querySelectorAll('.studioLoginMode [data-mode]')];
const appBase = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
const defaultRedirect = new URL('studio.html', appBase).pathname;
const redirect = safeSameOriginRedirect(new URLSearchParams(window.location.search).get('redirect'), {
  origin: window.location.origin,
  fallback: defaultRedirect
});
let mode = 'login';
let registrationEnabled = true;
let registrationPasswordMinLength = 8;

function setStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function clearFieldErrors() {
  for (const input of [identifierInput, emailInput, usernameInput, passwordInput]) {
    input.removeAttribute('aria-invalid');
  }
}

function rejectField(input, message) {
  input.setAttribute('aria-invalid', 'true');
  setStatus(message, 'error');
  input.focus();
  return false;
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
  mode = nextMode === 'register' && registrationEnabled ? 'register' : 'login';
  const isRegister = mode === 'register';
  setFieldActive(identifierField, identifierInput, !isRegister);
  setFieldActive(emailField, emailInput, isRegister);
  setFieldActive(usernameField, usernameInput, isRegister);
  passwordInput.autocomplete = isRegister ? 'new-password' : 'current-password';
  passwordInput.minLength = isRegister ? registrationPasswordMinLength : 0;
  submitButton.textContent = isRegister ? '创建并进入' : '登录';
  setStatus('');
  clearFieldErrors();
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
  if (code === 'INVALID_EMAIL') return '请输入有效的邮箱地址。';
  if (code === 'INVALID_USERNAME') return '请输入有效的用户名。';
  if (code === 'INVALID_PASSWORD') return `密码至少需要 ${registrationPasswordMinLength} 位。`;
  if (code === 'ACCOUNT_DISABLED') return '这个账号已被禁用，请联系管理员。';
  return mode === 'register' ? '创建失败，请检查信息后再试。' : '账号或密码不正确。';
}

function applyRegistrationConfig(config) {
  registrationEnabled = config?.registration?.enabled !== false;
  const configuredMinimum = Number(config?.registration?.passwordMinLength);
  if (Number.isInteger(configuredMinimum) && configuredMinimum > 0 && configuredMinimum <= 4096) {
    registrationPasswordMinLength = configuredMinimum;
  }
  passwordInput.minLength = mode === 'register' ? registrationPasswordMinLength : 0;
  passwordHint.textContent = `创建账号时，密码至少 ${registrationPasswordMinLength} 位。`;
  registerModeButton.hidden = !registrationEnabled;
  reward.hidden = !registrationEnabled || Number(config?.registration?.bonusCredits || 0) <= 0;
  if (!reward.hidden) rewardAmount.textContent = Number(config.registration.bonusCredits).toLocaleString('zh-CN');
  if (!registrationEnabled && mode === 'register') setMode('login');
}

async function submitLogin() {
  clearFieldErrors();
  const identifier = identifierInput.value.trim();
  const password = passwordInput.value;
  if (!identifier) return rejectField(identifierInput, '请输入账号。');
  if (!password) return rejectField(passwordInput, '请输入密码。');
  const client = new AiGatewayClient({ session: null });
  await client.login({ identifier, password });
}

async function submitRegister() {
  clearFieldErrors();
  const email = emailInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  if (!email) return rejectField(emailInput, '请输入邮箱。');
  if (!emailInput.checkValidity()) return rejectField(emailInput, '请输入有效的邮箱地址。');
  if (!username) return rejectField(usernameInput, '请输入用户名。');
  if (!password) return rejectField(passwordInput, '请输入密码。');
  if (password.length < registrationPasswordMinLength) {
    return rejectField(passwordInput, `密码至少需要 ${registrationPasswordMinLength} 位。`);
  }
  const client = new AiGatewayClient({ session: null });
  await client.register({ email, username, password });
}

if (!STUDIO_STANDALONE) {
  window.location.replace(getLoginUrl());
} else {
  setMode('login');
  const configClient = new AiGatewayClient({ session: null });
  configClient.getStandaloneConfig().then(applyRegistrationConfig).catch(() => {});
  const existingSession = loadSession();
  if (existingSession?.accessToken) {
    const existingClient = new AiGatewayClient({ session: existingSession });
    existingClient.me().then(openStudio).catch(() => clearSession());
  }

  for (const button of modeButtons) {
    button.addEventListener('click', () => setMode(button.dataset.mode));
  }

  passwordToggle.addEventListener('click', () => {
    const visible = passwordInput.type === 'text';
    passwordInput.type = visible ? 'password' : 'text';
    passwordToggle.textContent = visible ? '显示' : '隐藏';
    passwordToggle.setAttribute('aria-label', visible ? '显示密码' : '隐藏密码');
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;

    submitButton.disabled = true;
    setStatus(mode === 'register' ? '正在创建账号...' : '正在登录...', 'loading');
    try {
      const submitted = await (mode === 'register' ? submitRegister() : submitLogin());
      if (submitted === false) return;
      passwordInput.value = '';
      setStatus(mode === 'register' ? '账号已创建，正在进入工作站。' : '登录成功，正在进入工作站。', 'success');
      openStudio();
    } catch (error) {
      passwordInput.focus();
      setStatus(errorMessage(error), 'error');
    } finally {
      submitButton.disabled = false;
    }
  });
}
