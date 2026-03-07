// ============================================
// MentionTag Component
// 可复用的 mention 标签，支持点击复制
// ============================================

import { useState, useCallback, useRef, useEffect } from 'react'
import type { MentionType, MentionItem } from './types'
import { formatMentionLabel, getFileName, MENTION_COLORS } from './utils'
import { CheckIcon } from '../../components/Icons'

interface MentionTagProps {
  /** Mention 类型 */
  type: MentionType
  /** 完整值（用于复制） */
  value: string
  /** 显示名称，不传则从 value 提取 */
  displayName?: string
  /** 自定义点击回调 */
  onClick?: () => void
  /** 额外的 className */
  className?: string
  /** 是否在 contentEditable 中使用（影响事件处理） */
  inEditor?: boolean
}

/**
 * MentionTag - 显示一个 mention 标签
 * - 显示格式：@Type: name
 * - 点击复制完整路径
 * - 复制成功显示 ✓ 图标（不改变文字）
 */
export function MentionTag({ type, value, displayName, onClick, className = '', inEditor = false }: MentionTagProps) {
  const [copied, setCopied] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 清理 timeout，防止内存泄漏
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const name = displayName || getFileName(value)
  const label = formatMentionLabel(type, name)
  const colors = MENTION_COLORS[type]

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (onClick) {
        onClick()
        return
      }

      // 复制完整值
      navigator.clipboard.writeText(value).then(() => {
        setCopied(true)
        // 清理之前的 timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current)
        }
        timeoutRef.current = setTimeout(() => setCopied(false), 1500)
      })
    },
    [onClick, value],
  )

  return (
    <span
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium
        border cursor-pointer select-none transition-all
        hover:brightness-95 active:scale-[0.98]
        ${colors.bg} ${colors.text} ${colors.darkText} ${colors.border}
        ${className}
      `}
      onClick={handleClick}
      title={value}
      // contentEditable 相关属性
      {...(inEditor ? { contentEditable: 'false' } : {})}
    >
      {copied && <CheckIcon className="w-3 h-3 flex-shrink-0" />}
      <span className="truncate max-w-[200px]">{label}</span>
    </span>
  )
}

// ============================================
// RichText - 渲染包含 mention 的文本
// ============================================

import { parseMentions } from './utils'

interface RichTextProps {
  /** 包含 [[type:value]] 格式的文本 */
  text: string
  /** 额外的 className */
  className?: string
}

/**
 * RichText - 将带有 mention 标记的文本渲染为富文本
 */
export function RichText({ text, className = '' }: RichTextProps) {
  const segments = parseMentions(text)

  if (segments.length === 0) {
    return <span className={className}>{text}</span>
  }

  return (
    <span className={className}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={index}>{segment.content}</span>
        }
        return <MentionTag key={index} type={segment.mentionType!} value={segment.mentionValue!} />
      })}
    </span>
  )
}

// ============================================
// createMentionElement - 为 contentEditable 创建 mention DOM 元素
// ============================================

/**
 * 为 contentEditable 创建 mention span 元素
 * 用于在输入框中插入 mention 标签
 *
 * 返回 { element, cleanup } - 调用者需要在元素移除时调用 cleanup 清理事件监听器
 */
export function createMentionElement(item: MentionItem): { element: HTMLSpanElement; cleanup: () => void } {
  const span = document.createElement('span')
  const label = formatMentionLabel(item.type, item.displayName)

  // 设置样式类
  span.className = `mention-tag inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border cursor-pointer select-none`
  span.contentEditable = 'false'

  // 设置数据属性（用于序列化和样式）
  span.dataset.mentionType = item.type
  span.dataset.mentionValue = item.value
  span.dataset.mentionDisplay = item.displayName

  // 设置显示文本
  span.textContent = label
  span.title = `Click to copy: ${item.value}`

  // 用于清理的 timeout ref
  let copyTimeoutId: ReturnType<typeof setTimeout> | null = null

  // 点击复制功能
  const handleClick = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()

    navigator.clipboard.writeText(item.value).then(() => {
      // 显示复制成功（添加 ✓ 图标）
      // NOTE: 此处使用字符串拼接的内联 SVG，因为是原始 DOM 操作（innerHTML），无法使用 React 组件
      const originalContent = span.innerHTML
      const checkIcon =
        '<svg class="w-3 h-3 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'
      span.innerHTML = `${checkIcon}<span>${label}</span>`

      // 清理之前的 timeout
      if (copyTimeoutId) {
        clearTimeout(copyTimeoutId)
      }
      copyTimeoutId = setTimeout(() => {
        span.innerHTML = originalContent
        copyTimeoutId = null
      }, 1200)
    })
  }

  span.addEventListener('click', handleClick)

  // 返回清理函数
  const cleanup = () => {
    span.removeEventListener('click', handleClick)
    if (copyTimeoutId) {
      clearTimeout(copyTimeoutId)
      copyTimeoutId = null
    }
  }

  return { element: span, cleanup }
}
