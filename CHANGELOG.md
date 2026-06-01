# Changelog

## Unreleased

- Added a VPS Git sync deployment path so production can pull the repository, build locally, update static/service files, and verify protected data instead of relying on manual zip uploads.
- Documented the production data split between repository-managed code and `/var/lib/image-sub2api-studio` persistent history/library assets.
- Simplified the creation composer into a Codex-like bottom conversation, moved image parameters below the input, moved reference images into a right-side panel, and made generation progress easier to scan.
- Refined the bottom composer into a lighter two-line parameter dock to prevent controls from overlapping on narrower desktop viewports.
- Moved the session/route badge into the composer header, restored the left-side Inspiration Library entry, exposed upstream model-sync status for custom gateways, centered canvas nodes when reopening sessions, and aligned History Gallery actions.
- Added an independent collapsed state for the bottom parameter dock so the canvas/composer can gain vertical space while keeping a one-line parameter summary visible.
- Polished the parameter dock interaction with clearer hover/focus states, touch-friendly horizontal scrolling, scroll cues, and stable control sizing to reduce overlap risk.

## 0.8.1 - 2026-06-01

- Expanded the English UI pass across the canvas node controls, reference panel, bottom creation conversation, and parameter rail.
- Fixed current-session recovery for old cached `blob:` URLs by falling back to the persisted `/studio-api/history/.../assets/...` URL before rendering.
- Added browser verification for language switching and persisted asset recovery.

## 0.8.0 - 2026-05-30

- Added `SECURITY.md` to clarify supported scope, out-of-scope responsibilities, key handling, stored data, production hardening, and known limits.
- Added `RELEASE_NOTES.md` with the 0.8 persistence upgrade, deployment impact, verification checklist, and license/security notes.
- Clarified README review boundaries: the open-source package excludes real keys, the private production gallery, the production home page, and Sub2API backend implementation.
- Tightened license wording so the MIT license applies to project code, while community prompt templates and third-party content keep their own attribution and licensing requirements.
- Added Chinese/English UI switching in the lower-left account area and refreshed README screenshots.

- Redesigned the studio around an infinite canvas plus a bottom creation conversation.
- Added visible canvas lineage for #1 -> #2 / #3 continuation flows.
- Grouped the left project list and history gallery by creation session instead of splitting every generated image into a separate project.
- Improved the prompt assistant so the latest user direction wins, especially for derive, local edit, rewrite, remove, and replace instructions.
- Added pending-review states for timeout, manual stop, and interrupted generation, with clearer quota warnings when the upstream request may still be processing.
- Preserved streamed preview images on the canvas before final completion, reducing image loss after refresh or frontend interruption.
- Refined the bottom conversation UI, compact assistant action, parameter rail behavior, and project cards.
- Updated README screenshots, release story, deployment notes, and VPS update wording for the 0.8 release.

## 0.6.0 - 2026-05-28

- Added `/studio-api/session` for authenticated current-session persistence.
- The active canvas, selected node, prompt context, generation status, parameters, and recent result URLs can restore after refresh.
- Session image data URLs are converted into private user-scoped service assets instead of staying only in browser storage.
- The frontend fetches the remote session after login and debounces server-side session snapshots while editing or generating.

## 0.5.0 - 2026-05-28

- Changed image generation to call image models through `/v1/responses` directly, so `gpt-image-2` no longer falls back to `gpt-5.5 + image_generation tool`.
- Routed reference-image editing and Mask redraw through `/v1/images/edits`.
- Added an infinite-canvas creation area where results remain in the current session and previous images can be selected for continuation.
- Masked user keys in the UI.
- Added the local development proxy `VITE_DEV_SUB2API_PROXY_TARGET` for real upstream testing.
- Reworked image/video workspaces, template library, inspiration plaza, history records, deployment docs, acknowledgements, and asset-library protection notes.
