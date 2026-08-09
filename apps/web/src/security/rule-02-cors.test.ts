import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { applyCorsHeaders, resolveAllowedOrigin } from '../server/security/cors';
import { proxy } from '../proxy';

/**
 * Luật 2 — CORS: allowlist từ env, KHÔNG reflect Origin lạ, KHÔNG credentials đi
 * cùng wildcard.
 *
 * Mức test: UNIT (hàm cors.ts thuần) + PROXY (gọi thẳng hàm `proxy`,
 * không dựng HTTP server thật — tương đương `curl` trong acceptance criteria).
 * Cần `CORS_ALLOWED_ORIGINS=http://localhost:3000` trong .env (đã có trong
 * apps/web/.env.example).
 */
describe('luật 2 — CORS allowlist', () => {
  it('origin nằm trong allowlist → được echo lại (không phải wildcard)', () => {
    expect(resolveAllowedOrigin('http://localhost:3000')).toBe('http://localhost:3000');
  });

  it('origin lạ → resolveAllowedOrigin trả null (không reflect)', () => {
    expect(resolveAllowedOrigin('https://evil.example')).toBeNull();
  });

  it('applyCorsHeaders với origin lạ → KHÔNG set Access-Control-Allow-Origin', () => {
    const headers = new Headers();
    applyCorsHeaders(headers, 'https://evil.example');
    expect(headers.get('access-control-allow-origin')).toBeNull();
    expect(headers.get('access-control-allow-credentials')).toBeNull();
  });

  it('applyCorsHeaders với origin hợp lệ → credentials true đi kèm origin CỤ THỂ, không phải *', () => {
    const headers = new Headers();
    applyCorsHeaders(headers, 'http://localhost:3000');
    expect(headers.get('access-control-allow-origin')).toBe('http://localhost:3000');
    expect(headers.get('access-control-allow-origin')).not.toBe('*');
    expect(headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('proxy: request Origin lạ tới /api/trpc/me.get → response không có ACAO khớp evil', () => {
    const request = new NextRequest('http://localhost:3000/api/trpc/me.get', {
      headers: { origin: 'https://evil.example' },
    });
    const response = proxy(request);
    expect(response.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  it('proxy: preflight OPTIONS từ origin lạ trên /api/* → không có ACAO', () => {
    const request = new NextRequest('http://localhost:3000/api/trpc/me.get', {
      method: 'OPTIONS',
      headers: { origin: 'https://evil.example' },
    });
    const response = proxy(request);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});
