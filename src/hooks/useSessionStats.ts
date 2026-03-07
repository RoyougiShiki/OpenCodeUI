import { useMemo } from 'react'
import { useMessageStore } from '../store'
import type { AssistantMessageInfo } from '../types/message'

export interface SessionStats {
  // Token 统计
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number

  // 费用
  totalCost: number

  // 上下文使用率（基于最后一条消息的 input tokens）
  contextUsed: number
  contextLimit: number
  contextPercent: number
}

/**
 * 计算当前 session 的统计信息
 * @param contextLimit 模型的上下文限制（从 ModelInfo 获取）
 */
export function useSessionStats(contextLimit: number = 200000): SessionStats {
  const { messages } = useMessageStore()

  return useMemo(() => {
    const tokenTotal = (tokens: AssistantMessageInfo['tokens']): number => {
      return tokens.input + tokens.output + tokens.reasoning + (tokens.cache?.read || 0) + (tokens.cache?.write || 0)
    }

    let inputTokens = 0
    let outputTokens = 0
    let reasoningTokens = 0
    let cacheRead = 0
    let cacheWrite = 0
    let totalCost = 0
    let lastContextSize = 0

    for (const msg of messages) {
      if (msg.info.role === 'assistant') {
        const info = msg.info as AssistantMessageInfo
        // 只统计有实际 tokens 数据的消息（跳过 streaming 中的空 tokens）
        const hasTokens = tokenTotal(info.tokens) > 0

        if (hasTokens) {
          inputTokens += info.tokens.input
          outputTokens += info.tokens.output
          reasoningTokens += info.tokens.reasoning
          cacheRead += info.tokens.cache?.read || 0
          cacheWrite += info.tokens.cache?.write || 0
          // 当前上下文 = 这次请求的全部 token
          // 下一轮发送时，input + cache + output + reasoning 都会成为上下文
          lastContextSize = tokenTotal(info.tokens)
        }
        if (info.cost) {
          totalCost += info.cost
        }
      }
    }

    const totalTokens = inputTokens + outputTokens + reasoningTokens + cacheRead + cacheWrite
    const contextPercent = contextLimit > 0 ? Math.min(100, (lastContextSize / contextLimit) * 100) : 0

    return {
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheRead,
      cacheWrite,
      totalTokens,
      totalCost,
      contextUsed: lastContextSize,
      contextLimit,
      contextPercent,
    }
  }, [messages, contextLimit])
}

/**
 * 格式化 token 数量
 */
export function formatTokens(count: number): string {
  if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M'
  if (count >= 1000) return (count / 1000).toFixed(1) + 'k'
  return count.toString()
}

/**
 * 格式化费用
 */
export function formatCost(cost: number): string {
  if (cost === 0) return '$0'
  if (cost < 0.001) return '<$0.001'
  if (cost < 0.01) return '$' + cost.toFixed(3)
  if (cost < 1) return '$' + cost.toFixed(2)
  return '$' + cost.toFixed(2)
}
