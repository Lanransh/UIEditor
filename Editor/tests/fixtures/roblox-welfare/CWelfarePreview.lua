local FX = _G.FX
local CWelfarePreview = FX.Class("CWelfarePreview", "CWelfareView")

-- 初始化隔离的模拟配置；修改数值可验证锁定、完成、超出目标和无效目标。
-- @param owner table 编辑器组件宿主
function CWelfarePreview:Ctor(owner)
    CWelfarePreview.Super.Ctor(self, owner)
    self.Config = {
        groups = {
            {
                kind = "online", page = "OnlineBox", columns = 3, gapX = 20, gapY = 16,
                items = {
                    { id = "online_5", minutes = 5, reward = { type = "Currency", id = "Gold", amount = 100 }},
                    { id = "online_10", minutes = 10, reward = { type = "Currency", id = "Gold", amount = 200 }},
                    { id = "online_15", minutes = 15, reward = { type = "Currency", id = "Diamond", amount = 20 }},
                    { id = "online_30", minutes = 30, reward = { type = "Currency", id = "Gold", amount = 500 }},
                    { id = "online_45", minutes = 45, reward = { type = "Currency", id = "Diamond", amount = 50 }},
                    { id = "online_60", minutes = 60, reward = { type = "Item", id = "CommonEgg", amount = 1 }}
                }
            },
            {
                kind = "signin", page = "SignInBox", columns = 3, gapX = 12, gapY = 16,
                items = {
                    { id = "day_1", day = 1, reward = { type = "Currency", id = "Gold", amount = 100 }},
                    { id = "day_2", day = 2, reward = { type = "Currency", id = "Gold", amount = 200 }},
                    { id = "day_3", day = 3, reward = { type = "Item", id = "CommonEgg", amount = 1 }},
                    { id = "day_4", day = 4, reward = { type = "Currency", id = "Diamond", amount = 50 }},
                    { id = "day_5", day = 5, reward = { type = "Currency", id = "Gold", amount = 500 }},
                    { id = "day_6", day = 6, reward = { type = "Currency", id = "Diamond", amount = 100 }},
                    { id = "day_7", day = 7, reward = { type = "Item", id = "RareEgg", amount = 1 }, featured = true, badge = "Weekly Reward", color = { 102, 80, 25 }}
                }
            },
            {
                kind = "task", page = "TasksBox", columns = 1, gapX = 0, gapY = 12,
                items = {
                    { id = "collect_coins", title = "Collect 1,000 Coins", target = 1000, previewValue = 1000, reward = { type = "Currency", id = "Gold", amount = 300 }},
                    { id = "play_matches", title = "Play 3 Matches", target = 3, previewValue = 1, reward = { type = "Currency", id = "Diamond", amount = 30 }},
                    { id = "hatch_egg", title = "Hatch 1 Pet Egg", target = 1, previewValue = 0, reward = { type = "Currency", id = "Gold", amount = 500 }}
                }
            }
        }
    }
    self.State = { onlineMinutes = 12, signInDay = 1, entries = {} }
    self.FailNextClaim = false
    for _, group in ipairs(self.Config.groups) do
        local entries = {}
        self.State.entries[group.kind] = entries
        for _, config in ipairs(group.items) do
            local entry = { status = "Locked", pending = false, current = config.previewValue or 0 }
            if group.kind == "online" and self.State.onlineMinutes >= config.minutes then
                entry.status = "Claimable"
            elseif group.kind == "signin" and config.day == self.State.signInDay then
                entry.status = "Claimable"
            elseif group.kind == "task" and config.target > 0 and entry.current >= config.target then
                entry.status = "Claimable"
            end
            if group.kind == "signin" and config.day == self.State.signInDay + 1 then
                entry.label = "Tomorrow"
            end
            entries[config.id] = entry
        end
    end
end

-- 模拟项目奖励配置查询，与游戏接入保持同一返回契约。
-- @param reward table 奖励类型、ID 和原始数量
-- @return table name 与模板图标类别
function CWelfarePreview:GetRewardDisplay(reward)
    local catalog = {
        Currency = {
            Gold = { name = "Coins", icon = "Coin" },
            Diamond = { name = "Diamonds", icon = "Gem" },
        },
        Item = {
            CommonEgg = { name = "Common Egg", icon = "Egg" },
            RareEgg = { name = "Rare Egg", icon = "Egg" },
        },
    }
    local group = catalog[reward.type]
    return assert(group and group[reward.id], "Missing simulated reward: " .. tostring(reward.id))
end

-- 只模拟领取；拒绝重复和待处理请求，失败后允许重试。
-- @param action string View 发出的动作
-- @param payload table kind 与 rewardId
function CWelfarePreview:OnUIAction(action, payload)
    assert(action == "Claim", "Unsupported welfare action: " .. action)
    local entries = self.State.entries[payload.kind]
    local entry = entries and entries[payload.rewardId]
    assert(entry, "Unknown reward ID: " .. tostring(payload.rewardId))
    if entry.status ~= "Claimable" or entry.pending then
        return
    end
    entry.pending, entry.error = true, nil
    self:RefreshUI()
    entry.pending = false
    if self.FailNextClaim then
        self.FailNextClaim = false
        entry.error = "Simulated request failure"
    else
        entry.status = "Claimed"
    end
    self:RefreshUI()
end

return CWelfarePreview
