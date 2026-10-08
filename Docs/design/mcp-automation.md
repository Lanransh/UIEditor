# MCP 自动化

## 架构与工程能力

`ui-editor` stdio MCP 服务通过 Electron 本机桥接操作当前编辑会话。工具目录静态声明，App 未启动时也可以发现；实际调用读取 Runtime/ui-editor-automation.json，连接随机回环端口并使用随机令牌。Hub 不隐式激活工程。桥接和渲染 IPC 都校验来源或令牌，请求串行执行，文档切换和会话卸载使旧请求失效。

工程策略声明制作语言、版本、API、节点属性、父子规则和运行能力。当前 Roblox 使用 Luau 0.694，制作与运行能力分别声明。主进程的 CodeAdapter 提供执行器，通用 executeCode 检查语言后路由；其他语言需要自己的适配器，不自动翻译或降级。MCP 工具和通用查询不包含 Roblox 节点规则。当前文档格式仍为 version 3。

## 工具与查询

get_capabilities 省略参数或 detail="full" 保持完整能力返回；detail="summary" 返回 API、运行限制与 nodeTypes，省略节点属性和父子规则。需要节点详细约束时传 className（如 Frame），返回该类型完整属性与允许的子类型；未知类型报错。摘要中的 nodeDetails 指引补查，不能把未加载的规则当成不支持。

nodes.get/find 可传 compact=true，JSON 节点摘要仅保留 id/name/className，省略重复 path/parentId；get 仍保留属性、图片引用、children 和截断信息，find 保留分页。文本树不受 compact 影响。省略或传 false 保持原返回。

固定工具包含 editor.get_state/get_capabilities、nodes.get/find、code.execute、scripts.get/set、document.list/new/open/save、runtime.control/click/hover/scroll/drag/batch、debug.get_diagnostics/screenshot、assets.search/get/configure/import 和 project.list，均带 uie 前缀。不提供选中节点、MCP undo/redo 或制作代码内部的历史 API。尚未新建或打开界面时，get_state 返回 nodeCount=0，full 详情的 document 为 null；状态同时返回 projectId、projectName 和当前 documentId（无文档时为 null），当前文件 library、库内 relativePath 和 mode（edit/unsaved），以及绝对路径 workspacePath、agentWorkspacePath、gameDesignPath 和 gameDesignExists；文档编辑、保存、运行及当前画布截图要求先新建或打开界面。图片查询、配置、本地导入和 ui.assets.apply 见 [图片资产](image-assets.md)。

scripts.get 读取交互代码 source、接入代码 integration，可用 kind 指定其中一份，省略时读取两份。scripts.set 要求 sessionId/revision，可传 source、integration 或同时传两者，未传字段保持原值。源码长度及结构校验沿用文档边界；语法错误允许保存并在运行时反馈。运行中禁止修改源码。code.execute 内的 ui.scripts.get/set 仍可将源码与节点修改组合提交。

节点 ID 是所属文档内的操作身份；名称路径只辅助显示。get 可省略 id 从根读取，JSON 格式提供属性、父 ID、子节点摘要及可选深度（默认 0，最多 64）；format=tree 返回名称、类型、ID 的 Unicode 文本树，默认展开 3 层，深度从根的 0 层计算。两种格式使用 maxNodes 限制返回节点数，默认 200、最多 2000；JSON 在截断父节点返回 truncated/omittedChildren，文本树返回 truncated/truncationReasons 并在树中标明未展开内容。find 使用名称 exact/contains、类型和父范围的交集，默认递归，按节点树顺序分页，默认 50 条、最多 200 条。默认读取设计文档；运行副本需显式 view=runtime，并返回运行会话和帧序号。

## 工程与保存文件的只读目标

project.list 从当前工程和最近工程记录重新读取 project.json，返回工程 UUID、名称、是否当前工程，以及不可用记录和重复 UUID 问题，不扫描磁盘、不切换工程。显式 projectId 只解析已登记且 UUID 唯一的工程；未登记工程需先在 App 打开。省略 projectId 使用当前打开工程，不自动选择最近工程。工程移动后重新打开即可更新位置；同一 UUID 对应多个位置时显式查询报冲突。

