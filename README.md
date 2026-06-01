# image-sub2api-studio

## Project Story

I built `image-sub2api-studio` because Sub2API already solves the backend layer: models, keys, quota, billing, and OpenAI-compatible routes. What I wanted was a lighter creation workstation on top of it.

I did not want users to manually assemble image API payloads every time. I wanted prompt writing, reference images, model selection, quality settings, generation results, canvas iteration, and history gallery to live in one focused page.

`0.8.0` moves the project from a usable web page toward a real creation desk. The interface now centers on an infinite canvas and a bottom creation conversation. The first generation becomes #1; selecting #1 and generating again creates #2 / #3, with visible lineage lines. History is grouped by creation session rather than by single image, and refreshes, timeouts, or manual stops preserve as much current canvas state as possible.

This repository does not include the production home page or the full private image library. It only open-sources the Sub2API image studio.

Demo: [studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

## Community

If you are using Sub2API for image generation or want to discuss deployment, model routing, prompt workflows, and future improvements, you are welcome to join the QQ group: `260789529`.

<p align="center">
  <a href="https://github.com/margetrp-hub/image-sub2api-studio"><img src="https://img.shields.io/badge/project-image--sub2api--studio-0f766e?style=flat-square" alt="project"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f7268?style=flat-square" alt="MIT License"></a>
  <a href="./README.zh-CN.md"><img src="https://img.shields.io/badge/lang-简体中文-blue?style=flat-square" alt="简体中文"></a>
</p>

## What 0.8 Does

- Image generation uses `/v1/images/generations` by default and calls image models such as `gpt-image-2` directly, avoiding accidental `/v1/responses` fallback paths.
- Reference-image editing and mask redraw use `/v1/images/edits`.
- The bottom creation conversation can call a chat model to refine prompts and uses the current Sub2API key quota.
- Selecting a canvas node and generating again keeps #1 -> #2 / #3 lineage.
- The prompt assistant respects directions such as derive, local edit, rewrite, remove, and replace; it should not reintroduce details the user has rejected.
- Current canvas sessions are saved through `/studio-api/session`, isolated by the authenticated Sub2API user.
- Authenticated image requests are submitted to `/studio-api/generation-jobs`; the server then calls `/v1/images/generations` or `/v1/images/edits`, stores the result assets, and lets the canvas/history recover after refresh.
- Timeout, stop, and network interruption states are shown as pending review when the upstream request may still be processing or charged.
- The history gallery is grouped by creation session, while the left project list no longer splits one session into one project per image.
- Sub2API keys are masked in the UI.
- The lower-left account area includes Chinese/English UI switching and light/dark theme controls.
- Starter prompt and inspiration data can remain static for demos, or move behind `/studio-api/library` for protected production deployments.

## Screenshots

Screenshots come from the current workspace and use demo data with masked keys.

![Main studio workspace](docs/screenshots/studio-main.png)

![Canvas continuation and generation state](docs/screenshots/canvas-flow.png)

![Image controls](docs/screenshots/image-controls.png)

![Reference upload](docs/screenshots/reference-upload.png)

![Bottom inspiration and template entry](docs/screenshots/template-library.png)

![Masked key settings](docs/screenshots/key-settings.png)

![History gallery](docs/screenshots/history.png)

## Boundary

This repository is not Sub2API itself and not a model gateway.

Sub2API owns accounts, keys, quota, models, billing, and OpenAI-compatible gateway routes.

`image-sub2api-studio` owns the creation UI: prompts, reference upload, parameter controls, infinite canvas, canvas continuation, history gallery, current-session persistence, and deployment samples.

Community prompt templates are used as learning/reference material. Where applicable, prompt template content follows `CC BY 4.0`; keep attribution to original authors or sources when using or adapting it. See [Acknowledgements and Reference Boundaries](docs/ACKNOWLEDGEMENTS.md).

## Review and Security Boundary

The open-source package does not include real API keys, the private production image library, the production home page, or Sub2API's backend implementation. A production deployment should connect this studio to an existing Sub2API gateway and configure Nginx, Docker, HTTPS, and persistent storage explicitly.

- Security boundary, key handling, stored data, and production hardening notes: [SECURITY.md](SECURITY.md).
- 0.8 release notes, migration impact, and verification checklist: [RELEASE_NOTES.md](RELEASE_NOTES.md).
- Source-code license scope: [LICENSE](LICENSE). Community prompt templates and third-party content are not automatically relicensed as MIT code.

## Local Run

```bash
npm install
cp .env.example .env.local
npm run dev:studio
```

For local testing against a cloud Sub2API endpoint:

```env
VITE_DEV_SUB2API_PROXY_TARGET=https://your-sub2api-domain
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
VITE_SUB2API_BASE_URL=https://sub2api.example.com
VITE_SUB2API_GATEWAY_BASE_URL=https://sub2api.example.com
VITE_SUB2API_IMAGE_ROUTE=auto
VITE_SUB2API_RESPONSES_MODEL=gpt-5.5
VITE_SUB2API_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
VITE_DEV_SUB2API_PROXY_TARGET=https://sub2api.example.com
```

Notes:

- `VITE_SUB2API_BASE_URL` is normalized to `/api/v1` for login, profile, and key-list APIs.
- `VITE_SUB2API_GATEWAY_BASE_URL` is normalized to `/v1` for model and generation routes.
- `VITE_SUB2API_IMAGE_ROUTE=auto` is the recommended mode for this release: text-to-image uses `/v1/images/generations`, while reference image and Mask flows use `/v1/images/edits`.
- Set it to `responses` only when your upstream explicitly supports image generation through `/v1/responses` and you want to test that path.
- Set `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` only after the authenticated `/studio-api/library` service is available.

## VPS Layout

I usually deploy it as static front-end files plus the Node history/session service:

```text
/var/www/image-sub2api-studio/    # Static files, example path
/opt/image-sub2api-studio/        # Node history/session service
/var/lib/image-sub2api-studio/    # User history gallery, current session, and protected assets
```

If your Nginx server block reads another path, unzip the core package there instead. The directory name does not matter; it only needs to match the Nginx `alias`.

More details:

- [Deployment guide](docs/DEPLOY.zh-CN.md)
- [Docker production guide](docs/DOCKER.zh-CN.md)
- [VPS Git sync guide](docs/VPS-GIT-SYNC.zh-CN.md)
- [Server update guide](deploy/UPDATE-SERVER.zh-CN.md)
- [Security boundary](SECURITY.md)
- [Release notes](RELEASE_NOTES.md)

For a long-running VPS, prefer Git sync deployment so the server pulls the repository, builds locally, updates static files, restarts the service, and verifies the live state:

```bash
cd /opt/image-sub2api-studio-repo

sudo BRANCH=main \
  REPO_DIR=/opt/image-sub2api-studio-repo \
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
node scripts/package-studio-core-update.mjs
```

This command creates:

- `image-sub2api-studio-core-update-*.zip`: static front-end files.
- `image-sub2api-studio-service-update-*.zip`: `/opt/image-sub2api-studio` service files.

For 0.8, upload the service package when using current-session persistence, refresh recovery, or the history gallery service.

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

If Sub2API runs on the host at `127.0.0.1:8080`, keep:

```env
SUB2API_UPSTREAM=http://host.docker.internal:8080
```

If Sub2API is a remote domain, set:

```env
SUB2API_UPSTREAM=https://your-sub2api-domain
```

See [Docker production guide](docs/DOCKER.zh-CN.md) for the full deployment path.

## Asset Library Strategy

Anything already loaded by front-end code can be inspected in the browser. For production deployments where prompts and assets should not be scraped, recommended practice is:

- Keep the GitHub repository lightweight and do not include the full private gallery.
- Serve private prompts and assets through `/studio-api/library` after login.
- Block static access to `/studio/images/`, `/studio/cases.json`, and `/studio/inspirations.json` in Nginx.
- Add `X-Robots-Tag: noindex, nofollow, noarchive`.

The repository includes a starting Nginx example in `deploy/nginx-sub2api-studio.conf`.

## Sub2API Contract Check

```bash
SUB2API_BASE_URL=https://sub2api.example.com \
SUB2API_EMAIL=you@example.com \
SUB2API_PASSWORD='your-password' \
npm run check:sub2api
```

This checks login, profile, and key-list behavior. It does not start paid generation.

## Project Structure

```text
.
├── src/
│   ├── studio.jsx                         # Main studio UI
│   ├── studio.css                         # Studio styles
│   ├── sub2apiClient.js                   # Sub2API / OpenAI-compatible client
│   └── studio/                            # Helpers and local storage utilities
├── scripts/
│   ├── image-sub2api-studio-history-service.mjs
│   ├── check-sub2api-contract.mjs
│   └── package-studio-core-update.mjs
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
