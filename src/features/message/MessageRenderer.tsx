import { memo, useState, useRef, useEffect, useLayoutEffect, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { animate } from 'motion/mini'
import { ChevronDownIcon, ChevronRightIcon, SplitIcon, SpinnerIcon, UndoIcon } from '../../components/Icons'
import { CopyButton, SmoothHeight } from '../../components/ui'
import { useDelayedRender } from '../../hooks'
import { useTheme } from '../../hooks/useTheme'
import {
  useInlineToolRequests,
  findPermissionRequestForTool,
  findQuestionRequestForTool,
} from '../chat/InlineToolRequestContext'
import {
  TextPartView,
  ReasoningPartView,
  ToolPartView,
  FilePartView,
  AgentPartView,
  SyntheticTextPartView,
  StepFinishPartView,
  SubtaskPartView,
  RetryPartView,
  CompactionPartView,
  MessageErrorView,
} from './parts'
import type {
  Message,
  Part,
  TextPart,
  ReasoningPart,
  ToolPart,
  FilePart,
  AgentPart,
  StepFinishPart,
  SubtaskPart,
  RetryPart,
  CompactionPart,
  AssistantMessageInfo,
} from '../../types/message'
import { formatDuration } from '../../utils/formatUtils'

interface MessageRendererProps {
  message: Message
  allowStreamingLayoutAnimation?: boolean
  /** 回合总时长（毫秒），仅在回合最后一条 assistant 消息上有值 */
  turnDuration?: number
  onUndo?: (userMessageId: string) => void
  onFork?: (message: Message) => Promise<void> | void
  canUndo?: boolean
  onEnsureParts?: (messageId: string) => void
}

export const MessageRenderer = memo(function MessageRenderer({
  message,
  allowStreamingLayoutAnimation = true,
  turnDuration,
  onUndo,
  onFork,
  canUndo,
  onEnsureParts,
}: MessageRendererProps) {
  const { info } = message
  const isUser = info.role === 'user'

  if (isUser) {
    return <UserMessageView message={message} onUndo={onUndo} onFork={onFork} canUndo={canUndo} />
  }

  return (
    <AssistantMessageView
      message={message}
      allowStreamingLayoutAnimation={allowStreamingLayoutAnimation}
      turnDuration={turnDuration}
      onEnsureParts={onEnsureParts}
    />
  )
})

// ============================================
// 入场生长动画 hook — 新消息作为对话流的延续，从 height 0 平滑展开
// ============================================

function useEntryGrowAnimation(created: number) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || Date.now() - created > 3000) return
    const targetHeight = el.scrollHeight
    el.style.height = '0px'
    el.style.clipPath = 'inset(0 -100% 0 -100%)'
    animate(el, { height: `${targetHeight}px` }, { duration: 0.2, ease: 'easeOut' }).then(() => {
      el.style.height = ''
      el.style.clipPath = ''
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return ref
}

// ============================================
// Collapsible User Text
// ============================================

/** 默认预览 8 行 */
const COLLAPSE_PREVIEW_LINES = 8

// 折叠状态缓存：消息是否溢出、用户是否手动展开过
const overflowStateCache = new Map<string, boolean>()
const expandedMessages = new Set<string>()

const CollapsibleUserText = memo(function CollapsibleUserText({
  text,
  collapseEnabled,
  messageId,
}: {
  text: string
  collapseEnabled: boolean
  messageId: string
}) {
  const { t } = useTranslation('message')
  const contentRef = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(() => expandedMessages.has(messageId))
  const [isOverflow, setIsOverflow] = useState(() => overflowStateCache.get(messageId) ?? false)

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return

    let disposed = false
    const measure = () => {
      if (disposed) return
      const lineHeight = Number.parseFloat(window.getComputedStyle(el).lineHeight)
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return
      const collapsedHeight = lineHeight * COLLAPSE_PREVIEW_LINES
      const next = el.scrollHeight > collapsedHeight + 1
      overflowStateCache.set(messageId, next)
      setIsOverflow(prev => (prev === next ? prev : next))
    }

    measure()
    const resizeObserver = new ResizeObserver(measure)
    resizeObserver.observe(el)
    document.fonts?.ready?.then(measure)

    return () => {
      disposed = true
      resizeObserver.disconnect()
    }
  }, [text, messageId])

  const showCollapse = collapseEnabled && isOverflow
  const isCollapsed = collapseEnabled && !expanded

  return (
    <div className="px-4 py-2.5 bg-bg-300 rounded-2xl max-w-full">
      <div className="relative">
        <p
          ref={contentRef}
          className={`m-0 whitespace-pre-wrap break-words text-sm text-text-100 leading-relaxed${
            isCollapsed ? ' overflow-hidden' : ''
          }`}
          style={isCollapsed ? { maxHeight: `${COLLAPSE_PREVIEW_LINES}lh` } : undefined}
        >
          {text}
        </p>
        {/* 底部渐变遮罩 */}
        {showCollapse && isCollapsed && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-bg-300 to-transparent pointer-events-none" />
        )}
      </div>
      {showCollapse && (
        <button
          onClick={() => {
            setExpanded(prev => {
              const next = !prev
              if (next) expandedMessages.add(messageId)
              else expandedMessages.delete(messageId)
              return next
            })
          }}
          className="mt-1 text-xs text-text-400 hover:text-text-200 transition-colors"
          aria-expanded={expanded}
        >
          {expanded ? t('showLess') : t('showMore')}
        </button>
      )}
    </div>
  )
})

