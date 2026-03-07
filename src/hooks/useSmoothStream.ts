import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Smooth Streaming Hook
 *
 * 核心原则：
 * 1. 只有在 streaming 状态下的**新增内容**才需要打字机效果
 * 2. 历史消息、已加载的内容直接显示，不做动画
 * 3. streaming 结束时立即显示剩余全部内容
 *
 * 性能优化：
 * - 使用 ref 追踪动画进度，减少 setState 调用
 * - 批量更新，每 3 帧才触发一次 re-render
 *
 * 参考：Upstash blog, Sam Selikoff's useAnimatedText
 */

interface UseSmoothStreamOptions {
  /** 每个字符的显示间隔（毫秒），默认 8ms ≈ 125 字符/秒 */
  charDelay?: number
  /** 是否强制禁用动画，直接显示完整内容 */
  disableAnimation?: boolean
}

interface UseSmoothStreamResult {
  /** 当前应该显示的文本 */
  displayText: string
  /** 是否正在播放动画 */
  isAnimating: boolean
  /** 强制立即显示全部内容 */
  flush: () => void
}

// 批量更新间隔（帧数）
const BATCH_UPDATE_FRAMES = 3

export function useSmoothStream(
  /** 完整的目标文本（会持续更新） */
  fullText: string,
  /** 是否正在 streaming */
  isStreaming: boolean,
  options: UseSmoothStreamOptions = {},
): UseSmoothStreamResult {
  const { charDelay = 8, disableAnimation = false } = options

  // 当前显示的字符索引 - 状态用于触发 re-render
  const [displayIndex, setDisplayIndex] = useState(fullText.length)

  // 使用 ref 追踪实际的动画进度，避免频繁 setState
  const actualIndexRef = useRef(fullText.length)

  // Refs for animation control
  const frameRef = useRef<number | null>(null)
  const lastTimeRef = useRef<number>(0)
  const frameCountRef = useRef(0) // 帧计数器，用于批量更新
  const idleFramesRef = useRef(0) // 连续空闲帧计数，用于降频

  // 追踪 streaming 状态变化
  const wasStreamingRef = useRef(isStreaming)
  // 追踪上一次的文本内容，用于检测内容重置
  const prevTextRef = useRef(fullText)
  // 标记是否是组件首次渲染
  const isFirstRenderRef = useRef(true)

  // 检测内容重置（新对话/切换 session）
  useEffect(() => {
    // 跳过首次渲染，因为初始化时已经设置了 displayIndex
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      prevTextRef.current = fullText
      return
    }

    const prevText = prevTextRef.current

    // 如果文本完全不同（不是追加），说明是新内容（切换 session）
    const isNewContent =
      fullText.length > 0 &&
      prevText.length > 0 &&
      !fullText.startsWith(prevText.slice(0, Math.min(prevText.length, 20)))

    // 如果之前是空的，现在有内容了（新对话开始）
    const isNewConversation = prevText.length === 0 && fullText.length > 0

    if (isNewContent) {
      // 切换到新 session，直接显示全部（不做动画）
      actualIndexRef.current = fullText.length
      setDisplayIndex(fullText.length)
    } else if (isNewConversation && isStreaming) {
      // 新对话开始，从 0 开始动画
      actualIndexRef.current = 0
      setDisplayIndex(0)
    } else if (!isStreaming) {
      // 非 streaming 的历史内容，直接显示完整内容
      actualIndexRef.current = fullText.length
      setDisplayIndex(fullText.length)
    }

    prevTextRef.current = fullText
  }, [fullText, isStreaming])

  // 核心：处理 streaming 状态变化
  useEffect(() => {
    const wasStreaming = wasStreamingRef.current

    // streaming 刚开始：如果之前没有 streaming 且现在开始了
    if (!wasStreaming && isStreaming) {
      // 新的 stream 开始，从当前位置开始动画（可能是 0，也可能是已有内容的末尾）
      // 不重置 displayIndex，这样可以支持"继续生成"的场景
    }

    // streaming 刚结束：立即显示全部剩余内容
    if (wasStreaming && !isStreaming) {
      actualIndexRef.current = fullText.length
      setDisplayIndex(fullText.length)
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      idleFramesRef.current = 0
    }

    wasStreamingRef.current = isStreaming
  }, [isStreaming, fullText.length])

  // 历史消息或 hydrate 后内容补齐时，直接显示全部
  useEffect(() => {
    if (!isStreaming) {
      actualIndexRef.current = fullText.length
      setDisplayIndex(fullText.length)
    }
  }, [fullText.length, isStreaming])

  // 使用 ref 存储最新值，避免 useEffect 依赖变化导致频繁重启动画
  const fullTextLengthRef = useRef(fullText.length)
  const charDelayRef = useRef(charDelay)

  useEffect(() => {
    fullTextLengthRef.current = fullText.length
  }, [fullText.length])

  useEffect(() => {
    charDelayRef.current = charDelay
  }, [charDelay])

  // 动画逻辑：只在 streaming 且还有内容未显示时运行
  useEffect(() => {
    // 不是 streaming，不需要动画
    if (!isStreaming || disableAnimation) {
      // 确保清理 RAF
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      return
    }

    // 已经显示完了 - 但 fullText 可能还在更新，需要继续监听
    // 所以不在这里返回，让动画循环自己检查

    let isRunning = true

    const animate = (time: number) => {
      if (!isRunning) return

      const fullTextLength = fullTextLengthRef.current
      const charDelay = charDelayRef.current
      const elapsed = time - lastTimeRef.current

      // 获取当前 index
      let currentIndex = actualIndexRef.current

      // 已经显示完了，继续等待新内容
      if (currentIndex >= fullTextLength) {
        idleFramesRef.current++

        // 检查是否有新内容到达
        const latestLength = fullTextLengthRef.current
        if (latestLength > currentIndex) {
          // 有新内容，重置空闲计数，立即继续动画
          idleFramesRef.current = 0
          frameRef.current = requestAnimationFrame(animate)
          return
        }

        // 没有新内容，继续等待但逐步降频以减少 CPU 占用
        // 前 10 帧全速 RAF (~160ms)，之后每 32ms 检查一次
        if (idleFramesRef.current < 10) {
          frameRef.current = requestAnimationFrame(animate)
        } else {
          setTimeout(() => {
            if (isRunning) {
              frameRef.current = requestAnimationFrame(animate)
            }
          }, 32)
        }
        return
      }

      // 有新内容要显示，重置空闲计数
      idleFramesRef.current = 0

      // 计算落后了多少字符
      const lag = fullTextLength - currentIndex

      // 动态调速：落后越多，速度越快
      let effectiveDelay = charDelay
      let charsPerFrame = 1

      if (lag > 300) {
        // 落后太多，直接追上
        actualIndexRef.current = fullTextLength
        frameCountRef.current = 0
        setDisplayIndex(fullTextLength)
        lastTimeRef.current = time
        frameRef.current = requestAnimationFrame(animate)
        return
      } else if (lag > 150) {
        effectiveDelay = charDelay / 4
        charsPerFrame = 4
      } else if (lag > 50) {
        effectiveDelay = charDelay / 2
        charsPerFrame = 2
      }

      if (elapsed >= effectiveDelay) {
        const charsToAdd = Math.max(charsPerFrame, Math.floor(elapsed / effectiveDelay) * charsPerFrame)
        const newIndex = Math.min(currentIndex + charsToAdd, fullTextLength)
        actualIndexRef.current = newIndex
        lastTimeRef.current = time

        // 批量更新：每 BATCH_UPDATE_FRAMES 帧才触发一次 setState
        frameCountRef.current++
        if (frameCountRef.current >= BATCH_UPDATE_FRAMES || newIndex >= fullTextLength) {
          frameCountRef.current = 0
          setDisplayIndex(newIndex)
        }
      }

      frameRef.current = requestAnimationFrame(animate)
    }

    // 初始化时间
    if (lastTimeRef.current === 0) {
      lastTimeRef.current = performance.now()
    }

    frameRef.current = requestAnimationFrame(animate)

    return () => {
      isRunning = false
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      idleFramesRef.current = 0
    }
  }, [isStreaming, disableAnimation]) // 只依赖 isStreaming，减少重启次数

  // 强制立即显示全部
  const flush = useCallback(() => {
    if (frameRef.current) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    idleFramesRef.current = 0
    actualIndexRef.current = fullText.length
    setDisplayIndex(fullText.length)
  }, [fullText.length])

  // 计算当前应该显示的文本
  // 非 streaming 时直接显示全部，streaming 时显示到 displayIndex
  const displayText = isStreaming && !disableAnimation ? fullText.slice(0, displayIndex) : fullText
  const isAnimating = isStreaming && !disableAnimation && displayIndex < fullText.length

  return {
    displayText,
    isAnimating,
    flush,
  }
}
