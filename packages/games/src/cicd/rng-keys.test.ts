import { describe, expect, it } from 'vitest';

import type { FlakeDrawKey } from './contract.ts';
import { drawKeyString, hashDrawKey, rngForDraw, rollsForKey } from './rng-keys.ts';

const khoa = (extra: Partial<FlakeDrawKey> = {}): FlakeDrawKey => ({
  pass: 0,
  commitId: 'c1',
  instance: 'build',
  attempt: 0,
  draw: 'flake',
  ...extra,
});

describe('chuỗi khoá', () => {
  it('nối đủ năm trường của khoá cộng với hạt giống gốc', () => {
    expect(drawKeyString(42, khoa())).toBe('42|0|c1|build|0|flake');
  });

  it('phân biệt hai lần rút khác nhau của CÙNG một lần thử', () => {
    expect(drawKeyString(42, khoa({ draw: 'flake' }))).not.toBe(
      drawKeyString(42, khoa({ draw: 'duration' })),
    );
  });

  it('không có hai khoá khác nhau nối ra cùng một chuỗi', () => {
    // Đối chứng cho lựa chọn dấu `|`: `InstanceKey` chứa `#` và `/`, và nếu dùng
    // một trong hai làm dấu phân tách thì hai khoá dưới đây trùng chuỗi.
    const cac: readonly FlakeDrawKey[] = [
      khoa({ instance: 'test#node20' }),
      khoa({ instance: 'test', commitId: 'c1#node20' }),
      khoa({ instance: 'test#node20/ubuntu' }),
      khoa({ attempt: 1 }),
      khoa({ pass: 1 }),
    ];
    const chuoi = cac.map((k) => drawKeyString(7, k));
    expect(new Set(chuoi).size).toBe(chuoi.length);
  });
});

describe('băm và dòng số', () => {
  it('băm tất định và nằm trong uint32', () => {
    const lan1 = hashDrawKey('7|0|c1|build|0|flake');
    const lan2 = hashDrawKey('7|0|c1|build|0|flake');
    expect(lan1).toBe(lan2);
    expect(Number.isInteger(lan1)).toBe(true);
    expect(lan1).toBeGreaterThanOrEqual(0);
    expect(lan1).toBeLessThan(2 ** 32);
  });

  it('cùng khoá ⇒ cùng trạng thái RNG', () => {
    expect(rngForDraw(9, khoa())).toEqual(rngForDraw(9, khoa()));
  });

  it('đổi hạt giống gốc ⇒ đổi dòng số', () => {
    expect(rollsForKey(1, khoa(), 4)).not.toEqual(rollsForKey(2, khoa(), 4));
  });

  it('mọi số nằm trong [0, 1) và lặp lại được', () => {
    const lan1 = rollsForKey(5, khoa(), 8);
    const lan2 = rollsForKey(5, khoa(), 8);
    expect(lan1).toEqual(lan2);
    expect(lan1).toHaveLength(8);
    for (const so of lan1) {
      expect(so).toBeGreaterThanOrEqual(0);
      expect(so).toBeLessThan(1);
    }
  });

  it('số thứ i KHÔNG đổi khi rút nhiều hơn — chỉ số bước chọn vị trí trong dòng', () => {
    // Đây là thứ cho phép engine rút trọn mảng cho mọi bước đã khai TRƯỚC khi
    // chạy bước nào: một stage gãy sớm vẫn để bước sau nhận đúng con số của nó.
    const ngan = rollsForKey(11, khoa(), 3);
    const dai = rollsForKey(11, khoa(), 9);
    expect(dai.slice(0, 3)).toEqual(ngan);
  });

  it('số lượng không hợp lệ trả mảng rỗng thay vì ném', () => {
    expect(rollsForKey(1, khoa(), 0)).toEqual([]);
    expect(rollsForKey(1, khoa(), -3)).toEqual([]);
    expect(rollsForKey(1, khoa(), Number.NaN)).toEqual([]);
  });
});
