import { describe, expect, it } from 'vitest';
import {
  ContentBlockError,
  executableCommands,
  parseContentBlocks,
  type ContentBlock,
} from './content-blocks.ts';

function codeBlocks(markdown: string): Extract<ContentBlock, { kind: 'code' }>[] {
  return parseContentBlocks(markdown).filter(
    (block): block is Extract<ContentBlock, { kind: 'code' }> => block.kind === 'code',
  );
}

describe('parseContentBlocks — hậu tố hành động', () => {
  it('nhận đủ bốn hậu tố inline của docs Killercoda', () => {
    const markdown = [
      '`copying disabled`{{}}',
      '`ls -lh`{{exec}}',
      '`whoami`{{exec interrupt}}',
      '`echo hi`{{copy}}',
    ].join('\n\n');

    expect(codeBlocks(markdown).map((b) => [b.code, b.action, b.inline])).toEqual([
      ['copying disabled', 'none', true],
      ['ls -lh', 'exec', true],
      ['whoami', 'exec-interrupt', true],
      ['echo hi', 'copy', true],
    ]);
  });

  it('nhận fence nhiều dòng kèm hậu tố và giữ nguyên ngôn ngữ', () => {
    const markdown = ['```yaml', 'kind: Pod', 'name: web', '```{{copy}}'].join('\n');
    expect(codeBlocks(markdown)).toEqual([
      {
        kind: 'code',
        code: 'kind: Pod\nname: web',
        language: 'yaml',
        action: 'copy',
        inline: false,
      },
    ]);
  });

  it('fence KHÔNG có hậu tố ở nguyên trong văn xuôi (FE render như code block thường)', () => {
    const markdown = ['Ví dụ:', '```bash', 'echo a', '```', 'hết.'].join('\n');
    expect(codeBlocks(markdown)).toEqual([]);
    expect(parseContentBlocks(markdown)).toEqual([{ kind: 'markdown', markdown }]);
  });

  it('inline code KHÔNG có hậu tố ở nguyên trong văn xuôi (mặc định copy-được là việc của FE)', () => {
    const markdown = 'Chạy `kubectl get pod` rồi xem kết quả.';
    expect(codeBlocks(markdown)).toEqual([]);
  });
});

describe('parseContentBlocks — các bẫy', () => {
  /**
   * Ca này là lý do parser quét theo dòng thay vì dùng một regex lười. Một regex
   * `/```[\s\S]*?```\{\{…\}\}/` sẽ backtrack qua fence thứ nhất và NUỐT trọn đoạn
   * "Đoạn văn ở giữa" — nội dung biến mất mà không lỗi nào nổi lên.
   */
  it('fence không-hậu-tố đứng trước fence có-hậu-tố không làm mất đoạn văn ở giữa', () => {
    const markdown = [
      '```',
      'khong-hau-to',
      '```',
      '',
      'Đoạn văn ở giữa PHẢI còn.',
      '',
      '```',
      'co-hau-to',
      '```{{exec}}',
    ].join('\n');

    const blocks = parseContentBlocks(markdown);
    expect(
      blocks
        .filter((b) => b.kind === 'markdown')
        .map((b) => b.markdown)
        .join('\n'),
    ).toContain('Đoạn văn ở giữa PHẢI còn.');
    expect(codeBlocks(markdown)).toEqual([
      { kind: 'code', code: 'co-hau-to', language: null, action: 'exec', inline: false },
    ]);
  });

  /**
   * `{{TRAFFIC_*}}` dùng cùng cặp ngoặc nhưng là biến thay thế trong văn xuôi,
   * không phải hành động. Thứ phân biệt là vị trí: hành động phải DÍNH LIỀN sau
   * backtick đóng.
   */
  it('biến {{TRAFFIC_*}} không bị nhận nhầm thành hành động', () => {
    const markdown = [
      'Mở {{TRAFFIC_SELECTOR}} hoặc [bấm đây]({{TRAFFIC_HOST1_8080}}).',
      'Cổng là {{TRAFFIC_HOST2_4444}}.',
    ].join('\n');
    expect(codeBlocks(markdown)).toEqual([]);
    expect(parseContentBlocks(markdown)).toEqual([{ kind: 'markdown', markdown }]);
  });

  it('có khoảng trắng giữa backtick và ngoặc thì KHÔNG phải hành động', () => {
    expect(codeBlocks('`ls` {{exec}}')).toEqual([]);
  });

  it('fence chưa đóng thì trả nguyên văn, không nuốt phần đuôi tài liệu', () => {
    const markdown = ['```bash', 'echo a', 'không có fence đóng'].join('\n');
    expect(parseContentBlocks(markdown)).toEqual([{ kind: 'markdown', markdown }]);
  });

  it('verb lạ thì NÉM, không im lặng bỏ qua và không đoán bừa', () => {
    expect(() => parseContentBlocks('`vim a.txt`{{open}}')).toThrow(ContentBlockError);
    expect(() => parseContentBlocks('```\na\n```{{run}}')).toThrow(/không nhận ra/);
  });

  it('văn xuôi quanh hành động inline được giữ, không bị cắt mất', () => {
    const blocks = parseContentBlocks('Trước `ls`{{exec}} sau.');
    expect(blocks).toEqual([
      { kind: 'markdown', markdown: 'Trước ' },
      { kind: 'code', code: 'ls', language: null, action: 'exec', inline: true },
      { kind: 'markdown', markdown: ' sau.' },
    ]);
  });

  it('markdown rỗng cho ra danh sách rỗng', () => {
    expect(parseContentBlocks('')).toEqual([]);
    expect(parseContentBlocks('   \n\n  ')).toEqual([]);
  });
});

