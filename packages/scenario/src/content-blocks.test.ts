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
      {
        kind: 'code',
        code: 'co-hau-to',
        language: null,
        action: 'exec',
        inline: false,
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
/**
 * Cú pháp chọn terminal đích (`{{exec T1}}` / `{{exec T2}}`) — ĐÃ GỠ, §Y2.
 *
 * Nhóm này toàn vế ÂM, và đó là điểm của nó: sau khi một cú pháp bị gỡ, thứ
 * duy nhất chứng minh nó biến mất THẬT là một ca khẳng định nó bị TỪ CHỐI.
 * Không có ca nào ở đây thì `{{exec T2}}` có thể vẫn được nhận ở một nhánh
 * không ai đi qua — parser đọc `T2` rồi bỏ, nút chạy hiện ra bình thường, và
 * một bài viết cho HAI terminal lặng lẽ chạy chen nhau trong MỘT shell.
 *
 * ⚠ Cùng chỗ này gác luôn bất biến quan trọng nhất của file: hành động phải
 * DÍNH LIỀN sau backtick đóng, nên `{{TRAFFIC_*}}` trong văn xuôi không bao
 * giờ là hành động.
 */
describe('parseContentBlocks — cú pháp terminal đích đã bị gỡ (§Y2)', () => {
  it('{{exec T1}} và {{exec T2}} bị NÉM, KHÔNG được lặng lẽ bỏ phần T<n>', () => {
    // Vế "lặng lẽ bỏ" mới là vế nguy: nó đúng cú pháp và sai ý định người soạn,
    // và không có gì đỏ ở bất cứ đâu để ai đó nhận ra.
    expect(() => parseContentBlocks('`a`{{exec T1}}')).toThrow(ContentBlockError);
    expect(() => parseContentBlocks('`b`{{exec T2}}')).toThrow(/không nhận ra/);
  });

  it('{{exec T2 interrupt}} và {{exec interrupt T2}} đều NÉM — cả hai thứ tự', () => {
    // Hai thứ tự vì bản cũ nhận thứ tự thứ nhất và từ chối thứ tự thứ hai. Chỉ
    // kiểm một cái thì một bản vá gỡ nửa vời vẫn xanh.
    expect(() => parseContentBlocks('`c`{{exec T2 interrupt}}')).toThrow(ContentBlockError);
    expect(() => parseContentBlocks('`d`{{exec interrupt T2}}')).toThrow(ContentBlockError);
  });

  it('{{copy T1}} bị NÉM — copy chưa bao giờ có đích để nhắm', () => {
    expect(() => parseContentBlocks('`x`{{copy T1}}')).toThrow(ContentBlockError);
  });

  it('fence cũng NÉM, không chỉ code span', () => {
    // Hai đường vào parser dùng hai regex khác nhau và gọi `parseActionSuffix`
    // ở hai chỗ. Một bản gỡ chạm đúng một đường trông xanh ở mọi ca inline.
    expect(() => parseContentBlocks(['```bash', 'kubectl get pod', '```{{exec T2}}'].join('\n'))).toThrow(
      ContentBlockError,
    );
  });

  it('thông báo lỗi liệt kê BỐN dạng còn lại và KHÔNG nhắc T1/T2 nữa', () => {
    // Vế "không nhắc" là vế chống hồi quy tài liệu: một thông báo còn quảng cáo
    // `{{exec T1}}` sẽ dạy người soạn viết đúng thứ parser vừa từ chối.
    let message = '';
    try {
      parseContentBlocks('`x`{{open}}');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('{{}}');
    expect(message).toContain('{{copy}}');
    expect(message).toContain('{{exec}}');
    expect(message).toContain('{{exec interrupt}}');
    expect(message).not.toContain('T1');
    expect(message).not.toContain('T2');
  });

  it('khoảng trắng thừa trong hậu tố vẫn được chuẩn hoá', () => {
    // Chuẩn hoá `\s+` → một dấu cách là thứ độc lập với việc gỡ đích; ca này ở
    // nhóm cũ và được giữ lại vì không nhóm nào khác gác nó.
    expect(codeBlocks('`e`{{  exec   interrupt  }}').map((b) => b.action)).toEqual([
      'exec-interrupt',
    ]);
  });

  it('{{TRAFFIC_HOST1_80}} trong văn xuôi vẫn KHÔNG phải hành động', () => {
    const markdown = [
      'Mở {{TRAFFIC_HOST1_80}} hoặc [bấm đây]({{TRAFFIC_HOST1_8080}}).',
      'Rồi chạy `ls`{{exec}} ở terminal.',
    ].join('\n');

    expect(codeBlocks(markdown).map((b) => [b.code, b.action])).toEqual([['ls', 'exec']]);
    expect(
      parseContentBlocks(markdown)
        .filter((b) => b.kind === 'markdown')
        .map((b) => b.markdown)
        .join(''),
    ).toContain('{{TRAFFIC_HOST1_80}}');
  });
});
