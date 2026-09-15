import type { CicdLevel } from '../contract.ts';

/**
 * C06 — cache là một cái đệm, không phải phép màu.
 *
 * Đường ống ban đầu ĐÃ CÓ cache, khoá đã đúng, và cache trúng đều đặn — chỉ có
 * điều nó được gắn vào bước `tai-ma` dài 2 tick. `savesTicks: 8` bị kẹp về 2
 * (hợp đồng: engine kẹp về `durationTicks`, vì thời lượng âm làm đường găng sai
 * theo một cách không truy ra được). Cache chạy hoàn hảo và tiết kiệm được 2
 * tick trên một đường ống 20 tick.
 *
 * Đó là chỗ level này khác một bài "thêm cache vào": người chơi không học cú
 * pháp, họ học rằng **cache chỉ trả lại đúng phần thời gian của bước nó đứng**.
 * Thước đo là trục runner-phút, và nó nói thẳng: bản ban đầu đốt 15,3 phút mỗi
 * lượt, hai lời giải đốt 13,3.
 *
 * ## Vòng đổi của `khoa-phu-thuoc`
 *
 * `changesEvery: 4` với đúng 4 commit nghĩa là tệp khoá đổi ở ĐÚNG commit cuối.
 * Nên mỗi lượt có ba lần trúng và một lần trượt, và người chơi nhìn thấy cả hai
 * phía: cache giúp được gì, và ngày nó trượt thì đường ống trở lại đúng như cũ.
 * Một cache trúng 100% sẽ dạy sai — trong đời thật nó không bao giờ trúng 100%.
 *
 * ## Hai lời giải khác nhau THẬT
 *
 * - **A — một cache thô cho cả bước cài gói**: khoá `[khoa-phu-thuoc]`, tiết kiệm
 *   8 tick. Một mục cache, một lần trúng mỗi commit.
 * - **B — hai cache nhỏ, mỗi bước một cái**: `tai-goi` tiết kiệm 5 tick với khoá
 *   `[khoa-phu-thuoc]`, `dung-cay` tiết kiệm 3 tick với khoá
 *   `[khoa-phu-thuoc, cau-hinh]`. Hai mục cache, hai lần trúng mỗi commit.
 *
 * Cả hai xuống đúng 12 tick. Khoá của B **rộng hơn** khoá của A mà vẫn trúng y
 * hệt, vì `cau-hinh` có `changesEvery: 100` — nó không đổi lần nào trong bốn
 * commit. Đó là mồi cho C07: khoá rộng không giết cache, khoá rộng vào thứ ĐỔI
 * MỖI COMMIT mới giết. Mục thưởng `cacheHitsAtLeast` mức cao trao cho B.
 */
