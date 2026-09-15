/**
 * Ô gác của bảng ánh xạ bản nháp → `ProblemBody` (§18.E.5).
 *
 * ## Vì sao file này tồn tại dù `tsc` đã xanh
 *
 * Bảng ánh xạ là một LỜI KHAI — "`statement` lấy từ `draft.brief`", "`par === 0`
 * thành `null`", "`required` bị bỏ" — và `tsc` không kiểm được lời khai nào
 * trong số đó. `statement: draft.mission` biên dịch tốt như `draft.brief`; cả
 * hai đều là `string`. `parMoves: draft.par` cũng vậy cho tới lúc Zod ở máy chủ
 * trả 400 cho một `0`. Kiểu chỉ gác HÌNH DẠNG; nội dung thì phải có ô đi qua
 * từng dòng.
 *
 * ## Gá
 *
 * `draftFromLevel(GIT_LEVELS[0])` với id đổi sang dãy `git-tu-dung-`, cùng lý lẽ
 * và cùng khuôn với `packages/games/src/git/level-draft.test.ts`: một bản nháp
 * hợp lệ được bảo đảm bởi một level ĐANG PHÁT HÀNH, nên mỗi ô chỉ phải phá đúng
 * một thứ. Bịa một draft hợp lệ bằng tay là tự thêm một chỗ có thể sai mà triệu
 * chứng của nó đọc ra y hệt thứ đang đo.
 */

import { describe, expect, it } from 'vitest';
import {
  GIT_LEVELS,
  draftFromLevel,
  problemTopicLabels,
  type LevelDraft,
} from '@devops-platform/games';

import {
  draftToProblemBody,
  problemSaveIssues,
  slugFromTitle,
  type ProblemExtras,
} from './draft-to-problem';

const G01 = GIT_LEVELS[0]!;

function hopLe(patch: Partial<LevelDraft> = {}): LevelDraft {
  return { ...draftFromLevel(G01), id: 'git-tu-dung-thu', ...patch };
}

/** Phần panel thu, khớp độ dài với bản nháp gá. */
function extras(draft: LevelDraft, patch: Partial<ProblemExtras> = {}): ProblemExtras {
  return {
    topics: ['commit'],
    tags: [],
    hintPenalties: draft.hints.map(() => 0),
    objectiveVisible: draft.objectives.map(() => true),
    ...patch,
  };
}

/** Body của gá, đã khẳng định khác `null` — mọi ô bảng ánh xạ đọc từ đây. */
function body(draft: LevelDraft = hopLe(), patch: Partial<ProblemExtras> = {}) {
  const result = draftToProblemBody(draft, extras(draft, patch));
  expect(result, 'gá phải lưu được, nếu không thì mọi ô dưới đo một null').not.toBeNull();
  return result!;
}

function codes(draft: LevelDraft, patch: Partial<ProblemExtras> = {}): readonly string[] {
  return problemSaveIssues(draft, extras(draft, patch)).map((issue) => issue.code);
}

// ═══════════════════════════════════════════════════════════════════════════

describe('gá hợp lệ', () => {
  it('bản nháp gá cộng panel tối thiểu lưu được — mọi ô dưới chỉ phá MỘT thứ', () => {
    expect(problemSaveIssues(hopLe(), extras(hopLe()))).toEqual([]);
    expect(draftToProblemBody(hopLe(), extras(hopLe()))).not.toBeNull();
  });

  it('gá có đủ thứ để đo: ít nhất một mục tiêu, và chủ đề gá là chủ đề THẬT', () => {
    // Tiền đề. `objectives` rỗng thì mọi ô về ánh xạ mục tiêu xanh vì không đo gì.
    expect(hopLe().objectives.length).toBeGreaterThan(0);
    expect(Object.keys(problemTopicLabels('git'))).toContain('commit');
  });
});

