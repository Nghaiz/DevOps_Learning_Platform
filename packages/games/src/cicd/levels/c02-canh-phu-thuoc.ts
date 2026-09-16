import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel } from '../contract.ts';

/**
 * C02 — cạnh phụ thuộc, và vì sao thiếu một cạnh là ĐỎ THẬT chứ không phải chậm.
 *
 * Đường ống ban đầu khai đủ bốn stage, đủ bước, đúng thời lượng — và vẫn đỏ ở
 * mọi lượt, vì `kiem-tra` và `dong-goi` đều cần sản phẩm `ban-dung` của `dung`
 * nhưng không stage nào trong hai cái đó phụ thuộc vào `dung`. Engine trả về
 * `FailureCause.kind === 'missing-output'`, và thử lại bao nhiêu lần cũng đỏ.
 *
 * Đó là điều làm bài này khác một bài "sắp xếp cho đẹp": một cạnh thiếu không
 * gây ra một cuộc đua may rủi về thời điểm. Hai stage chạy song song KHÔNG thấy
 * sản phẩm của nhau kể cả khi một cái đã xong trước — hợp đồng nói rõ ở
 * `StepSpec.requires`, và đó chính là cái biến "quên khai" thành một lỗi đọc ra
 * được.
 *
 * ## Hai lời giải khác nhau THẬT
 *
 * - **A — quạt ra**: `kiem-tra` và `dong-goi` cùng phụ thuộc `dung`, nên chúng
 *   chạy SONG SONG sau khi build xong. Cần hai máy cùng lúc. Lead 15 tick.
 * - **B — nối chuỗi**: `kiem-tra` phụ thuộc `dung`, `dong-goi` phụ thuộc
 *   `kiem-tra`. Chỉ cần một máy tại mỗi thời điểm. Lead 19 tick.
 *
 * Cả hai đều đủ điều kiện AC, và chúng đánh đổi ngược nhau: A nhanh hơn nhưng
 * đòi máy rộng hơn, B chậm hơn nhưng chạy được trên một dàn máy chật. Ngưỡng
 * `budgetLeadSeconds` cố ý nới tới 200 giây để không loại B — ghim nó xuống 160
 * là biến một đánh đổi thành một đáp án, và mục tiêu "không phụ thuộc chéo" vì
 * thế là mục THƯỞNG.
 */
