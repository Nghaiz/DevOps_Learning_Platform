import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel } from '../contract.ts';

/**
 * C14 — **level tự do: ba trục cùng lúc**.
 *
 * Mười ba level trước mỗi level dạy đúng một cơ chế và ghim người chơi vào đúng
 * một hình dạng lời giải. Level cuối chương gỡ hết ghim: `editable` mở gần như
 * tối đa, `allowedKinds` là `null`, và mục tiêu phát biểu bằng **ba trục** chứ
 * không bằng tên stage hay tên cạnh nào.
 *
 * Đó là khác biệt duy nhất đáng kể về mặt thiết kế: không ô nghiệm thu bắt buộc
 * nào ở đây nhắc tới một `stageId`. Một lời giải được chấm vì nó NHANH, ĐỦ
 * THÔNG LƯỢNG và KHÔNG ĐỐT QUÁ NHIỀU MÁY — không vì nó trông giống bản mẫu.
 *
 * ## Đường ống ban đầu sai ở ba chỗ độc lập nhau
 *
 * 1. **Bảy stage nối tiếp thành một chuỗi thẳng**, kể cả ba stage chẳng phụ
 *    thuộc gì vào nhau (`kiem-thu`, `soat-ma`, `quet-bao-mat`).
 * 2. **Bước khôi phục thư viện 10 tick không có cache**, dù `khoa-phu-thuoc`
 *    chỉ đổi mỗi 3 commit.
 * 3. **`quet-bao-mat` nằm trên đường găng** dù nó chỉ cần mã nguồn, không cần
 *    gói nhị phân.
 *
 * Ba chỗ đó gỡ được độc lập, nên có nhiều hơn hai lời giải đạt — đúng điều một
 * level tổng hợp phải có.
 *
 * ## Hai lời giải mẫu, hai đòn bẩy khác hẳn nhau
 *
 * - `solutionWorkflow` — **đổi HÌNH DẠNG**: tách ba stage kiểm tra thành ba
 *   nhánh song song sau `bien-dich`, `dong-goi` gom cả ba. Lead time xuống
 *   44 → 33 tick. Tổng runner-phút **không đổi một tick nào**: cùng bấy nhiêu
 *   việc, chỉ khác lúc nào làm.
 * - `altSolutionWorkflow` — **đổi KHỐI LƯỢNG**: gần như giữ nguyên chuỗi, nhưng
 *   thêm cache cho bước khôi phục thư viện (10 tick → 2 tick ở những commit
 *   trúng) và chuyển `quet-bao-mat` về nhánh riêng treo từ `clone`. Lead time
 *   xuống nhờ làm ÍT VIỆC ĐI, và runner-phút giảm theo — thứ mà đường thứ nhất
 *   không làm được.
 *
 * Đây là cặp lời giải rõ nhất trong cả bảy level cho chuyện "ba trục không suy
 * ra được từ nhau": một đường hạ trục ① mà giữ nguyên trục ③, đường kia hạ cả
 * hai. Mục tiêu THƯỞNG chấm đúng khoảng cách đó.
 */
