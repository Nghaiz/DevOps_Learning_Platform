import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel } from '../contract.ts';

/**
 * C13 — **fan-in: một stage gom kết quả của nhiều nhánh**.
 *
 * C12 vừa quạt một stage ra ba thực thể. Level này hỏi câu tiếp theo, và là câu
 * mà người ta hay quên: **ai chờ ba thực thể đó?**
 *
 * `xuat-ban` hiện phụ thuộc `bien-dich`, nên nó chạy SONG SONG với ma trận kiểm
 * thử. Bước bên trong nó cần `bao-cao-kiem-thu` — thứ do các thực thể ma trận
 * sản xuất — nên nó đỏ tất định với `missing-output`. Và đó là cách may mắn:
 * nếu bước xuất bản không đòi báo cáo, đường ống sẽ XANH trong khi vẫn phát
 * hành trước lúc biết kết quả kiểm thử. Một lỗi đỏ còn dạy được; một lỗi xanh
 * thì không.
 *
 * Luật engine làm fan-in hoạt động chỉ gồm một câu: một stage phụ thuộc vào một
 * stage đã quạt thì phụ thuộc vào **TẤT CẢ** thực thể của nó. Không có cú pháp
 * riêng cho fan-in — một cạnh là đủ.
 *
 * ## Hai lời giải
 *
 * - `solutionWorkflow` — **cổng tổng hợp tường minh**: thêm stage `cong-tong-hop`
 *   phụ thuộc `kiem-thu`, và `xuat-ban` phụ thuộc cổng đó. Chỗ gom là một node
 *   nhìn thấy được trên đồ thị, và về sau có chỗ để treo thêm điều kiện phát
 *   hành mà không đụng vào stage xuất bản.
 * - `altSolutionWorkflow` — **gom thẳng**: `xuat-ban` phụ thuộc `kiem-thu`. Ít
 *   hơn một stage, ít hơn một tick lead time, và đồ thị phẳng hơn.
 *
 * Cả hai đều thoả `stageDependsOn { xuat-ban, kiem-thu }` — vị từ tính bắc cầu
 * nên cổng tổng hợp không làm mất quan hệ đó. Mục tiêu THƯỞNG
 * `stageCountAtMost { max: 4 }` chỉ đường gom thẳng đạt: cổng tường minh có giá
 * của nó, và level nói ra cái giá đó thay vì giả vờ nó miễn phí.
 */
