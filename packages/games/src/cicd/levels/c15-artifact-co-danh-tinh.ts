import type { CicdLevel, WorkflowSpec } from '../contract.ts';
import { cheatsheetExample } from '../cheatsheet-example.ts';

const BAN_DAU: WorkflowSpec = {
  name: 'Dựng ảnh nhưng chưa giao cho dev',
  stages: [
    {
      id: 'build', kind: 'build', name: 'Dựng ảnh dịch vụ tìm kiếm',
      dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'dung-anh', name: 'Dựng ảnh có danh tính', durationTicks: 6, blocking: true, produces: ['image'] }],
    },
    {
      id: 'kiem-tra-anh', kind: 'image-scan', name: 'Kiểm tra ảnh vừa dựng',
      dependsOn: ['build'], blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'doc-anh', name: 'Kiểm tra nội dung ảnh', durationTicks: 4, blocking: true, requires: ['image'] }],
    },
    {
      id: 'deploy-dev', kind: 'deploy', name: 'Phát hành vào dev', environment: 'dev',
      dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'len-dev', name: 'Nhận ảnh và đưa lên dev', durationTicks: 2, blocking: true, requires: ['image'] }],
    },
  ],
};

// A giao ảnh trực tiếp cho dev, kiểm tra song song; B chặn dev tới khi kiểm tra ảnh xong.
function noiDev(quaKiemTra: boolean): WorkflowSpec {
  return {
    name: quaKiemTra ? 'Kiểm tra ảnh trước khi giao cho dev' : 'Giao ảnh cho dev và kiểm tra song song',
    stages: BAN_DAU.stages.map((stage) => stage.id === 'deploy-dev'
      ? { ...stage, dependsOn: [quaKiemTra ? 'kiem-tra-anh' : 'build'] }
      : stage),
  };
}

export const LEVEL_C15: CicdLevel = {
  id: 'cicd-c15-artifact-co-danh-tinh',
  chapter: 'cd',
  title: 'Artifact có danh tính',
  mission: 'Đưa đúng ảnh vừa dựng vào dev mà không còn lỗi thiếu sản phẩm.',
  brief: 'Dịch vụ tìm kiếm đã dựng được ảnh, nhưng lượt phát hành vào dev báo thiếu sản phẩm. Bảng chạy có cả bước dựng, kiểm tra và phát hành; việc ảnh xuất hiện ở một máy chưa có nghĩa máy khác đã nhận nó. Hãy làm cho cả ba commit hoàn tất và dev nhận được ảnh của chính commit đó.',
  difficulty: 'basic',
  initialWorkflow: BAN_DAU,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 3 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 20 }, { id: 'c3', tick: 40 }],
  },
  evaluation: { baseSeed: 150_401, passes: 20 },
  editable: ['edges'],
  allowedKinds: null,
  objectives: [
    { id: 'dev-co-mat', label: 'Giữ bước phát hành vào dev', check: 'stageExists', args: { stage: 'deploy-dev' }, required: true },
    { id: 'anh-duoc-giao', label: 'Không còn lỗi thiếu sản phẩm', check: 'noFailureCause', args: { cause: 'missing-output' }, required: true },
    { id: 'tat-ca-xanh', label: 'Mọi commit hoàn tất thành công', check: 'greenRateAtLeast', args: { rate: 1 }, required: true },
    { id: 'giao-som', label: 'THƯỞNG: lead time dưới 110 giây', check: 'leadTimeUnder', args: { seconds: 110 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 100, budgetLeadSeconds: 300,
    parThroughputPerHour: 18, minThroughputPerHour: 1,
    parRunnerMinutes: 6, budgetRunnerMinutes: 20, minGreenRate: 1,
  },
  hints: [
    'Mở bước phát hành đỏ và đọc tên sản phẩm còn thiếu.',
    'Bước dựng tạo image; bước phát hành cần image của một stage nằm phía trước trong đồ thị.',
    'Nối deploy-dev sau build, hoặc sau kiem-tra-anh vốn đã nhận ảnh từ build. Hai đường đều mang ảnh tới dev.',
  ],
  teaching: {
    primer: 'Artifact là sản phẩm có danh tính của một lần dựng: ảnh container, gói nhị phân hoặc tệp đã biên dịch. Tên sản phẩm như image nói nó dùng để làm gì; danh tính nói chính xác bản nào đang được dùng. Một stage chỉ nhận sản phẩm từ các stage mà nó phụ thuộc, kể cả qua nhiều cạnh. Hai stage độc lập không tự chia sẻ sản phẩm dù một bên chạy xong trước. Retry không thể tạo ra đường giao sản phẩm đang thiếu.',
    cheatsheet: [{
      where: 'yaml',
      example: cheatsheetExample('chung', [
        { id: 'build', steps: ['dung-anh'] },
        { id: 'deploy-dev', kind: 'deploy', dependsOn: ['build'], steps: ['len-dev'] },
      ]),
      explain: 'Cạnh từ bước dựng tới bước phát hành vừa bảo đảm thứ tự, vừa mở đường nhận artifact. Sản phẩm tạo ra và cần nhận là dữ liệu cố định của các bước.',
    }],
    takeaways: [
      'Artifact có danh tính riêng; tên image không thay thế được danh tính của bản dựng.',
      'Sản phẩm chỉ đi qua quan hệ phụ thuộc trong cùng commit.',
      'Nhận trực tiếp hay qua một cổng kiểm tra đều hợp lệ; cổng bổ sung làm tăng thời gian chờ.',
    ],
    pitfalls: ['Đặt bước dựng trước trong văn bản rồi tưởng ảnh đã được giao: vị trí hiển thị không tạo cạnh phụ thuộc.', 'Thử lại bước thiếu sản phẩm có vẻ đơn giản, nhưng lỗi đồ thị vẫn còn ở mọi lần thử.'],
  },
  theoryId: '12-artifact-co-danh-tinh',
  solutionWorkflow: noiDev(false),
  altSolutionWorkflow: noiDev(true),
};
