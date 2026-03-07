// ============================================
// Command API - 命令列表和执行
// ============================================

import { get, post } from './http'
import { formatPathForApi } from '../utils/directoryUtils'
import { serverStore } from '../store/serverStore'

export interface Command {
  name: string
  description?: string
  keybind?: string
}

// Builtin commands handled by dedicated endpoints, not returned by GET /command.
// Mirrors the official web app's hardcoded command registrations.
// See: sst/opencode packages/app/src/pages/session.tsx — "session.compact"
const BUILTIN_COMMANDS: Command[] = [
  { name: 'compact', description: 'Compact session by summarizing conversation history' },
]

const COMMAND_CACHE_TTL_MS = 10_000

const commandCache = new Map<string, { data: Command[]; expiresAt: number }>()
const commandInflight = new Map<string, Promise<Command[]>>()

function getCommandCacheKey(directory?: string): string {
  return `${serverStore.getActiveServerId()}::${formatPathForApi(directory) ?? ''}`
}

async function fetchCommands(directory?: string): Promise<Command[]> {
  let apiCommands: Command[] = []
  try {
    apiCommands = await get<Command[]>('/command', { directory: formatPathForApi(directory) })
  } catch {
    // Backend unreachable — builtins still available
  }
  const apiNames = new Set(apiCommands.map(c => c.name))
  return [...apiCommands, ...BUILTIN_COMMANDS.filter(c => !apiNames.has(c.name))]
}

export async function getCommands(directory?: string): Promise<Command[]> {
  const key = getCommandCacheKey(directory)
  const now = Date.now()
  const cached = commandCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.data
  }

  const inflight = commandInflight.get(key)
  if (inflight) {
    return inflight
  }

  const request = fetchCommands(directory)
    .then(data => {
      commandCache.set(key, { data, expiresAt: Date.now() + COMMAND_CACHE_TTL_MS })
      return data
    })
    .finally(() => {
      commandInflight.delete(key)
    })

  commandInflight.set(key, request)
  return request
}

export async function prefetchCommands(directory?: string): Promise<void> {
  await getCommands(directory)
}

export async function executeCommand(
  sessionId: string,
  command: string,
  args: string = '',
  directory?: string,
): Promise<unknown> {
  return post(`/session/${sessionId}/command`, { directory: formatPathForApi(directory) }, { command, arguments: args })
}