document.list 接收 projectId?、library?、offset?、limit?，默认读取当前工程 project 库；templates 是当前/指定工程模板库，permanent 是全局永久UI库且不接受 projectId。返回 interfaces 的 documentId、名称、库内相对路径、问题，以及 total/nextOffset，默认 50 条、最多 200 条；不返回文档内容、图片或脚本。界面 ID 沿用保存定义中的 UUID，不增加路径身份或修改已有文件。损坏文件或旧格式中的非 UUID 界面 ID 单独标明问题，不自动修改文件；同一库内多个文件 UUID 相同时标明问题并拒绝按 ID 读取。跨库、跨工程的相同界面 ID 由目标范围区分。

nodes.get/find、scripts.get 和 debug.screenshot 共用可选 target：`{projectId?,library?,documentId}`。省略 target 读取当前画布（包括未保存修改）；传 target 读取磁盘保存版本，library 默认 project，省略 projectId 使用当前工程。永久库全局读取，不要求打开工程，也不接受 projectId。文件目标不接受 view=runtime；读取不激活工程、不打开文档、不改变会话、dirty 或历史。空白画布或 Hub 中仍可读取有明确来源的保存文件。返回规范化 target，保存文件结果不提供可用于编辑的 sessionId/revision。

目标文件在主进程按 UUID 查找、校验，不接受任意文件路径；库根禁止符号链接，遍历跳过链接。图片引用使用来源工程与永久图片库解析；永久UI只使用永久图片及文件内快照。assets.search/get 增加 projectId?，省略使用当前工程，library=permanent 是全局；不通过查询改变资产配置。

保存文件截图使用独立隐藏、不可聚焦窗口，复用 DocumentPreview 渲染器，等待图片、字体和绘制完成。输出固定 1280×720 PNG（规范化 Windows DPI）、来源 target 和 view=saved-design；不执行文档脚本、不影响前台画布。未传 target 的截图保持现有视口与缩放行为。写入工具及 runtime.control/click、debug.get_diagnostics、get_capabilities 继续绑定当前会话，不接受跨工程目标。

## 稳定鼠标接口

运行输入继续要求当前 sessionId/revision。uie.runtime.click 保持按按钮 ID 激活的语义；新增：

| 工具 | 参数（省略会话字段） | 行为 |
| --- | --- | --- |
| uie.runtime.hover | `{id}`，id 可为 null | 悬停节点或移出；重复悬停同一节点不重复进入 |
| uie.runtime.scroll | `{id,to:{x?,y?}}` 或 `{id,delta:{x?,y?}}` | 目标必须是 ScrollingFrame；二选一，逻辑内容像素；缺省轴保留；返回实际 position 和 range |
| uie.runtime.drag | `{id,from:{x,y},to:{x,y},steps?}` | 局部归一化坐标 0–1，steps 默认 8、范围 1–32；按下、固定次数移动、释放；不激活按钮 |

scroll 的 delta 分发滚轮事件并执行默认滚动，to 定位滚动且只产生属性变化通知，不伪造滚轮。MouseMoved 与 InputChanged 描述拖动路径；普通节点的位移由脚本决定。隐藏或禁用目标返回 dispatched=false 和 reason，不绕过状态；非法类型/参数报错。所有步骤串行等待运行帧更新，返回运行身份、帧序号和 interaction（hoveredId/pressedId）。不提供键盘、焦点或文本输入工具。

runtime.batch 接收同名鼠标步骤，支持 dispatched/reason 预期；assert 除属性和 disabled 外支持 hovered/pressed。运行视图的 nodes.get/find 及 get_diagnostics 返回 interaction，后者沿用日志游标返回 input 日志及脚本输出。AI 应先查询本次运行副本的节点 ID，批量输入并断言 CanvasPosition、样式和按钮状态，再截取关键状态；重置后重新查询动态节点 ID。按 ID 操作不做屏幕坐标命中或遮挡检查，截图和真实鼠标验证保持独立。

## 代码事务与历史

