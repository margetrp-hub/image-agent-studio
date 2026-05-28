# Runtime Notes

`image-sub2api-studio` is an independent open-source image generation workstation for Sub2API.

## What This Project Owns

- `studio.html`
- `src/studio.jsx`
- `src/studio.css`
- `src/sub2apiClient.js`
- `scripts/image-sub2api-studio-history-service.mjs`
- `scripts/check-sub2api-contract.mjs`
- `deploy/`, Docker, Nginx, and VPS examples
- `public/cases.json` as lightweight starter template data

## Prompt Sources

Community prompt galleries and public examples are used as prompt sources and case-material sources only. They are reference-only materials, not code ownership or asset ownership claims for this repository.

Keep third-party prompt attribution in template data or documentation. Do not present prompt-source projects as the project origin.

## Runtime Contract

The studio logs in to Sub2API and uses Sub2API as the account system.

- login: `POST /api/v1/auth/login`
- 2FA login: `POST /api/v1/auth/login/2fa`
- refresh token: `POST /api/v1/auth/refresh`
- current user: `GET /api/v1/auth/me`
- user profile/balance: `GET /api/v1/user/profile`
- user keys: `GET /api/v1/keys`
- create key when none exists: `POST /api/v1/keys`
- image generation: `POST /v1/responses`; image models such as `gpt-image-2` are called directly, while non-image response models keep `image_generation` compatibility
- image fallback/editing: `POST /v1/images/generations`, `POST /v1/images/edits`
- video generation: `POST /v1/video/generations` task flow
- studio history: `GET/POST/DELETE /studio-api/history`

The browser stores the Sub2API access token in localStorage for this studio. It does not create another login provider.

## Login Behavior

When a visitor clicks generate without a valid Sub2API session, Studio redirects to the configured Sub2API login page:

```text
/login?redirect=/studio/
```

## Environment

```bash
VITE_SUB2API_BASE_URL=https://sub2api.example.com
VITE_SUB2API_GATEWAY_BASE_URL=https://sub2api.example.com
VITE_SUB2API_IMAGE_ROUTE=responses
VITE_SUB2API_RESPONSES_MODEL=gpt-5.5
VITE_SUB2API_RESPONSES_PARTIAL_IMAGES=2
VITE_SUB2API_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
```

## Per-User History Service

The left-side history can work in two modes:

- local fallback: browser localStorage
- server history: same Sub2API account, saved under `/studio-api/history`

Run the history service:

```bash
cd /opt/image-sub2api-studio
SUB2API_BASE_URL=http://127.0.0.1:8080 \
STUDIO_DATA_DIR=/var/lib/image-sub2api-studio \
STUDIO_HISTORY_HOST=127.0.0.1 \
STUDIO_HISTORY_PORT=8787 \
npm run history:service
```

The service verifies the user's Sub2API bearer token with `/api/v1/auth/me` or `/api/v1/user/profile`, then stores records under a hashed user directory. It does not store user passwords or Sub2API API keys.

## VPS Deployment Shape

Build the Studio for `/studio/`:

```bash
STUDIO_BASE_PATH=/studio/ \
VITE_SUB2API_IMAGE_ROUTE=responses \
VITE_SUB2API_RESPONSES_MODEL=gpt-5.5 \
npm run build
```

Upload:

```text
dist/*                                                -> /var/www/image-sub2api-studio/
package.json                                          -> /opt/image-sub2api-studio/package.json
package-lock.json                                     -> /opt/image-sub2api-studio/package-lock.json
scripts/image-sub2api-studio-history-service.mjs      -> /opt/image-sub2api-studio/scripts/
deploy/image-sub2api-studio-history.service           -> /opt/image-sub2api-studio/deploy/
deploy/nginx-sub2api-studio.conf                      -> nginx include or server block
```

Prepare the history service:

```bash
sudo mkdir -p /opt/image-sub2api-studio/scripts /var/lib/image-sub2api-studio /var/www/image-sub2api-studio
sudo chown -R www-data:www-data /var/lib/image-sub2api-studio
cd /opt/image-sub2api-studio
npm ci --omit=dev
sudo cp deploy/image-sub2api-studio-history.service /etc/systemd/system/image-sub2api-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-sub2api-studio-history
curl http://127.0.0.1:8787/studio-api/health
```
