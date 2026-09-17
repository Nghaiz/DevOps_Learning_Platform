/**
 * Bản nháp level của Level Builder — §18.E.
 *
 * Gá là `draftFromLevel(G01)` với id đổi sang dãy `git-tu-dung-`: một bản nháp
 * HỢP LỆ đảm bảo bằng chính một level đang phát hành, nên mỗi ô dưới đây chỉ
 * phải phá đúng MỘT thứ. Bịa một draft hợp lệ bằng tay là tự thêm một chỗ có
 * thể sai mà triệu chứng của nó đọc ra y hệt thứ đang đo.
 */

import { describe, expect, it } from 'vitest';

import type { GitObjective, GitPredicateName } from './contract.ts';
import { GIT_LEVELS } from './levels/index.ts';
import {
  CUSTOM_LEVEL_ID_PREFIX,
  draftFromLevel,
  draftToLevel,
  emptyDraft,
  isCustomLevelId,
  levelDraftIssues,
  levelFromJson,
  levelToJson,
  type LevelDraft,
} from './level-draft.ts';

const G01 = GIT_LEVELS[0]!;

/** Bản nháp hợp lệ: một level thật, đổi id sang dãy dành cho level tự dựng. */
function hopLe(patch: Partial<LevelDraft> = {}): LevelDraft {
  return { ...draftFromLevel(G01), id: 'git-tu-dung-thu', ...patch };
}

function codes(draft: LevelDraft): readonly string[] {
  return levelDraftIssues(draft).map((i) => i.code);
}

describe('gá hợp lệ', () => {
  it('bản nháp gá không còn issue nào — mọi ô dưới đây chỉ phá MỘT thứ', () => {
    expect(levelDraftIssues(hopLe())).toEqual([]);
    expect(draftToLevel(hopLe())).not.toBeNull();
  });
});

describe('id level tự dựng', () => {
  it('nháp rỗng chưa có id', () => {
    expect(codes(emptyDraft({}))).toContain('id-trong');
  });

  it('TỪ CHỐI id trong dãy git-NN- của 32 level phát hành', () => {
    /*
     * Ô này gác thứ đắt nhất trong cả file. `RunResult.levelId` nằm trong
     * `localStorage` và KHÔNG có bảng tra ngược, nên một level tự dựng mang id
     * `git-01-...` ghi đè tiến độ của G01 thật trên máy người chơi — không lỗi,
     * không cảnh báo, chỉ là lịch sử của họ biến mất.
     */
    expect(codes(hopLe({ id: G01.id }))).toContain('id-sai-dinh-dang');
    expect(isCustomLevelId(G01.id)).toBe(false);
  });

  it('từ chối id có dấu, chữ hoa, hay gạch nối thừa', () => {
    for (const xau of [
      'git-tu-dung-Thu',
      'git-tu-dung-thử',
      'git-tu-dung-',
      'git-tu-dung--thu',
      'tu-dung-thu',
    ]) {
      expect(isCustomLevelId(xau), xau).toBe(false);
    }
  });

  it('nhận id đúng dãy', () => {
    expect(isCustomLevelId('git-tu-dung-thu')).toBe(true);
    expect(isCustomLevelId(`${CUSTOM_LEVEL_ID_PREFIX}a1-b2`)).toBe(true);
  });
});

describe('mục tiêu', () => {
  it('không có mục tiêu nào', () => {
    expect(codes(hopLe({ objectives: [] }))).toContain('khong-co-muc-tieu');
  });

  it('toàn mục tiêu thưởng ⇒ level KHÔNG BAO GIỜ qua được', () => {
    // `verdictOf` trả `accepted: false` khi `required.length === 0`. Một level
    // như thế trông hoàn toàn hợp lệ trên form và không thể thắng khi chơi.
    const thuong = G01.objectives.map((o) => ({ ...o, required: false }));
    expect(codes(hopLe({ objectives: thuong }))).toContain('khong-co-muc-tieu-bat-buoc');
  });

  it('id mục tiêu trùng nhau', () => {
    const trung = [G01.objectives[0]!, G01.objectives[0]!];
    expect(codes(hopLe({ objectives: trung }))).toContain('muc-tieu-trung-id');
  });

  it('vị từ không có trong bảng đã hiện thực', () => {
    /*
     * Ép kiểu là CỐ Ý và nó nói ra một điều đáng mừng: `GitObjective.check` là
     * union đóng `GitPredicateName`, nên `tsc` đã chặn vị từ lạ ở mọi level viết
     * tay. Phép kiểm lúc chạy vẫn cần vì `levelFromJson` nhận `unknown` từ một
     * file người khác gửi — và đó chính là đường mà lần ép kiểu này giả lập.
     */
    const la: readonly GitObjective[] = [
      { ...G01.objectives[0]!, check: 'viTuKhongCoThat' as GitPredicateName },
    ];
    expect(codes(hopLe({ objectives: la }))).toContain('vi-tu-khong-ton-tai');
  });

  it('graphShapeMatches mà chưa đặt cây đích', () => {
    // Không có ô này thì bài dùng vị từ đó sẽ trả `CE` cho MỌI testcase lúc
    // chấm — xem `git/problem-plugin.ts` sai lệch #2.
    const canDich: readonly GitObjective[] = [
      { id: 'khop', label: 'Khớp đích', check: 'graphShapeMatches', required: true },
    ];
    expect(codes(hopLe({ objectives: canDich, target: null }))).toContain('thieu-cay-dich');
    expect(codes(hopLe({ objectives: canDich, target: G01.setup }))).not.toContain(
      'thieu-cay-dich',
    );
  });
});

