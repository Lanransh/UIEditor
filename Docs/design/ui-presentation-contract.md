# UI 展示框架与项目接入（待评审方案）

## 状态与目标

本文按用户要求整理为供评审的方案，明确框架如何设计、动态内容从哪里取得、
项目代码如何接入。推荐接口和扩展能力不代表已经实现；当前事实以
[交互脚本与接入运行时](ui-runtime.md)和[Roblox 一次性导入](roblox-import.md)为准。

目标是以小而稳定的框架支持各种游戏 UI：简单页面直接更新已有节点，重复内容
按需使用组件，可变列表按需克隆。文字、进度、图标和效果均能扩展，但不要求
编辑器模拟完整游戏引擎。本文不改变当前运行时与导出格式。

## 1. 当前基础与推荐方向

当前公共类在 `Editor/src/shared/uiCompClass.ts`，已提供：
GetUIConfig、GetUIState、RefreshUI、Render 调用、EmitUIAction 和按钮禁用。
交互类负责展示；测试接入类继承交互类，初始化数据和模拟动作；游戏接入类在
导出后提供真实业务。节点属性更新、Clone 和按钮事件已有支持。

通过 MCP 查看当前 Roblox_Y1 工程 WelfareHub 示例，页面自行克隆条目，
切换 Coin/Gem/Egg 子树，并处理在线、签到、任务和大奖排版。这是项目示例，
不应成为所有 UI 必须遵循的框架结构。

推荐保留现有页面入口；把重复的奖励展示、格式化和卡片逐步提取为项目模块。
不强制改造全部页面，也不把奖励、背包、宠物等方法不断加进公共基类。

| 层级 | 负责 | 简单例子 |
| --- | --- | --- |
| 视觉模板 | 节点、布局、默认外观、占位 | 卡片背景和图标尺寸 |
| 页面展示代码 | 绑定节点、更新属性、组织交互 | 把当前等级写入 Text |
| 项目公共模块 | 奖励展示查询、格式化、可复用组件 | Gold 转换为金币图标与名称 |
| 测试接入代码 | 模拟配置、状态和动作结果 | 模拟领取后刷新为 Claimed |
| 游戏接入代码 | 真实配置、订阅、请求、结果转换 | 查询任务系统并提交领取 ID |
| 框架与宿主 | 生命周期、动作转发、清理及运行边界 | 刷新展示并在销毁时断开连接 |

框架不负责判定奖励资格、查询具体金币表或发奖。

## 2. 框架契约怎样设计

### 2.1 页面继续使用现有数据与动作入口

```lua
-- 以下四个入口当前已有；具体配置、状态字段由项目约定。
local config = self:GetUIConfig()
local state = self:GetUIState()

self:RefreshUI() -- 读取状态并调用 Render(state)
self:EmitUIAction("Claim", { entryId = "online_5" })
```

Config 是页面所需配置，State 是当前展示数据；接入层可以把复杂游戏数据
转换为页面容易消费的结构。纯 UI 状态，如当前页签和展开状态，可由页面维护，
不必把每一次切页发给游戏业务。

### 2.2 推荐子组件契约

子组件只绑定给定节点子树，不自行查找全局 PlayerGui，也不执行整屏适配：

```lua
-- 建议的项目组件接口，当前尚无统一内置实现。
local view = RewardView.Attach(root, dependencies)
view:Update(reward)
view:Destroy()
```

Attach 绑定节点和连接事件；Update 更新显示；Destroy 清理自身资源。
简单组件不需要 Show/Hide 等额外接口。普通函数足以完成的格式化无需创建组件。

生命周期与节点所有权分开：绑定已有 root 不代表拥有删除 root 的权力；
组件只删除自己创建的内部节点，外部克隆根节点由创建它的页面或列表删除。

