import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { exceedsBodyLimit, MAX_JSON_BODY_BYTES } from '../server/security/body-limit';
import { checkRateLimit, RATE_LIMIT_MAX_REQUESTS, resetRateLimitState } from '../server/security/rate-limit';
import { proxy } from '../proxy';

/**
 * Luật 5 — body > cap → 413; > N req/s → 429.
 *
 * Mức test: UNIT (hàm thuần) + MIDDLEWARE (gọi thẳng `middleware`, không dựng HTTP
 * server thật). Rate limit hiện tại là in-memory/per-process (ghi rõ trong
 * rate-limit.ts) — test dùng key IP riêng cho mỗi case để không đụng state nhau.
 *
 * XFF chỉ được tin khi RATE_LIMIT_TRUST_PROXY=1 (middleware.ts clientKey) — các
 * test middleware-429 bật flag đó tường minh; test "không tin XFF" giữ flag tắt.
 */
describe('luật 5 — body cap + rate limit', () => {
  beforeEach(() => {
    resetRateLimitState();
  });

  afterEach(() => {
    delete process.env['RATE_LIMIT_TRUST_PROXY'];
  });

  it('exceedsBodyLimit: dưới cap → false', () => {
    expect(exceedsBodyLimit(String(MAX_JSON_BODY_BYTES - 1))).toBe(false);
  });

  it('exceedsBodyLimit: đúng cap → false (cap là "≤", không phải "<")', () => {
    expect(exceedsBodyLimit(String(MAX_JSON_BODY_BYTES))).toBe(false);
  });

  it('exceedsBodyLimit: vượt cap → true', () => {
    expect(exceedsBodyLimit(String(MAX_JSON_BODY_BYTES + 1))).toBe(true);
  });

  it('exceedsBodyLimit: không có Content-Length → false (không tự chặn nhầm)', () => {
    expect(exceedsBodyLimit(null)).toBe(false);
  });

  it('middleware: request có Content-Length > cap → 413', () => {
    const request = new NextRequest('http://localhost:3000/api/trpc/session.create', {
      method: 'POST',
      headers: { 'content-length': String(MAX_JSON_BODY_BYTES + 1024) },
    });
    const response = proxy(request);
    expect(response.status).toBe(413);
  });

  it('checkRateLimit: cho phép tới đúng maxRequests, chặn request kế tiếp', () => {
    const key = 'unit-test-ip';
    const windowMs = 60_000;
    const max = 5;

    for (let i = 0; i < max; i += 1) {
      expect(checkRateLimit(key, Date.now(), windowMs, max)).toBe(true);
    }
    expect(checkRateLimit(key, Date.now(), windowMs, max)).toBe(false);
  });

  it('checkRateLimit: cửa sổ mới (sau resetAt) → hạn mức được cấp lại', () => {
    const key = 'unit-test-ip-window';
    const windowMs = 1000;
    const max = 2;
    const start = Date.now();

    expect(checkRateLimit(key, start, windowMs, max)).toBe(true);
    expect(checkRateLimit(key, start, windowMs, max)).toBe(true);
    expect(checkRateLimit(key, start, windowMs, max)).toBe(false);
    // Qua cửa sổ kế tiếp — không còn bị chặn bởi state cũ.
    expect(checkRateLimit(key, start + windowMs + 1, windowMs, max)).toBe(true);
  });

  it('middleware (sau proxy tin cậy): vượt RATE_LIMIT_MAX_REQUESTS từ cùng IP trong cùng cửa sổ → 429', () => {
    process.env['RATE_LIMIT_TRUST_PROXY'] = '1';
    const ip = '203.0.113.1'; // TEST-NET-3 (RFC 5737) — không phải IP thật.
    const makeRequest = () =>
      new NextRequest('http://localhost:3000/', { headers: { 'x-forwarded-for': ip } });

    // RATE_LIMIT_MAX_REQUESTS request đầu phải qua được middleware — chỉ assert
    // request áp chót thay vì lặp in cả N lần response để test chạy nhanh.
    let last = proxy(makeRequest());
    for (let i = 1; i < RATE_LIMIT_MAX_REQUESTS; i += 1) {
      last = proxy(makeRequest());
    }
    expect(last.status).not.toBe(429);

    const blocked = proxy(makeRequest());
    expect(blocked.status).toBe(429);
  });

  it('middleware (KHÔNG có proxy tin cậy): XFF bị BỎ QUA — không bucket chung, không ai bị khoá oan', () => {
    // Trước fix: fallback 'unknown' gộp mọi client không XFF vào MỘT bucket —
    // một client spam đủ 120 request là khoá sạch user thật (self-DoS). Giờ
    // không định danh được thì SKIP limit: cả N+1 request đều qua.
    const makeRequest = () => new NextRequest('http://localhost:3000/');
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS + 1; i += 1) {
      expect(proxy(makeRequest()).status).not.toBe(429);
    }
  });

  it('middleware (KHÔNG có proxy tin cậy): XFF giả cũng không tạo được bucket — né-limit bằng XFF xoay vòng là vô nghĩa', () => {
    // Attacker gửi XFF ngẫu nhiên mỗi request để "làm mới" bucket: khi không tin
    // proxy, header đó bị lờ hẳn — không skip limit CHO RIÊNG attacker cũng không
    // cho attacker thao túng key của người khác.
    const makeRequest = (fakeIp: string) =>
      new NextRequest('http://localhost:3000/', { headers: { 'x-forwarded-for': fakeIp } });
    for (let i = 0; i < 5; i += 1) {
      expect(proxy(makeRequest(`198.51.100.${i}`)).status).not.toBe(429);
    }
  });

  it('middleware: response 413 vẫn mang đủ security header (luật 9 trên early-return)', () => {
    const request = new NextRequest('http://localhost:3000/api/trpc/session.create', {
      method: 'POST',
      headers: { 'content-length': String(MAX_JSON_BODY_BYTES + 1024) },
    });
    const response = proxy(request);
    expect(response.status).toBe(413);
    expect(response.headers.get('x-frame-options')).toBe('DENY');
    expect(response.headers.get('strict-transport-security')).not.toBeNull();
  });
});
