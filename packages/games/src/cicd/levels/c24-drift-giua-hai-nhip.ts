import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const WORKFLOW: WorkflowSpec = {
  name: 'Ghi nhận cấu hình ảnh dịch vụ',
  stages: [{
    id: 'ghi', kind: 'package', name: 'Ghi nhận cấu hình', dependsOn: [],
    blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'ghi-anh', name: 'Ghi phiên bản ảnh', durationTicks: 2, blocking: true }],
  }],
};

// A tự sửa mỗi 30 giây: hai đoạn [11,30] và [41,60], dài 19 giây.
// B chỉ đồng bộ commit mỗi 15 giây: giữ chỉnh tay tới commit ở 41, đóng ở 45
// (34 giây). Khác quyền tự sửa, không chỉ đổi chu kỳ. Ban đầu [11,60] dài 49.
export const LEVEL_C24: CicdLevel = {
  id: 'cicd-c24-drift-giua-hai-nhip',
  chapter: 'cd',
  title: 'Drift giữa hai nhịp',
  mission: 'Giữ mỗi khoảng lệch ảnh dưới 40 giây và đọc đúng lúc môi trường được sửa.',
  brief: `Một người đổi tay ảnh của API tìm kiếm ở giây 11. Đến giây 41, đội ghi một phiên bản mới đã
được thống nhất vào Git. Bộ đối soát đang chạy mỗi 60 giây; tới lúc đó trạng thái sống vẫn khác trạng thái khai.

Bạn cần giữ khoảng lệch liên tục ngắn hơn 40 giây. Bảng thời gian phải cho thấy khi nào drift bắt đầu,
khi nào bị phát hiện và khi nào thực sự kết thúc. Có thể sửa trạng thái sống trước khi commit mới tới,
hoặc chờ commit đó; thời gian chờ của hai lựa chọn không giống nhau.`,
  difficulty: 'intermediate',
  initialWorkflow: WORKFLOW,
  solutionWorkflow: WORKFLOW,
  altSolutionWorkflow: WORKFLOW,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 1 }],
    inputs: [{ id: 'cau-hinh', label: 'Khai báo môi trường', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 1924, passes: 4 },
  editable: [],
  allowedKinds: [],
  objectives: [
    { id: 'gioi-han-drift', label: 'Mỗi đoạn lệch ảnh dài dưới 40 giây', check: 'driftLongestUnder', args: { field: 'image', seconds: 40 }, required: true },
    { id: 'xanh', label: 'Mọi lượt ghi nhận cấu hình đều xanh', check: 'greenRateAtLeast', args: { rate: 1 }, required: true },
    { id: 'sua-som', label: 'Thưởng: không đoạn lệch ảnh nào dài tới 20 giây', check: 'driftLongestUnder', args: { field: 'image', seconds: 20 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 20, budgetLeadSeconds: 120, parThroughputPerHour: 30, minThroughputPerHour: 10,
    parRunnerMinutes: 1, budgetRunnerMinutes: 10, minGreenRate: 1,
  },
  cd: {
    gitops: { scenario: {
      horizonSeconds: 120,
      initial: [{ field: 'image', value: 'api-tim-kiem-v1' }],
      changes: [
        { atSecond: 11, actor: 'human', field: 'image', value: 'api-tim-kiem-tam' },
        { atSecond: 41, actor: 'git', field: 'image', value: 'api-tim-kiem-v2' },
      ],
    } },
    editable: ['gitops.reconcileEvery', 'gitops.selfHeal'],
    initial: { gitops: { reconcileEverySeconds: 60, selfHeal: true, ignoreFields: [] } },
    solution: { gitops: { reconcileEverySeconds: 30, selfHeal: true, ignoreFields: [] } },
    altSolution: { gitops: { reconcileEverySeconds: 15, selfHeal: false, ignoreFields: [] } },
  },
  hints: [
    'Tô đoạn từ giây 11 tới nhịp đối soát tiếp theo. Chu kỳ 60 giây không có nghĩa mọi drift đều dài 60 giây.',
    'Phát hiện lệch không đồng nghĩa sửa lệch. Nếu tắt tự sửa, chỉnh tay vẫn tồn tại cho tới khi một commit mới được đồng bộ.',
    'Tự sửa mỗi 30 giây tạo hai đoạn 19 giây. Chỉ đồng bộ Git mỗi 15 giây đóng đoạn đầu ở giây 45, sau 34 giây; phương án này đạt mục bắt buộc nhưng không có thưởng.',
  ],
  teaching: {
    primer: `Đối soát là một vòng chạy theo nhịp. Nếu thay đổi tay ở giây 11 và nhịp tiếp theo ở giây 30, drift tồn tại 19 giây dù tự sửa đã bật.

Với thay đổi tại t > 0, chu kỳ P và tự sửa bật, lần sửa đầu tiên ở ceil(t/P) × P. Thay đổi đúng một nhịp được áp trước đối soát và có thể bị sửa ngay. Giây 0 chưa phải nhịp đầu tiên.

Tắt tự sửa vẫn cho phép phát hiện lệch. Một commit mới đổi trạng thái khai có thể khép đoạn lệch cũ khi được đồng bộ, kể cả đoạn đó bắt đầu do người sửa tay.

Hai đồng hồ trong bài độc lập: đường ống ghi nhận cấu hình không quyết định các mốc 11 và 41 giây của kịch bản. Hãy đọc độ dài đoạn lệch từ hai đầu mốc của bản ghi.`,
    cheatsheet: [
      { where: 'cd-panel', control: 'gitops.reconcileEvery', label: 'Chu kỳ đối soát', explain: 'Tìm bội số dương kế tiếp của chu kỳ, rồi trừ thời điểm drift bắt đầu.' },
      { where: 'cd-panel', control: 'gitops.selfHeal', label: 'Tự sửa trạng thái sống', explain: 'Bật để đưa chỉnh tay về trạng thái khai ở nhịp kế tiếp; tắt vẫn đồng bộ commit mới nhưng giữ chỉnh tay nếu Git chưa đổi.' },
    ],
    takeaways: [
      'Tự sửa bật vẫn để drift sống tới nhịp đối soát kế tiếp.',
      'Phát hiện, đồng bộ Git và tự sửa là ba sự kiện cần đọc riêng.',
      'Một commit mới chỉ kết thúc drift khi trạng thái sống thực sự theo lại trạng thái khai.',
    ],
    pitfalls: [
      'Tưởng chu kỳ 30 giây khiến mọi drift dài đúng 30 giây: vị trí của thay đổi trong chu kỳ quyết định khoảng chờ.',
      'Tắt tự sửa rồi cho rằng cứ đối soát nhanh là drift tự hết: không có commit mới thì chỉnh tay vẫn ở lại.',
    ],
  },
  theoryId: null,
};
