/**
 * Hai bài mẫu của game CI/CD trong hệ OJ — 19.J.4.
 *
 * ⛔ DỮ LIỆU GỐC để nạp vào cơ sở dữ liệu một lần, không phải nguồn đọc lúc
 * chạy. Trang danh sách và trang làm bài đọc từ DB; đọc thẳng từ đây thì bài do
 * người soạn tạo ra sẽ không bao giờ hiện.
 *
 * ## Vì sao PHẢI có bộ này, chứ không chỉ để `/author/problems` tự soạn
 *
 * Ô e2e của 19.J chạy trong `e2e:ci`, trên `next start` + Postgres và KHÔNG có
 * cụm. Soạn một bài qua giao diện đòi vai trò `author`, mà vai trò đầu tiên chỉ
 * đặt được từ NGOÀI hệ thống (`e2e/scripts/promote-role.sh`, dùng `kubectl`) —
 * nên trong CI một ô "soạn rồi làm bài" sẽ `test.skip`, và một suite skip sạch
 * trông y hệt một suite xanh. Bộ seed này là thứ cho ô e2e một bài THẬT để mở.
 *
 * Hai bài, hai nửa của game, và cả hai đều cần thiết:
 *
 * | Mã | Chương | Dạy | Vì sao có mặt |
 * |---|---|---|---|
 * | `CICD-0001` | CI | tách hai job song song | đường ngắn nhất từ đề tới verdict |
 * | `CICD-0002` | CD | chọn cách xử bản phát hành xấu | bài DUY NHẤT chạy bộ mô phỏng CD trong CI |
 *
 * ⚠ `CICD-0002` là chỗ duy nhất trong CI mà khối `cd` của một đề đi qua trọn
 * đường: biên ghi → bộ chấm → adapter phát lại. Bỏ nó đi thì mọi ô còn lại vẫn
 * xanh trên một hệ thống không chấm nổi một bài CD nào.
 */

import type { WorkflowSpec } from '../contract.ts';

/**
 * Hình dạng một dòng seed — CỐ Ý không dùng `Problem` của K8s.
 *
 * `k8s/problem.ts` § `Problem` khai `initialState: ClusterSpec` và
 * `allowedResources: ResourceKind[] | null`; cả hai vô nghĩa ở game này. Một
 * `as unknown as Problem` để mượn kiểu đó sẽ nói dối về chính thứ đang khai.
 *
 * `gameId` BẮT BUỘC ở đây dù cột DB có mặc định `'k8s'` — đó chính là lý do:
 * một dòng seed quên trường này sẽ lặng lẽ nằm trong bảng dưới cờ K8s, và
 * `gradeProblemRun` sẽ tra sai plugin.
 */
export interface CicdProblemSeed {
  readonly gameId: 'cicd';
  readonly code: string;
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  readonly topics: readonly string[];
  readonly tags: readonly string[];
  readonly timeLimitSec: number | null;
  readonly initialState: unknown;
  readonly objectives: readonly {
    readonly id: string;
    readonly label: string;
    readonly check: string;
    readonly args?: Readonly<Record<string, unknown>>;
    readonly visible: boolean;
  }[];
  readonly allowedResources: null;
  readonly hints: readonly { readonly id: string; readonly text: string; readonly penaltyPoints: number }[];
  readonly parMoves: number | null;
  readonly state: 'published';
  readonly createdAt: string;
  readonly updatedAt: string;
}

const MOC_THOI_GIAN = '2026-09-17T00:00:00.000Z';

/**
 * Máy chạy + dòng commit dùng chung cho cả hai bài.
 *
 * BA commit chứ không một: hợp đồng ghi rằng một commit làm thông lượng thành
 * đúng `1 / leadTime`, tức trục thứ hai trở thành một phép chia của trục thứ
 * nhất và không đo được gì nữa. HAI máy chạy để bài song song có chỗ mà dạy.
 */
