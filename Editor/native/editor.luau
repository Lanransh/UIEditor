-- App-owned authoring host. Shared value constructors are prepended by Electron.
local document, definitions, ids, ui
local nextId = 0
local logs, operations = {}, 0
local function log(kind, ...)
    assert(#logs < 200, "Authoring log limit exceeded")
    local parts = {}
    for i = 1, select("#", ...) do parts[i] = tostring(select(i, ...)) end
    table.insert(logs, { kind = kind, message = table.concat(parts, "\t") })
end
local function changed()
    operations += 1
    assert(operations <= 5000, "Authoring operation limit exceeded")
end
local function newId()
    nextId += 1
    return assert(ids[nextId], "Node creation limit exceeded")
end
local function get(id, node, parent)
    node = node or document.root
    if node.id == id then return node, parent end
    for _, child in ipairs(node.children) do
        local found, owner = get(id, child, node)
        if found then return found, owner end
    end
end
local function required(id)
    local node, parent = get(id)
    assert(node, "Unknown node ID: " .. tostring(id))
    return node, parent
end
local function snapshot(node)
    local result = clone(node)
    local _, parent = get(node.id)
    result.parentId = parent and parent.id or JSONNull
    return result
end
local nodes, scripts = {}, {}
function nodes.get(id) return snapshot(required(id)) end
function nodes.children(id)
    local result = {}
    for _, node in ipairs(required(id).children) do table.insert(result, snapshot(node)) end
    return result
end
function nodes.find(options)
    options = options or {}
    assert(options.match == nil or options.match == "exact" or options.match == "contains", "Invalid match")
    assert(options.name == nil or type(options.name) == "string", "Invalid name")
    assert(options.className == nil or type(options.className) == "string", "Invalid className")
    assert(options.recursive == nil or type(options.recursive) == "boolean", "Invalid recursive")
    local result = {}
    local function visit(node, include)
        if include and (options.name == nil or (options.match == "contains" and string.find(node.name, options.name, 1, true)) or node.name == options.name)
            and (options.className == nil or node.className == options.className) then table.insert(result, snapshot(node)) end
        if options.recursive ~= false or not include then
            for _, child in ipairs(node.children) do visit(child, true) end
        end
    end
    visit(options.parentId and required(options.parentId) or document.root, options.parentId == nil and options.recursive ~= false)
    local offset, limit = options.offset or 0, options.limit or 50
    assert(type(offset) == "number" and offset >= 0 and offset <= 5000 and offset % 1 == 0, "Invalid offset")
    assert(type(limit) == "number" and limit >= 1 and limit <= 200 and limit % 1 == 0, "Invalid limit")
    local page = {}
    for i = offset + 1, math.min(#result, offset + limit) do table.insert(page, result[i]) end
    return { nodes = page, total = #result, nextOffset = offset + limit < #result and offset + limit or JSONNull }
end
function nodes.setProperties(id, properties)
    local node = required(id)
    assert(type(properties) == "table", "Expected properties table")
    for key, item in pairs(properties) do
        local definition = assert(definitions[node.className].properties[key], "Unsupported property: " .. key)
        if definition.kind == "enum" and valueTypes[item] then assert(valueTypes[item] == "EnumItem" and item.EnumType == key, "Wrong enum type") end
        local kind = valueTypes[item]
        if kind and definition.kind ~= "enum" then
            local expected = ({ udim = "UDim", udim2 = "UDim2", vector = "Vector2", color = "Color3" })[definition.kind]
            assert(kind == expected, "Wrong value type: " .. key)
        end
        node.properties[key] = clone(encode(item))
    end
    changed()
end
function nodes.create(className, options)
    options = options or {}
    local definition = assert(definitions[className], "Unsupported node type")
    assert(definition.category ~= "root", "Cannot create another root")
    local parent = required(options.parentId or document.root.id)
    local node = { id = newId(), name = options.name or className, className = className, properties = {}, children = {} }
    for key, property in pairs(definition.properties) do node.properties[key] = clone(property.value) end
    table.insert(parent.children, node)
    if options.properties then nodes.setProperties(node.id, options.properties) end
    changed()
    return snapshot(node)
end
function nodes.rename(id, name) required(id).name = name; changed() end
local function detach(node, parent)
    assert(parent, "Cannot remove or move root")
    for i, child in ipairs(parent.children) do if child == node then table.remove(parent.children, i); return end end
end
function nodes.remove(id)
    local node, parent = required(id)
    detach(node, parent); changed()
end
function nodes.reparent(id, parentId)
    local node, parent = required(id)
    local owner = required(parentId)
    assert(not get(parentId, node), "Hierarchy cycle")
    detach(node, parent); table.insert(owner.children, node); changed()
end
function nodes.duplicate(id, parentId)
    local node, parent = required(id)
    assert(parent, "Cannot duplicate root")
    local copied = clone(node)
    local function assign(node)
        node.id = newId()
        for _, child in ipairs(node.children) do assign(child) end
    end
    assign(copied)
    copied.name ..= " 副本"
    table.insert((parentId and required(parentId) or parent).children, copied)
    changed(); return snapshot(copied)
end
function scripts.get(kind)
    assert(kind == "source" or kind == "integration", "Expected source or integration")
    return document.scripts[kind]
end
function scripts.set(kind, source)
    assert(kind == "source" or kind == "integration", "Expected source or integration")
    assert(type(source) == "string" and #source <= 1048576, "Invalid script source")
    document.scripts[kind] = source; changed()
end
local host = {}
host.print = function(...) log("output", ...) end
host.warn = function(...) log("warning", ...) end
function host.initialize(input)
    document, definitions, ids = input.document, input.definitions, input.ids
    for _, definition in pairs(definitions) do
        for key, property in pairs(definition.properties) do
            if property.kind == "enum" and not Enum[key] then
                local items = {}
                for _, name in ipairs(property.choices) do items[name] = value("EnumItem", { Name = name, EnumType = key }) end
                Enum[key] = table.freeze(items)
            end
        end
    end
    ui = table.freeze({ projectType = input.projectType, capabilities = input.capabilities, root = table.freeze({ id = document.root.id }), nodes = table.freeze(nodes), scripts = table.freeze(scripts) })
    host.globals = { ui = ui, UDim = table.freeze(UDim), UDim2 = table.freeze(UDim2), Vector2 = table.freeze(Vector2), Color3 = table.freeze(Color3), Enum = table.freeze(Enum), typeof = function(item) return valueTypes[item] or type(item) end }
    return true
end
function host.output() return { document = document, operations = {}, disabled = {}, logs = logs, operationCount = operations } end
return host
