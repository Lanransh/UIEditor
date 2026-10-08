-- 在 VM 外读取 PNG，将 StudAssets 注入本源码开头；不在 Luau 中读取磁盘。
-- 在空白 StudDailyLogin 文档中，使用当前 sessionId/revision 执行。
assert(#ui.nodes.children(ui.root.id) == 0, "Use a new empty interface")
ui.nodes.rename(ui.root.id, "StudDailyLoginUI")

-- 创建可编辑的基础设计节点。
-- @param className string 真实 Roblox 节点类型
-- @param name string 稳定节点名称
-- @param parent string 父节点 ID
-- @param x number 左侧偏移像素
-- @param y number 顶部偏移像素
-- @param w number 宽度像素
-- @param h number 高度像素
-- @param color string? 底板或描边颜色
-- @return table 新建的设计节点
local function node(className, name, parent, x, y, w, h, color)
    return ui.nodes.create(className, {
        name = name,
        parentId = parent,
        properties = {
            Position = UDim2.fromOffset(x, y),
            Size = UDim2.fromOffset(w, h),
            BackgroundColor3 = Color3.fromHex(color or "#ffffff"),
            BackgroundTransparency = color and 0 or 1,
        },
    })
end
-- 将圆角与描边保存为辅助组件。
-- @param n table 目标设计节点
-- @param radius number 圆角半径像素
-- @param thickness number 描边粗细像素
-- @param color string? 底板或描边颜色
local function shape(n, radius, thickness, color)
    ui.nodes.create("UICorner", {name = "UICorner", parentId = n.id, properties = {CornerRadius = UDim.new(0, radius)}})
    ui.nodes.create("UIStroke", {name = "UIStroke", parentId = n.id, properties = {Thickness = thickness, Color = Color3.fromHex(color or "#000000")}})
end
-- 创建可编辑文字，按需要增加文字描边。
-- @param name string 稳定节点名称
-- @param parent string 父节点 ID
-- @param x number 左侧偏移像素
-- @param y number 顶部偏移像素
-- @param w number 宽度像素
-- @param h number 高度像素
-- @param value string 显示文字
-- @param size number 字号
-- @param color string? 底板或描边颜色
-- @param align string? 文字对齐方式
-- @param outline boolean? 是否添加文字描边
-- @return table 新建的设计节点
local function text(name, parent, x, y, w, h, value, size, color, align, outline)
    local t = node("TextLabel", name, parent, x, y, w, h)
    ui.nodes.setProperties(t.id, {Text = value, TextSize = size, TextColor3 = Color3.fromHex(color or "#172719"), Font = Enum.Font.GothamBold, TextXAlignment = align or "Center", ZIndex = 4})
    if outline then
        ui.nodes.create("UIStroke", {name = "UIStroke", parentId = t.id, properties = {Thickness = 1, Color = Color3.fromHex("#000000")}})
    end
    return t
end
-- 嵌入本地透明图像，保留独立图标节点。
-- @param name string 稳定节点名称
-- @param parent string 父节点 ID
-- @param x number 左侧偏移像素
-- @param y number 顶部偏移像素
-- @param w number 宽度像素
-- @param h number 高度像素
-- @param asset string StudAssets 中的图像键
-- @return table 新建的设计节点
local function image(name, parent, x, y, w, h, asset)
    local n = node("ImageLabel", name, parent, x, y, w, h)
    ui.nodes.setPreviewImage(n.id, StudAssets[asset])
    ui.nodes.setProperties(n.id, {ScaleType = Enum.ScaleType.Stretch, ZIndex = 3})
    return n
end
-- 用单张小图平铺 Stud，避免逐凸点创建节点。
-- @param parent string 父节点 ID
-- @param w number 宽度像素
-- @param h number 高度像素
-- @param transparency number 纹理透明度
-- @param radius number 圆角半径像素
local function stud(parent, w, h, transparency, radius)
    local n = image("StudTextureImg", parent, 0, 0, w, h, "StudTile")
    ui.nodes.setProperties(n.id, {ScaleType = Enum.ScaleType.Tile, TileSize = UDim2.fromOffset(27, 27), Image = "rbxassetid://82793028306773", ImageTransparency = transparency, ZIndex = 1})
    ui.nodes.create("UICorner", {name = "UICorner", parentId = n.id, properties = {CornerRadius = UDim.new(0, radius)}})
end
-- 用内部节点保存表面高光和底部压边。
-- @param parent string 父节点 ID
-- @param w number 宽度像素
-- @param h number 高度像素
-- @param color string? 底板或描边颜色
local function edges(parent, w, h, color)
    local high = node("Frame", "TopHighlightImg", parent, 0, 0, w, 2, "#ffffff")
    ui.nodes.setProperties(high.id, {BackgroundTransparency = .58, ZIndex = 2})
    local low = node("Frame", "BottomEdgeImg", parent, 0, h - 4, w, 4, color)
    ui.nodes.setProperties(low.id, {BackgroundTransparency = .2, ZIndex = 2})
end
-- 组合可编辑按钮表面与文字。
-- @param name string 稳定节点名称
-- @param parent string 父节点 ID
-- @param x number 左侧偏移像素
-- @param y number 顶部偏移像素
-- @param w number 宽度像素
-- @param h number 高度像素
-- @param value string 显示文字
-- @param color string? 底板或描边颜色
-- @param size number 字号
-- @return table 新建的设计节点
local function button(name, parent, x, y, w, h, value, color, size)
    local n = node("ImageButton", name, parent, x, y, w, h, color)
    ui.nodes.setPreviewImage(n.id, StudAssets.StudTile)
    ui.nodes.setProperties(n.id, {ScaleType = Enum.ScaleType.Tile, TileSize = UDim2.fromOffset(27, 27), Image = "rbxassetid://82793028306773", ClipsDescendants = true, ZIndex = 3})
    shape(n, 6, 3)
    edges(n.id, w, h, "#225a07")
    text("CaptionTxt", n.id, 0, 0, w, h, value, size, "#ffffff", nil, true)
    return n
end

node("Frame", "CanvasBgImg", ui.root.id, 0, 0, 1280, 720, "#ffffff")
local box = node("Frame", "WelfareBox", ui.root.id, 0, 0, 1280, 720)
local panel = node("Frame", "PopupPanelImg", box.id, 250, 170, 920, 450, "#4d4d4d")
shape(panel, 2, 2)
local title = node("Frame", "TitleImg", box.id, 250, 100, 920, 70, "#85d84a")
ui.nodes.setProperties(title.id, {ClipsDescendants = true, ZIndex = 3})
shape(title, 2, 3)
stud(title.id, 920, 70, 0, 2)
edges(title.id, 920, 70, "#1f0004")
text("TitleTxt", title.id, 24, 0, 220, 70, "Rewards", 32, "#ffffff", "Left", true)
text("SubtitleTxt", title.id, 280, 0, 480, 70, "Play Every Day, Earn More Rewards", 22, "#ffffff", "Left", true)
local closeSurface = node("Frame", "CloseSurfaceImg", title.id, 858, 9, 52, 52, "#f54b6c")
ui.nodes.setProperties(closeSurface.id, {ZIndex = 5})
shape(closeSurface, 6, 3)
local close = node("TextButton", "CloseBtn", closeSurface.id, 0, 0, 52, 52)
ui.nodes.setProperties(close.id, {Text = "", ZIndex = 5})
text("CloseIconTxt", close.id, 0, - 2, 52, 52, "×", 52, "#ffffff", nil, true)

local nav = node("Frame", "NavigationBox", box.id, 82, 185, 146, 202)
for i, spec in ipairs({{"TaskTabBtn", "Tasks", 18}, {"OnlineTabBtn", "Online Rewards", 16}, {"SignInTabBtn", "Daily Login", 18}}) do
    button(spec[1], nav.id, 0, (i - 1) * 72, 146, 58, spec[2], i == 3 and "#278ce9" or "#546a84", spec[3])
end
text("PageTitleTxt", panel.id, 24, 12, 380, 36, "Daily Login · Day 1", 24, "#ffffff", "Left")
text("HintTxt", panel.id, 500, 12, 396, 36, "Check in once per day", 18, "#ffffff", "Right")

local rewards = {"Coins ×100", "Coins ×200", "Common Egg ×1", "Diamonds ×50", "Coins ×500", "Diamonds ×100", "Rare Pet Egg\n×1"}
for i = 1, 7 do
    local x = i == 7 and 696 or 24 + ((i - 1) % 3) * 224
    local y = (i <= 3 or i == 7) and 64 or 254
    local h = i == 7 and 360 or 170
    local card = node("Frame", "Day" .. i .. "RewardImg", panel.id, x, y, 200, h, i == 1 and "#eff9d9" or i == 7 and "#fff5d9" or "#e9f0f4")
    shape(card, 4, 2, "#172719")
    stud(card.id, 200, h, i == 7 and .88 or .72, 4)
    if i == 7 then
        local header = node("Frame", "DayHeaderImg", card.id, 0, 0, 200, 54, "#ffd36a")
        text("DayTxt", header.id, 10, 8, 180, 38, "Day 7", 24)
        text("WeeklyRewardTxt", card.id, 12, 62, 176, 26, "Weekly Reward", 16, "#806122")
        image("EggIconImg", card.id, 65, 104, 70, 86, "RareEgg")
        image("EggSpotImg", card.id, 90, 133, 20, 26, "EggSpot")
        text("RewardTxt", card.id, 8, 206, 184, 64, rewards[i], 20)
    else
        text("DayTxt", card.id, 12, 4, 176, 30, "Day " .. i, 20)
        if i == 3 then
            image("EggIconImg", card.id, 82, 39, 36, 44, "CommonEgg")
        elseif i == 4 or i == 6 then
            image("DiamondIconImg", card.id, 77.76, 39, 44.48, 46.912, "Diamond")
            image("DiamondFacetImg", card.id, 79, 39.6, 42, 44.532, "DiamondFacet")
        else
            image("CoinImg", card.id, 79, 40, 42, 42, "Coin")
            text("CoinMarkTxt", card.id, 79, 40, 42, 42, "G", 18, "#754c14")
        end
        text("RewardTxt", card.id, 8, 86, 184, 30, rewards[i], 18)
    end
    button("ClaimBtn", card.id, 14, i == 7 and 308 or 124, 172, 36, i == 1 and "Check In" or i == 2 and "Tomorrow" or "Locked", i == 1 and "#67ed14" or "#809389", 22)
end
print("StudDailyLoginUI: editable cards, native text, 27px original Stud tile")
