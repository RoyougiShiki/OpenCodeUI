import { memo, useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  SearchIcon,
  FileIcon,
  FolderIcon,
  MessageSquareIcon,
  ChevronRightIcon,
  HashIcon,
} from './Icons'
import { searchFiles, searchDirectories, grepFiles, type GrepMatch } from '../api/file'
import { getSessions } from '../api/session'
import type { ApiSession } from '../api/types'
import { useDirectory, useRouter } from '../hooks'
import { layoutStore } from '../store/layoutStore'
import { useDelayedRender } from '../hooks/useDelayedRender'

interface QuickOpenItem {
  id: string
  label: string
  description: string
  type: 'file' | 'folder' | 'session'
  path?: string
  directory?: string
  sessionId?: string
}

type SearchMode = 'all' | 'files' | 'folders' | 'sessions' | 'content'

interface QuickOpenProps {
  onClose: () => void
}

// 高亮文件名中的搜索关键词（用于文件名匹配场景，无 submatches）
function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text
  const keywords = query.trim().split(/\s+/).filter(Boolean)
  if (keywords.length === 0) return text
  const sorted = keywords.slice().sort((a, b) => b.length - a.length)
  const pattern = sorted
    .map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
  const regex = new RegExp(`(${pattern})`, 'gi')
  const parts = text.split(regex)
  if (parts.length <= 1) return text
  const keywordSet = new Set(keywords.map(k => k.toLowerCase()))
  return (
    <span>
      {parts.map((part, i) =>
        keywordSet.has(part.toLowerCase()) ? <mark key={i}>{part}</mark> : part
      )}
    </span>
  )
}

const CONTEXT_CHARS = 80

/**
 * Convert ripgrep byte offsets to JavaScript character offsets.
 * ripgrep returns UTF-8 byte offsets, but JS string.slice() uses character offsets.
 * For text with multi-byte characters (CJK, emoji), byte offsets != char offsets.
 */
function byteToCharOffsets(text: string, submatches: Array<{ start: number; end: number }>): Array<{ start: number; end: number }> {
  const encoder = new TextEncoder()
  const byteToChar: number[] = []
  let bytePos = 0
  for (let charPos = 0; charPos < text.length; charPos++) {
    byteToChar[bytePos] = charPos
    bytePos += encoder.encode(text[charPos]).length
  }
  byteToChar[bytePos] = text.length

  return submatches.map(sm => {
    const startChar = byteToChar[sm.start] ?? sm.start
    const endChar = byteToChar[sm.end] ?? sm.end
    return { start: startChar, end: endChar }
  })
}

interface TruncatedLine {
  text: string
  leftClipped: boolean
  rightClipped: boolean
  submatches: Array<{ start: number; end: number }>
}

function smartTruncate(line: string, rawSubmatches: Array<{ start: number; end: number }>): TruncatedLine {
  const submatches = byteToCharOffsets(line, rawSubmatches)

  if (line.length <= CONTEXT_CHARS * 2 + 20) {
    return { text: line, leftClipped: false, rightClipped: false, submatches }
  }

  const sorted = [...submatches].sort((a, b) => a.start - b.start)
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const matchCenter = Math.floor((first.start + last.end) / 2)

  let windowStart = Math.max(0, matchCenter - CONTEXT_CHARS)
  let windowEnd = Math.min(line.length, windowStart + CONTEXT_CHARS * 2)

  if (windowEnd === line.length) {
    windowStart = Math.max(0, windowEnd - CONTEXT_CHARS * 2)
  }

  const leftClipped = windowStart > 0
  const rightClipped = windowEnd < line.length
  const sliced = line.slice(windowStart, windowEnd)

  const adjustedSubmatches: Array<{ start: number; end: number }> = []
  for (const sm of sorted) {
    if (sm.end <= windowStart || sm.start >= windowEnd) continue
    const s = Math.max(0, sm.start - windowStart)
    const e = Math.min(sliced.length, sm.end - windowStart)
    adjustedSubmatches.push({ start: s, end: e })
  }

  return { text: sliced, leftClipped, rightClipped, submatches: adjustedSubmatches }
}

function mergeSubmatches(allResults: GrepMatch[][], filtered: GrepMatch[]): GrepMatch[] {
  const keyMap = new Map<string, Array<{ start: number; end: number }>>()
  for (const results of allResults) {
    for (const match of results) {
      const key = `${match.path.text}:${match.line_number}`
      const existing = keyMap.get(key) || []
      for (const sm of match.submatches) {
        existing.push({ start: sm.start, end: sm.end })
      }
      keyMap.set(key, existing)
    }
  }
  return filtered.map(match => {
    const key = `${match.path.text}:${match.line_number}`
    const mergedSubmatches = keyMap.get(key) || match.submatches.map(sm => ({ start: sm.start, end: sm.end }))
    return { ...match, submatches: mergedSubmatches.map(sm => ({ match: { text: '' }, start: sm.start, end: sm.end })) }
  })
}

