# Client Boundaries

Image Agent Studio is an independent creation workstation. The current delivery is Web-first, with desktop packaging around the same workstation. Other client directories reserve ownership boundaries; they are not a promise that every client is complete.

The canonical service and domain architecture is [`architecture-v1.md`](./architecture-v1.md).

## Current Clients

### Web

The full workstation direction lives in `apps/web`:

- projects, scenes, and shots;
- single-generation, canvas, and storyboard views;
- prompt and reference continuity;
- task status and result lineage;
- desktop, tablet, and responsive mobile layouts.

The new workstation remains in integration and has not replaced the root production-compatible Web app.

### Desktop

The root Electron packaging path wraps the production-compatible Web app and Node service. `apps/desktop` does not yet contain a complete v1 client, Go-service integration, or SQLite-backed desktop repository.

The eventual v1 desktop client should share domain contracts and UI behavior with Web rather than fork a second workstation implementation.

## Reserved Client Boundaries

### Mini Program

The Mini Program boundary is intended for prompt drafting, reference capture, inspiration browsing, job submission, and result review. Full canvas editing, provider credential custody, and durable queue execution do not belong there.

### Android

The Android boundary is intended for media selection, sharing, result review, session links, and lightweight continuation. Provider routing and durable generation stay on the Studio API.

Neither mobile client is complete in this revision. Directory presence, shared theme tokens, or responsive Web behavior must not be presented as finished mobile delivery.

## Service Ownership

All clients should eventually use the same provider-neutral Studio API for:

- identity and authorization;
- projects, scenes, and shots;
- sessions, jobs, history, and lineage;
- content-addressed assets;
- normalized provider/model capabilities.

Clients do not store server-managed provider keys or reimplement provider-specific route logic.

`apps/server-go` already provides project, job, SSE, provider-connection, model-sync, and content-addressed asset contracts. It does not yet execute generation jobs: its current dispatch endpoint is a sanitized dry run, and production execution remains on the Node compatibility runtime.

## Separate Codex Plugin

Image Agent Canvas is a separate Codex plugin repository. Its MCP server, tldraw canvas, Codex skills, and project-level plugin persistence are outside this repository.

Future interoperability should use stable prompt, asset, and lineage contracts. It should not copy the plugin runtime into Image Agent Studio or make the plugin depend on Studio internals.

## Shared Sources

- Architecture and status: [`architecture-v1.md`](./architecture-v1.md)
- Provider adapters: [`adapters/`](./adapters/README.md)
- Naming: [`NAMING-LINES.md`](./NAMING-LINES.md)
- Theme: [`THEME-ARCHITECTURE.md`](./THEME-ARCHITECTURE.md)
- Wire contracts: [`packages/contracts`](../packages/contracts/README.md)
