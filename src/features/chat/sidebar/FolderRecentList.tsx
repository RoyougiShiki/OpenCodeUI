import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ApiSession } from '../../../api'
import { FolderIcon, FolderOpenIcon, GripVerticalIcon, SpinnerIcon, CheckIcon } from '../../../components/Icons'
import { ExpandableSection } from '../../../components/ui'
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog'
import { useDelayedRender, useSessions } from '../../../hooks'
import { useInputCapabilities } from '../../../hooks/useInputCapabilities'
import { useInView } from '../../../hooks/useInView'
import { getDirectoryName, isSameDirectory } from '../../../utils'
import { useLayoutStore } from '../../../store'
import { useBusySessions } from '../../../store/activeSessionStore'
import { useNotifications } from '../../../store/notificationStore'
import { SessionListItem } from '../../sessions'
import { SessionChildrenSlot } from './SessionChildrenSlot'

const DIRECTORY_PAGE_SIZE = 5

export interface FolderRecentProject {
  id: string
  name: string
  worktree: string
  canReorder?: boolean
}

interface FolderRecentListProps {
  projects: FolderRecentProject[]
  currentDirectory?: string
  selectedSessionId: string | null
  expandedProjectIds: string[]
  onExpandedProjectIdsChange: React.Dispatch<React.SetStateAction<string[]>>
  onSelectProject: (project: FolderRecentProject) => void
  onSelectSession: (session: ApiSession) => void
  onRenameSession: (session: ApiSession, newTitle: string) => Promise<void>
  onDeleteSession: (session: ApiSession) => Promise<void>
  onReorderProject: (draggedPath: string, targetPath: string) => void
  expandedChildSessionIds?: Set<string>
  inlineChildSessions?: Map<string, ApiSession[]>
  onSelectChildSession?: (session: ApiSession) => void
  // ---- 编辑模式 ----
  isEditMode?: boolean
  selectedSessionIds?: Set<string>
  selectedProjectIds?: Set<string>
  onToggleSessionSelection?: (sessionId: string, options?: { shiftKey?: boolean }) => void
  onToggleProjectSelection?: (projectId: string, options?: { shiftKey?: boolean }) => void
}

interface PendingDeleteSession {
  session: ApiSession
  removeLocal: () => void
}

interface FolderStatus {
  dot: string
  label: string
  pulse: boolean
  count?: number
}

function getInitialExpandedProjectIds(projects: FolderRecentProject[], currentDirectory?: string): string[] {
  if (projects.length === 0) return []

  const currentProject = currentDirectory
    ? projects.find(project => isSameDirectory(project.worktree, currentDirectory))
    : undefined

  return [currentProject?.id || projects[0].id]
}

