# Image Agent Studio Web

`apps/web` is the next browser workstation for Image Agent Studio. It is now the active entry for this package: `src/App.jsx` mounts `ProjectWorkstation`.

The workstation is organized around creative projects rather than provider requests. Its current shell covers:

- a project hub;
- single-generation, canvas, and storyboard views;
- project, scene, and shot context;
- prompt continuity across image and video branches;
- a persistent composer;
- reference, prompt, and inspector panels;
- desktop, tablet, and mobile-responsive layouts.

## Current Status

This package is an integration-stage workstation, not the production replacement for the root `src/studio.jsx` application yet.

- The UI restores and clears the Studio bearer session through `src/api/studioApi.js` and verifies it with `/studio-api/auth/me`.
- Project listing and creation use the Go Studio API when a valid Studio session is available.
- Provider settings support encrypted personal connections, administrator-shared connections, and server-side model synchronization.
- Image generation uses an explicit confirmation step, durable Go jobs, authenticated SSE stage updates, cancellation, and private Blob-backed result previews.
- Reloading the workstation restores the latest saved job for the selected project without exposing another project's result.
- The displayed creative workspace still includes local fixture data while canvas state, reference upload, and broader image/video execution are connected incrementally.

Do not describe the mobile layout as a finished mobile client. The repository has separate Mini Program and Android boundaries, but this package only provides responsive web behavior.

## Ownership

The web package owns interaction and presentation:

- project, scene, and shot navigation;
- prompt drafting and continuity controls;
- references and canvas presentation;
- provider/model selection from server-provided capability data;
- task progress and recoverable error states.

It does not own raw provider credentials, durable generation execution, content-addressed asset storage, account pools, billing, or upstream retry policy. Those belong to the Studio API and provider adapters.

Provider families such as `openai-compatible`, `newapi-compatible`, `sub2api-compatible`, and `xai-compatible` describe adapters. They are not product names and should not leak into the main workstation structure.

The canvas view in this workstation is a Studio interaction mode. It is not Image Agent Canvas. Image Agent Canvas is a separate Codex plugin, and this package must not import its MCP server, plugin manifest, or canvas persistence.

## Source Layout

```text
src/
  api/studioApi.js                  Studio auth, project, and SSE client
  workstation/ProjectWorkstation.jsx
                                    current workstation composition
  workstation/projectWorkstation.css
                                    workstation-specific presentation
  workstation/workstationData.js   temporary inspectable fixture data
  workstation/settings/            Provider connection and model controls
  workstation/generation/          confirmation, status, SSE, and result state
```

## Verification

From the repository root:

```sh
npm run check:web-skeleton
npm run check:boundaries
npm run check:naming
npm run check:theme
```

The canonical architecture and delivery status are maintained in [`docs/architecture-v1.md`](../../docs/architecture-v1.md).
