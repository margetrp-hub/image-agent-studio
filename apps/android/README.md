# Android Client

`apps/android` is the intended boundary for the Android client.

This client should become a native mobile creation surface around the same Studio API, not a forked provider gateway or a second queue system.

## Product Scope

- Mobile prompt drafting and reference capture.
- Gallery review, sharing, and lightweight branch continuation.
- Uploading local media into the current creation session.
- Optional push or background status for long-running generation jobs.
- Deep links into a specific session, history record, or generation job.

## Out Of Scope For The First Split

- Owning provider account pools or API keys.
- Reimplementing upstream route logic.
- Maintaining a separate durable history store.
- Full desktop-class canvas controls.

## Runtime Boundary

Android should treat the Studio API as the source of truth:

- session state from `/studio-api/session`
- history from `/studio-api/history`
- active jobs from `/studio-api/generation-jobs`
- protected assets from `/studio-api/history/{id}/assets/*`

Local storage should be a cache only. Server records and assets remain authoritative.

## Theme Boundary

Use `packages/theme/tokens.json` as the visual source of truth. Android can map semantic tokens into Material/Compose color, typography, shape, spacing, and motion definitions. Do not mirror web CSS selectors.
