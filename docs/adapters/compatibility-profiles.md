# Compatibility Profiles

These profiles describe how common gateway families should be attached without changing the workstation core.

## Sub2API

- Preferred provider id: `gateway-account` when using the account/key service.
- Manual fallback: `openai-compatible` when a single key and public `/v1` endpoint are provided.
- Compatibility surface: existing deployment paths, storage keys, and systemd names may keep `image-sub2api-studio` until data is intentionally migrated.
- Do not add new Sub2API branches to `studio.jsx`; add account behavior in the gateway client or service layer.

## NewAPI

- Preferred provider id: `newapi-compatible`.
- Required routes: `/v1/models`, `/v1/images/generations`, `/v1/images/edits`.
- Video route: task-style `/v1/video/generations` when enabled.
- Common breakage: channel group has no image permission, `/v1/models` returns an empty list, or image requests are accidentally routed to `/v1/responses`.
- Required smoke test: `npm run smoke:newapi:route`.

## CPA Image-Style Consoles

- Preferred provider id: `openai-compatible` unless the gateway exposes a unique queue or model schema.
- Useful UI ideas: compact settings, request list, queue controls, explicit test/sync action.
- Implementation rule: copy the interaction pattern, not code, screenshots, or data.
- If CPA introduces a unique request shape, add it as a new provider adapter and smoke test.

## Codex2API / ChatGPT-to-API Gateways

- Preferred provider id: `openai-compatible` only when the gateway exposes stable `/v1/images/generations` and `/v1/images/edits`.
- Do not assume `/v1/responses` can generate images; keep it as explicit compatibility mode.
- Common breakage: account group does not enable image generation, upstream origin restrictions, or streaming-only responses without image payloads.
- If the gateway requires account binding, websocket binding, or nonstandard headers, isolate that in adapter/client code.

## Acceptance Rule

A gateway update is acceptable only when these remain true:

- normal text-to-image does not use `/v1/responses`;
- reference image and Mask flows use the edit route;
- manual API keys do not enter durable history, queue, or image metadata;
- the main UI does not gain provider-specific branches;
- `npm run check:boundaries` and `npm run check:providers` pass.
