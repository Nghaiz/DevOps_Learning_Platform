import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { authRefreshTokens, sessions, users } from '../db/schema';
import { closeTestDb, testDb, uniqueId } from '../../security/test-helpers';
import {
  issueRefreshToken,
  issueRefreshTokenForSession,
  revokeUserCredentials,
  rotateRefreshToken,
} from './tokens';

function barrier() {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release };
}

/** Keep every SQL operation real, but pause exactly before the chosen write. */
function pausedDatabase(
  method: 'insert' | 'delete',
  entered: ReturnType<typeof barrier>,
  resume: ReturnType<typeof barrier>,
): Database {
  const db = testDb();
  return new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'transaction') return Reflect.get(target, property, receiver);
      return (work: Parameters<Database['transaction']>[0]) =>
        db.transaction((tx) =>
          work(
            new Proxy(tx, {
              get(transaction, key, transactionReceiver) {
                if (key !== method) return Reflect.get(transaction, key, transactionReceiver);
                if (method === 'insert') {
                  return (table: typeof authRefreshTokens) => {
                    const query = transaction.insert(table);
                    return new Proxy(query, {
                      get(builder, step, builderReceiver) {
                        if (step !== 'values') return Reflect.get(builder, step, builderReceiver);
                        return async (values: Parameters<typeof query.values>[0]) => {
                          entered.release();
                          await resume.ready;
                          return builder.values(values);
                        };
                      },
                    });
                  };
                }
                return (table: typeof sessions) => {
                  const query = transaction.delete(table);
                  return new Proxy(query, {
                    get(builder, step, builderReceiver) {
                      if (step !== 'where') return Reflect.get(builder, step, builderReceiver);
                      return async (predicate: Parameters<typeof query.where>[0]) => {
                        entered.release();
                        await resume.ready;
                        return builder.where(predicate);
                      };
                    },
                  });
                };
              },
            }),
          ),
        );
    },
  });
}

async function seedSession() {
  const id = uniqueId('refresh-race');
  await testDb()
    .insert(users)
    .values({ id, name: 'Refresh race', email: `${id}@example.test` });
  await testDb()
    .insert(sessions)
    .values({ id, userId: id, token: id, expiresAt: new Date(Date.now() + 60_000) });
  return id;
}

describe('credential reset versus in-flight refresh on PostgreSQL', () => {
  afterAll(closeTestDb);

  it('reset waits for a claimed rotation and revokes its newly inserted successor', async () => {
    const userId = await seedSession();
    const token = await issueRefreshToken(testDb(), userId);
    const entered = barrier();
    const resume = barrier();
    const rotation = rotateRefreshToken(pausedDatabase('insert', entered, resume), token.raw);
    await entered.ready;
    const reset = revokeUserCredentials(testDb(), userId);
    try {
      // Reset must not finish between the rotation's claim and successor insertion.
      expect(
        await Promise.race([
          reset.then(() => 'completed'),
          new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 100)),
        ]),
      ).toBe('waiting');
    } finally {
      resume.release();
    }
    const [outcome] = await Promise.all([rotation, reset]);
    expect(outcome.ok).toBe(true);
    if (outcome.ok)
      expect(await rotateRefreshToken(testDb(), outcome.token.raw)).toEqual({
        ok: false,
        reason: 'revoked',
      });
    expect(
      await testDb()
        .select()
        .from(authRefreshTokens)
        .where(and(eq(authRefreshTokens.userId, userId), isNull(authRefreshTokens.revokedAt))),
    ).toHaveLength(0);
    await testDb().delete(users).where(eq(users.id, userId));
  });

  it('bootstrap rechecks a session invalidated while it waits for reset', async () => {
    const userId = await seedSession();
    const entered = barrier();
    const resume = barrier();
    const reset = revokeUserCredentials(pausedDatabase('delete', entered, resume), userId);
    await entered.ready;
    const bootstrap = issueRefreshTokenForSession(testDb(), userId, userId);
    try {
      expect(
        await Promise.race([
          bootstrap.then(() => 'completed'),
          new Promise<string>((resolve) => setTimeout(() => resolve('waiting'), 100)),
        ]),
      ).toBe('waiting');
    } finally {
      resume.release();
    }
    const [, result] = await Promise.all([reset, bootstrap]);
    expect(result).toBeNull();
    expect(
      await testDb().select().from(authRefreshTokens).where(eq(authRefreshTokens.userId, userId)),
    ).toHaveLength(0);
    await testDb().delete(users).where(eq(users.id, userId));
  });
});
