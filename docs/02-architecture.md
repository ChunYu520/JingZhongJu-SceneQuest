# 02. 当前技术架构

## 技术栈

- 游客端和管理员端：原生 HTML、CSS、JavaScript 单页应用（无 React/Vite 构建步骤）。
- API 与实时消息：Node.js 20+、Express、Socket.IO、Zod。
- 持久层：PostgreSQL、`pg`，SQL 迁移在 API 启动时执行；房间世界快照使用 JSONB。
- 景区发现：Nominatim 地理编码、Overpass/OpenStreetMap POI；Tavily 网页搜索为可选。
- AI：服务端 OpenAI-compatible Chat Completions，支持结构化剧本生成、视觉模型证据验收和连接测试。
- 本地无依赖预览：`preview-server.js` 只模拟流程，不能作为真实 AI/数据库实现。

## 架构图

```text
┌────────────────────────────┐
│ 浏览器 SPA                 │
│ 游客流程 / 管理员登录设置  │
└──────────┬─────────────────┘
           │ HTTPS REST + Socket.IO
┌──────────▼─────────────────────────────────┐
│ Express API                                 │
│ 玩家会话 / AI 编剧 / AI 验收 / 积分事务      │
│ 管理员鉴权 / 服务配置 / 事件广播             │
└───────┬──────────────────┬────────────────┘
        │                  │
┌───────▼───────┐  ┌───────▼─────────────────┐
│ PostgreSQL    │  │ OSM / Tavily / LLM API  │
│ 房间/成员/事件│  │ 凭据仅由服务端持有     │
└───────────────┘  └─────────────────────────┘
```

## 实际代码结构

```text
index.html, app.js, styles.css
preview-server.js
apps/api/src/server.js
apps/api/src/db.js
apps/api/src/venue-discovery.js
apps/api/src/ai.js
apps/api/src/stories.js
apps/api/src/story-builder.js
apps/api/src/narrative-provider.js
infra/docker-compose.yml
```

## 职责与数据流

1. Web 端向 API 提交景区名称/可选定位和玩家偏好，不提交人为撰写的任务。
2. `venue-discovery.js` 查找附近公开 POI 和引用来源。
3. `ai.js` 生成完整剧本或验收玩家证据；AI 输出先过 schema、地点白名单和安全校验。
4. `story-builder.js` 分配服务端 ID 并保存完整剧本，公开响应排除私有目标、线索正文和任务验收标准。
5. `server.js` 负责房间成员认证、状态快照、数据库事务、积分/兑换和 Socket.IO 事件。
6. 所有成功状态变更先事务提交，再广播；AI 不直接写积分或数据库。

## 实时与并发

- 每个房间存储 `state_version`、事件序号和公共世界快照。
- 更新房间状态时对 `sq_sessions` 行加 `FOR UPDATE` 锁；领奖/兑换同时更新个人 `private_state`。
- Socket.IO 令牌认证后，只允许该房间成员订阅，并将私有事件发给指定玩家通道。
- 目标多实例部署前，需配置 Socket.IO adapter、连接池容量和跨实例事务/锁策略。

## 运行模式边界

- 完整后端：需要 npm 依赖、PostgreSQL、可用地图服务和 AI API 凭据。
- 本地预览：内存状态、模板剧本、规则模拟验收、预设 `demo-admin`；重启即清空，不写 `.env`。它只用于页面演示。
