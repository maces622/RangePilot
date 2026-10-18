# MVP 演示指南

## 1. 前置条件

- Windows；
- Qt 5.15.2 / MSVC 2017；
- Node.js；
- DSH 子仓依赖已安装；
- DeepSeek API Key。

默认工具路径：

~~~text
D:\conda\Library\bin\qmake.exe
C:\Program Files (x86)\Microsoft Visual Studio\2017\Professional\VC\Auxiliary\Build\vcvars64.bat
~~~

可通过环境变量覆盖：

- `RANGEPILOT_QMAKE`
- `RANGEPILOT_NODE`

## 2. 配置密钥

~~~powershell
copy .env.example .env
~~~

把本地 Key 写入 `.env`：

~~~text
DEEPSEEK_API_KEY=sk-local-only
~~~

`.env` 已被 `.gitignore` 忽略。演示进程也可以通过环境变量直接继承
`DEEPSEEK_API_KEY`。

## 3. 构建与启动

~~~powershell
powershell -ExecutionPolicy Bypass -File scripts\build-mvp-demo.ps1
scripts\run-mvp-demo.cmd
~~~

构建脚本输出到：

~~~text
build/mvp/
.demo/app/release/TexasSolverGui.exe
~~~

## 4. 启动器做了什么

1. 从 `.env` 读取本地配置；
2. 设置 `DSH_HOME=.demo/dsh-home`；
3. 在 `acp` profile 中安装插件；
4. 写入演示 profile 的 `cordis.patch.yml`；
5. 设置 `RANGEPILOT_DSH_COMMAND`、`RANGEPILOT_DSH_ARGS`、
   `RANGEPILOT_DSH_CWD`；
6. 启动 `--api-enabled --api-port 0` 的 TexasSolverGui；
7. Qt Chat 通过 ACP 启动 DSH 并建立 session。

演示环境、构建产物和密钥文件都不会进入 Git。

## 5. 演示流程

### 读取状态

~~~text
读取当前 GTO 状态，告诉我 revision、positions 和 board。
~~~

### 校验并发控制

~~~text
先读取当前状态，然后用过期 revision 调用 gto_set_spot，验证 STATE_CONFLICT。
~~~

### 启动求解

~~~text
OOP 范围 AA KK，IP 范围 AA AKs AKo QQ，其他设置默认，迭代 10 次后求解。
出现审批时等我确认。
~~~

### 查询结果

~~~text
查询 root 节点的策略摘要，用 Markdown 表格展示动作、频率和 EV。
~~~

## 6. 手动配置

禁用 Qt Chat 自动启动，只运行 GUI API：

~~~powershell
TexasSolverGui --api-enabled --api-port 0
~~~

让 Qt Chat 启动指定的 DSH：

~~~text
RANGEPILOT_DSH_COMMAND=C:\nvm4w\nodejs\node.exe
RANGEPILOT_DSH_ARGS=--import tsx/esm apps/cli/src/bin.ts --profile acp
RANGEPILOT_DSH_CWD=F:\GTO-Agent\engines\dsh
~~~

## 7. 常见问题

### Chat 显示 Disconnected

检查 `RANGEPILOT_DSH_COMMAND`、`RANGEPILOT_DSH_ARGS` 和
`RANGEPILOT_DSH_CWD`。手动执行同一命令确认 DSH 能启动。

### 提示没有 API Key

确认 `.env` 位于仓库根目录，或启动进程环境中有 `DEEPSEEK_API_KEY`。

### API discovery 不存在

确认 GUI 使用 `--api-enabled` 启动，并检查：

~~~text
%LOCALAPPDATA%\RangePilot\gto-gui\api.json
~~~

### 求解报 Build the game tree before starting solve

当前实现已修复该问题：`solve.start` 会自动执行 build tree 和训练。
如果仍出现，确认使用最新构建。

### 输出窗口太小

AI Chat 默认是独立浮动窗口，可拖动或在标题栏重新停靠。
