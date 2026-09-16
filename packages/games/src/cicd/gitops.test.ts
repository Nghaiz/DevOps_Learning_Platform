/**
 * Ghim `simulateGitOps` vào luật G1–G5 của `cd-contract.ts` §2 và AC-B.
 *
 * Mỗi `describe` ghi nó BẮT được cái sai nào. Những con số kỳ vọng tính tay từ
 * luật, không chạy hàm rồi chép lại — chép lại thì bộ test chỉ khẳng định hàm
 * trả về đúng thứ nó đang trả về.
 *
 * Có ba loại đối chứng xuyên suốt:
 *
 * - **Đối chứng đảo luật.** G1 chọn "thay đổi trước, đối soát sau" trong cùng
 *   giây. Chọn ngược lại cũng tất định, nhưng lệch đúng một chu kỳ. Test nói rõ
 *   con số của cách sai để một lần đảo luật không lọt qua như "vẫn xanh".
 * - **Đối chứng một-biến.** Cùng kịch bản, chỉ đổi `selfHeal` hoặc
 *   `ignoreFields`, và khẳng định cả hai phía — bài C25 là một phép so sánh,
 *   không phải một con số đứng một mình.
 * - **Đối chứng thứ tự mảng.** Đảo mảng `changes` phải KHÔNG đổi gì, trừ khi hai
 *   thay đổi trùng (giây, tác nhân, trường) — ở đó thứ tự mảng CHÍNH là luật G1.
 *
 * ⚠ Những ca ghi "cách đọc" ghim chỗ hợp đồng im lặng — xem đầu `gitops.ts`.
 * Đổi cách đọc là đổi hợp đồng, phải qua lead.
 */
import { describe, expect, it } from 'vitest';

import type {
  DriftRecord,
  GitOpsActor,
  GitOpsChange,
  GitOpsPolicy,
  GitOpsScenario,
} from './cd-contract.ts';
import {
  driftSeconds,
  longestDriftSeconds,
  selfHealFights,
  simulateGitOps,
  undetectedDriftCount,
} from './gitops.ts';

// ── Bộ dựng ─────────────────────────────────────────────────────────────────

/** Chu kỳ đối soát dùng chung. Nhịp: 10, 20, 30, … */
const P = 10;

const INITIAL = [
  { field: 'image', value: 'v1' },
  { field: 'replicas', value: '3' },
] as const;

function policy(overrides: Partial<GitOpsPolicy> = {}): GitOpsPolicy {
  return { reconcileEverySeconds: P, selfHeal: true, ignoreFields: [], ...overrides };
}

function scenario(
  changes: readonly GitOpsChange[],
  horizonSeconds = 60,
  initial: GitOpsScenario['initial'] = INITIAL,
): GitOpsScenario {
  return { horizonSeconds, initial, changes };
}

function git(atSecond: number, field: string, value: string): GitOpsChange {
  return { atSecond, actor: 'git', field, value };
}

function human(atSecond: number, field: string, value: string): GitOpsChange {
  return { atSecond, actor: 'human', field, value };
}

function controller(
  atSecond: number,
  field: string,
  value: string,
  reassertEverySeconds: number,
): GitOpsChange {
  return { atSecond, actor: 'controller', field, value, reassertEverySeconds };
}

function drift(
  field: string,
  cause: GitOpsActor,
  startedAtSecond: number,
  detectedAtSecond: number | null,
  endedAtSecond: number | null,
  endedBy: DriftRecord['endedBy'],
): DriftRecord {
  return { field, cause, startedAtSecond, detectedAtSecond, endedAtSecond, endedBy };
}

// ── AC-B ────────────────────────────────────────────────────────────────────

