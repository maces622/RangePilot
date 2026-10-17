# Handoff：GTO 本地 API 阶段 4 完成 → 阶段 5（UI 聚焦与 DSH 插件）

> 新会话开始时：先阅读仓库根目录 `AGENTS.md`，再完整阅读本文件，然后阅读
> `docs/gto-interface-exposure.md` 和 `docs/dsh-side-mvp.md`。
>
> 当前工作目录：`F:\GTO-Agent`
>
> 本文件是 2026-10-17 阶段 4 完成后的交接快照。工作区仍为未提交状态，严禁直接
> `git checkout`、`git reset --hard` 或清理 `apps/gto-gui` 中的未提交改动。

## 1. 当前任务结论

GTO 本地 WebSocket + JSON-RPC API 的阶段 0～4 已经实现并通过本地测试。
阶段 5 尚未开始。

下一阶段目标（按接口暴露文档）：

1. 实现 `ui.focusNode` 和 `ui.openResult`；
2. 让 GUI/StrategyExplorer 与 API 共享节点聚焦状态；
3. 实现原生 DSH Cordis GTO 插件 `plugins/dsh-gto-solver`；
4. 用 `ctx.tools`、`ctx.jobs` 和审批流程接入现有本地 API。

不要把 DSH 插件写进 `engines/dsh` 核心。插件应作为树外插件安装到 DSH 的
`acp` profile。

## 2. 仓库与 Git 状态

仓库是 superproject + submodules：

- `apps/gto-gui`：Git submodule，分支 `master`；
- `engines/dsh`：Git submodule；
- 根仓库分支：`main`；
- 远端：`ssh://git@ssh.github.com:443/maces622/RangePilot.git`。

当前根仓库和 `apps/gto-gui` 都有未提交改动：

```text
根仓库：
  M AGENTS.md
  M README.md
  m apps/gto-gui
  ?? docs/handoff-stage5.md

apps/gto-gui：
  M TexasSolverGui.pro
  M main.cpp
  M mainwindow.cpp
  M mainwindow.h
  M include/runtime/PokerSolver.h
  M include/runtime/qsolverjob.h
  M include/solver/PCfrSolver.h
  M include/solver/Solver.h
  M src/runtime/PokerSolver.cpp
  M src/runtime/qsolverjob.cpp
  M src/solver/PCfrSolver.cpp
  ?? api/
  ?? src/api/
  ?? tests/
```

这些是阶段 0～4 的实现，不是临时垃圾，不要回滚。

## 3. 阶段 0～4 已完成能力

### 3.1 Stage 1：只读状态

- 本地 WebSocket Server，仅监听 `127.0.0.1`；
- 握手 token；
- 随机端口 + discovery file；
- `system.hello`；
- `system.getCapabilities`；
- `system.health`；
- `state.get`；
- `event.state_changed`。

### 3.2 Stage 2：牌局配置与 revision

- `spot.validate`；
- `range.validate`；
- `spot.set`；
- `expectedRevision`；
- revision 冲突返回 `STATE_CONFLICT`；
- range parser、board/card 校验、bet sizing 校验；
- API 写入后通过服务信号回写 GUI。

### 3.3 Stage 3：异步求解控制

- `solve.start`；
- `solve.getStatus`；
- `solve.cancel`；
- 单任务 JobManager；
- `event.solve_queued`；
- `event.solve_progress`；
- `event.solve_completed`；
- `event.solve_failed`；
- `event.solve_cancelled`；
- `PCfrSolver` 的 100ms 级进度回调；
- 生产适配器 `GuiSolverJobRunner`。
### 3.4 Stage 4：结果与 artifact

- `solve.getSummary`；
- `result.getNodeStrategy`；
- `result.getActionEv`；
- `result.getExploitability`；
- `artifact.getMetadata`；
- 节点 ID 路径方案；
- 动作频率/EV 聚合摘要；
- 完整组合矩阵写入 ArtifactStore；
- SHA-256、大小、URI、时间等 metadata；
- `GuiStrategyResultProvider` 从现有 GameTree/Trainable 读取结果。

## 4. 当前 API 能力

Services 默认启用：

- `state.read`
- `spot.write`
- `solve.control`
- `result.read`
- `artifact.read`

已实现 RPC 方法：

```text
system.hello
system.getCapabilities
system.health
state.get
spot.validate
range.validate
spot.set
solve.start
solve.getStatus
solve.cancel
solve.getSummary
result.getNodeStrategy
result.getActionEv
result.getExploitability
artifact.getMetadata
```

已实现事件：

```text
event.state_changed
event.solve_queued
event.solve_progress
event.solve_completed
event.solve_failed
event.solve_cancelled
```

传输：

```text
ws://127.0.0.1:<port>/rpc
```

