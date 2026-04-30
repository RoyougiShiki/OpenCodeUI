import { memo, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSessionContext } from '../hooks'
import { useMessageStore } from '../store'
import { useSessionStats, formatTokens, formatCost } from '../hooks/useSessionStats'
import { summarizeSession } from '../api/session'
import { uiErrorHandler } from '../utils'

interface SummaryPanelProps {
  sessionId?: string | null
}

function formatDurationMs(ms: number): string {
  if (ms <= 0) return '0m'
  const minutes = Math.floor(ms / 60000)
  const hours = Math.floor(minutes / 60)
  const remainMinutes = minutes % 60
  if (hours > 0) return `${hours}h ${remainMinutes}m`
  return `${minutes}m`
}

export const SummaryPanel = memo(function SummaryPanel({ sessionId }: SummaryPanelProps) {
  const { t } = useTranslation(['components', 'common'])
  const { sessions } = useSessionContext()
  const { messages } = useMessageStore()
  const stats = useSessionStats()
  const [isSummarizing, setIsSummarizing] = useState(false)

  const currentSession = useMemo(() => sessions.find(s => s.id === sessionId) ?? null, [sessions, sessionId])

  const summaryMessages = useMemo(() => {
    return messages.filter(msg => msg.info.role === 'assistant' && (msg.info as { summary?: boolean }).summary)
  }, [messages])

  const latestAssistantModel = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const info = messages[i].info
      if (info.role !== 'assistant') continue
      const modelInfo = info as { providerID?: string; modelID?: string }
      if (modelInfo.providerID && modelInfo.modelID) {
        return { providerID: modelInfo.providerID, modelID: modelInfo.modelID }
      }
    }
    return null
  }, [messages])

  const sessionDuration = useMemo(() => {
    if (!currentSession?.time?.created || !currentSession?.time?.updated) return null
    return Math.max(0, currentSession.time.updated - currentSession.time.created)
  }, [currentSession])

  if (!sessionId) {
    return <div className="flex items-center justify-center h-full text-text-400 text-[length:var(--fs-sm)]">{t('summaryPanel.noActiveSession')}</div>
  }

  const handleSummarize = async () => {
    if (!latestAssistantModel || isSummarizing) return
    setIsSummarizing(true)
    try {
      await summarizeSession(sessionId, latestAssistantModel)
    } catch (error) {
      uiErrorHandler('summarize session', error)
    } finally {
      setIsSummarizing(false)
    }
  }

  return (
    <div className="h-full overflow-auto panel-scrollbar-y p-3 space-y-3">
      <section className="rounded-lg border border-border-200/50 bg-bg-100/35 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="text-[length:var(--fs-xs)] text-text-400">{t('summaryPanel.actions')}</div>
          <button
            onClick={() => void handleSummarize()}
            disabled={!latestAssistantModel || isSummarizing}
            className="px-2.5 py-1 rounded-md text-[length:var(--fs-xs)] bg-accent-main-100/15 text-accent-main-100 hover:bg-accent-main-100/25 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSummarizing ? t('summaryPanel.generating') : t('summaryPanel.generate')}
          </button>
        </div>
        {!latestAssistantModel && (
          <div className="text-[length:var(--fs-xs)] text-text-500 mt-2">{t('summaryPanel.noModelHint')}</div>
        )}
      </section>

      <section className="rounded-lg border border-border-200/50 bg-bg-100/35 p-3">
        <div className="text-[length:var(--fs-xs)] text-text-400 mb-1">{t('summaryPanel.overview')}</div>
        <div className="text-text-100 font-medium truncate">{currentSession?.title || t('quickOpen.untitledSession')}</div>
        <div className="text-[length:var(--fs-xs)] text-text-400 mt-1 font-mono truncate">{currentSession?.id || sessionId}</div>
      </section>

      <section className="rounded-lg border border-border-200/50 bg-bg-100/35 p-3">
        <div className="text-[length:var(--fs-xs)] text-text-400 mb-2">{t('summaryPanel.changes')}</div>
        <div className="text-[length:var(--fs-sm)] text-text-200 flex items-center gap-3">
          <span className="text-success-100">+{currentSession?.summary?.additions ?? 0}</span>
          <span className="text-danger-100">-{currentSession?.summary?.deletions ?? 0}</span>
          <span>{currentSession?.summary?.files ?? 0}f</span>
        </div>
      </section>

      <section className="rounded-lg border border-border-200/50 bg-bg-100/35 p-3">
        <div className="text-[length:var(--fs-xs)] text-text-400 mb-2">{t('summaryPanel.usage')}</div>
        <div className="grid grid-cols-2 gap-2 text-[length:var(--fs-sm)]">
          <div className="text-text-300">{t('summaryPanel.totalTokens')}</div>
          <div className="text-text-100 text-right font-mono">{formatTokens(stats.totalTokens)}</div>
          <div className="text-text-300">{t('summaryPanel.context')}</div>
          <div className="text-text-100 text-right font-mono">{Math.round(stats.contextPercent)}%</div>
          <div className="text-text-300">{t('summaryPanel.cost')}</div>
          <div className="text-text-100 text-right font-mono">{formatCost(stats.totalCost)}</div>
          <div className="text-text-300">{t('summaryPanel.duration')}</div>
          <div className="text-text-100 text-right font-mono">{sessionDuration === null ? '—' : formatDurationMs(sessionDuration)}</div>
        </div>
      </section>

      <section className="rounded-lg border border-border-200/50 bg-bg-100/35 p-3">
        <div className="text-[length:var(--fs-xs)] text-text-400 mb-2">{t('summaryPanel.compactionSummaries')}</div>
        {summaryMessages.length === 0 ? (
          <div className="text-[length:var(--fs-sm)] text-text-400">{t('summaryPanel.noSummaries')}</div>
        ) : (
          <ul className="space-y-1.5">
            {summaryMessages.slice(-10).map(msg => (
              <li key={msg.info.id} className="text-[length:var(--fs-sm)] text-text-200 truncate">
                #{msg.info.id.slice(0, 8)}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
})
