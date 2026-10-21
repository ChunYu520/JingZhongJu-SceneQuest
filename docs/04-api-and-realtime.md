# API 与实时事件

API 前缀为 `/api/v1`。玩家接口使用 `Authorization: Bearer <playerAccessToken>`；AI 与地图服务凭据只保存在后端 `.env`。

## 景区研究与剧本

`POST /stories/generate` 接收景区名称、可选城市、可选坐标和游戏时长。后端先通过 Nominatim/Overpass 自动发现公开点位，可选通过 Tavily 扩展网页资料，再调用配置的 AI 生成原创虚构剧情、角色、线索、任务、积分和验收标准。AI 只能引用已发现的地点；资料或 AI 不可用时返回错误，不发布模板任务。

```json
{
  "name": "杭州西湖景区",
  "region": "浙江省杭州市",
  "duration": 25,
  "players": 4
}
```

成功响应包含已保存的 `story`、任务列表和研究来源 `sources`。

## 房间与邀请

- `POST /sessions`：以已生成的 `storyId` 创建房间并成为队长。
- `POST /sessions/join`：通过邀请码加入处于大厅状态的房间。
- `GET /sessions/:id/invite-qr`：返回含有加入链接的房间二维码。二维码只用于邀请玩家，不用于景点验证。
- `POST /sessions/:id/start`：队长在满足剧本人数要求后开局；后端分配 AI 创建的角色和私有线索。
- `GET /sessions/:id`：获取当前玩家可见的房间快照、任务状态、个人积分与背包。
- `POST /sessions/:id/leave`：离开房间。

## AI 任务验收与积分

玩家抵达 AI 指定的真实地点后，将文字描述和/或现场照片提交给：

`POST /sessions/:id/tasks/:taskId/submissions`

```json
{
  "description": "石碑位于步道入口右侧，碑身刻有……",
  "imageData": "data:image/jpeg;base64,..."
}
```

服务端把任务隐藏验收标准及玩家证据交给 AI 判定。通过时只给该玩家增加任务积分；未通过时返回补充证据提示。重复提交已完成的任务不会重复发放积分。

- `GET /rewards`：查看可兑换道具及积分价格。
- `POST /sessions/:id/rewards/:rewardId/redeem`：用个人积分兑换道具，积分与背包在服务端更新。

## 实时事件

Socket.IO 使用玩家令牌认证。加入房间后订阅 `session:subscribe`，服务端推送公共事件、状态快照及发给玩家本人的私有角色更新。私有线索和证据验收标准不会广播给其他玩家。
