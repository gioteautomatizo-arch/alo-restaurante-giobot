import assert from 'node:assert/strict';
import { INVITE_LIST_PAGE_SIZE, INVITE_LIST_MAX_PAGES, isValidInviteCursor, nextInviteCursor } from '../businessInvitePagination.ts';

assert.equal(INVITE_LIST_PAGE_SIZE, 150);
assert.equal(INVITE_LIST_MAX_PAGES, 50);
assert.equal(isValidInviteCursor('a'.repeat(64)), true);
assert.equal(isValidInviteCursor('legacy-Doc_123'), true);
for (const value of ['', '../other', 'x/y', 'x y', 'a'.repeat(129), 12, ['a']]) {
  assert.equal(isValidInviteCursor(value), false, 'cursor inválido: ' + String(value));
}
assert.equal(nextInviteCursor([]), null);
assert.equal(nextInviteCursor(Array.from({ length: 149 }, (_, i) => String(i))), null);
assert.equal(nextInviteCursor(Array.from({ length: 150 }, (_, i) => String(i))), '149');
assert.throws(() => nextInviteCursor(Array.from({ length: 151 }, (_, i) => String(i))), /demasiado grande/);
assert.throws(() => nextInviteCursor(Array.from({ length: 150 }, (_, i) => i === 149 ? 'x/y' : String(i))), /no válido/);
console.log('PASS: cursores de invitación válidos, páginas completas, rechazo de cursor malformado (sin Firebase).');
