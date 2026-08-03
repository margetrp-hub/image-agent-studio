# Image Agent Studio Architecture

This is the canonical architecture document for Image Agent Studio. Other READMEs should link here instead of defining a second product or service boundary.

## Product Boundary

Image Agent Studio is an independent creation workstation for image and video workflows. It keeps briefs, prompts, references, projects, visual branches, task state, history, and durable assets in one workspace.

The workstation is not a model provider, gateway, account pool, quota system, or billing service. OpenAI-compatible APIs, NewAPI, Sub2API, xAI-compatible services, and future integrations connect through provider adapters. Adapter names describe transport and capability differences; they do not define the product.

Image Agent Canvas is a separate Codex plugin and a separate repository. This repository does not own its MCP server, tldraw runtime, Codex plugin manifest, or project-level plugin storage. The two products may exchange stable assets and prompt/workflow contracts later, but neither is packaged inside the other.

## Current Delivery Status

The repository is in a staged migration. The following distinctions are intentional.

### Working compatibility runtime

The root web application and Node Studio service remain the production-compatible path. They currently own the established generation flow, session/history compatibility, queue execution, generated asset handling, deployment scripts, and existing data layouts.

### Implemented Go foundations

`apps/server-go` currently provides:

- Studio-owned authentication and user isolation;
- per-user project aggregates and lifecycle validation;
- session, history, and queued job compatibility APIs;
- project-aware prompt continuation plans;
- authenticated SSE job snapshots, replay, and heartbeats;
- authenticated SHA-256 content-addressed asset storage;
- shared admin provider links;
- encrypted per-user provider connections and server-side model synchronization;
- provider-neutral JSON contracts under `packages/contracts`.

### Integration-stage web workstation

`apps/web` is the new project-oriented workstation entry. It contains single-generation, canvas, and storyboard surfaces and an authenticated Studio API client. Registration, project persistence, Provider connection management, model synchronization, generation confirmation, durable image jobs, authenticated SSE updates, cancellation, private result previews, and project-scoped job restoration are connected. Canvas state, reference upload, image editing, video execution, and some displayed workspace data still use fixtures or remain incomplete.

### Not complete in this revision

- Go has an explicit opt-in OpenAI-compatible image execution path, but not production image/video parity. It is disabled by default and does not replace the Node worker.
- `dispatch-plan` remains a sanitized dry run. The separate `execute` endpoint can persist base64 image results, but video, image edits, retries, in-flight recovery after a Go service restart, and remote-result ingestion are not complete.
- Go has not replaced the Node runtime in production.
- SQLite and PostgreSQL repositories are not implemented for the Go domain layer.
- Existing Node data has not been fully imported into the Go stores.
- The existing Electron package wraps the compatibility web/Node runtime; the v1 desktop/Go integration is not complete.
- Mini Program and Android directories are architectural boundaries, not complete clients.
- Responsive web layouts are not a claim of native mobile completion.

## Runtime Shape

```text
Web or desktop client
  -> Studio API (/studio-api/*)
     -> auth and per-user scope
     -> projects, sessions, history, jobs
     -> content-addressed assets
     -> provider adapter registry
        -> official or compatible provider endpoint

Image Agent Canvas (separate repository)
  -> its own Codex plugin and MCP lifecycle
  -> optional future exchange through stable Studio contracts
```

The target is one Studio API contract across web and desktop. Mobile clients may use the same contract later, but they are not part of the current delivery promise.

## Ownership

### Web

The browser owns interaction and presentation:

- project, scene, and shot navigation;
- prompt composition and continuity controls;
- reference and canvas presentation;
- provider/model selection from normalized capability data;
- task progress, recovery, and error presentation;
- local caching of non-secret preferences and reload state.

The browser does not own raw server-managed credentials, durable job execution, account pools, billing, or upstream retry policy.

### Studio API and Go migration core

The service boundary owns protected and durable operations:

- user identity and authorization scope;
- project, session, history, and job persistence;
- provider credential custody;
- server-side model synchronization and dispatch planning;
- content-addressed asset ingestion and access checks;
- job events, cancellation, and eventual queue execution;
- backup, restore, migrations, and operational diagnostics.

The Node service currently supplies parts of this production behavior. Go is replacing it in verified slices rather than through a one-time rewrite.

