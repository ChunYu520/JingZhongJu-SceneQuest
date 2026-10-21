# 景中局 Windows Server 生产部署

本部署包面向 Windows Server 原生 Node.js 运行方式。应用通过 Windows PowerShell 初始化配置，并由任务计划程序在开机时启动。PostgreSQL 可安装在本机或使用受信任的托管数据库。玩家访问需要 HTTPS；可用 IIS + URL Rewrite + ARR 反向代理，或使用组织已有的 HTTPS 网关。

## 系统要求

- Windows Server 2019 或更高版本，64 位。
- Node.js 20 LTS 或更高版本（Windows 安装包，安装时将 Node 加入系统 PATH）。
- PostgreSQL 15 或更高版本。本机安装时仅开放本地/内网访问。
- HTTPS 公网域名及可用证书；定位 API 只在安全上下文中可用。
- 部署时服务器可访问 npm registry；运行时可访问所配置的模型 API、Nominatim / Overpass。

## 部署步骤

1. 将部署 ZIP 解压到固定目录，例如 `C:\SceneQuest`。不要在下载临时目录中运行。
2. 安装 Node.js 和 PostgreSQL，创建数据库与最小权限数据库用户。连接串中的密码如含 `@`、`:`、`/` 等字符，先做 URL 编码。
3. 以管理员身份打开 PowerShell，进入 `C:\SceneQuest\deploy\windows`。
4. 初始化生产配置：

   ```powershell
   .\Initialize-SceneQuest.ps1 -PublicOrigin 'https://play.example.com'
   ```

   脚本会隐藏输入数据库连接串，生成 48 字节随机管理员口令和 TOKEN_PEPPER，并将配置文件 ACL 限制为当前运维账号、Network Service、SYSTEM 和 Administrators。**请安全保存管理员口令**。配置文件位于 `runtime\config\.env.production`，不要发送或加入发布包。脚本会将 API 绑定到本机回环地址，外部流量应通过 IIS HTTPS 代理进入。

5. 安装 Node.js 生产依赖：

   ```powershell
   .\Install-Dependencies.ps1
   ```

   首次安装需要访问 npm registry，并会生成 `package-lock.json`。请把安装后的锁文件纳入受控发布记录，以便后续升级复现同一依赖树。

6. 初始化 PostgreSQL 表结构：

   ```powershell
   .\Initialize-Database.ps1
   ```

7. 以管理员身份启动并注册开机任务。应用进程使用权限较低的 Network Service 账户运行：

   ```powershell
   .\Install-SceneQuestTask.ps1
   ```

8. 检查本机健康状态：

   ```powershell
   Invoke-RestMethod http://127.0.0.1:3001/health
   ```

9. 配置 IIS HTTPS 站点，将 `/`、`/api/*` 和 `/socket.io/*` 反向代理至 `http://127.0.0.1:3001`；启用 WebSocket Protocol，并在 ARR 中启用 Proxy。可参考 `iis\web.config.example`。证书绑定与域名 DNS 由部署方按现有 IIS 证书流程配置。
10. 通过 `https://play.example.com` 打开管理员后台，使用初始化步骤一次性显示的管理员口令登录，配置文本模型、视觉模型和可选 Tavily Key，执行 AI 连接测试。
11. 用至少两台真实手机验证扫码邀请、加入大厅、开局、照片验收、积分和道具兑换。

## 运维

- 查看任务：`Get-ScheduledTask -TaskName 'SceneQuest API'`
- 重启任务：`Restart-ScheduledTask -TaskName 'SceneQuest API'`
- 停止任务：运行 `Stop-SceneQuestTask.ps1`
- 应用日志：`runtime\logs\scenequest-YYYYMMDD.log` 与对应的错误日志。
- 数据库备份：使用 PostgreSQL `pg_dump` 做定期备份，并定期演练恢复。
- 管理员后台保存的模型和搜索设置写入 `runtime\config\.env.production`。该文件含密钥，必须纳入受限备份和访问审计。
- 更新应用前停止计划任务、备份数据库和 `runtime\config\.env.production`，替换应用文件，重新运行 `Install-Dependencies.ps1`，然后启动任务。

## 上线边界

- 生产模式不提供本地演示账号入口；演示服务器 `preview-server.js` 不应作为生产服务运行。
- 生产模式禁止首次初始化管理员口令，必须使用脚本生成的强凭据。
- AI 服务不可用、地点资料不足或验收服务出错时，应用不会发布无效剧本或发放积分。
- 本应用不负责支付、实体库存和配送履约。线下道具由景区合作方对接核销和服务流程。
- 本包不包含真实 API Key、生产数据库密码或 TLS 私钥。
