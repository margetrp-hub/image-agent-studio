# Docker 生产部署

Docker 配置提供一个完整可运行的 Image Agent Studio：

- `studio-web`：Nginx，负责 `/studio/` 静态前端和 `/studio-api/` 同源服务入口；默认不构建管理页面。
- `studio-history`：Node 历史/会话服务，负责历史图库、当前画布会话、生成队列和结果资产持久化。
- `studio-data`：Docker volume，保存每个用户或本地工作区的 `records.json`、`session.json`、`jobs.json` 和图片资产。

模型网关不打进镜像。服务通过 `AI_GATEWAY_BASE_URL` 校验 Sub2API / New API 凭据并调用模型；默认不创建 Studio 账号数据库、充值账本或管理接口。

## 1. 准备配置

```bash
cp .env.example .env
```

最小配置：

```env
STUDIO_PORT=8080
AI_GATEWAY_BASE_URL=https://gateway.example.com
STUDIO_GATEWAY_TYPE=sub2api
STUDIO_GATEWAY_AUTH=api-key
VITE_AI_IMAGE_ROUTE=auto
STUDIO_AUTH_MODE=gateway
VITE_STUDIO_STANDALONE=false
VITE_STUDIO_GATEWAY_PROXY=true
STUDIO_VERSION=1.0.0
```

`VITE_AI_IMAGE_ROUTE=auto` 表示：

```text
普通生图       -> /v1/images/generations
参考图 / Mask  -> /v1/images/edits
提示词助手     -> /v1/chat/completions
```

不要把它改成 `responses`，除非你明确要测试 `/v1/responses` 兼容生图路径。

同域代理建议保持：

```env
VITE_AI_GATEWAY_BASE_URL=
VITE_AI_GATEWAY_MODEL_BASE_URL=
VITE_AI_GATEWAY_LOGIN_URL=/login
VITE_STUDIO_HISTORY_BASE_URL=
```

浏览器的账号验证、模型同步、提示词助手与持久生成任务都访问 `/studio-api/`，由 Node 调用配置的网关。网关地址使用站点根地址，不带 `/v1`；容器访问宿主机可使用 `host.docker.internal` 和实际网关端口。轻量部署的服务端模型请求限定为此地址。

默认 `api-key` 接入只需使用者填写网关的推理 API Key；通过 `/v1/models` 验证后按 Key 哈希保存独立工作区，服务不把 Key 当成网关账号 ID。关闭标签页后需重新连接；同一 Key 的历史保持不变。换 Key 前在 Studio 导出个人备份，再连接新 Key 恢复。额度、模型权限和扣费全部由网关处理。

已有用户体系需要跨 Key 保持历史时，设置 `STUDIO_GATEWAY_AUTH=account`：

| 网关 | 使用者提供 | 服务校验 |
| --- | --- | --- |
| Sub2API | 账号访问令牌（不是推理 Key） | `/api/v1/auth/me`，仅404回退 `/api/v1/user/profile` |
| New API | 账号访问令牌、用户编号 | `/api/user/self` 与 `New-Api-User`，响应用户必须一致 |

账号接入读取网关现有的可用推理 Key，不自动创建 Key。New API 令牌需具备读取本人资料、列出和读取本人 Key 的权限；网关拒绝时到网关检查授权或使用默认 API Key 接入。没有可用 Key 时界面提供重新连接入口。账号模式的 Sub2API 历史保持原目录，New API 使用独立身份命名空间。

未配置地址显示配置提示；无效/撤销凭据拒绝私有读取和新任务；网关超时或5xx显示暂时不可用，保留输入可重试。重新连接不会自动重发生成任务。已提交的生成结果以任务状态为准，unknown 不能当作失败盲目重试。

旧部署如仍需已有 Studio 账号数据，升级期间显式保留 `STUDIO_AUTH_MODE=standalone`、`VITE_STUDIO_STANDALONE=true` 和原数据卷。此项只为兼容迁移，不是独立 full/lite 仓库。切换身份体系不会自动关联旧账号数据，先按原账号导出备份，再以新身份恢复；不要直接切换生产配置。

## 2. 启动

```bash
docker compose --env-file .env.example config
npm run check:docker
docker compose up --build -d
```

本地默认访问：

```text
http://localhost:8080/studio/
```

检查：

```bash
docker compose ps
docker compose logs -f studio-web
docker compose logs -f studio-history
curl -I http://localhost:8080/studio/
curl http://localhost:8080/studio-api/health
npm run ops:self-check
```

