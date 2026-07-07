import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function exists(file) {
  return fs.existsSync(path.join(root, file));
}

function fail(message) {
  failures.push(message);
}

function mustExist(file) {
  if (!exists(file)) fail(`${file}: missing`);
}

function mustInclude(file, text, reason) {
  const body = read(file);
  if (!body.includes(text)) {
    fail(`${file}: missing ${JSON.stringify(text)} (${reason})`);
  }
}

function mustNotInclude(file, text, reason) {
  const body = read(file);
  if (body.includes(text)) {
    fail(`${file}: contains ${JSON.stringify(text)} (${reason})`);
  }
}

const files = [
  'apps/server-go/go.mod',
  'apps/server-go/README.md',
  'apps/server-go/cmd/studio-server/main.go',
  'apps/server-go/internal/config/config.go',
  'apps/server-go/internal/provider/dispatch.go',
  'apps/server-go/internal/provider/dispatch_test.go',
  'apps/server-go/internal/workflow/continuation.go',
  'apps/server-go/internal/workflow/continuation_test.go',
  'apps/server-go/internal/store/store.go',
  'apps/server-go/internal/store/store_test.go',
  'apps/server-go/internal/httpapi/server_test.go',
  'apps/server-go/internal/httpapi/server.go',
  'docs/GO-SERVER-CORE.md'
];

for (const file of files) mustExist(file);

