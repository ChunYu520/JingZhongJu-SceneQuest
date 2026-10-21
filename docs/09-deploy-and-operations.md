# 09. 部署与运维（当前实现）

## 本地完整后端

1. 安装 Node.js 20+、npm 和 PostgreSQL。
2. 复制 `.env.example` 为 `.env`，填写 `DATABASE_URL`。开发环境首次进入管理员后台可初始化管理员口令。
3. 启动数据库：`docker compose -f infra/docker-compose.yml up -d`，或使用已有 PostgreSQL。
4. 项目根目录执行 `npm install` 和 `npm run dev`。数据库迁移由 API 启动时执行。
5. 浏览器打开 `http://localhost:3001`，从右上角管理员入口登录，在 AI 设置页填写模型与搜索凭据并执行连接测试。

生产环境必须在启动前提供强随机 `ADMIN_TOKEN` 和 `TOKEN_PEPPER`（各至少 32 字符）；生产禁用首次 bootstrap。后端管理员设置会写服务端 `.env`，部署实例必须允许写入。如环境使用只读容器或 Secret Manager，应禁用此写入方案并改由部署系统管理密钥。

## 关键配置

- `DATABASE_URL`：PostgreSQL 连接串。
- `ADMIN_TOKEN`、`TOKEN_PEPPER`：管理和匿名玩家凭据保护。
- `WEB_ORIGIN`：生产 QR 邀请链接所使用的公开 HTTPS Web 源。
- `AI_PROVIDER`、`AI_BASE_URL`、`AI_API_KEY`、`AI_MODEL`：OpenAI-compatible Chat Completions 配置。
- `AI_VISION_MODEL`：图像模型；空值回退文本模型。
- `TAVILY_API_KEY`、`TAVILY_BASE_URL`：可选网页资料搜索。
- `OVERPASS_URL`、`DISCOVERY_RADIUS_METERS`、`DISCOVERY_TIMEOUT_MS`：景区点位查询。
- `AI_TIMEOUT_MS`、`AI_JUDGE_TIMEOUT_MS`：模型调用超时。

AI 与搜索值可由受保护管理员页面写入服务端 `.env`。页面只展示密钥是否已设置，不回传密钥原文。完整后端设置保存后会更新当前进程环境；重启后从 `.env` 加载。

## 本地预览模式

运行 `node preview-server.js` 后访问 `http://localhost:3001`。预览管理员口令为 `demo-admin`。该模式无数据库/外网模型依赖、所有状态在内存、剧本为模板、任务判定为规则模拟、设置仅当前进程有效。不能用来验证真实 AI、真实密钥保存或手机访问 localhost QR。

## 生产建议

- Web/API 使用 HTTPS；浏览器定位需要安全上下文。
- `WEB_ORIGIN` 应指向玩家手机可访问的公开域名；手机扫码不应指向 localhost。
- API 运行环境需支持 WebSocket 长连接；PostgreSQL 不暴露公网并使用最小权限账号。
- `.env` 文件权限仅给 API 进程和运维人员；日志不记录密钥、完整令牌、图片和不必要的定位。
- 生产调试 API 默认关闭；管理员设置 API 单独使用强管理员令牌保护。
- AI/POI 搜索失败时返回错误，不能发布模板故事或假装验收通过。
- 设置备份与回滚由受控运维流程完成；切勿把真实 `.env` 加入代码仓库或制品。

## 运维检查

- 观察 `/health`、API 状态码/延迟、地图查询错误、AI 生成/验收失败率和数据库连接池。
- 清理过期 session，并配置数据库备份、恢复演练和日志保留周期。
- 生产上线前完成多设备邀请、多人并发领奖/兑换、视觉验收和管理员权限审核。

## Windows Server 原生部署

Windows Server 生产部署步骤和 PowerShell 脚本见 `deploy/windows/README.md`。该方案将 API 绑定到 `127.0.0.1`，通过 IIS HTTPS + ARR 反向代理对外提供服务；管理员后台配置写入 ACL 受限的运行配置文件。
