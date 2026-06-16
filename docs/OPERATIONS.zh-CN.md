# Image Agent Studio 运维手册

这份手册用于把工作站从“能跑”推进到“能长期维护”：备份、恢复、Docker 升级、自检和错误归因都要有固定入口。

## 一键备份

备份会导出当前授权用户的数据快照：

- 历史图库 `records.json`
- 当前会话 `session.json`
- 生成任务队列 `jobs.json`
- 本地化图片资产 `assets/`
- 备份 manifest、版本号和计数

```bash
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
export STUDIO_BACKUP_TOKEN='你的登录 token 或 API token'
export STUDIO_BACKUP_DIR=./backups

npm run ops:backup
```

备份文件会写入 `STUDIO_BACKUP_DIR`，格式是 `ai-image-workbench-backup-*.json`。

## 一键恢复

恢复前服务端会自动生成一份 `pre-restore` 快照，避免误恢复后没有回退点。

```bash
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
export STUDIO_BACKUP_TOKEN='你的登录 token 或 API token'

npm run ops:restore -- ./backups/ai-image-workbench-backup-xxxx.json
```

恢复会替换当前用户的历史图库、当前会话、生成任务和图片资产。它不会恢复其他用户的数据。

## Docker 正式升级

标准升级流程：

```bash
git pull
export STUDIO_PUBLIC_BASE_URL=https://studio.example.com
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
export STUDIO_BACKUP_TOKEN='你的登录 token 或 API token'
npm run ops:upgrade
```

`ops:upgrade` 会依次执行：

1. `ops:backup` 自动备份当前用户数据
2. `docker compose pull`
3. `docker compose build`
4. `docker compose up -d`
5. `ops:self-check` 验证 `/studio/` 和 `/studio-api/health`

如果服务器使用自定义 env 文件：

```bash
STUDIO_ENV_FILE=.env.production npm run ops:upgrade
```

临时跳过备份：

```bash
STUDIO_SKIP_BACKUP=true npm run ops:upgrade
```

除非你明确要清空历史图库，不要执行：

```bash
docker compose down -v
```

## 升级后自检

```bash
export STUDIO_PUBLIC_BASE_URL=https://studio.example.com
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
npm run ops:self-check
```

自检会确认：

- `/studio/` 能返回工作站页面
- `/studio-api/health` 正常返回
- health payload 带有服务名、版本号和启动时间

## 统一错误字典

错误不要直接把上游英文抛给用户。统一归类成四段：

- 用户看的中文大类
- 运营看的技术原因
- 是否可重试
- 推荐下一步动作

当前字典入口：

```text
src/studio/errors/catalog.js
```

检查：

```bash
npm run check:errors
```

后续生图、邮箱助手、账号同步、模型同步都应该逐步接入同一套字典。
