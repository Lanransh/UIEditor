---
name: roblox-localization
description: 编写或审查 UIEditor 的 UI 文本时使用，区分静态节点、配置引用和动态文案，遵循 Text.Define 声明及稳定 Key 规范。
---

# UI 动态文本本地化

编写前读取 [UI 文本与翻译接口](../../../Docs/text-localization.md)，以该文档为完整合同。
此规范对齐游戏的 roblox-localization，但当前工作区负责生成 View，不能照搬游戏中
“不修改 Generated”的限制来跳过 View 的动态文本处理。

1. 先读现有 View、节点文本与 Render。静态标题、按钮和说明留在设计节点；配置名称、
   描述不复制登记；业务 ID、节点路径和玩家输入不翻译。
2. 新增动态原文前在相关源码检索 `Text.Define`、候选前缀和条目。每文件最多一个顶层
   `local TranslationTexts = Text.Define("Business", { Message = "English source" })`；
   先加载 Text，只用字面量，不手写 Key/Source 表、不用别名或运行时补字段。
3. 前缀和条目用大写字母开头的英文字母数字标识符。前缀按实际业务语义选择，不从
   文件路径或类名推导；完整 Key 为 `prefix .. "." .. name`。同文件同语义复用，
   跨文件不共享文案表、不重复完整 Key；不预填无关文案。
4. 在 Render 等实际展示位置使用 `Text.Tr(TranslationTexts.Message, arguments)`，
   保留原始参数，不在模块顶层缓存译文。配置原文使用 `Text.TrSource`，不合成定义。
   模拟接入不重复 View 定义，动作只传业务标识，不把显示字符串用于业务判断。
5. 仅在 OnReady 关闭自己主动翻译的具体动态节点的 AutoLocalize，不修改静态节点、
   父容器或设计数据；语言刷新由游戏已有机制驱动，连接随组件清理。
6. 移动文件或重命名类不改已有 Key。发现冲突先说明来源及迁移影响，不擅自改已有
   Key；只有用户授权后迁移，并交付旧 Key → 新 Key 映射。修改 Source 保持 Key，
   说明已有译文需复核。

验证本次状态和参数变化、英文回退、保存重开及导出源码保留；App 不做脚本静态收集或
全项目 Key 校验。分别报告 App 验证、工具收集、译文生成、云端发布和真实语言验收；
未执行的不得写成通过，不手工改翻译产物或自动上传。