describe('AC-B — lệch sống đúng tới nhịp đối soát kế tiếp', () => {
  it('selfHeal bật, sửa tay ở giây t lệch nhịp ⇒ đoạn lệch dài ceil(t/P)×P − t', () => {
    // Bắt: đối soát "ngay khi lệch" (ra 0), hoặc đếm tới nhịp SAU nhịp kế tiếp.
    for (let t = 1; t < 40; t += 1) {
      if (t % P === 0) continue;
      const s = scenario([human(t, 'replicas', '5')]);
      const record = simulateGitOps(policy(), s);
      const beat = Math.ceil(t / P) * P;
      expect(record.drifts).toEqual([drift('replicas', 'human', t, beat, beat, 'reconcile')]);
      expect(driftSeconds(record.drifts[0] as DriftRecord, s)).toBe(beat - t);
    }
    // Hai giá trị tính tay, để công thức trong vòng lặp không tự xác nhận chính nó.
    const s7 = scenario([human(7, 'replicas', '5')]);
    expect(longestDriftSeconds(simulateGitOps(policy(), s7), s7)).toBe(3);
    const s13 = scenario([human(13, 'replicas', '5')]);
    expect(longestDriftSeconds(simulateGitOps(policy(), s13), s13)).toBe(7);
  });

  it('sửa tay ĐÚNG nhịp ⇒ dài 0 (G1: thay đổi áp trước, đối soát chạy sau)', () => {
    // Bắt: đảo thứ tự trong giây. Đối soát chạy trước thì nó không thấy thay đổi
    // ở giây 20, và đoạn lệch sống tới 30 — dài P = 10 thay vì 0.
    const s = scenario([human(20, 'replicas', '5')]);
    const record = simulateGitOps(policy(), s);
    expect(record.drifts).toEqual([drift('replicas', 'human', 20, 20, 20, 'reconcile')]);
    expect(driftSeconds(record.drifts[0] as DriftRecord, s)).toBe(0);
    expect(driftSeconds(record.drifts[0] as DriftRecord, s)).not.toBe(P);
  });

  it('sửa tay ở giây 0 ⇒ dài P, không phải 0 — công thức AC-B không áp ở t = 0', () => {
    // Nhịp là k × P với k ≥ 1, nên giây 0 KHÔNG phải nhịp. Công thức
    // ceil(0/P)×P − 0 cho 0; mô phỏng đúng luật cho P. Ghim để không ai "sửa"
    // bộ mô phỏng cho khớp công thức ở ca biên này.
    const s = scenario([human(0, 'replicas', '5')]);
    const record = simulateGitOps(policy(), s);
    expect(record.drifts).toEqual([drift('replicas', 'human', 0, 10, 10, 'reconcile')]);
    expect(record.reconcileSeconds[0]).toBe(10);
  });

  it('selfHeal tắt ⇒ đoạn lệch không đóng, nhưng vẫn được PHÁT HIỆN ở nhịp kế tiếp', () => {
    // Bắt: tắt tự sửa mà tắt luôn phát hiện (detectedAtSecond null), hoặc lỡ tay sửa.
    const s = scenario([human(7, 'replicas', '5')]);
    const record = simulateGitOps(policy({ selfHeal: false }), s);
    expect(record.drifts).toEqual([drift('replicas', 'human', 7, 10, null, null)]);
    expect(driftSeconds(record.drifts[0] as DriftRecord, s)).toBe(60 - 7);
    expect(undetectedDriftCount(record)).toBe(0);
  });
});

// ── G2 — đồng bộ commit ─────────────────────────────────────────────────────

