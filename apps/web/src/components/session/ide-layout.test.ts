import { describe, expect, it } from 'vitest';
import { IDE_BOOT_TIMEOUT_MS, ideSessionUrl, shouldShowIdePane } from './ide-layout';

/**
 * Ô AC 13.D: *"Layout `ide` hiện đúng khi `interfaceLayout === 'ide'`, và
 * **không** hiện khi không có cờ."*
 *
 * Ô này có HAI vế và vế phủ định là vế thật sự bị bỏ quên: một hiện thực luôn
 * hiện khoang IDE vẫn "đúng" trên bài `ide` duy nhất mà ai đó mở để kiểm tay.
 */
describe('shouldShowIdePane', () => {
  it('KHÔNG hiện khi vắng cờ — vế phủ định của ô AC', () => {
    expect(shouldShowIdePane(null)).toBe(false);
    expect(shouldShowIdePane(undefined)).toBe(false);
    expect(shouldShowIdePane('')).toBe(false);
  });

  it('KHÔNG hiện với layout khác', () => {
    expect(shouldShowIdePane('split')).toBe(false);
    expect(shouldShowIdePane('terminal')).toBe(false);
  });

  it('hiện đúng khi cờ là "ide"', () => {
    expect(shouldShowIdePane('ide')).toBe(true);
  });

  it('KHÔNG khoan dung hoa/thường/khoảng trắng — phải trùng byte với server', () => {
    // `server/lessons/catalog.ts` so `interfaceLayout === 'ide'` để chọn profile
    // pod. Nới ở đây mà không nới ở đó ⇒ iframe trỏ vào pod KHÔNG có Theia và
    // người học nhìn một khoang trắng vĩnh viễn.
    expect(shouldShowIdePane('IDE')).toBe(false);
    expect(shouldShowIdePane(' ide')).toBe(false);
    expect(shouldShowIdePane('ide ')).toBe(false);
  });
});

describe('ideSessionUrl', () => {
  it('cùng origin, đúng dạng /ide/session/{id}/', () => {
    expect(ideSessionUrl('sess-123')).toBe('/ide/session/sess-123/');
  });

  it('escape id — id tới từ server nhưng URL này đi thẳng vào src của iframe', () => {
    expect(ideSessionUrl('a/../b')).toBe('/ide/session/a%2F..%2Fb/');
  });
});

describe('IDE_BOOT_TIMEOUT_MS', () => {
  it('dài hơn khởi động nguội đã đo (~20s) để không báo động giả', () => {
    expect(IDE_BOOT_TIMEOUT_MS).toBeGreaterThan(20_000);
    expect(IDE_BOOT_TIMEOUT_MS).toBeLessThanOrEqual(90_000);
  });
});