describe('executableCommands', () => {
  it('chỉ lấy exec và exec-interrupt, bỏ copy/none', () => {
    const markdown = ['`a`{{exec}}', '`b`{{copy}}', '`c`{{exec interrupt}}', '`d`{{}}'].join(
      '\n\n',
    );
    expect(executableCommands(markdown)).toEqual(['a', 'c']);
  });
});

/**
 * CRLF — chế độ hỏng IM LẶNG, và nó chỉ trở nên với tới được ở P9.
 *
 * Trước P9 markdown chỉ tới từ đĩa (LF, nướng vào image dựng trên Linux). P9 mở
 * nguồn thứ hai: người soạn nhập qua tRPC vào `content_steps.markdown`, nơi
 * `\r\n` tới được nguyên vẹn từ một file Windows dán vào, hay một API client.
 *
 * ⛔ Từng đo được: với CRLF, hàm trả về ĐÚNG MỘT khối văn xuôi và KHÔNG action
 * nào — không lỗi, không cảnh báo. Một bài mất sạch nút bấm trông y hệt một bài
 * cố ý không có nút nào.
 *
 * Mỗi test dưới đây so CRLF với chính bản LF của cùng chuỗi, nên nó ĐỎ ngay khi
 * `normalizeNewlines` bị gỡ — chứ không chỉ khẳng định một con số nào đó.
 */
describe('parseContentBlocks — xuống dòng CRLF', () => {
  const LINES = ['# tiêu đề', '', '```bash', 'ps aux', '```{{exec}}', '', 'văn xuôi sau.'];

  it('CRLF cho ra ĐÚNG kết quả của LF', () => {
    const lf = LINES.join('\n');
    expect(parseContentBlocks(lf.replaceAll('\n', '\r\n'))).toEqual(parseContentBlocks(lf));
  });

  it('fence + hậu tố {{exec}} vẫn nhận ra dưới CRLF', () => {
    // Khẳng định TRỰC TIẾP, không qua phép so với LF: nếu cả hai nhánh cùng
    // hỏng theo một kiểu thì test trên vẫn xanh. Đây là vế chặn ca đó.
    const blocks = parseContentBlocks(LINES.join('\r\n'));
    const code = blocks.filter((b) => b.kind === 'code');
    expect(code).toHaveLength(1);
    expect(code[0]).toMatchObject({ code: 'ps aux', language: 'bash', action: 'exec' });
  });

  it('`\r` đơn (Mac cổ) cũng được chuẩn hoá', () => {
    const blocks = parseContentBlocks(LINES.join('\r'));
    expect(blocks.filter((b) => b.kind === 'code')).toHaveLength(1);
  });

  it('`\r` KHÔNG còn sót lại trong văn xuôi trả về', () => {
    // Nếu chỉ vá regex fence mà không chuẩn hoá, fence sẽ khớp nhưng mọi khối
    // văn xuôi vẫn mang `\r` — và nó chui thẳng vào markdown render ở FE.
    const blocks = parseContentBlocks(LINES.join('\r\n'));
    for (const block of blocks) {
      const text = block.kind === 'markdown' ? block.markdown : block.code;
      expect(text).not.toContain('\r');
    }
  });

  it('executableCommands lấy được lệnh trong FENCE dưới CRLF', () => {
    // ⚠ Phải dùng FENCE, không phải code span. Bản đầu của test này viết
    // ``executableCommands('`ls`{{exec}}\r\n…')`` và nó XANH cả khi đã gỡ
    // `normalizeNewlines` — vì `INLINE_ACTION` không neo vào cuối dòng nên code
    // span chưa bao giờ hỏng vì `\r`. Một test như vậy không gác gì cả; nó chỉ
    // trông như đang gác (`rules/green-that-proves-nothing.md`).
    //
    // Fence thì hỏng, nên đây mới là phép kiểm thật — và `executableCommands`
    // đáng có phép kiểm riêng vì nó QUYẾT ĐỊNH cái gì chạy trong sandbox.
    const md = ['```bash', 'ls -la', '```{{exec}}', '', '```', 'khong chay', '```'].join('\r\n');
    expect(executableCommands(md)).toEqual(['ls -la']);
  });
});
