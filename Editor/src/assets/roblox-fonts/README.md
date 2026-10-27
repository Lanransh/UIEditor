# Roblox 预览字体

原始字体取自本机 Roblox Studio `version-145f189a6a974303/content/fonts`，随 App
离线打包。文件未修改，内部版权与许可证字段保持原样：

- Montserrat Regular/Bold：Copyright 2011 The Montserrat Project Authors。
- Source Sans Pro Regular：Copyright 2010, 2012, 2014 Adobe Systems Incorporated，
  Reserved Font Name “Source”。
- Arimo Regular：Copyright 2020 The Arimo Project Authors。

均按 SIL Open Font License 1.1 分发，完整版权与许可证随 App 分发，见
[roblox-fonts.txt](../../../public/licenses/roblox-fonts.txt)。

编辑器支持的 Font 枚举映射：Gotham → Montserrat Regular，GothamBold →
Montserrat Bold，SourceSans → Source Sans Pro，Arial → Arimo。
[Roblox Font 官方文档](https://create.roblox.com/docs/reference/engine/enums/Font)
确认旧 Gotham 系列已映射到 Montserrat。CSS 别名避免依赖系统安装的字体版本。
Roblox TextSize 对应 ascent 到 descent 的行高，CSS font-size 对应 unitsPerEm。
fonts.css 使用 size-adjust 按 hhea 的 unitsPerEm/(ascent-descent) 归一化：
Montserrat 为 1000/1219，Source Sans Pro 为 1000/1257，Arimo 为 2048/2288。
文档字号和导出值不加补偿系数；CSS 行高保持 TextSize。原生字距取整与浏览器仍有差异。
这些文件不覆盖中文；中文继续使用系统备用字体，不能据此宣称中英混排逐像素一致。
