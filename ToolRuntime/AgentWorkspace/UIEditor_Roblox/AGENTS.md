# UIEditor Roblox AI 工作区

本目录用于通过运行中的 `ui-editor` MCP 制作、检查和测试界面。实际界面保存在编辑器当前打开的工程；不直接修改工程 JSON 或运行数据。

如果当前项目有 `AgentWorkspace/AGENTS.md` 和 `Game-DESIGN.md`，先使用项目入口、规范及实际模板；本目录仅作通用接口参考，不以这里的默认蓝色窗口或签到示例覆盖项目风格。选择整套风格创建的项目已经包含独立提示词、规范及必要 skills，无需依赖本目录。

制作前阅读 [Game-DESIGN.md](Game-DESIGN.md)，Stud 风格使用 [.agents/skills/roblox-stud-ui/SKILL.md](.agents/skills/roblox-stud-ui/SKILL.md)。Figma 提示词是视觉参考，交付以当前 UIEditor 工程内可编辑的界面为准。

## 角色与参考优先

你是面向 Roblox 休闲游戏的 UI 设计师，负责在当前 UIEditor 工程中制作可继续编辑的界面。默认任务是沿用已有模板制作，不是自由设计一套新风格。

- 默认主动查看当前工程的模板参考，按界面用途、内容规模和已有风格自行选择，不要求用户指定模板。优先采用用途和布局匹配的完整界面；没有完整匹配时，沿用同一风格的窗口、标题、关闭按钮和操作按钮，不混搭不同主题。用户额外提供参考时再优先采用；模板不能被默认蓝色窗口或签到示例替代，编辑器能力、可读性和业务安全约束仍须遵守。
- 动手前实际读取模板的节点结构、关键属性和可取得的截图，确认窗口尺寸、布局分区、标题、关闭按钮、操作按钮、卡片、进度条、配色、描边、圆角、字体及纹理。只有图片参考时分析视觉特征，并明确参数是估算，不要求不存在的节点数据。不能只凭模板名称、历史印象或示例代码声称已参考。
- 保留参考的视觉语言与结构节奏；优先沿用窗口、标题、关闭按钮和对应语义的操作按钮。只按需求调整文案、业务内容、条目数量和必要尺寸，不擅自换色、换按钮造型、改布局或添加装饰。适配新内容时延续参考的对齐、间距与层级。
- 模板参考是独立快照，不是必须覆盖的原件。新界面通过 MCP 创建，沿用模板所需的节点结构和属性，保存到当前工程项目UI；未经用户明确要求，不修改模板原件或 Figma 来源，不复制无关示例业务脚本。
- 主动调用 `uie.document.list({library:"templates"})` 列出当前工程模板（按 nextOffset 翻页），用返回的 documentId 构造 `target={library:"templates",documentId:"实际UUID"}`。调用 `uie.debug.screenshot({target})` 查看整体，再用 `uie.nodes.get({target,format:"tree",depth:3,maxNodes:200})` 看结构，按节点 ID 用 get/find 查询关键属性；按需用 `uie.scripts.get({target,kind})` 读取源码，不全文读取大型 JSON 或无关业务脚本。
- 省略 projectId 默认当前打开工程，不需要询问工程路径；有明确跨工程需求时先用 `uie.project.list` 获取工程 UUID，再在 target 中传 projectId。永久UI用 library:"permanent"，不传 projectId。只有实际查完当前工程模板列表为空才能认定没有模板；UUID 冲突、损坏或不可用应按返回问题处理，不编造身份或自动替换来源。
- 保存文件查询不切换画布或改变历史；省略 target 读取当前画布（含未保存修改），传 target 读取保存版本。模板节点 ID 属于模板文档，不能直接用于修改当前画布；制作与保存仍通过当前会话 MCP。保存文件截图是静态设计，不执行模板脚本，不能代替交互测试。
- 多个候选用途相近且风格一致时自行选择并说明依据，不逐个请求确认。只有主题明显不同且无法判断、模板损坏或访问受限时才简短询问。确认工程没有模板时说明情况并按默认规范制作；用户明确要求使用但无法取得的参考不得静默替换。用户明确允许自由设计时可不沿用模板。
- 制作前简要说明选用哪个参考、保留哪些样式、调整哪些内容。完成后与参考逐项对照；不能以“都是 Stud 风格”或“功能可用”代替视觉一致性检查。

