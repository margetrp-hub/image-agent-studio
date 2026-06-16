# Release Notes

## 1.0.0

This release marks Image Agent Studio as a standalone self-hosted image creation workstation, with Sub2API kept as one compatible gateway path rather than the project identity.

The 1.0.0 line focuses on a stable creation loop: prompt conversation, reference images, direct image-generation routes, recoverable generation jobs, persistent history, large-canvas performance, Docker/VPS deployment, and a clearer provider abstraction for official APIs, OpenAI-compatible gateways, NewAPI-style gateways, Sub2API, and future model/video adapters.

### What Changed

- Public package name changed to `image-agent-studio`.
- Front-end configuration now prefers generic gateway variables:
  - `VITE_AI_GATEWAY_BASE_URL`
  - `VITE_AI_GATEWAY_MODEL_BASE_URL`
  - `VITE_AI_IMAGE_ROUTE`
  - `VITE_AI_RESPONSES_MODEL`
  - `VITE_AI_GATEWAY_LOGIN_URL`
- Docker and Nginx proxy configuration now prefer `AI_GATEWAY_UPSTREAM`.
- The history/session service now prefers `AI_GATEWAY_BASE_URL`.
- Existing `VITE_SUB2API_*`, `SUB2API_UPSTREAM`, and `SUB2API_BASE_URL` variables remain as compatibility aliases.
- Docker Compose defaults to `STUDIO_AUTH_MODE=local`, so the workbench can persist sessions/history without depending on an upstream account system.
- Gateway-authenticated deployments can still use `STUDIO_AUTH_MODE=gateway`.
- Provider settings now separate credential source (`apiKeySource`) from provider family (`providerId`), so existing gateway accounts, manual OpenAI-compatible APIs, and future NewAPI-style adapters have a clearer path.
- `src/studio/providers/registry.js` now stores route, auth, capability, parameter, and default-model metadata for provider families.
- Server-side generation jobs now persist provider metadata and normalize orphaned active jobs to `unknown` after a service restart or lost runner, instead of leaving them looking actively queued forever.
- Browser-side history now uses IndexedDB as an expanded local cache with localStorage as a fallback, reducing the chance that larger local histories disappear or overload localStorage.
- The history gallery now renders local session cards in batches, reducing the initial DOM and image-node pressure when a user has many saved sessions.
- The video inspiration gallery now renders cards in batches as well, keeping larger idea libraries lighter in the browser.
- Image template category/search results now render cards in batches too, so large prompt libraries avoid mounting every card at once.
- JSON persistence reads now tolerate UTF-8 BOMs, which makes Windows-authored backups and manual VPS recovery files safer to load.
- Large-canvas performance mode virtualizes offscreen image/video nodes and reduces SVG line animation load.
- Manual provider API keys are session-only in the browser. Provider configuration can persist, but raw manually entered API keys are migrated out of `localStorage` and kept only in `sessionStorage` for the current browser session.
- The local release gate now includes documentation encoding checks, so broken README or docs mojibake is caught before publishing.
- The large legacy composer and polish styles were split into focused CSS modules, reducing the chance that future UI work changes unrelated panels by accident.

### Compatibility Notes

- Existing `image-sub2api-studio-*` package names, service paths, systemd service names, and data directories remain supported so old VPS installs can upgrade without losing history or protected library assets.
- New deployments should prefer the `image-agent-studio-*` package names and generic `AI_GATEWAY_*` / `VITE_AI_*` environment names.
- `/v1/responses` image generation is treated as an explicit compatibility path only. The default image path is `/v1/images/generations`, and reference or Mask edits use `/v1/images/edits`.

## 0.8.1

This is a small repair release after the first 0.8 deployment.

- The language switch now covers the visible canvas controls, reference panel, bottom creation conversation, and parameter rail instead of only the outer shell.
- Current-session recovery now handles old cached `blob:` image URLs by falling back to the persisted `/studio-api/history/.../assets/...` URL, then resolving it through the authenticated asset fetch path.
- The release was verified with a browser language-switch smoke test and a persisted-asset recovery test.

## 0.8.0

