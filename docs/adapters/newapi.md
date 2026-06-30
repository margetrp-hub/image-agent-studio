# NewAPI-Compatible Adapter

NewAPI-compatible deployments should be treated as their own provider family, even though the runtime usually uses OpenAI-compatible `/v1` routes.

## Expected Routes

```text
GET  /v1/models
POST /v1/images/generations
POST /v1/images/edits
POST /v1/chat/completions
```

## Setup

1. Choose the NewAPI-compatible provider in the settings panel.
2. Fill the public endpoint, for example `https://newapi.example.com/v1`.
3. Fill an API key that belongs to a group with image-generation permission.
4. Wait for model sync from `/v1/models`.
5. Choose an image model exposed by that NewAPI channel, such as `gpt-image-2` or another configured model id.

## Common Failures

- `403 Image generation is not enabled for this group`: enable image-generation permission for the token group or use another token.
- Empty model list: check channel permission, model mapping, upstream health, and whether the public endpoint really exposes `/v1/models`.
- Requests reaching `/v1/responses` during normal text-to-image: set `VITE_AI_IMAGE_ROUTE=auto` and verify provider dispatch with `npm run check:providers`.
