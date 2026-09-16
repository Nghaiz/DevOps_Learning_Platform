import type { CicdLevel } from '../contract.ts';

/**
 * C03 — song song trên giấy khác song song trên máy.
 *
 * Mười việc kiểm thử, tổng 43 tick, và ĐÚNG HAI máy chạy. Dù người chơi khai
 * cả mười là độc lập, sàn cứng vẫn là 43 / 2 = 21,5 tick — nên đường ống không
 * bao giờ xuống dưới 22 tick phần kiểm thử, dù đồ thị trông "song song hoàn
 * toàn". Đó là toàn bộ bài học, và nó chỉ phát biểu được khi số máy là dữ liệu
 * của level chứ không phải thứ người chơi sửa (`editable` không có `runners`).
 *
 * Đường ống ban đầu nối mười việc thành một CHUỖI — thói quen phổ biến nhất khi
 * người ta chưa nghĩ tới đồ thị. 3 + 43 + 1 = 47 tick.
 *
 * ## Hai lời giải khác nhau THẬT
 *
 * - **A — mười stage độc lập**: gỡ hết cạnh giả, để bộ xếp lịch tự nhét mười
 *   việc vào hai máy. Xếp theo thứ tự hàng đợi của hợp đồng, nó ra 25 tick.
 * - **B — hai làn gộp sẵn**: gộp mười việc thành ĐÚNG HAI stage, mỗi stage năm
 *   bước, tự cân bằng 22 và 21 tick. Cũng ra 25 tick.
 *
 * Hai con số trùng nhau là điểm mấu chốt chứ không phải trùng hợp: khi máy chạy
 * là thứ khan hiếm, cách chia stage gần như không đổi được gì — chỉ TỔNG CÔNG
 * VIỆC và SỐ MÁY đổi được. Một người chơi chia hai mươi stage cũng ra 25 tick.
 *
 * Mục thưởng `stageCountAtMost` vì thế trao cho B, còn A vẫn AC: lời giải "để
 * bộ xếp lịch lo" là lời giải đúng hơn trong đời thật (nó thích ứng khi số máy
 * đổi), nhưng nó không rẻ hơn ở đây, và level không được phép nói dối về điều đó.
 *
 * ## Vì sao có `tong-hop`
 *
 * Không có nó thì lời giải rẻ nhất là XOÁ chín việc kiểm thử — lead giảm, runner
 * -phút giảm, mọi ngưỡng đều xanh, và level dạy sai hoàn toàn. `tong-hop` cần cả
 * mười sản phẩm `kq-*`, nên thiếu một việc là `missing-output`, đỏ mọi lượt.
 */
