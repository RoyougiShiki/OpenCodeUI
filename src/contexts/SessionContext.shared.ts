import { createContext } from 'react'
import type { ApiSession } from '../api'

export interface SessionContextValue {
  sessions: ApiSession[]
  /** 子 session（有 parentID）按父 ID 分组，用于在父 session 下折叠展示 */
  inlineChildSessions: Map<string, ApiSession[]>
  isLoading: boolean
  isLoadingMore: boolean
  hasMore: boolean
  search: string
  setSearch: (term: string) => void
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  createSession: (title?: string) => Promise<ApiSession>
  deleteSession: (id: string) => Promise<void>
}

export const SessionContext = createContext<SessionContextValue | null>(null)
