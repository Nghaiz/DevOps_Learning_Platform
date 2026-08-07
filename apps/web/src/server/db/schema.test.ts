import { getTableConfig } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { progress, sessionsAudit, users } from './schema.js';

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

  it('sessions_audit KHÔNG có cột trạng thái sống nào ngoài audit', () => {
    // SSOT của session đang chạy là Redis. Nếu ai đó thêm cột kiểu `is_active`
    // vào đây, nó thành derived field và sẽ lệch với Redis.
    const columns = getTableConfig(sessionsAudit).columns.map((c) => c.name);
    expect(columns).not.toContain('is_active');
    expect(columns).not.toContain('current_status');
  });
});
