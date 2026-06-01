#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/margetrp-hub/image-sub2api-studio.git}"
BRANCH="${BRANCH:-main}"
REPO_DIR="${REPO_DIR:-/opt/image-sub2api-studio-repo}"
SERVICE_DIR="${SERVICE_DIR:-/opt/image-sub2api-studio}"
STATIC_DIR="${STATIC_DIR:-/var/www/ohlaoo-studio}"
DATA_DIR="${DATA_DIR:-/var/lib/image-sub2api-studio}"
BASE_PATH="${BASE_PATH:-/studio/}"
SERVICE_NAME="${SERVICE_NAME:-image-sub2api-studio-history}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/studio-api/health}"
PUBLIC_STUDIO_URL="${PUBLIC_STUDIO_URL:-}"
REQUIRE_LIBRARY="${REQUIRE_LIBRARY:-0}"
INSTALL_SYSTEMD_UNIT="${INSTALL_SYSTEMD_UNIT:-0}"
RUN_NGINX_TEST="${RUN_NGINX_TEST:-1}"

die() {
  echo "ERROR: $*" >&2
  exit 1
}

info() {
  echo "== $* =="
}

require_root() {
  if [ "$(id -u)" -ne 0 ]; then
    die "Run this script with sudo, because it writes /var/www, /opt, and /var/lib."
  fi
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

safe_dir() {
  local value="$1"
  local label="$2"
  [ -n "$value" ] || die "$label is empty"
  [ "$value" != "/" ] || die "$label cannot be /"
}

read_env_file() {
  local file="$1"
  if [ -f "$file" ]; then
    info "Loading build env: $file"
    set -a
    # shellcheck disable=SC1090
    . "$file"
    set +a
  fi
}

count_json_arrays() {
  node - "$DATA_DIR" "$REQUIRE_LIBRARY" <<'NODE'
const fs = require('fs');
const path = require('path');

const dataDir = process.argv[2];
const requireLibrary = process.argv[3] === '1';
const libraryDir = path.join(dataDir, 'library');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function countArray(file, key) {
  const json = readJson(file);
  return Array.isArray(json?.[key]) ? json[key].length : 0;
}

const cases = countArray(path.join(libraryDir, 'cases.json'), 'cases');
const inspirations = countArray(path.join(libraryDir, 'inspirations.json'), 'cases');
const templates = countArray(path.join(libraryDir, 'style-library.json'), 'templates');

let images = 0;
const imageRoot = path.join(libraryDir, 'images');
function walk(dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(png|jpe?g|webp)$/i.test(entry.name)) images += 1;
  }
}
walk(imageRoot);

console.log(`library cases: ${cases}`);
console.log(`library inspirations: ${inspirations}`);
console.log(`library templates: ${templates}`);
console.log(`library images: ${images}`);

if (requireLibrary && (cases === 0 || inspirations === 0 || images === 0)) {
  console.error('Protected library is required but incomplete. Check STUDIO_LIBRARY_DIR and old library migration.');
  process.exit(1);
}
NODE
}

require_root
require_cmd git
require_cmd npm
require_cmd node
require_cmd systemctl
require_cmd curl

safe_dir "$REPO_DIR" REPO_DIR
safe_dir "$SERVICE_DIR" SERVICE_DIR
safe_dir "$STATIC_DIR" STATIC_DIR
safe_dir "$DATA_DIR" DATA_DIR

info "Sync repository"
mkdir -p "$(dirname "$REPO_DIR")"
if [ -d "$REPO_DIR/.git" ]; then
  git config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true
  git -C "$REPO_DIR" fetch --prune origin "$BRANCH"
  git -C "$REPO_DIR" checkout "$BRANCH"
  git -C "$REPO_DIR" reset --hard "origin/$BRANCH"
else
  git clone --branch "$BRANCH" --depth 1 "$REPO_URL" "$REPO_DIR"
fi

REVISION="$(git -C "$REPO_DIR" rev-parse --short HEAD)"
echo "revision: $REVISION"

