import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ShieldAlert } from 'lucide-react';
import { acceptCaseInvitation } from '../api/client';
import { ActionButton, Panel } from './caseShared';

export default function AcceptCaseInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('loading');
  const [message, setMessage] = useState('');
  const [caseRecord, setCaseRecord] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function acceptInvite() {
      setStatus('loading');
      try {
        const result = await acceptCaseInvitation(token || '');
        if (cancelled) return;
        setCaseRecord(result.case || null);
        setMessage('You now have access to this case.');
        setStatus('accepted');
      } catch (err) {
        if (cancelled) return;
        setMessage(err.message || 'This invite could not be accepted.');
        setStatus('error');
      }
    }
    acceptInvite();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="product-ui mx-auto max-w-2xl py-10 animate-fade-up">
      <Panel title="Case Invitation" eyebrow="Shared access">
        {status === 'loading' && (
          <div className="flex items-center gap-3 text-sm text-text-dim">
            <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
            Accepting invite...
          </div>
        )}

        {status === 'accepted' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-text">{message}</p>
                <p className="wrap-anywhere mt-1 text-sm leading-relaxed text-text-dim">
                  {caseRecord?.title || 'The shared case'} is now available from your Cases page.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {caseRecord?.id && (
                <ActionButton onClick={() => navigate(`/cases/${caseRecord.id}`)} variant="primary">
                  Open case
                </ActionButton>
              )}
              <Link to="/cases" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">
                View all cases
              </Link>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-semibold text-text">Invite could not be accepted</p>
                <p className="mt-1 text-sm leading-relaxed text-text-dim">{message}</p>
              </div>
            </div>
            <Link to="/cases" className="inline-flex min-h-11 items-center justify-center rounded-md border border-border px-3 py-2 text-sm font-semibold text-text-dim transition-colors hover:bg-surface-alt hover:text-text">
              Back to cases
            </Link>
          </div>
        )}
      </Panel>
    </div>
  );
}
