// ============================================
// MCP (Model Context Protocol) API Types
// 基于 OpenAPI 规范
// ============================================

/**
 * MCP 已连接状态
 */
export interface MCPStatusConnected {
  status: 'connected'
}

/**
 * MCP 已禁用状态
 */
export interface MCPStatusDisabled {
  status: 'disabled'
}

/**
 * MCP 失败状态
 */
export interface MCPStatusFailed {
  status: 'failed'
  error: string
}

/**
 * MCP 需要认证状态
 */
export interface MCPStatusNeedsAuth {
  status: 'needs_auth'
}

/**
 * MCP 需要客户端注册状态
 */
export interface MCPStatusNeedsClientRegistration {
  status: 'needs_client_registration'
  error: string
}

/**
 * MCP 状态联合类型
 */
export type MCPStatus =
  | MCPStatusConnected
  | MCPStatusDisabled
  | MCPStatusFailed
  | MCPStatusNeedsAuth
  | MCPStatusNeedsClientRegistration

/**
 * MCP 资源
 */
export interface MCPResource {
  name: string
  uri: string
  description?: string
  mimeType?: string
  client: string // server name
}

/**
 * MCP 服务器状态响应
 */
export interface MCPStatusResponse {
  [serverName: string]: MCPStatus
}

/**
 * MCP 本地配置
 */
export interface McpLocalConfig {
  type: 'local'
  command: string[]
  environment?: Record<string, string>
  enabled?: boolean
  timeout?: number
}

/**
 * MCP OAuth 配置
 */
export interface McpOAuthConfig {
  clientId?: string
  clientSecret?: string
  scope?: string
}

/**
 * MCP 远程配置
 */
export interface McpRemoteConfig {
  type: 'remote'
  url: string
  enabled?: boolean
  headers?: Record<string, string>
  oauth?: McpOAuthConfig | false
  timeout?: number
}

/**
 * MCP 服务器配置（本地或远程）
 */
export type McpServerConfig = McpLocalConfig | McpRemoteConfig
