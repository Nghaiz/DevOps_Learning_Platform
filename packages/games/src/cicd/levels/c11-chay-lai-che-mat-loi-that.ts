import type { CicdLevel } from '../contract.ts';

/**
 * C11 — **chạy lại che mất một lỗi thật**.
 *
 * Đây là level đắt nhất của chương CI, và nó chỉ đứng vững nhờ một trường duy
 * nhất trong hợp đồng: `FlakeSpec.nature`.
 *
 * Hai loại đỏ ngẫu nhiên **trông giống hệt nhau trong lúc chạy**:
 *
 * - `'infra'` — máy ảo khởi động chậm. Thử lại là việc ĐÚNG (bài C09).
 * - `'latent-defect'` — bước đó đang bắt được một lỗi THẬT, chỉ là lỗi đó phụ
 *   thuộc thứ tự luồng nên không hiện ra ở mọi lượt. Thử lại vẫn làm nó xanh,
 *   và mỗi lần như thế là một khiếm khuyết đi thẳng xuống bản đã phát hành.
 *
 * Người chơi gọi cả hai là "flaky", bấm chạy lại, và **chỉ bảng tổng kết sau
 * lượt chấm mới nói cho họ biết họ vừa che cái gì**.
 *
 * ## Level này dựng ra sao để khái niệm LỘ RA
 *
 * `kiem-thu-tich-hop` chứa ĐÚNG HAI bước hay hỏng, một loại mỗi bước, và cả
 * stage đang có `retries: 3`. Đó là hình dạng bẫy: một con số duy nhất đang
 * phục vụ đúng cho bước này và sai cho bước kia, nên không có cách nào sửa nó
 * mà không phải đọc `nature` của từng bước.
 *
 * Hệ quả đo được, và đây là điểm mấu chốt:
 *
 * | Workflow | `greenRate` | khiếm khuyết lọt xuống |
 * |---|---|---|
 * | ban đầu (`retries: 3`) | ≈ 1.00 — trông hoàn hảo | **> 0** |
 * | đã sửa | thấp hơn hẳn | **0** |
 *
 * Bản HỎNG có tỷ lệ xanh CAO HƠN cả hai lời giải. Người chơi phải chấp nhận một
 * con số xấu đi để đổi lấy một đường ống thành thật, và đó chính là bài học —
 * nó không phát biểu được bằng bất kỳ cách nào khác ngoài cách bắt họ trả giá.
 *
 * Vì thế `greenRateAtLeast` ở đây đặt ở **0.60**, không phải 1. Một ngưỡng tỷ lệ
 * xanh cao sẽ biến level thành không giải được, và tệ hơn: nó sẽ dạy đúng cái
 * phản xạ mà level tồn tại để phá.
 *
 * ## Vì sao `editable` KHÔNG có `'blocking'`
 *
 * Đặt `blocking: false` cho stage kiểm thử cũng làm mọi lượt xanh và cũng không
 * để lại lần thử-lại-che-lỗi nào. Nó là một lối tắt đi vòng qua bài học: lỗi
 * vẫn lọt xuống y hệt, chỉ là lọt qua một cánh cửa khác. Khoá `blocking` khỏi
 * danh sách sửa được là cách đóng lối đó bằng CẤU TRÚC, thay vì bằng một ô
 * nghiệm thu thêm vào mà người chơi sẽ đọc như một luật tuỳ tiện.
 *
 * ## Hai lời giải
 *
 * - `solutionWorkflow` — **thôi thử lại**: `retries: 0` trên
 *   `kiem-thu-tich-hop`. Một dòng sửa. Đổi lại, bước khởi động môi trường (đỏ
 *   vì hạ tầng) cũng mất luôn lưới an toàn, nên tỷ lệ xanh tụt thêm một chút.
 * - `altSolutionWorkflow` — **tách theo bản chất của lỗi**: `kiem-thu-tich-hop`
 *   giữ lại bước hạ tầng cùng `retries: 2`, còn bước khẳng định đua luồng
 *   chuyển sang stage riêng `khang-dinh-dua-luong` với `retries: 0`. Thử lại
 *   sống đúng chỗ nó đúng và biến mất đúng chỗ nó sai.
 *
 * Đường thứ hai giữ được tỷ lệ xanh cao hơn với cùng số khiếm khuyết lọt xuống
 * là 0 — và đó là lý do mục tiêu THƯỞNG chấm theo tỷ lệ xanh chứ không theo số
 * stage.
 */