制作执行在独立 Luau VM 中操作草稿，通过当前节点注册表提供创建和属性转换。值类型构造与现有运行宿主共享；不开放文件、网络、require 或 Electron。每次代码最多 256 KiB、5000 次编辑操作、200 条制作日志，沿用 64 MiB VM、250 ms 执行预算、2 秒主进程看门狗及 8 MiB 消息限制。

图片节点可在 create 的 previewImage 选项中附加 `{name,dataUrl}`，或使用 ui.nodes.setPreviewImage 更新、传 nil 清除。图片沿用完整文档校验，不接受远程 URL，不在制作 VM 中读取文件或联网；失败仍整笔回滚。Roblox Image 资源 ID 与本地预览图分别保存。

源码执行成功后严格校验完整文档，再校验当前 sessionId/revision，最后提交一条现有文档命令。节点、属性、层级和两份源码的一次组合修改可以在 App 内整体撤销，scripts.set 的一次修改同样进入文档历史。App redo 恢复已验证快照，不重跑代码。失败、超时、冲突、dry-run 和无变化不影响历史；新编辑清空 redo。手动与 MCP 编辑共用历史，保存不清空历史，新建或打开另一界面重置历史。revision 同时覆盖手动编辑、MCP 提交及 App 内 undo/redo；MCP 不提供历史操作和历史摘要。

## 运行与文件

`uie.runtime.batch` 将已知验证步骤合并为一次 MCP 往返，要求当前 sessionId/revision。
steps 为 1–32 个顺序执行的 `run / reset / stop / click / hover / scroll / drag / assert`，不接受任意
代码、设计修改、文件操作或嵌套批次。click 使用稳定节点 id，可断言 dispatched
和 reason（null、disabled、hidden）；assert 使用稳定节点 id，精确比较指定
properties 的 JSON 值及可选 disabled 状态，只读取运行副本。所有步骤在执行前
完整校验，每步前及异步运行操作后检查编辑会话和 revision。

返回 success、逐步 results（零基 index、结果及失败原因）、skipped、当前会话状态
和有界运行/控制台 diagnostics。第一个运行错误、断言失败或会话冲突即停止后续
步骤，不回滚已执行动作，也不隐式 stop；失败后仍运行时先截图取证，再显式停止
后修复。每批执行前检查 8 秒预算，超过预算不再开始下一步，需拆成较小批次；
原有单步运行超时和桥接超时仍生效。批量操作不修改设计文档、dirty 或历史。

runtime.batch 可传 compact=true：成功步骤移除重复的编辑会话及工程元数据，成功断言只回传所检查的字段；顶层仍提供 sessionId/revision 和最终状态。运行身份、帧序号、动作参数及日志保留；失败步骤保持完整结果和错误。diagnostics 只移除重复元数据，保留日志、错误、游标和截断标记。步骤日志与诊断日志可能重叠，本轮不按文本去重，以免误删重复动作证据。省略或传 false 保持完整返回。

AI 优先一次取得关键节点 ID，再提交带明确预期的验证批次；普通领取、重复点击、
重置及另一领取分支可以放在同一批次。截图保留设计态、确有视觉差异的关键运行态
及保存重开后的结果，不为每次点击重复截图。需要运行态截图时让批次停在该状态，
截图后再继续另一批次。截图与保存重开保持独立，属性断言不能替代视觉检查。

只有编辑和运行状态；运行中禁止设计修改和历史操作。run/stop/reset 与用户工具栏共用运行控制，click 与用户按钮共用事件入口，不可见或禁用时返回未分发原因。运行副本与日志不保存、不进入历史。运行错误结束会话，保留日志并恢复编辑。诊断分别提供运行日志及 App 控制台游标，各最多保留 500 条并报告截断。截图切回界面页、等待绘制，捕获实际画布视口，隐藏选择装饰与提示，返回 PNG 尺寸和缩放；它不是 Roblox 设备渲染结果。

document.open 接受 interfaces 内的 relativePath，或 UUID target，二者互斥；target 只允许当前工程 project/templates。模板必须显式指定 mode=edit（原件）或 copy（未保存副本）。编辑原件绑定实际文件位置并保留文档与既有节点 ID，复用 code.execute、scripts.set 和 App 历史。

