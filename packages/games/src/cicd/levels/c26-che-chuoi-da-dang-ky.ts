import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { MaskingPolicy } from '../cd-contract.ts';
import type { CicdLevel, WorkflowSpec } from '../contract.ts';

function workflow(songSong: boolean): WorkflowSpec {
  return {
    name: songSong ? 'Lưu log và bản dựng song song' : 'Lưu log rồi lưu bản dựng',
    stages: [
      {
        id: 'dung', kind: 'build', name: 'Dựng gói', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'tao-goi', name: 'Tạo gói dịch vụ', durationTicks: 2, blocking: true, produces: ['goi'] }],
      },
      {
        id: 'luu-log', kind: 'package', name: 'Lưu log vận hành', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'ghi-log', name: 'Ghi log đã che', durationTicks: 4, blocking: true, requires: ['goi'] }],
      },
      {
        id: 'luu-ban', kind: 'package', name: 'Lưu bản dựng', dependsOn: songSong ? ['dung'] : ['luu-log'],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'ghi-goi', name: 'Ghi bản dựng', durationTicks: 2, blocking: true, requires: ['goi'] }],
      },
    ],
  };
}

const MASK_ALL: MaskingPolicy = {
  masked: [
    { secret: 'khoa-dich-vu', form: 'raw' },
    { secret: 'khoa-dich-vu', form: 'base64' },
    { secret: 'khoa-dich-vu', form: 'url' },
    { secret: 'khoa-dich-vu', form: 'reversed' },
  ],
};

