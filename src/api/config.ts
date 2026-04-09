// ============================================
// Config API - 配置管理
// ============================================

import { getSDKClient, unwrap } from './sdk'
import { formatPathForApi } from '../utils/directoryUtils'
import type { Config } from '../types/api/config'
import type { ProvidersResponse } from '../types/api/model'

/**
 * 获取当前配置
 */
export async function getConfig(directory?: string): Promise<Config> {
  const sdk = getSDKClient()
  return unwrap(await sdk.config.get({ directory: formatPathForApi(directory) }))
}

/**
 * 更新配置
 */
export async function updateConfig(config: Config, directory?: string): Promise<Config> {
  const sdk = getSDKClient()
  return unwrap(await sdk.config.update({ directory: formatPathForApi(directory), config }))
}

/**
 * 获取 provider 配置列表
 */
export async function getProviderConfigs(directory?: string): Promise<ProvidersResponse> {
  const sdk = getSDKClient()
  return unwrap(await sdk.config.providers({ directory: formatPathForApi(directory) }))
}
