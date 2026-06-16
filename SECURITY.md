# Security Boundary

Image Agent Studio is a self-hosted creation workstation for OpenAI-compatible image gateways. It is not a model gateway, billing system, account system, moderation layer, or security product.

The first public versions were built around Sub2API because it already provided accounts, keys, quota, billing, and compatible image routes. The project is now moving toward a broader gateway model that can work with official APIs, custom OpenAI-compatible endpoints, NewAPI-style deployments, Sub2API-compatible deployments, and future provider adapters.

## Supported Scope

- Front-end studio UI for prompt writing, reference image upload, image parameters, image editing/mask flow, infinite canvas iteration, queue status, and history gallery.
- Optional Node service under `/studio-api/*` for current-session persistence, history records, generated asset storage, protected prompt library APIs, and server-side generation jobs.
- Same-origin deployment examples for Nginx, Docker Compose, and a traditional VPS layout.
- Two persistence identity modes: local workspace mode for standalone deployments, and gateway account mode for deployments that already have an upstream account system.

## Out of Scope

- Upstream account creation, billing, quota calculation, account pool routing, and model availability.
- Abuse prevention, rate limits, moderation policy, or enterprise access control beyond the basic deployment examples.
- Full protection of any prompt, JSON, or image that has already been served to the browser.
- Legal review of user-generated images, uploaded references, third-party prompt packs, or private asset libraries.

## Auth Modes

`STUDIO_AUTH_MODE=local`

- The browser creates a local workspace token and sends it to `/studio-api/*`.
- The service hashes that token and stores data under a workspace-specific directory.
- This mode is useful for Docker demos, private single-user deployments, and testing without an upstream account system.

`STUDIO_AUTH_MODE=gateway`

- The browser sends the gateway bearer token to `/studio-api/*`.
- The service verifies the token through upstream user/profile endpoints and stores data under a hashed user directory.
- This mode is useful when the workbench is attached to an existing account system such as a compatible gateway or relay platform.

## Key and Token Handling

- Gateway bearer tokens may be used by the browser to call the studio persistence service in gateway auth mode.
- Manual API keys are masked in the UI.
- Manually entered provider API keys are kept in browser `sessionStorage` only for the current browser session. Provider configuration such as base URL and provider family can persist in `localStorage`, but the raw manual API key is removed before settings are written there.
- If an older browser cache already contains `manualApiKey` inside `image-sub2api-studio:provider-settings:v1`, the current app migrates it into session storage on load and rewrites the persistent settings without the raw key.
- Server-side generation jobs receive the selected API key at runtime so the service can call routes such as `/v1/images/generations` or `/v1/images/edits`.
- API keys are not written to `jobs.json`, `records.json`, `session.json`, or generated asset files by the provided service.
- Compatibility names such as `SUB2API_*`, `VITE_SUB2API_*`, old localStorage keys, and old deployment paths may still appear so existing installations can upgrade without losing history.

Before deploying, confirm logs, reverse proxies, CDN tooling, and process managers do not print full authorization headers or API keys.

## Stored Data

The persistence service can store:

- `records.json`: history gallery records.
- `session.json`: current canvas/session snapshot.
- `jobs.json`: server-side generation job state, request IDs, status, timing, and non-secret request metadata.
- `assets/<record-id>/*`: generated result images persisted for later recovery.

By default, user or workspace storage is separated by a hash derived from the authenticated gateway identity or the local workspace token. This is practical isolation for a small self-hosted service, not a substitute for a hardened multi-tenant platform.

## Production Hardening Checklist

- Serve the studio through HTTPS.
- Keep `/studio-api/*` behind the same domain as the studio UI where possible.
- Set `STUDIO_ALLOWED_ORIGINS` to the real production origin.
- Keep `STUDIO_DATA_DIR` outside the static web root.
- Restrict static access to private libraries, for example `/studio/images/`, `cases.json`, and `inspirations.json`, if they contain private material.
- Add `X-Robots-Tag: noindex, nofollow, noarchive` for private deployments.
- Configure `client_max_body_size` for reference image and mask uploads.
- Keep Nginx `proxy_read_timeout` long enough for image generation.
- Back up `STUDIO_DATA_DIR` before upgrades.
- Do not commit `.env`, real API keys, bearer tokens, private images, or private prompt libraries.

## Known Limits

- A user can still inspect any asset or prompt returned to their browser.
- Stopping a browser wait does not guarantee that an upstream generation request has been canceled or refunded.
- If the Node persistence service restarts while an upstream request is already in flight, the job is normalized to `unknown` when read again; users should check history and upstream billing logs before retrying.
- Docker examples are meant to be runnable defaults. Public production deployments should still add firewall rules, monitoring, backups, and stricter origin policy.

## Reporting

For security issues in this project, open a private report through GitHub Security Advisories when available, or contact the maintainer through the repository owner profile.

Do not include live API keys, bearer tokens, private prompts, or private images in public issues.