```lua
-- 已有节点：销毁绑定时保留设计节点。
local view = RewardView.Attach(existingRoot, dependencies)
view:Destroy()

-- 克隆节点：列表拥有根节点，先清理组件，再删除克隆。
local root = template:Clone()
local row = RewardView.Attach(root, dependencies)
-- ……使用后……
row:Destroy()
root:Destroy()
```

推荐用小型清理工具管理事件、订阅、任务和子组件；具体工具接口尚待实施设计，
不要求项目作者为每个资源发明一套销毁规则。

### 2.3 不强制克隆

| 场景 | 做法 |
| --- | --- |
| 重生、设置界面 | 直接绑定已有节点，刷新文字、显隐和按钮 |
| 固定七格签到 | 可设计好七格，按稳定条目 ID 绑定 |
| 可变数量在线奖励、背包 | 按数据克隆模板，按 ID 更新与删除 |
| 固定面板加动态奖励 | 外层绑定现有节点，内层按需克隆 |

普通和大奖是卡片外观；金币和宠物是奖励内容，两者独立。模板数量由页面决定。
特殊卡片差异大时使用独立模板，不用大量运行时坐标修正强行共用一个模板。

## 3. 哪些内容动态获取

动态与静态按属性区分，不为整个节点设置笼统的“动态”标记。
展示代码接管的属性随数据更新；其他属性保留编辑器设计值。

| 内容 | 从哪里取得 | 展示代码更新什么 |
| --- | --- | --- |
| 固定背景、边框、装饰 | 视觉模板 | 通常不更新 |
| 等级、任务名称、说明 | 配置或业务状态 | Text |
| 倒计时 | 截止时间与接入时钟 | 格式化后的 Text |
| 进度条 | 原始当前值与目标值 | 填充节点 Size |
| 进度文本 | 同一组原始数值 | Text |
| 奖励图标 | 奖励标识查询项目配置 | Image |
| 奖励名称 | 奖励展示查询或文案接口 | Text |
| 奖励数量、奖励文本 | 原始数量及项目格式化方法 | Text |
| 已领取标记、按钮状态 | 业务状态与请求状态 | Visible、Interactable、文字和颜色 |
| 品质框、星级等复杂内容 | 项目奖励展示模块 | 多个属性或内部展示组件 |

动态获取不等于每次刷新都发网络请求。常规 Render 使用已就绪配置和当前数据；
数据未就绪时接入层提供加载状态，就绪后刷新。编辑器占位图不作为真实奖励来源。

同一属性由一个主要管理者负责：页面把奖励交给 RewardView 后，不再修改内部
图标；布局组件控制的尺寸不被普通刷新覆盖；动画与数据刷新需约定属性控制权。

## 4. 动态内容的简单示例

以下均为展示逻辑示意，节点已在初始化时取得。

### 4.1 文字与重生界面：不克隆

```lua
function UI:Render(state)
    self.LevelText.Text = tostring(state.level)
    self.BonusText.Text = state.bonusText
    self:SetButtonEnabled(self.RebirthButton,
        state.canRebirth and not state.pending)
end
```

背景、文字位置和按钮排版由界面提供；动态的只有上述属性。
canRebirth 由业务接入提供，界面不承担真实重生资格校验。

### 4.2 进度条与进度文本

```lua
local ratio = 0
if target > 0 then
    ratio = math.clamp(current / target, 0, 1)
end

self.Fill.Size = UDim2.fromScale(ratio, 1)
self.ProgressText.Text = target > 0
    and (tostring(current) .. " / " .. tostring(target))
    or "—"
```

约定 Fill 从左向右填充，锚点和位置在模板中设置，尺寸不受其他布局控制。
原始 current 保留，不因条形填满而改写。无效目标显示空条与占位，接入校验报告
配置问题，不能因此默认可领取。项目可把数字格式化集中为公共方法。

### 4.3 奖励图标和奖励文本

