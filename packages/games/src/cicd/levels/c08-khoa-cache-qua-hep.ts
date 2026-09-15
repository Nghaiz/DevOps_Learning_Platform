import type { CicdLevel } from '../contract.ts';

/**
 * C08 — **khoá cache quá HẸP**.
 *
 * Đây là level đối xứng với C07 và là cái khó đọc hơn nhiều. C07 sai theo kiểu
 * *lãng phí*: khoá băm vào một đầu vào đổi mỗi commit nên không bao giờ trúng,
 * và triệu chứng là một bước chậm — khó chịu, nhưng thành thật. C08 sai theo
 * kiểu *nói dối*: khoá THIẾU một đầu vào mà nội dung thật sự phụ thuộc vào, nên
 * nó **trúng** một mục cache đã ôi. Bảng thống kê khoe tỷ lệ trúng cache cao,
 * và đường ống đỏ ở một bước không liên quan gì tới đoạn mã vừa sửa.
 *
 * ## Level này dựng ra sao để khái niệm LỘ RA
 *
 * Ba thứ phải cùng có mặt, thiếu một là bài học tụt xuống thành một câu chữ:
 *
 * 1. **Khoảng cách giữa hai danh sách là dữ liệu, không phải lời kể.**
 *    `keyParts: ['khoa-phu-thuoc']` — thứ người chơi sửa được.
 *    `invalidatedBy: ['khoa-phu-thuoc', 'cau-hinh-bien-dich']` — sự thật của
 *    level, người chơi không thấy trực tiếp. Chính `cau-hinh-bien-dich` bị
 *    thiếu ở vế đầu LÀ lỗi, và nó đo được chứ không phải kể được.
 *
 * 2. **Chu kỳ đổi của hai đầu vào phải LỆCH nhau.** `cau-hinh-bien-dich` đổi
 *    mỗi 2 commit, `khoa-phu-thuoc` mỗi 4. Nếu hai chu kỳ trùng nhau thì khoá
 *    hẹp và khoá rộng cho ra cùng một chuỗi ở mọi commit, và level không bao
 *    giờ kích hoạt được — một level vĩnh viễn dễ, không đỏ ở đâu cả.
 *
 * 3. **Phải đủ commit để thấy một CHUỖI, không phải một lần xui.** Sáu commit:
 *    ba trong số đó trúng một cache ôi và đỏ. Một commit thì người chơi đọc ra
 *    "chắc tại mình", sáu commit thì họ đọc ra một quy luật.
 *
 * ## Cái bẫy đo được mà level này cố tình gài
 *
 * Với khoá HẸP, `cacheHitsAtLeast` đếm được **4 lần trúng mỗi lượt** (3 lần ôi
 * + 1 lần đúng). Với khoá ĐÃ SỬA chỉ còn **2 lần trúng**. Nghĩa là phiên bản
 * HỎNG có tỷ lệ trúng cache CAO GẤP ĐÔI phiên bản đã sửa.
 *
 * Đó là lý do `cacheHitsAtLeast` ở đây là mục tiêu THƯỞNG chứ không bắt buộc:
 * một ô nghiệm thu bắt buộc dựng trên số lần trúng sẽ được thoả mãn bởi chính
 * cái workflow hỏng — đúng hình dạng "một màu xanh không chứng minh gì".
 *
 * ## Hai lời giải, khác nhau ở ĐƯỜNG ĐI chứ không ở tên
 *
 * - `solutionWorkflow` — **nới khoá**: thêm `cau-hinh-bien-dich` vào `keyParts`
 *   cho hai danh sách khớp nhau. Còn 2 lần trúng mỗi lượt, cả hai đều đúng nội
 *   dung, và bước tiết kiệm thật 7 tick ở những commit đó.
 * - `altSolutionWorkflow` — **bỏ cache hẳn**: gỡ `cache` khỏi bước. Không lần
 *   trúng nào, không lần ôi nào, bước luôn tốn đủ 9 tick. Chậm hơn ở hai
 *   commit, nhưng ĐÚNG ở cả sáu.
 *
 * Hai đường này không phải một đồ thị đổi tên: một đường giữ cache và sửa khoá,
 * một đường vứt cơ chế đi. p50 lead time của chúng bằng nhau (bốn trong sáu
 * commit trượt cache ở cả hai đường), nên ô lead time không ghim ai vào hình
 * dạng nào — đúng điều kiện để chấm theo kết quả.
 */
