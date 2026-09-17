import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { like, inArray } from 'drizzle-orm';
import {
  CICD_PROBLEMS_SEED,
  gradeCicdProblem,
  writeWorkflowYaml,
  type CicdGameAction,
  type CicdProblemSpec,
} from '@devops-platform/games';
import { createDatabase } from '../db/client';
import { problems, users } from '../db/schema';
import { createProblem } from './crud';
import { problemBodySchema } from './validate';

/**
 * §19.J: soạn một bài CI/CD đi TRỌN đường — body → biên ghi Zod → Postgres →
 * đọc lại → CHẤM.
 *
 * ## Vì sao ô này tồn tại, và vì sao nó KHÔNG phải một ô Playwright
 *
 * Việc để lại của 19.J ghi: *"ô e2e SOẠN một bài CI/CD qua `/author/problems`"*.
 * Chặn nó KHÔNG phải cái form — mà là VAI TRÒ: `problems.create` là
 * `authorProcedure`, và vai trò đầu tiên chỉ đặt được từ ngoài hệ thống
 * (`e2e/scripts/promote-role.sh`, dùng `kubectl`, và chính nó ghi *"KHÔNG bao
 * giờ chạy trong CI"*). Một ô Playwright soạn đề trong `e2e:ci` sẽ `test.skip`,
 * và một lượt skip sạch trông y hệt một lượt xanh.
 *
 * Nên phần CÓ THỂ ĐO được đo ở đây, ở đúng tầng mà `save-git-problem.integration.test.ts`
 * đã chọn cho game trước — và khối chú thích của file đó giải thích vì sao không
 * gọi qua tRPC: lớp giữa `problems.create` và `createProblem` đúng một dòng, và
 * input của nó CHÍNH LÀ `problemBodySchema`, thứ ô dưới chạy trực tiếp.
 *
 * ## Thứ không mảnh nào khác đo được
 *
 * `validate.test.ts` đo schema; `problems-seed.test.ts` đo bộ chấm. Cả hai xanh
 * TRƯỚC khi đường này chạy được. Chỗ NỐI là thứ còn lại:
 *
 *  - cột `game_id` phải ra `'cicd'` (nó có MẶC ĐỊNH `'k8s'` — một đường ghi quên
 *    trường này lưu bài CI/CD dưới cờ K8s, và `gradeProblemRun` tra sai plugin);
 *  - mã bài phải thuộc dãy `CICD-`, không lẫn vào dãy `K8S-`;
 *  - khối `cd` phải sống sót qua vòng JSONB đi-về — một khối bị `JSON.stringify`
 *    làm mất `undefined` hay đổi thứ tự khoá vẫn lưu được, và chỉ lộ ra ở lượt
 *    CHẤM, tức sau khi đã có người nộp;
 *  - `problemTestcases` (biên ĐỌC) phải trả lại `check`/`args` đủ để chấm.
 *
 * Ô cuối cùng đóng vòng: lấy bài VỪA ĐỌC TỪ DB ra chấm, và khẳng định lời giải
 * cho `AC` còn trạng thái đầu cho `WA`. Không có nó, ba ô trên vẫn xanh trên một
 * dòng DB mà bộ chấm không dùng được.
 *
 * ⚠ ĐÒI Postgres đang chạy (`docker compose up -d postgres` + `pnpm db:migrate`).
 */

const { db, sql } = createDatabase();

const AUTHOR_ID = 'u-p19j-author';
/** Prefix slug riêng để dọn đúng những dòng ô này tạo ra, không đụng dữ liệu khác. */
const SLUG_PREFIX = 'p19j';

/** Bài CD của bộ seed — đề DUY NHẤT chở khối `cd` đi qua đường này. */
const SEED_CD = CICD_PROBLEMS_SEED.find((p) => p.code === 'CICD-0002');