```lua
local reward = { type = "Currency", id = "Gold", amount = 100 }
local display = self:GetRewardDisplay(reward)

self.RewardIcon.Image = display.icon
self.RewardText.Text = self:FormatReward(display.name, reward.amount)
```

GetRewardDisplay 和 FormatReward 是建议的项目接入方法，不是内置基类方法。
查询输入保留奖励身份与原始数量，输出展示字段；格式化只生成文字，不修改数据。
项目可在格式化方法中处理单位、缩写与本地化，避免页面重复拼接固定语言。

活动条目 ID（例如 day_1）用于领取；物品 ID（例如 Gold）用于查询展示，两者不同。
多个活动可以奖励同一种物品，不能用图标、名字或列表位置作为活动身份。

### 4.4 多奖励与复杂奖励

```lua
local entry = {
    id = "day_7",
    rewards = {
        { type = "Currency", id = "Gold", amount = 500 },
        { type = "Item", id = "RareEgg", amount = 1 },
    },
}
```

页面把 rewards 交给奖励容器中的展示列表。数量固定时也可绑定已有槽位。
若重复物品需要独立更新，各条奖励应有稳定条目 ID，不能只按物品 ID 去重。
礼包封面是卡片的展示信息，不代替礼包内部奖励描述。

简单奖励直接更新图片和文字。复杂奖励使用项目组件：

```lua
-- 示意：项目工厂选择实现，页面不枚举金币、装备、宠物。
local view = rewardViews:Attach(container)
view:Update(reward)
```

游戏可以接入已有宠物展示；预览提供图片和星级等简化实现。更换结构时清理旧
组件，更新时清除旧品质、星级和角标。现在不需要的复杂类型不提前实现。

## 5. 项目接入代码怎样写

下面以单条任务奖励为例，说明交互、模拟和游戏三部分怎样配合。
节点示例：TaskPanel 下有 Title、Fill、ProgressText、RewardIcon、RewardText、
ClaimedMark 和 ClaimButton；Fill 按上文约定设计。

### 5.1 页面交互类

以下沿用当前类与生命周期写法；新增的是项目自定义的两个方法约定，
并非要求框架增加奖励专用接口。

```lua
local FX = _G.FX
local UI = FX.Class("CTaskUIBaseCompClass", "CUIEditorUICompClass")

function UI:OnReady()
    local root = FX.Loader:PlayerGui("TaskUI.TaskPanel")
    self.Title = FX.Loader:Here(root, "Title")
    self.Fill = FX.Loader:Here(root, "Fill")
    self.ProgressText = FX.Loader:Here(root, "ProgressText")
    self.RewardIcon = FX.Loader:Here(root, "RewardIcon")
    self.RewardText = FX.Loader:Here(root, "RewardText")
    self.ClaimedMark = FX.Loader:Here(root, "ClaimedMark")
    self.ClaimButton = FX.Loader:Here(root, "ClaimButton")

    self:TrackConnection(self.ClaimButton.Activated:Connect(function()
        self:EmitUIAction("Claim", {
            entryId = self:GetUIConfig().id,
        })
    end))
end

function UI:Render(state)
    local config = self:GetUIConfig()
    local display = self:GetRewardDisplay(config.reward)
    local ratio = 0
    if config.target > 0 then
        ratio = math.clamp(state.current / config.target, 0, 1)
    end

    self.Title.Text = config.title
    self.Fill.Size = UDim2.fromScale(ratio, 1)
    self.ProgressText.Text = config.target > 0
        and (tostring(state.current) .. " / " .. tostring(config.target))
        or "—"
    self.RewardIcon.Image = display.icon
    self.RewardText.Text = self:FormatReward(
        display.name, config.reward.amount)
    self.ClaimedMark.Visible = state.status == "Claimed"
    self:SetButtonEnabled(self.ClaimButton,
        state.status == "Claimable" and not state.pending)
end

return UI
```

