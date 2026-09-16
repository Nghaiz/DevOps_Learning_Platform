import type { CicdLevel } from '../contract.ts';

/**
 * C04 — ĐƯỜNG GĂNG. Level đầu tiên dạy được thứ mà một sơ đồ 2D tĩnh khó nói ra.
 *
 * ## Level dựng thế nào để khái niệm LỘ RA, chứ không chỉ được nhắc tên
 *
 * Bốn quyết định, mỗi cái nhằm bịt một cách "qua level mà không hiểu gì":
 *
 * **1. Có mồi nhử rẻ tiền.** `clone` 2 tick và `dong-goi` 3 tick là hai stage
 * ngắn nhất, và chúng nằm ở hai đầu — chỗ mắt người nhìn vào đầu tiên. Rút ngắn
 * chúng bằng bất kỳ cách nào cũng KHÔNG đổi được lead time một tick nào, vì
 * chúng vẫn nằm trên đường găng nhưng đã cạn. Người chơi phải học rằng "nằm trên
 * đường găng" và "đáng sửa" là hai chuyện khác nhau.
 *
 * **2. Có mồi nhử NGOÀI đường găng.** `lint` 4 tick ngồi giữa chuỗi ban đầu, nên
 * trông như một mắt xích. Ở lời giải A nó rời khỏi đường găng và từ đó sửa nó
 * hoàn toàn vô nghĩa — nhưng bảng ba trục KHÔNG nói điều đó; chỉ đường găng được
 * tô sáng sau mỗi lượt chạy mới nói.
 *
 * **3. Nút dài nhất KHÔNG ở đầu cũng không ở cuối.** `kiem-tra` 12 tick nằm
 * giữa. Nó chiếm 37,5% tổng công việc, nên cả hai lời giải đều phải chạm tới nó
 * — bằng cách này hay cách khác.
 *
 * **4. Tổng công việc là hằng số.** Cả hai lời giải đều đốt đúng 32 tick mỗi
 * commit, dù lead time khác nhau 3 tick. Đó là bằng chứng sống cho câu "đường
 * găng là một đại lượng về THỜI GIAN, không phải về CÔNG VIỆC" — và là lý do
 * `runnerMinutesUnder` có mặt trong mục tiêu bắt buộc.
 *
 * ## Hai lời giải khác nhau THẬT — hai can thiệp kinh điển lên đường găng
 *
 * - **A — CẮT CẠNH.** `lint`, `kiem-tra`, `quet` đều chỉ đợi `cai-dat`; `dong-goi`
 *   đợi cả ba. Đường găng rút còn `clone → cai-dat → kiem-tra → dong-goi` = 23
 *   tick. `lint` và `quet` biến khỏi đường găng. Cần 3 máy cùng lúc.
 * - **B — CHẺ NÚT DÀI NHẤT.** Giữ nguyên hình chuỗi, nhưng tách `kiem-tra` (12)
 *   thành `kiem-tra-a` và `kiem-tra-b` (6 + 6) chạy song song. Đường găng vẫn đi
 *   qua `lint`, nhưng nút 12 tick trên nó tụt còn 6 → 26 tick. Chỉ cần 2 máy.
 *
 * Hai can thiệp này là hai thứ khác nhau về bản chất: A đổi HÌNH DẠNG đồ thị, B
 * đổi ĐỘ DÀI một đỉnh. Ngưỡng `budgetLeadSeconds` = 270 giây cố ý chứa cả hai,
 * và mục `stageOffCriticalPath` cho `lint` là mục THƯỞNG — nó thuộc về A, và
 * biến nó thành bắt buộc sẽ loại B chỉ vì B chọn can thiệp kia.
 */
