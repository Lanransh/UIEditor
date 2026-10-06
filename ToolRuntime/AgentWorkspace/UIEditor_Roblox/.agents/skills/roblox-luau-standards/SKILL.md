---
name: roblox-luau-standards
description: 在 UIEditor 中编写或修改 Luau 制作代码、交互类和模拟接入类时使用，统一可读格式、中文函数注释、命名和 FX.Loader 点分隔路径。
---

# UIEditor Luau 编码规范

编写代码前读取工作区 AGENTS.md 和 references/runtime-api.md，确认当前编辑器能力。参考来源为 Roblox_Y1/Game 的 roblox-luau-standards；这里只移植编码约定，不引入游戏仓库的业务模块或验证授权。

- 使用四个空格缩进。赋值、比较、算术、拼接运算符两侧留空格，逗号后留空格，例如 `local path = "Panel.Day" .. day .. "RewardImg.ClaimBtn"`。
- 一行一个语句。禁止单行 if/for/函数及紧凑事件回调；表字段多或较长时逐行排列，长调用拆成多行。
- 函数前写中文意图与约束注释。每个形参有与实际签名一致的 `@param`，有返回值写 `@return`；无参数或无返回值不虚构标签。回调用就近中文注释解释动作与稳定业务 ID。
- 不逐行翻译代码。不写空泛“预留”注释；不增加无关抽象和重复容错。条件分支保持清楚，避免多层 `and/or` 三元链。
- 方法用 PascalCase，局部变量用清楚的 lowerCamelCase，私有成员用 `_` 前缀。不用 `_` 命名未使用参数/循环变量；可用有语义的 index、owner，并在需要时说明来源。
- 声明 `local FX = _G.FX`、`local FXLoader = FX.Loader`。先核对节点树中的真实 ScreenGui 名称，再用 `local root = FXLoader:PlayerGui("StudDailyLoginUI")` 获取界面；不要以 `self:GetRootNode()` 作为生成代码的节点获取入口。子节点用 `FXLoader:Here(root, "WelfareBox.PopupPanelImg.HintTxt")`，也可直接用 `FXLoader:PlayerGui("StudDailyLoginUI.WelfareBox.PopupPanelImg.HintTxt")`。Here 路径不包含根名，PlayerGui 路径包含根名。只支持 `.`，`/`、空路径和空段明确报错；节点名不含分隔符。
- 不假设完整游戏 FXLoader API：当前只使用 runtime-api 中公开的接口。事件用 TrackConnection；动作只发必要业务标识，Render 只更新展示，模拟接入只更新模拟状态。
- 所有效果保存为设计节点和属性，不在运行脚本创建效果。不要把可读性改动变成业务或视觉改动。

交付前检查格式、函数标签、节点路径；运行相关 App 模拟验证并停止，保存后重开确认源码保持。App 验证与 Roblox 实机验证分别报告。
