# 景中局 SceneQuest

AI 驱动的多人景区探索游戏。玩家定位或手动选择景区，服务端自动搜索公开地图与网页资料，AI 据此生成完整剧情、角色、线索和可实地完成的任务。玩家到达任务地点后提交照片或文字，AI 判断证据是否符合任务标准；通过后给玩家发放积分，可在道具商店兑换奖励。房间二维码只用于邀请队友加入。

## 体验本地演示

当前环境没有安装 npm 依赖或 PostgreSQL，可先运行零依赖内存预览：

```powershell
node preview-server.js
```

打开 `http://localhost:3001`。预览用模板和规则模拟器展示流程；故事生成和任务判定不是实际 AI，房间数据只保存在进程内。正式 AI 服务按下方步骤配置。

## 运行完整后端

1. 安装 Node.js 20+、npm 和 PostgreSQL。
2. 复制 `.env.example` 为 `.env`，至少填写数据库连接。生产环境还必须预先设置强随机 `ADMIN_TOKEN`、`TOKEN_PEPPER`（各至少 32 个字符）。本地开发可首次打开后台设置管理员口令。所有模型密钥只放在后端。
3. 启动 PostgreSQL：`docker compose -f infra/docker-compose.yml up -d`，或配置已有数据库。
4. 执行 `npm install`，然后 `npm run dev`。
5. 打开 `http://localhost:3001`，点击页面右上角进入管理员登录页。首次本地开发设置管理员口令，登录后在“后端与 AI 服务设置”填写 AI Base URL、API Key、文本/视觉模型；可选填写 Tavily Key。首次启动会创建数据库表。

玩家只需要定位/选择景区并填写昵称。服务端负责寻找地图点位和网页资料；生成结果会经过结构校验、景区点位约束和安全词校验。AI 不可用时不发布半成品剧本，界面会提示配置或稍后重试。

## 核心流程

1. 创建者授权定位附近景区，或手动输入景区名和城市。
2. 服务端自动搜索景区公开点位，AI 生成本局完整故事、角色、任务标准和积分。
3. 创建房间，房间大厅提供邀请码、邀请链接和可扫描二维码。
4. 队友扫码打开加入页面，填写昵称加入同一局。
5. 玩家根据 AI 任务到现场寻找目标，提交照片或文字描述。
6. AI 按任务验收标准判断证据；通过后任务完成并发放积分，不通过时返回补充证据提示。
7. 玩家在商店兑换明信片、徽章或其他景区小道具；积分和背包按玩家分别保存。

## API

前缀 `/api/v1`：

- `POST /stories/generate`：自动搜索景区资料并生成完整剧本。
- `POST /sessions`、`POST /sessions/join`：创建或加入房间。
- `GET /sessions/:id/invite-qr`：获取包含加入链接的房间邀请二维码。
- `POST /sessions/:id/start`：队长开始游戏并为玩家分配角色。
- `POST /sessions/:id/tasks/:taskId/submissions`：提交文字/照片，调用 AI 验收。
- `GET /rewards`、`POST /sessions/:id/rewards/:rewardId/redeem`：查看与兑换道具。
- `GET /sessions/:id`：获取当前玩家可见的房间状态、个人积分和背包。

## 配置位置

`.env.example` 是后端配置模板。AI 服务也可以在管理员控制台中配置和测试。完整后端将修改写入服务端 `.env`，当前进程立即生效；页面不会回显密钥，留空保存会保留已有密钥。管理员令牌只留在当前页面内存，刷新后需重新登录。禁止把任何 API 密钥写进 `app.js` 或浏览器存储。

## 代码结构

- `app.js`、`styles.css`、`index.html`：移动端优先的游客体验。
- `apps/api/src/server.js`：房间、实时同步、任务验收和积分兑换 API。
- `apps/api/src/venue-discovery.js`：景区地理编码、OpenStreetMap 点位和网页资料发现。
- `apps/api/src/ai.js`：剧本生成和带照片的任务证据判定。
- `apps/api/src/story-builder.js`：将 AI 输出保存为本局完整剧本。
- `apps/api/src/db.js`：PostgreSQL 表结构和迁移。
- `preview-server.js`：免依赖的本地 UI 流程预览，不替代真实 AI 与数据库服务。

## Windows Server 生产部署

生产部署脚本和完整步骤见 `deploy/windows/README.md`。应用通过 PowerShell 初始化强管理员凭据，使用任务计划程序开机启动，API 仅绑定 `127.0.0.1`，并由 IIS HTTPS + ARR 反向代理对外提供服务。生产配置保存在 ACL 受限文件中。发布包不包含真实密钥、数据库密码或证书。
