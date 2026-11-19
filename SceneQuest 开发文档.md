# 景中局 SceneQuest 技术开发文档（当前实现）

版本：2.1 · 与旧版规划不一致时以本文和当前源码为准。

## 1. 技术栈与运行模式

- Web：原生 HTML/CSS/JavaScript 单页界面（`index.html`、`styles.css`、`app.js`），不使用旧规划中的 React/Vite。
- API：Node.js 20+、Express、Socket.IO、Zod。
- 数据：PostgreSQL，`pg` 连接池与 SQL 迁移；房间快照存 JSONB，事件和成员分别存表。
- AI：后端 OpenAI-compatible Chat Completions API；文本生成和照片视觉验收可用不同模型。
- 景区检索：Nominatim 地理编码、Overpass/OSM POI；可选 Tavily 网页搜索。
- 本地预览：`preview-server.js` 无依赖、内存状态，只模拟剧本生成、证据判定和设置界面；不连接真实 AI、PostgreSQL，也不持久化密钥。

## 2. 实际目录

```text
SceneQuest/
├─ index.html / app.js / styles.css       # 游客 SPA 与管理员登录/设置页
├─ preview-server.js                      # 本地 UI 流程模拟器
├─ apps/api/src/
│  ├─ server.js                            # Express REST、Socket.IO、事务和鉴权
│  ├─ db.js                                # PostgreSQL pool 与迁移
│  ├─ venue-discovery.js                   # 地理编码/OSM/Tavily 搜索
│  ├─ ai.js                                # 完整剧本生成、AI 验收、连接测试
│  ├─ stories.js                           # AI 输出 schema 与地点/安全校验
│  ├─ story-builder.js                     # 保存完整故事并裁剪公开响应
│  └─ narrative-provider.js                # 游戏过程 AI 旁白
├─ infra/docker-compose.yml                # PostgreSQL 开发容器
├─ .env.example                            # 服务端配置模板
├─ README.md
├─ SceneQuest PRD.md
└─ docs/                                   # 产品、API、安全、部署细则
```

## 3. 主要请求链路

### 3.1 生成景区故事

```text
游客点击定位/填写景区
  → POST /api/v1/stories/generate
  → 服务端地理编码（若无坐标）
  → Overpass 搜索公开 POI，可选 Tavily 搜索网页
  → AI 返回 JSON 剧本
  → Zod 字段校验、POI 白名单、安全词校验、积分范围校验
  → sq_stories 保存完整故事
  → 响应只返回公开任务/角色简介/来源，不返回私有目标、线索或验收标准
  → POST /api/v1/sessions 创建房间
```

任何地理发现或 AI 生成失败都返回错误，不回退到固定人工剧本。AI 输出必须将地点限定在发现结果内；故事文本明确为原创虚构，来源保存于剧本。

### 3.2 大厅与邀请

```text
POST /sessions 创建房主和 LOBBY
POST /sessions/join 使用邀请码加入（最多 5 人）
GET /sessions/:id/invite-qr 生成加入 URL 的二维码
POST /sessions/:id/start 队长开局，按角色分配私有目标和线索
Socket.IO session:subscribe 同步公共快照和目标玩家的私有更新
```

QR 的 payload 为站点根路径加 `?join=<inviteCode>`，不绑定场景/地点，也不完成任务。生产环境应将 `WEB_ORIGIN` 设置为玩家设备可访问的 HTTPS 公开域名。

### 3.3 AI 证据验收和记分

```text
POST /sessions/:id/tasks/:taskId/submissions
  → 校验玩家属于房间、房间进行中、任务有效、证据格式和大小
  → 将任务隐藏验收标准 + 文字 + 可选照片发给 AI
  → AI 返回 approved/confidence/feedback
  → 置信度不足强制拒绝
  → PostgreSQL session 锁和事务二次检查重复完成
  → 只更新提交玩家 private_state 积分/完成任务
  → 写事件并广播已提交结果
```

AI 不拥有数据库写权限。AI 报错、密钥缺失或输出非法时不给分。积分值来自经 schema 校验的 AI 剧本，积分增减和道具库存由事务处理。

### 3.4 管理员后台设置

前端从右上角进入专门的登录屏。登录后显示 AI/后端设置控制台，表单字段包括：

