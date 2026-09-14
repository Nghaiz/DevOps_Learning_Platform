import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { inArray } from 'drizzle-orm';
import {
  closeTestDb,
  ctxFor,
  purgeLeakedFixtures,
  testDb,
  uniqueId,
} from '../../security/test-helpers';
import { users, type User } from '../db/schema';
import { appRouter } from '../trpc/routers/app-router';

/**
 * ⛔ **AC-F, vế HTTP THẬT.**
 *
 * ## Vì sao file này tồn tại bên cạnh `authz.integration.test.ts`
 *
 * `appRouter.createCaller` KHÔNG đi qua `getErrorShape`, và `getErrorShape` là
 * chỗ duy nhất `errorFormatter` chạy. Một test viết bằng `createCaller` quan
 * sát được `TRPCError` ném ra, nhưng **không bao giờ quan sát được mã HTTP
 * hay thân phản hồi mà trình duyệt thật nhận** — đúng bẫy mà
 * `security/trpc-error-leak.test.ts` đã ghi lại, và đúng bẫy đã cắn repo này
 * một lần (router xanh trong khi HTTP thật trả 500).
 *
 * AC-F nói "gọi thẳng điểm cuối". Cái "thẳng" đó là HTTP. Nên phép đo ở đây đi
 * qua `fetchRequestHandler` với CHÍNH `appRouter` và CHÍNH `endpoint` mà
 * `app/api/trpc/[trpc]/route.ts` dùng.
 *
 * ## Cái file này KHÔNG chứng minh
 *
 * `createContext` dưới đây trả thẳng một user thay vì đọc cookie Better Auth.
 * Nên nó chứng minh tầng authz + tầng HTTP, KHÔNG chứng minh tầng phiên đăng
 * nhập. Nói ra thay vì để người đọc suy ra nhầm; phép kiểm phiên đã có chỗ
 * khác (`security/rule-06-access-token.test.ts`).
 *
 * ⚠ ĐÒI Postgres.
 */

const ADMIN = uniqueId('http-adm');
const MEMBER = uniqueId('http-sv');

const MEMBER_EMAIL = `${MEMBER}@test.local`;
let classId = '';

function callerAs(id: string, role: User['role']) {
  return appRouter.createCaller(ctxFor({ id, role }));
}

/**
 * Một lượt GET đúng như trình duyệt gửi.
 *
 * Truy vấn tRPC v11 không bật `batch` đi bằng GET với `?input=<json>` và KHÔNG
 * có transformer trong ứng dụng này, nên `input` là JSON trần của chính object
 * đầu vào. Gửi sai hình dạng chỉ nhận `BAD_REQUEST` mơ hồ, nên hình dạng này
 * được ô "đối chứng dương" bên dưới chốt lại: nếu nó sai thì admin cũng không
 * đọc được, và ô đó đỏ.
 */
async function httpQuery(
  path: string,
  input: Record<string, unknown>,
  user: { id: string; role: User['role'] } | null,
): Promise<{ status: number; body: string }> {
  const url = `http://localhost/api/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`;
  const response = await fetchRequestHandler({
    endpoint: '/api/trpc',
    req: new Request(url, { method: 'GET' }),
    router: appRouter,
    createContext: () => Promise.resolve(ctxFor(user)),
  });
  return { status: response.status, body: await response.text() };
}

beforeAll(async () => {
  await purgeLeakedFixtures(testDb());

  await testDb().insert(users).values([
    { id: ADMIN, name: 'Giảng viên HTTP', email: `${ADMIN}@test.local`, role: 'admin' },
    { id: MEMBER, name: 'Sinh viên HTTP', email: MEMBER_EMAIL },
  ]);

  const created = await callerAs(ADMIN, 'admin').classes.create({ name: uniqueId('Lop-HTTP') });
  classId = created.id;
  await callerAs(ADMIN, 'admin').classes.addMember({ classId, email: MEMBER_EMAIL });
});

afterAll(async () => {
  await testDb().delete(users).where(inArray(users.id, [ADMIN, MEMBER]));
  await closeTestDb();
});

describe('AC-F qua HTTP thật · classes.scoreboard', () => {
  it('ĐỐI CHỨNG DƯƠNG: admin nhận 200 và email của sinh viên CÓ trong thân phản hồi', async () => {
    /*
      Ô này chạy TRƯỚC ô từ chối, và thứ tự đó có chủ đích. Nó chốt hai thứ mà
      nếu thiếu thì ô dưới xanh một cách vô nghĩa:

       · hình dạng URL/`input` ở trên là ĐÚNG (sai thì đây là 400, không phải 200);
       · email của người khác THẬT SỰ đi qua đường HTTP này khi người gọi có
         quyền, nên phép tìm chuỗi ở ô dưới có cái để tìm.
    */
    const res = await httpQuery('classes.scoreboard', { classId }, { id: ADMIN, role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body).toContain(MEMBER_EMAIL);
  });

  it('sinh viên trong lớp gọi thẳng ⇒ HTTP 403, và thân phản hồi KHÔNG chứa dữ liệu nào', async () => {
    const res = await httpQuery('classes.scoreboard', { classId }, { id: MEMBER, role: 'user' });

    expect(res.status).toBe(403);

    const payload = JSON.parse(res.body) as {
      error?: { data?: { code?: string; httpStatus?: number } };
      result?: unknown;
    };
    expect(payload.error?.data?.code).toBe('FORBIDDEN');
    expect(payload.error?.data?.httpStatus).toBe(403);
    expect(payload.result).toBeUndefined();

    /*
      Khẳng định NẶNG nhất của cả ô: email của chính người gọi cũng không có
      trong phản hồi. Đây là phép tìm trên THÂN THÔ chứ không trên một field đã
      bóc, nên nó bắt được cả một lượt rò qua `data.stack` hay qua thông điệp
      lỗi, chứ không chỉ qua `result.data`.
    */
    expect(res.body).not.toContain(MEMBER_EMAIL);
    expect(res.body).not.toContain(`${ADMIN}@test.local`);
  });

  it('danh sách sinh viên cũng 403 qua HTTP, không chỉ bảng điểm', async () => {
    // 18.F.3 nói "ở MỌI điểm cuối liên quan". Danh sách thành viên mang email
    // của cả lớp, nên nó là cùng một loại dữ liệu với bảng điểm.
    const res = await httpQuery('classes.members', { classId }, { id: MEMBER, role: 'user' });
    expect(res.status).toBe(403);
    expect(res.body).not.toContain(MEMBER_EMAIL);
  });

  it('người chưa đăng nhập ⇒ HTTP 401', async () => {
    const res = await httpQuery('classes.scoreboard', { classId }, null);
    expect(res.status).toBe(401);
    expect(res.body).not.toContain(MEMBER_EMAIL);
  });
});
