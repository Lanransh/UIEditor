-- 在本文件源码前添加 local expectations = { ["节点ID"] = {dynamic=true, autoLocalize=false}, ... }
-- 根据节点用途和 View 填写，不从当前属性反推期望值；本脚本只读设计节点。
assert(type(expectations) == "table", "缺少文本职责清单 expectations")
local errors = {}
local seen = {}
local count = 0
local function fail(path, message)
    table.insert(errors, path .. ": " .. message)
end
local function visit(node, parentPath, blocked)
    local path = parentPath .. "/" .. node.name .. " [" .. node.id .. "]"
    local properties = node.properties
    local isText = node.className == "TextLabel" or node.className == "TextButton" or node.className == "TextBox"
    if isText then
        count += 1
        seen[node.id] = true
        local expected = expectations[node.id]
        if type(expected) ~= "table" or type(expected.dynamic) ~= "boolean" or type(expected.autoLocalize) ~= "boolean" then
            fail(path, "缺少有效职责声明 dynamic/autoLocalize")
        else
            if expected.dynamic and properties.Text ~= "" then
                fail(path, "动态文本必须保存 Text=空字符串")
            end
            if properties.AutoLocalize ~= expected.autoLocalize then
                fail(path, "AutoLocalize 应为 " .. tostring(expected.autoLocalize))
            end
            if expected.autoLocalize and blocked then
                fail(path, "祖先已关闭 AutoLocalize，当前节点的自动翻译被阻断")
            end
        end
    elseif properties.AutoLocalize == false then
        fail(path, "非文本节点关闭 AutoLocalize，可能阻断后代自动翻译")
    end
    for _, child in ipairs(ui.nodes.children(node.id)) do
        visit(child, path, blocked or properties.AutoLocalize == false)
    end
end
visit(ui.nodes.get(ui.root.id), "", false)
for id in pairs(expectations) do
    if not seen[id] then
        fail(tostring(id), "职责清单包含不存在或非文本节点")
    end
end
for _, message in ipairs(errors) do
    print("[失败] " .. message)
end
assert(#errors == 0, "文本验收失败：" .. #errors .. " 项，已检查 " .. count .. " 个文本节点")
print("文本属性验收通过：" .. count .. " 个文本节点；仍需运行态验收")
