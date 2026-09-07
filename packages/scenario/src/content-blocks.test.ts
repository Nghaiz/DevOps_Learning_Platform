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

    // `target` nằm trong phép so: bốn hậu tố CŨ phải cho `null`, và vế đó là
    // thứ chặn một bản mở rộng lỡ tay đặt mặc định thành `'terminal-1'`.
    expect(codeBlocks(markdown).map((b) => [b.code, b.action, b.inline, b.target])).toEqual([
      ['copying disabled', 'none', true, null],
      ['ls -lh', 'exec', true, null],
      ['whoami', 'exec-interrupt', true, null],
      ['echo hi', 'copy', true, null],
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
        target: null,
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
      {
        kind: 'code',
        code: 'co-hau-to',
        language: null,
        action: 'exec',
        inline: false,
        target: null,
      },
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
      { kind: 'code', code: 'ls', language: null, action: 'exec', inline: true, target: null },
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

/**
 * Terminal đích (`{{exec T1}}` / `{{exec T2}}`) — mở rộng của ta, hợp đồng §C1.
 *
 * Vế quan trọng nhất của nhóm này KHÔNG phải là "T1/T2 chạy đúng" mà là hai vế
 * âm: cú pháp CŨ không đổi hành vi, và `{{TRAFFIC_*}}` trong văn xuôi vẫn không
 * bị hiểu thành hành động. Một bản mở rộng làm hỏng một trong hai vế đó sẽ hỏng
 * IM LẶNG trên toàn bộ nội dung đã vendor về.
 */
describe('parseContentBlocks — terminal đích (§C1)', () => {
  it('{{exec T1}} và {{exec T2}} gán đúng target, action vẫn là exec', () => {
    const markdown = ['`a`{{exec T1}}', '`b`{{exec T2}}'].join('\n\n');
    expect(codeBlocks(markdown).map((b) => [b.code, b.action, b.target])).toEqual([
      ['a', 'exec', 'terminal-1'],
      ['b', 'exec', 'terminal-2'],
    ]);
  });

  it('{{exec T2 interrupt}} gộp CẢ HAI: exec-interrupt + terminal-2', () => {
    expect(codeBlocks('`c`{{exec T2 interrupt}}').map((b) => [b.action, b.target])).toEqual([
      ['exec-interrupt', 'terminal-2'],
    ]);
  });

  it('{{exec T1 interrupt}} cũng hợp lệ — ngữ pháp là T<n> rồi interrupt, không phải một ca riêng', () => {
    expect(codeBlocks('`d`{{exec T1 interrupt}}').map((b) => [b.action, b.target])).toEqual([
      ['exec-interrupt', 'terminal-1'],
    ]);
  });

  it('target đi qua được cả FENCE, không chỉ code span', () => {
    const markdown = ['```bash', 'kubectl get pod', '```{{exec T2}}'].join('\n');
    expect(codeBlocks(markdown)).toEqual([
      {
        kind: 'code',
        code: 'kubectl get pod',
        language: 'bash',
        action: 'exec',
        inline: false,
        target: 'terminal-2',
      },
    ]);
  });

  it('khoảng trắng thừa trong hậu tố được chuẩn hoá', () => {
    expect(codeBlocks('`e`{{  exec   T2   interrupt  }}').map((b) => [b.action, b.target])).toEqual(
      [['exec-interrupt', 'terminal-2']],
    );
  });

  it('CRLF không làm mất target trong fence', () => {
    // Cùng bẫy mà `normalizeNewlines` tồn tại để chặn: với CRLF, `FENCE_CLOSE`
    // không khớp và cả khối biến thành văn xuôi — nút bấm biến mất, không lỗi.
    const md = ['```bash', 'ps aux', '```{{exec T2}}'].join('\r\n');
    expect(codeBlocks(md).map((b) => [b.action, b.target])).toEqual([['exec', 'terminal-2']]);
  });
});

describe('parseContentBlocks — terminal đích, các vế PHẢI từ chối', () => {
  it('thứ tự sai ({{exec interrupt T2}}) bị NÉM, không được đoán bừa', () => {
    // Hai cách viết cho cùng một nghĩa là hai cách viết sẽ lệch nhau ở lần mở
    // rộng sau — nên ngữ pháp cố định `exec → T<n> → interrupt`.
    expect(() => parseContentBlocks('`x`{{exec interrupt T2}}')).toThrow(ContentBlockError);
  });

  it('terminal không tồn tại ({{exec T9}}) bị NÉM', () => {
    expect(() => parseContentBlocks('`x`{{exec T9}}')).toThrow(/không nhận ra/);
  });

  it('{{copy T1}} bị NÉM — copy không có terminal nào để nhắm', () => {
    expect(() => parseContentBlocks('`x`{{copy T1}}')).toThrow(ContentBlockError);
  });

  it('token thừa sau target ({{exec T2 foo}}) bị NÉM', () => {
    expect(() => parseContentBlocks('`x`{{exec T2 foo}}')).toThrow(ContentBlockError);
  });

  it('thông báo lỗi LIỆT KÊ dạng hợp lệ, gồm cả dạng T1/T2 mới', () => {
    // Không chỉ khẳng định "có ném": một thông báo không nói được cách viết đúng
    // biến một lỗi chính tả thành một buổi đọc source.
    let message = '';
    try {
      parseContentBlocks('`x`{{open}}');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('{{exec}}');
    expect(message).toContain('{{exec interrupt}}');
    expect(message).toContain('{{exec T1}}');
    expect(message).toContain('{{exec T2 interrupt}}');
  });

  /**
   * Vế chống hồi quy cho bất biến quan trọng nhất của file: hành động phải DÍNH
   * LIỀN sau backtick đóng. `{{TRAFFIC_*}}` dùng cùng cặp ngoặc, và một parser
   * đi tìm `{{…}}` trần trụi sẽ nuốt chúng.
   */
  it('{{TRAFFIC_HOST1_80}} trong văn xuôi vẫn KHÔNG phải hành động sau khi thêm target', () => {
    const markdown = [
      'Mở {{TRAFFIC_HOST1_80}} hoặc [bấm đây]({{TRAFFIC_HOST1_8080}}).',
      'Rồi chạy `ls`{{exec T2}} ở tab hai.',
    ].join('\n');

    expect(codeBlocks(markdown).map((b) => [b.code, b.target])).toEqual([['ls', 'terminal-2']]);
    expect(
      parseContentBlocks(markdown)
        .filter((b) => b.kind === 'markdown')
        .map((b) => b.markdown)
        .join(''),
    ).toContain('{{TRAFFIC_HOST1_80}}');
  });
});
