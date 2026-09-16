/**
 * AC-A: **đường găng tính đúng trên ít nhất 5 đồ thị mẫu có đáp án tính tay.**
 *
 * Năm đồ thị dưới đây cố ý KHÔNG phải năm biến thể của một ca. Chúng phủ:
 *
 *   1. chuỗi nối tiếp — ca nền, hai thuật toán phải TRÙNG nhau
 *   2. quạt ra rồi gộp lại — fan-in phải chọn nhánh CHẬM, không chọn nhánh đầu
 *   3. cạnh tài nguyên ở CUỐI đường — thuật toán sai kết thúc ở stage khác
 *   4. cạnh tài nguyên ở GIỮA đường — thuật toán sai bỏ sót hẳn một stage
 *   5. quạt ra thật (`InstanceKey` có `#`) + thử lại + cạnh tài nguyên
 *
 * Ba trong năm có đường găng đi qua ít nhất một **cạnh tài nguyên**, và đúng ba
 * cái đó là ba cái mà đường-dài-nhất-trên-DAG cho ra con số khác. Nếu không có
 * chúng thì bộ test này không đo được thứ mục A.7 sinh ra để đo.
 *
 * ## Đối chứng âm — `dagDaiNhat` / `dagDaiNhatDuong`
 *
 * Hai hàm đó hiện thực **thuật toán SAI** (đường dài nhất theo cạnh `dependsOn`,
 * tức giả định máy chạy vô hạn) và chỉ tồn tại trong file test này. Có chúng thì
 * câu "đường găng không phải đường dài nhất trên DAG" trở thành một con số so
 * được, chứ không còn là một lời khai trong chú thích. Không có chúng thì bộ
 * test này xanh cả khi ai đó thay `criticalPath` bằng đúng thuật toán sai ấy —
 * đúng thứ `rules/green-that-proves-nothing.md` cảnh báo.
 *
 * ## Vì sao `dependsOn` được khai riêng trong mỗi mẫu
 *
 * `StageInstanceRecord` không mang cạnh phụ thuộc (chúng ở `WorkflowSpec`), mà
 * dựng nguyên một `WorkflowSpec` cho mỗi mẫu là ba mươi dòng `StageSpec` chẳng
 * tham gia phép tính nào. Bản đồ `dependsOn` ở đây là **cùng một thông tin**, ở
 * dạng đọc được bằng mắt cạnh đáp án tính tay — và nó chỉ phục vụ đối chứng âm,
 * `criticalPath` không nhìn thấy nó.
 *
 * ⚠ Mọi bản ghi ở đây dựng BẰNG TAY. Đó là điều kiện để có đáp án tính tay, và
 * nó cũng có nghĩa bộ test này **không** chứng minh lane engine ghi `blockedBy`
 * đúng cách — xem cảnh báo ở đầu `critical-path.ts`.
 */
import { describe, expect, it } from 'vitest';

import { compareKeys } from '../git/deterministic.ts';
import type {
  AttemptRecord,
  BlockedBy,
  InstanceKey,
  StageId,
  StageInstanceRecord,
} from './contract.ts';
import type { CriticalPath } from './critical-path.ts';
import { criticalPath } from './critical-path.ts';

// ── Bộ dựng bản ghi ─────────────────────────────────────────────────────────

function lanThuXanh(start: number, finish: number): AttemptRecord {
  return {
    attempt: 0,
    startedTick: start,
    finishedTick: finish,
    outcome: 'passed',
    cause: null,
    failedStep: null,
    steps: [],
  };
}

/**
 * Một thực thể stage chạy một lần và xanh.
 *
 * `runnerTicks` = thời gian chiếm máy = `finish - start` với một slot. Nó không
 * tham gia phép tính đường găng; có mặt để bản ghi không nói dối về chính nó.
 */
