import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Copy, Download, FileText, Loader2, MailPlus, Printer, ShieldCheck, Trash2, UserRound, Users } from 'lucide-react';
import {
  fetchCase,
  fetchCaseAccess,
  fetchCaseDocuments,
  fetchCaseEvaluation,
  fetchCaseExport,
  fetchCaseShares,
  fetchEvidenceChecklist,
  fetchLatestEvaluation,
  fetchRecordsRequestDrafts,
  fetchSelfAdvocacyPacket,
  inviteCaseCollaborator,
  revokeCaseInvitation,
  revokeCaseShare,
  startCaseEvaluation,
  updateCase,
  updateCaseShareRole,
  updateSupportConsent,
} from '../api/client';
import { printDocument } from '../utils/printPdf';
import { casePermissions, caseRoleHelp, caseRoleLabel, sharedAccessLabel } from '../utils/caseAccess';
import {
  ActionButton,
  EMPTY_SUPPORT,
  Metric,
  Panel,
  StatusPill,
  buildPacketText,
  checklistStatusCount,
  formatLabel,
} from './caseShared';

function outcomeLines(value) {
  return String(value || '')
    .split(/\r?\n|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function outcomeTextFromCase(caseRecord) {
  const intake = caseRecord?.intake || {};
  if (intake.desired_outcome) return intake.desired_outcome;
  return (intake.desired_outcomes || []).join('\n');
}

const SHARE_ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
];

function formatShortDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return '';
  }
}

function AccessSummaryPanel({ access }) {
  const accessLabel = sharedAccessLabel(access);
  if (!accessLabel) return null;
  return (
    <Panel title="Your Access" eyebrow="Shared case">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-info/35 bg-info/10 text-info">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-text">{accessLabel}</p>
          <p className="mt-1 text-sm leading-relaxed text-text-dim">{caseRoleHelp(access?.role)}</p>
        </div>
      </div>
    </Panel>
  );
}

