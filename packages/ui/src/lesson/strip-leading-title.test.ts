import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@devops-platform/scenario/content-blocks';
import { stripLeadingTitle } from './content-view.tsx';

const md = (markdown: string): ContentBlock => ({ kind: 'markdown', markdown }) as ContentBlock;

describe('stripLeadingTitle', () => {
  it('bỏ dòng # Tên khi trùng tên bước (không phân biệt hoa thường, dấu chấm cuối)', () => {
    const out = stripLeadingTitle([md('# Kéo image đầu tiên.\nĐoạn mở đầu.')], 'kéo image đầu tiên');
    expect(out[0]).toEqual(md('Đoạn mở đầu.'));
  });

  it('giữ nguyên khi tiêu đề khác dù một chữ', () => {
    const blocks = [md('# Kéo image đầu tiên từ Hub\nĐoạn mở đầu.')];
    expect(stripLeadingTitle(blocks, 'Kéo image đầu tiên')).toBe(blocks);
  });

  it('chỉ xét khối đầu, và chỉ khi nó là markdown', () => {
    const code = { kind: 'code', code: 'ls', language: null, action: 'copy', inline: false } as unknown as ContentBlock;
    const blocks = [code, md('# Tên\nx')];
    expect(stripLeadingTitle(blocks, 'Tên')).toBe(blocks);
  });

  it('không có tên thì không đụng gì', () => {
    const blocks = [md('# Tên\nx')];
    expect(stripLeadingTitle(blocks, undefined)).toBe(blocks);
  });

  it('chỉ bỏ h1/h2, không bỏ h3', () => {
    const blocks = [md('### Tên\nx')];
    expect(stripLeadingTitle(blocks, 'Tên')).toBe(blocks);
  });

  it('bỏ cả dòng trống đứng trước, nhận ## và tab làm dấu cách', () => {
    expect(stripLeadingTitle([md('\n\n  ##\tTên bước\t \nx')], 'Tên bước')[0]).toEqual(md('x'));
  });

  it('khối chỉ có mỗi dòng tiêu đề thì còn lại chuỗi rỗng', () => {
    expect(stripLeadingTitle([md('# Tên')], 'Tên')[0]).toEqual(md(''));
  });

  it('dòng CRLF vẫn khớp, kể cả khi có dấu chấm cuối', () => {
    expect(stripLeadingTitle([md('# Tên.\r\nx')], 'Tên')[0]).toEqual(md('x'));
  });

  it('không có dấu cách sau # thì không phải tiêu đề', () => {
    const blocks = [md('#Tên\nx')];
    expect(stripLeadingTitle(blocks, 'Tên')).toBe(blocks);
  });

  // Hai regex cũ chạy bậc hai trên đúng hai dạng này (200 000 ký tự ≈ hàng chục giây).
  // Bản quét tuyến tính xong trong vài ms, nên trần 1 s không đỏ vì máy chậm.
  it.each([
    ['nhiều tab trong dòng tiêu đề', `# a${'\t\t'.repeat(100_000)}b`],
    ['nhiều dấu chấm cuối tiêu đề', `# a${'.'.repeat(200_000)}x`],
  ])('không chạy bậc hai: %s', (_name, markdown) => {
    const started = performance.now();
    stripLeadingTitle([md(markdown)], 'a');
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
