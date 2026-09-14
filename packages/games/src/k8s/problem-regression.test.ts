/**
 * ẢNH CHỤP HỒI QUY của hệ bài OJ K8s — chụp TRƯỚC đợt tổng quát hoá 18.A.
 *
 * ⛔ ĐỌC TRƯỚC KHI SỬA MỘT DÒNG NÀO Ở ĐÂY.
 *
 * File này tồn tại vì một lý do duy nhất: chặng 18.A chuyển `Problem` từ
 * `k8s/problem.ts` lên `core/` rồi tách phần K8s thành plugin, và đó là việc
 * đụng vào code ĐANG CHẠY với dữ liệu THẬT. `phase-18.md` §4 chấm rủi ro đó 20
 * điểm — cao nhất cả chặng. Ô nghiệm thu AC-A viết thẳng: *test này phải xanh
 * trước và sau refactor, KHÔNG SỬA TEST*.
 *
 * Nên nếu một ô ở đây đỏ sau refactor, con đường ĐÚNG là sửa code cho khớp lại
 * ảnh chụp. Con đường SAI — và nó luôn hấp dẫn hơn — là cập nhật con số trong
 * file này cho khớp thứ code vừa trả về. Làm thế là đổi tên "một hồi quy" thành
 * "hành vi mong đợi mới", và cái giá phải trả rơi xuống người làm bài chứ không
 * rơi xuống ai đọc diff.
 *
 * ## Vì sao khoá bằng GIÁ TRỊ CỤ THỂ chứ không phải `toMatchSnapshot()`
 *
 * Snapshot tự sinh được cập nhật bằng một cờ `-u`, và nó sẽ được cập nhật —
 * giữa một đợt refactor 7 bước thì `vitest -u` là phản xạ, không phải quyết
 * định. Một mảng viết tay thì không có cờ nào cập nhật hộ; muốn đổi phải gõ
 * tay, và gõ tay thì hiện lên diff của PR.
 *
 * ## Vì sao import từ barrel `../index.ts` chứ không từ `./problem.ts`
 *
 * 18.A.2 chuyển chính `Problem` sang `core/problem.ts`. Trỏ thẳng vào
 * `./problem.ts` nghĩa là file này ĐỎ vì một lần dời file hợp lệ, và lúc đó
 * buộc phải sửa test — đúng thứ AC-A cấm. Barrel thì khác: `apps/web` đã import
 * `Problem` / `ProblemForSolver` / `ProblemWithStats` từ `@devops-platform/games`
 * ở dạng KHÔNG tham số kiểu, nên refactor buộc phải giữ những tên đó xuất ra
 * nguyên vẹn, nếu không `apps/web` gãy trước. Barrel là bề mặt được neo sẵn bởi
 * người dùng ngoài package; đường dẫn nội bộ thì không.
 *
 * Ngoại lệ: `initialState` / `evaluateObjectives` / `advance` / `PREDICATES` là
 * RUỘT của engine K8s, không nằm trong barrel và không thuộc diện chuyển lên
 * `core/` (18.A.4 giữ chúng ở phía plugin K8s). Chúng import thẳng từ `./`.
 *
 * ## Ba đường được khoá
 *
 * 1. NẠP    — `PROBLEMS_SEED`: 10 bài, từng trường một, bằng mảng viết tay.
 * 2. CHẤM   — engine thật chạy trên `initialState` thật: vị từ nào đạt ở tick 0,
 *             đạt ở tick `SETTLE_TICKS`, phân loại goal/guard, và điểm số.
 * 3. HIỂN THỊ — tập giá trị đóng + nhãn, cộng bốn cổng gác Ở TẦNG KIỂU cho bất
 *             biến "gợi ý chưa mở KHÔNG mang `text`".
 *
 * ⚠ Bốn cổng ở mục 3 đỏ khi chạy `tsc --noEmit` (`pnpm --filter
 * @devops-platform/games typecheck`), KHÔNG đỏ dưới `vitest run` — vitest chỉ
 * biên dịch bỏ kiểu. Đó là chủ ý: bất biến cần gác là một bất biến của KIỂU
 * ("kiểu này không có chỗ chứa `text` chưa mở"), và hàm che thật nằm ở
 * `apps/web/src/server/problems/solver.ts`, ngoài package này. Chạy lại 18.A.7
 * phải chạy CẢ HAI lệnh, không chỉ `test`.
 */

import { describe, expect, it } from 'vitest';

import {
  ALL_KINDS,
  PROBLEMS_SEED,
  PROBLEM_CODE_PATTERN,
  PROBLEM_DIFFICULTIES,
  PROBLEM_DIFFICULTY_LABELS,
  PROBLEM_ORDER_KEYS,
  PROBLEM_STATES,
  PROBLEM_TOPICS,
  PROBLEM_TOPIC_LABELS,
  SETTLE_TICKS,
  classifyObjectives,
  scoreProblemRun,
} from '../index.ts';
import type {
  IncidentKind,
  Level,
  Problem,
  ProblemForSolver,
  ProblemHint,
  ProblemWithStats,
} from '../index.ts';

import { initialState } from './reducer.ts';
import { evaluateObjectives } from './session.ts';
import { advance } from './tick.ts';
import { PREDICATES } from './predicates.ts';

/**
 * Hạt giống cố định cho mọi phép đo có RNG.
 *
 * Không phải con số may mắn: `initialState` gieo RNG theo hạt này, nên một hạt
 * cố định là điều kiện để ảnh chụp có nghĩa. Đổi hạt sẽ làm cả mục CHẤM đỏ hàng
 * loạt — và nếu ai đó định đổi để "cho dễ", đọc lại khối chú thích đầu file.
 */
const HAT_GIONG = 7;

