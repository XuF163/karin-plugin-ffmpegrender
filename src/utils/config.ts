import { dir } from '@/dir'
import fs from 'node:fs'
import path from 'node:path'
import {
  watch,
  logger,
  filesByExt,
  copyConfigSync,
  requireFileSync,
} from 'node-karin'

export interface Config {
  /** 一言API */
  yiyanApi: string
  /** ffmpeg 可执行文件路径 (为空则走环境变量/PATH 或 Karin 全局配置) */
  ffmpegPath: string
  /** drawtext 字体文件路径 (为空则自动探测常见字体) */
  ffmpegFontFile: string
  /** ffmpeg 渲染超时 (毫秒) */
  ffmpegTimeoutMs: number
  /** 是否打印 ffmpeg 命令 */
  ffmpegLogCommand: boolean
}

/**
 * @description 初始化配置文件
 */
copyConfigSync(dir.defConfigDir, dir.ConfigDir, ['.json'])

/**
 * @description copy resources to @karinjs
 * @description only copy missing files
 */
const copyDirMissingSync = (srcDir: string, destDir: string) => {
  if (!fs.existsSync(srcDir)) return
  fs.mkdirSync(destDir, { recursive: true })
  const entries = fs.readdirSync(srcDir, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name)
    const destPath = path.join(destDir, entry.name)
    if (entry.isDirectory()) {
      copyDirMissingSync(srcPath, destPath)
      continue
    }
    if (!entry.isFile()) continue
    if (!fs.existsSync(destPath)) {
      fs.mkdirSync(path.dirname(destPath), { recursive: true })
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

try {
  copyDirMissingSync(path.join(dir.pluginDir, 'resources'), dir.defResourcesDir)
} catch (err) {
  logger.error('[ffmpegrender] copy resources failed', err)
}

/**
 * @description 配置文件
 */
export const config = () => {
  const cfg = requireFileSync(`${dir.ConfigDir}/config.json`)
  const def = requireFileSync(`${dir.defConfigDir}/config.json`)
  return { ...def, ...cfg }
}

/**
 * @description 监听配置文件
 */
setTimeout(() => {
  const list = filesByExt(dir.ConfigDir, '.json', 'abs')
  list.forEach(file => watch(file, (old, now) => {
    logger.info([
      'QAQ: 检测到配置文件更新',
      `这是旧数据: ${old}`,
      `这是新数据: ${now}`,
    ].join('\n'))
  }))
}, 2000)
