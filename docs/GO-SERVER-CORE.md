# Go Server Core

`apps/server-go` is the partial Go service core for Image Agent Studio. The root web application and Node Studio service remain the production-compatible runtime until Go has verified generation execution, migration, operations, and rollback parity.

## Current Scope

Implemented in Go:

- first-party users, registration, login, logout, bearer sessions, bootstrap admin, roles, and user administration;
- user-scoped sessions, history, projects, generation jobs, personal provider connections, and asset references;
- project aggregates with story, scenes, image/video shots, prompt constraints, validation, and archive lifecycle;
- generation-job creation, listing, lookup, cancellation, dispatch planning, and continuation planning;
- authenticated generation-job SSE with snapshot, bounded in-memory replay, and heartbeat;
- shared admin provider links and server-side model sync;
- personal provider connections with AES-256-GCM credential envelopes and server-side model sync;
- explicit opt-in OpenAI-compatible image execution with durable state transitions and cancellation;
- private persistence of base64 image results in the authenticated user's content-addressed asset store;
- SHA-256 content-addressed asset objects, manifests, variants, thumbnails, and per-user read authorization.

Not implemented:

- image edits and video provider dispatch from Go generation jobs;
- durable queue workers, retries, restart recovery, remote-result ingestion, and upstream progress ingestion;
- durable event history across Go process restarts;
- SQLite or PostgreSQL repositories;
- complete import of Node-managed data, backup/restore parity, production cutover, and rollback validation;
- v1 desktop/Go integration or complete Mini Program and Android clients.

## API Surface

Authentication and administration:

```text
POST  /studio-api/auth/bootstrap
POST  /studio-api/auth/register
POST  /studio-api/auth/login
POST  /studio-api/auth/logout
GET   /studio-api/auth/me
GET   /studio-api/admin/users
POST  /studio-api/admin/users
PATCH /studio-api/admin/users/{id}
```

User-owned creative state:

```text
GET  /studio-api/session
POST   /studio-api/session
DELETE /studio-api/session
GET  /studio-api/history
POST   /studio-api/history
DELETE /studio-api/history
DELETE /studio-api/history/{id}
GET    /studio-api/projects
POST   /studio-api/projects
GET    /studio-api/projects/{id}
PUT    /studio-api/projects/{id}
DELETE /studio-api/projects/{id}
GET    /studio-api/generation-jobs
POST   /studio-api/generation-jobs
GET    /studio-api/generation-jobs/{id}
DELETE /studio-api/generation-jobs/{id}
GET    /studio-api/generation-jobs/{id}/events
GET  /studio-api/generation-jobs/{id}/dispatch-plan
POST /studio-api/generation-jobs/{id}/continuation-plan
GET    /studio-api/assets
POST   /studio-api/assets
GET    /studio-api/assets/{digest}
```

`DELETE /studio-api/projects/{id}` archives the project. `PUT` replaces the complete aggregate; there is no partial project `PATCH`.

## Generation SSE

`GET /studio-api/generation-jobs/{id}/events` is authenticated and user-scoped. The response:

- starts with the current persisted job as a `snapshot` event;
- accepts `Last-Event-ID` or `?after=` for bounded replay;
- uses sequences scoped to the user/job pair;
- sends a heartbeat every 15 seconds.

Replay is stored in process memory. It is lost on restart. The JSON job record remains durable, but event history does not.

SSE is a transport contract, not evidence that generation is running. The current Go service publishes local job-state events only and has no provider worker.

## Provider Ownership

The Studio user system is independent from NewAPI, Sub2API, OpenAI-compatible, or xAI-compatible accounts. Go exposes two distinct connection models.

### Shared admin provider links

```text
GET  /studio-api/admin/provider-links
POST /studio-api/admin/provider-links
GET  /studio-api/providers
GET  /studio-api/providers/{id}/models
```

Admins configure endpoints, provider type, account mode, allowed Studio roles, and server environment variable names such as `STUDIO_SHARED_NEWAPI_API_KEY`. The JSON record stores the environment variable name, not the raw secret. `/studio-api/providers` returns only enabled links allowed for the current user's role.

The shared-link `/models` route reads the named secret on the server and returns normalized model metadata without exposing the token.

The generation-job `dispatch-plan` can resolve an allowed shared admin link or the current user's enabled personal connection. Both paths remain dry-run planning only.

### Personal provider connections

```text
GET|POST       /studio-api/provider-connections
GET|PUT|DELETE /studio-api/provider-connections/{id}
GET            /studio-api/provider-connections/{id}/models
```

Each record belongs to the authenticated Studio user. Raw API keys and access tokens are encrypted with AES-256-GCM. The encrypted payload contains both `ownerId` and `connectionId`; decryption rejects a mismatch. Public responses return only configuration and `apiKeyConfigured` / `accessTokenConfigured` flags.

