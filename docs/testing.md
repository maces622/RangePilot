# 测试与验收

## 1. 测试矩阵

| 层级 | 内容 | 状态 |
|---|---|---|
| API 契约 | JSON Schema 与 golden message 校验 | 通过 |
| API 集成 | WebSocket JSON-RPC smoke test | 通过 |
| ACP 协议 | initialize/session/prompt/permission | 通过 |
| ChatPanel | offscreen UI smoke test | 通过 |
| 插件单元 | tools、job、approval | 10/10 通过 |
| 真实端到端 | DeepSeek + DSH + GUI + Solver | 通过 |

## 2. 常用命令

### API 契约

~~~powershell
cd apps/gto-gui
python tests/api/test_contracts.py
~~~

### API WebSocket smoke test

~~~powershell
mkdir build-api-test
cd build-api-test
qmake ../tests/api/api_smoke_test.pro
nmake
release\api_smoke_test.exe
~~~

### ACP client smoke test

~~~powershell
cd apps/gto-gui
qmake tests/chat/chat_smoke_test.pro
nmake
~~~

### ChatPanel smoke test

~~~powershell
qmake tests/chat/chat_panel_smoke_test.pro
nmake
~~~

## 3. 插件测试

~~~powershell
cd plugins/dsh-gto-solver
node --experimental-strip-types --test tests/*.test.ts
~~~

覆盖：

- Spot 参数解析；
- 求解预算；
- approval allow/reject；
- DSH job 与 GTO job 映射；
- 取消和终态。

## 4. 真实模型验收

已完成以下端到端场景：

1. Agent 调用 `gto_get_state`；
2. revision 冲突返回 `STATE_CONFLICT`；
3. 审批拒绝后不启动求解；
4. 审批允许后启动后台 solve；
5. 求解进度和完成状态；
6. `gto_query_strategy` 返回动作摘要和 artifactRef；
7. `job_kill` 后 GTO 进入 `cancelling` 并最终 `cancelled`。

验证使用真实 DeepSeek 模型、真实 DSH ACP 和真实 GUI Local API，
没有使用 mock 结果替代关键链路。

## 5. 已知非阻塞警告

- DSH 源码模式启动时可能出现 `typert.host.js` 缺失警告；
- Qt offscreen 测试可能出现字体目录警告；
- 这些警告不影响当前协议和业务链路，但正式发布前应构建 DSH artifacts
  并补齐运行资源。
