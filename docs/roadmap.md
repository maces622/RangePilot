# 路线图与已知限制

## 1. 当前阶段

当前为阶段 6 MVP 完成状态：

- GTO Local API 已实现并测试；
- DSH Cordis 插件已实现并测试；
- Qt ACP Chat 已接入真实 DSH；
- 真实 DeepSeek 模型端到端链路已跑通；
- 一键演示脚本和本地演示环境已具备。

## 2. 已知限制

### 插件打包

插件尚未声明 `dsh.bundle`，安装后需要手工写入 profile 的
`cordis.patch.yml`。这影响可分发性，不影响当前本地演示。

### UI 形态

Qt Chat 是 MVP 客户端，功能集中在：

- 对话；
- 工具状态；
- 审批；
- Markdown 展示。

它没有完整 DSH UI 的会话管理、设置、模型选择和任务面板。

### Artifact 元数据

artifact 文件已持久化，但进程内元数据索引尚未持久化；
进程重启后 `artifact.getMetadata` 不能自动恢复历史索引。

### UI Focus 工具

API 已有 `ui.focusNode` / `ui.openResult`，但 DSH 插件尚未提供对应的
Agent tool。

### DSH 启动

源码模式启动会出现 typert 构建产物缺失警告；
正式分发前应执行 DSH artifacts build。

## 3. 近期优先级

1. 给插件补充 `dsh.bundle`，移除手工 profile patch；
2. 增加 `gto_focus_node` / `gto_open_result` 工具；
3. 持久化 artifact 元数据索引和生命周期清理；
4. 完善 Qt Chat 的会话、错误恢复和审批历史；
5. 评估 DSH Web UI 作为主交互入口。

## 4. 中期方向

- 打包 Windows 安装器和运行时依赖；
- 建立领域资源包和评估集；
- 增加更多 GTO 研究工具；
- 支持模型/推理配置切换；
- 建立更完整的可重复端到端验收。
