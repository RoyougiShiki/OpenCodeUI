// ============================================
// Service Store - opencode serve 进程管理
// 管理自动启动设置 + 可执行文件路径 + 环境变量 + 进程生命周期
// 仅在 Tauri 桌面端有效
// ============================================

import { useSyncExternalStore } from 'react'

const STORAGE_KEY_AUTO_START = 'opencode-auto-start-service'
const STORAGE_KEY_BINARY_PATH = 'opencode-binary-path'
const STORAGE_KEY_ENV_VARS = 'opencode-service-env-vars'
const STORAGE_KEY_BOUND_SERVER = 'opencode-bound-server'

/** 环境变量键值对 */
export interface EnvVar {
  key: string
  value: string
}

export interface ServiceSettingsBackup {
  autoStart: boolean
  binaryPath: string
  envVars: EnvVar[]
}

interface ServiceStoreSnapshot {
  autoStart: boolean
  binaryPath: string
  envVars: EnvVar[]
  boundServerId: string
  running: boolean
  startedByUs: boolean
  starting: boolean
}

class ServiceStore {
  private _autoStart: boolean
  private _binaryPath: string
  private _envVars: EnvVar[]
  private _boundServerId: string
  private _running = false
  private _startedByUs = false
  private _starting = false
  private _listeners: Set<() => void> = new Set()
  private _snapshot: ServiceStoreSnapshot

  constructor() {
    try {
      this._autoStart = localStorage.getItem(STORAGE_KEY_AUTO_START) === 'true'
    } catch {
      this._autoStart = false
    }
    try {
      this._binaryPath = localStorage.getItem(STORAGE_KEY_BINARY_PATH) || ''
    } catch {
      this._binaryPath = ''
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ENV_VARS)
      this._envVars = raw ? JSON.parse(raw) : []
    } catch {
      this._envVars = []
    }
    this._boundServerId = ''
    try {
      this._boundServerId = localStorage.getItem(STORAGE_KEY_BOUND_SERVER) || ''
    } catch {
      this._boundServerId = ''
    }
    this._snapshot = this._buildSnapshot()
  }

  // ---- Getters ----

  get autoStart() {
    return this._autoStart
  }
  get binaryPath() {
    return this._binaryPath
  }
  get envVars() {
    return this._envVars
  }
  get boundServerId() {
    return this._boundServerId
  }
  get running() {
    return this._running
  }
  get startedByUs() {
    return this._startedByUs
  }
  get starting() {
    return this._starting
  }

  /** 返回实际要用的可执行文件路径，空则回退默认值 */
  get effectiveBinaryPath() {
    return this._binaryPath.trim() || 'opencode'
  }

  /** 将 envVars 转为 Record<string, string>，方便传给 Rust */
  get envVarsRecord(): Record<string, string> {
    const record: Record<string, string> = {}
    for (const { key, value } of this._envVars) {
      const k = key.trim()
      if (k) record[k] = value
    }
    return record
  }

  // ---- Setters ----

  setAutoStart(v: boolean) {
    this._autoStart = v
    try {
      localStorage.setItem(STORAGE_KEY_AUTO_START, String(v))
    } catch {
      /* */
    }
    this._notify()
  }

  setBinaryPath(v: string) {
    this._binaryPath = v
    try {
      localStorage.setItem(STORAGE_KEY_BINARY_PATH, v)
    } catch {
      /* */
    }
    this._notify()
  }

  setEnvVars(vars: EnvVar[]) {
    this._envVars = vars
    try {
      localStorage.setItem(STORAGE_KEY_ENV_VARS, JSON.stringify(vars))
    } catch {
      /* */
    }
    this._notify()
  }

  setBoundServerId(id: string) {
    this._boundServerId = id
    try {
      localStorage.setItem(STORAGE_KEY_BOUND_SERVER, id)
    } catch {
      /* */
    }
    this._notify()
  }

  setRunning(v: boolean) {
    this._running = v
    this._notify()
  }

  setStartedByUs(v: boolean) {
    this._startedByUs = v
    this._notify()
  }

  setStarting(v: boolean) {
    this._starting = v
    this._notify()
  }

  // ---- React useSyncExternalStore 接口 ----

  subscribe = (fn: () => void) => {
    this._listeners.add(fn)
    return () => {
      this._listeners.delete(fn)
    }
  }

  getSnapshot = (): ServiceStoreSnapshot => this._snapshot

  // ---- Internal ----

  private _buildSnapshot(): ServiceStoreSnapshot {
    return {
      autoStart: this._autoStart,
      binaryPath: this._binaryPath,
      envVars: this._envVars,
      boundServerId: this._boundServerId,
      running: this._running,
      startedByUs: this._startedByUs,
      starting: this._starting,
    }
  }

  private _notify() {
    this._snapshot = this._buildSnapshot()
    this._listeners.forEach(fn => fn())
  }
}

export const serviceStore = new ServiceStore()

export function exportServiceSettingsBackup(): ServiceSettingsBackup {
  return {
    autoStart: serviceStore.autoStart,
    binaryPath: serviceStore.binaryPath,
    envVars: serviceStore.envVars.map(item => ({ ...item })),
  }
}

export function importServiceSettingsBackup(raw: unknown): void {
  const parsed = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined
  const envVars = Array.isArray(parsed?.envVars)
    ? parsed.envVars
        .filter(
          (item): item is EnvVar =>
            !!item &&
            typeof item === 'object' &&
            typeof (item as Record<string, unknown>).key === 'string' &&
            typeof (item as Record<string, unknown>).value === 'string',
        )
        .map(item => ({ key: item.key, value: item.value }))
    : []

  serviceStore.setAutoStart(parsed?.autoStart === true)
  serviceStore.setBinaryPath(typeof parsed?.binaryPath === 'string' ? parsed.binaryPath : '')
  serviceStore.setEnvVars(envVars)
}

/** React hook */
export function useServiceStore() {
  return useSyncExternalStore(serviceStore.subscribe, serviceStore.getSnapshot)
}