function thucThe(
  key: InstanceKey,
  ready: number,
  start: number,
  finish: number,
  cho: BlockedBy,
  stageId: StageId = key,
): StageInstanceRecord {
  return {
    instance: key,
    stageId,
    fanOutIndex: null,
    readyTick: ready,
    startedTick: start,
    finishedTick: finish,
    attempts: [lanThuXanh(start, finish)],
    blockedBy: cho,
    runnerTicks: finish - start,
  };
}

interface DoThiMau {
  readonly ten: string;
  readonly instances: readonly StageInstanceRecord[];
  /** Cạnh `dependsOn` theo thực thể. CHỈ dùng cho đối chứng âm. */
  readonly dependsOn: Readonly<Record<InstanceKey, readonly InstanceKey[]>>;
  /** Đáp án tính tay: chuỗi thực thể theo thứ tự thời gian. */
  readonly duongGang: readonly InstanceKey[];
  /** Đáp án tính tay: các đoạn chờ-máy trên đường găng. */
  readonly canhTaiNguyen: readonly (readonly [InstanceKey, InstanceKey])[];
  /** Đáp án tính tay: tick lượt chạy kết thúc. */
  readonly xongLuc: number;
  /** Đáp án tính tay cho THUẬT TOÁN SAI, để so. */
  readonly dagDaiNhat: number;
}

// ── Đối chứng âm: đường dài nhất trên DAG (THUẬT TOÁN SAI) ──────────────────

/**
 * Thời điểm xong sớm nhất nếu **máy chạy là vô hạn**:
 * `ef[i] = max(ef[cha]) + thời lượng[i]`.
 *
 * Đây chính là cái bẫy mà A.7 tồn tại để tránh: nó cộng đúng, đi qua cạnh có
 * thật, và hoàn toàn mù với thời gian xếp hàng chờ máy.
 */
function efMap(mau: DoThiMau): Readonly<Record<InstanceKey, number>> {
  const thoiLuong: Record<InstanceKey, number> = {};
  for (const r of mau.instances) thoiLuong[r.instance] = r.finishedTick - r.startedTick;

  const memo: Record<InstanceKey, number> = {};
  function ef(key: InstanceKey): number {
    const da = memo[key];
    if (da !== undefined) return da;
    let truoc = 0;
    for (const cha of mau.dependsOn[key] ?? []) truoc = Math.max(truoc, ef(cha));
    const out = truoc + (thoiLuong[key] ?? 0);
    memo[key] = out;
    return out;
  }

  const out: Record<InstanceKey, number> = {};
  for (const r of mau.instances) out[r.instance] = ef(r.instance);
  return out;
}

function dagDaiNhat(mau: DoThiMau): number {
  let max = 0;
  for (const value of Object.values(efMap(mau))) max = Math.max(max, value);
  return max;
}

/** Đường mà thuật toán SAI sẽ tô sáng. Hoà thì lấy khoá nhỏ nhất, cho tất định. */
function dagDaiNhatDuong(mau: DoThiMau): readonly InstanceKey[] {
  const ef = efMap(mau);

  function totNhat(ungVien: readonly InstanceKey[]): InstanceKey | null {
    let chon: InstanceKey | null = null;
    for (const key of [...ungVien].sort(compareKeys)) {
      if (chon === null || (ef[key] ?? 0) > (ef[chon] ?? 0)) chon = key;
    }
    return chon;
  }

  let cursor = totNhat(mau.instances.map((r) => r.instance));
  const nguoc: InstanceKey[] = [];
  while (cursor !== null) {
    nguoc.push(cursor);
    const cha = mau.dependsOn[cursor] ?? [];
    cursor = cha.length === 0 ? null : totNhat(cha);
  }
  return nguoc.reverse();
}

// ── Năm đồ thị mẫu ──────────────────────────────────────────────────────────

