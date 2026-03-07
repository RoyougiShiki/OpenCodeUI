// ============================================
// MCP API - Model Context Protocol 服务器管理
// ============================================

import { get, post, del } from './http'
import { formatPathForApi } from '../utils/directoryUtils'
import type { MCPStatusResponse, McpServerConfig } from '../types/api/mcp'

/**
 * 获取所有 MCP 服务器状态
 */
export async function getMcpStatus(directory?: string): Promise<MCPStatusResponse> {
  return get<MCPStatusResponse>('/mcp', { directory: formatPathForApi(directory) })
}

/**
 * 添加 MCP 服务器
 */
export async function addMcpServer(name: string, config: McpServerConfig, directory?: string): Promise<void> {
  return post<void>('/mcp', { directory: formatPathForApi(directory) }, { name, config })
}

/**
 * 连接到 MCP 服务器
 */
export async function connectMcpServer(name: string, directory?: string): Promise<void> {
  return post<void>(`/mcp/${encodeURIComponent(name)}/connect`, { directory: formatPathForApi(directory) })
}

/**
 * 断开 MCP 服务器连接
 */
export async function disconnectMcpServer(name: string, directory?: string): Promise<void> {
  return post<void>(`/mcp/${encodeURIComponent(name)}/disconnect`, { directory: formatPathForApi(directory) })
}

/**
 * 开始 MCP 认证流程
 */
export async function startMcpAuth(name: string, directory?: string): Promise<{ url: string }> {
  return post<{ url: string }>(`/mcp/${encodeURIComponent(name)}/auth`, { directory: formatPathForApi(directory) })
}

/**
 * 移除 MCP 认证
 */
export async function removeMcpAuth(name: string, directory?: string): Promise<void> {
  return del<void>(`/mcp/${encodeURIComponent(name)}/auth`, { directory: formatPathForApi(directory) })
}

/**
 * 完成 MCP OAuth 认证（使用授权码）
 */
export async function completeMcpAuth(name: string, code: string, directory?: string): Promise<void> {
  return post<void>(
    `/mcp/${encodeURIComponent(name)}/auth/callback`,
    { directory: formatPathForApi(directory) },
    { code },
  )
}

/**
 * 启动完整的 OAuth 认证流程（打开浏览器并等待回调）
 */
export async function authenticateMcp(name: string, directory?: string): Promise<void> {
  return post<void>(`/mcp/${encodeURIComponent(name)}/auth/authenticate`, { directory: formatPathForApi(directory) })
}
