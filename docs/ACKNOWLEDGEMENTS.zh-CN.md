# 致谢与参考边界

Image Agent Studio 是一个面向 OpenAI 兼容图片生成和编辑网关的独立前端工作站。

本项目在产品思路、提示词模板和实现方式上参考了社区提示词案例、公开 AI 创作工作流和开源前端工具。这些内容属于学习参考和提示词来源参考，不代表关联、赞助、代码归属、素材归属，也不代表本仓库是其他项目的分支。

## 本项目负责的内容

- `studio.html` 和 `src/studio.jsx` 中的创作工作流。
- 图片和视频工作台 UI、参数控制、参考图上传、Key 打码展示和历史图库面板。
- `src/aiGatewayClient.js` 中的 OpenAI 兼容网关接入逻辑。
- `scripts/image-agent-studio-history-service.mjs` 中的可选用户历史图库服务。
- `deploy/`、Docker、Nginx 相关部署示例。
- `docs/screenshots/` 中展示本项目界面的截图。

## 提示词模板来源

社区提示词项目和公开提示词案例只作为提示词来源参考和学习材料。

`docs/templates.md`、`public/cases.json` 以及后续模板数据中的提示词内容，适用时按 `CC BY 4.0` 社区提示词素材处理。使用、改编或再分发时，请保留原作者或来源归属。

当前已明确标注的提示词来源参考：

- [`signature-image-prompts-gpt-image-2.md`](https://github.com/zaizhi-1112/ai-image-extension-playbook/blob/main/signature-image-prompts-gpt-image-2.md) / [@liyue_ai](https://x.com/liyue_ai)，作为提示词模板学习材料引用。

后续增加提示词来源时，建议补充类似元数据：

```json
{
  "sourceName": "原始来源名称",
  "sourceUrl": "https://example.com/source",
  "license": "CC-BY-4.0",
  "usage": "仅作为提示词模板参考",
  "includesAssets": false
}
```

## 产品和工作流参考

公开 AI 生图工具、提示词图库和创作工作台产品，可作为产品和工作流参考。常见参考范围包括提示词编辑、参数控制、灵感卡片、历史图库、结果预览和受保护素材库。

本项目不包含第三方产品 UI 截图、私有图片、品牌素材或专有界面文件。

近期作为公开学习材料查看的 UI 与配置参考：

- [`basketikun/infinite-canvas`](https://github.com/basketikun/infinite-canvas)：参考画布节点、连线、悬浮工具、缩放控制和画布侧配置方式。
- [`codegrazier/cpa-image`](https://github.com/codegrazier/cpa-image)：参考紧凑设置、本地优先任务面板、队列状态和显式连接/模型同步动作。

## 开源依赖

应用基于 React、Vite 和 Lucide React 构建。这些依赖的授权以各自包元数据和上游仓库为准。

部署示例使用常见 Docker 和 Nginx 模式。这些示例是集成配置，不代表内置第三方服务。

## 图片与静态素材边界

开源仓库刻意不包含完整参考图库。

- 公开 demo 素材只应包含已生成或已确认可再分发的图片。
- 第三方项目图片、README 截图、封面、缩略图或私有参考图，不应复制进本仓库或公开静态包，除非其素材授权明确允许再分发。
- AI 生成图片仍可能涉及平台条款、人格权、商标或角色/IP 风险。公开 demo 图应避免包含可识别品牌、明星、受版权保护角色、水印或来源不清的参考元素。
- 私有生产素材库建议放在服务器、对象存储或 CDN 中，并在需要时通过登录态加载。

## 来源登记规则

后续增加模板、案例、提示词包或 demo 素材时，应在数据附近保留来源元数据。轻量 starter 数据可以登记到 `public/inspiration-sources.json`；私有素材包则建议在私有包内单独保留来源登记表。
