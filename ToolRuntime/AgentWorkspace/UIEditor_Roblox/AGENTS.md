# UIEditor Roblox AI 工作区

本目录用于通过运行中的 `ui-editor` MCP 制作、检查和测试界面。实际界面保存在编辑器当前打开的工程；不直接修改工程 JSON 或运行数据。

## 工作流程

1. 读取 `uie.editor.get_state` 和 `uie.editor.get_capabilities`，确认工程、语言、版本与能力。不要假设其他工程也使用 Luau 或 Roblox 节点。
2. 修改已有界面时，先用 `uie.nodes.find/get` 找到稳定节点 ID。查询不要求选中节点。
3. 使用 `uie.code.execute` 批量制作。携带刚取得的 sessionId/revision；冲突后重新读取，不盲目重试。一次执行的改动整体可撤销重做。
4. 用 `uie.scripts.get/set` 直接读取和修改交互代码 source、模拟接入代码 integration；也可以在制作代码中用 ui.scripts.get/set 一起修改节点和源码。使用 `uie.runtime.control` 运行，再通过 `uie.runtime.click` 测试按钮。查看 diagnostics 和 screenshot；错误时停止后修正。
5. 只在用户授权保存时保存。新目标使用工程 interfaces 内的相对路径；不直接覆盖其他文件。切换脏文档前保存，只有明确允许放弃修改时才传 discardChanges。

MCP 不提供 undo/redo。修改结果进入编辑器历史，用户可在 App 内撤销或重做；制作代码内部也没有历史 API。AI 修正通过再次编辑节点或源码完成。

## 参考

- [制作接口](references/editor-api.md)
- [交互与模拟接入](references/runtime-api.md)
- `examples/` 提供节点制作、交互类和模拟接入类。示例不会自动加载。

运行只是 App 模拟；动作和状态不能作为真实资格校验或发奖依据。完成时说明制作内容、验证结果及是否保存。
