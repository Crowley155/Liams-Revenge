import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  CheckCircle2,
  ClipboardList,
  FileText,
  FileUp,
  FolderOpen,
  Home,
  Loader2,
  MessageCircle,
  PanelRightClose,
  Search,
  Send,
  ShieldCheck,
  StopCircle,
  Users,
  XCircle,
} from 'lucide-react';
import {
  approveCaseAdvocateAction,
  fetchCaseAdvocateSession,
  openOrCreateDraftCase,
  rejectCaseAdvocateAction,
  streamCaseAdvocateMessage,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

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

function questionCardsForSession(session, structured) {
  const cards = Array.isArray(structured.question_cards) ? structured.question_cards.filter((card) => card?.question) : [];
  if (cards.length) return cards;
  const fallbackQuestion = structured.next_question || session?.next_question;
  if (!fallbackQuestion) return [];
  const missing = structured.missing_facts?.[0] || session?.missing_fields?.[0] || '';
  return [{
    id: 'next-question',
    field: missing || 'case_context',
    label: 'Next question',
    question: fallbackQuestion,
    why: '',
    input_type: 'free_text',
    options: [],
    priority: 1,
  }];
}

function localRouteForMessage(content, caseId) {
  if (!caseId) return null;
  const text = content.toLowerCase();
  const wantsNavigation = /\b(open|go|take|show|switch|view|navigate)\b/.test(text);
  if (!wantsNavigation) return null;
  const base = `/cases/${caseId}`;
  if (/\b(evidence|locker|upload|document|file|pdf|email)\b/.test(text)) return { label: 'Evidence Locker', to: `${base}/locker` };
  if (/\b(records?|kora|request|requests?)\b/.test(text)) return { label: 'Records Requests', to: `${base}/records` };
  if (/\b(people|person|staff|teacher|principal|agency)\b/.test(text)) return { label: 'People', to: `${base}/people` };
  if (/\b(packet|print|export|summary)\b/.test(text)) return { label: 'Packet', to: `${base}/packet` };
  if (/\b(plan|overview|home|case)\b/.test(text)) return { label: 'Case Plan', to: base };
  return null;
}

function mergeStreamEvent(prev, event) {
  const structured = prev?.structured || {};
  if (event.type === 'message') {
    return {
      id: `stream-${Date.now()}`,
      role: 'assistant',
      content: event.data.content || '',
      created_at: new Date().toISOString(),
      structured: {
        ...structured,
        message_parts: event.data.message_parts || structured.message_parts || [],
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

function StructuredQuestionCard({ card, onAnswer, busy }) {
  const options = Array.isArray(card.options) ? card.options.filter(Boolean).slice(0, 5) : [];
  return (
    <div className="case-advocate-question-card">
      <div className="case-advocate-question-header">
        <BookOpenCheck className="h-3.5 w-3.5" aria-hidden="true" />
        <p className="case-advocate-question-label">Next question</p>
      </div>
      <div className="case-advocate-question-body">
        <p className="case-advocate-question-text">{card.question}</p>
        {card.why && <p className="case-advocate-question-why">{card.why}</p>}
      </div>
      {options.length > 0 ? (
        <div className="case-advocate-question-options">
          {options.map((option) => (
            <button key={option} type="button" onClick={() => onAnswer(card, option)} disabled={busy}>
              {option}
            </button>
          ))}
        </div>
      ) : (
        <button type="button" className="case-advocate-answer-button" onClick={() => onAnswer(card)} disabled={busy}>
          Answer in chat
        </button>
      )}
    </div>
  );
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
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [streamMessage, setStreamMessage] = useState(null);
  const [streamStatus, setStreamStatus] = useState('');
  const [message, setMessage] = useState('');
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyActionId, setBusyActionId] = useState('');
  const [error, setError] = useState('');

  const caseId = caseIdFromPath(location.pathname);
  const inCaseWorkspace = Boolean(caseId);
  const context = useMemo(() => routeContext(location.pathname), [location.pathname]);
  const routeShortcuts = useMemo(() => {
    if (!caseId) return [];
    return [
      { label: 'Plan', title: 'Open Case Plan', icon: Home, to: `/cases/${caseId}` },
      { label: 'Evidence', title: 'Open Evidence Locker', icon: FolderOpen, to: `/cases/${caseId}/locker` },
      { label: 'Records', title: 'Open Records Requests', icon: ClipboardList, to: `/cases/${caseId}/records` },
      { label: 'People', title: 'Open People', icon: Users, to: `/cases/${caseId}/people` },
      { label: 'Packet', title: 'Open Self-Advocacy Packet', icon: FileText, to: `/cases/${caseId}/packet` },
    ].filter((item) => item.to !== location.pathname);
  }, [caseId, location.pathname]);
  const structured = latestStructured(session);
  const questionCards = useMemo(() => questionCardsForSession(session, structured), [session, structured]);
  const currentQuestion = questionCards[0] || null;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('advocate') !== 'open') return;
    setOpen(true);
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
  }, [open, activeQuestion?.id]);

  const loadSession = useCallback(async () => {
    if (!caseId || !open) return;
    setError('');
    try {
      setSession(await fetchCaseAdvocateSession(caseId));
    } catch (err) {
      setError(err.message || 'Case Advocate could not load');
    }
  }, [caseId, open]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const openAdvocate = async () => {
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
      navigate(`/cases/${draft.id}?advocate=open`);
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
    await openAdvocate();
  };

  const cancelStream = () => {
    abortRef.current?.abort();
    setBusy(false);
    setStreamStatus('');
    setStreamMessage(null);
  };

  const sendMessage = async (content, questionCard = activeQuestion) => {
    const next = (content || message).trim();
    if (!next || !caseId || busy) return;
    const outbound = questionCard?.question
      ? [
          `Question: ${questionCard.question}`,
          questionCard.field ? `Field: ${questionCard.field}` : '',
          `Answer: ${next}`,
        ].filter(Boolean).join('\n')
      : next;
    setMessage('');
    setActiveQuestion(null);
    setBusy(true);
    setError('');
    setStreamStatus('');
    setStreamMessage(null);
    const localRoute = questionCard ? null : localRouteForMessage(next, caseId);
    const optimistic = session ? {
      ...session,
      messages: [
        ...(session.messages || []),
        { id: `local-${Date.now()}`, role: 'user', content: next, created_at: new Date().toISOString() },
      ],
    } : session;
    if (optimistic) setSession(optimistic);
    if (localRoute) {
      const updated = optimistic ? {
        ...optimistic,
        messages: [
          ...(optimistic.messages || []),
          {
            id: `local-route-${Date.now()}`,
            role: 'assistant',
            content: `I opened ${localRoute.label}. I will stay here if you need help with the next step.`,
            created_at: new Date().toISOString(),
            structured: { message_parts: [{ type: 'text', text: `I opened ${localRoute.label}. I will stay here if you need help with the next step.` }] },
          },
        ],
      } : optimistic;
      if (updated) setSession(updated);
      navigate(localRoute.to);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const updated = await streamCaseAdvocateMessage(caseId, outbound, {
        signal: controller.signal,
        onEvent: (event) => {
          if (event.type === 'status') setStreamStatus(event.data.label || 'Working');
          if (['message', 'source', 'action', 'safety'].includes(event.type)) {
            setStreamMessage((prev) => mergeStreamEvent(prev, event));
          }
        },
      });
      if (updated) setSession(updated);
      window.dispatchEvent(new CustomEvent('usdwatch:case-updated', { detail: { caseId } }));
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Case Advocate could not respond');
      }
    } finally {
      abortRef.current = null;
      setBusy(false);
      setStreamStatus('');
      setStreamMessage(null);
    }
  };

  const resolveAction = async (action, decision) => {
    if (!caseId || !action?.id || busyActionId) return;
    setBusyActionId(action.id);
    setError('');
    try {
      const result = decision === 'approve'
        ? await approveCaseAdvocateAction(caseId, action.id)
        : await rejectCaseAdvocateAction(caseId, action.id);
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

  const answerQuestion = (card, option = '') => {
    if (option) {
      sendMessage(option, card);
      return;
    }
    setActiveQuestion(card);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  if (!isAuthenticated) return null;

  const messages = session?.messages || [];

  return (
    <div className={`case-advocate-widget ${open ? 'is-open' : ''} ${inCaseWorkspace ? 'is-case-sidecar' : ''}`}>
      {open && (
        <section className="case-advocate-panel" aria-label="Case Advocate">
          <header className="case-advocate-header">
            <div className="case-advocate-header-main">
              <span className="case-advocate-mark"><ShieldCheck className="h-4 w-4" aria-hidden="true" /></span>
              <div className="min-w-0">
                <p className="case-advocate-kicker">Case Advocate</p>
                <h2 className="truncate text-base font-bold">Case sidecar</h2>
                <p className="truncate text-xs text-text-dim">{context.mode}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="case-advocate-icon-button"
              aria-label="Close Case Advocate"
              title="Close Case Advocate"
            >
              <PanelRightClose className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="case-advocate-status-row">
            <span className="case-advocate-status-pill">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Confirm-first actions
            </span>
            {structured?.model_route?.model && (
              <span className="case-advocate-model-pill">{structured.model_route.fallback ? 'Fallback' : 'Hosted'} model</span>
            )}
          </div>

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
                  I can start a Draft Case workspace and stay with you while you build the story, evidence, records plan, and packet.
                </p>
              </div>
            )}
            {busy && (
              <div className="case-advocate-thinking" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {streamStatus || 'Organizing the case file...'}
                <button type="button" onClick={cancelStream}>
                  <StopCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Stop
                </button>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {!!routeShortcuts.length && (
            <div className="case-advocate-shortcuts" aria-label="Case navigation shortcuts">
              {routeShortcuts.map((item) => {
                const Icon = item.icon;
                return (
                  <button key={item.to} type="button" onClick={() => navigate(item.to)} title={item.title} aria-label={item.title}>
                    <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                    {item.label}
                  </button>
                );
              })}
            </div>
          )}

          {currentQuestion && (
            <StructuredQuestionCard card={currentQuestion} onAnswer={answerQuestion} busy={busy || !caseId} />
          )}

          {error && <p className="case-advocate-error">{error}</p>}

          <form onSubmit={handleSubmit} className="case-advocate-form">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={handleComposerKeyDown}
              placeholder={activeQuestion?.question || (caseId ? 'Ask about evidence, gaps, records, or next steps...' : 'Open a draft case to start...')}
              disabled={busy || (!caseId && open)}
            />
            <button type="submit" disabled={busy || !message.trim() || !caseId} aria-label="Send to Case Advocate">
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}

      <button
        type="button"
        className="case-advocate-launcher"
        onClick={handleLauncherClick}
        aria-label={open ? 'Close Case Advocate' : 'Open Case Advocate'}
        aria-expanded={open}
        disabled={busy && !open}
      >
        <span className="case-advocate-launcher-icon">
          {busy && !open ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <MessageCircle className="h-5 w-5" aria-hidden="true" />}
        </span>
        <span className="case-advocate-launcher-label">Advocate</span>
      </button>

      {!open && location.pathname === '/cases' && (
        <button type="button" className="case-advocate-nudge" onClick={openAdvocate}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Start with a Draft Case
        </button>
      )}
    </div>
  );
}
