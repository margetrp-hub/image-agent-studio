# AI Image Workbench v1 Architecture

This document describes the target v1 architecture. The current repository still contains compatibility names from the original image-sub2api-studio runtime; v1 keeps those upgrade paths while making the product boundary provider-neutral.

## Goals

- Keep the creation workstation focused on prompt composition, references, canvas work, history, and recovery.
- Split browser UI, server API, provider adapters, queue execution, and asset storage into explicit ownership areas.
- Support OpenAI-compatible gateways first, while leaving a small adapter boundary for non-compatible providers.
- Preserve existing local and Docker data paths during migration.
- Avoid storing raw provider secrets in browser durable storage, history records, job records, or asset metadata.

## Application Layers

```text
apps/
  web/       Browser workstation: React UI, canvas, composer, provider settings, local cache.
  server/    Studio API: auth scope, sessions, history, jobs, assets, provider dispatch.
docs/        Architecture, migration, deployment, and provider contracts.
```

The v1 split is conceptual first, then physical. Existing code may still live under `src/` and `scripts/` until migration is complete.

### Web Layer

The web app owns user interaction only:

- Prompt composer, assistant conversation, reference upload preview, mask/edit controls.
- Provider/model selection based on server or bundled capability metadata.
- Infinite canvas, lineage between generated results, and current-session recovery.
- Local browser cache for fast reloads: IndexedDB first, localStorage fallback for non-secret preferences.
- Queue presentation by polling or subscribing to `/studio-api/generation-jobs`.

The web layer does not own upstream keys, durable job execution, durable assets, or provider-specific request signing.

### Server Layer

The server app owns durable state and protected IO:

- User scope resolution from local mode or gateway-authenticated mode.
- Session snapshots and history records.
- Generation job creation, dedupe, execution, cancellation, and recovery after refresh.
- Asset ingestion from base64, blob uploads, upstream image URLs, and library assets.
- Provider dispatch through adapters.
- Backup, restore, health checks, and deployment diagnostics.

The server layer may keep compatibility route names such as `/studio-api/history` and `/studio-api/generation-jobs`, but v1 code should treat them as Studio API routes rather than history-service internals.

## Request Flow

```text
Browser composer
  -> POST /studio-api/generation-jobs
  -> server validates scope, provider, parameters, references
  -> server stores input assets when needed
  -> queue runner dispatches through provider adapter
  -> provider returns images or recoverable failure
  -> server persists result assets and history record
  -> browser reads job status and restores canvas/history
```

Browser-direct provider calls remain useful for development, but production v1 should prefer server-submitted jobs so refresh, timeout, and network interruption do not lose the final result.

## Data Model

### User Scope

```json
{
  "userKey": "local:default or gateway:user-id",
  "authMode": "local | gateway",
  "displayName": "optional",
  "dataRoot": "per-user data directory"
}
```

All durable records are partitioned by user scope. `local` mode may use one default user. `gateway` mode must derive a stable user key from the upstream account service and must not trust a browser-provided user id.

### Session

```json
{
  "sessionId": "stable workspace id",
  "updatedAt": "ISO timestamp",
  "results": ["protected or public result URLs"],
  "canvasNodes": [],
  "canvasEdges": [],
  "messages": [],
  "queue": [],
  "providerSettings": {
    "providerId": "gateway-account",
    "apiKeySource": "gateway"
  }
}
```

Sessions are the current working state. They should be small enough to reload quickly; large binary content is stored as assets and referenced by URL.

### History Record

```json
{
  "id": "record or job id",
  "sessionId": "source session",
  "createdAt": "ISO timestamp",
  "mode": "image | edit",
  "providerId": "openai-compatible",
  "model": "gpt-image-2",
  "prompt": "final submitted prompt",
  "size": "1024x1024",
  "quality": "auto",
  "count": 1,
  "resultUrls": [],
  "requestIds": [],
  "timing": {}
}
```

History records are append-oriented creation evidence. They should contain sanitized provider metadata, not raw credentials or full upstream secrets.

### Generation Job

```json
{
  "id": "job id",
  "sessionId": "source session",
  "status": "queued",
  "stage": "queued",
  "mode": "image | edit",
  "route": "generations | edits",
  "providerId": "gateway-account",
  "apiKeySource": "gateway | manual",
  "model": "gpt-image-2",
  "prompt": "user visible prompt",
  "generationPrompt": "submitted prompt",
  "inputAssets": [],
  "resultUrls": [],
  "fingerprint": "dedupe key",
  "requestIds": [],
  "error": null
}
```

Jobs are the source of truth while work is active. A succeeded job writes a history record. A failed, canceled, or unknown job remains visible long enough for the user to understand whether retry is safe.

### Asset

