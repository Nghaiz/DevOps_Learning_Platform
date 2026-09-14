import { describe, expect, it } from 'vitest';
import { ACCENT_STYLE, REF_STYLE } from '../git-palette.ts';
import { PLATE_FLOOR, PLATE_Y } from './scene3d-contract.ts';
import {
  LABEL_PASS_COUNT,
  LABEL_PRIORITY,
  LANE_LABEL_EVERY,
  MAX_LABELS_3D,
  MAX_LABEL_CANDIDATES,
  MAX_LABEL_CHARS,
  MAX_PATH_CHARS,
  PLATE_CELL_BASE,
  PLATE_STATUS,
  PLATE_ZONE_LABEL,
  commitLabelPriority,
  labelPass,
  laneLabelDepths,
  plateCellCenterY,
  plateCellTopY,
  plateStatusLabel,
  refLabelPriority,
  shortenLabel,
  shortenPath,
  type CommitLabelFacts,
} from './label-priority.ts';

/**
 * Tầng nhãn 3D — ưu tiên, cắt chuỗi, lặp nhãn làn, kênh của ô file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * VÌ SAO PHÉP XẾP ƯU TIÊN ĐÁNG CÓ MỘT FILE TEST RIÊNG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vì nó là thứ hỏng mà **màn hình vẫn trông bình thường**. Một nhãn lệch chỗ thì
 * mắt bắt được ngay ở ảnh chụp đầu tiên; một thang ưu tiên xếp sai chỉ làm chữ
 * `main` biến mất giữa 25 nhãn oid — cảnh vẫn đầy chữ, vẫn đẹp, và không dạy
 * được gì. Không có phép đo nào khác bắt được hình dạng hỏng đó: ảnh chụp thì
 * "có nhãn", còn ô a11y thì đếm chữ chứ không đọc nghĩa.
 *
 * Cả file chạy ở env `node` — `label-priority.ts` sạch `three` lẫn DOM, và đó
 * chính là điều kiện để những ô dưới đây tồn tại.
 */

const PLAIN: CommitLabelFacts = {
  hasRef: false,
  selected: false,
  hovered: false,
  isHead: false,
  isMerge: false,
};

function facts(over: Partial<CommitLabelFacts>): CommitLabelFacts {
  return { ...PLAIN, ...over };
}

describe('commitLabelPriority — thứ tự đã khai', () => {
  it('xếp ref > chọn > rê > HEAD > merge > thường, giảm dần NGHIÊM NGẶT', () => {
    const ladder = [
      commitLabelPriority(facts({ hasRef: true })),
      commitLabelPriority(facts({ selected: true })),
      commitLabelPriority(facts({ hovered: true })),
      commitLabelPriority(facts({ isHead: true })),
      commitLabelPriority(facts({ isMerge: true })),
      commitLabelPriority(PLAIN),
    ];
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i - 1]).toBeGreaterThan(ladder[i] ?? Infinity);
    }
  });

  /*
   * Ô này gác ĐÚNG chỗ lệch khỏi arena. Ở arena "đang chọn" là đỉnh thang; ở đây
   * không, vì node đang chọn còn có mesh sáng lên làm kênh thứ hai, còn một ref
   * thì chỉ có nhãn. Đảo lại thứ tự này là làm chữ `main` biến mất mỗi lần người
   * chơi bấm vào một commit khác — và đó là lúc họ cần thấy `main` nhất.
   */
  it('ref THẮNG cả khi node đó đang được chọn', () => {
    expect(commitLabelPriority(facts({ hasRef: true, selected: true, hovered: true }))).toBe(
      LABEL_PRIORITY.commitRefAnchor,
    );
  });

  it('chọn thắng rê khi cả hai cùng đúng', () => {
    expect(commitLabelPriority(facts({ selected: true, hovered: true }))).toBe(
      LABEL_PRIORITY.commitSelected,
    );
  });

  it('merge chỉ thắng commit thường, không thắng HEAD', () => {
    expect(commitLabelPriority(facts({ isMerge: true, isHead: true }))).toBe(
      LABEL_PRIORITY.commitHead,
    );
    expect(commitLabelPriority(facts({ isMerge: true }))).toBeGreaterThan(
      commitLabelPriority(PLAIN),
    );
  });
});

