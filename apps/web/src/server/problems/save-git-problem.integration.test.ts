import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, like, inArray } from 'drizzle-orm';
import { GIT_LEVELS, draftFromLevel, type LevelDraft } from '@devops-platform/games';
import { createDatabase } from '../db/client';
import { problems, users } from '../db/schema';
import {
  draftToProblemBody,
  type ProblemExtras,
} from '../../components/games/git/builder/draft-to-problem';
import { createProblem, updateProblem } from './crud';
import type { AuthedUser } from '../trpc/init';
import { problemBodySchema } from './validate';

/**
 * §18.E.5 đi TRỌN đường: bản nháp Builder → ánh xạ → biên ghi Zod → Postgres.
 *
 * ## Vì sao phải là một ô tích hợp, không phải ba ô đơn vị
 *
 * Ba mảnh đã có ô riêng và cả ba đều xanh TRƯỚC khi đường này chạy được:
 * `draft-to-problem.test.ts` đo bảng ánh xạ, `validate.test.ts` đo schema,
 * `problem-code.test.ts` đo khuôn mã. Thứ không mảnh nào đo được là **chỗ NỐI**:
 * `draftToProblemBody` trả một object mà `problemBodySchema` chưa chắc nhận
 * (nó `.strict()`, nên một khoá thừa là 400), và `createProblem` cấp mã qua một
 * truy vấn Postgres mà không test đơn vị nào chạm tới.
 *
 * Đo 2026-09-15: trước lượt này, cả ba ô đơn vị xanh trong khi đường thật ĐỎ ở
 * hai chỗ liên tiếp — `nextProblemCode` cấp `K8S-` cho bài Git, rồi
 * `problemCodeSchema` từ chối chính cái mã mà nó vừa cấp.
 *
 * ## Vì sao KHÔNG có ô nào gọi qua tRPC ở đây
 *
 * `problems.create` là `authorProcedure`, và dựng một `ctx` giả cho nó là dựng
 * lại chính phép xác thực mà ô này không đo. Lớp mỏng giữa `create` và
 * `createProblem` đúng một dòng (`createProblem(ctx.db, ctx.user.id, input)`),
 * và input của nó CHÍNH LÀ `problemBodySchema` — thứ ô dưới chạy trực tiếp. Nên
 * ô này đo đúng phần có thể sai, không nhiều hơn.
 *
 * ⚠ ĐÒI Postgres đang chạy (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const { db, sql } = createDatabase();

const AUTHOR_ID = 'u-p18e5-author';
/** Prefix slug riêng để dọn được chính xác những dòng ô này tạo ra. */
const SLUG_PREFIX = 'p18e5';

const G01 = GIT_LEVELS[0]!;

function draft(patch: Partial<LevelDraft> = {}): LevelDraft {
  return { ...draftFromLevel(G01), id: 'git-tu-dung-e5', ...patch };
}

function extras(d: LevelDraft, patch: Partial<ProblemExtras> = {}): ProblemExtras {
  return {
    topics: ['commit'],
    tags: [],
    hintPenalties: d.hints.map(() => 0),
    objectiveVisible: d.objectives.map(() => true),
    ...patch,
  };
}

/**
 * Ánh xạ rồi ĐI QUA biên ghi. `parse` chứ không `safeParse`: một body trượt Zod
 * ở đây là hỏng thật, và ném kèm `path` của field sai nói nhiều hơn một
 * `expect(...).toBe(true)` trên một boolean.
 */
function bodyFor(d: LevelDraft, title: string, patch: Partial<ProblemExtras> = {}) {
  const mapped = draftToProblemBody({ ...d, title }, extras(d, patch));
  expect(mapped, 'bản nháp gá phải ánh xạ được').not.toBeNull();
  return problemBodySchema.parse(mapped);
}

/** Số thứ tự của một mã, để so hai lần cấp liên tiếp mà không chốt cứng `0001`. */
function serialOf(code: string): number {
  return Number(code.slice(code.indexOf('-') + 1));
}

async function cleanup(): Promise<void> {
  await db.delete(problems).where(like(problems.slug, `${SLUG_PREFIX}-%`));
  await db.delete(users).where(inArray(users.id, [AUTHOR_ID]));
}

