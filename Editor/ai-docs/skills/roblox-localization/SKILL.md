---
name: roblox-localization
description: 制作或修改 UI 文本、接入翻译及验收时使用，处理 Text.Define 声明、文件内去重和动态节点自动翻译属性。
---

# UI 文案翻译

## 按文字来源设置节点

| 文字来源 | 设计属性 | 显示方式 |
| --- | --- | --- |
| 固定标题、说明、按钮 | 保留真实 Text，AutoLocalize=true | 由节点自动翻译，保留输入框的用途提示 |
| 固定纯数值或图标字符 | 保留 Text，AutoLocalize=false | 原样显示；含词语的 `Level 12` 属于文案 |
| 脚本填充的文字、价格、倒计时等 | Text=""，AutoLocalize=false，含隐藏原型 | View 首次显示及数据变化时填充，样例值放在模拟数据中 |

动态句子和状态文案用 Text.Define 声明，在显示时调用 Text.Tr。配置原文用 Text.TrSource，纯数据直接格式化，玩家输入和业务 ID 原样显示。数据缺失时清空或显示约定的空态；空文本也要保留布局尺寸。

**容易出错的地方**

- 只在具体文本节点关闭 AutoLocalize。父节点关闭会阻断所有后代，子节点设 true 也无法恢复；遇到这种层级先调整结构。图片和容器保持开启。
- 克隆继承隐藏原型的属性，应在设计中设置原型。代码直接创建的文本节点应在首次写入前设置开关。
- 使用完整英文句子及参数，避免拆句拼接。字符串用 `{name}`，整数用 `{count:int}`，禁止 `{name:string}`。定义放在所属 View 顶层，译文在 Render 时求值。文件内去重、基类复用和格式说明见[翻译接口](references/text-localization.md)。

## 验收

1. 保存重开后，按 View 和节点用途为全部文本节点填写期望值（含隐藏原型）。将清单放在[文本验收脚本](references/audit-text.md)前，用最新 sessionId/revision 执行 `uie.code.execute`。检查 success=true、changed=false 和日志；修复失败项后重验。
2. 运行时检查首次显示、数据变化、缺失值和条目复用时的文字及布局。导出后核对节点开关与 View 源码。
3. 分别报告 App 验收、外部工具收集、译文发布和游戏语言切换的实际结果。保留工具生成的翻译产物；云端发布需另行授权。