export const c11: CicdLevel = {
  id: 'cicd-c11-chay-lai-che-mat-loi-that',
  chapter: 'ci',
  title: 'Bấm chạy lại lần nữa là nó xanh thôi',
  mission: 'Không để lần đỏ nào do lỗi thật bị một lần thử lại che đi.',
  brief: `Đường ống này xanh gần như mọi lượt. Nó cũng đang đẩy lỗi xuống production đều
đặn, và hai chuyện đó không mâu thuẫn nhau.

Stage kiểm thử tích hợp có \`retries: 3\`. Bên trong nó có hai bước hay hỏng.
Một bước hỏng vì môi trường chưa sẵn sàng — thử lại là đúng. Bước còn lại hỏng
vì một cuộc đua luồng có thật trong mã: nó chỉ lộ ra đôi lúc, và mỗi lần thử lại
làm nó xanh là một lần cái lỗi đó được cấp hộ chiếu đi tiếp.

Bảng tổng kết sau lượt chấm phân biệt được hai loại đỏ này. Trong lúc chạy thì
không — chúng trông y hệt nhau, đúng như ngoài đời.

Tỷ lệ xanh của bạn SẼ tụt sau khi sửa. Đó không phải tác dụng phụ, đó là cái giá
thật của việc thôi nói dối về chất lượng.`,
  difficulty: 'advanced',
  initialWorkflow: {
    name: 'Đường ống xanh nhờ bấm chạy lại',
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
            durationTicks: 8,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu-tich-hop',
        kind: 'integration-test',
        name: 'Kiểm thử tích hợp',
        dependsOn: ['bien-dich'],
        blocking: true,
        // ⚠ Một con số phục vụ hai bước có bản chất lỗi trái ngược nhau.
        retries: 3,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dung-moi-truong',
            name: 'Dựng môi trường tích hợp',
            durationTicks: 5,
            blocking: true,
            flake: { rate: 0.03, nature: 'infra' },
          },
          {
            id: 'khang-dinh-dua-luong',
            name: 'Khẳng định không có đua luồng',
            durationTicks: 9,
            blocking: true,
            requires: ['goi-nhi-phan'],
            flake: { rate: 0.05, nature: 'latent-defect' },
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
      { id: 'c2', tick: 14 },
      { id: 'c3', tick: 28 },
    ],
  },
  evaluation: { baseSeed: 110_011, passes: 20 },
  // ⛔ Cố ý KHÔNG có 'blocking' — xem khối chú thích đầu file.
  editable: ['retries', 'stages', 'edges'],
  allowedKinds: null,
  objectives: [
    {
      id: 'khong-che-loi-nao',
      label: 'Không lần đỏ do lỗi thật nào bị một lần thử lại che đi',
      check: 'escapedDefectsAtMost',
      args: { max: 0 },
      required: true,
    },
    {
      id: 'van-con-dung-duoc',
      label: 'Tỷ lệ lượt xanh vẫn ít nhất 60% — thành thật, chứ không phải bỏ mặc',
      check: 'greenRateAtLeast',
      args: { rate: 0.6 },
      required: true,
    },
    {
      id: 'khong-cham-hon',
      label: 'Lead time không vượt 400 giây',
      check: 'leadTimeUnder',
      args: { seconds: 400 },
      required: true,
    },
    {
      id: 'giu-duoc-luoi-an-toan',
      label: 'THƯỞNG: giữ tỷ lệ xanh từ 80% trở lên bằng cách thử lại ĐÚNG chỗ',
      check: 'greenRateAtLeast',
      args: { rate: 0.8 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 110011`, 20 lượt: ban đầu cho tỷ lệ xanh
  // 1.00 với **7 khiếm khuyết lọt xuống**; thôi-thử-lại cho 0.75 với 0; thử-lại-
  // đúng-chỗ cho 0.80 với 0. Cả ba cùng lead 240s / 20.8 commit-giờ, nên sàn tỷ
  // lệ xanh 0.60 là thứ duy nhất phải nới — và nới đúng bằng cái giá của bài học.
  thresholds: {
    parLeadSeconds: 240,
    parThroughputPerHour: 21,
    minThroughputPerHour: 18,
    budgetLeadSeconds: 300,
    parRunnerMinutes: 12,
    budgetRunnerMinutes: 14,
    minGreenRate: 0.6,
  },
  hints: [
    'Bảng tổng kết sau lượt chấm ghi bản chất của từng lần đỏ. Đọc nó trước khi đụng vào retry.',
    'Một trong hai bước hay hỏng đang bắt được một lỗi thật. Thử lại nó không sửa gì, chỉ làm nó im.',
    '`retries` đặt ở tầng stage, nên một con số duy nhất đang áp cho cả bước nên thử lại lẫn bước không nên.',
    'Tách hai bước thành hai stage thì mỗi stage có con số riêng của nó.',
  ],
  teaching: {
    primer: `Không phải mọi lần đỏ ngẫu nhiên đều là đỏ giả.

Một bước kiểm thử đỏ 5% số lần có thể là máy ảo chậm — hoặc có thể là một cuộc
đua luồng có thật, chỉ thua cuộc 5% số lần. Trong lúc chạy, hai thứ đó phát ra
đúng một tín hiệu: một ô đỏ.

Thử lại xoá ô đỏ đó trong cả hai trường hợp. Ở trường hợp thứ nhất bạn vừa cứu
một lượt chạy. Ở trường hợp thứ hai bạn vừa phát hành một lỗi, và bạn còn xoá
luôn cái bằng chứng duy nhất cho thấy nó tồn tại.

Đường ống càng "ổn định" nhờ thử lại thì càng ít nói cho bạn biết sự thật. Một
tỷ lệ xanh 100% đạt được bằng cách bấm chạy lại không phải là chất lượng — nó là
một cái đồng hồ đã bị tháo pin.

Sau khi sửa, tỷ lệ xanh của bạn sẽ tụt. Con số mới đó mới là con số thật.`,
    cheatsheet: [
      {
        where: 'panel',
        control: 'retries',
        label: 'Chạy lại khi hỏng',
        explain: 'Một con số áp cho cả stage: bước dựng môi trường đỏ vì hạ tầng (thử lại là đúng), còn bước khẳng định đua luồng đỏ vì một lỗi THẬT chỉ lộ đôi lúc — thử lại xoá luôn bằng chứng của nó.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  bien-dich:
    runs-on: chung
    steps:
      - id: bien-dich-ma
  kiem-thu-tich-hop:
    runs-on: chung
    needs:
      - bien-dich
    steps:
      - id: dung-moi-truong
  khang-dinh-dua-luong:
    runs-on: chung
    needs:
      - kiem-thu-tich-hop
    steps:
      - id: khang-dinh-dua-luong`,
        explain: 'Tách hai bước thành hai stage thì mỗi stage có số lần thử lại riêng: thử lại việc dựng môi trường, để 0 cho stage bắt lỗi thật. Tỷ lệ xanh sẽ tụt — con số mới đó mới là con số thật.',
      },
    ],
    takeaways: [
      'Thử lại không phân biệt được đỏ giả với lỗi thật — nó xoá cả hai như nhau.',
      'Mỗi lần một lỗi thật bị thử lại che đi là một khiếm khuyết được phát hành cùng bản dựng.',
      'Một tỷ lệ xanh cao đạt được bằng thử lại là một phép đo đã hỏng, không phải một thành tích.',
      'Thử lại là công cụ đúng cho hỏng hóc hạ tầng và là công cụ sai cho mọi thứ còn lại; đặt nó theo bản chất của lỗi, không theo stage.',
    ],
    pitfalls: [
      'Nâng `retries` lên nữa khi thấy còn đỏ — hấp dẫn vì nó luôn có tác dụng, và đó chính là vấn đề: nó có tác dụng cả với những lần đỏ mà bạn cần nhìn thấy.',
      'Cho stage kiểm thử thôi chặn lượt chạy — mọi ô sẽ xanh, lỗi vẫn lọt xuống y hệt, chỉ là qua một cửa khác. Level này khoá luôn đường đó.',
      'Coi tỷ lệ xanh tụt đi là dấu hiệu mình sửa sai — nó là dấu hiệu bạn vừa thôi làm tròn số.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Thôi thử lại stage kiểm thử',
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
            durationTicks: 8,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu-tich-hop',
        kind: 'integration-test',
        name: 'Kiểm thử tích hợp',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dung-moi-truong',
            name: 'Dựng môi trường tích hợp',
            durationTicks: 5,
            blocking: true,
            flake: { rate: 0.03, nature: 'infra' },
          },
          {
            id: 'khang-dinh-dua-luong',
            name: 'Khẳng định không có đua luồng',
            durationTicks: 9,
            blocking: true,
            requires: ['goi-nhi-phan'],
            flake: { rate: 0.05, nature: 'latent-defect' },
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Thử lại theo bản chất của lỗi',
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
            durationTicks: 8,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
            produces: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'kiem-thu-tich-hop',
        kind: 'integration-test',
        name: 'Dựng môi trường tích hợp',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 2,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dung-moi-truong',
            name: 'Dựng môi trường tích hợp',
            durationTicks: 5,
            blocking: true,
            flake: { rate: 0.03, nature: 'infra' },
          },
        ],
      },
      {
        id: 'khang-dinh-dua-luong',
        kind: 'integration-test',
        name: 'Khẳng định không có đua luồng',
        dependsOn: ['kiem-thu-tich-hop'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'khang-dinh-dua-luong',
            name: 'Khẳng định không có đua luồng',
            durationTicks: 9,
            blocking: true,
            requires: ['goi-nhi-phan'],
            flake: { rate: 0.05, nature: 'latent-defect' },
          },
        ],
      },
    ],
  },
};
