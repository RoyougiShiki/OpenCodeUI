/**
 * MultiFileDiffModal - 全屏多文件 Diff 查看器
 *
 * 基于通用 FullscreenViewer，真全屏铺满视口。
 * VSCode 风格：左侧文件列表 + 右侧 Diff。
 */

import { memo, useState, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { getMaterialIconUrl } from '../utils/materialIcons'
import { DiffViewer, type ViewMode } from './DiffViewer'
import { FullscreenViewer, ViewModeSwitch } from './FullscreenViewer'
import { getSessionDiff } from '../api/session'
import type { FileDiff } from '../api/types'
import { detectLanguage } from '../utils/languageUtils'
import { sessionErrorHandler } from '../utils'

// ============================================
// Types
// ============================================

interface MultiFileDiffModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string
}

// ============================================
// Main Component
// ============================================

export const MultiFileDiffModal = memo(function MultiFileDiffModal({
  isOpen,
  onClose,
  sessionId,
}: MultiFileDiffModalProps) {
  const { t } = useTranslation(['components', 'common'])
  const [loading, setLoading] = useState(false)
  const [diffs, setDiffs] = useState<FileDiff[]>([])
  const [selectedFileIndex, setSelectedFileIndex] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('split')
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!isOpen) return
    const checkWidth = () => setViewMode(window.innerWidth >= 1200 ? 'split' : 'unified')
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen || !sessionId) return

    let cancelled = false
    const requestId = ++requestIdRef.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      setError(null)

      getSessionDiff(sessionId)
        .then(data => {
          if (cancelled || requestId !== requestIdRef.current) return

          setDiffs(data)
          if (data.length > 0) {
            setSelectedFileIndex(0)
          }
        })
        .catch(err => {
          if (cancelled || requestId !== requestIdRef.current) return
          sessionErrorHandler('load session diff', err)
          setError(t('multiFileDiff.failedToLoad'))
        })
        .finally(() => {
          if (!cancelled && requestId === requestIdRef.current) {
            setLoading(false)
          }
        })
    }, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isOpen, sessionId, t])

  const selectedDiff = diffs[selectedFileIndex]
  const language = selectedDiff ? detectLanguage(selectedDiff.file) || 'text' : 'text'

  const stats = useMemo(() => {
    let additions = 0,
      deletions = 0
    diffs.forEach(d => {
      additions += d.additions
      deletions += d.deletions
    })
    return { additions, deletions, files: diffs.length }
  }, [diffs])

  return (
    <FullscreenViewer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-4 min-w-0">
          <span className="text-text-100 font-medium text-[13px]">{t('multiFileDiff.sessionChanges')}</span>
          <div className="flex items-center gap-3 text-[11px] font-mono text-text-400 tabular-nums">
            <span>{t('multiFileDiff.fileCount', { count: stats.files })}</span>
            {(stats.additions > 0 || stats.deletions > 0) && (
              <div className="flex items-center gap-1.5">
                {stats.additions > 0 && <span className="text-success-100">+{stats.additions}</span>}
                {stats.deletions > 0 && <span className="text-danger-100">-{stats.deletions}</span>}
              </div>
            )}
          </div>
        </div>
      }
      headerRight={<ViewModeSwitch viewMode={viewMode} onChange={setViewMode} />}
    >
      {/* Body: sidebar + diff */}
      <div className="flex h-full overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 border-r border-border-100/30 flex flex-col shrink-0">
          <div className="flex-1 overflow-y-auto custom-scrollbar py-1">
            {loading ? (
              <div className="p-4 text-center text-text-400 text-xs">{t('common:loading')}</div>
            ) : error ? (
              <div className="p-4 text-center text-danger-100 text-xs">{error}</div>
            ) : diffs.length === 0 ? (
              <div className="p-4 text-center text-text-400 text-xs">{t('multiFileDiff.noChangesFound')}</div>
            ) : (
              diffs.map((d, idx) => {
                const name = d.file.split(/[/\\]/).pop() || d.file
                const isSelected = selectedFileIndex === idx

                return (
                  <button
                    key={idx}
                    onClick={() => setSelectedFileIndex(idx)}
                    className={`w-full min-w-0 text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors ${
                      isSelected
                        ? 'bg-accent-main-100/10 text-text-100'
                        : 'text-text-300 hover:bg-bg-200/40 hover:text-text-200'
                    }`}
                  >
                    <img
                      src={getMaterialIconUrl(d.file, 'file')}
                      alt=""
                      width={14}
                      height={14}
                      className="shrink-0"
                      loading="lazy"
                      decoding="async"
                      onError={e => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                    <span className="font-mono truncate flex-1 min-w-0">{name}</span>
                    <div className="flex items-center gap-1 text-[10px] font-mono tabular-nums shrink-0">
                      {d.additions > 0 && <span className="text-success-100">+{d.additions}</span>}
                      {d.deletions > 0 && <span className="text-danger-100">-{d.deletions}</span>}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        {/* Diff View */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedDiff ? (
            <>
              {/* File path bar */}
              <div className="h-8 px-4 border-b border-border-100/20 flex items-center gap-2 shrink-0">
                <img
                  src={getMaterialIconUrl(selectedDiff.file, 'file')}
                  alt=""
                  width={14}
                  height={14}
                  className="shrink-0"
                  onError={e => {
                    e.currentTarget.style.visibility = 'hidden'
                  }}
                />
                <span className="font-mono text-[11px] text-text-300 truncate flex-1 min-w-0">{selectedDiff.file}</span>
                <div className="flex items-center gap-1.5 text-[10px] font-mono tabular-nums shrink-0">
                  {selectedDiff.additions > 0 && <span className="text-success-100">+{selectedDiff.additions}</span>}
                  {selectedDiff.deletions > 0 && <span className="text-danger-100">-{selectedDiff.deletions}</span>}
                </div>
              </div>

              <div className="flex-1 min-h-0">
                <DiffViewer
                  before={selectedDiff.before}
                  after={selectedDiff.after}
                  language={language}
                  viewMode={viewMode}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-text-400 text-xs">
              {loading ? t('sessionChanges.loadingChanges') : t('multiFileDiff.selectFile')}
            </div>
          )}
        </div>
      </div>
    </FullscreenViewer>
  )
})
