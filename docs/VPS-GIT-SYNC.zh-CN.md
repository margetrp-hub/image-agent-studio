# VPS 直接同步 Git 仓库部署

这份说明用于把 VPS 更新方式从“本地打包 zip 后上传”改成“服务器直接同步 Git 仓库”。目标是让仓库和 VPS 保持同一节奏：

- Git 仓库是唯一代码来源。
- VPS 每次从 GitHub 拉取指定分支。
- VPS 本地构建 `dist/`，再覆盖 Nginx 静态目录。
- Node 历史/会话服务从同一份仓库更新。
- `/var/lib/image-sub2api-studio` 是生产持久化目录，不跟随 Git 覆盖。

> 说明：项目正在逐步更名为 Image Agent Studio，但生产数据目录仍默认沿用 `/var/lib/image-sub2api-studio`。这是为了避免历史图库、当前会话、队列任务、生成图片和受保护素材库在升级后“看起来消失”。

## 当前线上路径

当前线上建议保持这些路径：

```text
/opt/ai-image-workbench-repo/    # Git 仓库 checkout
/var/www/ohlaoo-studio/            # Nginx 实际读取的静态目录
/opt/image-sub2api-studio/         # Node 历史/会话服务运行目录
/var/lib/image-sub2api-studio/     # 历史图库、当前会话、队列任务、受保护素材库
```

不要再把静态包解压到 `/var/www/image-sub2api-studio`，除非 Nginx 也同步改成读取那个目录。

## 第一次接入

安装基础依赖：

```bash
sudo apt-get update
sudo apt-get install -y git nodejs npm
```

拉取仓库：

```bash
sudo git clone https://github.com/margetrp-hub/ai-image-workbench.git \
  /opt/ai-image-workbench-repo
```

执行同步部署：

```bash
cd /opt/ai-image-workbench-repo

sudo BRANCH=main \
  REPO_DIR=/opt/ai-image-workbench-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

`REQUIRE_LIBRARY=1` 会要求受保护素材库必须存在。线上私有素材库至少应该包含：

```text
/var/lib/image-sub2api-studio/library/cases.json
/var/lib/image-sub2api-studio/library/inspirations.json
/var/lib/image-sub2api-studio/library/style-library.json
/var/lib/image-sub2api-studio/library/images/
```

如果这一步提示素材库不完整，先迁移旧素材库，不要关闭校验硬上线。

## 日常更新

以后每次仓库更新后，在 VPS 上只跑：

```bash
cd /opt/ai-image-workbench-repo

sudo BRANCH=main \
  REPO_DIR=/opt/ai-image-workbench-repo \
  STATIC_DIR=/var/www/ohlaoo-studio \
  SERVICE_DIR=/opt/image-sub2api-studio \
  DATA_DIR=/var/lib/image-sub2api-studio \
  BASE_PATH=/studio/ \
  PUBLIC_STUDIO_URL=https://studio.ohlaoo.com/studio/ \
  REQUIRE_LIBRARY=1 \
  bash deploy/sync-from-git.sh
```

脚本会自动完成：

1. 从 GitHub 拉取 `main` 分支。
2. 安装依赖并本地构建 `/studio/` 子路径版本。
3. 覆盖 `/var/www/ohlaoo-studio` 的静态文件和 `studio-assets/`。
4. 更新 `/opt/image-sub2api-studio` 里的历史/会话服务脚本。
5. 写入 systemd runtime overrides，保留 `DATA_DIR`。
6. 重启 `image-sub2api-studio-history`。
7. 校验 `studio.html`、JS/CSS hash 文件、健康检查、素材库数量和 Nginx 配置。

## 素材库恢复

如果更新后灵感广场或素材库为空，先检查受保护素材库：

```bash
for f in /var/lib/image-sub2api-studio/library/cases.json \
  /var/lib/image-sub2api-studio/library/inspirations.json \
  /var/lib/image-sub2api-studio/library/style-library.json; do
  [ -f "$f" ] || continue
  echo "== $f =="
  sudo node -e "const fs=require('fs'); const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); for (const [k,v] of Object.entries(j)) if (Array.isArray(v)) console.log(k, v.length);" "$f"
done

sudo find /var/lib/image-sub2api-studio/library/images \
  -type f \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' \) | wc -l
```

旧完整素材索引曾出现在这些位置：

```text
/home/margetrp/ohlaoo-home-overlay-v47-gallery-20260519-142434/public
/home/margetrp/ohlaoo-studio-backup-20260518-202731
/var/www/ohlaoo-overlay
```

恢复命令示例：

```bash
OLD_PUBLIC=/home/margetrp/ohlaoo-home-overlay-v47-gallery-20260519-142434/public
NEW_LIBRARY=/var/lib/image-sub2api-studio/library

sudo install -d -o www-data -g www-data -m 750 "$NEW_LIBRARY"

sudo install -o www-data -g www-data -m 640 "$OLD_PUBLIC/cases.json" "$NEW_LIBRARY/cases.json"
sudo install -o www-data -g www-data -m 640 "$OLD_PUBLIC/inspirations.json" "$NEW_LIBRARY/inspirations.json"
sudo install -o www-data -g www-data -m 640 "$OLD_PUBLIC/style-library.json" "$NEW_LIBRARY/style-library.json"
sudo cp -a "$OLD_PUBLIC/images" "$NEW_LIBRARY/"

sudo chown -R www-data:www-data /var/lib/image-sub2api-studio
sudo find /var/lib/image-sub2api-studio -type d -exec chmod 750 {} \;
sudo find /var/lib/image-sub2api-studio -type f -exec chmod 640 {} \;
sudo systemctl restart image-sub2api-studio-history
```

## 验证

更新后先验证本地服务：

```bash
systemctl is-active image-sub2api-studio-history
curl -s http://127.0.0.1:8787/studio-api/health
```

再验证公网入口和静态资源。JS/CSS 文件名以线上 `studio.html` 里的 hash 为准：

```bash
curl -I https://studio.ohlaoo.com/studio/
curl -s https://studio.ohlaoo.com/studio/ | grep 'studio-assets'
curl -I https://studio.ohlaoo.com/studio-api/health
```

如果 JS/CSS 返回 `text/html`，说明 Nginx fallback 或静态路径错了，会导致白屏。必须先修静态目录和 `/studio/studio-assets/` alias。

## 原则

- 代码和文档跟 Git 走。
- 构建产物在 VPS 本地生成。
- 静态目录可以覆盖，持久化目录不能覆盖。
- 开源 starter JSON 可以随仓库更新，生产私有素材库放在 `/var/lib/image-sub2api-studio/library`。
- 每次更新必须看脚本最后的校验结果，不能只看页面能不能打开。
