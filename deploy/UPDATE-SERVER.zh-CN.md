# 服务器更新说明

长期部署优先使用 Git 同步：

```text
docs/VPS-GIT-SYNC.zh-CN.md
deploy/sync-from-git.sh
deploy/install.sh
deploy/upgrade.sh
```

zip 包只保留给无法直接从 GitHub 拉取代码的临时场景。

## 标准 Git 更新

新部署：

```bash
cd /opt/image-agent-studio-repo
sudo bash deploy/upgrade.sh
```

旧 Oh Laoo VPS 保留现有路径：

```bash
cd /opt/image-agent-studio-repo

sudo BRANCH=main \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  SERVICE_NAME=image-sub2api-studio-history \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

## 不要覆盖持久化数据

日常更新只覆盖前端构建产物和服务脚本。不要删除或覆盖：

```text
/var/lib/image-agent-studio/
/var/lib/image-agent-studio/library/
```

旧部署可能是：

```text
/var/lib/image-sub2api-studio/
/var/lib/image-sub2api-studio/library/
```

这些目录保存历史图库、当前会话、队列任务、生成图片和受保护素材库。

## 当前链路约定

```text
普通生图          -> POST /v1/images/generations
参考图 / Mask     -> POST /v1/images/edits
提示词助手        -> POST /v1/chat/completions
/v1/responses     -> 只用于显式兼容测试
```

在网关后台看到文生图入站和上游都是 `/v1/images/generations`，才说明走的是正式图片模型链路。

## 构建 zip 包

```bash
npm run package:release
```

脚本会生成：

- `image-agent-studio-core-update-*.zip`：静态前端文件。
- `image-agent-studio-service-update-*.zip`：服务脚本和部署文档。

## zip 更新静态目录

标准静态目录：

```bash
sudo mkdir -p /var/www/image-agent-studio
sudo unzip -o /home/user/image-agent-studio-core-update-YYYYMMDD-HHMMSS.zip -d /var/www/image-agent-studio

sudo find /var/www/image-agent-studio -type d -exec chmod 755 {} \;
sudo find /var/www/image-agent-studio -type f -exec chmod 644 {} \;
```

旧 Oh Laoo VPS 静态目录：

```bash
sudo mkdir -p /var/www/ohlaoo-studio
sudo unzip -o /home/user/image-agent-studio-core-update-YYYYMMDD-HHMMSS.zip -d /var/www/ohlaoo-studio
```

静态目录必须和 Nginx `alias` 一致。

## zip 更新服务目录

标准服务目录：

```bash
sudo mkdir -p /opt/image-agent-studio
sudo unzip -o /home/user/image-agent-studio-service-update-YYYYMMDD-HHMMSS.zip -d /opt/image-agent-studio

cd /opt/image-agent-studio
sudo npm ci --omit=dev
sudo systemctl restart image-agent-studio-history
curl -s http://127.0.0.1:8787/studio-api/health
```

如果 systemd 服务不存在：

```bash
sudo cp /opt/image-agent-studio/deploy/image-agent-studio-history.service \
  /etc/systemd/system/image-agent-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-agent-studio-history
```

旧服务目录：

```bash
sudo mkdir -p /opt/image-sub2api-studio
sudo unzip -o /home/user/image-agent-studio-service-update-YYYYMMDD-HHMMSS.zip -d /opt/image-sub2api-studio

cd /opt/image-sub2api-studio
sudo npm ci --omit=dev
sudo systemctl restart image-sub2api-studio-history
```

## 验证

先看线上入口实际引用的 JS/CSS hash：

```bash
curl -s https://studio.example.com/studio/ | grep 'studio-assets'
```

再检查资源不是 HTML fallback：

```bash
curl -I https://studio.example.com/studio/
curl -I https://studio.example.com/studio/studio-assets/<actual-js-file>.js
curl -I https://studio.example.com/studio/studio-assets/<actual-css-file>.css
curl -I https://studio.example.com/studio-api/health
```

正确结果：

- Studio 入口返回 `text/html`。
- JS 返回 `application/javascript`。
- CSS 返回 `text/css`。
- `/studio-api/health` 返回 JSON。

如果 JS/CSS 返回 `text/html` 或 404，说明静态目录、base path 或 Nginx alias 错了。

## 素材库检查

```bash
DATA_DIR=/var/lib/image-agent-studio

for f in "$DATA_DIR/library/cases.json" \
  "$DATA_DIR/library/inspirations.json" \
  "$DATA_DIR/library/style-library.json"; do
  [ -f "$f" ] || continue
  echo "== $f =="
  sudo node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const [k,v] of Object.entries(j)) if (Array.isArray(v)) console.log(k, v.length);" "$f"
done

sudo find "$DATA_DIR/library/image-library" \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | wc -l
```

旧部署把 `DATA_DIR` 改成 `/var/lib/image-sub2api-studio`。

生产环境要保护素材和提示词，应让服务端读取 `STUDIO_LIBRARY_DIR`，前端通过 `/studio-api/library` 登录后访问，并用 Nginx 屏蔽公开的 `/studio/cases.json`、`/studio/inspirations.json` 和 `/studio/images/`。
