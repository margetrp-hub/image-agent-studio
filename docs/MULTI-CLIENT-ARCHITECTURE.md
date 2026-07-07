# Multi-client Architecture

Image Agent Studio is becoming a creation workstation with multiple clients around one Studio API.

## Client Lines

```text
apps/
  web/       Full browser workstation.
  desktop/   Electron shell around the web workstation and local service.
  miniapp/   Mini Program companion for prompt, inspiration, reference, and history workflows.
  android/   Native mobile client for capture, review, sharing, and lightweight continuation.
  server/    Studio API, queue runner, provider dispatch, and durable asset storage.
  server-go/ Gradual Go core for Studio users, admin provider links, queue, dispatch, and assets.
```

The Chinese product descriptor can be `创作工作台`. It is a user-facing translation, not a package name.

## Ownership

### Web

Owns the full creation workspace:

- prompt composer
- reference panel
- generation confirmation
- infinite canvas
- gallery, templates, and inspiration browsing
- desktop-class history and branch operations

### Desktop

Owns local packaging and desktop runtime:

- local static serving
- local history/session service startup
- app window behavior
- release executable packaging

It should not fork business logic from Web.

### Mini Program

Owns lightweight mobile entry:

- prompt drafting
- inspiration and template browsing
- reference capture
- simple job submit and status review
- send-to-workstation continuation

It should not own full canvas editing or provider credentials.

### Android

Owns native mobile creation support:

- local media picker and share intents
- result gallery review
- push or background job status when available
- session deep links
- lightweight branch continuation

It should not own provider routing or durable job execution.

### Server

Owns the truth:

- auth scope
- sessions
- history
- generation jobs
- assets
- provider dispatch
- backup and restore

All clients should treat the Studio API as authoritative.

### Go Server Core

`apps/server-go` is the service-core migration path. It should make Studio users first-party and treat NewAPI, Sub2API, CPA, Codex2API, and OpenAI-compatible deployments as backend provider links.

Clients authenticate to Studio. Studio dispatches through the configured provider links.

## Shared Contracts

- API contracts: `docs/architecture-v1.md`
- provider contracts: `docs/adapters/`
- naming contracts: `docs/NAMING-LINES.md`
- theme contracts: `docs/THEME-ARCHITECTURE.md`
- tokens: `packages/theme/tokens.json`

## First Split

The first split should be structural:

1. Keep current Web and Desktop behavior stable.
2. Add Mini Program and Android app boundaries as empty clients with README contracts.
3. Add shared theme tokens before implementing mobile screens.
4. Move common product wording, state names, and API shapes into docs or shared contracts before duplicating code.
5. Add client-specific implementations only after the shared API and theme contracts are stable.
