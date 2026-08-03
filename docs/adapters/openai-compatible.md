# OpenAI-Compatible Adapter

Use this adapter for official OpenAI-style APIs or custom endpoints that expose standard `/v1` image, edit, chat, and model routes.

## Expected Routes

```text
GET  /v1/models
POST /v1/images/generations
POST /v1/images/edits
POST /v1/chat/completions
POST /v1/videos
GET  /v1/videos/{id}
GET  /v1/videos/{id}/content
```

## Recommended Browser Settings

```env
VITE_AI_GATEWAY_BASE_URL=https://studio.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://studio.example.com
VITE_AI_IMAGE_ROUTE=auto
```

In production, prefer same-origin proxying:

```env
AI_GATEWAY_UPSTREAM=https://api.example.com
```

The browser calls your Studio domain, and Nginx forwards `/v1/*` to the upstream provider.

## Notes

- Manual API keys are session-only browser secrets.
- Model sync should read from `/v1/models`.
- Sora creation uses multipart `/v1/videos`; reference images use the `input_reference` form field.
- Text-to-image should not call `/v1/responses` unless explicitly configured.