发现文件默认位置：

```text
%LOCALAPPDATA%\RangePilot\gto-gui\api.json
```

发现文件包含 `pid`、`protocol`、`port`、`token`、`serverVersion`、`startedAt`。
客户端必须先用 token 调用 `system.hello`，之后才能调用其他方法。

启动方式：

```text
TexasSolverGui --api-enabled --api-port 0 [--api-discovery-file <path>]
```

握手示例：

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "system.hello",
  "params": {
    "protocol": "gto-api/1.0",
    "token": "<discovery-file-token>",
    "client": { "name": "dsh", "version": "0.1.0" }
  }
}
```

## 5. 代码地图

### 5.1 `apps/gto-gui/api/schema/`

JSON Schema 契约：

- `spot.schema.json`
- `state.snapshot.schema.json`
- `job.status.schema.json`
- `solve_options.schema.json`
- `result.node.schema.json`
- `artifact.ref.schema.json`
- 各方法的 request/response schema；
- 各 `event.*` schema。

Contract First 原则：以后任何新方法都必须先加 schema，再写 C++。

### 5.2 `apps/gto-gui/src/api/dto/`

- `spot_spec.*`
- `state_snapshot.*`
- `solve_options.*`
- `job_status.*`
- `artifact_ref.*`

### 5.3 `apps/gto-gui/src/api/services/`

- `state_store.*`
- `spot_validator.*`
- `gto_application_service.*`
- `solver_job_runner.h`：求解后端抽象；
- `solver_job_manager.*`：任务状态机；
- `strategy_result_provider.h`：结果查询后端抽象；
- `result_query_service.*`：摘要/节点/artifact 编排；
- `artifact_store.*`：artifact 文件与哈希。

### 5.4 `apps/gto-gui/src/api/runtime/`

- `gui_solver_job_runner.*`：把 `QSolverJob` 适配为 JobManager；
- `gui_strategy_result_provider.*`：把 GameTree/Trainable 适配为结果查询。

### 5.5 `apps/gto-gui/src/api/`

- `protocol.*`
- `api_server.*`
- `events/event_bus.*`

### 5.6 GUI 接入

- `main.cpp`：解析 `--api-*` 参数；
- `mainwindow.*`：
  - 同步 GUI 状态到应用服务；
  - 接收 `spotChanged` 回写 GUI；
  - 创建 `GuiSolverJobRunner` 和 `GuiStrategyResultProvider` 并注入服务。

### 5.7 测试

- `apps/gto-gui/tests/api/test_contracts.py`
- `apps/gto-gui/tests/api/golden/`
- `apps/gto-gui/tests/api/api_smoke_test.cpp`
- `apps/gto-gui/tests/api/api_smoke_test.pro`

## 6. 节点 ID 约定

当前 `result.getNodeStrategy` 使用确定性树路径 ID：

```text
root
root/a0
root/a0/cAh/a1
```

规则：

- `root` 是 GameTree 根节点；
- `aN` 选择 ActionNode 的第 N 个动作子节点；
- `c<card>` 选择 ChanceNode 的具体发牌分支；
- 只有最终解析为 ActionNode 的节点可查询策略/EV。

阶段 5 的 `ui.focusNode` 必须复用同一套节点 ID，不能另造一套。

## 7. 当前重要实现语义

### 7.1 Revision

- 状态变化递增 revision；
- GUI 输入、API spot write、求解状态/progress 变化都会更新 revision；
- API 写操作使用 `expectedRevision`；
- 冲突返回 code `-32010`，`data.code = "STATE_CONFLICT"`。

### 7.2 求解控制

- 同一时间只允许一个 API 求解任务；
- JobManager 维护 queued/running/completed/failed/cancelling/cancelled；
- 取消后底层 `QSolverJob` 停止，再发 `event.solve_cancelled`；
- 状态同步到 `state.get` 的 `solve` 字段。

### 7.3 结果

- 节点响应只返回动作级摘要；
- 完整矩阵通过 artifact 引用；
- artifact root 默认在应用数据目录，支持环境变量
  `GTO_API_ARTIFACT_ROOT` 覆盖（主要用于测试）；
- artifact 元数据目前是进程内缓存 + 已写入磁盘文件。

### 7.4 当前 artifact 路径

默认：

```text
QStandardPaths::AppLocalDataLocation/artifacts
```

不向客户端暴露任意文件路径；客户端只能使用 `artifactId`。

### 7.5 主要错误码

- `-32700` Parse error
- `-32600` Invalid request
- `-32601` Method not found
- `-32602` Invalid params
- `-32603` Internal error
- `-32001` Unauthorized
- `-32002` Protocol mismatch
- `-32003` Capability disabled
- `-32010` State revision conflict (`STATE_CONFLICT`)
- `-32011` Solver busy (`SOLVER_BUSY`)
- `-32012` Solver unavailable (`SOLVER_UNAVAILABLE`)
- `-32013` Job not found (`JOB_NOT_FOUND`)
- `-32014` Job not active (`JOB_NOT_ACTIVE`)
- `-32015` Solver start failed (`SOLVER_START_FAILED`)
- `-32016` Result not ready (`RESULT_NOT_READY`)
- `-32017` Artifact not found (`ARTIFACT_NOT_FOUND`)
- `-32018` Node not found (`NODE_NOT_FOUND`)

## 8. 构建环境

本机验证环境：

- Windows；
- Qt 5.15.2，`qmake.exe` 位于 `D:\conda\Library\bin\qmake.exe`；
- MSVC 2017；
- Python 使用 `D:\conda\python.exe`（安装了 `jsonschema`）；
- PowerShell 7。

构建 Qt 测试前先进入 VS 环境（将 `<build-dir>` 和 `<project.pro>` 替换为实际路径）：

```powershell
cmd /c "`"C:\Program Files (x86)\Microsoft Visual Studio\2017\Professional\VC\Auxiliary\Build\vcvars64.bat`" >nul && cd /d <build-dir> && D:\conda\Library\bin\qmake.exe <project.pro> && nmake"
```

