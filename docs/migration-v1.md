# Image Agent Studio Migration Plan

This plan moves Image Agent Studio from the established root Web plus Node Studio service into the project-oriented `apps/web` and Go service core without losing existing data or tying the product to one provider.

Architecture definitions belong in [`architecture-v1.md`](./architecture-v1.md). This document only records migration order, current status, verification, and rollback.

## Rules

- Preserve data and public routes before renaming or moving implementations.
- Migrate one ownership area at a time and keep a verified rollback path.
- Keep provider adapters replaceable; never move provider-specific account-pool or billing rules into Studio domain code.
- Keep raw provider secrets out of browser durable storage and portable project/job/asset contracts.
- Do not remove legacy paths or JSON readers until imported records and assets reconcile.
- A build or unit test is not evidence of a production cutover.

## Current Baseline

The production-compatible line remains:

- root `src/` workstation;
- Node Studio service under `scripts/`;
- current Docker, Nginx, systemd, and VPS wrappers;
- existing session, history, job, library, and generated-asset data.

The migration line now includes:

- active project-oriented entry under `apps/web`;
- provider-neutral schemas under `packages/contracts`;
- Go auth, projects, job records, SSE, content-addressed assets, provider links, encrypted per-user provider connections, and model sync;
- atomic JSON repositories that can be reopened and inspected.

## Phase Status

### 1. Contract and boundary definition: implemented

- Product, provider-adapter, plugin, and legacy naming lines are separated.
- Project, scene, shot, asset, job, event, lineage, prompt-revision, and provider-connection schemas exist.
- Image Agent Canvas remains a separate plugin repository.

Verification:

```bash
npm run check:contracts
npm run check:boundaries
npm run check:naming
```

### 2. Go domain foundations: implemented, not cut over

- Project aggregate and lifecycle rules exist.
- Per-user project persistence and isolation tests exist.
- Job event broker, replay, and SSE endpoint exist.
- Content-addressed asset store and authenticated routes exist.
- AES-256-GCM secret envelopes and per-user provider connections exist.

Remaining before cutover:

- repository interfaces backed by SQLite and PostgreSQL;
- existing-data import and reconciliation;
- backup/restore parity.

### 3. Web workstation: integration in progress

- `apps/web` mounts the new project workstation.
- Studio auth/project and SSE client code exists.
- Single, canvas, and storyboard layouts exist.

Remaining:

- remove fixture dependence from the main creative path;
- persist full project/canvas state through Studio API;
- connect references and content-addressed assets;
- connect generation execution and result lineage;
- verify loading, unauthenticated, failure, reconnect, and recovery states in a real browser.

### 4. Go generation execution: opt-in image slice

The Go API can explicitly execute an OpenAI-compatible image job when `STUDIO_GO_EXECUTION_ENABLED=true`. It uses server-held credentials, durable state transitions, SSE events, cancellation, and private persistence for base64 results. The default remains disabled, and this is not production image/video parity.

Required:

- optional per-user worker cap and dedupe; set it to `0` to remove the Workbench-side cap while preserving provider and network limits;
- adapter dispatch for image, edit, and video contracts;
- retry and timeout ownership;
- uncertain-outcome handling after disconnect or restart;
- durable result assets and history writes;
- end-to-end provider smoke tests without credential leakage.

The repository now includes `go run ./cmd/studio-migrate` for the binary-asset slice. It defaults to dry-run, imports only with `--apply`, deduplicates by SHA-256, rejects symlink escapes, and emits path-to-digest mappings. It does not claim ownership migration: linking a digest to a current Studio user still requires an explicit reconciliation step with verified user mapping.

### 5. Database repositories: not started

Keep domain and HTTP behavior stable while adding:

- SQLite for desktop and single-node use;
- PostgreSQL for multi-user deployments and concurrent workers;
- migrations and transactional indexes;
- content-addressed filesystem/object storage for large assets;
- JSON importers with counts, ownership, and digest reconciliation.

### 6. Production cutover: not started

The Node service remains authoritative until the Go service passes API parity, real generation, restart recovery, data import, backup/restore, reverse-proxy, and rollback tests on a test deployment.

## Compatibility to Preserve

- `/studio/` and existing `/studio-api/*` public routes;
- current data roots and Docker volumes;
- legacy environment aliases needed by existing installs;
- old history, session, job, library, and protected asset reads;
- previous systemd and script wrappers until operators complete migration.

Compatibility names are not allowed to become new product identities. See [`NAMING-LINES.md`](./NAMING-LINES.md).

## Data Migration Order

1. Snapshot the complete current data root and record its size and file counts.
2. Import users and identity mappings.
3. Import projects, sessions, history, and jobs with stable ownership.
4. Import provider connection metadata and re-encrypt credentials through an explicit key migration where required.
5. Hash and import assets, then reconcile every referenced digest.
6. Compare per-user counts and sample complete creative lineages.
7. Run read-only API checks before enabling writes.
8. Enable test traffic, then generation traffic, with the old runtime still available for rollback.

## Rollback

- Stop new writes before switching services.
- Keep the pre-migration data snapshot immutable.
- Keep the previous container/image and service definition available.
- If reconciliation or smoke tests fail, route traffic back to Node and restore only from a verified snapshot.
- Do not attempt an in-place downgrade after a database schema change without a tested reverse migration.

## Explicit Non-Commitments

This migration does not claim a complete Mini Program or Android client. It also does not claim full Go generation parity, multi-instance PostgreSQL readiness, or a production cutover in the current revision.
