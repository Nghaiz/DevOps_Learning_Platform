import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel } from '../contract.ts';

/**
 * C10 — **thử lại chỉ cứu được đỏ giả**.
 *
 * C09 vừa dạy rằng thử lại là công cụ tốt. Level này lập tức cho thấy cái giá
 * của việc dùng nó như một phản xạ: `dong-goi` đỏ vì thiếu một cạnh phụ thuộc —
 * nó cần `goi-nhi-phan` nhưng không phụ thuộc (kể cả bắc cầu) vào stage sản
 * xuất ra thứ đó. Đây là đỏ THẬT (`FailureCause.kind === 'missing-output'`), và
 * nó sẽ đỏ y hệt ở cả bốn lần thử.
 *
 * `retries: 3` biến một stage 6 tick thành 24 tick runner bị đốt, mỗi commit,
 * mỗi lượt — để rồi vẫn đỏ. Đó là lý do trục runner-phút phải hiện thường trực:
 * không có nó, "đặt retry cho chắc" trông như một chiến lược an toàn thay vì
 * một khoản chi phí máy chạy.
 *
 * ## Hai lời giải — hai hình dạng đồ thị khác nhau
 *
 * - `solutionWorkflow` — **cạnh thẳng**: `dong-goi` phụ thuộc `bien-dich`. Đóng
 *   gói chạy SONG SONG với kiểm thử, nên lead time ngắn nhất. Đổi lại, một gói
 *   có thể được đóng từ một bản dựng mà bộ kiểm thử chưa kịp nói gì.
 * - `altSolutionWorkflow` — **cạnh bắc cầu**: `dong-goi` phụ thuộc `kiem-thu`,
 *   và `goi-nhi-phan` tới được qua đường bắc cầu `kiem-thu → bien-dich`. Nối
 *   tiếp, lead time dài hơn, nhưng không gói nào ra đời trước khi kiểm thử xanh.
 *
 * Cả hai đều thoả `stageDependsOn` (vị từ này tính bắc cầu) và đều buộc phải hạ
 * `retries` về 0 — ô nghiệm thu `retriesAtMost` giữ đúng bài học ở lại. Ô THƯỞNG
 * chấm lead time, nên đường song song ăn điểm còn đường nối tiếp thì không: một
 * đánh đổi thật, không phải một lời giải sai.
 */