```json
{
  "url": "/studio-api/history/{recordId}/assets/0.png",
  "ownerType": "session | history | job | library",
  "ownerId": "record id",
  "mime": "image/png",
  "bytes": 12345,
  "createdAt": "ISO timestamp"
}
```

The file system can remain the v1 default asset index. A later database index is allowed, but the URL contract should stay stable.

## Provider Architecture

Provider support is split into four small concepts:

- Registry: static capability descriptors for display names, routes, file types, model defaults, size/quality/count limits, and auth fields.
- Parameter normalizer: converts UI settings into provider-safe request parameters.
- Adapter: builds and executes the provider request, including multipart edit requests and OpenAI-compatible generation requests.
- Result normalizer: returns generated images, revised prompts, cost information, request ids, and sanitized raw metadata.

The first-class provider families are:

- `gateway-account`: browser is logged into an existing gateway account; server obtains scoped credentials or selected account keys.
- `openai-compatible`: manual base URL and API key for standard `/v1/images/generations` and `/v1/images/edits`.
- `newapi-compatible`: OpenAI-compatible behavior with optional model/account metadata differences.

Default image routing remains:

```text
text-to-image        -> POST /v1/images/generations
reference/mask edit  -> POST /v1/images/edits
prompt assistant     -> POST /v1/chat/completions
```

`/v1/responses` is an opt-in compatibility path only when a provider explicitly supports image generation there.

## Queue State Machine

Server job status is durable and provider-facing:

```text
queued
  -> dispatching
  -> gateway
  -> upstream
  -> image
  -> saving
  -> succeeded
```

Failure and interruption exits:

```text
queued/running -> canceled
any active     -> failed
any active     -> unknown
```

Meanings:

- `queued`: accepted by Studio API, waiting for a per-user runner slot.
- `dispatching`: server is validating runtime credentials and building the provider request.
- `gateway`: request has been delivered to the gateway/provider transport.
- `upstream`: provider is generating or the gateway is waiting on the model.
- `image`: server has received image payloads and is converting them into durable assets.
- `saving`: server is writing result assets, job updates, and history records.
- `succeeded`: durable result URLs exist.
- `failed`: provider or server returned a known terminal error.
- `canceled`: local queue wait or server runner was canceled; upstream may still bill if already reached.
- `unknown`: server lost certainty, usually from timeout, restart, or network interruption after dispatch.

The browser may map server states into compact UI states: `queued`, `running`, `done`, `failed`, `canceled`, and `unknown`.

## Asset Storage

v1 keeps file-system storage as the default deployment unit:

```text
{STUDIO_DATA_DIR}/
  users/{userKey}/
    records.json
    session.json
    sessions/{sessionId}.json
    jobs.json
    assets/{ownerId}/{index}.{ext}
```

Storage rules:

- Store generated images and uploaded session images as files, not JSON blobs.
- Keep protected URLs under `/studio-api/...` when auth is required.
- Keep public demo/library assets under the static web root or `/studio-api/library-assets`.
- Prune session assets that are no longer referenced by the saved session.
- Backup and restore must include records, sessions, jobs, and assets together.
- Do not include provider API keys in asset filenames, metadata, or backup snapshots.

## Docker Deployment Shape

The current Docker shape already matches the v1 boundary:

```text
studio-web      nginx + built web assets
studio-server   Node Studio API, queue runner, asset storage
studio-data     persistent volume mounted at /data
gateway         external OpenAI-compatible upstream
```

Current service names may remain `studio-web` and `studio-history` for compatibility. v1 documentation should refer to the second service as the Studio API/server even if the container image or script still uses the legacy history name.

Recommended production flow:

```text
client -> nginx studio-web
       -> /studio/ static app
       -> /studio-api/* proxy to studio-server
studio-server -> /v1/* upstream gateway
studio-server -> /data durable records and assets
```

Key environment groups:

- Web build: `STUDIO_BASE_PATH`, `VITE_AI_GATEWAY_*`, `VITE_STUDIO_*`.
- Server runtime: `STUDIO_AUTH_MODE`, `STUDIO_DATA_DIR`, `STUDIO_ALLOWED_ORIGINS`, `STUDIO_JOB_*`, `AI_GATEWAY_BASE_URL`.
- Compatibility aliases: `SUB2API_*` and `VITE_SUB2API_*` remain accepted for existing installs.

## Compatibility Policy

v1 may rename internal packages and docs, but external data must remain readable:

- Existing `.image-sub2api-studio-data`, `/var/lib/image-sub2api-studio`, and Docker `studio-data` volumes remain valid.
- Existing `/studio-api/session`, `/studio-api/history`, `/studio-api/generation-jobs`, and `/studio-api/library-assets` routes remain valid.
- Existing provider settings using `sub2api` naming are normalized to gateway/OpenAI-compatible naming on read.
- New code should use `AI_GATEWAY_*`, `VITE_AI_*`, and AI Image Workbench terminology.
