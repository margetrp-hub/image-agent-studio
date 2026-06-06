# AI Image Workbench

## Project Story

AI Image Workbench is a self-hosted image creation workstation for OpenAI-compatible image generation and editing gateways.

I built it because the early image-generation workflow was too scattered: prompt writing lived in one place, reference images in another, generation settings in a payload, results in a temporary browser state, and follow-up edits were easy to lose after refresh.

The workstation keeps that loop in one focused page: write or refine a prompt, add reference images, choose a provider/model, generate through `/v1/images/generations` or edit through `/v1/images/edits`, continue from any canvas image, keep visual lineage between results, and restore sessions/history through the optional persistence service.

It can run with official OpenAI-style APIs, custom compatible gateways, Sub2API, NewAPI, and similar providers. Sub2API was one of the first gateways used during development, but it is now treated as one supported gateway rather than the identity of the project.

This repository only includes the workstation app and deployment examples. It does not include any private production homepage, private production image library, real keys, or gateway backend implementation.

Demo: [studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

## Community

If you are exploring AI image workflows, OpenAI-compatible image endpoints, gateway deployment, model routing, prompt workflows, or future workstation improvements, you are welcome to join the QQ group: `260789529`.

<p align="center">
  <a href="https://github.com/margetrp-hub/ai-image-workbench"><img src="https://img.shields.io/badge/project-ai--image--workbench-0f766e?style=flat-square" alt="project"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f7268?style=flat-square" alt="MIT License"></a>
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/lang-中文-blue?style=flat-square" alt="中文"></a>
</p>


## What 0.9 Beta Does

- Image generation uses `/v1/images/generations` by default and calls image models such as `gpt-image-2` directly, avoiding accidental `/v1/responses` fallback paths.
- Reference-image editing and mask redraw use `/v1/images/edits`.
- The same workstation can connect to official OpenAI-style endpoints, custom OpenAI-compatible gateways, Sub2API, NewAPI, and similar providers.
- Docker can run in `STUDIO_AUTH_MODE=local`, so current sessions, history, queues, and generated assets can persist without depending on an upstream account system.
- Gateway-authenticated deployments can still use `STUDIO_AUTH_MODE=gateway` for per-user isolation through an existing account service.
- Generic `VITE_AI_*` and `AI_GATEWAY_*` configuration names are preferred; older `VITE_SUB2API_*` and `SUB2API_*` names remain as compatibility aliases.
- Server-side generation queues are persisted and can use `STUDIO_JOB_CONCURRENCY` for cautious per-user concurrency after upstream account-pool testing.
- Large canvas sessions use performance mode to virtualize offscreen image/video nodes and reduce SVG line animation pressure.
- The bottom creation conversation can call a chat model to refine prompts and uses the current selected key quota.
- Selecting a canvas node and generating again keeps #1 -> #2 / #3 lineage.
- Opening a single generated image shows the full saved prompt, split into readable sections instead of one long line.
- The prompt assistant respects directions such as derive, local edit, rewrite, remove, and replace; it should not reintroduce details the user has rejected.
- Current canvas sessions are saved through `/studio-api/session`, isolated by the authenticated user scope.
- Authenticated image requests are submitted to `/studio-api/generation-jobs`; the server then calls `/v1/images/generations` or `/v1/images/edits`, stores the result assets, and lets the canvas/history recover after refresh.
- Timeout, stop, and network interruption states are shown as pending review when the upstream request may still be processing or charged.
- The history gallery is grouped by creation session, while the left project list no longer splits one session into one project per image.
- Browser-side history recovery now has an IndexedDB cache layer in addition to the existing localStorage fallback, so larger local histories are less likely to disappear when localStorage is constrained.
- The history gallery renders local sessions in batches instead of mounting every card at once, which keeps large histories lighter in the browser.
- The video inspiration gallery also renders in batches, so future larger prompt/video idea libraries do not mount every card at once.
- Image template search/category results render in batches too, keeping large prompt libraries from mounting every card at once.
- Keys are masked in the UI.
- The lower-left account area includes Chinese/English UI switching and light/dark theme controls.
- Starter prompt and inspiration data can remain static for demos, or move behind `/studio-api/library` for protected production deployments.

## Screenshots

Screenshots come from the current workspace and use demo data with masked keys.

![Main studio workspace Chinese](docs/screenshots/workstation-zh.png)

![Main studio workspace English](docs/screenshots/workstation-en.png)

The older feature-by-feature screenshots are kept in `docs/screenshots/` for version comparison, but the project page now only presents the current workstation layout.

## Boundary

This repository is not a model provider and not a gateway backend.

Official APIs, custom gateways, Sub2API, NewAPI, and similar services own accounts, keys, quota, models, billing, and gateway routing.

AI Image Workbench owns the creation UI: prompts, reference upload, parameter controls, infinite canvas, canvas continuation, history gallery, current-session persistence, and deployment samples.

Community prompt templates are used as learning/reference material. Where applicable, prompt template content follows `CC BY 4.0`; keep attribution to original authors or sources when using or adapting it. See [Acknowledgements and Reference Boundaries](docs/ACKNOWLEDGEMENTS.md).

## Review and Security Boundary

The open-source package does not include real API keys, the private production image library, the production home page, or any gateway backend implementation. A production deployment should connect this studio to an existing official API account or OpenAI-compatible gateway, then configure Nginx, Docker, HTTPS, and persistent storage explicitly.

- Security boundary, key handling, stored data, and production hardening notes: [SECURITY.md](SECURITY.md).
- Provider and gateway integration direction: [docs/PROVIDERS.md](docs/PROVIDERS.md).
- 0.9 beta notes, migration impact, and verification checklist: [RELEASE_NOTES.md](RELEASE_NOTES.md).
- Source-code license scope: [LICENSE](LICENSE). Community prompt templates and third-party content are not automatically relicensed as MIT code.

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

This lets the local page call `/v1`, `/api`, and `/login` through the Vite dev server instead of being blocked by browser CORS.

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

Upload the files from `dist/`. Do not upload the source-root `studio.html` directly, because the production file must be the built `dist/studio.html`.

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

- `VITE_AI_GATEWAY_BASE_URL` is normalized to `/api/v1` for login, profile, and key-list APIs when your gateway exposes those APIs.
- `VITE_AI_GATEWAY_MODEL_BASE_URL` is normalized to `/v1` for model and generation routes.
- `VITE_AI_IMAGE_ROUTE=auto` is the recommended mode for this release: text-to-image uses `/v1/images/generations`, while reference image and Mask flows use `/v1/images/edits`.
- Set it to `responses` only when your upstream explicitly supports image generation through `/v1/responses` and you want to test that path.
- Set `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` only after the authenticated `/studio-api/library` service is available.

## VPS Layout

I usually deploy it as static front-end files plus the Node history/session service:

```text
/var/www/ai-image-workbench/      # Static files, example path
/opt/image-sub2api-studio/        # Node history/session service
/var/lib/image-sub2api-studio/    # User history gallery, current session, and protected assets
```

If your Nginx server block reads another path, deploy the built `dist/` files there instead. The directory name does not matter; it only needs to match the Nginx `alias`. Existing VPS installs can keep legacy service/data paths such as `/opt/image-sub2api-studio` and `/var/lib/image-sub2api-studio` so old history, sessions, queues, generated images, and protected library assets remain visible after the rename.

More details:

- [Deployment guide](docs/DEPLOY.zh-CN.md)
- [Docker production guide](docs/DOCKER.zh-CN.md)
- [VPS Git sync guide](docs/VPS-GIT-SYNC.zh-CN.md)
- [Server update guide](deploy/UPDATE-SERVER.zh-CN.md)
- [Security boundary](SECURITY.md)
- [Provider and gateway notes](docs/PROVIDERS.md)
- [Release notes](RELEASE_NOTES.md)

For a long-running VPS, prefer Git sync deployment so the server pulls the repository, builds locally, updates static files, restarts the service, and verifies the live state:

```bash
cd /opt/ai-image-workbench-repo

sudo BRANCH=main \
  REPO_DIR=/opt/ai-image-workbench-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

If the server already has an image library, zip-based front-end updates do not need the image library again. With Git sync deployment, you no longer need to upload zip packages manually.

```bash
npm run package:release
```

This command creates:

- `ai-image-workbench-core-update-*.zip`: static front-end files.
- `ai-image-workbench-service-update-*.zip`: `/opt/image-sub2api-studio` service files.
- `image-sub2api-studio-core-update-*.zip` and `image-sub2api-studio-service-update-*.zip`: legacy-name copies for existing VPS commands.

Upload the service package when using current-session persistence, refresh recovery, queue recovery, or the history gallery service.

## Docker Deployment

The repository also includes a Docker Compose deployment for a fresh server or open-source users:

```bash
cp .env.example .env
docker compose up --build -d
```

It starts two containers:

- `studio-web`: Nginx static front-end plus same-origin proxy.
- `studio-history`: Node persistence service for the history gallery, current session, and generated assets.

Persistent data lives in the `studio-data` volume. Rebuilding images keeps the gallery and current canvas as long as you do not run `docker compose down -v`.

If your OpenAI-compatible gateway runs on the host at `127.0.0.1:8080`, keep:

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
```

If the gateway is a remote domain, set:

```env
AI_GATEWAY_UPSTREAM=https://your-gateway-domain
```

See [Docker production guide](docs/DOCKER.zh-CN.md) for the full deployment path.

## Local Verification

Before publishing or deploying a refactor build, run the local no-paid-generation gate:

```bash
npm run check:local
```

This builds the app, verifies provider routing, validates deployment and Docker Compose configuration, checks service persistence/cancel/restart behavior, and runs browser smokes for session-grouped history recovery, IndexedDB-backed local history recovery, history-gallery batch rendering, video-inspiration batch rendering, and image-template batch rendering. It does not call a paid image model.

When Docker Desktop or a Docker daemon is available, also run the container runtime smoke:

```bash
npm run smoke:docker
```

That command builds the Compose stack, starts `studio-web` and `studio-history`, verifies `/studio/`, `/studio-api/health`, and JS/CSS content types, then removes the temporary test stack. If Docker is not running, this gate is simply unverified; it is not covered by `npm run check:local`.

For the final pre-release decision, run:

```bash
npm run audit:readiness
```

This command reruns the local gate, rebuilds and verifies the release packages from the current worktree, and then requires the Docker runtime smoke. If Docker Desktop or the Docker daemon is not running, the audit intentionally fails instead of treating the container deployment shape as proven.

## Asset Library Strategy

Anything already loaded by front-end code can be inspected in the browser. For production deployments where prompts and assets should not be scraped, recommended practice is:

- Keep the GitHub repository lightweight and do not include the full private gallery.
- Serve private prompts and assets through `/studio-api/library` after login.
- Block static access to `/studio/images/`, `/studio/cases.json`, and `/studio/inspirations.json` in Nginx.
- Add `X-Robots-Tag: noindex, nofollow, noarchive`.

The repository includes a starting Nginx example in `deploy/nginx-sub2api-studio.conf`.

## Optional Gateway Contract Check

Provider route guard:

```bash
npm run check:providers
```

This keeps automatic image generation on `/v1/images/generations` and image editing on `/v1/images/edits`.

```bash
AI_GATEWAY_BASE_URL=https://gateway.example.com \
AI_GATEWAY_EMAIL=you@example.com \
AI_GATEWAY_PASSWORD='your-password' \
npm run check:gateway
```

This checks login, profile, and key-list behavior for an account-backed gateway. It does not start paid generation. Older `SUB2API_*` variables and `npm run check:sub2api` still work as compatibility aliases.

## Project Structure

```text
.
├── src/
│   ├── studio.jsx                         # Main studio UI
│   ├── studio.css                         # Studio styles
│   ├── aiGatewayClient.js                 # OpenAI-compatible gateway client
│   ├── sub2apiClient.js                   # Legacy compatibility re-export
│   └── studio/                            # Helpers and local storage utilities
├── scripts/
│   ├── image-sub2api-studio-history-service.mjs
│   ├── check-sub2api-contract.mjs
│   ├── package-release.mjs
│   └── package-studio-core-update.mjs        # Legacy compatibility wrapper
├── deploy/
│   ├── nginx-sub2api-studio.conf
│   ├── docker-nginx.conf.template
│   ├── image-sub2api-studio-history.service
│   └── UPDATE-SERVER.zh-CN.md
├── docs/
│   ├── DEPLOY.zh-CN.md
│   ├── DOCKER.zh-CN.md
│   ├── open-source-config.zh-CN.md
│   ├── sub2api-studio-overlay.md
│   ├── templates.md
│   └── screenshots/
├── SECURITY.md                           # Security boundary and production hardening notes
├── RELEASE_NOTES.md                      # Current release notes
├── public/
│   ├── cases.json
│   ├── inspirations.json
│   ├── inspiration-sources.json
│   └── style-library.json
└── studio.html
```

## Author & License

Maintainer: [@margetrp-hub](https://github.com/margetrp-hub)

Code is released under the [MIT License](LICENSE). Community prompt templates follow `CC BY 4.0` where applicable; third-party dependencies, prompt sources, and user-provided asset libraries keep their own licenses or service terms.
