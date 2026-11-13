import { AiGatewayClient, clearSession, getConfiguredBaseUrls, loadSession, saveSession } from '../../aiGatewayClient.js';

export async function mountGatewayLogin({ redirect }) {
  document.querySelector('.studioLoginShell').classList.add('isGatewayLogin');
  const form = document.querySelector('#studio-login-form');
  const field = document.querySelector('#studio-login-identifier-field');
  const userId = document.querySelector('#studio-login-identifier');
  const secret = document.querySelector('#studio-login-password');
  const submit = document.querySelector('#studio-login-submit');
  const status = document.querySelector('#studio-login-status');
  const hint = document.querySelector('#studio-login-password-hint');
  const toggle = document.querySelector('#studio-login-password-toggle');
  for (const id of ['studio-login-mode-tabs', 'studio-login-recovery-link', 'studio-login-reward']) document.getElementById(id).hidden = true;
  document.querySelector('.studioLoginIntro strong').textContent = '连接创作工作区。';
  document.querySelector('#studio-login-identifier-label').textContent = '网关用户编号';
  document.querySelector('#studio-login-password-label').textContent = 'API Key';
  submit.textContent = '连接并进入';
  secret.autocomplete = 'off';
  secret.spellcheck = false;
  userId.inputMode = 'numeric';
  field.hidden = true;
  userId.required = false;
  hint.hidden = false;
  hint.textContent = '使用网关中的 API Key，消费由原网关结算。';
  const accountLink = document.createElement('a');
  accountLink.textContent = '打开网关，管理账号与额度';
  accountLink.className = 'studioLoginRecoveryLink';
  accountLink.target = '_blank';
  accountLink.rel = 'noopener noreferrer';
  accountLink.hidden = true;
  form.append(accountLink);
  const setStatus = (text, state = '') => { status.textContent = text; status.dataset.state = state; };
  let config;

  function message(error) {
    if (error.status === 401 || error.status === 403) return '凭据无效、已过期或权限不足，请在网关检查后重新连接。';
    if (error.status === 429) return '网关请求过于频繁，请稍后重试。';
    if (error.message === 'GATEWAY_AUTH_NOT_CONFIGURED') return '尚未配置网关地址，请部署者设置 AI_GATEWAY_BASE_URL 后重新连接。';
    return '暂时无法连接网关，输入已保留，请稍后重试。';
  }

  async function readConfig() {
    const response = await fetch(`${getConfiguredBaseUrls().apiBaseUrl}/config`, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('GATEWAY_CONFIG_UNAVAILABLE');
    config = await response.json();
    const account = config.credentialMode === 'account';
    field.hidden = !(account && config.type === 'newapi');
    userId.required = !field.hidden;
    document.querySelector('#studio-login-password-label').textContent = account ? '网关访问令牌' : 'API Key';
    hint.textContent = account
      ? '使用网关账号的访问令牌。New API 同时填写个人资料中的用户编号；推理 Key 在连接后读取。'
      : '使用网关中的 API Key，消费由原网关结算。每个 Key 保存独立的创作历史。';
    if (config.siteUrl) { accountLink.href = config.siteUrl; accountLink.hidden = false; }
    if (!config.configured) throw new Error('GATEWAY_AUTH_NOT_CONFIGURED');
    return config;
  }

  toggle.addEventListener('click', () => {
    const show = secret.type === 'password';
    secret.type = show ? 'text' : 'password';
    toggle.textContent = show ? '隐藏' : '显示';
    toggle.setAttribute('aria-label', show ? '隐藏凭据' : '显示凭据');
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    submit.disabled = true;
    setStatus('正在连接…', 'loading');
    try {
      await readConfig();
      if (!secret.value.trim()) { secret.focus(); setStatus('请填写连接凭据。', 'error'); return; }
      if (userId.required && !/^[1-9]\d*$/.test(userId.value.trim())) { userId.focus(); setStatus('请填写有效的网关用户编号。', 'error'); return; }
      const session = {
        accessToken: secret.value.trim(), gatewayType: config.type, credentialMode: config.credentialMode,
        gatewayBaseUrl: config.gatewayBaseUrl, gatewaySiteUrl: config.siteUrl, user: userId.required ? { id: userId.value.trim() } : null
      };
      const client = new AiGatewayClient({ session });
      // me() stores the session only after the gateway confirms the identity.
      const user = await client.me();
      saveSession({ ...session, user });
      secret.value = '';
      window.location.replace(redirect);
    } catch (error) {
      setStatus(message(error), 'error');
    } finally { submit.disabled = false; }
  });
  try {
    await readConfig();
    const existing = loadSession();
    if (existing?.accessToken) {
      await new AiGatewayClient({ session: existing }).me();
      window.location.replace(redirect);
    } else { secret.focus(); }
  } catch (error) {
    if (error.status === 401 || error.status === 403) clearSession();
    setStatus(message(error), 'error');
  }
}
