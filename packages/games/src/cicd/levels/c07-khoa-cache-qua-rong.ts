import type { CicdLevel } from '../contract.ts';

/**
 * C07 — KHOÁ CACHE QUÁ RỘNG. Level thứ hai của lane này được dựng kỹ.
 *
 * ## Level dựng thế nào để khái niệm LỘ RA
 *
 * Khoá ban đầu là `[khoa-phu-thuoc, ma-nguon, tai-nguyen]` — nhìn qua thì đây là
 * một khoá *cẩn thận*: nó băm vào mọi thứ có thể ảnh hưởng tới thư mục gói. Và
 * chính vì cẩn thận mà nó chết: `ma-nguon` có `changesEvery: 1`, nên khoá KHÔNG
 * BAO GIỜ trùng lượt trước, và cache không trúng lấy một lần trong cả lần chấm.
 *
 * Bốn quyết định làm cho điều đó đọc ra được thay vì phải được giải thích:
 *
 * **1. Cache trông như đang chạy.** Không có lỗi nào, không stage nào đỏ, mọi
 * lượt đều xanh. Triệu chứng DUY NHẤT là ba trục: lead 230 giây và 22,5
 * runner-phút, y hệt một đường ống không có cache. Một cache hỏng im lặng đúng
 * như trong đời thật.
 *
 * **2. Hai đầu vào còn lại đổi với hai NHỊP khác nhau.** `khoa-phu-thuoc` không
 * đổi lần nào trong năm commit; `tai-nguyen` đổi đúng một lần. Nhờ vậy thu hẹp
 * khoá không phải một nút bật/tắt: bỏ `ma-nguon` được 3 lần trúng, bỏ thêm
 * `tai-nguyen` được 4 lần. Người chơi đọc được một GRADIENT, không phải một đáp
 * án đúng/sai.
 *
 * **3. `invalidatedBy` hẹp hơn khoá và người chơi không sửa được nó.** Nội dung
 * cache chỉ phụ thuộc `khoa-phu-thuoc`. Đó là lý do thu hẹp khoá về đúng
 * `[khoa-phu-thuoc]` là AN TOÀN chứ không phải liều — và là lý do level này
 * không có lần đỏ `stale-cache` nào, dù C08 (lane khác) sẽ dạy đúng chiều ngược.
 *
 * **4. Có một ngưỡng runner-phút.** Không có nó thì "để nguyên khoá rộng, thêm
 * máy" là một lời giải, và nó dạy sai hoàn toàn: thêm máy không làm một cache
 * trượt bớt trượt.
 *
 * ## Hai lời giải khác nhau THẬT
 *
 * - **A — khoá đúng bằng thứ nội dung phụ thuộc**: `[khoa-phu-thuoc]`. Trúng 4/5
 *   commit, 16,5 runner-phút. Giữ nguyên hình dạng đường ống.
 * - **B — thu hẹp một nửa, và tách bước tải gói thành stage riêng**:
 *   `[khoa-phu-thuoc, tai-nguyen]` gắn vào một stage `tai-goi` đứng riêng. Trúng
 *   3/5 commit, 18 runner-phút — đắt hơn A nhưng vẫn trong ngân sách.
 *
 * B tốn hơn A và điều đó là CHỦ Ý: hai lời giải không cần ngang điểm, chúng chỉ
 * cần cùng AC. Ngưỡng `cacheHitsAtLeast` bắt buộc đặt ở 12 (3 lần × 4 lượt) nên
 * B qua, còn mục thưởng đặt ở 16 nên A ăn thêm. Đặt ngưỡng bắt buộc ở 16 là ghim
 * level vào đúng một khoá, và khi đó "hai lời giải" chỉ còn là một lời giải kèm
 * một bản sao.
 */