/**
 * `Problem` → `Level` tối thiểu, đủ để `initialState` chạy.
 *
 * Bản sao có chủ ý của `problemAsLevel` ở `apps/web/src/server/problems/replay.ts`,
 * và chép ở đây là ĐÚNG chứ không phải lười: `packages/games` không được phép
 * import ngược lên `apps/web`, mà cái cần đo là ENGINE chứ không phải bộ bọc.
 * Ba field duy nhất engine thật sự đọc là `id`, `initialState`, `objectives`
 * (`replay.ts` ghi rõ điều đó và có test riêng giữ nó khỏi trôi); phần còn lại ở
 * đây là chỗ giữ chỗ cho hợp đồng kiểu.
 *
 * ⚠ `allowedResources` rơi về `ALL_KINDS` khi bài không giới hạn, KHÔNG rơi về
 * `[]`. Hai giá trị đó mang nghĩa NGƯỢC NHAU — `null` của `Problem` là "cho dùng
 * mọi loại", `[]` của `Level` là "cấm mọi loại".
 */
function bocThanhLevel(bai: Problem): Level {
  return {
    id: `oj-${bai.code}`,
    chapter: 0,
    title: bai.title,
    mission: bai.title,
    brief: bai.statement,
    difficulty: 'intermediate',
    initialState: bai.initialState,
    allowedResources: bai.allowedResources ?? ALL_KINDS,
    objectives: bai.objectives,
    hints: bai.hints.map((goi) => goi.text),
    parMoves: bai.parMoves ?? 0,
    teaches: [],
    teaching: { primer: '', cheatsheet: [], takeaways: [] },
  };
}

