import { describe, expect, it } from 'vitest';
import { parseCssColor } from './palette';

/**
 * `parseCssColor` đọc biến `--l-*` đúng như trình duyệt trả về. Bản dev trả nguyên văn
 * `rgb(...)`; bản `next build` rút gọn thành mã thập lục phân. Cả hai dạng phải đọc được, còn dạng
 * lạ thì phải trả `null` (một màu đọc hỏng mà rơi về trắng là lỗi im lặng).
 */

describe('palette · parseCssColor nhận', () => {
  it.each([
    ['rgb(10, 13, 20)', [10, 13, 20]],
    ['rgb(10,13,20)', [10, 13, 20]],
    ['rgb(10 13 20)', [10, 13, 20]],
    ['rgb(10 13 20 / 0.5)', [10, 13, 20]],
    ['rgb(10 13 20 / 50%)', [10, 13, 20]],
    ['rgba(10, 13, 20, 0.5)', [10, 13, 20]],
    ['RGB(0, 0, 0)', [0, 0, 0]],
    ['rgb(255, 255, 255)', [255, 255, 255]],
    ['  rgb(10, 13, 20)  ', [10, 13, 20]],
  ] as const)('%s', (raw, expected) => {
    expect(parseCssColor(raw)).toEqual(expected);
  });

  it.each([
    ['#0a0d14', [10, 13, 20]],
    ['#0A0D14', [10, 13, 20]],
    ['#fff', [255, 255, 255]],
    ['#abc', [170, 187, 204]],
    ['#000000', [0, 0, 0]],
    [' #e31e24 ', [227, 30, 36]],
  ] as const)('hex do bộ tối ưu CSS sinh ra: %s', (raw, expected) => {
    expect(parseCssColor(raw)).toEqual(expected);
  });

  it('hex 3 chữ số và 6 chữ số tương đương cho cùng màu', () => {
    expect(parseCssColor('#f0a')).toEqual(parseCssColor('#ff00aa'));
  });
});

describe('palette · parseCssColor từ chối (trả null)', () => {
  it.each([
    'oklch(0.2 0.02 260)',
    'hsl(220 30% 10%)',
    'red',
    'transparent',
    'currentColor',
    'rgb(256, 0, 0)',
    'rgb(0, 300, 0)',
    'rgb(1000, 0, 0)',
    'rgb(-1, 0, 0)',
    'rgb(10%, 20%, 30%)',
    'rgb(10, 13)',
    '#abcd',
    '#12345',
    '#gggggg',
    '0a0d14',
    '',
    '   ',
  ])('%s', (raw) => {
    expect(parseCssColor(raw)).toBeNull();
  });
});