### Provider adapters

Adapters translate Studio-neutral requests into provider-specific routes, parameters, authentication, and result normalization. Provider-specific rules belong in adapter code and tests, not in the project model or main UI shell.

The Studio user account remains independent from any linked NewAPI, Sub2API, xAI-compatible, or OpenAI-compatible account.

## Creative Domain

### Project

A project is the ownership and persistence boundary for a body of creative work. It contains:

- name, description, lifecycle, and timestamps;
- optional story document and story beats;
- ordered scenes;
- ordered image or video shots;
- project-level prompt constraints.

Projects move through `draft`, `active`, and `archived`. The current delete endpoint archives a project. Full updates use `PUT`; partial `PATCH` is rejected so omitted story, scene, or shot fields cannot silently erase the aggregate.

### Scene and shot

A scene groups related shots and carries its own creative constraints. A shot records intent, immediate prompt, media type, status, duration for video, and reference asset ids.

Constraint inheritance is additive and explicit:

```text
project constraints
  -> scene constraints
     -> shot constraints
        + immediate change request
        -> generation prompt or continuation plan
```

Stable constraints such as subject identity, setting, composition, style, lighting, camera, continuity rules, negative requirements, and technical requirements should not be flattened into an opaque prompt string too early.

### Workflow Continuation

Visual lineage is a data relationship, not only a canvas line. A continuation keeps:

- the original direction;
- the parent result and submitted prompt;
- the new change request;
- inherited project/scene/shot constraints;
- a lineage edge between source and result.

The portable request metadata stores that ordered branch history in `workflow.lineage`. Each new image or video continuation appends its parent/child step without replacing the project, scene, or shot constraints described above.

This supports `#1 -> #2 -> #3` image branches and the same pattern for video scenes. The current Go continuation endpoint builds a sanitized next-step plan; it does not yet execute the next generation.

## Provider and Secret Boundary

Image Agent Studio supports two server-side provider ownership models.

### Shared admin links

An administrator can expose a shared provider link to allowed Studio roles. The link stores a reference to a server environment secret rather than returning that secret to clients.

Shared links can be used by the Go generation-job `dispatch-plan` when the current Studio role is allowed. The endpoint builds and returns a sanitized request plan; it does not dispatch it.

### Per-user connections

A Studio user can own a provider connection. Its API key or access token is encrypted with AES-256-GCM using `STUDIO_MASTER_KEY`, and the encrypted payload is bound to both the user id and connection id. Public API responses include configuration and `APIKeyConfigured` / `AccessTokenConfigured` flags only.

Personal connections support server-side model synchronization, sanitized generation dispatch planning, and the same opt-in Go image executor when execution is enabled.

Operational requirements:

- `STUDIO_MASTER_KEY` must decode to exactly 32 bytes;
- `STUDIO_MASTER_KEY_VERSION` identifies the active key version;
- the key must be backed up separately from application data;
- losing the key makes encrypted provider credentials unreadable;
- rotating keys requires an explicit decrypt-and-re-encrypt migration;
- raw secrets must not appear in browser durable storage, project JSON, job payloads, asset metadata, logs, or backups.

Personal Provider outbound requests, including model synchronization and image execution, treat Provider URLs as a network security boundary. The service resolves and pins the target address, rejects DNS changes while dialing, rejects mixed public/private answers, ignores environment proxies, and does not follow redirects. By default it rejects `localhost`, `.localhost`, `metadata.google.internal`, and hostnames that resolve to private, loopback, link-local, multicast-link-local, or unspecified addresses. A deployment may set `STUDIO_ALLOW_PRIVATE_PROVIDER_URLS=true` to allow an intentional private Provider endpoint; this is an operator-controlled exception, not the default.

Encryption at rest does not make an arbitrary provider URL trustworthy. Server-side URL validation, outbound network policy, audit logging, and provider allowlists remain separate operational concerns.

## Assets

The Go asset store addresses original content by SHA-256 digest:

```text
upload bytes
  -> validate size and metadata
  -> compute digest
  -> deduplicate identical content
  -> persist blob and metadata
  -> attach per-user access reference
```

