import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from './ui/Button'
import { createPtySession, removePtySession } from '../api/pty'
import { useServerStore } from '../hooks/useServerStore'
import { CloseIcon } from './Icons'

interface CliUpdateDialogProps {
  isOpen: boolean
  onClose: () => void
  currentVersion: string
  latestVersion: string
  onDismissVersion: () => void
  onUpdated?: () => void
}

export function CliUpdateDialog({
  isOpen,
  onClose,
  currentVersion,
  latestVersion,
  onDismissVersion,
  onUpdated,
}: CliUpdateDialogProps) {
  const { t } = useTranslation(['settings', 'common'])
  const { activeServer } = useServerStore()
  const [updating, setUpdating] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  const targetDirectory = useMemo(() => {
    if (!activeServer?.url) return '/'
    try {
      const host = new URL(activeServer.url).hostname
      return host === '127.0.0.1' || host === 'localhost' ? '/workspace' : '/'
    } catch {
      return '/'
    }
  }, [activeServer?.url])

  const handleUpdate = async () => {
    setUpdating(true)
    setResult(null)
    try {
      const pty = await createPtySession({
        command: 'sh',
        args: ['-lc', 'opencode upgrade'],
        cwd: targetDirectory,
      }, targetDirectory)

      await new Promise(resolve => setTimeout(resolve, 2000))
      await removePtySession(pty.id, targetDirectory).catch(() => {})
      setResult(t('about.cliUpdateSuccess'))
      onUpdated?.()
    } catch (error) {
      setResult(error instanceof Error ? error.message : t('about.cliUpdateFailed'))
    } finally {
      setUpdating(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed bottom-4 right-4 z-[120] w-[360px] max-w-[calc(100vw-1rem)] pointer-events-auto">
      <div className="glass border border-border-200/60 rounded-xl shadow-lg p-3 space-y-3 text-[length:var(--fs-sm)] text-text-300">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-text-100 font-semibold">{t('about.cliUpdateDialogTitle')}</div>
            <p className="text-[length:var(--fs-xs)] text-text-400 mt-1">{t('about.cliUpdateDialogDesc')}</p>
          </div>
          <button
            className="p-1 rounded text-text-400 hover:text-text-200 hover:bg-bg-200"
            onClick={() => {
              onDismissVersion()
              onClose()
            }}
            title={t('common:close')}
            aria-label={t('common:close')}
          >
            <CloseIcon size={12} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border border-border-200/50 bg-bg-000/35 px-2 py-2">
            <div className="text-[length:var(--fs-xs)] text-text-400">{t('about.cliCurrentVersion')}</div>
            <div className="font-mono text-text-100 text-[length:var(--fs-sm)]">{currentVersion}</div>
          </div>
          <div className="rounded-md border border-border-200/50 bg-bg-000/35 px-2 py-2">
            <div className="text-[length:var(--fs-xs)] text-text-400">{t('about.cliLatestVersion')}</div>
            <div className="font-mono text-text-100 text-[length:var(--fs-sm)]">{latestVersion}</div>
          </div>
        </div>

        {result && <div className="text-[length:var(--fs-xs)] text-text-300">{result}</div>}

        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onDismissVersion()
              onClose()
            }}
          >
            {t('about.remindMeLater')}
          </Button>
          <Button size="sm" variant="secondary" isLoading={updating} onClick={handleUpdate}>
            {t('about.updateCliNow')}
          </Button>
        </div>
      </div>
    </div>
  )
}