function bodyCho(seedCode: string, title: string) {
  const seed = CICD_PROBLEMS_SEED.find((p) => p.code === seedCode);
  if (seed === undefined) throw new Error(`không có bài ${seedCode} trong bộ seed`);
  /*
   * Dựng body TỪ bộ seed thay vì gõ tay một đề mới: bộ seed đã được
   * `problems-seed.test.ts` chứng minh là giải được VÀ chưa giải sẵn, nên khi ô
   * dưới đỏ thì nguyên nhân nằm ở đường GHI/ĐỌC, không nằm ở chất lượng đề.
   *
   * `parse` chứ không `safeParse`: một body trượt Zod ở đây là hỏng thật, và
   * ngoại lệ kèm `path` của field sai nói nhiều hơn một boolean.
   */
  return problemBodySchema.parse({
    gameId: seed.gameId,
    seedable: false,
    slug: `${SLUG_PREFIX}-${seed.slug}-${title.replace(/\W+/gu, '-')}`,
    title,
    statement: seed.statement,
    difficulty: seed.difficulty,
    topics: [...seed.topics],
    tags: [...seed.tags],
    timeLimitSec: seed.timeLimitSec,
    initialState: seed.initialState,
    objectives: seed.objectives.map((o) => ({ ...o })),
    allowedResources: null,
    hints: seed.hints.map((h) => ({ ...h })),
    parMoves: seed.parMoves,
  });
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

describe('soạn một bài CI/CD và lưu thành một dòng problems', () => {
  it('bài thuần CI lưu được, mang mã dãy `CICD` và `game_id` đúng', async () => {
    const stored = await createProblem(db, AUTHOR_ID, bodyCho('CICD-0001', `${SLUG_PREFIX} ci`));

    expect(stored.code).toMatch(/^CICD-\d{4}$/u);
    /*
     * ⛔ Ô đắt nhất của file. Cột `game_id` có mặc định `'k8s'`, nên một đường
     * ghi quên trường này lưu bài CI/CD dưới cờ K8s — dòng vẫn vào bảng, vẫn
     * hiện ở `/problems`, và chỉ hỏng lúc CHẤM khi `gradeProblemRun` tra plugin
     * K8s cho một bộ ba workflow.
     */
    expect(stored.gameId).toBe('cicd');
    // Luôn ra đời ở `draft` — mã không tới từ body, chủ sở hữu cũng vậy.
    expect(stored.state).toBe('draft');
    expect(stored.authorId).toBe(AUTHOR_ID);
  });

  it('bài CD giữ NGUYÊN khối `cd` qua vòng JSONB đi-về', async () => {
    expect(SEED_CD, 'bộ seed phải có một bài CD — nếu không, ô này không đo gì').toBeDefined();
    const stored = await createProblem(db, AUTHOR_ID, bodyCho('CICD-0002', `${SLUG_PREFIX} cd`));

    const spec = stored.initialState as CicdProblemSpec;
    expect(spec.cd, 'khối `cd` phải sống sót qua Postgres').toBeDefined();
    expect(spec.cd?.release?.scenarios.length).toBe(1);
    expect(spec.cd?.editable).toContain('release.onBadRelease');
    /*
     * `initial` là vế mà cổng 19.J đòi CÙNG với kịch bản, và là vế dễ rơi nhất
     * qua một vòng serialize: thiếu nó thì `mergeCdPolicies` bỏ hẳn bộ mô phỏng
     * và mọi lượt nộp trượt vĩnh viễn, im lặng.
     */
    expect(spec.cd?.initial.release?.onBadRelease).toBe('roll-forward');
  });

  /*
   * ĐÓNG VÒNG. Ba ô trên đo dòng DB; ô này đo rằng dòng đó CHẤM ĐƯỢC — lấy
   * chính bản vừa đọc ra khỏi Postgres, cho đi qua biên ĐỌC (`problemTestcases`,
   * thứ dựng lại `check`/`args`), rồi chạy bộ chấm thật.
   *
   * Không có nó, cả ba ô trên vẫn xanh trên một dòng mà `check` đã bị cắt mất —
   * và triệu chứng khi ấy là `CE` cho mọi người học, sau khi bài đã xuất bản.
   */
  it('bài đọc LẠI TỪ DB chấm được: lời giải ra AC, trạng thái đầu ra WA', async () => {
    const stored = await createProblem(db, AUTHOR_ID, bodyCho('CICD-0002', `${SLUG_PREFIX} cham`));
    /*
     * `stored.testcases` — KHÔNG tự gọi `problemTestcases` ở đây. `toStoredProblem`
     * (`dto.ts`) đã chạy nó trên `row.objectives`, nên đọc thẳng trường này là đo
     * đúng thứ đường thật đi qua; gọi lại là dựng một biên đọc thứ hai cạnh biên
     * thật, và hai bản sẽ trôi.
     */
    const testcases = stored.testcases;
    const initialState = stored.initialState as CicdProblemSpec;

    const loiGiai: CicdGameAction = {
      gameId: 'cicd',
      tick: 0,
      kind: 'evaluate',
      /*
       * ⚠ YAML THẬT của workflow trong đề, không phải chuỗi rỗng. `source: ''`
       * không dựng được job nào nên lượt chấm ra `WA`/`CE` vì một lý do KHÔNG
       * liên quan tới núm CD — đã dẫm đúng bẫy này hai lần (2026-09-17).
       *
       * Bài CD này không hỏi về workflow, nên gửi lại chính bản của đề: khác
       * biệt duy nhất giữa hai lượt dưới là khối `cd`.
       */
      source: writeWorkflowYaml(initialState.workflow).yaml,
      overrides: {},
      cd: {
        release: {
          strategy: 'canary',
          onBadRelease: 'rollback',
          canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
        },
      },
    };

    const dat = gradeCicdProblem({ initialState, actions: [loiGiai], testcases, seed: 1 });
    expect(dat.verdict, dat.failedReason ?? '').toBe('AC');

    /*
     * ĐỐI CHỨNG ÂM, cùng dòng DB, cùng bộ testcase: không xoay núm ⇒ WA. Thiếu
     * nó, ô trên vẫn xanh trên một bộ chấm trả `AC` cho mọi lượt nộp.
     */
    const chuaDat = gradeCicdProblem({ initialState, actions: [], testcases, seed: 1 });
    expect(chuaDat.verdict).toBe('WA');
  });
});
