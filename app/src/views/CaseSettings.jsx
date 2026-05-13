import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, MailPlus, ShieldCheck, Trash2, Users } from 'lucide-react';
import {
  fetchCase,
  fetchCaseAccess,
  fetchCaseShares,
  grantCaseCollaborator,
  revokeCaseShare,
  updateCaseShareRole,
  updateSupportConsent,
} from '../api/client';
import { casePermissions, caseRoleHelp, caseRoleLabel, sharedAccessLabel } from '../utils/caseAccess';
import { ActionButton, EMPTY_SUPPORT, Panel } from './caseShared';

const SHARE_ROLE_OPTIONS = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
];

function AccessSummaryPanel({ access }) {
  const accessLabel = sharedAccessLabel(access);
  if (!accessLabel) return null;
  return (
    <Panel title="Your Access">
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
  collaboratorEmail,
  collaboratorRole,
  sharingBusy,
  sharingNotice,
  onCollaboratorEmailChange,
  onCollaboratorRoleChange,
  onGrant,
  onUpdateRole,
  onRevokeGrant,
}) {
  const collaborators = shares?.collaborators || [];

  return (
    <Panel title="Sharing">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="max-w-2xl text-sm leading-relaxed text-text-dim">
            Add someone by email. If they create a USDWatch account with that email, this case will be available to them automatically.
          </p>
          <form onSubmit={onGrant} className="mt-4 grid gap-3">
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-text-dim">Email address</span>
              <input
                type="email"
                required
                value={collaboratorEmail}
                onChange={(event) => onCollaboratorEmailChange(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
                placeholder="helper@example.com"
              />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-text-dim">Access level</span>
              <select
                value={collaboratorRole}
                onChange={(event) => onCollaboratorRoleChange(event.target.value)}
                className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-text outline-none transition-colors focus:border-accent focus-visible:ring-2 focus-visible:ring-accent/45"
              >
                {SHARE_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              <span className="block text-xs leading-relaxed text-text-dim">{caseRoleHelp(collaboratorRole)}</span>
            </label>
            <ActionButton type="submit" disabled={sharingBusy} variant="primary" className="w-full">
              {sharingBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <MailPlus className="h-4 w-4" aria-hidden="true" />}
              Add collaborator
            </ActionButton>
          </form>
          {sharingNotice && (
            <p className={`mt-3 rounded-md border px-3 py-2 text-sm ${sharingNotice.type === 'error' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-success/30 bg-success/8 text-success'}`}>
              {sharingNotice.message}
            </p>
          )}
        </div>

        <div className="min-w-0">
          <section className="min-w-0 rounded-md border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-text-dim" aria-hidden="true" />
              <h4 className="text-sm font-bold text-text">Current collaborators</h4>
            </div>
            <div className="mt-3 space-y-2">
              {!collaborators.length && <p className="text-sm text-text-dim">No one else has access to this case yet.</p>}
              {collaborators.map((grant) => (
                <article key={grant.id} className="flex min-w-0 flex-col gap-3 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="wrap-anywhere text-sm font-semibold text-text">{grant.email || 'Collaborator'}</p>
                    <p className="mt-1 text-xs text-text-dim">{caseRoleLabel(grant.role)}</p>
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
        </div>
      </div>
    </Panel>
  );
}

function SupportOptionsPanel({
  supportForm,
  savingSupport,
  onUpdateField,
  onSave,
  onClear,
}) {
  return (
    <Panel title="Support Options">
      <p className="mb-4 max-w-3xl text-sm leading-relaxed text-text-dim">
        Choose who USDWatch may contact about this case if you want help outside the app.
      </p>
      <div className="grid gap-3">
        <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={supportForm.attorney_contact_opt_in} onChange={(event) => onUpdateField('attorney_contact_opt_in', event.target.checked)} />
          <span><strong className="text-text">Attorney contact</strong><span className="block text-text-dim">I may want an attorney to review this case.</span></span>
        </label>
        <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={supportForm.advocacy_contact_opt_in} onChange={(event) => onUpdateField('advocacy_contact_opt_in', event.target.checked)} />
          <span><strong className="text-text">Advocacy or parent-group support</strong><span className="block text-text-dim">I may want help preparing for meetings, records requests, or complaint options.</span></span>
        </label>
        <label className="flex min-h-11 items-start gap-3 rounded-md border border-border bg-background p-3 text-sm">
          <input type="checkbox" className="mt-1" checked={supportForm.media_contact_opt_in} onChange={(event) => onUpdateField('media_contact_opt_in', event.target.checked)} />
          <span><strong className="text-text">Media interest</strong><span className="block text-text-dim">I may be open to a reporter if this shows a broader public problem.</span></span>
        </label>
        <label className="flex min-h-11 items-start gap-3 rounded-md border border-warning/35 bg-warning/8 p-3 text-sm text-text">
          <input type="checkbox" className="mt-1" checked={supportForm.share_summary_consent} onChange={(event) => onUpdateField('share_summary_consent', event.target.checked)} />
          I give USDWatch permission to prepare and share a limited case summary with the support contacts I selected.
        </label>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="block space-y-2">
          <span className="text-xs font-semibold text-text-dim">Best way to reach you</span>
          <input
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            value={supportForm.contact_preference}
            onChange={(event) => onUpdateField('contact_preference', event.target.value)}
            placeholder="Email after 5pm, text first, etc."
          />
        </label>
        <label className="block space-y-2">
          <span className="text-xs font-semibold text-text-dim">Sensitive details to protect</span>
          <input
            className="min-h-11 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
            value={supportForm.sensitivity_notes}
            onChange={(event) => onUpdateField('sensitivity_notes', event.target.value)}
            placeholder="No media contact, avoid names, etc."
          />
        </label>
      </div>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <ActionButton disabled={savingSupport} onClick={onSave} variant="primary" className="px-4">
          Save Support Options
        </ActionButton>
        <ActionButton disabled={savingSupport} onClick={onClear} variant="danger" className="px-4">
          Clear Support Options
        </ActionButton>
      </div>
    </Panel>
  );
}

export default function CaseSettings() {
  const { caseId } = useParams();
  const [caseRecord, setCaseRecord] = useState(null);
  const [access, setAccess] = useState(null);
  const [shares, setShares] = useState(null);
  const [supportForm, setSupportForm] = useState(EMPTY_SUPPORT);
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [collaboratorRole, setCollaboratorRole] = useState('viewer');
  const [sharingBusy, setSharingBusy] = useState(false);
  const [sharingNotice, setSharingNotice] = useState(null);
  const [savingSupport, setSavingSupport] = useState(false);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setError('');
    try {
      const [nextCase, nextAccess] = await Promise.all([
        fetchCase(caseId),
        fetchCaseAccess(caseId).catch(() => null),
      ]);
      const permissions = casePermissions(nextAccess);
      const nextShares = permissions.can_manage_sharing
        ? await fetchCaseShares(caseId).catch(() => null)
        : null;
      setCaseRecord(nextCase);
      setAccess(nextAccess);
      setShares(nextShares);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to load settings');
    }
  }, [caseId]);

  useEffect(() => {
    let cancelled = false;
    loadSettings().catch((err) => {
      if (!cancelled) setError(err.message || 'Failed to load settings');
    });
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  const permissions = useMemo(() => casePermissions(access), [access]);
  const canManageSharing = permissions.can_manage_sharing;
  const canManageSupport = permissions.can_manage_support;
  const anySupport = supportForm.attorney_contact_opt_in || supportForm.advocacy_contact_opt_in || supportForm.media_contact_opt_in;

  const reloadShares = useCallback(async () => {
    try {
      setShares(await fetchCaseShares(caseId));
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Failed to refresh sharing.' });
    }
  }, [caseId]);

  const updateSupportField = (field, value) => {
    setSupportForm((current) => ({ ...current, [field]: value }));
  };

  const handleGrantCollaborator = async (event) => {
    event.preventDefault();
    if (!canManageSharing) return;
    setSharingBusy(true);
    setSharingNotice(null);
    try {
      await grantCaseCollaborator(caseId, { email: collaboratorEmail, role: collaboratorRole });
      setCollaboratorEmail('');
      setSharingNotice({ type: 'success', message: 'Collaborator access added.' });
      await reloadShares();
    } catch (err) {
      setSharingNotice({ type: 'error', message: err.message || 'Could not add collaborator.' });
    } finally {
      setSharingBusy(false);
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
      setError(err.message || 'Failed to save support options');
    } finally {
      setSavingSupport(false);
    }
  };

  const handleClearSupport = async () => {
    if (!canManageSupport) return;
    setSavingSupport(true);
    setError('');
    try {
      const nextCase = await updateSupportConsent(caseId, EMPTY_SUPPORT);
      setCaseRecord(nextCase);
      setSupportForm({ ...EMPTY_SUPPORT, ...(nextCase.support_consent || {}) });
    } catch (err) {
      setError(err.message || 'Failed to clear support options');
    } finally {
      setSavingSupport(false);
    }
  };

  if (error && !caseRecord) {
    return <div className="mx-auto max-w-3xl py-10 text-sm text-danger">{error}</div>;
  }

  if (!caseRecord) {
    return <div className="grid min-h-[40vh] place-items-center text-sm text-text-dim">Loading settings...</div>;
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 py-8 animate-fade-up">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="max-w-2xl text-sm leading-relaxed text-text-dim">
          Manage access and support preferences for this case.
        </p>
      </div>

      {error && <p className="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}

      <AccessSummaryPanel access={access} />

      {canManageSharing ? (
        <CaseSharingPanel
          shares={shares}
          collaboratorEmail={collaboratorEmail}
          collaboratorRole={collaboratorRole}
          sharingBusy={sharingBusy}
          sharingNotice={sharingNotice}
          onCollaboratorEmailChange={setCollaboratorEmail}
          onCollaboratorRoleChange={setCollaboratorRole}
          onGrant={handleGrantCollaborator}
          onUpdateRole={handleUpdateShareRole}
          onRevokeGrant={handleRevokeGrant}
        />
      ) : (
        <Panel title="Sharing">
          <p className="text-sm leading-relaxed text-text-dim">
            Only the case owner can add or remove collaborators.
          </p>
        </Panel>
      )}

      {canManageSupport ? (
        <SupportOptionsPanel
          supportForm={supportForm}
          savingSupport={savingSupport}
          onUpdateField={updateSupportField}
          onSave={handleSaveSupport}
          onClear={handleClearSupport}
        />
      ) : (
        <Panel title="Support Options">
          <p className="text-sm leading-relaxed text-text-dim">
            Only the case owner can change support options.
          </p>
        </Panel>
      )}
    </div>
  );
}
