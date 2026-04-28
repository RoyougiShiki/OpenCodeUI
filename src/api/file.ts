// ============================================
// File Search API Functions
// 基于 @opencode-ai/sdk: /file, /find/file, /find/symbol 相关接口
// ============================================

import { getSDKClient, unwrap } from './sdk'
import { formatPathForApi } from '../utils/directoryUtils'
import type { FileNode, FileContent, FileStatusItem, SymbolInfo } from './types'
import { serverStore, makeBasicAuthHeader } from '../store/serverStore'

const ROOT_DIRECTORY_CACHE_TTL_MS = 10_000

const rootDirectoryCache = new Map<string, { data: FileNode[]; expiresAt: number }>()
const rootDirectoryInflight = new Map<string, Promise<FileNode[]>>()

function isRootDirectoryPath(path: string): boolean {
  return path === '' || path === '.' || path === './'
}

function getRootDirectoryCacheKey(directory?: string): string {
  return `${serverStore.getActiveServerId()}::${formatPathForApi(directory) ?? ''}`
}

async function fetchDirectory(path: string, directory?: string): Promise<FileNode[]> {
  const sdk = getSDKClient()
  const isAbsolute = /^[a-zA-Z]:/.test(path) || path.startsWith('/')

  if (isAbsolute && !directory) {
    return unwrap(await sdk.file.list({ directory: formatPathForApi(path), path: '' }))
  }

  return unwrap(await sdk.file.list({ path, directory: formatPathForApi(directory) }))
}

/**
 * 搜索文件或目录
 */
export async function searchFiles(
  query: string,
  options: {
    directory?: string
    type?: 'file' | 'directory'
    limit?: number
  } = {},
): Promise<string[]> {
  const sdk = getSDKClient()
  return unwrap(
    await sdk.find.files({
      query,
      directory: formatPathForApi(options.directory),
      type: options.type,
      limit: options.limit,
    }),
  ) as string[]
}

/**
 * 列出目录内容
 */
export async function listDirectory(path: string, directory?: string): Promise<FileNode[]> {
  if (!isRootDirectoryPath(path)) {
    return fetchDirectory(path, directory)
  }

  const key = getRootDirectoryCacheKey(directory)
  const now = Date.now()
  const cached = rootDirectoryCache.get(key)
  if (cached && cached.expiresAt > now) {
    return cached.data
  }

  const inflight = rootDirectoryInflight.get(key)
  if (inflight) {
    return inflight
  }

  const request = fetchDirectory(path === '' ? '.' : path, directory)
    .then(data => {
      rootDirectoryCache.set(key, { data, expiresAt: Date.now() + ROOT_DIRECTORY_CACHE_TTL_MS })
      return data
    })
    .finally(() => {
      rootDirectoryInflight.delete(key)
    })

  rootDirectoryInflight.set(key, request)
  return request
}

export async function prefetchRootDirectory(directory?: string): Promise<void> {
  await listDirectory('.', directory)
}

/**
 * 读取文件内容
 */
export async function getFileContent(path: string, directory?: string): Promise<FileContent> {
  const sdk = getSDKClient()
  return unwrap(await sdk.file.read({ path, directory: formatPathForApi(directory) }))
}

/**
 * 获取文件 git 状态
 */
export async function getFileStatus(directory?: string): Promise<FileStatusItem[]> {
  const sdk = getSDKClient()
  return unwrap(await sdk.file.status({ directory: formatPathForApi(directory) }))
}

/**
 * 搜索代码符号
 */
export async function searchSymbols(query: string, directory?: string): Promise<SymbolInfo[]> {
  const sdk = getSDKClient()
  return unwrap(await sdk.find.symbols({ query, directory: formatPathForApi(directory) }))
}

/**
 * 搜索目录（便捷方法）
 */
export async function searchDirectories(query: string, baseDirectory?: string, limit: number = 50): Promise<string[]> {
  return searchFiles(query, {
    directory: baseDirectory,
    type: 'directory',
    limit,
  })
}

/**
 * Grep 搜索结果
 */
export interface GrepMatch {
  path: { text: string }
  line_number: number
  lines: { text: string }
  submatches: Array<{ match: { text: string }; start: number; end: number }>
}

/**
 * 在文件中搜索文本内容（基于 ripgrep）- 直接调用 /find API
 */
export async function grepFiles(
  pattern: string,
  options: {
    directory?: string
    limit?: number
  } = {},
): Promise<GrepMatch[]> {
  const baseUrl = serverStore.getActiveBaseUrl()
  const dir = formatPathForApi(options.directory) || ''
  const params = new URLSearchParams({ pattern })
  if (dir) params.set('directory', dir)
  if (options.limit) params.set('limit', String(options.limit))

  const auth = serverStore.getActiveAuth()
  const headers: Record<string, string> = {}
  if (auth?.password) {
    headers['Authorization'] = makeBasicAuthHeader(auth)
  }

  try {
    const res = await fetch(`${baseUrl}/find?${params}`, { headers })
    if (!res.ok) return []
    const data = await res.json()
    return (data as GrepMatch[]) ?? []
  } catch {
    return []
  }
}
