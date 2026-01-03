import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import os from 'node:os'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

import { config as karinConfig, getRenderList, karinPathTemp, logger, renderTpl } from 'node-karin'
import { config as pluginConfig } from '@/utils'

import type { Options, RenderResult, Snapka, SnapkaResult } from 'node-karin'
import type { BackgroundSpec, FfmpegRenderSpecV1, ImageLayerSpec, TextLayerSpec } from './types'

type AnyRenderOptions = Options | Snapka
type AnyRenderResult<T extends AnyRenderOptions> = T extends Snapka ? SnapkaResult<T> : RenderResult<T>

const RENDER_ID = 'ffmpeg'

const isHttpUrl = (input: string) => /^https?:\/\//i.test(input)
const isFileUrl = (input: string) => /^file:\/\//i.test(input)

const toFsPath = (input: string) => {
  if (!isFileUrl(input)) return input

  const stripped = input.replace(/^file:\/\//i, '')
  if (/^\/[A-Za-z]:[\\/]/.test(stripped)) return stripped.slice(1)
  if (/^[A-Za-z]:[\\/]/.test(stripped)) return stripped

  try {
    return fileURLToPath(input)
  } catch {
    return stripped
  }
}

const isLikelyImage = (input: string) => {
  const clean = input.split('?')[0]?.split('#')[0] ?? input
  const ext = path.extname(clean).toLowerCase()
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp'].includes(ext)
}

const parseHexColor = (color: string): { rgb: string, alpha?: number } | null => {
  const c = color.trim()
  if (!c.startsWith('#')) return null
  const hex = c.slice(1)
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) return null
  const rgb = hex.slice(0, 6).toLowerCase()
  if (hex.length === 8) {
    const a = Number.parseInt(hex.slice(6, 8), 16) / 255
    return { rgb, alpha: Number.isFinite(a) ? a : 1 }
  }
  return { rgb }
}

const toFfmpegColor = (color?: string) => {
  if (!color) return 'black@0.0'
  const c = color.trim()
  if (c === 'transparent') return 'black@0.0'
  const parsed = parseHexColor(c)
  if (!parsed) {
    if (!/^[a-zA-Z0-9#@._-]+$/.test(c)) throw new TypeError(`ffmpegrender: unsafe color value: ${c}`)
    return c
  }
  if (typeof parsed.alpha === 'number') return `0x${parsed.rgb}@${parsed.alpha}`
  return `0x${parsed.rgb}`
}

const escapeFilterValue = (value: string) => {
  const normalized = value.replace(/\\/g, '/')
  const escaped = normalized
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
  return `'${escaped}'`
}

const resolveFfmpegBin = () => {
  const cfg = pluginConfig()
  const fromPlugin = (cfg.ffmpegPath || '').trim()
  const fromKarin = (karinConfig.ffmpegPath?.() || '').trim()
  return fromPlugin || fromKarin || 'ffmpeg'
}

const findDefaultFontFile = () => {
  const cfg = pluginConfig()
  const configured = (cfg.ffmpegFontFile || '').trim()
  if (configured && fsSync.existsSync(configured)) return configured

  const candidates = process.platform === 'win32'
    ? [
        'C:/Windows/Fonts/msyh.ttc',
        'C:/Windows/Fonts/msyh.ttf',
        'C:/Windows/Fonts/simhei.ttf',
        'C:/Windows/Fonts/arial.ttf',
      ]
    : process.platform === 'darwin'
      ? [
          '/System/Library/Fonts/Supplemental/Arial.ttf',
          '/System/Library/Fonts/Supplemental/Helvetica.ttf',
        ]
      : [
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
          '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
          '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
        ]

  return candidates.find(p => fsSync.existsSync(p))
}

const resolveTempBaseDir = () => {
  const base = (karinPathTemp || '').trim() || os.tmpdir()
  return path.join(base, 'ffmpegrender')
}

const spawnFfmpeg = async (args: string[]) => {
  const cfg = pluginConfig()
  const ffmpegBin = resolveFfmpegBin()
  const logCmd = Boolean(cfg.ffmpegLogCommand)
  const timeoutMs = Number.isFinite(cfg.ffmpegTimeoutMs) ? cfg.ffmpegTimeoutMs : 30000

  if (logCmd) logger.mark(`[ffmpeg] ${ffmpegBin} ${args.join(' ')}`)

  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegBin, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const stdout: Buffer[] = []
    const stderr: Buffer[] = []

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`[ffmpeg] timeout after ${timeoutMs}ms`))
    }, timeoutMs)

    child.stdout.on('data', chunk => stdout.push(Buffer.from(chunk)))
    child.stderr.on('data', chunk => stderr.push(Buffer.from(chunk)))
    child.on('error', (err) => {
      clearTimeout(timer)
      if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
        reject(new Error(`ffmpegrender: ffmpeg not found (${ffmpegBin}); set \`ffmpegPath\` in plugin config or install ffmpeg in PATH`))
        return
      }
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve(Buffer.concat(stdout))
      const errText = Buffer.concat(stderr).toString('utf8').trim()
      reject(new Error(`[ffmpeg] exit ${code}: ${errText || 'unknown error'}`))
    })
  })
}

