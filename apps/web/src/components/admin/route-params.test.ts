import { describe, expect, it } from 'vitest';
import { isUuid } from './route-params';

describe('isUuid', () => {
  it('nhận uuid thường và viết hoa', () => {
    expect(isUuid('11111111-2222-4333-8444-555555555555')).toBe(true);
    expect(isUuid('ABCDEF01-2222-4333-8444-555555555555')).toBe(true);
  });

  it.each(['', 'abc', '11111111-2222-4333-8444-55555555555', '11111111222243338444555555555555', ' 11111111-2222-4333-8444-555555555555'])(
    'từ chối %o',
    (value) => {
      expect(isUuid(value)).toBe(false);
    },
  );
});