describe('G2 — commit đồng bộ ở nhịp kế tiếp, bất kể selfHeal', () => {
  it('lệch do git đóng bằng reconcile ở nhịp kế tiếp, với selfHeal bật hay tắt như nhau', () => {
    // Bắt: gắn đồng bộ commit vào cờ selfHeal (hợp đồng: selfHeal KHÔNG quyết chuyện này).
    const s = scenario([git(7, 'image', 'v2')]);
    const expected = [drift('image', 'git', 7, 10, 10, 'reconcile')];
    expect(simulateGitOps(policy({ selfHeal: true }), s).drifts).toEqual(expected);
    expect(simulateGitOps(policy({ selfHeal: false }), s).drifts).toEqual(expected);
  });

  it('sau đồng bộ, trạng thái sống mang giá trị MỚI — sửa tay về giá trị cũ mới là lệch', () => {
    // Bắt: đóng đoạn lệch mà không thật sự gán sống := khai.
    const s = scenario([git(7, 'image', 'v2'), human(15, 'image', 'v1')]);
    expect(simulateGitOps(policy({ selfHeal: false }), s).drifts).toEqual([
      drift('image', 'git', 7, 10, 10, 'reconcile'),
      drift('image', 'human', 15, 20, null, null),
    ]);
  });

  it('commit đúng nhịp ⇒ dài 0', () => {
    const s = scenario([git(30, 'image', 'v2')]);
    expect(simulateGitOps(policy({ selfHeal: false }), s).drifts).toEqual([
      drift('image', 'git', 30, 30, 30, 'reconcile'),
    ]);
  });

  it('cách đọc: đồng bộ commit đóng cả đoạn lệch do người, dù selfHeal tắt', () => {
    // Người sửa 3 → 5, rồi commit khai 4. Nhịp 10 đồng bộ sống := 4, và đoạn lệch
    // (vẫn là đoạn mở bởi người — cách đọc 1) đóng bằng reconcile.
    const s = scenario([human(3, 'replicas', '5'), git(6, 'replicas', '4')]);
    expect(simulateGitOps(policy({ selfHeal: false }), s).drifts).toEqual([
      drift('replicas', 'human', 3, 10, 10, 'reconcile'),
    ]);
  });

  it('cách đọc: "khai đổi" so theo GIÁ TRỊ — commit rồi hoàn tác trước nhịp không kích đồng bộ', () => {
    // Khai 3 → 4 → 3 trước nhịp 10: khai tại nhịp bằng khai lần đồng bộ trước.
    // Đoạn lệch do người vì vậy rơi vào G2 ý 2 — selfHeal tắt thì chỉ phát hiện.
    const s = scenario([
      human(2, 'replicas', '9'),
      git(3, 'replicas', '4'),
      git(6, 'replicas', '3'),
    ]);
    expect(simulateGitOps(policy({ selfHeal: false }), s).drifts).toEqual([
      drift('replicas', 'human', 2, 10, null, null),
    ]);
  });
});

// ── G3 — danh sách loại trừ ─────────────────────────────────────────────────

describe('G3 — ignoreFields: ghi lại, không phát hiện, không sửa, không đồng bộ', () => {
  it('sửa tay trên trường loại trừ: ghi, detectedAtSecond null, không bao giờ đóng bằng reconcile', () => {
    // Bắt: loại trừ bằng cách KHÔNG GHI (lệch có thật mà bản ghi nói không có).
    const s = scenario([human(5, 'image', 'hotfix'), human(3, 'replicas', '5')]);
    const record = simulateGitOps(policy({ ignoreFields: ['image'] }), s);
    expect(record.drifts).toEqual([
      // Trường không loại trừ vẫn đối soát bình thường — đối chứng trong cùng lượt.
      drift('replicas', 'human', 3, 10, 10, 'reconcile'),
      drift('image', 'human', 5, null, null, null),
    ]);
    expect(undetectedDriftCount(record)).toBe(1);
    expect(longestDriftSeconds(record, s, 'image')).toBe(55);
  });

  it('commit trên trường loại trừ không bao giờ được đồng bộ; bỏ loại trừ thì đồng bộ ở nhịp 10', () => {
    const s = scenario([git(7, 'image', 'v2')]);
    const ignored = simulateGitOps(policy({ ignoreFields: ['image'] }), s);
    expect(ignored.drifts).toEqual([drift('image', 'git', 7, null, null, null)]);
    expect(undetectedDriftCount(ignored)).toBe(1);

    const control = simulateGitOps(policy(), s);
    expect(control.drifts).toEqual([drift('image', 'git', 7, 10, 10, 'reconcile')]);
    expect(undetectedDriftCount(control)).toBe(0);
  });

  it('loại trừ một trường không tồn tại là chính sách vô dụng, không phải lỗi', () => {
    const s = scenario([human(7, 'replicas', '5')]);
    expect(simulateGitOps(policy({ ignoreFields: ['khong-co'] }), s)).toEqual(
      simulateGitOps(policy(), s),
    );
  });
});

