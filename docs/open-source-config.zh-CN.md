# 开源版配置说明

Image Agent Studio 可以作为一个可自托管的 AI 图像创作工作站使用。它默认不包含真实 API Key、不包含完整私有图库，也不包含任何模型网关后端。

你需要把它接到已有的官方 API 账号、OpenAI 兼容网关、NewAPI、Sub2API 兼容部署或其他自定义图片生成服务。

## 本地启动

```bash
npm install
cp .env.example .env.local
npm run dev:studio
```

如果本地需要代理到云端网关：

```env
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://gateway.example.com
```

## 最小配置

```env
VITE_AI_GATEWAY_BASE_URL=https://gateway.example.com
VITE_AI_GATEWAY_MODEL_BASE_URL=https://gateway.example.com
VITE_AI_IMAGE_ROUTE=auto
VITE_AI_RESPONSES_MODEL=gpt-5.5
VITE_AI_GATEWAY_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
```

字段含义：

- `VITE_AI_GATEWAY_BASE_URL`：账号、资料、Key 列表等管理接口根域名；如果网关提供这类 API，前端会自动补成 `/api/v1`。
- `VITE_AI_GATEWAY_MODEL_BASE_URL`：模型和生成接口根域名，前端会自动补成 `/v1`。
- `VITE_AI_IMAGE_ROUTE`：`auto` 为推荐模式，普通生图使用 `/v1/images/generations`，参考图和 Mask 使用 `/v1/images/edits`；只有上游明确支持时才改成 `responses`。
- `VITE_AI_GATEWAY_LOGIN_URL`：登录页地址，登录完成后应能带用户回到 Studio。
- `VITE_STUDIO_HISTORY_BASE_URL`：历史图库服务所在域名，默认同域调用 `/studio-api`。
- `VITE_STUDIO_BACK_URL`：工作台左上角返回链接。
- `VITE_STUDIO_LIBRARY_AUTH_REQUIRED`：是否要求登录后再加载素材库。开源版默认 `false`，生产环境把素材库改成 `/studio-api/library` 后可设为 `true`。

旧的 `VITE_SUB2API_*` 变量仍作为兼容别名保留，已有 VPS 不需要为了升级立即改名。

## 持久化模式

独立 Docker / 单用户测试可以使用本地工作区模式：

```env
STUDIO_AUTH_MODE=local
STUDIO_DATA_DIR=/var/lib/image-sub2api-studio
STUDIO_HISTORY_HOST=127.0.0.1
STUDIO_HISTORY_PORT=8787
STUDIO_ALLOWED_ORIGINS=https://studio.example.com
```

接入已有账号体系时可以使用网关账号模式：

```env
STUDIO_AUTH_MODE=gateway
AI_GATEWAY_BASE_URL=http://127.0.0.1:8080
STUDIO_DATA_DIR=/var/lib/image-sub2api-studio
STUDIO_LIBRARY_DIR=/var/lib/image-sub2api-studio/library
STUDIO_LIBRARY_ASSET_DIR=/var/lib/image-sub2api-studio/library/image-library
```

服务会把历史图库、当前画布会话、队列任务和生成图片写入 `STUDIO_DATA_DIR`。运行时 API Key 不会写入 `records.json`、`session.json` 或 `jobs.json`。

## 可替换内容

- `src/studio.jsx`：工作台文案、默认模型、默认参数和模板展示。
- `src/studio.css`：工作台样式。
- `public/cases.json`：轻量启动模板。生产环境可以替换成自己的模板索引。
- `public/inspirations.json`：扩展灵感入口。
- `docs/screenshots/`：README 截图。

## 生产构建

```bash
npm run build
```

部署在 `/studio/`：

```bash
STUDIO_BASE_PATH=/studio/ npm run build
```

构建产物在 `dist/`。`dist/`、`release/`、`output/`、`.tmp/` 都是本地产物或过程资料，已经在 `.gitignore` 中排除。

## 许可证说明

提示词模板内容来自社区，遵循 CC BY 4.0 许可证；使用和改编时请保留原作者或来源归属。项目代码按仓库根目录的 `LICENSE` 发布。
