-- Trusted host; user chunks receive only their class and sandboxed standard library.
local valueTypes = setmetatable({}, { __mode = "k" })
local function value(kind, fields)
    valueTypes[fields] = kind
    return table.freeze(fields)
end
local function number(input)
    assert(type(input) == "number" and input == input and math.abs(input) < math.huge, "Expected finite number")
    return input
end
local UDim, UDim2, Vector2, Color3, Enum = {}, {}, {}, {}, {}
function UDim.new(scale, offset) return value("UDim", { Scale = number(scale or 0), Offset = number(offset or 0) }) end
function UDim2.new(xs, xo, ys, yo)
    local x, y
    if valueTypes[xs] == "UDim" then
        assert(valueTypes[xo] == "UDim", "Expected two UDim values")
        x, y = xs, xo
    else x, y = UDim.new(xs, xo), UDim.new(ys, yo) end
    return value("UDim2", { X = x, Y = y, Width = x, Height = y })
end
function UDim2.fromScale(x, y) return UDim2.new(x, 0, y, 0) end
function UDim2.fromOffset(x, y) return UDim2.new(0, x, 0, y) end
function Vector2.new(x, y) return value("Vector2", { X = number(x or 0), Y = number(y or 0) }) end
function Color3.new(r, g, b) return value("Color3", { R = number(r or 0), G = number(g or 0), B = number(b or 0) }) end
function Color3.fromRGB(r, g, b) return Color3.new(number(r or 0) / 255, number(g or 0) / 255, number(b or 0) / 255) end
function Color3.fromHex(hex)
    assert(type(hex) == "string", "Expected hex color")
    hex = string.gsub(hex, "^#", "")
    assert(#hex == 6 and string.match(hex, "^%x+$"), "Expected six-digit hex color")
    return Color3.fromRGB(tonumber(string.sub(hex, 1, 2), 16), tonumber(string.sub(hex, 3, 4), 16), tonumber(string.sub(hex, 5, 6), 16))
end
local function encode(input)
    local kind = valueTypes[input]
    if kind == "UDim" then return { scale = input.Scale, offset = input.Offset }
    elseif kind == "UDim2" then return { x = encode(input.X), y = encode(input.Y) }
    elseif kind == "Vector2" then return { x = input.X, y = input.Y }
    elseif kind == "Color3" then
        local function byte(channel) return math.floor(math.clamp(channel, 0, 1) * 255 + 0.5) end
        return string.format("#%02x%02x%02x", byte(input.R), byte(input.G), byte(input.B))
    elseif kind == "EnumItem" then return input.Name end
    return input
end
local function decode(input, definition, property)
    if definition.kind == "udim" then return UDim.new(input.scale, input.offset)
    elseif definition.kind == "udim2" then return UDim2.new(input.x.scale, input.x.offset, input.y.scale, input.y.offset)
    elseif definition.kind == "vector" then return Vector2.new(input.x, input.y)
    elseif definition.kind == "color" then return Color3.fromHex(input)
    elseif definition.kind == "enum" then return Enum[property][input] end
    return input
end
local clone = function(value) return value end
clone = function(value)
    if type(value) ~= "table" or valueTypes[value] then return value end
    local result = {}
    for key, item in pairs(value) do result[key] = clone(item) end
    return result
end
local Base = {}
local Class = setmetatable({}, table.freeze({ __index = Base }))
local Preview = setmetatable({}, table.freeze({ __index = Class }))
local nodes, refs, config, state, instance
local handlers, disabled = {}, {}
local operations, logs = {}, {}
local rendering = false
local function nodeFor(ref)
    local id = refs[ref]
    assert(id and nodes[id], "Unknown node reference: " .. tostring(ref))
    return nodes[id], id
end
local API = {}
function API:Get(ref, property)
    local node = nodeFor(ref)
    assert(node.properties[property] ~= nil, "Unsupported property: " .. property)
    return decode(clone(node.properties[property]), node.definitions[property], property)
end
function API:Set(ref, property, value)
    local node, id = nodeFor(ref)
    assert(node.properties[property] ~= nil, "Unsupported property: " .. property)
    if valueTypes[value] then
        local expected = ({ udim = "UDim", udim2 = "UDim2", vector = "Vector2", color = "Color3", enum = "EnumItem" })[node.definitions[property].kind]
        assert(valueTypes[value] == expected, "Wrong Roblox value type for " .. property)
        if expected == "EnumItem" then assert(value.EnumType == property, "Wrong enum type for " .. property) end
        value = encode(value)
    end
    node.properties[property] = clone(value)
    table.insert(operations, { node = id, property = property, value = clone(value) })
end
function API:On(ref, event, callback)
    local node, id = nodeFor(ref)
    assert(event == "Activated" and (node.className == "TextButton" or node.className == "ImageButton"), "Only button Activated is supported")
    assert(type(callback) == "function", "Expected callback")
    local connection = { Connected = true }
    function connection:Disconnect() self.Connected = false end
    handlers[id] = handlers[id] or {}
    table.insert(handlers[id], { callback = callback, connection = connection })
    return connection
end
function API:SetEnabled(ref, enabled)
    local node, id = nodeFor(ref)
    assert(node.className == "TextButton" or node.className == "ImageButton", "SetEnabled requires a button")
    assert(type(enabled) == "boolean", "Expected boolean")
    disabled[id] = not enabled
end
function Base:GetUIConfig() return self.Config end
function Base:GetUIState() return self.State end
function Base:BindUIData() self:RefreshUI() end
function Base:OnUIAction(action, payload) end
function Base:EmitUIAction(action, payload)
    assert(type(action) == "string" and #action > 0, "Expected action name")
    table.insert(logs, { kind = "action", message = action, payload = payload })
    self:OnUIAction(action, payload)
end
function Base:RefreshUI()
    assert(not rendering, "Recursive RefreshUI is not allowed")
    rendering = true
    if self.Render then self:Render(self:GetUIState()) end
    rendering = false
end
table.freeze(API)
table.freeze(Base)
local host = {}
function host.initialize(input)
    for property, choices in pairs(input.enums) do
        local items = {}
        for _, name in ipairs(choices) do items[name] = value("EnumItem", { Name = name, EnumType = property }) end
        Enum[property] = table.freeze(items)
    end
    table.freeze(Enum)
end
local function freeze(input)
    if type(input) ~= "table" or table.isfrozen(input) then return end
    for _, item in pairs(input) do freeze(item) end
    table.freeze(input)
end
function host.configure(settings)
    config = settings
    freeze(config)
    local function serialize(input)
        if valueTypes[input] then return encode(input) end
        if type(input) ~= "table" then return input end
        local result = {}
        for key, item in pairs(input) do result[key] = serialize(item) end
        return result
    end
    return serialize(settings)
end
function host.prepare(input)
    nodes, refs, state = input.nodes, input.references, input.state
    freeze(state)
    return Class
end
function host.start()
    for name, method in pairs(Class) do
        assert(({ OnMount = true, Render = true, OnShow = true, OnHide = true, OnDispose = true })[name] and type(method) == "function", "Unsupported or reserved class method: " .. tostring(name))
    end
    table.freeze(Class)
    for name, method in pairs(Preview) do
        assert(({ GetUIConfig = true, GetUIState = true, BindUIData = true, OnUIAction = true })[name] and type(method) == "function", "Unsupported or reserved preview method: " .. tostring(name))
    end
    table.freeze(Preview)
    instance = setmetatable({ UI = API, Config = config, State = state }, { __index = Preview })
    if instance.OnMount then instance:OnMount() end
    instance:BindUIData()
    if instance.OnShow then instance:OnShow() end
end
function host.command(input)
    if input.type == "state" then
        state = input.state
        instance.State = state
        instance:RefreshUI()
    elseif input.type == "event" and not disabled[input.node] then
        for _, handler in ipairs(handlers[input.node] or {}) do
            if handler.connection.Connected then handler.callback() end
        end
    end
end
function host.preview() return Preview end
function host.dispose()
    if instance then
        if instance.OnHide then instance:OnHide() end
        if instance.OnDispose then instance:OnDispose() end
    end
    handlers = {}
end
function host.output()
    local ids = {}
    for id, value in pairs(disabled) do if value then table.insert(ids, id) end end
    local result = { operations = operations, disabled = ids, logs = logs }
    operations, logs = {}, {}
    return result
end
-- Print is a host-owned closure, not stdout; messages remain framed JSON.
function host.print(...)
    local parts = {}
    for index = 1, select("#", ...) do parts[index] = tostring(select(index, ...)) end
    table.insert(logs, { kind = "output", message = table.concat(parts, "\t") })
end
function host.warn(...)
    host.print(...)
    logs[#logs].kind = "warning"
end
host.globals = table.freeze({
    UDim = table.freeze(UDim), UDim2 = table.freeze(UDim2), Vector2 = table.freeze(Vector2),
    Color3 = table.freeze(Color3), Enum = Enum,
    typeof = function(input) return valueTypes[input] or type(input) end,
})
return host
