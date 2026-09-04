import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { applySecurityHeaders, buildCsp } from '../server/security/headers';
import { proxy } from '../proxy';

/**
 * Luật 9 — `curl -I` trang chính có đủ HSTS/CSP/X-Frame-Options/
 * X-Content-Type-Options/Referrer-Policy/Permissions-Policy.
 *
 * Mức test: UNIT (headers.ts thuần) + PROXY (gọi thẳng `proxy`, tương
 * đương `curl -I` trong acceptance criteria vì đây chính là code chạy cho MỌI
 * response, kể cả trang chính `/`).
 */
describe('luật 9 — security headers', () => {
  it('buildCsp chứa các directive khoá chặt: frame-ancestors none, object-src none', () => {
    const csp = buildCsp('test-nonce');
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain('test-nonce');
  });

  /**
   * D8 (phase-13) — `frame-src 'self'` tường minh cho iframe IDE cùng origin
   * (`/ide/session/{id}/`). Đối chứng dương thật (một iframe origin KHÁC bị
   * trình duyệt chặn) là việc của `csp.spec.ts` (Playwright, chạy trên cụm,
   * 13.H) — unit test này chỉ khẳng định directive có mặt trong chuỗi CSP.
   */
  it("buildCsp chứa frame-src 'self' — D8 (iframe IDE cùng origin)", () => {
    const csp = buildCsp('test-nonce');
    expect(csp).toContain("frame-src 'self'");
  });

  it('applySecurityHeaders set đủ 6 header bắt buộc', () => {
    const headers = new Headers();
    applySecurityHeaders(headers, 'test-nonce');

    expect(headers.get('Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(headers.get('Content-Security-Policy')).toContain('test-nonce');
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(headers.get('Referrer-Policy')).toBeTruthy();
    expect(headers.get('Permissions-Policy')).toBeTruthy();
  });

  it('proxy: GET / (trang chính) → response có đủ 6 header', () => {
    const request = new NextRequest('http://localhost:3000/');
    const response = proxy(request);

    for (const header of [
      'strict-transport-security',
      'content-security-policy',
      'x-frame-options',
      'x-content-type-options',
      'referrer-policy',
      'permissions-policy',
    ]) {
      expect(response.headers.get(header), `thiếu header ${header}`).toBeTruthy();
    }
  });
});
