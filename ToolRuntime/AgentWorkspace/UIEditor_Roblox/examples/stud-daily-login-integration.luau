local FX = _G.FX
local Preview = FX.Class("CStudDailyLoginUIPreviewCompClass", "CStudDailyLoginUIBaseCompClass")

-- 每次运行初始化模拟数据，不读写玩家存档或真实奖励。
-- @param owner table 编辑器提供的组件宿主，传递给父类初始化
function Preview:Ctor(owner)
    Preview.Super.Ctor(self, owner)
    self.Config = { Rewards = {} }
    for day = 1, 7 do
        self.Config.Rewards[day] = { Id = "daily_day_" .. day }
    end
    self.State = {
        Open = true,
        Hint = "Check in once per day",
        Statuses = { "Claimable", "Locked", "Locked", "Locked", "Locked", "Locked", "Locked" },
    }
end

-- 处理界面动作；领取只改变本次预览状态。
-- @param action string 交互类发送的动作名
-- @param payload table 奖励 ID 或导航按钮名等动作参数
function Preview:OnUIAction(action, payload)
    if action == "ClaimReward" then
        for day, reward in ipairs(self.Config.Rewards) do
            if reward.Id == payload.RewardId and self.State.Statuses[day] == "Claimable" then
                self.State.Statuses[day] = "Claimed"
                self.State.Hint = "Checked in! Come back tomorrow"
                print("Preview claim", payload.RewardId)
            end
        end
    elseif action == "Close" then
        self.State.Open = false
    elseif action == "SelectTab" then
        if payload.Tab == "SignInTabBtn" then
            self.State.Hint = "Check in once per day"
        else
            self.State.Hint = "Other pages: visual preview only"
        end
        print("Preview tab", payload.Tab)
    end
    self:RefreshUI()
end

return Preview
