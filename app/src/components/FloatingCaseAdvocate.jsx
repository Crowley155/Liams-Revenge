import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Check,
  FileUp,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  RefreshCcw,
  Search,
  Send,
  StopCircle,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  approveCaseChatAction,
  clearCaseChat,
  fetchCaseChatSession,
  openOrCreateDraftCase,
  rejectCaseChatAction,
  streamCaseChatMessage,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

let optimisticMessageSequence = 0;

function nextOptimisticMessageId(prefix) {
  optimisticMessageSequence += 1;
  return `${prefix}-${optimisticMessageSequence}`;
}

function caseIdFromPath(pathname) {
  const match = pathname.match(/^\/cases\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function routeContext(pathname) {
  if (pathname.includes('/locker')) return { mode: 'Evidence Locker' };
  if (pathname.includes('/records')) return { mode: 'Records Requests' };
  if (pathname.includes('/packet')) return { mode: 'Packet' };
  if (pathname.includes('/people')) return { mode: 'People' };
  return { mode: 'Case Plan' };
}

function latestStructured(session) {
  const messages = session?.messages || [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant' && messages[index].structured) {
      return messages[index].structured;
    }
  }
  return {};
}

function suggestedRepliesForSession(structured) {
  const suggestions = Array.isArray(structured.suggested_replies)
    ? structured.suggested_replies.filter(Boolean)
    : [];
  return [...new Set(suggestions)].slice(0, 3);
}

function mergeStreamEvent(prev, event) {
  const structured = prev?.structured || {};
  if (event.type === 'message' || event.type === 'message_delta') {
    const content = event.data.content || event.data.delta || '';
    return {
      id: `stream-${Date.now()}`,
      role: 'assistant',
      content,
      created_at: new Date().toISOString(),
      structured: {
        ...structured,
        message_parts: event.data.message_parts || structured.message_parts || [],
        suggested_replies: event.data.suggested_replies || structured.suggested_replies || [],
        case_update_proposals: event.data.case_update_proposals || structured.case_update_proposals || [],
        intent: event.data.intent || structured.intent || '',
        trace_id: event.data.trace_id || structured.trace_id || '',
        model_route: event.data.model_route || structured.model_route || {},
      },
    };
  }
  if (!prev) return prev;
  const keyByType = {
    source: 'sources',
    action: 'action_proposals',
    safety: 'safety_flags',
  };
  const key = keyByType[event.type];
  if (!key) return prev;
  return {
    ...prev,
    structured: {
      ...structured,
      [key]: [...(structured[key] || []), event.data],
    },
  };
}

function SourceCards({ sources, onNavigate }) {
  if (!sources?.length) return null;
  return (
    <div className="case-advocate-source-list" aria-label="Evidence sources">
      {sources.slice(0, 4).map((source) => (
        <button key={source.id} type="button" onClick={() => source.route && onNavigate(source.route)} className="case-advocate-source-card">
          <span className="case-advocate-source-icon"><Search className="h-3.5 w-3.5" aria-hidden="true" /></span>
          <span className="min-w-0">
            <span className="case-advocate-source-title">{source.label || 'Case source'}</span>
            {source.preview && <span className="case-advocate-source-preview">{source.preview}</span>}
          </span>
        </button>
      ))}
    </div>
  );
}

function SafetyFlags({ flags }) {
  if (!flags?.length) return null;
  return (
    <div className="case-advocate-safety-list">
      {flags.slice(0, 2).map((flag) => (
        <div key={`${flag.type}-${flag.label}`} className={`case-advocate-safety case-advocate-safety-${flag.severity || 'info'}`}>
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{flag.detail || flag.label}</span>
        </div>
      ))}
    </div>
  );
}

function ActionCards({ actions, busyActionId, onResolve }) {
  const visible = (actions || []).filter((action) => action?.label).slice(0, 4);
  if (!visible.length) return null;
  return (
    <div className="case-advocate-action-list" aria-label="Action proposals">
      {visible.map((action) => {
        const pending = action.status === 'pending';
        const busy = busyActionId === action.id;
        return (
          <div key={action.id} className="case-advocate-action-card">
            <div className="min-w-0">
              <p className="case-advocate-action-title">{action.label}</p>
              {action.description && <p className="case-advocate-action-description">{action.description}</p>}
              {!pending && (
                <p className={`case-advocate-action-status case-advocate-action-status-${action.status}`}>
                  {action.status === 'approved' ? 'Approved' : 'Not now'}
                </p>
              )}
            </div>
            {pending && (
              <div className="case-advocate-action-buttons">
                <button type="button" onClick={() => onResolve(action, 'approve')} disabled={busy} title="Confirm action">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  Confirm
                </button>
                <button type="button" onClick={() => onResolve(action, 'reject')} disabled={busy} title="Reject action">
                  <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Not now
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MessageParts({ parts }) {
  const blocks = (parts || []).filter((part) => part?.type && part.type !== 'text');
  if (!blocks.length) return null;
  return (
    <div className="case-advocate-part-list">
      {blocks.map((part, index) => (
        <div key={`${part.type}-${part.title || index}`} className={`case-advocate-part case-advocate-part-${part.type}`}>
          {part.title && <p className="case-advocate-part-title">{part.title}</p>}
          {part.text && <p className="case-advocate-part-text">{part.text}</p>}
          {!!part.items?.length && (
            <ul>
              {part.items.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function ChatMessage({ item, onNavigate, onResolveAction, busyActionId }) {
  const structured = item.structured || {};
  const textPart = structured.message_parts?.find((part) => part.type === 'text' && part.text);
  const displayText = item.content || textPart?.text || '';
  if (item.role === 'user') {
    return <div className="case-advocate-message from-user">{displayText}</div>;
  }
  return (
    <div className="case-advocate-message from-advocate">
      {displayText && <p className="case-advocate-message-copy">{displayText}</p>}
      <MessageParts parts={structured.message_parts} />
      <SourceCards sources={structured.sources} onNavigate={onNavigate} />
      <SafetyFlags flags={structured.safety_flags} />
      <ActionCards actions={structured.action_proposals} busyActionId={busyActionId} onResolve={onResolveAction} />
    </div>
  );
}

export default function FloatingCaseAdvocate() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);
  const lastUserTextRef = useRef('');
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [streamMessage, setStreamMessage] = useState(null);
  const [streamStatus, setStreamStatus] = useState('');
  const [message, setMessage] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissedSuggestionKey, setDismissedSuggestionKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyActionId, setBusyActionId] = useState('');
  const [error, setError] = useState('');

  const caseId = caseIdFromPath(location.pathname);
  const inCaseWorkspace = Boolean(caseId);
  const context = useMemo(() => routeContext(location.pathname), [location.pathname]);
  const structured = latestStructured(session);
  const suggestionKey = `${session?.id || ''}-${session?.messages?.length || 0}`;
  const suggestedReplies = dismissedSuggestionKey === suggestionKey ? [] : suggestedRepliesForSession(structured);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('chat') !== 'open' && params.get('advocate') !== 'open') return;
    setOpen(true);
    params.delete('chat');
    params.delete('advocate');
    const nextSearch = params.toString();
    navigate(`${location.pathname}${nextSearch ? `?${nextSearch}` : ''}`, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [session?.messages?.length, streamMessage?.content, open]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => textareaRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  const loadSession = useCallback(async () => {
    if (!caseId || !open) return;
    setError('');
    try {
      setSession(await fetchCaseChatSession(caseId));
    } catch (err) {
      setError(err.message || 'Chat could not load');
    }
  }, [caseId, open]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openChat = async () => {
    if (!isAuthenticated || loading) return;
    setError('');
    if (caseId) {
      setOpen(true);
      return;
    }
    setBusy(true);
    try {
      const draft = await openOrCreateDraftCase();
      setOpen(true);
      navigate(`/cases/${draft.id}?chat=open`);
    } catch (err) {
      setError(err.message || 'Could not open your case workspace');
    } finally {
      setBusy(false);
    }
  };

  const handleLauncherClick = async () => {
    if (open) {
      setOpen(false);
      return;
    }
    await openChat();
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStreamStatus('');
    setStreamMessage(null);
  };

  const sendMessage = async (content = '') => {
    const next = (content || message).trim();
    if (!next || !caseId || busy) return;
    const outbound = next;
    lastUserTextRef.current = next;
    setMessage('');
    setMenuOpen(false);
    setBusy(true);
    setError('');
    setStreamStatus('');
    setStreamMessage(null);
    const optimistic = session ? {
      ...session,
      messages: [
        ...(session.messages || []),
        { id: nextOptimisticMessageId('local'), role: 'user', content: next, created_at: '' },
      ],
    } : session;
    if (optimistic) setSession(optimistic);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const updated = await streamCaseChatMessage(caseId, outbound, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'status') setStreamStatus(event.data.label || 'Working');
          if (['message_delta', 'message', 'source', 'action', 'safety'].includes(event.type)) {
            setStreamMessage((prev) => mergeStreamEvent(prev, event));
          }
        },
      });
      if (updated) setSession(updated);
      window.dispatchEvent(new CustomEvent('usdwatch:case-updated', { detail: { caseId } }));
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Chat could not respond');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStreamStatus('');
      setStreamMessage(null);
    }
  };

  const clearChat = async () => {
    if (!caseId || busy || busyActionId) return;
    const confirmed = window.confirm('Clear this chat? Your case file, evidence, and saved narrative will stay.');
    if (!confirmed) return;
    abortRef.current?.abort();
    setBusy(false);
    setStreamStatus('');
    setStreamMessage(null);
    setBusyActionId('clear-chat');
    setError('');
    try {
      const updated = await clearCaseChat(caseId);
      setSession(updated);
      setMessage('');
      setDismissedSuggestionKey('');
      setMenuOpen(false);
    } catch (err) {
      setError(err.message || 'Could not clear chat');
    } finally {
      setBusyActionId('');
      abortRef.current = null;
    }
  };

  const resolveAction = async (action, decision) => {
    if (!caseId || !action?.id || busyActionId) return;
    setBusyActionId(action.id);
    setError('');
    try {
      const result = decision === 'approve'
        ? await approveCaseChatAction(caseId, action.id)
        : await rejectCaseChatAction(caseId, action.id);
      if (result.session) setSession(result.session);
      if (decision === 'approve' && result.route) navigate(result.route);
      if (result.executed) window.dispatchEvent(new CustomEvent('usdwatch:case-updated', { detail: { caseId } }));
    } catch (err) {
      setError(err.message || 'Could not update the action');
    } finally {
      setBusyActionId('');
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  const handleComposerKeyDown = (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent?.isComposing) return;
    event.preventDefault();
    sendMessage();
  };

  const retryLastMessage = () => {
    if (!lastUserTextRef.current || busy) return;
    sendMessage(lastUserTextRef.current);
  };

  if (!isAuthenticated) return null;

  const messages = session?.messages || [];

  return (
    <div className={`case-advocate-widget ${open ? 'is-open' : ''} ${inCaseWorkspace ? 'is-case-sidecar' : ''}`}>
      {open && (
        <section className="case-advocate-panel" aria-label="Chat">
          <header className="case-advocate-header">
            <div className="case-advocate-header-main">
              <span className="case-advocate-mark"><MessageCircle className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold">Chat</h2>
                <p className="truncate text-xs text-text-dim">{context.mode}</p>
              </div>
            </div>
            <div className="case-advocate-header-actions">
              <div className="case-advocate-menu-wrap">
                <button
                  type="button"
                  onClick={() => setMenuOpen((value) => !value)}
                  className="case-advocate-icon-button"
                  aria-label="Open chat menu"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  title="Chat menu"
                >
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div className="case-advocate-menu" role="menu">
                    <button
                      type="button"
                      onClick={clearChat}
                      role="menuitem"
                      disabled={!caseId || busy || Boolean(busyActionId)}
                    >
                      {busyActionId === 'clear-chat'
                        ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                        : <Trash2 className="h-4 w-4" aria-hidden="true" />}
                      Clear chat
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setOpen(false);
                }}
                className="case-advocate-icon-button"
                aria-label="Close chat"
                title="Close chat"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div className="case-advocate-messages">
            {messages.map((item) => (
              <ChatMessage
                key={item.id}
                item={item}
                onNavigate={navigate}
                onResolveAction={resolveAction}
                busyActionId={busyActionId}
              />
            ))}
            {streamMessage && (
              <ChatMessage
                item={streamMessage}
                onNavigate={navigate}
                onResolveAction={resolveAction}
                busyActionId={busyActionId}
              />
            )}
            {!session && !caseId && (
              <div className="case-advocate-message from-advocate">
                <p className="case-advocate-message-copy">
                  Open a Draft Case workspace to organize the story, evidence, records plan, and packet in one place.
                </p>
              </div>
            )}
            {busy && (
              <div className="case-advocate-thinking" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {streamStatus || 'Reading the case file...'}
                <button type="button" onClick={cancelStream}>
                  <StopCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Stop
                </button>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {!!suggestedReplies.length && !busy && (
            <div className="case-advocate-suggestions" aria-label="Suggested follow-ups">
              {suggestedReplies.map((reply) => (
                <button key={reply} type="button" onClick={() => sendMessage(reply)} disabled={!caseId || busy}>
                  {reply}
                </button>
              ))}
              <button
                type="button"
                className="case-advocate-suggestions-dismiss"
                onClick={() => setDismissedSuggestionKey(suggestionKey)}
                aria-label="Dismiss suggested follow-ups"
                title="Dismiss"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {error && (
            <div className="case-advocate-error" role="alert">
              <span>{error}</span>
              {lastUserTextRef.current && (
                <button type="button" onClick={retryLastMessage} disabled={busy}>
                  <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className="case-advocate-form">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={caseId ? 'Ask about this case...' : 'Open a draft case to start...'}
              disabled={busy || (!caseId && open)}
            />
            <button type="submit" disabled={busy || !message.trim() || !caseId} aria-label="Send message">
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="case-advocate-launcher"
        onClick={handleLauncherClick}
        aria-label={open ? 'Close Chat' : 'Open Chat'}
        aria-expanded={open}
        disabled={busy && !open}
      >
        <span className="case-advocate-launcher-icon">
          {busy && !open ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
        </span>
        <span className="case-advocate-launcher-label">Chat</span>
      </button>

      {!open && location.pathname === '/cases' && (
        <button type="button" className="case-advocate-nudge" onClick={openChat}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Start with a Draft Case
        </button>
      )}
    </div>
  );
}
