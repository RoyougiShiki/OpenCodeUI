import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** 最大高度，超出时显示滚动条 */
  maxHeight?: string | number
  /** 是否隐藏滚动条 */
  hideScrollbar?: boolean
}

/**
 * 统一的滚动区域组件
 * 使用自定义滚动条样式，保持全局一致性
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ children, maxHeight, hideScrollbar = false, className = '', style, ...props }, ref) => {
    const scrollbarClass = hideScrollbar ? 'no-scrollbar' : 'custom-scrollbar'

    return (
      <div
        ref={ref}
        className={`overflow-y-auto overflow-x-hidden ${scrollbarClass} ${className}`}
        style={{
          maxHeight: typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
          ...style,
        }}
        {...props}
      >
        {children}
      </div>
    )
  },
)

ScrollArea.displayName = 'ScrollArea'

/**
 * 代码/预格式化文本滚动区域
 * 适用于工具输出、代码块等
 */
interface CodeScrollAreaProps extends ScrollAreaProps {
  /** 是否允许横向滚动 */
  horizontal?: boolean
}

export const CodeScrollArea = forwardRef<HTMLDivElement, CodeScrollAreaProps>(
  ({ children, horizontal = true, className = '', ...props }, ref) => {
    return (
      <ScrollArea
        ref={ref}
        className={`font-mono text-xs ${horizontal ? 'overflow-x-auto' : ''} ${className}`}
        {...props}
      >
        {children}
      </ScrollArea>
    )
  },
)

CodeScrollArea.displayName = 'CodeScrollArea'
