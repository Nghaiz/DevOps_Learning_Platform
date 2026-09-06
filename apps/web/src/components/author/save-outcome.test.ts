import { describe, expect, it } from 'vitest';
import { describeSaveOutcome } from './save-outcome';

describe('describeSaveOutcome — sửa bản nháp thường', () => {
  it('báo thành công, không nói gì thêm', () => {
    const outcome = describeSaveOutcome({ id: 'dlp-bai-mot', supersedes: null }, 'dlp-bai-mot');
    expect(outcome.tone).toBe('success');
    expect(outcome.title).toBe('Đã lưu bản nháp');
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
    expect(outcome.title).toContain('CHƯA đổi');
    expect(outcome.detail).toContain('dlp-bai-mot');
    expect(outcome.detail).toContain('dlp-bai-mot__draft');
    expect(outcome.detail).toContain('Xuất bản');
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