describe('tập lệnh cho phép', () => {
  it('mảng RỖNG là bẫy — nó cấm mọi lệnh, không phải cho mọi lệnh', () => {
    expect(codes(hopLe({ allowedCommands: [] }))).toContain('tap-lenh-rong');
  });

  it('null là "cho mọi lệnh" và hợp lệ', () => {
    expect(codes(hopLe({ allowedCommands: null }))).not.toContain('tap-lenh-rong');
  });

  it('lời giải dùng động từ ngoài tập ⇒ level tự chặn lời giải của chính nó', () => {
    const issues = levelDraftIssues(
      hopLe({ allowedCommands: ['status'], solutionCommands: ['git commit -m "x"'] }),
    );
    const found = issues.find((i) => i.code === 'loi-giai-dung-lenh-ngoai-tap');
    expect(found).toBeDefined();
    // `detail` phải chỉ đúng động từ, nếu không người soạn không biết gỡ ở đâu.
    expect(found?.detail).toBe('commit');
  });
});

describe('lời giải và spec', () => {
  it('không có lời giải nào', () => {
    expect(codes(hopLe({ solutionCommands: [] }))).toContain('khong-co-loi-giai');
  });

  it('par âm', () => {
    expect(codes(hopLe({ par: -1 }))).toContain('par-am');
  });

  it('trạng thái đầu dựng không được ⇒ nói ra ở form, không để nổ lúc chơi thử', () => {
    // `branches` trỏ vào một commit spec không tồn tại — `buildWorld` NÉM.
    const hong = { commits: [], branches: { main: 'khong-co' } };
    expect(codes(hopLe({ setup: hong }))).toContain('trang-thai-dau-hong');
  });

  it('cây đích dựng không được', () => {
    const hong = { commits: [], branches: { main: 'khong-co' } };
    expect(codes(hopLe({ target: hong }))).toContain('cay-dich-hong');
  });
});

describe('nháp ↔ level', () => {
  it('draftToLevel trả null khi còn issue', () => {
    expect(draftToLevel(hopLe({ title: '' }))).toBeNull();
  });

  it('target null biến mất khỏi level, không thành null', () => {
    // `createGitSession` phân biệt `undefined`, không phân biệt `null`: một
    // `target: null` lọt xuống sẽ làm `buildTarget` dựng cây đích từ `null`.
    const level = draftToLevel(hopLe({ target: null }));
    expect(level).not.toBeNull();
    expect('target' in level!).toBe(false);
  });

  it('vòng draft → level → draft giữ nguyên từng trường', () => {
    const truoc = hopLe();
    const sau = draftFromLevel(draftToLevel(truoc)!);
    expect(sau).toEqual(truoc);
  });
});

describe('xuất / nhập JSON', () => {
  it('vòng level → JSON → level giữ nguyên từng trường', () => {
    const level = draftToLevel(hopLe())!;
    expect(levelFromJson(levelToJson(level))).toEqual(level);
  });

  it('JSON hỏng trả null, KHÔNG ném', () => {
    for (const xau of ['', '{', 'null', '[]', '"chuoi"', '42']) {
      expect(() => levelFromJson(xau), xau).not.toThrow();
      expect(levelFromJson(xau), xau).toBeNull();
    }
  });

  it('từ chối bản xuất SANDBOX, thứ cũng mang version 1 + gameId git', () => {
    // Không có khoá `kind` thì một bản xuất sandbox đi qua hai phép kiểm đầu rồi
    // hỏng ở chỗ sâu hơn, với một câu lỗi không chỉ được vào đâu.
    const sandbox = JSON.stringify({ version: 1, gameId: 'git', spec: {}, seed: 1 });
    expect(levelFromJson(sandbox)).toBeNull();
  });

  it('thiếu trường bắt buộc trả null thay vì NÉM', () => {
    /*
     * ĐỐI CHỨNG cho `looksLikeLevel`. Không có tầng kiểm hình dạng thô đó,
     * `levelDraftIssues` đọc `draft.id.trim()` trên `undefined` và ném
     * `TypeError` — một lần dán nhầm khi ấy thành một trang lỗi thay vì một câu
     * tử tế.
     */
    const level = draftToLevel(hopLe())!;
    for (const thieu of ['id', 'objectives', 'setup', 'teaching', 'solutionCommands', 'par']) {
      const cat: Record<string, unknown> = { ...level };
      delete cat[thieu];
      const json = JSON.stringify({ version: 1, gameId: 'git', kind: 'level', level: cat });
      expect(() => levelFromJson(json), thieu).not.toThrow();
      expect(levelFromJson(json), thieu).toBeNull();
    }
  });

  it('từ chối level đúng hình dạng nhưng SAI NỘI DUNG — cùng luật với form', () => {
    // Nhập một level mang id của G01 phải trượt đúng như gõ nó vào form.
    const level = { ...draftToLevel(hopLe())!, id: G01.id };
    const json = JSON.stringify({ version: 1, gameId: 'git', kind: 'level', level });
    expect(levelFromJson(json)).toBeNull();
  });

  it('độ khó ngoài thang ba bậc bị từ chối', () => {
    const level = { ...draftToLevel(hopLe())!, difficulty: 'expert' };
    const json = JSON.stringify({ version: 1, gameId: 'git', kind: 'level', level });
    expect(levelFromJson(json)).toBeNull();
  });
});
