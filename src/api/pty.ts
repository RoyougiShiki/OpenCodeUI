// ============================================
// PTY API - 终端管理
// ============================================

import { get, post, put, del, getApiBaseUrl, buildQueryString } from './http'
import { formatPathForApi } from '../utils/directoryUtils'
import { serverStore } from '../store/serverStore'
import type { Pty, PtyCreateParams, PtyUpdateParams } from '../types/api/pty'

/**
 * 获取所有 PTY 会话列表
 */
export async function listPtySessions(directory?: string): Promise<Pty[]> {
  return get<Pty[]>('/pty', { directory: formatPathForApi(directory) })
}

/**
 * 创建新的 PTY 会话
 */
export async function createPtySession(params: PtyCreateParams, directory?: string): Promise<Pty> {
  return post<Pty>('/pty', { directory: formatPathForApi(directory) }, params)
}

/**
 * 获取单个 PTY 会话信息
 */
export async function getPtySession(ptyId: string, directory?: string): Promise<Pty> {
  return get<Pty>(`/pty/${ptyId}`, { directory: formatPathForApi(directory) })
}

/**
 * 更新 PTY 会话
 */
export async function updatePtySession(ptyId: string, params: PtyUpdateParams, directory?: string): Promise<Pty> {
  return put<Pty>(`/pty/${ptyId}`, { directory: formatPathForApi(directory) }, params)
}

/**
 * 删除 PTY 会话
 */
export async function removePtySession(ptyId: string, directory?: string): Promise<boolean> {
  return del<boolean>(`/pty/${ptyId}`, { directory: formatPathForApi(directory) })
}

/**
 * 获取 PTY 连接 WebSocket URL
 *
 * 动态从当前活动服务器获取地址，支持多后端连接
 *
 * 浏览器的 new WebSocket(url) 不支持自定义 header，
 * 所以认证信息通过 URL 的 userinfo 部分传递：wss://user:pass@host/path
 * 浏览器会在 WebSocket 升级握手时自动发送 Basic Auth header
 */
export function getPtyConnectUrl(ptyId: string, directory?: string): string {
  // 从 HTTP base URL 转换为 WebSocket URL
  const httpBase = getApiBaseUrl()
  // http:// -> ws://, https:// -> wss://
  const wsBase = httpBase.replace(/^http/, 'ws')

  // 如果服务器配置了认证，把 credentials 嵌入 URL
  // wss://host/path → wss://user:pass@host/path
  const auth = serverStore.getActiveAuth()
  let wsUrl: string
  if (auth?.password) {
    const creds = `${encodeURIComponent(auth.username)}:${encodeURIComponent(auth.password)}@`
    // 在 :// 后面插入 user:pass@
    wsUrl = wsBase.replace('://', `://${creds}`)
  } else {
    wsUrl = wsBase
  }

  const formatted = formatPathForApi(directory)
  const queryString = buildQueryString({ directory: formatted })

  return `${wsUrl}/pty/${ptyId}/connect${queryString}`
}