export const c14: CicdLevel = {
  id: 'cicd-c14-toi-uu-ba-truc',
  chapter: 'ci',
  title: 'Nhanh hơn, nhiều hơn, rẻ hơn — chọn cả ba',
  mission: 'Hạ lead time và giữ runner-phút trong ngân sách, không commit nào đỏ.',
  brief: `Đây là đường ống thật của một đội đang lớn nhanh: nó mọc thêm từng stage một,
mỗi stage được nối vào cuối cái trước, và chưa ai ngồi xuống hỏi cái nào thật sự
cần chờ cái nào.

Bảy stage, một chuỗi thẳng, 44 tick từ lúc đẩy commit tới lúc có gói. Ba trong
số đó không phụ thuộc gì vào nhau. Một bước 10 tick dựng lại thư viện ở mọi
commit trong khi khoá phụ thuộc chỉ đổi mỗi ba commit. Và bước quét bảo mật —
thứ chỉ cần mã nguồn — đang xếp hàng sau cả biên dịch lẫn kiểm thử.

Level này không chấm bạn theo hình dạng đồ thị. Ba con số là ba con số; đường
nào tới đó cũng được.`,
  difficulty: 'advanced',
  initialWorkflow: {
    name: 'Chuỗi bảy stage mọc dần',
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
        id: 'khoi-phuc-thu-vien',
        kind: 'restore-cache',
        name: 'Dựng thư viện phụ thuộc',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dung-thu-vien',
            name: 'Dựng thư viện phụ thuộc',
            durationTicks: 10,
            blocking: true,
            produces: ['thu-vien-san-sang'],
          },
        ],
      },
      {
        id: 'bien-dich',
        kind: 'build',
        name: 'Biên dịch',
        dependsOn: ['khoi-phuc-thu-vien'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'bien-dich-ma',
            name: 'Biên dịch mã nguồn',
            durationTicks: 8,
            blocking: true,
            requires: ['ma-nguon-da-tai', 'thu-vien-san-sang'],
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
            durationTicks: 9,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'soat-ma',
        kind: 'lint',
        name: 'Soát lỗi phong cách mã',
        dependsOn: ['kiem-thu'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'soat-phong-cach',
            name: 'Soát phong cách mã nguồn',
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'quet-bao-mat',
        kind: 'sast',
        name: 'Quét bảo mật mã nguồn',
        dependsOn: ['soat-ma'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'quet-tinh',
            name: 'Quét tĩnh mã nguồn',
            durationTicks: 5,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói ảnh container',
        dependsOn: ['quet-bao-mat'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dong-goi-anh',
            name: 'Đóng gói ảnh container',
            durationTicks: 4,
            blocking: true,
            requires: ['goi-nhi-phan'],
            produces: ['anh-container'],
          },
        ],
      },
    ],
  },
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 6 }],
    inputs: [
      { id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 },
      { id: 'khoa-phu-thuoc', label: 'Khoá phụ thuộc', changesEvery: 3 },
    ],
    commits: [
      { id: 'c1', tick: 0 },
      { id: 'c2', tick: 14 },
      { id: 'c3', tick: 28 },
      { id: 'c4', tick: 42 },
      { id: 'c5', tick: 56 },
    ],
  },
  evaluation: { baseSeed: 140_401, passes: 20 },
  editable: ['edges', 'retries', 'cache', 'stages', 'fan-out', 'blocking'],
  allowedKinds: null,
  objectives: [
    {
      id: 'du-nhanh',
      label: 'Lead time p50 dưới 360 giây',
      check: 'leadTimeUnder',
      args: { seconds: 360 },
      required: true,
    },
    {
      id: 'du-thong-luong',
      label: 'Thông lượng ít nhất 19 commit mỗi giờ',
      check: 'throughputAtLeast',
      args: { perHour: 19 },
      required: true,
    },
    {
      id: 'trong-ngan-sach-may',
      label: 'Trung bình dưới 37 runner-phút mỗi lượt',
      check: 'runnerMinutesUnder',
      args: { minutes: 37 },
      required: true,
    },
    {
      id: 'moi-luot-deu-xanh',
      label: 'Cả năm commit xanh ở mọi lượt chấm',
      check: 'greenRateAtLeast',
      args: { rate: 1 },
      required: true,
    },
    {
      id: 'lam-it-viec-di',
      label: 'THƯỞNG: dưới 34 runner-phút — hạ được cả khối lượng, không chỉ thời gian chờ',
      check: 'runnerMinutesUnder',
      args: { minutes: 34 },
      required: false,
    },
    {
      id: 'quet-bao-mat-ngoai-duong-gang',
      label: 'THƯỞNG: quét bảo mật không nằm trên đường găng ở mọi lượt',
      check: 'stageOffCriticalPath',
      args: { stage: 'quet-bao-mat', rate: 1 },
      required: false,
    },
  ],
  // Đo ngày 2026-09-16 trên `baseSeed: 140401`, 20 lượt:
  //   ban đầu      lead 440s · 18.0 commit-giờ · 36.67 runner-phút
  //   tách nhánh   lead 330s · 20.2 commit-giờ · 36.67 runner-phút
  //   thêm cache   lead 310s · 20.7 commit-giờ · 32.67 runner-phút
  // Ba dòng này là bằng chứng của cả level: tách nhánh hạ ① mà KHÔNG động vào
  // ③ (36.67 y hệt ban đầu, không sai một chữ số), còn cache hạ cả hai. Ngưỡng
  // thông lượng 19 đặt ngay giữa 18.0 và 20.2 nên nó lọc được đúng workflow ban
  // đầu — không phải một con số cho đẹp.
  thresholds: {
    parLeadSeconds: 310,
    budgetLeadSeconds: 360,
    parThroughputPerHour: 20.5,
    minThroughputPerHour: 19,
    parRunnerMinutes: 33,
    budgetRunnerMinutes: 37,
    minGreenRate: 1,
  },
  hints: [
    'Vẽ ra xem stage nào THẬT SỰ cần sản phẩm của stage nào. Ba stage đang nối tiếp mà không cần nhau.',
    'Bước quét bảo mật chỉ cần mã nguồn. Nó đang chờ cả biên dịch lẫn kiểm thử vì một cạnh nối cho gọn.',
    'Khoá phụ thuộc đổi mỗi 3 commit, nhưng thư viện đang được dựng lại ở cả 5 commit.',
    'Tách nhánh hạ lead time mà không hạ runner-phút; thêm cache hạ cả hai. Ngân sách ở đây cần cả hai đòn bẩy nếu bạn muốn ăn điểm thưởng.',
  ],
  teaching: {
    primer: `Ba trục, và chúng không phải ba cách nói về cùng một thứ.

**Lead time** là một commit mất bao lâu. Hạ nó bằng cách bỏ những lần chờ không
cần thiết ra khỏi đường găng — tách nhánh song song, hoặc gỡ một cạnh nối cho
gọn mà không ai cần.

**Thông lượng** là bao nhiêu commit qua được mỗi giờ khi hàng dồn. Nó phụ thuộc
vào năng lực của HỆ, không phải độ trễ của một lô. Hai đường ống cùng lead time
có thể khác thông lượng gấp ba.

**Runner-phút** là chi phí máy chạy. Tách nhánh song song KHÔNG hạ nó một chút nào: cùng
bấy nhiêu việc, chỉ khác lúc nào làm. Muốn hạ nó thì phải làm ít việc đi — cache
một bước, bỏ một bước trùng, hoặc thôi thử lại những thứ không thử lại được.

Level này không nói bạn phải đi đường nào. Nó chỉ đưa ba con số và một ngân
sách.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'clone', kind: 'clone', steps: ['tai-ma-nguon'] },
          { id: 'soat-ma', dependsOn: ['clone'], steps: ['soat-phong-cach'] },
          { id: 'quet-bao-mat', dependsOn: ['clone'], steps: ['quet-tinh'] },
        ]),
        explain: 'Tách nhánh: soát mã và quét bảo mật chỉ cần mã nguồn nên chỉ đợi `clone`. Lead time giảm, runner-phút không bớt một tick nào — cùng bấy nhiêu việc, chỉ khác lúc làm.',
      },
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'kiem-thu', steps: ['chay-kiem-thu'] },
          { id: 'soat-ma', steps: ['soat-phong-cach'] },
          { id: 'quet-bao-mat', steps: ['quet-tinh'] },
          { id: 'dong-goi', dependsOn: ['kiem-thu', 'soat-ma', 'quet-bao-mat'], steps: ['dong-goi-anh'] },
        ]),
        explain: 'Gom nhiều nhánh: `dong-goi` chờ mọi stage trong danh sách xong, nên nhánh chậm nhất quyết định lúc đóng gói.',
      },
      {
        where: 'panel',
        control: 'cache',
        label: 'Cache → Dựng thư viện phụ thuộc → Dựng thư viện phụ thuộc',
        explain: 'Đầu vào "Khoá phụ thuộc" đổi mỗi 3 commit mà thư viện đang dựng lại ở mọi commit. Bật cache ở đây hạ cả lead time lẫn runner-phút; bạn chọn đầu vào của khoá, còn số tick tiết kiệm là dữ liệu của level.',
      },
    ],
    takeaways: [
      'Tách nhánh song song hạ lead time và giữ nguyên runner-phút; hai trục đó độc lập.',
      'Muốn hạ runner-phút thì phải làm ít việc đi, không phải sắp xếp lại việc đang có.',
      'Một cạnh nối "cho gọn" giữa hai stage không liên quan là cách phổ biến nhất để đường găng dài ra.',
      'Một stage chỉ cần mã nguồn thì treo thẳng từ bước tải mã nguồn, đừng treo sau biên dịch.',
    ],
    pitfalls: [
      'Tách hết mọi thứ ra song song rồi tưởng runner-phút giảm theo — nó không giảm một tick nào, và nếu dàn máy chật thì lead time còn tệ hơn vì các nhánh tranh chỗ nhau.',
      'Thêm cache cho mọi bước — cache cho một bước phụ thuộc vào thứ đổi mỗi commit không bao giờ trúng, và bạn vừa thêm một bước tra cứu vô ích (đó là C07).',
      'Bỏ `quet-bao-mat` đi cho nhanh — lead time đẹp ngay, và bạn vừa gỡ một cổng bảo mật để đổi lấy ba mươi giây.',
    ],
  },
  theoryId: '11-ba-truc-diem',
  solutionWorkflow: {
    name: 'Ba nhánh kiểm tra chạy song song',
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
        id: 'khoi-phuc-thu-vien',
        kind: 'restore-cache',
        name: 'Dựng thư viện phụ thuộc',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dung-thu-vien',
            name: 'Dựng thư viện phụ thuộc',
            durationTicks: 10,
            blocking: true,
            produces: ['thu-vien-san-sang'],
          },
        ],
      },
      {
        id: 'bien-dich',
        kind: 'build',
        name: 'Biên dịch',
        dependsOn: ['khoi-phuc-thu-vien'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'bien-dich-ma',
            name: 'Biên dịch mã nguồn',
            durationTicks: 8,
            blocking: true,
            requires: ['ma-nguon-da-tai', 'thu-vien-san-sang'],
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
            durationTicks: 9,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'soat-ma',
        kind: 'lint',
        name: 'Soát lỗi phong cách mã',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'soat-phong-cach',
            name: 'Soát phong cách mã nguồn',
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'quet-bao-mat',
        kind: 'sast',
        name: 'Quét bảo mật mã nguồn',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'quet-tinh',
            name: 'Quét tĩnh mã nguồn',
            durationTicks: 5,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói ảnh container',
        dependsOn: ['kiem-thu', 'soat-ma', 'quet-bao-mat'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dong-goi-anh',
            name: 'Đóng gói ảnh container',
            durationTicks: 4,
            blocking: true,
            requires: ['goi-nhi-phan'],
            produces: ['anh-container'],
          },
        ],
      },
    ],
  },
  altSolutionWorkflow: {
    name: 'Cache thư viện, quét bảo mật ra nhánh riêng',
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
        id: 'khoi-phuc-thu-vien',
        kind: 'restore-cache',
        name: 'Khôi phục thư viện phụ thuộc',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dung-thu-vien',
            name: 'Khôi phục thư viện phụ thuộc',
            durationTicks: 10,
            blocking: true,
            cache: {
              id: 'thu-vien-phu-thuoc',
              keyParts: ['khoa-phu-thuoc'],
              invalidatedBy: ['khoa-phu-thuoc'],
              savesTicks: 8,
            },
            produces: ['thu-vien-san-sang'],
          },
        ],
      },
      {
        id: 'bien-dich',
        kind: 'build',
        name: 'Biên dịch',
        dependsOn: ['khoi-phuc-thu-vien'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'bien-dich-ma',
            name: 'Biên dịch mã nguồn',
            durationTicks: 8,
            blocking: true,
            requires: ['ma-nguon-da-tai', 'thu-vien-san-sang'],
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
            durationTicks: 9,
            blocking: true,
            requires: ['goi-nhi-phan'],
          },
        ],
      },
      {
        id: 'soat-ma',
        kind: 'lint',
        name: 'Soát lỗi phong cách mã',
        dependsOn: ['kiem-thu'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'soat-phong-cach',
            name: 'Soát phong cách mã nguồn',
            durationTicks: 6,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'quet-bao-mat',
        kind: 'sast',
        name: 'Quét bảo mật mã nguồn',
        dependsOn: ['clone'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'quet-tinh',
            name: 'Quét tĩnh mã nguồn',
            durationTicks: 5,
            blocking: true,
            requires: ['ma-nguon-da-tai'],
          },
        ],
      },
      {
        id: 'dong-goi',
        kind: 'package',
        name: 'Đóng gói ảnh container',
        dependsOn: ['soat-ma', 'quet-bao-mat'],
        blocking: true,
        retries: 0,
        runnerClass: 'chung',
        steps: [
          {
            id: 'dong-goi-anh',
            name: 'Đóng gói ảnh container',
            durationTicks: 4,
            blocking: true,
            requires: ['goi-nhi-phan'],
            produces: ['anh-container'],
          },
        ],
      },
    ],
  },
};
