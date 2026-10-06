local FX = _G.FX
local FXLoader = FX.Loader
local UI = FX.Class("CStudDailyLoginUIBaseCompClass", "FCUICompClass")

-- 绑定已保存的设计节点；连接随组件销毁清理，不创建视觉效果。
function UI:OnReady()
    local root = FXLoader:PlayerGui("StudDailyLoginUI")
    self.Window = FXLoader:Here(root, "WelfareBox")
    self.Hint = FXLoader:Here(root, "WelfareBox.PopupPanelImg.HintTxt")
    self.Buttons = {}
    self.Captions = {}

    for day = 1, 7 do
        local path = "WelfareBox.PopupPanelImg.Day" .. day .. "RewardImg.ClaimBtn"
        self.Buttons[day] = FXLoader:Here(root, path)
        self.Captions[day] = FXLoader:Here(root, path .. ".CaptionTxt")
        local rewardId = self:GetUIConfig().Rewards[day].Id

        -- 动作传稳定奖励 ID，由接入类更新模拟状态。
        self:TrackConnection(self.Buttons[day].Activated:Connect(function()
            self:EmitUIAction("ClaimReward", { RewardId = rewardId })
        end))
    end

    local closeButton = FXLoader:Here(root, "WelfareBox.TitleImg.CloseSurfaceImg.CloseBtn")
    self:TrackConnection(closeButton.Activated:Connect(function()
        self:EmitUIAction("Close", {})
    end))

    for index, tabName in ipairs({ "TaskTabBtn", "OnlineTabBtn", "SignInTabBtn" }) do
        local button = FXLoader:Here(root, "WelfareBox.NavigationBox." .. tabName)
        self:TrackConnection(button.Activated:Connect(function()
            self:EmitUIAction("SelectTab", { Tab = tabName })
        end))
    end
end

-- 依据模拟状态刷新展示，资格校验仍属于游戏业务。
-- @param state table 接入类提供的窗口、提示和每日奖励状态
function UI:Render(state)
    self.Window.Visible = state.Open
    self.Hint.Text = state.Hint

    for day = 1, 7 do
        local status = state.Statuses[day]
        local caption = "Locked"
        local color = "#809389"
        if status == "Claimable" then
            caption = "Check In"
            color = "#67ed14"
        elseif status == "Claimed" then
            caption = "Claimed"
            color = "#546a84"
        elseif day == 2 then
            caption = "Tomorrow"
        end

        self.Captions[day].Text = caption
        self.Buttons[day].BackgroundColor3 = Color3.fromHex(color)
        self:SetButtonEnabled(self.Buttons[day], status == "Claimable")
    end
end

return UI