function highlightLine(truncated: TruncatedLine): ReactNode {
  const { text, leftClipped, rightClipped, submatches } = truncated

  if (submatches.length === 0) {
    return (
      <span className="truncate" title={text}>
        {leftClipped && <span className="text-text-500">…</span>}
        {text}
        {rightClipped && <span className="text-text-500">…</span>}
      </span>
    )
  }

  // Build highlighted parts using pre-computed submatch offsets
  const parts: ReactNode[] = []
  let lastEnd = 0
  for (const sm of submatches) {
    if (sm.start > lastEnd) {
      parts.push(text.slice(lastEnd, sm.start))
    }
    parts.push(<mark key={sm.start}>{text.slice(sm.start, sm.end)}</mark>)
    lastEnd = sm.end
  }
  if (lastEnd < text.length) {
    parts.push(text.slice(lastEnd))
  }

  return (
    <span className="truncate" title={text}>
      {leftClipped && <span className="text-text-500">…</span>}
      {parts}
      {rightClipped && <span className="text-text-500">…</span>}
    </span>
  )
}

export const QuickOpen = memo(function QuickOpen({ onClose }: QuickOpenProps) {
  const { t } = useTranslation(['components', 'common'])
  const { currentDirectory } = useDirectory()
  const { navigateToSession } = useRouter()
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [results, setResults] = useState<QuickOpenItem[]>([])
  const [contentResults, setContentResults] = useState<GrepMatch[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchMode, setSearchMode] = useState<SearchMode>('all')
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const shouldRender = useDelayedRender(true, 150)
  const [isVisible, setIsVisible] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (shouldRender) {
      requestAnimationFrame(() => {
        setIsVisible(true)
        inputRef.current?.focus()
      })
    }
  }, [shouldRender])

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setContentResults([])
      setSelectedIndex(0)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    const contentDebounce = searchMode === 'content' ? 400 : 150

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const q = query.trim()
        const dir = currentDirectory || undefined

