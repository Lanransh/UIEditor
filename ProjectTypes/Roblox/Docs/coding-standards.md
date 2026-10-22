# UIEditor Luau 编码规范

编写代码前读取工作区 AGENTS.md 和 [运行接口](runtime-api.md)，确认当前编辑器能力。参考来源为 Roblox_Y1/Game 的 roblox-luau-standards；这里只移植编码约定，不引入游戏仓库的业务模块或验证授权。

- 使用四个空格缩进。赋值、比较、算术、拼接运算符两侧留空格，逗号后留空格，例如 `local path = "Panel.Day" .. day .. "RewardImg.ClaimBtn"`。
- 一行一个语句。禁止单行 if/for/函数及紧凑事件回调；表字段多或较长时逐行排列，长调用拆成多行。
- 函数前写中文意图与约束注释。每个形参有与实际签名一致的 `@param`，有返回值写 `@return`；无参数或无返回值不虚构标签。回调用就近中文注释解释动作与稳定业务 ID。
- 不逐行翻译代码。不写空泛“预留”注释；不增加无关抽象和重复容错。条件分支保持清楚，避免多层 `and/or` 三元链。
- 方法用 PascalCase，局部变量用清楚的 lowerCamelCase，私有成员用 `_` 前缀。不用 `_` 命名未使用参数/循环变量；可用有语义的 index、owner，并在需要时说明来源。
- 声明 `local FX = _G.FX`、`local FXLoader = FX.Loader`。先核对节点树中的真实 ScreenGui 名称，再用 `local root = FXLoader:PlayerGui("ExampleUI")` 获取界面；不要以 `self:GetRootNode()` 作为生成代码的节点获取入口。子节点用 `FXLoader:Here(root, "Panel.HintTxt")`，也可直接用 `FXLoader:PlayerGui("ExampleUI.Panel.HintTxt")`。Here 路径不包含根名，PlayerGui 路径包含根名。只支持 `.`，`/`、空路径和空段明确报错；节点名不含分隔符。
- 不假设完整游戏 FXLoader API：当前只使用 runtime-api 中公开的接口。事件用 TrackConnection；动作只发必要业务标识，Render 只更新展示，模拟接入只更新模拟状态。
- 动态文案遵循 [本地化规范](../.agents/skills/roblox-localization/SKILL.md) 和 [UI 文本与翻译接口](text-localization.md)：各 Luau 顶层通过 Text.Define 独立声明 TranslationTexts，文件内 Key、Source 不重复且 Key 稳定，跨文件允许重复，不新增手写 Key/Source 表；Text.Tr 接收定义和参数，Text.TrSource 仅按原文查询。静态节点和配置引用不补文案表。
- 所有效果保存为设计节点和属性，不在运行脚本创建效果。不要把可读性改动变成业务或视觉改动。
- 窗口使用 CUIView 通用动画与 Show/Hide，不重复生成动画代码；常驻 HUD 设置 OpenAnimation = false 并注释原因。ScreenAdaptation 独立控制屏幕适配，关闭时说明由界面自行管理布局。两个类开关均在实例创建前设置；Render 不提前隐藏整窗，完整合同见 [展示与业务接入](presentation-contract.md#通用打开与关闭动画)。

交付前检查格式、函数标签、节点路径；运行相关 App 模拟验证并停止，保存后重开确认源码保持。App 验证与 Roblox 实机验证分别报告。