const assertSpec: (spec: unknown) => asserts spec is FfmpegRenderSpecV1 = (spec) => {
  if (!spec || typeof spec !== 'object') throw new TypeError('ffmpegrender: spec must be an object')
  const s = spec as Partial<FfmpegRenderSpecV1>
  if (!Number.isFinite(s.width) || !Number.isFinite(s.height)) {
    throw new TypeError('ffmpegrender: spec.width/spec.height must be numbers')
  }
  if (s.width! <= 0 || s.height! <= 0) {
    throw new TypeError('ffmpegrender: spec.width/spec.height must be > 0')
  }
  if (s.layers && !Array.isArray(s.layers)) throw new TypeError('ffmpegrender: spec.layers must be an array')
}

const buildImageChain = (layer: ImageLayerSpec, transparentColor: string) => {
  const w = Math.round(layer.width)
  const h = Math.round(layer.height)
  const fit = layer.fit || 'cover'
  const filters: string[] = ['format=rgba']

  if (fit === 'contain') {
    filters.push(`scale=w=${w}:h=${h}:force_original_aspect_ratio=decrease`)
    filters.push(`pad=w=${w}:h=${h}:x=(ow-iw)/2:y=(oh-ih)/2:color=${transparentColor}`)
  } else if (fit === 'cover') {
    filters.push(`scale=w=${w}:h=${h}:force_original_aspect_ratio=increase`)
    filters.push(`crop=w=${w}:h=${h}`)
  } else {
    filters.push(`scale=w=${w}:h=${h}`)
  }

  if (typeof layer.opacity === 'number' && layer.opacity >= 0 && layer.opacity < 1) {
    filters.push(`colorchannelmixer=aa=${layer.opacity}`)
  }

  return filters.join(',')
}

const buildDrawtext = async (layer: TextLayerSpec, tempDir: string) => {
  const fontFile = layer.fontFile || findDefaultFontFile()
  if (!fontFile) {
    throw new Error('ffmpegrender: missing font file (set `ffmpegFontFile` in plugin config or layer.fontFile)')
  }

  const id = crypto.randomBytes(8).toString('hex')
  const textFile = path.join(tempDir, `text-${id}.txt`)
  await fs.writeFile(textFile, layer.text, 'utf8')

  const opts: string[] = [
    `fontfile=${escapeFilterValue(fontFile)}`,
    `textfile=${escapeFilterValue(textFile)}`,
    'reload=0',
    `x=${Math.round(layer.x)}`,
    `y=${Math.round(layer.y)}`,
    `fontsize=${Math.round(layer.fontSize)}`,
    `fontcolor=${toFfmpegColor(layer.color || '#ffffff')}`,
  ]

  const boxColor = layer.box?.color ? toFfmpegColor(layer.box.color) : undefined
  const border = layer.box?.border
  if (boxColor) {
    opts.push('box=1')
    opts.push(`boxcolor=${boxColor}`)
    if (typeof border === 'number' && border > 0) opts.push(`boxborderw=${Math.round(border)}`)
  }

  return { filter: `drawtext=${opts.join(':')}`, cleanupFile: textFile }
}

