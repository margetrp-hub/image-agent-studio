# Studio 轻量版

本包与同一 Release 的完整版来自同一提交；保留创作、历史和任务服务，账号、模型与消费由已有 Sub2API / New API 提供。没有独立注册、充值或管理入口。

1. 校验同 Release 的 `image-agent-studio-lite.sha256`，解压 `.tar.gz`。
2. 复制 `.env.example` 为 `.env`，填写网关地址与类型。默认使用 API Key。
3. 运行 `docker compose up -d --build`，打开 `http://127.0.0.1:8080/studio/`。镜像只安装必要服务依赖，无需编译前端。

Sub2API 已登录网页内嵌时，设置 `STUDIO_GATEWAY_AUTH=account`，并在 `STUDIO_EMBED_ORIGINS` 填写主站的精确 origin；主站通过 origin/source/state 校验的 postMessage 授权。New API 使用 API Key，或 account 模式手动填写账号令牌及用户编号。API Key 不写 URL；服务端凭据由网关验证。

对外访问由你现有的 HTTPS 反向代理转发到本地 8080，并设置 `STUDIO_ALLOWED_ORIGINS`。任务文件在 `studio-data` 卷；更新前备份该卷，使用同一 Compose project 名称替换程序并重新 build。不要执行 `down -v`。

旧 standalone 数据与 gateway 工作区身份不同；切换前从原账号导出备份，再在相应网关账号恢复。不要直接复用 auth.sqlite 或假设两个账号的目录一致。此包不更改网关余额。
