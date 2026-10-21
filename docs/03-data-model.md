# 03. 当前数据模型与状态

## PostgreSQL 表

| 表 | 当前用途 |
| --- | --- |
| `sq_stories` | 保存 AI 为景区生成的完整 JSON 剧本、版本、标题、地点与来源。完整验收标准和私有角色/线索留在服务端。 |
| `sq_sessions` | 房间邀请码、故事 ID、状态/模式、`world` JSONB 快照、结局和过期时间。 |
| `sq_players` | 房间玩家昵称、访问令牌哈希、房主/成员状态与个人 `private_state` JSONB。 |
| `sq_events` | 按序号存储房间公共事件及目标玩家私有事件。 |
| `sq_director_runs` | 游戏事件触发的 AI 旁白尝试、版本、状态、供应商/模型和耗时。 |

`private_state` 至少包含：角色、私有线索、积分、已完成任务和已兑换背包。该字段不能整体放入公共 Socket 或房间快照。

## 房间状态

```text
LOBBY → RUNNING → COMPLETED
```

- 只有 LOBBY 接受新成员，邀请码只用于申请加入，不可读取玩家数据。
- 开始时校验房主权限、人数上限/故事下限；后端按 AI 生成的角色池给玩家分配角色和线索。
- 正式后端最多 5 人，生成剧本通常至少 3 人；本地单人演示阈值仅属于预览模拟器。
- 离开标记玩家状态；完成或过期房间不能继续提交游戏动作。

## 任务与奖励状态

AI 生成的任务挂载在 `sq_sessions.world.tasks`。开始后开放；每位玩家的完成状态从自己的 `private_state.completedTasks` 推导，因此玩家个人完成可分别记分。公开快照剔除 `evaluationCriteria`。

证据通过时，在房间锁和事务中重新检查重复完成，随后一次性增加该任务积分并写公共完成事件。AI 只提供判定，不提供积分账本操作权限。兑换同样在事务中锁定当前玩家、校验余额、扣分并加入个人 inventory。

状态结束条件为房间内所有仍参与玩家都完成本局所有任务。任务验收失败只写验收反馈事件，不增加积分。

## 信息级别

- **公开：** 房间状态、成员昵称、故事标题/地点/公开任务、积分榜和公共事件。
- **玩家私有：** 当前角色、角色目标、私有线索、个人完成列表、积分余额、背包。
- **仅服务器：** AI 提示词、任务隐藏验收标准、模型密钥、令牌哈希、请求原始证据和未授权玩家状态。

## 事件

当前主要事件包括 `PLAYER_JOINED`、`PLAYER_LEFT`、`GAME_STARTED`、`TASK_REVIEWED`、`TASK_COMPLETED`、`SESSION_COMPLETED`、`REWARD_REDEEMED`、`CLUE_SHARED`、`DIRECTOR_NARRATIVE` 和 `MODE_CHANGED`。事件通过数据库序号与房间 `state_version` 排序；只有事务提交后才广播。