export const c06: CicdLevel = {
  id: 'cicd-c06-cache-la-buffer',
  chapter: 'ci',
  title: 'Cache là cái đệm, không phải phép màu',
  mission: 'Cache đang chạy đúng mà đường ống vẫn chậm. Đặt nó vào chỗ tốn thời gian thật.',
  brief: `Đường ống này đã có cache, và cache đang hoạt động: ba trên bốn commit đều
trúng, không lần nào trượt oan. Vậy mà một commit vẫn mất 180 giây.

Hãy xem cache đang nằm ở bước nào và bước đó dài bao nhiêu. Một cache chỉ trả lại
được đúng phần thời gian của bước nó đứng — khai tiết kiệm 80 giây cho một bước
dài 20 giây thì bạn nhận đúng 20 giây, không hơn.

Việc của bạn: chuyển cache sang chỗ tốn thời gian thật. Bạn chỉ sửa được phần
cache — không thêm stage, không sửa cạnh, không đụng thời lượng bước nào.

Có hơn một cách chia cache, và chúng cho ra số lần trúng khác nhau. Để ý khoá:
tệp khoá phụ thuộc đổi ở commit cuối cùng, còn tệp cấu hình build thì không đổi
lần nào trong bốn commit này.`,
  difficulty: 'intermediate',
  initialWorkflow: {
    name: 'Cache đặt nhầm chỗ',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'],
          // Khoá đúng, cache trúng thật — và tiết kiệm được đúng 2 tick, vì
          // engine kẹp `savesTicks` về `durationTicks` của bước.
          cache: {
            id: 'cache-goi',
            keyParts: ['khoa-phu-thuoc'],
            invalidatedBy: ['khoa-phu-thuoc'],
            savesTicks: 8,
          },
        }],
      },
      {
        id: 'cai-dat', kind: 'build', name: 'Cài gói và build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [
          { id: 'tai-goi', name: 'Tải gói phụ thuộc', durationTicks: 8, blocking: true, requires: ['ma-nguon'] },
          { id: 'dung-cay', name: 'Biên dịch cây mã', durationTicks: 4, blocking: true, produces: ['ban-dung'] },
        ],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 6, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
    ],
  },
  workload: {
    runners: [{ id: 'linux', label: 'Máy Linux', count: 2 }],
    inputs: [
      { id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 },
      { id: 'khoa-phu-thuoc', label: 'Tệp khoá phụ thuộc', changesEvery: 4 },
      { id: 'cau-hinh', label: 'Tệp cấu hình build', changesEvery: 100 },
    ],
    // Bốn commit, giãn 30 tick. Giãn rộng hơn một lượt chạy là bắt buộc ở level
    // cache: mục cache chỉ được ghi khi lần thử KẾT THÚC, nên hai commit chồng
    // nhau sẽ cùng trượt rồi cùng ghi, và số lần trúng đọc ra sai.
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 30 },
      { id: 'c3', tick: 60 },
      { id: 'c4', tick: 90 },
    ],
  },
  evaluation: { baseSeed: 1906, passes: 4 },
  editable: ['cache'],
  allowedKinds: null,
  objectives: [
    {
      id: 'du-nhanh',
      label: 'Một commit đi hết đường ống trong dưới 140 giây',
      check: 'leadTimeUnder',
      args: { seconds: 140 },
      required: true,
    },
    {
      id: 'do-tai-nguyen',
      label: 'Không đốt quá 14 runner-phút mỗi lượt',
      check: 'runnerMinutesUnder',
      args: { minutes: 14 },
      required: true,
    },
    {
      id: 'cache-con-trung',
      label: 'Cache vẫn trúng ít nhất 8 lần trong cả lần chấm',
      check: 'cacheHitsAtLeast',
      args: { count: 8 },
      required: true,
    },
    {
      id: 'khong-cache-oi',
      label: 'Không lần đỏ nào vì trúng phải một cache đã ôi',
      check: 'noFailureCause',
      args: { cause: 'stale-cache' },
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
      id: 'cache-min',
      label: 'Thưởng: chia cache đủ mịn để trúng ít nhất 16 lần trong cả lần chấm',
      check: 'cacheHitsAtLeast',
      args: { count: 16 },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 120,
    budgetLeadSeconds: 140,
    parThroughputPerHour: 13,
    minThroughputPerHour: 11,
    parRunnerMinutes: 13.4,
    budgetRunnerMinutes: 14,
    minGreenRate: 1,
  },
  hints: [
    'Cache đang trúng — vấn đề không nằm ở khoá. Hãy xem nó gắn vào bước nào, và bước đó dài bao nhiêu tick.',
    'Bước `tai-goi` dài 8 tick và nó tải đúng thứ mà tệp khoá phụ thuộc mô tả. Đó là chỗ một cache trả lại được nhiều nhất.',
    'Có thể gắn một cache duy nhất cho `tai-goi`, hoặc gắn hai cache nhỏ cho cả `tai-goi` lẫn `dung-cay`. Cách thứ hai trúng nhiều lần hơn — và khoá của nó được phép rộng hơn, miễn phần rộng thêm không đổi.',
  ],
  teaching: {
    primer: `Cache trong CI hoạt động theo hai danh sách, và chúng khác nhau:

- **Khoá** — những đầu vào mà khoá cache băm vào. Khoá trùng lượt trước ⇒ **trúng**.
- **Thứ nội dung phụ thuộc** — những đầu vào mà nội dung cache thật sự dựa vào.
  Còn khớp ⇒ nội dung **còn dùng được**.

Level này cả hai đang bằng nhau nên chưa có gì sai; C07 và C08 là hai cách chúng
lệch nhau.

Điều cần nhớ ở đây đơn giản hơn: một cache tiết kiệm được **nhiều nhất là thời
lượng của chính bước nó đứng**. Nó không rút ngắn được bước khác, không rút ngắn
được thời gian chờ máy, và không rút ngắn được stage nào khác trên đường găng.
Khai tiết kiệm 80 giây cho một bước 20 giây thì bạn nhận 20 giây — phần dôi ra
bị kẹp đi, im lặng.

Nên đặt cache là một bài toán đọc số: tìm bước tốn nhất mà kết quả của nó *lặp
lại được giữa hai commit*, rồi đặt cache ở đó. Cài gói phụ thuộc là ví dụ kinh
điển, vì danh sách gói chỉ đổi khi tệp khoá đổi — vài lần một tháng, không phải
mỗi commit.

Và cache không bao giờ trúng 100%. Ngày tệp khoá đổi, đường ống quay về đúng tốc
độ cũ. Hãy chọn ngưỡng sao cho ngày đó vẫn chấp nhận được.`,
    cheatsheet: [
      {
        snippet: 'cache.keyParts: [khoa-phu-thuoc]',
        explain: 'Khoá cache băm vào đâu. Trùng với lượt trước thì trúng; khác một phần tử là khoá mới.',
      },
      {
        snippet: 'cache.savesTicks: 8',
        explain: 'Tiết kiệm được bao nhiêu khi trúng. Bị kẹp về thời lượng của chính bước — khai dư không có tác dụng.',
      },
      {
        snippet: 'steps: [{ cache: ... }]',
        explain: 'Cache gắn vào BƯỚC, không gắn vào stage. Đặt nhầm bước là đặt nhầm chỗ tiết kiệm.',
      },
    ],
    takeaways: [
      'Một cache tiết kiệm được nhiều nhất bằng đúng thời lượng của bước nó đứng — phần khai dư bị kẹp đi trong im lặng.',
      'Chỗ đáng cache là bước tốn nhất mà kết quả lặp lại được giữa hai commit, thường là cài gói phụ thuộc.',
      'Cache không bao giờ trúng 100%: hãy chọn ngưỡng sống được cả trong ngày nó trượt.',
      'Khoá rộng hơn không tự động tệ hơn — chỉ tệ khi phần rộng thêm là thứ đổi thường xuyên.',
    ],
    pitfalls: [
      'Nâng `savesTicks` cho bước hiện tại thay vì chuyển cache đi. Nó hấp dẫn vì sửa một con số dễ hơn đọc lại đường ống, nhưng engine kẹp về thời lượng bước nên con số đó không đi tới đâu.',
      'Kết luận "cache không hiệu quả" khi thấy đường ống vẫn chậm. Cache đang trúng đúng như thiết kế — vấn đề là nó đứng ở một bước rẻ tiền.',
      'Cache mọi bước cho chắc. Mỗi mục cache là một khoá phải khớp và một lần khôi phục phải chạy; cache một bước 1 tick không mua được gì.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Một cache thô đặt vào bước tải gói',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'cai-dat', kind: 'build', name: 'Cài gói và build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [
          {
            id: 'tai-goi', name: 'Tải gói phụ thuộc', durationTicks: 8, blocking: true, requires: ['ma-nguon'],
            cache: {
              id: 'cache-goi',
              keyParts: ['khoa-phu-thuoc'],
              invalidatedBy: ['khoa-phu-thuoc'],
              savesTicks: 8,
            },
          },
          { id: 'dung-cay', name: 'Biên dịch cây mã', durationTicks: 4, blocking: true, produces: ['ban-dung'] },
        ],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 6, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Hai cache mịn, một cái khoá rộng hơn mà vẫn trúng',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'cai-dat', kind: 'build', name: 'Cài gói và build', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [
          {
            id: 'tai-goi', name: 'Tải gói phụ thuộc', durationTicks: 8, blocking: true, requires: ['ma-nguon'],
            cache: {
              id: 'cache-tai-goi',
              keyParts: ['khoa-phu-thuoc'],
              invalidatedBy: ['khoa-phu-thuoc'],
              savesTicks: 5,
            },
          },
          {
            id: 'dung-cay', name: 'Biên dịch cây mã', durationTicks: 4, blocking: true, produces: ['ban-dung'],
            cache: {
              // Khoá RỘNG hơn A — thêm `cau-hinh`. Vẫn trúng đúng ba trên bốn
              // commit, vì `cau-hinh` có `changesEvery: 100`: nó không đổi lần
              // nào trong lượt chấm này. Đây là nửa còn lại của bài học C07.
              id: 'cache-bien-dich',
              keyParts: ['khoa-phu-thuoc', 'cau-hinh'],
              invalidatedBy: ['khoa-phu-thuoc'],
              savesTicks: 3,
            },
          },
        ],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 6, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['cai-dat'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
    ],
  },
};
