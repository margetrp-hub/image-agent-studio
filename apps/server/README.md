# Server App

`apps/server` is the intended v1 boundary for the Studio API, queue runner, provider dispatch, and durable asset storage.

The current implementation may still be served by `scripts/image-sub2api-studio-history-service.mjs` during migration. That script should become a compatibility wrapper only after the server boundary is moved and verified.

## Responsibilities

- Resolve user scope for `local` and `gateway` auth modes.
- Serve `/studio-api/health`, sessions, history, generation jobs, library data, library assets, backup, and restore.
- Persist sessions, history records, jobs, and assets under `STUDIO_DATA_DIR`.
- Deduplicate active generation jobs by fingerprint.
- Run per-user generation queues with conservative concurrency.
- Dispatch provider requests through adapters.
- Persist generated images as protected assets.
- Mark interrupted active jobs as `unknown` when the server can no longer prove the upstream result.
- Keep compatibility with legacy data paths and environment aliases.

## Queue States

Durable server states:

```text
queued -> dispatching -> gateway -> upstream -> image -> saving -> succeeded
```

Terminal exits:

```text
failed
canceled
unknown
```

`unknown` is important: it tells the user the local server stopped waiting or lost certainty, but the upstream request may still finish or bill.

## Storage Shape

Default file-system storage:

```text
{STUDIO_DATA_DIR}/
  users/{userKey}/
    records.json
    session.json
    sessions/{sessionId}.json
    jobs.json
    assets/{ownerId}/{index}.{ext}
```

The server should treat asset URLs as stable public contracts even if the internal storage index later moves to a database.

## Provider Boundary

Provider adapters should hide upstream differences from the rest of the server:

- Normalize parameters.
- Choose the upstream route.
- Attach credentials at dispatch time only.
- Convert base64, URLs, or binary responses into generated image objects.
- Return sanitized request ids, usage, cost, and error details.

Primary compatible routes:

```text
POST /v1/images/generations
POST /v1/images/edits
POST /v1/chat/completions
```

## Docker Runtime

The v1 server maps to the current `studio-history` container role:

```text
studio-web -> static web and reverse proxy
studio-history or studio-server -> Studio API on port 8787
studio-data -> /data persistent volume
```

Future renames should keep old service names and Docker targets available long enough for existing VPS and Compose deployments to upgrade without data loss.
