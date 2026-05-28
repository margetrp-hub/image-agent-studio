# image-sub2api-studio

我做 `image-sub2api-studio`，是因为 Sub2API 已经把模型、Key、额度和 OpenAI 兼容接口接好了，但真正面向创作者的生图工作台还缺一层。

我不想让用户每次都去拼接口参数，也不想把提示词模板、参考图、历史记录和生成结果散在一堆页面里。所以这个项目把这些东西收进一个轻量的 Web 工作台：登录 Sub2API、选择自己的 Key、写提示词、拖拽或粘贴参考图、调整尺寸和画质、生成图片、继续沿着上一张图迭代。

`0.5.0` 是我认为可以拿出来给大家学习和自托管的第一个阶段版本。它不包含我的线上 Oh Laoo 首页，也不包含完整私有图库；它只开源这个基于 Sub2API 的生图工作站。

演示入口：[studio.ohlaoo.com/studio/](https://studio.ohlaoo.com/studio/)

<p align="center">
  <a href="https://github.com/margetrp-hub/image-sub2api-studio"><img src="https://img.shields.io/badge/project-image--sub2api--studio-0f766e?style=flat-square" alt="project"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-1f7268?style=flat-square" alt="MIT License"></a>
  <a href="./README.md"><img src="https://img.shields.io/badge/lang-English-blue?style=flat-square" alt="English"></a>
</p>

## 0.5 版本做到了什么

这一版我重点把“能真实使用”打通了：

- 生图默认走 `/v1/responses`，`gpt-image-2` 等图片模型会直连调用，不再降级成 `gpt-5.5 + image_generation tool` 的兼容路径。
- 参考图编辑、Mask 局部重绘走 `/v1/images/edits`。
- 页面可以从 Sub2API 同步用户 Key，并且只打码展示，不把完整 Key 暴露在 UI 上。
- 生成结果会进入当前会话画布，也会进入历史记录；选中一张画布继续生成时，会保留上一轮提示词脉络。
- 本地开发增加 Vite 代理，避免 `127.0.0.1` 调云端 Sub2API 时被浏览器 CORS 拦住。
- 图片和视频工作区分开，视频区保留为后续扩展入口，不再和生图灵感混在一起。
- README、部署说明、Docker/Nginx 示例、素材库边界和开源致谢都重新整理过。

## 截图

截图来自当前 0.5 工作台界面，使用演示数据，Key 已打码。

![创作工作台主界面](docs/screenshots/studio-main.png)

![画布续作与生成状态](docs/screenshots/canvas-flow.png)

![图片参数与生成控制](docs/screenshots/image-controls.png)

![参考图上传](docs/screenshots/reference-upload.png)

![模板库与灵感广场](docs/screenshots/template-library.png)

![Key 设置与打码展示](docs/screenshots/key-settings.png)

![历史记录](docs/screenshots/history.png)

## 我把边界讲清楚

这个仓库不是 Sub2API 本体，也不是模型转发服务。它只负责创作工作台这一层。

Sub2API 负责：账号、Key、额度、模型、计费、OpenAI 兼容网关。

`image-sub2api-studio` 负责：创作页面、提示词工作流、参考图上传、参数控制、画布续作、历史记录和部署示例。

提示词模板来自社区学习材料和公开案例整理，适用时遵循 `CC BY 4.0` 许可证；使用和改编时请保留原作者或来源归属。更完整的边界说明见 [致谢与参考边界](docs/ACKNOWLEDGEMENTS.zh-CN.md)。

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
VITE_SUB2API_IMAGE_ROUTE=responses
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
- `VITE_SUB2API_IMAGE_ROUTE=responses` 是当前推荐模式。图片模型直连 `/v1/responses`。
- `legacy` 只保留给 `/v1/images/generations` 兼容场景。
- `VITE_STUDIO_LIBRARY_AUTH_REQUIRED=true` 适合生产环境把模板库后端化以后再开启。

## VPS 部署思路

我推荐把它当成静态前端 + 可选历史服务来部署：

```text
/var/www/image-sub2api-studio/    # 静态文件
/opt/image-sub2api-studio/        # 可选 Node 历史服务
/var/lib/image-sub2api-studio/    # 用户历史和受保护素材库
```

更多细节见：

- [部署指南](docs/DEPLOY.zh-CN.md)
- [Docker 快速部署](docs/DOCKER.zh-CN.md)
- [服务器更新说明](deploy/UPDATE-SERVER.zh-CN.md)

服务器上如果已经有图片库，后续更新通常只需要上传核心包，不需要重复上传图库。

```bash
node scripts/package-studio-core-update.mjs
```

## 素材库和防爬

前端已经加载的图片、JSON 和提示词，不可能只靠前端彻底隐藏。生产环境如果不希望别人直接 F12 或爬虫拿走素材，我建议：

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
│   ├── docker-nginx.conf
│   ├── image-sub2api-studio-history.service
│   └── UPDATE-SERVER.zh-CN.md
├── docs/
│   ├── DEPLOY.zh-CN.md
│   ├── DOCKER.zh-CN.md
│   ├── open-source-config.zh-CN.md
│   ├── sub2api-studio-overlay.md
│   ├── templates.md
│   └── screenshots/
├── public/
│   ├── cases.json
│   ├── inspirations.json
│   ├── inspiration-sources.json
│   └── style-library.json
└── studio.html
```

## 作者与授权

维护者：[@margetrp-hub](https://github.com/margetrp-hub)

代码按 [MIT License](LICENSE) 开源。提示词模板内容来自社区，适用时遵循 `CC BY 4.0` 许可证。
