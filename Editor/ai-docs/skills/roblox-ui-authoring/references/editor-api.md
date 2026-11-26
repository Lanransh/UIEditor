# 制作 API

Roblox 当前使用 Luau 0.694，标准库受限，没有文件、网络、require、game 或 Electron。

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
| `ui.nodes.create(className, {parentId?,name?,properties?})` | 创建并返回节点快照，父节点缺省为根 |
| `ui.nodes.setProperties(id, properties)` | 更新传入属性，其他属性保留 |
| `ui.assets.apply(nodeId, assetId)` | 将图片库资产应用到节点 |
| `ui.nodes.rename(id, name)` | 修改名称 |
| `ui.nodes.reparent(id, parentId)` | 移到父节点末尾，禁止根操作和层级环 |
| `ui.nodes.duplicate(id, parentId?)` | 复制子树并生成新 ID，缺省在原父节点末尾 |
| `ui.nodes.remove(id)` | 删除子树，禁止删除根 |
| `ui.scripts.get(kind)` | 读取 source 或 integration 源码 |
| `ui.scripts.set(kind, source)` | 替换一份源码，和节点变更一起提交 |

属性支持 UDim.new、UDim2.new/fromScale/fromOffset、Vector2.new、Color3.new/fromRGB/fromHex、Enum，以及现有 JSON 属性形式。没有隐式像素与 Scale 换算。

平铺图用 ImageLabel，ScaleType 设为 Enum.ScaleType.Tile，TileSize 取风格规定的值。Image 使用 Roblox 资源 ID，本地预览通过图片库绑定。

`find` 与 MCP 查询共同采用名称 exact/contains、className、parentId、recursive、offset、limit。默认递归，默认 50 条，最多 200 条。过滤条件取交集。parentId 指定时不包含父节点自身；recursive=false 只查直属子节点。

MCP `uie.nodes.get` 使用 `{id?,depth?,view?,target?,format?,maxNodes?,compact?}`，省略 id 查询根。JSON 默认深度 0；format="tree" 返回紧凑文本树，默认深度 3；最大深度 64。maxNodes 默认 200、最多 2000，达到限制明确返回截断提示。`uie.nodes.find` 支持相同 target 及原有过滤、分页条件。省略 target 查询当前画布，view=runtime 查询当前运行副本，结果带 runtimeSessionId 和 frameSequence。

nodes.get/find 可传 compact=true，JSON 节点摘要仅保留 id/name/className，省略重复 path/parentId；get 仍保留属性、图片引用、children 和截断信息，find 保留分页。文本树不受 compact 影响。省略或传 false 保持原返回。

建议从 depth=2、maxNodes=80 定位子树，再按 id、truncated 和 nextOffset 补查。

## 读取已保存的界面与图片

1. 调用 `uie.document.list({library:"templates",offset:0,limit:50})`，从 interfaces 取 documentId，按 nextOffset 翻页。
2. 将 `target={library:"templates",documentId:"实际UUID"}` 传给 nodes.get/find、scripts.get 或 debug.screenshot。它们读取磁盘版本，截图为静态 1280×720 PNG。修改与运行只作用于当前画布；模板节点 ID 仅用于该模板。
3. library 默认为 project。跨工程读取时，从 project.list 获取已登记的 projectId；全局 permanent 库省略 projectId。assets.search/get 同样支持来源工程或全局图片库。get_state 返回当前 projectId、projectName 和 documentId。

## 导入本地图片

先用 uie.assets.search 查找已有素材。缺少时调用 `uie.assets.import({sessionId,revision,library:"project",filePath:"本地绝对路径"})`。project 和 permanent 库支持 PNG/JPEG/WebP/GIF 普通文件，单张上限 8 MiB。导入立即保存资产，返回 id 和新会话，robloxId 初始为空。重读状态，在 code.execute 中用 ui.assets.apply(nodeId, assetId) 绑定。节点绑定可撤销，资产导入独立保存。

## 历史、文件与运行边界

一次 execute 只提交一条文档命令，用户可以在 App 内撤销重做；redo 恢复快照，不重新执行代码。MCP 不提供 undo/redo。失败、dry-run 和无变化不影响历史。

`uie.scripts.get({kind?})` 直接读取源码，kind 为 source 或 integration，省略时返回两份。`uie.scripts.set({sessionId,revision,source?,integration?,label?})` 直接修改交互代码和/或接入代码，至少传一份，未传另一份保持原值。一次更新作为一条 App 历史命令。源码沿用文档长度限制；允许保存语法错误，在运行时检查。无需通过执行制作代码才能编辑脚本。

`uie.editor.get_state` 返回当前文件 library、库内 relativePath、mode（edit 或 unsaved），以及工作区绝对路径 workspacePath、agentWorkspacePath、gameDesignPath 和 gameDesignExists。风格 Markdown 使用文件工具读写，不直接编辑模板 JSON。

`uie.document.new` 接收 name；open 二选一接收 interfaces 内 relativePath，或 `{target:{library,documentId,projectId?},mode?}`。target 仅允许当前工程的 project/templates；打开模板必须明确 mode=edit（原件）或 copy（未保存副本）。修改模板原件必须由用户提出或同意。

`uie.document.delete({sessionId,revision,target:{library,documentId,projectId?},discardChanges?})`
永久删除已保存 UI 的 JSON 及同名两份 Luau 脚本，保留其他文件；不弹对话框、不能文档撤销。
仅允许当前工程的 project/templates 或全局 permanent 库，模板原件删除须由用户提出或同意。
先 document.list 确认 UUID，并停止运行。删除当前界面时未保存修改须先保存或明确
discardChanges=true；成功后清空编辑区。删除其他 UI 不丢弃当前修改。成功后重读状态获取新会话。

save 不带路径保存当前绑定文件（包括模板原件），带 relativePath 在 interfaces 新建文件且拒绝覆盖。模板原件保存检查磁盘版本，发生外部修改、移动或删除时保留编辑内容并报冲突；不要盲目重试。所有变更工具要求 sessionId/revision。切换脏文档需先保存或明确 discardChanges=true。

运行中禁止制作和历史操作。停止后才能修改。普通运行属性变化不会写回设计文档。

每份 UI 单独存放，例如 interfaces/OnlineRewardUI/ 下包含同名 .json（version=4）、.view.luau（source）与 .example.luau（integration）。导出只包含 View。通过文件工具修改脚本后，运行、保存或重开会读取磁盘更新；同一部分在两侧均有修改时报冲突。

改名后普通保存会同步改名目录和三个文件，保留文档与节点 ID。发生命名冲突时拒绝覆盖；撤销名称后再次保存可改回文件名。类名、脚本引用和 ScreenGui 名称独立管理。
