import type {
  McpLocalConfig as SDKMcpLocalConfig,
  McpOAuthConfig as SDKMcpOAuthConfig,
  McpResource as SDKMcpResource,
  McpRemoteConfig as SDKMcpRemoteConfig,
  McpStatus as SDKMcpStatus,
  McpStatusConnected as SDKMcpStatusConnected,
  McpStatusDisabled as SDKMcpStatusDisabled,
  McpStatusFailed as SDKMcpStatusFailed,
  McpStatusNeedsAuth as SDKMcpStatusNeedsAuth,
  McpStatusNeedsClientRegistration as SDKMcpStatusNeedsClientRegistration,
} from '@opencode-ai/sdk/v2/client'

export type MCPStatusConnected = SDKMcpStatusConnected

export type MCPStatusDisabled = SDKMcpStatusDisabled

export type MCPStatusFailed = SDKMcpStatusFailed

export type MCPStatusNeedsAuth = SDKMcpStatusNeedsAuth

export type MCPStatusNeedsClientRegistration = SDKMcpStatusNeedsClientRegistration

export type MCPStatus = SDKMcpStatus

export type MCPResource = SDKMcpResource

export interface MCPStatusResponse {
  [serverName: string]: MCPStatus
}

export type McpLocalConfig = SDKMcpLocalConfig

export type McpOAuthConfig = SDKMcpOAuthConfig

export type McpRemoteConfig = SDKMcpRemoteConfig

export type McpServerConfig = McpLocalConfig | McpRemoteConfig
