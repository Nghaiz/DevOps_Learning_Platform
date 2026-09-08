/**
 * Kiểm HÌNH DẠNG DỮ LIỆU của toàn bộ nội dung Kubernetes Game.
 *
 * ⛔ File này cố ý KHÔNG import reducer, predicates, hay bất cứ thứ gì của lane
 * B. Nó chạy được kể cả khi engine chưa tồn tại, và đó là điều kiện để lane C
 * kiểm được nội dung của mình mà không phải đợi lane khác.
 *
 * Nó cũng gánh luôn `challenges.ts` và `chaos.ts` thay vì tách ra file riêng
 * dưới `src/k8s/`: thư mục đó thuộc lane B trừ đúng hai file kia, nên đặt test ở
 * đây tránh được một va chạm quyền sở hữu mà không mất gì.
 */

import { describe, expect, it } from 'vitest';
import type { IncidentKind, Objective } from '../contract.ts';
import { PREDICATE_NAMES } from '../predicate-names.ts';
import { CHALLENGES } from '../challenges.ts';
import { CHAOS_WAVES, GRACE_TOI_THIEU, dotHonLoan } from '../chaos.ts';
import { LEVELS } from './index.ts';

const TEN_VI_TU = new Set<string>(PREDICATE_NAMES);

/**
 * Bản sao lúc CHẠY của `IncidentKind` — kiểu union không tồn tại sau khi biên
 * dịch nên không có cách nào đọc nó lúc chạy.
 *
 * Một danh sách chép tay là một lời khai mà không ai kiểm lại
 * (`rules/pinned-baseline-test-companion.md`). Nên nó có bạn đồng hành ngay
 * dưới: `KHONG_THIEU_MUC_NAO` đỏ ở TYPECHECK nếu hợp đồng thêm một
 * `IncidentKind` mà danh sách này chưa chép. Nhờ vậy nó không thể lặng lẽ lạc
 * hậu — thiếu một mục là build đỏ, không phải là một phép kiểm rỗng.
 */
const LOAI_SU_CO = [
  'image-tag-sai',
  'image-registry-khong-toi-duoc',
  'thieu-imagepullsecret',
  'memory-limit-qua-thap',
  'lenh-entrypoint-sai',
  'thieu-configmap',
  'thieu-secret',
  'key-configmap-sai',
  'readiness-probe-sai-cong',
  'liveness-probe-qua-gat',
  'probe-khong-co-initialdelay',
  'service-selector-lech-label',
  'service-sai-targetport',
  'khong-co-endpoint',
  'dns-khong-phan-giai',
  'networkpolicy-chan-nham',
  'ingress-sai-path',
  'pvc-khong-co-pv-khop',
  'storageclass-khong-ton-tai',
  'pvc-readwriteonce-hai-node',
  'node-notready',
  'node-het-cpu',
  'node-het-memory',
  'taint-khong-co-toleration',
  'nodeselector-khong-khop',
  'resourcequota-chan',
  'limitrange-tu-choi',
  'rbac-thieu-quyen',
  'serviceaccount-khong-ton-tai',
  'pdb-chan-drain',
  'hpa-khong-co-metrics',
  'replica-vuot-quota',
] as const satisfies readonly IncidentKind[];

/**
 * Bạn đồng hành của `LOAI_SU_CO`, chạy ở tầng KIỂU chứ không ở tầng test.
 * Hợp đồng thêm một `IncidentKind` chưa được chép xuống dưới ⇒ `Thieu` khác
 * `never` ⇒ dòng này không biên dịch được.
 */
type Thieu = Exclude<IncidentKind, (typeof LOAI_SU_CO)[number]>;
const KHONG_THIEU_MUC_NAO: Thieu extends never ? true : never = true;

const TAP_SU_CO = new Set<string>(LOAI_SU_CO);

/** Đếm từ theo khoảng trắng — cùng cách một người soạn nội dung tự đếm. */
function demTu(s: string): number {
  return s.trim().split(/\s+/u).filter(Boolean).length;
}

function moiMucTieu(muc: readonly Objective[]): readonly Objective[] {
  return muc;
}

describe('LOAI_SU_CO bám sát hợp đồng', () => {
  it('không thiếu mục nào so với IncidentKind', () => {
    expect(KHONG_THIEU_MUC_NAO).toBe(true);
    expect(LOAI_SU_CO.length).toBe(new Set(LOAI_SU_CO).size);
  });
});