## 9. 测试命令

### 9.1 契约测试

```powershell
D:\conda\python.exe F:\GTO-Agent\apps\gto-gui\tests\api\test_contracts.py
```

阶段 4 完成时结果：38 项全部通过。

### 9.2 WebSocket smoke test

构建：

```powershell
$build='C:\Users\admin\AppData\Local\Temp\gto-api-test-build'
New-Item -ItemType Directory -Force $build | Out-Null
cmd /c "`"C:\Program Files (x86)\Microsoft Visual Studio\2017\Professional\VC\Auxiliary\Build\vcvars64.bat`" >nul && cd /d $build && D:\conda\Library\bin\qmake.exe F:\GTO-Agent\apps\gto-gui\tests\api\api_smoke_test.pro && nmake"
```

运行：

```powershell
$env:PATH='D:\conda\Library\bin;' + $env:PATH
& 'C:\Users\admin\AppData\Local\Temp\gto-api-test-build\release\api_smoke_test.exe'
```

期望输出：

```text
GTO API listening on 127.0.0.1:<port>/rpc
smoke_exit=0
```

Smoke test 覆盖：hello、capabilities、state、spot validate/set、range validate、
revision 冲突、solve start/status/cancel、全部 solve 事件、结果摘要、节点策略、
动作 EV、exploitability、artifact metadata。

### 9.3 相关 C++ 目标编译

完整 GUI 工程目前不能在当前 MSVC 环境完成链接，受上游问题影响：

- `apps/gto-gui/src/compairer/Dic5Compairer.cpp` 依赖 `<unistd.h>`；
- `PCfrSolver.cpp` 的 OpenMP 代码在 MSVC 2017 下存在 unsigned loop index 错误；
- `include/json.hpp` 在 MSVC 2017 下出现 `deprecated` 属性编译问题。

因此只验证相关对象时，曾使用：

1. 临时修改 `include/json.hpp` 去掉两条 stream operator 的 deprecated 属性；
2. 对 `PCfrSolver.cpp` 使用 `/openmp-` 编译；
3. 编译完成后立即恢复 `json.hpp`，不要提交这些临时兼容补丁。
已验证通过的相关对象：

- `protocol.obj`
- `api_server.obj`
- `solve_options.obj`
- `job_status.obj`
- `artifact_ref.obj`
- `solver_job_manager.obj`
- `result_query_service.obj`
- `spot_validator.obj`
- `gto_application_service.obj`
- `gui_solver_job_runner.obj`
- `gui_strategy_result_provider.obj`
- `PokerSolver.obj`
- `qsolverjob.obj`
- `main.obj`
- `mainwindow.obj`

另：不要为了全量工程链接而大改上游 Solver 代码，除非新任务明确要求修复跨平台构建。

## 10. 已知限制与风险

1. `ui.focusNode` / `ui.openResult` 尚未实现。
2. DSH 插件尚未创建。
3. Artifact metadata 只在当前进程内可查；进程重启后没有索引恢复。
4. 没有 artifact content 读取 API，只提供 metadata。
5. 节点 ID 可查询但没有列出树节点的 API，客户端需要从树结构推导 ID。
6. API 求解由 JobManager 管理；用户直接点 GUI 的 Solve 按钮仍走旧 QSolverJob 路径，不会生成 API jobId。
7. 完整 GUI 链接未在当前 MSVC 环境验证。
8. DSH ctx.jobs、ctx.tools、ctx.approval 的具体 API 必须先阅读 engines/dsh/AGENTS.md 和相关包，不要凭接口名猜实现。
9. 工作区当前改动未提交；提交前先确认是否要把 superproject 和 submodule 分开提交。

## 11. 阶段 5A：UI 聚焦 API

先完成 GTO GUI 侧，不要一开始就进入 DSH 插件。

新增 capability：`ui.focus`。

新增方法：

- `ui.focusNode`：按 jobId + nodeId 聚焦 StrategyExplorer 节点；
- `ui.openResult`：打开当前 job 的 StrategyExplorer 结果窗口。
实现建议：

1. 在 GtoApplicationService 增加 uiFocusNode / uiOpenResult 信号；
2. API Server 只调用服务，不直接访问 MainWindow；
3. MainWindow 连接服务信号，创建或复用 StrategyExplorer；
4. StrategyExplorer 增加按 nodeId 选中的公共方法；
5. 节点 ID 复用本文件第 6 节路径格式；
6. 聚焦后更新 state.selection.nodeId，递增 revision，并推送 event.selection_changed；
7. 先补 api/schema/、golden、Python contract test，再写 C++。

阶段 5A 验收：

- API 可打开结果面板；
- API 可按 nodeId 聚焦节点；
- state.get 返回 selection.nodeId；
- event.selection_changed 可被客户端收到；
- 无效 nodeId 返回结构化错误；
- 契约测试与 smoke test 通过。

## 12. 阶段 5B：原生 DSH GTO 插件

必读 docs/dsh-side-mvp.md 和 engines/dsh/AGENTS.md。插件作为树外 Cordis 插件放在：

```text
plugins/dsh-gto-solver/
```

建议文件：

- package.json
- src/index.ts
- src/gto-client.ts
- src/tools/get-state.ts
- src/tools/set-spot.ts
- src/tools/start-solve.ts
- src/tools/get-solve-status.ts
- src/tools/query-strategy.ts
- src/jobs/solve-job.ts
- src/policy/solve-approval.ts
- tests/

GTO client 必须实现：

- 读取 discovery file；
- WebSocket 连接 ws://127.0.0.1:<port>/rpc；
- system.hello token 握手；
- JSON-RPC request id / response / error 映射；
- 订阅 event.state_changed 和 event.solve_*；
- 断线重连后调用 state.get 恢复；
- 不记录 token。

MVP 工具映射：

- gto_get_state -> state.get
- gto_set_spot -> spot.set
- gto_start_solve -> solve.start
- gto_get_solve_status -> solve.getStatus
- gto_query_strategy -> result.getNodeStrategy

约束：

- 插件不直接依赖 Qt 类型；
- 插件只通过本地 WebSocket API 操作 Solver；
- gto_start_solve 必须走 tools/pre-execute 和 ctx.approval；
- 每次求解单独审批；
- 审批前检查预算：最大迭代、最大线程、最大运行时间、最多 1 个任务；
- 使用 ctx.jobs.start() 后台运行，不阻塞 Agent 轮次；
- 用户取消时调用 solve.cancel；
- DSH 进程退出时取消运行中的 GTO 任务；
- 不实现 MCP；
- 不修改 engines/dsh 核心。

阶段 5B 验收：

- DSH 能读取 GTO 状态；
- DSH 能通过 expectedRevision 设置牌局并处理冲突；
- 求解前出现一次审批；
- 审批通过后后台任务启动并返回 DSH job handle；
- 能查询进度、完成和取消；
- 能查询节点策略摘要；
- 工具错误是结构化错误，不把异常文本直接交给模型；
- 插件测试通过。

## 13. 建议实施顺序

1. 先读代码并对当前未提交状态做 git status 快照；
2. 实现 UI 聚焦服务信号和 StrategyExplorer 公共 API；
3. 加 ui.focus capability、schema、golden、API Server 路由；
4. 扩展 smoke test 验证 focus/openResult 与 selection 事件；
5. 再实现 DSH GTO client 和工具；
6. 最后实现 ctx.jobs 与 approval 集成；
7. 完成后更新 AGENTS.md、README.md、schema README、tests README。

## 14. 新会话第一轮检查清单

- [ ] 阅读 AGENTS.md 和本 handoff；
- [ ] git status 确认当前未提交改动；
- [ ] 阅读 docs/gto-interface-exposure.md 阶段 5 部分；
- [ ] 阅读 docs/dsh-side-mvp.md；
- [ ] 阅读 engines/dsh/AGENTS.md；
- [ ] 确认 qmake / nmake / Python 测试环境；
- [ ] 先跑契约测试和 smoke test，确认基线绿色；
- [ ] 从 UI 聚焦 API 开始，不要先写 DSH 插件。

