# Provider Adapters

Image Agent Studio is provider-neutral. The workstation owns the creative workflow, while adapters describe how a provider exposes models, credentials, request routes, and response formats.

The current runtime is intentionally conservative:

- Text-to-image: `POST /v1/images/generations`
- Image edit and Mask: `POST /v1/images/edits`
- Prompt helper: `POST /v1/chat/completions`
- Model sync: `GET /v1/models`

Adapters should normalize provider-specific behavior into that small contract whenever possible. If a provider needs a different upload shape, queue API, video job API, or pricing metadata, add that logic inside the adapter layer instead of leaking provider-specific code into the main workstation UI.

Two adjacent boundaries protect the adapter layer:

- `src/studio/generation/executor.js` owns route labels and queued generation-job payloads.
- `scripts/studio-service/config.js` owns server-side environment aliases and deployment defaults.

## Current Adapter Families

- [Upstream isolation rules](./upstream-isolation.md)
- [Compatibility profiles](./compatibility-profiles.md)
- [OpenAI-compatible](./openai-compatible.md)
- [NewAPI-compatible](./newapi.md)
- [Sub2API-compatible](./sub2api.md)

## Rules

- Do not persist raw API keys in `localStorage`, `records.json`, `session.json`, `jobs.json`, or generated asset metadata.
- Prefer same-origin deployment so the browser calls the Studio domain and Nginx forwards requests to the provider.
- Keep `/v1/images/generations` and `/v1/images/edits` as the default image paths for compatible providers.
- Treat `/v1/responses` image generation as an explicit compatibility mode only.
- Keep provider-specific model names, route transforms, headers, and retry semantics inside adapters.
