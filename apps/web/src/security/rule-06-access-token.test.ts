import { describe, expect, it } from 'vitest';
import { mintAccessTokenFor } from '../server/auth/jwt';
import { ACCESS_TOKEN_TTL_SECONDS, ORCHESTRATOR_AUD } from '../server/auth/config';
import { uniqueId } from './test-helpers';

/**
 * Luật 6 — decode access token thấy `aud` đúng service, TTL ≤ 15 phút.
 *
 * Mức test: INTEGRATION — gọi thẳng `mintAccessTokenFor` (server/auth/jwt.ts), tức
 * `auth.api.signJWT` THẬT của Better Auth (ký + đọc/ghi bảng `jwks` trên Postgres
 * thật qua docker compose). Decode bằng tay (base64url, không verify chữ ký) vì
 * mục tiêu là kiểm CLAIM, không phải kiểm cơ chế ký.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  const payloadSegment = parts[1];
  if (parts.length !== 3 || payloadSegment === undefined) {
    throw new Error(`Không phải JWT hợp lệ (3 phần): ${token}`);
  }
  const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as Record<string, unknown>;
}

describe('luật 6 — access JWT: aud per-service + TTL ≤ 15m', () => {
  it('access token có đúng 3 phần (header.payload.signature)', async () => {
    const token = await mintAccessTokenFor(uniqueId('rule6-user'), 'user');
    expect(token.split('.')).toHaveLength(3);
  });

  it('aud khớp ORCHESTRATOR_AUD ("orchestrator")', async () => {
    const token = await mintAccessTokenFor(uniqueId('rule6-user'), 'user');
    const payload = decodeJwtPayload(token);
    expect(payload['aud']).toBe(ORCHESTRATOR_AUD);
    expect(ORCHESTRATOR_AUD).toBe('orchestrator');
  });

  it('TTL (exp - iat) ≤ 15 phút (900s), khớp ACCESS_TOKEN_TTL_SECONDS', async () => {
    const token = await mintAccessTokenFor(uniqueId('rule6-user'), 'user');
    const payload = decodeJwtPayload(token);
    const exp = payload['exp'] as number;
    const iat = payload['iat'] as number;

    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(900);
    expect(exp - iat).toBe(ACCESS_TOKEN_TTL_SECONDS);
    expect(exp - iat).toBeLessThanOrEqual(900);
  });

  it('sub + role đi theo đúng user được mint cho', async () => {
    const userId = uniqueId('rule6-user');
    const token = await mintAccessTokenFor(userId, 'admin');
    const payload = decodeJwtPayload(token);
    expect(payload['sub']).toBe(userId);
    expect(payload['role']).toBe('admin');
  });
});
