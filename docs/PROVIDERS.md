# Provider and Gateway Notes

Image Agent Studio is a provider-neutral creation workstation. The production-compatible root runtime submits jobs to the Node service, which resolves the upstream invocation protocol server-side. `src/studio/providers/registry.js` records UI capabilities and compatibility defaults; it is not authoritative for execution. Provider family names describe adapters, not product identities.

Adapter-level notes now live under [`docs/adapters/`](./adapters/README.md):

- [OpenAI-compatible adapter](./adapters/openai-compatible.md)
- [NewAPI-compatible adapter](./adapters/newapi.md)
- [Sub2API-compatible adapter](./adapters/sub2api.md)

## Current Runtime Contract

`GET /v1/models` is discovery only. A discovered model becomes selectable for a mode only when the server has a verified invocation adapter for that provider/model combination.

| Adapter | Typical models | Create endpoint | Transport |
| --- | --- | --- | --- |
| `openai-images` | GPT Image, DALL-E, Seedream, JiMeng image | `/v1/images/generations` | JSON |
| `openai-chat-images` | Nano Banana, Gemini image through NewAPI | `/v1/chat/completions` | multimodal JSON |
| `xai-images` | Grok Imagine Image | `/v1/images/generations` | xAI image JSON |
| `openai-videos` | Sora | `/v1/videos` | multipart form |
| `xai-videos` | Grok Imagine Video | `/v1/videos/generations` | JSON plus polling |
| `newapi-task-video` | Veo, JiMeng video, Kling and verified task families | `/v1/video/generations` | JSON plus polling |

Reference inputs follow the selected model protocol. OpenAI Images-compatible edit models use multipart `/v1/images/edits`; Nano Banana/Gemini references are embedded in a multimodal Chat Completions message; Sora uses multipart `input_reference`. Unsupported edit/model combinations are rejected before queueing.

Prompt assistant requests remain separate and use `/v1/chat/completions`.

`/v1/responses` is not the default image generation route in this release. It should only be enabled for explicit compatibility testing when an upstream gateway really supports image generation through that route.

You can verify the provider dispatch contract locally:

```bash
npm run check:providers
npm run check:provider-protocols
npm run smoke:provider-protocols
```

The protocol checks fail when a verified family uses the wrong endpoint, transport, request shape, polling route, or response parser. Unknown model/provider combinations remain visible as discovered metadata but return `MODEL_INVOCATION_NOT_VERIFIED` if submitted.

## Go Provider Ownership

The Go core has two server-side provider records. They are intentionally separate:

- **Shared admin provider links** are deployment-managed connections. Admins store endpoint metadata, allowed Studio roles, and the name of a server environment variable containing the credential. Authenticated users see only enabled links allowed for their role.
- **Personal provider connections** belong to one Studio user. API keys or access tokens are stored as AES-256-GCM envelopes bound to that user and connection ID. Public responses return only configuration and credential-present flags.

Both paths support server-side `/models` synchronization without returning the raw credential to the browser. The Go generation-job `dispatch-plan` can use an allowed shared link or the current user's enabled personal connection. It remains a dry-run endpoint. The separate `POST .../execute` route can send that plan only when `STUDIO_GO_EXECUTION_ENABLED=true`.

Personal model sync and execution block localhost and private-network targets by default, including names that resolve to private, loopback, link-local, multicast-link-local, or unspecified addresses. `STUDIO_ALLOW_PRIVATE_PROVIDER_URLS=true` is an explicit operator override for controlled private Provider endpoints.

This Go boundary does not replace the browser-direct and Node compatibility behavior described below. Production generation remains on the compatibility runtime until the Go queue worker, dispatch, result saving, migration, and rollback checks are complete.

## Provider Families

The Go migration core has two server-side ownership models in addition to the established browser-compatible path:

- shared admin Provider Links refer to server environment secrets and are filtered by Studio role;
- per-user Provider Connections encrypt API keys or access tokens with `STUDIO_MASTER_KEY` and support server-side model synchronization, sanitized dispatch planning, and opt-in image execution.

The Go `dispatch-plan` can use either ownership model and never calls an upstream. The separate opt-in executor can use either model for OpenAI-compatible image generation, while production queue execution remains on the compatibility runtime. See [`architecture-v1.md`](./architecture-v1.md) for the canonical status.

`openai-compatible`

Use this for official or custom endpoints that expose standard image generation and image edit routes. This mode normally uses a manually entered API key and base URL.

`newapi-compatible`

Use this for NewAPI Playground, NewAPI-style deployments, or similar gateways that expose OpenAI-compatible `/v1` routes. The UI syncs model metadata through `/v1/models` when a base URL and API key are configured.

## NewAPI Standalone Setup

NewAPI should be treated as its own provider family in the studio, not just as a generic custom URL. Different NewAPI channels can expose different downstream protocols through one model list:

```text
GET  /v1/models
POST /v1/images/generations
POST /v1/images/edits
POST /v1/chat/completions
POST /v1/videos
POST /v1/video/generations
```

In the browser settings panel:

1. Choose `NewAPI Playground Gateway`.
2. Fill the NewAPI public endpoint, for example `https://newapi.example.com/v1`.
   A root domain such as `https://newapi.example.com` also works because the client normalizes it to `/v1`.
3. Fill the API key. The raw key is kept in `sessionStorage` only for the current browser session.
4. Wait for model sync. A healthy NewAPI connection should return model metadata from `/v1/models`.
5. Select a model whose Image or Video invocation status is verified. Merely appearing in `/v1/models` is not enough.

For a production VPS, prefer same-origin proxying so the front end can call your studio domain while Nginx forwards `/v1/*` to NewAPI:

```env
VITE_AI_GATEWAY_BASE_URL=https://studio.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://studio.example.com
VITE_AI_IMAGE_ROUTE=auto
AI_GATEWAY_UPSTREAM=https://newapi.example.com
```

With that shape, the Studio service performs model discovery and provider calls without exposing the server-managed credential to the browser. If NewAPI returns `403` or an empty model list, check the token group, channel permission, model mapping, and whether the required image/video endpoint is enabled for that group.

For quick local route verification without paid generation:

```bash
npm run smoke:newapi:route
```

That browser smoke verifies the compatibility UI path. `npm run smoke:provider-protocols` additionally starts the production Node service and proves Nano Banana, JiMeng image, Sora, and Veo requests reach their distinct server-side endpoints and complete through their matching response paths.

`xai-compatible`

Use this for a Grok Imagine-compatible endpoint such as
`https://provider.example/v1`. The tested contract is intentionally separate
from the generic task-style video adapter:

```text
GET  /v1/models
POST /v1/images/generations
POST /v1/videos/generations
GET  /v1/videos/{request_id}
GET  /v1/videos/{request_id}/content
```

Image requests send `model`, `prompt`, `n: 1`, and
`response_format: b64_json` so standalone history does not depend on a
temporary provider CDN URL. Video creation sends `model`, `prompt`, and
`duration`; the response may use `request_id`,
`status: done`, and `video.url`. The client polls the request endpoint and
downloads protected content before exposing it to the browser. Set
`STUDIO_PROVIDER_TYPE=xai-compatible` for server-managed standalone jobs.
See the [xAI adapter profile](./adapters/xai-compatible.md) for the full
request/response boundary.

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
