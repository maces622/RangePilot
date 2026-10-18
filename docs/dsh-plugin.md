# DSH GTO 插件

`plugins/dsh-gto-solver` 是树外 DSH Cordis 插件。它把 GTO Solver GUI 的 Local API
封装为 Agent 工具、审批和后台任务，不修改 `engines/dsh` 源码。

## 1. 插件边界

~~~ts
export const name = 'dsh-gto-solver'
export const inject = ['tools', 'jobs']
export function apply(ctx, config) { ... }
~~~

职责：

- 连接 GUI 的 `api.json` discovery 文件；
- 维护 Local API WebSocket 连接；
- 注册 5 个 GTO tools；
- 在 `tools/pre-execute` 中做预算校验和审批；
- 将 GTO solve job 映射为 DSH 后台 job；
- 在插件卸载时取消任务并关闭连接。

## 2. 工具

### `gto_get_state`

读取当前状态、revision、SpotSpec、tree 摘要和 solve 状态。

### `gto_set_spot`

参数：

- `expectedRevision`
- `spot`：完整 SpotSpec

成功返回新的 revision 和 normalizedSpot；revision 不匹配返回
`STATE_CONFLICT`。

### `gto_start_solve`

参数：

- `expectedRevision`
- `options`：`maxIterations`、`targetExploitability`、`threads`、
  `algorithm`、`printInterval`、`dumpRounds`

返回 DSH job ID，不等待求解完成。

### `gto_get_solve_status`

参数：`jobId`，DSH job ID。返回进度、迭代次数、exploitability、耗时和
终态。

### `gto_query_strategy`

参数：

- `jobId`：DSH job ID
- `nodeId`：例如 `root`、`root/a0`
- `actions`：可选动作过滤
- `limit`：返回动作数量上限

返回动作级摘要、comboCount、exploitability 和 artifactRef。

## 3. 审批与预算

`gto_start_solve` 在 `tools/pre-execute` 中完成：

1. 参数解析；
2. 单任务检查；
3. 连接 Local API；
4. 读取状态并校验 revision；
5. 检查预算；
6. 返回 `ask` 审批。

默认预算：

| 配置 | 默认值 |
|---|---|
| `maxIterations` | 500 |
| `maxThreads` | 16 |
| `maxRuntimeMs` | 600000 |
| `minTargetExploitability` | 0.05 |

审批通过后，插件调用 `solve.start`；用户拒绝时工具失败，不启动求解。

## 4. 后台 Job

每个 DSH solve job 保存：

- DSH job ID；
- GTO API job ID；
- 连接和取消句柄；
- 最近状态。

`ctx.jobs` 负责生命周期、输出和取消；插件内部定时查询
`solve.getStatus`。取消或插件卸载时调用 `solve.cancel`。

## 5. 安装与 profile

当前插件没有声明 `dsh.bundle`，安装后需要手工在 profile 的
`cordis.patch.yml` 中加入：

~~~yaml
- insert:
    - id: rangepilot-gto-solver
      name: '@rangepilot/dsh-gto-solver'
~~~

安装示例：

~~~powershell
dsh plugin --profile acp add link:F:\GTO-Agent\plugins\dsh-gto-solver
~~~

这是当前实现的已知不足。后续应在 `package.json` 中补充标准 bundle 元数据，
让插件自动成为 profile layer。

## 6. 测试

~~~powershell
cd plugins/dsh-gto-solver
node --experimental-strip-types --test tests/*.test.ts
~~~

当前 10/10 通过。真实模型验收见 [测试与验收](testing.md)。
