import { classifyWorkbenchError, ERROR_CATEGORIES } from '../src/studio/errors/catalog.js';
import { generationErrorDetail, generationErrorMessage } from '../src/studio/util/generationJobs.js';
import { createTranslator } from '../src/studio/i18n.js';

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

const cases = [
  [{ status: 401, message: 'invalid api key' }, ERROR_CATEGORIES.AUTH],
  [{ status: 402, message: 'insufficient balance' }, ERROR_CATEGORIES.BILLING],
  [{ status: 403, message: 'Image generation is not enabled for this group' }, ERROR_CATEGORIES.PERMISSION],
  [{ status: 429, message: 'rate limit exceeded' }, ERROR_CATEGORIES.RATE_LIMIT],
  [{ message: 'Your request was rejected by the safety system' }, ERROR_CATEGORIES.SAFETY],
  [{ status: 400, message: 'Generated video rejected by content moderation.' }, ERROR_CATEGORIES.SAFETY],
  [{ code: 'GATEWAY_DISPATCH_FAILED', message: 'could not deliver this request to the gateway' }, ERROR_CATEGORIES.NETWORK],
  [{ code: 'GATEWAY_DISPATCH_FAILED', message: 'The gateway did not return a final response before the Workbench timeout.' }, ERROR_CATEGORIES.TIMEOUT],
  [{ code: 'JOB_TIMEOUT', message: 'The server stopped waiting for this generation job.' }, ERROR_CATEGORIES.TIMEOUT],
  [{ message: 'upstream response failed: context canceled' }, ERROR_CATEGORIES.UPSTREAM],
  [{ status: 500, message: 'internal server error' }, ERROR_CATEGORIES.SERVICE]
];

for (const [error, expectedCategory] of cases) {
  const result = classifyWorkbenchError(error);
  assert(result.category === expectedCategory, 'Unexpected error category.', { error, result, expectedCategory });
  assert(result.userMessage && result.technicalReason && result.nextAction, 'Classified errors must include user, technical, and next-action fields.', result);
  assert(typeof result.retryable === 'boolean', 'Classified errors must include retryable boolean.', result);
}

const moderationMessage = generationErrorMessage(
  { status: 400, message: 'Generated video rejected by content moderation.' },
  (_key, fallback) => fallback
);
assert(moderationMessage.startsWith('上游内容审核拒绝了这次请求'), 'Content moderation errors must use the dedicated user-facing message.', moderationMessage);

const t = createTranslator('en');
const htmlError = {
  code: 'HTTP_502', status: 502, requestId: 'req-html-502',
  message: '<!DOCTYPE html><html><head><title>ohlao.cfd | 502: Bad gateway</title></head><body>timeout quota permission</body></html>'
};
const htmlMessage = generationErrorMessage(htmlError, t);
assert(htmlMessage.includes(t('errors.serviceUnavailable')), 'HTML page content must not misclassify HTTP 502.', htmlMessage);
assert(htmlMessage.includes(htmlError.requestId), 'The sanitized message must retain the request ID.', htmlMessage);
assert(generationErrorDetail(htmlError) === '', 'Error details must omit raw HTML pages.');
assert(htmlError.message.startsWith('<!DOCTYPE html>'), 'Presentation must not mutate the stored error.');

const providerMessage = 'Generated video rejected by content moderation.';
for (const payload of [
  { error: { message: providerMessage } },
  { message: providerMessage },
  { response: { error: { message: providerMessage } } }
]) {
  const error = { ...htmlError, payload };
  assert(generationErrorDetail(error) === providerMessage, 'Structured provider errors must take precedence over a transport HTML message.', error);
  assert(generationErrorMessage(error, t).includes(t('errors.contentModeration')), 'Provider moderation errors must not be masked by HTTP 502.', error);
}
for (const message of [
  'Video duration must be < 16 seconds; received 20.',
  'Reference image <image> is invalid.',
  JSON.stringify({ error: { code: 'video_error', message: '<html> was not a valid reference' } })
]) {
  assert(generationErrorDetail({ message }) === message, 'Non-HTML provider details must remain intact.', message);
}
assert(generationErrorMessage({ message: '<html><body>proxy error</body></html>' }, t) === t('errors.generationFailed'), 'HTML without a status must use a generic failure, not raw markup.');

console.log('Error catalog check passed.');