Personal connections require:

```text
STUDIO_MASTER_KEY          # exactly 32 bytes encoded as Base64 or hex
STUDIO_MASTER_KEY_VERSION  # defaults to v1
```

The key is not stored with the encrypted records. Losing it makes those credentials unreadable. Personal connections support server-side model sync, sanitized dispatch planning, and the explicitly enabled image execution route. Raw credentials are never returned to the browser.

Personal model sync blocks `localhost`, `.localhost`, `metadata.google.internal`, and resolved private, loopback, link-local, multicast-link-local, or unspecified addresses by default. Operators can set `STUDIO_ALLOW_PRIVATE_PROVIDER_URLS=true` for an intentional private Provider endpoint. Keep the default unless the endpoint and network are controlled.

Supported provider types are:

- `newapi-compatible`
- `sub2api-compatible`
- `openai-compatible`
- `xai-compatible`

## Dry-run Dispatch

```text
GET /studio-api/generation-jobs/{id}/dispatch-plan
```

This is a dry-run contract endpoint. It builds the OpenAI-compatible image request Go could send for a queued job using an allowed shared link or the current user's enabled personal connection. The response contains a sanitized method, endpoint, route, transport, body, and credential-configured flag. It never includes the provider credential and this endpoint never sends the request upstream.

A successful dispatch-plan response proves request planning only. It does not prove queue execution, provider acceptance, billing, generated output, or asset saving.

## Opt-in Image Execution

```text
POST /studio-api/generation-jobs/{id}/execute
```

This route is available only when `STUDIO_GO_EXECUTION_ENABLED=true`. It sends the sanitized OpenAI-compatible `/images/generations` plan with the server-held credential, refuses redirects, bounds the response body, and advances the durable job through `dispatching`, `upstream`, optional `saving`, and a terminal state. Base64 results are saved in the current user's private asset store. Valid remote result URLs are recorded but are not downloaded in this revision.

This is a controlled migration slice, not the production queue worker. It does not provide retries, restart recovery, image edits, video generation, or numeric upstream progress.

## Asset Store

Uploads are streamed through SHA-256 and stored by digest:

```text
{STUDIO_DATA_DIR}/studio-go/assets/
  objects/{first-two}/{next-two}/{digest}
  manifests/{first-two}/{next-two}/{digest}.json
  tmp/
```

Identical bytes reuse the same object. Manifests may reference immutable named variants and thumbnails. Metadata does not change content identity.

Content addressing is not authorization. After upload, the digest is attached to the authenticated user's `assets.json`. List, metadata, original, and variant reads check this ownership index first. Knowing another user's digest is not sufficient to read it.

HTTP uploads allow only `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`, `video/webm`, and `video/quicktime`. Missing or `application/octet-stream` values are detected from the first 512 bytes; all other MIME values are rejected. Asset reads set `X-Content-Type-Options: nosniff` and private immutable cache headers.

The storage package supports variant relationships, but no complete thumbnail generator or generated-result media pipeline is claimed.

## JSON Compatibility Layer

Current metadata layout:

```text
{STUDIO_DATA_DIR}/
  studio-go/
    auth/users.json
    auth/sessions.json
    config/provider-links.json
    assets/...
  users/{sha256("studio:" + userId)}/
    session.json
    sessions/{sessionId}.json
    records.json
    jobs.json
    projects/{projectId}.json
    provider-connections.json
    assets.json
```

Writes use temporary files and rename replacement, but this remains a JSON compatibility repository. It is not SQLite or PostgreSQL and does not provide multi-record transactions or multi-instance coordination.

The intended repository split keeps domain and HTTP contracts stable while adding:

- SQLite for desktop and controlled single-node installations;
- PostgreSQL for multi-user server deployments and concurrent workers;
- filesystem or object storage for large content-addressed binaries;
- explicit import and verification from the JSON layout before cutover.

## Run And Check

```bash
cd apps/server-go
go run ./cmd/studio-server
go test ./...
```

Default health endpoint:

```text
http://127.0.0.1:8788/studio-api/health
```

Repository-level checks:

```bash
npm run check:server-go
npm run check:contracts
```

Legacy media can be inventoried and imported separately:

```bash
go run ./cmd/studio-migrate --source /old/studio-data
go run ./cmd/studio-migrate --source /old/studio-data --asset-root /new/assets --apply
```

The first command is a dry run. The importer is content-addressed and idempotent, rejects symlink escapes, and emits a JSON path-to-digest report. It deliberately does not update `assets.json` or infer a current user from a legacy directory hash; ownership reconciliation is a separate, auditable migration step.

See [architecture-v1.md](./architecture-v1.md) for the canonical product architecture and [migration-v1.md](./migration-v1.md) for cutover constraints.