export const c04: CicdLevel = {
  id: 'cicd-c04-duong-gang',
  chapter: 'ci',
  title: 'Đường găng',
  mission: 'Rút một commit xuống dưới 270 giây mà không đốt thêm runner-phút nào.',
  brief: `Đường ống này mất 320 giây. Sáu stage nối thành một chuỗi thẳng, và mỗi stage
đợi stage trước.

Sau mỗi lượt chạy, đường ống sẽ **tô sáng đường găng**: chuỗi mắt xích quyết định
lúc nào commit xanh. Rút ngắn một stage NẰM TRÊN đường găng thì lead time giảm
đúng chừng ấy. Rút ngắn một stage nằm NGOÀI nó thì không giảm một giây nào — dù
bảng số vẫn hiện nó chạy nhanh hơn.

Bạn được sửa cạnh và được gộp/tách stage. Bạn KHÔNG được xoá việc: \`lint\`,
\`quet\` và \`dong-goi\` phải còn, và \`dong-goi\` cần cả bản build lẫn báo cáo
kiểm thử. Dàn máy có ba chỗ.

Có ít nhất hai đường về đích, và chúng can thiệp vào hai chỗ khác nhau. Trước khi
sửa, hãy chạy một lượt và đọc đường găng — nó dài bao nhiêu, và mắt xích nào trên
đó tốn nhất?`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Sáu stage nối chuỗi',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'cai-dat', kind: 'build', name: 'Cài gói và build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'cai-goi', name: 'Cài gói phụ thuộc rồi build', durationTicks: 6, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Bộ kiểm thử đầy đủ', dependsOn: ['lint'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'chay-test', name: 'Chạy toàn bộ test', durationTicks: 12, blocking: true,
          requires: ['ban-dung'], produces: ['bao-cao-test'],
        }],
      },
      {
        id: 'quet', kind: 'sast', name: 'Quét bảo mật', dependsOn: ['kiem-tra'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'quet-ma', name: 'Quét mã tìm lỗ hổng', durationTicks: 5, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'dong-goi', kind: 'package', name: 'Đóng gói', dependsOn: ['quet'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'dong-goi-ban', name: 'Đóng gói bản phát hành', durationTicks: 3, blocking: true,
          requires: ['ban-dung', 'bao-cao-test'],
        }],
      },
    ],
  },
  workload: {
    runners: [{ id: 'linux', label: 'Máy Linux', count: 3 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    // Giãn 45 tick > 32 tick của đường ống ban đầu. Phải giãn: nếu hai commit
    // chồng nhau thì chuỗi `blockedBy` của commit sau trỏ sang một thực thể của
    // commit trước, `InstanceKey` không mang `commitId`, và đường găng bị cắt
    // cụt (`CriticalPath.truncated`). Level dạy đường găng thì không được để
    // chính đường găng đứt.
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 45 },
      { id: 'c3', tick: 90 },
    ],
  },
  evaluation: { baseSeed: 1904, passes: 4 },
  editable: ['edges', 'stages'],
  allowedKinds: null,
  objectives: [
    {
      id: 'du-nhanh',
      label: 'Một commit đi hết đường ống trong dưới 270 giây',
      check: 'leadTimeUnder',
      args: { seconds: 270 },
      required: true,
    },
    {
      id: 'khong-dot-them',
      label: 'Không đốt quá 18 runner-phút mỗi lượt — nhanh hơn, không phải làm nhiều hơn',
      check: 'runnerMinutesUnder',
      args: { minutes: 18 },
      required: true,
    },
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
      id: 'con-lint',
      label: 'Stage `lint` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'lint' },
      required: true,
    },
    {
      id: 'con-quet',
      label: 'Stage `quet` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'quet' },
      required: true,
    },
    {
      id: 'con-dong-goi',
      label: 'Stage `dong-goi` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'dong-goi' },
      required: true,
    },
    {
      id: 'lint-roi-duong-gang',
      label: 'Thưởng: đẩy `lint` ra khỏi đường găng ở mọi lượt chạy',
      check: 'stageOffCriticalPath',
      args: { stage: 'lint', rate: 1 },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 230,
    budgetLeadSeconds: 270,
    parThroughputPerHour: 9.5,
    minThroughputPerHour: 8,
    parRunnerMinutes: 16,
    budgetRunnerMinutes: 18,
    minGreenRate: 1,
  },
  hints: [
    'Chạy một lượt trước khi sửa gì. Đường găng được tô sáng, và nó đi qua cả sáu stage — vì đồ thị đang là một chuỗi, mọi stage đều nằm trên đó.',
    'Ba stage `lint`, `kiem-tra`, `quet` đều chỉ cần bản build. Không cái nào cần kết quả của cái nào — hãy kiểm lại bước của chúng cần sản phẩm gì.',
    'Có hai chỗ can thiệp: đổi hình dạng đồ thị để ba việc chạy song song, hoặc chẻ đôi `kiem-tra` — nút 12 tick, dài nhất trên đường găng. Làm một trong hai là đủ qua.',
  ],
  teaching: {
    primer: `**Đường găng** là chuỗi mắt xích quyết định lúc nào một commit xanh. Nó dài
đúng bằng lead time, và mọi thứ nằm ngoài nó đều có *thời gian dư*: rút ngắn
chúng không đổi được gì.

Ở một đường ống có máy chạy hữu hạn, đường găng **không phải** đường dài nhất
trong đồ thị. Một stage có thể xong muộn vì nó ngồi chờ MÁY chứ không chờ phụ
thuộc nào — nên đường găng đi qua hai loại mắt xích khác nhau, và đường ống vẽ
chúng khác nhau. Sửa nhầm loại là đi sửa đồ thị trong khi thứ phải sửa là số máy.

Có đúng hai cách rút ngắn nó:

- **Đổi hình dạng** — gỡ một cạnh không có thật, để những việc độc lập rời khỏi
  chuỗi. Rẻ nhất, và hết tác dụng ngay khi đồ thị đã phẳng.
- **Rút ngắn một đỉnh TRÊN nó** — chẻ việc dài nhất thành hai nửa song song,
  hoặc làm nó rẻ đi. Đây là cách duy nhất còn lại khi đồ thị đã phẳng.

Và một điều dễ quên: rút ngắn đường găng **không** làm giảm tổng công việc. Cả
hai lời giải của level này đều đốt đúng 32 tick máy mỗi commit. Bạn đang mua thời
gian, không phải tiết kiệm tài nguyên — hai trục khác nhau, hiển thị cạnh nhau.`,
    cheatsheet: [
      {
        where: 'yaml',
        snippet: `jobs:
  cai-dat:
    steps:
      - id: cai-goi
  lint:
    needs:
      - cai-dat
    steps:
      - id: soi-ma
  quet:
    needs:
      - cai-dat
    steps:
      - id: quet-ma`,
        explain: 'Gỡ một mắt xích khỏi chuỗi: stage chỉ đợi đúng thứ nó cần là bản build của `cai-dat`, không đợi thứ nằm trước nó trong danh sách.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  lint:
    steps:
      - id: soi-ma
  kiem-tra:
    steps:
      - id: chay-test
  quet:
    steps:
      - id: quet-ma
  dong-goi:
    needs:
      - lint
      - kiem-tra
      - quet
    steps:
      - id: dong-goi-ban`,
        explain: 'Hợp lưu: `dong-goi` đợi cả ba nhánh, nên nó sẵn sàng đúng lúc nhánh XONG MUỘN NHẤT kết thúc — nhánh đó mới là mắt xích trên đường găng.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  lint:
    steps:
      - id: soi-ma
  kiem-tra-a:
    needs:
      - lint
    steps:
      - id: chay-test-a
  kiem-tra-b:
    needs:
      - lint
    steps:
      - id: chay-test-b`,
        explain: 'Chẻ stage dài nhất thành hai stage, mỗi stage nửa bộ test. Hai nửa chạy song song được vì máy cấp cho stage, không cấp cho bước.',
      },
    ],
    takeaways: [
      'Đường găng dài đúng bằng lead time; mọi thứ ngoài nó có thời gian dư và sửa không đổi được gì.',
      'Chỉ có hai cách rút ngắn: gỡ một cạnh thừa, hoặc rút ngắn một đỉnh đang nằm trên đường găng.',
      'Đường găng là đại lượng thời gian, không phải công việc — rút nó ngắn lại mà tổng runner-phút không đổi là chuyện bình thường.',
      'Sửa xong thì đường găng ĐỔI CHỖ: mắt xích dài thứ hai trở thành mắt xích quyết định, và vòng tối ưu tiếp theo phải đọc lại từ đầu.',
    ],
    pitfalls: [
      'Tối ưu stage ngắn nhất vì nó dễ sửa nhất. `clone` 2 tick nằm trên đường găng nhưng đã cạn — có làm nó bằng 0 thì lead cũng chỉ giảm 2 tick, trong khi nút 12 tick ngồi ngay giữa.',
      'Tưởng "nằm trên đường găng" nghĩa là "đáng sửa". Hai chuyện khác nhau: cái đáng sửa là mắt xích DÀI trên đường găng.',
      'Đọc bảng ba trục để đoán stage nào đáng sửa. Bảng chỉ nói mỗi stage mất bao lâu, không nói cái nào quyết định thời điểm kết thúc — chỉ đường găng nói điều đó.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Cắt cạnh: ba việc kiểm tra chạy song song',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'cai-dat', kind: 'build', name: 'Cài gói và build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'cai-goi', name: 'Cài gói phụ thuộc rồi build', durationTicks: 6, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Bộ kiểm thử đầy đủ', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'chay-test', name: 'Chạy toàn bộ test', durationTicks: 12, blocking: true,
          requires: ['ban-dung'], produces: ['bao-cao-test'],
        }],
      },
      {
        id: 'quet', kind: 'sast', name: 'Quét bảo mật', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'quet-ma', name: 'Quét mã tìm lỗ hổng', durationTicks: 5, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'dong-goi', kind: 'package', name: 'Đóng gói', dependsOn: ['lint', 'kiem-tra', 'quet'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'dong-goi-ban', name: 'Đóng gói bản phát hành', durationTicks: 3, blocking: true,
          requires: ['ban-dung', 'bao-cao-test'],
        }],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Chẻ nút dài nhất: bộ kiểm thử tách đôi',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'cai-dat', kind: 'build', name: 'Cài gói và build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'cai-goi', name: 'Cài gói phụ thuộc rồi build', durationTicks: 6, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'kiem-tra-a', kind: 'unit-test', name: 'Bộ kiểm thử, nửa một', dependsOn: ['lint'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'chay-test-a', name: 'Chạy nửa đầu bộ test', durationTicks: 6, blocking: true,
          requires: ['ban-dung'], produces: ['bao-cao-test'],
        }],
      },
      {
        id: 'kiem-tra-b', kind: 'unit-test', name: 'Bộ kiểm thử, nửa hai', dependsOn: ['lint'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-test-b', name: 'Chạy nửa sau bộ test', durationTicks: 6, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'quet', kind: 'sast', name: 'Quét bảo mật', dependsOn: ['kiem-tra-a', 'kiem-tra-b'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'quet-ma', name: 'Quét mã tìm lỗ hổng', durationTicks: 5, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'dong-goi', kind: 'package', name: 'Đóng gói', dependsOn: ['quet'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'dong-goi-ban', name: 'Đóng gói bản phát hành', durationTicks: 3, blocking: true,
          requires: ['ban-dung', 'bao-cao-test'],
        }],
      },
    ],
  },
};
