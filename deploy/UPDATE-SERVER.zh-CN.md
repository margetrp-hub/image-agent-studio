# 旧 zip 包更新说明

这份文档只保留给无法直接从 GitHub 拉取代码的临时场景。长期 VPS 部署请优先使用：

```text
docs/VPS-GIT-SYNC.zh-CN.md
deploy/sync-from-git.sh
```

Git 同步方式会在服务器本地构建、覆盖正确的 Nginx 静态目录、更新历史/会话服务，并保留 `/var/lib/image-sub2api-studio` 持久化数据目录。

## 不要重复上传图床和历史数据

日常更新只需要覆盖前端构建产物和服务脚本。不要删除或覆盖这些目录：

```text
/var/lib/image-sub2api-studio/
/var/lib/image-sub2api-studio/library/
```

它们保存历史图库、当前会话、队列任务、生成图片和受保护素材库。项目虽然逐步更名为 Image Agent Studio，但生产数据目录仍沿用旧路径，目的是避免升级后历史数据丢失。

## 当前链路约定

```text
普通生图          -> POST /v1/images/generations
参考图 / Mask     -> POST /v1/images/edits
提示词助手        -> POST /v1/chat/completions
/v1/responses     -> 只用于显式兼容测试
```

在网关后台看到文生图入站和上游都是 `/v1/images/generations`，才说明走的是正式图片模型链路。不要把普通生图默认改回 `/v1/responses`。

## 构建 zip 包

构建 `/studio/` 子路径版本：

```powershell
$env:STUDIO_BASE_PATH="/studio/"
npm run build
Remove-Item Env:\STUDIO_BASE_PATH
```

生成核心包和服务包：

```bash
npm run package:release
```

脚本会生成：

- `image-agent-studio-core-update-*.zip`：覆盖静态目录。
- `image-agent-studio-service-update-*.zip`：覆盖服务运行目录。

## 上传到服务器

```bash
scp release/image-agent-studio-core-update-YYYYMMDD-HHMMSS.zip user@YOUR_SERVER:/home/user/
scp release/image-agent-studio-service-update-YYYYMMDD-HHMMSS.zip user@YOUR_SERVER:/home/user/
```

## 覆盖静态目录

线上 Oh Laoo Studio 当前 Nginx 静态目录是：

```text
/var/www/ohlaoo-studio
```

所以应解压到：

```bash
sudo mkdir -p /var/www/ohlaoo-studio
sudo unzip -o /home/user/image-agent-studio-core-update-YYYYMMDD-HHMMSS.zip -d /var/www/ohlaoo-studio

sudo find /var/www/ohlaoo-studio -type d -exec chmod 755 {} \;
sudo find /var/www/ohlaoo-studio -type f -exec chmod 644 {} \;
```

不要解压到 `/var/www/image-sub2api-studio`，除非 Nginx `alias` 也改成读取这个目录。

## 覆盖服务目录

如果这次包含服务端持久化、队列、图库接口或素材库接口改动，再更新服务包：

```bash
sudo mkdir -p /opt/image-sub2api-studio
sudo unzip -o /home/user/image-agent-studio-service-update-YYYYMMDD-HHMMSS.zip -d /opt/image-sub2api-studio

cd /opt/image-sub2api-studio
sudo npm ci --omit=dev
sudo systemctl restart image-sub2api-studio-history
curl -s http://127.0.0.1:8787/studio-api/health
```

如果 systemd 服务不存在：

```bash
sudo cp /opt/image-sub2api-studio/deploy/image-sub2api-studio-history.service \
  /etc/systemd/system/image-sub2api-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-sub2api-studio-history
```

## 验证

先看线上入口实际引用的 JS/CSS hash：

```bash
curl -s https://studio.ohlaoo.com/studio/ | grep 'studio-assets'
```

再检查这些资源不是 HTML fallback：

```bash
curl -I https://studio.ohlaoo.com/studio/
curl -I https://studio.ohlaoo.com/studio/studio-assets/<actual-js-file>.js
curl -I https://studio.ohlaoo.com/studio/studio-assets/<actual-css-file>.css
curl -I https://studio.ohlaoo.com/studio-api/health
```

正确结果应该是：

- Studio 入口返回 `text/html`。
- JS 返回 `application/javascript`。
- CSS 返回 `text/css`。
- `/studio-api/health` 返回 JSON。

如果 JS/CSS 返回 `text/html` 或 404，说明静态目录、base path 或 Nginx alias 错了，页面会白屏。

## 素材库检查

如果灵感广场为空，先检查受保护素材库：

```bash
for f in /var/lib/image-sub2api-studio/library/cases.json \
  /var/lib/image-sub2api-studio/library/inspirations.json \
  /var/lib/image-sub2api-studio/library/style-library.json; do
  [ -f "$f" ] || continue
  echo "== $f =="
  sudo node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const [k,v] of Object.entries(j)) if (Array.isArray(v)) console.log(k, v.length);" "$f"
done

sudo find /var/lib/image-sub2api-studio/library/images \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | wc -l
```

前端已经加载过的图片、JSON 和提示词无法靠前端代码彻底隐藏。生产环境要保护素材和提示词，应让服务端读取 `/var/lib/image-sub2api-studio/library`，前端通过 `/studio-api/library` 登录后访问，并用 Nginx 屏蔽公开的 `/studio/cases.json`、`/studio/inspirations.json` 和 `/studio/images/`。
