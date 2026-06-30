# Provider and Gateway Notes

Image Agent Studio is moving toward a provider-neutral image workstation. The current runtime still uses OpenAI-compatible HTTP routes directly, while `src/studio/providers/registry.js` records the provider shapes the project is preparing to support.

Adapter-level notes now live under [`docs/adapters/`](./adapters/README.md):

- [OpenAI-compatible adapter](./adapters/openai-compatible.md)
- [NewAPI-compatible adapter](./adapters/newapi.md)
- [Sub2API-compatible adapter](./adapters/sub2api.md)

## Current Runtime Contract

Text-to-image:

```text
POST /v1/images/generations
```

Reference image and mask editing:

```text
POST /v1/images/edits
```

Prompt assistant:

```text
POST /v1/chat/completions
```

`/v1/responses` is not the default image generation route in this release. It should only be enabled for explicit compatibility testing when an upstream gateway really supports image generation through that route.

You can verify the provider dispatch contract locally:

```bash
npm run check:providers
```

The check fails if automatic text-to-image generation routes to `/v1/responses` instead of `/v1/images/generations`, or if reference/mask editing stops using `/v1/images/edits`.

## Provider Families

`openai-compatible`

Use this for official or custom endpoints that expose standard image generation and image edit routes. This mode normally uses a manually entered API key and base URL.

`newapi-compatible`

Use this for NewAPI Playground, NewAPI-style deployments, or similar gateways that expose OpenAI-compatible `/v1` routes. The UI syncs model metadata through `/v1/models` when a base URL and API key are configured.

## NewAPI Standalone Setup

NewAPI should be treated as its own provider family in the studio, not just as a generic custom URL. It still uses OpenAI-compatible HTTP routes, so the runtime path stays simple:

```text
GET  /v1/models
POST /v1/images/generations
POST /v1/images/edits
POST /v1/chat/completions
```

In the browser settings panel:

1. Choose `NewAPI Playground Gateway`.
2. Fill the NewAPI public endpoint, for example `https://newapi.example.com/v1`.
   A root domain such as `https://newapi.example.com` also works because the client normalizes it to `/v1`.
3. Fill the API key. The raw key is kept in `sessionStorage` only for the current browser session.
4. Wait for model sync. A healthy NewAPI connection should return model metadata from `/v1/models`.
5. Use `gpt-image-2`, `nano-banana`, or any image model id that your NewAPI channel actually exposes.

For a production VPS, prefer same-origin proxying so the front end can call your studio domain while Nginx forwards `/v1/*` to NewAPI:

```env
VITE_AI_GATEWAY_BASE_URL=https://studio.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://studio.example.com
VITE_AI_IMAGE_ROUTE=auto
AI_GATEWAY_UPSTREAM=https://newapi.example.com
```

With that shape, the browser calls `https://studio.example.com/v1/models` and `https://studio.example.com/v1/images/generations`; Nginx forwards those requests to the NewAPI upstream. The API key still belongs to the selected NewAPI channel/account. If NewAPI returns `403` or an empty model list, check the NewAPI token group, channel permission, model mapping, and whether image generation is enabled for that group.

For quick local route verification without paid generation:

```bash
npm run smoke:newapi:route
```

That smoke test verifies that the NewAPI provider syncs `/v1/models`, submits text-to-image through `/v1/images/generations`, preserves the provider id in the server job payload, and does not leak the manual API key into durable browser storage.

`gateway-account`

Use this when the workbench is attached to an existing account system. The browser can use gateway login state, account keys, and optional profile/key APIs, while the workbench owns the creation UI, queue display, canvas state, and persistence service.

## Runtime Settings

The browser-side provider settings now carry two separate fields:

```json
{
  "apiKeySource": "gateway",
  "providerId": "gateway-account"
}
```

`apiKeySource` answers where credentials come from:

- `gateway`: use the logged-in gateway account and selected account key.
- `manual`: use a manually entered API key and base URL.

Manual provider API keys are session-only secrets. The app keeps the raw key in browser `sessionStorage` for the current browser session and persists only non-secret provider configuration, such as provider family and base URL, in `localStorage`. Older browser settings that already contain `manualApiKey` are migrated out of persistent storage on load.

`providerId` answers which provider family should describe capability and routing:

- `gateway-account`: account-backed OpenAI-compatible gateway.
- `openai-compatible`: manual OpenAI-compatible endpoint.
- `newapi-compatible`: NewAPI Playground or NewAPI-style endpoint with OpenAI-compatible image, edit, chat, response, and model-sync routes.

Older browser settings that stored `apiKeySource: "sub2api"` are normalized to `apiKeySource: "gateway"` when loaded. This keeps existing users working while moving the new code path away from single-gateway naming.

## Capability Metadata

`src/studio/providers/registry.js` stores capability metadata that the UI can consume:

- Supported generation routes.
- Auth mode.
- Text-to-image, edit, reference image, and mask support.
- Model-sync and account-key availability.
- Default image and assistant model hints.
- Size, quality, output-format, and count ranges.

The current release dispatches through `src/aiGatewayClient.js`, an OpenAI-compatible gateway client. The registry is the first step toward separating provider capability, parameter validation, and request dispatch.

`src/studio/providers/adapters.js` now provides the first runtime adapter boundary. Today it still builds OpenAI-compatible request plans, but the client consumes those plans instead of deciding routes directly. This keeps the current behavior stable while leaving a clear place for future provider-specific transforms.

## Compatibility Names

Older names such as `SUB2API_*`, `VITE_SUB2API_*`, `sub2apiClient.js`, and `image-sub2api-studio-*` file names may still appear. `src/sub2apiClient.js` is now only a compatibility re-export for older imports. These names are kept so existing VPS deployments, localStorage records, systemd services, and history directories can upgrade without data loss.

New deployments should prefer:

```env
VITE_AI_GATEWAY_BASE_URL=
VITE_AI_GATEWAY_MODEL_BASE_URL=
VITE_AI_IMAGE_ROUTE=auto
VITE_AI_RESPONSES_MODEL=
VITE_AI_GATEWAY_LOGIN_URL=/login
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
AI_GATEWAY_BASE_URL=https://gateway.example.com
```

## Future Adapter Direction

The next provider layer should stay small:

- Normalize request parameters before dispatch.
- Keep provider-specific route transforms inside adapters.
- Never persist API keys in browser `localStorage`, `records.json`, `session.json`, `jobs.json`, or generated asset metadata.
- Keep `/v1/images/generations` and `/v1/images/edits` as the default image paths for compatible gateways.
- Add non-compatible providers only when their route, upload, queue, or pricing behavior genuinely differs.
