import { useState } from 'react'
import {
  PathAutoIcon,
  PathUnixIcon,
  PathWindowsIcon,
  BoltIcon,
  CompactIcon,
  EyeIcon,
  ThinkingIcon,
  FolderIcon,
} from '../../../components/Icons'
import { usePathMode, useIsMobile } from '../../../hooks'
import { autoApproveStore, layoutStore, useLayoutStore } from '../../../store'
import { themeStore, type ReasoningDisplayMode } from '../../../store/themeStore'
import { Toggle, SegmentedControl, SettingRow, SettingsCard } from './SettingsUI'
import type { PathMode } from '../../../utils/directoryUtils'

export function ChatSettings() {
  const { pathMode, setPathMode, effectiveStyle, detectedStyle, isAutoMode } = usePathMode()
  const { sidebarFolderRecents } = useLayoutStore()
  const [autoApprove, setAutoApprove] = useState(autoApproveStore.enabled)
  const [collapseUserMessages, setCollapseUserMessages] = useState(themeStore.collapseUserMessages)
  const [stepFinishDisplay, setStepFinishDisplay] = useState(themeStore.stepFinishDisplay)
  const [reasoningDisplayMode, setReasoningDisplayMode] = useState(themeStore.reasoningDisplayMode)
  const isMobile = useIsMobile()
  void isMobile // reserved for future mobile-specific logic

  const handleAutoApprove = () => {
    const v = !autoApprove
    setAutoApprove(v)
    autoApproveStore.setEnabled(v)
    if (!v) autoApproveStore.clearAllRules()
  }

  const handleCollapseToggle = () => {
    const v = !collapseUserMessages
    setCollapseUserMessages(v)
    themeStore.setCollapseUserMessages(v)
  }

  const handleSidebarFolderRecentsToggle = () => {
    layoutStore.setSidebarFolderRecents(!sidebarFolderRecents)
  }

  const handleReasoningDisplayModeChange = (mode: ReasoningDisplayMode) => {
    setReasoningDisplayMode(mode)
    themeStore.setReasoningDisplayMode(mode)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard title="Paths & Formatting" description="How file paths are displayed in messages and tools">
          <SegmentedControl
            value={pathMode}
            options={[
              { value: 'auto', label: 'Auto', icon: <PathAutoIcon size={14} /> },
              { value: 'unix', label: 'Unix /', icon: <PathUnixIcon size={14} /> },
              { value: 'windows', label: 'Win \\', icon: <PathWindowsIcon size={14} /> },
            ]}
            onChange={v => setPathMode(v as PathMode)}
          />
          {isAutoMode && (
            <div className="text-[11px] text-text-400 mt-2 px-1">
              Using <span className="font-mono text-text-300">{effectiveStyle === 'windows' ? '\\' : '/'}</span>
              {detectedStyle && (
                <>
                  , detected{' '}
                  <span className="font-mono text-text-300">{detectedStyle === 'windows' ? 'Windows' : 'Unix'}</span>
                </>
              )}
            </div>
          )}
        </SettingsCard>

        <SettingsCard title="Agent Behavior" description="Execution defaults for tool actions">
          <SettingRow
            label="Auto-Approve"
            description="Use local rules for always, send once to server"
            icon={<BoltIcon size={14} />}
            onClick={handleAutoApprove}
          >
            <Toggle enabled={autoApprove} onChange={handleAutoApprove} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title="Sidebar Recents" description="Optional folder view for recent chats">
          <SettingRow
            label="Folder-Style Recents"
            description="Group recent chats by project folder while keeping the default list available"
            icon={<FolderIcon size={14} />}
            onClick={handleSidebarFolderRecentsToggle}
          >
            <Toggle enabled={sidebarFolderRecents} onChange={handleSidebarFolderRecentsToggle} />
          </SettingRow>
        </SettingsCard>
      </div>

      <SettingsCard
        title="Conversation Experience"
        description="Message density, reasoning style, and step summary fields"
      >
        <div className="space-y-3">
          <div className="grid gap-2 lg:grid-cols-2">
            <SettingRow
              label="Collapse Long Messages"
              description="Auto-collapse lengthy user messages"
              icon={<CompactIcon size={14} />}
              onClick={handleCollapseToggle}
              className="bg-bg-100/35 border-border-200/45"
            >
              <Toggle enabled={collapseUserMessages} onChange={handleCollapseToggle} />
            </SettingRow>

            <div className="rounded-lg border border-border-200/45 bg-bg-100/35 px-2.5 py-2.5">
              <div className="flex items-start gap-3">
                <span className="text-text-400 mt-0.5 shrink-0">
                  <ThinkingIcon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-text-100">Thinking Display</div>
                  <div className="text-[11px] text-text-400 mt-0.5 mb-2">Choose capsule or low-noise italic style</div>
                  <SegmentedControl
                    value={reasoningDisplayMode}
                    options={[
                      { value: 'capsule', label: 'Capsule' },
                      { value: 'italic', label: 'Italic' },
                    ]}
                    onChange={v => handleReasoningDisplayModeChange(v as ReasoningDisplayMode)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border-100/55">
            <div className="text-[11px] font-medium text-text-400 uppercase tracking-wider mb-2">Step Finish Info</div>
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  { key: 'tokens', label: 'Tokens', desc: 'Show token usage' },
                  { key: 'cache', label: 'Cache', desc: 'Show cache hit info' },
                  { key: 'cost', label: 'Cost', desc: 'Show API cost' },
                  { key: 'duration', label: 'Duration', desc: 'Show message response time' },
                  { key: 'turnDuration', label: 'Total Duration', desc: 'Show full turn elapsed time' },
                ] as const
              ).map(({ key, label, desc }) => (
                <SettingRow
                  key={key}
                  label={label}
                  description={desc}
                  icon={<EyeIcon size={14} />}
                  className="bg-bg-100/35 border-border-200/45"
                  onClick={() => {
                    const next = { [key]: !stepFinishDisplay[key] }
                    setStepFinishDisplay(prev => ({ ...prev, ...next }))
                    themeStore.setStepFinishDisplay(next)
                  }}
                >
                  <Toggle
                    enabled={stepFinishDisplay[key]}
                    onChange={() => {
                      const next = { [key]: !stepFinishDisplay[key] }
                      setStepFinishDisplay(prev => ({ ...prev, ...next }))
                      themeStore.setStepFinishDisplay(next)
                    }}
                  />
                </SettingRow>
              ))}
            </div>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