describe('refLabelPriority', () => {
  it('HEAD > nhánh đang đứng > ref còn lại', () => {
    expect(refLabelPriority('head', false)).toBeGreaterThan(refLabelPriority('branch', true));
    expect(refLabelPriority('branch', true)).toBeGreaterThan(refLabelPriority('branch', false));
  });

  it('`isCurrent` không nâng badge HEAD lên bậc khác — HEAD vốn đã ở đỉnh', () => {
    expect(refLabelPriority('head', true)).toBe(refLabelPriority('head', false));
  });

  /*
   * Một badge ref phải luôn thắng nhãn oid của CHÍNH commit nó bám vào: khi chỗ
   * hẹp, `main` mang nhiều thông tin hơn `a1b2c3d`.
   */
  it('mọi badge ref đứng trên mọi nhãn oid của commit', () => {
    const refs = (['head', 'branch', 'remote', 'tag'] as const).flatMap((kind) => [
      refLabelPriority(kind, true),
      refLabelPriority(kind, false),
    ]);
    const commits = [
      commitLabelPriority(facts({ hasRef: true })),
      commitLabelPriority(facts({ selected: true })),
      commitLabelPriority(PLAIN),
    ];
    expect(Math.min(...refs)).toBeGreaterThan(Math.max(...commits));
  });
});

describe('labelPass — bảo vệ bộ đệm ứng viên', () => {
  it('mọi bậc trong thang rơi vào một lượt hợp lệ', () => {
    for (const priority of Object.values(LABEL_PRIORITY)) {
      const pass = labelPass(priority);
      expect(pass).toBeGreaterThanOrEqual(0);
      expect(pass).toBeLessThan(LABEL_PASS_COUNT);
    }
  });

  it('ưu tiên cao hơn KHÔNG BAO GIỜ rơi vào lượt muộn hơn', () => {
    const sorted = [...Object.values(LABEL_PRIORITY)].sort((a, b) => b - a);
    for (let i = 1; i < sorted.length; i += 1) {
      expect(labelPass(sorted[i - 1] ?? 0)).toBeLessThanOrEqual(labelPass(sorted[i] ?? 0));
    }
  });

  /*
   * Ba nhóm phải NẰM KHÁC LƯỢT, nếu không cả cơ chế nhiều lượt là trang trí:
   * tên mặt phẳng ở lượt đầu, nhãn cột file ở giữa, nhãn lặp ở cuối.
   */
  it('tên mặt phẳng, nhãn cột file và nhãn lặp nằm ở ba lượt khác nhau', () => {
    expect(labelPass(LABEL_PRIORITY.plateZone)).toBe(0);
    expect(labelPass(LABEL_PRIORITY.plateColumn)).toBe(1);
    expect(labelPass(LABEL_PRIORITY.laneRepeat)).toBe(2);
  });

  it('bộ đệm ứng viên rộng gấp đôi trần hiện', () => {
    expect(MAX_LABEL_CANDIDATES).toBe(MAX_LABELS_3D * 2);
  });
});

describe('shortenLabel — cắt ĐUÔI', () => {
  it('để nguyên chuỗi vừa hoặc ngắn hơn trần', () => {
    expect(shortenLabel('main', 10)).toBe('main');
    expect(shortenLabel('0123456789', 10)).toBe('0123456789');
  });

  it('cắt và không bao giờ vượt trần', () => {
    const out = shortenLabel('0123456789abcdef', 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('012345678')).toBe(true);
  });

  it('trần mặc định là hằng số đã khai', () => {
    expect(shortenLabel('x'.repeat(MAX_LABEL_CHARS + 5))).toHaveLength(MAX_LABEL_CHARS);
  });

  it('ném khi trần vô nghĩa, không trả chuỗi rỗng trong im lặng', () => {
    expect(() => shortenLabel('abc', 0)).toThrow(RangeError);
  });
});

describe('shortenPath — cắt ĐẦU, giữ tên file', () => {
  /*
   * Đây là ô đắt nhất trong nhóm này. Cắt đuôi một đường dẫn vẫn ra chuỗi trông
   * hợp lý, nên lỗi không tự lộ: `src/components/games/a.ts` và
   * `src/components/games/b.ts` cắt đuôi ra HAI NHÃN GIỐNG HỆT NHAU, và ô AC
   * "thấy file rơi từ Worktree xuống Index" hết kiểm được bằng mắt.
   */
  it('giữ tên file, không giữ phần đầu dùng chung', () => {
    const a = shortenPath('src/components/games/git/alpha.ts', 20);
    const b = shortenPath('src/components/games/git/beta.ts', 20);
    expect(a).toContain('alpha.ts');
    expect(b).toContain('beta.ts');
    expect(a).not.toBe(b);
  });

  it('không vượt trần, kể cả khi riêng tên file đã dài hơn trần', () => {
    for (const path of [
      'a/b/c.ts',
      'src/components/games/git/scene3d/file-plates.tsx',
      'ten-file-rat-dai-khong-co-thu-muc-nao-ca.ts',
      'x/'.repeat(40) + 'cuoi.ts',
    ]) {
      expect(shortenPath(path, 20).length).toBeLessThanOrEqual(20);
    }
  });

  it('giữ phần ĐUÔI của một tên file quá dài, không giữ phần đầu', () => {
    const out = shortenPath('khong-co-dau-gach-cheo-nao-trong-chuoi-nay.ts', 12);
    expect(out).toHaveLength(12);
    expect(out.startsWith('…')).toBe(true);
    expect(out.endsWith('.ts')).toBe(true);
  });

  it('để nguyên đường dẫn ngắn', () => {
    expect(shortenPath('README.md', MAX_PATH_CHARS)).toBe('README.md');
  });

  it('ném khi trần vô nghĩa', () => {
    expect(() => shortenPath('a/b.ts', 0)).toThrow(RangeError);
  });
});

