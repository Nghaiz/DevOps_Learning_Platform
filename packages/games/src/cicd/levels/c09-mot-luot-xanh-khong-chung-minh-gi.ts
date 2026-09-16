import type { CicdLevel } from '../contract.ts';

/**
 * C09 — **một lượt xanh không chứng minh gì**.
 *
 * Level này không dạy "flaky test là xấu". Nó dạy một chuyện khó hơn và ít ai
 * nói ra: **cỡ mẫu**. Một bước có `rate: 0.05` sẽ xanh ở phần lớn các lượt, nên
 * bấm chạy một lần rồi kết luận "sửa xong rồi" là một suy luận SAI mà bằng
 * chứng trước mắt hoàn toàn ủng hộ.
 *
 * ## Con số, và vì sao đúng con số đó
 *
 * - `evaluation.passes = 20` (`DEFAULT_EVALUATION_PASSES`).
 * - Một bước duy nhất có `flake { rate: 0.05, nature: 'infra' }`.
 * - Ba commit, nên mỗi lượt chấm rút 3 con xúc xắc độc lập cho bước đó.
 *
 * Một LƯỢT xanh khi cả ba commit qua: `0.95³ ≈ 0.857`. Nghĩa là:
 *
 * | Cỡ mẫu | Người chơi thấy gì với workflow HỎNG |
 * |---|---|
 * | 1 lượt | xanh ~86% số lần ⇒ "chạy lại là hết", và họ đi tiếp |
 * | 20 lượt | ~17/20 xanh ⇒ `greenRate ≈ 0.85`, không cách nào đọc ra là ổn |
 *
 * `baseSeed: 90004` được chọn có chủ ý — **quét cả dải hạt giống rồi lấy cái
 * đầu tiên thoả hai điều kiện cùng lúc**: lượt số 0 là một lượt XANH, và tỷ lệ
 * xanh trên 20 lượt ≤ 0.90. Đo được `0.85` (17/20), sát ngay dưới con số lý
 * thuyết `0.857`.
 *
 * Nhờ vậy `ci-muon.test.ts` khẳng định được cả hai vế trên cùng một hạt giống:
 * chấm với `passes: 1` cho `greenRate === 1`, chấm với `passes: 20` cho
 * `greenRate < 0.95`. Đó không phải một câu chữ trong bài giảng — đó là một
 * phép đo, và nó đỏ nếu ai đó vô tình làm level dễ đi.
 *
 * ⚠ Hạt giống đầu tiên thử (`90901`) cho `0.95`, tức 19/20 — vẫn "sai" theo
 * đúng nghĩa bài học, nhưng không phân biệt được với ngưỡng 0.95 nên phép đo
 * trên mất răng. Ghi lại ở đây vì đó là cái bẫy: một hạt giống chọn bằng cảm
 * giác có thể làm cả bài học biến mất mà không ô nào đỏ.
 *
 * Ô nghiệm thu bắt buộc đặt ở `greenRateAtLeast { rate: 1 }`: một ngưỡng mà cỡ
 * mẫu 20 phân biệt được còn cỡ mẫu 1 thì không.
 *
 * ## Hai lời giải, khác nhau ở chỗ ĐẶT retry
 *
 * - `solutionWorkflow` — **thử lại cả stage**: `retries: 2` trên
 *   `kiem-thu-don-vi`. Xác suất một commit đỏ tụt từ `0.05` xuống `0.05³`.
 *   Đơn giản, và mỗi lần thử lại đốt lại TOÀN BỘ 14 tick của stage.
 * - `altSolutionWorkflow` — **tách bước hay hỏng ra riêng**: bước khởi động máy
 *   ảo thành một stage `khoi-dong-moi-truong` với `retries: 2`, còn
 *   `kiem-thu-don-vi` chỉ còn bước kiểm thử và `retries: 0`. Cùng độ tin cậy,
 *   nhưng mỗi lần thử lại chỉ đốt 4 tick thay vì 14.
 *
 * ⚠ **Ý định ban đầu của mục tiêu THƯỞNG đã bị phép đo bác bỏ, và nó được giữ
 * lại đúng như phép đo nói.** Dự tính là `runnerMinutesUnder` sẽ tách được hai
 * đường (thử lại 14 tick so với thử lại 4 tick). Đo thật trên 20 lượt ở
 * `baseSeed: 90004` cho `12.10` runner-phút ở **cả hai** — bằng nhau tới hai
 * chữ số. (Ở một hạt giống khác, `90901`, hai số là `12.07` và `12.20`, tức
 * chênh nhau `0.13` và chênh theo chiều NGƯỢC với dự tính.) Lý do: `instance`
 * của hai stage khác tên nên chuỗi rút ngẫu nhiên khác nhau, mà ở `rate: 0.05`
 * × 3 commit thì số lần đỏ thật sự xảy ra dao động lớn hơn nhiều so với khoảng
 * cách 10 tick giữa hai cách thử lại. Khác biệt lý thuyết là có thật, nó chỉ
 * nhỏ hơn nhiễu của phép đo này.
 *
 * Nên ngưỡng thưởng đặt ở `12.5`: nó KHÔNG phân biệt hai lời giải mẫu, mà chặn
 * cái sai lầm level thật sự muốn chặn — rải `retries` lên mọi stage cho chắc.
 * Ghi ra ở đây thay vì lặng lẽ chỉnh số cho khớp ý định ban đầu: một ngưỡng
 * chọn để khớp một câu chuyện là một ngưỡng nói dối.
 *
 * ⚠ `nature: 'infra'` chứ không phải `'latent-defect'`, và khác biệt đó là cả
 * nội dung của C11. Ở ĐÂY thử lại là việc ĐÚNG: máy ảo khởi động chậm là một
 * thất bại của hạ tầng, không phải một lỗi trong mã. Người chơi ra khỏi C09 với
 * kết luận "thử lại là công cụ tốt" — rồi C11 cho họ thấy cái giá của việc dùng
 * đúng công cụ đó ở sai chỗ.
 */
