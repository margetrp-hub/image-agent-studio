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
const identifierLabel = document.querySelector('#studio-login-identifier-label');
const emailField = document.querySelector('#studio-login-email-field');
const emailInput = document.querySelector('#studio-login-email');
const usernameField = document.querySelector('#studio-login-username-field');
const usernameInput = document.querySelector('#studio-login-username');
const resetTokenField = document.querySelector('#studio-login-reset-token-field');
const resetTokenInput = document.querySelector('#studio-login-reset-token');
const passwordInput = document.querySelector('#studio-login-password');
const passwordLabel = document.querySelector('#studio-login-password-label');
const passwordConfirmField = document.querySelector('#studio-login-password-confirm-field');
const passwordConfirmInput = document.querySelector('#studio-login-password-confirm');
const passwordToggle = document.querySelector('#studio-login-password-toggle');
const passwordHint = document.querySelector('#studio-login-password-hint');
const submitButton = document.querySelector('#studio-login-submit');
const status = document.querySelector('#studio-login-status');
const reward = document.querySelector('#studio-login-reward');
const rewardAmount = document.querySelector('#studio-login-reward-amount');
const modeTabs = document.querySelector('#studio-login-mode-tabs');
const recoveryHeading = document.querySelector('#studio-login-recovery-heading');
const recoveryLink = document.querySelector('#studio-login-recovery-link');
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
let registrationBonusCredits = 0;

function setStatus(message, state = '') {
  status.textContent = message;
  status.dataset.state = state;
}

function clearFieldErrors() {
  for (const input of [identifierInput, emailInput, usernameInput, resetTokenInput, passwordInput, passwordConfirmInput]) {
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
  mode = nextMode === 'reset'
    ? 'reset'
    : nextMode === 'register' && registrationEnabled
      ? 'register'
      : 'login';
  const isRegister = mode === 'register';
  const isReset = mode === 'reset';
  setFieldActive(identifierField, identifierInput, !isRegister);
  setFieldActive(emailField, emailInput, isRegister);
  setFieldActive(usernameField, usernameInput, isRegister);
  setFieldActive(resetTokenField, resetTokenInput, isReset);
  setFieldActive(passwordConfirmField, passwordConfirmInput, isReset);
  identifierLabel.textContent = isReset ? '邮箱或用户名' : '账号';
  passwordLabel.textContent = isReset ? '新密码' : '密码';
  passwordInput.autocomplete = isRegister || isReset ? 'new-password' : 'current-password';
  passwordInput.minLength = isRegister || isReset ? registrationPasswordMinLength : 0;
  submitButton.textContent = isRegister ? '创建并进入' : isReset ? '更新密码' : '登录';
  modeTabs.hidden = isReset;
  recoveryHeading.hidden = !isReset;
  recoveryLink.hidden = isRegister;
  recoveryLink.textContent = isReset ? '返回登录' : '忘记密码？';
  reward.hidden = isReset || !registrationEnabled || registrationBonusCredits <= 0;
  passwordHint.textContent = isRegister
    ? `创建账号时，密码至少 ${registrationPasswordMinLength} 位。`
    : isReset
      ? `密码至少 ${registrationPasswordMinLength} 位，重置后旧会话会退出。`
      : '使用独立账号密码登录。';
  setStatus('');
  clearFieldErrors();
  for (const button of modeButtons) {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  }
  window.requestAnimationFrame(() => {
    (isRegister ? emailInput : isReset ? resetTokenInput : identifierInput).focus();
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
  if (code === 'RESET_TOKEN_INVALID') return '重置码无效或已过期，请联系管理员重新生成。';
  return mode === 'register' ? '创建失败，请检查信息后再试。' : mode === 'reset' ? '密码更新失败，请检查重置码后再试。' : '账号或密码不正确。';
}

function applyRegistrationConfig(config) {
  registrationEnabled = config?.registration?.enabled !== false;
  const configuredMinimum = Number(config?.registration?.passwordMinLength);
  if (Number.isInteger(configuredMinimum) && configuredMinimum > 0 && configuredMinimum <= 4096) {
    registrationPasswordMinLength = configuredMinimum;
  }
  registrationBonusCredits = Number(config?.registration?.bonusCredits || 0);
  passwordInput.minLength = mode === 'register' || mode === 'reset' ? registrationPasswordMinLength : 0;
  passwordHint.textContent = mode === 'register'
    ? `创建账号时，密码至少 ${registrationPasswordMinLength} 位。`
    : mode === 'reset'
      ? `密码至少 ${registrationPasswordMinLength} 位，重置后旧会话会退出。`
      : '使用独立账号密码登录。';
  registerModeButton.hidden = !registrationEnabled;
  reward.hidden = !registrationEnabled || registrationBonusCredits <= 0 || mode === 'reset';
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

async function submitResetPassword() {
  clearFieldErrors();
  const identifier = identifierInput.value.trim();
  const token = resetTokenInput.value.trim();
  const password = passwordInput.value;
  const passwordConfirm = passwordConfirmInput.value;
  if (!identifier) return rejectField(identifierInput, '请输入邮箱或用户名。');
  if (!token) return rejectField(resetTokenInput, '请输入管理员提供的重置码。');
  if (!password) return rejectField(passwordInput, '请输入新密码。');
  if (password.length < registrationPasswordMinLength) {
    return rejectField(passwordInput, `密码至少需要 ${registrationPasswordMinLength} 位。`);
  }
  if (password !== passwordConfirm) return rejectField(passwordConfirmInput, '两次输入的新密码不一致。');
  const client = new AiGatewayClient({ session: null });
  await client.resetPassword({ identifier, token, password });
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

  recoveryLink.addEventListener('click', () => setMode(mode === 'reset' ? 'login' : 'reset'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitButton.disabled) return;

    submitButton.disabled = true;
    setStatus(mode === 'register' ? '正在创建账号...' : mode === 'reset' ? '正在更新密码...' : '正在登录...', 'loading');
    try {
      const submitted = await (mode === 'register' ? submitRegister() : mode === 'reset' ? submitResetPassword() : submitLogin());
      if (submitted === false) return;
      if (mode === 'reset') {
        const resetIdentifier = identifierInput.value.trim();
        passwordInput.value = '';
        passwordConfirmInput.value = '';
        resetTokenInput.value = '';
        setMode('login');
        identifierInput.value = resetIdentifier;
        setStatus('密码已更新，请使用新密码登录。', 'success');
        return;
      }
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
