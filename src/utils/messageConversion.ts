import type { ApiMessage, ApiMessageWithParts, ApiPart } from '../api/types'
import type { Message, MessageInfo, Part, UserMessageInfo } from '../types/message'
import { isUserMessage } from '../types/message'

export function toUIMessage(apiMessage: ApiMessageWithParts): Message {
  return {
    info: apiMessage.info as MessageInfo,
    parts: apiMessage.parts as Part[],
    isStreaming: false,
  }
}

export function toUIMessageInfo(apiMessage: ApiMessage): MessageInfo {
  return apiMessage as MessageInfo
}

export function toUIPart(apiPart: ApiPart): Part {
  return apiPart as Part
}

export function toApiMessageWithParts(message: Pick<Message, 'info' | 'parts'>): ApiMessageWithParts {
  return {
    info: message.info as ApiMessageWithParts['info'],
    parts: message.parts as ApiMessageWithParts['parts'],
  }
}

export function isUserUIMessage(message: Message): message is Message & { info: UserMessageInfo } {
  return isUserMessage(message.info)
}
