# RangePilot 文档

本目录只保留与当前实现一致的文档。历史阶段设计和 handoff 放在
[`history/`](history/)，仅用于追溯设计过程，不应作为当前接口说明使用。

## 当前文档

| 文档 | 内容 |
|---|---|
| [架构](architecture.md) | 进程边界、组件职责、核心数据流和关键约束 |
| [GTO Local API](gto-local-api.md) | WebSocket JSON-RPC 传输、方法、状态、错误和示例 |
| [DSH GTO 插件](dsh-plugin.md) | Cordis 插件、5 个工具、审批、后台 job 和安装方式 |
| [MVP 演示](mvp-demo.md) | 环境准备、构建、启动、演示脚本和排错 |
| [测试与验收](testing.md) | 测试矩阵、命令和真实模型验收记录 |
| [路线图](roadmap.md) | 已知限制、近期优先级和候选方向 |

## 事实来源

- API 契约：`apps/gto-gui/api/schema/`
- API 实现：`apps/gto-gui/src/api/`
- Qt Chat：`apps/gto-gui/src/chat/`
- DSH 插件：`plugins/dsh-gto-solver/`
- DSH 子仓：`engines/dsh/`，保持上游提交，不做本地 fork
- 一键脚本：`scripts/`
