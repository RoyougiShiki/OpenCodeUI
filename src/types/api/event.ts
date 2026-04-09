// ============================================
// Event API Types
// 基于 OpenAPI 规范
// ============================================

import type { Session, SessionStatus } from './session'
import type { FileDiff } from './file'
import type { Message, Part } from './message'
import type { PermissionRequest, PermissionReply, QuestionRequest, QuestionAnswer } from './permission'
import type { Project } from './project'

// ============================================
// Event Payload Types
// ============================================

export interface SessionIdlePayload {
  sessionID: string
}

export interface SessionErrorPayload {
  sessionID: string
  name: string
  data: unknown
}

export interface SessionStatusPayload {
  sessionID: string
  status: SessionStatus
}

export interface SessionDiffPayload {
  sessionID: string
  diff: FileDiff[]
}

export interface PartRemovedPayload {
  partID: string
  messageID: string
  sessionID: string
}

export interface PartDeltaPayload {
  sessionID: string
  messageID: string
  partID: string
  field: string
  delta: string
}

export interface PermissionRepliedPayload {
  sessionID: string
  requestID: string
  reply: PermissionReply
}

export interface QuestionRepliedPayload {
  sessionID: string
  requestID: string
  answers: QuestionAnswer[]
}

export interface QuestionRejectedPayload {
  sessionID: string
  requestID: string
}

export interface TodoItem {
  // SDK 的 Todo 没有 id，这里是前端适配层补上的稳定 key
  id: string
  content: string
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  priority: 'high' | 'medium' | 'low'
}

export interface TodoUpdatedPayload {
  sessionID: string
  todos: TodoItem[]
}

export interface WorktreeReadyPayload {
  name: string
  branch: string
}

export interface WorktreeFailedPayload {
  message: string
}

export interface VcsBranchUpdatedPayload {
  branch?: string
}

// ============================================
// Global Event Type
// ============================================

/**
 * 全局事件包装器
 */
export interface GlobalEvent {
  directory: string
  payload: {
    type: string
    properties: unknown
  }
}

/**
 * 事件类型常量
 */
export const EventTypes = {
  // Session events
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_DELETED: 'session.deleted',
  SESSION_IDLE: 'session.idle',
  SESSION_ERROR: 'session.error',
  SESSION_STATUS: 'session.status',
  SESSION_DIFF: 'session.diff',
  SESSION_COMPACTED: 'session.compacted',

  // Message events
  MESSAGE_UPDATED: 'message.updated',
  MESSAGE_REMOVED: 'message.removed',
  MESSAGE_PART_UPDATED: 'message.part.updated',
  MESSAGE_PART_DELTA: 'message.part.delta',
  MESSAGE_PART_REMOVED: 'message.part.removed',

  // Permission events
  PERMISSION_ASKED: 'permission.asked',
  PERMISSION_REPLIED: 'permission.replied',

  // Question events
  QUESTION_ASKED: 'question.asked',
  QUESTION_REPLIED: 'question.replied',
  QUESTION_REJECTED: 'question.rejected',

  // Todo events
  TODO_UPDATED: 'todo.updated',

  // Project events
  PROJECT_UPDATED: 'project.updated',

  // Server events
  SERVER_CONNECTED: 'server.connected',
  SERVER_INSTANCE_DISPOSED: 'server.instance.disposed',
  GLOBAL_DISPOSED: 'global.disposed',

  // File events
  FILE_EDITED: 'file.edited',
  FILE_WATCHER_UPDATED: 'file.watcher.updated',

  // Other events
  INSTALLATION_UPDATED: 'installation.updated',
  INSTALLATION_UPDATE_AVAILABLE: 'installation.update-available',
  WORKTREE_READY: 'worktree.ready',
  WORKTREE_FAILED: 'worktree.failed',
  LSP_CLIENT_DIAGNOSTICS: 'lsp.client.diagnostics',
  LSP_UPDATED: 'lsp.updated',
  MCP_TOOLS_CHANGED: 'mcp.tools.changed',
  MCP_BROWSER_OPEN_FAILED: 'mcp.browser.open.failed',
  VCS_BRANCH_UPDATED: 'vcs.branch.updated',
  COMMAND_EXECUTED: 'command.executed',
  PTY_CREATED: 'pty.created',
  PTY_UPDATED: 'pty.updated',
  PTY_EXITED: 'pty.exited',
  PTY_DELETED: 'pty.deleted',
} as const

export type EventType = (typeof EventTypes)[keyof typeof EventTypes]

// ============================================
// Event Callbacks Interface
// ============================================

/**
 * 事件回调接口
 */
export interface EventCallbacks {
  onMessageUpdated?: (message: Message) => void
  onPartUpdated?: (part: Part, delta?: string) => void
  onPartDelta?: (data: PartDeltaPayload) => void
  onPartRemoved?: (data: PartRemovedPayload) => void
  onSessionCreated?: (session: Session) => void
  onSessionUpdated?: (session: Session) => void
  onSessionDeleted?: (sessionId: string) => void
  onSessionIdle?: (data: SessionIdlePayload) => void
  onSessionError?: (data: SessionErrorPayload) => void
  onSessionStatus?: (data: SessionStatusPayload) => void
  onPermissionAsked?: (request: PermissionRequest) => void
  onPermissionReplied?: (data: PermissionRepliedPayload) => void
  onQuestionAsked?: (request: QuestionRequest) => void
  onQuestionReplied?: (data: QuestionRepliedPayload) => void
  onQuestionRejected?: (data: QuestionRejectedPayload) => void
  onTodoUpdated?: (data: TodoUpdatedPayload) => void
  onProjectUpdated?: (project: Project) => void
  onWorktreeReady?: (data: WorktreeReadyPayload) => void
  onWorktreeFailed?: (data: WorktreeFailedPayload) => void
  onVcsBranchUpdated?: (data: VcsBranchUpdatedPayload) => void
  onError?: (error: Error) => void
  /** SSE 重连成功后触发，通知订阅者可能需要刷新数据
   * @param reason - 重连原因：'network' 普通网络恢复, 'server-switch' 切换了服务器
   */
  onReconnected?: (reason: 'network' | 'server-switch') => void
}
