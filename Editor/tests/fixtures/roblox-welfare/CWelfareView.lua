local FX = _G.FX
local Loader = FX.Loader
local CWelfareView = FX.Class("CWelfareView", "CUIView")

-- 局部条目只管理自身克隆与连接，不执行整屏适配。
local RewardRow = {}
RewardRow.__index = RewardRow

-- 绑定一个条目；点击时读取最新配置中的稳定业务 ID。
-- @param view table 所属页面
-- @param group table 分组配置
-- @param root Instance 页面创建的克隆节点
-- @return table 条目展示对象
function RewardRow.Attach(view, group, root)
    local row = setmetatable({ View = view, Kind = group.kind, Root = root }, RewardRow)
    row.Button = Loader:Here(root, "ClaimBtn")
    row.Connection = row.Button.Activated:Connect(function()
        view:EmitUIAction("Claim", { kind = row.Kind, rewardId = row.Config.id })
    end)
    return row
end

-- 使用项目查询结果展示奖励，按业务状态控制按钮，不判断真实领取资格。
-- @param config table 当前条目配置
-- @param state table 当前条目状态
function RewardRow:Update(config, state)
    self.Config = config
    local root = self.Root
    local display = self.View:GetRewardDisplay(config.reward)
    local rewardText = self.View:FormatReward(display.name, config.reward.amount)
    Loader:Here(root, "RewardTxt").Text = self.Kind == "task" and ("Reward: " .. rewardText) or rewardText
    if self.Kind == "task" then
        Loader:Here(root, "TaskNameTxt").Text = config.title
        local bar = Loader:Here(root, "ProgressBarImg")
        local target = config.target
        local ratio = 0
        if target > 0 then
            ratio = math.clamp(state.current / target, 0, 1)
        end
        Loader:Here(bar, "ProgressFillImg").Size = UDim2.fromScale(ratio, 1)
        Loader:Here(bar, "ProgressTxt").Text = target > 0 and (state.current .. " / " .. target) or "—"
    else
        local text = self.Kind == "online" and (config.minutes .. " min") or ("Day " .. config.day)
        Loader:Here(root, self.Kind == "online" and "TimeTxt" or "DayTxt").Text = text
        assert(display.icon == "Coin" or display.icon == "Gem" or display.icon == "Egg", "Unsupported reward icon: " .. tostring(display.icon))
        for _, icon in ipairs({ "Coin", "Gem", "Egg" }) do
            Loader:Here(root, icon .. "IconBox").Visible = display.icon == icon
        end
    end
    local label = "Locked"
    if state.pending then
        label = "Claiming..."
    elseif state.status == "Claimed" then
        label = self.Kind == "signin" and "Checked In" or "Claimed"
    elseif state.status == "Claimable" then
        label = state.error and "Retry" or (self.Kind == "signin" and "Check In" or "Claim")
    elseif state.status == "Locked" then
        label = state.label or (self.Kind == "task" and "In Progress" or "Locked")
    else
        error("Unknown reward status: " .. tostring(state.status))
    end
    self.View:RenderButton(self.Button, label, state.status == "Claimable" and not state.pending)
end

-- 释放条目拥有的事件与克隆根；不删除页面设计模板。
function RewardRow:Destroy()
    self.Connection:Disconnect()
    self.Root:Destroy()
end

-- 绑定设计节点；页签和关闭由展示层维护，不发送业务请求。
function CWelfareView:OnReady()
    self.Root = Loader:PlayerGui("WelfareUI")
    self.Rows = {}
    self.ActiveTab = "online"
    local tabs = { { "online", "OnlineTabBtn" }, { "signin", "SignInTabBtn" }, { "task", "TasksTabBtn" } }
    for _, tab in ipairs(tabs) do
        self:TrackConnection(Loader:Here(self.Root, "TabsBox." .. tab[2]).Activated:Connect(function()
            self.ActiveTab = tab[1]
            self:RefreshUI()
        end))
    end
    self:TrackConnection(Loader:Here(self.Root, "TitleBox.CloseSurfaceImg.CloseBtn").Activated:Connect(function()
        self:Hide()
    end))
end

-- 每次打开显示最新接入数据，隐藏不丢失状态或重建事件。
function CWelfareView:OnShow()
    self:RefreshUI()
end

-- 游戏与模拟接入都必须提供奖励展示查询。
-- @param reward table 原始奖励类型、ID 与数量
-- @return table name 和当前模板支持的 icon（Coin/Gem/Egg）
function CWelfareView:GetRewardDisplay(reward)
    error("Welfare integration must implement GetRewardDisplay")
end

-- 可选覆写的数量显示格式，不修改原始奖励数据。
-- @param name string 奖励名称
-- @param amount number 原始数量
-- @return string 显示文本
function CWelfareView:FormatReward(name, amount)
    return name .. " ×" .. tostring(amount)
end

-- 领取动作必须由游戏或模拟接入实现。
-- @param action string 动作名称
-- @param payload table kind 和 rewardId
function CWelfareView:OnUIAction(action, payload)
    error("Welfare integration must implement OnUIAction")
end

