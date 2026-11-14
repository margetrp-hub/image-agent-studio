# 同源码自动轻量发布

每次在原仓库发布完整 Release，`publish-lite.yml` 自动检出该 tag 的提交，验证网关身份/任务/失败恢复，强制关闭管理前端后构建。无需第二仓库、长期轻量分支或手工删代码。日常 push 仍走 CI，不等同正式发布。

同一 Release 增加三个附件：`image-agent-studio-lite-<tag>.tar.gz`、`image-agent-studio-lite.sha256`、`image-agent-studio-lite.json`。JSON 固定 source SHA、包校验值及文件清单，是最后上传的完成回执。用户按 [包内说明](../deploy/lite/README.md) 启动。

发布入口是 GitHub Release 的 `published` 事件（含预发布）。工作流失败时由发布者查看 Actions 日志并重跑；也可手动运行 **Publish matching lite edition**，输入已有 Release tag。留空只验证并生成短期 Actions 附件，不创建正式版本。上传中断会先读回同名附件核对，完全相同才跳过；不同内容保留原件并报错，修正必须用新版本。不得修改已发布 tag 或用本地脏源码补发。

若未来完整版工作流使用 `GITHUB_TOKEN` 创建 Release，GitHub 不会再触发它引起的 release 事件。该工作流应在创建 Release 的 job 成功后直接调用本仓库的 reusable workflow：

```yaml
  lite:
    needs: release
    uses: ./.github/workflows/publish-lite.yml
    with:
      release_tag: ${{ needs.release.outputs.tag }}
    permissions:
      contents: write
```

这是 GitHub 的[事件防递归规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow#triggering-a-workflow-from-a-workflow)，不是依赖额外 PAT。现有 CI 不创建 Release。整个发布流程只分发程序，不触发 Sub 或 VPS 部署。旧 standalone 数据迁移仍需逐账号备份/恢复。

本地预览打包：`node scripts/package-lite.mjs`；带未提交更改的产物标记 `dirty`，上传程序会拒绝。CI 使用干净源码与锁文件，未跟踪美术和私有环境文件不进入轻量包。
