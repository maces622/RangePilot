# AGENTS.md

> 本文件是仓库级统一上下文。所有参与本仓库的 Agent 在开始工作前必须先阅读本文件。
> 当仓库布局、构建方式或组件边界发生变化时，必须同步更新本文件。

## 1. 项目定位

工作名：RangePilot

目标产品形态：

- 保留原始开源 GTO Solver GUI 的界面和主要操作方式；
- 在 GUI 中增加 Chat 面板；
- DSH（DeepSeek Harness）作为背后的 Agent Runtime；
- Agent 通过语义化 UI Bridge 代替用户完成部分 Solver 操作；
- 提供 AI 分析能力；
- 领域知识、技能、工具、UI 快捷操作通过可替换的垂直领域资源包提供。

核心理念：

- Solver GUI 是宿主；
- DSH 是 Agent 引擎；
- Copilot 插件是桥接层；
- 领域资源包是可替换内容；
- 不让 DSH 直接依赖具体 GUI 细节；
- 不让 GTO 业务逻辑污染 DSH 核心。

## 2. 当前仓库拓扑

```text
F:\GTO-Agent\                         # 总仓库 / superproject
├─ .gitmodules                        # submodule 配置
├─ apps/
│  └─ gto-gui/                        # Git submodule：开源 GUI Solver
├─ engines/
│  └─ dsh/                            # Git submodule：DSH Agent Engine
└─ plugins/
   └─ dsh-gto-solver/                 # 树外 DSH Cordis 插件，不属于 engines/dsh 核心
```

## 3. GTO 本地 API 与 Qt Chat（阶段 6）

阶段 6 在本地状态读取、牌局配置、异步求解控制、结果查询和 GUI 聚焦之上增加了最小 Qt AI Chat 面板与 ACP v1 stdio 客户端。API 默认关闭，必须通过启动参数显式开启：

```text
TexasSolverGui --api-enabled --api-port 0 [--api-discovery-file <path>]
```

约束：

- 只监听 `127.0.0.1`，端点为 `ws://127.0.0.1:<port>/rpc`；
- 每次启动生成随机 token，并写入发现文件；
- 默认发现文件为 `%LOCALAPPDATA%\RangePilot\gto-gui\api.json`；
- 客户端必须先调用 `system.hello`，之后才能调用其他方法；
- 阶段 5 启用 `state.read`、`spot.write`、`solve.control`、`result.read`、`artifact.read` 和 `ui.focus` capability；
- `spot.set` 和 `solve.start` 必须携带 `expectedRevision`，冲突返回 `STATE_CONFLICT`，不做隐式 merge；
- 同一时间只允许一个求解任务，求解通过 `jobId` 异步跟踪；
- `solve.cancel` 进入 `cancelling`，底层线程停止后变为 `cancelled`；
- 节点策略/EV 响应只返回动作级摘要，完整矩阵写入 artifact；
- 节点 ID 使用树路径格式，例如 `root`、`root/a0`、`root/a0/cAh/a1`；
- API 不包含 DSH、Agent、Prompt、Chat 或 LLM 概念。

已实现方法：

- `system.hello`
- `system.getCapabilities`
- `system.health`
- `state.get`
- `spot.validate`
- `range.validate`
- `spot.set`
- `solve.start`
- `solve.getStatus`
- `solve.cancel`
- `solve.getSummary`
- `result.getNodeStrategy`
- `result.getActionEv`
- `result.getExploitability`
- `artifact.getMetadata`
- `ui.focusNode`
- `ui.openResult`
- `event.state_changed`
- `event.selection_changed`
- `event.solve_queued`
- `event.solve_progress`
- `event.solve_completed`
- `event.solve_failed`
- `event.solve_cancelled`

关键目录：

```text
apps/gto-gui/
├─ api/schema/                 # JSON Schema 契约
├─ src/api/                    # WebSocket Server、JSON-RPC、DTO、服务和事件总线
└─ tests/api/                  # JSON Schema 契约测试和 WebSocket 集成 smoke test

plugins/dsh-gto-solver/        # GTO DSH 工具、API client、后台求解与审批
```

`MainWindow` 把当前 GUI 状态同步给 `GtoApplicationService`，并在 API 成功写入牌局后接收规范化 Spot 回写 UI；API Server 只依赖应用服务，不直接读取 Qt 控件。`GuiSolverJobRunner` 把现有 `QSolverJob` 适配为 JobManager 的求解后端，`GuiStrategyResultProvider` 将 GameTree/Trainable 结果转换为稳定 DTO，`ArtifactStore` 负责完整矩阵文件、哈希和元数据。

## 4. 构建与测试

Qt 工程需要 `network` 和 `websockets` 模块：

```bash
cd apps/gto-gui
qmake TexasSolverGui.pro
make
```

契约测试：

```bash
python tests/api/test_contracts.py
```

本地 API WebSocket 集成测试（不需要 GUI）：

```bash
mkdir build-api-test
cd build-api-test
qmake ../tests/api/api_smoke_test.pro
make
./api_smoke_test
```

修改协议时，顺序必须是：先更新 `api/schema/`，再更新 C++ DTO / dispatcher，
最后更新客户端和测试。