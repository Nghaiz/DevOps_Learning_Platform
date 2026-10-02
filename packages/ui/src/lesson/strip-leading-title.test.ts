import { describe, expect, it } from 'vitest';
import type { ContentBlock } from '@devops-platform/scenario/content-blocks';
import { stripLeadingTitle } from './content-view';

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
});
