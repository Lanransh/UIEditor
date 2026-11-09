---
name: roblox-luau-standards
description: 编写或修改 UIEditor Luau 脚本时，读取并遵循编辑器维护的编码规范。
---

# Luau 编码规范

编写脚本前读取 [编码规范](../../../Docs/coding-standards.md) 和
[脚本数据契约](../../../Docs/presentation-contract.md)，按实际接口实现并验证。
涉及文本显示时同时使用 [本地化规范](../roblox-localization/SKILL.md)，
新增文案采用文件顶层 `TranslationTexts = Text.Define(...)` 和 Text.Tr(definition, arguments)；
View 将定义表保存为类字段 `BaseViewTranslationTexts`，派生类复用已有定义，不重复声明。