beforeAll(async () => {
  await cleanup();
  await db
    .insert(users)
    .values([
      { id: AUTHOR_ID, name: AUTHOR_ID, email: `${AUTHOR_ID}@test.local`, role: 'user' as const },
    ]);
});

afterAll(async () => {
  await cleanup();
  await sql.end();
});

describe('lưu bản nháp Builder thành một dòng problems', () => {
  it('ánh xạ đi qua được biên ghi, và dòng lưu ra mang mã của dãy GIT', async () => {
    const body = bodyFor(draft(), `${SLUG_PREFIX} bai git mot`);
    const stored = await createProblem(db, AUTHOR_ID, body);

    expect(stored.code).toMatch(/^GIT-\d{4}$/u);
    expect(stored.gameId).toBe('git');
    // Luôn ra đời ở `draft` — mã không tới từ body, chủ sở hữu cũng vậy.
    expect(stored.state).toBe('draft');
    expect(stored.authorId).toBe(AUTHOR_ID);
  });

  it('hai lần lưu liên tiếp cho hai mã liền nhau TRONG dãy GIT', async () => {
    const first = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} git a`));
    const second = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} git b`));
    expect(serialOf(second.code)).toBe(serialOf(first.code) + 1);
  });

  /*
   * Ô đắt nhất của file. Trước lượt này `nextProblemCode` đọc `max(code)` trên
   * MỘT khuôn duy nhất, nên một bài K8s vừa tạo sẽ đẩy số thứ tự của dãy Git
   * lên theo — hai dãy dùng chung một bộ đếm. Triệu chứng không phải một lỗi:
   * nó là những khoảng trống trong cả hai dãy mã, vĩnh viễn, không ai truy được.
   */
  it('một bài K8s chen vào giữa KHÔNG đẩy số thứ tự của dãy Git', async () => {
    const gitFirst = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} git c`));

    const k8sBody = problemBodySchema.parse({
      ...bodyFor(draft(), `${SLUG_PREFIX} k8s chen`),
      gameId: 'k8s',
      topics: ['workload'],
      // Game K8s giữ nguyên độ chặt cũ: `clusterSpecSchema` vẫn là thứ chạy.
      initialState: {
        nodes: [{ name: 'n1', cpu: 1000, memory: 1024, ready: true }],
        namespaces: ['ns'],
        resources: [],
      },
    });
    const k8s = await createProblem(db, AUTHOR_ID, k8sBody);
    expect(k8s.code).toMatch(/^K8S-\d{4}$/u);

    const gitSecond = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} git d`));
    expect(serialOf(gitSecond.code)).toBe(serialOf(gitFirst.code) + 1);
  });

  it('cây đích vắng mặt đi xuống cột thành null, không thành undefined', async () => {
    const body = bodyFor(draft({ target: null }), `${SLUG_PREFIX} khong dich`);
    const stored = await createProblem(db, AUTHOR_ID, body);
    // `toRowValues` đổi "vắng mặt" của hợp đồng thành `null` của cột. Không có
    // phép đổi đó, Drizzle bỏ khoá và `initial_state`/`target_state` giữ giá trị
    // cũ ở đường `update` — một phép xoá không xoá gì.
    expect(stored.targetState ?? null).toBeNull();
  });

  it('cây đích có thì đi xuống nguyên vẹn', async () => {
    const target = { commits: [{ id: 'c1', message: 'khoi tao' }], branches: { main: 'c1' } };
    const stored = await createProblem(
      db,
      AUTHOR_ID,
      bodyFor(draft({ target }), `${SLUG_PREFIX} co dich`),
    );
    expect(stored.targetState).toEqual(target);
  });

  it('testcase lưu xuống mang visible và KHÔNG mang required', async () => {
    const d = draft();
    const stored = await createProblem(
      db,
      AUTHOR_ID,
      bodyFor(d, `${SLUG_PREFIX} testcase`, { objectiveVisible: d.objectives.map(() => false) }),
    );
    expect(stored.testcases.length).toBeGreaterThan(0);
    for (const testcase of stored.testcases) {
      expect(testcase.visible).toBe(false);
      expect('required' in testcase).toBe(false);
    }
  });

  it('par 0 của bản nháp lưu xuống thành parMoves null, không thành 400', async () => {
    // Nếu ánh xạ gửi thẳng `0` thì `bodyFor` ném ngay ở `parse` — `.positive()`.
    const stored = await createProblem(
      db,
      AUTHOR_ID,
      bodyFor(draft({ par: 0 }), `${SLUG_PREFIX} par khong`),
    );
    expect(stored.parMoves).toBeNull();
  });

  it('seedable false, allowedResources null — hai lời khai đi tới tận cột', async () => {
    const stored = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} co`));
    expect(stored.seedable).toBe(false);
    expect(stored.allowedResources).toBeNull();
  });
});

/**
 * Cổng đổi game — siết vô điều kiện 2026-09-15.
 *
 * ## Vì sao ô này sống ở ĐÂY chứ không ở một file mới
 *
 * Nó đo cùng một đường ghi (`crud.ts` trên một bài Git thật đã lưu) và cần đúng
 * bộ đồ gá trên. Một file mới sẽ phải dựng lại tác giả, bản nháp, và phép dọn —
 * ba thứ mà một lượt sửa sau này phải nhớ cập nhật ở hai chỗ.
 *
 * ## Thứ ô này gác, và thứ nó KHÔNG gác
 *
 * Gác: API không còn rộng hơn biểu mẫu. `problem-editor.tsx` truyền
 * `canChange={props.code === null}` nên màn hình đã cấm đổi game của một bài đã
 * lưu; cổng cũ ở máy chủ thì vẫn cho, miễn là chưa ai nộp. Khoảng chênh đó là
 * chỗ `K8S-0007` có thể mang `game_id = 'git'` — vĩnh viễn, vì mã bài ổn định.
 *
 * KHÔNG gác: những dòng ĐÃ lệch từ trước lượt siết này. Không có phép đo nào
 * phân biệt được chúng với một bài cố tình đặt tên lạ, và cấp lại mã cho chúng
 * là phá đúng thứ cổng này bảo vệ. `nextProblemCode` lọc theo TIỀN TỐ MÃ nên
 * chúng không làm hỏng việc cấp mã — xem khối chú thích ở `next-code.ts`.
 */
describe('không đổi được game của một bài đã tạo', () => {
  const USER: AuthedUser = { id: AUTHOR_ID, role: 'author' };

  it('từ chối kể cả khi bài CHƯA có lượt nộp nào', async () => {
    /*
     * "Chưa ai nộp" là đúng ca mà cổng CŨ cho qua, nên đây là ô đỏ-nếu-ai-đó-nới
     * lại. Một ô chỉ thử ca "đã có lượt nộp" sẽ xanh trên cả bản cũ lẫn bản mới,
     * tức không đo gì về lượt siết này.
     */
    const stored = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} khoa game`));
    expect(stored.gameId).toBe('git');

    const doiSangK8s = {
      ...bodyFor(draft(), `${SLUG_PREFIX} khoa game`),
      gameId: 'k8s' as const,
      initialState: { nodes: [], workloads: [] },
      topics: [],
    };

    await expect(updateProblem(db, USER, stored.code, doiSangK8s)).rejects.toThrow(
      /Không đổi được game/u,
    );

    // Và dòng trong DB KHÔNG đổi — một cổng ném sau khi đã ghi là một cổng hỏng.
    const rows = await db.select().from(problems).where(eq(problems.code, stored.code)).limit(1);
    expect(rows[0]?.gameId).toBe('git');
  });

  it('GIỮ NGUYÊN game thì sửa bình thường — cổng không chặn nhầm', async () => {
    /*
     * Đối chứng dương. Không có ô này thì một cổng ném với MỌI lượt `update`
     * cũng làm ô trên xanh, và trang soạn bài sẽ không lưu được gì nữa.
     */
    const stored = await createProblem(db, AUTHOR_ID, bodyFor(draft(), `${SLUG_PREFIX} sua thuong`));
    const sua = bodyFor(draft(), `${SLUG_PREFIX} sua thuong`);
    const updated = await updateProblem(db, USER, stored.code, {
      ...sua,
      title: `${SLUG_PREFIX} tieu de moi`,
    });
    expect(updated.title).toBe(`${SLUG_PREFIX} tieu de moi`);
    expect(updated.gameId).toBe('git');
  });
});