// ── G4 — giành nhau với bộ điều khiển (bài C25) ─────────────────────────────

describe('G4 — tự sửa không loại trừ trường thì giành nhau mãi', () => {
  // Bộ điều khiển đặt replicas = 5 ở giây 3, đặt lại 4 giây sau mỗi lần bị đè.
  // Tính tay: đè ở 10 → đặt lại 14 → đè ở 20 → 24 → 30 → 34 → 40 → 44 → 50 → 54
  // → 60 → hẹn 64 > horizon 60, dừng.
  const fight = scenario([controller(3, 'replicas', '5', 4)]);

  it('selfHeal bật, không loại trừ ⇒ 6 lần giành nhau, mỗi lần một đoạn lệch MỚI', () => {
    const record = simulateGitOps(policy(), fight);
    expect(record.drifts).toEqual([
      drift('replicas', 'controller', 3, 10, 10, 'reconcile'),
      drift('replicas', 'controller', 14, 20, 20, 'reconcile'),
      drift('replicas', 'controller', 24, 30, 30, 'reconcile'),
      drift('replicas', 'controller', 34, 40, 40, 'reconcile'),
      drift('replicas', 'controller', 44, 50, 50, 'reconcile'),
      drift('replicas', 'controller', 54, 60, 60, 'reconcile'),
    ]);
    expect(selfHealFights(record)).toBe(6);
  });

  it('thêm trường vào ignoreFields ⇒ 0 lần giành nhau, và đoạn lệch vẫn được ghi', () => {
    const record = simulateGitOps(policy({ ignoreFields: ['replicas'] }), fight);
    expect(record.drifts).toEqual([drift('replicas', 'controller', 3, null, null, null)]);
    expect(selfHealFights(record)).toBe(0);
    expect(longestDriftSeconds(record, fight)).toBe(57);
  });

  it('phát hiện bật, tự sửa tắt ⇒ 0 lần giành nhau nhưng đoạn lệch ĐÃ bị thấy', () => {
    // Tư thế "hầu hết đội" ở C25. Phân biệt với loại trừ: ở đây detectedAtSecond = 10.
    const record = simulateGitOps(policy({ selfHeal: false }), fight);
    expect(record.drifts).toEqual([drift('replicas', 'controller', 3, 10, null, null)]);
    expect(selfHealFights(record)).toBe(0);
  });

  it('đặt lại trùng nhịp ⇒ đoạn dài 0 nhưng VẪN đếm là một lần giành nhau', () => {
    // Đè ở 10, đặt lại ở 20 = nhịp: G1 cho thay đổi chạy trước, đối soát đè ngay.
    const s = scenario([controller(3, 'replicas', '5', 10)]);
    const record = simulateGitOps(policy(), s);
    expect(record.drifts).toEqual([
      drift('replicas', 'controller', 3, 10, 10, 'reconcile'),
      drift('replicas', 'controller', 20, 20, 20, 'reconcile'),
      drift('replicas', 'controller', 30, 30, 30, 'reconcile'),
      drift('replicas', 'controller', 40, 40, 40, 'reconcile'),
      drift('replicas', 'controller', 50, 50, 50, 'reconcile'),
      drift('replicas', 'controller', 60, 60, 60, 'reconcile'),
    ]);
    expect(selfHealFights(record)).toBe(6);
    expect(longestDriftSeconds(record, s)).toBe(7);
  });

  it('cách đọc: người sửa đè giá trị bộ điều khiển cũng hẹn một lần đặt lại', () => {
    // selfHeal tắt để đối soát không chen vào. Bộ điều khiển đặt 5 ở 3 (lệch mở),
    // người đặt 7 ở 6 (vẫn lệch, cùng đoạn), bộ điều khiển đặt lại 5 ở 6 + 4 = 10
    // (vẫn lệch). Người đặt 3 ở 12 = khai ⇒ đoạn đóng 'overwritten', và đó cũng là
    // một lần bị đè ⇒ đặt lại ở 16 mở đoạn mới.
    const s = scenario(
      [controller(3, 'replicas', '5', 4), human(6, 'replicas', '7'), human(12, 'replicas', '3')],
      30,
    );
    expect(simulateGitOps(policy({ selfHeal: false }), s).drifts).toEqual([
      drift('replicas', 'controller', 3, 10, 12, 'overwritten'),
      drift('replicas', 'controller', 16, 20, null, null),
    ]);
  });
});

