// ============================================
// TerminalPanel - 多标签终端容器
// 底部面板，支持多终端标签和拖拽调整大小
// ============================================

import { memo, useCallback, useRef, useState, useEffect } from 'react'
import { Terminal } from './Terminal'
import { PlusIcon, CloseIcon, TerminalIcon, ChevronDownIcon } from './Icons'
import { layoutStore, useLayoutStore, type TerminalTab } from '../store/layoutStore'
import { createPtySession, removePtySession, listPtySessions } from '../api/pty'

// 常量
const MIN_HEIGHT = 100
const MAX_HEIGHT = 600

interface TerminalPanelProps {
  directory?: string
}

export const TerminalPanel = memo(function TerminalPanel({ directory }: TerminalPanelProps) {
  const { bottomPanelOpen, bottomPanelHeight, terminalTabs, activeTerminalId } = useLayoutStore()

  const [isResizing, setIsResizing] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const restoredRef = useRef(false)

  // 拖拽排序状态
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // 页面加载时恢复已有的 PTY sessions
  useEffect(() => {
    if (restoredRef.current || !directory) return
    restoredRef.current = true

    const restoreSessions = async () => {
      try {
        setIsRestoring(true)
        const sessions = await listPtySessions(directory)
        console.log('[TerminalPanel] Found existing PTY sessions:', sessions)

        if (sessions.length > 0) {
          // 恢复所有已有的 sessions，但不自动打开面板
          for (const pty of sessions) {
            // 检查是否已经在 tabs 中
            if (!layoutStore.getTerminalTabs().some(t => t.id === pty.id)) {
              const tab: TerminalTab = {
                id: pty.id,
                title: pty.title || 'Terminal',
                status: pty.running ? 'connecting' : 'exited',
              }
              layoutStore.addTerminalTab(tab, false) // 不自动打开面板
            }
          }
        }
      } catch (error) {
        console.error('[TerminalPanel] Failed to restore sessions:', error)
      } finally {
        setIsRestoring(false)
      }
    }

    restoreSessions()
  }, [directory])

  // 创建新终端
  const handleNewTerminal = useCallback(async () => {
    try {
      console.log('[TerminalPanel] Creating PTY session, directory:', directory)
      const pty = await createPtySession({ cwd: directory }, directory)
      console.log('[TerminalPanel] PTY created:', pty)
      const tab: TerminalTab = {
        id: pty.id,
        title: pty.title || 'Terminal',
        status: 'connecting',
      }
      layoutStore.addTerminalTab(tab)
    } catch (error) {
      console.error('[TerminalPanel] Failed to create terminal:', error)
    }
  }, [directory])

  // 关闭终端
  const handleCloseTerminal = useCallback(
    async (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      try {
        await removePtySession(id, directory)
      } catch {
        // ignore - may already be closed
      }
      layoutStore.removeTerminalTab(id)
    },
    [directory],
  )

  // 切换终端
  const handleSelectTerminal = useCallback((id: string) => {
    layoutStore.setActiveTerminal(id)
  }, [])

  // 折叠面板
  const handleCollapse = useCallback(() => {
    layoutStore.closeBottomPanel()
  }, [])

  // 拖拽调整高度 - 与侧边栏一致的交互
  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      setIsResizing(true)
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const startY = e.clientY
      const startHeight = bottomPanelHeight

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaY = startY - moveEvent.clientY
        const newHeight = Math.min(Math.max(startHeight + deltaY, MIN_HEIGHT), MAX_HEIGHT)
        layoutStore.setBottomPanelHeight(newHeight)
      }

      const handleMouseUp = () => {
        setIsResizing(false)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [bottomPanelHeight],
  )

  // 标签拖拽处理
  const handleDragStart = useCallback((id: string) => {
    setDraggedId(id)
  }, [])

  const handleDragOver = useCallback(
    (id: string) => {
      if (draggedId && draggedId !== id) {
        setDragOverId(id)
      }
    },
    [draggedId],
  )

  const handleDragEnd = useCallback(() => {
    if (draggedId && dragOverId) {
      layoutStore.reorderTerminalTabs(draggedId, dragOverId)
    }
    setDraggedId(null)
    setDragOverId(null)
  }, [draggedId, dragOverId])

  // 不显示面板
  if (!bottomPanelOpen) {
    return null
  }

  return (
    <div ref={panelRef} className="flex flex-col bg-bg-100 relative" style={{ height: bottomPanelHeight }}>
      {/* Resize Handle - 与侧边栏一致的设计 */}
      <div
        className={`
          absolute top-0 left-0 right-0 h-1.5 cursor-row-resize z-50
          hover:bg-accent-main-100/30 transition-colors -translate-y-1/2
          ${isResizing ? 'bg-accent-main-100/50' : 'bg-transparent'}
        `}
        onMouseDown={handleResizeStart}
      />

      {/* 顶部分界线 - 与侧边栏 border 一致 */}
      <div className="h-px bg-border-200/50 shrink-0" />

      {/* Header */}
      <div className="flex items-center justify-between px-2 py-1 shrink-0 border-b border-border-200/30">
        {/* Tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar flex-1 min-w-0">
          {terminalTabs.map(tab => (
            <TerminalTabButton
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTerminalId}
              isDragging={draggedId === tab.id}
              isDragOver={dragOverId === tab.id}
              onClick={() => handleSelectTerminal(tab.id)}
              onClose={e => handleCloseTerminal(tab.id, e)}
              onDragStart={() => handleDragStart(tab.id)}
              onDragOver={() => handleDragOver(tab.id)}
              onDragEnd={handleDragEnd}
            />
          ))}

          {/* New Terminal Button */}
          <button
            onClick={handleNewTerminal}
            className="p-1.5 ml-1 text-text-400 hover:text-text-100 hover:bg-bg-200/50 rounded-md transition-colors shrink-0"
            title="New Terminal"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={handleCollapse}
            className="p-1.5 text-text-400 hover:text-text-100 hover:bg-bg-200/50 rounded-md transition-colors"
            title="Hide Panel"
          >
            <ChevronDownIcon size={14} />
          </button>
        </div>
      </div>

      {/* Terminal Content - 背景与 xterm 一致 */}
      <div className="flex-1 min-h-0 relative bg-bg-100">
        {isRestoring ? (
          <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2">
            <TerminalIcon size={24} className="opacity-30 animate-pulse" />
            <span>Restoring sessions...</span>
          </div>
        ) : terminalTabs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-400 text-sm gap-2">
            <TerminalIcon size={24} className="opacity-30" />
            <span>No terminals</span>
            <button
              onClick={handleNewTerminal}
              className="px-3 py-1.5 text-xs bg-bg-200/50 hover:bg-bg-200 text-text-200 rounded-md transition-colors"
            >
              Create Terminal
            </button>
          </div>
        ) : (
          terminalTabs.map(tab => (
            <Terminal key={tab.id} ptyId={tab.id} directory={directory} isActive={tab.id === activeTerminalId} />
          ))
        )}
      </div>
    </div>
  )
})

