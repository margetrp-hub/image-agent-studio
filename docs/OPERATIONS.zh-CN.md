# Image Agent Studio 运维手册

本手册说明后台配置、供应商运营、数据备份和版本维护。管理后台入口为 `/studio/admin.html`，需要独立工作台的管理员账号。

## 后台与配置归属

后台按左侧导航分为七个页面。页面切换保留注册、积分设置的草稿；每页单独保存，刷新管理数据不会覆盖未保存的修改。刷新浏览器或离开后台前会提示未保存配置。

| 页面 | 管理内容 | 保存位置与生效方式 |
| --- | --- | --- |
| 运营概览 | 用户数量、可用积分、累计消耗、运行策略 | 读取真实账户与账务统计 |
| 用户账户 | 搜索、状态筛选、积分调账、禁用、一次性密码重置码 | 账户数据库；重置码完成重置后失效 |
| 供应商与定价 | 上游地址、调用协议、密钥、模型发现、发布状态与积分单价 | 数据库加密保存密钥；发布后用于新任务 |
| 注册与账户 | 公开注册、外部账户关联 | SQLite `studio_settings`；保存后立即生效 |
| 积分与充值 | 积分总开关、新用户奖励、充值入口、兑换码开关 | SQLite `studio_settings`；不重算历史账务 |
| 兑换码 | 创建、复制、状态与停用 | 数据库存哈希；完整兑换码仅生成时返回 |
| 系统运行 | 部署参数、版本状态、手动检查并更新 | 参数只读；环境配置修改后需重启服务 |

数据库中的设置与部署环境不是同一层：

| 配置范围 | 后台可调整 | 部署环境控制 |
| --- | --- | --- |
| 注册 | 开放注册开关、新用户奖励 | `STUDIO_AUTH_REGISTRATION_MODE` 是总闸门；值为 `disabled` 时后台不能强行开放 |
| 登录与密码 | 禁用账户、生成重置码 | 密码长度与迭代次数、会话期限、失败限流、登录并发与请求大小 |
| 供应商 | 新增、编辑、同步模型、发布、停用、模型定价 | `STUDIO_MASTER_KEY`、`STUDIO_ALLOW_PRIVATE_PROVIDER_URLS`；密钥不可通过后台读回 |
| 账户关联 | 允许用户绑定外部账户 | `STUDIO_MASTER_KEY` 必须配置；绑定记录属于各自用户 |
| 任务 | 平台模型是否发布及价格 | 并发、超时、视频轮询间隔与容错次数；并发为 0 表示工作台不设上限 |
| 文件与历史 | 不在本轮后台开放运行中改路径 | 数据目录、数据库位置、素材库路径、历史保留数量、图片与视频大小限制 |
| 网络与嵌入 | 不作为一般运营设置 | 监听地址、域名、允许的 Origin、嵌入父站与可信入口 |
| 版本维护 | 查看状态、确认后更新 | 更新服务、备份路径、版本来源与回滚材料 |

不要把数据库路径、主加密密钥、Origin 列表做成普通用户可修改字段。备份账户数据库时，同时保管服务端主加密密钥；只有数据库而没有密钥无法恢复供应商凭据。运行配置页不显示密钥和服务器文件路径。

## 内置供应商与积分调用

工作台有两条独立的调用路径：

- **用户自带 Key / 关联账户**：调用用户自己的上游账户，不扣工作台平台积分；上游自行计费。
- **平台供应商**：管理员保存上游凭据，发布可用模型与积分价；用户选择平台模型，无需得到供应商 Key。

启用步骤：

1. 在服务器配置 `STUDIO_MASTER_KEY`，启动服务后确认“系统运行”显示已配置加密。
2. 在“供应商与定价”创建连接，选择真实上游对应的调用协议，填入地址与 Key。新建供应商默认停用。
3. 同步模型。发现模型不代表已支持调用；只有已有调用适配器的模型才能用于对应图片、编辑或视频任务。
4. 为要发布的操作填写积分单价并发布模型。图片按张计费，编辑按输出张数计费，视频按任务计费。未定价的操作不可调用；填写 0 表示明确允许免费调用。
5. 启用供应商，在“积分与充值”开启积分。用户工作台即可选择已发布的平台模型。

