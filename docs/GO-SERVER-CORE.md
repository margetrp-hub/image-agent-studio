# Go Server Core

Image Agent Studio should move the durable service core to Go gradually. The current Node service remains the compatibility runtime until the Go service has matching persistence, queue, asset, and provider-dispatch coverage.

## Target Role

The Go server owns:

- first-party Studio users
- role-based admin access
- session tokens
- provider links for shared backend accounts
- generation job state machine
- provider dispatch
- asset persistence
- backup and restore
- health and operation diagnostics

The web, desktop, Mini Program, Android, and Codex plugin clients should call the same `/studio-api/*` contracts instead of calling provider gateways directly.

## User System

The Studio user system is independent from NewAPI, Sub2API, or any other upstream gateway.

Roles:

- `admin`: can manage users and backend provider links.
- `creator`: can create sessions, submit jobs, and view own history after those endpoints migrate to Go.

Initial Go endpoints:

```text
POST /studio-api/auth/bootstrap
POST /studio-api/auth/login
POST /studio-api/auth/logout
GET  /studio-api/auth/me
GET  /studio-api/session
POST /studio-api/session
DELETE /studio-api/session
GET  /studio-api/history
POST /studio-api/history
DELETE /studio-api/history
DELETE /studio-api/history/{id}
GET  /studio-api/generation-jobs
POST /studio-api/generation-jobs
GET  /studio-api/generation-jobs/{id}
GET  /studio-api/generation-jobs/{id}/dispatch-plan
POST /studio-api/generation-jobs/{id}/continuation-plan
DELETE /studio-api/generation-jobs/{id}
GET  /studio-api/providers
GET  /studio-api/providers/{id}/models
GET  /studio-api/admin/users
POST /studio-api/admin/users
PATCH /studio-api/admin/users/{id}
```

Bootstrap creates the first admin only when no users exist. Use `STUDIO_GO_ADMIN_BOOTSTRAP_TOKEN` on production servers.

## Backend Provider Links

NewAPI and Sub2API become backend provider links, not the Studio identity.

Admins configure links through:

```text
GET  /studio-api/admin/provider-links
POST /studio-api/admin/provider-links
```

Authenticated creators can only see enabled provider links that allow their Studio role:

```text
GET /studio-api/providers
GET /studio-api/providers/{id}/models
```

The model-sync endpoint calls the provider's OpenAI-compatible `/models` route from the Go server using the configured environment secret. It returns normalized model ids to the client without exposing raw API keys.

Supported first-phase provider types:

- `newapi-compatible`
- `sub2api-compatible`
- `openai-compatible`

The first Go phase stores secret references such as `STUDIO_SHARED_NEWAPI_API_KEY`, not raw API keys. This lets a deployment use shared backend accounts while keeping secrets in the server environment. If the admin UI later accepts raw keys, add encrypted-at-rest secret storage before persisting them.

Example:

```json
{
  "id": "newapi-shared",
  "providerType": "newapi-compatible",
  "label": "Shared NewAPI",
  "enabled": true,
  "baseUrl": "https://newapi.example.com/v1",
  "modelBaseUrl": "https://newapi.example.com/v1",
  "accountMode": "shared-api-key",
  "secretEnv": "STUDIO_SHARED_NEWAPI_API_KEY",
  "sharedEmail": "ops@example.com",
  "allowedRoles": ["admin", "creator"]
}
```

## Storage

The first Go service stores its own control-plane files under the configured data directory:

```text
{STUDIO_DATA_DIR}/
  studio-go/
    auth/
      users.json
      sessions.json
    config/
      provider-links.json
```

Studio-owned session and history data use the same user storage shape as the Node service:

```text
{STUDIO_DATA_DIR}/users/{userKey}/...
```

For first-party Studio users, `userKey` is derived from the Studio user id. Go writes:

```text
{STUDIO_DATA_DIR}/users/{userKey}/
  session.json
  sessions/{sessionId}.json
  records.json
```

Go scrubs common secret fields such as API keys, access tokens, refresh tokens, and passwords before writing session or history JSON. Generated assets, jobs, and legacy gateway-user data are not migrated in this phase.

Generation jobs now have a Go persistence skeleton under:

```text
{STUDIO_DATA_DIR}/users/{userKey}/jobs.json
```

The current Go job endpoint can accept, list, read, dedupe by active fingerprint, and cancel jobs. It does not dispatch to upstream providers yet. Until dispatch is enabled, a queued Go job is durable state only.

Provider model sync is available for admin-managed links, but image/video generation dispatch remains on the existing runtime until the Go queue runner and asset saver are enabled.

`GET /studio-api/generation-jobs/{id}/dispatch-plan` builds the server-side OpenAI-compatible image generation request that Go would send later. It is a dry-run contract endpoint: it returns the sanitized method, endpoint, route, transport, and request body, but never includes API keys and never calls the upstream provider.

`POST /studio-api/generation-jobs/{id}/continuation-plan` builds the next-step workflow prompt from a parent job:

```json
{
  "mode": "image",
  "changePrompt": "keep the subject, make the background darker"
}
```

The response preserves the root prompt, the previous submitted prompt, the new change request, and a `workflow.lineage` array that can be written into the next job request. The same contract is used for image and video continuation, so `#1 -> #2 -> #3` branches keep a stable prompt history without endlessly concatenating every previous prompt.

## Migration Phases

1. Add Go auth and provider-link control plane.
2. Add Studio-owned session/history compatibility.
3. Move generation job queue and state recovery.
4. Move provider dispatch and asset saving.
5. Move backup/restore.
6. Switch `/studio-api/*` proxy from Node to Go on a test VPS.
7. Keep Node wrapper available for rollback until the Go service has passed production smoke tests.

## Checks

Use:

```bash
npm run check:server-go
```

When Go is installed, the check also runs:

```bash
cd apps/server-go
go test ./...
```