// ============================================
// Terminal Tab Button - 与 RightPanel ViewTab 风格统一
// ============================================

interface TerminalTabButtonProps {
  tab: TerminalTab
  isActive: boolean
  isDragging: boolean
  isDragOver: boolean
  onClick: () => void
  onClose: (e: React.MouseEvent) => void
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
}

const TerminalTabButton = memo(function TerminalTabButton({
  tab,
  isActive,
  isDragging,
  isDragOver,
  onClick,
  onClose,
  onDragStart,
  onDragOver,
  onDragEnd,
}: TerminalTabButtonProps) {
  // 状态指示器颜色
  const statusColor = {
    connecting: 'bg-warning-100',
    connected: 'bg-success-100',
    disconnected: 'bg-text-500',
    exited: 'bg-danger-100',
  }[tab.status]

  // 拖拽手柄 - 只有图标区域可拖拽
  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', tab.id)
    onDragStart()
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragOver={e => {
        e.preventDefault()
        onDragOver()
      }}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`
        group flex items-center gap-1.5 px-2 py-1 rounded-md text-xs transition-all shrink-0
        border border-transparent cursor-pointer select-none
        ${
          isActive
            ? 'bg-bg-000 text-text-100 shadow-sm border-border-200/50'
            : 'text-text-300 hover:text-text-200 hover:bg-bg-200/50'
        }
        ${isDragging ? 'opacity-40 scale-95' : ''}
        ${isDragOver ? 'border-accent-main-100 bg-accent-main-100/10' : ''}
      `}
    >
      {/* Drag Handle + Status */}
      <div className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${statusColor}`} />
        <TerminalIcon size={12} className="shrink-0 opacity-60" />
      </div>

      {/* Title */}
      <span className="truncate max-w-[100px]">{tab.title}</span>

      {/* Close Button - 独立处理点击，阻止拖拽 */}
      <button
        type="button"
        onClick={e => {
          e.stopPropagation()
          onClose(e)
        }}
        onMouseDown={e => e.stopPropagation()}
        onDragStart={e => e.stopPropagation()}
        draggable={false}
        className={`
          p-1 -mr-0.5 rounded transition-all shrink-0
          hover:bg-danger-100/20 text-text-400 hover:text-danger-100
          ${isActive ? '' : 'opacity-0 group-hover:opacity-100'}
        `}
        title="Close terminal"
      >
        <CloseIcon size={12} />
      </button>
    </div>
  )
})
