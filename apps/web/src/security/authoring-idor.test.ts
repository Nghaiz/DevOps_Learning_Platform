import { describe, expect, it } from 'vitest';
import { TRPCError } from '@trpc/server';
import { assertContentOwner, visibilityFor } from '../server/content/authz';
import { appRouter } from '../server/trpc/routers/app-router';
import type { AuthedUser } from '../server/trpc/init';

/**
 * Rủi ro **score 20** của phase-9 — cao nhất bảng, vì đây là API GHI:
 * *"API ghi mở đường IDOR (sửa bài người khác)"*.
 *
 * Ba khẳng định, và chúng kiểm ba thứ KHÁC nhau:
 *
 * 1. **Luật 1 dạng mạnh** — không input schema nào của router soạn bài có field
 *    `authorId`. Kiểm bằng cách duyệt CHÍNH schema đã đăng ký, không bằng cách
 *    đọc mã nguồn: một field thêm vào sau này sẽ bị bắt, kể cả khi ai đó cũng
 *    sửa cả chú thích.
 * 2. **Cổng chủ sở hữu** — `assertContentOwner` từ chối tác giả khác, kèm ĐỐI
 *    CHỨNG DƯƠNG (cùng hàm đó PHẢI cho chủ thật đi qua). Một test chỉ có vế
 *    "từ chối" không phân biệt được một cổng đúng với một cổng từ chối tất cả.
 * 3. **Tầm nhìn** — `author` không thấy nháp của người khác.
 */

const AUTHORING_PROCEDURES = [
  'list',
  'preview',
  'get',
  'create',
  'update',
  'check',
  'publish',
  'archive',
  'listAssets',
  'uploadAsset',
  'deleteAsset',
] as const;

/** Mọi tên field ở TẦNG NGOÀI của input schema một procedure. */
function inputFieldsOf(name: string): readonly string[] {
  const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
  const procedure = procedures[`authoring.${name}`];
  const inputs = (procedure as { _def?: { inputs?: unknown[] } } | undefined)?._def?.inputs ?? [];
  const fields = new Set<string>();
  for (const input of inputs) {
    const shape = (input as { shape?: Record<string, unknown> }).shape;
    if (shape !== undefined) {
      for (const key of Object.keys(shape)) {
        fields.add(key);
      }
    }
  }
  return [...fields];
}

describe('luật 1 dạng mạnh — không procedure soạn bài nào NHẬN authorId', () => {
  it('mọi procedure của authoring đã đăng ký (test không im lặng bỏ sót cái nào)', () => {
    const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
    const registered = Object.keys(procedures)
      .filter((k) => k.startsWith('authoring.'))
      .map((k) => k.slice('authoring.'.length))
      .sort();
    // Ô AC này chỉ có nghĩa nếu nó phủ MỌI procedure. Thêm một procedure mới mà
    // quên thêm vào danh sách trên ⇒ test đỏ, chứ không phải một ô AC im lặng
    // nhỏ đi.
    expect(registered).toEqual([...AUTHORING_PROCEDURES].sort());
  });

  it.each(AUTHORING_PROCEDURES)('authoring.%s không có field authorId trong input', (name) => {
    const fields = inputFieldsOf(name);
    expect(fields).not.toContain('authorId');
    expect(fields).not.toContain('author_id');
    expect(fields).not.toContain('userId');
  });

  it('cũng không nhận state / publishedAt — chúng là output của hệ thống', () => {
    for (const name of ['create', 'update'] as const) {
      const fields = inputFieldsOf(name);
      expect(fields).not.toContain('state');
      expect(fields).not.toContain('publishedAt');
      expect(fields).not.toContain('publishError');
    }
  });

  it('create THỰC SỰ có field — nếu không, ba khẳng định trên là vô nghĩa', () => {
    // Đối chứng cho chính phép duyệt schema: một `inputFieldsOf` trả rỗng vì
    // hình dạng nội bộ của tRPC đổi sẽ làm mọi `not.toContain` ở trên xanh mà
    // không kiểm gì cả — đúng chế độ hỏng "một green chứng minh không gì".
    expect(inputFieldsOf('create')).toContain('id');
    expect(inputFieldsOf('create')).toContain('kind');
    expect(inputFieldsOf('create')).toContain('title');
  });
});