if (searchMode === 'content') {
          const queries = q.trim().split(/\s+/).filter(Boolean).slice(0, 5)
          if (queries.length === 0) {
            setContentResults([])
          } else if (queries.length === 1) {
            const results = await grepFiles(queries[0], { directory: dir, limit: 30 }).catch(() => [] as GrepMatch[])
            setContentResults(results)
          } else {
            const allResults = await Promise.all(
              queries.map(kw => grepFiles(kw, { directory: dir, limit: 30 }).catch(() => [] as GrepMatch[]))
            )
            const first = allResults[0]
            const filtered = first.filter(match =>
              allResults.every((results, i) => {
                if (i === 0) return true
                const key = `${match.path.text}:${match.line_number}`
                return results.some(r => `${r.path.text}:${r.line_number}` === key)
              })
            )
            setContentResults(mergeSubmatches(allResults, filtered).slice(0, 30))
          }
          setResults([])
        } else {
          // 文件/文件夹/会话搜索 - 分开搜索
          const [filePaths, folderPaths, sessions] = await Promise.all([
            searchFiles(q, { directory: dir, limit: 30, type: 'file' }).catch(() => [] as string[]),
            searchDirectories(q, dir, 30).catch(() => [] as string[]),
            searchMode === 'all' || searchMode === 'sessions'
              ? getSessions({ search: q, limit: 10, roots: true }).catch(() => [] as ApiSession[])
              : Promise.resolve([] as ApiSession[]),
          ])

          const items: QuickOpenItem[] = []

          for (const p of filePaths) {
            if (searchMode === 'folders') continue
            if (searchMode === 'sessions') continue
            const name = p.split('/').filter(Boolean).pop() || p
            items.push({
              id: `file:${p}`,
              label: name,
              description: p,
              type: 'file',
              path: p,
            })
          }

          for (const p of folderPaths) {
            if (searchMode === 'files') continue
            if (searchMode === 'sessions') continue
            const name = p.split('/').filter(Boolean).pop() || p
            items.push({
              id: `folder:${p}`,
              label: name,
              description: p,
              type: 'folder',
              path: p,
            })
          }

          for (const s of sessions) {
            if (s.parentID) continue
            items.push({
              id: `session:${s.id}`,
              label: s.title || t('quickOpen.untitledSession'),
              description: s.directory || '',
              type: 'session',
              directory: s.directory,
              sessionId: s.id,
            })
          }

          setResults(items)
          setContentResults([])
        }
        setSelectedIndex(0)
      } catch {
        setResults([])
        setContentResults([])
      } finally {
        setIsSearching(false)
      }
    }, contentDebounce)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, currentDirectory, t, searchMode])

  // 搜索模式切换时清空结果
  useEffect(() => {
    setResults([])
    setContentResults([])
    setSelectedIndex(0)
  }, [searchMode])

  const executeItem = useCallback(
    (item: QuickOpenItem) => {
      onClose()

      requestAnimationFrame(() => {
        if (item.type === 'file' || item.type === 'folder') {
          const existingFilesTab = layoutStore.getTabsForPosition('right').find(t => t.type === 'files')
          if (existingFilesTab) {
            layoutStore.setActiveTab('right', existingFilesTab.id)
            layoutStore.openRightPanel('files')
            if (item.type === 'folder') {
              layoutStore.closeAllFilePreviews(existingFilesTab.id)
            }
          } else {
            layoutStore.addFilesTab('right')
          }
          if (item.path) {
            layoutStore.setRevealFilePath(item.path)
            if (item.type === 'file') {
              layoutStore.openFilePreview({ path: item.path, name: item.label }, 'right')
            }
          }
        } else if (item.type === 'session' && item.sessionId) {
          navigateToSession(item.sessionId, item.directory)
        }
      })
    },
    [onClose, navigateToSession],
  )

  const executeContentItem = useCallback(
    (match: GrepMatch) => {
      onClose()
      requestAnimationFrame(() => {
        const existingFilesTab = layoutStore.getTabsForPosition('right').find(t => t.type === 'files')
        if (existingFilesTab) {
          layoutStore.setActiveTab('right', existingFilesTab.id)
          layoutStore.openRightPanel('files')
        } else {
          layoutStore.addFilesTab('right')
        }
        layoutStore.setRevealFilePath(match.path.text)
        layoutStore.openFilePreview({ path: match.path.text, name: match.path.text.split('/').pop() || match.path.text }, 'right')
      })
    },
    [onClose],
  )

  // 计算当前可见结果数量（用于键盘导航）
  const visibleCount = searchMode === 'content' ? contentResults.length : results.length

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Tab 切换
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault()
        const modes: SearchMode[] = ['all', 'files', 'folders', 'sessions', 'content']
        const idx = modes.indexOf(searchMode)
        if (idx < modes.length - 1) {
          setSearchMode(modes[idx + 1])
        } else {
          setSearchMode(modes[0])
        }
        return
      }
      if (e.key === 'Tab' && e.shiftKey) {
        e.preventDefault()
        const modes: SearchMode[] = ['all', 'files', 'folders', 'sessions', 'content']
        const idx = modes.indexOf(searchMode)
        if (idx > 0) {
          setSearchMode(modes[idx - 1])
        } else {
          setSearchMode(modes[modes.length - 1])
        }
        return
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev => (prev < visibleCount - 1 ? prev + 1 : 0))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : visibleCount - 1))
          break
        case 'Enter':
          e.preventDefault()
          if (searchMode === 'content' && contentResults[selectedIndex]) {
            executeContentItem(contentResults[selectedIndex])
          } else if (results[selectedIndex]) {
            executeItem(results[selectedIndex])
          }
          break
        case 'Escape':
          e.preventDefault()
          e.stopPropagation()
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [results, contentResults, selectedIndex, executeItem, executeContentItem, onClose, searchMode, visibleCount])

  useEffect(() => {
    if (!listRef.current) return
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  const processedContentResults = useMemo(() => {
    return contentResults.map((match, idx) => {
      const fileName = match.path.text.split('/').pop() || match.path.text
      const truncated = smartTruncate(match.lines.text, match.submatches)
      return { match, idx, fileName, truncated }
    })
  }, [contentResults])

  const groupedResults = useMemo(() => {
    const groups: { type: QuickOpenItem['type']; label: string; items: QuickOpenItem[] }[] = []
    const files = results.filter(r => r.type === 'file')
    const folders = results.filter(r => r.type === 'folder')
    const sessions = results.filter(r => r.type === 'session')

    if (files.length > 0) groups.push({ type: 'file', label: t('quickOpen.files'), items: files })
    if (folders.length > 0) groups.push({ type: 'folder', label: t('quickOpen.folders'), items: folders })
    if (sessions.length > 0) groups.push({ type: 'session', label: t('quickOpen.sessions'), items: sessions })

    return groups
  }, [results, t])

  const tabButtons: { mode: SearchMode; label: string; icon: React.ReactNode }[] = [
    { mode: 'all', label: t('quickOpen.all'), icon: <SearchIcon size={12} /> },
    { mode: 'files', label: t('quickOpen.files'), icon: <FileIcon size={12} /> },
    { mode: 'folders', label: t('quickOpen.folders'), icon: <FolderIcon size={12} /> },
    { mode: 'sessions', label: t('quickOpen.sessions'), icon: <MessageSquareIcon size={12} /> },
    { mode: 'content', label: t('quickOpen.content'), icon: <HashIcon size={12} /> },
  ]

  if (!shouldRender) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      style={{
        backgroundColor: isVisible ? 'hsl(var(--always-black) / 0.2)' : 'hsl(var(--always-black) / 0)',
        transition: 'background-color 150ms ease-out',
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="w-full max-w-[600px] glass border border-border-200/60 rounded-xl shadow-lg overflow-hidden flex flex-col"
        style={{
          maxHeight: '60vh',
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? 'scale(1) translateY(0)' : 'scale(0.98) translateY(-8px)',
          transition: 'all 150ms ease-out',
        }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border-200/50">
          <SearchIcon size={16} className="text-text-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder={t('quickOpen.placeholder')}
            className="flex-1 py-3.5 text-[length:var(--fs-base)] bg-transparent text-text-100 placeholder:text-text-400 outline-none border-none"
            autoComplete="off"
            spellCheck={false}
          />
          {isSearching && (
            <span className="text-[length:var(--fs-xs)] text-text-400">{t('common:loading')}</span>
          )}
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border-200/30 bg-bg-100/50">
          {tabButtons.map(tab => (
            <button
              key={tab.mode}
              onClick={() => setSearchMode(tab.mode)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[length:var(--fs-xxs)] transition-colors ${
                searchMode === tab.mode
                  ? 'bg-accent-main-100/10 text-accent-main-100'
                  : 'text-text-400 hover:text-text-200 hover:bg-bg-200/50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div ref={listRef} className="overflow-y-auto custom-scrollbar flex-1 py-1">
          {searchMode === 'content' ? (
            // 内容搜索结果
            contentResults.length === 0 && query.trim() ? (
              <div className="px-4 py-8 text-center text-text-400 text-[length:var(--fs-base)]">
                {isSearching ? t('common:loading') : t('quickOpen.noResults')}
              </div>
            ) : (
              processedContentResults.map(({ match, idx, fileName, truncated }) => {
                const isActive = idx === selectedIndex
                return (
                  <button
                    key={`${match.path.text}:${match.line_number}`}
                    data-index={idx}
                    onClick={() => executeContentItem(match)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`w-full flex flex-col gap-0.5 px-4 py-2 text-left transition-colors duration-75 ${
                      isActive ? 'bg-accent-main-100/10 text-text-100' : 'text-text-200 hover:bg-bg-100/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <FileIcon size={12} className="shrink-0 text-text-400" />
                      <span className="text-[length:var(--fs-sm)] truncate font-mono">{highlightMatch(fileName, query)}</span>
                      <span className="text-[length:var(--fs-xxs)] text-text-500 shrink-0">:{match.line_number}</span>
                    </div>
                    <div className="text-[length:var(--fs-xxs)] text-text-400 font-mono pl-4 truncate">
                      {highlightLine(truncated)}
                    </div>
                  </button>
                )
              })
            )
          ) : results.length === 0 && query.trim() ? (
            <div className="px-4 py-8 text-center text-text-400 text-[length:var(--fs-base)]">
              {t('quickOpen.noResults')}
            </div>
          ) : (
            groupedResults.map(group => (
              <div key={group.type}>
                <div className="px-4 py-1.5 text-[length:var(--fs-xxs)] font-semibold uppercase tracking-wider text-text-400/60">
                  {group.label}
                </div>
                {group.items.map(item => {
                  const globalIndex = results.indexOf(item)
                  const isActive = globalIndex === selectedIndex
                  return (
                    <button
                      key={item.id}
                      data-index={globalIndex}
                      onClick={() => executeItem(item)}
                      onMouseEnter={() => setSelectedIndex(globalIndex)}
                      className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors duration-75 ${
                        isActive ? 'bg-accent-main-100/10 text-text-100' : 'text-text-200 hover:bg-bg-100/50'
                      }`}
                    >
                      <span className="shrink-0 text-text-400">
                        {item.type === 'file' && <FileIcon size={14} />}
                        {item.type === 'folder' && <FolderIcon size={14} />}
                        {item.type === 'session' && <MessageSquareIcon size={14} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[length:var(--fs-sm)] truncate">{item.label}</div>
                        <div className="text-[length:var(--fs-xxs)] text-text-400 truncate font-mono">{item.description}</div>
                      </div>
                      {item.type === 'folder' && (
                        <ChevronRightIcon size={12} className="shrink-0 text-text-500" />
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border-200/30 flex items-center gap-4 text-[length:var(--fs-xs)] text-text-400">
          <span>↑↓ {t('common:navigate')}</span>
          <span>Tab {t('quickOpen.switchTab')}</span>
          <span>↵ {t('common:run')}</span>
          <span>Esc {t('common:close')}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
})
