# Sub2API-Compatible Adapter

Sub2API-compatible deployments are supported as an adapter, not as the project identity.

Older versions of this workstation were built around Sub2API naming, so compatibility variables and filenames still exist:

```text
VITE_SUB2API_*
SUB2API_*
src/sub2apiClient.js
scripts/image-sub2api-studio-history-service.mjs
deploy/image-sub2api-studio-history.service
```

They remain to protect existing VPS deployments, browser localStorage keys, systemd services, and persisted data paths.

Model discovery remains separate from invocation support. A Sub2API model is selectable only when its upstream model family maps to a verified Studio protocol; the adapter does not assume every discovered model accepts `/images/generations` or `/video/generations`.

## New Deployments

Prefer provider-neutral names:

```env
VITE_AI_GATEWAY_BASE_URL=
VITE_AI_GATEWAY_MODEL_BASE_URL=
VITE_AI_IMAGE_ROUTE=auto
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
AI_GATEWAY_BASE_URL=https://gateway.example.com
```

## Existing Deployments

### Direct authorized entry

A configured gateway menu can display the original Studio page immediately in a frame and authorize it without a second entry card. The frontend receives `ohlao_authorize=1`, `parent_origin`, and a fresh random `state`; no password, API key, or bearer token is included in the URL. It accepts an authorization message only from the exact parent window (or opener for a standalone window), origin and state, then uses the existing `POST /studio-api/auth/embedded` exchange. The server still validates the gateway identity and owns local session creation.

This requires `VITE_STUDIO_STANDALONE=true`, `STUDIO_AUTH_MODE=standalone`, the gateway origin in `STUDIO_EMBED_ORIGINS`, and the trusted gateway URL in `STUDIO_EMBED_GATEWAY_BASE_URL`. The deployed framing policy must permit that origin. Deploy the compatible gateway frontend and Studio frontend together; the original embedded exchange endpoint is unchanged.

An authorized entry clears the previous browser login before any clients or hydration effects run, while retaining history. Failed authorization returns to the original Studio login page and the gateway offers retry. Cancellation, timeout and page exit stop local waiting and abort an outstanding exchange; an already accepted server request may still finish. A new attempt reuses the server's existing identity mapping and does not create generation jobs, credit entries or rewards. Messages and listeners are discarded after completion; late replies cannot report success.

Local verification (2026-11-11): five receiver tests pass, including exact parent/origin/state checks and cancel/late-result behavior. The original workbench loads from the gateway menu and signs in through the isolated Sub2API service. Blocking `/studio-api/auth/embedded` displays the original login screen instead of the old account; unblocking and retrying returns to the signed-in workbench. These are local integration results, not production deployment or generation/billing acceptance.

If your production data is under `/var/lib/image-sub2api-studio`, keep that path until you intentionally migrate it:

```bash
DATA_DIR=/var/lib/image-sub2api-studio \
SERVICE_DIR=/opt/image-sub2api-studio \
SERVICE_NAME=image-sub2api-studio-history \
bash deploy/sync-from-git.sh
```

This prevents old history, queues, generated images, and protected library assets from appearing lost after the public rename.
