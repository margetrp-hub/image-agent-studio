import { classifyWorkbenchError, ERROR_CATEGORIES } from '../src/studio/errors/catalog.js';
import { generationErrorMessage } from '../src/studio/util/generationJobs.js';

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

console.log('Error catalog check passed.');