/*
 * 1 · CHUỖI NỐI TIẾP, MÁY LUÔN RẢNH.
 *
 *   clone 0→10 (10 tick) · build 10→30 (20) · test 30→40 (10)
 *   Tính tay: 10 + 20 + 10 = 40. Không thực thể nào phải chờ máy.
 *   Đường-dài-nhất-DAG: ef(clone)=10, ef(build)=30, ef(test)=40 ⇒ 40. TRÙNG.
 *
 * Ca nền, và nó là đối chứng DƯƠNG cho đối chứng âm: nếu `dagDaiNhat` cũng lệch
 * ở đây thì nó hỏng, và mọi khác biệt nó báo ở ba mẫu sau đều vô giá trị.
 */
const CHUOI_NOI_TIEP: DoThiMau = {
  ten: '1 · chuỗi nối tiếp, máy luôn rảnh',
  instances: [
    thucThe('clone', 0, 0, 10, { kind: 'none' }),
    thucThe('build', 10, 10, 30, { kind: 'dependency', instance: 'clone' }),
    thucThe('test', 30, 30, 40, { kind: 'dependency', instance: 'build' }),
  ],
  dependsOn: { clone: [], build: ['clone'], test: ['build'] },
  duongGang: ['clone', 'build', 'test'],
  canhTaiNguyen: [],
  xongLuc: 40,
  dagDaiNhat: 40,
};

/*
 * 2 · QUẠT RA RỒI GỘP LẠI, ĐỦ MÁY CHO CẢ HAI NHÁNH.
 *
 *   clone 0→5 (5) · lint 5→8 (3) · build 5→25 (20) · pack 25→30 (5)
 *   `pack` phụ thuộc CẢ `lint` lẫn `build`, nên nó sẵn sàng lúc max(8, 25) = 25.
 *   Tính tay: 5 + 20 + 5 = 30 — đi qua `build`, KHÔNG qua `lint`.
 *   Đường-dài-nhất-DAG: nhánh lint 5+3+5=13, nhánh build 5+20+5=30 ⇒ 30. TRÙNG.
 *
 * Ca này ghim một sai lầm khác: fan-in phải lấy phụ thuộc XONG MUỘN NHẤT, không
 * phải phụ thuộc đầu tiên trong `dependsOn`. `lint` đứng trước `build` trong
 * `dependsOn` của `pack` đúng là để bẫy chuyện đó.
 */
const QUAT_RA_GOP_LAI: DoThiMau = {
  ten: '2 · quạt ra rồi gộp lại, đủ máy',
  instances: [
    thucThe('clone', 0, 0, 5, { kind: 'none' }),
    thucThe('lint', 5, 5, 8, { kind: 'dependency', instance: 'clone' }),
    thucThe('build', 5, 5, 25, { kind: 'dependency', instance: 'clone' }),
    thucThe('pack', 25, 25, 30, { kind: 'dependency', instance: 'build' }),
  ],
  dependsOn: { clone: [], lint: ['clone'], build: ['clone'], pack: ['lint', 'build'] },
  duongGang: ['clone', 'build', 'pack'],
  canhTaiNguyen: [],
  xongLuc: 30,
  dagDaiNhat: 30,
};

