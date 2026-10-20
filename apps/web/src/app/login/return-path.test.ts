import { describe, expect, it } from 'vitest';
import { returnPathFrom, safeReturnPath, withReturnPath } from './return-path';

/**
 * Cổng chống chuyển hướng mở cho `/login?next=`. Mỗi ca bị từ chối dưới đây là
 * một hình dạng đã biết dùng để đưa người vừa nhập mật khẩu sang origin khác.
 */
describe('safeReturnPath', () => {
  it('nhận đường tương đối cùng origin, giữ query và hash', () => {
    expect(safeReturnPath('/labs/x')).toBe('/labs/x');
    expect(safeReturnPath('/paths/k8s?tab=2#ga-3')).toBe('/paths/k8s?tab=2#ga-3');
  });

  it('giải mã đúng một lần: đường đã mã hoá hợp lệ vẫn qua', () => {
    expect(safeReturnPath('%2Flabs%2Fx')).toBe('/labs/x');
  });

  // Next đã giải mã `next` một lần; giải thêm lần nữa làm hỏng bộ lọc trong query.
  it.each([
    ['/problems?query=a%26b', '/problems?query=a%26b'],
    ['/problems?query=%23x', '/problems?query=%23x'],
    ['/problems?query=c%2B%2B', '/problems?query=c%2B%2B'],
  ])('giữ nguyên query đã mã hoá: %j', (raw, expected) => {
    expect(safeReturnPath(raw)).toBe(expected);
  });

  it.each([
    ['//evil.com'],
    ['/\\evil'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    ['/%2F%2Fevil.com'],
    ['%2F%2Fevil.com'],
    ['/.//evil.com'],
    ['/\t/evil.com'],
    ['labs/x'],
    ['%E0%A4%A'],
    [''],
  ])('từ chối %j', (raw) => {
    expect(safeReturnPath(raw)).toBeNull();
  });

  it('từ chối màn xác thực và /api để không quay vòng', () => {
    expect(safeReturnPath('/login')).toBeNull();
    expect(safeReturnPath('/register?next=/me')).toBeNull();
    expect(safeReturnPath('/reset-password')).toBeNull();
    expect(safeReturnPath('/api/auth/get-session')).toBeNull();
    // Tiền tố phải khớp cả đoạn, không nuốt đường khác bắt đầu bằng cùng chữ.
    expect(safeReturnPath('/login-help')).toBe('/login-help');
  });

  it('null và undefined là "không có", không phải lỗi', () => {
    expect(safeReturnPath(null)).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });
});

describe('returnPathFrom', () => {
  it('callbackURL đi qua CÙNG một luật với next', () => {
    expect(returnPathFrom({ callbackURL: '/quiz/a' })).toBe('/quiz/a');
    expect(returnPathFrom({ callbackURL: 'https://evil.com' })).toBeNull();
  });

  it('next hợp lệ thắng; next hỏng thì xét tới callbackURL', () => {
    expect(returnPathFrom({ next: '/labs/x', callbackURL: '/quiz/a' })).toBe('/labs/x');
    expect(returnPathFrom({ next: '//evil.com', callbackURL: '/quiz/a' })).toBe('/quiz/a');
  });

  it('tham số lặp là mơ hồ nên bị bỏ', () => {
    expect(returnPathFrom({ next: ['/labs/x', '//evil.com'] })).toBeNull();
  });
});

describe('withReturnPath', () => {
  it('mang đích quay về sang màn xác thực kế bên', () => {
    expect(withReturnPath('/register', '/labs/x')).toBe('/register?next=%2Flabs%2Fx');
    expect(withReturnPath('/register', null)).toBe('/register');
  });
});
