# Handoff：阶段 6 Qt ACP Chat 与 Windows 构建

> 新会话开始时先阅读仓库根目录 `AGENTS.md`，再阅读本文件与
> `docs/dsh-side-mvp.md`。

## 已完成

### Windows 完整 GUI 构建

已修复阶段 5 记录的三类阻塞并成功链接 `TexasSolverGui.exe`：

- 移除 `Dic5Compairer.cpp` 对 MSVC 不可用的 `<unistd.h>` 依赖；
- 将 OpenMP 循环下标改成 MSVC 2017 可接受的 `int`；
- 为 MSVC 2017 条件跳过 `json.hpp` 两个已废弃流运算符的 deprecated 属性；
- `TexasSolverGui.pro` 补入 `artifact_store.cpp`。

### Qt ACP Client

新增：

- `apps/gto-gui/src/chat/acp_client.h`
- `apps/gto-gui/src/chat/acp_client.cpp`

实现换行分隔 JSON-RPC over stdio：

- `initialize`
- `session/new`
- `session/prompt`
- `session/update`
- `session/request_permission`
- `session/cancel`
- `session/close`

### Qt Chat Panel

新增：

- `apps/gto-gui/src/chat/chat_panel.h`
- `apps/gto-gui/src/chat/chat_panel.cpp`

提供消息流、输入框、发送/停止按钮、工具状态行和求解审批弹窗。面板作为
`QDockWidget` 加入 MainWindow，并可通过 `AI Chat` 菜单项显示或隐藏。

DSH 启动配置来自环境变量或 `QSettings`：

```text
RANGEPILOT_DSH_COMMAND
RANGEPILOT_DSH_ARGS
RANGEPILOT_DSH_CWD
```

对应 `QSettings` 键为 `dsh/command`、`dsh/arguments`、`dsh/workingDirectory`。

### 测试

- `apps/gto-gui/tests/chat/chat_smoke_test.cpp`
- `apps/gto-gui/tests/chat/fake_acp_server.py`
- `apps/gto-gui/tests/chat/chat_smoke_test.pro`
- `apps/gto-gui/tests/chat/chat_panel_smoke_test.cpp`
- `apps/gto-gui/tests/chat/chat_panel_smoke_test.pro`

验证 initialize、session/new、流式文本、permission 请求/响应、tool update、
prompt 完成，以及 ChatPanel 输入/发送/流式渲染路径。

## 当前验证

- 完整 Windows GUI 构建成功；
- Qt ACP client smoke test 通过；
- Qt ChatPanel offscreen smoke test 通过；
- GTO API contract tests 通过；
- GTO API WebSocket smoke test 通过；
- DSH 插件独立测试 10/10 通过；
- GUI 以 offscreen 模式启动并成功拉起 fake ACP 子进程；
- `engines/dsh` 依赖已安装，真实 `dsh --profile acp` 能完成 `initialize`
  和 `session/new`；
- `plugins/dsh-gto-solver` 已通过 `dsh plugin --profile acp add link:...`
  安装，并在真实 Cordis profile 中加载；
- 使用临时 keyless mock LLM 完成真实 ACP 端到端验证：
  - Agent 调用真实 `gto_get_state`，从运行中的 GUI API 读取 revision 和 spot；
  - Agent 调用 `gto_start_solve` 时，DSH 发出
    `session/request_permission`；
  - 客户端拒绝审批后，工具返回 rejected，未启动 GTO 求解。
- 真实 GUI 仍成功构建；临时 mock profile 和 mock LLM 文件已在验证后清理，
  `engines/dsh` 工作区保持干净。

## 尚未完成

1. 当前环境没有真实 `DEEPSEEK_API_KEY`，因此尚未用真实模型跑完整工具对话。
2. 尚未完成真实模型凭据下的完整 MVP 验收：
   - revision 冲突；
   - 允许审批后后台求解；
   - 求解进度与完成；
   - 用户停止同时取消 DSH job 与 GTO solve；
   - 求解完成后的 strategy 查询。
3. 插件当前直接以 TypeScript source 作为 `main`；本次 `link:` 安装已验证可
   加载，但发布/分发前仍应补充正式构建产物或确认目标 DSH profile 的
   source-loading 策略。

## 下一步

当前剩余工作已经收敛为真实模型下的完整验收：

1. 配置 `DEEPSEEK_API_KEY`；
2. 启动 GUI 与真实 `dsh --profile acp`；
3. 按 `docs/dsh-side-mvp.md` 第 13 节逐项跑验收；
4. 重点补齐 allow 审批、revision 冲突、求解进度、停止取消和 strategy 查询；
5. 根据真实模型对话修正插件工具描述或审批文案；
6. 验收通过后更新阶段状态和 README。
