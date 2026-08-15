import { describe, expect, it } from 'vitest';
import {
  MAX_BACKOFF_MS,
  backoffDelayMs,
  backoffDelayMsJittered,
  decideRetry,
} from './backoff.ts';
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

// AC-H6 (P3/3.H) — jitter được THÊM VÀO sau khi phép đo trên cụm bác bỏ tiền đề
// "không có đàn client nào cùng nối lại một lúc": rollout gateway đóng 14 phiên
// trong 7ms của nhau và bão nối-lại ăn 19 lượt 429 của biên.
describe('backoffDelayMsJittered — rải quanh cơ sở [0.5×base, 1.5×base]', () => {
  it('rand=0.5 trả ĐÚNG cơ sở — jitter không dịch kỳ vọng', () => {
    // Ô này là thứ giữ cho jitter không âm thầm kéo dài mọi lần nối lại: một
    // jitter chỉ-cộng-thêm sẽ qua mọi test "nằm trong khoảng" mà vẫn làm người
    // dùng chờ lâu hơn trung bình.
    for (const attempt of [1, 2, 3, 4, 5, 50]) {
      expect(backoffDelayMsJittered(attempt, () => 0.5)).toBe(backoffDelayMs(attempt));
    }
  });

  it('cận dưới = 0.5×base (rand=0) — backoff KHÔNG bị jitter xoá', () => {
    // Full jitter [0, base] cho phép thử lại gần như tức thì, tức đạp thẳng vào
    // đúng cái biên đang nghẽn. Cận dưới 0.5×base là thứ ngăn điều đó.
    expect(backoffDelayMsJittered(1, () => 0)).toBe(500);
    expect(backoffDelayMsJittered(4, () => 0)).toBe(4_000);
  });

  it('cận trên = 1.5×base nhưng KẸP ở MAX_BACKOFF_MS', () => {
    expect(backoffDelayMsJittered(1, () => 1)).toBe(1_500);
    expect(backoffDelayMsJittered(4, () => 1)).toBe(12_000);
    // attempt ≥ 5 ở trần 15s: 1.5×15s = 22.5s phải bị kẹp lại.
    expect(backoffDelayMsJittered(5, () => 1)).toBe(MAX_BACKOFF_MS);
    expect(backoffDelayMsJittered(50, () => 1)).toBe(MAX_BACKOFF_MS);
  });

  it('CÓ rải thật: 14 client cùng attempt KHÔNG cho cùng một mốc', () => {
    // Đây là ô đo đúng thứ jitter sinh ra để làm. Không có nó thì một bản cài
    // đặt trả hằng số vẫn qua mọi ô "nằm trong khoảng" ở trên.
    const delays = new Set(Array.from({ length: 14 }, () => backoffDelayMsJittered(1)));
    expect(delays.size).toBeGreaterThan(1);
  });

  it('mọi giá trị nằm trong [0.5×base, 1.5×base] với rand thật', () => {
    for (let i = 0; i < 500; i++) {
      const d = backoffDelayMsJittered(3);
      expect(d).toBeGreaterThanOrEqual(2_000);
      expect(d).toBeLessThanOrEqual(6_000);
    }
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