健康检查应返回类似：

```json
{"ok":true,"service":"image-agent-studio-history","version":"1.0.0"}
```

部分旧部署可能还会看到 `legacyService` 字段，这是兼容旧监控的提示，不影响项目名称和部署形态。

## 3. 持久化

默认数据保存在 Compose 项目的 `studio-data` volume：

```bash
docker volume ls | grep studio-data
docker volume inspect image-agent-studio_studio-data
```

数据结构：

```text
/data/users/<user-hash>/records.json
/data/users/<user-hash>/session.json
/data/users/<user-hash>/jobs.json
/data/users/<user-hash>/assets/<record-id>/*.png
```

不要执行：

```bash
docker compose down -v
```

除非你明确要清空历史图库、当前会话、队列任务和生成图片。

## 4. 备份和恢复

Volume 级备份：

```bash
docker run --rm \
  -v image-agent-studio_studio-data:/data:ro \
  -v "$PWD/backups":/backup \
  alpine tar czf /backup/studio-data-backup.tgz -C /data .
```

恢复：

```bash
docker run --rm \
  -v image-agent-studio_studio-data:/data \
  -v "$PWD/backups":/backup \
  alpine sh -c 'cd /data && tar xzf /backup/studio-data-backup.tgz'
```

如果 Compose 项目名不同，volume 前缀也会不同。用 `docker volume ls | grep studio-data` 查实际名称。

有登录 token/API token 时，也可以使用应用级备份：

```bash
STUDIO_HISTORY_BASE_URL=https://studio.example.com \
STUDIO_BACKUP_TOKEN='your-token' \
npm run ops:backup
```

## 5. 更新

常规更新：

```bash
git pull
npm run check:docker
docker compose build
docker compose up -d
npm run ops:self-check
```

如果服务器 `.env` 已经配置好 `STUDIO_HISTORY_BASE_URL`、`STUDIO_PUBLIC_BASE_URL` 和 `STUDIO_BACKUP_TOKEN`，可以用：

```bash
npm run ops:upgrade
```

`ops:upgrade` 默认会先备份，备份失败会中止升级。只有已有外部备份时才显式跳过：

```bash
STUDIO_SKIP_BACKUP=true npm run ops:upgrade
```

本仓库默认使用本地构建镜像：

```text
image-agent-studio-web:local
image-agent-studio-history:local
```

如果没有远端镜像仓库，`docker compose pull` 可能失败；这种场景可以显式跳过 pull：

```bash
STUDIO_SKIP_PULL=true npm run ops:upgrade
```

## 6. 外层 Nginx

独立子域名推荐把整个子域名转给 Docker Nginx：

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

如果只能挂在现有站点的 `/studio/` 下：

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

改完后：

```bash
sudo nginx -t
sudo systemctl reload nginx
curl -I https://studio.example.com/studio/
curl https://studio.example.com/studio-api/health
curl -s https://studio.example.com/studio/ | grep 'studio-assets'
```

## 7. 素材库保护

开源包默认带轻量 starter 数据。如果要保护完整提示词和素材库：

```env
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true
STUDIO_LIBRARY_DIR=/srv/image-agent-studio-library
```

把库文件放到：

```text
/srv/image-agent-studio-library/cases.json
/srv/image-agent-studio-library/inspirations.json
/srv/image-agent-studio-library/style-library.json
/srv/image-agent-studio-library/image-library/
```

前端会通过 `/studio-api/library` 和 `/studio-api/library-assets/...` 登录后读取，避免直接暴露 `/studio/cases.json` 和 `/studio/images/`。

## 8. 常见问题

### `/studio-api/health` 正常，但历史为空

`STUDIO_AUTH_MODE=gateway` 需要用户登录后的 Bearer token。独立部署可先用 `STUDIO_AUTH_MODE=local`。

### 生成图刷新后丢失

确认 `studio-history` 正常运行，并且没有执行过 `docker compose down -v`。

### JS/CSS 返回 `text/html`

静态资源没有命中真实文件。检查：

```bash
curl -I http://localhost:8080/studio/studio-assets/<file>.js
```

正确结果应是 `application/javascript`，不是 `text/html`。

### 容器连不上宿主机网关

项目默认配置：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

如果仍失败，直接把 `AI_GATEWAY_UPSTREAM` 改成网关的内网 IP 或域名。旧的 `SUB2API_UPSTREAM` 仍可作为兼容别名使用。
