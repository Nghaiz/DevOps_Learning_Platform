import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel } from '../contract.ts';

/**
 * C12 — **ma trận: quạt một stage ra nhiều thực thể**.
 *
 * Đường ống ban đầu kiểm thử ba phiên bản thời gian chạy bằng **ba bước nối
 * tiếp trong cùng một stage**. Nó đúng, và nó chậm gấp ba một cách không cần
 * thiết: các bước chạy tuần tự trên CÙNG một máy chạy, nên dù dàn máy có rảnh
 * bao nhiêu thì ba lần kiểm thử vẫn xếp hàng sau nhau.
 *
 * Đó chính là bài C03 nhìn từ phía ngược lại: máy chạy được cấp cho **stage**,
 * không cho bước. Muốn song song thật thì phải có nhiều THỰC THỂ stage.
 *
 * ## Hai lời giải, hai cách sinh ra ba thực thể
 *
 * - `solutionWorkflow` — **quạt bằng `fanOut`**: một stage, một trục
 *   `phien-ban` ba giá trị. Ba thực thể, ba máy chạy, ba chuỗi rút ngẫu nhiên
 *   riêng. Thêm phiên bản thứ tư là thêm một chuỗi vào mảng `values`.
 * - `altSolutionWorkflow` — **ba stage chép tay**: `kiem-thu-ban-18/20/22`, mỗi
 *   cái phụ thuộc `bien-dich`. Cùng độ song song, cùng tổng runner-phút, cùng
 *   lead time.
 *
 * Hai đường cho ra ba con số trục giống nhau — và đó là điều đáng nói: engine
 * chấm theo KẾT QUẢ, nên cách chép tay không bị phạt. Cái giá của nó nằm ở chỗ
 * khác và level nói ra bằng một mục tiêu THƯỞNG: `stageCountAtMost { max: 3 }`
 * chỉ đường quạt mới đạt. Ba stage chép tay là ba chỗ phải sửa khi đổi một
 * tham số, và số đó lớn dần theo mỗi trục bạn thêm vào.
 */
