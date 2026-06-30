#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/image-agent-studio-repo}"
BACKUP_FIRST="${BACKUP_FIRST:-1}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo because upgrade writes /opt, /var/www, /var/lib, and systemd." >&2
  exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  echo "ERROR: repository not found at $REPO_DIR. Run deploy/install.sh first or set REPO_DIR." >&2
  exit 1
fi

if [ "$BACKUP_FIRST" = "1" ]; then
  bash "$REPO_DIR/deploy/backup.sh"
fi

bash "$REPO_DIR/deploy/sync-from-git.sh"
bash "$REPO_DIR/deploy/self-check.sh"