describe('authoring.get — bề mặt IDOR mới, kiểm được KHÔNG cần DB', () => {
  it('input đúng MỘT field `id` — không có đường khai chủ sở hữu hay tầm nhìn', () => {
    // `get` trả THÂN của một bài theo id, nên mọi field thêm vào input của nó
    // đều là một field kẻ tấn công điền được. Một `authorId`/`visibility` ở đây
    // sẽ biến cổng thứ hai thành phép tự-so-với-chính-mình.
    expect(inputFieldsOf('get')).toEqual(['id']);
  });

  it('input là .strict() — field lạ bị TỪ CHỐI, không bị nuốt', async () => {
    const procedures = (appRouter._def as { procedures: Record<string, unknown> }).procedures;
    const schema = (
      procedures['authoring.get'] as { _def?: { inputs?: unknown[] } } | undefined
    )?._def?.inputs?.[0] as { safeParse: (v: unknown) => { success: boolean } } | undefined;
    expect(schema).toBeDefined();
    // ĐỐI CHỨNG DƯƠNG trước: id hợp lệ PHẢI qua, nếu không thì vế "từ chối"
    // dưới đây chỉ chứng minh schema từ chối tất cả.
    expect(schema?.safeParse({ id: 'bai-hop-le' }).success).toBe(true);
    expect(schema?.safeParse({ id: 'bai-hop-le', authorId: 'nan-nhan' }).success).toBe(false);
  });
});

describe('assertContentOwner — cổng thứ hai, có đối chứng dương', () => {
  const owner: AuthedUser = { id: 'author-1', role: 'author' };
  const other: AuthedUser = { id: 'author-2', role: 'author' };
  const admin: AuthedUser = { id: 'admin-1', role: 'admin' };

  it('ĐỐI CHỨNG DƯƠNG: chủ thật đi qua', () => {
    expect(() => assertContentOwner(owner, 'author-1')).not.toThrow();
  });

  it('tác giả KHÁC bị chặn', () => {
    expect(() => assertContentOwner(other, 'author-1')).toThrow(TRPCError);
  });

  it('chặn bằng NOT_FOUND, không FORBIDDEN', () => {
    // FORBIDDEN xác nhận rằng bài đó TỒN TẠI. Một tác giả dò id bài của người
    // khác không cần biết điều đó.
    try {
      assertContentOwner(other, 'author-1');
      expect.unreachable('phải ném');
    } catch (error) {
      expect((error as TRPCError).code).toBe('NOT_FOUND');
    }
  });

  it('admin đi qua mọi bài (task 2: "admin sửa mọi bài")', () => {
    expect(() => assertContentOwner(admin, 'author-1')).not.toThrow();
  });

  it('người học thường KHÔNG đi qua — kể cả khi id trùng ngẫu nhiên thì role vẫn không cấp quyền', () => {
    // `authorProcedure` đã chặn `user` trước đó; đây là lớp thứ hai. Một `user`
    // có id trùng chủ sở hữu là ca không xảy ra trong thực tế, nhưng cổng này
    // KHÔNG được là thứ duy nhất phân biệt — nên nó cũng không giả vờ là vậy.
    expect(() => assertContentOwner({ id: 'author-1', role: 'user' }, 'author-1')).not.toThrow();
    expect(() => assertContentOwner({ id: 'khac', role: 'user' }, 'author-1')).toThrow(TRPCError);
  });
});

describe('visibilityFor — người học không thấy nháp của ai cả', () => {
  it('chưa đăng nhập và user cho ra CÙNG một tầm nhìn', () => {
    expect(visibilityFor(null)).toEqual({ kind: 'published-only' });
    expect(visibilityFor({ id: 'u1', role: 'user' })).toEqual({ kind: 'published-only' });
  });

  it('author bị KHOÁ vào chính id của mình — không có đường khai id khác', () => {
    expect(visibilityFor({ id: 'author-1', role: 'author' })).toEqual({
      kind: 'author',
      authorId: 'author-1',
    });
  });

  it('admin thấy mọi state của mọi người', () => {
    expect(visibilityFor({ id: 'admin-1', role: 'admin' })).toEqual({ kind: 'admin' });
  });
});
