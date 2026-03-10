import { useState, useEffect, useCallback } from 'react'
import { Dialog } from '../../components/ui/Dialog'
import { SunIcon, GlobeIcon, SettingsIcon, KeyboardIcon, CloseIcon, BellIcon, PlugIcon } from '../../components/Icons'
import { useIsMobile } from '../../hooks'
import { isTauri } from '../../utils/tauri'
import { KeybindingsSection } from './KeybindingsSection'
import { AppearanceSettings } from './components/AppearanceSettings'
import { ChatSettings } from './components/ChatSettings'
import { NotificationSettings } from './components/NotificationSettings'
import { ServiceSettings } from './components/ServiceSettings'
import { ServersSettings } from './components/ServersSettings'
import type { ThemeMode } from '../../hooks'

const APP_VERSION_LABEL = `OpenCodeUI v${__APP_VERSION__}`

// ============================================
// Types
// ============================================

type SettingsTab = 'appearance' | 'chat' | 'notifications' | 'service' | 'servers' | 'keybindings'

interface SettingsDialogProps {
  isOpen: boolean
  onClose: () => void
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode, event?: React.MouseEvent) => void
  isWideMode?: boolean
  onToggleWideMode?: () => void
  initialTab?: SettingsTab | 'general'
  // Theme preset
  presetId?: string
  onPresetChange?: (presetId: string, event?: React.MouseEvent) => void
  availablePresets?: { id: string; name: string; description: string }[]
  // Custom CSS
  customCSS?: string
  onCustomCSSChange?: (css: string) => void
}

// ============================================
// Nav Tabs
// ============================================

const TABS: { id: SettingsTab; label: string; description: string; icon: React.ReactNode }[] = [
  {
    id: 'servers',
    label: 'Servers',
    description: 'Backend connections and fast active endpoint switching',
    icon: <GlobeIcon size={15} />,
  },
  {
    id: 'chat',
    label: 'Chat',
    description: 'Reasoning style, path display, and conversation behavior',
    icon: <SettingsIcon size={15} />,
  },
  {
    id: 'appearance',
    label: 'Appearance',
    description: 'Theme, color mode, and layout preferences',
    icon: <SunIcon size={15} />,
  },
  {
    id: 'notifications',
    label: 'Notifications',
    description: 'Desktop and in-app alerts',
    icon: <BellIcon size={15} />,
  },
  {
    id: 'service',
    label: 'Service',
    description: 'Local opencode service management',
    icon: <PlugIcon size={15} />,
  },
  {
    id: 'keybindings',
    label: 'Shortcuts',
    description: 'Customize keyboard shortcuts for faster workflows',
    icon: <KeyboardIcon size={15} />,
  },
]

const TAB_GROUPS: { label: string; tabs: SettingsTab[] }[] = [
  { label: 'Core', tabs: ['servers', 'chat', 'appearance', 'notifications'] },
  { label: 'Advanced', tabs: ['service', 'keybindings'] },
]

// ============================================
// Tab Content Router
// ============================================

function TabContent({
  tab,
  themeMode,
  onThemeChange,
  isWideMode,
  onToggleWideMode,
  presetId,
  onPresetChange,
  availablePresets,
  customCSS,
  onCustomCSSChange,
}: {
  tab: SettingsTab
  themeMode: ThemeMode
  onThemeChange: (mode: ThemeMode, event?: React.MouseEvent) => void
  isWideMode?: boolean
  onToggleWideMode?: () => void
  presetId?: string
  onPresetChange?: (presetId: string, event?: React.MouseEvent) => void
  availablePresets?: { id: string; name: string; description: string }[]
  customCSS?: string
  onCustomCSSChange?: (css: string) => void
}) {
  switch (tab) {
    case 'appearance':
      return (
        <AppearanceSettings
          themeMode={themeMode}
          onThemeChange={onThemeChange}
          isWideMode={isWideMode}
          onToggleWideMode={onToggleWideMode}
          presetId={presetId}
          onPresetChange={onPresetChange}
          availablePresets={availablePresets}
          customCSS={customCSS}
          onCustomCSSChange={onCustomCSSChange}
        />
      )
    case 'chat':
      return <ChatSettings />
    case 'notifications':
      return <NotificationSettings />
    case 'service':
      return <ServiceSettings />
    case 'servers':
      return <ServersSettings />
    case 'keybindings':
      return <KeybindingsSection />
    default:
      return null
  }
}

// ============================================
// Main Settings Dialog
// ============================================

