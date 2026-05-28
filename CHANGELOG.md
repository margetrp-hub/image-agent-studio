# Changelog

## 0.5.0 - 2026-05-28

这是 `image-sub2api-studio` 第一个可以作为学习成果和自托管版本发布的阶段版本。

- 生图链路改为图片模型直连 `/v1/responses`，`gpt-image-2` 不再降级为 `gpt-5.5 + image_generation tool`。
- 参考图编辑和 Mask 局部重绘走 `/v1/images/edits`。
- 新增无限画布式创作区，生成结果会留在当前会话；选中上一张图后可以继续续作。
- 优化 Key 展示，界面中只打码展示用户 Key。
- 增加本地开发代理 `VITE_DEV_SUB2API_PROXY_TARGET`，方便真实上游测试。
- 整理图片/视频工作区、模板库、灵感广场、历史记录和部署文档。
- 重新整理开源 README、致谢边界、素材库防爬策略和 VPS 更新流程。
