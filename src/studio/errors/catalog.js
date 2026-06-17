export const ERROR_CATEGORIES = Object.freeze({
  AUTH: 'auth',
  BILLING: 'billing',
  PERMISSION: 'permission',
  PARAMETER: 'parameter',
  SAFETY: 'safety',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  UPSTREAM: 'upstream',
  TIMEOUT: 'timeout',
  SERVICE: 'service',
  CANCELED: 'canceled',
  UNKNOWN: 'unknown'
});

const ERROR_RULES = [
  {
    category: ERROR_CATEGORIES.CANCELED,
    retryable: true,
    match: ({ code, message, name }) => name === 'AbortError' || code.includes('canceled') || message.includes('generation_stopped') || message.includes('job_canceled'),
    userMessage: '任务已停止',
    technicalReason: 'The local page or service canceled waiting for the request.',
    nextAction: '先查看当前画布和历史图库，确认没有新结果后再决定是否重试。'
  },
  {
    category: ERROR_CATEGORIES.TIMEOUT,
    retryable: true,
    match: ({ code, message, status }) => status === 408 || status === 504 || code.includes('timeout') || message.includes('timeout') || message.includes('timed out') || message.includes('did not return a final response'),
    userMessage: '等待超时',
    technicalReason: 'The page or gateway stopped waiting before a final result arrived.',
    nextAction: '稍后查看历史图库；如果没有结果，再降低数量/质量或换账号重试。'
  },
  {
    category: ERROR_CATEGORIES.SAFETY,
    retryable: true,
    match: ({ code, message }) => code.includes('policy') || message.includes('safety') || message.includes('content policy') || message.includes('policy_violation') || message.includes('rejected by the safety system'),
    userMessage: '内容安全策略拒绝',
    technicalReason: 'The upstream model rejected the prompt or reference image by safety policy.',
    nextAction: '弱化敏感描述，移除真实人物、未成年人、暴力色情、仿冒名人等高风险内容后重试。'
  },
  {
    category: ERROR_CATEGORIES.BILLING,
    retryable: false,
    match: ({ message, status }) => status === 402 || message.includes('insufficient') || message.includes('balance') || message.includes('quota') || message.includes('credit') || message.includes('billing'),
    userMessage: '账号余额或额度不足',
    technicalReason: 'The selected account or API key has insufficient quota or billing credit.',
    nextAction: '充值、切换 Key，或换一个可用账号后再生成。'
  },
  {
    category: ERROR_CATEGORIES.AUTH,
    retryable: false,
    match: ({ message, status }) => status === 401 || message.includes('unauthorized') || message.includes('invalid api key') || message.includes('incorrect api key') || message.includes('invalid token'),
    userMessage: '登录或密钥失效',
    technicalReason: 'Authentication failed for the selected account or API key.',
    nextAction: '重新登录，或在设置里更新 API Key。'
  },
  {
    category: ERROR_CATEGORIES.PERMISSION,
    retryable: false,
    match: ({ message, status }) => status === 403 || message.includes('forbidden') || message.includes('permission') || message.includes('not enabled') || message.includes('not allowed') || message.includes('model_not_found'),
    userMessage: '当前账号没有权限',
    technicalReason: 'The selected account is not allowed to call this model or route.',
    nextAction: '切换有生图权限的账号，或检查模型名、接口类型和分组权限。'
  },
  {
    category: ERROR_CATEGORIES.PARAMETER,
    retryable: true,
    match: ({ message, status }) => status === 400 || status === 415 || status === 422 || message.includes('invalid request') || message.includes('invalid parameter') || message.includes('invalid_value') || message.includes('unsupported'),
    userMessage: '参数不兼容',
    technicalReason: 'The request parameters, file format, size, quality, count, or model route are not compatible.',
    nextAction: '检查模型、尺寸、质量、数量、参考图格式和接口类型后再试。'
  },
  {
    category: ERROR_CATEGORIES.RATE_LIMIT,
    retryable: true,
    match: ({ message, status }) => status === 429 || message.includes('rate limit') || message.includes('too many requests'),
    userMessage: '触发限流',
    technicalReason: 'The account, gateway, or upstream model is rate limited.',
    nextAction: '等待一会儿、降低并发，或切换账号池后再试。'
  },
  {
    category: ERROR_CATEGORIES.NETWORK,
    retryable: true,
    match: ({ code, message, name }) => name === 'TypeError' || code.includes('gateway_dispatch_failed') || message.includes('failed to fetch') || message.includes('fetch failed') || message.includes('network') || message.includes('origin_not_allowed') || message.includes('cors'),
    userMessage: '网络或来源配置异常',
    technicalReason: 'The Workbench service could not reach the gateway, or the request was blocked by origin/CORS configuration.',
    nextAction: '检查网关 URL、STUDIO_ALLOWED_ORIGINS、防火墙和反向代理配置。'
  },
  {
    category: ERROR_CATEGORIES.UPSTREAM,
    retryable: true,
    match: ({ message }) => message.includes('upstream') || message.includes('context canceled') || message.includes('internal_error') || message.includes('returned_no_images') || message.includes('no images'),
    userMessage: '上游没有正常返回图片',
    technicalReason: 'The gateway accepted the request but the upstream model did not return usable image data.',
    nextAction: '按请求 ID 查后台记录；必要时换 Key、降低数量或稍后重试。'
  },
  {
    category: ERROR_CATEGORIES.SERVICE,
    retryable: true,
    match: ({ message, status }) => (status >= 500 && status < 600) || message.includes('service unavailable') || message.includes('bad gateway') || message.includes('internal server error'),
    userMessage: '服务暂时不可用',
    technicalReason: 'The Workbench service, gateway, or upstream returned a server-side failure.',
    nextAction: '稍后重试；如果持续出现，检查服务日志和网关状态。'
  }
];

function errorText(error) {
  return String(
    error?.payload?.error?.message
      || error?.payload?.message
      || error?.payload?.response?.error?.message
      || error?.message
      || error?.error
      || ''
  );
}

export function classifyWorkbenchError(error = {}) {
  const status = Number(error?.status || error?.payload?.status || error?.payload?.error?.status || 0) || null;
  const code = String(error?.code || error?.providerCode || error?.payload?.code || error?.payload?.error?.code || '').toLowerCase();
  const message = errorText(error);
  const lowered = message.toLowerCase();
  const context = { code, message: lowered, status, name: error?.name || '' };
  const rule = ERROR_RULES.find((item) => item.match(context));
  const requestId = error?.requestId
    || error?.request_id
    || error?.payload?.request_id
    || error?.payload?.error?.request_id
    || String(message).match(/request\s*id\s*[:：]?\s*([a-z0-9-]{12,})/i)?.[1]
    || '';

  if (rule) {
    return {
      category: rule.category,
      userMessage: rule.userMessage,
      technicalReason: rule.technicalReason,
      retryable: rule.retryable,
      nextAction: rule.nextAction,
      status,
      code,
      requestId,
      rawMessage: message
    };
  }

  return {
    category: ERROR_CATEGORIES.UNKNOWN,
    userMessage: '未知错误',
    technicalReason: message || 'No structured error message was returned.',
    retryable: true,
    nextAction: '保留原始错误和请求 ID，稍后重试；如果重复出现，请检查服务日志。',
    status,
    code,
    requestId,
    rawMessage: message
  };
}
