# Docker 生产部署

这份 Docker 配置不是纯静态 demo，而是完整可运行形态：

- `studio-web`：Nginx，负责 `/studio/` 静态前端、`/studio-api/`、`/api/`、`/login` 和 `/v1/*` 反向代理。
- `studio-history`：Node 历史/会话服务，负责历史图库、当前画布会话和生成结果资产持久化。
- `studio-data`：Docker volume，保存每个登录用户的 `records.json`、`session.json` 和本地化图片资产。

模型网关本身不打进这个镜像。项目通过 `AI_GATEWAY_UPSTREAM` 连接你已有的 OpenAI 兼容 API、NewAPI、Sub2API 兼容服务或其他自定义网关。

## 1. 准备环境

复制环境文件：

```bash
cp .env.example .env
```

最小可用配置只需要确认三个值：

```env
STUDIO_PORT=8080
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
VITE_AI_IMAGE_ROUTE=auto
STUDIO_VERSION=1.0.0
```

`VITE_AI_IMAGE_ROUTE=auto` 的含义是：

```text
普通生图       -> /v1/images/generations
参考图 / Mask  -> /v1/images/edits
提示词助手     -> /v1/chat/completions
```

不要把它改成 `responses`，除非你明确要测试 `/v1/responses` 的兼容生图路径。