document.save 无路径时保存当前绑定的项目 UI 或模板原件；带 relativePath 时在 interfaces 独占新建，不覆盖。模板原件保存使用打开时的文件内容版本检查外部修改、移动或删除，发生冲突时保留画布修改并报错；成功后更新版本。路径检查越界与符号链接。切换未保存界面需先保存或显式 discardChanges；MCP 不弹系统文件对话框，不自动放弃修改。

工作区 AGENTS.md 要求只有用户提出或同意时才能修改模板原件；普通制作仅参考模板或使用副本。该授权是 AI 工作规则，不新增确认弹窗或授权令牌。规范文件 styles/Game-DESIGN.md 由 AI 根据 get_state 返回的绝对路径使用文件工具读写；路径不会授予文件系统权限，不新增 MCP Markdown 读写接口。修改规范不自动修改模板，修改模板不自动更新已有项目 UI、其他工作区或全局画风库。

## Hub、工作区与打包

Hub 右上角“设置”提供 Codex MCP 配置，不提供 AI 工作区打开按钮。配置管理 CODEX_HOME/config.toml（未设置时为用户 .codex/config.toml）中的 ui-editor command/args/enabled，保留其他配置并验证 TOML。启动路径包含显式发现文件地址，不依赖 Codex 工作目录；写入前检查配置是否变化，再原子替换。

开发构建输出 Editor/mcp-dist/server.mjs；打包复制到 resources/mcp-dist，ASAR 外由 Node 启动，原生宿主位于 resources/native-bin。Hub 检查服务文件与 Node。所有新工程拥有独立 AgentWorkspace，由 ProjectTypes/Roblox 提供公共入口、节点与代码技能，TemplateStyles/Roblox 提供可选视觉规范、模板和风格专项技能。制作和保存仍通过 MCP，重开不覆盖提示词；流程见 [模板风格与项目 AI 工作区](template-styles.md)。旧全局 AI 入口已退役，历史视觉示例仅作为仓库参考资料保留。

## 验证

`npm run build:runtime` 构建原生宿主与编辑入口；`npm run build` 包含 MCP bundle。`tests/automation-reader.test.ts` 检查 UUID 来源、默认工程、全局库、文件重命名、重复身份、图片来源、树截断与校验；`tests/automation.test.ts` 检查真实 Luau、事务、查询、文件、配置及桥接；`npm run test:mcp` 使用真实 stdio 与隔离 Electron 工程检查制作、历史、运行、点击、日志、截图及保存重开，并验证空白/脏画布下读取模板和跨工程查询不改变会话、独立截图的像素/尺寸及窗口清理。`npx tsx tests/template-editing-smoke.ts` 验证模板卡片直接打开、人工与 MCP 混合编辑及撤销重做、原件保存重开、外部冲突、副本隔离和风格文件重开保留。先 package 后执行 `npm run test:mcp:packaged` 验证打包路径。所有 App 测试不能替代 Studio 或设备验收。

需要保留正在运行的打包应用时，可用 UI_EDITOR_PACKAGE_OUTPUT 指定隔离打包目录，再以 UI_EDITOR_PACKAGED_EXECUTABLE 指定该 exe 执行打包 MCP 测试，不需要终止现有用户会话。

MCP 冒烟测试默认设置 `UI_EDITOR_BACKGROUND=1`：窗口从启动起保持隐藏，不显示任务栏入口、不获取焦点，也不因第二实例请求恢复窗口；后台渲染不节流，仍执行真实界面操作与画布截图。测试检查窗口始终未显示、未获取焦点。普通启动不设置此变量，保持原有可见窗口行为；后台启动仍需使用隔离的 `UI_EDITOR_USER_DATA`，避免连接到用户的前台实例。

其他 Electron 自动化验证（UI、运行时、图片、模板、工作区启动、显示、导入和打包冒烟）也显式启用此后台模式。打包验证使用隔离运行数据；打包 EXE 必须包含最新后台启动逻辑，不能用旧 EXE 验证后台行为。