describe('bảng ánh xạ, từng dòng một', () => {
  it('gameId luôn là git', () => {
    expect(body().gameId).toBe('git');
  });

  it('title lấy từ draft.title', () => {
    expect(body(hopLe({ title: 'Nan lai lich su' })).title).toBe('Nan lai lich su');
  });

  /*
   * Ô có giá trị nhất của nhóm này. `mission` và `brief` đều là `string` và đều
   * là chữ tiếng Việt của người soạn, nên đổi nhầm hai cái cho nhau KHÔNG đỏ ở
   * đâu — bài lưu ra chỉ có đề bài dài một câu, và không ai biết vì sao.
   */
  it('statement lấy từ draft.brief, KHÔNG phải draft.mission', () => {
    const draft = hopLe({ brief: 'De bai day du', mission: 'Mot cau ngan' });
    expect(body(draft).statement).toBe('De bai day du');
    expect(body(draft).statement).not.toBe('Mot cau ngan');
  });

  it('initialState lấy từ draft.setup', () => {
    expect(body().initialState).toBe(hopLe().setup);
  });

  it('thang ba bậc sang thang bốn bậc, và expert KHÔNG với tới được', () => {
    expect(body(hopLe({ difficulty: 'basic' })).difficulty).toBe('easy');
    expect(body(hopLe({ difficulty: 'intermediate' })).difficulty).toBe('medium');
    expect(body(hopLe({ difficulty: 'advanced' })).difficulty).toBe('hard');
    /*
     * `phase-18-exec.md` §1.3: một bài `expert` cần soạn tay, và bịa ra bậc thứ
     * tư từ ba bậc của level là đúng loại "ánh xạ ngầm" mà §18.A cấm. Ô này khoá
     * lời hứa đó lại — nó đỏ nếu ai đó thêm một nhánh `expert`.
     */
    for (const level of ['basic', 'intermediate', 'advanced'] as const) {
      expect(body(hopLe({ difficulty: level })).difficulty).not.toBe('expert');
    }
  });

  it('topics và tags lấy từ panel, không lấy từ bản nháp', () => {
    const result = body(hopLe(), { topics: ['commit', 'history'], tags: ['on-tap'] });
    expect(result.topics).toEqual(['commit', 'history']);
    expect(result.tags).toEqual(['on-tap']);
  });

  it('allowedResources luôn null — cột của thời K8s-một-game', () => {
    expect(body().allowedResources).toBeNull();
  });

  it('timeLimitSec luôn null — Builder không có ô cho nó', () => {
    expect(body().timeLimitSec).toBeNull();
  });

  it('seedable luôn false — không plugin nào khai seedSpec', () => {
    expect(body().seedable).toBe(false);
  });
});

describe('cây đích: null là VẮNG MẶT KHOÁ, không phải null', () => {
  it('target null ⇒ không có khoá targetState', () => {
    const result = body(hopLe({ target: null }));
    expect('targetState' in result).toBe(false);
  });

  it('target có ⇒ targetState mang đúng spec đó', () => {
    const target = { commits: [{ id: 'c1', message: 'x' }], branches: { main: 'c1' } };
    expect(body(hopLe({ target })).targetState).toBe(target);
  });
});

describe('mục tiêu → testcase', () => {
  const draft = hopLe();

  it('giữ id / label / check', () => {
    const first = draft.objectives[0]!;
    const mapped = body(draft).objectives[0]!;
    expect(mapped.id).toBe(first.id);
    expect(mapped.label).toBe(first.label);
    expect(mapped.check).toBe(first.check);
  });

  /*
   * ⛔ Ô này gác một quyết định về NGHĨA, không về hình dạng. `required` hỏi
   * "không đạt thì có chặn không"; `visible` hỏi "người làm có được xem trước
   * khi nộp không". Cả hai là `boolean`, nên gán cái này sang cái kia biên dịch
   * tốt và đổi nghĩa dữ liệu trong im lặng — `docs/oj-format.md` §5 có bảng.
   */
  it('BỎ required, và visible tới từ panel chứ không suy từ required', () => {
    const mapped = body(draft, { objectiveVisible: draft.objectives.map(() => false) });
    for (const testcase of mapped.objectives) {
      expect('required' in testcase).toBe(false);
      expect(testcase.visible).toBe(false);
    }
    // Đối chứng: cùng bản nháp, panel nói `true` thì ra `true`. Không có vế này
    // thì một `visible: false` chốt cứng cũng làm ô trên xanh.
    for (const testcase of body(draft).objectives) {
      expect(testcase.visible).toBe(true);
    }
  });

  it('args vắng mặt thì BỎ KHOÁ, không gán undefined', () => {
    const draftKhongArgs = hopLe({
      objectives: [{ id: 'o1', label: 'Xong', check: 'commitCount', required: true }],
    });
    const mapped = body(draftKhongArgs).objectives[0]!;
    expect('args' in mapped).toBe(false);
  });

  it('args có thì đi nguyên vẹn', () => {
    const draftCoArgs = hopLe({
      objectives: [
        { id: 'o1', label: 'Ba commit', check: 'commitCount', required: true, args: { n: 3 } },
      ],
    });
    expect(body(draftCoArgs).objectives[0]?.args).toEqual({ n: 3 });
  });
});