如果 OpenAI 兼容网关已经跑在宿主机 `127.0.0.1:8080`，Docker 默认值可以直接用：

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
STUDIO_PORT=8080
```

如果网关是另一个容器，把它改成同一个 Docker 网络里的服务名：

```env
AI_GATEWAY_UPSTREAM=http://gateway:8080
```

如果网关是远程域名：

```env
AI_GATEWAY_UPSTREAM=https://gateway.example.com
```

默认建议让浏览器只访问 Studio 同域接口，所以 `.env` 里保持：

```env
VITE_AI_GATEWAY_BASE_URL=
VITE_AI_GATEWAY_MODEL_BASE_URL=
VITE_AI_GATEWAY_LOGIN_URL=/login
VITE_STUDIO_HISTORY_BASE_URL=
VITE_AI_IMAGE_ROUTE=auto
```

这样前端会请求当前 Studio 域名下的 `/api`、`/login`、`/v1/images/generations`、`/v1/images/edits` 和提示词助手用到的 `/v1/chat/completions`，再由 Nginx 转发到 `AI_GATEWAY_UPSTREAM`。

启动前建议先做一次静态校验，确认 compose 展开后的端口、volume、healthcheck 和版本号仍然符合生产约定：

```bash
docker compose --env-file .env.example config
npm run check:docker
```

## 2. 启动

```bash
docker compose up --build -d
```

本地默认访问：

```text
http://localhost:8080/studio/
```

检查容器：

```bash
docker compose ps
docker compose logs -f studio-web
docker compose logs -f studio-history
```

健康检查：

```bash
curl -I http://localhost:8080/studio/
curl http://localhost:8080/studio-api/health
curl -s http://localhost:8080/studio/ | grep 'studio-assets'
npm run ops:self-check
```

预期：

```json
{"ok":true,"service":"ai-image-workbench-history","version":"1.0.0"}
```

如果要确认静态资源没有被 fallback 成 HTML，可以先从上一条命令里拿到 JS/CSS 文件名，再检查：

```bash
curl -I http://localhost:8080/studio/studio-assets/<file>.js
curl -I http://localhost:8080/studio/studio-assets/<file>.css
```

正确结果应该分别是 `application/javascript` 和 `text/css`，不是 `text/html`。

## 3. 持久化目录

默认数据保存在 Docker volume：

```bash
docker volume ls | grep image-sub2api-studio
docker volume inspect image-sub2api-studio_studio-data
```

数据结构大致是：

```text
/data/users/<user-hash>/records.json
/data/users/<user-hash>/session.json
/data/users/<user-hash>/jobs.json
/data/users/<user-hash>/assets/<record-id>/*.png
```

`jobs.json` 保存服务端生成任务状态，图片结果会落到 `assets/`，因此浏览器刷新后可以重新恢复当前会话里的生成结果。更新镜像或重建容器不会删除这个 volume。不要用 `docker compose down -v`，除非你明确要清空历史图库、任务记录和当前会话。

队列默认按每个用户 `STUDIO_JOB_CONCURRENCY=1` 串行执行。账号池和上游稳定后，可以先调到 `2` 小流量测试；不要一开始就调得很高，否则可能放大上游排队、失败或扣费后无结果的问题。

备份：

```bash
docker run --rm \
  -v image-sub2api-studio_studio-data:/data:ro \
  -v "$PWD":/backup \
  alpine tar czf /backup/studio-data-backup.tgz -C /data .
```

恢复：

```bash
docker run --rm \
  -v image-sub2api-studio_studio-data:/data \
  -v "$PWD":/backup \
  alpine sh -c 'cd /data && tar xzf /backup/studio-data-backup.tgz'
```

## 4. 更新

生产更新前先备份 `studio-data`。如果已经有可用登录 token/API token，推荐使用服务端备份接口：

```bash
STUDIO_HISTORY_BASE_URL=https://studio.example.com \
STUDIO_BACKUP_TOKEN='your-token' \
npm run ops:backup
```

Docker volume 级别备份也可以保底使用：

```bash
docker run --rm \
  -v image-sub2api-studio_studio-data:/data:ro \
  -v "$PWD/backups":/backup \
  alpine tar czf /backup/studio-data-before-upgrade.tgz -C /data .
```

常规更新：

```bash
git pull
npm run check:docker
docker compose build
docker compose up -d
npm run ops:self-check
```

只要不删除 `studio-data` volume，历史图库、当前画布和已本地化的生成图片都会保留。

如果服务器 `.env` 已经配置好 `STUDIO_HISTORY_BASE_URL`、`STUDIO_PUBLIC_BASE_URL` 和 `STUDIO_BACKUP_TOKEN`，可以用升级脚本把“备份 -> 拉取/构建 -> 启动 -> 自检”串起来：

```bash
npm run ops:upgrade
```

`ops:upgrade` 默认会先运行 `ops:backup`，备份失败会中止升级。只有在你已经通过 volume 快照或其他方式完成备份时，才显式跳过：

```bash
STUDIO_SKIP_BACKUP=true npm run ops:upgrade
```

本仓库默认使用本地构建镜像 `ai-image-workbench-web:local` 和 `ai-image-workbench-history:local`。如果没有远端镜像仓库，`docker compose pull` 可能失败；这种场景可以显式跳过 pull：

```bash
STUDIO_SKIP_PULL=true npm run ops:upgrade
```

不要用 zip 包更新 Docker 容器里的前端。Docker 模式的更新入口是 Git 仓库和镜像重建；传统 VPS 模式使用 `image-agent-studio-core-update-*.zip` 和 `image-agent-studio-service-update-*.zip`。

## 5. VPS/Nginx 外层反代

如果使用独立子域名，比如 `studio.example.com`，推荐让外层 Nginx 直接把整个子域名转给 Docker Nginx：

```nginx
server {
    listen 80;
    server_name studio.example.com;

    client_max_body_size 120m;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_read_timeout 900s;
        proxy_send_timeout 900s;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果 Docker 映射到宿主机 `8080`，但你只能在现有站点里挂 `/studio/`，外层 Nginx 可以这样转发：

```nginx
location /studio/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /studio-api/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    client_max_body_size 120m;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}

location /api/ {
    proxy_pass http://127.0.0.1:8080;
}

location /login {
    proxy_pass http://127.0.0.1:8080;
}

location /v1/ {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 900s;
    proxy_send_timeout 900s;
}
```

如果外层 Nginx 和 Docker Nginx 在同一台机器上，浏览器仍然只看到一个域名，登录、模型调用、历史图库和当前会话都走同域路径。

VPS 上改完外层 Nginx 后检查：

```bash
sudo nginx -t
sudo systemctl reload nginx

curl -I https://studio.example.com/studio/
curl https://studio.example.com/studio-api/health
curl -s https://studio.example.com/studio/ | grep 'studio-assets'
```

## 6. 素材库保护

开源包默认把基础 JSON 放在镜像和 `./public` 挂载里，适合 starter 版本。

如果要保护提示词和素材：

```env
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true
STUDIO_LIBRARY_DIR=/srv/image-sub2api-studio-library
```

然后把库文件放到：

```text
/srv/image-sub2api-studio-library/cases.json
/srv/image-sub2api-studio-library/inspirations.json
/srv/image-sub2api-studio-library/images/...
```

前端会通过 `/studio-api/library` 和 `/studio-api/library-assets/...` 登录后读取，避免直接暴露 `/studio/cases.json` 和 `/studio/images/`。

## 7. 常见问题

### `/studio-api/health` 正常，但历史为空

历史服务需要用户登录后的 Bearer token。未登录时只会使用浏览器本地缓存。

### 生成图刷新后丢失

确认 `studio-history` 正常运行，并且没有执行过：

```bash
docker compose down -v
```

### JS/CSS 返回 `text/html`

说明静态资源没有命中真实文件。检查：

```bash
curl -I http://localhost:8080/studio/studio-assets/<file>.js
```

正确应该是 `application/javascript`，不是 `text/html`。

### 容器连不上宿主机网关

Linux VPS 需要 Compose 里的：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

本项目已经默认配置。若仍失败，直接把 `AI_GATEWAY_UPSTREAM` 改成网关的内网 IP 或域名。旧的 `SUB2API_UPSTREAM` 仍可作为兼容别名使用。
