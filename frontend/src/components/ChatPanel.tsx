import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import type { ChatMessage, BlastRadiusResult } from '../types'

interface Props {
  messages: ChatMessage[]
  username: string
  onSendMessage: (content: string, type: 'text' | 'blast_radius', blastRadius?: BlastRadiusResult) => void
  isConnected: boolean
}

interface ChatMessageItemProps {
  msg: ChatMessage
  currentUser: string
}

function ChatMessageItem({ msg, currentUser }: ChatMessageItemProps) {
  const isCurrentUser = msg.user_id === currentUser
  const isSystem = msg.type === 'system'

  if (msg.type === 'blast_radius') {
    // Blast radius card
    const br = msg.blast_radius
    if (!br) return null

    return (
      <div className="mb-3 mr-2 animate-in fade-in duration-300">
        <div className="text-xs text-slate-400 mb-1">{msg.username}</div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 text-xs">
          <div className="font-semibold text-slate-100 mb-1.5">
            📊 Shared Blast Radius Analysis
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Service:</span>
              <span className="text-cyan-300 font-mono">{br.changed_service_name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Risk:</span>
              <span
                className={clsx(
                  'font-semibold uppercase',
                  br.risk_level === 'critical' && 'text-red-400',
                  br.risk_level === 'high' && 'text-orange-400',
                  br.risk_level === 'medium' && 'text-yellow-400',
                  br.risk_level === 'low' && 'text-green-400',
                )}
              >
                {br.risk_level}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Impact:</span>
              <span className="text-slate-200">{br.total_impacted} service(s)</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Text or system message
  return (
    <div className={clsx('mb-3 flex animate-in fade-in duration-300', isCurrentUser && 'justify-end')}>
      <div
        className={clsx(
          'max-w-xs px-3 py-2 rounded-lg text-xs leading-relaxed break-words',
          isSystem
            ? 'bg-cyan-900/30 border border-cyan-700/40 text-cyan-200'
            : isCurrentUser
              ? 'bg-blue-700/40 text-blue-100'
              : 'bg-slate-700/40 text-slate-200',
        )}
      >
        {!isSystem && <div className="text-[10px] text-slate-400 mb-0.5">{msg.username}</div>}
        {isSystem && <div className="text-[10px] text-cyan-400 mb-0.5 font-semibold">🤖 Lumen AI</div>}
        {msg.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="mb-3 flex">
      <div className="bg-slate-700/40 text-slate-400 px-3 py-2 rounded-lg text-xs flex items-center gap-1">
        <span className="text-[10px]">Lumen AI is thinking</span>
        <div className="flex gap-0.5">
          <div className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-1 h-1 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export default function ChatPanel({ messages, username, onSendMessage, isConnected }: Props) {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Show typing indicator if last message is from current user (waiting for response)
  const lastMessage = messages[messages.length - 1]
  const isWaitingForResponse = lastMessage && lastMessage.user_id !== 'system' && lastMessage.user_id !== username

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || !isConnected || isSending) return

    setIsSending(true)
    try {
      onSendMessage(input.trim(), 'text')
      setInput('')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="fixed right-0 top-0 h-full w-80 bg-[#0d1526] border-l border-[#1e2d45] z-50 flex flex-col shadow-lg">
      {/* Header */}
      <div className="border-b border-[#1e2d45] px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-100">💬 Chat</h2>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-xs text-slate-500">
            <div className="text-center">
              <div className="mb-2">👋 Welcome to chat</div>
              <div>Run a blast radius simulation and share it to discuss with others</div>
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => <ChatMessageItem key={msg.id} msg={msg} currentUser={username} />)}
            {isWaitingForResponse && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} className="border-t border-[#1e2d45] p-3 space-y-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage(e as any)
            }
          }}
          placeholder="Type a message... (Enter to send, Shift+Enter for newline)"
          disabled={!isConnected || isSending}
          className="w-full bg-slate-800 border border-slate-700 rounded text-xs text-slate-100 placeholder-slate-500 p-2 resize-none h-16 focus:outline-none focus:border-cyan-500/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!isConnected || isSending || !input.trim()}
          className="w-full bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-cyan-50 rounded text-xs font-medium py-1.5 flex items-center justify-center gap-1 transition-colors"
        >
          {isSending ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send size={12} />
              Send
            </>
          )}
        </button>
      </form>
    </div>
  )
}
