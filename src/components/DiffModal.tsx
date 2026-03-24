/**
 * DiffModal - 全屏 Diff 查看器
 *
 * 基于通用 FullscreenViewer，真全屏铺满视口。
 */

import { memo, useState, useEffect, useMemo } from 'react'
import { diffLines } from 'diff'
import { detectLanguage } from '../utils/languageUtils'
import { extractContentFromUnifiedDiff } from '../utils/diffUtils'
import { DiffViewer, type ViewMode } from './DiffViewer'
import { FullscreenViewer, ViewModeSwitch } from './FullscreenViewer'

// ============================================
// Types
// ============================================

interface DiffModalProps {
  isOpen: boolean
  onClose: () => void
  diff: { before: string; after: string } | string
  filePath?: string
  language?: string
  diffStats?: { additions: number; deletions: number }
}

// ============================================
// Main Component
// ============================================

export const DiffModal = memo(function DiffModal({
  isOpen,
  onClose,
  diff,
  filePath,
  language,
  diffStats: providedStats,
}: DiffModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('split')

  useEffect(() => {
    if (!isOpen) return
    const checkWidth = () => setViewMode(window.innerWidth >= 1000 ? 'split' : 'unified')
    checkWidth()
    window.addEventListener('resize', checkWidth)
    return () => window.removeEventListener('resize', checkWidth)
  }, [isOpen])

  const { before, after } = useMemo(() => {
    if (typeof diff === 'object') return diff
    return extractContentFromUnifiedDiff(diff)
  }, [diff])

  const lang = language || detectLanguage(filePath) || 'text'
  const fileName = filePath?.split(/[/\\]/).pop()

  const diffStats = useMemo(() => {
    if (providedStats) return providedStats
    const changes = diffLines(before, after)
    let additions = 0,
      deletions = 0
    for (const c of changes) {
      if (c.added) additions += c.count || 0
      if (c.removed) deletions += c.count || 0
    }
    return { additions, deletions }
  }, [before, after, providedStats])

  return (
    <FullscreenViewer
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {fileName && (
            <span className="text-text-100 font-mono text-[13px] font-medium truncate min-w-0 flex-1">{fileName}</span>
          )}
          {filePath && fileName && filePath !== fileName && (
            <span className="text-text-500 font-mono text-[11px] truncate hidden sm:block min-w-0">{filePath}</span>
          )}
        </div>
      }
      titleExtra={
        <div className="flex items-center gap-1.5 text-[11px] font-mono tabular-nums shrink-0">
          {diffStats.additions > 0 && <span className="text-success-100">+{diffStats.additions}</span>}
          {diffStats.deletions > 0 && <span className="text-danger-100">-{diffStats.deletions}</span>}
        </div>
      }
      headerRight={<ViewModeSwitch viewMode={viewMode} onChange={setViewMode} />}
    >
      <DiffViewer before={before} after={after} language={lang} viewMode={viewMode} />
    </FullscreenViewer>
  )
})
