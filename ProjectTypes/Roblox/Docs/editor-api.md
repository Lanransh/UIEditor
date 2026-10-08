# 制作 API

以 `uie.editor.get_capabilities` 为当前工程的权威能力来源。Roblox 当前使用 Luau 0.694，标准库受限，没有文件、网络、require、game 或 Electron。

`uie.code.execute` 接收 `{sessionId, revision, language, source, dryRun?, label?}`。源码最多 256 KiB，单次执行预算 250 ms，VM 64 MiB，主进程 2 秒看门狗。成功返回 `success/changed/revision/logs/operationCount/nodeCount`；执行或校验失败返回 `success:false/error/stage/logs`，此前改动不提交。

优先调用 `uie.editor.get_capabilities({detail:"summary"})` 读取 API 与支持类型；创建或修改节点前按需用 `{className:"Frame"}` 获取属性和父子约束。省略参数保持完整返回。

## 节点与源码

| API | 行为 |
| --- | --- |
| `ui.root.id` | 当前固定根 ID |
| `ui.projectType / ui.capabilities` | 当前工程与脚本能力 |
| `ui.nodes.get(id)` | 节点快照，不能通过直接修改快照写入文档 |
| `ui.nodes.children(id)` | 直属子节点快照数组 |
| `ui.nodes.find(options)` | 分页查询，返回 nodes、total、nextOffset |
| `ui.nodes.create(className, {parentId?,name?,properties?,previewImage?})` | 创建并返回节点快照，父节点缺省为根 |
| `ui.nodes.setProperties(id, properties)` | 更新传入属性，其他属性保留 |
| `ui.nodes.setPreviewImage(id, {name,dataUrl} 或 nil)` | ImageLabel/ImageButton 附加嵌入式预览图；nil 清除。事务结束校验格式与长度 |
| `ui.nodes.rename(id, name)` | 修改名称 |
| `ui.nodes.reparent(id, parentId)` | 移到父节点末尾，禁止根操作和层级环 |
| `ui.nodes.duplicate(id, parentId?)` | 复制子树并生成新 ID，缺省在原父节点末尾 |
| `ui.nodes.remove(id)` | 删除子树，禁止删除根 |
| `ui.scripts.get(kind)` | 读取 source 或 integration 源码 |
| `ui.scripts.set(kind, source)` | 替换一份源码，和节点变更一起提交 |

属性支持 UDim.new、UDim2.new/fromScale/fromOffset、Vector2.new、Color3.new/fromRGB/fromHex、Enum，以及现有 JSON 属性形式。没有隐式像素与 Scale 换算。

平铺图片使用 ImageLabel 的 ScaleType=Enum.ScaleType.Tile，TileSize 按所选风格或模板设置。previewImage.dataUrl 只接受已在本地取得的 PNG/JPEG/WebP/GIF base64 Data URL，不传远程链接或文件路径；Image 仍单独保存真实 Roblox 资源 ID。制作 VM 本身不能读取文件或下载资源。

`find` 与 MCP 查询共同采用名称 exact/contains、className、parentId、recursive、offset、limit。默认递归，默认 50 条，最多 200 条。过滤条件取交集。parentId 指定时不包含父节点自身；recursive=false 只查直属子节点。

MCP `uie.nodes.get` 使用 `{id?,depth?,view?,target?,format?,maxNodes?,compact?}`，省略 id 查询根。JSON 默认深度 0；format="tree" 返回紧凑文本树，默认深度 3；最大深度 64。maxNodes 默认 200、最多 2000，达到限制明确返回截断提示。`uie.nodes.find` 支持相同 target 及原有过滤、分页条件。省略 target 查询当前画布，view=runtime 查询当前运行副本，结果带 runtimeSessionId 和 frameSequence。

nodes.get/find 可传 compact=true，JSON 节点摘要仅保留 id/name/className，省略重复 path/parentId；get 仍保留属性、图片引用、children 和截断信息，find 保留分页。文本树不受 compact 影响。省略或传 false 保持原返回。

先取浅层树（如 depth=2、maxNodes=80）定位目标，再按 id/parentId 查询相关子树；按 truncated/nextOffset 补查，不把截断当成不存在。脚本只需一份时指定 kind，已取得且未变更的结果不重复全量打印。

## 保存模板与其他工程的读取

先用 `uie.document.list({library:"templates",offset:0,limit:50})` 获取模板的 documentId，再构造 `target={library:"templates",documentId:"实际UUID"}`；省略 projectId 就是当前工程。列表返回 interfaces、total、nextOffset，需读取后续页时传 nextOffset。

`uie.nodes.get/find`、`uie.scripts.get`、`uie.debug.screenshot` 共用 target。先截图和读取浅层树，再按节点 ID 取属性；不要把模板节点 ID 当成当前画布节点 ID。target 读取磁盘保存版本，不切换画布、不改变历史，空白画布也可使用；不接受 view=runtime。截图返回静态 1280×720 PNG，不执行交互脚本。

library 支持 project（默认）、templates、permanent。永久UI全局读取，不传 projectId。跨工程先用 `uie.project.list` 获取已登记工程 UUID，再在 target 加 projectId；App 内打开过的工程才可通过 UUID 查找。UUID 冲突和损坏文件明确返回问题，不按文件名称猜 ID。

`uie.assets.search/get` 可传 projectId 读取来源工程图片；省略使用当前工程，library="permanent" 读取全局图片。`uie.editor.get_state` 返回当前 projectId、projectName、documentId。所有修改与运行仍针对当前编辑会话，不接受 target。

## 历史、文件与运行边界

一次 execute 只提交一条文档命令，用户可以在 App 内撤销重做；redo 恢复快照，不重新执行代码。MCP 不提供 undo/redo。失败、dry-run 和无变化不影响历史。

`uie.scripts.get({kind?})` 直接读取源码，kind 为 source 或 integration，省略时返回两份。`uie.scripts.set({sessionId,revision,source?,integration?,label?})` 直接修改交互代码和/或接入代码，至少传一份，未传另一份保持原值。一次更新作为一条 App 历史命令。源码沿用文档长度限制；允许保存语法错误，在运行时检查。无需通过执行制作代码才能编辑脚本。

`uie.editor.get_state` 返回当前文件 library、库内 relativePath、mode（edit 或 unsaved），以及工作区绝对路径 workspacePath、agentWorkspacePath、gameDesignPath 和 gameDesignExists。风格 Markdown 使用文件工具读写，不直接编辑模板 JSON。

`uie.document.new` 接收 name；open 二选一接收 interfaces 内 relativePath，或 `{target:{library,documentId,projectId?},mode?}`。target 仅允许当前工程的 project/templates；打开模板必须明确 mode=edit（原件）或 copy（未保存副本）。修改模板原件必须由用户提出或同意。

save 不带路径保存当前绑定文件（包括模板原件），带 relativePath 在 interfaces 新建文件且拒绝覆盖。模板原件保存检查磁盘版本，发生外部修改、移动或删除时保留编辑内容并报冲突；不要盲目重试。所有变更工具要求 sessionId/revision。切换脏文档需先保存或明确 discardChanges=true。

运行中禁止制作和历史操作。停止后才能修改。普通运行属性变化不会写回设计文档。
