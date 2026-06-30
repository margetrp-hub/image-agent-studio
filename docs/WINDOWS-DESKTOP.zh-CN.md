# Windows 桌面打包

这一形态适合想把 Image Agent Studio 当成一个本地桌面工具使用的人。它不是把模型网关打包进 exe，而是把工作站 UI、本地历史/会话服务和本地静态服务器放在一个 Electron 应用里。

## 它包含什么

- 桌面窗口：打开构建后的 `studio.html`。
- 本地历史/会话服务：保存历史图库、当前会话、队列和生成图片。
- 本地数据目录：默认使用 Electron 的用户数据目录，不写入源码仓库。
- Provider 设置：仍然由用户选择官方 API、自定义 OpenAI 兼容接口、NewAPI 兼容部署、Sub2API 兼容部署或其他网关。

## 它不包含什么

- 不内置真实 API Key。
- 不内置账号池、计费系统或模型网关。
- 不把私有素材库硬塞进 exe。
- 不保证绕过任何上游模型权限或额度限制。

## 打包

```bash
npm install
npm run package:windows
```

产物目录：

```text
release/desktop/
```

发布时把生成的 installer 或 portable `.exe` 上传到 GitHub Releases。不要把 `.exe` 提交到 Git 仓库。

## 本地数据

桌面版会把数据放到 Electron 的用户数据目录下：

```text
Image Agent Studio/data/
```

里面保存：

- 历史图库。
- 当前画布会话。
- 生成任务状态。
- 已保存的生成图片资产。

如果要迁移桌面版数据，优先使用应用内备份；或者在关闭应用后复制这个数据目录。

## 调试

先确认 Web 版本能构建：

```bash
npm run build
```

再运行桌面打包：

```bash
npm run package:windows
```

如果桌面窗口打开但历史或队列不可用，重点检查：

- 本地端口是否被安全软件拦截。
- Electron 用户数据目录是否可写。
- Provider 的 Base URL 和 API Key 是否正确。
- 当前模型或 token group 是否有图片生成权限。
