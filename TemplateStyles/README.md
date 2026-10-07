# 模板风格库

每个二级文件夹是一套由用户维护的完整制作包；文件夹名就是新建工程中显示的风格名。
当前提供 **多彩棋格风格**：7 个独立可编辑组件模板，鲜明多彩标题、
黑色描边、语义操作按钮；标题可按主题选色，保留 Stud 平铺纹理。
不包含 TemplatePage 展示页，不把展示说明当作制作模板。

## 文件与引用约定

必要文件：`AGENTS.md`、`Game-DESIGN.md` 和至少一个
`template-references/**/*.rbxui.json`。可选：根目录其他 Markdown、
`assets/`、`references/`、`.agents/skills/`。
只有这些内容会复制；不要把必要资源放在其他目录。
运行数据、Git、node_modules、缓存、构建输出和日志不属于风格。
符号链接、目录联接、损坏模板、空的必要文档和不闭合的本地 Markdown 链接会报告错误。

文档按**复制后的项目布局**编写相对引用，不做批量文本替换：

- `AGENTS.md`、`Game-DESIGN.md`、资源和 skills 进入项目 `AgentWorkspace/`。
- 模板进入项目 `template-references/`，不是 AgentWorkspace 的子目录。
- 根文档到模板用 `../template-references/文件名.rbxui.json`；
  到规范用 `Game-DESIGN.md`；到技能用 `.agents/skills/技能名/SKILL.md`。
- 从技能目录到根规范用 `../../../Game-DESIGN.md`。
- 模板图片使用 JSON 中嵌入的预览图及实际 Roblox ID，不依赖原工程图片目录。
  不保留来源图片库的 imageAssetId 关联，避免全局图片变化影响项目快照。
  未配置 Roblox ID 的图片需在 Studio 使用前补齐；普通文本不得图片化。

新建工程会校验并原样复制文档及模板，保留子目录和用户提示词。
风格只负责展示和模拟接入，不能授予真实发奖、支付或资格校验权限。
按需求维护模板和规范，不要求不同风格拥有相同模板名。

## 开发、打包与保护

只维护仓库根目录 `TemplateStyles/`，开发版直接读取。
打包版直接读取该目录打包生成的 `resources/TemplateStyles/`，
不再生成或读取 `ToolRuntime/TemplateStyles/` 外置副本。
修改维护源后重新构建打包并运行新版 App，新建工程即使用新版画风。
不要在打包资源中维护定制内容，重新打包会替换应用资源。
旧外置目录不自动迁移或清理；其中的定制画风需纳入维护源后重新打包。

已有工程保持创建时的独立快照：版本 1 创建的工程不随画风升级到版本 2；
新版只用于之后新建的工程。项目副本修改也不回写维护源。
