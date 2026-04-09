import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiMessage, ApiMessageWithParts, ApiPart } from '../api/types'
import { messageStore } from './messageStore'

function createAssistantMessage(id: string): ApiMessage {
  return {
    id,
    sessionID: 'session-1',
    role: 'assistant',
    parentID: 'user-1',
    modelID: 'model-1',
    providerID: 'provider-1',
    mode: 'chat',
    agent: 'build',
    path: {
      cwd: '/workspace',
      root: '/workspace',
    },
    cost: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0,
      cache: { read: 0, write: 0 },
    },
    time: {
      created: 1,
      completed: 2,
    },
  }
}

function createTextPart(
  id: string,
  messageID: string,
  text: string,
): ApiPart & { sessionID: string; messageID: string } {
  return {
    id,
    sessionID: 'session-1',
    messageID,
    type: 'text',
    text,
  }
}

function createMessageWithParts(id: string, text: string): ApiMessageWithParts {
  return {
    info: createAssistantMessage(id),
    parts: [createTextPart(`part-${id}`, id, text)],
  }
}

describe('messageStore', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    messageStore.clearAll()
  })

  it('applies a part update when the message already exists', () => {
    messageStore.handleMessageUpdated(createAssistantMessage('message-1'))
    messageStore.handlePartUpdated(createTextPart('part-1', 'message-1', 'hello'))

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(1)
    expect(state?.messages[0].parts).toHaveLength(1)
    expect(state?.messages[0].parts[0]).toMatchObject({ id: 'part-1', type: 'text', text: 'hello' })
  })

  it('silently drops a part update when the message does not exist yet', () => {
    // Part arrives before message — should be silently dropped (no pending queue)
    messageStore.handlePartUpdated(createTextPart('part-1', 'message-1', 'hello'))

    const state = messageStore.getSessionState('session-1')
    // session-1 doesn't exist because handlePartUpdated doesn't ensureSession
    expect(state).toBeUndefined()
  })

  it('marks cached sessions stale after reconnect and clears the flag after a fresh load', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello')])

    expect(messageStore.isSessionStale('session-1')).toBe(false)

    messageStore.markAllSessionsStale()
    expect(messageStore.isSessionStale('session-1')).toBe(true)

    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello again')])
    expect(messageStore.isSessionStale('session-1')).toBe(false)
  })

  it('truncates messages after revert point', () => {
    messageStore.setMessages('session-1', [
      createMessageWithParts('message-1', 'one'),
      createMessageWithParts('message-2', 'two'),
      createMessageWithParts('message-3', 'three'),
    ])
    messageStore.setRevertState('session-1', {
      messageId: 'message-2',
      history: [],
    })

    messageStore.truncateAfterRevert('session-1')

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(1)
    expect(state?.messages[0].info.id).toBe('message-1')
    expect(state?.revertState).toBeNull()
  })

  it('removes a part from a message', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-1', 'hello')])

    messageStore.handlePartRemoved({
      sessionID: 'session-1',
      messageID: 'message-1',
      partID: 'part-message-1',
    })

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages[0].parts).toHaveLength(0)
  })

  it('deduplicates messages in prependMessages', () => {
    messageStore.setMessages('session-1', [createMessageWithParts('message-2', 'two')])

    messageStore.prependMessages(
      'session-1',
      [createMessageWithParts('message-1', 'one'), createMessageWithParts('message-2', 'duplicate')],
      true,
    )

    const state = messageStore.getSessionState('session-1')
    expect(state?.messages).toHaveLength(2)
    expect(state?.messages[0].info.id).toBe('message-1')
    expect(state?.messages[1].info.id).toBe('message-2')
  })
})
