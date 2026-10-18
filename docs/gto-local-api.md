# GTO Local API

GTO Local API 是 Qt Solver GUI 暴露给外部客户端的本地 WebSocket JSON-RPC 2.0 接口。
API 不包含 DSH、Agent、Chat 或 LLM 概念。

## 1. 传输与发现

### 启动

~~~powershell
TexasSolverGui --api-enabled --api-port 0 [--api-discovery-file <path>]
~~~

- 默认关闭 API；
- 只绑定 `127.0.0.1`；
- `--api-port 0` 让操作系统选择空闲端口；
- 每次启动生成随机 token。

### Discovery 文件

默认路径：

~~~text
%LOCALAPPDATA%\RangePilot\gto-gui\api.json
~~~

客户端读取端口、协议版本和 token 后连接：

~~~text
ws://127.0.0.1:<port>/rpc
~~~

### 握手

所有业务方法调用前必须先执行：

~~~json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "system.hello",
  "params": {
    "protocol": 1,
    "token": "<discovery-token>",
    "client": { "name": "my-client", "version": "0.1.0" }
  }
}
~~~

握手成功后连接才具备调用其他方法的权限。

## 2. Capabilities

| Capability | 说明 |
|---|---|
| `state.read` | 读取 GUI 状态和当前 SpotSpec |
| `spot.write` | 校验或写入牌局 |
| `solve.control` | 启动、查询、取消求解 |
| `result.read` | 查询节点策略、EV、exploitability 和求解摘要 |
| `artifact.read` | 查询 artifact 元数据 |
| `ui.focus` | 打开结果视图并聚焦节点 |

`system.getCapabilities` 返回 capability 列表、方法列表和限制。

## 3. 方法与语义

### 3.1 system.*

| 方法 | 作用 |
|---|---|
| `system.hello` | 使用 discovery token 完成握手 |
| `system.getCapabilities` | 返回能力、方法和限制 |
| `system.health` | 返回服务健康状态 |

### 3.2 状态读取

#### `state.get`

返回：

- `revision`：单调递增的 GUI 状态版本；
- `screen`、`selection`、`sessionId`；
- `spot`：当前完整 SpotSpec；
- `tree`：当前 GameTree 摘要或 `null`；
- `solve`：当前或最近一次 JobStatus。

### 3.3 牌局写入

#### `spot.validate`

校验 SpotSpec，不修改状态。

#### `range.validate`

校验某个位置的 range 文本。

#### `spot.set`

必须携带 `expectedRevision`。成功返回新的 revision 和规范化 SpotSpec。
revision 不一致返回 `STATE_CONFLICT`，不进行隐式 merge。

### 3.4 求解控制

#### `solve.start`

必须携带：

- `expectedRevision`；
- `options`：
  - `maxIterations`
  - `targetExploitability`
  - `threads`
  - `algorithm`（当前只支持 `discounted_cfr`）
  - `printInterval`
  - `dumpRounds`

服务端会先根据当前 SpotSpec 构建或重建 GameTree，再开始训练。
同一时间只允许一个活动 solve，返回 `jobId`。

#### `solve.getStatus`

返回 JobStatus：

~~~text
queued | running | completed | failed | cancelling | cancelled
~~~

字段包括 `progress`、`iterations`、`exploitability`、时间和结构化错误。

#### `solve.cancel`

将活动任务置为 `cancelling`，底层线程停止后变为 `cancelled`。

#### `solve.getSummary`

返回已完成求解的摘要和 artifact 信息。

### 3.5 结果查询

| 方法 | 作用 |
|---|---|
| `result.getNodeStrategy` | 返回节点动作频率、EV、comboCount、exploitability 和 artifactRef |
| `result.getActionEv` | 返回指定动作的 EV 摘要 |
| `result.getExploitability` | 返回求解 exploitability |

节点 ID 使用树路径：

~~~text
root
root/a0
root/a0/cAh/a1
~~~

大矩阵不会进入 JSON-RPC 响应正文，而是写入 artifact。

### 3.6 Artifact

`artifact.getMetadata` 接受 artifact ID，返回：

- `uri`，格式为 `artifact://<jobId>/<artifactId>`
- `mimeType`
- `sizeBytes`
- `sha256`
- `createdAt`

默认文件目录：

~~~text
%LOCALAPPDATA%\RangePilot\gto-gui\artifacts
~~~

### 3.7 UI 聚焦

| 方法 | 作用 |
|---|---|
| `ui.focusNode` | 打开 Strategy Explorer 并聚焦节点 |
| `ui.openResult` | 打开某次求解的结果视图 |

`ui.focusNode` 参数为 `jobId`、`nodeId`，失败返回 `RESULT_NOT_READY` 或
`NODE_NOT_FOUND`，成功时会推进 state revision。

## 4. 事件

服务端会发送 JSON-RPC notification：

- `event.state_changed`
- `event.selection_changed`
- `event.solve_queued`
- `event.solve_progress`
- `event.solve_completed`
- `event.solve_failed`
- `event.solve_cancelled`

客户端不能把事件当作命令响应，必须按 `method` 分发。

## 5. 错误

错误采用 JSON-RPC error 对象，并带有结构化 `data.code`：

| Code | 含义 |
|---|---|
| `STATE_CONFLICT` | revision 不匹配 |
| `INVALID_SPOT` | SpotSpec 校验失败 |
| `SOLVER_BUSY` | 已有活动 solve |
| `JOB_NOT_FOUND` / `JOB_NOT_ACTIVE` | job 不存在或已结束 |
| `RESULT_NOT_READY` | 结果或 UI 尚未就绪 |
| `NODE_NOT_FOUND` | 节点路径不存在 |
| `UNAUTHORIZED` | 未完成握手或 token 错误 |
| `INVALID_REQUEST` | 参数或方法不合法 |

## 6. 契约与实现

- Schema：`apps/gto-gui/api/schema/`
- Server / dispatcher：`apps/gto-gui/src/api/`
- 契约测试：`apps/gto-gui/tests/api/test_contracts.py`
- WebSocket smoke test：`apps/gto-gui/tests/api/api_smoke_test.cpp`

修改协议时必须先更新 schema，再更新 C++ DTO/dispatcher，最后更新客户端和测试。