页面不知道金币配置放在哪里，不发网络请求，也不通过比较进度直接决定发奖。
事件只连接一次，点击读取当前条目 ID；刷新只修改展示。

### 5.2 编辑器测试接入类

```lua
local FX = _G.FX
local Preview = FX.Class("CTaskUIPreviewCompClass", "CTaskUIBaseCompClass")

function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = {
        id = "collect_gold",
        title = "收集金币",
        target = 1000,
        reward = { type = "Currency", id = "Gold", amount = 100 },
    }
    self.State = { current = 1000, status = "Claimable", pending = false }
end

function Preview:GetRewardDisplay(reward)
    assert(reward.type == "Currency" and reward.id == "Gold",
        "模拟配置缺少此奖励")
    -- 占位 ID；实际预览需使用已配置本地预览映射的资源。
    return { icon = "rbxassetid://123456789", name = "金币" }
end

function Preview:FormatReward(name, amount)
    return name .. " ×" .. tostring(amount)
end

function Preview:OnUIAction(action, payload)
    if action ~= "Claim" or payload.entryId ~= self.Config.id then
        return
    end
    if self.State.status ~= "Claimable" or self.State.pending then
        return
    end
    self.State.status = "Claimed" -- 仅模拟，不发奖
    self:RefreshUI()
end

return Preview
```

Config/State 的默认读取和首次刷新可沿用公共类，无需重复写无差异的 getter。
可修改模拟状态验证未完成、已领取等情形；该模拟不证明真实请求和权限正确。

### 5.3 游戏接入类

游戏类继续继承导出的交互类，放在生成目录之外。下面代码为接入片段；
TaskService、RewardCatalog、TextFormat 均指项目提供的依赖，不是现有框架 API。
业务构造阶段先调用父构造，再准备这些依赖及 Config/State。

```lua
function GameUI:GetRewardDisplay(reward)
    return self.RewardCatalog:GetDisplay(reward)
end

function GameUI:FormatReward(name, amount)
    return self.TextFormat:Reward(name, amount)
end

function GameUI:OnReady()
    GameUI.Super.OnReady(self)
    self:BindUIData()
    self:Show()
end

function GameUI:BindUIData()
    self.State = self.TaskService:GetViewState(self.Config.id)
    self:RefreshUI()
    self:TrackConnection(self.TaskService.Changed:Connect(function(entryId)
        if entryId == self.Config.id then
            self.State = self.TaskService:GetViewState(entryId)
            self:RefreshUI()
        end
    end))
end

function GameUI:OnUIAction(action, payload)
    if action ~= "Claim" or payload.entryId ~= self.Config.id then
        return
    end
    self.TaskService:RequestClaim(payload.entryId)
end
```

此示例要求 TaskService 提供以下明确语义，实际项目需适配现有服务：

- GetViewState 返回 current/status/pending 等展示所需字段。
- RequestClaim 管理重复请求、Pending、成功及失败状态，并发布 Changed。
- Changed 返回的连接支持 Disconnect，才能由 TrackConnection 清理。
- 请求状态改变后主动通知；真实资格与结果仍由游戏业务决定。
- 数据在绑定时可同步读取；若需加载，另提供加载状态并在就绪时通知。

真实游戏入口的类加载与父类初始化顺序沿用现有导入设计，以上片段不是可直接
粘贴的完整业务类。订阅只建立一次；隐藏后是否继续订阅由项目约定，重新显示
必须取得最新状态。若使用直接异步回调而非服务通知，应增加销毁与请求代次检查，
防止旧结果更新新页面。

### 5.4 奖励配置查询的项目实现

```lua
function RewardCatalog:GetDisplay(reward)
    local config = self.ConfigByType[reward.type]
    local item = config and config[reward.id]
    if not item then
        return self.MissingDisplay
    end
    return { icon = item.icon, name = item.name }
end
```

