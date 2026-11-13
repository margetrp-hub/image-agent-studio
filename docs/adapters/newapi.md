# NewAPI-Compatible Adapter

NewAPI-compatible deployments should be treated as their own provider family. `/v1/models` can contain models backed by several incompatible invocation protocols, so discovery never selects a route by itself.

## Expected Routes

```text
GET  /v1/models
POST /v1/images/generations
POST /v1/images/edits
POST /v1/chat/completions
POST /v1/videos
GET  /v1/videos/{id}
POST /v1/video/generations
GET  /v1/video/generations/{id}
```

## Setup

1. Choose the NewAPI-compatible provider in the settings panel.
2. Fill the public endpoint, for example `https://newapi.example.com/v1`.
3. Fill an API key that belongs to a group with image-generation permission.
4. Wait for model sync from `/v1/models`.
5. Choose a model whose invocation status is `verified` for Image or Video mode.

## Protocol Mapping

- GPT Image, Seedream, and JiMeng image models use `/v1/images/generations`.
- Nano Banana and Gemini image models use multimodal `/v1/chat/completions`; reference images are message content, not `/v1/images/edits` uploads.
- Sora uses multipart `/v1/videos`, then `/v1/videos/{id}` and `/content`.
- Veo, JiMeng video, and other verified task families use `/v1/video/generations`, then poll `/v1/video/generations/{id}`.
- Unknown combinations return `MODEL_INVOCATION_NOT_VERIFIED` before a billable upstream request is sent.

## Common Failures

- `403 Image generation is not enabled for this group`: enable image-generation permission for the token group or use another token.
- Empty model list: check channel permission, model mapping, upstream health, and whether the public endpoint really exposes `/v1/models`.
- A discovered model is not selectable: add or correct its server-side invocation adapter and protocol contract; do not force it through a generic endpoint.
- Requests reaching `/v1/responses` during normal text-to-image: verify provider dispatch with `npm run check:providers` and `npm run check:provider-protocols`.
## Gateway account and API key entry

The default Docker runtime has no Studio account/admin system. Set `AI_GATEWAY_BASE_URL` to the New API site root, `STUDIO_GATEWAY_TYPE=newapi`, and keep `STUDIO_GATEWAY_AUTH=api-key`. The connection page validates an inference key through `/v1/models`, then scopes Studio history to that key. The gateway owns quota and charging.

For account-scoped history, set `STUDIO_GATEWAY_AUTH=account`. Users supply an account access token and their New API user ID; the service verifies `/api/user/self` with `New-Api-User`, lists `/api/token/`, and reads the selected key using `POST /api/token/:id/key`. Masked list keys are never sent as model credentials. No gateway key is automatically created. Access-token policies vary by gateway version; missing permissions are shown as connection errors. Use API-key entry when the account token cannot read inference keys.

Upstream contract references: [New API routes](https://github.com/QuantumNous/new-api/blob/main/router/api-router.go), [token controller](https://github.com/QuantumNous/new-api/blob/main/controller/token.go). The connector tests both families against isolated HTTP fixtures; live gateway credentials and paid requests are outside that verification.
