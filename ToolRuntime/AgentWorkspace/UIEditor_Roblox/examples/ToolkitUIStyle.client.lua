-- Stud material plus ClaimBtn-style edge lighting; preserve the target's base color and layout.
local function apply(selection, template)
    local target = #selection == 1 and selection[1] or nil
    if not target or not target:IsA("GuiObject") then
        error("请先选中一个 UI 节点。", 0)
    end
    if target:GetAttribute("ToolkitStudEffect") then
        error("请选择要添加效果的 UI，不要选择 Stud 效果层。", 0)
    end
    local existing = nil
    for _, child in ipairs(target:GetChildren()) do
        if child:IsA("UIGridStyleLayout") then
            error("该容器有自动布局，请选择其中的背景 UI 添加效果。", 0)
        end
        if child.Name == "StudTextureImg" then
            if existing or not child:IsA("ImageLabel") or not child:GetAttribute("ToolkitStudEffect") then
                error("StudTextureImg 名称冲突，请先处理同名节点。", 0)
            end
            existing = child
        end
    end
    if not template.Image:match("^rbxassetid://[1-9]%d*$") then
        error("Stud 贴图资源尚未配置，请更新 Toolkit 插件。", 0)
    end
    local overlay = existing or template:Clone()
    if existing then
        -- Migrate the first release's 32px rounded studs without resetting custom sizes.
        if existing.Image == "rbxassetid://116220570710499" and existing.TileSize == UDim2.fromOffset(32, 32) then
            existing.TileSize = template.TileSize
        end
        existing.Image = template.Image
    end
    overlay.Name = "StudTextureImg"
    overlay:SetAttribute("ToolkitStudEffect", true)
    overlay.ZIndex = target.ZIndex
    overlay.ImageTransparency = script:GetAttribute("Stud") ~= false and 0 or 1
    local corner = target:FindFirstChildOfClass("UICorner")
    if not corner then
        corner = Instance.new("UICorner")
        corner.CornerRadius = UDim.new(0, 6)
        corner.Parent = target
    end
    local overlayCorner = overlay:FindFirstChildOfClass("UICorner") or Instance.new("UICorner")
    overlayCorner.CornerRadius = corner.CornerRadius
    overlayCorner.Parent = overlay

    local oldBorder = overlay:FindFirstChildOfClass("UIStroke")
    if oldBorder then oldBorder:Destroy() end
    -- A child overlay's outer stroke is clipped by the target's ClipsDescendants.
    local border = target:FindFirstChild("ToolkitUIStyleStroke") or Instance.new("UIStroke")
    border.Name = "ToolkitUIStyleStroke"
    border.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
    border.Color = Color3.new(0, 0, 0)
    border.Thickness = 3
    border.Transparency = 0
    border.Enabled = script:GetAttribute("Stroke") ~= false
    border.Parent = target

    local bevel = overlay:FindFirstChild("StudBevel") or Instance.new("Frame")
    bevel.Name = "StudBevel"
    bevel.BackgroundColor3 = Color3.new(1, 1, 1)
    bevel.BackgroundTransparency = 0
    bevel.BorderSizePixel = 0
    bevel.Size = UDim2.fromScale(1, 1)
    bevel.Active = false
    bevel.Selectable = false
    bevel.ZIndex = overlay.ZIndex
    bevel:SetAttribute("ToolkitStudEffect", true)
    local bevelCorner = bevel:FindFirstChildOfClass("UICorner") or Instance.new("UICorner")
    bevelCorner.CornerRadius = corner.CornerRadius
    bevelCorner.Parent = bevel
    local gradient = bevel:FindFirstChildOfClass("UIGradient") or Instance.new("UIGradient")
    -- Like the imported background, edge widths scale with subsequent resizing.
    local height = math.max(8, target.AbsoluteSize.Y > 0 and target.AbsoluteSize.Y or target.Size.Y.Offset)
    local top, bottomStart, bottomSolid = 2 / height, 1 - 4 / height, 1 - 3 / height
    local dark = target.BackgroundColor3:Lerp(Color3.new(0, 0, 0), 0.62)
    local bottomShadow = script:GetAttribute("BottomShadow") ~= false
    gradient.Rotation = 90
    gradient.Color = ColorSequence.new({
        ColorSequenceKeypoint.new(0, Color3.new(1, 1, 1)),
        ColorSequenceKeypoint.new(top, Color3.new(1, 1, 1)),
        ColorSequenceKeypoint.new(bottomStart, dark),
        ColorSequenceKeypoint.new(1, dark),
    })
    gradient.Transparency = NumberSequence.new({
        NumberSequenceKeypoint.new(0, 0.58),
        NumberSequenceKeypoint.new(top, 1),
        NumberSequenceKeypoint.new(bottomStart, 1),
        NumberSequenceKeypoint.new(bottomSolid, bottomShadow and 0.28 or 1),
        NumberSequenceKeypoint.new(1, bottomShadow and 0.2 or 1),
    })
    gradient.Parent = bevel
    bevel.Parent = overlay
    overlay.Parent = target
    return overlay
end

local target = script.Parent
if not target or not target:IsA("GuiObject") then return end
local template = Instance.new("ImageLabel")
template.Image = "rbxassetid://82793028306773"
template.BackgroundTransparency = 1
template.BorderSizePixel = 0
template.Size = UDim2.fromScale(1, 1)
template.ScaleType = Enum.ScaleType.Tile
template.TileSize = UDim2.fromOffset(27, 27)
local originalCorner = target:FindFirstChildOfClass("UICorner")
local corner = originalCorner or Instance.new("UICorner")
if not originalCorner then
    corner.CornerRadius = UDim.new(0, 6)
    corner.Parent = target
end
local roundedRadius = corner.CornerRadius
local appliedRadius = roundedRadius
local overlay
local connections = {}
local refreshing = false
local function refresh()
    if refreshing then return end
    -- Other signals may run before a queued CornerRadius change notification.
    if corner.CornerRadius ~= appliedRadius then
        roundedRadius = corner.CornerRadius
    end
    refreshing = true
    appliedRadius = script:GetAttribute("Rounded") ~= false and roundedRadius or UDim.new(0, 0)
    corner.CornerRadius = appliedRadius
    overlay = apply({target}, template)
    refreshing = false
end
refresh()
local border = target:FindFirstChild("ToolkitUIStyleStroke")
for _, property in ipairs({"AbsoluteSize", "BackgroundColor3", "ZIndex"}) do
    table.insert(connections, target:GetPropertyChangedSignal(property):Connect(refresh))
end
table.insert(connections, corner:GetPropertyChangedSignal("CornerRadius"):Connect(function()
    if refreshing or corner.CornerRadius == appliedRadius then return end
    roundedRadius = corner.CornerRadius
    refresh()
end))
for _, attribute in ipairs({"Rounded", "Stroke", "Stud", "BottomShadow"}) do
    table.insert(connections, script:GetAttributeChangedSignal(attribute):Connect(refresh))
end
script.Destroying:Once(function()
    for _, connection in ipairs(connections) do connection:Disconnect() end
    overlay:Destroy()
    border:Destroy()
    if originalCorner then corner.CornerRadius = roundedRadius else corner:Destroy() end
    template:Destroy()
end)
