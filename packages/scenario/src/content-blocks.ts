/**
 * Tách markdown Killercoda thành khối văn xuôi + khối code CÓ HÀNH ĐỘNG.
 *
 * Đây là hàm THUẦN và là lý do DTO không mang `markdownHtml`: hậu tố `{{exec}}`
 * phải trở thành một NÚT nối vào terminal, thứ mà một chuỗi HTML không có chỗ
 * nào gắn handler. Server (2.C) và FE (2.D) gọi CÙNG hàm này trên CÙNG chuỗi
 * markdown, nên không có nguồn sự thật thứ hai để trôi.
 *
 * Cú pháp (docs Killercoda § Custom Code Markdown Actions, đọc 2026-08-13):
 *
 * | Viết | Nghĩa |
 * |---|---|
 * | `` `cmd` ``           | inline, copy-được theo mặc định — KHÔNG tách khối |
 * | `` `cmd`{{}} ``       | tắt copy |
 * | `` `cmd`{{exec}} ``   | bấm để chạy |
 * | `` `cmd`{{exec interrupt}} `` | gửi Ctrl+C rồi chạy |
 * | ```` ```…```{{copy}} ```` | khối nhiều dòng, bấm để copy |
 * | ```` ```…```{{exec}} ```` | khối nhiều dòng, bấm để chạy |
 *
 * ⚠ `{{TRAFFIC_HOST1_80}}` / `{{TRAFFIC_SELECTOR}}` dùng CÙNG cặp ngoặc nhưng
 * KHÔNG phải hành động — chúng là biến thay thế trong văn xuôi. Thứ phân biệt
 * chúng là vị trí: hành động phải DÍNH LIỀN ngay sau dấu backtick đóng. Biến
 * traffic thì đứng một mình hoặc trong `[text]({{…}})`. Vì vậy parser không bao
 * giờ được đi tìm `{{…}}` một cách trần trụi.
 */

export const CODE_ACTIONS = ['none', 'copy', 'exec', 'exec-interrupt'] as const;
export type CodeAction = (typeof CODE_ACTIONS)[number];

export type ContentBlock =
  | { kind: 'markdown'; markdown: string }
  | {
      kind: 'code';
      code: string;
      /** Ngôn ngữ ghi sau dấu fence mở (```yaml). `null` với inline hoặc fence trần. */
      language: string | null;
      action: CodeAction;
      /** `true` khi nguồn là code span một dấu backtick, `false` khi là fence. */
      inline: boolean;
    };

export class ContentBlockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContentBlockError';
  }
}

/**
 * Nội dung bên trong `{{…}}` → hành động.
 *
 * Verb lạ ⇒ NÉM. Cân nhắc đã có: bỏ qua nó thì hậu tố hiện nguyên văn
 * `{{open}}` giữa bài học, còn coi nó như `copy` thì nút làm sai việc. Ta kiểm
 * soát nội dung nào được vendor về, nên chặt ở đây là chi phí một lần lúc nhập,
 * đổi lấy việc không bao giờ có nút sai chức năng trước mặt người học.
 */
function toAction(rawVerb: string): CodeAction {
  const verb = rawVerb.trim().replace(/\s+/g, ' ');
  switch (verb) {
    case '':
      return 'none';
    case 'copy':
      return 'copy';
    case 'exec':
      return 'exec';
    case 'exec interrupt':
      return 'exec-interrupt';
    default:
      throw new ContentBlockError(
        `hậu tố code action không nhận ra: {{${rawVerb}}}. ` +
          `Chỉ hỗ trợ: {{}}, {{copy}}, {{exec}}, {{exec interrupt}}.`,
      );
  }
}

