import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  casePermissions,
  caseRoleHelp,
  caseRoleLabel,
  hasCasePermission,
  sharedAccessLabel,
} from './caseAccess.js';

describe('case access helpers', () => {
  it('defaults unknown access to no mutation permissions', () => {
    const permissions = casePermissions(null);

    assert.equal(permissions.can_view, false);
    assert.equal(permissions.can_edit, false);
    assert.equal(permissions.can_manage_sharing, false);
  });

  it('reads explicit permissions without inventing access', () => {
    const access = { role: 'viewer', permissions: { can_view: true, can_edit: false } };

    assert.equal(hasCasePermission(access, 'can_view'), true);
    assert.equal(hasCasePermission(access, 'can_edit'), false);
    assert.equal(sharedAccessLabel(access), 'Shared with you: Viewer');
  });

  it('keeps owner labels separate from shared collaborator labels', () => {
    assert.equal(caseRoleLabel('owner'), 'Owner');
    assert.equal(sharedAccessLabel({ role: 'owner' }), '');
    assert.match(caseRoleHelp('editor'), /cannot manage sharing/);
  });
});