const TAI = {
  runners: [{ id: 'linux', label: 'May Linux', count: 2 }],
  inputs: [{ id: 'ma-nguon', label: 'Ma nguon', changesEvery: 1 }],
  commits: [
    { id: 'c1', tick: 0 },
    { id: 'c2', tick: 20 },
    { id: 'c3', tick: 40 },
  ],
};

function buoc(id: string, ticks: number) {
  return { id, name: id, durationTicks: ticks, blocking: true, script: `chay-${id}` };
}

/**
 * Đường ống khởi điểm: ba job MẮC NỐI TIẾP.
 *
 * `kiem-tra` và `dong-goi` đều chỉ cần `clone`, nhưng đề nối chúng thành một
 * chuỗi — đó chính là thứ người làm phải sửa. Khuôn job (`job-shapes.ts`) khoá
 * tập job và dãy bước, nên lời giải DUY NHẤT là đổi cạnh phụ thuộc.
 */
const DUONG_ONG_NOI_TIEP: WorkflowSpec = {
  name: 'Duong ong ban dau',
  stages: [
    {
      id: 'clone',
      kind: 'clone',
      name: 'clone',
      dependsOn: [],
      blocking: true,
      retries: 0,
      runnerClass: 'linux',
      steps: [buoc('tai-ma', 3)],
    },
    {
      id: 'kiem-tra',
      kind: 'unit-test',
      name: 'kiem-tra',
      dependsOn: ['clone'],
      blocking: true,
      retries: 0,
      runnerClass: 'linux',
      steps: [buoc('chay-kiem-tra', 8)],
    },
    {
      id: 'dong-goi',
      kind: 'build',
      name: 'dong-goi',
      dependsOn: ['kiem-tra'],
      blocking: true,
      retries: 0,
      runnerClass: 'linux',
      steps: [buoc('dong-goi-ban', 6)],
    },
  ],
};

const cicd0001: CicdProblemSeed = {
  gameId: 'cicd',
  code: 'CICD-0001',
  slug: 'hai-job-khong-can-doi-nhau',
  title: 'Hai job không cần đợi nhau',
  statement: `Đường ống có ba job: lấy mã nguồn, kiểm thử, đóng gói. Cả ba đang chạy nối
tiếp nhau, và lượt chạy vì thế dài đúng bằng tổng ba job.

Đóng gói không đọc kết quả kiểm thử. Nó chỉ cần mã nguồn.

Sửa quan hệ phụ thuộc để hai job đó chạy song song, và đừng đụng tới tập job hay
các bước bên trong chúng.`,
  /* `easy`: một cạnh phụ thuộc, không có núm nào phải xoay, và bài học đã có bài lý thuyết 01 đứng sau. */
  difficulty: 'easy',
  topics: ['graph', 'scheduling'],
  tags: ['song-song', 'phu-thuoc', 'lead-time'],
  timeLimitSec: 300,
  initialState: { workflow: DUONG_ONG_NOI_TIEP, workload: TAI, evaluation: { baseSeed: 1901, passes: 12 } },
  objectives: [
    /*
     * HAI testcase, và cặp này là cả bài: job đóng gói KHÔNG được phụ thuộc
     * (bắc cầu) vào kiểm thử, nhưng VẪN phải phụ thuộc vào clone. Thiếu vế thứ
     * hai thì xoá sạch mọi cạnh cũng đạt — một lời giải sai mà đề khen đúng.
     */
    {
      id: 'dong-goi-khong-doi-kiem-tra',
      label: 'Đóng gói không chờ kiểm thử',
      check: 'stageNotDependsOn',
      args: { stage: 'dong-goi', on: 'kiem-tra' },
      visible: true,
    },
    {
      id: 'dong-goi-van-can-ma-nguon',
      label: 'Đóng gói vẫn lấy mã nguồn trước',
      check: 'stageDependsOn',
      args: { stage: 'dong-goi', on: 'clone' },
      visible: true,
    },
  ],
  allowedResources: null,
  hints: [
    {
      id: 'h1',
      text: 'Đọc lại `needs` của từng job. Một job chỉ nên đợi thứ nó thật sự đọc.',
      penaltyPoints: 20,
    },
  ],
  parMoves: null,
  state: 'published',
  createdAt: MOC_THOI_GIAN,
  updatedAt: MOC_THOI_GIAN,
};

