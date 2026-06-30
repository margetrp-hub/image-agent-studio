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

If your production data is under `/var/lib/image-sub2api-studio`, keep that path until you intentionally migrate it:

```bash
DATA_DIR=/var/lib/image-sub2api-studio \
SERVICE_DIR=/opt/image-sub2api-studio \
SERVICE_NAME=image-sub2api-studio-history \
bash deploy/sync-from-git.sh
```

This prevents old history, queues, generated images, and protected library assets from appearing lost after the public rename.
