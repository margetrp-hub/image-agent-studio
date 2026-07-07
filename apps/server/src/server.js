import { createServer as createHttpServer } from 'node:http';
import { IMAGE_JOB_SCHEMA_VERSION } from './domain/schema.js';

export function createServer({ repository }) {
  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://localhost');

      if (request.method === 'GET' && url.pathname === '/health') {
        return sendJson(response, 200, {
          ok: true,
          service: 'image-agent-studio-server',
          schemaVersion: IMAGE_JOB_SCHEMA_VERSION,
        });
      }

      if (request.method === 'GET' && url.pathname === '/v1/jobs') {
        return sendJson(response, 200, { jobs: await repository.listJobs() });
      }

      if (request.method === 'POST' && url.pathname === '/v1/jobs') {
        const body = await readJsonBody(request);
        const job = await repository.createJob(body);
        return sendJson(response, 201, { job });
      }

      if (request.method === 'POST' && url.pathname.startsWith('/v1/jobs/')) {
        const segments = url.pathname.split('/').filter(Boolean);

        if (segments.length === 4 && segments[3] === 'transition') {
          const body = await readJsonBody(request);
          const job = await repository.transitionJob(segments[2], body.status, {
            error: body.error,
          });

          if (!job) {
            return sendJson(response, 404, { error: 'job not found' });
          }

          return sendJson(response, 200, { job });
        }
      }

      return sendJson(response, 404, { error: 'not found' });
    } catch (error) {
      return sendJson(response, 400, {
        error: error instanceof Error ? error.message : 'bad request',
      });
    }
  });
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);

  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  });
  response.end(body);
}
