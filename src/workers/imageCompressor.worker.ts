// ============================================
// Image Compressor Web Worker
// 在后台线程处理图片压缩，避免阻塞主线程
// ============================================

interface CompressRequest {
  type: 'compress'
  id: string
  imageData: ArrayBuffer
  mimeType: string
  maxSize: number
  quality: number
}

interface CompressResponse {
  type: 'compressed'
  id: string
  result: ArrayBuffer
  mimeType: string
  width: number
  height: number
}

interface ErrorResponse {
  type: 'error'
  id: string
  error: string
}

self.onmessage = async (e: MessageEvent<CompressRequest>) => {
  const { type, id, imageData, mimeType, maxSize, quality } = e.data

  if (type !== 'compress') return

  try {
    // 创建 ImageBitmap（在 Worker 中可用）
    const blob = new Blob([imageData], { type: mimeType })
    const imageBitmap = await createImageBitmap(blob)

    let { width, height } = imageBitmap

    // 计算缩放比例
    if (width > maxSize || height > maxSize) {
      const ratio = Math.min(maxSize / width, maxSize / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    // 使用 OffscreenCanvas 处理（Worker 中可用）
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')

    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    ctx.drawImage(imageBitmap, 0, 0, width, height)
    imageBitmap.close() // 释放资源

    // 转换为 Blob
    const outputType = mimeType === 'image/png' ? 'image/png' : 'image/jpeg'
    const resultBlob = await canvas.convertToBlob({ type: outputType, quality })

    // 如果还是太大，降低质量重试
    let finalBlob = resultBlob
    if (resultBlob.size > 5 * 1024 * 1024 && outputType === 'image/jpeg') {
      finalBlob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.6 })
    }

    const resultBuffer = await finalBlob.arrayBuffer()

    const response: CompressResponse = {
      type: 'compressed',
      id,
      result: resultBuffer,
      mimeType: finalBlob.type,
      width,
      height,
    }

    self.postMessage(response, { transfer: [resultBuffer] })
  } catch (err) {
    const response: ErrorResponse = {
      type: 'error',
      id,
      error: err instanceof Error ? err.message : 'Unknown error',
    }
    self.postMessage(response)
  }
}
