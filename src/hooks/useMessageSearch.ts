import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import type { Message, TextPart } from '../types/message'

export interface Match {
  messageId: string
  partIndex: number
  charStart: number
  charEnd: number
}

export interface UseMessageSearchResult {
  query: string
  setQuery: (query: string) => void
  matches: Match[]
  currentMatchIndex: number
  isOpen: boolean
  open: () => void
  close: () => void
  navigateNext: () => void
  navigatePrev: () => void
  currentMatch: Match | null
  currentMatchMessageId: string | null
}

export function useMessageSearch(
  messages: Message[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
): UseMessageSearchResult {
  const [query, setQuery] = useState('')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const result: Match[] = []
    const lowerQuery = query.toLowerCase()

    for (const message of messages) {
      for (let partIndex = 0; partIndex < message.parts.length; partIndex++) {
        const part = message.parts[partIndex]
        if (part.type !== 'text') continue
        const text = (part as TextPart).text
        if (!text) continue

        const lowerText = text.toLowerCase()
        let pos = 0
        while (true) {
          const idx = lowerText.indexOf(lowerQuery, pos)
          if (idx === -1) break
          result.push({
            messageId: message.info.id,
            partIndex,
            charStart: idx,
            charEnd: idx + query.length,
          })
          pos = idx + 1
        }
      }
    }

    return result
  }, [messages, query])

  useEffect(() => {
    setCurrentMatchIndex(0)
  }, [matches.length])

  const open = useCallback(() => {
    setIsOpen(true)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
    })
  }, [])

  const close = useCallback(() => {
    setIsOpen(false)
    setQuery('')
    setCurrentMatchIndex(0)
  }, [])

  const navigateNext = useCallback(() => {
    if (matches.length === 0) return
    const next = currentMatchIndex < matches.length - 1 ? currentMatchIndex + 1 : 0
    setCurrentMatchIndex(next)
  }, [matches.length, currentMatchIndex])

  const navigatePrev = useCallback(() => {
    if (matches.length === 0) return
    const prev = currentMatchIndex > 0 ? currentMatchIndex - 1 : matches.length - 1
    setCurrentMatchIndex(prev)
  }, [matches.length, currentMatchIndex])

  const currentMatch = matches.length > 0 ? matches[currentMatchIndex] : null
  const currentMatchMessageId = currentMatch?.messageId ?? null

  useEffect(() => {
    if (!currentMatch || !scrollRef.current) return
    const el = scrollRef.current.querySelector(`[data-message-id="${currentMatch.messageId}"]`)
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [currentMatch, scrollRef])

  return {
    query,
    setQuery,
    matches,
    currentMatchIndex,
    isOpen,
    open,
    close,
    navigateNext,
    navigatePrev,
    currentMatch,
    currentMatchMessageId,
  }
}