mustInclude('apps/server-go/go.mod', 'module github.com/margetrp-hub/image-agent-studio/apps/server-go', 'Go module should be scoped to the repo');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/auth/bootstrap', 'Go server must expose admin bootstrap');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/auth/login', 'Go server must expose local login');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/session', 'Go server must expose Studio session persistence');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/history', 'Go server must expose Studio history persistence');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/generation-jobs', 'Go server must expose generation job persistence');
mustInclude('apps/server-go/internal/httpapi/server.go', '/dispatch-plan', 'Go server must expose sanitized generation dispatch plans');
mustInclude('apps/server-go/internal/httpapi/server.go', '/continuation-plan', 'Go server must expose prompt workflow continuation plans');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/providers', 'Go server must expose user-visible provider links');
mustInclude('apps/server-go/internal/httpapi/server.go', '/models', 'Go server must support server-side provider model sync');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/admin/users', 'Go server must expose admin user management');
mustInclude('apps/server-go/internal/httpapi/server.go', '/studio-api/admin/provider-links', 'Go server must expose backend provider links');
mustInclude('apps/server-go/internal/store/store.go', 'pbkdf2-sha256', 'Go user store must not store plaintext passwords');
mustInclude('apps/server-go/internal/store/store.go', 'ReadStudioSession', 'Go store must read Studio sessions');
mustInclude('apps/server-go/internal/store/store.go', 'WriteStudioSession', 'Go store must write Studio sessions');
mustInclude('apps/server-go/internal/store/store.go', 'AppendHistory', 'Go store must append history records');
mustInclude('apps/server-go/internal/store/store.go', 'CreateJob', 'Go store must create durable generation jobs');
mustInclude('apps/server-go/internal/store/store.go', 'CancelJob', 'Go store must cancel durable generation jobs');
mustInclude('apps/server-go/internal/store/store.go', 'ListProviderLinksForUser', 'Go store must filter provider links for Studio users');
mustInclude('apps/server-go/internal/store/store.go', 'ProviderLinkAllowsUser', 'Go store must enforce provider role access');
mustInclude('apps/server-go/internal/store/store.go', 'stripSecrets', 'Go persistence must scrub common secrets before durable writes');
mustInclude('apps/server-go/internal/store/store_test.go', 'WriteStudioSession', 'Go tests must cover session persistence');
mustInclude('apps/server-go/internal/store/store_test.go', 'AppendHistory', 'Go tests must cover history persistence');
mustInclude('apps/server-go/internal/store/store_test.go', 'CreateJob', 'Go tests must cover job persistence');
mustInclude('apps/server-go/internal/store/store_test.go', 'CancelJob', 'Go tests must cover job cancellation');
mustInclude('apps/server-go/internal/store/store_test.go', 'ListProviderLinksForUser', 'Go tests must cover provider visibility');
mustInclude('apps/server-go/internal/httpapi/server_test.go', 'TestProviderModelsSyncUsesServerSecret', 'Go HTTP tests must cover provider model sync');
mustInclude('apps/server-go/internal/httpapi/server_test.go', 'server-only-secret', 'Go HTTP tests must verify model sync secrets stay server-side');
mustInclude('apps/server-go/internal/store/store_test.go', 'must-not-persist', 'Go tests must cover secret scrubbing');
mustInclude('apps/server-go/internal/store/store.go', 'newapi-compatible', 'provider links must include NewAPI compatibility');
mustInclude('apps/server-go/internal/store/store.go', 'sub2api-compatible', 'provider links must include Sub2API compatibility');
mustInclude('apps/server-go/internal/store/store.go', 'SecretEnv', 'provider links should reference server environment secrets');
mustNotInclude('apps/server-go/internal/store/store.go', '`json:"apiKey"`', 'provider links must not persist raw API keys in config JSON');
mustInclude('apps/server-go/internal/provider/dispatch.go', 'BuildImageGenerationPlan', 'Go provider layer must build image generation dispatch plans');
mustInclude('apps/server-go/internal/provider/dispatch.go', '/images/generations', 'Go provider dispatch must keep image generation on the OpenAI-compatible images route');
mustInclude('apps/server-go/internal/provider/dispatch.go', 'GO_DISPATCH_ROUTE_NOT_SUPPORTED', 'Go provider dispatch must reject unsupported routes until implemented');
mustInclude('apps/server-go/internal/provider/dispatch_test.go', 'sub2api-compatible', 'Go provider dispatch tests must cover Sub2API-compatible links');
mustInclude('apps/server-go/internal/provider/dispatch_test.go', 'newapi-compatible', 'Go provider dispatch tests must cover NewAPI-compatible links');
mustInclude('apps/server-go/internal/httpapi/server_test.go', 'TestGenerationJobDispatchPlanIsSanitized', 'Go HTTP tests must cover sanitized dispatch plans');
mustInclude('apps/server-go/internal/workflow/continuation.go', 'BuildContinuationPlan', 'Go workflow layer must build branch continuation prompts');
mustInclude('apps/server-go/internal/workflow/continuation.go', 'RootPrompt', 'Go workflow continuation must preserve the first prompt');
mustInclude('apps/server-go/internal/workflow/continuation.go', 'PreviousPrompt', 'Go workflow continuation must inherit the parent prompt');
mustInclude('apps/server-go/internal/workflow/continuation.go', 'WorkflowState', 'Go workflow continuation must return metadata for the next job');
mustInclude('apps/server-go/internal/workflow/continuation_test.go', 'TestBuildContinuationPlanKeepsRootAndPreviousPrompt', 'Go workflow tests must cover #1 -> #2 -> #3 prompt inheritance');
mustInclude('apps/server-go/internal/workflow/continuation_test.go', 'TestBuildContinuationPlanSupportsVideoContinuation', 'Go workflow tests must cover video continuation');
mustInclude('apps/server-go/internal/httpapi/server_test.go', 'TestGenerationJobContinuationPlan', 'Go HTTP tests must cover continuation plans');
mustInclude('docs/GO-SERVER-CORE.md', 'The Studio user system is independent from NewAPI, Sub2API', 'docs must keep product identity separate from upstream gateways');
mustInclude('docs/GO-SERVER-CORE.md', 'GET  /studio-api/session', 'docs must list Go session endpoints');
mustInclude('docs/GO-SERVER-CORE.md', 'GET  /studio-api/history', 'docs must list Go history endpoints');
mustInclude('docs/GO-SERVER-CORE.md', 'GET  /studio-api/generation-jobs', 'docs must list Go generation job endpoints');
mustInclude('docs/GO-SERVER-CORE.md', 'GET  /studio-api/generation-jobs/{id}/dispatch-plan', 'docs must list Go dispatch-plan endpoint');
mustInclude('docs/GO-SERVER-CORE.md', 'POST /studio-api/generation-jobs/{id}/continuation-plan', 'docs must list Go continuation-plan endpoint');
mustInclude('docs/GO-SERVER-CORE.md', 'GET  /studio-api/providers', 'docs must list user-visible provider endpoints');
mustInclude('docs/GO-SERVER-CORE.md', 'GET  /studio-api/providers/{id}/models', 'docs must list provider model sync endpoints');
mustInclude('docs/GO-SERVER-CORE.md', 'It does not dispatch to upstream providers yet.', 'docs must state Go job dispatch is not active yet');
mustInclude('docs/GO-SERVER-CORE.md', 'dry-run contract endpoint', 'docs must explain dispatch plans do not call upstream providers');
mustInclude('docs/architecture-v1.md', 'Workflow Continuation', 'architecture docs must define prompt workflow continuation');
mustInclude('docs/architecture-v1.md', 'workflow.lineage', 'architecture docs must require lineage metadata for continuation');
mustInclude('package.json', '"check:server-go": "node scripts/check-server-go-contract.mjs"', 'package scripts must expose the Go server contract check');
mustInclude('package.json', 'npm run check:server-go', 'local checks must include the Go server contract check');
mustInclude('.env.example', 'STUDIO_GO_ADMIN_BOOTSTRAP_TOKEN=', 'example env must document Go admin bootstrap');
mustInclude('.env.example', 'STUDIO_SHARED_NEWAPI_API_KEY=', 'example env must document shared NewAPI secret env');
mustInclude('.env.example', 'STUDIO_SHARED_SUB2API_API_KEY=', 'example env must document shared Sub2API secret env');

const goFiles = files.filter((file) => file.endsWith('.go'));
for (const file of goFiles) {
  const body = read(file);
  for (const match of body.matchAll(/"((?:github\.com|golang\.org\/x)\/[^"]+)"/g)) {
    const importPath = match[1];
    if (!importPath.startsWith('github.com/margetrp-hub/image-agent-studio/apps/server-go/')) {
      fail(`${file}: third-party import ${importPath} is not allowed in the first Go core.`);
    }
  }
}

const goVersion = spawnSync('go', ['version'], { encoding: 'utf8' });
if (goVersion.status === 0) {
  const goTest = spawnSync('go', ['test', './...'], {
    cwd: path.join(root, 'apps/server-go'),
    encoding: 'utf8'
  });
  if (goTest.status !== 0) {
    fail(`go test ./... failed:\n${goTest.stdout}\n${goTest.stderr}`);
  }
} else {
  console.warn('Go toolchain not found; server-go contract check ran static checks only.');
}

if (failures.length) {
  console.error(`Go server contract check failed:\n${failures.map((item) => `- ${item}`).join('\n')}`);
  process.exit(1);
}

console.log('Go server contract check passed.');
