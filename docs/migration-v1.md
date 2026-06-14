# AI Image Workbench v1 Migration Plan

This migration plan moves the project from the current mixed `src/` plus history-service layout toward the v1 `apps/web` and `apps/server` architecture without breaking existing deployments.

## Migration Principles

- Preserve data before renaming code.
- Move boundaries in small steps that can be verified independently.
- Keep route, volume, and environment compatibility until a later major release explicitly removes it.
- Do not migrate raw secrets into durable storage.
- Prefer compatibility shims over one-time destructive data transforms.

## Current Starting Point

The current repository is a working 0.9 beta shape:

- Browser app under `src/` and Vite entrypoints.
- Provider registry and adapter preparation under `src/studio/providers/`.
- Node persistence, queue, library, asset, backup, and restore service in `scripts/image-sub2api-studio-history-service.mjs`.
- Docker multi-stage image with `web` and `history` targets.
- Docker Compose services `studio-web` and `studio-history`.
- Persistent state in a data directory containing records, sessions, jobs, and assets.

v1 should not require users to delete or recreate this state.

## Target Directory Skeleton

```text
apps/
  README.md
  web/
    README.md
    package boundary for the browser workstation
  server/
    README.md
    package boundary for the Studio API and queue runner
docs/
  architecture-v1.md
  migration-v1.md
```

Only README files are introduced at the first skeleton step. Code movement should happen after imports, builds, and deployment scripts have explicit tests.

## Phase 0: Document and Freeze Contracts

Purpose: define the v1 architecture without changing runtime behavior.

Tasks:

- Add v1 architecture and migration docs.
- Add `apps/` README skeletons.
- Record the public route contract:
  - `/studio/`
  - `/studio-api/health`
  - `/studio-api/session`
  - `/studio-api/history`
  - `/studio-api/generation-jobs`
  - `/studio-api/library`
  - `/studio-api/library-assets`
- Record provider defaults:
  - `/v1/images/generations` for text-to-image.
  - `/v1/images/edits` for reference and mask edits.
  - `/v1/chat/completions` for prompt assistance.

Verification:

- Documentation exists and references only stable contracts.
- `git status --short` shows only the intended files.

## Phase 1: Introduce Package Boundaries

Purpose: make ownership visible before moving implementation.

Tasks:

- Create `apps/web` package metadata when code migration starts.
- Create `apps/server` package metadata when server migration starts.
- Keep root scripts as wrappers so existing commands still work.
- Keep Vite and Docker builds passing from the root.
- Add import aliases only when they reduce path churn during code movement.

Verification:

- Existing `npm run build` still builds the studio.
- Provider dispatch checks still pass.
- Docker build still produces the same public routes.

## Phase 2: Move Web Runtime

Purpose: move browser-owned code into `apps/web`.

Move candidates:

- `src/studio.jsx`
- `src/studio.css`
- `src/styles/`
- `src/studio/components/`
- `src/studio/state/`
- `src/studio/storage/`
- `src/studio/util/`
- `src/studio/errors/`
- browser-facing provider registry and UI helpers

Keep or shim:

- Existing entrypoints such as `studio.html` until Vite config is updated.
- Compatibility re-exports for old import paths when needed.

Verification:

- Studio route opens at the configured base path.
- Session restore works after refresh.
- History gallery and large canvas performance checks still pass.
- Provider settings do not persist raw manual API keys in durable browser storage.

## Phase 3: Move Server Runtime

Purpose: move Studio API and queue execution into `apps/server`.

Move candidates:

- History/session route handlers.
- Generation job queue and runner.
- Asset persistence helpers.
- Backup and restore operations.
- Library and protected asset serving.
- Health and diagnostics endpoints.

Keep or shim:

- Script name `image-sub2api-studio-history-service.mjs` as a wrapper for systemd, Docker, and VPS installs.
- Data layout under existing `STUDIO_DATA_DIR`.
- Docker service name `studio-history` until operators have a clean rename path.

Verification:

- `/studio-api/health` returns healthy.
- Existing sessions and history records load without migration.
- A queued generation survives browser refresh.
- Restarting the server marks abandoned active jobs as `unknown` rather than losing them.
- Backup and restore include records, sessions, jobs, and assets.

## Phase 4: Provider Adapter Hardening

Purpose: make provider-specific behavior local to adapters.

Tasks:

- Keep registry descriptors as the capability source.
- Normalize request parameters before dispatch.
- Keep route selection out of React components.
- Add adapter-level tests for generations, edits, reference uploads, and unsupported parameter handling.
- Ensure result normalization always returns durable image inputs, request ids, and sanitized metadata.

Verification:

- `auto` image routing still sends text-to-image to `/v1/images/generations`.
- Reference and mask edits still send multipart requests to `/v1/images/edits`.
- Manual provider keys are never written to sessions, history, jobs, assets, or backups.

## Phase 5: Docker Rename Without Data Loss

Purpose: align deployment names with v1 while keeping old compose files usable.

Recommended end state:

```text
studio-web       web static server and reverse proxy
studio-server    Studio API, queue runner, provider dispatch
studio-data      persistent volume
```

Compatibility strategy:

- Continue accepting the `history` Docker target while introducing a `server` target.
- Continue accepting `studio-history` as a Compose service name while documenting it as the Studio API service.
- Keep `/data` as the mounted data root.
- Keep `AI_GATEWAY_*` as primary env names and `SUB2API_*` as aliases.

Verification:

- Existing `docker compose up -d` continues to work.
- A renamed compose file can mount the same `studio-data` volume.
- Generated assets remain reachable after container recreation.

## Data Migration Rules

No mandatory bulk migration is required for v1. Runtime read paths should normalize old records:

- `apiKeySource: "sub2api"` becomes `apiKeySource: "gateway"` in memory.
- Old `VITE_SUB2API_*` and `SUB2API_*` env values map to the matching AI gateway names.
- Legacy session files remain readable from `session.json` and `sessions/{sessionId}.json`.
- Existing protected asset URLs remain valid.
- Existing history records may keep older provider labels, but new records should write provider-neutral fields.

If a future schema version is needed, add a `schemaVersion` field and migrate on write after a successful read. Avoid destructive one-way migrations unless backup and restore have been verified first.

## Rollback Strategy

Rollback must be boring:

- Keep old route handlers until replacement handlers are proven by smoke tests.
- Keep wrapper scripts for old process managers.
- Keep data path compatibility.
- Before any schema-changing release, take a backup through the Studio backup flow or copy `STUDIO_DATA_DIR`.
- If deployment fails, restart the previous image against the same data volume.

## Acceptance Checklist

- v1 docs describe web/server ownership, data model, provider architecture, asset storage, queue states, and Docker shape.
- `apps/` skeleton documents intended ownership without moving runtime code prematurely.
- Existing route and data compatibility promises are explicit.
- Migration phases are independently verifiable.
- No files outside the approved documentation skeleton are changed in the initial step.
