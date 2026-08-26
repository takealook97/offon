import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma, ensureSchema, resetDatabase, createMember } from '@/test/db';
import { resolveSessionMember } from './session';

/**
 * The session token is stateless and lives for 30 days, so whatever it claims about a person
 * is a snapshot of the moment they signed in. Everything that can change in the meantime —
 * being deactivated, being promoted, being demoted — has to be read back from the database,
 * or a revoked privilege stays usable for up to a month.
 *
 * These are the checks for that read-back. The cookie itself is not involved; the point is
 * that the token is not trusted for anything the database also knows.
 */

before(() => ensureSchema());
beforeEach(() => resetDatabase());
after(() => prisma.$disconnect());

test('an active member resolves to their stored role', async () => {
  // Arrange
  const member = await createMember();

  // Act
  const resolved = await resolveSessionMember({ memberId: member.id, role: 'EMPLOYEE' });

  // Assert
  assert.deepEqual(resolved, { memberId: member.id, role: 'EMPLOYEE' });
});

test('a demoted admin loses admin at once, even holding an admin token', async () => {
  // Arrange: they signed in as an admin, and were demoted afterwards.
  const member = await createMember();
  await prisma.member.update({ where: { id: member.id }, data: { role: 'EMPLOYEE' } });

  // Act
  const resolved = await resolveSessionMember({ memberId: member.id, role: 'ADMIN' });

  // Assert
  assert.equal(resolved?.role, 'EMPLOYEE', 'the stored role must win over the token');
});

test('a promoted member gains admin without signing in again', async () => {
  // Arrange
  const member = await createMember();
  await prisma.member.update({ where: { id: member.id }, data: { role: 'ADMIN' } });

  // Act
  const resolved = await resolveSessionMember({ memberId: member.id, role: 'EMPLOYEE' });

  // Assert
  assert.equal(resolved?.role, 'ADMIN');
});

test('a deactivated member resolves to nothing', async () => {
  // Arrange
  const member = await createMember();
  await prisma.member.update({ where: { id: member.id }, data: { deletedAt: new Date() } });

  // Act
  const resolved = await resolveSessionMember({ memberId: member.id, role: 'ADMIN' });

  // Assert
  assert.equal(resolved, null);
});

test('a token naming a member who never existed resolves to nothing', async () => {
  // Act
  const resolved = await resolveSessionMember({ memberId: 999_999, role: 'ADMIN' });

  // Assert
  assert.equal(resolved, null);
});
