# Roblox 特殊字符字体

`roblox-symbols.css` 内嵌 Roblox Studio 的 `content/fonts/RobloxEmoji.ttf`（原文件 1860 字节），来源为本机 Studio `version-4f087c32742644ab`。保留原始字体数据；不依赖用户安装 Studio，不请求网络资源。

字体归 Roblox 所有，仅用于本编辑器的 Roblox UI 预览。字体内包含 U+E000–U+E003；CSS 将使用范围限制在这些私用字符，普通文字使用[对应预览字体](roblox-fonts/README.md)。Robux 为 U+E002，可在 TextLabel、TextButton、TextBox 的 Text 中与价格混排，也可由运行脚本通过 `utf8.char(0xE002)` 设置。

文档与导入包保存原始 Unicode 文本，不替换为图片或 HTML。最终字形与排版仍需在 Roblox 确认。