// ── G5 — khớp trở lại bởi một thay đổi ──────────────────────────────────────

describe("G5 — thay đổi làm sống khớp khai đóng đoạn lệch 'overwritten'", () => {
  it('người sửa tay rồi tự hoàn tác trước nhịp ⇒ overwritten, không lần đối soát nào thấy', () => {
    const s = scenario([human(3, 'replicas', '5'), human(6, 'replicas', '3')]);
    const record = simulateGitOps(policy(), s);
    expect(record.drifts).toEqual([drift('replicas', 'human', 3, null, 6, 'overwritten')]);
    expect(undetectedDriftCount(record)).toBe(1);
  });

  it('commit khai đúng giá trị người đã sửa ⇒ overwritten; nhịp sau đồng bộ không mở gì', () => {
    const s = scenario([human(3, 'replicas', '5'), git(6, 'replicas', '5')]);
    expect(simulateGitOps(policy(), s).drifts).toEqual([
      drift('replicas', 'human', 3, null, 6, 'overwritten'),
    ]);
  });

  it('cách đọc: thay đổi GIỮ tình trạng lệch không cắt đoạn (không có kiểu kết thúc thứ ba)', () => {
    // Bắt: mở đoạn mới ở mỗi thay đổi. Người sửa 3 → 5 rồi 5 → 7: MỘT đoạn [3, 10].
    const s = scenario([human(3, 'replicas', '5'), human(6, 'replicas', '7')]);
    expect(simulateGitOps(policy(), s).drifts).toEqual([
      drift('replicas', 'human', 3, 10, 10, 'reconcile'),
    ]);
  });
});

// ── G1 — thứ tự trong cùng một giây ─────────────────────────────────────────

