// ============================================
// OutlineIndex - Fisheye Outline Index
// ============================================
//
// 右侧浮动索引条，鼠标/触摸接近时产生鱼眼镜头效果：
// - 余弦插值计算接近度 → tick 宽度和间距随之缩放
// - lerp 平滑过渡 → rAF 驱动，不依赖 React state
// - 接近阈值以上显示标题 label
//
// PC:     hover → fisheye → click 导航
// Mobile: touch → fisheye + 震动 + overlay → release 导航
// ============================================

import { memo, useMemo, useRef, useEffect, useCallback, useState } from 'react'
import type { Message } from '../types/message'
import { getMessageText, isUserMessage } from '../types/message'
import { useChatViewport } from '../features/chat/chatViewport'

// ============================================
// Types
// ============================================

interface OutlineEntry {
  title: string
  messageId: string
}

interface OutlineIndexProps {
  messages: Message[]
  onScrollToMessageId: (messageId: string) => void
}

// ============================================
// Fisheye math (pure functions)
// ============================================

const LERP_SPEED = 0.18
const EPSILON = 0.005
const HALF_PI = Math.PI / 2

/** 余弦衰减：距离 0 → 强度 1，距离 >= radius → 强度 0 */
function cosineStrength(distance: number, radius: number): number {
  return distance >= radius ? 0 : Math.cos((distance / radius) * HALF_PI)
}

/** 带死区的 lerp */
function smoothStep(current: number, target: number): number {
  const next = current + (target - current) * LERP_SPEED
  return Math.abs(next) < EPSILON && target === 0 ? 0 : next
}

// ============================================
// Fisheye config
// ============================================

interface FisheyeConfig {
  influenceRadius: number
  tickWidth: { min: number; max: number }
  tickHeight: number
  margin: { min: number; max: number }
  labelThreshold: number
}

const DESKTOP: FisheyeConfig = {
  influenceRadius: 55,
  tickWidth: { min: 8, max: 22 },
  tickHeight: 2.5,
  margin: { min: 4, max: 14 },
  labelThreshold: 0.65,
}

const MOBILE: FisheyeConfig = {
  influenceRadius: 45,
  tickWidth: { min: 6, max: 20 },
  tickHeight: 2.5,
  margin: { min: 3, max: 16 },
  labelThreshold: 0.6,
}

// ============================================
// Shared fisheye engine
// ============================================

interface CachedItem {
  el: HTMLElement
  tick: HTMLElement
  label: HTMLElement
}

/** 查询并缓存 DOM 元素 */
function queryCachedItems(
  container: HTMLElement | null,
  itemSelector: string,
  tickAttr: string,
  labelAttr: string,
): CachedItem[] {
  if (!container) return []
  return Array.from(container.querySelectorAll<HTMLElement>(itemSelector))
    .map(el => ({
      el,
      tick: el.querySelector<HTMLElement>(`[${tickAttr}]`)!,
      label: el.querySelector<HTMLElement>(`[${labelAttr}]`)!,
    }))
    .filter(item => item.tick && item.label)
}

