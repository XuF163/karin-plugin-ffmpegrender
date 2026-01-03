import path from 'node:path'

import { dir } from '@/dir'
import { karin, render, segment, logger } from 'node-karin'

/**
 * ffmpeg 排版 demo
 * 触发指令: #ffmpeg排版
 */
export const ffmpegCardDemo = karin.command(/^#?ffmpeg排版$/, async (e) => {
  try {
    const spec = path.join(dir.pluginDir, 'resources', 'template', 'ffmpeg.card.ffrender.json')
    const bg = path.join(dir.pluginDir, 'resources', 'image', '启程宣发.png')

    const now = new Date()
    const footer = `user: ${e.user_id} · ${now.toLocaleString('zh-CN', { hour12: false })}`

    const img = await render.render({
      name: 'ffmpegrender',
      file: spec,
      type: 'png',
      data: {
        file: bg,
        title: 'Karin FFmpeg 渲染',
        subtitle: '图片 + 文字 + 简易排版',
        tag: 'render id: ffmpeg',
        desc: 'spec(JSON) → filter_complex → base64\n支持：cover/contain、透明背景、文字框',
        footer,
      },
    }, 'ffmpeg') as string

    await e.reply(segment.image(`base64://${img}`))
    return true
  } catch (error) {
    logger.error(error)
    await e.reply(String((error as Error)?.message || error))
    return true
  }
}, {
  name: 'ffmpeg排版demo',
  priority: 9999,
  log: true,
  permission: 'all',
})
