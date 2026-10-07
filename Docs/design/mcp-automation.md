# MCP 自动化

## 架构与工程能力

`ui-editor` stdio MCP 服务通过 Electron 本机桥接操作当前编辑会话。工具目录静态声明，App 未启动时也可以发现；实际调用读取 Runtime/ui-editor-automation.json，连接随机回环端口并使用随机令牌。Hub 不隐式激活工程。桥接和渲染 IPC 都校验来源或令牌，请求串行执行，文档切换和会话卸载使旧请求失效。

工程策略声明制作语言、版本、API、节点属性、父子规则和运行能力。当前 Roblox 使用 Luau 0.694，制作与运行能力分别声明。主进程的 CodeAdapter 提供执行器，通用 executeCode 检查语言后路由；其他语言需要自己的适配器，不自动翻译或降级。MCP 工具和通用查询不包含 Roblox 节点规则。当前文档格式仍为 version 3。

## 工具与查询

固定工具包含 editor.get_state/get_capabilities、nodes.get/find、code.execute、scripts.get/set、document.list/new/open/save、runtime.control/click、debug.get_diagnostics/screenshot 和 assets.search/get/configure，均带 uie 前缀。不提供选中节点、MCP undo/redo 或制作代码内部的历史 API。尚未新建或打开界面时，get_state 返回 nodeCount=0，full 详情的 document 为 null；文档编辑、保存、运行及截图要求先新建或打开界面。图片查询、配置和 ui.assets.apply 见 [图片资产](image-assets.md)。

scripts.get 读取交互代码 source、接入代码 integration，可用 kind 指定其中一份，省略时读取两份。scripts.set 要求 sessionId/revision，可传 source、integration 或同时传两者，未传字段保持原值。源码长度及结构校验沿用文档边界；语法错误允许保存并在运行时反馈。运行中禁止修改源码。code.execute 内的 ui.scripts.get/set 仍可将源码与节点修改组合提交。

节点 ID 是操作身份；名称路径只辅助显示。get 提供属性、父 ID、子节点摘要及可选深度；find 使用名称 exact/contains、类型和父范围的交集，默认递归，按节点树顺序分页，默认 50 条、最多 200 条。默认读取设计文档；运行副本需显式 view=runtime，并返回运行会话和帧序号。

## 代码事务与历史

制作执行在独立 Luau VM 中操作草稿，通过当前节点注册表提供创建和属性转换。值类型构造与现有运行宿主共享；不开放文件、网络、require 或 Electron。每次代码最多 256 KiB、5000 次编辑操作、200 条制作日志，沿用 64 MiB VM、250 ms 执行预算、2 秒主进程看门狗及 8 MiB 消息限制。

图片节点可在 create 的 previewImage 选项中附加 `{name,dataUrl}`，或使用 ui.nodes.setPreviewImage 更新、传 nil 清除。图片沿用完整文档校验，不接受远程 URL，不在制作 VM 中读取文件或联网；失败仍整笔回滚。Roblox Image 资源 ID 与本地预览图分别保存。

源码执行成功后严格校验完整文档，再校验当前 sessionId/revision，最后提交一条现有文档命令。节点、属性、层级和两份源码的一次组合修改可以在 App 内整体撤销，scripts.set 的一次修改同样进入文档历史。App redo 恢复已验证快照，不重跑代码。失败、超时、冲突、dry-run 和无变化不影响历史；新编辑清空 redo。手动与 MCP 编辑共用历史，保存不清空历史，新建或打开另一界面重置历史。revision 同时覆盖手动编辑、MCP 提交及 App 内 undo/redo；MCP 不提供历史操作和历史摘要。

## 运行与文件

只有编辑和运行状态；运行中禁止设计修改和历史操作。run/stop/reset 与用户工具栏共用运行控制，click 与用户按钮共用事件入口，不可见或禁用时返回未分发原因。运行副本与日志不保存、不进入历史。运行错误结束会话，保留日志并恢复编辑。诊断分别提供运行日志及 App 控制台游标，各最多保留 500 条并报告截断。截图切回界面页、等待绘制，捕获实际画布视口，隐藏选择装饰与提示，返回 PNG 尺寸和缩放；它不是 Roblox 设备渲染结果。

文件工具仅允许当前工程 interfaces 内的相对路径，检查越界与符号链接。list 递归列出界面，跳过链接。新目标独占创建，拒绝覆盖；无路径保存当前文件使用既有原子写入。切换未保存界面需先保存或显式 discardChanges。MCP 不弹系统文件对话框，不自动放弃修改。

## Hub、工作区与打包

Hub 右上角“设置”提供 Codex MCP 配置，不提供 AI 工作区打开按钮。配置管理 CODEX_HOME/config.toml（未设置时为用户 .codex/config.toml）中的 ui-editor command/args/enabled，保留其他配置并验证 TOML。启动路径包含显式发现文件地址，不依赖 Codex 工作目录；写入前检查配置是否变化，再原子替换。

开发构建输出 Editor/mcp-dist/server.mjs；打包复制到 resources/mcp-dist，ASAR 外由 Node 启动，原生宿主位于 resources/native-bin。Hub 检查服务文件与 Node。工作区 ToolRuntime/AgentWorkspace/UIEditor_Roblox 保存版本化说明和示例，不固定业务工程，重新打包不删除该目录。

## 验证

`npm run build:runtime` 构建原生宿主与编辑入口；`npm run build` 包含 MCP bundle。`tests/automation.test.ts` 检查真实 Luau、事务、查询、文件、配置及桥接；`npm run test:mcp` 使用真实 stdio 与隔离 Electron 工程检查制作、历史、运行、点击、日志、截图及保存重开。先 package 后执行 `npm run test:mcp:packaged` 验证打包路径。所有 App 测试不能替代 Studio 或设备验收。

需要保留正在运行的打包应用时，可用 UI_EDITOR_PACKAGE_OUTPUT 指定隔离打包目录，再以 UI_EDITOR_PACKAGED_EXECUTABLE 指定该 exe 执行打包 MCP 测试，不需要终止现有用户会话。

MCP 冒烟测试默认设置 `UI_EDITOR_BACKGROUND=1`：窗口从启动起保持隐藏，不显示任务栏入口、不获取焦点，也不因第二实例请求恢复窗口；后台渲染不节流，仍执行真实界面操作与画布截图。测试检查窗口始终未显示、未获取焦点。普通启动不设置此变量，保持原有可见窗口行为；后台启动仍需使用隔离的 `UI_EDITOR_USER_DATA`，避免连接到用户的前台实例。

其他 Electron 自动化验证（UI、运行时、图片、模板、工作区启动、显示、导入和打包冒烟）也显式启用此后台模式。打包验证使用隔离运行数据；打包 EXE 必须包含最新后台启动逻辑，不能用旧 EXE 验证后台行为。