新发现模型默认不发布；同步保留已有价格，消失的模型退出可调用目录。更换上游地址、协议或凭据后需重新同步和确认，避免旧模型目录误用于新连接。平台目录只向用户提供名称、模型、能力与价格，不下发供应商 Key。

费用在服务端按发布价格计算。客户端显示的估价不是扣费依据，客户端也不能通过指定价格覆盖服务端配置。任务创建时记录费用与供应商来源；重复请求不重复扣款，明确失败按原始扣费流水退回，不按更新后的价格退款。批量任务部分成功时，已交付图片按原单价保留扣费，只退未交付部分。上游结果不明的任务保留待核对状态，不以猜测结果结算。修改定价只影响之后的新任务。

从用户备份导入的未完成任务统一标为待核对，不会凭导入文件自动恢复执行或生成退款。平台视频在服务自身重启后的恢复，需要与数据库中原始任务扣费及上游任务编号匹配。

这一版使用整数积分、按输出张数或视频任务定价。按分辨率、秒数、Token 用量、用户分组折扣、供应商采购成本和利润报表尚未实现；不要把上游金额直接当作平台积分。后续扩展应沿用模型价目、任务费用快照和积分流水，不再向页面增加独立计费逻辑。

旧的 `STUDIO_PROVIDER_*` 部署级连接继续使用默认生图、编辑、视频单价；新建后台供应商使用各自模型价格。`STUDIO_USER_PROVIDER_ONLY` 决定旧部署级默认连接是否启用，不会自动启用后台新建的供应商。

## 一键备份

备份会导出当前授权用户的数据快照：

- 历史图库 `records.json`
- 当前会话 `session.json`
- 生成任务队列 `jobs.json`
- 本地化图片资产 `assets/`
- 备份 manifest、版本号和计数

```bash
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
export STUDIO_BACKUP_TOKEN='你的登录 token 或 API token'
export STUDIO_BACKUP_DIR=./backups

npm run ops:backup
```

备份文件会写入 `STUDIO_BACKUP_DIR`，格式是 `image-agent-studio-backup-*.json`。

## 一键恢复

恢复前服务端会自动生成一份 `pre-restore` 快照，避免误恢复后没有回退点。

```bash
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
export STUDIO_BACKUP_TOKEN='你的登录 token 或 API token'

npm run ops:restore -- ./backups/image-agent-studio-backup-xxxx.json
```

恢复会替换当前用户的历史图库、当前会话、生成任务和图片资产。它不会恢复其他用户的数据。

## Docker 正式升级

标准升级流程：

```bash
git pull
export STUDIO_PUBLIC_BASE_URL=https://studio.example.com
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
export STUDIO_BACKUP_TOKEN='你的登录 token 或 API token'
npm run ops:upgrade
```

`ops:upgrade` 会依次执行：

1. `ops:backup` 自动备份当前用户数据
2. `docker compose pull`
3. `docker compose build`
4. `docker compose up -d`
5. `ops:self-check` 验证 `/studio/` 和 `/studio-api/health`

如果服务器使用自定义 env 文件：

```bash
STUDIO_ENV_FILE=.env.production npm run ops:upgrade
```

临时跳过备份：

```bash
STUDIO_SKIP_BACKUP=true npm run ops:upgrade
```

除非你明确要清空历史图库，不要执行：

```bash
docker compose down -v
```

## 升级后自检

```bash
export STUDIO_PUBLIC_BASE_URL=https://studio.example.com
export STUDIO_HISTORY_BASE_URL=https://studio.example.com
npm run ops:self-check
```

自检会确认：

- `/studio/` 能返回工作站页面
- `/studio-api/health` 正常返回
- health payload 带有服务名、版本号和启动时间

## 统一错误字典

错误不要直接把上游英文抛给用户。统一归类成四段：

- 用户看的中文大类
- 运营看的技术原因
- 是否可重试
- 推荐下一步动作

当前字典入口：

```text
src/studio/errors/catalog.js
```

检查：

```bash
npm run check:errors
```

后续生图、邮箱助手、账号同步、模型同步都应该逐步接入同一套字典。
