import { memo, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDownIcon, ChevronRightIcon } from '../../../components/Icons'
import type { ToolPart } from '../../../types/message'
import { useDelayedRender } from '../../../hooks'
import { useTheme } from '../../../hooks/useTheme'
import { formatToolName, formatDuration } from '../../../utils/formatUtils'
import {
  useInlineToolRequests,
  findPermissionRequestForTool,
  findQuestionRequestForTool,
} from '../../chat/InlineToolRequestContext'
import { InlinePermission } from '../../chat/InlinePermission'
import { InlineQuestion } from '../../chat/InlineQuestion'
import {
  getToolIcon,
  extractToolData,
  getToolConfig,
  DefaultRenderer,
  TodoRenderer,
  TaskRenderer,
  hasTodos,
} from '../tools'

// ============================================
// ToolPartView - 单个工具调用
// ============================================

interface ToolPartViewProps {
  part: ToolPart
  isFirst?: boolean
  isLast?: boolean
  /** Compact layout: icon inline with text (14px column), no timeline connectors.
   *  Used for single-tool groups to align with ReasoningPartView. */
  compact?: boolean
  /** Descriptive steps mode: no icon/timeline, flat rows aligned with step summary. */
  descriptive?: boolean
}

export const ToolPartView = memo(function ToolPartView({
  part,
  isFirst = false,
  isLast = false,
  compact = false,
  descriptive = false,
}: ToolPartViewProps) {
  const { t } = useTranslation('message')
  const { state, tool: toolName } = part
  const title = state.title || ''

  const duration = state.time?.start && state.time?.end ? state.time.end - state.time.start : undefined

  const isActive = state.status === 'running' || state.status === 'pending'
  const isError = state.status === 'error'
  const [expanded, setExpanded] = useState(() => isActive)
  const { inlineToolRequests } = useTheme()

  const { pendingPermissions, pendingQuestions, onPermissionReply, onQuestionReply, onQuestionReject, isReplying } =
    useInlineToolRequests()
  const childSessionId = getTaskChildSessionId(part)
  const permissionRequest = inlineToolRequests
    ? findPermissionRequestForTool(pendingPermissions, part.callID, childSessionId)
    : undefined
  const questionRequest = inlineToolRequests
    ? findQuestionRequestForTool(pendingQuestions, part.callID, childSessionId)
    : undefined
  const hasPendingInteraction = !!permissionRequest || !!questionRequest
  const hideToolBodyForPermission =
    permissionRequest?.permission === 'edit' || permissionRequest?.permission === 'write'
  const effectiveExpanded = expanded || hasPendingInteraction
  const shouldRenderBody = useDelayedRender(effectiveExpanded)

  useEffect(() => {
    if (isActive || hasPendingInteraction) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 运行中或待交互时保持展开
      setExpanded(true)
    }
  }, [isActive, hasPendingInteraction])

  // Shared icon element
  const toolIcon = (
    <div
      className={`
      relative flex items-center justify-center transition-colors duration-200
      ${isActive ? 'text-accent-main-100' : ''}
      ${isError ? 'text-danger-100' : ''}
      ${state.status === 'completed' ? 'text-text-400 group-hover:text-text-300' : ''}
    `}
    >
      {isActive && (
        <span
          className="absolute inset-0 rounded-full bg-accent-main-100/20 animate-ping"
          style={{ animationDuration: '1.5s' }}
        />
      )}
      {getToolIcon(toolName)}
    </div>
  )

  const bodyContent = (
    <>
      {!hideToolBodyForPermission && <ToolBody part={part} />}
      {permissionRequest && (
        <div className={hideToolBodyForPermission ? '' : 'pt-2'}>
          <InlinePermission request={permissionRequest} onReply={onPermissionReply} isReplying={isReplying} />
        </div>
      )}
      {questionRequest && (
        <div className="pt-2">
          <InlineQuestion
            request={questionRequest}
            onReply={onQuestionReply}
            onReject={onQuestionReject}
            isReplying={isReplying}
          />
        </div>
      )}
    </>
  )

  if (descriptive) {
    const data = extractToolData(part)
    const exitCode = data.exitCode
    const diffStats = data.diffStats
    const hasDiffFiles = !!data.files?.length

    return (
      <div className="group py-0.5">
        <button
          type="button"
          className="flex w-full items-center rounded-md px-0 py-1 text-left hover:bg-bg-200/30 transition-colors group/header"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex min-w-0 flex-1 items-baseline gap-2 overflow-hidden">
            <span
              className={`shrink-0 font-medium text-[13px] leading-tight ${
                isActive
                  ? 'reasoning-shimmer-text'
                  : isError
                    ? 'text-danger-100'
                    : 'text-text-200 group-hover/header:text-text-100'
              }`}
            >
              {formatToolName(toolName)}
            </span>

            {title && (
              <span
                className={`min-w-0 flex-1 truncate font-mono text-xs ${
                  isActive ? 'reasoning-shimmer-text' : isError ? 'text-danger-100/80' : 'text-text-400'
                }`}
              >
                {title}
              </span>
            )}
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {/* Diff stats */}
            {!isActive && (diffStats || hasDiffFiles) && (
              <span className="flex items-center gap-1 text-[10px] font-mono font-medium tabular-nums">
                {(diffStats?.additions ?? 0) > 0 && <span className="text-success-100">+{diffStats!.additions}</span>}
                {(diffStats?.deletions ?? 0) > 0 && <span className="text-danger-100">-{diffStats!.deletions}</span>}
              </span>
            )}

            {/* Exit code */}
            {exitCode !== undefined && !isActive && (
              <span
                className={`text-[10px] font-mono font-medium tabular-nums ${
                  exitCode === 0 ? 'text-accent-secondary-100' : 'text-warning-100'
                }`}
              >
                exit:{exitCode}
              </span>
            )}

            {duration !== undefined && state.status === 'completed' && (
              <span
                className={`text-[10px] font-mono tabular-nums ${isError ? 'text-danger-100/70' : 'text-text-500'}`}
              >
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </button>

        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            effectiveExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">{shouldRenderBody && <div className="pb-2 pt-1">{bodyContent}</div>}</div>
        </div>
      </div>
    )
  }

  // ── Compact layout (single-tool, no timeline) ──
  // Grid: [14px icon] [gap 6px] [content] — mirrors ReasoningPartView alignment
  if (compact) {
    return (
      <div className="group relative grid grid-cols-[14px_minmax(0,1fr)] gap-x-1.5 items-start py-1">
        {/* Icon column — fixed, outside of interactive area */}
        <span className="inline-flex h-9 w-[14px] items-center justify-center shrink-0">{toolIcon}</span>

        {/* Content column */}
        <div className="min-w-0">
          <button
            className="flex items-center gap-2 w-full h-9 text-left px-2 hover:bg-bg-200/40 rounded-lg transition-colors group/header"
            onClick={() => setExpanded(!expanded)}
          >
            <div className="flex items-baseline gap-2 overflow-hidden flex-1 min-w-0">
              <span
                className={`font-medium text-[13px] leading-tight transition-colors duration-300 shrink-0 ${
                  isActive
                    ? 'text-accent-main-100'
                    : isError
                      ? 'text-danger-100'
                      : 'text-text-200 group-hover/header:text-text-100'
                }`}
              >
                {formatToolName(toolName)}
              </span>
              {title && (
                <span className="text-xs text-text-400 truncate min-w-0 flex-1 font-mono opacity-70">{title}</span>
              )}
            </div>
            <div className="flex items-center gap-2 ml-auto shrink-0">
              {duration !== undefined && state.status === 'completed' && (
                <span className="text-[10px] font-mono text-text-500 tabular-nums">{formatDuration(duration)}</span>
              )}
              <span
                className={`text-[10px] font-medium transition-all duration-300 ${
                  isActive ? 'opacity-100 text-accent-main-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                {t('toolPart.running')}
              </span>
              <span
                className={`text-[10px] font-medium transition-all duration-300 ${
                  isError ? 'opacity-100 text-danger-100' : 'opacity-0 w-0 overflow-hidden'
                }`}
              >
                {t('toolPart.failed')}
              </span>
              <span className="text-text-500">
                {effectiveExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
              </span>
            </div>
          </button>

          {/* Body */}
          <div
            className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
              effectiveExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
            }`}
          >
            <div className="overflow-hidden">
              {shouldRenderBody && <div className="pl-2 pr-2.5 pb-2 pt-1">{bodyContent}</div>}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Timeline layout (multi-tool groups) ──
  return (
    <div className="group relative flex min-w-0">
      {/* Timeline Column */}
      <div className="w-8 shrink-0 relative">
        {/* Top connector — 留 4px gap 到 icon */}
        {!isFirst && <div className="absolute left-1/2 -translate-x-1/2 top-0 h-[7px] w-px bg-border-300/40" />}

        {/* Tool icon — h-9 和右侧 header 等高，flex 自然居中 */}
        <div className="h-9 flex items-center justify-center relative z-10">{toolIcon}</div>

        {/* Bottom connector — 留 4px gap 到 icon */}
        {!isLast && <div className="absolute left-1/2 -translate-x-1/2 top-[29px] bottom-0 w-px bg-border-300/40" />}
      </div>

      {/* Content Column */}
      <div className="flex-1 min-w-0">
        {/* Header - h-9 和 timeline 图标行等高 */}
        <button
          className="flex items-center gap-2.5 w-full h-9 text-left px-2 hover:bg-bg-200/40 rounded-lg transition-colors group/header"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-baseline gap-2 overflow-hidden flex-1 min-w-0">
            <span
              className={`font-medium text-[13px] leading-tight transition-colors duration-300 shrink-0 ${
                isActive
                  ? 'text-accent-main-100'
                  : isError
                    ? 'text-danger-100'
                    : 'text-text-200 group-hover/header:text-text-100'
              }`}
            >
              {formatToolName(toolName)}
            </span>

            {title && (
              <span className="text-xs text-text-400 truncate min-w-0 flex-1 font-mono opacity-70">{title}</span>
            )}
          </div>

          <div className="flex items-center gap-2 ml-auto shrink-0">
            {duration !== undefined && state.status === 'completed' && (
              <span className="text-[10px] font-mono text-text-500 tabular-nums transition-opacity duration-300">
                {formatDuration(duration)}
              </span>
            )}
            <span
              className={`text-[10px] font-medium transition-all duration-300 ${
                isActive ? 'opacity-100 text-accent-main-100' : 'opacity-0 w-0 overflow-hidden'
              }`}
            >
              {t('toolPart.running')}
            </span>
            <span
              className={`text-[10px] font-medium transition-all duration-300 ${
                isError ? 'opacity-100 text-danger-100' : 'opacity-0 w-0 overflow-hidden'
              }`}
            >
              {t('toolPart.failed')}
            </span>
            <span className="text-text-500">
              {effectiveExpanded ? <ChevronDownIcon size={12} /> : <ChevronRightIcon size={12} />}
            </span>
          </div>
        </button>

        {/* Body - grid collapse */}
        <div
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
            effectiveExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
          }`}
        >
          <div className="overflow-hidden">
            {shouldRenderBody && <div className="pl-2 pr-2.5 pb-2 pt-1">{bodyContent}</div>}
          </div>
        </div>
      </div>
    </div>
  )
})

// ============================================
// ToolBody - 根据工具类型选择渲染器
// ============================================

function ToolBody({ part }: { part: ToolPart }) {
  const { tool } = part
  const lowerTool = tool.toLowerCase()
  const data = extractToolData(part)

  if (lowerTool === 'task') {
    return <TaskRenderer part={part} data={data} />
  }

  if (lowerTool.includes('todo') && hasTodos(part)) {
    return <TodoRenderer part={part} data={data} />
  }

  const config = getToolConfig(tool)
  if (config?.renderer) {
    const CustomRenderer = config.renderer
    return <CustomRenderer part={part} data={data} />
  }

  return <DefaultRenderer part={part} data={data} />
}

function getTaskChildSessionId(part: ToolPart): string | undefined {
  if (part.tool.toLowerCase() !== 'task') return undefined
  const metadata = part.state.metadata as Record<string, unknown> | undefined
  return metadata?.sessionId as string | undefined
}

// ============================================
// Helpers
// ============================================
