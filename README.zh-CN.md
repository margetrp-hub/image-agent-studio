# image-sub2api-studio

## 项目介绍

我做 `image-sub2api-studio`，最开始是一个很实际的需求：图片模型和 OpenAI 兼容接口已经能用了，但真正面向创作者的生图流程还是太散。

我不想让用户每次都去拼接口参数，也不想把提示词模板、参考图、历史图库和生成结果散在一堆页面里。这个项目想做的是一个轻量的 AI 生图创作工作站：选择接口和 Key、写提示词、拖拽或粘贴参考图、调整尺寸和画质、生成图片，再沿着上一张图一步步继续迭代。

Sub2API 是我最早接入的网关，因为它已经把账号、Key、额度、计费和 OpenAI 兼容图片接口接好了。但这个项目不想一直只绑定某一个反代或中转站。后续它会逐渐成为一个更通用的创作工作站：可以接官方 API，也可以接自定义 OpenAI 兼容接口、Sub2API、NewAPI 以及类似的图片生成网关。

`0.8.1` 继续把它从“能用的网页”往“创作工作台”推进。页面现在以无限画布和底部创作会话为中心：第一次生成会成为 #1，选中 #1 再生成会延伸出 #2 / #3，并用连线保留关系。点击单张图片时，可以看到完整保存下来的提示词，并按内容分段阅读。历史图库按会话保存，不再一张图一个项目；刷新、超时或停止后，也会尽量保留当前画布和已经收到的预览结果。

这个仓库只包含创作工作台本身，不包含私有生产首页、完整私有图库、真实 Key 或网关后端实现。

