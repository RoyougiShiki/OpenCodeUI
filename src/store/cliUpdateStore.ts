import { useSyncExternalStore } from 'react'

// ============================================
// CliUpdateStore - CLI 版本检测
// 检查 OpenCode CLI 最新版本（GitHub anomalyco/opencode）
// 复用 updateStore 的版本比较逻辑
// ============================================

export interface CliUpdateRelease {
  version: string
  tagName: string
  url: string
  publishedAt: string | null
  name: string | null
}

export interface CliUpdateState {
  latestRelease: CliUpdateRelease | null
  lastCheckedAt: number | null
  dismissedVersion: string | null
  hiddenToastVersion: string | null
  checking: boolean
  error: string | null
}

interface PersistedCliUpdateState {
  latestRelease: CliUpdateRelease | null
  lastCheckedAt: number | null
  dismissedVersion: string | null
}

type Subscriber = () => void

const STORAGE_KEY = 'opencode:cli-update-check'
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000
export const CLI_RELEASES_API_URL = 'https://api.github.com/repos/anomalyco/opencode/releases/latest'
export const CLI_RELEASES_PAGE_URL = 'https://github.com/anomalyco/opencode/releases/latest'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function normalizeVersion(version: string): string {
  return version.trim().replace(/^v/i, '').replace(/-.+$/, '')
}

function compareVersions(a: string, b: string): number {
  const left = normalizeVersion(a)
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
  const right = normalizeVersion(b)
    .split('.')
    .map(part => Number.parseInt(part, 10) || 0)
  const length = Math.max(left.length, right.length)

  for (let i = 0; i < length; i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

function loadPersistedState(): PersistedCliUpdateState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return { latestRelease: null, lastCheckedAt: null, dismissedVersion: null }
    }

    const parsed = JSON.parse(raw) as PersistedCliUpdateState
    return {
      latestRelease: parsed?.latestRelease ?? null,
      lastCheckedAt: typeof parsed?.lastCheckedAt === 'number' ? parsed.lastCheckedAt : null,
      dismissedVersion: typeof parsed?.dismissedVersion === 'string' ? parsed.dismissedVersion : null,
    }
  } catch {
    return { latestRelease: null, lastCheckedAt: null, dismissedVersion: null }
  }
}

function persistState(state: CliUpdateState): void {
  try {
    const payload: PersistedCliUpdateState = {
      latestRelease: state.latestRelease,
      lastCheckedAt: state.lastCheckedAt,
      dismissedVersion: state.dismissedVersion,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

function parseRelease(payload: unknown): CliUpdateRelease {
  if (!isPlainObject(payload)) {
    throw new Error('Invalid release payload')
  }

  const tagName = typeof payload.tag_name === 'string' ? payload.tag_name : ''
  const htmlUrl = typeof payload.html_url === 'string' ? payload.html_url : CLI_RELEASES_PAGE_URL

  if (!tagName) {
    throw new Error('Missing release tag')
  }

  return {
    version: normalizeVersion(tagName),
    tagName,
    url: htmlUrl,
    publishedAt: typeof payload.published_at === 'string' ? payload.published_at : null,
    name: typeof payload.name === 'string' ? payload.name : null,
  }
}

export class CliUpdateStore {
  private state: CliUpdateState
  private subscribers = new Set<Subscriber>()
  private inflightCheck: Promise<void> | null = null

  private currentCliVersion: string | null = null

  constructor() {
    const persisted = loadPersistedState()
    this.state = {
      latestRelease: persisted.latestRelease,
      lastCheckedAt: persisted.lastCheckedAt,
      dismissedVersion: persisted.dismissedVersion,
      hiddenToastVersion: null,
      checking: false,
      error: null,
    }
  }

  subscribe = (callback: Subscriber): (() => void) => {
    this.subscribers.add(callback)
    return () => this.subscribers.delete(callback)
  }

  getSnapshot = (): CliUpdateState => this.state

  private notify(): void {
    this.subscribers.forEach(callback => callback())
  }

  private setState(nextState: CliUpdateState): void {
    this.state = nextState
    persistState(this.state)
    this.notify()
  }

  setCurrentVersion(version: string): void {
    this.currentCliVersion = normalizeVersion(version)
    this.notify()
  }

  getCurrentVersion(): string | null {
    return this.currentCliVersion
  }

  hasUpdateAvailable(): boolean {
    if (!this.state.latestRelease || !this.currentCliVersion) return false
    return compareVersions(this.state.latestRelease.version, this.currentCliVersion) > 0
  }

  shouldPromptUpdate(): boolean {
    if (!this.hasUpdateAvailable() || !this.state.latestRelease) return false
    return this.state.dismissedVersion !== this.state.latestRelease.version
  }

  private applyRelease(release: CliUpdateRelease, checkedAt: number): void {
    const previousVersion = this.state.latestRelease?.version ?? null
    this.setState({
      ...this.state,
      latestRelease: release,
      lastCheckedAt: checkedAt,
      hiddenToastVersion: previousVersion && previousVersion !== release.version ? null : this.state.hiddenToastVersion,
      checking: false,
      error: null,
    })
  }

  async checkForUpdates(options?: { force?: boolean }): Promise<void> {
    if (this.inflightCheck) return this.inflightCheck

    const force = options?.force === true
    const now = Date.now()
    const isFresh =
      !force && typeof this.state.lastCheckedAt === 'number' && now - this.state.lastCheckedAt < CHECK_INTERVAL_MS

    if (isFresh) return

    this.state = {
      ...this.state,
      checking: true,
      error: null,
    }
    this.notify()

    this.inflightCheck = (async () => {
      try {
        const response = await fetch(CLI_RELEASES_API_URL, {
          headers: { Accept: 'application/vnd.github+json' },
        })
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }

        const payload = await response.json()
        const release = parseRelease(payload)
        this.applyRelease(release, now)
      } catch (error) {
        this.state = {
          ...this.state,
          checking: false,
          error: error instanceof Error ? error.message : 'Failed to check CLI updates',
        }
        this.notify()
      } finally {
        this.inflightCheck = null
      }
    })()

    return this.inflightCheck
  }

  dismissCurrentVersion(): void {
    if (!this.state.latestRelease) return
    this.setState({
      ...this.state,
      dismissedVersion: this.state.latestRelease.version,
      hiddenToastVersion: this.state.latestRelease.version,
    })
  }
}

export const cliUpdateStore = new CliUpdateStore()

export function useCliUpdateStore(): CliUpdateState {
  return useSyncExternalStore(cliUpdateStore.subscribe, cliUpdateStore.getSnapshot, cliUpdateStore.getSnapshot)
}