const FENCE_OPEN = /^([ \t]*)```([A-Za-z0-9_+-]*)[ \t]*$/;
/** Fence đóng, có thể kèm hậu tố hành động dính liền. */
const FENCE_CLOSE = /^[ \t]*```(?:\{\{([^}]*)\}\})?[ \t]*$/;
/** Code span một backtick + hậu tố DÍNH LIỀN. `[^`\n]+` chặn nuốt qua dòng. */
const INLINE_ACTION = /`([^`\n]+)`\{\{([^}\n]*)\}\}/g;

/**
 * Chuẩn hoá xuống dòng về `\n` TRƯỚC khi tách dòng.
 *
 * ## Vì sao đây không phải một dòng phòng thủ thừa
 *
 * `FENCE_OPEN` và `FENCE_CLOSE` đều neo bằng `[ \t]*$`. Với đầu vào CRLF, mỗi
 * dòng còn lại một `\r` ở cuối sau `split('\n')`, nên KHÔNG fence nào khớp — và
 * hàm không lỗi, không cảnh báo: nó trả về đúng MỘT khối văn xuôi chứa cả tài
 * liệu, và **mọi nút `{{exec}}` / `{{copy}}` biến mất**. Đo được trên cùng một
 * chuỗi: LF cho 3 khối kèm một action `exec`; CRLF cho 1 khối và không action
 * nào.
 *
 * ## Vì sao nó chỉ lộ ra bây giờ
 *
 * Trước P9, markdown chỉ tới từ MỘT nguồn: đĩa, nướng vào image dựng trên Linux
 * (LF), với `.gitattributes` còn khoá `content/scenarios/** -text` cho
 * byte-exact. `\r` chưa bao giờ tới được hàm này trong production.
 *
 * P9 mở nguồn thứ hai: markdown do người soạn nhập, đi qua tRPC vào
 * `content_steps.markdown`. Nội dung dán từ một file Windows, một API client
 * gửi JSON có `\r\n`, một trình soạn thảo giữ CRLF — tất cả tới đây nguyên vẹn.
 * Parser không được phép dựa vào việc tầng trên đã chuẩn hoá: chế độ hỏng của
 * nó IM LẶNG, và một bài mất hết nút bấm trông y hệt một bài cố ý không có nút.
 *
 * `\r` đơn (Mac cổ) gộp luôn vào — cùng một regex, không tốn thêm gì.
 *
 * ## Vì sao nó được XUẤT ra
 *
 * Bản vá ở đây chỉ che đường ĐỌC markdown. Nó KHÔNG che `verifyScript` /
 * `setup.*`, vốn không đi qua parser nào mà đi thẳng tới `GATEWAY_EXEC_SHELL`
 * (mặc định **bash**). Một script CRLF chạy bằng bash báo `$'\r': command not
 * found` ở MỖI dòng — đúng chế độ hỏng mà `.gitattributes` đã ghi cho `*.sh` và
 * `images/sandbox-base/skel/**`.
 *
 * Nên biên GHI của trang soạn (`authoring.ts`) chuẩn hoá luôn lúc lưu, và nó
 * dùng CHÍNH hàm này thay vì viết lại một `replace` thứ hai: hai bản của cùng
 * một quy tắc sẽ lệch ở lần đầu tiên ai đó thêm một ca.
 */
export function normalizeNewlines(markdown: string): string {
  return markdown.replace(/\r\n?/g, '\n');
}

/**
 * Tách theo DÒNG chứ không bằng một regex duy nhất.
 *
 * Một regex `` /```[\s\S]*?```\{\{…\}\}/ `` trông đủ dùng nhưng sai ở đúng ca hay
 * gặp: khi có một fence KHÔNG hậu tố đứng trước một fence CÓ hậu tố, phép so
 * lười sẽ backtrack và nuốt trọn phần văn xuôi ở giữa hai fence — nội dung biến
 * mất mà không lỗi nào nổi lên. Quét tuần tự thì trạng thái "đang trong fence"
 * là tường minh và không có chỗ cho backtracking.
 */
export function parseContentBlocks(markdown: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = normalizeNewlines(markdown).split('\n');
  let prose: string[] = [];

  const flushProse = (): void => {
    if (prose.length === 0) {
      return;
    }
    const text = prose.join('\n');
    prose = [];
    if (text.trim() === '') {
      return;
    }
    pushProse(blocks, text);
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    const open = FENCE_OPEN.exec(line);
    if (open === null) {
      prose.push(line);
      continue;
    }

    // Tìm fence đóng. Không thấy ⇒ fence chưa đóng: trả lại nguyên văn cho văn
    // xuôi thay vì nuốt phần đuôi tài liệu. Markdown hỏng là việc của người viết
    // bài, không phải lý do để parser làm mất nội dung.
    let close = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (FENCE_CLOSE.test(lines[j] ?? '')) {
        close = j;
        break;
      }
    }
    if (close === -1) {
      prose.push(line);
      continue;
    }

    const closeMatch = FENCE_CLOSE.exec(lines[close] ?? '');
    const verb = closeMatch?.[1];
    if (verb === undefined) {
      // Fence thường, không hành động — để nguyên trong văn xuôi cho FE render.
      for (let j = i; j <= close; j += 1) {
        prose.push(lines[j] ?? '');
      }
      i = close;
      continue;
    }

    flushProse();
    const language = open[2] === undefined || open[2] === '' ? null : open[2];
    blocks.push({
      kind: 'code',
      code: lines.slice(i + 1, close).join('\n'),
      language,
      action: toAction(verb),
      inline: false,
    });
    i = close;
  }

  flushProse();
  return blocks;
}

/** Tách tiếp phần văn xuôi theo code span có hậu tố. */
function pushProse(blocks: ContentBlock[], text: string): void {
  INLINE_ACTION.lastIndex = 0;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = INLINE_ACTION.exec(text)) !== null) {
    const before = text.slice(cursor, match.index);
    if (before.trim() !== '') {
      blocks.push({ kind: 'markdown', markdown: before });
    }
    blocks.push({
      kind: 'code',
      code: match[1] ?? '',
      language: null,
      action: toAction(match[2] ?? ''),
      inline: true,
    });
    cursor = match.index + match[0].length;
  }

  const rest = text.slice(cursor);
  if (rest.trim() !== '') {
    blocks.push({ kind: 'markdown', markdown: rest });
  }
}

/** Mọi lệnh người học bấm chạy được trong một markdown — dùng cho smoke/audit. */
export function executableCommands(markdown: string): string[] {
  return parseContentBlocks(markdown)
    .filter(
      (block) =>
        block.kind === 'code' && (block.action === 'exec' || block.action === 'exec-interrupt'),
    )
    .map((block) => (block as Extract<ContentBlock, { kind: 'code' }>).code);
}