/** 一帧的鱼眼计算 + DOM 更新 */
function applyFisheye(
  items: CachedItem[],
  cursorY: number | null,
  strengths: number[],
  config: FisheyeConfig,
): { alive: boolean; focusIndex: number; maxStrength: number } {
  let alive = false
  let focusIndex = -1
  let maxStrength = 0

  for (let i = 0; i < items.length; i++) {
    const { el, tick, label } = items[i]

    // 目标强度
    let target = 0
    if (cursorY !== null) {
      const rect = el.getBoundingClientRect()
      target = cosineStrength(Math.abs(cursorY - (rect.top + rect.height / 2)), config.influenceRadius)
    }

    // 平滑过渡
    const s = smoothStep(strengths[i] ?? 0, target)
    strengths[i] = s
    if (Math.abs(s - target) > EPSILON) alive = true
    if (s > maxStrength) {
      maxStrength = s
      focusIndex = i
    }

    // Tick: width + color
    tick.style.width = `${config.tickWidth.min + s * (config.tickWidth.max - config.tickWidth.min)}px`
    if (s > 0.5) {
      tick.style.backgroundColor = 'hsl(var(--accent-main-200))'
      tick.style.boxShadow = '0 0 3px hsl(var(--accent-main-100) / 0.4)'
    } else {
      tick.style.backgroundColor = 'hsl(var(--border-300))'
      tick.style.boxShadow = 'none'
    }

    // Item: fisheye spacing
    const m = config.margin.min + s * (config.margin.max - config.margin.min)
    el.style.marginTop = `${m}px`
    el.style.marginBottom = `${m}px`

    // Label: fade in/out with slide
    if (s > config.labelThreshold) {
      const t = Math.min(1, (s - config.labelThreshold) / (1 - config.labelThreshold))
      label.style.opacity = `${t}`
      label.style.transform = `translateX(${(1 - t) * 10}px)`
      label.style.visibility = 'visible'
    } else {
      label.style.opacity = '0'
      label.style.transform = 'translateX(10px)'
      label.style.visibility = 'hidden'
    }
  }

  return { alive, focusIndex, maxStrength }
}

// ============================================
// Data extraction
// ============================================

const TITLE_MAX_LEN = 80
const MOBILE_TITLE_MAX_LEN = 14

function messageHasContent(msg: Message): boolean {
  if (msg.parts.length === 0) {
    if (msg.info.role === 'assistant' && 'error' in msg.info && msg.info.error) {
      return msg.info.error.name !== 'MessageAbortedError'
    }
    return true
  }
  return msg.parts.some(part => {
    switch (part.type) {
      case 'text':
        return part.text?.trim().length > 0
      case 'reasoning':
        return part.text?.trim().length > 0
      case 'tool':
      case 'file':
      case 'agent':
      case 'step-finish':
      case 'subtask':
        return true
      default:
        return false
    }
  })
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max) + '\u2026'
}

function extractOutlineEntries(messages: Message[]): OutlineEntry[] {
  const entries: OutlineEntry[] = []
  for (const msg of messages.filter(messageHasContent)) {
    if (!isUserMessage(msg.info)) continue
    const title =
      msg.info.summary?.title?.trim() ||
      getMessageText(msg)
        .trim()
        .split(/\r?\n/)
        .map(l => l.trim())
        .find(Boolean)
    if (!title) continue
    entries.push({
      title: truncate(title, TITLE_MAX_LEN),
      messageId: msg.info.id,
    })
  }
  return entries
}

// ============================================
// Entry Component
// ============================================

export const OutlineIndex = memo(function OutlineIndex({ messages, onScrollToMessageId }: OutlineIndexProps) {
  const entries = useMemo(() => extractOutlineEntries(messages), [messages])
  const { interaction } = useChatViewport()
  if (entries.length < 2) return null

  return interaction.outlineInteraction === 'touch' ? (
    <MobileFisheye entries={entries} onSelect={onScrollToMessageId} />
  ) : (
    <DesktopFisheye entries={entries} onSelect={onScrollToMessageId} />
  )
})

// ============================================
// Shared props
// ============================================

interface FisheyeProps {
  entries: OutlineEntry[]
  onSelect: (messageId: string) => void
}

// ============================================
// Desktop: hover fisheye
// ============================================