export const c03: CicdLevel = {
  id: 'cicd-c03-song-song-tren-may',
  chapter: 'ci',
  title: 'Song song trên giấy, hai máy trên thực tế',
  mission: 'Mười việc kiểm thử đang xếp hàng một. Rút ngắn xuống dưới 290 giây với đúng hai máy.',
  brief: `Đội bạn có mười bộ kiểm thử, và ai đó đã nối chúng thành một chuỗi: bộ sau
đợi bộ trước. Một commit mất 470 giây mới xanh, phần lớn là ngồi chờ.

Mười bộ này **độc lập với nhau** — không bộ nào cần kết quả của bộ nào. Bạn được
sửa cạnh phụ thuộc và được gộp/tách stage tuỳ ý. Thứ bạn KHÔNG sửa được là dàn
máy: đúng hai máy Linux, không hơn.

Trước khi sửa, thử đoán: nếu khai cả mười là độc lập thì một commit mất bao lâu?
Rồi chạy và so với con số bạn vừa đoán. Khoảng cách giữa hai con số đó là bài học
của level này.

Stage \`tong-hop\` cần kết quả của cả mười bộ, nên xoá bớt việc không phải là
một lời giải — nó chỉ đổi một đường ống chậm thành một đường ống đỏ.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Mười bộ kiểm thử xếp hàng một',
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
          { id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 3, blocking: true, produces: ['ma-nguon'] },
        ],
      },
      {
        id: 'kt-a', kind: 'unit-test', name: 'Bộ kiểm thử A', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-a', name: 'Chạy bộ A', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-a'] }],
      },
      {
        id: 'kt-b', kind: 'unit-test', name: 'Bộ kiểm thử B', dependsOn: ['kt-a'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-b', name: 'Chạy bộ B', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-b'] }],
      },
      {
        id: 'kt-c', kind: 'unit-test', name: 'Bộ kiểm thử C', dependsOn: ['kt-b'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-c', name: 'Chạy bộ C', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-c'] }],
      },
      {
        id: 'kt-d', kind: 'unit-test', name: 'Bộ kiểm thử D', dependsOn: ['kt-c'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-d', name: 'Chạy bộ D', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-d'] }],
      },
      {
        id: 'kt-e', kind: 'unit-test', name: 'Bộ kiểm thử E', dependsOn: ['kt-d'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-e', name: 'Chạy bộ E', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-e'] }],
      },
      {
        id: 'kt-f', kind: 'unit-test', name: 'Bộ kiểm thử F', dependsOn: ['kt-e'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-f', name: 'Chạy bộ F', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-f'] }],
      },
      {
        id: 'kt-g', kind: 'unit-test', name: 'Bộ kiểm thử G', dependsOn: ['kt-f'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-g', name: 'Chạy bộ G', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-g'] }],
      },
      {
        id: 'kt-h', kind: 'unit-test', name: 'Bộ kiểm thử H', dependsOn: ['kt-g'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-h', name: 'Chạy bộ H', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-h'] }],
      },
      {
        id: 'kt-i', kind: 'unit-test', name: 'Bộ kiểm thử I', dependsOn: ['kt-h'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-i', name: 'Chạy bộ I', durationTicks: 3, blocking: true, requires: ['ma-nguon'], produces: ['kq-i'] }],
      },
      {
        id: 'kt-j', kind: 'unit-test', name: 'Bộ kiểm thử J', dependsOn: ['kt-i'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-j', name: 'Chạy bộ J', durationTicks: 3, blocking: true, requires: ['ma-nguon'], produces: ['kq-j'] }],
      },
      {
        id: 'tong-hop', kind: 'gate', name: 'Tổng hợp kết quả', dependsOn: ['kt-j'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'gom-kq', name: 'Gom kết quả mười bộ', durationTicks: 1, blocking: true,
          requires: ['kq-a', 'kq-b', 'kq-c', 'kq-d', 'kq-e', 'kq-f', 'kq-g', 'kq-h', 'kq-i', 'kq-j'],
        }],
      },
    ],
  },
  workload: {
    runners: [{ id: 'linux', label: 'Máy Linux', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    // Giãn 70 tick, rộng hơn cả 47 tick của đường ống ban đầu. Ở level này hàng
    // đợi GIỮA các commit là nhiễu: bài học nằm ở chỗ giành máy BÊN TRONG một
    // commit, và để hai commit chồng nhau sẽ trộn hai hiệu ứng vào một con số.
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 70 },
      { id: 'c3', tick: 140 },
    ],
  },
  evaluation: { baseSeed: 1903, passes: 4 },
  editable: ['edges', 'stages'],
  allowedKinds: null,
  objectives: [
    {
      id: 'du-nhanh',
      label: 'Một commit đi hết đường ống trong dưới 290 giây',
      check: 'leadTimeUnder',
      args: { seconds: 290 },
      required: true,
    },
    {
      id: 'khong-thieu-san-pham',
      label: 'Không lần đỏ nào vì thiếu kết quả của một bộ kiểm thử',
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
      id: 'khong-dot-them-may',
      label: 'Không đốt quá 25 runner-phút mỗi lượt',
      check: 'runnerMinutesUnder',
      args: { minutes: 25 },
      required: true,
    },
    {
      id: 'con-clone',
      label: 'Stage `clone` vẫn còn trong đường ống',
      check: 'stageExists',
      args: { stage: 'clone' },
      required: true,
    },
    {
      id: 'gon-bon-stage',
      label: 'Thưởng: gộp mười bộ lại còn không quá 4 stage',
      check: 'stageCountAtMost',
      args: { max: 4 },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 260,
    budgetLeadSeconds: 290,
    parThroughputPerHour: 6.5,
    minThroughputPerHour: 5,
    parRunnerMinutes: 23.5,
    budgetRunnerMinutes: 25,
    minGreenRate: 1,
  },
  hints: [
    'Mười bộ kiểm thử không bộ nào cần kết quả của bộ nào — chỉ cần mã nguồn. Chuỗi hiện tại là do người viết, không do dữ liệu.',
    'Cho cả mười cùng phụ thuộc `clone`, rồi cho `tong-hop` phụ thuộc cả mười. Chạy thử và đọc con số: nó không phải 5 tick.',
    'Tổng công việc là 43 tick trên 2 máy, nên sàn cứng là 22 tick. Gộp mười bộ thành hai stage năm bước cũng cho ra đúng con số ấy — cách chia không đổi được sàn, chỉ số máy mới đổi được.',
  ],
  teaching: {
    primer: `Đồ thị nói cho bạn biết việc nào ĐƯỢC PHÉP chạy cùng lúc. Nó không nói việc
nào SẼ chạy cùng lúc — điều đó do số máy chạy quyết định.

Mười việc độc lập, tổng 43 tick, hai máy: không cách nào xuống dưới 21,5 tick.
Đó là một phép chia, không phải một giới hạn của phần mềm. Khai cả mười là độc
lập vẫn để lại tám việc ngồi đợi ở bất kỳ thời điểm nào.

Nên khi một đường ống chậm, có đúng ba thứ đổi được:

1. **Tổng công việc** — bỏ bớt, hoặc làm cho mỗi việc rẻ đi (cache, ở C06).
2. **Số máy** — mua thêm. Đắt, và nó đánh thẳng vào trục runner-phút.
3. **Hình dạng đồ thị** — chỉ giúp khi đường ống đang xếp hàng một cách vô cớ,
   như lúc bắt đầu level này.

Điều thứ ba là thứ rẻ nhất và cũng là thứ hết tác dụng sớm nhất: khi đồ thị đã
phẳng, sửa tiếp nó không còn đổi được gì. Bộ xếp lịch chọn việc theo một thứ tự
cố định — sẵn sàng trước thì chạy trước, hoà thì so mã định danh — nên kết quả
lặp lại được, và bạn so được hai lời giải trên cùng một thế giới.`,
    cheatsheet: [
      {
        where: 'yaml',
        snippet: `jobs:
  clone:
    steps:
      - id: tai-ma
  kt-a:
    needs:
      - clone
    steps:
      - id: chay-a
  kt-b:
    needs:
      - clone
    steps:
      - id: chay-b`,
        explain: 'Không đợi nhau: `kt-a` và `kt-b` chỉ đợi `clone`, sau đó chỉ còn chờ máy. Đồ thị cho phép song song; số máy mới quyết định có song song thật hay không.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  kt-a:
    steps:
      - id: chay-a
  kt-b:
    steps:
      - id: chay-b
  tong-hop:
    needs:
      - kt-a
      - kt-b
    steps:
      - id: gom-kq`,
        explain: 'Hợp lưu: `tong-hop` đợi mọi stage trong danh sách. Thiếu một bộ kiểm thử trong `needs` là nó đỏ, vì không thấy kết quả của bộ đó.',
      },
      {
        where: 'yaml',
        snippet: `jobs:
  clone:
    steps:
      - id: tai-ma
  kt-lan-1:
    runs-on: linux
    needs:
      - clone
    steps:
      - id: chay-a
      - id: chay-b
      - id: chay-c`,
        explain: 'Gộp nhiều bộ vào một stage: các bước dùng chung một máy `linux` và chạy nối tiếp. Cách chia không đổi được sàn thời gian — chỉ số máy mới đổi được.',
      },
    ],
    takeaways: [
      'Đồ thị quyết định việc nào được phép song song; số máy quyết định việc nào thật sự song song.',
      'Khi máy là thứ khan hiếm, tổng công việc chia cho số máy là sàn cứng — không cách chia stage nào phá được nó.',
      'Làm phẳng đồ thị chỉ giúp một lần; sau đó chỉ còn giảm việc hoặc thêm máy.',
    ],
    pitfalls: [
      'Chia càng nhỏ càng nhanh. Nó hấp dẫn vì biểu đồ trông song song hơn, nhưng hai máy vẫn là hai máy — hai mươi stage và mười stage về đích cùng lúc.',
      'Xoá bớt bộ kiểm thử cho nhanh. Ba trục sẽ đẹp lên ngay, và `tong-hop` sẽ đỏ ngay — đó là lý do nó có mặt.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Mười bộ độc lập, để bộ xếp lịch tự nhét',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 3, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'kt-a', kind: 'unit-test', name: 'Bộ kiểm thử A', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-a', name: 'Chạy bộ A', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-a'] }],
      },
      {
        id: 'kt-b', kind: 'unit-test', name: 'Bộ kiểm thử B', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-b', name: 'Chạy bộ B', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-b'] }],
      },
      {
        id: 'kt-c', kind: 'unit-test', name: 'Bộ kiểm thử C', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-c', name: 'Chạy bộ C', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-c'] }],
      },
      {
        id: 'kt-d', kind: 'unit-test', name: 'Bộ kiểm thử D', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-d', name: 'Chạy bộ D', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-d'] }],
      },
      {
        id: 'kt-e', kind: 'unit-test', name: 'Bộ kiểm thử E', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-e', name: 'Chạy bộ E', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-e'] }],
      },
      {
        id: 'kt-f', kind: 'unit-test', name: 'Bộ kiểm thử F', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-f', name: 'Chạy bộ F', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-f'] }],
      },
      {
        id: 'kt-g', kind: 'unit-test', name: 'Bộ kiểm thử G', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-g', name: 'Chạy bộ G', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-g'] }],
      },
      {
        id: 'kt-h', kind: 'unit-test', name: 'Bộ kiểm thử H', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-h', name: 'Chạy bộ H', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-h'] }],
      },
      {
        id: 'kt-i', kind: 'unit-test', name: 'Bộ kiểm thử I', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-i', name: 'Chạy bộ I', durationTicks: 3, blocking: true, requires: ['ma-nguon'], produces: ['kq-i'] }],
      },
      {
        id: 'kt-j', kind: 'unit-test', name: 'Bộ kiểm thử J', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-j', name: 'Chạy bộ J', durationTicks: 3, blocking: true, requires: ['ma-nguon'], produces: ['kq-j'] }],
      },
      {
        id: 'tong-hop', kind: 'gate', name: 'Tổng hợp kết quả',
        dependsOn: ['kt-a', 'kt-b', 'kt-c', 'kt-d', 'kt-e', 'kt-f', 'kt-g', 'kt-h', 'kt-i', 'kt-j'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'gom-kq', name: 'Gom kết quả mười bộ', durationTicks: 1, blocking: true,
          requires: ['kq-a', 'kq-b', 'kq-c', 'kq-d', 'kq-e', 'kq-f', 'kq-g', 'kq-h', 'kq-i', 'kq-j'],
        }],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Hai làn gộp sẵn, cân bằng bằng tay',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 3, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'kt-lan-1', kind: 'unit-test', name: 'Làn kiểm thử 1', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [
          { id: 'chay-a', name: 'Chạy bộ A', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-a'] },
          { id: 'chay-b', name: 'Chạy bộ B', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-b'] },
          { id: 'chay-c', name: 'Chạy bộ C', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-c'] },
          { id: 'chay-f', name: 'Chạy bộ F', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-f'] },
          { id: 'chay-i', name: 'Chạy bộ I', durationTicks: 3, blocking: true, requires: ['ma-nguon'], produces: ['kq-i'] },
        ],
      },
      {
        id: 'kt-lan-2', kind: 'unit-test', name: 'Làn kiểm thử 2', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [
          { id: 'chay-d', name: 'Chạy bộ D', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-d'] },
          { id: 'chay-e', name: 'Chạy bộ E', durationTicks: 5, blocking: true, requires: ['ma-nguon'], produces: ['kq-e'] },
          { id: 'chay-g', name: 'Chạy bộ G', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-g'] },
          { id: 'chay-h', name: 'Chạy bộ H', durationTicks: 4, blocking: true, requires: ['ma-nguon'], produces: ['kq-h'] },
          { id: 'chay-j', name: 'Chạy bộ J', durationTicks: 3, blocking: true, requires: ['ma-nguon'], produces: ['kq-j'] },
        ],
      },
      {
        id: 'tong-hop', kind: 'gate', name: 'Tổng hợp kết quả', dependsOn: ['kt-lan-1', 'kt-lan-2'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'gom-kq', name: 'Gom kết quả mười bộ', durationTicks: 1, blocking: true,
          requires: ['kq-a', 'kq-b', 'kq-c', 'kq-d', 'kq-e', 'kq-f', 'kq-g', 'kq-h', 'kq-i', 'kq-j'],
        }],
      },
    ],
  },
};
