# 制作 API

以 `uie.editor.get_capabilities` 为当前工程的权威能力来源。Roblox 当前使用 Luau 0.694，标准库受限，没有文件、网络、require、game 或 Electron。

`uie.code.execute` 接收 `{sessionId, revision, language, source, dryRun?, label?}`。源码最多 256 KiB，单次执行预算 250 ms，VM 64 MiB，主进程 2 秒看门狗。成功返回 `success/changed/revision/logs/operationCount/nodeCount`；执行或校验失败返回 `success:false/error/stage/logs`，此前改动不提交。

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
| `ui.nodes.rename(id, name)` | 修改名称 |
| `ui.nodes.reparent(id, parentId)` | 移到父节点末尾，禁止根操作和层级环 |
| `ui.nodes.duplicate(id, parentId?)` | 复制子树并生成新 ID，缺省在原父节点末尾 |
| `ui.nodes.remove(id)` | 删除子树，禁止删除根 |
| `ui.scripts.get(kind)` | 读取 source 或 integration 源码 |
| `ui.scripts.set(kind, source)` | 替换一份源码，和节点变更一起提交 |

属性支持 UDim.new、UDim2.new/fromScale/fromOffset、Vector2.new、Color3.new/fromRGB/fromHex、Enum，以及现有 JSON 属性形式。没有隐式像素与 Scale 换算。

`find` 与 MCP 查询共同采用名称 exact/contains、className、parentId、recursive、offset、limit。默认递归，默认 50 条，最多 200 条。过滤条件取交集。parentId 指定时不包含父节点自身；recursive=false 只查直属子节点。

MCP `uie.nodes.get` 使用 `{id, depth?, view?}`，默认深度 0，最大 64；`uie.nodes.find` 使用相同查询条件。默认查询设计文档，view=runtime 查询运行副本，结果带 runtimeSessionId 和 frameSequence。

## 历史、文件与运行边界

一次 execute 只提交一条文档命令，用户可以在 App 内撤销重做；redo 恢复快照，不重新执行代码。MCP 不提供 undo/redo。失败、dry-run 和无变化不影响历史。

`uie.scripts.get({kind?})` 直接读取源码，kind 为 source 或 integration，省略时返回两份。`uie.scripts.set({sessionId,revision,source?,integration?,label?})` 直接修改交互代码和/或接入代码，至少传一份，未传另一份保持原值。一次更新作为一条 App 历史命令。源码沿用文档长度限制；允许保存语法错误，在运行时检查。无需通过执行制作代码才能编辑脚本。

`uie.document.new` 接收 name；open 接收 relativePath；save 不带路径保存当前文件，带 relativePath 新建文件且拒绝覆盖。所有变更工具要求 sessionId/revision。路径相对于当前工程 interfaces，不包含 interfaces 前缀。切换脏文档需先保存或明确 discardChanges=true。

运行中禁止制作和历史操作。停止后才能修改。普通运行属性变化不会写回设计文档。
