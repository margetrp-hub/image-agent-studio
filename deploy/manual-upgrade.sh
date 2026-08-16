#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${MANUAL_UPGRADE_CONFIG:-/etc/image-agent-studio-manual-upgrade.env}"
if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  . "$CONFIG_FILE"
fi

REPO_URL="${REPO_URL:-https://github.com/margetrp-hub/image-agent-studio.git}"
REPO_DIR="${REPO_DIR:-/opt/image-agent-studio-repo}"
STATIC_DIR="${STATIC_DIR:-/var/www/image-agent-studio}"
SERVICE_DIR="${SERVICE_DIR:-/opt/image-agent-studio}"
DATA_DIR="${DATA_DIR:-/var/lib/image-agent-studio}"
SERVICE_NAME="${SERVICE_NAME:-image-agent-studio-history}"
BASE_PATH="${BASE_PATH:-/studio/}"
PUBLIC_STUDIO_URL="${PUBLIC_STUDIO_URL:-https://studio.ohlaoo.com/studio/}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8787/studio-api/health}"
RELEASE_API_URL="${RELEASE_API_URL:-https://api.github.com/repos/margetrp-hub/image-agent-studio/releases/latest}"
UPDATE_DIR="${UPDATE_DIR:-$DATA_DIR/manual-update}"
REQUEST_FILE="${REQUEST_FILE:-$UPDATE_DIR/request}"
STATUS_FILE="${STATUS_FILE:-$UPDATE_DIR/status.json}"
LOCK_FILE="${LOCK_FILE:-/run/lock/image-agent-studio-manual-upgrade.lock}"
UPGRADE_SCRIPT="${UPGRADE_SCRIPT:-$REPO_DIR/deploy/upgrade.sh}"
current_version=""
latest_tag=""

log() {
  printf '[image-agent-studio-manual-upgrade] %s\n' "$*"
  logger -t image-agent-studio-manual-upgrade -- "$*" 2>/dev/null || true
}

write_status() {
  local state="$1"
  local message="$2"
  local current="$3"
  local target="$4"
  local rolled_back="${5:-false}"
  local temporary="${STATUS_FILE}.tmp"
  mkdir -p "$UPDATE_DIR"
  node - "$state" "$message" "$current" "$target" "$rolled_back" > "$temporary" <<'NODE'
const [state, message, currentVersion, targetVersion, rolledBack] = process.argv.slice(2);
process.stdout.write(JSON.stringify({
  state,
  message,
  currentVersion,
  targetVersion,
  rolledBack: rolledBack === 'true',
  updatedAt: new Date().toISOString()
}, null, 2));
NODE
  chmod 644 "$temporary"
  mv -f "$temporary" "$STATUS_FILE"
}

die() {
  write_status failed "$*" "$current_version" "${latest_tag#v}" false || true
  log "ERROR: $*"
  exit 1
}

[ "$(id -u)" -eq 0 ] || die "更新服务必须以 root 运行。"
for command_name in curl git node flock; do
  command -v "$command_name" >/dev/null 2>&1 || die "缺少命令：$command_name"
done

mkdir -p "$UPDATE_DIR" "$(dirname "$LOCK_FILE")"
rm -f "$REQUEST_FILE"
exec 9>"$LOCK_FILE"
flock -n 9 || die "已有更新任务正在执行。"
[ -d "$REPO_DIR/.git" ] || die "找不到部署仓库：$REPO_DIR"

current_version="$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')).version)" "$REPO_DIR/package.json")"
current_ref="$(git -C "$REPO_DIR" rev-parse HEAD)"
write_status checking "正在检查 GitHub Release。" "$current_version" "" false

latest_tag="$(curl -fsSL --retry 2 --connect-timeout 10 --max-time 30 \
  -H 'Accept: application/vnd.github+json' \
  -H 'User-Agent: image-agent-studio-manual-upgrade' \
  "$RELEASE_API_URL" \
  | node -e "let text=''; process.stdin.on('data', (chunk) => text += chunk); process.stdin.on('end', () => { try { const payload = JSON.parse(text); process.stdout.write(String(payload.tag_name || '')); } catch { process.exit(1); } });")" || die "无法读取最新 GitHub Release。"

