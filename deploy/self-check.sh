#!/usr/bin/env bash
set -euo pipefail

PUBLIC_STUDIO_URL="${PUBLIC_STUDIO_URL:-http://127.0.0.1/studio/}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/studio-api/health}"

curl -fsSI "$PUBLIC_STUDIO_URL" >/dev/null
curl -fsS "$HEALTH_URL" >/dev/null

ASSET="$(curl -fsS "$PUBLIC_STUDIO_URL" | grep -oE 'studio-assets/[^"]+\.js' | head -n 1 || true)"
if [ -n "$ASSET" ]; then
  BASE="${PUBLIC_STUDIO_URL%/}"
  curl -fsSI "$BASE/$ASSET" | grep -qi 'content-type:.*javascript'
fi

echo "self-check: ok"
