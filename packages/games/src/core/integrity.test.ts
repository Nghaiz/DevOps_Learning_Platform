/**
 * Test cho `integrity.ts` — checksum bản lưu và kiểm tính hợp lý.
 *
 * ⚠ Cả hai chiều cho mọi phép kiểm. Riêng ở file này chiều ÂM (không kêu trên
 * lượt chơi sạch) quan trọng ngang chiều dương: một hàm kiểm tính hợp lý kêu
 * trên mọi lượt chơi thì cũng vô dụng như một hàm không bao giờ kêu, và nó còn
 * tệ hơn ở chỗ nó dạy người đọc log bỏ qua cảnh báo.
 */

import { describe, expect, it } from 'vitest';
import type { RunLog } from './run-log.ts';
import type { GameSave, RunResult } from './types.ts';
import {
  SCORE_MAX,
  checkPlausibility,
  checkSave,
  checksum,
  lastActionTick,
  stableStringify,
  stampSave,
  type PlausibilityCode,
  type PlausibilityLimits,
} from './integrity.ts';

// ── Dữ liệu ─────────────────────────────────────────────────────────────────

const cleanRun: RunResult = {
  gameId: 'k8s',
  levelId: 'k8s-01-pod-dau-tien',
  seed: 1234,
  startedAt: 1_700_000_000_000,
  finishedAt: 1_700_000_060_000, // 60 giây
  objectivesMet: ['obj-pod-chay'],
  objectivesTotal: 2,
  commandsUsed: 4,
  hintsUsed: 1,
  score: 620,
};

const cleanLog: RunLog = {
  gameId: 'k8s',
  levelId: 'k8s-01-pod-dau-tien',
  seed: 1234,
  actions: [
    { gameId: 'k8s', tick: 0, kind: 'apply', yaml: 'kind: Pod\nmetadata:\n  name: web' },
    { gameId: 'k8s', tick: 12, kind: 'kubectl', command: 'get pods' },
  ],
};

/** 12 tick × 1000ms = 12 giây tối thiểu; lượt chơi sạch dài 60 giây ⇒ hợp lý. */
const limits: PlausibilityLimits = {
  msPerTick: 1000,
  maxScore: 800,
  objectivesAchievableWithoutCommands: [],
};

const cleanSave: GameSave = {
  version: 1,
  runs: [cleanRun],
  achievements: ['pod-dau-tien'],
  settings: { disable3d: false, showHints: true },
};

function codes(flags: readonly { code: PlausibilityCode }[]): PlausibilityCode[] {
  return flags.map((f) => f.code);
}

// ── stableStringify ─────────────────────────────────────────────────────────