export const c08: CicdLevel = {
  id: 'cicd-c08-khoa-cache-qua-hep',
  chapter: 'ci',
  title: 'Cache trúng nhiều hơn, mà đường ống lại đỏ',
  mission: 'Làm bước khôi phục thư viện thôi lấy nhầm bản đã ôi, không commit nào đỏ.',
  brief: `Đường ống này trúng cache rất nhiều — bảng thống kê khoe tỷ lệ trúng cao nhất từ
trước tới nay. Nó cũng đỏ ở ba trong sáu commit gần đây, và lần nào cũng đỏ ở
bước biên dịch, trong khi đoạn mã người ta vừa sửa chẳng liên quan gì tới đó.

Khoá cache hiện băm vào \`khoa-phu-thuoc\`. Nội dung thư viện đã dựng thì phụ
thuộc vào nhiều thứ hơn thế. Khi khoá trùng mà nội dung đã khác, đường ống lấy
được một bản đúng khoá và sai nội dung — và nó không có cách nào biết.

Ba đầu vào của workspace đổi theo ba nhịp khác nhau. Bảng đầu vào nói ra nhịp
đó; việc của bạn là làm cho khoá kể đúng câu chuyện mà nội dung đang sống.`,
  difficulty: 'advanced',
  initialWorkflow: {
    name: 'Đường ống có cache nói dối',
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
            id: 'khoi-phuc-thu-vien',
            name: 'Khôi phục thư viện đã dựng',
            durationTicks: 9,
            blocking: true,
            cache: {
              id: 'thu-vien-da-dung',
              // ⚠ THIẾU `cau-hinh-bien-dich`. Đây là cả bài học, viết bằng dữ liệu.
              keyParts: ['khoa-phu-thuoc'],
              invalidatedBy: ['khoa-phu-thuoc', 'cau-hinh-bien-dich'],
              savesTicks: 7,
            },
          },
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
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 5,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 3 }],
    inputs: [
      { id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 },
      { id: 'cau-hinh-bien-dich', label: 'Cấu hình biên dịch', changesEvery: 2 },
      { id: 'khoa-phu-thuoc', label: 'Khoá phụ thuộc', changesEvery: 4 },
    ],
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 20 },
      { id: 'c3', tick: 40 },
      { id: 'c4', tick: 60 },
      { id: 'c5', tick: 80 },
      { id: 'c6', tick: 100 },
    ],
  },
  evaluation: { baseSeed: 80801, passes: 20 },
  editable: ['cache'],
  allowedKinds: null,
  objectives: [
    {
      id: 'khong-con-cache-oi',
      label: 'Không lần đỏ nào vì trúng một cache đã ôi',
      check: 'noFailureCause',
      args: { cause: 'stale-cache' },
      required: true,
    },
    {
      id: 'moi-luot-deu-xanh',
      label: 'Cả sáu commit xanh ở mọi lượt chấm',
      check: 'greenRateAtLeast',
      args: { rate: 1 },
      required: true,
    },
    {
      id: 'khong-cham-hon',
      label: 'Lead time không vượt 240 giây',
      check: 'leadTimeUnder',
      args: { seconds: 240 },
      required: true,
    },
    {
      id: 'cache-van-con-tac-dung',
      label: 'THƯỞNG: giữ được cache — ít nhất 30 lần trúng khoá trong cả lần chấm',
      check: 'cacheHitsAtLeast',
      args: { count: 30 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 80801`, 20 lượt (bảng đo ở cuối
  // `ci-muon.test.ts`): lời giải nới khoá cho lead 220s / 17.7 commit-giờ /
  // 19.67 runner-phút; lời giải bỏ cache cho 220s / 17.7 / 22.00. Mốc "chuẩn"
  // lấy theo đường tốt hơn, trần lấy trên đường tốn hơn để cả hai cùng lọt.
  thresholds: {
    parLeadSeconds: 220,
    budgetLeadSeconds: 240,
    parThroughputPerHour: 18,
    minThroughputPerHour: 16,
    parRunnerMinutes: 20,
    budgetRunnerMinutes: 23,
    minGreenRate: 1,
  },
  hints: [
    'Bảng đầu vào nói ba đầu vào đổi theo ba nhịp khác nhau. Khoá cache hiện chỉ nhắc tới một trong ba.',
    'Một lần trúng cache không có nghĩa nội dung còn dùng được. Trúng là chuyện của KHOÁ; dùng được là chuyện của NỘI DUNG.',
    'Nếu khoá không nhắc tới một đầu vào, thì đầu vào đó đổi bao nhiêu lần khoá cũng không đổi — và bạn lấy về đúng bản cũ.',
    'Hai đường ra: thêm `cau-hinh-bien-dich` vào khoá, hoặc bỏ cache đi và chịu chậm hơn ở vài commit.',
  ],
  teaching: {
    primer: `Một cache có hai danh sách, và người ta chỉ viết ra một.

Danh sách bạn viết là **khoá**: những thứ được băm lại thành một chuỗi để tra
cứu. Danh sách bạn không viết là **nội dung thật sự phụ thuộc vào cái gì**.

Khi hai danh sách khớp nhau, cache làm đúng việc của nó. Khi khoá RỘNG hơn, bạn
mất lần trúng nhưng không mất gì khác — chậm, và thành thật. Khi khoá HẸP hơn,
bạn trúng một mục mà nội dung đã ôi, và đường ống chạy tiếp với dữ liệu sai.

Triệu chứng của khoá hẹp không giống một lỗi cache chút nào: nó là một bước đỏ ở
chỗ chẳng ai đụng vào, và nó biến mất khi ai đó tình cờ sửa đúng cái đầu vào bị
thiếu trong khoá. Đó là lý do nó sống sót lâu — nó trông như một lỗi ngẫu nhiên.

Ở level này, tỷ lệ trúng cache của bản hỏng CAO HƠN bản đã sửa. Đừng để con số
đó dẫn đường.`,
    cheatsheet: [
      {
        snippet: 'keyParts: [...]',
        explain: 'Danh sách đầu vào mà khoá cache băm vào — đây là thứ bạn sửa được ở level này.',
      },
      {
        snippet: 'savesTicks: 7',
        explain: 'Số tick tiết kiệm được khi vừa trúng khoá vừa đúng nội dung; trúng mà ôi thì không tiết kiệm gì.',
      },
      {
        snippet: 'changesEvery: 2',
        explain: 'Đầu vào này đổi mỗi 2 commit — nhịp đổi khác nhau là thứ làm khoá hẹp lộ ra.',
      },
    ],
    takeaways: [
      'Trúng khoá và đúng nội dung là hai sự thật khác nhau; chỉ cái thứ hai mới đáng tin.',
      'Khoá cache phải nhắc tới MỌI đầu vào mà nội dung phụ thuộc, kể cả những đầu vào ít đổi.',
      'Tỷ lệ trúng cache cao có thể là triệu chứng của một khoá quá hẹp, không phải một chiến thắng.',
      'Bỏ cache đi là một lời giải hợp lệ: chậm và đúng vẫn hơn nhanh và sai.',
    ],
    pitfalls: [
      'Thêm retry cho bước biên dịch — hấp dẫn vì nó đỏ "lúc được lúc không", nhưng trúng cache ôi là đỏ THẬT: mọi lần thử lại đều lấy đúng bản ôi đó và đều đỏ, chỉ tốn thêm runner-phút.',
      'Băm thêm `ma-nguon` vào khoá cho chắc — nó đổi mỗi commit nên khoá không bao giờ trùng nữa, và bạn vừa đổi lỗi C08 lấy lỗi C07.',
      'Tin vào bảng tỷ lệ trúng cache — ở đúng level này con số đó thưởng cho bản hỏng.',
    ],
  },
  theoryId: null,
  solutionWorkflow: {
    name: 'Khoá nhắc đủ hai đầu vào',
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
            id: 'khoi-phuc-thu-vien',
            name: 'Khôi phục thư viện đã dựng',
            durationTicks: 9,
            blocking: true,
            cache: {
              id: 'thu-vien-da-dung',
              keyParts: ['khoa-phu-thuoc', 'cau-hinh-bien-dich'],
              invalidatedBy: ['khoa-phu-thuoc', 'cau-hinh-bien-dich'],
              savesTicks: 7,
            },
          },
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
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 5,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Không cache, luôn dựng lại',
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
            id: 'khoi-phuc-thu-vien',
            name: 'Dựng lại thư viện từ đầu',
            durationTicks: 9,
            blocking: true,
          },
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
        name: 'Kiểm thử đơn vị',
        dependsOn: ['bien-dich'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'chay-kiem-thu',
            name: 'Chạy bộ kiểm thử',
            durationTicks: 5,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
    ],
  },
};
