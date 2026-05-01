import { useEffect, useMemo } from 'react'
import {
  DESKTOP_MACOS_TRAFFIC_LIGHTS_WIDTH,
  DESKTOP_TITLEBAR_CONTROLS_Z_INDEX,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TITLEBAR_Z_INDEX,
} from '../constants'
import { SearchIcon, TerminalIcon } from './Icons'
import { useTheme } from '../hooks/useTheme'
import { getDesktopPlatform, usesCustomDesktopTitlebar } from '../utils/tauri'

interface DesktopTitlebarProps {
  onOpenSearch?: () => void
  onOpenCommandPalette?: () => void
}

export function DesktopTitlebar({ onOpenSearch, onOpenCommandPalette }: DesktopTitlebarProps) {
  const { mode, resolvedTheme } = useTheme()
  const platform = useMemo(() => getDesktopPlatform(), [])
  const isDesktopChrome = useMemo(() => usesCustomDesktopTitlebar(), [])

  /* ---- 原生主题同步 ---- */
  useEffect(() => {
    if (!isDesktopChrome) return
    document.documentElement.style.setProperty('--desktop-titlebar-height', `${DESKTOP_TITLEBAR_HEIGHT}px`)
    return () => {
      document.documentElement.style.removeProperty('--desktop-titlebar-height')
    }
  }, [isDesktopChrome])

  useEffect(() => {
    if (!isDesktopChrome) return

    let cancelled = false
    const theme = mode === 'system' ? null : resolvedTheme

    void import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (cancelled) return
      try {
        await getCurrentWindow().setTheme(theme)
      } catch {
        // best effort
      }
    })

    return () => {
      cancelled = true
    }
  }, [isDesktopChrome, mode, resolvedTheme])

  if (!isDesktopChrome) return null

  return (
    <header
      className="desktop-titlebar relative grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center bg-bg-100"
      style={{ height: DESKTOP_TITLEBAR_HEIGHT, zIndex: DESKTOP_TITLEBAR_Z_INDEX }}
    >
      {/* ---- 左侧：平台占位 ---- */}
      <div className="flex h-full shrink-0 items-stretch">
        {platform === 'macos' ? (
          <div className="h-full shrink-0" style={{ width: DESKTOP_MACOS_TRAFFIC_LIGHTS_WIDTH }} />
        ) : (
          <div className="h-full shrink-0 w-1" />
        )}
      </div>

      {/* ---- 中间：搜索 / 命令面板 + 拖拽区 ---- */}
      <div className="flex h-full min-w-0 items-center justify-center gap-1">
        {(onOpenSearch || onOpenCommandPalette) && (
          <div className="flex items-center gap-1 no-drag">
            {onOpenSearch && (
              <button
                onClick={onOpenSearch}
                className="h-7 px-2 flex items-center gap-1.5 rounded-md text-text-400 hover:text-text-100 hover:bg-bg-200 active:scale-[0.98] transition-all duration-200"
                title="Quick Open"
              >
                <SearchIcon size={14} />
                <span className="text-[11px] font-medium">Search</span>
              </button>
            )}
            {onOpenCommandPalette && (
              <button
                onClick={onOpenCommandPalette}
                className="h-7 px-2 flex items-center gap-1.5 rounded-md text-text-400 hover:text-text-100 hover:bg-bg-200 active:scale-[0.98] transition-all duration-200"
                title="Command Palette"
              >
                <TerminalIcon size={14} />
                <span className="text-[11px] font-medium">Commands</span>
              </button>
            )}
          </div>
        )}
        {/* 拖拽区填满剩余空间 */}
        <div data-tauri-drag-region className="h-full flex-1" />
      </div>

      {/* ---- 右侧：Windows 控制按钮 / macOS 留白 ---- */}
      {platform === 'windows' ? (
        <div
          data-tauri-decorum-tb
          className="desktop-titlebar-controls flex h-full min-w-[138px] shrink-0 items-stretch justify-end"
          style={{ zIndex: DESKTOP_TITLEBAR_CONTROLS_Z_INDEX }}
        />
      ) : (
        <div data-tauri-drag-region className="h-full w-3 shrink-0" />
      )}
    </header>
  )
}
