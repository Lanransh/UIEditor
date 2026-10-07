# UIEditor Roblox 游戏 UI 设计规范

移植自 Figma 工作区的 Game-DESIGN.md。完整原文保留在 [来源快照](references/figma-game-design-source.md)，用于查询模板资源细节；本文件是 UIEditor 制作时的执行规范。

## 参考与适用范围

制作时执行 [AGENTS.md 的参考优先规则](AGENTS.md#角色与参考优先)：默认主动查看当前工程模板参考，自行选择用途匹配的模板，再延续其布局与样式，不要求用户指定。下面的蓝色窗口参数是确认工程没有模板或用户明确允许自由设计时的默认参考值，不覆盖已选模板，不要求每个界面套用同一蓝色窗口。

默认规范的来源是 Roblox_Y1 的 TemplatePage：SmallWindowUI、MediumWindowUI、LargeWindowUI、TitleBox、CloseBtn、OperationButtonExamplesUI、ProgressBarImg。需要这些 Figma 模板时先读取原节点，保留其结构和视觉，不凭空声明已复用。UIEditor 尚无 Figma 组件导入器，须将支持的结构移植为可编辑 Roblox 节点，必要图片单独下载。

`examples/` 中的 StudDailyLoginUI 曾按 WelfareUI（120:14）制作，采用绿色标题、黑色描边、灰色内容底板和粉红关闭按钮；这只是该示例的参考主题，不是其他界面的默认模板。不得把签到结构、七天奖励或示例配色自动带入新需求。

## 基础约束与节点命名

- 当前编辑器的所有视觉效果均由保存于界面定义中的节点及属性实现，编辑态立即可见。Stud、圆角、描边、高光、压边、渐变不通过运行时脚本生成。交互脚本只处理事件和数据驱动的节点属性更新。
- 画布 1280×720，窗口外背景白色。默认固定坐标和尺寸，Scale/Offset 显式设置。参考需要固定布局时不额外引入列表布局。
- 普通 UI 文本至少 16；标题和按钮优先粗体。文本保持可编辑，不导出为图片。
- 按钮只允许内部高光与压边，不做外阴影、发光或模糊。普通文本不加阴影、发光或模糊，可用清晰描边。来源中的 TitleTxt、CloseIconTxt、按钮文字阴影是历史模板效果参数，与来源的清晰文本规则冲突，本移植版统一采用无文字阴影。
- 背景、纹理、内容按层级排列，前景属于承载它的底板/卡片/按钮子节点。避免空包裹、重复贴图和无信息装饰。
- 节点使用 PascalCase，不使用中文、斜杠或下划线；同父名称唯一。根 `*UI`，按钮 `*Btn`，文本 `*Txt`，可见视觉 `*Img`，透明结构容器 `*Box`。判断优先级 UI > Btn/Txt > Img > Box。
- 后缀表示职责而非类型：可见卡片可用 Frame 命名 Day1RewardImg；透明容器用 Frame 命名 NavigationBox；文字用 TextLabel，按钮用 TextButton 或 ImageButton。UIStroke、UICorner 等辅助组件用明确组件名。
- Figma 的 Image/Button/Label 映射不限制 UIEditor 的实际支持类型。能力以 uie.editor.get_capabilities 为准。

## 三档窗口

以下均为蓝色模板参考值；子节点位置相对窗口。

| 模板 | PopupPanelImg 尺寸/位置 | TopBarImg 尺寸/位置 | ContentImg 尺寸/位置 | 用途 |
| --- | --- | --- | --- | --- |
| SmallWindowUI | 650×380 / (315,170) | 634×46 / (8,8) | 630×318 / (10,52) | 确认、说明、小奖励 |
| MediumWindowUI | 780×450 / (250,135) | 762×50 / (9,9) | 758×382 / (11,57) | 设置、常规功能 |
| LargeWindowUI | 820×520 / (230,100) | 800×54 / (10,10) | 796×446 / (12,62) | 商店、任务、多模块 |

来源的 PopupPanelBox/TopBarBox/ContentBox 自身有底色；UIEditor 按命名职责改为 Img 后缀。模块间距 16~24，卡片/按钮间距 12~20，文本与控件间距 8~12；顶栏内边距 8~10，内容左右内边距 10~12。

## 窗口颜色与厚度

| 节点 | 填充 | 描边 / 厚度 | 圆角 | 顶部内高光 | 底部内压边 |
| --- | --- | --- | --- | --- | --- |
| PopupPanelImg | #0C8EED | #034A99 / 5 | 18 | #E9FBFF，alpha .42，6px | #003B7A，alpha .48，8px |
| TopBarImg | #18A8F5 | #0070C8 / 3 | 10 | #E8FAFF，alpha .42，6px | #005199，alpha .48，8px |
| ContentImg | #F4FAFF | #8EBFEF / 2 | 14 | 白，alpha .86，6px | #B4CDE8，alpha .20，6px |

窗口保持厚边框与游戏化包裹感，不默认改成玻璃或后台工具风。内容区保持蓝白体系；正文 #0B3D78 / #164D86，次级说明 #4F789E / #5B84AA。

UIEditor 用 Frame 背景、UICorner、UIStroke 表达原生效果。目前没有 INNER_SHADOW 属性，内部高光/压边可用少量裁切在表面内的色带近似；不宣称精确复现模糊半径。不要为每个细节创建无意义节点。

## 标题与关闭按钮模板

TitleBox 为模板资源组；若底板本身可见，移植时该节点命名 TitleImg，透明分组保留 TitleBox。标题整体 320×70，圆角 13，底色 #0B70D8，描边 #D7F4FF / 5。内部参考：

- TitleGlowLeftImg/TitleGlowRightImg：38×38，#55CFFF，alpha .22；来源细节，不默认添加发光。
- TitleTopHighlightImg：290×6，#8BEAFF，圆角 3。
- TitleInnerPanelImg：288×42，#0755AC，描边 #48D6FF / 3，圆角 8。
- TitleBottomEdgeImg：280×5，#004B9C，圆角 3。
- TitleTxt：22~23，白色，粗体，居中。来源 Inter Bold/Extra Bold，UIEditor 采用支持的 GothamBold；本机替代字体需在 Studio 再验证。
- 小/中/大窗口标题位置：(28,-26)/(30,-28)/(32,-30)。

默认 CloseBtn 采用蓝色外按钮、红色核心、白色 ×，78×78，圆角 8，外色 #25B7FF，描边 #0073CF / 4。CloseCoreImg 为 42×42、(18,18)，圆角 6，#F54B43，描边 #C92320 / 2；CloseIconTxt 白色 ×，字号 38、粗体。小/中/大窗口位置：(550,-27)/(680,-27)/(720,-27)，略悬出右上角。不要默认替换为灰色、纯圆或文字关闭按钮。

## 操作按钮

参考尺寸 220×58、圆角 10、描边 3，文字 20、粗体居中。使用真实按钮节点承载点击，纹理和 *Txt 子节点呈现视觉，不额外添加重复底板。

| 用途 / 名称 | 填充 | 描边 | 文字 |
| --- | --- | --- | --- |
| 确定 ConfirmBtn / 金币购买 BuyBtn | #25B7FF | #0073CF | 白 |
| 取消 CancelBtn | #FFE9E6 | #F26B62 | #C9413A |
| 付费 PaidPurchaseBtn | #FFC43D | #D18A12 | 白 |
| 装备 EquipBtn | #45D87A | #149B4A | 白 |
| 卸载 UnequipBtn | #FF8A74 | #C9413A | 白 |

顶部内高光 alpha .42、4px；底部压边约 7px，蓝色 #0059A8 / .48，取消 #C9413A / .24，付费 #B8740F / .48，装备 #087737 / .42，卸载 #941817 / .36。金橙用于付费语义；取消弱于主操作；卸载不混用强红关闭语义。

## 内容、字体与进度

内容面板圆角 12~18、描边 2~3。主承载 #FFFFFF / #F8FCFF，次级 #F7FCFF / #E8F4FF，聚焦详情 #E6F3FF / #D5E9FA。小窗口单任务，中窗口两区，大窗口可用列表、详情、底部操作。

一级标题 24~28，二级 20~22，正文 16~18，次级标签 16，按钮 18~22，核心数字 28~36。优先支持的原生字体，报告字体差异，不把普通正文做成图片。

ProgressBarImg 参考 520×54，底色 #2B6EDB，描边 #12438F / 3，圆角 27；ProgressFillImg 满值 #23CFC0，同圆角；ProgressTxt 白色 22 粗体居中。底板压边 #07316F / .42、7px，填充压边 #078B79 / .48、7px；不做顶部高光。设计稿默认满值，文字 `进度值 / 目标值`，不用百分比。UIEditor 模拟预览可由模拟数据驱动进度和状态；来源“Figma 只制作静态满值”不禁止 App 动态测试。

## Stud 样式与资源

资源及来源见 [assets/stud/README.md](assets/stud/README.md)。Stud 使用一个 ImageLabel 平铺，底板负责颜色，纹理透明背景，文字和图标在上层。贴图、平铺尺寸和透明度优先沿用实际模板。签到示例使用原始 96×96 的 StudTile.png，TileSize=27×27 Offset，标题/主按钮 ImageTransparency=0，普通卡片 .72，第七天卡片 .88；这些数值不是所有模板的强制参数。

签到示例参考配色：标题 #85D84A，领取 #67ED14，选中导航 #278CE9，未选 #546A84，锁定 #809389，普通卡片 #E9F0F4，可领卡片 #EFF9D9，周奖励 #FFF5D9，周奖励标题 #FFD36A，关闭 #F54B6C。表面黑色描边 2~3，圆角 2~6，内部高光和底部压边形成厚度。其他界面的颜色、纹理密度与透明度按实际选用的模板，不强套示例数值。

不逐个创建凸点，不整窗图片化，不虚构上传 ID。本地预览嵌入界面；Stud 使用现有 Toolkit 源码里的真实 ID，权限和图标资源仍需 Studio 验证。图片不自动上传；Roblox UI 导入通过文件菜单交给 Toolkit，使用已配置的真实资源 ID。脚本映射与原始运行脚本见 [Toolkit 移植](references/toolkit-stud-port.md)。

## 制作与验收

读取参考及编辑器能力 → 查询/制作可编辑节点 → 写入交互与模拟接入类 → 检查画布截图 → 测试动作、禁用、reset 与 stop → 保存新界面并重开。模拟奖励关联稳定业务 ID，不以 UI 显示作为真实发奖依据。Figma self-check 不用于 UIEditor；在 App 中验证节点、属性、布局、资源与模拟交互，并分别报告 Studio/设备未验证项。
