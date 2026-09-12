import { describe, expect, it } from 'vitest';
import { renderCopy, type CopyRef } from './t.ts';

describe('CopyRef retains each message parameter contract', () => {
  it('renders static and dynamic references', () => {
    expect(renderCopy({ key: 'common.action.save' })).toBe('Lưu');
    expect(renderCopy({ key: 'catalog.pager.page', params: { page: 2 } })).toContain('2');
  });

  it('rejects missing, extra and mistyped parameters at compilation', () => {
    // @ts-expect-error A dynamic message requires its parameters.
    const missing: CopyRef = { key: 'catalog.pager.page' };
    // @ts-expect-error Static messages do not accept parameters.
    const extra: CopyRef = { key: 'common.action.save', params: { page: 2 } };
    // @ts-expect-error Page is a number, not a formatted date or string.
    const incorrect: CopyRef = { key: 'catalog.pager.page', params: { page: 'two' } };
    // @ts-expect-error Unknown parameter names cannot travel through a selector.
    const wrongName: CopyRef = { key: 'catalog.pager.page', params: { count: 2 } };
    expect([missing, extra, incorrect, wrongName]).toHaveLength(4);
  });
});