const normalizeBackgroundImage = (bg: BackgroundSpec | undefined, width: number, height: number): ImageLayerSpec | null => {
  if (!bg?.src) return null
  return {
    type: 'image',
    src: bg.src,
    x: 0,
    y: 0,
    width,
    height,
    fit: bg.fit || 'cover',
  }
}

const readSpec = async (filePath: string): Promise<FfmpegRenderSpecV1> => {
  const raw = await fs.readFile(filePath, 'utf8')
  const spec = JSON.parse(raw) as unknown
  assertSpec(spec)
  return spec
}

const tryReadSpec = async (filePath: string): Promise<FfmpegRenderSpecV1 | null> => {
  try {
    return await readSpec(filePath)
  } catch {
    return null
  }
}

const renderSpecWithFfmpeg = async (spec: FfmpegRenderSpecV1, specDir: string, outType: 'png' | 'jpeg' | 'webp', outQuality?: number) => {
  const transparentColor = 'black@0.0'
  const bgColor = toFfmpegColor(spec.background?.color)

  const imageLayers: ImageLayerSpec[] = []
  const bgImage = normalizeBackgroundImage(spec.background, spec.width, spec.height)
  if (bgImage) imageLayers.push(bgImage)
  for (const layer of (spec.layers || [])) {
    if (layer.type === 'image') imageLayers.push(layer)
  }

  const textLayers = (spec.layers || []).filter((l): l is TextLayerSpec => l.type === 'text')

  const inputFiles = imageLayers.map(l => resolveAsset(l.src, specDir))

  const tmpBase = resolveTempBaseDir()
  await fs.mkdir(tmpBase, { recursive: true })
  const tempDir = await fs.mkdtemp(path.join(tmpBase, 'run-'))

  const textCleanup: string[] = []
  try {
    const filterParts: string[] = []
    filterParts.push('[0:v]format=rgba[base0]')

    let current = 'base0'
    let step = 0

    for (let i = 0; i < imageLayers.length; i++) {
      const inputIndex = i + 1
      const layer = imageLayers[i]
      const imgLabel = `img${inputIndex}`
      filterParts.push(`[${inputIndex}:v]${buildImageChain(layer, transparentColor)}[${imgLabel}]`)
      const next = `base${++step}`
      filterParts.push(`[${current}][${imgLabel}]overlay=${Math.round(layer.x)}:${Math.round(layer.y)}:format=auto[${next}]`)
      current = next
    }

    for (const layer of textLayers) {
      const { filter, cleanupFile } = await buildDrawtext(layer, tempDir)
      textCleanup.push(cleanupFile)
      const next = `base${++step}`
      filterParts.push(`[${current}]${filter}[${next}]`)
      current = next
    }

    const filterComplex = filterParts.join(';')

    const args: string[] = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      `color=c=${bgColor}:s=${Math.round(spec.width)}x${Math.round(spec.height)}:d=1`,
    ]

    for (const input of inputFiles) args.push('-i', input)

    args.push(
      '-filter_complex',
      filterComplex,
      '-map',
      `[${current}]`,
      '-frames:v',
      '1',
      '-an',
      '-sn'
    )

    if (outType === 'png') {
      args.push('-f', 'image2pipe', '-vcodec', 'png', '-pix_fmt', 'rgba', '-')
    } else if (outType === 'webp') {
      args.push('-f', 'image2pipe', '-vcodec', 'libwebp', '-pix_fmt', 'yuva420p', '-')
    } else {
      const q = typeof outQuality === 'number' ? clamp(outQuality, 1, 100) : 90
      const qscale = String(Math.round(31 - (q / 100) * 29))
      args.push('-q:v', qscale, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-')
    }

    const output = await spawnFfmpeg(args)
    return output
  } finally {
    await Promise.allSettled(textCleanup.map(f => fs.unlink(f)))
    await fs.rm(tempDir, { recursive: true, force: true })
  }
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n))

