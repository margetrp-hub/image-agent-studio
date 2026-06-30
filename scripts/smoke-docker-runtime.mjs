import { execFileSync } from 'node:child_process';

const projectName = `image-agent-studio-smoke-${Date.now().toString(36)}`;
const port = String(18080 + Math.floor(Math.random() * 1000));
const baseUrl = `http://127.0.0.1:${port}`;
const smokeToken = 'docker-runtime-smoke-token';

function runDocker(args, options = {}) {
  const command = process.platform === 'win32' ? 'cmd.exe' : 'docker';
  const commandArgs = process.platform === 'win32'
    ? ['/d', '/c', 'docker', ...args]
    : args;
  return execFileSync(command, commandArgs, {
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
    env: {
      ...process.env,
      STUDIO_PORT: port,
      STUDIO_AUTH_MODE: 'local',
      STUDIO_ALLOWED_ORIGINS: `${baseUrl},http://localhost:${port}`,
      AI_GATEWAY_UPSTREAM: 'http://host.docker.internal:8080',
      SUB2API_UPSTREAM: 'http://host.docker.internal:8080'
    }
  });
}

function compose(args, options = {}) {
  return runDocker(['compose', '--env-file', '.env.example', '-p', projectName, ...args], options);
}

function assert(condition, message, evidence) {
  if (!condition) {
    throw new Error(`${message}${evidence ? `\n${JSON.stringify(evidence, null, 2)}` : ''}`);
  }
}

async function waitFor(url, matcher, label) {
  const deadline = Date.now() + 90_000;
  let last = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      last = { status: response.status, headers: Object.fromEntries(response.headers.entries()), text: text.slice(0, 1000) };
      if (matcher(response, text)) return { response, text };
    } catch (error) {
      last = { error: error.message };
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Timed out waiting for ${label}: ${url}\n${JSON.stringify(last, null, 2)}`);
}

async function studioApi(path, options = {}) {
  const response = await fetch(`${baseUrl}/studio-api${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${smokeToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(`Studio API request failed: ${path}\n${JSON.stringify({ status: response.status, payload }, null, 2)}`);
  }
  return payload;
}

function ensureDockerDaemon() {
  try {
    runDocker(['version'], { stdio: 'pipe' });
  } catch (error) {
    const message = String(error.stderr || error.stdout || error.message || '');
    throw new Error(`Docker daemon is not available. Start Docker Desktop or the Docker service, then rerun npm run smoke:docker.\n${message.trim()}`);
  }
}

try {
  ensureDockerDaemon();
  compose(['build'], { stdio: 'inherit' });
  compose(['up', '-d'], { stdio: 'inherit' });

  const studio = await waitFor(`${baseUrl}/studio/`, (response, text) => response.ok && text.includes('studio-assets'), 'Studio HTML');
  const health = await waitFor(`${baseUrl}/studio-api/health`, (response, text) => response.ok && text.includes('"ok":true'), 'Studio API health');

  const html = studio.text;
  const scriptMatch = html.match(/src="([^"]*studio-assets\/[^"]+\.js)"/);
  const cssMatch = html.match(/href="([^"]*studio-assets\/[^"]+\.css)"/);
  assert(scriptMatch?.[1], 'Built Studio HTML did not reference a JS asset.', { html: html.slice(0, 500) });
  assert(cssMatch?.[1], 'Built Studio HTML did not reference a CSS asset.', { html: html.slice(0, 500) });

  const scriptUrl = new URL(scriptMatch[1], `${baseUrl}/studio/`).toString();
  const cssUrl = new URL(cssMatch[1], `${baseUrl}/studio/`).toString();
  const script = await fetch(scriptUrl);
  const css = await fetch(cssUrl);
  assert(script.ok && String(script.headers.get('content-type') || '').includes('application/javascript'), 'JS asset did not return application/javascript.', {
    status: script.status,
    contentType: script.headers.get('content-type'),
    url: scriptUrl
  });
  assert(css.ok && String(css.headers.get('content-type') || '').includes('text/css'), 'CSS asset did not return text/css.', {
    status: css.status,
    contentType: css.headers.get('content-type'),
    url: cssUrl
  });

  const savedSession = await studioApi('/session', {
    method: 'POST',
    body: JSON.stringify({
      sessionId: 'docker-runtime-session',
      mode: 'image',
      prompt: 'Docker runtime persistence smoke',
      model: 'gpt-image-2',
      generationQueue: [{
        id: 'docker-runtime-task',
        status: 'unknown',
        prompt: 'Docker runtime persistence smoke',
        summary: 'Docker runtime persistence smoke'
      }],
      canvasNodes: [{
        id: 'docker-runtime-node',
        canvasIndex: 1,
        kind: 'image',
        url: 'data:image/png;base64,iVBORw0KGgo=',
        prompt: 'Docker persisted canvas node'
      }]
    })
  });
  assert(savedSession.session?.sessionId === 'docker-runtime-session', 'Docker history service did not save the session.', savedSession);

  compose(['restart', 'studio-history'], { stdio: 'inherit' });
  await waitFor(`${baseUrl}/studio-api/health`, (response, text) => response.ok && text.includes('"ok":true'), 'Studio API health after history restart');
  const restoredSession = await studioApi('/session?sessionId=docker-runtime-session');
  assert(restoredSession.session?.sessionId === 'docker-runtime-session', 'Docker volume did not preserve session after history restart.', restoredSession);
  assert(restoredSession.session?.canvasNodes?.[0]?.persistedUrl, 'Docker history service did not persist session canvas image asset.', restoredSession.session);
  assert(restoredSession.session?.generationQueue?.[0]?.status === 'unknown', 'Docker history service did not preserve generation queue state.', restoredSession.session);

  console.log(JSON.stringify({
    ok: true,
    projectName,
    baseUrl,
    health: health.text.trim(),
    persistedSessionId: restoredSession.session.sessionId,
    persistedAsset: restoredSession.session.canvasNodes[0].persistedUrl,
    scriptUrl,
    cssUrl
  }, null, 2));
} finally {
  try {
    compose(['down', '-v'], { stdio: 'inherit' });
  } catch {
    // Cleanup should not hide the primary smoke result.
  }
}
