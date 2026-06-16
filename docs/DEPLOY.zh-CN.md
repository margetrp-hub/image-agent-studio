# 部署指南

这份指南面向 Image Agent Studio 自托管版本。仓库提供三块能力：

- 静态创作工作台：`studio.html` 和前端资源。
- OpenAI 兼容网关接入：图片生成、图片编辑、提示词助手，以及可选的登录、用户资料、Key 列表和模型列表。
- 历史/会话服务：保存历史图库、当前画布会话、队列任务和生成结果资产。

0.9 beta 建议启用 Node 历史/会话服务。它不仅保存历史图库，也通过 `/studio-api/session` 保存当前画布会话。生产环境请把 `STUDIO_DATA_DIR` 指到持久目录，例如 `/var/lib/image-sub2api-studio`。如果这个目录放在临时目录或容器内部，刷新恢复、跨浏览器恢复和用户历史图库都会在重建后丢失。

## 1. 准备环境

需要：

- Node.js 20 或更高版本。
- 一个可访问的 OpenAI 兼容图片生成接口、官方 API 账号、NewAPI、Sub2API 兼容部署或其他自定义网关。
- 可选：Nginx、Docker 或其他静态站点托管方式。

安装依赖：

```bash
npm install
```

复制配置：

```bash
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

## 2. 本地运行

```bash
npm run dev:studio
```

Vite 输出本地地址后，打开 `/studio.html`。

最小 `.env.local`：

```env
VITE_AI_GATEWAY_BASE_URL=https://gateway.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://gateway.example.com
VITE_AI_IMAGE_ROUTE=auto
VITE_AI_RESPONSES_MODEL=gpt-5.5
VITE_AI_GATEWAY_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://gateway.example.com
```

`VITE_DEV_AI_GATEWAY_PROXY_TARGET` 只用于本地 Vite 开发，生产构建可以不设置。它会把本地 `/v1`、`/api`、`/login` 代理到你的网关域名，方便真实上游测试。

旧的 `VITE_SUB2API_*` 环境变量仍作为兼容别名保留。新部署建议优先使用 `VITE_AI_*`。

## 3. 生产构建

部署在网站根路径：

```bash
npm run build
```

部署在 `/studio/` 子路径：

```bash
STUDIO_BASE_PATH=/studio/ npm run build
```

Windows PowerShell：

```powershell
$env:STUDIO_BASE_PATH="/studio/"
npm run build
Remove-Item Env:\STUDIO_BASE_PATH
```

构建产物在 `dist/`，不要提交到 GitHub。

## 4. VPS + Nginx

推荐目录：

```text
/var/www/ai-image-workbench/       # 静态文件，示例目录
/opt/image-sub2api-studio/         # Node 历史/会话服务
/var/lib/image-sub2api-studio/     # 用户历史图库、当前会话、队列任务和受保护素材库
```

如果你的 Nginx 实际读取 `/var/www/ohlaoo-studio`，就把静态文件上传到 `/var/www/ohlaoo-studio`。目录名不重要，关键是要和 Nginx `alias` 一致。

构建并上传：

```bash
npm run build
rsync -av --delete dist/ user@server:/var/www/ai-image-workbench/
rsync -av package.json package-lock.json scripts/ deploy/ user@server:/opt/image-sub2api-studio/
```

服务器安装历史/会话服务依赖：

```bash
sudo mkdir -p /opt/image-sub2api-studio/scripts /var/www/ai-image-workbench /var/lib/image-sub2api-studio
sudo chown -R www-data:www-data /var/lib/image-sub2api-studio
cd /opt/image-sub2api-studio
npm ci --omit=dev
```

确认 `deploy/image-sub2api-studio-history.service`：

```ini
Environment=STUDIO_AUTH_MODE=gateway
Environment=AI_GATEWAY_BASE_URL=http://127.0.0.1:8080
Environment=STUDIO_DATA_DIR=/var/lib/image-sub2api-studio
Environment=STUDIO_ALLOWED_ORIGINS=https://studio.example.com
```

如果你要做独立本地工作区，不接上游账号体系：

```ini
Environment=STUDIO_AUTH_MODE=local
Environment=STUDIO_DATA_DIR=/var/lib/image-sub2api-studio
Environment=STUDIO_ALLOWED_ORIGINS=https://studio.example.com
```

安装 systemd 服务：

```bash
sudo cp /opt/image-sub2api-studio/deploy/image-sub2api-studio-history.service /etc/systemd/system/image-sub2api-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-sub2api-studio-history
curl http://127.0.0.1:8787/studio-api/health
```

把 `deploy/nginx-sub2api-studio.conf` 合并到 Nginx server block，并替换：

- `studio.example.com`：Studio 域名。
- `gateway.example.com`：OpenAI 兼容网关域名。
- `127.0.0.1:8080`：网关 upstream。
- `/var/www/ai-image-workbench/`：示例静态目录；实际值必须和 Nginx `alias` 一致。

验证并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Docker

Docker 形态包含两个容器：`studio-web` 和 `studio-history`。历史图库、当前画布会话、队列任务和本地化图片资产会保存到 `studio-data` volume。

```bash
cp .env.example .env
npm run check:docker
docker compose up --build -d
npm run ops:self-check
```

默认访问：

```text
http://localhost:8080/studio/
```

如果 OpenAI 兼容网关已经跑在宿主机 `127.0.0.1:8080`，保持：

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
```