info "Install and build frontend"
cd "$REPO_DIR"
read_env_file "$REPO_DIR/.env.production"
read_env_file "$REPO_DIR/.env.production.local"
npm ci
STUDIO_BASE_PATH="$BASE_PATH" npm run build

info "Deploy static files"
mkdir -p "$STATIC_DIR"
rm -rf "$STATIC_DIR/studio-assets"
cp -a "$REPO_DIR/dist/." "$STATIC_DIR/"
chown -R www-data:www-data "$STATIC_DIR"
find "$STATIC_DIR" -type d -exec chmod 755 {} \;
find "$STATIC_DIR" -type f -exec chmod 644 {} \;

info "Deploy history/session service"
mkdir -p "$SERVICE_DIR/scripts" "$SERVICE_DIR/deploy"
cp -a "$REPO_DIR/package.json" "$REPO_DIR/package-lock.json" "$SERVICE_DIR/"
cp -a "$REPO_DIR/scripts/image-sub2api-studio-history-service.mjs" "$SERVICE_DIR/scripts/"
cp -a "$REPO_DIR/deploy/image-sub2api-studio-history.service" "$SERVICE_DIR/deploy/"
cp -a "$REPO_DIR/deploy/nginx-sub2api-studio.conf" "$SERVICE_DIR/deploy/"
cp -a "$REPO_DIR/deploy/UPDATE-SERVER.zh-CN.md" "$SERVICE_DIR/deploy/"

cd "$SERVICE_DIR"
npm ci --omit=dev

mkdir -p "$DATA_DIR/library"
chown -R www-data:www-data "$DATA_DIR"
find "$DATA_DIR" -type d -exec chmod 750 {} \;
find "$DATA_DIR" -type f -exec chmod 640 {} \;

if [ "$INSTALL_SYSTEMD_UNIT" = "1" ] || [ ! -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
  info "Install systemd unit"
  cp "$SERVICE_DIR/deploy/image-sub2api-studio-history.service" "/etc/systemd/system/${SERVICE_NAME}.service"
fi

systemctl daemon-reload
systemctl enable --now "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

info "Verify local files"
test -f "$STATIC_DIR/studio.html" || die "Missing $STATIC_DIR/studio.html"
ASSET_JS="$(grep -oE 'studio-assets/[^"]+\.js' "$STATIC_DIR/studio.html" | head -n 1 || true)"
ASSET_CSS="$(grep -oE 'studio-assets/[^"]+\.css' "$STATIC_DIR/studio.html" | head -n 1 || true)"
[ -n "$ASSET_JS" ] || die "Could not find JS asset in studio.html"
[ -f "$STATIC_DIR/$ASSET_JS" ] || die "Missing JS asset: $STATIC_DIR/$ASSET_JS"
if [ -n "$ASSET_CSS" ]; then
  [ -f "$STATIC_DIR/$ASSET_CSS" ] || die "Missing CSS asset: $STATIC_DIR/$ASSET_CSS"
fi
echo "js: $ASSET_JS"
echo "css: ${ASSET_CSS:-none}"

info "Verify service"
systemctl is-active --quiet "$SERVICE_NAME" || die "$SERVICE_NAME is not active"
curl -fsS "$HEALTH_URL" >/dev/null || die "Health check failed: $HEALTH_URL"
echo "health: ok"

info "Verify protected data"
count_json_arrays

if [ "$RUN_NGINX_TEST" = "1" ] && command -v nginx >/dev/null 2>&1; then
  info "Verify nginx config"
  nginx -t
fi

if [ -n "$PUBLIC_STUDIO_URL" ]; then
  info "Verify public URL"
  curl -fsSI "$PUBLIC_STUDIO_URL" >/dev/null || die "Public URL failed: $PUBLIC_STUDIO_URL"
  echo "public: $PUBLIC_STUDIO_URL"
fi

info "Done"
echo "deployed revision: $REVISION"
