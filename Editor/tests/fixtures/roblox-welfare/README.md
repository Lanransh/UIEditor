# 福利界面测试工程

`UIEditorWorkspace` 是从 Roblox_Y1 的福利工程复制的独立快照，使用新的工程 UUID。
保留完整设计节点、模板参考与风格规范；风格与模板位于 AgentWorkspace/styles，AGENTS.LOCAL.md 保存项目要求；
公共 AI 入口、Docs 和 skills 在编辑器打开时从当前 Roblox 工程类型包同步，不纳入 Git。
没有运行时来源路径依赖，不修改原游戏工程。编辑器打开后生成的 Run.bat 含本机路径，已忽略。

## 使用与验证

在编辑器选择“打开工程”，打开本目录下的 `UIEditorWorkspace`，再打开项目 UI `WelfareHub`。
它包含在线奖励、七日签到和任务进度三个页签，直接运行即可模拟领取。

在 Editor 目录执行 `npm run test:welfare`（先按仓库说明构建 native-bin 运行时）。
单元测试覆盖领取/重复领取、请求失败与重试、pending、进度边界、条目删除与排序、关闭重开及清理。
MCP 测试把工程复制到 test-results 的临时目录，以后台编辑器验证运行、切页、保存与重开，并保存截图。
默认测试不改此快照，不使用 Roblox_Y1 本机绝对路径。

`CWelfareView.lua` / `CWelfarePreview.lua` 是便于审阅的源码，必须与工程保存的 scripts 一致。
修改源码后执行 `npx tsx tests/welfare-smoke.ts --update-fixture`，通过 MCP 写入并保存快照，再运行测试。
不直接修改界面 JSON。普通测试会检查两份源码一致性。

## 游戏接入

- `CUIView`：公共适配、数据动作入口与清理。普通页面自动适配；MainUI 可在类上设置 ScreenAdaptation=false。
- `CWelfareView`：页面展示、局部页签状态、关闭、按稳定 ID 管理奖励条目。
- `CWelfarePreview`：模拟配置、资格计算和领取结果，只在编辑器运行，不导入游戏。
- `CWelfareUICompClass`：游戏项目自行编写，继承生成的 CWelfareView，放在 Generated 之外。

配置形状以 CWelfarePreview.Config 为可运行示例：groups 按 kind（online/signin/task）分组；
每条有稳定 id、reward={type,id,amount}，以及 minutes、day 或 title/target 等页面字段。
State 的逐字段结构与刷新示例见下文。业务接入提供资格与请求状态；展示层不推断实际领取资格。

必需覆写 GetRewardDisplay(reward)，返回 {name,icon}；本示例使用模板子树图标 Coin/Gem/Egg。
必需覆写 OnUIAction(action,payload)，处理 Claim 与 {kind,rewardId}，校验并请求游戏业务。
可选覆写 FormatReward(name,amount)；默认显示名称与数量。

业务 Ctor 先调用父构造，再准备 Config/State；OnReady 先调用父方法，再 BindUIData、Show。
数据变化后 RefreshUI；网络请求期间设置 pending，失败保留可重试状态，成功更新 Claimed。
真实资格校验与发奖在游戏业务/服务端完成。订阅用 TrackConnection 或 TrackCleanup 清理。
局部 RewardRow 拥有克隆节点及连接，删除条目时调用登记返回的 release；页面销毁释放剩余条目。

已验证的是编辑器与导出包。外部 Toolkit 对 CUIView 模块名的兼容、Studio 导入及设备显示仍需联调。
这份工程不包含真实游戏业务接入或通用模块 require/导出机制。

## State 数据契约

`CWelfareView:Render(state)` 接收完整展示状态，不接收局部补丁；默认来源是接入类的
`self.State`，由 `self:RefreshUI()` 传入。首次 BindUIData/Show 前必须准备 Config 与 State。
此 View 没有加载态分支，也不会自动填充缺失状态；真实数据异步到达时，应准备好再显示。

| 字段 | 类型与要求 | 含义与缺省行为 |
| --- | --- | --- |
| onlineMinutes | number，必填，无默认值 | 在线分钟数，页头直接展示；View 不据此计算领取资格 |
| signInDay | number，必填，无默认值 | 当前签到天数，页头直接展示；模拟示例为 1～7 |
| entries | table，必填，无默认值 | 按分组 kind，再按条目 id 索引的状态字典，不是数组 |
| entries[kind] | table，每个 Config.groups 中的分组必填 | kind 为 online/signin/task；无条目时可为 {} |
| entries[kind][id] | table，每个对应 group.items 条目必填 | id 必须等于配置条目的 id；缺失分组或条目会报错 |
| …status | string，必填，无默认值 | Locked / Claimable / Claimed；分别为未满足、可领取、已领取 |
| …pending | boolean，可省略，按 false 处理 | 请求中显示 Claiming... 并禁用按钮；优先于普通状态文字 |
| …current | number，task 条目必填，无默认值 | 原始任务进度，单位与 config.target 一致；其他分组不读取 |
| …error | string，可省略，nil 表示无错误 | Claimable 且非 pending 时，有错误则按钮显示 Retry；不会直接显示错误文本 |
| …label | string，可省略 | Locked 且非 pending 时覆盖按钮文字；缺省为任务 In Progress、其他 Locked |

所有配置分组都会刷新，包括未选中的页签。空 items 可配空状态字典；额外状态项不生成卡片，
显示顺序来自 Config.groups/items。ActiveTab 属于 View 本地状态，不放进业务 State。
current 可超过 target，只有进度条比例被限制到 0～1；target <= 0 时显示空条与“—”。

下面是与现有福利节点匹配的最小完整配置与状态，在接入类完成父构造后准备。
游戏类仍须按上文实现 GetRewardDisplay 和 OnUIAction。

```lua
self.Config = {
    groups = {
        { kind = "online", page = "OnlineBox", columns = 3, gapX = 20, gapY = 16,
          items = {
              { id = "online_5", minutes = 5,
                reward = { type = "Currency", id = "Gold", amount = 100 } },
          } },
        { kind = "signin", page = "SignInBox", columns = 3, gapX = 12, gapY = 16,
          items = {} },
        { kind = "task", page = "TasksBox", columns = 1, gapX = 0, gapY = 12,
          items = {
              { id = "collect_coins", title = "Collect 1,000 Coins", target = 1000,
                reward = { type = "Currency", id = "Gold", amount = 300 } },
          } },
    },
}
self.State = {
    onlineMinutes = 12,
    signInDay = 1,
    entries = {
        online = { online_5 = { status = "Claimable", pending = false } },
        signin = {},
        task = { collect_coins = { status = "Locked", current = 350, pending = false } },
    },
}
-- OnReady 先调用父方法绑定节点，再初始化显示：
self:BindUIData()
self:Show()

-- 游戏接入收到领取成功结果后，更新完整状态中的对应条目，再刷新：
local entry = self.State.entries.online.online_5
entry.status, entry.pending, entry.error = "Claimed", false, nil
self:RefreshUI()
```

点击上述在线奖励会发出 `OnUIAction("Claim", { kind = "online", rewardId = "online_5" })`。
kind 与 rewardId 均为 string，rewardId 对应条目 id，**不是**奖励物品的 `Gold`。
游戏接入发送请求前设置 pending=true 并刷新；失败后清除 pending、填写 error，按业务结果
保留或更新 status；成功后更新为 Claimed。真实资格与发奖由业务/服务端决定。
