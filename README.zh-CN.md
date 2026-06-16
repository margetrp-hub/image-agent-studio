# Image Agent Studio

## 项目介绍

Image Agent Studio 是一个可以自托管的 AI 图像创作工作站，面向 OpenAI 兼容的图片生成和图片编辑网关。

我做它，是因为早期的生图流程太散：提示词在一个地方，参考图在另一个地方，生成参数藏在接口参数里，结果常常只停留在浏览器临时状态里；刷新、超时、失败或继续修改时，很容易丢掉上下文。

这个工作台想把这条链路放回同一个页面里：写提示词、让 AI 辅助优化、上传参考图、选择 Provider 和模型、通过 `/v1/images/generations` 生图，或通过 `/v1/images/edits` 做参考图编辑和 Mask 局部重绘；生成后可以在无限画布上继续从任意一张图衍生，并把会话、队列、历史图库和图与图之间的关系保存下来。

这里的 “Agent” 不是噱头。它更像一个会陪你拆需求、整理提示词、挂住参考图、切换模型和记录分支的工作层，而不是单纯的提示词堆放区。

它可以连接官方 OpenAI 风格接口、自定义兼容网关、Sub2API、NewAPI 以及类似服务。重点不是绑定某一家，而是让工作站本身足够灵活，后续能跟着你的工作流继续演进。

这个仓库只包含创作工作台和部署示例，不包含私有生产首页、完整私有图库、真实 Key 或网关后端实现。

