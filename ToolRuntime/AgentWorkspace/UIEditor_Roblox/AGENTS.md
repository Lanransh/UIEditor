# UIEditor Roblox AI 工作区

本目录用于通过运行中的 `ui-editor` MCP 制作、检查和测试界面。实际界面保存在编辑器当前打开的工程；不直接修改工程 JSON 或运行数据。

制作前阅读 [Game-DESIGN.md](Game-DESIGN.md)，Stud 风格使用 [.agents/skills/roblox-stud-ui/SKILL.md](.agents/skills/roblox-stud-ui/SKILL.md)。Figma 提示词是视觉参考，交付以当前 UIEditor 工程内可编辑的界面为准。

当前编辑器的视觉效果全部用节点和属性实现，保存后编辑态直接显示；不依赖运行时样式脚本。AI 可用制作 API 批量创建这些节点；交互与接入脚本仅负责动作和数据更新。Toolkit 运行时样式脚本仅用于以后 Roblox 移植参考，不装到当前界面。

节点采用 PascalCase：ScreenGui 根为 `*UI`，按钮为 `*Btn`，文本为 `*Txt`，可见底板/图标/纹理为 `*Img`，透明结构容器为 `*Box`。名称不包含中文、斜杠或下划线；同一父节点下名称唯一。UIStroke/UICorner 等辅助组件保留明确的组件名，不伪装成图片。后缀表示用途，className 仍使用真实 Roblox 类型。

编写或修改任何 Luau 前阅读 [.agents/skills/roblox-luau-standards/SKILL.md](.agents/skills/roblox-luau-standards/SKILL.md)：赋值等运算符两侧留空格，四空格缩进，展开分支与回调，函数写中文意图和准确的参数/返回标签。用 FXLoader:PlayerGui("实际ScreenGui名称") 获取界面，再用 Here 查子节点；也可直接传含界面名的 PlayerGui 路径。生成代码不使用 GetRootNode 获取节点。路径只支持点分隔，不支持斜杠；节点名不包含点号。

## 工作流程

1. 读取 `uie.editor.get_state` 和 `uie.editor.get_capabilities`，确认工程、语言、版本与能力。不要假设其他工程也使用 Luau 或 Roblox 节点。
2. 修改已有界面时，先用 `uie.nodes.find/get` 找到稳定节点 ID。查询不要求选中节点。
3. 使用 `uie.code.execute` 批量制作。携带刚取得的 sessionId/revision；冲突后重新读取，不盲目重试。一次执行的改动整体可撤销重做。
4. 用 `uie.scripts.get/set` 直接读取和修改交互代码 source、模拟接入代码 integration；也可以在制作代码中用 ui.scripts.get/set 一起修改节点和源码。使用 `uie.runtime.control` 运行，再通过 `uie.runtime.click` 测试按钮。查看 diagnostics 和 screenshot；错误时停止后修正。
5. 用户要求“制作好”“在编辑器完成”包含将成果保存为当前工程内的新界面；单纯试验、预览请求按用户意图处理。新目标使用工程 interfaces 内的相对路径；不直接覆盖其他文件。切换脏文档前保存，只有明确允许放弃修改时才传 discardChanges。

MCP 不提供 undo/redo。修改结果进入编辑器历史，用户可在 App 内撤销或重做；制作代码内部也没有历史 API。AI 修正通过再次编辑节点或源码完成。

## 参考

- [制作接口](references/editor-api.md)
- [交互与模拟接入](references/runtime-api.md)
- `examples/` 提供节点制作、交互类和模拟接入类。示例不会自动加载。

运行只是 App 模拟；动作和状态不能作为真实资格校验或发奖依据。完成时说明制作内容、验证结果及是否保存。

交互类继承公共 `CUIEditorUICompClass`，公共类在游戏中继承 `FCUICompClass`。导入通过文件菜单调用 Toolkit；生成脚本进入游戏 Client/UI/Generated，真实业务子类独立维护。旧直接继承 FCUICompClass 的文档仍可模拟，导入时迁到公共基类。
