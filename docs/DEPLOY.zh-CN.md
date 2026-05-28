# 部署指南

这份指南面向 `image-sub2api-studio` 自托管版本。仓库提供三块能力：

- 静态创作工作台：`studio.html` 和前端资源。
- Sub2API 接入：登录、用户资料、Key 列表、模型列表和生成接口。
- 可选历史服务：把生成记录按 Sub2API 用户隔离保存。

## 1. 准备环境

需要：

- Node.js 20 或更高版本。
- 一个可访问的 Sub2API 服务。
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
VITE_SUB2API_BASE_URL=https://sub2api.example.com
VITE_SUB2API_GATEWAY_BASE_URL=https://sub2api.example.com
VITE_SUB2API_IMAGE_ROUTE=responses
VITE_SUB2API_RESPONSES_MODEL=gpt-5.5
VITE_SUB2API_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
VITE_DEV_SUB2API_PROXY_TARGET=https://sub2api.example.com
```

`VITE_DEV_SUB2API_PROXY_TARGET` 只用于本地 Vite 开发，生产构建可以不设置。它会把本地 `/v1`、`/api`、`/login` 代理到你的 Sub2API 域名，方便真实上游测试。

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
/var/www/image-sub2api-studio/     # 静态文件
/opt/image-sub2api-studio/         # Node 历史服务
/var/lib/image-sub2api-studio/     # 用户历史和受保护素材库
```

构建并上传：

```bash
npm run build
rsync -av --delete dist/ user@server:/var/www/image-sub2api-studio/
rsync -av package.json package-lock.json scripts/ deploy/ user@server:/opt/image-sub2api-studio/
```

服务器安装历史服务依赖：

```bash
sudo mkdir -p /opt/image-sub2api-studio/scripts /var/www/image-sub2api-studio /var/lib/image-sub2api-studio
sudo chown -R www-data:www-data /var/lib/image-sub2api-studio
cd /opt/image-sub2api-studio
npm ci --omit=dev
```

确认 `deploy/image-sub2api-studio-history.service`：

```ini
Environment=SUB2API_BASE_URL=http://127.0.0.1:8080
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
- `sub2api.example.com`：Sub2API 域名。
- `127.0.0.1:8080`：Sub2API upstream。
- `/var/www/image-sub2api-studio/`：静态目录。

验证并重载：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 5. Docker

```bash
cp .env.example .env
docker compose up --build
```

默认访问：

```text
http://localhost:8080/studio/
```

更多见 [Docker 快速部署](./DOCKER.zh-CN.md)。

## 6. Sub2API 合约检查

```bash
SUB2API_BASE_URL=https://sub2api.example.com \
SUB2API_EMAIL=you@example.com \
SUB2API_PASSWORD='your-password' \
npm run check:sub2api
```

Windows PowerShell：

```powershell
$env:SUB2API_BASE_URL="https://sub2api.example.com"
$env:SUB2API_EMAIL="you@example.com"
$env:SUB2API_PASSWORD="your-password"
npm run check:sub2api
Remove-Item Env:\SUB2API_BASE_URL,Env:\SUB2API_EMAIL,Env:\SUB2API_PASSWORD
```

这个检查只验证登录、用户资料和 Key 列表，不会发起付费生成。

## 7. 生图链路检查

0.5 版本推荐链路：

```text
文生图：POST /v1/responses，模型使用 gpt-image-2 等图片模型
参考图/Mask：POST /v1/images/edits
```

如果你在 Sub2API 后台看到入站和上游都是 `/v1/responses`，模型是 `gpt-image-2`，说明没有走旧的降级链路。

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
git diff --check
git status --short --ignored
```

不要提交：

```text
node_modules/
dist/
release/
output/
.tmp/
data/images/
.env.local
```

## 10. 许可证

代码使用仓库根目录的 `LICENSE`。提示词模板内容来自社区，遵循 CC BY 4.0 许可证；使用和改编时请保留原作者或来源归属。
