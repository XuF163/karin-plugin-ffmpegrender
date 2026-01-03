import path from 'node:path'

import { dir } from '@/dir'
import { karin, render, segment, logger } from 'node-karin'

/**
 * ffmpeg 渲染 demo
 * 触发指令: #ffmpeg渲染
 */
export const ffmpegDemo = karin.command(/^#?ffmpeg渲染$/, async (e) => {
  try {
    const spec = path.join(dir.pluginDir, 'resources', 'template', 'ffmpeg.ffrender.json')
    const bg = path.join(dir.pluginDir, 'resources', 'image', '启程宣发.png')

    const img = await render.render({
      name: 'ffmpegrender',
      file: spec,
      type: 'png',
      data: { file: bg },
    }, 'ffmpeg') as string

    await e.reply(segment.image(`base64://${img}`))
    return true
  } catch (error) {
    logger.error(error)
    await e.reply(String((error as Error)?.message || error))
    return true
  }
}, {
  name: 'ffmpeg渲染demo',
  priority: 9999,
  log: true,
  permission: 'all',
})