// ============================================
// User Message View
// ============================================

interface UserMessageViewProps {
  message: Message
  onUndo?: (userMessageId: string) => void
  onFork?: (message: Message) => Promise<void> | void
  canUndo?: boolean
}

const UserMessageView = memo(function UserMessageView({ message, onUndo, onFork, canUndo }: UserMessageViewProps) {
  const { t } = useTranslation('message')
  const { parts, info } = message
  const [showSystemContext, setShowSystemContext] = useState(false)
  const [isForking, setIsForking] = useState(false)
  const shouldRenderSystemContext = useDelayedRender(showSystemContext)
  const { collapseUserMessages } = useTheme()

  const wrapperRef = useEntryGrowAnimation(info.time.created)

  // 分离不同类型的 parts
  const textParts = parts.filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
  const syntheticParts = parts.filter((p): p is TextPart => p.type === 'text' && !!p.synthetic)
  const fileParts = parts.filter((p): p is FilePart => p.type === 'file')
  const agentParts = parts.filter((p): p is AgentPart => p.type === 'agent')

  const hasSystemContext = syntheticParts.length > 0
  const messageText = textParts.map(p => p.text).join('')

  const handleFork = useCallback(async () => {
    if (!onFork || isForking) return

    setIsForking(true)

    try {
      await onFork(message)
    } catch {
      // 业务错误由上层统一处理
    } finally {
      setIsForking(false)
    }
  }, [isForking, message, onFork])

  return (
    <div ref={wrapperRef} className="flex flex-col items-end group">
      <div className="flex flex-col gap-1 items-end w-full">
        {/* 消息文本 */}
        {messageText && (
          <CollapsibleUserText text={messageText} collapseEnabled={collapseUserMessages} messageId={info.id} />
        )}

        {/* 用户附件 */}
        {(fileParts.length > 0 || agentParts.length > 0) && (
          <div className="mt-1 flex max-w-full min-w-0 flex-wrap gap-2 justify-end">
            {fileParts.map(part => (
              <FilePartView key={part.id} part={part} />
            ))}
            {agentParts.map(part => (
              <AgentPartView key={part.id} part={part} />
            ))}
          </div>
        )}

        {/* 系统上下文 */}
        {hasSystemContext && (
          <div className="flex flex-col items-end mt-1 w-full">
            <button
              onClick={() => setShowSystemContext(!showSystemContext)}
              className="flex items-center gap-1 text-xs text-text-400 hover:text-text-300 transition-colors py-1 px-2 rounded hover:bg-bg-200"
            >
              <span>
                {showSystemContext ? t('hideSystemContext') : t('showSystemContext', { count: syntheticParts.length })}
              </span>
              <span className={`transition-transform duration-300 ${showSystemContext ? 'rotate-180' : ''}`}>
                <ChevronDownIcon size={10} />
              </span>
            </button>

            <div
              className={`grid w-full transition-[grid-template-rows,opacity] duration-300 ease-out ${
                showSystemContext ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                {shouldRenderSystemContext && (
                  <div className="pt-2 flex max-w-full min-w-0 flex-wrap gap-2 justify-end">
                    {syntheticParts.map(part => (
                      <SyntheticTextPartView key={part.id} part={part} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          {/* Undo button */}
          {canUndo && onUndo && (
            <button
              onClick={() => onUndo(info.id)}
              className="p-1.5 rounded-md transition-colors duration-150 text-text-400 hover:text-text-200"
              title={t('undoFromHere')}
            >
              <UndoIcon />
            </button>
          )}
          {onFork && (
            <button
              onClick={() => void handleFork()}
              disabled={isForking}
              className="p-1.5 rounded-md transition-colors duration-150 text-text-400 hover:text-text-200 disabled:cursor-default disabled:text-text-500"
              title={isForking ? t('forkingFromHere') : t('forkFromHere')}
              aria-label={isForking ? t('forkingFromHere') : t('forkFromHere')}
            >
              {isForking ? <SpinnerIcon className="animate-spin" /> : <SplitIcon />}
            </button>
          )}
          {/* Copy button */}
          {messageText && <CopyButton text={messageText} position="static" />}
        </div>
      </div>
    </div>
  )
})

// ============================================
// Assistant Message View
// ============================================

const AssistantMessageView = memo(function AssistantMessageView({
  message,
  allowStreamingLayoutAnimation = true,
  turnDuration,
  onEnsureParts,
}: {
  message: Message
  allowStreamingLayoutAnimation?: boolean
  turnDuration?: number
  onEnsureParts?: (messageId: string) => void
}) {
  const { parts, isStreaming, info } = message
  const { stepFinishDisplay } = useTheme()

  const wrapperRef = useEntryGrowAnimation(info.time.created)

  useEffect(() => {
    if (parts.length === 0 && onEnsureParts) {
      onEnsureParts(message.info.id)
    }
  }, [parts.length, onEnsureParts, message.info.id])

  // 收集连续的 tool parts 合并渲染
  const renderItems = useMemo(() => groupPartsForRender(parts), [parts])

  // 判断哪些 reasoning part 已经结束（后面出现了任何非基础设施 part）
  // 直接检查源 parts 数组，而非 renderItems，因为 renderItems 会过滤掉空 text，
  // 但空 text part 的存在本身就说明模型已经进入了下一输出阶段
  const endedReasoningIds = useMemo(() => {
    const ended = new Set<string>()
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].type !== 'reasoning') continue
      for (let j = i + 1; j < parts.length; j++) {
        const t = parts[j].type
        // snapshot/patch 是纯内部状态，不代表内容流转
        if (t === 'snapshot' || t === 'patch') continue
        // 任何其他 part 类型（包括空 text、step-start、tool 等）都说明思考已结束
        ended.add(parts[i].id)
        break
      }
    }
    return ended
  }, [parts])

  // 计算完整文本用于复制
  const fullText = parts
    .filter((p): p is TextPart => p.type === 'text' && !p.synthetic)
    .map(p => p.text)
    .join('')

  // 检查消息级别错误
  const messageError = (info as AssistantMessageInfo).error

  // 消息总耗时
  const { created, completed } = info.time
  const duration = completed != null ? completed - created : undefined
  const hasStepFinishPart = parts.some(part => part.type === 'step-finish')
  const showTurnDurationFooter =
    !isStreaming && !hasStepFinishPart && stepFinishDisplay.turnDuration && turnDuration != null && turnDuration > 0

  if (!isStreaming && parts.length === 0) {
    // 有错误时直接显示错误信息
    if (messageError) {
      return (
        <div className="flex flex-col gap-2 w-full">
          <MessageErrorView error={messageError} />
        </div>
      )
    }
    // parts 尚未 hydrate — 保留最小占位减少 CLS，不显示骨架/loading 文字
    // onEnsureParts 已在上方 useEffect 中触发 hydrate，parts 到位后自动 re-render
    return <div className="w-full min-h-[40px]" />
  }

  return (
    <div ref={wrapperRef} className="flex flex-col gap-2 w-full group">
      {/* 只在贴底跟随时保留高度补间；用户看历史时关闭，避免消息生长把视口顶走 */}
      <SmoothHeight isActive={!!isStreaming && allowStreamingLayoutAnimation}>
        <div className="flex flex-col gap-2">
          {renderItems.map((item: RenderItem, idx: number) => {
            // 耗时只在最后一个含 stepFinish 的 item 上显示
            const isLastStepFinish =
              idx ===
              renderItems.findLastIndex(it =>
                it.type === 'tool-group' ? !!it.stepFinish : it.part.type === 'step-finish',
              )

            if (item.type === 'tool-group') {
              return (
                <ToolGroup
                  key={item.parts[0].id}
                  parts={item.parts as ToolPart[]}
                  stepFinish={item.stepFinish}
                  duration={isLastStepFinish ? duration : undefined}
                  turnDuration={isLastStepFinish ? turnDuration : undefined}
                  isStreaming={isStreaming}
                />
              )
            }

            const part = item.part
            switch (part.type) {
              case 'text':
                return <TextPartView key={part.id} part={part as TextPart} isStreaming={isStreaming} />
              case 'reasoning': {
                const reasoningDone = endedReasoningIds.has(part.id)
                return (
                  <ReasoningPartView
                    key={part.id}
                    part={part as ReasoningPart}
                    isStreaming={isStreaming && !reasoningDone}
                  />
                )
              }
              case 'step-finish':
                return (
                  <StepFinishPartView
                    key={part.id}
                    part={part as StepFinishPart}
                    duration={isLastStepFinish ? duration : undefined}
                    turnDuration={isLastStepFinish ? turnDuration : undefined}
                  />
                )
              case 'subtask':
                return <SubtaskPartView key={part.id} part={part as SubtaskPart} />
              case 'retry':
                return <RetryPartView key={part.id} part={part as RetryPart} />
              case 'compaction':
                return <CompactionPartView key={part.id} part={part as CompactionPart} />
              default:
                return null
            }
          })}
        </div>
      </SmoothHeight>

      {/* Message-level error */}
      {messageError && <MessageErrorView error={messageError} />}

      {showTurnDurationFooter && (
        <div className="flex items-center gap-3 text-[10px] text-text-500 pl-5 py-0.5">
          <span>total {formatDuration(turnDuration!)}</span>
        </div>
      )}

      {/* Copy button */}
      {fullText.trim() && (
        <div className="md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <CopyButton text={fullText} position="static" />
        </div>
      )}
    </div>
  )
})

// ============================================
// Tool Group (连续的 tool parts)
// ============================================

interface ToolGroupProps {
  parts: ToolPart[]
  stepFinish?: StepFinishPart
  duration?: number
  turnDuration?: number
  isStreaming?: boolean
}

const ToolGroup = memo(function ToolGroup({ parts, stepFinish, duration, turnDuration, isStreaming }: ToolGroupProps) {
  const { t } = useTranslation('message')
  const { descriptiveToolSteps, inlineToolRequests } = useTheme()
  const { pendingPermissions, pendingQuestions } = useInlineToolRequests()
  const hasPendingInteraction =
    inlineToolRequests &&
    parts.some(part => {
      const childSessionId = getTaskChildSessionId(part)
      return (
        findPermissionRequestForTool(pendingPermissions, part.callID, childSessionId) ||
        findQuestionRequestForTool(pendingQuestions, part.callID, childSessionId)
      )
    })

  const doneCount = parts.filter(p => p.state.status === 'completed').length
  const totalCount = parts.length
  const isAllDone = doneCount === totalCount
  const hasActiveTools = parts.some(isToolPartActive)
  const hasErroredTools = parts.some(part => part.state.status === 'error')
  const stepsSummary = descriptiveToolSteps ? buildDescriptiveToolStepsSummary(parts, t) : undefined

  // descriptive 模式默认收起，运行时展开，完成后保持展开
  const [expanded, setExpanded] = useState(() => (descriptiveToolSteps ? false : true))

  useEffect(() => {
    if (!descriptiveToolSteps) return
    if (hasActiveTools || hasPendingInteraction) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExpanded(true)
    }
  }, [descriptiveToolSteps, hasActiveTools, hasPendingInteraction])

  const effectiveExpanded = expanded || hasPendingInteraction
  const shouldRenderBody = useDelayedRender(effectiveExpanded)

  // compact: 单工具时用紧凑布局（图标内联，无 timeline 连接线）
  // 不区分 streaming 状态 — 单工具始终 compact，第二个工具到来时再自然过渡到 timeline
  const isSingleCompact = totalCount === 1 && !descriptiveToolSteps
  // steps header: 多工具始终显示；描述型 steps 模式下，单工具也显示
  const showStepsHeader = totalCount > 1 || descriptiveToolSteps

  // 统一容器结构 — ToolPartView 始终在同一 React 树位置，
  // streaming→idle / 1→N 工具切换时不 remount，expanded 状态不丢失
  return (
    <SmoothHeight isActive={!!isStreaming}>
      <div className="flex flex-col">
        {showStepsHeader &&
          (descriptiveToolSteps ? (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="flex w-full items-start rounded-md py-1 text-left hover:bg-bg-200/30 transition-colors"
            >
              <span
                className={`min-w-0 flex-1 text-[12px] leading-5 ${
                  hasActiveTools ? 'reasoning-shimmer-text' : hasErroredTools ? 'text-danger-100' : 'text-text-300'
                }`}
              >
                {stepsSummary}
              </span>
            </button>
          ) : (
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 py-1.5 text-text-400 text-sm hover:text-text-200 hover:bg-bg-200/30 rounded-md transition-colors"
            >
              <span className="inline-flex w-[14px] items-center justify-center shrink-0">
                {effectiveExpanded ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
              </span>
              <span className="inline-flex items-baseline gap-2 whitespace-nowrap">
                <span className="text-[13px] font-medium leading-tight">
                  {isAllDone
                    ? t('stepsCount', { done: totalCount, total: totalCount })
                    : t('stepsCount', { done: doneCount, total: totalCount })}
                </span>
                {!effectiveExpanded && stepFinish && (
                  <span className="text-xs text-text-500 font-mono opacity-70">
                    {formatTokens(stepFinish.tokens, t)}
                  </span>
                )}
              </span>
            </button>
          ))}

        <div
          className={
            showStepsHeader
              ? `grid transition-[grid-template-rows] duration-300 ease-in-out ${effectiveExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`
              : ''
          }
        >
          <div
            className={showStepsHeader ? 'flex flex-col min-h-0 min-w-0 overflow-hidden' : 'flex flex-col'}
            style={showStepsHeader ? { clipPath: 'inset(0 -100% 0 -100%)' } : undefined}
          >
            {(!showStepsHeader || shouldRenderBody) &&
              parts.map((part, idx) => (
                <ToolPartView
                  key={part.id}
                  part={part}
                  isFirst={idx === 0}
                  isLast={idx === parts.length - 1}
                  compact={isSingleCompact}
                  descriptive={descriptiveToolSteps}
                />
              ))}
          </div>
        </div>

        {stepFinish && (
          <div className="mt-2">
            <StepFinishPartView part={stepFinish} duration={duration} turnDuration={turnDuration} />
          </div>
        )}
      </div>
    </SmoothHeight>
  )
})

// ============================================
// Helpers
// ============================================

function formatTokens(
  tokens: StepFinishPart['tokens'],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const total = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
  if (total >= 1000) {
    return t('tokensK', { count: (total / 1000).toFixed(1) })
  }
  return `${total} ${t('tokens')}`
}

type ToolSummaryCategory =
  | 'execute'
  | 'edit'
  | 'read'
  | 'search'
  | 'network'
  | 'task'
  | 'todo'
  | 'question'
  | 'think'
  | 'other'

type ToolSummaryPhase = 'done' | 'active'

function buildDescriptiveToolStepsSummary(
  parts: ToolPart[],
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  const doneSegments = collectToolSummaryCounts(parts.filter(part => part.state.status === 'completed')).map(
    ({ category, count }) => formatToolSummarySegment(category, count, 'done', t),
  )
  const failedCount = parts.filter(part => part.state.status === 'error').length
  const activeSegments = collectToolSummaryCounts(parts.filter(isToolPartActive)).map(({ category, count }) =>
    formatToolSummarySegment(category, count, 'active', t),
  )

  const segments = [...doneSegments]
  if (failedCount > 0) {
    segments.push(t('toolSteps.failed', { count: failedCount }))
  }
  segments.push(...activeSegments)

  if (segments.length === 0) {
    return t('stepsCount', { done: 0, total: parts.length })
  }

  return segments.join(t('toolSteps.separator'))
}

function collectToolSummaryCounts(parts: ToolPart[]): Array<{ category: ToolSummaryCategory; count: number }> {
  const counts = new Map<ToolSummaryCategory, number>()
  const order: ToolSummaryCategory[] = []

  for (const part of parts) {
    const category = getToolSummaryCategory(part.tool)
    if (!counts.has(category)) {
      order.push(category)
      counts.set(category, 0)
    }
    counts.set(category, (counts.get(category) || 0) + 1)
  }

  return order.map(category => ({ category, count: counts.get(category) || 0 }))
}

function formatToolSummarySegment(
  category: ToolSummaryCategory,
  count: number,
  phase: ToolSummaryPhase,
  t: (key: string, opts?: Record<string, unknown>) => string,
): string {
  switch (category) {
    case 'execute':
      return t(phase === 'active' ? 'toolSteps.executeActive' : 'toolSteps.executeDone', { count })
    case 'edit':
      return t(phase === 'active' ? 'toolSteps.editActive' : 'toolSteps.editDone', { count })
    case 'read':
      return t(phase === 'active' ? 'toolSteps.readActive' : 'toolSteps.readDone', { count })
    case 'search':
      return t(phase === 'active' ? 'toolSteps.searchActive' : 'toolSteps.searchDone', { count })
    case 'network':
      return t(phase === 'active' ? 'toolSteps.networkActive' : 'toolSteps.networkDone', { count })
    case 'task':
      return t(phase === 'active' ? 'toolSteps.taskActive' : 'toolSteps.taskDone', { count })
    case 'todo':
      return t(phase === 'active' ? 'toolSteps.todoActive' : 'toolSteps.todoDone', { count })
    case 'question':
      return t(phase === 'active' ? 'toolSteps.questionActive' : 'toolSteps.questionDone', { count })
    case 'think':
      return t(phase === 'active' ? 'toolSteps.thinkActive' : 'toolSteps.thinkDone', { count })
    default:
      return t(phase === 'active' ? 'toolSteps.otherActive' : 'toolSteps.otherDone', { count })
  }
}

function getToolSummaryCategory(toolName: string): ToolSummaryCategory {
  const lower = toolName.toLowerCase()

  if (lower.includes('todo')) return 'todo'
  if (lower === 'task') return 'task'
  if (lower.includes('question') || lower.includes('ask')) return 'question'
  if (
    lower.includes('bash') ||
    lower.includes('sh') ||
    lower.includes('cmd') ||
    lower.includes('terminal') ||
    lower.includes('shell')
  ) {
    return 'execute'
  }
  if (
    lower.includes('write') ||
    lower.includes('save') ||
    lower.includes('edit') ||
    lower.includes('replace') ||
    lower.includes('patch')
  ) {
    return 'edit'
  }
  if (lower.includes('read') || lower.includes('cat')) return 'read'
  if (lower.includes('search') || lower.includes('find') || lower.includes('grep') || lower.includes('glob')) {
    return 'search'
  }
  if (
    lower.includes('web') ||
    lower.includes('fetch') ||
    lower.includes('http') ||
    lower.includes('browse') ||
    lower.includes('network') ||
    lower.includes('exa')
  ) {
    return 'network'
  }
  if (lower.includes('think') || lower.includes('reason') || lower.includes('plan')) return 'think'
  return 'other'
}

function isToolPartActive(part: ToolPart): boolean {
  return part.state.status === 'running' || part.state.status === 'pending'
}

function getTaskChildSessionId(part: ToolPart): string | undefined {
  if (part.tool.toLowerCase() !== 'task') return undefined
  const metadata = part.state.metadata as Record<string, unknown> | undefined
  return metadata?.sessionId as string | undefined
}

// ============================================
// Helper: Group parts for rendering
// ============================================

type RenderItem = { type: 'single'; part: Part } | { type: 'tool-group'; parts: Part[]; stepFinish?: StepFinishPart }

/** parts[from..] 跳过基础设施和空内容后，下一个有意义的 part 是否为 tool */
function hasMoreToolsAhead(parts: Part[], from: number): boolean {
  for (let k = from; k < parts.length; k++) {
    const t = parts[k].type
    if (t === 'step-start' || t === 'step-finish' || t === 'snapshot' || t === 'patch') continue
    if (t === 'text' && !(parts[k] as TextPart).text?.trim()) continue
    if (t === 'reasoning' && !(parts[k] as ReasoningPart).text?.trim()) continue
    return t === 'tool'
  }
  return false
}

function groupPartsForRender(parts: Part[]): RenderItem[] {
  const result: RenderItem[] = []
  let toolGroup: ToolPart[] = []
  let stepFinish: StepFinishPart | undefined

  const flushToolGroup = (sf?: StepFinishPart) => {
    if (toolGroup.length === 0) return
    result.push({ type: 'tool-group', parts: toolGroup, stepFinish: sf })
    toolGroup = []
    stepFinish = undefined
  }

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]

    // 跳过不渲染的 parts
    if (part.type === 'step-start' || part.type === 'snapshot' || part.type === 'patch') continue
    if (part.type === 'text' && (!(part as TextPart).text?.trim() || (part as TextPart).synthetic)) continue
    if (part.type === 'reasoning' && !(part as ReasoningPart).text?.trim()) continue

    if (part.type === 'tool') {
      toolGroup.push(part as ToolPart)
    } else if (part.type === 'step-finish') {
      if (toolGroup.length > 0 && hasMoreToolsAhead(parts, i + 1)) {
        // 中间 step-finish：后面还有 tool，暂存不 flush
        stepFinish = part as StepFinishPart
      } else if (toolGroup.length > 0) {
        // 最后一个 step-finish，结束 tool group
        flushToolGroup(part as StepFinishPart)
      } else {
        result.push({ type: 'single', part })
      }
    } else {
      flushToolGroup(stepFinish)
      result.push({ type: 'single', part })
    }
  }

  flushToolGroup(stepFinish)
  return result
}