export const c07: CicdLevel = {
  id: 'cicd-c07-khoa-cache-qua-rong',
  chapter: 'ci',
  title: 'Khoá cache quá rộng',
  mission: 'Cache khai báo đầy đủ, không lỗi nào, và không trúng lần nào. Tìm ra vì sao.',
  brief: `Đường ống này có cache cho bước tải gói phụ thuộc, và người viết nó đã rất cẩn
thận: khoá băm vào tệp khoá phụ thuộc, vào mã nguồn, và vào thư mục tài nguyên —
mọi thứ có thể ảnh hưởng tới kết quả.

Không lượt nào đỏ. Không stage nào cảnh báo. Và một commit vẫn mất 230 giây, đúng
bằng lúc chưa có cache.

Mở bảng cache ra xem số lần trúng. Rồi hỏi: **khoá của lượt này có bao giờ trùng
khoá của lượt trước không?** Một khoá chỉ trùng khi mọi thành phần của nó đều
giữ nguyên — nên chỉ cần MỘT thành phần đổi ở mọi commit là khoá không bao giờ
lặp lại, và một cache không bao giờ trúng chỉ là một khoản chi phí.

Ở level này bạn sửa được phần cache và được tách/gộp stage. Thứ bạn KHÔNG sửa
được là nhịp đổi của các đầu vào — bảng bên trái nói rõ cái nào đổi mỗi commit,
cái nào vài commit một lần, cái nào không đổi lần nào.`,
  difficulty: 'advanced',
  initialWorkflow: {
    name: 'Khoá cache băm vào mọi thứ',
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
            id: 'tai-goi', name: 'Tải gói phụ thuộc', durationTicks: 12, blocking: true, requires: ['ma-nguon'],
            cache: {
              id: 'cache-goi',
              // ⛔ `ma-nguon` có `changesEvery: 1`. Một thành phần đổi ở mọi
              // commit là đủ để khoá không bao giờ lặp lại — hai thành phần kia
              // ổn định đến mấy cũng không cứu được.
              keyParts: ['khoa-phu-thuoc', 'ma-nguon', 'tai-nguyen'],
              // Sự thật của level, người chơi không sửa: nội dung thư mục gói
              // chỉ phụ thuộc tệp khoá. Đó là vì sao thu hẹp khoá ở đây là an
              // toàn, không phải liều.
              invalidatedBy: ['khoa-phu-thuoc'],
              savesTicks: 9,
            },
          },
          { id: 'dung-cay', name: 'Biên dịch cây mã', durationTicks: 3, blocking: true, produces: ['ban-dung'] },
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
      { id: 'khoa-phu-thuoc', label: 'Tệp khoá phụ thuộc', changesEvery: 10 },
      { id: 'tai-nguyen', label: 'Thư mục tài nguyên', changesEvery: 3 },
    ],
    // Năm commit giãn 30 tick, rộng hơn 23 tick của lượt chạy chậm nhất. Mục
    // cache chỉ ghi khi lần thử KẾT THÚC, nên hai commit chồng nhau sẽ cùng
    // trượt rồi cùng ghi một mục — và số lần trúng đọc ra sẽ sai theo hướng
    // thấp hơn thật, đúng ở level mà số lần trúng LÀ phép đo.
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 30 },
      { id: 'c3', tick: 60 },
      { id: 'c4', tick: 90 },
      { id: 'c5', tick: 120 },
    ],
  },
  evaluation: { baseSeed: 1907, passes: 4 },
  /*
   * `edges` THÊM 2026-09-16, và nó sửa một lỗi dữ liệu chứ không nới quyền.
   *
   * `altSolutionWorkflow` của chính level này tách `cai-dat` thành `tai-goi` +
   * `dung-cay`, rồi trỏ `kiem-tra` và `lint` sang `dung-cay`. Hai phép trỏ lại
   * đó là sửa CẠNH trên stage đã có sẵn — không có `edges` thì người chơi không
   * làm được, tức lời giải thay thế KHÔNG ĐI TỚI ĐƯỢC, và AC-F ("mỗi level ≥ 2
   * lời giải cùng qua") là một lời khai chứ không phải một phép đo.
   *
   * Vì sao nó nằm im tới hôm nay: `editable` chưa bao giờ được MÃ NÀO đọc — chỗ
   * duy nhất nhắc tới nó là một chú thích trong `contract.ts`. `hydrate.ts` là
   * hộ tiêu dùng đầu tiên, và ô AC của nó đỏ ngay ở level này. Một trường không
   * ai đọc thì trôi trong im lặng; xem `rules/wired-not-just-present.md`.
   *
   * Nói chung hơn: **cho thêm/bớt stage thì phải cho nối lại stage.** Bỏ một
   * stage đi mà không sửa được cạnh trỏ tới nó chỉ để lại một phụ thuộc trỏ vào
   * hư không.
   */
  editable: ['cache', 'stages', 'edges'],
  allowedKinds: null,
  objectives: [
    {
      id: 'cache-phai-trung',
      label: 'Cache trúng ít nhất 12 lần trong cả lần chấm',
      check: 'cacheHitsAtLeast',
      args: { count: 12 },
      required: true,
    },
    {
      id: 'du-nhanh',
      label: 'Một commit đi hết đường ống trong dưới 170 giây',
      check: 'leadTimeUnder',
      args: { seconds: 170 },
      required: true,
    },
    {
      id: 'do-tai-nguyen',
      label: 'Không đốt quá 19 runner-phút mỗi lượt — không được mua tốc độ bằng máy',
      check: 'runnerMinutesUnder',
      args: { minutes: 19 },
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
      id: 'khoa-chat-nhat',
      label: 'Thưởng: thu khoá về đúng thứ nội dung phụ thuộc, trúng ít nhất 16 lần',
      check: 'cacheHitsAtLeast',
      args: { count: 16 },
      required: false,
    },
  ],
  thresholds: {
    parLeadSeconds: 140,
    budgetLeadSeconds: 170,
    parThroughputPerHour: 13.4,
    minThroughputPerHour: 12,
    parRunnerMinutes: 16.5,
    budgetRunnerMinutes: 19,
    minGreenRate: 1,
  },
  hints: [
    'Đường ống không đỏ, nên đừng tìm lỗi. Tìm số: cache trúng bao nhiêu lần trong cả lần chấm? Nếu là 0 thì khoá là chỗ phải nhìn.',
    'Một khoá trùng lượt trước khi MỌI thành phần của nó giữ nguyên. Đối chiếu từng thành phần với cột "đổi mỗi mấy commit" ở bảng đầu vào.',
    'Bỏ `ma-nguon` khỏi khoá là đủ qua. Bỏ thêm `tai-nguyen` thì trúng nhiều hơn nữa — nội dung thư mục gói chỉ phụ thuộc tệp khoá phụ thuộc, nên hai phần kia không bảo vệ bạn khỏi bất cứ điều gì.',
  ],
  teaching: {
    primer: `Một cache có hai danh sách, và chúng KHÔNG phải một:

- **Khoá** là thứ bạn chọn. Khoá trùng lượt trước ⇒ trúng.
- **Thứ nội dung phụ thuộc** là sự thật về cái đang được lưu. Còn khớp ⇒ nội dung
  dùng được.

Bỏ sót ở danh sách thứ hai thì bạn trúng một cache đã ôi — đó là bài của level
sau. Còn thừa ở danh sách thứ nhất thì bạn **không bao giờ trúng**, và đó là bài
ở đây.

Điều làm lỗi này khó thấy: nó hoàn toàn im lặng. Không có thông báo "cache
trượt", không có cảnh báo, không có gì đỏ. Đường ống chạy đúng, chỉ là nó chạy
đúng bằng tốc độ lúc chưa có cache — cộng thêm phần chi phí lưu một mục cache mới
ở mỗi lượt, mục mà sẽ không bao giờ có ai đọc.

Quy tắc gọn: **khoá nên đúng bằng những gì nội dung thật sự phụ thuộc**. Thêm một
đầu vào vào khoá không làm bạn an toàn hơn; nó chỉ làm cache trượt nhiều hơn. Độ
an toàn nằm ở danh sách thứ hai, và danh sách đó là một sự thật của hệ thống chứ
không phải một lựa chọn của bạn.

Cách kiểm nhanh khi bạn nghi một khoá: hỏi mỗi thành phần một câu — *"cái này đổi
mấy lần một tuần?"* Bất cứ thứ gì đổi theo mỗi commit mà nằm trong khoá thì cache
đã chết rồi.`,
    cheatsheet: [
      {
        where: 'panel',
        control: 'cache',
        label: 'Cache → Khoá cache gồm những đầu vào nào',
        explain: 'Khoá chỉ trùng lượt trước khi MỌI đầu vào đã chọn giữ nguyên. Chọn "Mã nguồn" (đổi mỗi 1 commit) là khoá không bao giờ lặp lại, và cache không bao giờ trúng.',
      },
      {
        where: 'panel',
        control: 'cache',
        label: 'Cache → Cài gói và build → Tải gói phụ thuộc',
        explain: 'Cache đang bật và không báo lỗi nào — nó chỉ không trúng lần nào. Đọc số lần trúng trong lượt chấm, đừng đi tìm ô đỏ.',
      },
      {
        where: 'panel',
        control: 'cache',
        label: 'Cache',
        explain: 'Bạn chỉ bật/tắt cache và chọn đầu vào tạo khoá; nội dung gói thật sự phụ thuộc vào gì và trúng thì tiết kiệm bao nhiêu tick là sự thật của level. Thêm đầu vào vào khoá không làm nó an toàn hơn.',
      },
    ],
    takeaways: [
      'Chỉ cần một thành phần khoá đổi theo mỗi commit là cache không bao giờ trúng, dù mọi thành phần khác đứng yên.',
      'Khoá quá rộng hỏng trong im lặng: không đỏ, không cảnh báo, chỉ là ba trục điểm y hệt lúc chưa có cache.',
      'Độ an toàn của cache nằm ở danh sách "nội dung phụ thuộc vào gì", không nằm ở việc nhồi thêm thành phần vào khoá.',
      'Khi nghi một khoá, hỏi từng thành phần "cái này đổi mấy lần một tuần" — câu trả lời là tỉ lệ trúng của bạn.',
    ],
    pitfalls: [
      'Nhồi mọi thứ vào khoá cho an toàn. Nó hấp dẫn vì nghe giống nguyên tắc phòng thủ, nhưng nó đổi một rủi ro (dùng nhầm cache cũ) lấy một điều chắc chắn (không bao giờ dùng được cache).',
      'Nâng `savesTicks` khi thấy cache không giúp gì. Số tiết kiệm chỉ được áp khi TRÚNG — nhân một số lớn với không lần nào vẫn ra không.',
      'Thêm máy chạy cho nhanh. Đường ống sẽ nhanh hơn thật, và cache vẫn trượt đúng như cũ — đó là lý do level này có ngưỡng runner-phút.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Khoá đúng bằng tệp khoá phụ thuộc',
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
            id: 'tai-goi', name: 'Tải gói phụ thuộc', durationTicks: 12, blocking: true, requires: ['ma-nguon'],
            cache: {
              id: 'cache-goi',
              keyParts: ['khoa-phu-thuoc'],
              invalidatedBy: ['khoa-phu-thuoc'],
              savesTicks: 9,
            },
          },
          { id: 'dung-cay', name: 'Biên dịch cây mã', durationTicks: 3, blocking: true, produces: ['ban-dung'] },
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
    name: 'Bỏ mã nguồn khỏi khoá, tách bước tải gói thành stage riêng',
    stages: [
      {
        id: 'clone', kind: 'clone', name: 'Tải mã nguồn', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'tai-ma', name: 'Tải mã nguồn', durationTicks: 2, blocking: true, produces: ['ma-nguon'] }],
      },
      {
        id: 'tai-goi', kind: 'restore-cache', name: 'Tải gói phụ thuộc', dependsOn: ['clone'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'tai-goi', name: 'Tải gói phụ thuộc', durationTicks: 12, blocking: true, requires: ['ma-nguon'],
          cache: {
            id: 'cache-goi',
            // Vẫn còn `tai-nguyen` — rộng hơn A, nên trượt thêm một lần ở commit
            // mà thư mục tài nguyên đổi. Vẫn đủ 3 lần trúng mỗi lượt để AC.
            keyParts: ['khoa-phu-thuoc', 'tai-nguyen'],
            invalidatedBy: ['khoa-phu-thuoc'],
            savesTicks: 9,
          },
        }],
      },
      {
        id: 'dung-cay', kind: 'build', name: 'Biên dịch cây mã', dependsOn: ['tai-goi'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{
          id: 'bien-dich', name: 'Biên dịch cây mã', durationTicks: 3, blocking: true,
          requires: ['ma-nguon'], produces: ['ban-dung'],
        }],
      },
      {
        id: 'kiem-tra', kind: 'unit-test', name: 'Kiểm thử đơn vị', dependsOn: ['dung-cay'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'chay-test', name: 'Chạy test đơn vị', durationTicks: 6, blocking: true, requires: ['ban-dung'] }],
      },
      {
        id: 'lint', kind: 'lint', name: 'Soi mã', dependsOn: ['dung-cay'],
        blocking: true, retries: 0, runnerClass: 'linux',
        steps: [{ id: 'soi-ma', name: 'Soi quy ước mã nguồn', durationTicks: 4, blocking: true, requires: ['ban-dung'] }],
      },
    ],
  },
};