describe('stableStringify', () => {
  it('thứ tự chèn key KHÔNG đổi kết quả — đây là lý do không dùng JSON.stringify', () => {
    const a = { alpha: 1, beta: 2, gamma: 3 };
    const b = { gamma: 3, alpha: 1, beta: 2 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    // Đối chứng: JSON.stringify THẬT SỰ khác nhau ở đúng hai object này, nên
    // phép kiểm trên không xanh một cách vô nghĩa.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it('nội dung khác ⇒ chuỗi khác (chiều âm)', () => {
    expect(stableStringify({ score: 100 })).not.toBe(stableStringify({ score: 101 }));
  });

  it('sắp xếp key ở MỌI độ sâu, không chỉ tầng ngoài', () => {
    const a = { outer: { x: 1, y: 2 } };
    const b = { outer: { y: 2, x: 1 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it('thứ tự MẢNG thì có nghĩa và được giữ', () => {
    expect(stableStringify([1, 2])).not.toBe(stableStringify([2, 1]));
  });

  it('phân biệt undefined / null / thiếu key — JSON.stringify thì không', () => {
    expect(stableStringify({ a: undefined })).not.toBe(stableStringify({ a: null }));
    expect(stableStringify({ a: undefined })).not.toBe(stableStringify({}));
  });

  it('phân biệt NaN với null, và -0 với 0', () => {
    expect(stableStringify(Number.NaN)).not.toBe(stableStringify(null));
    expect(stableStringify(-0)).not.toBe(stableStringify(0));
    expect(stableStringify(Number.POSITIVE_INFINITY)).toBe('Infinity');
  });

  it('vòng lặp tham chiếu ⇒ ném, không treo', () => {
    const cyclic: Record<string, unknown> = { name: 'a' };
    cyclic['self'] = cyclic;
    expect(() => stableStringify(cyclic)).toThrow(/vòng lặp/);
  });

  it('cùng một object xuất hiện hai lần (không phải vòng lặp) thì KHÔNG ném', () => {
    const shared = { x: 1 };
    expect(() => stableStringify({ a: shared, b: shared })).not.toThrow();
  });

  it('hàm ⇒ ném, vì không chuỗi hoá được một cách ổn định', () => {
    expect(() => stableStringify({ fn: () => 1 })).toThrow(TypeError);
  });
});

// ── checksum ────────────────────────────────────────────────────────────────

describe('checksum', () => {
  it('cùng nội dung ⇒ cùng checksum, khác thứ tự key cũng vậy', () => {
    expect(checksum({ a: 1, b: 2 })).toBe(checksum({ b: 2, a: 1 }));
  });

  it('đổi MỘT ký tự ⇒ checksum khác (chiều âm)', () => {
    expect(checksum({ name: 'web' })).not.toBe(checksum({ name: 'wev' }));
  });

  it('luôn ra 8 chữ số hex', () => {
    for (const value of [0, 'x', { a: 1 }, [1, 2, 3], null, cleanSave]) {
      expect(checksum(value)).toMatch(/^[0-9a-f]{8}$/);
    }
  });
});

describe('checkSave', () => {
  it('bản lưu chưa động vào ⇒ nguyên vẹn', () => {
    expect(checkSave(stampSave(cleanSave))).toBe('nguyen-ven');
  });

  it('sửa score bằng devtools ⇒ da-bi-sua (chiều âm)', () => {
    const stamped = stampSave(cleanSave);
    const tampered: GameSave = {
      ...cleanSave,
      runs: [{ ...cleanRun, score: SCORE_MAX }],
    };
    expect(checkSave({ save: tampered, checksum: stamped.checksum })).toBe('da-bi-sua');
  });

  it('thêm một achievement chưa mở khoá ⇒ da-bi-sua', () => {
    const stamped = stampSave(cleanSave);
    const tampered: GameSave = { ...cleanSave, achievements: [...cleanSave.achievements, 'cka'] };
    expect(checkSave({ save: tampered, checksum: stamped.checksum })).toBe('da-bi-sua');
  });

  it('bản lưu cũ chưa có dấu ⇒ khong-co-dau, KHÔNG phải da-bi-sua', () => {
    // Phân biệt "chưa từng ký" với "ký rồi và lệch". Gộp lại là cáo buộc oan mọi
    // người dùng đã chơi trước khi tính năng này tồn tại.
    expect(checkSave({ save: cleanSave })).toBe('khong-co-dau');
    expect(checkSave({ save: cleanSave, checksum: '' })).toBe('khong-co-dau');
  });

  it('đổi settings cũng làm lệch dấu — dấu phủ TOÀN BỘ bản lưu', () => {
    const stamped = stampSave(cleanSave);
    const tampered: GameSave = { ...cleanSave, settings: { disable3d: true, showHints: true } };
    expect(checkSave({ save: tampered, checksum: stamped.checksum })).toBe('da-bi-sua');
  });
});

// ── lastActionTick ──────────────────────────────────────────────────────────

describe('lastActionTick', () => {
  it('lấy tick lớn nhất', () => {
    expect(lastActionTick(cleanLog)).toBe(12);
  });

  it('nhật ký rỗng ⇒ 0', () => {
    expect(lastActionTick({ gameId: 'k8s', levelId: 'x', seed: 1, actions: [] })).toBe(0);
  });
});

// ── Kiểm tính hợp lý ────────────────────────────────────────────────────────

describe('checkPlausibility — chiều âm trước: lượt chơi sạch KHÔNG bị kêu', () => {
  it('lượt chơi bình thường ⇒ không cờ nào', () => {
    // Không có ca này thì mọi ca dương ở dưới đều có thể qua bằng một hàm luôn
    // trả về đủ cờ. Đây là đối chứng âm của cả nhóm.
    expect(checkPlausibility(cleanRun, cleanLog, limits)).toEqual([]);
  });

  it('đạt đúng trần điểm của level ⇒ không kêu (biên là hợp lệ)', () => {
    const atCeiling: RunResult = { ...cleanRun, score: limits.maxScore };
    expect(checkPlausibility(atCeiling, cleanLog, limits)).toEqual([]);
  });

  it('thời lượng đúng bằng tối thiểu mô phỏng ⇒ không kêu (biên là hợp lệ)', () => {
    const exact: RunResult = { ...cleanRun, finishedAt: cleanRun.startedAt + 12 * 1000 };
    expect(checkPlausibility(exact, cleanLog, limits)).toEqual([]);
  });

  it('0 lệnh và 0 objective ⇒ không kêu (bỏ cuộc ngay là hợp lệ)', () => {
    const gaveUp: RunResult = { ...cleanRun, commandsUsed: 0, objectivesMet: [], score: 0 };
    const emptyLog: RunLog = { ...cleanLog, actions: [] };
    expect(checkPlausibility(gaveUp, emptyLog, limits)).toEqual([]);
  });
});

describe('checkPlausibility — chiều dương: từng phép kiểm §8.4.2 tự chứng minh biết kêu', () => {
  it('finishedAt trước startedAt', () => {
    const run: RunResult = { ...cleanRun, finishedAt: cleanRun.startedAt - 5000 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('thoi-gian-nguoc');
  });

  it('xong nhanh hơn số tick mà chuỗi action đòi', () => {
    // 12 tick × 1000ms = 12s tối thiểu; khai xong trong 2s là bất khả thi.
    const run: RunResult = { ...cleanRun, finishedAt: cleanRun.startedAt + 2000 };
    const flags = checkPlausibility(run, cleanLog, limits);
    expect(codes(flags)).toContain('nhanh-hon-mo-phong');
    expect(flags[0]?.detail).toContain('12');
  });

  it('mốc thời gian không phải số hữu hạn', () => {
    const run: RunResult = { ...cleanRun, finishedAt: Number.NaN };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('moc-thoi-gian-hong');
  });

  it('0 lệnh mà vẫn đạt objective cần lệnh', () => {
    const run: RunResult = { ...cleanRun, commandsUsed: 0 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('dat-muc-tieu-khong-lenh');
  });

  it('0 lệnh mà objective nằm trong danh sách không-cần-lệnh ⇒ KHÔNG kêu', () => {
    // Chiều âm của đúng phép kiểm ngay trên: nếu thiếu, mọi level có mục tiêu
    // dạng đọc-hiểu sẽ bị gắn cờ oan và cảnh báo trở thành tiếng ồn.
    const run: RunResult = { ...cleanRun, commandsUsed: 0 };
    const lenient: PlausibilityLimits = {
      ...limits,
      objectivesAchievableWithoutCommands: ['obj-pod-chay'],
    };
    expect(codes(checkPlausibility(run, cleanLog, lenient))).not.toContain(
      'dat-muc-tieu-khong-lenh',
    );
  });

  it('điểm vượt trần của level', () => {
    const run: RunResult = { ...cleanRun, score: limits.maxScore + 1 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('diem-vuot-tran');
  });

  it('điểm vượt trần hợp đồng 1000 kể cả khi trần level được khai cao hơn', () => {
    // Trần level đến từ dữ liệu, mà dữ liệu cũng sửa được. Trần hợp đồng là chốt
    // chặn cuối và không phụ thuộc `limits`.
    const run: RunResult = { ...cleanRun, score: SCORE_MAX + 1 };
    const silly: PlausibilityLimits = { ...limits, maxScore: 999_999 };
    expect(codes(checkPlausibility(run, cleanLog, silly))).toContain('diem-vuot-tran');
  });

  it('điểm âm', () => {
    const run: RunResult = { ...cleanRun, score: -1 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('diem-am');
  });

  it('đạt nhiều objective hơn số objective của level', () => {
    const run: RunResult = { ...cleanRun, objectivesMet: ['a', 'b', 'c'], objectivesTotal: 2 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('objective-thua');
  });

  it('objective trùng id (cách rẻ nhất để thổi phồng số mục tiêu)', () => {
    const run: RunResult = { ...cleanRun, objectivesMet: ['a', 'a'], objectivesTotal: 5 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('objective-trung');
  });

  it('bộ đếm âm', () => {
    const run: RunResult = { ...cleanRun, hintsUsed: -3 };
    expect(codes(checkPlausibility(run, cleanLog, limits))).toContain('so-dem-am');
  });

  it('nhiều vấn đề cùng lúc ⇒ nhiều cờ, không dừng ở cái đầu', () => {
    const run: RunResult = { ...cleanRun, score: -1, hintsUsed: -1, objectivesMet: ['a', 'a'] };
    const flags = checkPlausibility(run, cleanLog, limits);
    expect(flags.length).toBeGreaterThanOrEqual(3);
  });

  it('mọi cờ đều kèm chi tiết đọc được, không phải mã trần', () => {
    const run: RunResult = { ...cleanRun, score: -1 };
    for (const flag of checkPlausibility(run, cleanLog, limits)) {
      expect(flag.detail.length).toBeGreaterThan(0);
    }
  });
});
