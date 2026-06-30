# 部署指南

这份指南面向 Image Agent Studio 自托管版本。它是一个独立创作工作站，不依赖某一个反代或网关；Sub2API、NewAPI、官方 API、自定义 OpenAI 兼容接口都只是可选接入方式。

仓库提供三块能力：

- 静态创作工作台：`studio.html` 和前端资源。
- Provider 接入：图片生成、图片编辑、提示词助手、模型同步，以及可选登录、用户资料和 Key 列表。
- 历史/会话服务：保存历史图库、当前画布会话、队列任务和生成结果资产。

生产环境建议启用 Node 历史/会话服务。请把 `STUDIO_DATA_DIR` 指到持久目录，例如 `/var/lib/image-agent-studio`。如果这个目录放在临时目录或容器内部，刷新恢复、跨浏览器恢复和历史图库都会在重建后丢失。

## 1. 准备环境

- Node.js 20 或更高版本。
- 一个可访问的图片生成接口：官方 OpenAI 风格 API、NewAPI 兼容部署、Sub2API 兼容部署、自定义 OpenAI 兼容网关，或其他后续适配器。
- 可选：Nginx、Docker 或其他静态站点托管方式。

```bash
npm install
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

Vite 输出本地地址后打开 `/studio.html`。

本地测试真实网关时可配置：

```env
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://gateway.example.com
```

这样本地 `/v1`、`/api`、`/login` 会代理到你的网关域名，避免浏览器 CORS。

## 3. 生产构建

根路径：

```bash
npm run build
```

`/studio/` 子路径：

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

## 4. 标准 VPS + Nginx

新部署建议目录：

```text
/var/www/image-agent-studio/      # 静态文件
/opt/image-agent-studio/          # Node 历史/会话服务
/var/lib/image-agent-studio/      # 历史、会话、队列、生成图片和受保护素材库
```

标准 Git 同步部署：

```bash
sudo git clone https://github.com/margetrp-hub/image-agent-studio.git \
  /opt/image-agent-studio-repo

sudo bash /opt/image-agent-studio-repo/deploy/install.sh
```

后续更新：

```bash
cd /opt/image-agent-studio-repo
sudo bash deploy/upgrade.sh
```

手动安装 systemd 时使用：

```bash
sudo cp /opt/image-agent-studio/deploy/image-agent-studio-history.service \
  /etc/systemd/system/image-agent-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-agent-studio-history
curl http://127.0.0.1:8787/studio-api/health
```

把 `deploy/nginx-image-agent-studio.conf` 合并到 Nginx server block，并替换：

- `studio.example.com`：Studio 域名。
- `gateway.example.com`：Provider 或网关域名。
- `127.0.0.1:8080`：Provider upstream。
- `/var/www/image-agent-studio/`：实际静态目录。

验证并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 旧 VPS 兼容部署

如果线上已经使用旧目录，可以继续保留：

```text
/var/www/ohlaoo-studio/
/opt/image-sub2api-studio/
/var/lib/image-sub2api-studio/
```

更新时显式指定这些目录：

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

这样旧历史、会话、队列、生成图片和私有素材库不会因为更名而丢失。

## 6. Docker

Docker 形态包含两个容器：

- `studio-web`：Nginx 静态前端和同源代理。
- `studio-history`：历史图库、当前画布会话、队列任务和本地化图片资产持久化服务。

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

如果 OpenAI 兼容网关在宿主机 `127.0.0.1:8080`：

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
```

远程网关：

```env
AI_GATEWAY_UPSTREAM=https://gateway.example.com
```

更多见 [Docker 生产部署](./DOCKER.zh-CN.md)。

## 7. 生成链路

推荐链路：

```text
文生图：POST /v1/images/generations
参考图 / Mask：POST /v1/images/edits
提示词助手：POST /v1/chat/completions
```

`/v1/responses` 只用于显式兼容测试。不要把普通生图默认改回 `/v1/responses`。

## 8. 素材库与防爬

前端已经加载的图片、JSON 和提示词无法靠前端代码彻底隐藏。生产部署建议：

- 不把完整图库和提示词直接放到静态目录。
- 通过 `/studio-api/library` 按登录态返回素材。
- Nginx 对 `/studio/images/`、`/studio/cases.json`、`/studio/inspirations.json` 返回 404 或加鉴权。
- 添加 `X-Robots-Tag: noindex, nofollow, noarchive`。
- 如果启用受保护素材库，构建前设置 `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true`，并先确认 `/studio-api/library` 能返回数据。

仓库里的 `deploy/nginx-image-agent-studio.conf` 已包含基础保护示例。

## 9. 可选网关合约检查

账号型 OpenAI 兼容网关可以运行：

```bash
AI_GATEWAY_BASE_URL=https://gateway.example.com \
AI_GATEWAY_EMAIL=you@example.com \
AI_GATEWAY_PASSWORD='your-password' \
npm run check:gateway
```

这个检查只验证登录、用户资料和 Key 列表，不会发起付费生成。旧的 `SUB2API_*` 变量和 `npm run check:sub2api` 仍作为兼容别名保留。

## 10. 发布前检查

```bash
npm run build
npm run check:deploy
npm run check:docker
npm run check:env
npm run check:docs
npm run check:studio-build
git diff --check
git status --short --ignored
```

Docker 可用时再跑：

```bash
npm run smoke:docker
```