演示入口：[studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

## 交流

如果你也在做 AI 生图工作流，或者想一起讨论官方 API、自定义兼容接口、Sub2API、NewAPI、部署、模型调用、提示词工作流和后续改进，欢迎进 QQ 交流群：`260789529`。

<p align="center">
  <a href="https://github.com/margetrp-hub/ai-image-workbench"><img src="https://img.shields.io/badge/project-image--agent--studio-0f766e?style=flat-square" alt="project"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f7268?style=flat-square" alt="MIT License"></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/lang-English-blue?style=flat-square" alt="English"></a>
</p>

## 1.0.0 做到了什么

- 生图默认走 `/v1/images/generations`，直接调用 `gpt-image-2` 等图片模型，避免误进 `/v1/responses` 的降级链路。
- 参考图编辑和 Mask 局部重绘走 `/v1/images/edits`。
- 同一个工作台可以连接官方 OpenAI 风格接口、自定义 OpenAI 兼容网关、Sub2API、NewAPI 和类似服务。
- Docker 可以用 `STUDIO_AUTH_MODE=local` 运行，当前会话、历史图库、队列和生成资产可以在没有上游账号系统的情况下持久化。
- 已有账号系统的部署可以继续用 `STUDIO_AUTH_MODE=gateway`，通过现有网关账号做用户隔离。
- 新配置优先使用通用的 `VITE_AI_*` 和 `AI_GATEWAY_*` 命名；旧的 `VITE_SUB2API_*` 和 `SUB2API_*` 仍作为兼容别名保留。
- 服务端生成队列会持久化；上游账号池验证稳定后，可以用 `STUDIO_JOB_CONCURRENCY` 小心打开每用户并发。
- 大画布会进入性能模式，虚拟化离屏图片/视频节点，并降低 SVG 连线动画压力。
- 底部创作会话可以调用对话模型优化提示词，会使用当前选中 Key 的额度。
- 选中画布节点后继续生成，会保留 #1 -> #2 / #3 这样的创作分支关系。
- 点击单张生成图时，会展示完整保存的提示词，并按主体、场景、风格、构图等内容分段阅读。
- 提示词助手会尊重“衍生、局部修改、重写、不要、改成”等方向，不再强行把用户否定的旧内容带回来。
- 当前画布会话通过 `/studio-api/session` 保存，并按登录用户或本地工作区隔离。
- 登录后的生图会先提交到 `/studio-api/generation-jobs`，由服务端调用 `/v1/images/generations` 或 `/v1/images/edits` 并保存结果；页面刷新后仍可从当前画布和历史图库恢复。
- 生图超时、停止或网络中断时，页面会进入“待确认”状态，提示上游可能仍在处理或已经扣费，避免误导用户连续重复提交。
- 历史图库按会话展示，左侧项目不再把同一会话里的每张图拆成多个项目。
- 浏览器侧历史恢复增加 IndexedDB 缓存层，localStorage 只作为兜底，减少大历史丢失或撑爆 localStorage 的概率。
- 历史图库、本地会话卡片、视频灵感和图片模板结果都会分批渲染，避免一次性挂载太多 DOM 和图片节点。
- Key 只打码展示；手动输入的自定义接口 API Key 只保存在当前浏览器会话，不写入 localStorage。
- 左下角个人区提供中文/英文界面切换和深浅色切换。
- 模板/灵感内容可以作为 starter 静态数据，也可以在生产环境改成登录后由 `/studio-api/library` 下发，保护私有素材和提示词。

## 截图

截图来自当前工作台界面，使用演示数据，Key 已打码。

![创作工作台中文界面](docs/screenshots/workstation-zh.png)

![创作工作台英文界面](docs/screenshots/workstation-en.png)

旧版拆分功能截图仍保留在 `docs/screenshots/` 里用于版本对比，但项目首页现在只展示当前新版工作台布局。

## 边界说明

这个仓库不是模型供应商，也不是网关后端。它只负责创作工作台这一层。

官方 API、自定义兼容网关、Sub2API、NewAPI 等服务负责：账号、Key、额度、模型、计费和网关转发。

Image Agent Studio 负责：创作页面、提示词工作流、参考图上传、参数控制、无限画布、画布续作、历史图库、当前会话持久化和部署示例。

提示词模板来自社区学习材料和公开案例整理，适用时遵循 `CC BY 4.0` 许可证；使用和改编时请保留原作者或来源归属。更完整的边界说明见 [致谢与参考边界](docs/ACKNOWLEDGEMENTS.zh-CN.md)。

## 审核与安全边界

开源包默认不包含真实 Key、完整私有图库、生产首页或任何网关后端实现。部署时需要自己接入官方 API 账号或已有 OpenAI 兼容网关，并按生产环境配置 Nginx、Docker、HTTPS 和持久化目录。

- 安全边界、密钥处理、数据落盘和生产加固建议：[SECURITY.md](SECURITY.md)。
- Provider / 网关接入方向：[docs/PROVIDERS.md](docs/PROVIDERS.md)。
- 1.0.0 发布说明、升级影响和验证清单：[RELEASE_NOTES.md](RELEASE_NOTES.md)。
- 代码授权范围：[LICENSE](LICENSE)。提示词模板和社区内容不会自动并入 MIT 代码授权。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev:studio
```

如果本地页面需要直接调用云端 OpenAI 兼容网关，建议在 `.env.local` 里加：

```env
VITE_DEV_AI_GATEWAY_PROXY_TARGET=https://你的网关域名
```

这样本地页面请求 `/v1`、`/api`、`/login` 会由 Vite 代理到你的网关，浏览器不会因为跨域拦住真实测试。

## 生产构建

部署到站点根路径：

```bash
npm run build
```

部署到 `/studio/` 子路径：

```bash
STUDIO_BASE_PATH=/studio/ npm run build
```

Windows PowerShell：

```powershell
$env:STUDIO_BASE_PATH="/studio/"
npm run build
Remove-Item Env:\STUDIO_BASE_PATH
```

构建产物在 `dist/`。上传到 VPS 时，必须上传 `dist/` 里的 `studio.html` 和 `studio-assets/`，不要把仓库根目录的源码版 `studio.html` 当成线上文件。

## 最小环境变量

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

常用理解：

- `VITE_AI_GATEWAY_BASE_URL` 用于登录、用户资料、Key 列表，会自动补成 `/api/v1`。
- `VITE_AI_GATEWAY_MODEL_BASE_URL` 用于模型和生成接口，会自动补成 `/v1`。
- `VITE_AI_IMAGE_ROUTE=auto` 是当前推荐模式：普通生图走 `/v1/images/generations`，参考图和 Mask 走 `/v1/images/edits`。
- 只有在你的上游明确支持并且你希望测试 `/v1/responses` 生图时，才把它改成 `responses`。
- `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` 适合生产环境把模板库后端化以后再开启。
- 旧的 `VITE_SUB2API_*` 变量仍然保留为兼容别名；新部署建议优先使用 `VITE_AI_*`。

## VPS 部署思路

推荐把它当成静态前端 + Node 历史/会话服务来部署：

```text
/var/www/image-agent-studio/      # 静态文件，示例目录
/opt/image-sub2api-studio/        # Node 历史/会话服务
/var/lib/image-sub2api-studio/    # 用户历史图库、当前会话和受保护素材库
```

如果你的 Nginx 实际读取的是另一个目录，就把构建后的 `dist/` 文件部署到那个目录。目录名不重要，关键是要和 Nginx `alias` 一致。已有 VPS 可以继续沿用 `/opt/image-sub2api-studio` 和 `/var/lib/image-sub2api-studio`，这样旧历史、会话、队列、生成图片和受保护素材库不会因为更名而丢失。

更多细节：

- [部署指南](docs/DEPLOY.zh-CN.md)
- [Docker 生产部署](docs/DOCKER.zh-CN.md)
- [VPS 直接同步 Git 仓库部署](docs/VPS-GIT-SYNC.zh-CN.md)
- [服务器更新说明](deploy/UPDATE-SERVER.zh-CN.md)
- [安全边界说明](SECURITY.md)
- [Provider / 网关接入说明](docs/PROVIDERS.md)
- [Release Notes](RELEASE_NOTES.md)

长期运行的 VPS 建议用 Git 同步部署：服务器直接拉仓库、构建、覆盖静态文件、更新服务并验证线上状态。

```bash
cd /opt/image-agent-studio-repo

sudo BRANCH=main \
  REPO_DIR=/opt/image-agent-studio-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

如果服务器已经有图片素材库，zip 前端更新不需要再次上传图库。使用 Git 同步部署后，也不需要每次手动上传 zip 包。

```bash
npm run package:release
```

这个命令会生成：

- `image-agent-studio-core-update-*.zip`：静态前端文件。
- `image-agent-studio-service-update-*.zip`：`/opt/image-sub2api-studio` 服务文件。

使用当前会话持久化、刷新恢复、队列恢复或历史图库服务时，需要上传服务包。

## Docker 部署

仓库也提供 Docker Compose 部署，适合新服务器或开源用户快速跑起来：

```bash
cp .env.example .env
docker compose up --build -d
```

它会启动两个容器：

- `studio-web`：Nginx 静态前端和同源代理。
- `studio-history`：历史图库、当前会话和生成资产持久化服务。

持久化数据保存在 `studio-data` volume。只要不执行 `docker compose down -v`，重建镜像不会删除图库和当前画布。

如果你的 OpenAI 兼容网关在宿主机 `127.0.0.1:8080`：

```env
AI_GATEWAY_UPSTREAM=http://host.docker.internal:8080
```

如果网关是远程域名：

```env
AI_GATEWAY_UPSTREAM=https://your-gateway-domain
```

完整路径见 [Docker 生产部署](docs/DOCKER.zh-CN.md)。

## 本地验证

发布或部署重构版本之前，先跑不消耗额度的本地门禁：

```bash
npm run check:local
```

这个命令会构建应用、验证 provider 路由、检查部署和 Docker Compose 配置、验证服务端持久化/取消/重启行为，并用浏览器 smoke 覆盖按会话归类的历史恢复、IndexedDB 本地历史恢复、历史图库分批渲染、视频灵感分批渲染、图片模板分批渲染、英文界面和手动 Key 不落 localStorage。

如果本机有 Docker Desktop 或 Docker daemon，也可以跑容器运行时 smoke：

```bash
npm run smoke:docker
```

这个命令会构建 Compose 栈，启动 `studio-web` 和 `studio-history`，验证 `/studio/`、`/studio-api/health`、JS/CSS Content-Type，然后清理测试栈。如果 Docker 没有运行，这个门禁只是未验证，不包含在 `npm run check:local` 里。

最终决定是否进入发布/部署前，再跑一次总审计：

```bash
npm run audit:readiness
```

这个命令会重新跑本地门禁、用当前工作区重新构建并检查 release 包，然后要求 Docker 运行时 smoke 通过。如果 Docker Desktop 或 Docker daemon 没有运行，它会故意失败，而不是把完整容器部署形态当成已验证。

## 素材库策略

任何已经加载到前端的内容，都可以被浏览器检查到。生产环境如果不希望提示词和素材被爬虫或直接抓取，建议：

- GitHub 仓库只放轻量 starter 数据，不放完整私有图库。
- 私有提示词和素材通过登录后的 `/studio-api/library` 下发。
- 在 Nginx 中禁止静态访问 `/studio/images/`、`/studio/cases.json`、`/studio/inspirations.json`。
- 添加 `X-Robots-Tag: noindex, nofollow, noarchive`。

仓库里的 `deploy/nginx-sub2api-studio.conf` 已经放了基础示例。

## 可选网关合约检查

Provider 路由守卫：

```bash
npm run check:providers
```

它会确保自动生图仍然走 `/v1/images/generations`，图片编辑仍然走 `/v1/images/edits`。

```bash
AI_GATEWAY_BASE_URL=https://gateway.example.com \
AI_GATEWAY_EMAIL=you@example.com \
AI_GATEWAY_PASSWORD='your-password' \
npm run check:gateway
```

这个检查只验证账号型网关的登录、资料和 Key 列表，不会启动付费生图。旧的 `SUB2API_*` 变量和 `npm run check:sub2api` 仍作为兼容别名保留。

## 项目结构

```text
.
|- src/
|  |- studio.jsx                         # 主工作台 UI
|  |- studio.css                         # 工作台样式
|  |- aiGatewayClient.js                 # OpenAI 兼容网关客户端
|  |- sub2apiClient.js                   # 旧导入路径兼容转发
|  `- studio/                            # Provider、存储和工具函数
|- scripts/
|  |- image-sub2api-studio-history-service.mjs
|  |- check-sub2api-contract.mjs
|  |- package-release.mjs
|- deploy/
|  |- nginx-sub2api-studio.conf
|  |- docker-nginx.conf.template
|  |- image-sub2api-studio-history.service
|  `- UPDATE-SERVER.zh-CN.md
|- docs/
|  |- DEPLOY.zh-CN.md
|  |- DOCKER.zh-CN.md
|  |- open-source-config.zh-CN.md
|  |- sub2api-studio-overlay.md
|  |- templates.md
|  `- screenshots/
|- SECURITY.md
|- RELEASE_NOTES.md
|- public/
|  |- cases.json
|  |- inspirations.json
|  |- inspiration-sources.json
|  `- style-library.json
`- studio.html
```

## 作者与授权

维护者：[@margetrp-hub](https://github.com/margetrp-hub)

代码使用 [MIT License](LICENSE) 发布。社区提示词模板在适用时遵循 `CC BY 4.0`；第三方依赖、提示词来源和用户自行接入的素材库遵循各自许可证或服务条款。