/*
 * 3 · MỘT MÁY. ĐƯỜNG GĂNG KẾT THÚC BẰNG MỘT CẠNH TÀI NGUYÊN.
 *
 *   Hạng máy `linux` có ĐÚNG MỘT máy.
 *   clone 0→10 (10) chiếm máy.
 *   `build` và `lint` cùng phụ thuộc `clone`, cùng sẵn sàng ở tick 10. Thứ tự
 *   hàng đợi (§4 luật 2) hoà tới khoá `stageId`, và 'build' < 'lint', nên
 *   `build` lấy máy trước: 10→40 (30 tick).
 *   `lint` sẵn sàng từ tick 10 nhưng KHÔNG chờ phụ thuộc nào — nó chờ MÁY, và
 *   chỉ chạy được khi `build` nhả chỗ ở tick 40: 40→45 (5 tick).
 *   Tính tay: lượt chạy xong ở tick 45, đường găng = clone → build ⇢ lint, với
 *   ⇢ là cạnh tài nguyên.
 *
 *   Đường-dài-nhất-DAG: ef(clone)=10, ef(build)=10+30=40, ef(lint)=10+5=15 ⇒ 40,
 *   và nó kết thúc ở `build`. SAI HAI LẦN: sai con số (40 thay vì 45) và sai
 *   stage cuối (`build` thay vì `lint`).
 *
 * Bài học mà chỉ mẫu này dạy được: thêm MỘT máy nữa thì `lint` chạy từ tick 10,
 * xong lúc 15, và lượt chạy xong ở tick 40 — rút được 5 tick mà không đụng một
 * cạnh phụ thuộc nào. Người chơi đọc đường-dài-nhất-DAG sẽ đi cắt `build`.
 */
const CHO_MAY_O_CUOI: DoThiMau = {
  ten: '3 · một máy, cạnh tài nguyên ở CUỐI đường',
  instances: [
    thucThe('clone', 0, 0, 10, { kind: 'none' }),
    thucThe('build', 10, 10, 40, { kind: 'dependency', instance: 'clone' }),
    thucThe('lint', 10, 40, 45, { kind: 'runner', instance: 'build', runnerClass: 'linux', commitId: 'c1' }),
  ],
  dependsOn: { clone: [], build: ['clone'], lint: ['clone'] },
  duongGang: ['clone', 'build', 'lint'],
  canhTaiNguyen: [['build', 'lint']],
  xongLuc: 45,
  dagDaiNhat: 40,
};

/*
 * 4 · MỘT MÁY. CẠNH TÀI NGUYÊN NẰM GIỮA ĐƯỜNG.
 *
 *   clone 0→5 (5) · build 5→25 (20) · lint chờ máy tới 25 rồi 25→35 (10)
 *   · report phụ thuộc `lint`, 35→47 (12).
 *   Tính tay: 5 + 20 (build giữ máy) + 10 (lint) + 12 (report) = 47.
 *   Đường găng = clone → build ⇢ lint → report.
 *
 *   Đường-dài-nhất-DAG: ef(clone)=5, ef(build)=25, ef(lint)=5+10=15,
 *   ef(report)=15+12=27 ⇒ 27, đường [clone, lint, report].
 *   SAI 20 tick, và nó **bỏ sót hẳn `build`** — chính stage đang giữ máy và là
 *   thứ duy nhất giải thích vì sao `lint` không chạy được lúc tick 5.
 */
const CHO_MAY_O_GIUA: DoThiMau = {
  ten: '4 · một máy, cạnh tài nguyên ở GIỮA đường',
  instances: [
    thucThe('clone', 0, 0, 5, { kind: 'none' }),
    thucThe('build', 5, 5, 25, { kind: 'dependency', instance: 'clone' }),
    thucThe('lint', 5, 25, 35, { kind: 'runner', instance: 'build', runnerClass: 'linux', commitId: 'c1' }),
    thucThe('report', 35, 35, 47, { kind: 'dependency', instance: 'lint' }),
  ],
  dependsOn: { clone: [], build: ['clone'], lint: ['clone'], report: ['lint'] },
  duongGang: ['clone', 'build', 'lint', 'report'],
  canhTaiNguyen: [['build', 'lint']],
  xongLuc: 47,
  dagDaiNhat: 27,
};