// Cả hai đường che đủ chuỗi thật trong log. A lưu hai đầu ra song song (60s),
// B giữ thứ tự lưu log rồi bản dựng (80s); khác đồ thị công việc, không đổi một ngưỡng che.
export const LEVEL_C26: CicdLevel = {
  id: 'cicd-c26-che-chuoi-da-dang-ky',
  chapter: 'cd',
  title: 'Bộ che chỉ biết chuỗi đã đăng ký',
  mission: 'Ngăn khóa dịch vụ lọt qua log dưới dạng thô, base64, URL hoặc đảo ngược.',
  brief: `Một khóa giả lập của dịch vụ thông báo xuất hiện trong bốn dòng chẩn đoán.
Dòng đầu đã thành dấu sao, nhưng ba dòng còn lại vẫn chứa dữ liệu có thể khôi phục khóa.
Giao diện báo còn rò bí mật dù đội đã bật bộ che.

Đường ống cũng phải giữ cả việc lưu log vận hành và lưu bản dựng. Hai việc dùng cùng gói
đã dựng, còn nội dung log của tình huống được cố định. Bạn cần loại bỏ mọi chỗ rò, giữ
đủ đầu ra và cân nhắc thời gian hoàn tất khi có hai máy chạy.`,
  difficulty: 'advanced',
  initialWorkflow: workflow(false),
  solutionWorkflow: workflow(true),
  altSolutionWorkflow: workflow(false),
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 20 }, { id: 'c3', tick: 40 }],
  },
  evaluation: { baseSeed: 1926, passes: 4 },
  editable: ['edges'],
  allowedKinds: [],
  objectives: [
    { id: 'khong-ro', label: 'Không còn dạng bí mật nào trong log', check: 'secretLeaksAtMost', args: { max: 0 }, required: true },
    { id: 'con-log', label: 'Vẫn lưu log vận hành', check: 'stageExists', args: { stage: 'luu-log' }, required: true },
    { id: 'con-ban', label: 'Vẫn lưu bản dựng', check: 'stageExists', args: { stage: 'luu-ban' }, required: true },
    { id: 'du-dau-ra', label: 'Mọi lượt lưu kết quả đều xanh', check: 'greenRateAtLeast', args: { rate: 1 }, required: true },
    { id: 'luu-nhanh', label: 'Thưởng: hoàn tất dưới 70 giây', check: 'leadTimeUnder', args: { seconds: 70 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 60, budgetLeadSeconds: 120, parThroughputPerHour: 20, minThroughputPerHour: 10,
    parRunnerMinutes: 4, budgetRunnerMinutes: 12, minGreenRate: 1,
  },
  cd: {
    masking: { scenario: {
      secrets: [{ id: 'khoa-dich-vu', value: 'ThongBao+7/a?K=9' }],
      lines: [
        { text: 'Khóa thô: {{khoa-dich-vu}}' },
        { text: 'Khóa dạng base64: {{khoa-dich-vu|base64}}' },
        { text: 'Khóa trong URL: {{khoa-dich-vu|url}}' },
        { text: 'Khóa đảo ngược: {{khoa-dich-vu|reversed}}' },
      ],
    } },
    editable: ['masking.masked'],
    initial: { masking: { masked: [{ secret: 'khoa-dich-vu', form: 'raw' }] } },
    solution: { masking: MASK_ALL },
    altSolution: { masking: MASK_ALL },
  },
  hints: [
    'Đọc từng dòng sau khi che. Dấu sao ở dòng thô không chứng minh ba dòng đã biến đổi cũng an toàn.',
    'Một phép biến đổi tạo một chuỗi khác. Đối chiếu cả bốn dạng xuất hiện với danh sách đăng ký.',
    'Đăng ký raw, base64, url và reversed cho khoa-dich-vu. Giữ thứ tự lưu hiện tại vẫn đạt; cho luu-ban phụ thuộc dung thay vì luu-log sẽ hạ thời gian từ 80 xuống 60 giây và có thưởng.',
  ],
  teaching: {
    primer: `Bộ che log thay chuỗi chính xác đã đăng ký bằng dấu sao. Nó không hiểu một giá trị là bí mật theo ý nghĩa, cũng không tự suy ra mọi cách biểu diễn của giá trị đó.

Base64, mã hóa URL và đảo ngược đều tạo ra chuỗi có thể khôi phục. Chúng không phải biện pháp giữ bí mật. Nếu log buộc phải chứa các dạng đó, từng chuỗi phải được đăng ký trước khi log được xuất.

Che theo từng dòng cũng có giới hạn: in nửa đầu rồi nửa sau ở dòng kế tiếp có thể làm chuỗi đầy đủ không xuất hiện trong bất kỳ dòng riêng nào. Đăng ký cả chuỗi không giải quyết được kiểu rò này; cần sửa nguồn sinh log.

Kịch bản log và đường ống chạy độc lập trong bài. Đổi cạnh giúp hoàn tất nhanh hơn, nhưng không xóa hay che hộ dòng nào. Không ghi bí mật ngay từ đầu vẫn là cách giảm phụ thuộc vào bộ che.`,
    cheatsheet: [
      { where: 'cd-panel', control: 'masking.masked', label: 'Chuỗi được đăng ký che', explain: 'Chọn từng cặp bí mật và dạng biểu diễn đã xuất hiện. Các dạng không được đăng ký còn nguyên trong log.' },
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'dung', steps: ['tao-goi'] },
          { id: 'luu-log', dependsOn: ['dung'], steps: ['ghi-log'] },
          { id: 'luu-ban', dependsOn: ['dung'], steps: ['ghi-goi'] },
        ]),
        explain: 'Hai nhánh cùng nhận gói đã dựng. Đổi lịch lưu không thay đổi bốn dòng bí mật của tình huống.',
      },
    ],
    takeaways: [
      'Đăng ký chuỗi thô không che hộ dạng base64, URL hay đảo ngược.',
      'Một phép biến đổi có thể đảo ngược không làm bí mật an toàn.',
      'Che log là lớp bảo vệ bổ sung; nguồn sinh log cần tránh ghi bí mật.',
    ],
    pitfalls: [
      'Chỉ nhìn dòng thô đã thành dấu sao rồi kết luận toàn bộ log an toàn.',
      'Dòng split chia bí mật sang hai dòng: đăng ký chuỗi đầy đủ vẫn không che được. Tình huống chấm điểm không chứa split vì người chơi không có quyền sửa nguồn log.',
      'Xếp lịch khác rồi cho rằng bí mật biến mất: bộ che vẫn nhận nguyên kịch bản log.',
    ],
  },
  theoryId: null,
};
