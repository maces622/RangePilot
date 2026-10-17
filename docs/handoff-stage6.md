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
- GUI 以 offscreen 模式启动并成功拉起 fake ACP 子进程。

## 尚未完成

1. 当前环境无法完成 `engines/dsh` 的完整依赖安装（离线 store 缺少部分包，
   网络不可用），因此还没有启动真实 DSH `acp` profile。
2. 尚未通过 `dsh plugin --profile acp add ...` 安装树外插件并验证真实
   `ctx.tools` / `ctx.jobs` / approval 链路。
3. 还缺真实模型凭据下的端到端验收：
   - Agent 读状态；
   - revision 冲突；
   - 一次审批；
   - 后台求解进度；
   - 用户停止同时取消 DSH job 与 GTO solve；
   - strategy 查询。
4. 插件当前直接以 TypeScript source 作为 `main`；正式安装前需要确认目标
   DSH profile 的 source/link 加载方式或补充构建产物。

## 下一步

在具备 DSH 依赖和模型凭据的机器上：

1. 构建 DSH 并创建一次性 `acp` profile；
2. 安装 `plugins/dsh-gto-solver`；
3. 启动 GUI，设置 `RANGEPILOT_DSH_*`；
4. 按 `docs/dsh-side-mvp.md` 第 13 节逐项跑验收；
5. 根据真实 ACP/tool 结果修正协议或插件适配；
6. 再提交阶段 6。