export const c02: CicdLevel = {
  id: 'cicd-c02-canh-phu-thuoc',
  chapter: 'ci',
  title: 'Cạnh phụ thuộc',
  mission: 'Đường ống đỏ ở mọi lượt dù không stage nào viết sai. Tìm cạnh còn thiếu.',
  brief: `Đường ống này đã có đủ bốn stage: tải mã, build, chạy test, đóng gói. Không
stage nào khai sai thời lượng, không stage nào thiếu bước. Vậy mà mọi lượt chạy
đều đỏ, và bấm chạy lại thì vẫn đỏ đúng như thế.

Hãy đọc kỹ bản ghi. Nó không nói "chậm", nó nói một bước **cần một sản phẩm mà
nó không có**. Sản phẩm đó do một stage khác tạo ra, và stage cần nó không hề
khai rằng mình phải đợi stage kia.

Ở level này bạn chỉ sửa được các cạnh phụ thuộc — không thêm, không xoá, không
sửa bước nào. Có nhiều hơn một cách nối lại cho đúng, và hai cách khác nhau cho
ra hai độ trễ khác nhau. Chọn cách bạn thấy hợp lý rồi nhìn ba trục điểm.`,
  difficulty: 'basic',
  initialWorkflow: {
    name: 'Bốn stage, thiếu hai cạnh',
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
        id: 'dung',
        kind: 'build',
        name: 'Build',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'bien-dich',
            name: 'Biên dịch mã nguồn',
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon'],
            produces: ['ban-dung'],
          },
        ],
      },
      {
        id: 'kiem-tra',
        kind: 'unit-test',
        name: 'Chạy test',
        // ⛔ Cạnh còn thiếu nằm ở đây: bước bên dưới cần `ban-dung`, mà stage
        // này chỉ đợi `clone`. Người chơi phải tự đọc ra điều đó từ bản ghi.
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'chay-test',
            name: 'Chạy test trên bản đã build',
            durationTicks: 6,
            blocking: true,
            requires: ['ban-dung'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'dong-goi-ban',
            name: 'Đóng gói bản phát hành',
            durationTicks: 4,
            blocking: true,
            requires: ['ban-dung'],
          },
        ],
      },
    ],
  },
  workload: {
    runners: [{ id: 'linux', label: 'Máy Linux', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 30 },
      { id: 'c3', tick: 60 },
    ],
  },
  evaluation: { baseSeed: 1902, passes: 4 },
  editable: ['edges'],
  allowedKinds: null,
  objectives: [
    {
      id: 'khong-thieu-san-pham',
      label: 'Không lần đỏ nào vì một bước thiếu sản phẩm đầu vào',
      check: 'noFailureCause',
      args: { cause: 'missing-output' },
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
      label: 'Một commit đi hết đường ống trong dưới 200 giây',
      check: 'leadTimeUnder',
      args: { seconds: 200 },
      required: true,
    },
    {
      id: 'con-du-build',
      label: 'Stage `dung` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'dung' },
      required: true,
    },
    {
      id: 'con-du-test',
      label: 'Stage `kiem-tra` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'kiem-tra' },
      required: true,
    },
    {
      id: 'con-du-dong-goi',
      label: 'Stage `dong-goi` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'dong-goi' },
      required: true,
    },
    {
      id: 'test-va-dong-goi-doc-lap',
      label: 'Thưởng: `dong-goi` không phải đợi `kiem-tra`, hai việc chạy song song',
      check: 'stageNotDependsOn',
      args: { stage: 'dong-goi', on: 'kiem-tra' },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 150,
    budgetLeadSeconds: 200,
    parThroughputPerHour: 14,
    minThroughputPerHour: 11,
    parRunnerMinutes: 9.5,
    budgetRunnerMinutes: 11,
    minGreenRate: 1,
  },
  hints: [
    'Đỏ ở đây không phải đỏ ngẫu nhiên. Mở bản ghi của một lần thử và đọc nguyên nhân — nó gọi tên đúng sản phẩm còn thiếu và đúng bước cần nó.',
    'Sản phẩm `ban-dung` do bước `bien-dich` của stage `dung` tạo ra. Một bước chỉ thấy sản phẩm của những stage mà stage của nó phụ thuộc, kể cả phụ thuộc bắc cầu.',
    'Cho `kiem-tra` và `dong-goi` phụ thuộc `dung`. Muốn nhanh nhất thì để cả hai cùng đợi `dung`; muốn tiết kiệm máy thì nối chúng thành chuỗi. Cả hai đều qua.',
  ],
  teaching: {
    primer: `Một bước khai hai thứ: nó **cần** sản phẩm nào, và nó **tạo ra** sản phẩm nào.

Luật rất gọn: một bước chỉ thấy sản phẩm của những stage mà stage của nó phụ
thuộc — kể cả phụ thuộc **bắc cầu**, tức đi qua nhiều cạnh. Hai stage chạy song
song không thấy sản phẩm của nhau, **kể cả khi một cái đã xong trước**.

Vế cuối là điều quan trọng nhất. Nếu mô hình cho phép "xong trước thì thấy" thì
thiếu một cạnh sẽ thành một cuộc đua: hôm nay xanh, mai đỏ, tuỳ máy chạy rảnh
lúc nào. Ở đây thì không — thiếu cạnh là đỏ, đỏ mọi lượt, và thử lại không cứu
được. Một lỗi ổn định dễ sửa hơn một lỗi may rủi rất nhiều.

Khi đã nối đúng, bạn vẫn còn một lựa chọn: cho hai việc độc lập chạy **song
song** (nhanh hơn, cần nhiều máy hơn cùng lúc) hay **nối chuỗi** (chậm hơn, chỉ
cần một máy). Đây là lần đầu ba trục điểm kéo nhau đi hai hướng, và sẽ không
phải lần cuối.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('linux', [
          { id: 'clone', kind: 'clone', steps: ['tai-ma'] },
          { id: 'dung', dependsOn: ['clone'], steps: ['bien-dich'] },
        ]),
        explain: 'Cạnh phụ thuộc vừa quyết định thứ tự chạy, vừa quyết định stage thấy sản phẩm của ai. Bước cần một sản phẩm mà không có cạnh dẫn tới stage tạo ra nó thì đỏ ở mọi lượt, không phải đỏ ngẫu nhiên.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('linux', [
          { id: 'dung', steps: ['bien-dich'] },
          { id: 'kiem-tra', dependsOn: ['dung'], steps: ['chay-test'] },
          { id: 'dong-goi', dependsOn: ['dung'], steps: ['dong-goi-ban'] },
        ]),
        explain: 'Hai stage cùng đợi `dung` thì chạy song song và cùng thấy `ban-dung`, nhưng không thấy sản phẩm của nhau — kể cả khi một bên xong trước.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('linux', [
          { id: 'dung', steps: ['bien-dich'] },
          { id: 'kiem-tra', dependsOn: ['dung'], steps: ['chay-test'] },
          { id: 'dong-goi', dependsOn: ['kiem-tra'], steps: ['dong-goi-ban'] },
        ]),
        explain: 'Nối chuỗi thay vì song song: `dong-goi` vẫn thấy `ban-dung` qua cạnh bắc cầu `kiem-tra` → `dung`. Chậm hơn, nhưng mỗi lúc chỉ cần một máy.',
      },
    ],
    takeaways: [
      'Cạnh phụ thuộc vừa là thứ tự chạy vừa là đường đi của sản phẩm giữa các stage.',
      'Thiếu một cạnh là lỗi ổn định, không phải một cuộc đua — nên thử lại không bao giờ cứu được.',
      'Sau khi nối đúng, chọn song song hay nối chuỗi là một đánh đổi giữa độ trễ và số máy cần cùng lúc.',
    ],
    pitfalls: [
      'Bấm chạy lại khi thấy đỏ. Nó hấp dẫn vì phần lớn đỏ trong đời thật là đỏ giả, nhưng ở đây bản ghi đã nói rõ nguyên nhân là thiếu sản phẩm — và mỗi lần chạy lại chỉ đốt thêm runner-phút.',
      'Nối tất cả thành một chuỗi cho chắc. Nó luôn đúng về mặt sản phẩm, nhưng biến mọi việc độc lập thành xếp hàng, và độ trễ cộng dồn.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Test và đóng gói cùng đợi build',
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
        id: 'dung',
        kind: 'build',
        name: 'Build',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'bien-dich',
            name: 'Biên dịch mã nguồn',
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon'],
            produces: ['ban-dung'],
          },
        ],
      },
      {
        id: 'kiem-tra',
        kind: 'unit-test',
        name: 'Chạy test',
        dependsOn: ['dung'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'chay-test',
            name: 'Chạy test trên bản đã build',
            durationTicks: 6,
            blocking: true,
            requires: ['ban-dung'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói',
        dependsOn: ['dung'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'dong-goi-ban',
            name: 'Đóng gói bản phát hành',
            durationTicks: 4,
            blocking: true,
            requires: ['ban-dung'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Nối chuỗi: đóng gói đợi test xong',
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
        id: 'dung',
        kind: 'build',
        name: 'Build',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'bien-dich',
            name: 'Biên dịch mã nguồn',
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon'],
            produces: ['ban-dung'],
          },
        ],
      },
      {
        id: 'kiem-tra',
        kind: 'unit-test',
        name: 'Chạy test',
        dependsOn: ['dung'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'chay-test',
            name: 'Chạy test trên bản đã build',
            durationTicks: 6,
            blocking: true,
            requires: ['ban-dung'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói',
        dependsOn: ['kiem-tra'],
        blocking: true,
        retries: 0,
        runnerClass: 'linux',
        steps: [
          {
            id: 'dong-goi-ban',
            name: 'Đóng gói bản phát hành',
            durationTicks: 4,
            blocking: true,
            requires: ['ban-dung'],
          },
        ],
      },
    ],
  },
};
