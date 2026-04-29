import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FileUp, Loader2, MessageCircle, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import {
  fetchCaseAdvocateSession,
  openOrCreateDraftCase,
  sendCaseAdvocateMessage,
} from '../api/client';
import { useAuth } from '../auth/AuthContext';

function caseIdFromPath(pathname) {
  const match = pathname.match(/^\/cases\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function routeContext(pathname) {
  if (pathname.includes('/locker')) {
    return {
      mode: 'Evidence Locker',
      tip: 'I can help decide what to upload next or explain a document status.',
      actions: [
        { label: 'Ask what evidence matters', prompt: 'What evidence would be most useful to add next?' },
        { label: 'Explain locker status', prompt: 'Explain what my Evidence Locker statuses mean.' },
      ],
    };
  }
  if (pathname.includes('/records')) {
    return {
      mode: 'Records Requests',
      tip: 'I can help prioritize records requests and keep the tracking plain.',
      actions: [
        { label: 'Prioritize requests', prompt: 'Which records requests should I send first?' },
        { label: 'Draft follow-up', prompt: 'Help me think through a follow-up if records are delayed.' },
      ],
    };
  }
  if (pathname.includes('/packet')) {
    return {
      mode: 'Packet',
      tip: 'I can explain what is ready for your self-advocacy packet and what is still thin.',
      actions: [
        { label: 'Packet gaps', prompt: 'What would make my packet stronger before I share it?' },
        { label: 'Meeting prep', prompt: 'What questions should I prepare for a school meeting?' },
      ],
    };
  }
  if (pathname.includes('/people')) {
    return {
      mode: 'People',
      tip: 'I can help keep people, roles, and responsibilities straight.',
      actions: [
        { label: 'Who matters?', prompt: 'Which people or roles matter most in this case file?' },
        { label: 'Responsibility map', prompt: 'Help me organize who knew what and when.' },
      ],
    };
  }
  return {
    mode: 'Case Plan',
    tip: 'I can help build your Family Narrative, spot gaps, and choose the next useful step.',
    actions: [
      { label: 'Fill gaps', prompt: 'What important facts are still missing from my case file?' },
      { label: 'Family Narrative', prompt: 'Help me write a clear Family Narrative from what I have shared.' },
    ],
  };
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

function AdvocateCharacter({ state = 'ready' }) {
  return (
    <div className={`advocate-character advocate-character-${state}`} aria-hidden="true">
      <svg viewBox="0 0 96 96" role="img">
        <defs>
          <linearGradient id="advocateBody" x1="21" x2="75" y1="16" y2="84" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a9b8ff" />
            <stop offset="1" stopColor="#5d76dd" />
          </linearGradient>
          <linearGradient id="advocateFolder" x1="21" x2="77" y1="50" y2="77" gradientUnits="userSpaceOnUse">
            <stop stopColor="#f3c777" />
            <stop offset="1" stopColor="#d9963d" />
          </linearGradient>
        </defs>
        <path className="advocate-shadow" d="M22 78c6 6 45 7 54 1 4-3 1-8-10-9H34c-11 1-16 5-12 8Z" />
        <path className="advocate-body" d="M31 18h28l13 14v39c0 7-5 12-12 12H31c-7 0-12-5-12-12V30c0-7 5-12 12-12Z" fill="url(#advocateBody)" />
        <path className="advocate-fold" d="M59 19v11c0 3 2 5 5 5h8" />
        <path className="advocate-face" d="M32 42c2-5 7-8 14-8s13 3 16 8" />
        <circle className="advocate-eye left" cx="38" cy="49" r="3.2" />
        <circle className="advocate-eye right" cx="56" cy="49" r="3.2" />
        <path className="advocate-mouth" d="M39 61c6 4 12 4 18 0" />
        <path className="advocate-folder" d="M20 57h20l5 5h31v12c0 6-4 10-10 10H30c-6 0-10-4-10-10V57Z" fill="url(#advocateFolder)" />
        <path className="advocate-folder-line" d="M28 70h40" />
        <path className="advocate-spark one" d="M18 24l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
        <path className="advocate-spark two" d="M78 44l2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" />
      </svg>
    </div>
  );
}

export default function FloatingCaseAdvocate() {
  const { isAuthenticated, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const chatEndRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const caseId = caseIdFromPath(location.pathname);
  const context = useMemo(() => routeContext(location.pathname), [location.pathname]);
  const routeShortcuts = useMemo(() => {
    if (!caseId) return [];
    return [
      { label: 'Plan', to: `/cases/${caseId}` },
      { label: 'Locker', to: `/cases/${caseId}/locker` },
      { label: 'Records', to: `/cases/${caseId}/records` },
      { label: 'Packet', to: `/cases/${caseId}/packet` },
    ].filter((item) => item.to !== location.pathname);
  }, [caseId, location.pathname]);
  const structured = latestStructured(session);
  const suggestedActions = structured.suggested_actions?.length ? structured.suggested_actions : context.actions.map((item) => item.prompt);

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
  }, [session?.messages?.length, open]);

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

  const sendMessage = async (content) => {
    const next = (content || message).trim();
    if (!next || !caseId || busy) return;
    setMessage('');
    setBusy(true);
    setError('');
    const localRoute = localRouteForMessage(next, caseId);
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
          },
        ],
      } : optimistic;
      if (updated) setSession(updated);
      navigate(localRoute.to);
      setBusy(false);
      return;
    }
    try {
      const updated = await sendCaseAdvocateMessage(caseId, next);
      setSession(updated);
      window.dispatchEvent(new CustomEvent('usdwatch:case-updated', { detail: { caseId } }));
    } catch (err) {
      setError(err.message || 'Case Advocate could not respond');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  if (!isAuthenticated) return null;

  const characterState = busy ? 'thinking' : (suggestedActions.length ? 'gap' : 'ready');

  return (
    <div className={`case-advocate-widget ${open ? 'is-open' : ''}`}>
      {open && (
        <section className="case-advocate-panel" aria-label="Case Advocate">
          <header className="case-advocate-header">
            <div className="flex min-w-0 items-center gap-3">
              <AdvocateCharacter state={characterState} />
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Case Advocate</p>
                <h2 className="truncate text-base font-bold tracking-tight">Building with you</h2>
                <p className="truncate text-xs text-text-dim">{context.mode}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-2 text-text-dim transition-colors hover:bg-surface-alt hover:text-text"
              aria-label="Close Case Advocate"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="case-advocate-context">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <p>{context.tip}</p>
          </div>

          <div className="case-advocate-messages">
            {(session?.messages || []).map((item) => (
              <div key={item.id} className={`case-advocate-message ${item.role === 'user' ? 'from-user' : 'from-advocate'}`}>
                {item.content}
              </div>
            ))}
            {!session && !caseId && (
              <div className="case-advocate-message from-advocate">
                I can start a Draft Case workspace and stay with you while you build the story, evidence, records plan, and packet.
              </div>
            )}
            {busy && (
              <div className="case-advocate-thinking" role="status" aria-live="polite">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Organizing the case file...
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="case-advocate-actions">
            {context.actions.map((action) => (
              <button key={action.label} type="button" onClick={() => sendMessage(action.prompt)} disabled={busy || !caseId}>
                {action.label}
              </button>
            ))}
          </div>

          {!!routeShortcuts.length && (
            <div className="case-advocate-shortcuts" aria-label="Case navigation shortcuts">
              {routeShortcuts.map((item) => (
                <button key={item.to} type="button" onClick={() => navigate(item.to)}>
                  {item.label}
                </button>
              ))}
            </div>
          )}

          {suggestedActions.length > 0 && (
            <div className="case-advocate-next">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <p>{suggestedActions[0]}</p>
            </div>
          )}

          {error && <p className="case-advocate-error">{error}</p>}

          <form onSubmit={handleSubmit} className="case-advocate-form">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={caseId ? 'Tell me what to help organize next...' : 'Open a draft case to start...'}
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
        onClick={openAdvocate}
        aria-label={open ? 'Case Advocate open' : 'Open Case Advocate'}
        disabled={busy && !open}
      >
        <span className="case-advocate-launcher-character">
          <AdvocateCharacter state={busy ? 'thinking' : 'ready'} />
        </span>
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
