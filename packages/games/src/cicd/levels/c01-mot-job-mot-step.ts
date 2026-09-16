import type { CicdLevel } from '../contract.ts';

/**
 * C01 — stage và bước, hai tầng khác nhau.
 *
 * Đường ống để TRỐNG có chủ ý: người học chưa thấy một đường ống chạy đúng thì
 * không có gì để so khi gặp một đường ống hỏng. Đây là cùng lựa chọn mà
 * `k8s/levels/l01.ts` đã ghi lại — level đầu tiên không gieo sự cố nào.
 *
 * ## Vì sao hai lời giải khác nhau THẬT
 *
 * Cùng 12 tick công việc, hai cách chia:
 *
 * - **A** — hai stage, và toàn bộ việc cài gói + chạy test nằm trong HAI BƯỚC
 *   của cùng một stage `kiem-tra`. Hai bước chạy nối tiếp trên CÙNG một máy.
 * - **B** — ba stage, việc cài gói được tách thành một stage `chuan-bi` riêng.
 *
 * Lead time bằng nhau đúng 12 tick, và đó chính là bài học: ở một đường ống
 * thẳng tuột, tách stage KHÔNG làm nhanh hơn — nó chỉ đổi đơn vị được cấp máy.
 * Cái giá thật của việc tách chỉ lộ ra ở C03 (giành máy) và C04 (đường găng).
 *
 * Mục tiêu vì thế cố ý KHÔNG ghim số stage: `stageCountAtMost` là mục THƯỞNG,
 * nên A ăn thêm điểm mà B vẫn AC. Ghim nó thành bắt buộc là biến một lựa chọn
 * thiết kế thành một đáp án duy nhất.
 *
 * ## Ngưỡng đo từ đâu
 *
 * Bảng ở `ci-som.test.ts` chạy engine thật trên cả ba workflow (ban đầu, A, B)
 * rồi in ba trục. Ngưỡng dưới đây chép từ lượt chạy đó, không đặt bằng cảm giác.
 */
