// Billing & usage display formatters — pure functions that translate the
// assorted backend billing/usage payload shapes (points, tokens, cost,
// quota, free-form billing objects) into localized display strings.
// No React, no DOM; safe to unit-test and reuse from any UI surface that
// needs to show what a generation cost or what a model charges.

import { normalizeCount } from './imageOptions.js';

export function formatUsageValue(value) {
  if (value === undefined || value === null || value === '') return '后台未返回';
  if (typeof value === 'number' && Number.isFinite(value)) return value.toLocaleString('zh-CN');
  return String(value);
}

export function pointValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return (number / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

export function modelBillingLabel(model, count = 1, t = (key, fallback) => fallback || key) {
  const raw = model?.raw || model || {};
  const unitPoints = raw.unit_points ?? raw.unitPoints;
  const inputPoints = raw.input_unit_points ?? raw.inputUnitPoints;
  const outputPoints = raw.output_unit_points ?? raw.outputUnitPoints;
  if (unitPoints !== undefined && unitPoints !== null) {
    const unit = pointValue(unitPoints);
    const total = pointValue(Number(unitPoints) * normalizeCount(count));
    return Number(unitPoints) > 0
      ? t('params.billingPointsPerImage', '{unit} 点/张，预估 {total} 点', { unit, total })
      : t('params.billingBackendModel', '后台按模型结算');
  }
  if (inputPoints !== undefined || outputPoints !== undefined) {
    return t('params.billingInputOutput', '输入 {input} 点/1K，输出 {output} 点/1K', {
      input: pointValue(inputPoints || 0),
      output: pointValue(outputPoints || 0)
    });
  }
  const value = raw.price || raw.pricing || raw.unit_price || raw.input_price || raw.output_price || raw.quota || raw.cost || raw.billing || raw.billing_mode;
  if (!value) return t('params.billingActual', '以后台实际扣费为准');
  if (typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${item}`).join(' / ');
  return String(value);
}

export function modelBillingUnitLabel(model, unitLabel = '张', count = 1, t = (key, fallback) => fallback || key) {
  const label = modelBillingLabel(model, count, t);
  return unitLabel === '张' ? label : label.replaceAll('/张', `/${unitLabel}`).replaceAll('/image', `/${unitLabel}`);
}

export function payloadUsageSummary(payload) {
  const usage = payload?.usage || payload?.response?.usage || payload?.billing || payload?.cost || payload?.metadata?.usage;
  if (!usage) return '';
  if (typeof usage === 'string') return usage;
  if (typeof usage === 'number') return `本次消费 ${pointValue(usage)} 点`;
  const parts = [];
  const pointsTotal = usage.total_points ?? usage.points ?? usage.totalPoint;
  const costPoints = usage.total_cost ?? usage.cost_points ?? usage.costPoints;
  const total = pointsTotal ?? (costPoints !== undefined ? pointValue(costPoints) : undefined) ?? usage.total ?? usage.total_tokens ?? usage.amount ?? usage.cost ?? usage.credits;
  const input = usage.input_tokens || usage.prompt_tokens || usage.input;
  const output = usage.output_tokens || usage.completion_tokens || usage.output;
  if (total !== undefined) parts.push(`合计 ${formatUsageValue(total)}${(pointsTotal !== undefined || costPoints !== undefined) ? ' 点' : ''}`);
  if (input !== undefined) parts.push(`输入 ${formatUsageValue(input)}`);
  if (output !== undefined) parts.push(`输出 ${formatUsageValue(output)}`);
  return parts.join('，');
}
