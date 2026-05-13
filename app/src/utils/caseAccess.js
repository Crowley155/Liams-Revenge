export const DEFAULT_CASE_PERMISSIONS = Object.freeze({
  can_view: false,
  can_edit: false,
  can_upload_evidence: false,
  can_delete_evidence: false,
  can_run_case_read: false,
  can_manage_records: false,
  can_manage_sharing: false,
  can_manage_support: false,
  can_manage_gmail: false,
});

export function casePermissions(access) {
  return { ...DEFAULT_CASE_PERMISSIONS, ...(access?.permissions || {}) };
}

export function hasCasePermission(access, permission) {
  return Boolean(casePermissions(access)[permission]);
}

export function caseRoleLabel(role) {
  const labels = {
    owner: 'Owner',
    editor: 'Editor',
    viewer: 'Viewer',
  };
  return labels[role] || 'No access';
}

export function sharedAccessLabel(access) {
  if (!access?.role || access.role === 'owner') return '';
  return `Shared with you: ${caseRoleLabel(access.role)}`;
}

export function caseRoleHelp(role) {
  if (role === 'editor') return 'Can update the case file and evidence, but cannot manage sharing, Gmail, or support consent.';
  if (role === 'viewer') return 'Can read the case file, evidence, packets, and Case Reads without changing the case.';
  if (role === 'owner') return 'Full control of the case, sharing, evidence, and owner-only integrations.';
  return 'Ask the case owner for access.';
}
