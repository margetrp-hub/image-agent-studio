# Provider and Gateway Notes

Image Agent Studio is moving toward a provider-neutral image workstation. The current runtime still uses OpenAI-compatible HTTP routes directly, while `src/studio/providers/registry.js` records the provider shapes the project is preparing to support.

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

Use this for NewAPI-style deployments or similar gateways that expose OpenAI-compatible routes and may also expose model metadata.

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
- `newapi-compatible`: NewAPI-style endpoint, currently represented as a capability family for future adapter work.

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
