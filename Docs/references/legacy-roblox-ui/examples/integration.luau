local FX = _G.FX
local Preview = FX.Class("COnlineRewardUIPreviewCompClass", "COnlineRewardUIBaseCompClass")

-- 初始化本次运行的模拟数据。
-- @param owner table 编辑器提供的组件宿主
function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = { RewardId = "online_5min" }
    self.State = { Status = "Claimable" }
end

-- 领取只更新模拟数据，不执行真实发奖。
-- @param action string 交互层动作名
-- @param payload table 包含稳定奖励 ID 的动作参数
function Preview:OnUIAction(action, payload)
    if action == "ClaimReward" and self.State.Status == "Claimable" then
        print("模拟领取", payload.RewardId)
        self.State.Status = "Claimed"
        self:RefreshUI()
    end
end

return Preview