/*
 * 5 · QUẠT RA THẬT + THỬ LẠI + MỘT MÁY.
 *
 *   `test` quạt ra hai thực thể `test#node20` (fanOutIndex 0) và `test#node22`
 *   (fanOutIndex 1). Hạng máy có ĐÚNG MỘT máy, nên chúng nối đuôi nhau — đúng
 *   bài C03: song song trên giấy khác song song trên máy.
 *
 *   clone 0→5 (5)
 *   test#node20 5→15 (10) — thắng hàng đợi vì `fanOutIndex` nhỏ hơn (§4 luật 2)
 *   test#node22 chờ MÁY tới tick 15; lần thử 0 đỏ vì flake hạ tầng (15→25), thử
 *     lại lần 1 xanh (25→35) ⇒ finishedTick 35, runnerTicks 20
 *   pack phụ thuộc CẢ HAI thực thể của `test` ⇒ sẵn sàng ở 35, chạy 35→40 (5)
 *   Tính tay: 5 + 10 + (10 chờ máy đã tính trong 15→35) + 5 ⇒ xong ở tick 40.
 *   Đường găng = clone → test#node20 ⇢ test#node22 → pack.
 *
 *   Đường-dài-nhất-DAG: ef(clone)=5, ef(node20)=15, ef(node22)=5+20=25,
 *   ef(pack)=25+5=30 ⇒ 30. SAI 10 tick — đúng bằng khoảng `test#node22` đứng
 *   chờ máy.
 */
const NODE20: StageInstanceRecord = {
  ...thucThe('test#node20', 5, 5, 15, { kind: 'dependency', instance: 'clone' }, 'test'),
  fanOutIndex: 0,
};

const NODE22: StageInstanceRecord = {
  ...thucThe(
    'test#node22',
    5,
    15,
    35,
    { kind: 'runner', instance: 'test#node20', runnerClass: 'linux', commitId: 'c1' },
    'test',
  ),
  fanOutIndex: 1,
  attempts: [
    {
      attempt: 0,
      startedTick: 15,
      finishedTick: 25,
      outcome: 'failed',
      cause: { kind: 'flake', nature: 'infra' },
      failedStep: 'chay',
      steps: [
        { id: 'chay', durationTicks: 10, outcome: 'failed', cacheHit: null, flakeNature: 'infra' },
      ],
    },
    {
      attempt: 1,
      startedTick: 25,
      finishedTick: 35,
      outcome: 'passed',
      cause: null,
      failedStep: null,
      steps: [
        { id: 'chay', durationTicks: 10, outcome: 'passed', cacheHit: null, flakeNature: null },
      ],
    },
  ],
  runnerTicks: 20,
};

const QUAT_RA_VA_THU_LAI: DoThiMau = {
  ten: '5 · quạt ra thật, thử lại, một máy',
  instances: [
    thucThe('clone', 0, 0, 5, { kind: 'none' }),
    NODE20,
    NODE22,
    thucThe('pack', 35, 35, 40, { kind: 'dependency', instance: 'test#node22' }),
  ],
  dependsOn: {
    clone: [],
    'test#node20': ['clone'],
    'test#node22': ['clone'],
    pack: ['test#node20', 'test#node22'],
  },
  duongGang: ['clone', 'test#node20', 'test#node22', 'pack'],
  canhTaiNguyen: [['test#node20', 'test#node22']],
  xongLuc: 40,
  dagDaiNhat: 30,
};

const MAU: readonly DoThiMau[] = [
  CHUOI_NOI_TIEP,
  QUAT_RA_GOP_LAI,
  CHO_MAY_O_CUOI,
  CHO_MAY_O_GIUA,
  QUAT_RA_VA_THU_LAI,
];

const CO_CANH_TAI_NGUYEN = [CHO_MAY_O_CUOI, CHO_MAY_O_GIUA, QUAT_RA_VA_THU_LAI];
const KHONG_CO_CANH_TAI_NGUYEN = [CHUOI_NOI_TIEP, QUAT_RA_GOP_LAI];

function batBuoc(duong: CriticalPath | null): CriticalPath {
  if (duong === null) throw new Error('mẫu phải có ít nhất một thực thể — đường găng không rỗng');
  return duong;
}

const THEO_TEN = MAU.map((mau) => [mau.ten, mau] as const);

