import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { jwks, progress, sessionsAudit, users } from './schema';

// Test này không cần DB — nó gác HÌNH DẠNG schema, thứ mà migration sẽ đóng băng.
describe('schema Postgres', () => {
  it('dựng đúng 3 bảng của P0', () => {
    expect(getTableConfig(users).name).toBe('users');
    expect(getTableConfig(sessionsAudit).name).toBe('sessions_audit');
    expect(getTableConfig(progress).name).toBe('progress');
  });

  it('users mang đủ field lõi Better Auth cần ở 0.D', () => {
    const columns = getTableConfig(users).columns.map((c) => c.name);
    expect(columns).toEqual(
      expect.arrayContaining([
        'id',
        'name',
        'email',
        'email_verified',
        'image',
        'role',
        'created_at',
        'updated_at',
      ]),
    );
  });

  it('email là unique — chặn trùng tài khoản ở tầng DB, không chỉ tầng app', () => {
    const uniques = getTableConfig(users).indexes.filter((i) => i.config.unique);
    expect(uniques.map((i) => i.config.name)).toContain('users_email_key');
  });

  it('progress unique theo (user, lesson) — một dòng cho mỗi cặp', () => {
    const unique = getTableConfig(progress).indexes.find((i) => i.config.unique);
    expect(unique?.config.columns.map((c) => ('name' in c ? c.name : ''))).toEqual([
      'user_id',
      'lesson_id',
    ]);
  });

  // SSOT của session đang chạy là Redis. Bảng này là nhật ký append-only.
  //
  // Assert ALLOWLIST ĐẦY ĐỦ chứ không phải "không chứa vài tên tôi tự nghĩ ra":
  // bản trước kiểm `not.toContain('is_active')` trong khi bảng đang có `status`,
  // `claimed_at`, `reaped_at` — đúng loại cột nó tưởng đang cấm. Test mãi xanh và
  // khiến người đọc tin luật no-derived-field đang được gác. Danh sách đóng nghĩa
  // là THÊM bất kỳ cột nào cũng làm test đỏ, buộc người thêm phải cân nhắc.
  it('sessions_audit chỉ chứa đúng bộ cột của một nhật ký sự kiện', () => {
    const columns = getTableConfig(sessionsAudit)
      .columns.map((c) => c.name)
      .sort();
    expect(columns).toEqual(
      [
        'id',
        'session_id',
        'user_id',
        'event',
        'tier',
        'pod_name',
        'namespace',
        'expires_at',
        'detail',
        'occurred_at',
      ].sort(),
    );
  });

  // Audit phải sống lâu hơn user: xoá tài khoản không được xoá bằng chứng.
  it('sessions_audit không có FK cascade tới users', () => {
    expect(getTableConfig(sessionsAudit).foreignKeys).toHaveLength(0);
  });

  // tier/status là text trần thì typo "runing" ghi vào được, chỉ lộ khi query lọc
  // trả rỗng. Enum đẩy lỗi đó về lúc ghi.
  it('sessions_audit dùng enum cho event và tier, không phải text trần', () => {
    const byName = Object.fromEntries(
      getTableConfig(sessionsAudit).columns.map((c) => [c.name, c]),
    );
    // THỨ TỰ có ý nghĩa: `ALTER TYPE … ADD VALUE 'x' BEFORE 'y'` của Postgres
    // chèn vào đúng vị trí, và Drizzle sinh migration theo thứ tự khai ở đây.
    // Đảo thứ tự trong schema.ts sẽ sinh một migration khác hẳn.
    //
    // Danh sách này là contract LIÊN NGÔN NGỮ: Go ghi các giá trị này bằng chuỗi
    // (services/orchestrator/internal/lifecycle/audit.go). Thêm một giá trị ở
    // đây mà quên bên Go thì không lỗi nào báo — chỉ là một sự kiện không bao
    // giờ được ghi. Chiều ngược lại thì INSERT lỗi ở runtime.
    expect(byName['event']?.enumValues).toEqual([
      'created',
      'claimed',
      'extended',
      'expired',
      'reaped',
      'failed',
    ]);
    expect(byName['tier']?.enumValues).toEqual(['sysbox', 'gvisor', 'kata']);
  });

  // R5 (phase-0.md): bật key rotation mà bảng jwks thiếu expires_at thì khoá cũ
  // verify được vĩnh viễn — thu hồi khoá lộ thành bất khả. Cột phải có mặt
  // TRƯỚC, nên gác bằng test chứ không bằng lời hứa trong doc.
  it('jwks có expires_at, và nó NULLABLE', () => {
    const byName = Object.fromEntries(getTableConfig(jwks).columns.map((c) => [c.name, c]));
    /*
     * PHỦ, không phải BẰNG — đổi 2026-09-18 và đây là một nới lỏng CÓ CHỦ Ý.
     *
     * Bản cũ khẳng định danh sách cột ĐÚNG BẰNG năm cái. Nhưng bảng này do Better
     * Auth sở hữu, nên mỗi lần nó thêm field là ô này đỏ — và đỏ vì một lý do
     * KHÔNG phải lý do nó sinh ra (1.7 thêm `alg` + `crv`, hai cột tuỳ chọn hoàn
     * toàn hợp lệ). Một ô đỏ vì lý do sai là một ô người ta học cách sửa số cho
     * qua, và lần sau nó không còn gác gì.
     *
     * Câu "bảng có ĐỦ cột Better Auth cần" nay có ô riêng và hỏi thẳng chính thư
     * viện: `better-auth-schema.test.ts`. Ô này giữ đúng phần của nó — R5, thu
     * hồi khoá — nên nó chỉ đòi `expires_at` có mặt và NULLABLE.
     */
    for (const cot of ['id', 'public_key', 'private_key', 'created_at', 'expires_at']) {
      expect(Object.keys(byName), `jwks thiếu cột ${cot}`).toContain(cot);
    }
    // notNull=false có chủ ý: khoá sinh ra trước khi bật rotation không có hạn.
    expect(byName['expires_at']?.notNull).toBe(false);
  });
});