function CaseSharingPanel({
  shares,
  inviteEmail,
  inviteRole,
  sharingBusy,
  sharingNotice,
  copiedInviteUrl,
  onInviteEmailChange,
  onInviteRoleChange,
  onInvite,
  onCopyInvite,
  onUpdateRole,
  onRevokeGrant,
  onRevokeInvite,
}) {
  const collaborators = shares?.collaborators || [];
  const invitations = shares?.invitations || [];
  const pendingInvitations = invitations.filter((invite) => invite.status === 'pending');

  return (
    <Panel title="Sharing" eyebrow="Case-level access">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="text-sm leading-relaxed text-text-dim">
            Invite a spouse, attorney, or trusted helper to this case only. They will need a USDWatch account with the same email address.
          </p>
          <form onSubmit={onInvite} className="mt-4 grid gap-3">
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-text-dim">Email address</span>
              <input
                type="email"
                required
                value={inviteEmail}
                onChange={(event) => onInviteEmailChange(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
                placeholder="helper@example.com"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-text-dim">Access level</span>
              <select
                value={inviteRole}
                onChange={(event) => onInviteRoleChange(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
              >
                {SHARE_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="block text-xs leading-relaxed text-text-dim">{caseRoleHelp(inviteRole)}</span>
            </label>
            <ActionButton type="submit" disabled={sharingBusy} variant="primary" className="w-full">
              {sharingBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MailPlus className="h-4 w-4" aria-hidden="true" />}
              Create invite link
            </ActionButton>
          </form>
          {sharingNotice && (
            <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${sharingNotice.type === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/8 text-success'}`}>
              {sharingNotice.message}
            </p>
          )}
          {copiedInviteUrl && (
            <div className="mt-3 rounded-md border border-info/30 bg-info/8 p-3">
              <p className="text-xs font-semibold text-info">Invite link ready</p>
              <p className="wrap-anywhere mt-1 text-xs leading-relaxed text-text-dim">{copiedInviteUrl}</p>
              <ActionButton onClick={() => onCopyInvite(copiedInviteUrl)} variant="download" className="mt-3">
                <Copy className="h-4 w-4" aria-hidden="true" />
                Copy link
              </ActionButton>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <section className="min-w-0 rounded-md border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-accent" aria-hidden="true" />
              <h4 className="text-sm font-bold text-text">Current collaborators</h4>
            </div>
            <div className="mt-3 space-y-2">
              {!collaborators.length && <p className="text-sm text-text-dim">No one else has accepted access yet.</p>}
              {collaborators.map((grant) => (
                <article key={grant.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="wrap-anywhere text-sm font-semibold text-text">{grant.email || 'Collaborator'}</p>
                    <p className="mt-1 text-xs text-text-dim">Accepted {formatShortDate(grant.accepted_at) || 'recently'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={grant.role}
                      onChange={(event) => onUpdateRole(grant.id, event.target.value)}
                      disabled={sharingBusy}
                      className="min-h-11 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-text outline-none focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
                      aria-label={`Role for ${grant.email}`}
                    >
                      {SHARE_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <ActionButton disabled={sharingBusy} onClick={() => onRevokeGrant(grant)} variant="danger">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                      Revoke
                    </ActionButton>
                  </div>
                </article>
              ))}
            </div>
          </section>

          <section className="min-w-0 rounded-md border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-accent" aria-hidden="true" />
              <h4 className="text-sm font-bold text-text">Pending invites</h4>
            </div>
            <div className="mt-3 space-y-2">
              {!pendingInvitations.length && <p className="text-sm text-text-dim">No pending invite links.</p>}
              {pendingInvitations.map((invite) => (
                <article key={invite.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="wrap-anywhere text-sm font-semibold text-text">{invite.email}</p>
                      <StatusPill status={invite.role} />
                    </div>
                    <p className="mt-1 text-xs text-text-dim">Expires {formatShortDate(invite.expires_at) || 'soon'}</p>
                  </div>
                  <ActionButton disabled={sharingBusy} onClick={() => onRevokeInvite(invite)} variant="danger">
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    Revoke invite
                  </ActionButton>
                </article>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Panel>
  );
}

export default function CaseDetail() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [access, setAccess] = useState(null);
  const [shares, setShares] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [evaluation, setEvaluation] = useState(null);
  const [packet, setPacket] = useState(null);
  const [checklist, setChecklist] = useState([]);
  const [recordsDrafts, setRecordsDrafts] = useState([]);
  const [supportForm, setSupportForm] = useState(EMPTY_SUPPORT);
  const [familyNarrative, setFamilyNarrative] = useState('');
  const [desiredOutcome, setDesiredOutcome] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savingNarrative, setSavingNarrative] = useState(false);
  const [savingOutcome, setSavingOutcome] = useState(false);
  const [savingSupport, setSavingSupport] = useState(false);
  const [sharingBusy, setSharingBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [sharingNotice, setSharingNotice] = useState(null);
  const [copiedInviteUrl, setCopiedInviteUrl] = useState('');

  const loadCase = useCallback(async () => {
    setError('');
    try {
      const [
        nextCase,
        nextAccess,
        nextDocs,
        nextEval,
        nextPacket,
        nextChecklist,
        nextRecords,
      ] = await Promise.all([
        fetchCase(caseId),
        fetchCaseAccess(caseId).catch(() => null),
        fetchCaseDocuments(caseId).catch(() => []),
        fetchLatestEvaluation(caseId).catch(() => null),
        fetchSelfAdvocacyPacket(caseId).catch(() => null),
        fetchEvidenceChecklist(caseId).catch(() => ({ items: [] })),
        fetchRecordsRequestDrafts(caseId).catch(() => ({ records: [] })),
      ]);
      const nextShares = casePermissions(nextAccess).can_manage_sharing
        ? await fetchCaseShares(caseId).catch(() => null)
        : null;
      setCaseRecord(nextCase);
      setAccess(nextAccess);
      setShares(nextShares);
      setFamilyNarrative(nextCase.family_narrative || nextCase.intake?.narrative || '');
      setDesiredOutcome(outcomeTextFromCase(nextCase));
      setDocuments(nextDocs);
      setEvaluation(nextEval);
      setPacket(nextPacket);
      setChecklist(nextChecklist.items || []);
      setRecordsDrafts(nextRecords.records || []);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to load case');
    }
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    loadCase().catch((err) => {
      if (!cancelled) setError(err.message || 'Failed to load case');
    });
    return () => {
      cancelled = true;
    };
  }, [loadCase]);

  useEffect(() => {
    const handleCaseUpdated = (event) => {
      if (!event.detail?.caseId || event.detail.caseId === caseId) {
        loadCase();
      }
    };
    window.addEventListener('usdwatch:case-updated', handleCaseUpdated);
    return () => window.removeEventListener('usdwatch:case-updated', handleCaseUpdated);
  }, [caseId, loadCase]);

  const reloadShares = useCallback(async () => {
    try {
      setShares(await fetchCaseShares(caseId));
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Failed to refresh sharing.' });
    }
  }, [caseId]);

  const permissions = useMemo(() => casePermissions(access), [access]);
  const canEditCase = permissions.can_edit;
  const canRunCaseRead = permissions.can_run_case_read;
  const canManageSharing = permissions.can_manage_sharing;
  const canManageSupport = permissions.can_manage_support;
  const accessLabel = sharedAccessLabel(access);
  const caseReadInProgress = ['queued', 'running'].includes(evaluation?.status);

  useEffect(() => {
    if (!caseReadInProgress || !evaluation?.id) return undefined;

    let cancelled = false;
    const pollEvaluation = async () => {
      try {
        const nextEvaluation = await fetchCaseEvaluation(caseId, evaluation.id);
        if (cancelled) return;
        setEvaluation(nextEvaluation);
        if (nextEvaluation.status === 'complete') {
          loadCase();
        } else if (nextEvaluation.status === 'failed') {
          setError(nextEvaluation.error || 'Case Read failed');
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to refresh Case Read status');
      }
    };

    pollEvaluation();
    const timer = window.setInterval(pollEvaluation, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [caseId, caseReadInProgress, evaluation?.id, loadCase]);

  const result = evaluation?.result;
  const caseReadStatus = evaluation?.status || 'not_started';
  const latestWorkflowStep = evaluation?.workflow_steps?.at?.(-1) || '';
  const caseReadStatusDetail = (() => {
    if (!evaluation) return 'No Case Read has been started yet.';
    if (evaluation.status === 'queued') return 'The Case Read is queued and will start shortly.';
    if (evaluation.status === 'running') return latestWorkflowStep ? `Working on ${formatLabel(latestWorkflowStep)}.` : 'The Case Read is running now.';
    if (evaluation.status === 'failed') return evaluation.error || 'The last Case Read failed.';
    if (evaluation.completed_at) return `Last completed ${new Date(evaluation.completed_at).toLocaleString()}.`;
    return 'The latest Case Read is complete.';
  })();
  const issueCategories = caseRecord?.intake?.issue_categories?.length
    ? caseRecord.intake.issue_categories
    : [caseRecord?.intake?.issue_type].filter(Boolean);
  const indexedCount = documents.filter((doc) => ['indexed', 'complete'].includes(doc.processing_status || doc.status)).length;
  const reviewCount = documents.filter((doc) => (doc.processing_status || doc.status) === 'needs_review').length;
  const missingCount = checklistStatusCount(checklist, 'missing') + checklistStatusCount(checklist, 'recommended');
  const activeRecordCount = recordsDrafts.length;
  const anySupport = supportForm.attorney_contact_opt_in || supportForm.advocacy_contact_opt_in || supportForm.media_contact_opt_in;
  const savedDesiredOutcome = outcomeTextFromCase(caseRecord);
  const hasDesiredOutcome = Boolean(savedDesiredOutcome.trim());

  const nextActions = useMemo(() => {
    const actions = [];
    if (!(caseRecord?.family_narrative || caseRecord?.intake?.narrative)) actions.push('Open Chat and start with what happened so USDWatch can build a Family Narrative.');
    if (!hasDesiredOutcome) actions.push('Summarize what a good outcome would look like, including any safety changes, records, supports, or policy fixes you want.');
    if (!documents.length) actions.push('Add the strongest document, email, screenshot, or incident note to the Evidence Locker.');
    if (!evaluation) actions.push('Run the first Case Read so USDWatch can organize what it sees from the story and evidence.');
    if (missingCount > 0) actions.push('Review missing evidence and decide which records requests should be sent first.');
    if (!packet && evaluation) actions.push('Open the packet tab after the Case Read to print a self-advocacy plan.');
    return actions.length ? actions.slice(0, 4) : ['Keep evidence current, track records responses, and refresh the Case Read when something important changes.'];
  }, [caseRecord?.family_narrative, caseRecord?.intake?.narrative, documents.length, evaluation, hasDesiredOutcome, missingCount, packet]);

  const updateSupportField = (field, value) => {
    setSupportForm((current) => ({ ...current, [field]: value }));
  };

  const handleRunEvaluation = async () => {
    if (!canRunCaseRead) return;
    setBusy(true);
    setError('');
    try {
      const next = await startCaseEvaluation(caseId);
      setEvaluation(next);
    } catch (err) {
      setError(err.message || 'Failed to start Case Read');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNarrative = async () => {
    if (!canEditCase) return;
    setSavingNarrative(true);
    setError('');
    try {
      const nextCase = await updateCase(caseId, { family_narrative: familyNarrative });
      setCaseRecord(nextCase);
      setFamilyNarrative(nextCase.family_narrative || '');
    } catch (err) {
      setError(err.message || 'Failed to save Family Narrative');
    } finally {
      setSavingNarrative(false);
    }
  };

  const handleSaveDesiredOutcome = async () => {
    if (!canEditCase) return;
    setSavingOutcome(true);
    setError('');
    try {
      const desiredOutcomes = outcomeLines(desiredOutcome);
      const nextCase = await updateCase(caseId, {
        desired_outcome: desiredOutcome.trim(),
        desired_outcomes: desiredOutcomes,
      });
      setCaseRecord(nextCase);
      setDesiredOutcome(outcomeTextFromCase(nextCase));
    } catch (err) {
      setError(err.message || 'Failed to save desired outcome');
    } finally {
      setSavingOutcome(false);
    }
  };

  const handleSaveSupport = async () => {
    if (!canManageSupport) return;
    setSavingSupport(true);
    setError('');
    try {
      const payload = { ...supportForm };
      if (!anySupport) payload.share_summary_consent = false;
      const nextCase = await updateSupportConsent(caseId, payload);
      setCaseRecord(nextCase);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to save support preferences');
    } finally {
      setSavingSupport(false);
    }
  };

  const handleRevokeSupport = async () => {
    if (!canManageSupport) return;
    setSavingSupport(true);
    setError('');
    try {
      const nextCase = await updateSupportConsent(caseId, EMPTY_SUPPORT);
      setCaseRecord(nextCase);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to revoke support consent');
    } finally {
      setSavingSupport(false);
    }
  };

  const handleInvite = async (event) => {
    event.preventDefault();
    if (!canManageSharing) return;
    setSharingBusy(true);
    setSharingNotice(null);
    setCopiedInviteUrl('');
    try {
      const result = await inviteCaseCollaborator(caseId, { email: inviteEmail, role: inviteRole });
      setInviteEmail('');
      setCopiedInviteUrl(result.accept_url || '');
      setSharingNotice({ type: 'success', message: 'Invite link created. Share it with the person you invited.' });
      await reloadShares();
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Invite failed.' });
    } finally {
      setSharingBusy(false);
    }
  };

  const handleCopyInvite = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setSharingNotice({ type: 'success', message: 'Invite link copied.' });
    } catch {
      setSharingNotice({ type: 'error', message: 'Could not copy automatically. Select the link and copy it manually.' });
    }
  };

  const handleUpdateShareRole = async (grantId, role) => {
    if (!canManageSharing) return;
    setSharingBusy(true);
    setSharingNotice(null);
    try {
      await updateCaseShareRole(caseId, grantId, role);
      setSharingNotice({ type: 'success', message: 'Collaborator role updated.' });
      await reloadShares();
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Role update failed.' });
    } finally {
      setSharingBusy(false);
    }
  };

  const handleRevokeGrant = async (grant) => {
    if (!canManageSharing) return;
    setSharingBusy(true);
    setSharingNotice(null);
    try {
      await revokeCaseShare(caseId, grant.id);
      setSharingNotice({ type: 'success', message: `${grant.email || 'Collaborator'} no longer has access.` });
      await reloadShares();
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Revoke failed.' });
    } finally {
      setSharingBusy(false);
    }
  };

  const handleRevokeInvite = async (invite) => {
    if (!canManageSharing) return;
    setSharingBusy(true);
    setSharingNotice(null);
    try {
      await revokeCaseInvitation(caseId, invite.id);
      setSharingNotice({ type: 'success', message: `Invite for ${invite.email} was revoked.` });
      await reloadShares();
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Invite revoke failed.' });
    } finally {
      setSharingBusy(false);
    }
  };

  const handlePrintPacket = () => {
    printDocument({
      title: packet?.title || `Self-Advocacy Packet - ${caseRecord?.title || 'Case'}`,
      body: buildPacketText(packet, caseRecord),
      meta: {
        District: caseRecord?.intake?.district,
        School: caseRecord?.intake?.school,
        Generated: packet?.generated_at,
      },
    });
  };

  const handleExportCase = async () => {
    setBusy(true);
    setError('');
    try {
      const exported = await fetchCaseExport(caseId);
      const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `usdwatch-case-${caseId}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || 'Failed to export case');
    } finally {
      setBusy(false);
    }
  };

  if (error && !caseRecord) {
    return <div className="mx-auto max-w-3xl py-10 text-sm text-danger">{error}</div>;
  }

  if (!caseRecord) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">Loading case...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 py-8 animate-fade-up">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <Link to="/cases" className="text-sm font-semibold text-accent hover:text-accent-hover">Cases</Link>
          <h2 className="text-3xl font-bold">{caseRecord.title}</h2>
          <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
            A calmer working desk for your Family Narrative, evidence, records requests, Case Read, and self-advocacy packet.
          </p>
          <div className="flex flex-wrap gap-2">
            <StatusPill status={caseRecord.status} />
            <StatusPill status={caseRecord.intake?.urgency_level || 'routine'} />
            {issueCategories.map((category) => <StatusPill key={category} status={category} />)}
            {caseRecord.intake?.safety_risk && <StatusPill status="safety risk" />}
            {caseRecord.intake?.retaliation_concern && <StatusPill status="retaliation concern" />}
            {accessLabel && <span className="inline-flex items-center rounded-md border border-info/30 bg-info/10 px-2 py-1 text-xs font-medium leading-none text-info">{accessLabel}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <ActionButton
            disabled={busy || !packet}
            onClick={handlePrintPacket}
            variant="secondary"
            className="px-4"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Print Packet
          </ActionButton>
          <ActionButton
            disabled={busy}
            onClick={handleExportCase}
            variant="download"
            className="px-4"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export Case
          </ActionButton>
          <ActionButton
            disabled={busy || caseReadInProgress || !canRunCaseRead}
            onClick={handleRunEvaluation}
            variant="primary"
            className="px-4"
          >
            {busy || caseReadInProgress ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileText className="h-4 w-4" aria-hidden="true" />}
            {caseReadInProgress ? 'Case Read running...' : evaluation ? 'Refresh Case Read' : 'Run Case Read'}
          </ActionButton>
        </div>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Evidence Strength" value={formatLabel(result?.evidence_strength || packet?.evidence_strength || 'unknown')} detail="Current support from story and files." />
        <Metric label="Evidence Files" value={documents.length} detail={`${indexedCount} ready${reviewCount ? `, ${reviewCount} need review` : ''}`} />
        <Metric label="Gaps To Close" value={missingCount} detail="Missing or recommended evidence." />
        <Metric label="Records Requests" value={activeRecordCount} detail="Drafts and tracked requests." />
      </div>

      <AccessSummaryPanel access={access} />

      <Panel
        title="Family Narrative"
        eyebrow={caseRecord.advocate_state?.family_narrative_manual ? 'Parent-edited' : 'Chat draft'}
        action={canEditCase ? (
          <ActionButton
            disabled={savingNarrative || familyNarrative === (caseRecord.family_narrative || caseRecord.intake?.narrative || '')}
            onClick={handleSaveNarrative}
            variant="primary"
          >
            {savingNarrative ? 'Saving...' : 'Save Narrative'}
          </ActionButton>
        ) : null}
      >
        <p className="mb-3 max-w-3xl text-sm leading-relaxed text-text-dim">
          This is the parent-centered story Chat helps assemble. Edits you save here stay in control unless you later accept a suggested revision.
        </p>
        <textarea
          value={familyNarrative}
          readOnly={!canEditCase}
          onChange={(event) => setFamilyNarrative(event.target.value)}
          className="min-h-[150px] w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent read-only:text-text-dim"
          placeholder="Tell the story the way you would tell a trusted advisor: what happened, who was affected, what worries you now, and what you need next."
        />
      </Panel>

      <Panel
        title="Desired Outcome"
        eyebrow="What you want changed"
        action={canEditCase ? (
          <ActionButton
            disabled={savingOutcome || desiredOutcome.trim() === savedDesiredOutcome.trim()}
            onClick={handleSaveDesiredOutcome}
            variant="primary"
          >
            {savingOutcome ? 'Saving...' : 'Save Desired Outcome'}
          </ActionButton>
        ) : null}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="min-w-0">
            <p className="mb-3 max-w-3xl text-sm leading-relaxed text-text-dim">
              Write what a practical resolution would look like. This can be one clear ask or a short list: safety changes, records, accountability, support for your child, or policy fixes you want the program to make.
            </p>
            <textarea
              value={desiredOutcome}
              readOnly={!canEditCase}
              onChange={(event) => setDesiredOutcome(event.target.value)}
              className="min-h-[130px] w-full rounded-md border border-border bg-background px-3 py-3 text-sm leading-relaxed text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45 read-only:text-text-dim"
              placeholder="Example: I want a written safety plan, a corrected incident report, age-group separation during outdoor play, and clear parent notification after serious injuries."
            />
          </div>
          <aside className="rounded-md border border-border bg-background/65 p-3">
            <p className="text-xs font-semibold text-text">Helpful prompts</p>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-text-dim">
              <li>What needs to happen for your child to be safe?</li>
              <li>What records, corrections, or explanations do you still need?</li>
              <li>What should JCPRD, the school, or the district change before this happens again?</li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-text-dim">
              Later, USDWatch can suggest specific policy reforms from this section. For now, it keeps your ask tied to this case.
            </p>
          </aside>
        </div>
      </Panel>

      {canManageSharing && (
        <CaseSharingPanel
          shares={shares}
          inviteEmail={inviteEmail}
          inviteRole={inviteRole}
          sharingBusy={sharingBusy}
          sharingNotice={sharingNotice}
          copiedInviteUrl={copiedInviteUrl}
          onInviteEmailChange={setInviteEmail}
          onInviteRoleChange={setInviteRole}
          onInvite={handleInvite}
          onCopyInvite={handleCopyInvite}
          onUpdateRole={handleUpdateShareRole}
          onRevokeGrant={handleRevokeGrant}
          onRevokeInvite={handleRevokeInvite}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-5">
          <Panel title="What To Do Next" eyebrow="Case plan">
            <div className="mb-3 rounded-md border border-border bg-background px-3 py-3 text-xs leading-relaxed text-text-dim">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold text-text-dim">Case Read</span>
                <StatusPill status={formatLabel(caseReadStatus)} />
              </div>
              <p>{caseReadStatusDetail}</p>
            </div>
            <ol className="divide-y divide-border">
              {nextActions.map((action, index) => (
                <li key={action} className="grid grid-cols-[28px_1fr] gap-3 py-3 text-sm">
                  <span className="grid h-7 w-7 place-items-center rounded-full border border-accent/40 text-xs font-bold text-accent">{index + 1}</span>
                  <span className="leading-relaxed text-text">{action}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </aside>

        <main className="space-y-5">
          <Panel title="What USDWatch Sees" eyebrow="Current read">
            <p className="max-w-3xl text-sm leading-relaxed text-text-dim">
              {packet?.what_usdwatch_sees || result?.executive_summary || 'Run a Case Read to generate a fuller current read.'}
            </p>
            <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs font-semibold text-text-dim">District</dt>
                <dd className="mt-1 text-text">{caseRecord.intake?.district || 'Not entered'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-dim">School</dt>
                <dd className="mt-1 text-text">{caseRecord.intake?.school || 'Not entered'}</dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-dim">Impacted person</dt>
                <dd className="mt-1 text-text">
                  {caseRecord.intake?.grade_level || 'Grade not entered'}
                  {caseRecord.intake?.impacted_party_age ? `, age ${caseRecord.intake.impacted_party_age}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold text-text-dim">IEP / 504</dt>
                <dd className="mt-1 text-text">{formatLabel(caseRecord.intake?.iep_504_status || 'not specified')}</dd>
              </div>
            </dl>
          </Panel>

          {canManageSupport ? (
          <Panel title="Support Options" eyebrow="Manual opt-in only">
            <p className="mb-4 max-w-3xl text-sm leading-relaxed text-text-dim">
              Default is no sharing. These preferences only allow USDWatch to manually review your case before any limited summary is shared with the support category you choose.
            </p>
            <div className="grid gap-3">
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.attorney_contact_opt_in} onChange={(event) => updateSupportField('attorney_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Attorney contact</strong><span className="block text-text-dim">I may want a qualified attorney to review whether this needs legal help.</span></span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.advocacy_contact_opt_in} onChange={(event) => updateSupportField('advocacy_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Advocacy or parent-group support</strong><span className="block text-text-dim">I may want help with meetings, records requests, or complaint options.</span></span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={supportForm.media_contact_opt_in} onChange={(event) => updateSupportField('media_contact_opt_in', event.target.checked)} />
                <span><strong className="text-text">Media interest</strong><span className="block text-text-dim">I may be open to a reporter if this appears to show a broader public problem.</span></span>
              </label>
              <label className="flex min-h-11 items-start gap-3 rounded-md border border-warning/30 bg-warning/8 p-3 text-sm text-text-dim">
                <input type="checkbox" className="mt-1" checked={supportForm.share_summary_consent} onChange={(event) => updateSupportField('share_summary_consent', event.target.checked)} />
                I consent to USDWatch manually reviewing and preparing a limited case summary for the support categories I selected.
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-text-dim">Best way to reach you</span>
                <input
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  value={supportForm.contact_preference}
                  onChange={(event) => updateSupportField('contact_preference', event.target.value)}
                  placeholder="Email after 5pm, text first, etc."
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-semibold text-text-dim">Sensitive details to protect</span>
                <input
                  className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                  value={supportForm.sensitivity_notes}
                  onChange={(event) => updateSupportField('sensitivity_notes', event.target.value)}
                  placeholder="No media contact, avoid names, etc."
                />
              </label>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <ActionButton
                disabled={savingSupport}
                onClick={handleSaveSupport}
                variant="primary"
                className="px-4"
              >
                Save Support Preferences
              </ActionButton>
              <ActionButton
                disabled={savingSupport}
                onClick={handleRevokeSupport}
                variant="danger"
                className="px-4"
              >
                Revoke Support Consent
              </ActionButton>
            </div>
          </Panel>
          ) : (
          <Panel title="Support Options" eyebrow="Owner-only">
            <p className="text-sm leading-relaxed text-text-dim">
              The case owner controls attorney, support, media, and consent preferences. Your {caseRoleLabel(access?.role).toLowerCase()} access does not include those settings.
            </p>
          </Panel>
          )}
        </main>
      </div>
    </div>
  );
}