演示入口：[studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

## 交流

如果你也在做 AI 生图工作流，或者想一起讨论官方 API、自定义兼容接口、Sub2API、NewAPI、部署、模型调用、提示词工作流和后续改进，欢迎进 QQ 交流群：`260789529`。

<p align="center">
  <a href="https://github.com/margetrp-hub/image-sub2api-studio"><img src="https://img.shields.io/badge/project-image--sub2api--studio-0f766e?style=flat-square" alt="project"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f7268?style=flat-square" alt="MIT License"></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/lang-English-blue?style=flat-square" alt="English"></a>
</p>

## 0.8.x 做到了什么

- 生图默认走 `/v1/images/generations`，直接调用 `gpt-image-2` 等图片模型，避免误进 `/v1/responses` 的降级链路。
- 参考图编辑、Mask 局部重绘走 `/v1/images/edits`。
- 同一个工作台可以连接官方 OpenAI 风格接口、自定义 OpenAI 兼容网关、Sub2API、NewAPI 和类似服务。
- 底部创作会话可以调用对话模型来优化提示词，会明确使用当前选中 Key 的额度。
- 选中画布节点后继续生成，会按 #1 -> #2 / #3 的方式保留创作分支。
- 点击单张生成图时，会展示完整保存的提示词，并按主体、场景、风格、构图等内容分段阅读。
- 对话助手会尊重“衍生、局部修改、重写、不要、改成”等方向，不再强行把用户否定的旧内容带回来。
- 当前会话、画布节点、选中节点、参数、进度和预览结果会通过 `/studio-api/session` 持久化。
- 登录后的生图会先提交到 `/studio-api/generation-jobs`，由服务端调用 `/v1/images/generations` 或 `/v1/images/edits` 并保存结果；页面刷新后仍可从当前画布和历史图库恢复。
- 生图超时、停止或网络中断时，页面会进入“待确认”状态，提示上游可能仍在处理或已扣费，避免误导用户连续重复提交。
- 历史图库按会话展示，当前会话中的生成结果不会再在左侧项目里重复拆成多条。
- Key 只打码展示，避免在 UI 中直接暴露完整 Key。
- 左下角个人区提供中英界面切换和深浅色切换，跟账号入口放在一起。
- 模板/灵感内容可以作为 starter 数据，也可以改成登录后由 `/studio-api/library` 下发，方便生产环境保护私有素材。

## 截图

截图来自当前工作台界面，使用演示数据，Key 已打码。

![创作工作台中文界面](docs/screenshots/workstation-zh.png)

![创作工作台英文界面](docs/screenshots/workstation-en.png)

旧版功能截图：

- ![画布续作与生成状态](docs/screenshots/canvas-flow.png)
- ![图片参数与生成控制](docs/screenshots/image-controls.png)
- ![参考图上传](docs/screenshots/reference-upload.png)
- ![底部灵感与模板入口](docs/screenshots/template-library.png)
- ![Key 设置与打码展示](docs/screenshots/key-settings.png)
- ![历史图库](docs/screenshots/history.png)

## 边界说明

这个仓库不是模型供应商，也不是网关后端。它只负责创作工作台这一层。

官方 API、自定义兼容网关、Sub2API、NewAPI 等服务负责：账号、Key、额度、模型、计费和网关转发。

`image-sub2api-studio` 负责：创作页面、提示词工作流、参考图上传、参数控制、无限画布、画布续作、历史图库、当前会话持久化和部署示例。

提示词模板来自社区学习材料和公开案例整理，适用时遵循 `CC BY 4.0` 许可证；使用和改编时请保留原作者或来源归属。更完整的边界说明见 [致谢与参考边界](docs/ACKNOWLEDGEMENTS.zh-CN.md)。

## 审核与安全边界

开源包默认不包含真实 Key、完整私有图库、生产首页或任何网关后端实现。部署时需要自己接入官方 API 账号或已有 OpenAI 兼容网关，并按生产环境配置 Nginx、Docker、HTTPS 和持久化目录。

- 安全边界、密钥处理、数据落盘和生产加固建议见 [SECURITY.md](SECURITY.md)。
- 0.8 发布说明、升级影响和验证清单见 [RELEASE_NOTES.md](RELEASE_NOTES.md)。
- 代码授权范围见 [LICENSE](LICENSE)；提示词模板和社区内容不自动并入 MIT 代码授权。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev:studio
```

如果你本地页面需要直接调用云端 Sub2API，建议在 `.env.local` 里加：

```env
VITE_DEV_SUB2API_PROXY_TARGET=https://你的-sub2api-域名
```

这样本地页面请求 `/v1`、`/api`、`/login` 会由 Vite 代理到你的 Sub2API，浏览器不会因为跨域拦住真实测试。

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
VITE_SUB2API_BASE_URL=https://sub2api.example.com
VITE_SUB2API_GATEWAY_BASE_URL=https://sub2api.example.com
VITE_SUB2API_IMAGE_ROUTE=auto
VITE_SUB2API_RESPONSES_MODEL=gpt-5.5
VITE_SUB2API_LOGIN_URL=https://studio.example.com/login
VITE_STUDIO_HISTORY_BASE_URL=https://studio.example.com
VITE_STUDIO_BACK_URL=/
VITE_STUDIO_LIBRARY_AUTH_REQUIRED=false
VITE_DEV_SUB2API_PROXY_TARGET=https://sub2api.example.com
```

常用理解：

- `VITE_SUB2API_BASE_URL` 用于登录、用户资料、Key 列表，会自动补成 `/api/v1`。
- `VITE_SUB2API_GATEWAY_BASE_URL` 用于模型和生成接口，会自动补成 `/v1`。
- `VITE_SUB2API_IMAGE_ROUTE=auto` 是当前推荐模式：普通生图走 `/v1/images/generations`，参考图和 Mask 走 `/v1/images/edits`。
- 只有在你的上游明确支持并且你希望测试 `/v1/responses` 生图时，才把它改成 `responses`。
- `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` 适合生产环境把模板库后端化以后再开启。

## VPS 部署思路

推荐把它当成静态前端 + Node 历史/会话服务来部署：

```text
/var/www/image-sub2api-studio/    # 静态文件，示例目录
/opt/image-sub2api-studio/        # Node 历史/会话服务
/var/lib/image-sub2api-studio/    # 用户历史图库、当前会话和受保护素材库
```

如果你的 Nginx 实际读取的是另一个目录，就把核心包解压到那个目录。目录名不重要，关键是要和 Nginx `alias` 一致。

更多细节见：

- [部署指南](docs/DEPLOY.zh-CN.md)
- [Docker 生产部署](docs/DOCKER.zh-CN.md)
- [VPS 直接同步 Git 仓库部署](docs/VPS-GIT-SYNC.zh-CN.md)
- [服务器更新说明](deploy/UPDATE-SERVER.zh-CN.md)
- [安全边界说明](SECURITY.md)
- [Release Notes](RELEASE_NOTES.md)

如果是自己的长期 VPS，推荐使用 Git 同步部署，让服务器直接从仓库拉取、构建、覆盖静态目录并重启服务：

```bash
cd /opt/image-sub2api-studio-repo

sudo BRANCH=main \
  REPO_DIR=/opt/image-sub2api-studio-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

服务器上如果已经有图片库，后续 zip 更新通常只需要上传核心包，不需要重复上传图库。Git 同步模式下则不需要再手动上传 zip。

```bash
node scripts/package-studio-core-update.mjs
```

这个命令会同时生成：

- `image-sub2api-studio-core-update-*.zip`：覆盖静态目录。
- `image-sub2api-studio-service-update-*.zip`：覆盖 `/opt/image-sub2api-studio`，用于更新历史/会话服务。

0.8 需要服务包，因为刷新恢复、当前画布会话和历史图库都依赖 `/studio-api/session` 与 `/studio-api/history`。

## Docker 部署

仓库也提供了 Docker Compose 形态，适合新服务器或开源用户一键启动：

```bash
cp .env.example .env
docker compose up --build -d
```

默认会启动两个容器：

- `studio-web`：Nginx 静态前端和同域反向代理。
- `studio-history`：Node 历史图库、当前会话和生成结果持久化服务。

数据会保存在 `studio-data` volume。只要不执行 `docker compose down -v`，更新镜像不会丢历史图库和当前画布。

如果 Sub2API 跑在宿主机 `127.0.0.1:8080`，保持：

```env
SUB2API_UPSTREAM=http://host.docker.internal:8080
```

如果 Sub2API 是远程域名，把它改成：

```env
SUB2API_UPSTREAM=https://你的-sub2api-域名
```

完整说明见 [Docker 生产部署](docs/DOCKER.zh-CN.md)。

## 素材库和防爬

前端已经加载的图片、JSON 和提示词，不可能只靠前端彻底隐藏。生产环境如果不希望别人直接 F12 或爬虫拿走素材，建议：

- GitHub 仓库只放轻量 starter JSON，不放完整图库。
- 私有模板和素材走 `/studio-api/library`，登录后再返回。
- Nginx 阻断 `/studio/images/`、`/studio/cases.json`、`/studio/inspirations.json` 的静态访问。
- 加 `X-Robots-Tag: noindex, nofollow, noarchive`，降低搜索引擎收录。

仓库里的 `deploy/nginx-sub2api-studio.conf` 已经放了基础示例。

## Sub2API 合约检查

```bash
SUB2API_BASE_URL=https://sub2api.example.com \
SUB2API_EMAIL=you@example.com \
SUB2API_PASSWORD='your-password' \
npm run check:sub2api
```

这个检查只验证登录、用户资料和 Key 列表，不会发起付费生成。

## 目录结构

```text
.
├── src/
│   ├── studio.jsx                         # 创作工作台主界面
│   ├── studio.css                         # 工作台样式
│   ├── sub2apiClient.js                   # Sub2API / OpenAI 兼容接口客户端
│   └── studio/                            # 纯函数工具与本地存储工具
├── scripts/
│   ├── image-sub2api-studio-history-service.mjs
│   ├── check-sub2api-contract.mjs
│   └── package-studio-core-update.mjs
├── deploy/
│   ├── nginx-sub2api-studio.conf
│   ├── docker-nginx.conf.template
│   ├── image-sub2api-studio-history.service
│   └── UPDATE-SERVER.zh-CN.md
├── docs/
│   ├── DEPLOY.zh-CN.md
│   ├── DOCKER.zh-CN.md
│   ├── open-source-config.zh-CN.md
│   ├── sub2api-studio-overlay.md
│   ├── templates.md
│   └── screenshots/
├── SECURITY.md                           # 安全边界和生产加固说明
├── RELEASE_NOTES.md                      # 当前版本发布说明
├── public/
│   ├── cases.json
│   ├── inspirations.json
│   ├── inspiration-sources.json
│   └── style-library.json
└── studio.html
```

## 作者与授权

维护者：[@margetrp-hub](https://github.com/margetrp-hub)

代码按 [MIT License](LICENSE) 开源。提示词模板内容来自社区，适用时遵循 `CC BY 4.0` 许可证；第三方依赖、第三方提示词来源和用户自行接入的素材库按各自许可证或服务条款处理。
