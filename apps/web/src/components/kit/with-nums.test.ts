import { describe, expect, it } from 'vitest';
import { t } from '@devops-platform/copy';
import { numSlot, splitSlots } from './with-nums';

describe('splitSlots', () => {
  it('tách câu thành chữ và chỗ giữ, đúng thứ tự', () => {
    const text = `${numSlot(0)} phiên, còn ${numSlot(1)}/${numSlot(2)} chỗ.`;
    expect(splitSlots(text)).toEqual([
      { slot: 0 },
      ' phiên, còn ',
      { slot: 1 },
      '/',
      { slot: 2 },
      ' chỗ.',
    ]);
  });

  it('câu không có chỗ giữ trả về nguyên câu', () => {
    expect(splitSlots('Không có số nào.')).toEqual(['Không có số nào.']);
  });

  it('chỗ giữ số hai chữ số', () => {
    expect(splitSlots(numSlot(12))).toEqual([{ slot: 12 }]);
  });

  /**
   * Đối chứng với câu THẬT của bản đồ chữ: trật tự từ nằm ở copy, và đổi câu
   * ở đó phải không làm rơi chỗ giữ nào.
   */
  it('câu bảng trạng thái của /admin giữ đủ ba chỗ số', () => {
    const text = t('admin.overview.board-load', {
      running: numSlot(0),
      free: numSlot(1),
      total: numSlot(2),
    });
    const slots = splitSlots(text).filter((part) => typeof part !== 'string');
    expect(slots).toEqual([{ slot: 0 }, { slot: 1 }, { slot: 2 }]);
  });
});