describe('gợi ý: chuỗi trần miễn phí → gợi ý CÓ GIÁ', () => {
  const draft = hopLe({ hints: ['Xem git log', 'Doc lai README'] });

  it('id sinh theo chỉ số, text giữ nguyên, giá tới từ panel', () => {
    const result = body(draft, { hintPenalties: [0, 25] });
    expect(result.hints).toEqual([
      { id: 'goi-y-1', text: 'Xem git log', penaltyPoints: 0 },
      { id: 'goi-y-2', text: 'Doc lai README', penaltyPoints: 25 },
    ]);
  });

  it('id không bao giờ rỗng — hintSchema.id là .min(1)', () => {
    for (const hint of body(draft, { hintPenalties: [0, 0] }).hints) {
      expect(hint.id.length).toBeGreaterThan(0);
    }
  });
});

describe('parMoves: 0 của level là "không chấm theo số nước", tức null của bài', () => {
  /*
   * `emptyDraft` khởi tạo `par` bằng `0` và `levelDraftIssues` chỉ chặn số ÂM,
   * nên `0` là giá trị THƯỜNG GẶP NHẤT, không phải một ca hiếm. Gửi thẳng `0`
   * lên thì `problemBodyShape.parMoves` (`.positive().nullable()`) trả 400, và
   * người soạn nhận một lỗi về `parMoves` trong khi ô của họ đang để trống.
   */
  it('par 0 ⇒ null', () => {
    expect(body(hopLe({ par: 0 })).parMoves).toBeNull();
  });

  it('par dương ⇒ giữ nguyên số', () => {
    expect(body(hopLe({ par: 4 })).parMoves).toBe(4);
  });
});

describe('slug sinh từ tiêu đề', () => {
  it('bỏ dấu tiếng Việt, và đ không mất chữ', () => {
    expect(slugFromTitle('Nắn lại lịch sử đội')).toBe('nan-lai-lich-su-doi');
  });

  it('body mang đúng slug đó', () => {
    expect(body(hopLe({ title: 'Gỡ rối rebase' })).slug).toBe('go-roi-rebase');
  });

  it('tiêu đề không sinh ra slug nào thì CHẶN, không lưu một slug rỗng', () => {
    expect(codes(hopLe({ title: '!!!' }))).toContain('slug-rong');
    expect(draftToProblemBody(hopLe({ title: '!!!' }), extras(hopLe()))).toBeNull();
  });
});

describe('phép kiểm phần panel', () => {
  it('bản nháp còn lỗi thì không lưu được — không dựng bộ kiểm thứ hai', () => {
    expect(codes(hopLe({ brief: '' }))).toContain('nhap-con-loi');
  });

  it('chưa chọn chủ đề, hoặc chọn quá ba', () => {
    expect(codes(hopLe(), { topics: [] })).toContain('chua-chon-chu-de');
    expect(codes(hopLe(), { topics: ['commit', 'history', 'merging', 'remote'] })).toContain(
      'qua-nhieu-chu-de',
    );
  });

  it('chủ đề ngoài tập của game Git bị từ chối', () => {
    // `scheduling` là chủ đề của K8s. Id để trần nên nó không tự đụng tập Git;
    // chỉ phép tra theo game mới tách được hai tập.
    expect(codes(hopLe(), { topics: ['scheduling'] })).toContain('chu-de-la');
  });

  it('số giá gợi ý lệch số gợi ý là LỖI, không phải chỗ điền 0', () => {
    const draft = hopLe({ hints: ['a', 'b'] });
    expect(codes(draft, { hintPenalties: [10] })).toContain('gia-goi-y-lech-so-luong');
  });

  it('giá gợi ý âm, không nguyên, hay vượt trần đều bị chặn', () => {
    const draft = hopLe({ hints: ['a'] });
    for (const bad of [-1, 1.5, 1001]) {
      expect(codes(draft, { hintPenalties: [bad] }), String(bad)).toContain(
        'gia-goi-y-ngoai-khoang',
      );
    }
  });

  it('số cờ hiện lệch số mục tiêu là LỖI — nếu không thì mục cuối âm thầm thành ẩn', () => {
    expect(codes(hopLe(), { objectiveVisible: [] })).toContain('co-hien-lech-so-luong');
  });
});
