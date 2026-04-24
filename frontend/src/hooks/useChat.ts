import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchChatMessages } from '../api/client'
import type { ChatMessage, BlastRadiusResult } from '../types'

const RECONNECT_DELAY = 3000

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [username, setUsername] = useState('')
  const [userId, setUserId] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize user identity from localStorage
  useEffect(() => {
    let storedUserId = localStorage.getItem('chat_user_id')
    let storedUsername = localStorage.getItem('chat_username')

    if (!storedUserId) {
      storedUserId = `user-${Math.random().toString(36).substr(2, 9)}`
      localStorage.setItem('chat_user_id', storedUserId)
    }

    if (!storedUsername) {
      const userNum = Math.floor(Math.random() * 10000)
      storedUsername = `User#${userNum}`
      localStorage.setItem('chat_username', storedUsername)
    }

    setUserId(storedUserId)
    setUsername(storedUsername)
  }, [])

  // Load initial messages and connect WebSocket
  useEffect(() => {
    if (!userId || !username) return

    const initializeChat = async () => {
      try {
        // Fetch initial messages via HTTP (works fine through proxy)
        try {
          const initialMessages = await fetchChatMessages()
          console.log('[HOOK] Initial messages loaded:', initialMessages.length)
          setMessages(initialMessages)
        } catch (e) {
          console.error('[HOOK] Failed to fetch chat messages:', e)
        }

        // Connect WebSocket DIRECTLY to backend (bypass Vite proxy)
        // Vite proxy has issues with WebSocket, so we connect directly
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = `${wsProtocol}//localhost:8000/api/ws/chat`
        console.log('[HOOK] 🔌 Connecting to WebSocket (direct):', wsUrl)
        
        const ws = new WebSocket(wsUrl)

        ws.onopen = () => {
          console.log('[HOOK] ✓✓✓ WebSocket OPEN')
          setIsConnected(true)
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
            reconnectTimeoutRef.current = null
          }
        }

        ws.onmessage = (event) => {
          console.log('[HOOK] 📨 MESSAGE RECEIVED:', event.data.substring(0, 200))
          try {
            const msg: ChatMessage = JSON.parse(event.data)
            console.log('[HOOK] ✓ Parsed message:', msg.id, 'from', msg.username)
            setMessages((prev) => [...prev, msg])
            setUnreadCount((prev) => prev + 1)
          } catch (e) {
            console.error('[HOOK] ✗ Failed to parse message:', e)
          }
        }

        ws.onerror = (error) => {
          console.error('[HOOK] ✗ WebSocket ERROR:', error)
          setIsConnected(false)
        }

        ws.onclose = () => {
          console.log('[HOOK] ✗ WebSocket CLOSED')
          setIsConnected(false)
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('[HOOK] Attempting reconnect...')
            initializeChat()
          }, RECONNECT_DELAY)
        }

        wsRef.current = ws
      } catch (error) {
        console.error('[HOOK] Failed to initialize chat:', error)
        setIsConnected(false)
      }
    }

    initializeChat()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
    }
  }, [userId, username])

  const sendMessage = useCallback(
    (content: string, type: 'text' | 'blast_radius' = 'text', blastRadius?: BlastRadiusResult) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        console.error('[HOOK] ✗ WebSocket not connected, state:', wsRef.current?.readyState)
        return
      }

      const msg = {
        username,
        user_id: userId,
        type,
        content,
        ...(type === 'blast_radius' && { blast_radius: blastRadius }),
      }

      try {
        console.log('[HOOK] 📤 Sending message:', type)
        wsRef.current.send(JSON.stringify(msg))
        console.log('[HOOK] ✓ Message sent')
      } catch (e) {
        console.error('[HOOK] Failed to send message:', e)
      }
    },
    [username, userId],
  )

  const clearUnread = useCallback(() => {
    setUnreadCount(0)
  }, [])

  return {
    messages,
    unreadCount,
    username,
    userId,
    sendMessage,
    clearUnread,
    isConnected,
  }
}
