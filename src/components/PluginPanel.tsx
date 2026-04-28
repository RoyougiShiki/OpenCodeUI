import { memo, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { LayersIcon, RetryIcon, SpinnerIcon, AlertCircleIcon } from './Icons'
import { getConfig } from '../api/config'
import { useDirectory } from '../hooks'
import { apiErrorHandler } from '../utils'

interface PluginPanelProps {
  isResizing?: boolean
}

interface PluginEntry {
  path: string
  name: string
}

function extractPluginName(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/')
  return segments[segments.length - 1] || path
}

export const PluginPanel = memo(function PluginPanel({ isResizing: _isResizing }: PluginPanelProps) {
  const { t } = useTranslation(['components', 'common'])
  const { currentDirectory } = useDirectory()
  const [plugins, setPlugins] = useState<PluginEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadPlugins = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const config = await getConfig(currentDirectory)
      const pluginPaths: string[] = (config as Record<string, unknown>).plugin
        ? ((config as Record<string, unknown>).plugin as string[])
        : []
      const entries: PluginEntry[] = pluginPaths.map(p => ({
        path: p,
        name: extractPluginName(p),
      }))
      entries.sort((a, b) => a.name.localeCompare(b.name))
      setPlugins(entries)
    } catch (err) {
      apiErrorHandler('load plugins', err)
      setError(t('pluginPanel.failedToLoad'))
    } finally {
      setLoading(false)
    }
  }, [currentDirectory, t])

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  return (
    <div className="flex flex-col h-full bg-bg-100">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-100">
        <div className="flex items-center gap-2 text-text-100 text-[length:var(--fs-base)] font-medium">
          <LayersIcon size={14} />
          <span>{t('pluginPanel.installed', { count: plugins.length })}</span>
        </div>
        <button
          onClick={loadPlugins}
          disabled={loading}
          className="p-1 hover:bg-bg-200 rounded text-text-300 hover:text-text-100 transition-colors disabled:opacity-50"
          title={t('common:refresh')}
        >
          <RetryIcon size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {loading && plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-400 text-[length:var(--fs-base)] gap-2">
            <SpinnerIcon size={20} className="animate-spin opacity-50" />
            <span>{t('pluginPanel.loading')}</span>
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-text-400 text-[length:var(--fs-base)] gap-2">
            <AlertCircleIcon size={20} className="text-danger-100" />
            <span>{error}</span>
            <button
              onClick={loadPlugins}
              className="px-3 py-1.5 text-[length:var(--fs-sm)] bg-bg-200/50 hover:bg-bg-200 text-text-200 rounded-md transition-colors"
            >
              {t('common:retry')}
            </button>
          </div>
        ) : plugins.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-text-400 text-[length:var(--fs-base)] gap-2 px-4 text-center">
            <LayersIcon size={24} className="opacity-30" />
            <span>{t('pluginPanel.noPlugins')}</span>
          </div>
        ) : (
          <div className="divide-y divide-border-100">
            {plugins.map(plugin => (
              <div
                key={plugin.path}
                className="flex items-center gap-2 px-3 py-2 hover:bg-bg-200/50 transition-colors"
              >
                <div className="w-2 h-2 rounded-full shrink-0 bg-success-100" />
                <div className="flex-1 min-w-0">
                  <div className="text-[length:var(--fs-base)] text-text-100 truncate">{plugin.name}</div>
                  <div className="text-[length:var(--fs-sm)] text-text-400 font-mono truncate">{plugin.path}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
