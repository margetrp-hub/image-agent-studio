import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { app, BrowserWindow, shell } from 'electron';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function appRoot() {
  return app.isPackaged ? app.getAppPath() : path.resolve(__dirname, '..', '..');
}

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html') return 'text/html; charset=utf-8';
  if (ext === '.js' || ext === '.mjs') return 'application/javascript; charset=utf-8';
  if (ext === '.css') return 'text/css; charset=utf-8';
  if (ext === '.json') return 'application/json; charset=utf-8';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

function freePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(url) {
  const deadline = Date.now() + 15_000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw lastError || new Error(`Timed out waiting for ${url}`);
}

async function startHistoryService(root) {
  const host = '127.0.0.1';
  const port = await freePort(host);
  process.env.STUDIO_HISTORY_HOST = host;
  process.env.STUDIO_HISTORY_PORT = String(port);
  process.env.STUDIO_AUTH_MODE ||= 'local';
  process.env.STUDIO_ALLOWED_ORIGINS ||= `http://${host}`;
  process.env.STUDIO_DATA_DIR ||= path.join(app.getPath('userData'), 'data');
  process.env.STUDIO_LIBRARY_DIR ||= path.join(root, 'dist');
  process.env.STUDIO_LIBRARY_ASSET_DIR ||= path.join(root, 'dist', 'images');
  process.env.STUDIO_VERSION ||= app.getVersion();

  await import(pathToFileURL(path.join(root, 'scripts', 'image-agent-studio-history-service.mjs')).href);
  const baseUrl = `http://${host}:${port}`;
  await waitForHealth(`${baseUrl}/studio-api/health`);
  return baseUrl;
}

async function proxyRequest(req, res, targetBaseUrl) {
  const targetUrl = `${targetBaseUrl}${req.url}`;
  const headers = { ...req.headers };
  delete headers.host;
  const hasBody = !['GET', 'HEAD'].includes(String(req.method || 'GET').toUpperCase());
  const response = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: hasBody ? req : undefined,
    duplex: hasBody ? 'half' : undefined
  });
  res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
  if (!response.body) {
    res.end();
    return;
  }
  for await (const chunk of response.body) {
    res.write(chunk);
  }
  res.end();
}

function safeStaticPath(distDir, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0] || '/');
  const relative = decoded
    .replace(/^\/studio\/?/, '')
    .replace(/^\/+/, '') || 'studio.html';
  const candidate = path.resolve(distDir, relative);
  if (!candidate.startsWith(path.resolve(distDir))) return null;
  return candidate;
}

async function serveStatic(req, res, distDir) {
  const url = req.url || '/';
  if (url === '/') {
    res.writeHead(302, { Location: '/studio/' });
    res.end();
    return;
  }
  if (url === '/studio') {
    res.writeHead(301, { Location: '/studio/' });
    res.end();
    return;
  }

  let filePath = safeStaticPath(distDir, url);
  if (!filePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  let stat = await fs.stat(filePath).catch(() => null);
  if (stat?.isDirectory()) {
    filePath = path.join(filePath, 'studio.html');
    stat = await fs.stat(filePath).catch(() => null);
  }
  if (!stat?.isFile()) {
    filePath = path.join(distDir, 'studio.html');
    stat = await fs.stat(filePath).catch(() => null);
  }
  if (!stat?.isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentType(filePath),
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff'
  });
  createReadStream(filePath).pipe(res);
}

async function startWebServer(root, historyBaseUrl) {
  const host = '127.0.0.1';
  const port = await freePort(host);
  const distDir = path.join(root, 'dist');
  const server = createServer((req, res) => {
    if (String(req.url || '').startsWith('/studio-api/')) {
      proxyRequest(req, res, historyBaseUrl).catch((error) => {
        res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: false, error: 'LOCAL_PROXY_FAILED', message: error.message }));
      });
      return;
    }
    serveStatic(req, res, distDir).catch((error) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(error.stack || error.message);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  return { server, url: `http://${host}:${port}/studio/` };
}

async function createWindow(url) {
  const win = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#f7f4ed',
    title: 'Image Agent Studio',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  win.webContents.setWindowOpenHandler(({ url: nextUrl }) => {
    shell.openExternal(nextUrl);
    return { action: 'deny' };
  });
  await win.loadURL(url);
}

let webServer = null;

app.whenReady().then(async () => {
  const root = appRoot();
  const historyBaseUrl = await startHistoryService(root);
  const web = await startWebServer(root, historyBaseUrl);
  webServer = web.server;
  await createWindow(web.url);
});

app.on('window-all-closed', () => {
  webServer?.close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0 && webServer) {
    const address = webServer.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await createWindow(`http://127.0.0.1:${port}/studio/`);
  }
});
