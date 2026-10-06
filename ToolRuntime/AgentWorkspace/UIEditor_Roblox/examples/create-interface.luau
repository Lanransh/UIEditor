-- On a new OnlineReward document. Use current session/revision in uie.code.execute.
ui.nodes.rename(ui.root.id, "OnlineRewardUI")
for index, spec in ipairs({
    { "TextLabel", "StatusText" },
    { "TextButton", "ClaimButton" },
}) do
    ui.nodes.create(spec[1], {
        name = spec[2],
        properties = {
            Position = UDim2.fromOffset(440, 180 + index * 100),
            Size = UDim2.fromOffset(400, 70),
        },
    })
end
-- Write the other example files through ui.scripts.set("source"/"integration", text).