- `AI_PROVIDER`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`、`AI_VISION_MODEL`
- `TAVILY_API_KEY`、`TAVILY_BASE_URL`
- `OVERPASS_URL`、`DISCOVERY_RADIUS_METERS`

密钥只写入服务端根目录 `.env`，GET 接口只返回 `hasApiKey` / `hasTavilyKey` 状态。空值默认保留已有密钥；勾选清除才将其置空。`persistEnv()` 更新 `.env` 后同步当前 `process.env`，所以运行中的服务立即使用新设置。部署环境必须让 API 进程对 `.env` 有写权限；如配置通过容器 Secret/环境变量管理，应改用运维密钥管理方式并禁用文件写入。

管理员认证：

- `GET /api/v1/admin/settings/status`：只返回是否需要首次初始化及是否为预览服务。
- `POST /api/v1/admin/settings/bootstrap`：仅非生产环境首次创建管理员口令，至少 24 字符；生产环境禁止 bootstrap。
- `GET/PUT /api/v1/admin/settings/ai`：通过 `X-Admin-Token` 鉴权读取/更新配置。
- `POST /api/v1/admin/settings/test-ai`：通过已配置模型发起低成本结构化请求。
- 完整后端生产启动要求强随机 `ADMIN_TOKEN` 和 `TOKEN_PEPPER`（至少 32 字符）。诊断、模式切换、重置使用更严格的管理调试开关。
- 管理令牌只保存在前端当前内存中；重新加载页面后需要重新登录。

### 3.5 API 一览

基址：`/api/v1`。玩家接口用 `Authorization: Bearer <accessToken>`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/stories` | 查询已生成故事摘要 |
| POST | `/stories/generate` | 自动搜集景区资料并由 AI 生成故事 |
| POST | `/sessions` | 使用生成的 storyId 创建房间 |
| POST | `/sessions/join` | 通过邀请码加入 |
| GET | `/sessions/:id/invite-qr` | 生成邀请二维码 |
| GET | `/sessions/:id` | 获取按玩家权限裁剪的快照 |
| GET | `/sessions/:id/me` | 获取当前玩家个人信息 |
| POST | `/sessions/:id/start` | 房主开始游戏并分配角色 |
| POST | `/sessions/:id/tasks/:taskId/submissions` | AI 证据验收；通过后个人记分 |
| POST | `/sessions/:id/clues/:clueId/share` | 玩家主动分享被授权线索 |
| GET | `/rewards` | 查询兑换道具 |
| POST | `/sessions/:id/rewards/:rewardId/redeem` | 个人积分兑换道具 |
| POST | `/sessions/:id/leave` | 离开房间 |
| GET | `/admin/sessions/:id/diagnostics` | 管理员查看房间事件/模型运行诊断 |
| POST | `/admin/sessions/:id/mode` | 管理员调试模式切换 |
| POST | `/admin/sessions/:id/reset` | 管理员明确确认后重置房间 |

## 4. 数据模型与权限

核心表：

- `sq_stories`：AI 生成的完整剧本 JSON、版本、公开摘要和来源。
- `sq_sessions`：房间邀请码、状态、剧本 ID、模式、JSONB `world`、过期时间。
- `sq_players`：昵称、令牌哈希、房主标记、状态、个人 JSONB `private_state`（角色、线索、完成任务、积分、背包）。
- `sq_events`：按序号记录公共/私有游戏事件。
- `sq_director_runs`：AI 旁白调用版本、状态、供应商、模型、耗时和输出摘要。

快照由后端按请求 token 裁剪。公共事件不包含角色私密目标/线索、`evaluationCriteria`、API 密钥或令牌。真实点位名/来源可以公开，未经需要不广播用户精确坐标。

## 5. 服务端校验与安全

- Zod 校验 API 请求和 AI JSON 输出，地点必须命中本次发现 POI 白名单。
- 安全词检查阻止攀爬、跑入道路、进入封闭区域、触摸文物等任务。
- 玩家文字和照片是不可信证据；提示词要求模型忽略其中的越权指令。
- 上传图片只允许 jpeg/png/webp，前端压缩，JSON body 和图片字符数有上限。
- 通过 `withLockedSession` 使用 `SELECT ... FOR UPDATE` 与数据库事务防止重复领奖/兑换。
- Socket.IO 连接和房间订阅均验证成员 token 与 session 关系。
- 管理 API key 不返回浏览器；管理员凭据与游客 token 分离。
- `.env` 应被 Git 忽略；服务端日志不得输出请求密钥、访问 token 或模型完整私有输入。

## 6. 配置和启动

1. 安装 Node.js 20+、npm、PostgreSQL。
2. `Copy-Item .env.example .env`，填写 `DATABASE_URL`；生产另填强随机 `ADMIN_TOKEN`、`TOKEN_PEPPER`。
3. 本机可用 `docker compose -f infra/docker-compose.yml up -d` 启动 PostgreSQL。
4. 在项目根目录执行 `npm install` 和 `npm run dev`，数据库迁移会在 API 启动时执行。
5. 浏览器打开 `http://localhost:3001`，右上角进入管理员后台，首次开发初始化口令或登录后配置模型 API。
6. 模型地址须兼容 `/chat/completions` 和 JSON object 输出；图片验收模型还必须支持图像输入。

无 npm/Postgres 环境时可用 `node preview-server.js` 查看页面。它仅模拟 API 和流程，演示设置只留在内存，不能运行真实 AI 生成、视觉验收、持久化或跨设备房间。

## 7. 文件职责

- `app.js`：游客交互、管理员登录/表单、API 调用和状态渲染。
- `apps/api/src/server.js`：路由、认证、事务、Socket.IO、管理设置持久化。
- `apps/api/src/venue-discovery.js`：坐标解析、OSM/Tavily 发现。
- `apps/api/src/ai.js`：完整剧本生成、证据审查、AI 连通测试。
- `apps/api/src/stories.js`、`story-builder.js`：内容校验、故事存储和安全公开响应。
- `apps/api/src/db.js`：连接池与数据库迁移。
- `preview-server.js`：零依赖 UI 演示模拟器。
- `.env.example`：后端配置名及默认值说明，不包含真实凭据。

## 8. 当前未完成的部署验收

- 填入真实文本/视觉模型凭据并验证服务商兼容性。
- 在目标部署环境确认 `.env` 持久写权限，或替换成外部 Secret Manager。
- 配置公开 `WEB_ORIGIN` 后测试真实手机扫码邀请。
- 验证真实 OSM/Tavily 可用性、生成任务地点准确性及视觉验收质量。
- 执行多成员并发完成/兑换、令牌生命周期、备份恢复和生产安全审核。

## Windows Server 生产发布包

生产包包含 `deploy/windows` 下的配置初始化、依赖安装、任务计划程序启动脚本和 IIS 反向代理示例。应用只绑定 `127.0.0.1`，对外 HTTPS 由 IIS 终止。管理员后台设置持久化到 ACL 受限的 `deploy/windows/.env.production`。
