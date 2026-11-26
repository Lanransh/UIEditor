# UIEditor Luau 编码规范

- 四个空格缩进，一行一条语句。运算符两侧、逗号后留空格。分支、循环、函数、事件回调和较长的表用多行表示。
- 方法名用 PascalCase，局部变量用 lowerCamelCase，私有成员以 `_` 开头。未使用的形参或循环变量也用有含义的名称。
- 函数前用中文说明意图或约束，用 @param 标注实际形参、@return 标注返回值。事件回调就近注明动作和业务 ID。
- 声明 `local FX = _G.FX`、`local FXLoader = FX.Loader`。用真实 ScreenGui 名称调用 FXLoader:PlayerGui，子路径用 FXLoader:Here，路径以点分隔。例如 `FXLoader:Here(root, "Panel.HintTxt")`。可用方法见[运行接口](../../roblox-ui-authoring/references/runtime-api.md)。
- 静态效果保存为设计节点与属性。用 TrackConnection 托管事件，Render 更新展示，接入层处理业务。
