import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readRequestSession } from '../server/auth/config';

/**
 * `readRequestSession` (`server/auth/config.ts`) — MỘT lượt đụng DB mỗi request,
 * không phải hai.
 *
 * ## ⛔ Bài học đắt nhất của bộ này: đo trong vitest là ĐO NHẦM
 *
 * `cache()` của React có **hai hiện thực khác nhau**, chọn theo export
 * condition:
 *
 * | Build | `cache()` làm gì | Ai nạp nó |
 * |---|---|---|
 * | mặc định (client) | **KHÔNG memo gì** — gọi thẳng hàm gốc | vitest, jsdom, mọi Client Component |
 * | `react-server` | memo theo phạm vi render | Next, cho Server Component |
 *
 * Đo 2026-09-06 trên react 19.2.8 của repo, gọi một hàm đã `cache()` ba lần
 * trong CÙNG một phạm vi có dispatcher:
 *
 * ```
 * node probe.mjs                        → 3 lượt   (build client: cache() là no-op)
 * node --conditions=react-server ...    → 1 lượt   (build server: memo thật)
 * ```
 *
 * Nghĩa là một bài test "gọi hai lần rồi đếm" chạy trong vitest sẽ đếm ra 2 và
 * kết luận "cache() không hoạt động" — **sai**, nó hoạt động ở Next, chỉ là
 * không hoạt động ở nơi ta vừa đo. Đây đúng hạng lỗi `green-that-proves-nothing`
 * ở chiều ngược lại: một phép đo ĐỎ chứng minh sai cũng vô dụng như một phép đo
 * xanh chứng minh sai. Cách duy nhất đúng là đo trong condition mà Next dùng —
 * nên câu khẳng định chính chạy trong một tiến trình con
 * `node --conditions=react-server`.
 *
 * ## Phạm vi — nói thẳng cái bộ này KHÔNG chứng minh
 *
 * Nó chứng minh (a) cơ chế memo hoá có thật trong build Next dùng, (b) hình
 * dạng **zero-arg** là điều kiện bắt buộc để nó dedupe được, và (c)
 * `readRequestSession` đúng là zero-arg.
 *
 * Nó KHÔNG chứng minh mọi call-site đã đi qua hàm này — và hôm nay CHƯA:
 * `app/layout.tsx` còn gọi thẳng `getAuth().api.getSession(...)`, còn
 * `components/catalog/viewer-role.server.ts` tự bọc `cache()` lần thứ hai. Hai
 * bản `cache()` khác nhau là hai khoá khác nhau, tức vẫn hai lượt đụng DB. Cả
 * hai file thuộc lane khác nên lane BE2 không sửa; đã ghi vào report kèm patch
 * đề xuất. Cho tới lúc đó, tác dụng của file này là *có sẵn chỗ đúng để gọi*,
 * chưa phải *đã tiết kiệm được lượt truy vấn*.
 */

/** Chạy một đoạn JS trong condition mà Server Component dùng, trả về stdout. */
function measureUnderReactServer(script: string): string {
  return execFileSync(process.execPath, ['--conditions=react-server', '-e', script], {
    cwd: process.cwd(),
    encoding: 'utf8',
  }).trim();
}

/**
 * Cài đúng thứ React đòi để `cache()` hoạt động: một `AsyncDispatcher` với
 * `getCacheForType`, MỘT bản cho mỗi "request" — cùng hình dạng renderer Flight
 * của Next cài. Thứ được đo vẫn là `cache()` THẬT của React.
 */
const HARNESS = `
const React = require('react');
const key = Object.keys(React).find((k) => k.includes('INTERNALS'));
const internals = React[key];
if (internals === undefined) { throw new Error('React đổi tên khe dispatcher — cập nhật bộ test, đừng bỏ qua'); }
function scope(fn) {
  const per = new Map();
  internals.A = { getCacheForType: (create) => { if (!per.has(create)) per.set(create, create()); return per.get(create); } };
  try { return fn(); } finally { internals.A = null; }
}
`;

