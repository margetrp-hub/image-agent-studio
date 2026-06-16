# Sub2API Compatibility Notes

This file documents the legacy Sub2API-oriented deployment path. It is kept for existing installations and for users who still want to attach Image Agent Studio to a Sub2API-compatible account system.

The current project direction is broader than Sub2API. New deployments should read:

- [Provider and Gateway Notes](PROVIDERS.md)
- [Security Boundary](../SECURITY.md)
- [Deployment Guide](DEPLOY.zh-CN.md)
- [Docker Production Guide](DOCKER.zh-CN.md)

## What This Project Owns

- `studio.html`
- `src/studio.jsx`
- `src/studio.css`
- `src/aiGatewayClient.js`
- `src/sub2apiClient.js` compatibility re-export
- `scripts/image-sub2api-studio-history-service.mjs`
- `scripts/check-sub2api-contract.mjs`
- `deploy/`, Docker, Nginx, and VPS examples
- `public/cases.json` as lightweight starter template data

The project owns the workstation UI, prompt flow, reference upload, image parameters, canvas iteration, history gallery, current-session persistence, and deployment examples. It does not own upstream accounts, billing, quota, provider routing, or model availability.

## Prompt Sources

Community prompt galleries and public examples are used as prompt sources and case-material sources only. They are reference-only materials, not code ownership or asset ownership claims for this repository.

Keep third-party prompt attribution in template data or documentation. Do not present prompt-source projects as the project origin.

## Legacy Sub2API Runtime Contract

When attached to a Sub2API-compatible account system, the workbench can use these routes:

- login: `POST /api/v1/auth/login`
- 2FA login: `POST /api/v1/auth/login/2fa`
- refresh token: `POST /api/v1/auth/refresh`
- current user: `GET /api/v1/auth/me`
- user profile/balance: `GET /api/v1/user/profile`
- user keys: `GET /api/v1/keys`
- create key when none exists: `POST /api/v1/keys`
- image generation: `POST /v1/images/generations`
- image editing and Mask redraw: `POST /v1/images/edits`
- explicit compatibility testing only: `POST /v1/responses`
- video task flow, when supported by the gateway: `POST /v1/video/generations`
- studio history: `GET/POST/DELETE /studio-api/history`
- current canvas session: `GET/POST/DELETE /studio-api/session`
- server-side generation jobs: `GET/POST/DELETE /studio-api/generation-jobs`

Image generation should appear in upstream logs as `/v1/images/generations`. Reference image and Mask flows should appear as `/v1/images/edits`. `/v1/responses` is not the default image route for this release.

## Token and Key Handling

In gateway auth mode, the browser may store the upstream access token in browser storage so it can call the studio persistence service and gateway account APIs. This is a compatibility path for account-backed deployments.

Manually entered provider API keys are different: they are session-only in the browser. The app persists the provider base URL and provider family, but removes raw `manualApiKey` before writing provider settings into `localStorage`.

The Node persistence service receives an API key only at job runtime. It must not write raw API keys into `jobs.json`, `records.json`, `session.json`, or generated asset metadata.

## Environment

New deployments should prefer generic names:

```bash
VITE_AI_GATEWAY_BASE_URL=https://gateway.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://gateway.example.com
VITE_AI_IMAGE_ROUTE=auto
VITE_AI_RESPONSES_MODEL=gpt-5.5
VITE_AI_GATEWAY_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
```

Existing Sub2API-oriented variables remain compatibility aliases:

```bash
VITE_SUB2API_BASE_URL=https://sub2api.example.com
VITE_SUB2API_GATEWAY_BASE_URL=https://sub2api.example.com
VITE_SUB2API_IMAGE_ROUTE=auto
VITE_SUB2API_RESPONSES_MODEL=gpt-5.5
VITE_SUB2API_RESPONSES_PARTIAL_IMAGES=2
VITE_SUB2API_LOGIN_URL=https://studio.example.com/login
```

## Per-User History Service

The history service can work in two identity modes:

- `STUDIO_AUTH_MODE=local`: browser workspace token, useful for standalone Docker or private single-user deployments.
- `STUDIO_AUTH_MODE=gateway`: upstream bearer token, useful for existing gateway account systems.

For a legacy Sub2API-compatible gateway deployment:

```bash
cd /opt/image-sub2api-studio
AI_GATEWAY_BASE_URL=http://127.0.0.1:8080 \
STUDIO_AUTH_MODE=gateway \
STUDIO_DATA_DIR=/var/lib/image-sub2api-studio \
STUDIO_HISTORY_HOST=127.0.0.1 \
STUDIO_HISTORY_PORT=8787 \
npm run history:service
```

The service verifies the user's bearer token through upstream profile endpoints, then stores data under a hashed user directory. It does not store user passwords or runtime API keys.

## VPS Deployment Shape

Build the Studio for `/studio/`:

```bash
STUDIO_BASE_PATH=/studio/ \
VITE_AI_IMAGE_ROUTE=auto \
VITE_AI_RESPONSES_MODEL=gpt-5.5 \
npm run build
```

Upload:

```text
dist/*                                                -> /var/www/ai-image-workbench/ or your Nginx alias directory
package.json                                          -> /opt/image-sub2api-studio/package.json
package-lock.json                                     -> /opt/image-sub2api-studio/package-lock.json
scripts/image-sub2api-studio-history-service.mjs      -> /opt/image-sub2api-studio/scripts/
deploy/image-sub2api-studio-history.service           -> /opt/image-sub2api-studio/deploy/
deploy/nginx-sub2api-studio.conf                      -> nginx include or server block
```

Prepare the service:

```bash
sudo mkdir -p /opt/image-sub2api-studio/scripts /var/lib/image-sub2api-studio /var/www/ai-image-workbench
sudo chown -R www-data:www-data /var/lib/image-sub2api-studio
cd /opt/image-sub2api-studio
npm ci --omit=dev
sudo cp deploy/image-sub2api-studio-history.service /etc/systemd/system/image-sub2api-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-sub2api-studio-history
curl http://127.0.0.1:8787/studio-api/health
```
