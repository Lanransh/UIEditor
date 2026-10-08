# 福利界面测试工程

`UIEditorWorkspace` 是从 Roblox_Y1 的福利工程复制的独立快照，使用新的工程 UUID。
保留完整设计节点、模板参考与风格规范；公共 AI 技能使用当前 Roblox 工程类型包。
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
State.onlineMinutes 与 State.signInDay 提供页头摘要；
State.entries[kind][id] 提供 status（Locked/Claimable/Claimed）、pending、任务 current，
以及可选 error/label。业务接入提供资格与请求状态；展示层不推断实际领取资格。

必需覆写 GetRewardDisplay(reward)，返回 {name,icon}；本示例使用模板子树图标 Coin/Gem/Egg。
必需覆写 OnUIAction(action,payload)，处理 Claim 与 {kind,rewardId}，校验并请求游戏业务。
可选覆写 FormatReward(name,amount)；默认显示名称与数量。

业务 Ctor 先调用父构造，再准备 Config/State；OnReady 先调用父方法，再 BindUIData、Show。
数据变化后 RefreshUI；网络请求期间设置 pending，失败保留可重试状态，成功更新 Claimed。
真实资格校验与发奖在游戏业务/服务端完成。订阅用 TrackConnection 或 TrackCleanup 清理。
局部 RewardRow 拥有克隆节点及连接，删除条目时调用登记返回的 release；页面销毁释放剩余条目。

已验证的是编辑器与导出包。外部 Toolkit 对 CUIView 模块名的兼容、Studio 导入及设备显示仍需联调。
这份工程不包含真实游戏业务接入或通用模块 require/导出机制。