Authenticated reads verify that the current user owns a reference to the digest. Stable digest URLs allow long-lived private caching without coupling a project to a physical filesystem path.

The upload API accepts only `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `image/avif`, `video/mp4`, `video/webm`, and `video/quicktime`. Missing or generic `application/octet-stream` values are detected from the first 512 bytes; other MIME values are rejected. Asset responses set `X-Content-Type-Options: nosniff` as well as private immutable cache headers.

Variants and thumbnails are related to the original digest. The storage package supports those relationships, but the repository does not yet claim a complete thumbnail generation or media transformation service.

Large image and video bytes remain in filesystem or future object storage. Project and database records store ids, digests, ownership, dimensions, media types, and relationships rather than embedding large base64 payloads.

## Job State and SSE

Generation jobs are durable user-scoped records. The Go API currently supports creation, listing, lookup, cancellation, dispatch-plan inspection, workflow continuation planning, and explicit opt-in OpenAI-compatible image execution. Production queue execution, retries, image edits, and video remain on the compatibility runtime.

The event stream is:

```text
GET /studio-api/generation-jobs/{jobId}/events
```

Behavior:

- sends the current job as a `snapshot` event;
- replays buffered sequenced events after `Last-Event-ID` or `?after=`;
- publishes Studio job events such as `queued`;
- sends a heartbeat every 15 seconds;
- partitions subscriptions by user and job.

SSE reports what Studio knows. When a provider exposes no numeric progress, the UI must present stage and elapsed time without inventing a percentage. A heartbeat means the connection is alive, not that the upstream model has advanced.

The replay buffer is bounded process memory. It does not survive a Go service restart; the JSON job record is durable, but the event history is not.

On browser reload or project change, the workstation requests jobs for that project only and restores its latest saved job. Completed jobs reload their protected result assets through authenticated requests and render local Blob URLs; results from another project are not reused.

## Persistence

### Current compatibility storage

The Go core currently uses atomic JSON files because they are inspectable and compatible with the existing migration path:

```text
{STUDIO_DATA_DIR}/
  studio-go/auth/
  studio-go/config/
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

This layout is suitable for development, compatibility testing, and controlled single-node migration. It is not the intended multi-instance database.

### Repository target

Domain and HTTP contracts must stay independent from the storage engine:

```text
HTTP/domain services
  -> repository interfaces
     -> JSON compatibility repository
     -> SQLite repository
     -> PostgreSQL repository

asset metadata repository
  -> filesystem blob store
  -> optional object store
```

- SQLite is the target for desktop and small single-node installations.
- PostgreSQL is the target for multi-user server deployments, transactions, indexes, and concurrent workers.
- Binary assets remain content-addressed outside ordinary relational rows.
- JSON import remains available until existing projects, jobs, history, provider connections, and asset references have been migrated and verified.

No production cutover should happen without backup, import counts, ownership checks, digest checks, API smoke tests, and a rollback path to the prior runtime.

## Shared Contracts

`packages/contracts` contains provider-neutral JSON Schemas for:

- Project, Scene, and Shot;
- Asset;
- PromptRevision;
- GenerationJob and JobEvent;
- LineageEdge;
- ProviderConnection.

These schemas define portable wire shapes. Lifecycle ordering, user authorization, referential integrity, secret custody, and storage transactions remain service responsibilities.

## Compatibility Policy

Legacy `image-sub2api-studio`, `SUB2API_*`, old VPS paths, route names, and browser storage keys may remain where they protect upgrades and existing data. They are compatibility contracts, not naming guidance for new features.

New product copy, packages, logs, and deployment defaults use `Image Agent Studio` / `image-agent-studio`. See [`NAMING-LINES.md`](./NAMING-LINES.md).

## Related Documents

- [`GO-SERVER-CORE.md`](./GO-SERVER-CORE.md): Go runbook and migration checkpoints.
- [`migration-v1.md`](./migration-v1.md): phased cutover and rollback plan.
- [`PROVIDERS.md`](./PROVIDERS.md): provider route and adapter behavior.
- [`MULTI-CLIENT-ARCHITECTURE.md`](./MULTI-CLIENT-ARCHITECTURE.md): client boundaries and explicit mobile limits.
- [`packages/contracts/README.md`](../packages/contracts/README.md): schema set and validation.
