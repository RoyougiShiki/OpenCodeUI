import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sidebar } from './features/chat'
import { ChatPane } from './features/chat/ChatPane'
import { SplitContainer } from './features/chat/SplitContainer'
import type { CommandItem } from './components/CommandPalette'
import { ToastContainer } from './components/ToastContainer'
import { CliUpdateDialog } from './components/CliUpdateDialog'
import { RightPanel } from './components/RightPanel'
import { BottomPanel } from './components/BottomPanel'
import { DesktopTitlebar } from './components/DesktopTitlebar'
import { usesCustomDesktopTitlebar } from './utils/tauri'
import { useDirectory, useGlobalEvents, useGlobalKeybindings, useRouter } from './hooks'
import { useServerStore } from './hooks/useServerStore'
import { useViewportHeight } from './hooks/useViewportHeight'
import { useCloseServiceDialog } from './hooks/useCloseServiceDialog'
import { useWakeLock } from './hooks/useWakeLock'
import type { KeybindingHandlers } from './hooks/useKeybindings'
import { keybindingStore } from './store/keybindingStore'
import {
  layoutStore,
  paneLayoutStore,
  useLayoutStore,
  usePaneController,
  usePaneControllers,
  usePaneLayout,
  updateStore,
  cliUpdateStore,
  useCliUpdateStore,
} from './store'
import {
  ChatViewportProvider,
  CHAT_SURFACE_MIN_WIDTH,
  canUseSplitPane,
  useChatViewportController,
} from './features/chat/chatViewport'
import { uiErrorHandler, isSameDirectory, collectActiveDirectories } from './utils'
import { initNotificationSound } from './utils/notificationSoundBridge'
import { createPtySession } from './api/pty'
import type { TerminalTab } from './store/layoutStore'
import type { SettingsTab } from './features/settings/SettingsDialog'

const SettingsDialog = lazy(() =>
  import('./features/settings/SettingsDialog').then(module => ({ default: module.SettingsDialog })),
)
const CommandPalette = lazy(() =>
  import('./components/CommandPalette').then(module => ({ default: module.CommandPalette })),
)
const QuickOpen = lazy(() =>
  import('./components/QuickOpen').then(module => ({ default: module.QuickOpen })),
)
const CloseServiceDialog = lazy(() =>
  import('./components/CloseServiceDialog').then(module => ({ default: module.CloseServiceDialog })),
)

const CLI_UPDATE_PROMPT_COOLDOWN_MS = 60 * 60 * 1000
const CLI_UPDATE_PROMPT_STORAGE_KEY = 'opencode:cli-update-last-prompt'

function canShowCliUpdatePrompt(version: string): boolean {
  try {
    const raw = localStorage.getItem(CLI_UPDATE_PROMPT_STORAGE_KEY)
    if (!raw) return true
    const parsed = JSON.parse(raw) as { version?: string; timestamp?: number }
    if (parsed.version !== version) return true
    if (typeof parsed.timestamp !== 'number') return true
    return Date.now() - parsed.timestamp >= CLI_UPDATE_PROMPT_COOLDOWN_MS
  } catch {
    return true
  }
}

function markCliUpdatePromptShown(version: string): void {
  try {
    localStorage.setItem(
      CLI_UPDATE_PROMPT_STORAGE_KEY,
      JSON.stringify({ version, timestamp: Date.now() }),
    )
  } catch {
    // ignore
  }
}