describe('G1 — thứ tự trong giây: tác nhân, rồi trường, rồi thứ tự mảng', () => {
  it('git áp TRƯỚC human dù mảng xếp human trước ⇒ đoạn lệch mang cause git', () => {
    // Giây 5, mảng: human replicas=4, git replicas=4.
    // Đúng G1: git mở lệch (khai 4, sống 3), human đóng 'overwritten' ⇒ cause git.
    // Nếu áp theo thứ tự mảng: human mở lệch, git đóng ⇒ cause human.
    const s = scenario([human(5, 'replicas', '4'), git(5, 'replicas', '4')]);
    const record = simulateGitOps(policy(), s);
    expect(record.drifts).toEqual([drift('replicas', 'git', 5, null, 5, 'overwritten')]);
    expect(
      simulateGitOps(policy(), scenario([git(5, 'replicas', '4'), human(5, 'replicas', '4')])),
    ).toEqual(record);
  });

  it('bản ghi sắp (giây, trường theo mã đơn vị, cause theo G1) — không theo localeCompare', () => {
    // Các trường độc lập nên thứ tự ÁP giữa hai trường không đổi được bản ghi;
    // thứ quan sát được là thứ tự XUẤT. 'Zeta' (Z = 90) đứng trước 'alpha' (a = 97)
    // theo mã đơn vị; localeCompare xếp ngược lại.
    const initial = [
      { field: 'alpha', value: '0' },
      { field: 'Zeta', value: '0' },
      { field: 'replicas', value: '3' },
    ];
    const s = scenario(
      [
        human(5, 'replicas', '1'),
        human(5, 'alpha', '1'),
        human(5, 'Zeta', '1'),
        human(2, 'replicas', '0'),
      ],
      20,
      initial,
    );
    // replicas lệch từ giây 2 (0 → 1 ở giây 5 giữ nguyên đoạn), nên nó đứng đầu.
    expect(
      simulateGitOps(policy(), s).drifts.map((d) => `${d.startedAtSecond}:${d.field}`),
    ).toEqual(['2:replicas', '5:Zeta', '5:alpha']);
  });

  it('cùng giây, cùng trường: cause xếp git < controller theo G1 (mã đơn vị sẽ xếp ngược)', () => {
    // Giây 5: git khai 4 (mở lệch git), người sửa 4 (đóng), bộ điều khiển đặt 8
    // (mở lệch controller). Nhịp 10 đồng bộ khai 4 ⇒ đè 8 ⇒ đóng reconcile.
    const s = scenario(
      [controller(5, 'replicas', '8', 100), human(5, 'replicas', '4'), git(5, 'replicas', '4')],
      20,
    );
    const record = simulateGitOps(policy(), s);
    expect(record.drifts).toEqual([
      drift('replicas', 'git', 5, null, 5, 'overwritten'),
      drift('replicas', 'controller', 5, 10, 10, 'reconcile'),
    ]);
    expect(selfHealFights(record)).toBe(1);
  });

  it('cùng (giây, tác nhân, trường): thứ tự mảng CHÍNH là luật — đảo lại cho bản ghi khác', () => {
    // [5 → 3]: mở rồi đóng trong giây 5. [3 → 5]: 3 là không đổi gì, 5 mở lệch tới 10.
    const a = simulateGitOps(
      policy(),
      scenario([human(5, 'replicas', '5'), human(5, 'replicas', '3')]),
    );
    const b = simulateGitOps(
      policy(),
      scenario([human(5, 'replicas', '3'), human(5, 'replicas', '5')]),
    );
    expect(a.drifts).toEqual([drift('replicas', 'human', 5, null, 5, 'overwritten')]);
    expect(b.drifts).toEqual([drift('replicas', 'human', 5, 10, 10, 'reconcile')]);
  });
});

// ── Tất định ────────────────────────────────────────────────────────────────

describe('tất định', () => {
  const changes: readonly GitOpsChange[] = [
    human(3, 'replicas', '5'),
    git(7, 'image', 'v2'),
    controller(11, 'replicas', '9', 3),
    human(20, 'image', 'hotfix'),
    git(20, 'replicas', '4'),
    human(26, 'image', 'v2'),
    human(33, 'replicas', '1'),
  ];

  it('cùng đầu vào ⇒ bản ghi bằng nhau sâu', () => {
    const s = scenario(changes, 50);
    expect(simulateGitOps(policy(), s)).toEqual(simulateGitOps(policy(), s));
  });

  it('đảo mảng changes (không cặp nào trùng giây+tác nhân+trường) ⇒ bản ghi không đổi', () => {
    const forward = simulateGitOps(policy(), scenario(changes, 50));
    const reversed = simulateGitOps(policy(), scenario([...changes].reverse(), 50));
    expect(reversed).toEqual(forward);
    // Bảo đảm phép so không rỗng: kịch bản thật sự sinh nhiều đoạn lệch.
    expect(forward.drifts.length).toBeGreaterThan(3);
  });

  it('reconcileSeconds là mọi k × P, k ≥ 1, tới hết horizon (bao gồm)', () => {
    expect(simulateGitOps(policy(), scenario([], 35)).reconcileSeconds).toEqual([10, 20, 30]);
    expect(simulateGitOps(policy(), scenario([], 30)).reconcileSeconds).toEqual([10, 20, 30]);
    expect(
      simulateGitOps(policy({ reconcileEverySeconds: 40 }), scenario([], 35)).reconcileSeconds,
    ).toEqual([]);
  });
});

