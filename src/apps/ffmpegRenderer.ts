import { getRenderList, logger, render } from 'node-karin'

import { ffmpegRender } from '@/ffmpeg/renderer'

const RENDER_ID = 'ffmpeg'

try {
  const exists = getRenderList().some(r => r.id === RENDER_ID)
  if (!exists) {
    render.app({
      id: RENDER_ID,
      type: 'image',
      render: ffmpegRender,
    })
    logger.mark(`[ffmpegrender] renderer registered: ${RENDER_ID}`)
  }
} catch (err) {
  logger.error('[ffmpegrender] renderer register failed', err)
}

export const ffmpegRenderer = RENDER_ID
