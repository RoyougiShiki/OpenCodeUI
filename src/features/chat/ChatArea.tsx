// ============================================
// ChatArea - 聊天消息显示区域
// ============================================
//
// 使用原生滚动 + CSS content-visibility 替代 react-virtuoso：
// - content-visibility: auto  跳过视口外元素的 layout/paint
// - overflow-anchor: none     禁用浏览器锚定，由 useLayoutEffect 手动补偿 prepend 位置
// - IntersectionObserver       追踪可见消息 / 触顶加载
// ============================================

import {
  useRef,
  useImperativeHandle,
  forwardRef,
  useState,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react'
import { MessageRenderer } from '../message'
import { messageStore } from '../../store'
import { useTheme } from '../../hooks/useTheme'
import { SpinnerIcon } from '../../components/Icons'
import type { Message } from '../../types/message'
import { RetryStatusInline, type RetryStatusInlineData } from './RetryStatusInline'
import { buildVisibleMessageEntries } from './chatAreaVisibility'
import { SCROLL_CHECK_INTERVAL_MS, AT_BOTTOM_THRESHOLD_PX, MESSAGE_PREFETCH_BUFFER } from '../../constants'
import { useIsMobile } from '../../hooks'
import { logger } from '../../utils/logger'

interface ChatAreaProps {
  messages: Message[]
  /** 当前 session ID */
  sessionId?: string | null
  /** 是否正在 streaming */
  isStreaming?: boolean
  /** @deprecated 位置保持改用 useLayoutEffect + scrollHeight 差值补偿，此 prop 不再使用 */
  prependedCount?: number
  /** Session 加载状态 */
  loadState?: 'idle' | 'loading' | 'loaded' | 'error'
  /** 是否还有更多历史消息 */
  hasMoreHistory?: boolean
  onLoadMore?: () => void | Promise<void>
  onUndo?: (userMessageId: string) => void
  canUndo?: boolean
  registerMessage?: (id: string, element: HTMLElement | null) => void
  retryStatus?: RetryStatusInlineData | null
  /** 底部留白高度（输入框实际高度），0 则用默认值 */
  bottomPadding?: number
  onVisibleMessageIdsChange?: (ids: string[]) => void
  onAtBottomChange?: (atBottom: boolean) => void
}

export type ChatAreaHandle = {
  scrollToBottom: (instant?: boolean) => void
  /** 只有用户在底部时才滚动 */
  scrollToBottomIfAtBottom: () => void
  /** 滚动到最后一条消息（显示在视口上部，用于 Undo 后） */
  scrollToLastMessage: () => void
  /** 临时禁用自动滚动（用于 undo/redo） */
  suppressAutoScroll: (duration?: number) => void
  /** 滚动到指定索引的消息 */
  scrollToMessageIndex: (index: number) => void
  /** 按消息 ID 滚动 */
  scrollToMessageId: (messageId: string) => void
}

export const ChatArea = memo(
  forwardRef<ChatAreaHandle, ChatAreaProps>(
    (
      {
        messages,
        sessionId,
        isStreaming = false,
        loadState = 'idle',
        onLoadMore,
        onUndo,
        canUndo,
        registerMessage,
        retryStatus = null,
        bottomPadding = 0,
        onVisibleMessageIdsChange,
        onAtBottomChange,
      },
      ref,
    ) => {
      // ---- DOM refs ----
      const scrollContainerRef = useRef<HTMLDivElement>(null)
      const topSentinelRef = useRef<HTMLDivElement>(null)

      const { isWideMode } = useTheme()
      const isMobile = useIsMobile()
      // 移动端输入框收起/展开导致高度差，加大阈值防抖动
      const atBottomThreshold = isMobile ? 150 : AT_BOTTOM_THRESHOLD_PX

      // ---- 滚动状态（3 个 ref 替代原来的 7 个） ----
      const isAtBottomRef = useRef(true)
      const userScrolledAwayRef = useRef(false) // 流式期间用户主动上滑
      const suppressScrollRef = useRef(false) // 临时禁用（undo/redo）
      const userInteractingRef = useRef(false) // 用户正在触摸/滚轮交互中
      const lastScrollTopRef = useRef(0)
      const isNearTopRef = useRef(false)

      // ---- 加载更多 ----
      const [isLoadingMore, setIsLoadingMore] = useState(false)
      const isLoadingMoreRef = useRef(false)
      const [showNoMoreHint, setShowNoMoreHint] = useState(false)
      const noMoreHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
      const [isNearTop, setIsNearTop] = useState(false)

      // ---- Prepend 位置保持 ----
      // handleLoadMore 发起前快照 scrollTop/scrollHeight/首条消息ID，
      // useLayoutEffect 检测首条 ID 变化后用差值补偿 scrollTop
      const prePrependRef = useRef<{ top: number; height: number; firstId: string } | null>(null)

      // ---- Session 切换 ----
      // 用 Symbol 做哨兵：首次 mount 时 prevSessionIdRef !== sessionId，
      // 确保首次加载也走 "隐藏 → snap → 淡入" 通道
      const SENTINEL = useRef(Symbol('init')).current
      const prevSessionIdRef = useRef<string | null | undefined | symbol>(SENTINEL)
      const initialScrollDoneRef = useRef<string | null>(null)
      // 容器可见性：隐藏状态下完成 scroll-to-bottom，就绪后淡入
      const [containerReady, setContainerReady] = useState(false)

      // ---- 可见消息追踪 ----
      const visibilityObserverRef = useRef<IntersectionObserver | null>(null)
      const observedElementsRef = useRef(new WeakSet<Element>())
      const visibleMsgIdsRef = useRef(new Set<string>())

      // ============================================
      // 数据处理
      // ============================================

      // 过滤空消息 + 合并连续工具 assistant 消息
      const visibleMessageEntries = useMemo(() => buildVisibleMessageEntries(messages), [messages])
      const visibleMessages = useMemo(() => visibleMessageEntries.map(entry => entry.message), [visibleMessageEntries])

      // 稳定引用，供回调和 handle 方法读取最新值
      const visibleMessagesRef = useRef(visibleMessages)
      visibleMessagesRef.current = visibleMessages
      const visibleMessageEntriesRef = useRef(visibleMessageEntries)
      visibleMessageEntriesRef.current = visibleMessageEntries
      const onVisibleMessageIdsChangeRef = useRef(onVisibleMessageIdsChange)
      onVisibleMessageIdsChangeRef.current = onVisibleMessageIdsChange

      // 计算每个回合的总时长：user.created → 最后一条 assistant.completed
      const turnDurationMap = useMemo(() => {
        const map = new Map<string, number>()
        for (let i = 0; i < visibleMessages.length; i++) {
          if (visibleMessages[i].info.role !== 'user') continue
          const userCreated = visibleMessages[i].info.time.created
          let lastAssistant: Message | undefined
          for (let j = i + 1; j < visibleMessages.length && visibleMessages[j].info.role !== 'user'; j++) {
            lastAssistant = visibleMessages[j]
          }
          if (lastAssistant?.info.time.completed) {
            map.set(lastAssistant.info.id, lastAssistant.info.time.completed - userCreated)
          }
        }
        return map
      }, [visibleMessages])

      const messageMaxWidthClass = isWideMode ? 'max-w-[95%] xl:max-w-6xl' : 'max-w-2xl'

      // ============================================
      // 滚动控制
      // ============================================

      // scroll 事件：更新 isAtBottom、isNearTop
      useEffect(() => {
        const el = scrollContainerRef.current
        if (!el) return
        const onScroll = () => {
          const currentTop = el.scrollTop
          const prevTop = lastScrollTopRef.current
          lastScrollTopRef.current = currentTop

          const atBottom = el.scrollHeight - currentTop - el.clientHeight <= atBottomThreshold
          const prev = isAtBottomRef.current
          isAtBottomRef.current = atBottom
          if (atBottom) userScrolledAwayRef.current = false

          // 用户正在交互且向上滚动（即使仍在阈值内）→ 标记 scrolledAway，暂停自动滚动
          if (userInteractingRef.current && currentTop < prevTop - 2) {
            userScrolledAwayRef.current = true
          }

          // 流式期间：用户主动交互导致离开底部 → 标记 scrolledAway
          // 必须检查 userInteractingRef 以区分"自动滚动触发的 onScroll"和"用户主动滑动"
          if (!atBottom && userInteractingRef.current) userScrolledAwayRef.current = true
          if (prev !== atBottom) onAtBottomChange?.(atBottom)
          // 边沿触发：只在 isNearTop 实际变化时 setState，避免每次 scroll 都 re-render
          const nearTop = currentTop < 150
          if (nearTop !== isNearTopRef.current) {
            isNearTopRef.current = nearTop
            setIsNearTop(nearTop)
          }
        }
        el.addEventListener('scroll', onScroll, { passive: true })
        return () => el.removeEventListener('scroll', onScroll)
      }, [atBottomThreshold, onAtBottomChange])

      // 流式期间：标记用户正在主动交互（触摸/滚轮）
      // touchstart/wheel 设标记，touchend/timeout 清除
      useEffect(() => {
        if (!isStreaming) return
        const el = scrollContainerRef.current
        if (!el) return
        let touchEndTimer: ReturnType<typeof setTimeout> | null = null
        const onTouchStart = () => {
          userInteractingRef.current = true
        }
        const onTouchEnd = () => {
          // 延迟清除：惯性滚动可能在 touchend 后继续触发 onScroll
          touchEndTimer = setTimeout(() => {
            userInteractingRef.current = false
          }, 300)
        }
        const onWheel = () => {
          userInteractingRef.current = true
          // wheel 事件无明确结束，用短超时自动清除
          if (touchEndTimer) clearTimeout(touchEndTimer)
          touchEndTimer = setTimeout(() => {
            userInteractingRef.current = false
          }, 150)
        }
        el.addEventListener('touchstart', onTouchStart, { passive: true })
        el.addEventListener('touchend', onTouchEnd, { passive: true })
        el.addEventListener('touchcancel', onTouchEnd, { passive: true })
        el.addEventListener('wheel', onWheel, { passive: true })
        return () => {
          el.removeEventListener('touchstart', onTouchStart)
          el.removeEventListener('touchend', onTouchEnd)
          el.removeEventListener('touchcancel', onTouchEnd)
          el.removeEventListener('wheel', onWheel)
          if (touchEndTimer) clearTimeout(touchEndTimer)
        }
      }, [isStreaming])

      // 流式自动滚动：定时 scrollTop = scrollHeight
      useEffect(() => {
        if (!isStreaming) return
        const interval = setInterval(() => {
          // 用户正在交互（触摸/滚轮）时暂停自动滚动，即使仍在底部阈值内
          if (
            suppressScrollRef.current ||
            userScrolledAwayRef.current ||
            userInteractingRef.current ||
            !isAtBottomRef.current
          )
            return
          const el = scrollContainerRef.current
          if (el) el.scrollTop = el.scrollHeight
        }, SCROLL_CHECK_INTERVAL_MS)
        return () => clearInterval(interval)
      }, [isStreaming])

      // 流式结束：重置"用户滚离"和交互标志
      useEffect(() => {
        if (!isStreaming) {
          userScrolledAwayRef.current = false
          userInteractingRef.current = false
        }
      }, [isStreaming])

      // Session 切换 / 首次 mount：重置滚动状态 + 隐藏容器
      // containerReady=false → 容器 opacity=0，所有 snap 在不可见状态下完成，
      // 就绪后由 revealContainer 设 containerReady=true 触发淡入。
      useEffect(() => {
        if (sessionId === prevSessionIdRef.current) return
        prevSessionIdRef.current = sessionId
        initialScrollDoneRef.current = null
        isAtBottomRef.current = true
        userScrolledAwayRef.current = false
        userInteractingRef.current = false
        suppressScrollRef.current = false
        visibleMsgIdsRef.current.clear()
        prePrependRef.current = null
        setContainerReady(!sessionId) // 无 session（home）直接可见
        // 同步通知父组件 isAtBottom 已重置为 true，
        // 否则移动端切换 session 后输入框会残留上一个 session 的收起状态
        onAtBottomChange?.(true)
      }, [sessionId, onAtBottomChange])

      // 加载中清除浏览器残留的 scrollTop
      useEffect(() => {
        if (!sessionId || loadState !== 'loading') return
        const el = scrollContainerRef.current
        if (el) el.scrollTop = 0
      }, [sessionId, loadState])

      // 滚动容器淡入（scroll-to-bottom 到位后 或 空 session / error）
      const revealContainer = useCallback(() => {
        setContainerReady(true)
      }, [])

      // Session 加载完成后定位到底部（只执行一次）
      // content-visibility: auto 首帧用估算高度（500px），渲染底部消息后 scrollHeight 才准确。
      // 用 rAF 循环持续 snap，直到 scrollHeight 连续 3 帧不变（渲染稳定）或超时 1s，
      // 整个过程在 opacity=0 下完成，到位后淡入显示。
      useEffect(() => {
        if (!sessionId) return

        // 加载出错：直接恢复可见
        if (loadState === 'error') {
          revealContainer()
          return
        }

        if (loadState !== 'loaded') return

        // 空 session：无需滚动，直接淡入
        if (visibleMessages.length === 0) {
          revealContainer()
          return
        }

        if (initialScrollDoneRef.current === sessionId) return
        initialScrollDoneRef.current = sessionId

        const el = scrollContainerRef.current
        if (!el) return

        let rafId: number
        let lastHeight = 0
        let stableFrames = 0
        const STABLE_THRESHOLD = 3
        const startTime = performance.now()

        const tick = () => {
          el.scrollTop = el.scrollHeight
          if (el.scrollHeight === lastHeight) {
            stableFrames++
          } else {
            stableFrames = 0
            lastHeight = el.scrollHeight
          }
          if (stableFrames >= STABLE_THRESHOLD || performance.now() - startTime > 1000) {
            revealContainer()
            return
          }
          rafId = requestAnimationFrame(tick)
        }
        tick()

        return () => cancelAnimationFrame(rafId)
      }, [sessionId, loadState, visibleMessages.length, revealContainer])

      // ============================================
      // 加载更多历史消息
      // ============================================

      const triggerNoMoreHint = useCallback(() => {
        setShowNoMoreHint(true)
        if (noMoreHintTimerRef.current) clearTimeout(noMoreHintTimerRef.current)
        noMoreHintTimerRef.current = setTimeout(() => {
          setShowNoMoreHint(false)
          noMoreHintTimerRef.current = null
        }, 1200)
      }, [])

      // handleLoadMore 不依赖 hasMoreHistory（从 store 直接读），
      // 避免每次加载后回调重建 → Observer 重连 → 无限循环
      const handleLoadMore = useCallback(async () => {
        if (!onLoadMore || !sessionId || isLoadingMoreRef.current) return
        const hadMore = messageStore.getSessionState(sessionId)?.hasMoreHistory ?? false
        if (!hadMore) return

        // 快照 prepend 前的滚动位置，供 useLayoutEffect 补偿
        const el = scrollContainerRef.current
        const msgs = visibleMessagesRef.current
        if (el && msgs.length > 0) {
          prePrependRef.current = { top: el.scrollTop, height: el.scrollHeight, firstId: msgs[0].info.id }
        }

        logger.log(`[ChatArea] loadMore: session=${sessionId}`)
        isLoadingMoreRef.current = true
        setIsLoadingMore(true)
        const minDelay = new Promise(r => setTimeout(r, 400))
        try {
          await Promise.all([onLoadMore(), minDelay])
          const latestHasMore = messageStore.getSessionState(sessionId)?.hasMoreHistory ?? false
          if (hadMore && !latestHasMore) triggerNoMoreHint()
        } finally {
          isLoadingMoreRef.current = false
          setIsLoadingMore(false)
        }
      }, [onLoadMore, sessionId, triggerNoMoreHint])

      // 稳定 ref：IntersectionObserver 和 auto-continue 通过 ref 调用最新 handleLoadMore，
      // 避免回调重建导致 observer 断开重连
      const handleLoadMoreRef = useRef(handleLoadMore)
      handleLoadMoreRef.current = handleLoadMore

      // IntersectionObserver：顶部哨兵触发加载（只创建一次）
      useEffect(() => {
        const sentinel = topSentinelRef.current
        const root = scrollContainerRef.current
        if (!sentinel || !root) return
        const observer = new IntersectionObserver(
          ([entry]) => {
            if (entry.isIntersecting && !isLoadingMoreRef.current) void handleLoadMoreRef.current()
          },
          { root, rootMargin: '200px 0px 0px 0px' },
        )
        observer.observe(sentinel)
        return () => observer.disconnect()
      }, [])

      // 用户停在顶部时自动继续拉取
      useEffect(() => {
        if (!onLoadMore || isLoadingMore || isLoadingMoreRef.current || !isNearTop || !sessionId) return
        const latestHasMore = messageStore.getSessionState(sessionId)?.hasMoreHistory ?? false
        if (!latestHasMore) return
        const timer = setTimeout(() => {
          // 再次检查实际位置，避免 stale state 误触发
          const el = scrollContainerRef.current
          if (!el || el.scrollTop >= 150 || isLoadingMoreRef.current) return
          void handleLoadMoreRef.current()
        }, 300)
        return () => clearTimeout(timer)
      }, [onLoadMore, isLoadingMore, isNearTop, sessionId])

      // 定时器清理
      useEffect(() => {
        return () => {
          if (noMoreHintTimerRef.current) clearTimeout(noMoreHintTimerRef.current)
        }
      }, [])

      // Prepend 后恢复滚动位置
      // 手动补偿 scrollTop：检测首条消息 ID 变化 → scrollTop += scrollHeight 增量
      // 补偿期间临时禁用 overflow-anchor 防止浏览器锚定与手动补偿冲突
      useLayoutEffect(() => {
        const snap = prePrependRef.current
        if (!snap) return
        prePrependRef.current = null

        const el = scrollContainerRef.current
        if (!el || visibleMessages.length === 0) return

        // 首条消息 ID 没变 → 不是 prepend，跳过
        if (visibleMessages[0].info.id === snap.firstId) return

        const delta = el.scrollHeight - snap.height
        if (delta > 0) {
          // 临时禁用 overflow-anchor 防止浏览器锚定干扰手动补偿
          el.style.overflowAnchor = 'none'
          el.scrollTop = snap.top + delta
          // 下一帧恢复 anchor（让正常滚动受益于锚定）
          requestAnimationFrame(() => {
            el.style.overflowAnchor = ''
          })
        }
      }, [visibleMessages])

      // ============================================
      // 可见消息追踪（IntersectionObserver）
      // ============================================

      // 创建 visibility observer — 组件生命周期内只创建一次
      // rootMargin: '100% 0px' 上下各扩展一屏，提前触发预取
      useEffect(() => {
        const root = scrollContainerRef.current
        if (!root) return

        const observer = new IntersectionObserver(
          entries => {
            let changed = false
            for (const entry of entries) {
              const id = entry.target.getAttribute('data-message-id')
              if (!id) continue
              if (entry.isIntersecting) {
                if (!visibleMsgIdsRef.current.has(id)) {
                  visibleMsgIdsRef.current.add(id)
                  changed = true
                }
              } else if (visibleMsgIdsRef.current.has(id)) {
                visibleMsgIdsRef.current.delete(id)
                changed = true
              }
            }
            if (!changed) return

            const cb = onVisibleMessageIdsChangeRef.current
            if (!cb) return
            const currentEntries = visibleMessageEntriesRef.current
            const visibleIds = visibleMsgIdsRef.current

            // 找到可见范围的 min/max index → 加 buffer → 收集 sourceIds
            let minIdx = currentEntries.length
            let maxIdx = -1
            for (let i = 0; i < currentEntries.length; i++) {
              if (visibleIds.has(currentEntries[i].message.info.id)) {
                if (i < minIdx) minIdx = i
                if (i > maxIdx) maxIdx = i
              }
            }
            if (maxIdx < 0) return

            const start = Math.max(0, minIdx - MESSAGE_PREFETCH_BUFFER)
            const end = Math.min(currentEntries.length - 1, maxIdx + MESSAGE_PREFETCH_BUFFER)
            const ids: string[] = []
            for (let i = start; i <= end; i++) {
              const sourceIds = currentEntries[i]?.sourceIds
              if (sourceIds?.length) ids.push(...sourceIds)
            }
            cb(ids)
          },
          { root, rootMargin: '100% 0px' },
        )

        visibilityObserverRef.current = observer
        return () => {
          observer.disconnect()
          visibilityObserverRef.current = null
        }
      }, [])

      // 注册消息元素到 visibility observer（引用稳定，不会导致重复 observe）
      const observeMessage = useCallback((el: HTMLDivElement | null) => {
        if (el && visibilityObserverRef.current && !observedElementsRef.current.has(el)) {
          visibilityObserverRef.current.observe(el)
          observedElementsRef.current.add(el)
        }
      }, [])

      // ============================================
      // Imperative Handle
      // ============================================

      useImperativeHandle(
        ref,
        () => ({
          scrollToBottom: (instant = false) => {
            const el = scrollContainerRef.current
            if (!el) return
            el.scrollTo({ top: el.scrollHeight, behavior: instant ? 'auto' : 'smooth' })
          },
          scrollToBottomIfAtBottom: () => {
            if (suppressScrollRef.current || !isAtBottomRef.current || userScrolledAwayRef.current) return
            const el = scrollContainerRef.current
            if (el) el.scrollTop = el.scrollHeight
          },
          scrollToLastMessage: () => {
            const msgs = visibleMessagesRef.current
            if (msgs.length === 0) return
            const lastId = msgs[msgs.length - 1].info.id
            scrollContainerRef.current
              ?.querySelector(`[data-message-id="${lastId}"]`)
              ?.scrollIntoView({ block: 'start', behavior: 'auto' })
          },
          suppressAutoScroll: (duration = 500) => {
            suppressScrollRef.current = true
            setTimeout(() => {
              suppressScrollRef.current = false
            }, duration)
          },
          scrollToMessageIndex: (index: number) => {
            const msg = visibleMessagesRef.current[index]
            if (!msg) return
            suppressScrollRef.current = true
            setTimeout(() => {
              suppressScrollRef.current = false
            }, 1000)
            scrollContainerRef.current
              ?.querySelector(`[data-message-id="${msg.info.id}"]`)
              ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          },
          scrollToMessageId: (messageId: string) => {
            suppressScrollRef.current = true
            setTimeout(() => {
              suppressScrollRef.current = false
            }, 1000)
            scrollContainerRef.current
              ?.querySelector(`[data-message-id="${messageId}"]`)
              ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
          },
        }),
        [],
      )

      // ============================================
      // 渲染
      // ============================================

      const renderMessage = useCallback(
        (msg: Message) => {
          const handleRef = (el: HTMLDivElement | null) => {
            if (el) {
              // 清除可能残留的动画样式
              el.style.opacity = ''
              el.style.transform = ''
              el.style.transition = ''
            }
            registerMessage?.(msg.info.id, el)
          }

          return (
            <div
              ref={handleRef}
              className={`w-full ${messageMaxWidthClass} mx-auto px-4 py-3 transition-[max-width] duration-300 ease-in-out`}
            >
              <div className={`flex ${msg.info.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`min-w-0 group ${msg.info.role === 'assistant' ? 'w-full' : ''}`}>
                  <MessageRenderer
                    message={msg}
                    turnDuration={turnDurationMap.get(msg.info.id)}
                    onUndo={onUndo}
                    canUndo={canUndo}
                    onEnsureParts={id => {
                      if (!sessionId) return
                      void messageStore.hydrateMessageParts(sessionId, id)
                    }}
                  />
                </div>
              </div>
            </div>
          )
        },
        [registerMessage, onUndo, canUndo, messageMaxWidthClass, sessionId, turnDurationMap],
      )

      const showSessionLoading = !!sessionId && loadState === 'loading' && visibleMessages.length === 0

      return (
        <div className="h-full overflow-hidden contain-strict relative">
          {/* Session 加载中 spinner — 延迟 150ms 显示，避免快速加载时闪烁 */}
          {showSessionLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 text-text-400 session-loading-indicator">
                <SpinnerIcon size={24} className="animate-spin" />
                <span className="text-sm">Loading session...</span>
              </div>
            </div>
          )}

          {/* 顶部加载 spinner */}
          {isLoadingMore && isNearTop && (
            <div className="absolute top-24 left-0 right-0 z-10 flex justify-center pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-100/90 border border-border-200 shadow-sm text-text-400 animate-in fade-in slide-in-from-top-2 duration-200">
                <SpinnerIcon size={14} className="animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            </div>
          )}

          {/* 没有更多历史提示 */}
          {!isLoadingMore && showNoMoreHint && isNearTop && (
            <div className="absolute top-24 left-0 right-0 z-10 flex justify-center pointer-events-none">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-bg-100/90 border border-border-200 shadow-sm text-text-400 animate-in fade-in slide-in-from-top-2 duration-200">
                <span className="text-xs">No more history</span>
              </div>
            </div>
          )}

          {/* 滚动容器 — containerReady 控制可见性和淡入动画 */}
          <div
            ref={scrollContainerRef}
            className={`h-full overflow-y-auto custom-scrollbar contain-content${
              containerReady ? ' animate-fade-in' : ' chat-scroll-hidden'
            }`}
          >
            {/* 顶部哨兵：IntersectionObserver 触发加载更多 */}
            <div ref={topSentinelRef} className="h-px" aria-hidden="true" />

            {/* 顶部留白 */}
            <div className="h-20" />

            {/* 消息列表 */}
            {visibleMessages.map(msg => (
              <div key={msg.info.id} ref={observeMessage} data-message-id={msg.info.id} className="chat-message-item">
                {renderMessage(msg)}
              </div>
            ))}

            {/* Retry 状态 */}
            {retryStatus && (
              <div className={`w-full ${messageMaxWidthClass} mx-auto px-4`}>
                <div className="flex justify-start">
                  <div className="w-full min-w-0">
                    <RetryStatusInline status={retryStatus} />
                  </div>
                </div>
              </div>
            )}

            {/* 底部留白 */}
            <div
              style={{
                height: bottomPadding > 0 ? `${bottomPadding + 16}px` : '256px',
              }}
            />
          </div>
        </div>
      )
    },
  ),
)