export const c01: CicdLevel = {
  id: 'cicd-c01-mot-job-mot-step',
  chapter: 'ci',
  title: 'Một stage, một bước',
  mission: 'Dựng một đường ống tối thiểu: tải mã nguồn rồi chạy test, và cho nó xanh.',
  brief: `Bạn được giao một kho mã chưa có đường ống nào. Ô soạn thảo bên trái đang
trống, và mỗi lần đẩy commit lên thì không có gì chạy cả.

Một đường ống được xếp lịch theo **stage**. Mỗi stage chiếm một máy chạy trong
suốt thời gian nó làm việc, và bên trong nó là một dãy **bước** chạy nối tiếp
trên đúng máy đó. Hai tầng này khác nhau, và khác biệt đó sẽ quyết định mọi thứ
từ C03 trở đi — nên hãy nhìn kỹ nó ngay ở đây, lúc chưa có gì phức tạp.

Việc của bạn: dựng một stage \`clone\` tải mã nguồn về, rồi một stage
\`kiem-tra\` chạy test, và nói cho đường ống biết \`kiem-tra\` phải đợi
\`clone\` xong. Bao nhiêu bước nằm trong \`kiem-tra\` là lựa chọn của bạn.`,
  difficulty: 'basic',
  initialWorkflow: {
    name: 'Đường ống trống',
    stages: [],
  },
  workload: {
    runners: [{ id: 'linux', label: 'Máy Linux', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    // Ba commit, giãn 20 tick — rộng hơn hẳn 12 tick của một lượt chạy, nên
    // không commit nào phải đợi commit trước. Ở level đầu tiên, hàng đợi là một
    // biến gây nhiễu chứ không phải bài học; nó tới ở C03.
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 20 },
      { id: 'c3', tick: 40 },
    ],
  },
  // Bốn lượt, không phải 20. Level này không có bước nào khai `flake` hay
  // `durationSpreadTicks`, nên mọi lượt mô phỏng giống hệt nhau — 20 lượt tốn
  // gấp năm lần để in ra đúng một con số. Giữ > 1 để hình dạng bản ghi vẫn là
  // hình dạng thật, và để C09 trở đi nâng lên không phải đổi kiểu gì.
  evaluation: { baseSeed: 1901, passes: 4 },
  editable: ['stages', 'edges'],
  allowedKinds: null,
  objectives: [
    {
      id: 'co-clone',
      label: 'Có một stage `clone` tải mã nguồn về',
      check: 'stageExists',
      args: { stage: 'clone' },
      required: true,
    },
    {
      id: 'co-kiem-tra',
      label: 'Có một stage `kiem-tra` chạy test',
      check: 'stageExists',
      args: { stage: 'kiem-tra' },
      required: true,
    },
    {
      id: 'kiem-tra-doi-clone',
      label: '`kiem-tra` chỉ chạy sau khi `clone` xong',
      check: 'stageDependsOn',
      args: { stage: 'kiem-tra', on: 'clone' },
      required: true,
    },
    {
      id: 'moi-lut-deu-xanh',
      label: 'Mọi lượt chạy đều xanh',
      check: 'greenRateAtLeast',
      args: { rate: 1 },
      required: true,
    },
    {
      id: 'du-nhanh',
      label: 'Một commit đi hết đường ống trong dưới 150 giây',
      check: 'leadTimeUnder',
      args: { seconds: 150 },
      required: true,
    },
    {
      id: 'gon-hai-stage',
      label: 'Thưởng: gói trọn đường ống trong không quá 2 stage',
      check: 'stageCountAtMost',
      args: { max: 2 },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 120,
    budgetLeadSeconds: 150,
    parThroughputPerHour: 20,
    minThroughputPerHour: 14,
    parRunnerMinutes: 6,
    budgetRunnerMinutes: 8,
    minGreenRate: 1,
  },
  hints: [
    'Ô soạn thảo đang trống nên không có gì để chạy. Bắt đầu bằng một stage duy nhất, bấm chạy, và xem bản ghi nói gì.',
    'Một stage cần bốn thứ: mã định danh, loại việc, hạng máy chạy, và ít nhất một bước. Bước mới là chỗ khai thời lượng.',
    'Thêm stage thứ hai rồi khai `dependsOn: [clone]` cho nó. Thiếu dòng đó thì hai stage cùng chạy ở tick 0 và stage test sẽ không thấy mã nguồn đâu cả.',
  ],
  teaching: {
    primer: `Một đường ống CI là một **đồ thị có hướng không chu trình**: các stage là
đỉnh, quan hệ "phải xong trước" là cạnh.

Hai tầng cần phân biệt ngay từ bây giờ:

**Stage** là đơn vị được xếp lịch. Nó xin một máy chạy, giữ máy đó suốt thời
gian làm việc, rồi trả lại. Hai stage không phụ thuộc nhau có thể chạy cùng lúc
— nếu còn máy.

**Bước** là một việc bên trong một stage. Các bước chạy **nối tiếp** trên đúng
một máy, nên chia một stage thành mười bước không làm nó nhanh hơn một chút nào.

Hệ quả: tách việc thành nhiều stage là cách DUY NHẤT để việc chạy song song, và
gộp việc vào nhiều bước của một stage là cách để chúng dùng chung một máy. Level
này chưa có sức ép nào để chọn bên nào — cả hai cách đều về đích cùng lúc. Từ
C03 trở đi thì không.

\`clone\` là stage đầu tiên của gần như mọi đường ống: nó lấy mã nguồn về máy
chạy. Các stage sau cần mã đó, nên chúng phải đợi nó.`,
    cheatsheet: [
      {
        where: 'yaml',
        snippet: `jobs:
  clone:
    steps:
      - id: tai-ma`,
        explain: 'Mỗi khoá dưới `jobs` là một stage, và tên khoá là mã định danh của nó. Thứ tự viết chỉ để đọc — thứ tự chạy do `needs` quyết định.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  clone:
    steps:
      - id: tai-ma
  kiem-tra:
    needs:
      - clone
    steps:
      - id: chay-test`,
        explain: 'Stage `kiem-tra` chỉ bắt đầu khi `clone` đã xong. Đây là cạnh của đồ thị, và là thứ level này yêu cầu.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  kiem-tra:
    steps:
      - id: cai-goi
      - id: chay-test`,
        explain: 'Các bước của một stage chạy nối tiếp trên cùng một máy. Giữ đúng `id` của bước (`tai-ma`, `cai-goi`, `chay-test`) — bước mang id lạ chạy 0 tick và không đo được gì.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  clone:
    runs-on: linux
    steps:
      - id: tai-ma`,
        explain: 'Hạng máy stage này cần; vắng khoá thì mặc định là `linux`. Số máy mỗi hạng là dữ liệu của level, không nằm trong đường ống bạn viết.',
      },
    ],
    takeaways: [
      'Stage là đơn vị được cấp máy chạy; bước là việc bên trong một stage và luôn chạy nối tiếp.',
      'Chia nhỏ thành nhiều bước không làm nhanh hơn, vì chúng vẫn dùng chung một máy.',
      'Không có `dependsOn` thì hai stage cùng khởi động ở tick 0, kể cả khi cái sau cần kết quả của cái trước.',
    ],
    pitfalls: [
      'Tưởng nhiều bước nghĩa là chạy song song. Nó hấp dẫn vì danh sách bước nhìn giống một danh sách việc độc lập, nhưng máy chạy chỉ có một và nó làm lần lượt.',
      'Bỏ `dependsOn` vì "stage viết sau thì chạy sau". Thứ tự trong danh sách chỉ để người đọc; bộ xếp lịch không đọc nó.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Hai stage, việc cài gói nằm trong bước',
    stages: [
      {
        id: 'clone',
        kind: 'clone',
        name: 'Tải mã nguồn',
        dependsOn: [],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'tai-ma',
            name: 'Tải mã nguồn về máy chạy',
            durationTicks: 3,
            blocking: true,
            produces: ['ma-nguon'],
          },
        ],
      },
      {
        id: 'kiem-tra',
        kind: 'unit-test',
        name: 'Chạy test',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'cai-goi',
            name: 'Cài gói phụ thuộc',
            durationTicks: 4,
            blocking: true,
            requires: ['ma-nguon'],
          },
          {
            id: 'chay-test',
            name: 'Chạy bộ test đơn vị',
            durationTicks: 5,
            blocking: true,
            requires: ['ma-nguon'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Ba stage, việc cài gói đứng riêng',
    stages: [
      {
        id: 'clone',
        kind: 'clone',
        name: 'Tải mã nguồn',
        dependsOn: [],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'tai-ma',
            name: 'Tải mã nguồn về máy chạy',
            durationTicks: 3,
            blocking: true,
            produces: ['ma-nguon'],
          },
        ],
      },
      {
        id: 'chuan-bi',
        kind: 'build',
        name: 'Cài gói phụ thuộc',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'cai-goi',
            name: 'Cài gói phụ thuộc',
            durationTicks: 4,
            blocking: true,
            requires: ['ma-nguon'],
          },
        ],
      },
      {
        id: 'kiem-tra',
        kind: 'unit-test',
        name: 'Chạy test',
        dependsOn: ['chuan-bi'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'chay-test',
            name: 'Chạy bộ test đơn vị',
            durationTicks: 5,
            blocking: true,
            requires: ['ma-nguon'],
          },
        ],
      },
    ],
  },
};