node -e "if (!/^v\\d+\\.\\d+\\.\\d+$/.test(process.argv[1])) process.exit(1)" "$latest_tag" \
  || die "最新 Release 不是稳定版本标签：$latest_tag"

if [ "$latest_tag" = "v$current_version" ]; then
  write_status current "当前已经是最新版本。" "$current_version" "${latest_tag#v}" false
  log "already current: $latest_tag"
  exit 0
fi

if ! node - "$current_version" "${latest_tag#v}" <<'NODE'
const parse = (value) => String(value).split('.').map(Number);
const current = parse(process.argv[2]);
const latest = parse(process.argv[3]);
for (let index = 0; index < 3; index += 1) {
  if (latest[index] > current[index]) process.exit(0);
  if (latest[index] < current[index]) process.exit(1);
}
process.exit(1);
NODE
then
  write_status current "GitHub Release 没有比当前部署更新的版本。" "$current_version" "${latest_tag#v}" false
  exit 0
fi

log "manual update requested: v$current_version -> $latest_tag"
git -C "$REPO_DIR" config --global --add safe.directory "$REPO_DIR" >/dev/null 2>&1 || true
git -C "$REPO_DIR" fetch --force origin "refs/tags/$latest_tag:refs/tags/$latest_tag" \
  || die "无法拉取版本 $latest_tag。"

target_commit="$(git -C "$REPO_DIR" rev-parse "$latest_tag^{commit}")"
target_version="$(git -C "$REPO_DIR" show "$target_commit:package.json" | node -e "let text=''; process.stdin.on('data', (chunk) => text += chunk); process.stdin.on('end', () => console.log(JSON.parse(text).version));")"
[ "v$target_version" = "$latest_tag" ] || die "Release 标签和 package 版本不一致。"

write_status upgrading "正在备份数据并部署 $latest_tag。" "$current_version" "$target_version" false
if BACKUP_FIRST=1 \
  INSTALL_MANUAL_UPGRADE=1 \
  DEPLOY_REF="refs/tags/$latest_tag" \
  REPO_URL="$REPO_URL" REPO_DIR="$REPO_DIR" STATIC_DIR="$STATIC_DIR" \
  SERVICE_DIR="$SERVICE_DIR" DATA_DIR="$DATA_DIR" SERVICE_NAME="$SERVICE_NAME" \
  BASE_PATH="$BASE_PATH" PUBLIC_STUDIO_URL="$PUBLIC_STUDIO_URL" \
  HEALTH_URL="$HEALTH_URL" bash "$UPGRADE_SCRIPT"; then
  write_status success "更新完成。" "$target_version" "$target_version" false
  log "upgrade succeeded: $latest_tag"
  exit 0
fi

log "upgrade failed; rolling back to $current_ref"
if BACKUP_FIRST=0 \
  INSTALL_MANUAL_UPGRADE=1 \
  DEPLOY_REF="$current_ref" \
  REPO_URL="$REPO_URL" REPO_DIR="$REPO_DIR" STATIC_DIR="$STATIC_DIR" \
  SERVICE_DIR="$SERVICE_DIR" DATA_DIR="$DATA_DIR" SERVICE_NAME="$SERVICE_NAME" \
  BASE_PATH="$BASE_PATH" PUBLIC_STUDIO_URL="$PUBLIC_STUDIO_URL" \
  HEALTH_URL="$HEALTH_URL" bash "$UPGRADE_SCRIPT"; then
  write_status rollback "更新失败，已回滚到原版本。" "$current_version" "$target_version" true
  log "rollback succeeded: $current_ref"
else
  write_status failed "更新和自动回滚都失败，请检查 systemd 日志。" "$current_version" "$target_version" false
  log "CRITICAL: rollback failed; inspect $SERVICE_NAME.service"
fi
exit 1
