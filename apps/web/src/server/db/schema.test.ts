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
    expect(byName['event']?.enumValues).toEqual([
      'created',
      'claimed',
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
    expect(Object.keys(byName).sort()).toEqual(
      ['id', 'public_key', 'private_key', 'created_at', 'expires_at'].sort(),
    );
    // notNull=false có chủ ý: khoá sinh ra trước khi bật rotation không có hạn.
    expect(byName['expires_at']?.notNull).toBe(false);
  });
});
