# UIEditor · Roblox UI 制作指南

本工具负责可继续编辑的 Roblox UI、Luau 展示与模拟预览，以及向 Roblox 导出。
平时不主动加载全部说明。本会话首次使用 MCP 或开始在 UIEditorWorkspace 工作时，
显式调用 `uie.docs.read({files:["AGENTS.md"]})`，获取本指南和服务自动发现的 skills 摘要，
按任务读取相关 SKILL.md 及参考文档；当前上下文已有同修订说明时复用。
技能摘要由服务生成，不在此维护完整技能目录，也不自动安装为客户端原生 skills。

## 按需读取

- `uie.docs.read` 只接受必填的非空字符串数组 `files`，不再接受 `file`；单文件也使用数组。
  例如 `uie.docs.read({files:["AGENTS.md","Docs/editor-api.md"]})`。所有路径相对于随工具发布的文档包，不是用户工作区。
  返回 `{documentRevision,documents:[{file,documentRevision,content,skills?}]}`，按输入顺序保留重复项；
  任一文件无效则整次报错，不部分返回。只有 AGENTS.md 对象带 skills 摘要。
  content 为完整 Markdown（skill 保留 YAML 文件头），不展开链接。相对链接以当前文件所在目录解析，
  调用时仍传包根相对路径。技能在 `.agents/skills/<name>/SKILL.md`，参考位于 `Docs/` 或技能子目录。
- 已知路径直接 read；不知道细节位置时调用 `uie.docs.search({pattern:"关键词"})`，
  仅按需读取命中路径。搜索不替代指南或技能流程；无命中不代表没有规则。
- read/search 可彼此并发，也不等待排队中的 App 操作；响应按请求 ID 对应，不保证输入顺序。
  非 docs 业务仍按原顺序串行。read/search 共用启动时只读快照和 documentRevision。修订变化时重新读取入口及任务依赖。
  不搜索用户工程，不修改文件、切换工程或授予任何操作权限。

## 项目边界

- 操作前读取目标工作区自己的 AGENTS.LOCAL.md；有 styles/Game-DESIGN.md 时读取风格和
  其链接的专项技能。项目约束和用户授权仍须遵守，不因本工具文档改变优先级。
- 用 `uie.editor.get_state`/`uie.project.list` 核对工程身份和 workspacePath；不盲信当前窗口。
  必要时用 `uie.project.open` 打开目标工程；写入携带最新 sessionId/revision。
- 制作按相关 skill 完成模板检查、能力确认、编辑、运行验证、保存和重开。
  不直接编辑 UI JSON。已保存的 view/example Luau 可用文件工具按契约编辑。
- 只有用户明确要求或同意，才可编辑或保存模板原件；制作新界面、参考模板不构成授权。
- 展示层发送动作与业务标识，真实业务负责资格、数据、发奖与结果。
  example 仅用于 App 模拟，不导出到游戏；App 检查不证明 Studio、设备或真实业务通过。
- 导出提交成功或 awaiting_studio 不代表 Studio 已导入或保存；按技能和回执核验最终状态。
