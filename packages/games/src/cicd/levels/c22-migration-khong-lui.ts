import type { ReleasePolicy } from '../cd-contract.ts';
import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const WORKFLOW: WorkflowSpec = {
  name: 'Bản sửa lược đồ của dịch vụ đặt lịch',
  stages: [
    {
      id: 'dung', kind: 'build', name: 'Dựng bản sửa', dependsOn: [],
      blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'dong-goi', name: 'Đóng gói bản sửa', durationTicks: 3, blocking: true, produces: ['image'] }],
    },
    {
      id: 'prod', kind: 'deploy', name: 'Phát hành bản sửa', dependsOn: ['dung'],
      blocking: true, retries: 0, runnerClass: 'chung', environment: 'prod',
      steps: [{ id: 'len-prod', name: 'Nhận bản đã dựng', durationTicks: 1, blocking: true, requires: ['image'] }],
    },
  ],
};

const INITIAL: ReleasePolicy = {
  strategy: 'rolling', rolling: { batchSize: 5 },
  canary: { weightPercent: 5, intervalSeconds: 10, intervals: 2, maxErrorRateDelta: 0.02 },
  onBadRelease: 'rollback',
};

// A sửa tiến sau cảnh báo rolling; B phát hiện trong canary rồi sửa tiến,
// giữ đội canary nhỏ. Khác cơ chế phơi nhiễm, không chỉ khác một ngưỡng số học.
export const LEVEL_C22: CicdLevel = {
  id: 'cicd-c22-migration-khong-lui',
  chapter: 'cd',
  title: 'Lược đồ không có đường lùi',
  mission: 'Khôi phục dịch vụ mà không đưa bản cũ chạy trên lược đồ không tương thích.',
  brief: `Bản ứng viên của dịch vụ đặt lịch đã đổi lược đồ dữ liệu theo cách không thể hoàn tác.
Nó cũng làm mọi request thất bại. Bản cũ còn đó, nhưng không đọc được lược đồ mới.

Đội vận hành có mười máy đang phục vụ. Một bản sửa tương thích cần 240 giây để dựng và đưa lên.
Bạn phải xử lý bản lỗi, giữ dữ liệu an toàn và quan sát số máy cao nhất của mỗi cách phát hành.
Một lượt không gây sự cố dữ liệu nhưng để nguyên bản lỗi phục vụ cũng không được tính là hoàn thành.`,
  difficulty: 'advanced',
  initialWorkflow: WORKFLOW,
  solutionWorkflow: WORKFLOW,
  altSolutionWorkflow: WORKFLOW,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 1922, passes: 4 },
  editable: [],
  allowedKinds: [],
  objectives: [
    { id: 'du-lieu-an-toan', label: 'Không lượt nào lùi vào lược đồ không tương thích', check: 'noDataIncident', required: true },
    { id: 'khong-bo-mac-ban-loi', label: 'Không bản lỗi nào được giữ lại', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'phuc-hoi', label: 'Phục hồi dưới 250 giây kể từ quyết định rút bản lỗi', check: 'rollbackUnder', args: { seconds: 250 }, required: true },
    { id: 'doi-may-nho', label: 'Thưởng: cao nhất 11 máy chạy cùng lúc', check: 'peakInstancesAtMost', args: { max: 11 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 40, budgetLeadSeconds: 120, parThroughputPerHour: 30, minThroughputPerHour: 10,
    parRunnerMinutes: 2, budgetRunnerMinutes: 10, minGreenRate: 1,
  },
  cd: {
    release: {
      scenarios: [{
        instances: 10, requestsPerSecond: 200, baselineErrorRate: 0, candidateErrorRate: 1,
        replaceSeconds: 60, switchSeconds: 3, routeSeconds: 20, alertSeconds: 180,
        migration: 'irreversible', fixForwardSeconds: 240,
      }],
      evaluation: { baseSeed: 2222, passes: 20 },
    },
    editable: ['release.strategy', 'release.onBadRelease'],
    initial: { release: INITIAL },
    solution: { release: { ...INITIAL, onBadRelease: 'roll-forward' } },
    altSolution: { release: { ...INITIAL, strategy: 'canary', onBadRelease: 'roll-forward' } },
  },
  hints: [
    'Đọc kết cục của lượt ban đầu: quyết định rút đã xảy ra, nhưng trạng thái là rollback-blocked.',
    'Thời gian đổi lưu lượng không thay đổi khả năng đọc dữ liệu của bản cũ. Cần phân biệt khôi phục ứng dụng và tương thích lược đồ.',
    'Chọn sửa tiến khi gặp bản lỗi. Giữ rolling hoặc chuyển sang canary 5% để so đội máy; cả hai vẫn cần 240 giây cho bản sửa.',
  ],
  teaching: {
    primer: `Rollback ứng dụng không tự hoàn tác dữ liệu. Một lần xoá cột hoặc đổi cấu trúc không tương thích có thể khiến bản cũ không chạy được nữa.

Trong bài này, lược đồ đã đổi ở mọi phương án. Đổi chiến lược phát hành chỉ đổi lượng tài nguyên và thời điểm phát hiện; nó không xoá được sự kiện đó.

Khi đọc bản ghi, tách ba mốc: ứng viên bắt đầu nhận lưu lượng, quyết định rút, và dịch vụ thực sự phục hồi. Lùi xong mà ứng dụng không đọc được dữ liệu chưa phải là phục hồi.

Canary giới hạn đội máy dành cho ứng viên, nhưng bản sửa vẫn cần thời gian. Ngoài mô hình này, thay đổi lược đồ theo nhiều bước tương thích giúp tạo lại đường lùi.`,
    cheatsheet: [
      { where: 'cd-panel', control: 'release.onBadRelease', label: 'Khi bản phát hành lỗi', explain: 'Rollback chọn bản cũ; roll-forward đưa bản sửa tương thích lên. Migration không thể hoàn tác được giữ cố định bởi tình huống.' },
      { where: 'cd-panel', control: 'release.strategy', label: 'Chiến lược phát hành', explain: 'So rolling với canary đã cấu hình 5%. Đội máy thay đổi, nhưng thời gian dựng bản sửa không đổi.' },
    ],
    takeaways: [
      'Một bản ứng dụng còn nguyên không đảm bảo nó đọc được lược đồ hiện tại.',
      'Không gây sự cố dữ liệu phải đi cùng việc xử lý bản lỗi, không phải bỏ mặc nó.',
      'Canary giới hạn phơi nhiễm; nó không làm migration không tương thích trở nên có thể hoàn tác.',
    ],
    pitfalls: [
      'Chọn lùi vì nó thường nhanh: ở đây bản cũ gặp lược đồ mới và gây thêm sự cố dữ liệu.',
      'Tăng ngưỡng để bản lỗi được giữ lại: tránh được trạng thái rollback-blocked nhưng dịch vụ vẫn lỗi ở mọi request.',
    ],
  },
  theoryId: '17-migration-khong-lui',
};
