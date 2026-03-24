import { memo, useMemo, useSyncExternalStore } from 'react'
import { useSyntaxHighlight } from '../hooks/useSyntaxHighlight'
import { themeStore } from '../store/themeStore'
import { CopyButton } from './ui'
import { useInView } from '../hooks/useInView'

/** Languages that carry no useful information — hide the label */
const HIDDEN_LANGS = new Set(['text', 'plain', 'txt', 'plaintext'])

interface CodeBlockProps {
  code: string
  language?: string
  className?: string
  style?: React.CSSProperties
  /** Display variant: 'default' shows chrome (label + copy), 'reasoning' is minimal */
  variant?: 'default' | 'reasoning'
  /** 最大高度 */
  maxHeight?: number
  /** 长行自动换行 */
  wordwrap?: boolean
}

export const CodeBlock = memo(function CodeBlock({
  code,
  language,
  className = '',
  style,
  variant = 'default',
  maxHeight,
  wordwrap,
}: CodeBlockProps) {
  const { codeWordWrap } = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot)
  const resolvedWordWrap = wordwrap ?? codeWordWrap
  const isReasoning = variant === 'reasoning'

  // Lazy load highlighting when close to viewport
  const { ref, inView } = useInView({ triggerOnce: true, rootMargin: '200px' })

  // Auto-detect tree structure if language is missing or text
  const effectiveLanguage = useMemo(() => {
    if (language && language !== 'text') return language

    // Check for tree structure characters
    if (code.includes('├──') || code.includes('└──') || (code.includes('│') && code.includes('──'))) {
      return 'yaml'
    }

    return language || 'text'
  }, [code, language])

  const { output: html } = useSyntaxHighlight(code, { lang: effectiveLanguage, enabled: inView })

  const containerStyle = maxHeight ? { ...style, maxHeight } : style
  const showLabel = !isReasoning && language && !HIDDEN_LANGS.has(language.toLowerCase())

  // --- Shared sub-components ---

  const wrapClasses = resolvedWordWrap ? 'whitespace-pre-wrap break-words [overflow-wrap:anywhere]' : ''

  const scrollClasses = resolvedWordWrap
    ? 'overflow-y-auto overflow-x-hidden custom-scrollbar'
    : 'overflow-auto custom-scrollbar'

  // Padding: reasoning is tighter; default reserves top for label row and right for copy button
  const contentPad = isReasoning ? 'p-3' : showLabel ? 'pt-8 pb-3 px-4' : 'p-4'
  const contentPadShiki = isReasoning
    ? '[&_pre]:p-3 [&_pre]:m-0'
    : showLabel
      ? '[&_pre]:pt-8 [&_pre]:pb-3 [&_pre]:px-4 [&_pre]:m-0'
      : '[&_pre]:p-4 [&_pre]:m-0'

  const fontSize = isReasoning ? 'text-xs' : 'text-[13px]'
  const lineHeight = isReasoning ? 'leading-5' : 'leading-6'
  const textColor = isReasoning ? 'text-text-300' : 'text-text-200'

  const content = !html ? (
    <pre className={`${contentPad} m-0 font-mono ${textColor} ${fontSize} ${lineHeight} ${wrapClasses}`}>
      <code>{code}</code>
    </pre>
  ) : (
    <div
      className={`shiki-wrapper ${fontSize} ${lineHeight} ${contentPadShiki} [&_pre]:bg-transparent! [&_code]:font-mono ${
        resolvedWordWrap
          ? '[&_pre]:!whitespace-pre-wrap [&_pre]:break-words [&_pre]:[overflow-wrap:anywhere] [&_code]:!whitespace-pre-wrap [&_code]:break-words [&_code]:[overflow-wrap:anywhere]'
          : ''
      }`}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html as string }}
    />
  )

  // --- Reasoning: minimal shell ---
  if (isReasoning) {
    return (
      <div
        ref={ref}
        className={`rounded-sm overflow-hidden bg-bg-200/25 contain-content ${className}`}
        style={containerStyle}
      >
        <div className={scrollClasses} style={maxHeight ? { maxHeight } : undefined}>
          {content}
        </div>
      </div>
    )
  }

  // --- Default: light panel with floating chrome ---
  return (
    <div
      ref={ref}
      className={`group/code relative rounded-md overflow-hidden border border-border-200/40 bg-bg-200/40 w-full max-w-full flex flex-col contain-content ${className}`}
      style={style}
    >
      {/* Language label — top-left, always visible */}
      {showLabel && (
        <span className="absolute top-2 left-4 z-10 text-[11px] text-text-500 font-medium tracking-wide select-none pointer-events-none">
          {language}
        </span>
      )}

      {/* Copy button — top-right, ghost style, appears on hover */}
      <CopyButton
        text={code}
        position="static"
        className="!p-1 absolute top-2 right-2 z-10 opacity-0 group-hover/code:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
      />

      {/* Scrollable content */}
      <div className={scrollClasses} style={maxHeight ? { maxHeight } : undefined}>
        {content}
      </div>
    </div>
  )
})