describe('LEVELS — hình dạng và thứ tự', () => {
  it('có ít nhất 30 level', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(30);
  });

  it('id là duy nhất', () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id theo đúng khuôn k8s-NN-slug, slug không dấu', () => {
    for (const level of LEVELS) {
      expect(level.id, level.id).toMatch(/^k8s-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
  });

  it('số thứ tự trong id khớp vị trí trong mảng', () => {
    LEVELS.forEach((level, i) => {
      const so = Number(level.id.slice(4, 6));
      expect(so, level.id).toBe(i + 1);
    });
  });

  it('chapter tăng dần (không giảm) dọc theo mảng', () => {
    let truoc = 0;
    for (const level of LEVELS) {
      expect(level.chapter, level.id).toBeGreaterThanOrEqual(truoc);
      truoc = level.chapter;
    }
  });

  it('chapter nằm trong 1..6', () => {
    for (const level of LEVELS) {
      expect(level.chapter, level.id).toBeGreaterThanOrEqual(1);
      expect(level.chapter, level.id).toBeLessThanOrEqual(6);
    }
  });
});

describe('LEVELS — mục tiêu và vị từ', () => {
  it('mọi check đều nằm trong PREDICATE_NAMES', () => {
    for (const level of LEVELS) {
      for (const muc of moiMucTieu(level.objectives)) {
        expect(TEN_VI_TU.has(muc.check), `${level.id} › ${muc.id} › ${muc.check}`).toBe(true);
      }
    }
  });

  it('mỗi level có ít nhất một mục tiêu bắt buộc', () => {
    for (const level of LEVELS) {
      const batBuoc = level.objectives.filter((m) => m.required);
      expect(batBuoc.length, level.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('id mục tiêu là duy nhất trong từng level', () => {
    for (const level of LEVELS) {
      const ids = level.objectives.map((m) => m.id);
      expect(new Set(ids).size, level.id).toBe(ids.length);
    }
  });

  it('mọi mục tiêu đều có nhãn tiếng Việt không rỗng', () => {
    for (const level of LEVELS) {
      for (const muc of level.objectives) {
        expect(muc.label.trim().length, `${level.id} › ${muc.id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('LEVELS — sự cố gieo sẵn', () => {
  it('mọi seededIncident đều là IncidentKind có thật', () => {
    for (const level of LEVELS) {
      for (const tai of level.initialState.resources) {
        if (tai.seededIncident === undefined) continue;
        expect(TAP_SU_CO.has(tai.seededIncident), `${level.id} › ${tai.name}`).toBe(true);
      }
    }
  });

  it('sự cố chỉ được gieo lên tài nguyên nằm trong namespace đã khai', () => {
    for (const level of LEVELS) {
      const ns = new Set(level.initialState.namespaces);
      for (const tai of level.initialState.resources) {
        // Tài nguyên phạm vi cluster (PV, StorageClass) khai namespace rỗng.
        if (tai.namespace === '') continue;
        expect(ns.has(tai.namespace), `${level.id} › ${tai.kind}/${tai.name}`).toBe(true);
      }
    }
  });
});

describe('LEVELS — nội dung dạy học', () => {
  it('brief là markdown tiếng Việt không quá 400 từ', () => {
    for (const level of LEVELS) {
      expect(level.brief.trim().length, level.id).toBeGreaterThan(0);
      expect(demTu(level.brief), level.id).toBeLessThanOrEqual(400);
    }
  });

  it('primer không quá 250 từ và không rỗng', () => {
    for (const level of LEVELS) {
      expect(level.teaching.primer.trim().length, level.id).toBeGreaterThan(0);
      expect(demTu(level.teaching.primer), level.id).toBeLessThanOrEqual(250);
    }
  });

  it('cheatsheet có 2 tới 6 mục, mỗi mục đủ command và explain', () => {
    for (const level of LEVELS) {
      const cs = level.teaching.cheatsheet;
      expect(cs.length, level.id).toBeGreaterThanOrEqual(2);
      expect(cs.length, level.id).toBeLessThanOrEqual(6);
      for (const muc of cs) {
        expect(muc.command.trim().length, level.id).toBeGreaterThan(0);
        expect(muc.explain.trim().length, level.id).toBeGreaterThan(0);
      }
    }
  });

  it('takeaways có 2 tới 4 ý, mỗi ý không rỗng', () => {
    for (const level of LEVELS) {
      const tk = level.teaching.takeaways;
      expect(tk.length, level.id).toBeGreaterThanOrEqual(2);
      expect(tk.length, level.id).toBeLessThanOrEqual(4);
      for (const y of tk) expect(y.trim().length, level.id).toBeGreaterThan(0);
    }
  });

  it('có ít nhất một gợi ý, và gợi ý sau dài hơn gợi ý đầu', () => {
    for (const level of LEVELS) {
      expect(level.hints.length, level.id).toBeGreaterThanOrEqual(1);
      for (const g of level.hints) expect(g.trim().length, level.id).toBeGreaterThan(0);
      const dau = level.hints[0];
      const cuoi = level.hints[level.hints.length - 1];
      // Gợi ý cuối phải CỤ THỂ hơn gợi ý đầu. Độ dài là phép đo thô nhưng nó bắt
      // được đúng lỗi đáng sợ: một gợi ý đầu tiên đã nói toẹt lời giải.
      if (level.hints.length > 1 && dau !== undefined && cuoi !== undefined) {
        expect(cuoi.length, level.id).toBeGreaterThan(dau.length * 0.6);
      }
    }
  });

  it('teaches và allowedResources đều không rỗng', () => {
    for (const level of LEVELS) {
      expect(level.teaches.length, level.id).toBeGreaterThanOrEqual(1);
      expect(level.allowedResources.length, level.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('parMoves là số nguyên dương', () => {
    for (const level of LEVELS) {
      expect(Number.isInteger(level.parMoves), level.id).toBe(true);
      expect(level.parMoves, level.id).toBeGreaterThan(0);
    }
  });
});

describe('CHALLENGES — hình dạng', () => {
  it('có đúng 10 thử thách với id duy nhất', () => {
    expect(CHALLENGES.length).toBe(10);
    const ids = CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('id theo khuôn ch-NN-slug', () => {
    for (const c of CHALLENGES) {
      expect(c.id, c.id).toMatch(/^ch-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/u);
    }
  });

  it('mọi check đều nằm trong PREDICATE_NAMES', () => {
    for (const c of CHALLENGES) {
      for (const muc of c.objectives) {
        expect(TEN_VI_TU.has(muc.check), `${c.id} › ${muc.id} › ${muc.check}`).toBe(true);
      }
    }
  });

  it('mỗi thử thách có ít nhất một mục tiêu bắt buộc', () => {
    for (const c of CHALLENGES) {
      expect(c.objectives.filter((m) => m.required).length, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('mọi seededIncident đều là IncidentKind có thật', () => {
    for (const c of CHALLENGES) {
      for (const tai of c.initialState.resources) {
        if (tai.seededIncident === undefined) continue;
        expect(TAP_SU_CO.has(tai.seededIncident), `${c.id} › ${tai.name}`).toBe(true);
      }
    }
  });

  it('timeLimitSec là bội số của 30 giây, nằm trong 120..900', () => {
    for (const c of CHALLENGES) {
      expect(c.timeLimitSec % 30, c.id).toBe(0);
      expect(c.timeLimitSec, c.id).toBeGreaterThanOrEqual(120);
      expect(c.timeLimitSec, c.id).toBeLessThanOrEqual(900);
    }
  });

  /**
   * Chốt cứng bài học từ bản gốc: giới hạn thời gian phải KHÁC NHAU giữa các
   * thử thách. Nếu mọi thử thách dùng chung một con số thì mọi ngưỡng chấm sao
   * suy từ nó cũng thành hằng số toàn cục — đúng cái lỗi mà bản gốc mắc phải.
   */
  it('giới hạn thời gian không phải một hằng số dùng chung', () => {
    const rieng = new Set(CHALLENGES.map((c) => c.timeLimitSec));
    expect(rieng.size).toBeGreaterThanOrEqual(3);
  });

  it('brief không rỗng và không quá 400 từ', () => {
    for (const c of CHALLENGES) {
      expect(c.brief.trim().length, c.id).toBeGreaterThan(0);
      expect(demTu(c.brief), c.id).toBeLessThanOrEqual(400);
    }
  });
});

describe('CHAOS_WAVES — leo thang', () => {
  it('đánh số liên tục từ 1', () => {
    CHAOS_WAVES.forEach((dot, i) => {
      expect(dot.wave).toBe(i + 1);
    });
  });

  it('mọi sự cố trong bảng đều là IncidentKind có thật', () => {
    for (const dot of CHAOS_WAVES) {
      for (const su of dot.incidents) {
        expect(TAP_SU_CO.has(su), `đợt ${String(dot.wave)} › ${su}`).toBe(true);
      }
    }
  });

  it('graceSec không bao giờ tăng, và không xuống dưới sàn', () => {
    let truoc = Number.POSITIVE_INFINITY;
    for (const dot of CHAOS_WAVES) {
      expect(dot.graceSec, `đợt ${String(dot.wave)}`).toBeLessThanOrEqual(truoc);
      expect(dot.graceSec, `đợt ${String(dot.wave)}`).toBeGreaterThanOrEqual(GRACE_TOI_THIEU);
      truoc = dot.graceSec;
    }
  });

  it('số sự cố không bao giờ giảm', () => {
    let truoc = 0;
    for (const dot of CHAOS_WAVES) {
      expect(dot.incidents.length, `đợt ${String(dot.wave)}`).toBeGreaterThanOrEqual(truoc);
      truoc = dot.incidents.length;
    }
  });

  it('đợt 1 chỉ có một sự cố, và đợt cuối bảng nặng hơn hẳn', () => {
    const dau = CHAOS_WAVES[0];
    const cuoi = CHAOS_WAVES[CHAOS_WAVES.length - 1];
    expect(dau?.incidents.length).toBe(1);
    expect(cuoi?.incidents.length).toBeGreaterThanOrEqual(6);
    expect(cuoi?.graceSec).toBeLessThan(dau?.graceSec ?? 0);
  });

  /**
   * Bốn đợt đầu cố ý KHÔNG chứa cặp dễ nhầm nào: người chơi phải học nhịp trước
   * khi bị bắt phân biệt. Test này giữ lời hứa đó khỏi bị bào mòn khi có người
   * chỉnh bảng cho "khó hơn tí".
   */
  it('bốn đợt đầu không chứa cả hai vế của một cặp dễ nhầm', () => {
    const capDeNham: readonly (readonly IncidentKind[])[] = [
      ['lenh-entrypoint-sai', 'memory-limit-qua-thap', 'liveness-probe-qua-gat'],
      ['service-selector-lech-label', 'readiness-probe-sai-cong'],
      ['node-het-cpu', 'nodeselector-khong-khop'],
      ['thieu-configmap', 'key-configmap-sai'],
    ];
    for (const dot of CHAOS_WAVES.slice(0, 4)) {
      for (const cap of capDeNham) {
        const trung = dot.incidents.filter((s) => cap.includes(s));
        expect(trung.length, `đợt ${String(dot.wave)} › ${trung.join(', ')}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('dotHonLoan — sinh đợt sau bảng viết tay', () => {
  it('trả đúng dòng trong bảng với wave <= 20', () => {
    for (const dot of CHAOS_WAVES) {
      expect(dotHonLoan(dot.wave)).toEqual(dot);
    }
  });

  it('tất định: gọi hai lần cho kết quả bằng nhau', () => {
    for (const w of [21, 25, 40, 137]) {
      expect(dotHonLoan(w)).toEqual(dotHonLoan(w));
    }
  });

  it('đợt sinh ra vẫn hợp lệ và nặng hơn bảng', () => {
    for (const w of [21, 30, 60, 200]) {
      const dot = dotHonLoan(w);
      expect(dot.wave).toBe(w);
      expect(dot.graceSec).toBe(GRACE_TOI_THIEU);
      expect(dot.incidents.length).toBeGreaterThanOrEqual(7);
      expect(dot.incidents.length).toBeLessThanOrEqual(12);
      for (const su of dot.incidents) expect(TAP_SU_CO.has(su), `${String(w)} › ${su}`).toBe(true);
    }
  });

  it('từ chối wave không hợp lệ thay vì trả dữ liệu rác', () => {
    expect(() => dotHonLoan(0)).toThrow(RangeError);
    expect(() => dotHonLoan(-3)).toThrow(RangeError);
    expect(() => dotHonLoan(2.5)).toThrow(RangeError);
  });
});
