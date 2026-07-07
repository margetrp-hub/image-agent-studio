# Image Agent Studio

I built Image Agent Studio because image creation work was getting split across too many places. Prompts sat in one tab, reference images in another, parameters were hidden inside request payloads, and useful results could vanish after a refresh.

This project is my attempt to keep that loop in one durable workspace: write the brief, attach references, choose the model route, generate or edit, keep the result on a canvas, and continue from any image without losing the prompt, mask, branch, or history behind it.

The core project does **not** depend on Sub2API, NewAPI, or any single gateway. It can connect to official OpenAI-style APIs, custom OpenAI-compatible endpoints, NewAPI-compatible deployments, Sub2API-compatible deployments, and future image/video adapters. Those integrations are provider adapters around the workstation, not the identity of the project.

Demo: [studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

Chinese README: [README.zh-CN.md](./README.zh-CN.md)

## Community

If you are exploring AI image workflows, OpenAI-compatible image endpoints, gateway deployment, model routing, prompt workflows, or future workstation improvements, you are welcome to join the QQ group: `260789529`.

## What It Provides

- Text-to-image uses `POST /v1/images/generations` by default.
- Reference image and mask editing use `POST /v1/images/edits`.
- Prompt helper requests use `POST /v1/chat/completions`.
- `/v1/responses` is treated as an explicit compatibility path, not the default image route.
- Provider-neutral settings prefer `VITE_AI_*` and `AI_GATEWAY_*`.
- Older `VITE_SUB2API_*` and `SUB2API_*` names remain as compatibility aliases for existing deployments.
- Docker can run in `STUDIO_AUTH_MODE=local`, so the workstation can persist history, sessions, queues, and generated assets without an upstream account system.
- Gateway-authenticated deployments can use `STUDIO_AUTH_MODE=gateway` for per-user isolation through an existing account service.
- Server-side generation jobs are persisted through `/studio-api/generation-jobs`.
- Current canvas sessions are persisted through `/studio-api/session`.
- History gallery, current session, queued tasks, and generated assets can survive browser refreshes and service restarts.
- Large history, template, and inspiration views render in batches to reduce browser pressure.
- Manual provider API keys are session-only browser secrets and are not written to durable local storage.
- Chinese/English UI switching and light/dark mode are available from the account area.

## Boundary

This repository is deliberately narrow. It is not a model provider, gateway backend, billing system, quota manager, or account-pool router.

Image Agent Studio owns:

- Creation UI.
- Prompt and reference workflow.
- Provider selection and route planning.
- Infinite canvas and visual lineage.
- Current-session persistence.
- History gallery and generated asset storage.
- Docker, Nginx, and VPS deployment examples.

Your provider or gateway owns:

- Accounts and API keys.
- Model availability.
- Quota and billing.
- Upstream routing and retries.
- Provider-specific policy and moderation behavior.

See [SECURITY.md](./SECURITY.md) and [docs/PROVIDERS.md](./docs/PROVIDERS.md) for the full security and integration boundary.

## Screenshots

Screenshots use demo data with masked keys.

![Main studio workspace Chinese](docs/screenshots/workstation-zh.png)

![Main studio workspace English](docs/screenshots/workstation-en.png)

## Local Run

```bash
npm install
cp .env.example .env.local
npm run dev:studio
```

For local testing against a cloud OpenAI-compatible gateway:

```env
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://your-gateway-domain
```

The local Vite server will proxy `/v1`, `/api`, and `/login` to that gateway to avoid browser CORS during development.

## Production Build

Root path:

```bash
npm run build
```

`/studio/` subpath:

```bash
STUDIO_BASE_PATH=/studio/ npm run build
```

Windows PowerShell:

```powershell
$env:STUDIO_BASE_PATH="/studio/"
npm run build
Remove-Item Env:\STUDIO_BASE_PATH
```

Upload files from `dist/`. Do not upload the source-root `studio.html` directly; production must use the built `dist/studio.html`.

## Minimum Environment

```env
VITE_AI_GATEWAY_BASE_URL=https://gateway.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://gateway.example.com
VITE_AI_IMAGE_ROUTE=auto
VITE_AI_RESPONSES_MODEL=gpt-5.5
VITE_AI_GATEWAY_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://gateway.example.com
```

Notes:

- `VITE_AI_GATEWAY_BASE_URL` is used for login, profile, and key-list APIs when the gateway exposes account APIs.
- `VITE_AI_GATEWAY_MODEL_BASE_URL` is used for `/v1/models`, image generation, image editing, and prompt helper routes.
- `VITE_AI_IMAGE_ROUTE=auto` keeps text-to-image on `/v1/images/generations` and reference/mask edits on `/v1/images/edits`.
- Set `VITE_AI_IMAGE_ROUTE=responses` only when your upstream explicitly supports image generation through `/v1/responses`.
- Set `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` only after `/studio-api/library` is available behind authentication.

## Standard VPS Layout

New independent deployments should use the `image-agent-studio` layout:

```text
/opt/image-agent-studio-repo/     # Git checkout
/var/www/image-agent-studio/      # Built static files
/opt/image-agent-studio/          # Node history/session service
/var/lib/image-agent-studio/      # History, sessions, queues, generated assets, protected library
```

Existing VPS installs can keep legacy paths such as `/var/www/ohlaoo-studio`, `/opt/image-sub2api-studio`, and `/var/lib/image-sub2api-studio` by passing explicit environment variables to `deploy/sync-from-git.sh`. That avoids making old history, sessions, queues, generated images, or protected library assets look lost after the rename.

First install on a new server:

```bash
sudo REPO_URL=https://github.com/margetrp-hub/image-agent-studio.git \
  BRANCH=main \
  bash -c 'git clone --branch "$BRANCH" "$REPO_URL" /opt/image-agent-studio-repo && bash /opt/image-agent-studio-repo/deploy/install.sh'
```

Standard Git-sync update:

```bash
cd /opt/image-agent-studio-repo
sudo bash deploy/upgrade.sh
```

Legacy Oh Laoo VPS update, preserving current production paths:

```bash
cd /opt/image-agent-studio-repo

sudo BRANCH=main \
  REPO_DIR=/opt/image-agent-studio-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  SERVICE_NAME=image-sub2api-studio-history \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

Useful guides:

- [Deployment guide](docs/DEPLOY.zh-CN.md)
- [Docker production guide](docs/DOCKER.zh-CN.md)
- [VPS Git sync guide](docs/VPS-GIT-SYNC.zh-CN.md)
- [Server update guide](deploy/UPDATE-SERVER.zh-CN.md)
- [Provider and adapter notes](docs/PROVIDERS.md)
- [Naming lines and compatibility boundaries](docs/NAMING-LINES.md)
- [Release notes](RELEASE_NOTES.md)

## Release Packages

Git sync is the preferred production update path. Zip packages remain available for temporary environments that cannot pull from GitHub:

```bash
npm run package:release
```

This creates:

- `image-agent-studio-core-update-*.zip`: static front-end files.
- `image-agent-studio-service-update-*.zip`: service files and deployment docs for `/opt/image-agent-studio`.

## Docker Deployment

Docker Compose starts two containers:

- `studio-web`: Nginx static front-end and same-origin proxy.
- `studio-history`: Node persistence service for history, sessions, jobs, and generated assets.

```bash
cp .env.example .env
docker compose up --build -d
```

Default URL:

```text
http://localhost:8080/studio/
```

Persistent data lives in the `studio-data` volume. Do not run `docker compose down -v` unless you intend to delete history, queued jobs, and generated assets.

If your OpenAI-compatible gateway runs on the host at `127.0.0.1:8080`, keep:

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
```

If the gateway is remote:

```env
AI_GATEWAY_UPSTREAM=https://your-gateway-domain
```

See [docs/DOCKER.zh-CN.md](./docs/DOCKER.zh-CN.md) for the full Docker path.

## Windows Desktop EXE

The repository now includes a reproducible Windows desktop packaging path. It builds the web app, starts the local history/session service inside Electron, serves the built files from a local loopback server, and opens the workstation as a desktop window.

```bash
npm run package:windows
```

The generated installer or portable executable is written under:

```text
release/desktop/
```

The `.exe` is a release artifact, not source code, so it should be uploaded to GitHub Releases instead of committed to the repository. See [Windows desktop packaging](docs/WINDOWS-DESKTOP.zh-CN.md).

## Verification

No-paid-generation local gate:

```bash
npm run check:local
```

Focused checks for deployment work:

```bash
npm run check:deploy
npm run check:docker
npm run check:desktop
npm run check:env
npm run check:docs
npm run check:studio-build
```

When Docker is available:

```bash
npm run smoke:docker
```

Provider route guard:

```bash
npm run check:providers
```

Gateway account contract check, without paid image generation:

```bash
AI_GATEWAY_BASE_URL=https://gateway.example.com \
AI_GATEWAY_EMAIL=you@example.com \
AI_GATEWAY_PASSWORD='your-password' \
npm run check:gateway
```

## Project Structure

```text
src/
  aiGatewayClient.js                 # OpenAI-compatible gateway client
  sub2apiClient.js                   # Legacy compatibility re-export
  studio.jsx                         # Main workstation UI
  studio/                            # Provider, storage, error, and workflow helpers
scripts/
  image-agent-studio-history-service.mjs     # Product-neutral service entry
  image-sub2api-studio-history-service.mjs   # Legacy compatibility wrapper
  package-release.mjs
deploy/
  image-agent-studio-history.service
  nginx-image-agent-studio.conf
  sync-from-git.sh
  install.sh / upgrade.sh / backup.sh / restore.sh / self-check.sh
docs/
  PROVIDERS.md
  DEPLOY.zh-CN.md
  DOCKER.zh-CN.md
  VPS-GIT-SYNC.zh-CN.md
public/
  cases.json
  inspirations.json
  inspiration-sources.json
  style-library.json
```

## License

Code is released under the [MIT License](LICENSE). Community prompt templates follow `CC BY 4.0` where applicable. Third-party dependencies, prompt sources, user-provided assets, and external provider services keep their own licenses or service terms.
