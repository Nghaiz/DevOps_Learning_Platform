import { readFileSync } from 'node:fs';
import { getTableColumns } from 'drizzle-orm';
import { getAuthTables } from 'better-auth/db';
import { jwt } from 'better-auth/plugins';
import { describe, expect, it } from 'vitest';

import * as schema from './schema';

/**
 * Cổng gác: bảng Drizzle phải phủ MỌI field Better Auth khai.
 *
 * ## Lỗi ô này sinh ra để chặn, và nó đã sống thật
 *
 * Bản 1.7 thêm hai cột vào `jwks` (`alg`, `crv` — `plugins/jwt/schema.ts`). Ta
 * bump phiên bản mà không thêm cột, và adapter ném:
 *
 *     BetterAuthError: The field "alg" does not exist in the "jwks" Drizzle schema.
 *
 * ⛔ Nhưng nó CHỈ ném khi phải TẠO một khoá mới. Một DB đã có sẵn dòng `jwks` đi
 * đường khác và không chạm cột đó — nên ở máy đã chạy lâu, cả bộ test xanh trọn
 * vẹn, còn CI (DB dựng mới mỗi lượt) đỏ **51 ô**. Đúng hình dạng
 * `rules/green-that-proves-nothing.md`: phép đo xanh vì dữ liệu cũ, không vì mã
 * đúng. Đo 2026-09-18, PR #148.
 *
 * Ô này hỏi thẳng chính Better Auth nó cần những field nào, nên nó đỏ ngay lúc
 * `pnpm install`, trên mọi máy, không cần một DB rỗng để lộ ra.
 *
 * ## Vì sao KHÔNG gọi `buildAuth()`
 *
 * `buildAuth` đọc env bắt buộc và mở kết nối DB (`getDb()`). Ô này chỉ cần phần
 * KHAI BÁO, và `getAuthTables` là API công khai trả đúng phần đó từ options.
 * Cái giá: danh sách plugin phải chép lại — nên ô cuối file gác chính chỗ chép.
 */

/** Model của Better Auth → bảng Drizzle tương ứng trong `schema.ts`. */
const BANG: Readonly<Record<string, Record<string, unknown>>> = {
  user: getTableColumns(schema.users),
  session: getTableColumns(schema.sessions),
  account: getTableColumns(schema.accounts),
  verification: getTableColumns(schema.verifications),
  jwks: getTableColumns(schema.jwks),
};

/**
 * ⚠ Phải KHỚP `plugins:` của `server/auth/config.ts`. Ô cuối file gác điều đó —
 * thêm plugin thứ hai ở kia mà quên ở đây thì ô kia đỏ, không phải ô này.
 */
const tablesCuaBetterAuth = getAuthTables({ plugins: [jwt({})] });

describe('bảng Drizzle phủ đủ field Better Auth khai', () => {
  it('có ít nhất năm model — nếu không, vòng dưới không đo gì', () => {
    // Đối chứng cho một `getAuthTables` trả rỗng: khi đó mọi vòng lặp dưới đây
    // chạy 0 lần và cả describe này xanh mà chưa so một field nào.
    expect(Object.keys(tablesCuaBetterAuth).length).toBeGreaterThanOrEqual(5);
    expect(Object.keys(tablesCuaBetterAuth)).toContain('jwks');
  });

  for (const [model, def] of Object.entries(tablesCuaBetterAuth)) {
    it(`"${model}": mọi field Better Auth cần đều có cột`, () => {
      const cot = BANG[model];
      expect(cot, `chưa ánh xạ model "${model}" sang bảng Drizzle nào`).toBeDefined();
      if (cot === undefined) return;

      const thieu = Object.keys(def.fields).filter((field) => !(field in cot));
      expect(thieu, `bảng "${model}" thiếu cột`).toEqual([]);
    });
  }

  /*
   * ĐỐI CHỨNG DƯƠNG. Không có ô này thì một `BANG` trỏ nhầm sang bảng thừa cột
   * (hoặc một `getTableColumns` trả rỗng) vẫn làm mọi ô trên xanh.
   */
  it('đỏ được: một bảng thiếu cột thì bị bắt', () => {
    const jwksFields = Object.keys(tablesCuaBetterAuth['jwks']?.fields ?? {});
    expect(jwksFields).toContain('alg');

    const gaThieuCot = { id: null, publicKey: null } as Record<string, unknown>;
    const thieu = jwksFields.filter((field) => !(field in gaThieuCot));
    expect(thieu.length).toBeGreaterThan(0);
  });
});

describe('danh sách plugin ở đây phải khớp config thật', () => {
  it('`config.ts` khai ĐÚNG một plugin, và đó là `jwt`', () => {
    /*
     * Đọc mã nguồn thay vì import: `config.ts` gọi `getDb()` và `requireEnv` ở
     * thân `buildAuth`, nên import nó vào một ô test là kéo cả kết nối DB theo.
     *
     * Ô này là dây nối giữa hằng `[jwt({})]` ở trên và cấu hình thật. Thêm một
     * plugin ở `config.ts` mà quên ở đây thì bảng của plugin mới KHÔNG được ai
     * gác — và đó đúng là cách hai cột `jwks` lọt qua lần đầu.
     */
    const nguon = readFileSync(new URL('../auth/config.ts', import.meta.url), 'utf8');
    const khoi = /plugins:\s*\[([\s\S]*?)\n\s{4}\],/u.exec(nguon)?.[1] ?? '';
    expect(khoi, 'không tìm thấy khối `plugins:` trong config.ts').not.toBe('');

    const ten = [...khoi.matchAll(/^\s{6}(\w+)\(/gmu)].map((m) => m[1]);
    expect(ten).toEqual(['jwt']);
  });
});
