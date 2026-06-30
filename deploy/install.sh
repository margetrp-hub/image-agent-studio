#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/margetrp-hub/image-agent-studio.git}"
BRANCH="${BRANCH:-main}"
REPO_DIR="${REPO_DIR:-/opt/image-agent-studio-repo}"
STATIC_DIR="${STATIC_DIR:-/var/www/image-agent-studio}"
SERVICE_DIR="${SERVICE_DIR:-/opt/image-agent-studio}"
DATA_DIR="${DATA_DIR:-/var/lib/image-agent-studio}"
SERVICE_NAME="${SERVICE_NAME:-image-agent-studio-history}"
STUDIO_AUTH_MODE="${STUDIO_AUTH_MODE:-local}"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run with sudo because install writes /opt, /var/www, /var/lib, and systemd." >&2
  exit 1
fi

if [ ! -d "$REPO_DIR/.git" ]; then
  mkdir -p "$(dirname "$REPO_DIR")"
  git clone --branch "$BRANCH" "$REPO_URL" "$REPO_DIR"
fi

BRANCH="$BRANCH" \
REPO_URL="$REPO_URL" \
REPO_DIR="$REPO_DIR" \
STATIC_DIR="$STATIC_DIR" \
SERVICE_DIR="$SERVICE_DIR" \
DATA_DIR="$DATA_DIR" \
SERVICE_NAME="$SERVICE_NAME" \
STUDIO_AUTH_MODE="$STUDIO_AUTH_MODE" \
INSTALL_SYSTEMD_UNIT=1 \
bash "$REPO_DIR/deploy/sync-from-git.sh"