更多见 [Docker 生产部署](./DOCKER.zh-CN.md)。

发布前或升级前请先备份 `studio-data`。有登录 token/API token 时优先用：

```bash
STUDIO_HISTORY_BASE_URL=https://studio.example.com \
STUDIO_BACKUP_TOKEN='your-token' \
npm run ops:backup
```

服务器 `.env` 已配置 `STUDIO_HISTORY_BASE_URL`、`STUDIO_PUBLIC_BASE_URL` 和 `STUDIO_BACKUP_TOKEN` 后，可以用：

```bash
npm run ops:upgrade
```

这个脚本会先备份，再构建/启动 compose，最后请求 `/studio/` 和 `/studio-api/health` 做自检。仅在已有外部备份时才使用 `STUDIO_SKIP_BACKUP=true`。

## 6. 可选兼容合约检查

如果你使用的是账号型 OpenAI 兼容网关，可以运行合约检查脚本：

```bash
AI_GATEWAY_BASE_URL=https://gateway.example.com \
AI_GATEWAY_EMAIL=you@example.com \
AI_GATEWAY_PASSWORD='your-password' \
npm run check:gateway
```

Windows PowerShell：

```powershell
$env:AI_GATEWAY_BASE_URL="https://gateway.example.com"
$env:AI_GATEWAY_EMAIL="you@example.com"
$env:AI_GATEWAY_PASSWORD="your-password"
npm run check:gateway
Remove-Item Env:\AI_GATEWAY_BASE_URL,Env:\AI_GATEWAY_EMAIL,Env:\AI_GATEWAY_PASSWORD
```

这个检查只验证登录、用户资料和 Key 列表，不会发起付费生成。旧的 `SUB2API_*` 变量和 `npm run check:sub2api` 仍作为兼容别名保留。

## 7. 生图链路检查

0.9 beta 推荐链路：

```text
文生图：POST /v1/images/generations，模型使用 gpt-image-2 等图片模型
参考图/Mask：POST /v1/images/edits
助手对话：POST /v1/chat/completions
```

如果你在网关后台看到文生图入站和上游都是 `/v1/images/generations`，说明走的是正式图片生成链路。`/v1/responses` 只用于提示词助手或显式开启的兼容测试。

## 8. 素材库与防爬

前端已经加载的图片、JSON 和提示词无法靠前端代码彻底隐藏。生产部署建议：

- 不把完整图库和提示词直接放到静态目录。
- 通过 `/studio-api/library` 按登录态返回素材。
- Nginx 对 `/studio/images/`、`/studio/cases.json`、`/studio/inspirations.json` 返回 404 或加鉴权。
- 添加 `X-Robots-Tag: noindex, nofollow, noarchive`，降低搜索引擎收录。
- 如果启用受保护素材库，构建前设置 `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true`，并先确认 `/studio-api/library` 能返回数据。

仓库里的 `deploy/nginx-sub2api-studio.conf` 已包含基础保护示例。

## 9. 发布前检查

```bash
npm run build
npm run check:docker
npm run smoke:docker
git diff --check
git status --short --ignored
```

不要提交：

```text
node_modules/
dist/
release/
output/
tmp/
.tmp/
data/images/
```
