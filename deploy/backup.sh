#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="${DATA_DIR:-/var/lib/image-agent-studio}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/image-agent-studio}"
STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/image-agent-studio-data-$STAMP.tgz"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo so the backup can read protected Studio data." >&2
  exit 1
fi

if [ ! -d "$DATA_DIR" ]; then
  echo "ERROR: data directory not found: $DATA_DIR" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
tar -C "$DATA_DIR" -czf "$OUT" .
chmod 600 "$OUT"
echo "$OUT"
