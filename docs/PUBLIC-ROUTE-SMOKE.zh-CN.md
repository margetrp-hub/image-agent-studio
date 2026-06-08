# 线上页面路由验收

每次 VPS 从 GitHub 同步并部署完成后，除了确认页面能打开，还要确认线上页面实际加载了新构建，并且生成按钮没有走 `/v1/responses`。

## 命令

在仓库目录执行：

```bash
npm run smoke:public:route -- https://studio.ohlaoo.com/studio/
```

这个脚本会打开公网真实页面，注入一个测试用手动网关地址，并拦截上游请求返回 1px 假图片，不会消耗真实生图额度。

## 通过标准

输出里应该看到：

```json
{
  "ok": true,
  "requests": {
    "generations": [],
    "responses": [],
    "jobs": [
      {
        "method": "POST",
        "body": {
          "request": {
            "route": "generations"
          }
        }
      }
    ]
  }
}
```

含义：

- 浏览器只提交 `/studio-api/generation-jobs`。
- 服务端任务 route 是 `generations`。
- 生成按钮没有直接调用 `/v1/responses`。
- 生成按钮没有调用提示词助手 `/v1/chat/completions`。

## 常见失败

如果 `responses` 不为空，说明线上页面的生成按钮还在走旧路径。

如果 `jsAssets` / `cssAssets` 还是旧 hash，说明 VPS 没有真正部署最新构建，优先检查：

```bash
cd /opt/ai-image-workbench-repo
git rev-parse --short HEAD
curl -s https://studio.ohlaoo.com/studio/ | grep 'studio-assets'
```

如果公网页面仍然是旧 hash，再检查 Nginx 是否读取 `/var/www/ohlaoo-studio`，以及 `deploy/sync-from-git.sh` 是否真的完成。