describe('laneLabelDepths — nhãn nhánh lặp dọc theo làn', () => {
  it('mốc đầu là đầu làn, các mốc sau cách đều', () => {
    expect(laneLabelDepths(0, 10, 3)).toEqual([0, 3, 6, 9]);
    expect(laneLabelDepths(2, 9, 3)).toEqual([2, 5, 8]);
  });

  it('LẶP thật sự — làn đủ dài phải có nhiều hơn một mốc', () => {
    expect(laneLabelDepths(0, LANE_LABEL_EVERY * 3).length).toBeGreaterThan(1);
  });

  it('không vượt quá mốc cuối', () => {
    for (const d of laneLabelDepths(1, 7, 2)) expect(d).toBeLessThanOrEqual(7);
  });

  it('làn một cột vẫn có đúng một nhãn', () => {
    expect(laneLabelDepths(4, 4)).toEqual([4]);
  });

  it('khoảng rỗng trả mảng rỗng, không ném', () => {
    expect(laneLabelDepths(5, 4)).toEqual([]);
  });

  it('ném khi bước lặp vô nghĩa — im lặng ở đây là vòng lặp vô hạn', () => {
    expect(() => laneLabelDepths(0, 10, 0)).toThrow(RangeError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════

/** Sáu trạng thái của hợp đồng. Liệt kê theo TÊN chứ không đếm — xem ô đầu tiên. */
const STATUSES = [
  'unchanged',
  'modified',
  'added',
  'deleted',
  'untracked',
  'conflicted',
] as const;

/** `true` khi mọi phần tử khác nhau từng đôi một. */
function allDistinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

describe('PLATE_STATUS — ≥2 kênh ngoài màu', () => {
  it('phủ đúng sáu trạng thái, gọi tên chứ không đếm', () => {
    expect(Object.keys(PLATE_STATUS).sort()).toEqual([...STATUSES].sort());
  });

  /*
   * "≥2 kênh ngoài màu" ở dạng mạnh nhất và kiểm được: SÁU hình khối khác nhau
   * VÀ sáu ký tự khác nhau. Yếu hơn thế — ví dụ chỉ đòi "không có hai trạng thái
   * trùng cả hai kênh" — sẽ cho phép bốn trạng thái dùng chung một hình khối,
   * lúc đó `shape` thực chất không còn là một kênh phân biệt nữa.
   */
  it('sáu hình khối khác nhau', () => {
    expect(allDistinct(Object.values(PLATE_STATUS).map((s) => s.shape))).toBe(true);
  });

  it('sáu ký tự khác nhau', () => {
    expect(allDistinct(Object.values(PLATE_STATUS).map((s) => s.sigil))).toBe(true);
  });

  it('mọi ký tự đều không rỗng — một ô không có sigil là một ô mất kênh', () => {
    for (const style of Object.values(PLATE_STATUS)) expect(style.sigil).not.toBe('');
  });

  /*
   * ĐỐI CHỨNG DƯƠNG. Một ô "mọi thứ đều khác nhau" trên một tập vốn khác nhau
   * là ô không bao giờ đỏ được, và không bao giờ đỏ thì không gác gì
   * (`rules/green-that-proves-nothing.md`). Ô này bẻ gãy bảng một cách có chủ ý
   * và đòi phép kiểm PHẢI phát hiện — nếu `allDistinct` hỏng, ô này đỏ trước.
   */
  it('phép kiểm biết kêu: hai hình khối trùng nhau phải bị bắt', () => {
    const shapes = Object.values(PLATE_STATUS).map((s) => s.shape);
    const broken = [...shapes];
    broken[1] = shapes[0] ?? 'flat';
    expect(allDistinct(broken)).toBe(false);
  });

  /*
   * Cặp màu KHÔNG được chọn tự do. Bảng đo tương phản hai theme nằm ở đầu
   * `git-palette.ts` và nó đo đúng những cặp mà `ACCENT_STYLE` / `REF_STYLE`
   * dùng. Buộc mọi cặp của bảng này phải là MỘT TRONG SỐ ĐÓ nghĩa là câu "các
   * cặp này đạt AA" trở thành hệ quả của một cổng đang chạy, thay vì một câu
   * viết trong chú thích mà không gì kiểm.
   */
  it('mọi cặp nền/chữ đã có mặt trong bảng màu đã đo', () => {
    const measured = new Set(
      [...Object.values(ACCENT_STYLE), ...Object.values(REF_STYLE)].map(
        (s) => `${s.fill}|${s.text}`,
      ),
    );
    for (const [status, style] of Object.entries(PLATE_STATUS)) {
      expect(measured, `trạng thái "${status}" dùng một cặp màu chưa ai đo`).toContain(
        `${style.fill}|${style.text}`,
      );
    }
  });

  it('nền khác chữ — không ô nào tô chữ trùng màu nền', () => {
    for (const style of Object.values(PLATE_STATUS)) {
      expect(style.fill).not.toBe(style.text);
    }
  });

  it('chỉ "đã xoá" chìm xuống dưới mặt phẳng — hướng xuống mang nghĩa "mất"', () => {
    for (const [status, style] of Object.entries(PLATE_STATUS)) {
      if (status === 'deleted') expect(style.lift).toBeLessThan(0);
      else expect(style.lift).toBeGreaterThanOrEqual(0);
    }
  });

  it('mọi ô có chiều dày dương', () => {
    for (const style of Object.values(PLATE_STATUS)) expect(style.height).toBeGreaterThan(0);
  });

  it('plateStatusLabel trả đúng câu của bảng', () => {
    for (const status of STATUSES) {
      expect(plateStatusLabel(status)).toBe(PLATE_STATUS[status].label);
    }
  });
});

describe('plateCellCenterY / plateCellTopY — hình học ô file', () => {
  it('đỉnh luôn nằm trên tâm, đúng nửa chiều dày', () => {
    for (const status of STATUSES) {
      const centre = plateCellCenterY(PLATE_Y.head, status);
      const top = plateCellTopY(PLATE_Y.head, status);
      expect(top).toBeGreaterThan(centre);
      expect(top - centre).toBeCloseTo((PLATE_STATUS[status].height / 2) * PLATE_CELL_BASE, 10);
    }
  });

  it('chỉ "đã xoá" có tâm nằm DƯỚI mặt phẳng', () => {
    for (const status of STATUSES) {
      const centre = plateCellCenterY(PLATE_Y.index, status);
      if (status === 'deleted') expect(centre).toBeLessThan(PLATE_Y.index);
      else expect(centre).toBeGreaterThan(PLATE_Y.index);
    }
  });

  /*
   * Bất biến của K.3: ba mặt phẳng phải NHÌN THẤY ĐỒNG THỜI, tức không ô nào ở
   * tầng dưới được chạm tới tầng trên. Ô `added` cao nhất (height 2.4, lift
   * 0.7) vươn 0.68 đơn vị, còn khoảng cách hai mặt phẳng là 2.5 — còn dư nhiều.
   *
   * Ô này gác cả hai phía: nâng `height`/`lift` trong bảng, HOẶC thu `PLATE_Y`
   * ở hợp đồng lại gần nhau, đều làm nó ĐỎ. Không có nó thì hai tầng chồng lên
   * nhau trông y hệt một bug render ngẫu nhiên.
   */
  it('không ô nào vươn tới mặt phẳng phía trên', () => {
    for (const [lower, upper] of [
      [PLATE_Y.head, PLATE_Y.index],
      [PLATE_Y.index, PLATE_Y.worktree],
    ] as const) {
      for (const status of STATUSES) {
        expect(plateCellTopY(lower, status)).toBeLessThan(upper);
      }
    }
  });

  /*
   * Chiều còn lại: ô CHÌM không được thọc xuống quá sâu. `PLATE_FLOOR` của hợp
   * đồng bằng đúng `PLATE_Y.head`, nên mọi phần nhô xuống dưới nó là phần mà
   * `assertPlanesClearOfDag()` KHÔNG biết tới — xem báo cáo lane D.
   */
  it('phần chìm xuống dưới mặt phẳng HEAD giữ trong biên đã khai', () => {
    const style = PLATE_STATUS.deleted;
    const bottom = plateCellCenterY(PLATE_FLOOR, 'deleted') - (style.height / 2) * PLATE_CELL_BASE;
    expect(PLATE_FLOOR - bottom).toBeLessThan(0.5);
  });
});

describe('PLATE_ZONE_LABEL', () => {
  it('ba mặt phẳng, ba tên khác nhau, không tên nào rỗng', () => {
    const names = Object.values(PLATE_ZONE_LABEL);
    expect(names).toHaveLength(3);
    expect(allDistinct(names)).toBe(true);
    for (const name of names) expect(name.length).toBeGreaterThan(0);
  });

  it('tên vừa trong trần cắt chuỗi — tên mặt phẳng không được phép bị cắt', () => {
    for (const name of Object.values(PLATE_ZONE_LABEL)) {
      expect(shortenLabel(name)).toBe(name);
    }
  });
});
