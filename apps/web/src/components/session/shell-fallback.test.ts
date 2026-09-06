import { describe, expect, it } from 'vitest';
import { POD_FALLBACK_SHELL } from '../me/preference-notices';
import { resolveShellFallbackNotice, type ShellFallbackInput } from './shell-fallback';

/**
 * Băng cảnh báo shell CHỈ được hiện khi server đã nói thẳng là nó không áp được
 * (`preferencesApplied === false`).
 *
 * Ba ca im lặng dưới đây là ba trạng thái KHÁC NHAU, và gộp chúng lại là cách
 * băng này bắt đầu nói dối: `null` (chưa biết) đọc thành `false` (đã hỏng) sẽ
 * cảnh báo mọi người học ngay khi mở trang, trước cả khi có phiên nào.
 */
const BASE: ShellFallbackInput = {
  sessionId: 'ses-1',
  preferencesApplied: false,
  shell: 'pwsh',
};

describe('resolveShellFallbackNotice', () => {
  it('cờ false + đã có phiên + biết shell ⇒ HIỆN', () => {
    const notice = resolveShellFallbackNotice(BASE);

    expect(notice).not.toBeNull();
    expect(notice?.tone).toBe('warning');
  });

  it('cờ true (áp được) ⇒ im lặng', () => {
    expect(resolveShellFallbackNotice({ ...BASE, preferencesApplied: true })).toBeNull();
  });

  it('cờ null (chưa mở phiên nào nên CHƯA BIẾT) ⇒ im lặng, không đoán là hỏng', () => {
    expect(resolveShellFallbackNotice({ ...BASE, preferencesApplied: null })).toBeNull();
  });

  it('không còn phiên nào (sau khi kết thúc) ⇒ im lặng, băng không treo lại', () => {
    // `session-machine.ts` case 'ENDED' đưa `sessionId` về `null`.
    expect(resolveShellFallbackNotice({ ...BASE, sessionId: null })).toBeNull();
  });

  it('chưa đọc được hồ sơ (shell null) ⇒ im lặng, không đoán người dùng chọn gì', () => {
    expect(resolveShellFallbackNotice({ ...BASE, shell: null })).toBeNull();
  });

  it('shell đã chọn trùng mặc định của máy ⇒ im lặng dù cờ false', () => {
    expect(resolveShellFallbackNotice({ ...BASE, shell: POD_FALLBACK_SHELL })).toBeNull();
  });
});
