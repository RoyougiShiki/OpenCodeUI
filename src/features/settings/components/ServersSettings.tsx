import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button } from '../../../components/ui/Button'
import { GlobeIcon, PlusIcon, TrashIcon, WifiIcon, WifiOffIcon, SpinnerIcon, KeyIcon } from '../../../components/Icons'
import { useServerStore, useRouter } from '../../../hooks'
import { messageStore } from '../../../store'
import { SettingsCard } from './SettingsUI'
import type { ServerConfig, ServerHealth } from '../../../store/serverStore'

// ============================================
// Server Item
// ============================================

function ServerItem({
  server,
  health,
  isActive,
  onSelect,
  onDelete,
  onCheckHealth,
}: {
  server: ServerConfig
  health: ServerHealth | null
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
  onCheckHealth: () => void
}) {
  const statusIcon = () => {
    if (!health || health.status === 'checking') return <SpinnerIcon size={12} className="animate-spin text-text-400" />
    if (health.status === 'online') return <WifiIcon size={12} className="text-success-100" />
    if (health.status === 'unauthorized') return <KeyIcon size={12} className="text-warning-100" />
    return <WifiOffIcon size={12} className="text-danger-100" />
  }

  const statusTitle = () => {
    if (!health) return 'Check health'
    switch (health.status) {
      case 'checking':
        return 'Checking...'
      case 'online':
        return `Online (${health.latency}ms)${health.version ? ` · OpenCode v${health.version}` : ''}`
      case 'unauthorized':
        return 'Invalid credentials'
      case 'offline':
        return health.error || 'Offline'
      case 'error':
        return health.error || 'Error'
      default:
        return 'Unknown'
    }
  }

  return (
    <div
      className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer group
        ${
          isActive ? 'border-accent-main-100/40 bg-accent-main-100/5' : 'border-border-200/40 hover:border-border-300'
        }`}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
    >
      <GlobeIcon size={14} className={isActive ? 'text-accent-main-100' : 'text-text-400'} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[13px] font-medium text-text-100 truncate">{server.name}</span>
          {isActive && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium text-accent-main-100 bg-accent-main-100/10 shrink-0">
              Current
            </span>
          )}
        </div>
        <div className="text-[11px] text-text-400 truncate font-mono flex items-center gap-1">
          {server.url}
          {server.auth?.password && <KeyIcon size={10} className="shrink-0 text-text-400" />}
        </div>
      </div>
      <button
        className="p-2 rounded hover:bg-bg-200 transition-colors"
        onClick={e => {
          e.stopPropagation()
          onCheckHealth()
        }}
        title={statusTitle()}
      >
        {statusIcon()}
      </button>
      {!server.isDefault && (
        <button
          className="p-2 rounded text-text-400 hover:text-danger-100 hover:bg-danger-100/10 
                     md:opacity-0 md:group-hover:opacity-100 transition-all"
          onClick={e => {
            e.stopPropagation()
            onDelete()
          }}
          title="Remove"
        >
          <TrashIcon size={12} />
        </button>
      )}
    </div>
  )
}

// ============================================
// Add Server Form
// ============================================

function AddServerForm({
  onAdd,
  onCancel,
}: {
  onAdd: (name: string, url: string, username?: string, password?: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showAuth, setShowAuth] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Name required')
      return
    }
    if (!url.trim()) {
      setError('URL required')
      return
    }
    try {
      new URL(url)
    } catch {
      setError('Invalid URL')
      return
    }

    onAdd(
      name.trim(),
      url.trim(),
      password.trim() ? username.trim() || 'opencode' : undefined,
      password.trim() || undefined,
    )
  }

  const isCrossOrigin = (() => {
    if (!url.trim()) return false
    try {
      const serverUrl = new URL(url)
      return serverUrl.origin !== window.location.origin
    } catch {
      return false
    }
  })()

  const inputCls =
    'w-full h-8 px-3 text-[13px] bg-bg-000 border border-border-200 rounded-md focus:outline-none focus:border-accent-main-100/50 text-text-100 placeholder:text-text-400'

  return (
    <form onSubmit={handleSubmit} className="p-3 rounded-lg border border-border-200 bg-bg-050 space-y-2.5">
      <div>
        <label className="block text-[11px] font-medium text-text-300 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => {
            setName(e.target.value)
            setError('')
          }}
          placeholder="My Server"
          className={inputCls}
          autoFocus
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium text-text-300 mb-1">URL</label>
        <input
          type="text"
          value={url}
          onChange={e => {
            setUrl(e.target.value)
            setError('')
          }}
          placeholder="http://192.168.1.100:4096"
          className={`${inputCls} font-mono`}
        />
      </div>

      <button
        type="button"
        onClick={() => setShowAuth(!showAuth)}
        className="flex items-center gap-1.5 text-[11px] text-accent-main-100 hover:text-accent-main-200 transition-colors"
      >
        <KeyIcon size={10} />
        {showAuth ? 'Hide authentication' : 'Add authentication'}
      </button>

      {showAuth && (
        <>
          <div>
            <label className="block text-[11px] font-medium text-text-300 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => {
                setUsername(e.target.value)
                setError('')
              }}
              placeholder="opencode (default)"
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-text-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => {
                setPassword(e.target.value)
                setError('')
              }}
              placeholder="OPENCODE_SERVER_PASSWORD"
              className={inputCls}
            />
          </div>

          {isCrossOrigin && password.trim() && (
            <div className="text-[11px] text-warning-100 bg-warning-bg border border-warning-100/20 rounded-md px-2.5 py-2 leading-relaxed">
              Cross-origin + password may not work due to a backend CORS limitation (
              <a
                href="https://github.com/anomalyco/opencode/issues/10047"
                target="_blank"
                rel="noopener"
                className="underline hover:no-underline"
              >
                #10047
              </a>
              ). Consider deploying the UI on the same origin or starting the server without a password.
            </div>
          )}

          <div className="text-[11px] text-text-400 leading-relaxed">
            Credentials are stored in localStorage. For same-origin setups, the browser can handle auth natively without
            entering credentials here.
          </div>
        </>
      )}

      {error && <p className="text-[11px] text-danger-100">{error}</p>}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Add
        </Button>
      </div>
    </form>
  )
}

// ============================================
// Tab: Servers
// ============================================

export function ServersSettings() {
  const [addingServer, setAddingServer] = useState(false)
  const { servers, activeServer, addServer, removeServer, setActiveServer, checkHealth, checkAllHealth, getHealth } =
    useServerStore()
  const { navigateHome, sessionId: routeSessionId } = useRouter()
  const orderedServers = useMemo(() => {
    if (!activeServer) return servers
    const active = servers.find(s => s.id === activeServer.id)
    if (!active) return servers
    return [active, ...servers.filter(s => s.id !== active.id)]
  }, [servers, activeServer])

  useEffect(() => {
    checkAllHealth()
  }, [checkAllHealth])

  // 切换服务器：设置 active + 清理当前 session + 导航回首页
  const handleSelectServer = useCallback(
    (id: string) => {
      if (activeServer?.id === id) return // 没变，不做事

      // 清理当前 session 的 store 状态
      if (routeSessionId) {
        messageStore.clearSession(routeSessionId)
      }

      setActiveServer(id) // 内部触发 serverChangeListeners → reconnectSSE()
      navigateHome()
    },
    [activeServer?.id, routeSessionId, setActiveServer, navigateHome],
  )

  return (
    <div className="space-y-4">
      <SettingsCard
        title="Connections"
        description="Manage backend endpoints and choose which server this session uses"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={checkAllHealth}
              className="text-[11px] px-2 py-1 rounded-md border border-border-200/60 text-text-300 hover:text-text-100 hover:border-border-300/70 hover:bg-bg-100/60 transition-colors"
            >
              Refresh
            </button>
            {!addingServer && (
              <button
                onClick={() => setAddingServer(true)}
                className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-accent-main-100/40 text-accent-main-100 hover:text-accent-main-200 hover:border-accent-main-100/60 hover:bg-accent-main-100/5 transition-colors"
              >
                <PlusIcon size={10} /> Add
              </button>
            )}
          </div>
        }
      >
        <div className="space-y-1.5">
          {orderedServers.map(s => (
            <ServerItem
              key={s.id}
              server={s}
              health={getHealth(s.id)}
              isActive={activeServer?.id === s.id}
              onSelect={() => handleSelectServer(s.id)}
              onDelete={() => removeServer(s.id)}
              onCheckHealth={() => checkHealth(s.id)}
            />
          ))}

          {addingServer && (
            <AddServerForm
              onAdd={(n, u, user, pass) => {
                const auth = pass ? { username: user || 'opencode', password: pass } : undefined
                const s = addServer({ name: n, url: u, auth })
                setAddingServer(false)
                checkHealth(s.id)
              }}
              onCancel={() => setAddingServer(false)}
            />
          )}

          {servers.length === 0 && !addingServer && (
            <div className="text-[13px] text-text-400 text-center py-8">No servers configured</div>
          )}
        </div>
      </SettingsCard>
    </div>
  )
}
