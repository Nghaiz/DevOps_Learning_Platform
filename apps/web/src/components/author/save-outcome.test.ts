import { describe, expect, it } from 'vitest';
import { renderCopy } from '@devops-platform/copy';
import { describeSaveOutcome } from './save-outcome';

/**
 * `title` và `detail` nay là `CopyRef` chứ không phải câu (P16 / 16.G), nên mọi
 * khẳng định về CHỮ dựng câu trước rồi mới so. Không khẳng định nào mất đi.
 */
const say = renderCopy;

describe('describeSaveOutcome — sửa bản nháp thường', () => {
  it('báo thành công, không nói gì thêm', () => {
    const outcome = describeSaveOutcome({ id: 'dlp-bai-mot', supersedes: null }, 'dlp-bai-mot');
    expect(outcome.tone).toBe('success');
    expect(say(outcome.title)).toBe('Đã lưu bản nháp');
    expect(outcome.detail).toBeNull();
    expect(outcome.navigate).toBe(false);
    expect(outcome.editId).toBe('dlp-bai-mot');
  });
});

describe('describeSaveOutcome — sửa bài ĐÃ XUẤT BẢN thì server tách bản nháp kế nhiệm', () => {
  const outcome = describeSaveOutcome(
    { id: 'dlp-bai-mot__draft', supersedes: 'dlp-bai-mot' },
    'dlp-bai-mot',
  );

  it('KHÔNG được báo như một lượt lưu bình thường', () => {
    expect(outcome.tone).not.toBe('success');
    expect(outcome.tone).toBe('warning');
  });

  it('nói rõ bài đang chạy chưa đổi — đây là thứ người soạn sẽ hiểu sai nếu ta im', () => {
    expect(say(outcome.title)).toContain('CHƯA đổi');
    expect(outcome.detail).not.toBeNull();
    const detail = say(outcome.detail as NonNullable<typeof outcome.detail>);
    expect(detail).toContain('dlp-bai-mot');
    expect(detail).toContain('dlp-bai-mot__draft');
    expect(detail).toContain('Xuất bản');
  });

  it('chỉ đường sang bản nháp mới, và đòi điều hướng vì id đã đổi', () => {
    expect(outcome.editId).toBe('dlp-bai-mot__draft');
    expect(outcome.navigate).toBe(true);
  });

  it('sửa tiếp CHÍNH bản nháp kế nhiệm thì không điều hướng nữa', () => {
    const again = describeSaveOutcome(
      { id: 'dlp-bai-mot__draft', supersedes: null },
      'dlp-bai-mot__draft',
    );
    expect(again.navigate).toBe(false);
    expect(again.tone).toBe('success');
  });
});
