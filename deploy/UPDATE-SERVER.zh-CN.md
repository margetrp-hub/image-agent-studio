# 服务器更新：只更新核心包，不重复上传图库

适用场景：服务器上的图片库已经上传完整，后续只是更新页面、JS/CSS、JSON 数据或工作台功能。

## 结论

- 不要每次重新上传 `images/` 图库。
- 日常更新只上传 `image-sub2api-studio-core-update-*.zip`。
- 只有图片文件本身变了，才单独上传图片包或同步对象存储。

## 0.5 更新重点

- 生图默认直连 `/v1/responses` 的图片模型，例如 `gpt-image-2`。
- 参考图编辑和 Mask 局部重绘走 `/v1/images/edits`。
- 服务器后台看到入站和上游都是 `/v1/responses` 时，说明没有走旧的降级链路。
- 如果服务器上图片库已经完整，0.5 更新只需要上传核心包。

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

生成核心包：

```bash
node scripts/package-studio-core-update.mjs
```

## 上传到服务器

```bash
scp release/image-sub2api-studio-core-update-YYYYMMDD-HHMMSS.zip user@YOUR_SERVER:/home/user/
```

## 在服务器覆盖更新

注意：不要删除服务器现有图片目录。

```bash
cd /var/www/image-sub2api-studio

sudo unzip -o /home/user/image-sub2api-studio-core-update-YYYYMMDD-HHMMSS.zip -d /var/www/image-sub2api-studio

sudo find /var/www/image-sub2api-studio -type d -exec chmod 755 {} \;
sudo find /var/www/image-sub2api-studio -type f -exec chmod 644 {} \;
```

## 验证

先确认新 JS/CSS 是否真实返回，不要只看入口页：

```bash
curl -I https://studio.example.com/studio/
curl -I https://studio.example.com/studio/studio-assets/
curl -I https://studio.example.com/studio/cases.json
curl -I https://studio.example.com/studio/inspirations.json
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

如果数量和上次一致，并且页面能正常访问，就不需要重新上传图片库。