function baiTheoMa(ma: string): Problem {
  const bai = PROBLEMS_SEED.find((ung) => ung.code === ma);
  if (bai === undefined) {
    throw new Error(`Không còn bài ${ma} trong PROBLEMS_SEED`);
  }
  return bai;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. NẠP — ảnh chụp từng trường của 10 bài seed
// ════════════════════════════════════════════════════════════════════════════

interface AnhChupBai {
  readonly code: string;
  readonly slug: string;
  readonly difficulty: string;
  readonly topics: readonly string[];
  /** `id:check` của từng mục tiêu, ĐÚNG THỨ TỰ — thứ tự là thứ tự hiển thị. */
  readonly mucTieu: readonly string[];
  readonly soMucTieuBatBuoc: number;
  /** `id:penaltyPoints`, đúng thứ tự mở. */
  readonly goiY: readonly string[];
  readonly allowedResources: readonly string[] | null;
  readonly timeLimitSec: number | null;
  readonly parMoves: number | null;
  readonly state: string;
  readonly nodes: readonly string[];
  readonly namespaces: readonly string[];
  /** `Kind/name`, đúng thứ tự khai báo. */
  readonly taiNguyen: readonly string[];
  /** Sự cố gieo sẵn, theo thứ tự tài nguyên. Rỗng là hợp lệ — xem K8S-0009. */
  readonly suCoGieo: readonly string[];
}

function chup(bai: Problem): AnhChupBai {
  return {
    code: bai.code,
    slug: bai.slug,
    difficulty: bai.difficulty,
    topics: [...bai.topics],
    mucTieu: bai.objectives.map((muc) => `${muc.id}:${muc.check}`),
    soMucTieuBatBuoc: bai.objectives.filter((muc) => muc.required).length,
    goiY: bai.hints.map((goi) => `${goi.id}:${String(goi.penaltyPoints)}`),
    allowedResources: bai.allowedResources === null ? null : [...bai.allowedResources],
    timeLimitSec: bai.timeLimitSec,
    parMoves: bai.parMoves,
    state: bai.state,
    nodes: bai.initialState.nodes.map((may) => may.name),
    namespaces: [...bai.initialState.namespaces],
    taiNguyen: bai.initialState.resources.map((tai) => `${tai.kind}/${tai.name}`),
    suCoGieo: bai.initialState.resources
      .map((tai) => tai.seededIncident)
      .filter((su): su is IncidentKind => su !== undefined),
  };
}

/**
 * Ảnh chụp ngày 2026-09-14, đo từ `PROBLEMS_SEED` đang chạy.
 *
 * Từng dòng là một sự thật có thể vỡ độc lập trong đợt 18.A. Ví dụ đã hình dung
 * được: plugin K8s khai lại `PROBLEM_TOPICS` và đánh rơi `troubleshooting` ⇒ cột
 * `topics` của chín bài đỏ cùng lúc; bộ bọc `allowedResources` đổi `null` thành
 * `[]` ⇒ đúng một cột đỏ ở cả mười bài.
 */
const ANH_CHUP_SEED: readonly AnhChupBai[] = [
  {
    code: 'K8S-0001',
    slug: 'ba-kieu-restart',
    difficulty: 'hard',
    topics: ['workload', 'troubleshooting'],
    mucTieu: [
      'thu-nhat-on:deployment-ready',
      'thu-hai-on:deployment-ready',
      'thu-ba-on:deployment-ready',
      'sach-su-co:all-pods-healthy',
    ],
    soMucTieuBatBuoc: 4,
    goiY: ['g1:5', 'g2:15', 'g3:30'],
    allowedResources: null,
    timeLimitSec: 240,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['san-xuat'],
    taiNguyen: ['Deployment/thu-nhat', 'Deployment/thu-hai', 'Deployment/thu-ba'],
    suCoGieo: ['lenh-entrypoint-sai', 'memory-limit-qua-thap', 'liveness-probe-qua-gat'],
  },
  {
    code: 'K8S-0002',
    slug: 'hai-endpoint-rong',
    difficulty: 'medium',
    topics: ['networking', 'troubleshooting'],
    mucTieu: [
      'ho-so-co-endpoint:service-has-endpoints',
      'lich-hen-co-endpoint:service-has-endpoints',
      'giu-readiness:probe-configured',
    ],
    soMucTieuBatBuoc: 3,
    goiY: ['g1:5', 'g2:15', 'g3:30'],
    allowedResources: null,
    timeLimitSec: 180,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['cong-dan'],
    taiNguyen: [
      'Deployment/ho-so',
      'Service/ho-so',
      'Deployment/lich-hen',
      'Service/lich-hen',
    ],
    suCoGieo: ['service-selector-lech-label', 'readiness-probe-sai-cong'],
  },
  {
    code: 'K8S-0003',
    slug: 'rollout-treo',
    difficulty: 'medium',
    topics: ['workload', 'troubleshooting'],
    mucTieu: [
      'bon-replica:deployment-ready',
      'image-lanh:container-image-is',
      'khong-con-pod-loi:pod-no-reason',
    ],
    soMucTieuBatBuoc: 3,
    goiY: ['g1:5', 'g2:15', 'g3:25'],
    allowedResources: null,
    timeLimitSec: 180,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['noi-bo'],
    taiNguyen: ['ReplicaSet/cong-noi-bo-a1b2c3', 'Deployment/cong-noi-bo'],
    suCoGieo: ['image-tag-sai'],
  },
  {
    code: 'K8S-0004',
    slug: 'hai-pod-cung-pending',
    difficulty: 'hard',
    topics: ['scheduling', 'troubleshooting'],
    mucTieu: [
      'tong-hop-chay:deployment-ready',
      'gom-so-lieu-chay:deployment-ready',
      'giu-chiem-cho:deployment-ready',
    ],
    soMucTieuBatBuoc: 3,
    goiY: ['g1:5', 'g2:15', 'g3:30'],
    allowedResources: null,
    timeLimitSec: 240,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['phan-tich'],
    taiNguyen: ['Deployment/chiem-cho', 'Deployment/tong-hop', 'Deployment/gom-so-lieu'],
    suCoGieo: ['node-het-cpu', 'nodeselector-khong-khop'],
  },
  {
    code: 'K8S-0005',
    slug: 'ngoai-loi-trong-xanh',
    difficulty: 'hard',
    topics: ['networking', 'troubleshooting'],
    mucTieu: [
      'tra-cuu-dung-duong:ingress-routes',
      'ho-tro-dung-cong:ingress-routes',
      'het-su-co-dinh-tuyen:no-incident-active',
    ],
    soMucTieuBatBuoc: 3,
    goiY: ['g1:5', 'g2:15', 'g3:30'],
    allowedResources: null,
    timeLimitSec: 240,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['dich-vu'],
    taiNguyen: [
      'Deployment/tra-cuu',
      'Service/tra-cuu',
      'Deployment/ho-tro',
      'Service/ho-tro',
      'Ingress/cong-vao',
    ],
    suCoGieo: ['ingress-sai-path'],
  },
  {
    code: 'K8S-0006',
    slug: 'o-dia-khong-gan-duoc',
    difficulty: 'hard',
    topics: ['storage', 'workload', 'troubleshooting'],
    mucTieu: [
      'pvc-0-bound:pvc-bound',
      'pvc-2-bound:pvc-bound',
      'ba-pod-chay:pod-count-running',
    ],
    soMucTieuBatBuoc: 3,
    goiY: ['g1:5', 'g2:15', 'g3:30'],
    allowedResources: null,
    timeLimitSec: 300,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2', 'may-chu-3'],
    namespaces: ['luu-tru'],
    taiNguyen: ['Service/kho-ban-ghi', 'StatefulSet/kho-ban-ghi'],
    suCoGieo: ['storageclass-khong-ton-tai'],
  },
  {
    code: 'K8S-0007',
    slug: 'thieu-hai-manh-cau-hinh',
    difficulty: 'medium',
    topics: ['config', 'workload', 'troubleshooting'],
    mucTieu: [
      'them-khoa-thieu:configmap-key-set',
      'dong-bo-chay:deployment-ready',
      'co-secret:resource-exists',
      'gui-thong-bao-chay:deployment-ready',
    ],
    soMucTieuBatBuoc: 4,
    goiY: ['g1:5', 'g2:15', 'g3:25'],
    allowedResources: null,
    timeLimitSec: 180,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['ky-thuat'],
    taiNguyen: [
      'ConfigMap/dong-bo-cau-hinh',
      'Deployment/dong-bo',
      'Deployment/gui-thong-bao',
    ],
    suCoGieo: ['key-configmap-sai', 'thieu-secret'],
  },
  {
    code: 'K8S-0008',
    slug: 'policy-cat-nham-hai-duong',
    difficulty: 'expert',
    topics: ['networking', 'security', 'troubleshooting'],
    mucTieu: [
      'web-goi-duoc:netpol-allows',
      'web-phan-giai-duoc:dns-resolves',
      'metric-thu-duoc:netpol-allows',
      'khach-la-bi-chan:netpol-denies',
    ],
    soMucTieuBatBuoc: 4,
    goiY: ['g1:10', 'g2:20', 'g3:40'],
    allowedResources: null,
    timeLimitSec: 300,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['vien-thong'],
    taiNguyen: [
      'Pod/loi-tong',
      'Pod/web',
      'Pod/thu-thap-metric',
      'Pod/khach-la',
      'Service/loi-tong',
      'NetworkPolicy/siet-mang',
    ],
    suCoGieo: ['networkpolicy-chan-nham'],
  },
  {
    code: 'K8S-0009',
    slug: 'quyen-qua-rong',
    difficulty: 'hard',
    topics: ['security', 'troubleshooting'],
    mucTieu: [
      'con-liet-ke-duoc-pod:rbac-allows',
      'con-liet-ke-duoc-service:rbac-allows',
      'khong-doc-secret:rbac-denies',
      'khong-xoa-pod:rbac-denies',
      'ung-dung-van-chay:deployment-ready',
    ],
    soMucTieuBatBuoc: 5,
    goiY: ['g1:5', 'g2:15', 'g3:30'],
    allowedResources: null,
    timeLimitSec: 240,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2'],
    namespaces: ['quan-tri'],
    taiNguyen: [
      'ServiceAccount/bot-bao-cao',
      'Secret/khoa-noi-bo',
      'Role/toan-quyen-tam',
      'RoleBinding/bot-bao-cao-toan-quyen',
      'Deployment/bao-cao-noi-bo',
    ],
    /*
     * RỖNG, và đây là bài DUY NHẤT như vậy trong mười bài — không phải thiếu sót.
     * Lỗi của bài này nằm ngay trong khai báo (`Role/toan-quyen-tam` cấp quyền
     * rộng quá), nên không cần một sự cố gieo thêm để dựng tình huống. Test
     * `mọi bài có sự cố gieo đều dựng ra đúng chừng ấy sự cố` bên dưới cố ý bỏ
     * qua bài này thay vì đòi nó phải có, và ô `suCoGieo: []` ở đây là chỗ ghi
     * lại quyết định đó để nó không bị đọc nhầm thành một cột bị quên.
     */
    suCoGieo: [],
  },
  {
    code: 'K8S-0010',
    slug: 'dem-truc',
    difficulty: 'expert',
    topics: ['workload', 'scaling', 'troubleshooting'],
    mucTieu: [
      'api-du-sau:deployment-ready',
      'trong-han-muc:quota-within-limit',
      'xu-ly-on-dinh:deployment-ready',
      'hpa-doc-duoc:hpa-has-metrics',
      'giao-tiep-khai-du:resource-limits-set',
      'van-hanh-sach:all-pods-healthy',
    ],
    soMucTieuBatBuoc: 6,
    goiY: ['g1:10', 'g2:20', 'g3:40'],
    allowedResources: null,
    timeLimitSec: 600,
    parMoves: null,
    state: 'published',
    nodes: ['may-chu-1', 'may-chu-2', 'may-chu-3'],
    namespaces: ['nen-tang', 'van-hanh'],
    taiNguyen: [
      'ResourceQuota/han-muc',
      'LimitRange/khung',
      'Deployment/api',
      'Deployment/xu-ly',
      'Deployment/giao-tiep',
      'HorizontalPodAutoscaler/giao-tiep',
    ],
    suCoGieo: ['replica-vuot-quota', 'memory-limit-qua-thap', 'hpa-khong-co-metrics'],
  },
];

describe('NẠP — PROBLEMS_SEED giữ nguyên từng trường', () => {
  it('mười bài khớp ảnh chụp, kể cả thứ tự', () => {
    /*
     * So cả mảng một lần thay vì lặp từng bài: `toEqual` trên mảng bắt luôn cả
     * bài BIẾN MẤT và bài MỌC THÊM, còn một vòng lặp theo `PROBLEMS_SEED` thì
     * không — xoá bài thứ mười đi thì vòng lặp chỉ chạy chín lần và xanh.
     */
    expect(PROBLEMS_SEED.map(chup)).toEqual(ANH_CHUP_SEED);
  });

  it('vẫn đúng mười bài, không hơn không kém', () => {
    expect(PROBLEMS_SEED.length).toBe(10);
  });

  it('mọi `check` của bài seed đều có HIỆN THỰC trong PREDICATES', () => {
    /*
     * Đây KHÔNG trùng với ô "check nằm trong PREDICATE_NAMES" của
     * `problems-seed.test.ts`. `PREDICATE_NAMES` là TỪ VỰNG (một mảng chuỗi);
     * `PREDICATES` là BẢNG HIỆN THỰC. Còn `evaluateObjectives` tra bảng hiện
     * thực, và khi không tìm thấy thì nó `continue` — im lặng, không ném.
     *
     * Nghĩa là: đổi tên một vị từ ở bảng hiện thực mà quên đổi ở bài seed sẽ làm
     * mục tiêu đó KHÔNG BAO GIỜ đạt, và bài thành không thể giải được. Không có
     * lỗi nào, không có cảnh báo nào — người làm bài chỉ thấy một ô mãi không
     * tích xanh. Ô này là chỗ duy nhất bắt được chuyện đó.
     */
    const coHienThuc = new Set(Object.keys(PREDICATES));
    const thieu: string[] = [];
    for (const bai of PROBLEMS_SEED) {
      for (const muc of bai.objectives) {
        if (!coHienThuc.has(muc.check)) {
          thieu.push(`${bai.code} › ${muc.id} › ${muc.check}`);
        }
      }
    }
    expect(thieu).toEqual([]);
  });

  it('bảng vị từ giữ đúng 32 tên đã hiện thực', () => {
    /*
     * Bài seed chỉ dùng 15 trong số này. Khoá cả bảng vì 18.A.5 dựng bảng vị từ
     * RIÊNG cho game Git, và cách hỏng dễ xảy ra nhất lúc đó là gộp hai bảng
     * làm một — lúc ấy `PREDICATES` của K8s sẽ mọc thêm tên của Git, và một bài
     * K8s sẽ tra trúng vị từ của Git mà vẫn chạy.
     */
    expect(Object.keys(PREDICATES).sort()).toEqual([
      'all-pods-healthy',
      'configmap-key-set',
      'container-image-is',
      'cronjob-schedule-is',
      'deployment-ready',
      'dns-resolves',
      'hpa-has-metrics',
      'ingress-routes',
      'job-succeeded',
      'netpol-allows',
      'netpol-denies',
      'no-incident-active',
      'node-ready',
      'pdb-satisfied',
      'pod-count-running',
      'pod-no-reason',
      'pod-not-on-node',
      'pod-on-node',
      'pod-running',
      'probe-configured',
      'pvc-bound',
      'quota-within-limit',
      'rbac-allows',
      'rbac-denies',
      'replicas-at-least',
      'resource-absent',
      'resource-exists',
      'resource-limits-set',
      'secret-mounted',
      'service-has-endpoints',
      'toleration-matches',
      'volume-mounted',
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. CHẤM — engine thật, trên `initialState` thật
// ════════════════════════════════════════════════════════════════════════════

/** Mục tiêu đạt ở tick 0 / ở tick `SETTLE_TICKS`, đo trên hạt giống cố định. */
interface AnhChupCham {
  readonly code: string;
  readonly datNgay: readonly string[];
  readonly datSauKhiLang: readonly string[];
  readonly guards: readonly string[];
  readonly goals: readonly string[];
}

function chupCham(bai: Problem): AnhChupCham {
  const level = bocThanhLevel(bai);
  const dau = initialState(level, HAT_GIONG);
  const phanLoai = classifyObjectives(level, HAT_GIONG);
  return {
    code: bai.code,
    datNgay: [...evaluateObjectives(dau, bai.objectives)],
    datSauKhiLang: [...evaluateObjectives(advance(dau, SETTLE_TICKS), bai.objectives)],
    guards: [...phanLoai.guards],
    goals: [...phanLoai.goals],
  };
}

/**
 * Ảnh chụp ngày 2026-09-14, hạt giống 7.
 *
 * Đây là mục có giá trị nhất cả file, vì nó chạy ENGINE THẬT: `initialState`
 * gieo sự cố, `advance` tua 40 tick, `evaluateObjectives` tra bảng vị từ. Một
 * bảng như thế đỏ khi BẤT KỲ mắt xích nào lệch — sự cố không còn được gieo, một
 * vị từ đổi ngữ nghĩa, `SETTLE_TICKS` bị chỉnh, tài nguyên trong `initialState`
 * mất một field.
 *
 * Đọc bảng này còn cho thấy vì sao phải đo ở HAI thời điểm: K8S-0004 và K8S-0006
 * có `datNgay` rỗng nhưng `datSauKhiLang` khác rỗng — mô phỏng tự chạy tới chỗ
 * một mục tiêu thành đúng. Chỉ đọc tick 0 sẽ xếp nhầm chúng.
 */
const ANH_CHUP_CHAM: readonly AnhChupCham[] = [
  {
    code: 'K8S-0001',
    datNgay: [],
    datSauKhiLang: [],
    guards: [],
    goals: ['thu-nhat-on', 'thu-hai-on', 'thu-ba-on', 'sach-su-co'],
  },
  {
    code: 'K8S-0002',
    datNgay: ['giu-readiness'],
    datSauKhiLang: ['giu-readiness'],
    guards: ['giu-readiness'],
    goals: ['ho-so-co-endpoint', 'lich-hen-co-endpoint'],
  },
  {
    code: 'K8S-0003',
    datNgay: [],
    datSauKhiLang: [],
    guards: [],
    goals: ['bon-replica', 'image-lanh', 'khong-con-pod-loi'],
  },
  {
    code: 'K8S-0004',
    datNgay: [],
    datSauKhiLang: ['tong-hop-chay'],
    guards: [],
    goals: ['tong-hop-chay', 'gom-so-lieu-chay', 'giu-chiem-cho'],
  },
  {
    code: 'K8S-0005',
    datNgay: [],
    datSauKhiLang: [],
    guards: [],
    goals: ['tra-cuu-dung-duong', 'ho-tro-dung-cong', 'het-su-co-dinh-tuyen'],
  },
  {
    code: 'K8S-0006',
    datNgay: [],
    datSauKhiLang: ['ba-pod-chay'],
    guards: [],
    goals: ['pvc-0-bound', 'pvc-2-bound', 'ba-pod-chay'],
  },
  {
    code: 'K8S-0007',
    datNgay: [],
    datSauKhiLang: [],
    guards: [],
    goals: ['them-khoa-thieu', 'dong-bo-chay', 'co-secret', 'gui-thong-bao-chay'],
  },
  {
    code: 'K8S-0008',
    datNgay: ['khach-la-bi-chan'],
    datSauKhiLang: ['khach-la-bi-chan'],
    guards: ['khach-la-bi-chan'],
    goals: ['web-goi-duoc', 'web-phan-giai-duoc', 'metric-thu-duoc'],
  },
  {
    code: 'K8S-0009',
    datNgay: ['con-liet-ke-duoc-pod', 'con-liet-ke-duoc-service'],
    datSauKhiLang: [
      'con-liet-ke-duoc-pod',
      'con-liet-ke-duoc-service',
      'ung-dung-van-chay',
    ],
    guards: ['con-liet-ke-duoc-pod', 'con-liet-ke-duoc-service'],
    goals: ['khong-doc-secret', 'khong-xoa-pod', 'ung-dung-van-chay'],
  },
  {
    code: 'K8S-0010',
    datNgay: ['trong-han-muc'],
    datSauKhiLang: ['trong-han-muc'],
    guards: ['trong-han-muc'],
    goals: [
      'api-du-sau',
      'xu-ly-on-dinh',
      'hpa-doc-duoc',
      'giao-tiep-khai-du',
      'van-hanh-sach',
    ],
  },
];

describe('CHẤM — engine cho ra đúng kết quả cũ', () => {
  it('mục tiêu đạt ở tick 0 và sau 40 tick khớp ảnh chụp', () => {
    expect(PROBLEMS_SEED.map(chupCham)).toEqual(ANH_CHUP_CHAM);
  });

  it('không bài nào giải sẵn: mọi mục tiêu BẮT BUỘC đều chưa đạt ở tick 0', () => {
    /*
     * Đối chứng chống-rỗng-nghĩa cho bảng trên. Một ảnh chụp toàn mảng rỗng vẫn
     * "khớp" nếu engine bị hỏng tới mức không vị từ nào chạy được — `toEqual([])`
     * xanh y hệt khi câu trả lời đúng là rỗng và khi phép đo chết. Ô này hỏi câu
     * khác: có bài nào đang TỰ hoàn thành không.
     *
     * Lưu ý `guards` KHÔNG vi phạm điều này. `giu-readiness` hay `khach-la-bi-chan`
     * đạt ngay từ tick 0 là đúng nghĩa — chúng là ràng buộc "đừng làm hỏng thứ
     * đang chạy". Cái bị cấm là một bài mà MỌI mục tiêu bắt buộc đều đã đạt.
     */
    for (const bai of PROBLEMS_SEED) {
      const datNgay = new Set(evaluateObjectives(initialState(bocThanhLevel(bai), HAT_GIONG), bai.objectives));
      const batBuocChuaDat = bai.objectives.filter((muc) => muc.required && !datNgay.has(muc.id));
      expect(batBuocChuaDat.length, `${bai.code} đã xong sẵn từ tick 0`).toBeGreaterThan(0);
    }
  });

  it('sự cố gieo sẵn thật sự có mặt trong trạng thái đầu', () => {
    /*
     * Bẫy đã cắn một lần, ghi ở `reducer.ts:111`: `seedIncidents` được export mà
     * KHÔNG AI GỌI, nên `state.incidents` luôn rỗng và vị từ `no-incident-active`
     * đúng một cách RỖNG NGHĨA — bảy level qua được mục tiêu đó trong khi sự cố
     * chưa bao giờ tồn tại. Không test nào đỏ, vì hàm có mặt và có test riêng,
     * chỉ là không nằm trên đường chạy nào.
     *
     * 18.A dựng lại đường đi từ `Problem` tới engine, nên chính cái nút thắt đó
     * là thứ dễ tuột nhất. Số sự cố đối chiếu với cột `suCoGieo` của ảnh chụp
     * mục 1 — một mảng VIẾT TAY, không phải đếm lại từ chính dữ liệu đang đo.
     */
    for (const mong of ANH_CHUP_SEED) {
      const trangThai = initialState(bocThanhLevel(baiTheoMa(mong.code)), HAT_GIONG);
      expect(trangThai.incidents.map((su) => su.kind), mong.code).toEqual(mong.suCoGieo);
    }
  });

  it('đối chứng âm: đổi tham số một mục tiêu thì kết quả chấm PHẢI đổi', () => {
    /*
     * Bảng `ANH_CHUP_CHAM` chỉ có giá trị nếu nó thật sự đang ĐO cái gì đó. Một
     * engine hỏng tới mức mọi vị từ trả `false` vẫn khớp được phần lớn bảng, vì
     * phần lớn ô trong bảng là mảng rỗng — `toEqual([])` trông y hệt nhau ở
     * "chưa ai làm gì nên chưa đạt" và ở "phép đo đã chết".
     *
     * Ô này hỏi ngược lại: nếu ta CỐ Ý làm sai một mục tiêu, bảng có phản ứng
     * không. `giu-readiness` của K8S-0002 đang là `guard` (đạt ngay từ tick 0);
     * trỏ nó sang một namespace không tồn tại thì vị từ phải trả `false` và nó
     * phải rơi khỏi `guards`. Nếu nó KHÔNG rơi, nghĩa là `probe-configured`
     * không đọc tham số của nó nữa — và lúc đó mọi ô xanh ở trên đều vô nghĩa.
     */
    const goc = baiTheoMa('K8S-0002');
    const beoSai: Problem = {
      ...goc,
      objectives: goc.objectives.map((muc) =>
        muc.id === 'giu-readiness'
          ? { ...muc, args: { ...(muc.args ?? {}), namespace: 'namespace-khong-ton-tai' } }
          : muc,
      ),
    };
    expect(chupCham(goc).guards).toEqual(['giu-readiness']);
    expect(chupCham(beoSai).guards).toEqual([]);
  });

  it('đối chứng âm: bỏ `seededIncident` thì sự cố PHẢI biến mất khỏi trạng thái đầu', () => {
    /*
     * Cặp đôi của ô "sự cố gieo sẵn thật sự có mặt". Ô kia khẳng định có; ô này
     * khẳng định phép đếm đó phản ứng với dữ liệu chứ không phải một hằng số.
     * Không có nó thì một `seedIncidents` trả về danh sách cứng vẫn qua được ô
     * kia ở đúng những bài có số sự cố trùng khớp.
     */
    const goc = baiTheoMa('K8S-0001');
    const khongSuCo: Problem = {
      ...goc,
      initialState: {
        ...goc.initialState,
        resources: goc.initialState.resources.map(({ seededIncident: _bo, ...phanConLai }) => phanConLai),
      },
    };
    expect(initialState(bocThanhLevel(goc), HAT_GIONG).incidents.length).toBe(3);
    expect(initialState(bocThanhLevel(khongSuCo), HAT_GIONG).incidents.length).toBe(0);
  });

  it('phân loại goal/guard tất định: cùng hạt giống, hai lần gọi, cùng kết quả', () => {
    /*
     * Toàn bộ hệ chấm lại phía máy chủ (18.C) đứng trên lời hứa "phát lại tất
     * định". Một `Math.random()` hay `Date.now()` lạc vào engine trong lúc
     * refactor sẽ không làm ô nào ở trên đỏ ĐỀU — nó làm chúng đỏ THẤT THƯỜNG,
     * loại lỗi tốn nhiều ngày nhất để lần ra. Ô này biến "thất thường" thành
     * "đỏ ngay".
     */
    for (const bai of PROBLEMS_SEED) {
      const lanMot = classifyObjectives(bocThanhLevel(bai), HAT_GIONG);
      const lanHai = classifyObjectives(bocThanhLevel(bai), HAT_GIONG);
      expect(lanHai, bai.code).toEqual(lanMot);
    }
  });
});

/** Điểm của ba kịch bản mẫu trên từng bài seed thật. */
interface AnhChupDiem {
  readonly code: string;
  /** Đạt hết mục tiêu, 6 nước, không mở gợi ý. */
  readonly tronVen: number;
  /** Như trên nhưng mở HẾT gợi ý của bài. */
  readonly moHetGoiY: number;
  /** Đạt một nửa mục tiêu (làm tròn xuống), không mở gợi ý. */
  readonly nuaChung: number;
}

function chupDiem(bai: Problem): AnhChupDiem {
  const chung = {
    objectivesTotal: bai.objectives.length,
    movesUsed: 6,
    parMoves: bai.parMoves,
    hints: bai.hints,
  };
  return {
    code: bai.code,
    tronVen: scoreProblemRun({
      ...chung,
      objectivesMet: bai.objectives.length,
      revealedHintIds: [],
    }),
    moHetGoiY: scoreProblemRun({
      ...chung,
      objectivesMet: bai.objectives.length,
      revealedHintIds: bai.hints.map((goi) => goi.id),
    }),
    nuaChung: scoreProblemRun({
      ...chung,
      objectivesMet: Math.floor(bai.objectives.length / 2),
      revealedHintIds: [],
    }),
  };
}

/**
 * Ảnh chụp ngày 2026-09-14.
 *
 * `problem-scoring.test.ts` đã gác công thức bằng gợi ý DỰNG SẴN. Bảng này khác
 * ở chỗ nó chạy trên gợi ý THẬT của mười bài thật, nên nó bắt được thứ kia không
 * bắt: `penaltyPoints` của một bài bị sửa trong lúc dời file, hoặc `hints` rơi
 * mất trong bước bọc `Problem` → hình dạng mới.
 *
 * `nuaChung` khác nhau giữa các bài (350 / 233 / 280) vì tỉ lệ mục tiêu đạt khác
 * nhau — 2/4, 1/3, 2/5. Ba giá trị phân biệt là bằng chứng phép đo đang thật sự
 * đọc số mục tiêu của từng bài chứ không trả về một hằng số.
 */
const ANH_CHUP_DIEM: readonly AnhChupDiem[] = [
  { code: 'K8S-0001', tronVen: 1000, moHetGoiY: 950, nuaChung: 350 },
  { code: 'K8S-0002', tronVen: 1000, moHetGoiY: 950, nuaChung: 233 },
  { code: 'K8S-0003', tronVen: 1000, moHetGoiY: 955, nuaChung: 233 },
  { code: 'K8S-0004', tronVen: 1000, moHetGoiY: 950, nuaChung: 233 },
  { code: 'K8S-0005', tronVen: 1000, moHetGoiY: 950, nuaChung: 233 },
  { code: 'K8S-0006', tronVen: 1000, moHetGoiY: 950, nuaChung: 233 },
  { code: 'K8S-0007', tronVen: 1000, moHetGoiY: 955, nuaChung: 350 },
  { code: 'K8S-0008', tronVen: 1000, moHetGoiY: 930, nuaChung: 350 },
  { code: 'K8S-0009', tronVen: 1000, moHetGoiY: 950, nuaChung: 280 },
  { code: 'K8S-0010', tronVen: 1000, moHetGoiY: 930, nuaChung: 350 },
];

describe('CHẤM — điểm trên bài seed thật', () => {
  it('ba kịch bản mẫu cho ra đúng con số cũ', () => {
    expect(PROBLEMS_SEED.map(chupDiem)).toEqual(ANH_CHUP_DIEM);
  });

  it('mở hết gợi ý trừ đúng TỔNG penaltyPoints của bài đó', () => {
    /*
     * Ràng buộc ở dạng công thức, độc lập với ba con số viết tay bên trên: dù
     * điểm gốc có đổi vì lý do gì, hiệu giữa "không mở" và "mở hết" vẫn phải
     * bằng tổng giá gợi ý. Hai ô cùng đỏ ⇒ điểm gốc đổi. Chỉ ô này đỏ ⇒ phần
     * trừ điểm gợi ý hỏng, và đó là đường gian lận: gợi ý miễn phí trên thực tế.
     */
    for (const bai of PROBLEMS_SEED) {
      const anh = chupDiem(bai);
      const tongPhat = bai.hints.reduce((cong, goi) => cong + goi.penaltyPoints, 0);
      expect(anh.tronVen - anh.moHetGoiY, bai.code).toBe(tongPhat);
      // Chống rỗng nghĩa: một bài mà tổng phạt bằng 0 sẽ làm ô trên đúng một
      // cách tầm thường. Cả mười bài hiện đều có gợi ý CÓ GIÁ.
      expect(tongPhat, bai.code).toBeGreaterThan(0);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. HIỂN THỊ — tập giá trị đóng, nhãn, và bất biến che gợi ý
// ════════════════════════════════════════════════════════════════════════════

/**
 * `true` khi `A` KHÔNG gán được vào `B`; `never` khi gán được.
 *
 * Dùng làm cổng gác lúc BIÊN DỊCH: gán `never` cho một biến khởi tạo bằng `true`
 * là lỗi kiểu, nên chỗ nào viết `const x: KhongGanDuoc<A, B> = true` sẽ ĐỎ ngay
 * khi `A` bắt đầu gán được vào `B`.
 *
 * Bọc trong tuple `[A] extends [B]` để chặn phân phối trên kiểu liên hợp — không
 * bọc thì `KhongGanDuoc<'a' | 'b', 'a'>` trả về `never | true` = `true`, tức cổng
 * im lặng mất tác dụng đúng lúc kiểu được nới ra thành liên hợp.
 */
type KhongGanDuoc<A, B> = [A] extends [B] ? never : true;

/**
 * Đối chứng cho chính cơ chế gác ở trên, và nó là thứ giữ ba ô kiểu bên dưới
 * khỏi thành đồ trang trí.
 *
 * `Problem` hiển nhiên gán được vào chính nó, nên `KhongGanDuoc<Problem, Problem>`
 * PHẢI là `never`, và dòng dưới PHẢI không biên dịch được. `@ts-expect-error` đảo
 * phép thử lại: nếu dòng này lỡ biên dịch được — tức ai đó "sửa" `KhongGanDuoc`
 * thành một kiểu luôn trả `true` — thì `tsc` báo TS2578 *"Unused '@ts-expect-error'
 * directive"* và cả gói ĐỎ.
 *
 * Không có dòng này, một `KhongGanDuoc` hỏng sẽ làm ba ô kiểu bên dưới xanh vĩnh
 * viễn, kể cả sau khi lớp che gợi ý đã bị gỡ hoàn toàn.
 */
// @ts-expect-error — gán được vào chính nó ⇒ `KhongGanDuoc` phải trả `never`
const _tuKiemCoCheGac: KhongGanDuoc<Problem, Problem> = true;

describe('HIỂN THỊ — gợi ý chưa mở KHÔNG được mang text', () => {
  /**
   * Lỗ hổng đã vá ngày 2026-09-08, chép lại đây vì 18.A dễ mở lại nó nhất:
   * `Problem.hints[].text` là trường BẮT BUỘC, nên một API trả thẳng `Problem`
   * cho người học gửi kèm toàn bộ nội dung gợi ý xuống trình duyệt. Lúc đó
   * `revealHint` chỉ còn là hoạt cảnh — điểm vẫn bị trừ, nhưng ai mở tab công cụ
   * nhà phát triển đều đọc gợi ý miễn phí. Che ở tầng giao diện không cứu được,
   * vì dữ liệu đã nằm trong phản hồi.
   *
   * ⚠ Ba ô dưới đây đỏ ở `tsc --noEmit`, KHÔNG đỏ ở `vitest run` — vitest không
   * kiểm kiểu. `expect` chỉ để chúng có mặt trong báo cáo chạy và không bị lint
   * coi là biến thừa. Hàm che thật (`toSolverProblem`) nằm ở
   * `apps/web/src/server/problems/solver.ts`, ngoài package này; dựng lại một
   * bản sao của nó ở đây để "test" thì chỉ là tự kiểm tra chính mình.
   */
  it('`Problem` thô KHÔNG gán được vào `ProblemForSolver`', () => {
    const cheVanConHieuLuc: KhongGanDuoc<Problem, ProblemForSolver> = true;
    expect(cheVanConHieuLuc).toBe(true);
  });

  it('trang chi tiết nhận bản ĐÃ CHE, không nhận `Problem` thô', () => {
    // `ProblemWithStats.problem` là thứ trang danh sách và trang chi tiết đọc.
    // Nếu nó nới thành `Problem`, toàn bộ lớp che ở trên thành vô nghĩa vì đường
    // đi tới màn hình không dùng nó nữa.
    const trangChiTietDungBanChe: KhongGanDuoc<Problem, ProblemWithStats['problem']> = true;
    expect(trangChiTietDungBanChe).toBe(true);
  });

  it('`text` của gợi ý đã che nhận `null`, còn `text` của gợi ý gốc thì không', () => {
    // Chiều một: bản che PHẢI biểu diễn được "chưa mở nên chưa có chữ".
    const chuaMoThiKhongCoChu: ProblemForSolver['hints'][number]['text'] = null;
    // Chiều hai: bản gốc (đường của người soạn) PHẢI luôn có chữ. Nới nó thành
    // nullable sẽ làm chiều một đúng một cách tầm thường, vì lúc đó hai kiểu
    // giống hệt nhau.
    const banGocLuonCoChu: KhongGanDuoc<null, ProblemHint['text']> = true;
    expect(chuaMoThiKhongCoChu).toBeNull();
    expect(banGocLuonCoChu).toBe(true);
  });

  it('bất biến che không rỗng nghĩa: mọi gợi ý seed đều CÓ chữ để mà giấu', () => {
    /*
     * Cổng gác cuối, và là cổng duy nhất trong mục này chạy được ở `vitest run`.
     * Nếu `hints` của mười bài rơi về rỗng trong lúc dời dữ liệu, ba ô kiểu bên
     * trên vẫn xanh nguyên — chúng nói về KIỂU, không nói về dữ liệu — và hệ
     * thống che sẽ đang canh giữ một cái kho trống.
     */
    for (const bai of PROBLEMS_SEED) {
      expect(bai.hints.length, bai.code).toBeGreaterThanOrEqual(2);
      for (const goi of bai.hints) {
        expect(goi.text.trim().length, `${bai.code} › ${goi.id}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('HIỂN THỊ — tập giá trị đóng và nhãn', () => {
  it('chín chủ đề, đúng thứ tự', () => {
    /*
     * `problem.test.ts` kiểm bảng nhãn PHỦ ĐỦ danh sách, nhưng không kiểm danh
     * sách CHỨA GÌ — xoá `observability` khỏi cả hai nơi thì mọi ô hiện có vẫn
     * xanh. 18.A.3 chuyển `topics` thành thứ plugin cung cấp, tức đúng chỗ một
     * chủ đề có thể rơi rụng mà không ai thấy.
     */
    expect(PROBLEM_TOPICS).toEqual([
      'workload',
      'scheduling',
      'networking',
      'storage',
      'config',
      'security',
      'scaling',
      'observability',
      'troubleshooting',
    ]);
  });

  it('bốn bậc khó, xếp từ dễ tới khó', () => {
    // Thang BỐN bậc này cố ý khác thang ba bậc `SCENARIO_DIFFICULTIES`, và
    // `problem.ts` cấm ánh xạ ngầm giữa chúng. Một refactor gom hai thang lại sẽ
    // đỏ ngay ở đây.
    expect(PROBLEM_DIFFICULTIES).toEqual(['easy', 'medium', 'hard', 'expert']);
  });

  it('ba trạng thái vòng đời', () => {
    expect(PROBLEM_STATES).toEqual(['draft', 'published', 'archived']);
  });

  it('bốn khoá sắp xếp, và vẫn KHÔNG có `title`', () => {
    // Postgres và JavaScript không cùng thứ tự với tiếng Việt có dấu. Với phân
    // trang keyset, lệch thứ tự nghĩa là MẤT DÒNG trong im lặng.
    expect(PROBLEM_ORDER_KEYS).toEqual(['code', 'difficulty', 'solverCount', 'createdAt']);
  });

  it('khuôn mã bài giữ nguyên bốn chữ số có đệm', () => {
    expect(PROBLEM_CODE_PATTERN.source).toBe('^K8S-\\d{4}$');
    expect(PROBLEM_CODE_PATTERN.flags).toBe('');
  });

  it('nhãn hiển thị giữ nguyên từng chữ', () => {
    /*
     * Nhãn đi qua bản đồ copy (`t('problem.topic.workload')`). Khoá copy được
     * kiểm kiểu nên khoá sai là lỗi biên dịch; thứ ô này bắt là chuyện KHÁC:
     * plugin K8s của 18.A dựng lại bảng nhãn của riêng nó và người dùng đột nhiên
     * đọc `problem.topic.workload` thay vì `Workload`, hoặc đọc một bản dịch
     * khác cho cùng một chủ đề.
     */
    expect(PROBLEM_TOPIC_LABELS).toEqual({
      workload: 'Workload',
      scheduling: 'Lập lịch',
      networking: 'Mạng',
      storage: 'Lưu trữ',
      config: 'Cấu hình',
      security: 'Bảo mật',
      scaling: 'Co giãn',
      observability: 'Quan sát',
      troubleshooting: 'Gỡ sự cố',
    });
    expect(PROBLEM_DIFFICULTY_LABELS).toEqual({
      easy: 'Dễ',
      medium: 'Trung bình',
      hard: 'Khó',
      expert: 'Rất khó',
    });
  });

  it('`SETTLE_TICKS` vẫn là 40', () => {
    // Bảng `ANH_CHUP_CHAM` đo tại đúng mốc này. Chỉnh nó mà bảng vẫn xanh nghĩa
    // là bảng đang không đo cái nó tưởng.
    expect(SETTLE_TICKS).toBe(40);
  });
});