const DesktopFisheye = memo(function DesktopFisheye({ entries, onSelect }: FisheyeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cursorYRef = useRef<number | null>(null)
  const strengthsRef = useRef<number[]>([])
  const rafIdRef = useRef(0)
  const isHoveringRef = useRef(false)
  const cachedRef = useRef<CachedItem[] | null>(null)

  // entries 变化时重置
  useEffect(() => {
    strengthsRef.current = entries.map(() => 0)
    cachedRef.current = null
  }, [entries])

  const getItems = useCallback(() => {
    cachedRef.current ??= queryCachedItems(containerRef.current, '[data-oi]', 'data-tick', 'data-label')
    return cachedRef.current
  }, [])

  // 动画循环
  const runLoop = useCallback(
    function loop() {
      const { alive } = applyFisheye(getItems(), cursorYRef.current, strengthsRef.current, DESKTOP)
      if (isHoveringRef.current || alive) {
        rafIdRef.current = requestAnimationFrame(loop)
      }
    },
    [getItems],
  )

  const ensureLoop = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(runLoop)
  }, [runLoop])

  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true
    // 扩展 hover 区域覆盖 label 弹出范围，防止鼠标移向 label 时丢失 hover
    const el = containerRef.current
    if (el) {
      el.style.paddingLeft = '200px'
      el.style.marginLeft = '-200px'
    }
    ensureLoop()
  }, [ensureLoop])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    cursorYRef.current = e.clientY
  }, [])

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false
    cursorYRef.current = null
    const el = containerRef.current
    if (el) {
      el.style.paddingLeft = ''
      el.style.marginLeft = ''
    }
    ensureLoop()
  }, [ensureLoop])

  // 点击后立即收回鱼眼，避免滚动期间 margin 反馈环路导致颤抖
  const handleItemClick = useCallback(
    (messageId: string) => {
      cursorYRef.current = null
      isHoveringRef.current = false
      const el = containerRef.current
      if (el) {
        el.style.paddingLeft = ''
        el.style.marginLeft = ''
      }
      ensureLoop()
      onSelect(messageId)
    },
    [onSelect, ensureLoop],
  )

  useEffect(() => () => cancelAnimationFrame(rafIdRef.current), [])

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-end absolute right-2 top-1/2 -translate-y-1/2 z-[5] py-1 select-none"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {entries.map(entry => (
        <div
          key={entry.messageId}
          data-oi
          className="relative flex items-center justify-end cursor-pointer"
          style={{ marginTop: `${DESKTOP.margin.min}px`, marginBottom: `${DESKTOP.margin.min}px` }}
          onClick={() => handleItemClick(entry.messageId)}
        >
          <div
            data-label
            className="absolute right-full mr-2.5 text-[13px] leading-none text-text-200 whitespace-nowrap cursor-pointer"
            style={{ opacity: 0, transform: 'translateX(10px)', visibility: 'hidden' }}
          >
            {entry.title}
          </div>
          <div
            data-tick
            className="rounded-full shrink-0"
            style={{
              width: `${DESKTOP.tickWidth.min}px`,
              height: `${DESKTOP.tickHeight}px`,
              backgroundColor: 'hsl(var(--border-300))',
            }}
          />
        </div>
      ))}
    </div>
  )
})

// ============================================
// Mobile: touch fisheye + overlay
// ============================================