-- 按稳定 ID 增删、排序和更新条目；未变化条目保留节点与连接。
-- @param group table 分组、布局和有序条目
-- @param states table 以业务 ID 索引的展示状态
function CWelfareView:SyncItems(group, states)
    local page = Loader:Here(self.Root, "PopupPanelImg." .. group.page)
    local template = Loader:Here(page, "ItemTemplateImg")
    local container = Loader:Here(page, "ItemsBox")
    template.Visible = false
    local rows = self.Rows[group.kind] or {}
    self.Rows[group.kind] = rows
    local keep = {}
    local width, height = template.Size.X.Offset, template.Size.Y.Offset
    local normalIndex, bottom = 0, 0
    for index, config in ipairs(group.items) do
        assert(not keep[config.id], "Duplicate reward ID: " .. config.id)
        keep[config.id] = true
        local row = rows[config.id]
        if row and row.Featured ~= (config.featured == true) then
            row.Release()
            rows[config.id] = nil
            row = nil
        end
        if not row then
            local root = template:Clone()
            root.Name = "Item_" .. config.id .. "Img"
            root.Parent = container
            root.Visible = true
            row = RewardRow.Attach(self, group, root)
            row.Featured = config.featured == true
            row.Release = self:TrackCleanup(function()
                row:Destroy()
            end)
            rows[config.id] = row
        end
        local root = row.Root
        local x = (normalIndex % group.columns) * (width + group.gapX)
        local y = math.floor(normalIndex / group.columns) * (height + group.gapY)
        if config.featured then
            x, y = group.columns * (width + group.gapX), 0
            root.Size = UDim2.fromOffset(width, height * 2 + group.gapY)
            self:StyleFeatured(root, config)
        else
            normalIndex = normalIndex + 1
        end
        root.Position = UDim2.fromOffset(x + 2, y + 2)
        root.LayoutOrder = index
        bottom = math.max(bottom, y + root.Size.Y.Offset)
        row:Update(config, assert(states[config.id], "Missing reward state: " .. group.kind .. "/" .. config.id))
    end
    for id, row in pairs(rows) do
        if not keep[id] then
            row.Release()
            rows[id] = nil
        end
    end
    container.CanvasSize = UDim2.fromOffset(792, bottom + 4)
end

-- 沿用设计模板的双行大奖布局。
-- @param row Instance 克隆条目
-- @param config table 大奖外观配置
function CWelfareView:StyleFeatured(row, config)
    row.BackgroundColor3 = Color3.fromRGB(config.color[1], config.color[2], config.color[3])
    local label = Loader:Here(row, "WeeklyTxt")
    label.Visible, label.Text = true, config.badge
    local width = row.Size.X.Offset
    for _, iconType in ipairs({ "Coin", "Gem", "Egg" }) do
        local box = Loader:Here(row, iconType .. "IconBox")
        local icon = Loader:Here(box, "RewardIconImg")
        icon.Position = UDim2.fromOffset((width - 64) / 2, 92)
        icon.Size = UDim2.fromOffset(64, 64)
        for _, child in ipairs(box:GetChildren()) do
            if child.Name == "IconMarkTxt" then
                child.Position, child.Size = icon.Position, icon.Size
            end
        end
    end
    local reward = Loader:Here(row, "RewardTxt")
    reward.Position, reward.Size = UDim2.fromOffset(0, 176), UDim2.fromOffset(width, 55)
    local button = Loader:Here(row, "ClaimBtn")
    button.Position = UDim2.fromOffset(button.Position.X.Offset, row.Size.Y.Offset - 48)
end

-- 保留风格按钮表面，只更新状态。
-- @param button Instance 点击节点
-- @param label string 显示文字
-- @param enabled boolean 是否允许操作
function CWelfareView:RenderButton(button, label, enabled)
    self:SetButtonEnabled(button, enabled)
    button.BackgroundColor3 = enabled and Color3.fromRGB(103, 237, 20) or Color3.fromRGB(99, 128, 121)
    Loader:Here(button, "ButtonTxt").Text = label
    Loader:Here(button, "BottomEdgeImg").BackgroundColor3 = enabled and Color3.fromRGB(34, 90, 7) or Color3.fromRGB(38, 62, 54)
end

-- 接入提供状态，View 只组织页面和条目展示，不改根节点的显隐。
-- @param state table entries、onlineMinutes 与 signInDay
function CWelfareView:Render(state)
    local tabs = { online = "OnlineTabBtn", signin = "SignInTabBtn", task = "TasksTabBtn" }
    local labels = { online = "Online\nRewards", signin = "Daily Login", task = "Tasks" }
    for _, group in ipairs(self:GetUIConfig().groups) do
        Loader:Here(self.Root, "PopupPanelImg." .. group.page).Visible = self.ActiveTab == group.kind
        local button = Loader:Here(self.Root, "TabsBox." .. tabs[group.kind])
        self:RenderButton(button, labels[group.kind], true)
        if self.ActiveTab ~= group.kind then
            button.BackgroundColor3 = Color3.fromRGB(99, 128, 121)
            Loader:Here(button, "BottomEdgeImg").BackgroundColor3 = Color3.fromRGB(38, 62, 54)
        end
        self:SyncItems(group, assert(state.entries[group.kind], "Missing group state: " .. group.kind))
    end
    Loader:Here(self.Root, "PopupPanelImg.OnlineBox.SubtitleTxt").Text = "Online: " .. state.onlineMinutes .. " min · Resets daily"
    Loader:Here(self.Root, "PopupPanelImg.SignInBox.HeadingTxt").Text = "Daily Login · Day " .. state.signInDay
end

return CWelfareView