// ── Phép chiếu ──────────────────────────────────────────────────────────────

describe('phép chiếu', () => {
  it('driftSeconds: đóng = ended − started, mở = horizon − started', () => {
    const s = scenario([], 60);
    expect(driftSeconds(drift('x', 'human', 7, 10, 10, 'reconcile'), s)).toBe(3);
    expect(driftSeconds(drift('x', 'human', 7, 10, null, null), s)).toBe(53);
  });

  it('longestDriftSeconds lọc theo trường, và không có đoạn nào ⇒ 0', () => {
    const s = scenario([human(3, 'replicas', '5'), human(12, 'image', 'x')]);
    const record = simulateGitOps(policy({ selfHeal: false }), s);
    expect(longestDriftSeconds(record, s)).toBe(57);
    expect(longestDriftSeconds(record, s, 'image')).toBe(48);
    expect(longestDriftSeconds(record, s, 'khong-co')).toBe(0);
    expect(longestDriftSeconds(simulateGitOps(policy(), scenario([])), s)).toBe(0);
  });

  it('selfHealFights chỉ đếm controller đóng bằng reconcile; undetected đếm detected null', () => {
    const record = {
      drifts: [
        drift('a', 'controller', 1, 10, 10, 'reconcile'),
        drift('a', 'controller', 12, null, 15, 'overwritten'),
        drift('b', 'human', 2, 10, 10, 'reconcile'),
        drift('c', 'git', 3, null, null, null),
      ],
      reconcileSeconds: [10],
    };
    expect(selfHealFights(record)).toBe(1);
    expect(undetectedDriftCount(record)).toBe(2);
  });
});

// ── Dữ liệu sai là ném ──────────────────────────────────────────────────────

describe('dữ liệu sai là ném, không phải bản ghi rỗng', () => {
  it.each<[string, GitOpsPolicy, GitOpsScenario]>([
    ['chu kỳ 0', policy({ reconcileEverySeconds: 0 }), scenario([])],
    ['chu kỳ không nguyên', policy({ reconcileEverySeconds: 2.5 }), scenario([])],
    ['horizon 0', policy(), scenario([], 0)],
    ['trường không có trong initial', policy(), scenario([human(3, 'khong-co', '1')])],
    ['thay đổi sau horizon', policy(), scenario([human(61, 'replicas', '1')])],
    ['giây âm', policy(), scenario([human(-1, 'replicas', '1')])],
    [
      'controller thiếu reassertEverySeconds',
      policy(),
      scenario([{ atSecond: 3, actor: 'controller', field: 'replicas', value: '5' }]),
    ],
    ['reassertEverySeconds 0', policy(), scenario([controller(3, 'replicas', '5', 0)])],
    [
      'reassertEverySeconds trên human',
      policy(),
      scenario([{ ...human(3, 'replicas', '5'), reassertEverySeconds: 4 }]),
    ],
    [
      'hai controller trên một trường',
      policy(),
      scenario([controller(3, 'replicas', '5', 4), controller(9, 'replicas', '6', 4)]),
    ],
    [
      'initial trùng trường',
      policy(),
      scenario([], 60, [
        { field: 'a', value: '1' },
        { field: 'a', value: '2' },
      ]),
    ],
  ])('%s', (_name, p, s) => {
    expect(() => simulateGitOps(p, s)).toThrow();
  });
});
