# Go Studio Server

`apps/server-go` is the gradual Go control and data core for Image Agent Studio. It runs independently from any provider gateway and keeps provider-specific behavior behind adapters.

The existing Node Studio service remains the production compatibility runtime while Go reaches full queue, video/edit, migration, backup, and operational parity. Go includes an explicit opt-in image execution path, but it is not the default production worker.

## Implemented Boundary

The current Go server includes:

- first-party users, sessions, registration, login, logout, and admin user management;
- per-user project aggregates with story, scene, shot, prompt-constraint, and lifecycle validation;
- session, history, and generation-job compatibility endpoints;
- durable queued job records, cancellation, sanitized dispatch plans, and continuation plans;
- authenticated SSE job streams with an initial snapshot, sequence replay, and heartbeat events;
- authenticated content-addressed asset upload, listing, and reads;
- shared admin provider links that refer to server environment secrets;
- per-user provider connections with encrypted API-key or access-token envelopes;
- server-side model synchronization for configured provider links and connections.
- an opt-in OpenAI-compatible image executor with bounded responses, durable job transitions, SSE state events, cancellation, and base64 result persistence.

Still pending:

- video and image-edit execution in Go;
- production queue workers, provider retries, uncertain-outcome recovery, and full terminal-result parity;
- import and ownership reconciliation for all Node-managed sessions, history, jobs, and assets (the dry-run/apply asset importer is available, but does not guess user links);
- repository implementations backed by SQLite and PostgreSQL;
- durable SSE event storage and replay across process restarts;
- v1 desktop, Mini Program, and Android client integration;
- production cutover and rollback validation.

## Run

```bash
cd apps/server-go
go run ./cmd/studio-server
```

Default health URL:

```text
http://127.0.0.1:8788/studio-api/health
```

The Go server requires `STUDIO_MASTER_KEY` to enable per-user provider connections. It must encode exactly 32 bytes as Base64 or hex. Keep the same key and `STUDIO_MASTER_KEY_VERSION` for the lifetime of the encrypted records; losing the key makes those credentials unreadable.

## Project API

```text
GET    /studio-api/projects
POST   /studio-api/projects
GET    /studio-api/projects/{id}
PUT    /studio-api/projects/{id}
DELETE /studio-api/projects/{id}
```

`PUT` replaces the complete project aggregate. `PATCH` is intentionally unsupported so a partial payload cannot erase story, scenes, or shots. `DELETE` archives the project instead of removing its files.

Project, scene, and shot constraints are stored separately from immediate shot prompts. That gives later workflow execution a stable place to inherit subject, setting, composition, style, continuity, negative, and technical requirements.

## Assets

```text
GET  /studio-api/assets
POST /studio-api/assets
GET  /studio-api/assets/{sha256}
```

Uploads are limited by `STUDIO_ASSET_MAX_BYTES` and stored by SHA-256 digest. Identical content is deduplicated in the global asset store, while access is granted through a per-user asset reference.

The HTTP upload boundary accepts only `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`, `video/webm`, and `video/quicktime`. Missing or `application/octet-stream` types are detected from the first 512 bytes; values outside the allowlist are rejected. Authenticated reads return immutable private cache headers and `X-Content-Type-Options: nosniff`.

Variants and thumbnails are supported by the storage package, but no complete media-processing pipeline is claimed yet.

## Job Events

```text
GET /studio-api/generation-jobs/{id}/events
```

The SSE response begins with the current job snapshot. Sequenced events can be replayed with `Last-Event-ID` or `?after=`, and the server sends a heartbeat every 15 seconds. These events report Studio job state; they do not imply that an upstream provider exposes exact model progress.

Replay history is bounded in process memory. It is lost when the Go process restarts; only the job record itself is durable in the current JSON store.

## Provider Boundaries

There are two distinct server-side connection types:

- **Admin provider links** configure shared deployment accounts and refer to secrets held in environment variables.
- **Per-user provider connections** belong to one Studio user and store API keys or access tokens in AES-256-GCM envelopes protected by `STUDIO_MASTER_KEY`.

