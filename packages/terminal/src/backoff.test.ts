import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_MS, backoffDelayMs, decideRetry } from './backoff.ts';
import { CLOSE_ABNORMAL, CloseCode } from './protocol.ts';

describe('backoffDelayMs — F10 (1/2/4/8s, trần 15s)', () => {
  it.each([
    [1, 1_000],
    [2, 2_000],
    [3, 4_000],
    [4, 8_000],
    [5, MAX_BACKOFF_MS],
    [50, MAX_BACKOFF_MS],
  ])('lần %d → %dms', (attempt, expected) => {
    expect(backoffDelayMs(attempt)).toBe(expected);
  });

  it('attempt 0 hoặc âm không sinh 0ms (vòng lặp bận)', () => {
    expect(backoffDelayMs(0)).toBe(1_000);
    expect(backoffDelayMs(-3)).toBe(1_000);
  });
});

describe('decideRetry', () => {
  const NOW = 1_000_000;

  it('hết hạn thì KHÔNG retry, kể cả với mã vốn retry được', () => {
    // Ca chứng minh thứ tự hai phép kiểm. Đảo thứ tự (kiểm mã trước) làm ca này
    // ĐỎ, và hậu quả thật là client quay vòng 15s/lần đâm vào 404 cho tới khi
    // người dùng đóng tab.
    expect(
      decideRetry({ closeCode: CloseCode.INTERNAL, expiresAtMs: NOW - 1, nowMs: NOW }),
    ).toEqual({ retry: false, reason: 'expired' });
  });

  it('chưa hết hạn + mã retry được ⇒ retry', () => {
    expect(
      decideRetry({ closeCode: CloseCode.SERVICE_RESTART, expiresAtMs: NOW + 60_000, nowMs: NOW }),
    ).toEqual({ retry: true });
  });

  it('1006 ⇒ retry (mạng đứt là ca phổ biến hơn handshake bị từ chối)', () => {
    expect(
      decideRetry({ closeCode: CLOSE_ABNORMAL, expiresAtMs: null, nowMs: NOW }),
    ).toEqual({ retry: true });
  });

  it('4409 hard-cap ⇒ KHÔNG retry dù hạn còn', () => {
    // `expiresAt` vẫn ở tương lai lúc chạm trần cứng — nên nếu chỉ dựa vào hạn
    // thì client sẽ nối lại mãi vào một phiên không bao giờ mở lại được.
    expect(
      decideRetry({
        closeCode: CloseCode.HARD_CAP_REACHED,
        expiresAtMs: NOW + 60_000,
        nowMs: NOW,
      }),
    ).toEqual({ retry: false, reason: 'terminal-close-code' });
  });

  it.each([
    ['4401 hết hạn token', CloseCode.UNAUTHENTICATED],
    ['4403 authz lệch', CloseCode.FORBIDDEN],
    ['4404 session bị reap', CloseCode.SESSION_GONE],
    ['4429 rate limit', CloseCode.RATE_LIMITED],
    ['1000 shell thoát', CloseCode.NORMAL],
  ])('%s ⇒ KHÔNG retry', (_label, code) => {
    expect(
      decideRetry({ closeCode: code, expiresAtMs: NOW + 60_000, nowMs: NOW }),
    ).toMatchObject({ retry: false });
  });

  it('đúng mốc hết hạn (now == expiresAt) đã là hết hạn', () => {
    expect(
      decideRetry({ closeCode: CLOSE_ABNORMAL, expiresAtMs: NOW, nowMs: NOW }),
    ).toMatchObject({ retry: false, reason: 'expired' });
  });
});
