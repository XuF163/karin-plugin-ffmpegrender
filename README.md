# karin-plugin-ffmpegrender

基于 `ffmpeg` 的 Karin 图片渲染器（渲染 ID：`ffmpeg`），通过 `*.ffrender.json` 描述图层合成并输出图片 base64。

## 功能

- 图片渲染：本地图片 / http 图片 → base64
- 轻量排版：图片 + 文字（`drawtext`）+ 简单布局
- 模板渲染：支持 `renderTpl`（`data` 注入），模板渲染后会生成到 `@karinjs/temp/html/...`

## 依赖

- 需要可用的 `ffmpeg`（PATH 或配置 `ffmpegPath`）
- 如需文字渲染，建议配置 `ffmpegFontFile`（或使用自动探测的系统字体）

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

## Demo 指令

- `#ffmpeg渲染`：基础示例（`resources/template/ffmpeg.ffrender.json`）
- `#ffmpeg排版`：图片 + 文字 + 简易排版（`resources/template/ffmpeg.card.ffrender.json`）

## 代码调用

```ts
const img = await render.render({
  file: '/abs/path/to/template.ffrender.json',
  type: 'png',
  data: { file: '/abs/path/to/bg.png' }
}, 'ffmpeg')
```

更多说明见：`docs/ffmpeg-renderer.md`