Admin links are filtered by `allowedRoles` before they are returned through `/studio-api/providers`. Their `/models` endpoint reads the named environment secret on the server.

Per-user endpoints:

```text
GET    /studio-api/provider-connections
POST   /studio-api/provider-connections
GET    /studio-api/provider-connections/{id}
PUT    /studio-api/provider-connections/{id}
DELETE /studio-api/provider-connections/{id}
GET    /studio-api/provider-connections/{id}/models
```

Public responses expose only configuration and `*Configured` flags. Ciphertext, raw keys, and access tokens are not returned. Encrypted credentials are bound to both the owning user and connection id before they can be decrypted.

Personal connections support server-side `/models` sync, sanitized generation dispatch planning, and the opt-in image execution route described below. Raw credentials remain server-side.

Personal model sync and execution reject `localhost`, `.localhost`, `metadata.google.internal`, and resolved private, loopback, link-local, multicast-link-local, or unspecified addresses by default. Set `STUDIO_ALLOW_PRIVATE_PROVIDER_URLS=true` only when the deployment intentionally needs a private Provider endpoint. Pair this override with a trusted network and controlled provider configuration.

Provider types such as `newapi-compatible`, `sub2api-compatible`, `openai-compatible`, and `xai-compatible` are adapter identifiers. Image Agent Studio does not inherit their account, billing, pool, or routing semantics.

## Current Persistence

The Go server currently uses atomic JSON files for compatibility and inspection:

```text
{STUDIO_DATA_DIR}/
  studio-go/auth/                    users and sessions
  studio-go/config/                  shared admin provider links
  studio-go/assets/                  content-addressed objects and manifests
  users/{sha256("studio:" + userId)}/
    session.json
    sessions/
    records.json
    jobs.json
    projects/{projectId}.json
    provider-connections.json
    assets.json
```

JSON is the current compatibility repository, not the final database design. The next persistence layer should keep the same domain and HTTP contracts while adding:

- SQLite for single-node and desktop installations;
- PostgreSQL for multi-user server deployments;
- filesystem or object storage for large binary assets, addressed by digest;
- explicit importers from the JSON layout before any production cutover.

The database should index metadata and ownership; it should not turn large image or video binaries into ordinary project JSON fields.

## Dry-run Dispatch

```text
GET /studio-api/generation-jobs/{id}/dispatch-plan
```

This endpoint builds a sanitized OpenAI-compatible image request from an allowed shared provider link or the current user's enabled personal connection. It reports whether a server credential is configured, but never returns that credential and never sends the request upstream. A queued Go job is durable planning state, not proof that generation has started.

## Opt-in Image Execution

```text
POST /studio-api/generation-jobs/{id}/execute
```

Execution is available only when `STUDIO_GO_EXECUTION_ENABLED=true`. It supports the OpenAI-compatible `/images/generations` transport, keeps credentials server-side, refuses redirects, limits response bytes, and advances the durable job through `dispatching`, `upstream`, optional `saving`, and a terminal state. Base64 images are saved into the authenticated user's content-addressed asset store. Remote result URLs are validated but are not downloaded in this revision.

This is a controlled migration path, not a production queue worker. It does not add retries, video, image edits, restart recovery, or numeric upstream progress.

## Checks

From the repository root:

```bash
npm run check:server-go
npm run check:contracts
```

With Go installed:

```bash
cd apps/server-go
go test ./...
```

See [`docs/architecture-v1.md`](../../docs/architecture-v1.md) for the canonical architecture and [`docs/GO-SERVER-CORE.md`](../../docs/GO-SERVER-CORE.md) for the migration runbook.

Asset migration starts in report-only mode:

```bash
go run ./cmd/studio-migrate --source /old/studio-data
go run ./cmd/studio-migrate --source /old/studio-data --asset-root /new/assets --apply
```

The report maps legacy paths to digests and records missing, failed, imported, and deduplicated files. It does not alter user asset indexes because a filesystem directory name is not sufficient evidence of a current Studio user identity.