function App() {
  const { t } = useTranslation(['commands', 'chat', 'common', 'components'])
  const router = useRouter()
  const {
    sessionId: routeSessionId,
    directory: routeDirectory,
    navigateToSession: navigateRouteToSession,
    navigateHome: navigateRouteHome,
    replaceSession,
  } = router
  const { currentDirectory, savedDirectories, sidebarExpanded, setSidebarExpanded } = useDirectory()
  const { activeServer, checkHealth } = useServerStore()
  const cliUpdateState = useCliUpdateStore()
  const { rightPanelOpen, rightPanelWidth, rightPanelDock, wakeLock } = useLayoutStore()
  const { surfaceRef, value: chatViewport } = useChatViewportController({
    sidebarExpanded,
    rightPanelOpen,
    requestedRightPanelWidth: rightPanelWidth,
  })
  const splitPaneEnabled = canUseSplitPane(chatViewport)
  const paneLayout = usePaneLayout()
  const focusedController = usePaneController(paneLayout.focusedPaneId)
  const paneControllers = usePaneControllers()
  const syncingFromRouteRef = useRef(false)
  // 当 currentDirectory 为 undefined 时表示全局模式，
  // 不应 fallback 到 session 自身的 directory，否则 replaceSession 会把 dir 参数写回 URL
  const focusedRouteDirectory =
    currentDirectory !== undefined
      ? paneLayout.focusedSessionId === routeSessionId
        ? routeDirectory || focusedController?.effectiveDirectory || currentDirectory
        : focusedController?.effectiveDirectory || currentDirectory
      : undefined

  useEffect(() => {
    const cleanup = initNotificationSound()
    return cleanup
  }, [])

  useEffect(() => {
    if (import.meta.env.DEV) return
    void updateStore.checkForUpdates()
  }, [])

  const [cliUpdateDialogOpen, setCliUpdateDialogOpen] = useState(false)
  const promptedCliVersionRef = useRef<string | null>(null)

  useEffect(() => {
    if (!activeServer?.id) return
    let cancelled = false

    void (async () => {
      const health = await checkHealth(activeServer.id)
      if (cancelled) return

      if (health?.version) {
        cliUpdateStore.setCurrentVersion(health.version)
      }

      await cliUpdateStore.checkForUpdates()
      if (cancelled) return

      const latestVersion = cliUpdateStore.getSnapshot().latestRelease?.version ?? null
      if (!latestVersion) return

      if (
        cliUpdateStore.shouldPromptUpdate() &&
        promptedCliVersionRef.current !== latestVersion &&
        canShowCliUpdatePrompt(latestVersion)
      ) {
        promptedCliVersionRef.current = latestVersion
        markCliUpdatePromptShown(latestVersion)
        setCliUpdateDialogOpen(true)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [activeServer?.id, checkHealth])

  useViewportHeight()
  useWakeLock(wakeLock)

  const activeDirectories = useMemo(
    () =>
      collectActiveDirectories({
        routeDirectory,
        currentDirectory,
        paneDirectories: paneControllers
          .map(controller => controller.effectiveDirectory)
          .filter((directory): directory is string => Boolean(directory)),
        projectDirectories: savedDirectories.map(directory => directory.path),
      }),
    [routeDirectory, currentDirectory, paneControllers, savedDirectories],
  )

  // 全局唯一 SSE 连接。所有 pane 通过 consumer 机制接收自己的 session 事件。
  useGlobalEvents(activeDirectories)

  // URL -> focused pane session
  useEffect(() => {
    if (paneLayout.focusedSessionId === routeSessionId) return
    syncingFromRouteRef.current = true
    paneLayoutStore.setFocusedSession(routeSessionId)
  }, [routeSessionId])

  // focused pane session -> URL（路由只反映当前 focused pane）
  useEffect(() => {
    if (syncingFromRouteRef.current) {
      syncingFromRouteRef.current = false
      return
    }
    if (paneLayout.focusedSessionId === routeSessionId && isSameDirectory(routeDirectory, focusedRouteDirectory)) return
    replaceSession(paneLayout.focusedSessionId, focusedRouteDirectory)
  }, [
    paneLayout.focusedPaneId,
    paneLayout.focusedSessionId,
    routeSessionId,
    routeDirectory,
    replaceSession,
    focusedRouteDirectory,
  ])

  const navigatePaneToSession = useCallback(
    (paneId: string, sessionId: string, directory?: string) => {
      paneLayoutStore.focusPane(paneId)
      paneLayoutStore.setPaneSession(paneId, sessionId)
      navigateRouteToSession(sessionId, directory)
    },
    [navigateRouteToSession],
  )

  const navigatePaneHome = useCallback(
    (paneId: string) => {
      paneLayoutStore.focusPane(paneId)
      paneLayoutStore.setPaneSession(paneId, null)
      navigateRouteHome()
    },
    [navigateRouteHome],
  )

  const handleSelectSession = useCallback(
    (session: { id: string; directory?: string }) => {
      const paneId = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
      if (!paneId) return
      navigatePaneToSession(paneId, session.id, session.directory)
    },
    [paneLayout.focusedPaneId, navigatePaneToSession],
  )

  const handleNewSession = useCallback(() => {
    const paneId = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
    if (!paneId) return
    navigatePaneHome(paneId)
  }, [paneLayout.focusedPaneId, navigatePaneHome])

  const handleEnterSplitMode = useCallback(() => {
    paneLayoutStore.enterSplitMode(paneLayout.focusedSessionId)
  }, [paneLayout.focusedSessionId])

  const handleToggleFocusedPaneFullscreen = useCallback(() => {
    const paneId = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
    if (!paneId) return
    paneLayoutStore.togglePaneFullscreen(paneId)
  }, [paneLayout.focusedPaneId])

  const handleOpenSidebar = useCallback(() => setSidebarExpanded(true), [setSidebarExpanded])

  const renderPaneLeaf = useCallback(
    (paneId: string, paneSessionId: string | null) => (
      <ChatPane
        key={paneId}
        paneId={paneId}
        sessionId={paneSessionId}
        isFocused={paneLayout.focusedPaneId === paneId}
        paneCount={paneLayout.paneCount}
        displayMode={paneLayout.isSplit && paneLayout.fullscreenPaneId !== paneId ? 'split' : 'single'}
        isPaneFullscreen={paneLayout.fullscreenPaneId === paneId}
        onOpenSidebar={handleOpenSidebar}
        showSidebarButton={chatViewport.interaction.sidebarBehavior === 'overlay'}
        onSplitPane={splitPaneEnabled && !paneLayout.fullscreenPaneId ? handleEnterSplitMode : undefined}
        onTogglePaneFullscreen={paneLayout.isSplit ? handleToggleFocusedPaneFullscreen : undefined}
        onOpenModelSettings={openModelSettings}
        navigatePaneToSession={navigatePaneToSession}
        navigatePaneHome={navigatePaneHome}
      />
    ),
    [
      paneLayout.focusedPaneId,
      paneLayout.paneCount,
      paneLayout.isSplit,
      paneLayout.fullscreenPaneId,
      chatViewport.interaction.sidebarBehavior,
      splitPaneEnabled,
      handleOpenSidebar,
      handleEnterSplitMode,
      handleToggleFocusedPaneFullscreen,
      navigatePaneToSession,
      navigatePaneHome,
    ],
  )

  const focusedDirectory = focusedRouteDirectory || ''

  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('servers')
  const openSettingsTab = useCallback((tab: SettingsTab) => {
    setSettingsInitialTab(tab)
    setSettingsDialogOpen(true)
  }, [])
  const openSettings = useCallback(() => {
    openSettingsTab('servers')
  }, [openSettingsTab])
  const openModelSettings = useCallback(() => {
    openSettingsTab('models')
  }, [openSettingsTab])
  const openAboutSettings = useCallback(() => {
    openSettingsTab('about')
  }, [openSettingsTab])
  const closeSettings = useCallback(() => setSettingsDialogOpen(false), [])

  const [projectDialogOpen, setProjectDialogOpen] = useState(false)
  const openProject = useCallback(() => setProjectDialogOpen(true), [])
  const closeProjectDialog = useCallback(() => setProjectDialogOpen(false), [])

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [quickOpenOpen, setQuickOpenOpen] = useState(false)

  const handleNewTerminal = useCallback(async () => {
    try {
      const pty = await createPtySession({ cwd: focusedDirectory }, focusedDirectory)
      const tab: TerminalTab = {
        id: pty.id,
        title: pty.title || t('components:terminal.terminal'),
        status: 'connecting',
      }
      layoutStore.addTerminalTab(tab, true)
    } catch (error) {
      uiErrorHandler('create terminal', error)
    }
  }, [focusedDirectory, t])

  const keybindingHandlers = useMemo<KeybindingHandlers>(
    () => ({
      openSettings,
      openProject,
      commandPalette: () => setCommandPaletteOpen(true),
      quickOpen: () => setQuickOpenOpen(true),
      toggleSidebar: () => setSidebarExpanded(!sidebarExpanded),
      toggleRightPanel: () => layoutStore.toggleRightPanel(),
      focusInput: () => {
        const input = document.querySelector<HTMLTextAreaElement>('[data-input-box] textarea')
        input?.focus()
      },
      newSession: () => focusedController?.newSession(),
      archiveSession: () => focusedController?.archiveSession(),
      previousSession: () => focusedController?.previousSession(),
      nextSession: () => focusedController?.nextSession(),
      toggleTerminal: () => layoutStore.toggleBottomPanel(),
      newTerminal: handleNewTerminal,
      selectModel: () => focusedController?.openModelSelector(),
      toggleAgent: () => focusedController?.toggleAgent(),
      cancelMessage: () => focusedController?.cancelMessage(),
      copyLastResponse: () => focusedController?.copyLastResponse(),
      toggleFullAuto: () => focusedController?.toggleFullAuto(),
      // Pane
      focusNextPane: () => {
        paneLayoutStore.focusNextPane()
        requestAnimationFrame(() => {
          const pid = paneLayoutStore.getFocusedPaneId()
          if (pid) {
            const input = document.querySelector<HTMLTextAreaElement>(`[data-pane-id="${pid}"] textarea`)
            input?.focus()
          }
        })
      },
      focusPrevPane: () => {
        paneLayoutStore.focusPrevPane()
        requestAnimationFrame(() => {
          const pid = paneLayoutStore.getFocusedPaneId()
          if (pid) {
            const input = document.querySelector<HTMLTextAreaElement>(`[data-pane-id="${pid}"] textarea`)
            input?.focus()
          }
        })
      },
      splitRight: () => {
        const pid = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
        if (pid && splitPaneEnabled) paneLayoutStore.splitPane(pid, 'horizontal')
      },
      splitDown: () => {
        const pid = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
        if (pid && splitPaneEnabled) paneLayoutStore.splitPane(pid, 'vertical')
      },
      closePane: () => {
        const pid = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
        if (pid && paneLayout.isSplit) paneLayoutStore.closePane(pid)
      },
      togglePaneFullscreen: () => {
        if (paneLayout.isSplit) handleToggleFocusedPaneFullscreen()
      },
    }),
    [
      openSettings,
      openProject,
      sidebarExpanded,
      setSidebarExpanded,
      focusedController,
      handleNewTerminal,
      paneLayout.focusedPaneId,
      paneLayout.isSplit,
      splitPaneEnabled,
      handleToggleFocusedPaneFullscreen,
    ],
  )

  useGlobalKeybindings(keybindingHandlers)

  const commands = useMemo<CommandItem[]>(() => {
    const getShortcut = (action: string) =>
      keybindingStore.getKey(action as import('./store/keybindingStore').KeybindingAction)

    return [
      {
        id: 'openSettings',
        label: t('commands:openSettings'),
        description: t('commands:openSettingsDesc'),
        category: t('commands:categories.general'),
        shortcut: getShortcut('openSettings'),
        action: openSettings,
      },
      {
        id: 'openProject',
        label: t('commands:openProject'),
        description: t('commands:openProjectDesc'),
        category: t('commands:categories.general'),
        shortcut: getShortcut('openProject'),
        action: openProject,
      },
      {
        id: 'openSettingsShortcuts',
        label: t('commands:openShortcutsSettings'),
        description: t('commands:openShortcutsSettingsDesc'),
        category: t('commands:categories.general'),
        action: () => {
          openSettingsTab('keybindings')
        },
      },
      {
        id: 'toggleSidebar',
        label: t('commands:toggleSidebar'),
        description: t('commands:toggleSidebarDesc'),
        category: t('commands:categories.general'),
        shortcut: getShortcut('toggleSidebar'),
        action: () => setSidebarExpanded(!sidebarExpanded),
      },
      {
        id: 'toggleRightPanel',
        label: t('commands:toggleRightPanel'),
        description: t('commands:toggleRightPanelDesc'),
        category: t('commands:categories.general'),
        shortcut: getShortcut('toggleRightPanel'),
        action: () => layoutStore.toggleRightPanel(),
      },
      {
        id: 'focusInput',
        label: t('commands:focusInput'),
        description: t('commands:focusInputDesc'),
        category: t('commands:categories.general'),
        shortcut: getShortcut('focusInput'),
        action: () => {
          const input = document.querySelector<HTMLTextAreaElement>('[data-input-box] textarea')
          input?.focus()
        },
      },
      {
        id: 'newSession',
        label: t('commands:newSession'),
        description: t('commands:newSessionDesc'),
        category: t('commands:categories.session'),
        shortcut: getShortcut('newSession'),
        action: () => focusedController?.newSession(),
      },
      {
        id: 'archiveSession',
        label: t('commands:archiveSession'),
        description: t('commands:archiveSessionDesc'),
        category: t('commands:categories.session'),
        shortcut: getShortcut('archiveSession'),
        action: () => focusedController?.archiveSession(),
      },
      {
        id: 'previousSession',
        label: t('commands:previousSession'),
        description: t('commands:previousSessionDesc'),
        category: t('commands:categories.session'),
        shortcut: getShortcut('previousSession'),
        action: () => focusedController?.previousSession(),
      },
      {
        id: 'nextSession',
        label: t('commands:nextSession'),
        description: t('commands:nextSessionDesc'),
        category: t('commands:categories.session'),
        shortcut: getShortcut('nextSession'),
        action: () => focusedController?.nextSession(),
      },
      {
        id: 'toggleTerminal',
        label: t('commands:toggleTerminal'),
        description: t('commands:toggleTerminalDesc'),
        category: t('commands:categories.terminal'),
        shortcut: getShortcut('toggleTerminal'),
        action: () => layoutStore.toggleBottomPanel(),
      },
      {
        id: 'newTerminal',
        label: t('commands:newTerminal'),
        description: t('commands:newTerminalDesc'),
        category: t('commands:categories.terminal'),
        shortcut: getShortcut('newTerminal'),
        action: handleNewTerminal,
      },
      {
        id: 'selectModel',
        label: t('commands:selectModel'),
        description: t('commands:selectModelDesc'),
        category: t('commands:categories.model'),
        shortcut: getShortcut('selectModel'),
        action: () => focusedController?.openModelSelector(),
      },
      {
        id: 'toggleAgent',
        label: t('commands:toggleAgent'),
        description: t('commands:toggleAgentDesc'),
        category: t('commands:categories.model'),
        shortcut: getShortcut('toggleAgent'),
        action: () => focusedController?.toggleAgent(),
      },
      {
        id: 'copyLastResponse',
        label: t('commands:copyLastResponse'),
        description: t('commands:copyLastResponseDesc'),
        category: t('commands:categories.message'),
        shortcut: getShortcut('copyLastResponse'),
        action: () => focusedController?.copyLastResponse(),
      },
      {
        id: 'cancelMessage',
        label: t('commands:cancelMessage'),
        description: t('commands:cancelMessageDesc'),
        category: t('commands:categories.message'),
        shortcut: getShortcut('cancelMessage'),
        action: () => focusedController?.cancelMessage(),
        when: () => !!focusedController?.isStreaming,
      },
      // Pane
      {
        id: 'focusNextPane',
        label: t('commands:focusNextPane'),
        description: t('commands:focusNextPaneDesc'),
        category: t('commands:categories.pane'),
        shortcut: getShortcut('focusNextPane'),
        action: () => paneLayoutStore.focusNextPane(),
      },
      {
        id: 'focusPrevPane',
        label: t('commands:focusPrevPane'),
        description: t('commands:focusPrevPaneDesc'),
        category: t('commands:categories.pane'),
        shortcut: getShortcut('focusPrevPane'),
        action: () => paneLayoutStore.focusPrevPane(),
      },
      {
        id: 'splitRight',
        label: t('commands:splitRight'),
        description: t('commands:splitRightDesc'),
        category: t('commands:categories.pane'),
        shortcut: getShortcut('splitRight'),
        action: () => {
          const pid = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
          if (pid && splitPaneEnabled) paneLayoutStore.splitPane(pid, 'horizontal')
        },
      },
      {
        id: 'splitDown',
        label: t('commands:splitDown'),
        description: t('commands:splitDownDesc'),
        category: t('commands:categories.pane'),
        shortcut: getShortcut('splitDown'),
        action: () => {
          const pid = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
          if (pid && splitPaneEnabled) paneLayoutStore.splitPane(pid, 'vertical')
        },
      },
      {
        id: 'closePane',
        label: t('commands:closePane'),
        description: t('commands:closePaneDesc'),
        category: t('commands:categories.pane'),
        shortcut: getShortcut('closePane'),
        action: () => {
          const pid = paneLayout.focusedPaneId ?? paneLayoutStore.getFocusedPaneId()
          if (pid && paneLayout.isSplit) paneLayoutStore.closePane(pid)
        },
        when: () => paneLayout.isSplit,
      },
      {
        id: 'togglePaneFullscreen',
        label: t('commands:togglePaneFullscreen'),
        description: t('commands:togglePaneFullscreenDesc'),
        category: t('commands:categories.pane'),
        shortcut: getShortcut('togglePaneFullscreen'),
        action: () => {
          if (paneLayout.isSplit) handleToggleFocusedPaneFullscreen()
        },
        when: () => paneLayout.isSplit,
      },
    ]
  }, [
    t,
    openSettings,
    openProject,
    openSettingsTab,
    sidebarExpanded,
    setSidebarExpanded,
    focusedController,
    handleNewTerminal,
    paneLayout.focusedPaneId,
    paneLayout.isSplit,
    splitPaneEnabled,
    handleToggleFocusedPaneFullscreen,
  ])

  const { showCloseDialog, handleCloseDialogConfirm, handleCloseDialogCancel } = useCloseServiceDialog()

  const hasDesktopTitlebar = useMemo(() => usesCustomDesktopTitlebar(), [])

  return (
    <div
      className="relative flex h-[var(--app-height)] flex-col bg-bg-100 overflow-hidden"
      style={{ paddingTop: 'var(--safe-area-inset-top)' }}
    >
      <DesktopTitlebar
        onOpenSearch={() => setQuickOpenOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      />
      <ChatViewportProvider value={chatViewport}>
        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          <Sidebar
            isOpen={sidebarExpanded}
            selectedSessionId={paneLayout.focusedSessionId}
            onSelectSession={handleSelectSession}
            onNewSession={handleNewSession}
            onOpen={handleOpenSidebar}
            onClose={() => setSidebarExpanded(false)}
            contextLimit={focusedController?.contextLimit}
            onOpenSettings={openSettings}
            onOpenSearch={hasDesktopTitlebar ? undefined : () => setQuickOpenOpen(true)}
            onOpenCommandPalette={hasDesktopTitlebar ? undefined : () => setCommandPaletteOpen(true)}
            projectDialogOpen={projectDialogOpen}
            onProjectDialogClose={closeProjectDialog}
          />

          <div className="flex-1 flex min-w-0 h-full overflow-hidden">
            {rightPanelDock === 'middle' && rightPanelOpen && (
              <RightPanel directory={focusedDirectory} sessionId={paneLayout.focusedSessionId} />
            )}

            {/* 面板之间的分隔线 */}
            {rightPanelDock === 'middle' && rightPanelOpen && (
              <div className="w-px bg-border-200/50 shrink-0" />
            )}

            <div
              ref={surfaceRef}
              className="flex-1 flex flex-col min-w-0 overflow-hidden"
              style={{
                minWidth:
                  chatViewport.interaction.sidebarBehavior === 'overlay' ? undefined : `${CHAT_SURFACE_MIN_WIDTH}px`,
              }}
            >
              <div
                className={paneLayout.isSplit && !paneLayout.fullscreenPaneId ? 'flex-1 min-h-0 p-2' : 'flex-1 min-h-0'}
              >
                <SplitContainer
                  node={paneLayout.root}
                  renderLeaf={renderPaneLeaf}
                  fullscreenPaneId={paneLayout.fullscreenPaneId}
                />
              </div>

              <BottomPanel directory={focusedDirectory} />
            </div>

            {/* 面板之间的分隔线 */}
            {rightPanelDock !== 'middle' && rightPanelOpen && (
              <div className="w-px bg-border-200/50 shrink-0" />
            )}

            {rightPanelDock !== 'middle' && (
              <RightPanel directory={focusedDirectory} sessionId={paneLayout.focusedSessionId} />
            )}
          </div>
          <ToastContainer onOpenAbout={openAboutSettings} />
        </div>

        <Suspense fallback={null}>
          <SettingsDialog isOpen={settingsDialogOpen} onClose={closeSettings} initialTab={settingsInitialTab} />
          <CommandPalette
            isOpen={commandPaletteOpen}
            onClose={() => setCommandPaletteOpen(false)}
            commands={commands}
          />
          {quickOpenOpen && (
            <QuickOpen onClose={() => setQuickOpenOpen(false)} />
          )}
        </Suspense>

        <Suspense fallback={null}>
          <CliUpdateDialog
            isOpen={cliUpdateDialogOpen}
            onClose={() => setCliUpdateDialogOpen(false)}
            currentVersion={cliUpdateStore.getCurrentVersion() || 'unknown'}
            latestVersion={cliUpdateState.latestRelease?.tagName || 'unknown'}
            onDismissVersion={() => cliUpdateStore.dismissCurrentVersion()}
            onUpdated={() => {
              if (!activeServer?.id) return
              void checkHealth(activeServer.id).then(health => {
                if (health?.version) cliUpdateStore.setCurrentVersion(health.version)
              })
            }}
          />
          <CloseServiceDialog
            isOpen={showCloseDialog}
            onConfirm={handleCloseDialogConfirm}
            onCancel={handleCloseDialogCancel}
          />
        </Suspense>
      </ChatViewportProvider>
    </div>
  )
}

export default App