describe('readRequestSession — dedupe trong MỘT request', () => {
  it('zero-arg + cache(): BA lời gọi trong một lượt render ⇒ MỘT lượt đụng DB', () => {
    const out = measureUnderReactServer(`${HARNESS}
      let calls = 0;
      const readSession = React.cache(() => { calls += 1; return { user: { id: 'u1' } }; });
      scope(() => { readSession(); readSession(); readSession(); });
      console.log(JSON.stringify({ calls }));
    `);
    // ⛔ 3 ở đây nghĩa là dedupe KHÔNG xảy ra ở Next — món nợ hai lượt getSession
    // mà `app/layout.tsx` ghi lại vẫn còn nguyên.
    expect(JSON.parse(out)).toEqual({ calls: 1 });
  });

  it('HAI request ⇒ HAI lượt — phiên KHÔNG được nhớ xuyên request', () => {
    const out = measureUnderReactServer(`${HARNESS}
      let calls = 0;
      const readSession = React.cache(() => { calls += 1; return { user: { id: 'u1' } }; });
      scope(() => { readSession(); readSession(); });
      scope(() => { readSession(); readSession(); });
      console.log(JSON.stringify({ calls }));
    `);
    // Đối chứng dương của câu trên: nếu ai đó thay `cache()` bằng một singleton
    // module-scope thì câu trên vẫn xanh còn câu này đỏ — và một phiên nhớ
    // XUYÊN request là rò dữ liệu người này sang người khác, tệ hơn nhiều so
    // với hai lượt đụng DB. Cùng lý lẽ đã bắt `QueryClient` phải nằm trong
    // `useState` chứ không ở module scope (`lib/trpc-react.tsx`).
    expect(JSON.parse(out)).toEqual({ calls: 2 });
  });

  it('⛔ bọc cache() quanh hàm CÓ THAM SỐ object thì dedupe KHÔNG xảy ra', () => {
    const out = measureUnderReactServer(`${HARNESS}
      let calls = 0;
      // Đây là bản viết "tự nhiên" nhất và nó SAI:
      //   cache(async ({ headers }) => auth.api.getSession({ headers }))
      // rồi mỗi call-site gọi cached({ headers: await headers() }).
      const readSession = React.cache((opts) => { calls += 1; return opts; });
      const sharedHeaders = { cookie: 'x' };
      scope(() => {
        readSession({ headers: sharedHeaders });
        readSession({ headers: sharedHeaders });
        readSession({ headers: sharedHeaders });
      });
      console.log(JSON.stringify({ calls }));
    `);
    // `cache()` khoá theo ĐỊNH DANH của từng đối số. Mỗi call-site dựng một
    // object literal mới ⇒ khoá mới ⇒ 0 lần trúng cache, dù `headers` bên trong
    // là CÙNG một object. Không lỗi, không cảnh báo — chỉ là không tiết kiệm gì.
    // Đó là toàn bộ lý do `readRequestSession` không nhận tham số nào.
    expect(JSON.parse(out)).toEqual({ calls: 3 });
  });

  it('readRequestSession KHÔNG khai tham số nào — điều kiện để cache() có khoá ổn định', () => {
    // Câu ngắn nhất gắn ba phép đo trên vào mã thật của repo. Thêm một tham số
    // vào `readRequestSession` sẽ đỏ ở đây, TRƯỚC khi nó âm thầm vô hiệu hoá
    // toàn bộ việc dedupe (xem phép đo `calls: 3` ở trên).
    expect(readRequestSession.length).toBe(0);
  });

  it('readRequestSession thật sự được bọc `cache()`, không chỉ là một hàm thường', () => {
    /**
     * Phép kiểm trên NGUỒN, và có lý do: ở build client mà vitest nạp,
     * `cache(fn)` trả về một hàm bọc không phân biệt được với một hàm thường từ
     * bên ngoài — nên không có cách nào kiểm điều này lúc chạy Ở ĐÂY. Chỗ duy
     * nhất phân biệt được là chính dòng khai báo.
     *
     * Nó gác đúng MỘT chế độ hỏng, chế độ dễ xảy ra nhất: ai đó gỡ `cache()`
     * (vì "nó chẳng làm gì trong test") và mọi thứ vẫn xanh, vẫn chạy, chỉ là
     * lại hai lượt đụng DB mỗi request.
     */
    const source = readFileSync(
      new URL('../server/auth/config.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(/export const readRequestSession = cache\(/);
  });
});
