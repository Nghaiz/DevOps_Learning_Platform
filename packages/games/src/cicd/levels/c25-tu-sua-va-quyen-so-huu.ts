import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const WORKFLOW: WorkflowSpec = {
  name: 'Ghi nhận trạng thái dịch vụ',
  stages: [{
    id: 'ghi', kind: 'package', name: 'Ghi nhận cấu hình', dependsOn: [],
    blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'ghi-cau-hinh', name: 'Lưu cấu hình dịch vụ', durationTicks: 2, blocking: true }],
  }],
};

// A tự sửa image nhưng nhường replicas cho bộ điều khiển. B chỉ phát hiện,
// chờ commit sửa image ở giây 71 và đồng bộ ở giây 80; không giành quyền sửa sống.
export const LEVEL_C25: CicdLevel = {
  id: 'cicd-c25-tu-sua-va-quyen-so-huu',
  chapter: 'cd',
  title: 'Tự sửa và quyền sở hữu',
  mission: 'Ngừng giành cấu hình với bộ điều khiển, vẫn giới hạn thời gian lệch ảnh dịch vụ.',
  brief: `Bộ điều khiển co giãn của API tìm kiếm tăng số bản sao từ hai lên bốn ở giây 5.
Mỗi lần bị ghi đè, nó sẽ đặt lại bốn bản sao sau bảy giây. Bộ đối soát cũng đang tự sửa
mọi trường theo Git. Hai bên liên tục phủ nhận thay đổi của nhau.

Ở giây 11, một người đổi tay ảnh dịch vụ. Đội sẽ ghi phiên bản được thống nhất vào Git
ở giây 71. Bạn phải dừng cuộc giành quyền trên số bản sao, đồng thời giữ mỗi đoạn lệch
ảnh dưới 75 giây. Số bản sao và ảnh có chủ sở hữu khác nhau; bỏ mặc toàn bộ cấu hình
không đáp ứng yêu cầu vận hành.`,
  difficulty: 'advanced',
  initialWorkflow: WORKFLOW,
  solutionWorkflow: WORKFLOW,
  altSolutionWorkflow: WORKFLOW,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 1 }],
    inputs: [{ id: 'cau-hinh', label: 'Khai báo môi trường', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 1925, passes: 4 },
  editable: [],
  allowedKinds: [],
  objectives: [
    { id: 'khong-gianh-nhau', label: 'Không ghi đè bộ điều khiển lần nào', check: 'selfHealFightsAtMost', args: { max: 0 }, required: true },
    { id: 'van-quan-anh', label: 'Mỗi đoạn lệch ảnh dưới 75 giây', check: 'driftLongestUnder', args: { field: 'image', seconds: 75 }, required: true },
    { id: 'sua-anh-som', label: 'Thưởng: mỗi đoạn lệch ảnh dưới 25 giây', check: 'driftLongestUnder', args: { field: 'image', seconds: 25 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 20, budgetLeadSeconds: 120, parThroughputPerHour: 30, minThroughputPerHour: 10,
    parRunnerMinutes: 1, budgetRunnerMinutes: 10, minGreenRate: 1,
  },
  cd: {
    gitops: { scenario: {
      horizonSeconds: 150,
      initial: [{ field: 'replicas', value: '2' }, { field: 'image', value: 'api-tim-kiem-v1' }],
      changes: [
        { atSecond: 5, actor: 'controller', field: 'replicas', value: '4', reassertEverySeconds: 7 },
        { atSecond: 11, actor: 'human', field: 'image', value: 'api-tim-kiem-tam' },
        { atSecond: 71, actor: 'git', field: 'image', value: 'api-tim-kiem-v2' },
      ],
    } },
    editable: ['gitops.reconcileEvery', 'gitops.selfHeal', 'gitops.ignoreFields'],
    initial: { gitops: { reconcileEverySeconds: 30, selfHeal: true, ignoreFields: [] } },
    solution: { gitops: { reconcileEverySeconds: 30, selfHeal: true, ignoreFields: ['replicas'] } },
    altSolution: { gitops: { reconcileEverySeconds: 10, selfHeal: false, ignoreFields: [] } },
  },
  hints: [
    'Đọc nguyên nhân của các đoạn lệch replicas: mỗi lần đối soát đóng một đoạn, bộ điều khiển lại mở đoạn mới.',
    'Loại trừ một trường sẽ bỏ cả phát hiện lẫn đồng bộ Git trên trường đó. Image vẫn cần được quản riêng.',
    'Giữ tự sửa mỗi 30 giây và chỉ loại trừ replicas để hai đoạn lệch image dài 19 giây. Hoặc tắt tự sửa, đối soát mỗi 10 giây: commit ở giây 71 kết thúc đoạn lệch image ở giây 80, sau 69 giây.',
  ],
  teaching: {
    primer: `Một trường cấu hình nên có chủ sở hữu rõ ràng. Git giữ phiên bản ảnh; bộ điều khiển co giãn quyết định số bản sao theo tải. Hai bên cùng ghi một trường sẽ tạo vòng sửa qua sửa lại.

Danh sách loại trừ là ranh giới quyền sở hữu. Nó không chỉ tắt tự sửa: trường bị loại trừ cũng không được phát hiện lệch hay đồng bộ commit. Vì vậy không nên loại trừ cả tài nguyên chỉ để dập cảnh báo.

Khi chưa tin danh sách loại trừ, một cách triển khai thận trọng là bật phát hiện và tắt tự sửa. Đội quan sát những trường bị hệ khác quản trước khi cho phép ghi đè tự động. Commit mới vẫn được đồng bộ; chỉnh tay sẽ tồn tại lâu hơn.

Mục tiêu thời gian trong bài chỉ đo image, trường không do bộ điều khiển co giãn quản. Nhờ vậy, nhường replicas đúng chỗ không bị coi là thất bại, còn bỏ mặc image vẫn bị tính.`,
    cheatsheet: [
      { where: 'cd-panel', control: 'gitops.ignoreFields', label: 'Trường do bên khác quản', explain: 'Chọn replicas để nhường quyền cho bộ điều khiển; image tiếp tục được đối soát.' },
      { where: 'cd-panel', control: 'gitops.selfHeal', label: 'Quyền tự sửa', explain: 'Tắt để quan sát trước khi tin danh sách loại trừ. Đồng bộ commit vẫn hoạt động.' },
      { where: 'cd-panel', control: 'gitops.reconcileEvery', label: 'Nhịp phát hiện và đồng bộ', explain: 'Chu kỳ ngắn làm commit mới lên sống sớm hơn; không tự biến phát hiện thành sửa tay.' },
    ],
    takeaways: [
      'Tự sửa chỉ an toàn khi ranh giới quyền sở hữu từng trường đã rõ.',
      'Loại trừ một trường cũng bỏ phát hiện và đồng bộ Git trên trường đó.',
      'Chế độ chỉ phát hiện giúp quan sát xung đột trước khi cấp quyền tự sửa.',
    ],
    pitfalls: [
      'Tắt tự sửa rồi không có commit khắc phục: không còn giành nhau nhưng image vẫn lệch tới hết tình huống.',
      'Loại trừ cả image: cuộc giành replicas có thể hết, nhưng ảnh sai không được khôi phục hay nhận commit mới.',
    ],
  },
  theoryId: null,
};
