import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PathAutoIcon,
  PathUnixIcon,
  PathWindowsIcon,
  BoltIcon,
  CompactIcon,
  ThinkingIcon,
  EyeIcon,
  FolderIcon,
  PermissionListIcon,
  SplitIcon,
  LayersIcon,
} from '../../../components/Icons'
import { usePathMode, useIsMobile } from '../../../hooks'
import { autoApproveStore, layoutStore, useLayoutStore } from '../../../store'
import { themeStore, type ReasoningDisplayMode, type ToolCardStyle } from '../../../store/themeStore'
import { Toggle, SegmentedControl, SettingRow, SettingsCard } from './SettingsUI'
import type { PathMode } from '../../../utils/directoryUtils'

export function ChatSettings() {
  const { t } = useTranslation(['settings'])
  const { pathMode, setPathMode, effectiveStyle, detectedStyle, isAutoMode } = usePathMode()
  const { sidebarFolderRecents } = useLayoutStore()
  const [autoApprove, setAutoApprove] = useState(autoApproveStore.enabled)
  const [collapseUserMessages, setCollapseUserMessages] = useState(themeStore.collapseUserMessages)
  const [stepFinishDisplay, setStepFinishDisplay] = useState(themeStore.stepFinishDisplay)
  const [reasoningDisplayMode, setReasoningDisplayMode] = useState(themeStore.reasoningDisplayMode)
  const [descriptiveToolSteps, setDescriptiveToolSteps] = useState(themeStore.descriptiveToolSteps)
  const [inlineToolRequests, setInlineToolRequests] = useState(themeStore.inlineToolRequests)
  const [toolCardStyle, setToolCardStyle] = useState(themeStore.toolCardStyle)
  const [immersiveMode, setImmersiveMode] = useState(themeStore.immersiveMode)
  const [compactInlinePermission, setCompactInlinePermission] = useState(themeStore.compactInlinePermission)
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

  const handleDescriptiveToolStepsToggle = () => {
    const v = !descriptiveToolSteps
    setDescriptiveToolSteps(v)
    themeStore.setDescriptiveToolSteps(v)
  }

  const handleInlineToolRequestsToggle = () => {
    const v = !inlineToolRequests
    setInlineToolRequests(v)
    themeStore.setInlineToolRequests(v)
  }

  const handleCompactInlinePermissionToggle = () => {
    const v = !compactInlinePermission
    setCompactInlinePermission(v)
    themeStore.setCompactInlinePermission(v)
  }

  const handleToolCardStyleChange = (style: ToolCardStyle) => {
    setToolCardStyle(style)
    themeStore.setToolCardStyle(style)
  }

  const handleImmersiveModeToggle = () => {
    const v = !immersiveMode
    setImmersiveMode(v)
    themeStore.setImmersiveMode(v)
    // 同步本地 state（因为 setImmersiveMode 联动改了子功能）
    setInlineToolRequests(v)
    setDescriptiveToolSteps(v)
    setToolCardStyle(v ? 'compact' : 'classic')
    setCompactInlinePermission(v)
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard title={t('chat.pathsFormatting')} description={t('chat.pathsFormattingDesc')}>
          <SegmentedControl
            value={pathMode}
            options={[
              { value: 'auto', label: t('chat.auto'), icon: <PathAutoIcon size={14} /> },
              { value: 'unix', label: t('chat.unixSlash'), icon: <PathUnixIcon size={14} /> },
              { value: 'windows', label: t('chat.winBackslash'), icon: <PathWindowsIcon size={14} /> },
            ]}
            onChange={v => setPathMode(v as PathMode)}
          />
          {isAutoMode && (
            <div className="text-[11px] text-text-400 mt-2 px-1">
              {t('chat.usingStyle', { style: effectiveStyle === 'windows' ? '\\' : '/' })}
              {detectedStyle && (
                <>
                  {t('chat.detectedStyle', {
                    style: detectedStyle === 'windows' ? t('chat.windows') : t('chat.unix'),
                  })}
                </>
              )}
            </div>
          )}
        </SettingsCard>

        <SettingsCard title={t('chat.agentBehavior')} description={t('chat.agentBehaviorDesc')}>
          <SettingRow
            label={t('chat.autoApprove')}
            description={t('chat.autoApproveDesc')}
            icon={<BoltIcon size={14} />}
            onClick={handleAutoApprove}
          >
            <Toggle enabled={autoApprove} onChange={handleAutoApprove} />
          </SettingRow>
        </SettingsCard>

        <SettingsCard title={t('chat.sidebarRecents')} description={t('chat.sidebarRecentsDesc')}>
          <SettingRow
            label={t('chat.folderStyleRecents')}
            description={t('chat.folderStyleRecentsDesc')}
            icon={<FolderIcon size={14} />}
            onClick={handleSidebarFolderRecentsToggle}
          >
            <Toggle enabled={sidebarFolderRecents} onChange={handleSidebarFolderRecentsToggle} />
          </SettingRow>
        </SettingsCard>
      </div>

      <SettingsCard title={t('chat.conversationExperience')} description={t('chat.conversationExperienceDesc')}>
        <div className="space-y-3">
          <div className="grid gap-2 lg:grid-cols-2">
            <SettingRow
              label={t('chat.collapseLongMessages')}
              description={t('chat.collapseLongMessagesDesc')}
              icon={<CompactIcon size={14} />}
              onClick={handleCollapseToggle}
              className="bg-bg-100/35 border-border-200/45"
            >
              <Toggle enabled={collapseUserMessages} onChange={handleCollapseToggle} />
            </SettingRow>

            <SettingRow
              label={t('chat.immersiveMode')}
              description={t('chat.immersiveModeDesc')}
              icon={<EyeIcon size={14} />}
              onClick={handleImmersiveModeToggle}
              className="bg-bg-100/35 border-border-200/45"
            >
              <Toggle enabled={immersiveMode} onChange={handleImmersiveModeToggle} />
            </SettingRow>
          </div>

          <div className="grid gap-2 lg:grid-cols-2">
            <SettingRow
              label={t('chat.inlineToolRequests')}
              description={t('chat.inlineToolRequestsDesc')}
              icon={<PermissionListIcon size={14} />}
              onClick={handleInlineToolRequestsToggle}
              className="bg-bg-100/35 border-border-200/45"
            >
              <Toggle enabled={inlineToolRequests} onChange={handleInlineToolRequestsToggle} />
            </SettingRow>

            <SettingRow
              label={t('chat.compactInlinePermission')}
              description={t('chat.compactInlinePermissionDesc')}
              icon={<CompactIcon size={14} />}
              onClick={handleCompactInlinePermissionToggle}
              className="bg-bg-100/35 border-border-200/45"
            >
              <Toggle enabled={compactInlinePermission} onChange={handleCompactInlinePermissionToggle} />
            </SettingRow>

            <SettingRow
              label={t('chat.descriptiveToolSteps')}
              description={t('chat.descriptiveToolStepsDesc')}
              icon={<SplitIcon size={14} />}
              onClick={handleDescriptiveToolStepsToggle}
              className="bg-bg-100/35 border-border-200/45"
            >
              <Toggle enabled={descriptiveToolSteps} onChange={handleDescriptiveToolStepsToggle} />
            </SettingRow>

            <div className="rounded-lg border border-border-200/45 bg-bg-100/35 px-2.5 py-2.5">
              <div className="flex items-start gap-3">
                <span className="text-text-400 mt-0.5 shrink-0">
                  <LayersIcon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-text-100">{t('chat.toolCardStyle')}</div>
                  <div className="text-[11px] text-text-400 mt-0.5 mb-2">{t('chat.toolCardStyleDesc')}</div>
                  <SegmentedControl
                    value={toolCardStyle}
                    options={[
                      { value: 'classic', label: t('chat.toolCardClassic') },
                      { value: 'compact', label: t('chat.toolCardCompact') },
                    ]}
                    onChange={v => handleToolCardStyleChange(v as ToolCardStyle)}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-border-200/45 bg-bg-100/35 px-2.5 py-2.5">
              <div className="flex items-start gap-3">
                <span className="text-text-400 mt-0.5 shrink-0">
                  <ThinkingIcon size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-text-100">{t('chat.thinkingDisplay')}</div>
                  <div className="text-[11px] text-text-400 mt-0.5 mb-2">{t('chat.thinkingDisplayDesc')}</div>
                  <SegmentedControl
                    value={reasoningDisplayMode}
                    options={[
                      { value: 'capsule', label: t('chat.capsule') },
                      { value: 'italic', label: t('chat.italic') },
                      { value: 'markdown', label: t('chat.markdown') },
                    ]}
                    onChange={v => handleReasoningDisplayModeChange(v as ReasoningDisplayMode)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-border-100/55">
            <div className="text-[11px] font-medium text-text-400 uppercase tracking-wider mb-2">
              {t('chat.stepFinishInfo')}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {(
                [
                  { key: 'tokens', label: t('chat.tokens'), desc: t('chat.showTokenUsage') },
                  { key: 'cache', label: t('chat.cache'), desc: t('chat.showCacheHit') },
                  { key: 'cost', label: t('chat.cost'), desc: t('chat.showApiCost') },
                  { key: 'duration', label: t('chat.duration'), desc: t('chat.showResponseTime') },
                  { key: 'turnDuration', label: t('chat.totalDuration'), desc: t('chat.showTurnElapsed') },
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
