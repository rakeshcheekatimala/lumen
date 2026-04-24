import { useEffect, useRef, useState } from 'react'
import clsx from 'clsx'
import { Loader2, Send, X } from 'lucide-react'
import type { BlastRadiusResult, ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  username: string
  onSendMessage: (content: string, type: 'text' | 'blast_radius', blastRadius?: BlastRadiusResult) => void
  isConnected: boolean
  onClose: () => void
}

interface ChatMessageItemProps {
  message: ChatMessage
  currentUser: string
}

function ChatMessageItem({ message, currentUser }: ChatMessageItemProps) {
  const isCurrentUser = message.user_id === currentUser
  const isSystem = message.type === 'system'

  if (message.type === 'blast_radius') {
    const blastRadius = message.blast_radius
    if (!blastRadius) return null

    return (
      <div className="mb-3">
        <div className="mb-1 text-xs text-slate-500">{message.username}</div>
        <div className="panel-subtle rounded-2xl px-3 py-3 text-xs">
          <div className="font-semibold text-slate-100">Shared blast radius review</div>
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Service</span>
              <span className="mono text-cyan-200">{blastRadius.changed_service_name}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Risk</span>
              <span className="font-semibold uppercase text-slate-200">{blastRadius.risk_level}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-slate-500">Impact</span>
              <span className="text-slate-200">{blastRadius.total_impacted} service(s)</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx('mb-3 flex', isCurrentUser && 'justify-end')}>
      <div
        className={clsx(
          'max-w-[85%] rounded-2xl px-3 py-3 text-sm leading-relaxed shadow-[0_10px_24px_rgba(4,10,19,0.14)]',
          isSystem
            ? 'border border-cyan-400/16 bg-cyan-400/[0.08] text-cyan-50'
            : isCurrentUser
              ? 'bg-[linear-gradient(135deg,rgba(93,214,206,0.24),rgba(95,143,255,0.2))] text-slate-50'
              : 'panel-subtle text-slate-200',
        )}
      >
        {!isSystem && <div className="mb-1 text-[11px] text-slate-500">{message.username}</div>}
        {isSystem && <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-100">Lumen AI</div>}
        {message.content}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="mb-3 flex">
      <div className="panel-subtle flex items-center gap-2 rounded-2xl px-3 py-3 text-sm text-slate-400">
        <span>Waiting for analysis response</span>
        <div className="flex gap-1">
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
          <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

export default function ChatPanel({ messages, username, onSendMessage, isConnected, onClose }: Props) {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const lastMessage = messages[messages.length - 1]
  const isWaitingForResponse = Boolean(lastMessage && lastMessage.user_id !== 'system' && lastMessage.user_id !== username)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
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
    <aside className="panel-surface fixed inset-y-0 right-0 z-50 flex w-full max-w-[420px] flex-col rounded-none border-l border-white/10 sm:w-[420px]">
      <div className="border-b soft-divider px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-label">Collaboration</div>
            <h2 className="mt-2 text-lg font-semibold text-slate-50">Team chat</h2>
            <p className="mt-1 text-sm text-slate-400">
              {isConnected ? 'Connected to the live collaboration stream.' : 'Connection unavailable right now.'}
            </p>
          </div>
          <button onClick={onClose} className="icon-button rounded-xl p-2" title="Close chat">
            <X size={15} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="max-w-sm rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center">
              <div className="text-base font-medium text-slate-100">No conversations yet</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                Share a blast radius scenario or send a note to start a review thread with your team.
              </p>
            </div>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessageItem key={message.id} message={message} currentUser={username} />
            ))}
            {isWaitingForResponse && <TypingIndicator />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="border-t soft-divider px-4 py-4">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              handleSendMessage(event as unknown as React.FormEvent)
            }
          }}
          placeholder="Write an update, question, or decision..."
          disabled={!isConnected || isSending}
          className="input-shell h-28 w-full resize-none rounded-2xl px-3 py-3 text-sm disabled:opacity-50"
        />

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            Press Enter to send, Shift+Enter for a new line.
          </div>
          <button
            type="submit"
            disabled={!isConnected || isSending || !input.trim()}
            className={clsx(
              'flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold',
              !isConnected || isSending || !input.trim()
                ? 'cursor-not-allowed bg-slate-800 text-slate-500'
                : 'primary-button',
            )}
          >
            {isSending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {isSending ? 'Sending' : 'Send'}
          </button>
        </div>
      </form>
    </aside>
  )
}
