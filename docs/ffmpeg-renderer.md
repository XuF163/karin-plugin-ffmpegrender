# karin-plugin-ffmpegrender

基于 `ffmpeg` 的图片渲染器（渲染 ID：`ffmpeg`），使用 `*.ffrender.json` 描述图层合成并输出图片 base64。

## 依赖

- 需要本机可用的 `ffmpeg` 可执行文件（PATH 或在插件配置中指定）。

## 配置

文件：`@karinjs/karin-plugin-ffmpegrender/config/config.json`

```json
{
  "ffmpegPath": "",
  "ffmpegFontFile": "",
  "ffmpegTimeoutMs": 30000,
  "ffmpegLogCommand": false
}
```

- `ffmpegPath`: `ffmpeg` 路径，为空则尝试使用 Karin 全局配置或系统 PATH。
- `ffmpegFontFile`: `drawtext` 字体文件路径（仅在使用 `text` 图层时需要），为空会自动探测常见字体。

## 使用

- 测试指令：`#ffmpeg渲染`
- 排版 demo：`#ffmpeg排版`
- 代码调用：

```ts
const img = await render.render({
  file: '/abs/path/to/template.ffrender.json',
  type: 'png',
  data: { file: '/abs/path/to/bg.png' }
}, 'ffmpeg')
```

## spec（v1）

示例：`resources/template/ffmpeg.ffrender.json`

- `width` / `height`: 画布尺寸
- `background.color`: 背景色（支持 `#RRGGBB` / `#RRGGBBAA`）
- `layers[]`：
  - `type: "image"`：`src`, `x`, `y`, `width`, `height`, `fit("fill"|"contain"|"cover")`, `opacity(0~1)`
  - `type: "text"`：`text`, `x`, `y`, `fontSize`, `color`, `fontFile`（可选，未填使用配置/自动探测），`box`