export const c13: CicdLevel = {
  id: 'cicd-c13-gom-ket-qua-nhieu-nhanh',
  chapter: 'ci',
  title: 'Xuất bản xong trước khi kiểm thử xong',
  mission: 'Làm stage xuất bản chờ ĐỦ cả ba nhánh kiểm thử rồi mới chạy.',
  brief: `Ma trận kiểm thử quạt ra ba nhánh và chạy song song — phần đó đã đúng. Stage
xuất bản thì đang phụ thuộc vào biên dịch, nên nó khởi động cùng lúc với ba
nhánh kiểm thử thay vì sau chúng.

Bước xuất bản cần bản báo cáo kiểm thử để đính kèm. Ở thời điểm nó chạy, chưa
nhánh nào sản xuất ra thứ đó, nên nó đỏ — lần nào cũng đỏ, vì lý do cấu trúc chứ
không phải may rủi.

Hãy mừng vì nó đỏ. Nếu bước xuất bản không đòi báo cáo, đường ống sẽ xanh trơn
tru trong khi vẫn phát hành trước khi biết kiểm thử nói gì.

Một stage phụ thuộc vào một stage đã quạt sẽ chờ tất cả thực thể của nó. Không
cần cú pháp gì đặc biệt cho chuyện đó.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Xuất bản không chờ ai',
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
            produces: ['bao-cao-kiem-thu'],
          },
        ],
      },
      {
        id: 'xuat-ban',
        kind: 'publish',
        name: 'Xuất bản gói',
        // ⚠ Phụ thuộc sai chỗ: chạy song song với ma trận thay vì sau nó.
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'gom-bao-cao',
            name: 'Gom báo cáo rồi xuất bản',
            durationTicks: 4,
            blocking: true,
            requires: ['bao-cao-kiem-thu', 'goi-nhi-phan'],
            produces: ['goi-da-xuat-ban'],
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
  evaluation: { baseSeed: 130_301, passes: 20 },
  editable: ['edges', 'stages'],
  allowedKinds: null,
  objectives: [
    {
      id: 'xuat-ban-cho-kiem-thu',
      label: 'Stage xuất bản phụ thuộc (kể cả bắc cầu) vào ma trận kiểm thử',
      check: 'stageDependsOn',
      args: { stage: 'xuat-ban', on: 'kiem-thu' },
      required: true,
    },
    {
      id: 'khong-thieu-bao-cao',
      label: 'Không lần đỏ nào vì thiếu sản phẩm đầu vào',
      check: 'noFailureCause',
      args: { cause: 'missing-output' },
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
      id: 'van-du-nhanh',
      label: 'Lead time không vượt 250 giây',
      check: 'leadTimeUnder',
      args: { seconds: 250 },
      required: true,
    },
    {
      id: 'do-thi-phang',
      label: 'THƯỞNG: gom thẳng, không thêm stage trung gian — nhiều nhất 4 stage',
      check: 'stageCountAtMost',
      args: { max: 4 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 130301`, 20 lượt: gom thẳng cho lead
  // 200s / 13.5 commit-giờ / 18.00 runner-phút; cổng tổng hợp cho 210s / 13.3 /
  // 18.50 — một tick lead và nửa runner-phút là giá của node trung gian.
  thresholds: {
    parLeadSeconds: 200,
    budgetLeadSeconds: 250,
    parThroughputPerHour: 13.5,
    minThroughputPerHour: 12,
    parRunnerMinutes: 18,
    budgetRunnerMinutes: 19,
    minGreenRate: 1,
  },
  hints: [
    'Đọc nguyên nhân lần đỏ: bước xuất bản đang thiếu một sản phẩm, không phải gặp xui.',
    'Stage xuất bản đang phụ thuộc vào biên dịch, nên nó khởi động cùng lúc với ba nhánh kiểm thử.',
    'Một cạnh tới stage đã quạt là đủ — engine tự bắt chờ tất cả thực thể của nó.',
    'Có thể nối thẳng, hoặc chèn một cổng tổng hợp ở giữa; cả hai đều gom đủ ba nhánh.',
  ],
  teaching: {
    primer: `Quạt ra là nửa đầu của câu chuyện. Nửa sau là gom lại.

Khi một stage được quạt thành N thực thể, mọi stage phụ thuộc vào nó sẽ chờ **cả
N**, không phải cái xong đầu tiên. Đó là toàn bộ cơ chế fan-in: một cạnh, không
có cú pháp riêng, không có danh sách phải liệt kê tay.

Cái bẫy nằm ở chỗ khác: dễ quên rằng stage cuối cùng đang phụ thuộc vào một thứ
NẰM TRƯỚC ma trận chứ không phải chính ma trận. Đồ thị vẫn hợp lệ, không có chu
trình, không có cạnh chết. Nó chỉ đơn giản là không chờ ai.

Ở level này chuyện đó lộ ra dưới dạng một lần đỏ, vì bước xuất bản có đòi báo
cáo kiểm thử. Ngoài đời thì thường không — và khi đó đường ống xanh trong khi
phát hành trước lúc biết kết quả. Hãy để những stage cuối đòi đúng thứ chúng
cần; đó là cách bắt một cạnh thiếu tự khai báo.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'bien-dich', steps: ['bien-dich-ma'] },
          { id: 'kiem-thu', dependsOn: ['bien-dich'], fanOut: { axes: [{ name: 'phien-ban', values: ['18', '20', '22'] }] }, steps: ['kiem-thu-ban'] },
          { id: 'xuat-ban', dependsOn: ['kiem-thu'], steps: ['gom-bao-cao'] },
        ]),
        explain: 'Một cạnh tới stage đã quạt là đủ: `xuat-ban` chờ CẢ ba thực thể của `kiem-thu` xong, không phải thực thể xong đầu tiên, nên báo cáo mà bước xuất bản đòi đã có đủ.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'kiem-thu', fanOut: { axes: [{ name: 'phien-ban', values: ['18', '20', '22'] }] }, steps: ['kiem-thu-ban'] },
          { id: 'cong-tong-hop', dependsOn: ['kiem-thu'], steps: ['tong-hop-ket-qua'] },
          { id: 'xuat-ban', dependsOn: ['cong-tong-hop'], steps: ['gom-bao-cao'] },
        ]),
        explain: 'Hoặc chèn một stage cổng gom kết quả ba nhánh rồi mới xuất bản. Cổng là một stage thật: tốn thêm một chỗ máy và một tick lead time.',
      },
    ],
    takeaways: [
      'Một cạnh tới stage đã quạt là fan-in đầy đủ: chờ tất cả thực thể, không cần cú pháp riêng.',
      'Một stage cuối phụ thuộc nhầm vào nhánh TRƯỚC ma trận vẫn cho một đồ thị hợp lệ — nó chỉ không chờ ai.',
      'Bắt stage cuối `requires` đúng sản phẩm nó cần là cách rẻ nhất để một cạnh thiếu tự lộ ra.',
      'Cổng tổng hợp tường minh và gom thẳng cho cùng kết quả đo; khác nhau ở chỗ có node để treo điều kiện về sau hay không.',
    ],
    pitfalls: [
      'Nối xuất bản vào MỘT nhánh ma trận — không làm được ở đây (cạnh trỏ tới stage, không tới thực thể), và ngoài đời thì đó đúng là cách người ta phát hành khi hai nhánh kia còn đang chạy.',
      'Bỏ `requires` ở bước xuất bản cho hết đỏ — đường ống xanh ngay, và bạn vừa xoá cái duy nhất đang tố cáo cạnh thiếu.',
      'Thêm cổng tổng hợp ở mọi chỗ cho "đẹp đồ thị" — mỗi cổng là một stage thật, tốn một chỗ máy chạy và một tick lead time.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Cổng tổng hợp tường minh',
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
            produces: ['bao-cao-kiem-thu'],
          },
        ],
      },
      {
        id: 'cong-tong-hop',
        kind: 'gate',
        name: 'Cổng tổng hợp kết quả',
        dependsOn: ['kiem-thu'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'tong-hop-ket-qua',
            name: 'Tổng hợp kết quả ba nhánh',
            durationTicks: 1,
            blocking: true,
            requires: ['bao-cao-kiem-thu'],
            produces: ['ket-qua-tong-hop'],
          },
        ],
      },
      {
        id: 'xuat-ban',
        kind: 'publish',
        name: 'Xuất bản gói',
        dependsOn: ['cong-tong-hop'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'gom-bao-cao',
            name: 'Gom báo cáo rồi xuất bản',
            durationTicks: 4,
            blocking: true,
            requires: ['bao-cao-kiem-thu', 'goi-nhi-phan'],
            produces: ['goi-da-xuat-ban'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Gom thẳng, không cổng trung gian',
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
            produces: ['bao-cao-kiem-thu'],
          },
        ],
      },
      {
        id: 'xuat-ban',
        kind: 'publish',
        name: 'Xuất bản gói',
        dependsOn: ['kiem-thu'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'gom-bao-cao',
            name: 'Gom báo cáo rồi xuất bản',
            durationTicks: 4,
            blocking: true,
            requires: ['bao-cao-kiem-thu', 'goi-nhi-phan'],
            produces: ['goi-da-xuat-ban'],
          },
        ],
      },
    ],
  },
};
