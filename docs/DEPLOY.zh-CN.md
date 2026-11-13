# 部署指南

这份指南面向 Image Agent Studio 自托管部署。新安装推荐使用 [Docker 轻量接入](./DOCKER.zh-CN.md)：配置 Sub2API 或 New API 的地址，使用者填入自己的 API Key 即可进入工作台。默认不构建管理后台，不启用 Studio 注册、充值或账号数据库；任务、历史和资产持久化服务仍保留。

仓库提供三块能力：

- 静态创作工作台：`studio.html` 和前端资源。
- 网关接入：服务端校验凭据、同步模型、调用图片/视频生成与提示词助手。账号、额度和扣费由网关管理；可选账号令牌模式用于保持跨 Key 的用户身份。
- 历史/会话服务：保存历史图库、当前画布会话、队列任务和生成结果资产。

生产环境建议启用 Node 历史/会话服务。请把 `STUDIO_DATA_DIR` 指到持久目录，例如 `/var/lib/image-agent-studio`。如果这个目录放在临时目录或容器内部，刷新恢复、跨浏览器恢复和历史图库都会在重建后丢失。

## 1. 准备环境

- Node.js 22.12 或更高版本；以下源码运行方式需要自行维护 Node，Docker 则使用镜像中的运行时。
- 一个可访问的图片生成接口：官方 OpenAI 风格 API、NewAPI 兼容部署、Sub2API 兼容部署、自定义 OpenAI 兼容网关，或其他后续适配器。
- 可选：Nginx、Docker 或其他静态站点托管方式。

```bash
npm ci
cp .env.example .env.local
```

Windows PowerShell：

```powershell
Copy-Item .env.example .env.local
```

## 2. 本地运行

先在 `.env.local` 中填写前端开关（示例默认已启用同源服务），然后在一个终端启动持久化服务：

```bash
STUDIO_AUTH_MODE=gateway STUDIO_GATEWAY_TYPE=sub2api STUDIO_GATEWAY_AUTH=api-key \
  AI_GATEWAY_BASE_URL=https://gateway.example.com npm run history:service
```

PowerShell 中分别设置上述 `$env:变量名` 后运行 `npm run history:service`。New API 将 `STUDIO_GATEWAY_TYPE` 改为 `newapi`。Node 服务的运行变量使用进程环境，不会自动读取 Vite 的 `.env.local`。

另一个终端运行 `npm run dev:studio`，打开 `/studio.html`。Vite 默认把 `/studio-api` 代理到本地8787端口；浏览器不需要跨域访问网关。旧直连调试才使用 `VITE_DEV_AI_GATEWAY_PROXY_TARGET`。

## 3. 生产构建

根路径：

```bash
npm run build
```

`/studio/` 子路径：

```bash
npm run build:studio
```

Windows PowerShell：

```powershell
npm run build:studio
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

sudo AI_GATEWAY_BASE_URL=https://gateway.example.com \
  STUDIO_GATEWAY_TYPE=sub2api STUDIO_GATEWAY_AUTH=api-key \
  bash /opt/image-agent-studio-repo/deploy/install.sh
```

后续更新：

```bash
cd /opt/image-agent-studio-repo
sudo bash deploy/upgrade.sh
```

在 `/etc/image-agent-studio.env` 持久保存网关配置，后续升级也使用同一配置：

```env
STUDIO_AUTH_MODE=gateway
STUDIO_GATEWAY_TYPE=sub2api
STUDIO_GATEWAY_AUTH=api-key
AI_GATEWAY_BASE_URL=https://gateway.example.com
```

手动安装 systemd 时先准备上述文件，再使用：

```bash
sudo cp /opt/image-agent-studio/deploy/image-agent-studio-history.service \
  /etc/systemd/system/image-agent-studio-history.service
sudo systemctl daemon-reload
sudo systemctl enable --now image-agent-studio-history
curl http://127.0.0.1:8787/studio-api/health
```

把 `deploy/nginx-image-agent-studio.conf` 合并到 Nginx server block，并替换：

- `studio.example.com`：Studio 域名。
- `/var/www/image-agent-studio/`：实际静态目录。

验证并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. 旧 VPS 兼容部署

已有 Studio 独立账号的部署需显式保留 `STUDIO_AUTH_MODE=standalone`、`VITE_STUDIO_STANDALONE=true` 和原数据目录；不要直接切换身份体系。切换到网关前先以原账号导出个人备份，再以新身份恢复。旧配置只用于迁移兼容，两种部署仍维护在同一仓库。

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
  PUBLIC_STUDIO_URL=https://studio.ohlao.cfd/studio/ \
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
# 编辑 .env：填写 AI_GATEWAY_BASE_URL，选择 STUDIO_GATEWAY_TYPE。
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
AI_GATEWAY_BASE_URL=http://host.docker.internal:8080
```

远程网关：

```env
AI_GATEWAY_BASE_URL=https://gateway.example.com
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

旧 Sub2API 账号协议可以运行（此脚本不代表 New API 账号适配验收）：

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
