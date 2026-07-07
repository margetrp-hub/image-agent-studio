# Mini Program Client

`apps/miniapp` is the intended boundary for the WeChat Mini Program client.

This client should stay a lightweight companion to Image Agent Studio, not a copy of the full web workstation.

## Product Scope

- Browse inspiration, templates, and recent history.
- Draft prompts and collect reference images from mobile.
- Submit simple generation jobs through the Studio API when enabled.
- Review job status and generated results.
- Send a prompt, reference, or result back to the full web/desktop workstation.

## Out Of Scope For The First Split

- Full infinite canvas editing.
- Provider key management in the client.
- Durable generation queue execution.
- Direct upstream provider calls.
- Desktop-only layout controls.

## Runtime Boundary

The Mini Program client should call the same Studio API contracts as the web client:

- `/studio-api/session`
- `/studio-api/history`
- `/studio-api/generation-jobs`
- `/studio-api/library`
- `/studio-api/library-assets`

The server remains responsible for user scope, queue state, asset storage, and provider dispatch.

## Theme Boundary

Use `packages/theme/tokens.json` as the visual source of truth. Mini Program styles should map semantic tokens into WXSS variables or build-time constants. Do not copy web CSS files into this app.
