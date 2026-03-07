import { useState, useEffect, useCallback } from 'react'
import { normalizeToForwardSlash, serverStorage } from '../utils'
import { STORAGE_KEY_LAST_DIRECTORY } from '../constants/storage'

/**
 * Hash 路由，支持 directory 参数
 * 格式: #/session/{sessionId}?dir={path} 或 #/?dir={path}
 *
 * directory 存 URL 的好处：每个标签独立，刷新保持状态
 */

interface RouteState {
  sessionId: string | null
  directory: string | undefined
}

function decodeDirectoryParam(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseHash(): RouteState {
  const hash = window.location.hash

  // 分离路径和查询参数
  const [path, queryString] = hash.split('?')

  // 解析 directory 参数（不需要 URL 解码，直接使用原始路径）
  let directory: string | undefined
  if (queryString) {
    // 手动解析 dir 参数，避免 URLSearchParams 自动解码
    const dirMatch = queryString.match(/(?:^|&)dir=([^&]*)/)
    if (dirMatch && dirMatch[1]) {
      // 入口标准化：统一转为正斜杠
      directory = normalizeToForwardSlash(decodeDirectoryParam(dirMatch[1])) || undefined
    }
  }

  // URL 没有 dir 参数时，从 per-server storage 恢复上次目录
  if (!directory) {
    const saved = serverStorage.get(STORAGE_KEY_LAST_DIRECTORY)
    if (saved) directory = saved
  }

  // 匹配 #/session/{id}
  const sessionMatch = path.match(/^#\/session\/(.+)$/)
  if (sessionMatch) {
    return { sessionId: sessionMatch[1], directory }
  }

  return { sessionId: null, directory }
}

function buildHash(sessionId: string | null, directory: string | undefined): string {
  const path = sessionId ? `#/session/${sessionId}` : '#/'
  if (directory) {
    return `${path}?dir=${encodeURIComponent(directory)}`
  }
  return path
}

export function useRouter() {
  const [route, setRoute] = useState<RouteState>(parseHash)

  // 监听 hash 变化
  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash())
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // 导航到 session（默认保留当前 directory，可选传入目标 directory）
  const navigateToSession = useCallback(
    (sessionId: string, directory?: string) => {
      const dir = directory !== undefined ? normalizeToForwardSlash(directory) || undefined : route.directory
      window.location.hash = buildHash(sessionId, dir)
    },
    [route.directory],
  )

  // 导航到首页（保留当前 directory）
  const navigateHome = useCallback(() => {
    window.location.hash = buildHash(null, route.directory)
  }, [route.directory])

  // 替换当前路由（不产生历史记录）
  const replaceSession = useCallback(
    (sessionId: string | null) => {
      const newHash = buildHash(sessionId, route.directory)
      window.history.replaceState(null, '', newHash)
      setRoute({ sessionId, directory: route.directory })
    },
    [route.directory],
  )

  // 设置 directory（切换目录时清除当前 session，避免 session 与目录不匹配）
  const setDirectory = useCallback((directory: string | undefined) => {
    // 入口标准化：统一转为正斜杠
    const normalized = directory ? normalizeToForwardSlash(directory) : undefined
    // 切换目录时清除 sessionId，回到首页
    // 否则 URL 会变成 #/session/OLD_SESSION?dir=NEW_DIR，导致请求路径错乱
    const newHash = buildHash(null, normalized || undefined)
    // 持久化到 per-server storage
    if (normalized) {
      serverStorage.set(STORAGE_KEY_LAST_DIRECTORY, normalized)
    } else {
      serverStorage.remove(STORAGE_KEY_LAST_DIRECTORY)
    }
    window.location.hash = newHash
  }, [])

  // 替换 directory（不产生历史记录）
  const replaceDirectory = useCallback(
    (directory: string | undefined) => {
      // 入口标准化：统一转为正斜杠
      const normalized = directory ? normalizeToForwardSlash(directory) : undefined
      const newHash = buildHash(route.sessionId, normalized || undefined)
      // 持久化到 per-server storage
      if (normalized) {
        serverStorage.set(STORAGE_KEY_LAST_DIRECTORY, normalized)
      } else {
        serverStorage.remove(STORAGE_KEY_LAST_DIRECTORY)
      }
      window.history.replaceState(null, '', newHash)
      setRoute({ sessionId: route.sessionId, directory: normalized || undefined })
    },
    [route.sessionId],
  )

  return {
    sessionId: route.sessionId,
    directory: route.directory,
    navigateToSession,
    navigateHome,
    replaceSession,
    setDirectory,
    replaceDirectory,
  }
}