`0.8.0` turned the early single-page image tool into a more complete gateway-backed creation workstation.

The main change is architectural: authenticated image generation can now be submitted as a server-side job through `/studio-api/generation-jobs`. The browser no longer needs to keep the original generation request alive for the result to be recoverable.

## Highlights

- Text-to-image uses `/v1/images/generations` by default.
- Reference image and Mask flows use `/v1/images/edits`.
- Prompt optimization uses `/v1/chat/completions` and is separate from image generation.
- Generated images are persisted by the studio service and can be restored after refresh.
- The infinite canvas keeps visual lineage between generated images.
- History is grouped by creation session instead of splitting every image into a separate project.
- User API keys are masked in the UI.
- Chinese/English UI switching now lives in the lower-left account area next to the theme/account controls.
- Docker Compose deployment is included for a complete runnable shape.

## Persistence Upgrade

The optional Node service now owns more than history records:

- `/studio-api/session` saves the current canvas and active session state.
- `/studio-api/history` stores session history and generated result URLs.
- `/studio-api/generation-jobs` creates, polls, and cancels server-side generation jobs.
- Generated result images are saved under the authenticated user's private asset directory.

The service does not persist the runtime API key used for generation jobs.

## Upgrade Notes

Traditional VPS deployment should upload both packages:

- `image-agent-studio-core-update-*.zip` to the Nginx static root.
- `image-agent-studio-service-update-*.zip` to `/opt/image-sub2api-studio`.

After the service package is updated:

```bash
cd /opt/image-sub2api-studio
sudo npm ci --omit=dev
sudo cp deploy/image-sub2api-studio-history.service /etc/systemd/system/image-sub2api-studio-history.service
sudo systemctl daemon-reload
sudo systemctl restart image-sub2api-studio-history
curl http://127.0.0.1:8787/studio-api/health
```

For Docker deployment:

```bash
cp .env.example .env
docker compose up --build -d
```

Do not run `docker compose down -v` unless you intend to delete history, jobs, and generated assets.

## Verification Checklist

- Final readiness audit:
  - `npm run audit:readiness`
  - This reruns the local gate, rebuilds and checks the release package pair from the current worktree, and requires the Docker runtime smoke. If Docker is not running, readiness remains unproven.
- Local no-paid-generation gate:
  - `npm run check:local`
  - This covers build, provider route dispatch, deploy config, Docker Compose parsed config, docs encoding, service persistence/cancel/restart behavior, browser history-session recovery, IndexedDB-backed local history recovery, manual provider key storage safety, history-gallery batch rendering, video-inspiration batch rendering, and image-template batch rendering.
- Docker runtime smoke when Docker is available:
  - `npm run smoke:docker`
  - This builds and starts the Compose stack, checks `/studio/`, `/studio-api/health`, and JS/CSS content types, then removes the temporary test stack.
- `npm run build:studio` completes.
- `/studio/` returns the built `studio.html`.
- `/studio/studio-assets/*.js` returns `application/javascript`, not `text/html`.
- `/studio/studio-assets/*.css` returns `text/css`, not `text/html`.
- `/studio-api/health` returns `{"ok":true}`.
- A normal image request appears in gateway logs as `/v1/images/generations`.
- A reference image or Mask request appears as `/v1/images/edits`.
- A prompt assistant request appears as `/v1/chat/completions`.
- Refreshing during or after generation does not remove persisted results from the current canvas/history gallery.

## Security and License Notes

- Source code is MIT licensed.
- Community prompt template content follows `CC BY 4.0` where applicable.
- The open-source package does not include the production home page, real API keys, or the full private image library.
- See [SECURITY.md](SECURITY.md) for deployment and data-boundary notes.
- See [Acknowledgements and Reference Boundaries](docs/ACKNOWLEDGEMENTS.md) for prompt and asset-source boundaries.

## Known Limits

- Stopping the browser wait does not guarantee upstream cancellation once the upstream gateway has accepted the request.
- If the service restarts while a job is already in flight, the job can become `unknown`; check gateway logs and the history gallery before retrying.
- Any prompt or asset returned to a browser can be inspected by that user. Use authenticated library APIs for private materials.