// ── Test ────────────────────────────────────────────────────────────────────

describe('critical-path — AC-A: năm đồ thị mẫu có đáp án tính tay', () => {
  it('đủ năm mẫu, và ít nhất một mẫu có đường găng đi qua cạnh tài nguyên', () => {
    // Đối chứng cho cả nhóm: hạ số mẫu xuống hoặc bỏ ca chờ-máy đi thì AC-A
    // không còn đo được thứ A.7 sinh ra để đo, mà không test nào khác đỏ.
    expect(MAU.length).toBeGreaterThanOrEqual(5);
    expect(CO_CANH_TAI_NGUYEN.length).toBeGreaterThanOrEqual(1);
  });

  it.each(THEO_TEN)('%s — đúng chuỗi, đúng tick kết thúc', (_ten, mau) => {
    const duong = batBuoc(criticalPath(mau.instances));
    expect(duong.nodes.map((n) => n.instance)).toEqual(mau.duongGang);
    expect(duong.finishedTick).toBe(mau.xongLuc);
    expect(duong.truncated).toBe(false);
  });

  it.each(THEO_TEN)('%s — đúng các đoạn chờ máy', (_ten, mau) => {
    const duong = batBuoc(criticalPath(mau.instances));
    const taiNguyen = duong.edges
      .filter((canh) => canh.resourceEdge)
      .map((canh) => [canh.from, canh.to]);
    expect(taiNguyen).toEqual(mau.canhTaiNguyen.map(([tu, toi]) => [tu, toi]));
  });

  it.each(THEO_TEN)('%s — số cạnh luôn bằng số mắt xích trừ một', (_ten, mau) => {
    const duong = batBuoc(criticalPath(mau.instances));
    expect(duong.edges).toHaveLength(duong.nodes.length - 1);
    for (let i = 0; i < duong.edges.length; i += 1) {
      expect(duong.edges[i]?.from).toBe(duong.nodes[i]?.instance);
      expect(duong.edges[i]?.to).toBe(duong.nodes[i + 1]?.instance);
    }
  });

  it('mắt xích mang sẵn stageId — không ai phải tách khoá ở dấu #', () => {
    const duong = batBuoc(criticalPath(QUAT_RA_VA_THU_LAI.instances));
    expect(duong.nodes.map((n) => n.stageId)).toEqual(['clone', 'test', 'test', 'pack']);
  });
});

describe('critical-path — KHÔNG phải đường dài nhất trên DAG', () => {
  it.each(THEO_TEN)('%s — đối chứng âm cho ra đúng con số đã tính tay', (_ten, mau) => {
    expect(dagDaiNhat(mau)).toBe(mau.dagDaiNhat);
  });

  it('không có cạnh tài nguyên ⇒ hai thuật toán TRÙNG nhau', () => {
    // Đối chứng dương. Nếu đối chứng âm lệch cả ở đây thì nó hỏng, và mọi khác
    // biệt nó báo ở nhóm dưới đều không chứng minh được gì.
    for (const mau of KHONG_CO_CANH_TAI_NGUYEN) {
      expect(mau.canhTaiNguyen).toHaveLength(0);
      expect(dagDaiNhat(mau)).toBe(mau.xongLuc);
    }
  });

  it('có cạnh tài nguyên ⇒ đường-dài-nhất-DAG cho con số THẤP HƠN thực tế', () => {
    for (const mau of CO_CANH_TAI_NGUYEN) {
      expect(mau.canhTaiNguyen.length).toBeGreaterThan(0);
      expect(dagDaiNhat(mau)).toBeLessThan(mau.xongLuc);
      // Và `criticalPath` phải nói con số THẬT, không nói con số của DAG.
      expect(batBuoc(criticalPath(mau.instances)).finishedTick).toBe(mau.xongLuc);
    }
  });

  it('đồ thị 3 — thuật toán sai kết thúc ở STAGE KHÁC', () => {
    expect(dagDaiNhatDuong(CHO_MAY_O_CUOI)).toEqual(['clone', 'build']);
    const dung = batBuoc(criticalPath(CHO_MAY_O_CUOI.instances));
    expect(dung.nodes.at(-1)?.instance).toBe('lint');
  });

  it('đồ thị 4 — thuật toán sai BỎ SÓT hẳn stage đang giữ máy', () => {
    const sai = dagDaiNhatDuong(CHO_MAY_O_GIUA);
    expect(sai).toEqual(['clone', 'lint', 'report']);
    expect(sai).not.toContain('build');

    const dung = batBuoc(criticalPath(CHO_MAY_O_GIUA.instances));
    expect(dung.nodes.map((n) => n.instance)).toContain('build');
  });
});