MissingDisplay 由项目提供明确占位，同时需报告可定位的缺失信息。
不允许查询失败后不赋值，导致继续显示旧奖励。已知结构在数据边界校验，
不在每个页面重复展开配置表判断。异步取得配置时先显示加载状态，准备好后刷新。

## 6. 生命周期与效果的共同规则

- 重复 Render/Update 不重复连接事件、不重复请求、不重新创建全部条目。
- 一次性成功动画由结果事件触发，不因普通刷新而重播。
- 列表按稳定 ID 更新；移除时清理资源；点击使用当前条目而非初次捕获的旧数据。
- 隐藏不等于销毁；重复打开不累积订阅，销毁后旧回调不可再修改节点。
- 可见期间的定时更新和特效可以停止；退出动画与快速重开需取消旧过程。
- 动画和布局的属性归属要明确；页面可以写特殊效果，无需框架增加业务分支。

倒计时示意：

```lua
local remaining = math.max(0, deadline - clock:Now())
countdown.Text = formatter:Duration(remaining)
```

clock 与 formatter 是项目约定的依赖，必须另有更新驱动才能持续刷新。
编辑器当前尚无通用时间驱动，不能把此片段当作已支持实时倒计时的证明。
倒计时到零只是显示变化，不能代替业务资格更新。

## 7. 编辑器需要补什么，哪些留给项目

| 能力 | 推荐归属 | 当前状态 |
| --- | --- | --- |
| 已有节点赋值、克隆、按钮事件 | 当前运行时 | 已支持受限范围 |
| 奖励查询、文字格式、卡片特例 | 项目代码 | 可先用接入方法表达，不新增基类业务接口 |
| Image 按当前 ID 找本地预览 | 编辑器图片与运行宿主 | 需补齐，换 ID 后不能保留旧图 |
| 公共模块及配套模板复用 | 编辑器加载/导出 + 项目模块 | 需设计标识、依赖与生成归属 |
| 子组件资源管理 | 小型通用工具与明确契约 | 尚无完整统一机制 |
| 定时、常用动画与更多输入 | 按实际需求扩展宿主与项目辅助模块 | 不视为已完整支持 |
| 3D 或特殊引擎效果 | 游戏接入 | 明示简化预览，到游戏验证 |

项目模块不能假定当前可 require；后续导出仅更新工具管理的文件，不覆盖手写
业务。公共代码升级需兼容旧页面，不因导入一个新页面悄悄破坏其他界面。
编辑器不支持的游戏能力可由接入实现替换，但必须明确预览差异。

## 8. 取舍与待确认事项

推荐显式展示代码配合小型组件，因为与现有 Render 接口接近、属性来源清楚。
可视化字段绑定是另一种方案，需额外定义类型、格式化、错误和脚本所有权；
本方案不把它作为前置能力，也不引入任意表达式或大型配置语言。

评审需要确认：

- 是否采用按属性接管的写法，而不增加统一“动态节点”标记。
- 是否保留当前继承入口，以项目方法和组件逐步复用，避免一次重做框架。
- 项目奖励展示字段与格式化接口是否满足实际配置；哪些复杂奖励需首批支持。
- 项目公共模块和模板的存储、版本、加载与导出方案需在实现前单独确定。

## 9. 验收场景

以下是后续落地标准，不是本文已经执行的测试：

- 重生界面只改已有节点；签到既能绑定固定七格，也能使用克隆列表。
- 文字、进度、图标和奖励文本同时更新，未接管外观保留设计值。
- 进度为零、到达目标、超过目标和无效目标时显示符合约定。
- 切换奖励、缺失图片、多奖励和重复物品时不残留旧内容，身份正确。
- 列表增删排序后点击对应正确条目；重复开关与刷新不增加事件。
- 请求中、失败、成功分别展示；过期结果不改新实例，成功效果不重复播放。
- 分别验证 App 预览、保存加载、导出及 Roblox 接入；设备显示与性能另行验证。
