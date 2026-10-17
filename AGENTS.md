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
└─ engines/
   └─ dsh/                            # Git submodule：DSH Agent Engine