export const c09: CicdLevel = {
  id: 'cicd-c09-mot-luot-xanh-khong-chung-minh-gi',
  chapter: 'ci',
  title: 'Nó xanh mà. Tôi chạy thử rồi.',
  mission: 'Làm đường ống xanh ở MỌI lượt chấm, không phải ở lượt bạn vừa may mắn.',
  brief: `Bộ kiểm thử đơn vị đỏ "thỉnh thoảng". Không ai tái hiện được: chạy lại là xanh,
nên cả đội đã quen bấm chạy lại và đi tiếp.

Bước khởi động máy ảo trước khi kiểm thử là chỗ hỏng. Nó tốn 4 tick, và đôi khi
container chưa sẵn sàng kịp — một thất bại của hạ tầng, không phải của mã nguồn.

Bảng chấm ở đây chạy **20 lượt mô phỏng**, không phải một. Bạn sẽ thấy một tỷ lệ
xanh chứ không phải một chữ ĐẠT hay TRƯỢT. Nhiệm vụ là đẩy tỷ lệ đó lên tròn
100%, và làm được điều đó mà không đốt thêm runner-phút một cách hoang phí.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Đường ống đỏ thỉnh thoảng',
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
        id: 'kiem-thu-don-vi',
        kind: 'unit-test',
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        // ⚠ 0 lần thử lại trên một stage có bước hạ tầng hay hỏng. Đây là lỗi.
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'khoi-dong-may-ao',
            name: 'Khởi động máy ảo kiểm thử',
            durationTicks: 4,
            blocking: true,
            flake: { rate: 0.05, nature: 'infra' },
          },
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 10,
            blocking: true,
            requires: ['goi-nhi-phan'],
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
      { id: 'c2', tick: 12 },
      { id: 'c3', tick: 24 },
    ],
  },
  evaluation: { baseSeed: 90_004, passes: 20 },
  editable: ['retries', 'stages', 'edges'],
  allowedKinds: null,
  objectives: [
    {
      id: 'xanh-moi-luot',
      label: 'Cả 20 lượt chấm đều xanh, không lượt nào đỏ',
      check: 'greenRateAtLeast',
      args: { rate: 1 },
      required: true,
    },
    {
      id: 'khong-cham-hon',
      label: 'Lead time không vượt 300 giây',
      check: 'leadTimeUnder',
      args: { seconds: 300 },
      required: true,
    },
    {
      id: 'thu-lai-dung-cho',
      label: 'THƯỞNG: không rải retry khắp nơi — dưới 12,5 runner-phút mỗi lượt',
      check: 'runnerMinutesUnder',
      args: { minutes: 12.5 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 90004`, 20 lượt: cả ba workflow cùng lead
  // 240s / 22.5 commit-giờ. Khác biệt nằm trọn ở tỷ lệ xanh (0.85 → 1.00) và
  // một chút ở runner-phút (11.75 ban đầu · 12.10 ở cả hai lời giải) — xem cảnh
  // báo ở đầu file về việc khoảng cách runner-phút giữa hai lời giải nằm trong
  // nhiễu của phép đo.
  thresholds: {
    parLeadSeconds: 240,
    budgetLeadSeconds: 300,
    parThroughputPerHour: 22,
    minThroughputPerHour: 20,
    parRunnerMinutes: 12.1,
    budgetRunnerMinutes: 13,
    minGreenRate: 1,
  },
  hints: [
    'Đọc tỷ lệ xanh, đừng đọc lượt cuối cùng. 17/20 và 20/20 là hai kết luận khác nhau.',
    'Bước khởi động máy ảo hỏng vì hạ tầng, không vì mã. Loại hỏng này thử lại là cứu được.',
    '`retries` đặt ở tầng stage: thử lại nghĩa là chạy lại TOÀN BỘ các bước của stage đó.',
    'Nếu chỉ một bước hay hỏng, tách nó thành stage riêng rồi thử lại mình nó — rẻ hơn nhiều.',
  ],
  teaching: {
    primer: `Một bước đỏ 5% số lần sẽ xanh ở 19 trên 20 lần bạn nhìn vào nó.

Đó là lý do "chạy lại là hết" nghe có vẻ đúng: nó ĐÚNG, ở mức một quan sát. Sai
lầm không nằm ở quan sát, nó nằm ở cỡ mẫu. Một lượt chạy là một lần tung đồng
xu, và một lần tung không nói được gì về đồng xu.

Bảng chấm ở đây chạy 20 lượt và đưa bạn một tỷ lệ. Đó là công cụ duy nhất phân
biệt được "đã sửa" với "vừa may".

Còn một chuyện nữa, và nó quyết định điểm của bạn ở trục thứ ba: \`retries\` đặt
ở tầng **stage**, không ở tầng bước. Thử lại một stage nghĩa là chạy lại mọi
bước trong nó, kể cả những bước chưa bao giờ hỏng. Một stage 14 tick với một
bước hỏng 4 tick sẽ đốt 14 tick mỗi lần thử lại — trong đó 10 tick là đốt vô
ích.`,
    cheatsheet: [
      {
        where: 'panel',
        control: 'retries',
        label: 'Chạy lại khi hỏng',
        explain: 'Số lần thử lại CẢ stage sau khi nó đỏ; mỗi lần thử rút xúc xắc mới, nên nó cứu được bước khởi động máy ảo hỏng vì hạ tầng. Đọc tỷ lệ xanh qua mọi lượt chấm, đừng đọc lượt cuối.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  bien-dich:
    runs-on: chung
    steps:
      - id: bien-dich-ma
  khoi-dong-moi-truong:
    runs-on: chung
    needs:
      - bien-dich
    steps:
      - id: khoi-dong-may-ao
  kiem-thu-don-vi:
    runs-on: chung
    needs:
      - khoi-dong-moi-truong
    steps:
      - id: chay-kiem-thu`,
        explain: 'Tách bước hay hỏng ra stage riêng rồi đặt số lần thử lại cho riêng stage đó: thử lại một stage là chạy lại MỌI bước của nó, kể cả bước kiểm thử 10 tick chưa hỏng lần nào.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  khoi-dong-moi-truong:
    runs-on: chung
    steps:
      - id: khoi-dong-may-ao`,
        explain: 'Stage tự thêm phải khai `runs-on: chung`. Vắng khoá thì mặc định là `linux` — hạng máy level này không có — và workflow không chạy được.',
      },
    ],
    takeaways: [
      'Một lượt xanh là một mẫu, không phải một bằng chứng; hãy đọc tỷ lệ trên nhiều lượt.',
      'Thử lại cứu được đỏ do hạ tầng, và đó là công cụ đúng cho đúng loại hỏng này.',
      'Thử lại đặt ở tầng stage, nên gói một bước hay hỏng chung với chín bước lành là tự đốt runner-phút.',
      'Tách bước hay hỏng ra một stage riêng cho cùng độ tin cậy với chi phí thấp hơn nhiều.',
    ],
    pitfalls: [
      'Đặt `retries` thật lớn cho cả đường ống — hấp dẫn vì nó làm mọi ô xanh, nhưng ở stage nào đỏ vì lỗi thật thì mỗi lần thử lại là runner-phút ném đi (xem C10).',
      'Kết luận từ lượt chạy cuối cùng — nó xanh 86% số lần kể cả khi bạn chưa sửa gì.',
      'Hạ `passes` xuống cho nhanh — làm thế là tự bịt mắt đúng cái giác quan duy nhất phân biệt được đã-sửa với vừa-may.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Thử lại cả stage kiểm thử',
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
        id: 'kiem-thu-don-vi',
        kind: 'unit-test',
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 2,
        runnerClass: 'chung',
        steps: [
          {
            id: 'khoi-dong-may-ao',
            name: 'Khởi động máy ảo kiểm thử',
            durationTicks: 4,
            blocking: true,
            flake: { rate: 0.05, nature: 'infra' },
          },
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 10,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Tách bước hay hỏng ra stage riêng',
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
        id: 'khoi-dong-moi-truong',
        kind: 'gate',
        name: 'Khởi động môi trường kiểm thử',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 2,
        runnerClass: 'chung',
        steps: [
          {
            id: 'khoi-dong-may-ao',
            name: 'Khởi động máy ảo kiểm thử',
            durationTicks: 4,
            blocking: true,
            flake: { rate: 0.05, nature: 'infra' },
          },
        ],
      },
      {
        id: 'kiem-thu-don-vi',
        kind: 'unit-test',
        name: 'Kiểm thử đơn vị',
        dependsOn: ['khoi-dong-moi-truong'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 10,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
};
