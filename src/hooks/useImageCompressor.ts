// ============================================
// useImageCompressor Hook
// 使用 Web Worker 在后台压缩图片
// ============================================

import { useCallback, useRef, useEffect } from 'react'

interface CompressResult {
  dataUrl: string
  mimeType: string
  width: number
  height: number
}

interface PendingRequest {
  resolve: (result: CompressResult) => void
  reject: (error: Error) => void
}

export function useImageCompressor() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Map<string, PendingRequest>>(new Map())
  const idCounterRef = useRef(0)

  // 初始化 Worker
  useEffect(() => {
    // 动态导入 Worker
    workerRef.current = new Worker(new URL('../workers/imageCompressor.worker.ts', import.meta.url), { type: 'module' })

    workerRef.current.onmessage = e => {
      const { type, id, result, mimeType, width, height, error } = e.data

      const pending = pendingRef.current.get(id)
      if (!pending) return

      pendingRef.current.delete(id)

      if (type === 'error') {
        pending.reject(new Error(error))
      } else if (type === 'compressed') {
        // 将 ArrayBuffer 转换为 DataURL
        const blob = new Blob([result], { type: mimeType })
        const reader = new FileReader()
        reader.onload = () => {
          pending.resolve({
            dataUrl: reader.result as string,
            mimeType,
            width,
            height,
          })
        }
        reader.onerror = () => {
          pending.reject(new Error('Failed to read compressed image'))
        }
        reader.readAsDataURL(blob)
      }
    }

    workerRef.current.onerror = err => {
      console.error('[ImageCompressor] Worker error:', err)
    }

    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
      // 拒绝所有未完成的请求
      for (const [, pending] of pendingRef.current) {
        pending.reject(new Error('Worker terminated'))
      }
      pendingRef.current.clear()
    }
  }, [])

  /**
   * 压缩图片
   * @param file 图片文件
   * @param options 压缩选项
   * @returns 压缩后的 DataURL 和元信息
   */
  const compress = useCallback(
    async (file: File, options: { maxSize?: number; quality?: number } = {}): Promise<CompressResult> => {
      const { maxSize = 2048, quality = 0.85 } = options

      // 如果 Worker 不可用，回退到主线程处理
      if (!workerRef.current) {
        return compressFallback(file, maxSize, quality)
      }

      const id = `img-${++idCounterRef.current}`
      const arrayBuffer = await file.arrayBuffer()

      return new Promise((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject })

        workerRef.current!.postMessage(
          {
            type: 'compress',
            id,
            imageData: arrayBuffer,
            mimeType: file.type,
            maxSize,
            quality,
          },
          { transfer: [arrayBuffer] },
        )

        // 超时处理
        setTimeout(() => {
          if (pendingRef.current.has(id)) {
            pendingRef.current.delete(id)
            reject(new Error('Compression timeout'))
          }
        }, 30000) // 30 秒超时
      })
    },
    [],
  )

  /**
   * 检查是否需要压缩
   */
  const needsCompression = useCallback((file: File): boolean => {
    // 小于 500KB 的图片不需要压缩
    return file.size >= 500 * 1024
  }, [])

  return { compress, needsCompression }
}

/**
 * 主线程回退方案（Worker 不可用时）
 */
async function compressFallback(file: File, maxSize: number, quality: number): Promise<CompressResult> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const objectUrl = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)

      let { width, height } = img

      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        reject(new Error('Failed to get canvas context'))
        return
      }

      ctx.drawImage(img, 0, 0, width, height)

      const outputType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const dataUrl = canvas.toDataURL(outputType, quality)

      resolve({
        dataUrl,
        mimeType: outputType,
        width,
        height,
      })
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Failed to load image'))
    }

    img.src = objectUrl
  })
}
