#!/usr/bin/env bash
set -euo pipefail

ARCHIVE="${1:-}"
DATA_DIR="${DATA_DIR:-/var/lib/image-agent-studio}"
PRE_BACKUP="${PRE_BACKUP:-1}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo so restore can write protected Studio data." >&2
  exit 1
fi

if [ -z "$ARCHIVE" ] || [ ! -f "$ARCHIVE" ]; then
  echo "Usage: sudo DATA_DIR=/var/lib/image-agent-studio bash deploy/restore.sh /path/to/backup.tgz" >&2
  exit 1
fi

if [ "$PRE_BACKUP" = "1" ] && [ -d "$DATA_DIR" ]; then
  DATA_DIR="$DATA_DIR" bash "$(dirname "$0")/backup.sh"
fi

mkdir -p "$DATA_DIR"
tar -C "$DATA_DIR" -xzf "$ARCHIVE"
chown -R www-data:www-data "$DATA_DIR"
find "$DATA_DIR" -type d -exec chmod 750 {} \;
find "$DATA_DIR" -type f -exec chmod 640 {} \;
echo "restored: $ARCHIVE -> $DATA_DIR"
