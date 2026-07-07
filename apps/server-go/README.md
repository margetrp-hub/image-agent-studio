# Go Studio Server

`apps/server-go` is the gradual Go core for Image Agent Studio.

It does not replace the current Node history/session service yet. The first target is a stable server core for:

- first-party Studio users
- role-based admin access
- session tokens
- Studio-owned session and history persistence
- generation job state persistence without upstream dispatch
- backend provider links for shared NewAPI/Sub2API/OpenAI-compatible accounts
- server-side model sync for enabled provider links
- future generation queue, asset persistence, and provider dispatch

## Why Go Here

The web, desktop, Mini Program, Android, and Codex plugin lines stay separate. Go owns the long-running service concerns:

- account scope
- durable queue state
- cancellation and timeout control
- provider dispatch
- generated asset storage
- backup and restore
- health and operations endpoints

## Run

```bash
cd apps/server-go
go run ./cmd/studio-server
```

Default URL:

```text
http://127.0.0.1:8788/studio-api/health
```

## Bootstrap Admin

On a fresh data directory, create the first admin:

```bash
curl -X POST http://127.0.0.1:8788/studio-api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-Studio-Bootstrap-Token: $STUDIO_GO_ADMIN_BOOTSTRAP_TOKEN" \
  -d '{"email":"admin@example.com","password":"change-me-now","displayName":"Admin"}'
```

If `STUDIO_GO_ADMIN_BOOTSTRAP_TOKEN` is empty, bootstrap is allowed only while there are no users.

## Backend Provider Links

Admins can configure shared backend links without exposing upstream secrets to clients:

```json
{
  "id": "newapi-shared",
  "providerType": "newapi-compatible",
  "label": "Shared NewAPI",
  "enabled": true,
  "baseUrl": "https://newapi.example.com/v1",
  "modelBaseUrl": "https://newapi.example.com/v1",
  "accountMode": "shared-api-key",
  "secretEnv": "STUDIO_SHARED_NEWAPI_API_KEY",
  "sharedEmail": "ops@example.com",
  "allowedRoles": ["admin", "creator"]
}
```

The link stores an environment variable name, not the raw key. Later phases can add encrypted-at-rest secret storage if admin UI entry of raw keys is required.

After login, clients can list their enabled providers and sync model ids through Go without seeing the server secret:

```bash
curl http://127.0.0.1:8788/studio-api/providers \
  -H "Authorization: Bearer $STUDIO_TOKEN"

curl http://127.0.0.1:8788/studio-api/providers/newapi-shared/models \
  -H "Authorization: Bearer $STUDIO_TOKEN"
```

This model sync does not move image generation to Go yet; current production generation remains on the existing runtime until queue dispatch and asset saving are ready.

Go can also dry-run the request it would send for a stored generation job:

```bash
curl http://127.0.0.1:8788/studio-api/generation-jobs/job_123/dispatch-plan \
  -H "Authorization: Bearer $STUDIO_TOKEN"
```

The dispatch plan is deliberately sanitized. It includes the OpenAI-compatible endpoint and body, but not the provider API key, and it does not call the upstream provider.

For branch workflows, Go can build the next prompt from a parent job:

```bash
curl -X POST http://127.0.0.1:8788/studio-api/generation-jobs/job_123/continuation-plan \
  -H "Authorization: Bearer $STUDIO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"mode":"image","changePrompt":"keep the product, change the background to night"}'
```

The response returns the inherited root prompt, the parent prompt, the new change request, the composed `generationPrompt`, and `workflow.lineage` metadata to persist with the next job. The same contract is used for image and video branches.
