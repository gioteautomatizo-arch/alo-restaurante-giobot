import assert from 'node:assert/strict';
import {
  hasValidInviterId, INVITE_EXPIRES_IN_MS, isPendingInviteWithinWindow,
} from '../businessInviteIntegrity.ts';

// Prueba pura y determinista: sin Firebase, credenciales ni datos reales.
const now = 1_800_000_000_000;
const valid = {
  status: 'PENDING', createdAt: now - 1_000,
  expiresAt: now - 1_000 + INVITE_EXPIRES_IN_MS,
};
assert.equal(isPendingInviteWithinWindow(valid, now), true);
assert.equal(isPendingInviteWithinWindow(undefined, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, status: 'ACCEPTED' }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: now }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: undefined }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: 'sin-fecha' }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: String(valid.expiresAt) }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: NaN }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: Infinity }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, createdAt: undefined }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, createdAt: 'sin-fecha' }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, createdAt: now + 1 }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, createdAt: 0 }, now), false);
assert.equal(isPendingInviteWithinWindow({ ...valid, expiresAt: valid.createdAt - 1 }, now), false);
assert.equal(isPendingInviteWithinWindow({
  ...valid, expiresAt: valid.createdAt + INVITE_EXPIRES_IN_MS + 1,
}, now), false);
assert.equal(isPendingInviteWithinWindow({
  ...valid, expiresAt: valid.createdAt + INVITE_EXPIRES_IN_MS,
}, now), true);
assert.equal(hasValidInviterId('owner-uid-123'), true);
assert.equal(hasValidInviterId(undefined), false);
assert.equal(hasValidInviterId(''), false);
assert.equal(hasValidInviterId('tenant/foreign'), false);
assert.equal(hasValidInviterId('x'.repeat(129)), false);
console.log('PASS: strict pending invite expiry, creation window and inviter identity (offline).');
