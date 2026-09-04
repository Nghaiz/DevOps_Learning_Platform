import { describe, expect, it } from 'vitest';
import { appRouter } from './app-router';

/**
 * Hợp đồng ĐẦU VÀO của `quiz.*` và `paths.*` (P10).
 *
 * Test đọc CHÍNH schema đã đăng ký trên router, KHÔNG đọc mã nguồn — cùng khuôn
 * `authoring-input.test.ts`. Đó là điều làm nó còn đúng khi có người thêm một
 * procedure mới: một `quiz.something` nhận `userId` sẽ bị bắt ở đây mà không ai
 * phải nhớ cập nhật test.
 */

interface ProcedureDef {
  readonly _def?: { readonly inputs?: unknown[] };
}

function procedureNames(prefix: string): readonly string[] {
  const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
  return Object.keys(procedures).filter((name) => name.startsWith(`${prefix}.`));
}

function inputSchemaOf(name: string): { parse(value: unknown): unknown } | null {
  const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
  const inputs = (procedures[name] as ProcedureDef | undefined)?._def?.inputs ?? [];
  const schema = inputs[0];
  return schema === undefined ? null : (schema as { parse(value: unknown): unknown });
}

/** Field mà một schema `.strict()` chấp nhận — dò bằng cách thử parse. */
function accepts(name: string, field: string, value: unknown): boolean {
  const schema = inputSchemaOf(name);
  if (schema === null) {
    return false;
  }
  try {
    schema.parse({ [field]: value });
    return true;
  } catch (error) {
    // Field LẠ bị `.strict()` từ chối kèm chữ "unrecognized"; field thiếu/sai
    // kiểu cho một lỗi khác. Chỉ lỗi loại sau mới nghĩa là "field được chấp
    // nhận nhưng payload này thiếu thứ khác".
    return !JSON.stringify(error).toLowerCase().includes('unrecognized');
  }
}

describe('luật 1 — không procedure nào nhận danh tính từ client', () => {
  const names = [...procedureNames('quiz'), ...procedureNames('paths')];

  it('có đủ procedure để test (chống xanh giả vì router rỗng)', () => {
    expect(names.length).toBeGreaterThan(10);
  });

  /**
   * Ô AC ngầm nhưng quan trọng nhất của cả hai router: chủ sở hữu tới từ
   * `ctx.user.id` (khi tạo) và từ cột `author_id` đọc từ DB (khi sửa). Một field
   * `userId`/`authorId` trong input là một field kẻ tấn công điền được, và mọi
   * lượt kiểm sau đó so giá trị họ cung cấp với chính nó.
   */
  it.each(names)('%s không nhận userId hay authorId', (name) => {
    expect(accepts(name, 'userId', 'nguoi-khac')).toBe(false);
    expect(accepts(name, 'authorId', 'nguoi-khac')).toBe(false);
  });

  /** Luật 3 — field lạ bị reject, không bị bỏ qua im lặng. */
  it.each(names)('%s từ chối field lạ (.strict())', (name) => {
    expect(accepts(name, 'khongCoThatDau', true)).toBe(false);
  });

  /**
   * Ranh giới thương mại, kiểm ở tầng hợp đồng chứ không chỉ bằng `grep`: không
   * procedure nào nhận được một field thanh toán, kể cả khi ai đó thêm nó vào
   * schema mà quên phần ranh giới ở đầu `paths.ts`.
   */
  it.each(names)('%s không nhận field thương mại', (name) => {
    for (const field of ['price', 'sku', 'entitlement', 'isPaid', 'subscription']) {
      expect(accepts(name, field, 1)).toBe(false);
    }
  });
});

describe('luật 4 — cap 100 ở server, ÉP về chứ không từ chối', () => {
  it.each(['quiz.list', 'quiz.listMine', 'paths.list', 'paths.listMine', 'paths.mine'])(
    '%s ép limit về 100',
    (name) => {
      const parsed = inputSchemaOf(name)?.parse({ limit: 5000 }) as { limit: number };
      expect(parsed.limit).toBe(100);
    },
  );

  it('danh sách item của một lộ trình cũng bị cap ở đầu vào', () => {
    const items = Array.from({ length: 101 }, (_, index) => ({
      kind: 'lesson',
      itemId: `bai-${String(index)}`,
    }));
    expect(() =>
      inputSchemaOf('paths.create')?.parse({ id: 'lo-trinh', title: 'X', items }),
    ).toThrow();
  });
});

describe('quiz.create — chuẩn hoá xuống dòng lúc lưu', () => {
  const CRLF = '# tiêu đề\r\n\r\nnội dung\r\n';

  /**
   * Cùng lý lẽ `authoring-input.test.ts`: byte trong DB phải giống byte mọi
   * consumer khác thấy. Markdown quiz không chạy bằng bash, nhưng một bản CRLF
   * vẫn làm phép so / lượt tìm kiếm lệch mà không ai biết vì sao.
   */
  it('markdown câu hỏi và giải thích về LF', () => {
    const parsed = inputSchemaOf('quiz.create')?.parse({
      id: 'quiz-thu',
      title: 'Quiz thử',
      passThresholdPercent: 70,
      questions: [
        {
          id: 'cau-1',
          kind: 'single',
          markdown: CRLF,
          explanation: CRLF,
          choices: [
            { id: 'a', markdown: CRLF, isCorrect: true },
            { id: 'b', markdown: 'B', isCorrect: false },
          ],
        },
      ],
    }) as {
      questions: { markdown: string; explanation: string; choices: { markdown: string }[] }[];
    };

    expect(parsed.questions[0]?.markdown).not.toContain('\r');
    expect(parsed.questions[0]?.explanation).not.toContain('\r');
    expect(parsed.questions[0]?.choices[0]?.markdown).not.toContain('\r');
  });

  /** Bản nháp lưu tự do — cổng là `publish`, không phải biên ghi (xem `quiz/validate.ts`). */
  it('nháp 0 câu hỏi vẫn lưu được', () => {
    expect(() =>
      inputSchemaOf('quiz.create')?.parse({
        id: 'quiz-nhap',
        title: 'Nháp',
        passThresholdPercent: 70,
        questions: [],
      }),
    ).not.toThrow();
  });
});

describe('paths — hợp đồng lộ trình', () => {
  it('sequential mặc định TẮT (học tự do là mặc định, task 4)', () => {
    const parsed = inputSchemaOf('paths.create')?.parse({
      id: 'lo-trinh',
      title: 'Lộ trình',
      items: [],
    }) as { sequential: boolean };
    expect(parsed.sequential).toBe(false);
  });

  it('itemKind chỉ nhận lesson | lab | quiz — playground KHÔNG xếp vào lộ trình', () => {
    expect(() =>
      inputSchemaOf('paths.create')?.parse({
        id: 'lo-trinh',
        title: 'Lộ trình',
        items: [{ kind: 'playground', itemId: 'san-choi' }],
      }),
    ).toThrow();
  });

  it('openItem nhận đủ pathId + kind + itemId — khoá là thuộc tính của MỘT lộ trình', () => {
    const parsed = inputSchemaOf('paths.openItem')?.parse({
      pathId: 'lo-trinh',
      kind: 'quiz',
      itemId: 'quiz-cuoi',
    }) as { pathId: string; kind: string; itemId: string };
    expect(parsed).toEqual({ pathId: 'lo-trinh', kind: 'quiz', itemId: 'quiz-cuoi' });
  });
});
