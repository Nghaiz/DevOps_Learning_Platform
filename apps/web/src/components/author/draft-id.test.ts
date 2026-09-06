import { describe, expect, it } from 'vitest';
import { basePublishedIdOf, isSuccessorDraftId } from './draft-id';

describe('basePublishedIdOf', () => {
  it('bản nháp kế nhiệm chỉ về bài gốc', () => {
    expect(basePublishedIdOf('dlp-bai-mot__draft')).toBe('dlp-bai-mot');
  });

  it('id thường không phải bản nháp kế nhiệm', () => {
    expect(basePublishedIdOf('dlp-bai-mot')).toBeNull();
    expect(isSuccessorDraftId('dlp-bai-mot')).toBe(false);
  });

  it('MỘT gạch dưới không tính — hậu tố là hai gạch, và scenarioIdSchema vốn cấm ký tự _', () => {
    expect(basePublishedIdOf('dlp-bai_draft')).toBeNull();
  });

  it('chuỗi chứa hậu tố ở giữa không tính, phải ở CUỐI', () => {
    expect(basePublishedIdOf('dlp__draft-them')).toBeNull();
  });
});