export const c12: CicdLevel = {
  id: 'cicd-c12-ma-tran-quat-ra',
  chapter: 'ci',
  title: 'Ba phiên bản, ba lần chờ',
  mission: 'Kiểm thử cả ba phiên bản thời gian chạy trong dưới 200 giây lead time.',
  brief: `Thư viện này phải chạy được trên ba phiên bản thời gian chạy, nên bộ kiểm thử
chạy ba lần. Hiện ba lần đó là ba bước nối tiếp nhau trong cùng một stage.

Các bước của một stage chạy tuần tự trên cùng một máy chạy. Dàn máy có bốn chỗ
và đang rảnh ba, nhưng stage kiểm thử không có cách nào dùng tới chúng: máy chạy
được cấp cho stage, không cho bước.

Hai mươi bốn tick kiểm thử đang xếp hàng sau nhau. Chúng không phụ thuộc gì vào
nhau cả.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Ba phiên bản chạy nối tiếp',
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
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu',
        kind: 'unit-test',
        name: 'Kiểm thử ba phiên bản',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'kiem-thu-ban-18',
            name: 'Kiểm thử trên bản 18',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
          {
            id: 'kiem-thu-ban-20',
            name: 'Kiểm thử trên bản 20',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
          {
            id: 'kiem-thu-ban-22',
            name: 'Kiểm thử trên bản 22',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 4 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 30 },
      { id: 'c3', tick: 60 },
    ],
  },
  evaluation: { baseSeed: 120_201, passes: 20 },
  editable: ['fan-out', 'stages', 'edges'],
  allowedKinds: null,
  objectives: [
    {
      id: 'ba-ban-chay-song-song',
      label: 'Lead time dưới 200 giây — ba phiên bản không còn xếp hàng sau nhau',
      check: 'leadTimeUnder',
      args: { seconds: 200 },
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
      id: 'khong-lam-them-viec',
      label: 'Tổng runner-phút không tăng — song song, không phải làm thêm',
      check: 'runnerMinutesUnder',
      args: { minutes: 17 },
      required: true,
    },
    {
      id: 'mot-cho-khai-bao',
      label: 'THƯỞNG: cả ba phiên bản khai ở MỘT chỗ — nhiều nhất 3 stage',
      check: 'stageCountAtMost',
      args: { max: 3 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 120201`, 20 lượt: cả hai lời giải cho
  // lead 160s / 14.2 commit-giờ / 16.00 runner-phút — bằng nhau ở cả ba trục,
  // đúng như thiết kế. Ban đầu: 320s / 11.7 / 16.00 (cùng runner-phút, gấp đôi
  // lead — đây là cặp số nói rõ nhất rằng ① và ③ không suy ra được từ nhau).
  thresholds: {
    parLeadSeconds: 160,
    budgetLeadSeconds: 200,
    parThroughputPerHour: 14,
    minThroughputPerHour: 13,
    parRunnerMinutes: 16,
    budgetRunnerMinutes: 17,
    minGreenRate: 1,
  },
  hints: [
    'Ba bước trong một stage chạy tuần tự trên một máy. Ba stage thì chạy trên ba máy.',
    'Dàn máy có bốn chỗ; hiện chỉ một chỗ được dùng suốt 24 tick kiểm thử.',
    '`fanOut` quạt một stage ra nhiều thực thể, mỗi thực thể chiếm một máy riêng.',
    'Một trục `{ name: "phien-ban", values: ["18", "20", "22"] }` cho ra đúng ba thực thể.',
  ],
  teaching: {
    primer: `Song song trên giấy không phải song song trên máy, và chỗ hai thứ đó tách nhau
là ranh giới **stage / bước**.

Máy chạy được cấp cho stage. Mọi bước bên trong một stage dùng chung đúng một
máy đó và chạy lần lượt. Nên viết ba lần kiểm thử thành ba bước là tuyên bố
"chúng phải chạy nối tiếp", dù bạn không có ý đó.

Muốn ba thứ chạy cùng lúc thì phải có ba **thực thể stage**. Có hai cách: khai
ba stage, hoặc khai một stage rồi quạt nó ra bằng một ma trận.

Quạt ra không làm tổng công việc ít đi — vẫn 24 tick runner. Nó chỉ đổi 24 tick
nối tiếp lấy 8 tick trên ba máy. Trục lead time đi xuống, trục runner-phút đứng
yên, và đó là một trong những chỗ ba trục tách nhau rõ nhất trong cả chương.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'bien-dich', steps: ['bien-dich-ma'] },
          { id: 'kiem-thu', dependsOn: ['bien-dich'], fanOut: { axes: [{ name: 'phien-ban', values: ['18', '20', '22'] }] }, steps: ['kiem-thu-ban'] },
        ]),
        explain: 'Quạt stage thành ba thực thể chạy song song, mỗi thực thể chiếm một máy riêng. Lead time giảm, runner-phút đứng yên — vẫn đúng 24 tick việc.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'bien-dich', steps: ['bien-dich-ma'] },
          { id: 'kiem-thu-ban-18', dependsOn: ['bien-dich'], steps: ['kiem-thu-ban-18'] },
          { id: 'kiem-thu-ban-20', dependsOn: ['bien-dich'], steps: ['kiem-thu-ban-20'] },
          { id: 'kiem-thu-ban-22', dependsOn: ['bien-dich'], steps: ['kiem-thu-ban-22'] },
        ]),
        explain: 'Cách thứ hai: ba stage riêng, mỗi stage một bước, cũng chiếm ba máy cùng lúc. Stage tự thêm phải khai hạng máy `chung` như trong ví dụ — vắng dòng đó thì bộ đọc mặc định `linux`, hạng máy level này không có.',
      },
    ],
    takeaways: [
      'Bước chạy tuần tự trong một stage; muốn song song thì phải tách thành nhiều thực thể stage.',
      'Ma trận quạt một khai báo ra N thực thể, mỗi thực thể chiếm máy riêng và rút xúc xắc riêng.',
      'Quạt ra làm lead time ngắn lại mà không làm tổng runner-phút giảm — hai trục khác nhau.',
      'Chép tay N stage cho cùng kết quả đo, và cho bạn N chỗ phải sửa ở lần đổi tham số tiếp theo.',
    ],
    pitfalls: [
      'Tin rằng dàn máy rảnh thì mọi thứ tự chạy song song — nó rảnh, nhưng không stage nào đang xin dùng.',
      'Quạt ra nhiều thực thể hơn số máy có — chúng vẫn chạy, chỉ là xếp hàng, và bạn mất đúng cái vừa mua.',
      'Nghĩ quạt ra làm giảm runner-phút — tổng công việc không đổi, chỉ thời gian chờ đổi.',
    ],
  },
  theoryId: '09-ma-tran',
  solutionWorkflow: {
    name: 'Một stage, một ma trận ba giá trị',
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
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu',
        kind: 'unit-test',
        name: 'Kiểm thử ba phiên bản',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        fanOut: { axes: [{ name: 'phien-ban', values: ['18', '20', '22'] }] },
        steps: [
          {
            id: 'kiem-thu-ban',
            name: 'Kiểm thử trên một phiên bản',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Ba stage khai riêng',
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
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu-ban-18',
        kind: 'unit-test',
        name: 'Kiểm thử trên bản 18',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'kiem-thu-ban-18',
            name: 'Kiểm thử trên bản 18',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu-ban-20',
        kind: 'unit-test',
        name: 'Kiểm thử trên bản 20',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'kiem-thu-ban-20',
            name: 'Kiểm thử trên bản 20',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu-ban-22',
        kind: 'unit-test',
        name: 'Kiểm thử trên bản 22',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'kiem-thu-ban-22',
            name: 'Kiểm thử trên bản 22',
            durationTicks: 8,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
};
