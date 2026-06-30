# VPS 直接同步 Git 仓库部署

这份说明用于把 VPS 更新方式从“本地打包 zip 后上传”改成“服务器直接同步 Git 仓库”。目标是让 GitHub 成为唯一代码来源，VPS 每次从仓库拉取、构建、部署和自检。

## 标准新部署路径

新服务器建议使用统一的 Image Agent Studio 路径：

```text
/opt/image-agent-studio-repo/     # Git 仓库 checkout
/var/www/image-agent-studio/      # Nginx 读取的静态目录
/opt/image-agent-studio/          # Node 历史/会话服务运行目录
/var/lib/image-agent-studio/      # 历史、会话、队列、生成图片和受保护素材库
```

这个标准路径不依赖 Sub2API 或 NewAPI。它只是一个独立工作站，可以通过 `AI_GATEWAY_UPSTREAM`、`VITE_AI_*` 或浏览器里的 Provider 设置连接不同网关。

## 旧 VPS 兼容路径

已有线上环境可以继续保留旧路径：

```text
/var/www/ohlaoo-studio/
/opt/image-sub2api-studio/
/var/lib/image-sub2api-studio/
```

这些旧路径是为了避免历史图库、当前会话、队列任务、生成图片和受保护素材库在更名后“看起来消失”。保留旧路径时，需要在同步脚本里显式传入 `STATIC_DIR`、`SERVICE_DIR`、`DATA_DIR` 和 `SERVICE_NAME`。

## 第一次标准安装

```bash
sudo apt-get update
sudo apt-get install -y git nodejs npm

sudo git clone https://github.com/margetrp-hub/image-agent-studio.git \
  /opt/image-agent-studio-repo

sudo bash /opt/image-agent-studio-repo/deploy/install.sh
```

安装脚本会调用 `deploy/sync-from-git.sh`，并安装标准 systemd 服务：

```text
image-agent-studio-history
```

## 日常标准更新

```bash
cd /opt/image-agent-studio-repo
sudo bash deploy/upgrade.sh
```

`deploy/upgrade.sh` 默认会先备份 `/var/lib/image-agent-studio`，再同步代码、构建前端、更新服务、重启 systemd，并运行 `deploy/self-check.sh`。

如果你已经有外部快照，可以跳过脚本备份：

```bash
cd /opt/image-agent-studio-repo
sudo BACKUP_FIRST=0 bash deploy/upgrade.sh
```

## 旧 Oh Laoo VPS 更新

如果当前 Nginx 仍读取 `/var/www/ohlaoo-studio`，历史服务仍在 `/opt/image-sub2api-studio`，数据仍在 `/var/lib/image-sub2api-studio`，用下面命令保持兼容：

```bash
cd /opt/image-agent-studio-repo

sudo BRANCH=main \
  REPO_DIR=/opt/image-agent-studio-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  SERVICE_NAME=image-sub2api-studio-history \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

## 脚本会做什么

1. 从 GitHub 拉取指定分支。
2. 在 VPS 本地执行 `npm ci` 和 `/studio/` 子路径构建。
3. 覆盖静态目录里的 `studio.html` 和 `studio-assets/`。
4. 更新 Node 历史/会话服务脚本。
5. 写入 systemd runtime overrides，保留 `DATA_DIR`。
6. 重启历史/会话服务。
7. 校验静态文件、JS/CSS hash、服务健康检查、素材库数量和 Nginx 配置。

## 素材库检查

如果灵感广场或模板库为空，先检查受保护素材库：

```bash
DATA_DIR=/var/lib/image-agent-studio

for f in "$DATA_DIR/library/cases.json" \
  "$DATA_DIR/library/inspirations.json" \
  "$DATA_DIR/library/style-library.json"; do
  [ -f "$f" ] || continue
  echo "== $f =="
  sudo node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const [k,v] of Object.entries(j)) if (Array.isArray(v)) console.log(k, v.length);" "$f"
done

sudo find "$DATA_DIR/library/images" \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | wc -l
```

旧服务器请把 `DATA_DIR` 改为：

```bash
DATA_DIR=/var/lib/image-sub2api-studio
```

## 素材库恢复示例

```bash
OLD_PUBLIC=/home/margetrp/ohlaoo-home-overlay-v47-gallery-20260519-142434/public
DATA_DIR=/var/lib/image-agent-studio
NEW_LIBRARY="$DATA_DIR/library"

sudo install -d -o www-data -g www-data -m 750 "$NEW_LIBRARY"

sudo install -o www-data -g www-data -m 640 "$OLD_PUBLIC/cases.json" "$NEW_LIBRARY/cases.json"
sudo install -o www-data -g www-data -m 640 "$OLD_PUBLIC/inspirations.json" "$NEW_LIBRARY/inspirations.json"
sudo install -o www-data -g www-data -m 640 "$OLD_PUBLIC/style-library.json" "$NEW_LIBRARY/style-library.json"
sudo cp -a "$OLD_PUBLIC/images" "$NEW_LIBRARY/"

sudo chown -R www-data:www-data "$DATA_DIR"
sudo find "$DATA_DIR" -type d -exec chmod 750 {} \;
sudo find "$DATA_DIR" -type f -exec chmod 640 {} \;
sudo systemctl restart image-agent-studio-history
```

旧完整素材索引曾出现过的位置：

```text
/home/margetrp/ohlaoo-home-overlay-v47-gallery-20260519-142434/public
/home/margetrp/ohlaoo-studio-backup-20260518-202731
/var/www/ohlaoo-overlay
```

## 验证

标准服务：

```bash
systemctl is-active image-agent-studio-history
curl -s http://127.0.0.1:8787/studio-api/health
```

旧兼容服务：

```bash
systemctl is-active image-sub2api-studio-history
curl -s http://127.0.0.1:8787/studio-api/health
```

公网入口：

```bash
curl -I https://studio.example.com/studio/
curl -s https://studio.example.com/studio/ | grep 'studio-assets'
curl -I https://studio.example.com/studio-api/health
```

如果 JS/CSS 返回 `text/html`，说明 Nginx fallback 或静态路径错了，会导致白屏。先修静态目录和 `/studio/studio-assets/` alias。

## 原则

- GitHub 仓库是唯一代码来源。
- 构建产物在 VPS 本地生成。
- 静态目录可以覆盖，持久化目录不能覆盖。
- 新部署优先用 `/var/lib/image-agent-studio`。
- 旧部署可以继续用 `/var/lib/image-sub2api-studio`，但必须显式传入路径。
- 每次更新必须看脚本最后的校验结果，不能只看页面能不能打开。
