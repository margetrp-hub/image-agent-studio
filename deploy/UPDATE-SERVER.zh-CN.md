# 服务器更新：只更新核心包，不重复上传图库

适用场景：服务器上的图片库已经上传完整，后续只是更新页面、JS/CSS、JSON 数据或工作台功能。

> 长期 VPS 推荐改用 Git 同步部署，不再手动上传 zip。见 `docs/VPS-GIT-SYNC.zh-CN.md`。

## 结论

- 不要每次重新上传 `images/` 图库。
- 日常更新先上传 `image-sub2api-studio-core-update-*.zip`。
- 如果版本包含历史图库、当前会话、刷新恢复或服务端素材库改动，再上传 `image-sub2api-studio-service-update-*.zip`。
- 只有图片文件本身变了，才单独上传图片包或同步对象存储。

## 0.8 更新重点

- 生图默认直连 `/v1/images/generations` 的图片模型，例如 `gpt-image-2`。
- 参考图编辑和 Mask 局部重绘走 `/v1/images/edits`。
- 底部创作会话调用 `/v1/chat/completions` 做提示词优化。
- 当前画布、选中节点、提示词上下文、参数、进度和预览结果会通过 `/studio-api/session` 保存。
- 登录后的生图先进入 `/studio-api/generation-jobs`，由服务端完成上游调用、结果落盘和历史记录写入。
- 历史图库和左侧项目按会话归类，不再一张图拆成一个项目。
- 生图超时、停止或前端断开时会进入“待确认”，提醒上游可能仍在处理或已扣费。
- 服务器后台看到文生图入站和上游都是 `/v1/images/generations` 时，说明走的是正式图片生成链路。

## 本地打包原则

核心包只包含 `dist/` 的构建产物：

- `index.html`
- `studio.html`
- `favicon.svg`
- `cases.json`
- `inspirations.json`
- `inspiration-sources.json`
- `style-library.json`
- `studio-assets/`

注意：`studio.html` 必须来自 `dist/studio.html`。不要把仓库根目录的源码版 `studio.html` 直接上传，否则线上会引用 `/src/studio.jsx`，导致白屏。

核心包必须排除：

- `images/`
- `node_modules/`
- `dist/`
- `.env*`
- 旧版 zip 包

构建 `/studio/` 子路径版本：

```powershell
$env:STUDIO_BASE_PATH="/studio/"
npm run build
Remove-Item Env:\STUDIO_BASE_PATH
```

生成核心包和服务包：

```bash
node scripts/package-studio-core-update.mjs
```

脚本会同时生成两个包：

- `image-sub2api-studio-core-update-*.zip`：覆盖静态目录。
- `image-sub2api-studio-service-update-*.zip`：覆盖 `/opt/image-sub2api-studio`，用于更新历史/会话服务。

## 上传到服务器

```bash
scp release/image-sub2api-studio-core-update-YYYYMMDD-HHMMSS.zip user@YOUR_SERVER:/home/user/
scp release/image-sub2api-studio-service-update-YYYYMMDD-HHMMSS.zip user@YOUR_SERVER:/home/user/
```

## 在服务器覆盖更新

注意：不要删除服务器现有图片目录。

如果你的 Nginx 静态目录是示例目录：

```bash
sudo mkdir -p /var/www/image-sub2api-studio
sudo unzip -o /home/user/image-sub2api-studio-core-update-YYYYMMDD-HHMMSS.zip -d /var/www/image-sub2api-studio

sudo find /var/www/image-sub2api-studio -type d -exec chmod 755 {} \;
sudo find /var/www/image-sub2api-studio -type f -exec chmod 644 {} \;
```

如果你的线上站点实际读取 `/var/www/ohlaoo-studio`，就改成：

```bash
sudo mkdir -p /var/www/ohlaoo-studio
sudo unzip -o /home/user/image-sub2api-studio-core-update-YYYYMMDD-HHMMSS.zip -d /var/www/ohlaoo-studio

sudo find /var/www/ohlaoo-studio -type d -exec chmod 755 {} \;
sudo find /var/www/ohlaoo-studio -type f -exec chmod 644 {} \;
```

如果这次包含 `service-update` 包：

```bash
sudo mkdir -p /opt/image-sub2api-studio
sudo unzip -o /home/user/image-sub2api-studio-service-update-YYYYMMDD-HHMMSS.zip -d /opt/image-sub2api-studio

cd /opt/image-sub2api-studio
sudo npm ci --omit=dev
sudo systemctl restart image-sub2api-studio-history
curl http://127.0.0.1:8787/studio-api/health
```

## 验证

先确认新 JS/CSS 是否真实返回，不要只看入口页：

```bash
curl -I https://studio.example.com/studio/
curl -I https://studio.example.com/studio/studio-assets/studio-g-PhJdYt.js
curl -I https://studio.example.com/studio/studio-assets/studio-CNmg3NkT.css
curl -I https://studio.example.com/studio-api/health
```

实际 JS/CSS 文件名带 hash，以 `dist/studio.html` 里的 `<script>` 和 `<link>` 为准。

## 如果页面显示 `0 类`

先检查静态数据文件：

```bash
curl -I https://studio.example.com/studio/cases.json
curl -I https://studio.example.com/studio/inspirations.json
```

如果启用了 `/studio-api/library`，再检查：

```bash
curl -I https://studio.example.com/studio-api/health
```

如果要隐藏素材和提示词，不让它们通过浏览器直接看到，需要让历史/素材服务读取当前素材目录：

```ini
Environment=STUDIO_LIBRARY_DIR=/var/lib/image-sub2api-studio/library
Environment=STUDIO_LIBRARY_ASSET_DIR=/var/lib/image-sub2api-studio/library/images
```

确认 `/studio-api/library` 有数据后，再用 Nginx 屏蔽 `/studio/cases.json`、`/studio/inspirations.json` 和 `/studio/images/`。

## 什么时候才需要传图片

只有以下情况才需要传图片包：

- 新增、删除或替换了图片文件。
- 新增、删除或替换了缩略图。
- `cases.json` 引用了服务器上不存在的新图片。

服务器现有图库可用下面命令粗查：

```bash
find /var/www/image-sub2api-studio/images -maxdepth 1 -type f -name 'case*.jpg' | wc -l
find /var/www/image-sub2api-studio/images/thumbs -type f -name '*.webp' | wc -l
find /var/www/image-sub2api-studio/images/thumbs/category-covers -type f -name '*.webp' | wc -l
```

如果你的实际静态目录是 `/var/www/ohlaoo-studio`，把上面的路径替换掉即可。

如果数量和上次一致，并且页面能正常访问，就不需要重新上传图片库。
