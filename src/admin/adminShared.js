export const DEFAULT_SETTINGS = {
  creditsEnabled: false,
  registrationEnabled: true,
  registrationBonusCredits: 200,
  imageGenerationCost: 10,
  imageEditCost: 15,
  videoGenerationCost: 50,
  rechargeEnabled: true,
  creditCodeEnabled: true,
  providerBindingEnabled: true,
  rechargeShopUrl: 'https://catfk.com/shop/ohlao'
};

export const SETTING_KEYS = {
  registration: ['registrationEnabled', 'providerBindingEnabled'],
  billing: ['creditsEnabled', 'registrationBonusCredits', 'imageGenerationCost', 'imageEditCost', 'videoGenerationCost', 'rechargeEnabled', 'creditCodeEnabled', 'rechargeShopUrl']
};

export function formatNumber(value) {
  return Number(value || 0).toLocaleString('zh-CN');
}

export function formatDate(value) {
  if (!value) return '暂无';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '暂无' : date.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

export function getErrorMessage(error) {
  const code = error?.payload?.error || error?.code || '';
  return ({
    ADMIN_REQUIRED: '当前账号没有管理员权限。',
    INSUFFICIENT_CREDITS: '余额不足，无法完成这次操作。',
    CREDIT_REASON_REQUIRED: '请填写调账原因。',
    CREDIT_CODE_EXISTS: '这个兑换码已经存在。',
    INVALID_CREDIT_CODE: '兑换码需要 8 到 64 位字母或数字。',
    INVALID_CREDIT_AMOUNT: '请输入有效的整数积分。',
    INVALID_BILLING_SETTING: '积分配置必须是 0 到 10 亿之间的整数。',
    INVALID_RECHARGE_URL: '购买链接必须是 http(s) 地址。',
    UPDATE_ALREADY_RUNNING: '更新正在执行，请稍候查看状态。',
    UPDATE_SERVICE_UNAVAILABLE: '当前部署未配置自动更新服务。'
  })[code] || '请求没有完成，请稍后重试。';
}
