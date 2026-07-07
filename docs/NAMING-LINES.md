# Naming Lines

This repository has several adjacent product and compatibility lines. Keep the names below separate so provider updates, VPS upgrades, desktop packages, and the Codex canvas plugin do not accidentally depend on each other.

## Product Line

Canonical product name:

- `Image Agent Studio`

Canonical Chinese descriptor:

- `创作工作台`

Use the Chinese descriptor in UI copy, app descriptions, and marketing text when a shorter local phrase reads better. Do not use it for package, repository, release artifact, systemd, Docker image, or data-path names.

Canonical package, repository, and release names:

- `image-agent-studio`
- `image-agent-studio-core-update-*`
- `image-agent-studio-service-update-*`

Canonical new deployment defaults:

- Repository checkout: `/opt/image-agent-studio-repo`
- Static root: `/var/www/image-agent-studio`
- Service root: `/opt/image-agent-studio`
- Data root: `/var/lib/image-agent-studio`
- systemd service: `image-agent-studio-history`

Use this line for new user-facing text, README content, release artifacts, Docker images, desktop package names, logs, health payloads, and default deployment examples.

## Workstation Runtime Line

The workstation owns:

- prompt and reference workflow
- image, edit, and video mode UI
- provider selection through normalized capabilities
- generation job state and recovery UI
- infinite canvas, history, templates, and inspiration browsing
- Studio API calls under `/studio-api/*`

The workstation must not own provider account pools, upstream retry policy, billing, quota routing, or Codex plugin canvas internals.

## Codex Plugin Line

Canonical plugin name:

- `Image Agent Canvas`

Canonical plugin package:

- `image-agent-canvas`

This line belongs in the separate Codex plugin repository. These plugin-only concepts must not be added to the workstation repo:

- `.codex-plugin`
- `apps/canvas`
- `server/mcp`
- `tldraw` or Excalidraw runtime dependencies
- MCP tools such as canvas snapshot, holder insertion, or canvas branch writes

The workstation may document that the plugin exists, but it should not import, package, or deploy plugin code.

## Provider Adapter Line

Provider names are adapter descriptors, not product identities:

- `official-openai`
- `openai-compatible`
- `newapi-compatible`
- `gateway-account`
- future `codex2api-compatible`, `cpa-compatible`, or other providers only after they have descriptors and tests

Provider route strings belong in provider adapters, gateway clients, model sync code, and adapter docs/tests:

- `/v1/images/generations`
- `/v1/images/edits`
- `/v1/models`
- `/v1/video/generations`
- `/v1/responses` only as an explicit compatibility mode

Do not hard-code provider ids, upstream route rewrites, account-pool behavior, provider-specific retry rules, or provider-specific auth headers in the main UI shell.

## Legacy Compatibility Line

The following names are legacy compatibility contracts, not the product identity:

- `image-sub2api-studio`
- `sub2api-studio`
- `SUB2API_*`
- `VITE_SUB2API_*`
- `ohlaoo-studio`
- `/var/lib/image-sub2api-studio`
- `/opt/image-sub2api-studio`
- `/var/www/ohlaoo-studio`
- `image-sub2api-studio-history`

They may remain only in:

- compatibility wrapper scripts
- old systemd and Nginx files
- deployment examples for existing VPS installs
- migration and adapter docs
- storage keys, IndexedDB names, and read fallbacks
- smoke tests that verify old data still loads
- release checks that ensure wrappers are still packaged or that legacy release artifacts are rejected

Do not use legacy names for new product copy, new package names, default deployment paths, logs, health payload service names, or desktop packaging.

## Deprecated Identity

`AI Image Workbench` is an old public identity. Do not use it for new copy, service descriptions, release notes, package names, or logs. It may appear only as a machine-readable backup kind when restore compatibility requires it.

## Checks

Run this naming gate after changes that touch docs, deploy files, runtime services, providers, or packaging:

```bash
npm run check:naming
```

The naming check complements:

```bash
npm run check:boundaries
npm run check:deploy
npm run check:desktop
```