export function SettingsDialog({
  isOpen,
  onClose,
  themeMode,
  onThemeChange,
  isWideMode,
  onToggleWideMode,
  initialTab = 'servers',
  presetId,
  onPresetChange,
  availablePresets,
  customCSS,
  onCustomCSSChange,
}: SettingsDialogProps) {
  const isMobile = useIsMobile()
  const isTauriDesktop = isTauri() && !isMobile
  const normalizeTab = useCallback((next: SettingsDialogProps['initialTab']): SettingsTab => {
    if (!next || next === 'general') return 'chat'
    return next
  }, [])
  const [tab, setTab] = useState<SettingsTab>(normalizeTab(initialTab))

  const visibleTabs = isTauriDesktop ? TABS : TABS.filter(t => t.id !== 'service')
  const groupedTabs = TAB_GROUPS.map(group => ({
    ...group,
    tabs: group.tabs.map(id => visibleTabs.find(t => t.id === id)).filter((t): t is (typeof TABS)[number] => !!t),
  })).filter(group => group.tabs.length > 0)

  useEffect(() => {
    if (!isOpen) return

    const frameId = requestAnimationFrame(() => {
      setTab(normalizeTab(initialTab))
    })

    return () => cancelAnimationFrame(frameId)
  }, [isOpen, initialTab, normalizeTab])

  useEffect(() => {
    if (visibleTabs.some(t => t.id === tab)) return

    const frameId = requestAnimationFrame(() => {
      setTab(visibleTabs[0]?.id || 'appearance')
    })

    return () => cancelAnimationFrame(frameId)
  }, [tab, visibleTabs])

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        const ids = visibleTabs.map(t => t.id)
        if (ids.length === 0) return
        const next = (ids.indexOf(tab) + dir + ids.length) % ids.length
        setTab(ids[next])
      }
    },
    [tab, visibleTabs],
  )

  const contentProps = {
    themeMode,
    onThemeChange,
    isWideMode,
    onToggleWideMode,
    presetId,
    onPresetChange,
    availablePresets,
    customCSS,
    onCustomCSSChange,
  }

  const activeTabMeta = visibleTabs.find(t => t.id === tab) || visibleTabs[0] || TABS[0]

  // 移动端：顶部 tab 切换 + 全屏内容
  if (isMobile) {
    return (
      <Dialog isOpen={isOpen} onClose={onClose} title="" width="100%" showCloseButton={false}>
        <div className="flex flex-col -m-5" style={{ height: '88vh' }}>
          {/* Top: Title + Close */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border-100/50 shrink-0">
            <div>
              <div className="text-sm font-semibold text-text-100">Settings</div>
              <div className="text-[11px] text-text-400 mt-0.5">{APP_VERSION_LABEL}</div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-text-400 hover:text-text-200 hover:bg-bg-100 rounded-md transition-colors -mr-1"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          {/* Tab Bar - 横向滚动 */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-border-100/50 shrink-0 overflow-x-auto scrollbar-none">
            {visibleTabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap shrink-0
                  ${t.id === tab ? 'bg-bg-100 text-text-100' : 'text-text-400 active:bg-bg-100/50'}`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 py-4 px-4 overflow-y-auto custom-scrollbar">
            <TabContent tab={tab} {...contentProps} />
          </div>
        </div>
      </Dialog>
    )
  }

  // 桌面端：左侧导航 + 右侧内容
  return (
    <Dialog isOpen={isOpen} onClose={onClose} title="" width="min(97vw, 1040px)" showCloseButton={false}>
      <div className="flex h-[min(86vh,760px)] -m-5">
        {/* Left Nav */}
        <nav
          className="w-[236px] shrink-0 border-r border-border-100/60 bg-bg-050/45 py-4 px-2.5 flex flex-col"
          onKeyDown={handleTabKeyDown}
        >
          <div className="px-3 mb-4">
            <div className="text-sm font-semibold text-text-100">Settings</div>
            <div className="text-[11px] text-text-400 mt-0.5 leading-relaxed">
              Customize UI, behavior, and server setup
            </div>
          </div>
          <div className="space-y-3">
            {groupedTabs.map(group => (
              <div key={group.label}>
                <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-400/90">
                  {group.label}
                </div>
                <div className="space-y-1">
                  {group.tabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setTab(t.id)}
                      tabIndex={t.id === tab ? 0 : -1}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors
                        ${
                          t.id === tab
                            ? 'bg-bg-100 text-text-100 ring-1 ring-border-200/60'
                            : 'text-text-400 hover:text-text-200 hover:bg-bg-100/50'
                        }`}
                    >
                      {t.icon}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto pt-3 px-3 text-[10px] text-text-400">{APP_VERSION_LABEL}</div>
        </nav>

        {/* Right Content */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="shrink-0 border-b border-border-100/60 px-6 py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-base font-semibold text-text-100">{activeTabMeta.label}</div>
              <div className="text-[12px] text-text-400 mt-0.5 leading-relaxed">{activeTabMeta.description}</div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-text-400 hover:text-text-200 hover:bg-bg-100 rounded-md transition-colors -mr-1"
              aria-label="Close settings"
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 py-5 px-6 overflow-y-auto custom-scrollbar">
            <TabContent tab={tab} {...contentProps} />
          </div>
        </div>
      </div>
    </Dialog>
  )
}