const MobileFisheye = memo(function MobileFisheye({ entries, onSelect }: FisheyeProps) {
  const [overlayVisible, setOverlayVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayTitleRef = useRef<HTMLDivElement>(null)
  const touchYRef = useRef<number | null>(null)
  const strengthsRef = useRef<number[]>([])
  const rafIdRef = useRef(0)
  const isTouchingRef = useRef(false)
  const prevFocusIdxRef = useRef(-1)
  const cachedRef = useRef<CachedItem[] | null>(null)

  // 稳定 ref，供原生事件回调读取最新值
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  useEffect(() => {
    strengthsRef.current = entries.map(() => 0)
    cachedRef.current = null
  }, [entries])

  const getItems = useCallback(() => {
    cachedRef.current ??= queryCachedItems(containerRef.current, '[data-moi]', 'data-mtick', 'data-mlabel')
    return cachedRef.current
  }, [])

  const vibrate = useCallback(() => {
    try {
      const bridge = (window as unknown as { __opencode_android?: { vibrate?: (ms: number) => void } })
        .__opencode_android
      if (bridge?.vibrate) {
        bridge.vibrate(8)
        return
      }
      navigator.vibrate?.(5)
    } catch {
      /* ignore */
    }
  }, [])

  const runLoop = useCallback(
    function loop() {
      const { alive, focusIndex, maxStrength } = applyFisheye(
        getItems(),
        touchYRef.current,
        strengthsRef.current,
        MOBILE,
      )

      // 焦点切换 → 震动 + 更新 overlay 标题
      if (focusIndex >= 0 && maxStrength > 0.5 && focusIndex !== prevFocusIdxRef.current) {
        prevFocusIdxRef.current = focusIndex
        vibrate()
        const titleEl = overlayTitleRef.current
        if (titleEl) {
          titleEl.textContent = entriesRef.current[focusIndex]?.title ?? ''
          titleEl.style.opacity = '1'
          titleEl.style.transform = 'translateY(0px)'
        }
      }
      if ((focusIndex < 0 || maxStrength <= 0.5) && !isTouchingRef.current) {
        const titleEl = overlayTitleRef.current
        if (titleEl) {
          titleEl.style.opacity = '0'
          titleEl.style.transform = 'translateY(4px)'
        }
      }

      if (isTouchingRef.current || alive) {
        rafIdRef.current = requestAnimationFrame(loop)
      } else {
        setOverlayVisible(false)
      }
    },
    [getItems, vibrate],
  )

  const ensureLoopRef = useRef((..._: unknown[]) => {})
  ensureLoopRef.current = () => {
    cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(runLoop)
  }

  // 原生 addEventListener({ passive: false }) 才能 preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      isTouchingRef.current = true
      prevFocusIdxRef.current = -1
      touchYRef.current = e.touches[0].clientY
      setOverlayVisible(true)
      ensureLoopRef.current()
    }

    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      touchYRef.current = e.touches[0].clientY
    }

    const onTouchEnd = () => {
      const idx = prevFocusIdxRef.current
      const currentEntries = entriesRef.current
      if (idx >= 0 && idx < currentEntries.length) {
        onSelectRef.current(currentEntries[idx].messageId)
      }
      isTouchingRef.current = false
      touchYRef.current = null
      prevFocusIdxRef.current = -1
      const titleEl = overlayTitleRef.current
      if (titleEl) {
        titleEl.style.opacity = '0'
        titleEl.style.transform = 'translateY(4px)'
      }
      ensureLoopRef.current()
    }

    el.addEventListener('touchstart', onTouchStart, { passive: false })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  useEffect(() => () => cancelAnimationFrame(rafIdRef.current), [])

  return (
    <div>
      {/* 背景模糊 overlay + 居中标题 */}
      {overlayVisible && (
        <div className="absolute inset-0 z-[14] bg-bg-100/40 backdrop-blur-sm flex items-start justify-center pt-[30%]">
          <div
            ref={overlayTitleRef}
            className="text-lg font-semibold text-text-100 px-5 py-2 max-w-[75vw] text-center pointer-events-none"
            style={{
              opacity: 0,
              transform: 'translateY(4px)',
              transition: 'opacity 0.15s ease-out, transform 0.15s ease-out',
            }}
          />
        </div>
      )}

      {/* 索引条 */}
      <div
        ref={containerRef}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 z-[15] flex flex-col items-end pl-4 py-4 select-none"
      >
        {entries.map(entry => (
          <div
            key={entry.messageId}
            data-moi
            className="relative flex items-center justify-end"
            style={{ marginTop: `${MOBILE.margin.min}px`, marginBottom: `${MOBILE.margin.min}px` }}
          >
            <div
              data-mlabel
              className="absolute right-full mr-2.5 text-sm leading-none text-text-200 whitespace-nowrap pointer-events-none"
              style={{ opacity: 0, transform: 'translateX(12px)', visibility: 'hidden' }}
            >
              {truncate(entry.title, MOBILE_TITLE_MAX_LEN)}
            </div>
            <div
              data-mtick
              className="rounded-full shrink-0"
              style={{
                width: `${MOBILE.tickWidth.min}px`,
                height: `${MOBILE.tickHeight}px`,
                backgroundColor: 'hsl(var(--border-300))',
              }}
            />
          </div>
        ))}
      </div>
    </div>
  )
})
