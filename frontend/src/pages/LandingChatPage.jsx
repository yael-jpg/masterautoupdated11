import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPatch, apiPost, pushToast } from '../api/client'
import { SectionCard } from '../components/SectionCard'
import { createRealtimeClient } from '../utils/realtime'
import './LandingChatPage.css'

function fmtDateTime(value) {
  const date = value ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) return '---'
  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function toPreview(text, max = 72) {
  const clean = String(text || '').trim()
  if (!clean) return 'No messages yet'
  if (clean.length <= max) return clean
  return `${clean.slice(0, max)}...`
}

export function LandingChatPage({ token }) {
  const [threads, setThreads] = useState([])
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [statusFilter, setStatusFilter] = useState('open')
  const [searchTerm, setSearchTerm] = useState('')
  const [reply, setReply] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  const selectedThread = useMemo(
    () => threads.find((t) => t.id === selectedId) || null,
    [threads, selectedId],
  )

  const filteredThreads = useMemo(() => {
    const needle = String(searchTerm || '').trim().toLowerCase()
    if (!needle) return threads
    return threads.filter((thread) => {
      const haystack = [
        thread.visitorName || 'guest',
        thread.visitorToken || '',
        thread.lastMessage?.message || '',
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(needle)
    })
  }, [threads, searchTerm])

  const loadThreads = async () => {
    setLoadingThreads(true)
    try {
      const data = await apiGet('/landing-chat/threads', token, { status: statusFilter })
      const list = Array.isArray(data) ? data : []
      setThreads(list)

      if (selectedId && !list.some((t) => t.id === selectedId)) {
        setSelectedId(null)
        setMessages([])
      }

      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id)
      }
    } catch (err) {
      pushToast('error', err.message || 'Failed to load landing chat threads')
    } finally {
      setLoadingThreads(false)
    }
  }

  const loadMessages = async (threadId) => {
    if (!threadId) return
    setLoadingMessages(true)
    try {
      const data = await apiGet(`/landing-chat/threads/${threadId}/messages`, token)
      setMessages(Array.isArray(data?.messages) ? data.messages : [])
    } catch (err) {
      pushToast('error', err.message || 'Failed to load chat messages')
    } finally {
      setLoadingMessages(false)
    }
  }

  useEffect(() => {
    loadThreads()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    if (!selectedId) return
    loadMessages(selectedId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    const timer = setInterval(() => {
      loadThreads()
      if (selectedId) loadMessages(selectedId)
    }, 6000)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, statusFilter])

  useEffect(() => {
    const socket = createRealtimeClient(token)
    if (!socket) return undefined

    const refreshFromEvent = (payload) => {
      const incomingThreadId = Number(payload?.threadId || 0)
      loadThreads()
      if (selectedId && incomingThreadId === selectedId) {
        loadMessages(selectedId)
      }
    }

    socket.on('landing-chat:thread-updated', refreshFromEvent)
    socket.on('landing-chat:new-message', refreshFromEvent)

    return () => {
      socket.off('landing-chat:thread-updated', refreshFromEvent)
      socket.off('landing-chat:new-message', refreshFromEvent)
      socket.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, selectedId])

  useEffect(() => {
    const onFocusThread = (event) => {
      const id = Number(event?.detail?.threadId || 0)
      if (!id) return
      setSelectedId(id)
      loadThreads()
      loadMessages(id)
    }

    window.addEventListener('ma:landing-chat-focus-thread', onFocusThread)
    return () => window.removeEventListener('ma:landing-chat-focus-thread', onFocusThread)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleReply = async () => {
    const clean = String(reply || '').trim()
    if (!selectedId || !clean) return

    setSendingReply(true)
    try {
      await apiPost(`/landing-chat/threads/${selectedId}/reply`, token, { message: clean })
      setReply('')
      await loadThreads()
      await loadMessages(selectedId)
      pushToast('success', 'Reply sent to chat')
    } catch (err) {
      pushToast('error', err.message || 'Failed to send reply')
    } finally {
      setSendingReply(false)
    }
  }

  const handleToggleStatus = async () => {
    if (!selectedThread) return
    const nextStatus = selectedThread.status === 'open' ? 'closed' : 'open'
    try {
      await apiPatch(`/landing-chat/threads/${selectedThread.id}/status`, token, { status: nextStatus })
      await loadThreads()
      pushToast('success', `Thread marked as ${nextStatus}`)
    } catch (err) {
      pushToast('error', err.message || 'Failed to update thread status')
    }
  }

  return (
    <div className="page-grid">
      <SectionCard
        title="Landing Page Chat Inbox"
        subtitle="Public website chat messages with automatic pre-reply tracking"
      >
        <div className="lcp-toolbar">
          <div className="toolbar-filters">
            {['open', 'closed'].map((status) => (
              <button
                key={status}
                type="button"
                className={`filter-chip${statusFilter === status ? ' active' : ''}`}
                onClick={() => setStatusFilter(status)}
              >
                {status === 'open' ? 'Open' : 'Closed'}
              </button>
            ))}
          </div>
          <div className="lcp-search-wrap">
            <input
              type="text"
              className="lcp-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search visitor, token, or message..."
            />
          </div>
          <div className="lcp-toolbar-meta">
            {filteredThreads.length} of {threads.length} thread{threads.length === 1 ? '' : 's'}
          </div>
          <button type="button" className="btn-secondary" onClick={loadThreads}>
            Refresh
          </button>
        </div>

        <div className="lcp-layout">
          <aside className="lcp-threads">
            {loadingThreads && threads.length === 0 ? <p className="lcp-empty">Loading threads...</p> : null}
            {!loadingThreads && threads.length === 0 ? <p className="lcp-empty">No threads in this filter.</p> : null}
            {!loadingThreads && threads.length > 0 && filteredThreads.length === 0 ? (
              <p className="lcp-empty">No threads match your search.</p>
            ) : null}
            {filteredThreads.map((thread) => (
              <button
                key={thread.id}
                type="button"
                className={`lcp-thread-item${thread.id === selectedId ? ' active' : ''}`}
                onClick={() => setSelectedId(thread.id)}
              >
                <div className="lcp-thread-top">
                  <strong>{thread.visitorName || 'Guest'}</strong>
                  <span>{fmtDateTime(thread.lastMessageAt)}</span>
                </div>
                <p>{toPreview(thread.lastMessage?.message)}</p>
                <small>
                  Status: <span className={`lcp-status ${thread.status === 'open' ? 'is-open' : 'is-closed'}`}>{thread.status}</span>
                </small>
              </button>
            ))}
          </aside>

          <section className="lcp-chat-pane">
            {!selectedThread ? (
              <div className="lcp-empty-pane">Select a chat thread to view messages.</div>
            ) : (
              <>
                <div className="lcp-chat-head">
                  <div>
                    <h3>{selectedThread.visitorName || 'Guest'}</h3>
                  </div>
                  <button type="button" className="btn-secondary" onClick={handleToggleStatus}>
                    Mark as {selectedThread.status === 'open' ? 'Closed' : 'Open'}
                  </button>
                </div>

                <div className="lcp-messages">
                  {loadingMessages && messages.length === 0 ? <p className="lcp-empty">Loading messages...</p> : null}
                  {!loadingMessages && messages.length === 0 ? <p className="lcp-empty">No messages in this thread yet.</p> : null}
                  {messages.map((m) => (
                    <article key={m.id} className={`lcp-msg ${m.senderType === 'superadmin' ? 'from-admin' : m.senderType === 'visitor' ? 'from-visitor' : 'from-system'}`}>
                      <header>
                        <span>{m.senderLabel || m.senderType}</span>
                        <time>{fmtDateTime(m.createdAt)}</time>
                      </header>
                      <p>{m.message}</p>
                    </article>
                  ))}
                </div>

                <div className="lcp-reply-box">
                  <textarea
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Reply as SuperAdmin..."
                  />
                  <button
                    type="button"
                    className="btn-primary"
                    disabled={sendingReply || !String(reply || '').trim()}
                    onClick={handleReply}
                  >
                    {sendingReply ? 'Sending...' : 'Send Reply'}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      </SectionCard>
    </div>
  )
}