export const c10: CicdLevel = {
  id: 'cicd-c10-retry-khong-cuu-duoc-do-that',
  chapter: 'ci',
  title: 'Thử lại bốn lần, đỏ bốn lần',
  mission: 'Làm bước đóng gói xanh ngay lần thử đầu tiên, và thôi đốt runner-phút vào việc thử lại.',
  brief: `Ai đó đã đặt \`retries: 3\` cho stage đóng gói vì "nó hay đỏ". Nó vẫn đỏ, bây giờ
đỏ bốn lần thay vì một, và chi phí máy chạy tháng này gấp bốn.

Bước đóng gói cần gói nhị phân do bước biên dịch tạo ra. Nó không phụ thuộc vào
stage biên dịch — kể cả bắc cầu — nên trong lượt chạy của nó, thứ đó chưa bao
giờ tồn tại. Hai stage chạy song song không thấy sản phẩm của nhau, kể cả khi
một cái đã xong trước.

Loại đỏ này không có xác suất. Nó đỏ ở mọi lần thử, vì mọi lần thử đều thiếu
đúng thứ đó.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Đường ống thử lại cho chắc',
    stages: [
      {
        id: 'clone',
        kind: 'clone',
        name: 'Tải mã nguồn',
        dependsOn: [],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'tai-ma-nguon',
            name: 'Tải mã nguồn về máy chạy',
            durationTicks: 2,
            blocking: true,
            produces: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'bien-dich',
        kind: 'build',
        name: 'Biên dịch',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'bien-dich-ma',
            name: 'Biên dịch mã nguồn',
            durationTicks: 10,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu',
        kind: 'unit-test',
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói ảnh container',
        // ⚠ THIẾU cạnh tới `bien-dich`. Bước bên trong cần `goi-nhi-phan`.
        dependsOn: ['clone'],
        blocking: true,
        // ⚠ Và đây là phản xạ sai: thử lại một thứ không thử lại được.
        retries: 3,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dong-goi-anh',
            name: 'Đóng gói ảnh container',
            durationTicks: 6,
            blocking: true,
            requires: ['goi-nhi-phan'],
            produces: ['anh-container'],
          },
        ],
      },
    ],
  },
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 3 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 15 },
      { id: 'c3', tick: 30 },
    ],
  },
  evaluation: { baseSeed: 100_101, passes: 20 },
  editable: ['edges', 'retries'],
  allowedKinds: null,
  objectives: [
    {
      id: 'co-duong-toi-goi-nhi-phan',
      label: 'Stage đóng gói phụ thuộc (kể cả bắc cầu) vào stage biên dịch',
      check: 'stageDependsOn',
      args: { stage: 'dong-goi', on: 'bien-dich' },
      required: true,
    },
    {
      id: 'khong-thieu-san-pham',
      label: 'Không lần đỏ nào vì thiếu sản phẩm đầu vào',
      check: 'noFailureCause',
      args: { cause: 'missing-output' },
      required: true,
    },
    {
      id: 'thoi-thu-lai-vo-ich',
      label: 'Stage đóng gói không còn lần thử lại nào',
      check: 'retriesAtMost',
      args: { stage: 'dong-goi', max: 0 },
      required: true,
    },
    {
      id: 'moi-luot-deu-xanh',
      label: 'Cả ba commit xanh ở mọi lượt chấm',
      check: 'greenRateAtLeast',
      args: { rate: 1 },
      required: true,
    },
    {
      id: 'thoi-dot-runner-phut',
      label: 'Trung bình dưới 15 runner-phút mỗi lượt',
      check: 'runnerMinutesUnder',
      args: { minutes: 15 },
      required: true,
    },
    {
      id: 'dong-goi-song-song',
      label: 'THƯỞNG: lead time dưới 220 giây — đóng gói không chờ kiểm thử',
      check: 'leadTimeUnder',
      args: { seconds: 220 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 100101`, 20 lượt: cạnh thẳng cho lead
  // 200s / 21.6 commit-giờ / 13.00 runner-phút; cạnh bắc cầu cho 260s / 19.3 /
  // 13.00. Workflow ban đầu: 290s / 18.3 / 22.00 và đỏ ở mọi lượt.
  thresholds: {
    parLeadSeconds: 200,
    budgetLeadSeconds: 280,
    parThroughputPerHour: 21,
    minThroughputPerHour: 18,
    parRunnerMinutes: 13,
    budgetRunnerMinutes: 15,
    minGreenRate: 1,
  },
  hints: [
    'Đọc nguyên nhân của lần đỏ trong bảng tổng kết: nó không phải "flake".',
    'Một bước chỉ thấy sản phẩm của những stage mà stage của nó phụ thuộc vào, tính cả bắc cầu.',
    'Thêm cạnh xong thì lần thử đầu tiên đã xanh — số lần thử lại còn lại không còn việc gì để làm.',
    'Hai cách nối: thẳng tới stage biên dịch (đóng gói chạy song song với kiểm thử), hoặc nối sau kiểm thử (chậm hơn, an toàn hơn).',
  ],
  teaching: {
    primer: `Thử lại là một cái búa rất tiện, và nó chỉ đóng được một loại đinh.

Có hai họ nguyên nhân đỏ. Họ thứ nhất là ngẫu nhiên: máy hết bộ nhớ, mạng chớp,
container khởi động chậm. Lần thử sau rút một con xúc xắc mới, nên thử lại có
nghĩa. Họ thứ hai là cấu trúc: thiếu một cạnh phụ thuộc, lấy nhầm một cache đã
ôi, một stage phía trên đã đỏ. Lần thử sau gặp đúng thế giới cũ, nên nó đỏ lại,
và bạn vừa trả tiền cho một bản sao của thất bại.

Chi phí tính được: một stage 6 tick với \`retries: 3\` đốt 24 tick runner mỗi
commit trước khi chịu thua. Nhân với số commit, nhân với số lượt.

Quy tắc đọc: trước khi thêm \`retries\`, hãy hỏi lần thử sau có gì khác lần thử
trước không. Nếu câu trả lời là "không có gì", thử lại chỉ là một cách viết
"tốn gấp bốn" cho gọn.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'bien-dich', steps: ['bien-dich-ma'] },
          { id: 'dong-goi', dependsOn: ['bien-dich'], steps: ['dong-goi-anh'] },
        ]),
        explain: 'Cạnh phụ thuộc cũng là đường duy nhất để thấy sản phẩm của nhau: bước đóng gói cần gói nhị phân của `bien-dich`, nên thiếu cạnh là đỏ thật, không phải đỏ ngẫu nhiên.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'bien-dich', steps: ['bien-dich-ma'] },
          { id: 'kiem-thu', dependsOn: ['bien-dich'], steps: ['chay-kiem-thu'] },
          { id: 'dong-goi', dependsOn: ['kiem-thu'], steps: ['dong-goi-anh'] },
        ]),
        explain: 'Nối sau kiểm thử thay vì song song: `dong-goi` vẫn thấy gói nhị phân qua cạnh bắc cầu. Chậm hơn, nhưng không đóng gói một bản chưa qua kiểm thử.',
      },
      {
        where: 'panel',
        control: 'retries',
        label: 'Chạy lại khi hỏng',
        explain: 'Đặt về 0 cho stage đỏ vì cấu trúc: lần thử sau gặp đúng thế giới cũ, nên 3 lần thử lại chỉ đốt gấp bốn runner-phút rồi vẫn đỏ.',
      },
    ],
    takeaways: [
      'Thử lại chỉ có nghĩa khi lần thử sau gặp một thế giới khác lần thử trước.',
      'Thiếu cạnh phụ thuộc là lỗi cấu trúc: nó đỏ tất định, ở mọi lần thử.',
      'Mỗi lần thử lại đốt trọn runner-phút của cả stage, không phải của riêng bước gãy.',
      'Một stage chỉ thấy sản phẩm của những stage nó phụ thuộc vào, và bắc cầu vẫn tính.',
    ],
    pitfalls: [
      'Nâng `retries` lên 5 vì 3 chưa đủ — hấp dẫn vì với đỏ giả thì tăng số lần thật sự có tác dụng, nên phản xạ đó được thưởng ở chỗ khác và bị phạt ở đây.',
      'Chép bước biên dịch vào thẳng stage đóng gói — hết đỏ, nhưng bạn vừa biên dịch hai lần và trả tiền hai lần.',
      'Giữ `retries: 3` sau khi đã thêm cạnh — vô hại hôm nay, và là một quả mìn cho ngày stage đó đỏ vì lý do khác.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Nối thẳng, đóng gói chạy song song',
    stages: [
      {
        id: 'clone',
        kind: 'clone',
        name: 'Tải mã nguồn',
        dependsOn: [],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'tai-ma-nguon',
            name: 'Tải mã nguồn về máy chạy',
            durationTicks: 2,
            blocking: true,
            produces: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'bien-dich',
        kind: 'build',
        name: 'Biên dịch',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'bien-dich-ma',
            name: 'Biên dịch mã nguồn',
            durationTicks: 10,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu',
        kind: 'unit-test',
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói ảnh container',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dong-goi-anh',
            name: 'Đóng gói ảnh container',
            durationTicks: 6,
            blocking: true,
            requires: ['goi-nhi-phan'],
            produces: ['anh-container'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Nối sau kiểm thử, đường bắc cầu',
    stages: [
      {
        id: 'clone',
        kind: 'clone',
        name: 'Tải mã nguồn',
        dependsOn: [],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'tai-ma-nguon',
            name: 'Tải mã nguồn về máy chạy',
            durationTicks: 2,
            blocking: true,
            produces: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'bien-dich',
        kind: 'build',
        name: 'Biên dịch',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'bien-dich-ma',
            name: 'Biên dịch mã nguồn',
            durationTicks: 10,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu',
        kind: 'unit-test',
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói ảnh container',
        dependsOn: ['kiem-thu'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dong-goi-anh',
            name: 'Đóng gói ảnh container',
            durationTicks: 6,
            blocking: true,
            requires: ['goi-nhi-phan'],
            produces: ['anh-container'],
          },
        ],
      },
    ],
  },
};