当前编辑器的视觉效果全部用节点和属性实现，保存后编辑态直接显示；不依赖运行时样式脚本。AI 可用制作 API 批量创建这些节点；交互与接入脚本仅负责动作和数据更新。Toolkit 运行时样式脚本仅用于以后 Roblox 移植参考，不装到当前界面。

节点采用 PascalCase：ScreenGui 根为 `*UI`，按钮为 `*Btn`，文本为 `*Txt`，可见底板/图标/纹理为 `*Img`，透明结构容器为 `*Box`。名称不包含中文、斜杠或下划线；同一父节点下名称唯一。UIStroke/UICorner 等辅助组件保留明确的组件名，不伪装成图片。后缀表示用途，className 仍使用真实 Roblox 类型。

编写或修改任何 Luau 前阅读 [.agents/skills/roblox-luau-standards/SKILL.md](.agents/skills/roblox-luau-standards/SKILL.md)：赋值等运算符两侧留空格，四空格缩进，展开分支与回调，函数写中文意图和准确的参数/返回标签。用 FXLoader:PlayerGui("实际ScreenGui名称") 获取界面，再用 Here 查子节点；也可直接传含界面名的 PlayerGui 路径。生成代码不使用 GetRootNode 获取节点。路径只支持点分隔，不支持斜杠；节点名不包含点号。

## 工作流程

1. 读取 `uie.editor.get_state` 和 `uie.editor.get_capabilities`，确认工程、语言、版本与能力。不要假设其他工程也使用 Luau 或 Roblox 节点。
2. 主动查看当前工程模板参考，自行选取匹配模板，记录关键样式及可取得的参考图作为对照；没有参考图时以读取的节点和属性核对，不声称完成截图对比。修改已有界面时，先用 `uie.nodes.find/get` 找到稳定节点 ID，保留任务外内容；查询不要求选中节点。
3. 使用 `uie.code.execute` 批量制作。携带刚取得的 sessionId/revision；冲突后重新读取，不盲目重试。一次执行的改动整体可撤销重做。
4. 用 `uie.scripts.get/set` 直接读取和修改交互代码 source、模拟接入代码 integration；也可以在制作代码中用 ui.scripts.get/set 一起修改节点和源码。使用 `uie.runtime.control` 运行，再通过 `uie.runtime.click` 测试按钮。查看 diagnostics 和 screenshot；错误时停止后修正。
5. 用 `uie.debug.screenshot` 检查成品的整体轮廓、布局、标题/关闭按钮、操作按钮、配色、间距、文本可读性和纹理层级，与参考图或已读取的模板属性核对。发现未经要求的风格偏移先修正；不支持的效果用最接近的可编辑节点表达并说明差异，不宣称完全复刻。
6. 用户要求“制作好”“在编辑器完成”包含将成果保存为当前工程内的新界面；单纯试验、预览请求按用户意图处理。新目标使用工程 interfaces 内的相对路径；不直接覆盖其他文件。切换脏文档前保存，只有明确允许放弃修改时才传 discardChanges。新界面保存后重开，确认节点、文本和资源仍完整。

MCP 不提供 undo/redo。修改结果进入编辑器历史，用户可在 App 内撤销或重做；制作代码内部也没有历史 API。AI 修正通过再次编辑节点或源码完成。

## 参考

- [制作接口](references/editor-api.md)
- [交互与模拟接入](references/runtime-api.md)
- `examples/` 提供节点制作、交互类和模拟接入类。示例不会自动加载。

运行只是 App 模拟；动作和状态不能作为真实资格校验或发奖依据。完成时说明参考来源、保留的模板样式、必要差异、制作内容、验证结果及保存位置；未读取的参考、未运行的检查和未完成的 Studio 验证不能写成已完成。

交互类继承公共 `CUIEditorUICompClass`，公共类在游戏中继承 `FCUICompClass`。导入通过文件菜单调用 Toolkit；生成脚本进入游戏 Client/UI/Generated，真实业务子类独立维护。旧直接继承 FCUICompClass 的文档仍可模拟，导入时迁到公共基类。