const resolveAsset = (asset: string, baseDir: string) => {
  const src = asset.trim()
  if (isHttpUrl(src)) return src
  const fsPath = toFsPath(src)
  if (path.isAbsolute(fsPath)) return fsPath
  return path.resolve(baseDir, fsPath)
}

const delegateToAnotherRenderer = async <T extends AnyRenderOptions>(options: T) => {
  const list = getRenderList()
  const other = list.find(r => r.id !== RENDER_ID)
  if (!other) return null
  return await other.render(options as any) as AnyRenderResult<T>
}

const inferOutputType = (options: AnyRenderOptions): 'png' | 'jpeg' | 'webp' => {
  const t = (options as any).type
  if (t === 'jpeg' || t === 'webp' || t === 'png') return t
  return 'png'
}

/**
 * ffmpeg renderer (json spec based)
 * - file: `*.ffrender.json` (or json with {width,height,layers})
 * - returns: base64 (no `base64://` prefix)
 */
export const ffmpegRender = async <T extends AnyRenderOptions>(options: T): Promise<AnyRenderResult<T>> => {
  const file = (options as any)?.file
  if (typeof file !== 'string') throw new TypeError('ffmpegrender: options.file must be a string')

  if (!isHttpUrl(file) && (options as any).data) {
    options = renderTpl(options as any) as T
  }

  const normalizedFile = (options as any).file as string
  const outType = inferOutputType(options)
  const outQuality = (options as any).quality

  if (isHttpUrl(normalizedFile) && !isLikelyImage(normalizedFile)) {
    const delegated = await delegateToAnotherRenderer(options)
    if (delegated) return delegated
    throw new Error('ffmpegrender: http input is not an image; please install a puppeteer/snapka renderer for HTML/URL rendering')
  }

  if (isHttpUrl(normalizedFile) && isLikelyImage(normalizedFile)) {
    const buffer = await renderImageWithFfmpeg(normalizedFile, outType, outQuality)
    const b64 = buffer.toString('base64')
    const multiPage = (options as any).multiPage
    if (multiPage) return [b64] as AnyRenderResult<T>
    return b64 as AnyRenderResult<T>
  }

  const fsPath = path.resolve(toFsPath(normalizedFile))
  if (isLikelyImage(fsPath)) {
    const buffer = await renderImageWithFfmpeg(fsPath, outType, outQuality)
    const b64 = buffer.toString('base64')
    const multiPage = (options as any).multiPage
    if (multiPage) return [b64] as AnyRenderResult<T>
    return b64 as AnyRenderResult<T>
  }

  const ext = path.extname(fsPath).toLowerCase()
  const maybeSpec = ext === '.json' || ext === '.ffrender'
  if (maybeSpec) {
    const spec = await tryReadSpec(fsPath)
    if (spec) {
      const specDir = path.dirname(fsPath)
      const buffer = await renderSpecWithFfmpeg(spec, specDir, outType, outQuality)
      const b64 = buffer.toString('base64')
      const multiPage = (options as any).multiPage
      if (multiPage) return [b64] as AnyRenderResult<T>
      return b64 as AnyRenderResult<T>
    }
  }

  const delegated = await delegateToAnotherRenderer(options)
  if (delegated) return delegated
  throw new Error(`ffmpegrender: unsupported input: ${normalizedFile}`)
}

const renderImageWithFfmpeg = async (input: string, outType: 'png' | 'jpeg' | 'webp', outQuality?: number) => {
  const args: string[] = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    input,
    '-frames:v',
    '1',
    '-an',
    '-sn',
  ]

  if (outType === 'png') {
    args.push('-f', 'image2pipe', '-vcodec', 'png', '-pix_fmt', 'rgba', '-')
  } else if (outType === 'webp') {
    args.push('-f', 'image2pipe', '-vcodec', 'libwebp', '-pix_fmt', 'yuva420p', '-')
  } else {
    const q = typeof outQuality === 'number' ? clamp(outQuality, 1, 100) : 90
    const qscale = String(Math.round(31 - (q / 100) * 29))
    args.push('-q:v', qscale, '-f', 'image2pipe', '-vcodec', 'mjpeg', '-')
  }

  return await spawnFfmpeg(args)
}