const cicd0002: CicdProblemSeed = {
  gameId: 'cicd',
  code: 'CICD-0002',
  slug: 'ban-phat-hanh-xau-lui-hay-va',
  title: 'Bản phát hành xấu: lùi lại hay vá đi tới',
  statement: `Bản ứng viên có tỷ lệ lỗi cao hơn hẳn bản đang chạy. Chiến lược canary sẽ
phát hiện ra điều đó và dừng lại trước khi bản xấu phủ hết lưu lượng.

Câu hỏi là chuyện xảy ra SAU khi phát hiện. Đường ống đang chọn vá đi tới, và
một bản vá phải chờ người viết ra nó.

Xoay núm để người dùng thoát khỏi bản xấu trong dưới hai phút. Đường ống thì giữ
nguyên — bài này không hỏi về workflow.`,
  /* `medium`: một núm duy nhất, nhưng phải đọc được rằng `onBadRelease` quyết định quãng SAU phát hiện chứ không quyết định có phát hiện hay không. */
  difficulty: 'medium',
  topics: ['tradeoff'],
  tags: ['canary', 'rollback', 'phat-hanh'],
  timeLimitSec: 300,
  initialState: {
    workflow: DUONG_ONG_NOI_TIEP,
    workload: TAI,
    evaluation: { baseSeed: 1901, passes: 12 },
    /*
     * Kịch bản lấy từ `levels/c20-canary-gioi-han-luu-luong.ts` — bộ số đó đã
     * được `levels/cd-levels.test.ts` chạy qua cả ba bộ chính sách, nên ta biết
     * nó nằm trong miền hợp lệ của `simulateRelease`. Bịa một bộ số mới là mời
     * một bài mà bộ mô phỏng ném và mọi lượt nộp ra WA vì lý do không ai đọc ra.
     */
    cd: {
      release: {
        scenarios: [
          {
            instances: 100,
            requestsPerSecond: 10_000,
            baselineErrorRate: 0.01,
            candidateErrorRate: 0.15,
            replaceSeconds: 60,
            switchSeconds: 3,
            routeSeconds: 12,
            alertSeconds: 30,
            migration: 'none',
            fixForwardSeconds: 300,
          },
        ],
        evaluation: { baseSeed: 200_801, passes: 20 },
      },
      /*
       * CHỈ `onBadRelease` mở. Mọi núm khác khoá, nên `mergeCdPolicies` bỏ qua
       * chúng dù lượt nộp gửi gì — đó là phép gác AC-J4, và bài này là chỗ nó
       * chạy thật trong CI.
       */
      editable: ['release.onBadRelease'],
      initial: {
        release: {
          strategy: 'canary',
          onBadRelease: 'roll-forward',
          canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
        },
      },
    },
  },
  objectives: [
    {
      id: 'lui-duoi-hai-phut',
      label: 'Thoát khỏi bản xấu trong dưới hai phút',
      check: 'rollbackUnder',
      args: { seconds: 120 },
      visible: true,
    },
  ],
  allowedResources: null,
  hints: [
    {
      id: 'h1',
      text: 'Vá đi tới phải chờ một bản vá được viết. Còn cách kia thì bản cũ vẫn đang chạy sẵn.',
      penaltyPoints: 20,
    },
  ],
  parMoves: null,
  state: 'published',
  createdAt: MOC_THOI_GIAN,
  updatedAt: MOC_THOI_GIAN,
};

export const CICD_PROBLEMS_SEED: readonly CicdProblemSeed[] = [cicd0001, cicd0002];
