export type FitMode = 'fill' | 'contain' | 'cover'

export interface BackgroundSpec {
  color?: string
  src?: string
  fit?: FitMode
}

export interface ImageLayerSpec {
  type: 'image'
  src: string
  x: number
  y: number
  width: number
  height: number
  fit?: FitMode
  opacity?: number
}

export interface TextLayerSpec {
  type: 'text'
  text: string
  x: number
  y: number
  fontSize: number
  color?: string
  fontFile?: string
  box?: {
    color?: string
    border?: number
  }
}

export type LayerSpec = ImageLayerSpec | TextLayerSpec

export interface FfmpegRenderSpecV1 {
  version?: 1
  width: number
  height: number
  background?: BackgroundSpec
  layers?: LayerSpec[]
}