describe('critical-path — tất định', () => {
  it.each(THEO_TEN)('%s — đảo thứ tự mảng thực thể không đổi kết quả', (_ten, mau) => {
    const xuoi = batBuoc(criticalPath(mau.instances));
    const nguoc = batBuoc(criticalPath([...mau.instances].reverse()));
    expect(nguoc).toEqual(xuoi);
  });

  it('hoà finishedTick thì chọn InstanceKey nhỏ nhất, ở mọi thứ tự đầu vào', () => {
    const instances = [
      thucThe('clone', 0, 0, 5, { kind: 'none' }),
      thucThe('zeta', 5, 5, 20, { kind: 'dependency', instance: 'clone' }),
      thucThe('alpha', 5, 5, 20, { kind: 'dependency', instance: 'clone' }),
    ];
    expect(batBuoc(criticalPath(instances)).nodes.at(-1)?.instance).toBe('alpha');
    expect(batBuoc(criticalPath([...instances].reverse())).nodes.at(-1)?.instance).toBe('alpha');
  });
});

describe('critical-path — bản ghi hỏng thì báo, không ném và không treo', () => {
  it('mảng rỗng ⇒ null', () => {
    expect(criticalPath([])).toBeNull();
  });

  it('một thực thể duy nhất ⇒ một mắt xích, không cạnh', () => {
    const duong = batBuoc(criticalPath([thucThe('clone', 0, 0, 5, { kind: 'none' })]));
    expect(duong.nodes).toEqual([{ instance: 'clone', stageId: 'clone' }]);
    expect(duong.edges).toEqual([]);
    expect(duong.finishedTick).toBe(5);
    expect(duong.truncated).toBe(false);
  });

  it('blockedBy trỏ tới khoá không có trong mảng ⇒ truncated', () => {
    /*
     * Đây KHÔNG chỉ là một ca giả định: `InstanceKey` không mang `commitId`, nên
     * một thực thể của commit sau chờ máy do commit trước giữ sẽ trỏ ra ngoài
     * `RunRecord.instances` của chính nó. Xem báo cáo lane.
     */
    const duong = batBuoc(
      criticalPath([
        thucThe('clone', 0, 0, 5, { kind: 'none' }),
        thucThe('deploy', 5, 5, 20, { kind: 'dependency', instance: 'cua-commit-truoc' }),
      ]),
    );
    expect(duong.truncated).toBe(true);
    expect(duong.nodes.map((n) => n.instance)).toEqual(['deploy']);
    expect(duong.edges).toEqual([]);
    expect(duong.finishedTick).toBe(20);
  });

  it('chuỗi blockedBy quay vòng ⇒ dừng lại, không lặp vô hạn', () => {
    const duong = batBuoc(
      criticalPath([
        thucThe('a', 0, 0, 10, { kind: 'dependency', instance: 'b' }),
        thucThe('b', 0, 0, 10, { kind: 'dependency', instance: 'a' }),
      ]),
    );
    expect(duong.truncated).toBe(true);
    expect(duong.nodes).toHaveLength(2);
    expect(duong.edges).toHaveLength(1);
  });
});