export function FolderRecentList({
  projects,
  currentDirectory,
  selectedSessionId,
  expandedProjectIds,
  onExpandedProjectIdsChange,
  onSelectProject,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  onReorderProject,
  expandedChildSessionIds,
  inlineChildSessions,
  onSelectChildSession,
  isEditMode = false,
  selectedSessionIds,
  selectedProjectIds,
  onToggleSessionSelection,
  onToggleProjectSelection,
}: FolderRecentListProps) {
  const { t } = useTranslation(['chat', 'common'])
  const { preferTouchUi } = useInputCapabilities()
  const { sidebarFolderRecentsShowDiff } = useLayoutStore()
  const [pendingDelete, setPendingDelete] = useState<PendingDeleteSession | null>(null)
  const allBusySessions = useBusySessions()
  const allNotifications = useNotifications()

  // ---- 拖拽排序状态 ----
  const [dragState, setDragState] = useState<{
    draggedId: string // 正在拖拽的项目 id
    currentOrder: string[] // 实时排序后的项目 id 列表
  } | null>(null)
  const folderRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const dragStartY = useRef(0)
  const dragActive = useRef(false)
  const draggedIdRef = useRef<string | null>(null)
  const savedExpandedRef = useRef<string[] | null>(null)
  /** 拖拽过程中持续更新的最终顺序，onUp 时读取 */
  const latestOrderRef = useRef<string[]>([])
  // 移动端长按
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchMovedRef = useRef(false)
  const touchStartYRef = useRef(0)
  const touchDragIdRef = useRef<string | null>(null)
  // 拖拽时用的项目 id 顺序（拖拽中实时排列，非拖拽时用 projects 原序）
  const displayOrder = useMemo(() => {
    if (!dragState) return projects.map(p => p.id)
    return dragState.currentOrder
  }, [dragState, projects])

  const isDragging = !!dragState

  // 当 projects 列表变化时，过滤掉已不存在的展开项
  useEffect(() => {
    onExpandedProjectIdsChange(prev => {
      const next = prev.filter(id => projects.some(project => project.id === id))
      const fallback = next.length > 0 ? next : getInitialExpandedProjectIds(projects, currentDirectory)
      if (fallback.length === prev.length && fallback.every((id, index) => id === prev[index])) {
        return prev
      }
      return fallback
    })
  }, [projects, currentDirectory, onExpandedProjectIdsChange])

  // 确保当前目录对应的 project 展开
  useEffect(() => {
    if (!currentDirectory) return
    const currentProject = projects.find(project => isSameDirectory(project.worktree, currentDirectory))
    if (!currentProject) return

    onExpandedProjectIdsChange(prev => {
      if (prev.includes(currentProject.id)) return prev
      return [currentProject.id, ...prev]
    })
  }, [projects, currentDirectory, onExpandedProjectIdsChange])

  const handleToggleProject = useCallback(
    (projectId: string) => {
      onExpandedProjectIdsChange(prev =>
        prev.includes(projectId) ? prev.filter(id => id !== projectId) : [...prev, projectId],
      )
    },
    [onExpandedProjectIdsChange],
  )

  // ============================================
  // 统一拖拽逻辑 (pointer 事件，桌面 + 触摸通用)
  // ============================================

  const calcNewOrder = useCallback((dragId: string, pointerY: number, baseOrder: string[]) => {
    const items: { id: string; centerY: number }[] = []
    for (const id of baseOrder) {
      if (id === dragId) continue
      const el = folderRefs.current.get(id)
      if (!el) continue
      const rect = el.getBoundingClientRect()
      items.push({ id, centerY: rect.top + rect.height / 2 })
    }

    let insertIndex = items.length
    for (let i = 0; i < items.length; i++) {
      if (pointerY < items[i].centerY) {
        insertIndex = i
        break
      }
    }

    const withoutDragged = items.map(i => i.id)
    withoutDragged.splice(insertIndex, 0, dragId)
    return withoutDragged
  }, [])

  /** 提交最终排序并清理状态（桌面/移动端共用） */
  const commitDrag = useCallback(
    (projectId: string, originalOrder: string[]) => {
      const finalOrder = latestOrderRef.current
      const originalIdx = originalOrder.indexOf(projectId)
      const newIdx = finalOrder.indexOf(projectId)

      if (originalIdx !== newIdx && newIdx !== -1) {
        const targetId = originalOrder[newIdx]
        if (targetId) {
          const draggedProj = projects.find(p => p.id === projectId)
          const targetProj = projects.find(p => p.id === targetId)
          if (draggedProj?.canReorder && targetProj?.canReorder) {
            onReorderProject(draggedProj.worktree, targetProj.worktree)
          }
        }
      }

      setDragState(null)
      if (savedExpandedRef.current) {
        onExpandedProjectIdsChange(savedExpandedRef.current)
        savedExpandedRef.current = null
      }
      dragActive.current = false
      draggedIdRef.current = null
      latestOrderRef.current = []
    },
    [projects, onReorderProject, onExpandedProjectIdsChange],
  )

  const startDrag = useCallback(
    (projectId: string, e: React.PointerEvent) => {
      const project = projects.find(p => p.id === projectId)
      if (!project?.canReorder) return

      e.preventDefault()
      e.stopPropagation()
      dragStartY.current = e.clientY
      dragActive.current = false
      draggedIdRef.current = projectId

      const currentOrder = projects.map(p => p.id)

      const onMove = (moveEvent: PointerEvent) => {
        const dy = Math.abs(moveEvent.clientY - dragStartY.current)

        if (!dragActive.current) {
          if (dy < 4) return
          dragActive.current = true
          savedExpandedRef.current = expandedProjectIds
          onExpandedProjectIdsChange([])
          document.body.style.cursor = 'grabbing'
          document.body.style.userSelect = 'none'
          setDragState({ draggedId: projectId, currentOrder })
        }

        // 实时计算新排序
        const newOrder = calcNewOrder(projectId, moveEvent.clientY, currentOrder)
        latestOrderRef.current = newOrder
        setDragState(prev => (prev ? { ...prev, currentOrder: newOrder } : null))
      }

      const onUp = () => {
        document.removeEventListener('pointermove', onMove)
        document.removeEventListener('pointerup', onUp)
        document.removeEventListener('pointercancel', onUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''

        if (dragActive.current) {
          commitDrag(projectId, currentOrder)
        }
        dragActive.current = false
        draggedIdRef.current = null
      }

      document.addEventListener('pointermove', onMove)
      document.addEventListener('pointerup', onUp)
      document.addEventListener('pointercancel', onUp)
    },
    [projects, expandedProjectIds, onExpandedProjectIdsChange, calcNewOrder, commitDrag],
  )

  // ============================================
  // 移动端触摸拖拽（长按触发）
  // ============================================

  const handleTouchStart = useCallback(
    (projectId: string, e: React.TouchEvent) => {
      const project = projects.find(p => p.id === projectId)
      if (!project?.canReorder) return

      touchMovedRef.current = false
      touchStartYRef.current = e.touches[0].clientY
      touchDragIdRef.current = null

      longPressTimer.current = setTimeout(() => {
        if (!touchMovedRef.current) {
          touchDragIdRef.current = projectId
          draggedIdRef.current = projectId
          dragActive.current = true
          savedExpandedRef.current = expandedProjectIds
          onExpandedProjectIdsChange([])
          const currentOrder = projects.map(p => p.id)
          latestOrderRef.current = currentOrder
          setDragState({ draggedId: projectId, currentOrder })
        }
      }, 400)
    },
    [projects, expandedProjectIds, onExpandedProjectIdsChange],
  )

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const dy = Math.abs(e.touches[0].clientY - touchStartYRef.current)
      if (dy > 8) touchMovedRef.current = true

      // 长按计时中但还没激活拖拽，手指移动了就取消长按
      if (longPressTimer.current && touchMovedRef.current && !touchDragIdRef.current) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = null
      }

      if (!touchDragIdRef.current) return

      // 拖拽进行中：阻止冒泡，避免侧边栏被左右滑动关闭
      e.stopPropagation()

      const touchY = e.touches[0].clientY
      const currentOrder = projects.map(p => p.id)
      const newOrder = calcNewOrder(touchDragIdRef.current, touchY, currentOrder)
      latestOrderRef.current = newOrder
      setDragState(prev => (prev ? { ...prev, currentOrder: newOrder } : null))
    },
    [projects, calcNewOrder],
  )

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }

    const dragId = touchDragIdRef.current
    if (dragId) {
      const originalOrder = projects.map(p => p.id)
      commitDrag(dragId, originalOrder)
    }

    touchDragIdRef.current = null
  }, [projects, commitDrag])

  // 清理长按定时器
  useEffect(() => {
    return () => {
      if (longPressTimer.current) clearTimeout(longPressTimer.current)
    }
  }, [])

  const folderStatusByProjectId = useMemo(() => {
    const map = new Map<string, FolderStatus>()

    for (const project of projects) {
      const isProjectExpanded = !isDragging && expandedProjectIds.includes(project.id)
      if (isProjectExpanded) continue

      const dirSessions = allBusySessions.filter(entry => isSameDirectory(entry.directory, project.worktree))
      if (dirSessions.length > 0) {
        let hasPermission = false
        let hasQuestion = false
        let hasRetry = false

        for (const session of dirSessions) {
          if (session.pendingAction?.type === 'permission') hasPermission = true
          else if (session.pendingAction?.type === 'question') hasQuestion = true
          else if (session.status.type === 'retry') hasRetry = true
        }

        const count = dirSessions.length
        if (hasPermission) {
          map.set(project.id, {
            dot: 'bg-warning-100',
            label: t('chat:activeSession.awaitingPermission'),
            pulse: false,
            count,
          })
          continue
        }
        if (hasQuestion) {
          map.set(project.id, {
            dot: 'bg-info-100',
            label: t('chat:activeSession.awaitingAnswer'),
            pulse: false,
            count,
          })
          continue
        }
        if (hasRetry) {
          map.set(project.id, {
            dot: 'bg-warning-100',
            label: t('chat:activeSession.retrying'),
            pulse: false,
            count,
          })
          continue
        }

        map.set(project.id, {
          dot: 'bg-success-100',
          label: t('chat:activeSession.working'),
          pulse: true,
          count,
        })
        continue
      }

      const hasUnreadCompleted = allNotifications.some(
        notification =>
          notification.type === 'completed' &&
          !notification.read &&
          isSameDirectory(notification.directory, project.worktree),
      )

      if (hasUnreadCompleted) {
        map.set(project.id, {
          dot: 'bg-accent-main-100',
          label: t('chat:notification.completed'),
          pulse: false,
        })
      }
    }

    return map
  }, [projects, expandedProjectIds, isDragging, allBusySessions, allNotifications, t])

  return (
    <>
      <div className="h-full overflow-y-auto custom-scrollbar px-1.5 py-1 select-none">
        {projects.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-6 text-center text-text-400 opacity-70">
            <p className="text-xs font-medium text-text-300">{t('sidebar.noProjectFoldersYet')}</p>
            <p className="mt-1 text-[11px] text-text-400/70">{t('sidebar.addProjectDesc')}</p>
          </div>
        ) : (
          <div onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
            {displayOrder.map(projectId => {
              const project = projects.find(p => p.id === projectId)
              if (!project) return null
              return (
                <FolderRecentSection
                  key={project.id}
                  project={project}
                  isExpanded={!isDragging && expandedProjectIds.includes(project.id)}
                  folderStatus={folderStatusByProjectId.get(project.id) ?? null}
                  preferTouchUi={preferTouchUi}
                  showSessionDiffStats={sidebarFolderRecentsShowDiff}
                  selectedSessionId={selectedSessionId}
                  onSelectProject={() => onSelectProject(project)}
                  onToggle={() => handleToggleProject(project.id)}
                  onSelectSession={onSelectSession}
                  onRenameSession={onRenameSession}
                  onRequestDeleteSession={setPendingDelete}
                  expandedChildSessionIds={expandedChildSessionIds}
                  inlineChildSessions={inlineChildSessions}
                  onSelectChildSession={onSelectChildSession}
                  // 拖拽
                  canDrag={!!project.canReorder && !isEditMode}
                  isDragged={dragState?.draggedId === project.id}
                  onDragStart={e => startDrag(project.id, e)}
                  onTouchDragStart={e => handleTouchStart(project.id, e)}
                  registerRef={el => {
                    if (el) folderRefs.current.set(project.id, el)
                    else folderRefs.current.delete(project.id)
                  }}
                  // 编辑模式
                  isEditMode={isEditMode}
                  isProjectChecked={selectedProjectIds?.has(project.id)}
                  onToggleProjectCheck={
                    onToggleProjectSelection ? options => onToggleProjectSelection(project.id, options) : undefined
                  }
                  selectedSessionIds={selectedSessionIds}
                  onToggleSessionSelection={onToggleSessionSelection}
                />
              )
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (pendingDelete) {
            await onDeleteSession(pendingDelete.session)
            pendingDelete.removeLocal()
          }
          setPendingDelete(null)
        }}
        title={t('sidebar.deleteChat')}
        description={t('sidebar.deleteChatConfirm')}
        confirmText={t('common:delete')}
        variant="danger"
      />
    </>
  )
}

// ============================================
// Folder Section
// ============================================

interface FolderRecentSectionProps {
  project: FolderRecentProject
  isExpanded: boolean
  folderStatus: FolderStatus | null
  preferTouchUi: boolean
  showSessionDiffStats: boolean
  selectedSessionId: string | null
  onSelectProject: () => void
  onToggle: () => void
  onSelectSession: (session: ApiSession) => void
  onRenameSession: (session: ApiSession, newTitle: string) => Promise<void>
  onRequestDeleteSession: (pending: PendingDeleteSession) => void
  expandedChildSessionIds?: Set<string>
  inlineChildSessions?: Map<string, ApiSession[]>
  onSelectChildSession?: (session: ApiSession) => void
  // 拖拽
  canDrag: boolean
  isDragged: boolean
  onDragStart: (e: React.PointerEvent) => void
  onTouchDragStart: (e: React.TouchEvent) => void
  registerRef: (el: HTMLDivElement | null) => void
  // ---- 编辑模式 ----
  isEditMode?: boolean
  isProjectChecked?: boolean
  onToggleProjectCheck?: (options?: { shiftKey?: boolean }) => void
  selectedSessionIds?: Set<string>
  onToggleSessionSelection?: (sessionId: string, options?: { shiftKey?: boolean }) => void
}

function FolderRecentSection({
  project,
  isExpanded,
  folderStatus,
  preferTouchUi,
  showSessionDiffStats,
  selectedSessionId,
  onSelectProject,
  onToggle,
  onSelectSession,
  onRenameSession,
  onRequestDeleteSession,
  expandedChildSessionIds,
  inlineChildSessions,
  onSelectChildSession,
  canDrag,
  isDragged,
  onDragStart,
  onTouchDragStart,
  registerRef,
  isEditMode = false,
  isProjectChecked = false,
  onToggleProjectCheck,
  selectedSessionIds,
  onToggleSessionSelection,
}: FolderRecentSectionProps) {
  const { t } = useTranslation(['chat', 'common'])
  const { ref: inViewRef, inView } = useInView({ rootMargin: '200px 0px', triggerOnce: true })
  const [hasActivated, setHasActivated] = useState(false)
  const shouldRenderBody = useDelayedRender(isExpanded)

  useEffect(() => {
    if (isExpanded && inView) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 延迟加载闸门，只从 false→true
      setHasActivated(true)
    }
  }, [isExpanded, inView])

  const { sessions, isLoading, isLoadingMore, hasMore, loadMore, patchLocalSession, removeLocalSession } = useSessions({
    directory: project.worktree,
    pageSize: DIRECTORY_PAGE_SIZE,
    enabled: hasActivated,
  })

  const handleRename = useCallback(
    async (sessionId: string, newTitle: string) => {
      const session = sessions.find(item => item.id === sessionId)
      if (!session) return
      await onRenameSession(session, newTitle)
      patchLocalSession(sessionId, { title: newTitle })
    },
    [sessions, onRenameSession, patchLocalSession],
  )

  const handleDelete = useCallback(
    (sessionId: string) => {
      const session = sessions.find(item => item.id === sessionId)
      if (!session) return
      onRequestDeleteSession({
        session,
        removeLocal: () => removeLocalSession(sessionId),
      })
    },
    [sessions, onRequestDeleteSession, removeLocalSession],
  )

  const handleProjectCheckClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onToggleProjectCheck?.({ shiftKey: e.shiftKey })
  }

  const projectName = project.name || getDirectoryName(project.worktree) || project.worktree
  const FolderDisplayIcon = isExpanded ? FolderOpenIcon : FolderIcon

  return (
    <div ref={inViewRef}>
      <div
        ref={registerRef}
        onTouchStart={canDrag ? onTouchDragStart : undefined}
        className={`relative transition-all duration-150 group/folder ${
          isDragged
            ? 'z-10 scale-[1.02] shadow-lg shadow-black/20 ring-1 ring-accent-main-100/30 rounded-md bg-bg-100'
            : ''
        }`}
      >
        {/* 文件夹行 */}
        <div className="relative flex w-full items-center rounded-md hover:bg-bg-200/40 transition-colors duration-150 select-none">
          {/* 选中左侧色条 */}
          {isEditMode && isProjectChecked && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full bg-accent-main-100" />
          )}
          {/* 编辑模式：项目 checkbox */}
          {isEditMode && (
            <button
              type="button"
              aria-pressed={isProjectChecked}
              data-compact
              data-selection-kind="project"
              data-selection-id={project.id}
              onMouseDown={e => {
                e.preventDefault()
                e.stopPropagation()
              }}
              onClick={handleProjectCheckClick}
              className={`shrink-0 flex items-center justify-center w-3.5 h-3.5 ml-2 rounded-full cursor-pointer transition-colors ${
                isProjectChecked ? 'bg-accent-main-100' : 'border border-text-500/50 hover:border-text-400'
              }`}
            >
              {isProjectChecked && <CheckIcon size={9} className="text-white" />}
            </button>
          )}
          <button
            onClick={() => {
              if (!isEditMode) onSelectProject()
              onToggle()
            }}
            className={`flex flex-1 min-w-0 items-center gap-1.5 ${isEditMode ? 'pl-1.5' : 'pl-2'} pr-2 py-1.5 text-left cursor-default select-none`}
            title={project.worktree}
          >
            <FolderDisplayIcon size={15} className="shrink-0 text-text-400" />
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-text-300">{projectName}</span>
            {folderStatus && (
              <span
                className="relative shrink-0 flex items-center justify-center w-3 h-3"
                title={folderStatus.count ? `${folderStatus.label} (${folderStatus.count})` : folderStatus.label}
              >
                <span className={`absolute w-1.5 h-1.5 rounded-full ${folderStatus.dot}`} />
                {folderStatus.pulse && (
                  <span className={`absolute w-1.5 h-1.5 rounded-full ${folderStatus.dot} animate-ping opacity-50`} />
                )}
              </span>
            )}
          </button>
          {/* 拖拽把手 — 默认 w-0 隐藏，hover 时 w-5 展开挤压圆点 */}
          {canDrag && (
            <span
              onPointerDown={onDragStart}
              className="shrink-0 flex items-center justify-center w-0 group-hover/folder:w-5 overflow-hidden cursor-grab active:cursor-grabbing text-text-500 opacity-0 group-hover/folder:opacity-60 hover:!opacity-100 transition-all duration-150 touch-none"
              title={t('sidebar.dragToReorder', { defaultValue: 'Drag to reorder' })}
            >
              <GripVerticalIcon size={12} />
            </span>
          )}
        </div>

        {/* Session 列表 */}
        <ExpandableSection show={isExpanded}>
          {shouldRenderBody && (
            <div onTouchStart={e => e.stopPropagation()}>
              {!hasActivated || isLoading ? (
                <div className="flex items-center px-2 py-1 text-[11px] text-text-400/70">
                  <SpinnerIcon size={12} className="animate-spin" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="px-2 py-1 text-[11px] text-text-400/50">{t('sidebar.noChatsInFolder')}</div>
              ) : (
                <>
                  {sessions.map(session => (
                    <div key={session.id}>
                      <SessionListItem
                        session={session}
                        isSelected={session.id === selectedSessionId}
                        onSelect={() => onSelectSession(session)}
                        onRename={newTitle => handleRename(session.id, newTitle)}
                        onDelete={() => handleDelete(session.id)}
                        preferTouchUi={preferTouchUi}
                        density="minimal"
                        showStats={showSessionDiffStats}
                        showDirectory={false}
                        isEditMode={isEditMode}
                        isChecked={selectedSessionIds?.has(session.id)}
                        onToggleCheck={
                          onToggleSessionSelection
                            ? options => onToggleSessionSelection(session.id, options)
                            : undefined
                        }
                      />
                      {onSelectChildSession &&
                        (expandedChildSessionIds?.has(session.id) || inlineChildSessions?.has(session.id)) && (
                          <SessionChildrenSlot
                            parentSession={session}
                            selectedSessionId={selectedSessionId}
                            fetchAll={expandedChildSessionIds?.has(session.id)}
                            children={inlineChildSessions?.get(session.id)}
                            onSelect={onSelectChildSession}
                            isEditMode={isEditMode}
                            selectedSessionIds={selectedSessionIds}
                            onToggleSessionSelection={onToggleSessionSelection}
                          />
                        )}
                    </div>
                  ))}

                  {hasMore && (
                    <button
                      onClick={() => void loadMore()}
                      disabled={isLoadingMore}
                      className="w-full rounded px-2 py-1 text-left text-[11px] text-text-500 transition-colors hover:text-text-300 disabled:cursor-default"
                    >
                      {isLoadingMore ? t('common:loadingMore') : t('sidebar.showMoreChats')}
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </ExpandableSection>
      </div>
    </div>
  )
}
