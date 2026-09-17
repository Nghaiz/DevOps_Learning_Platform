import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const WORKFLOW: WorkflowSpec = {
  name: 'Chuẩn bị ảnh cho phát hành rolling',
  stages: [{
    id: 'build', kind: 'build', name: 'Dựng ảnh dịch vụ đặt lịch',
    dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'dung-anh', name: 'Dựng ảnh ứng viên', durationTicks: 3, blocking: true, produces: ['image'] }],
  }, {
    id: 'deploy-prod', kind: 'deploy', name: 'Giao ảnh cho đợt rolling', environment: 'prod',
    dependsOn: ['build'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'giao-anh', name: 'Giao ảnh phát hành', durationTicks: 1, blocking: true, requires: ['image'] }],
  }],
};

export const LEVEL_C18: CicdLevel = {
  id: 'cicd-c18-rolling-tung-dot',
  chapter: 'cd',
  title: 'Rolling: cân từng đợt thay máy',
  mission: 'Khôi phục trong bốn phút với tối đa mười sáu máy chạy cùng lúc.',
  brief: 'Dịch vụ đặt lịch có 12 máy. Mỗi đợt cần 60 giây để máy mới sẵn sàng; cảnh báo xuất hiện 180 giây sau khi máy ứng viên đầu tiên nhận lưu lượng. Bản này có lỗi, dữ liệu vẫn tương thích với bản cũ. Hạ tầng chỉ cho dùng tối đa 16 máy và đội có sẵn đường dựng bản sửa mất 240 giây. Hãy cân tốc độ khôi phục với phần máy dư phải giữ.',
  difficulty: 'intermediate',
  initialWorkflow: WORKFLOW,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 180_401, passes: 20 },
  editable: [],
  allowedKinds: null,
  objectives: [
    { id: 'phuc-hoi-kip', label: 'Khôi phục trong tối đa 240 giây từ lúc quyết định rút bản lỗi', check: 'rollbackUnder', args: { seconds: 241 }, required: true },
    { id: 'khong-vuot-may', label: 'Không dùng quá 16 máy cùng lúc', check: 'peakInstancesAtMost', args: { max: 16 }, required: true },
    { id: 'khong-giu-ban-loi', label: 'Không giữ lại bản ứng viên lỗi', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'chi-hai-may-du', label: 'THƯỞNG: không dùng quá 14 máy cùng lúc', check: 'peakInstancesAtMost', args: { max: 14 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 40, budgetLeadSeconds: 300,
    parThroughputPerHour: 36, minThroughputPerHour: 1,
    parRunnerMinutes: 2, budgetRunnerMinutes: 20, minGreenRate: 1,
  },
  hints: [
    'So thời điểm cảnh báo với số đợt đã bắt đầu; lùi phải thay lại cả những đợt đó.',
    'Một máy mỗi đợt dùng ít máy dư nhưng tới lúc cảnh báo đã có năm đợt cần lùi: 300 giây.',
    'Bốn máy mỗi đợt chỉ có ba đợt cần lùi, mất 180 giây và đạt đỉnh 16 máy. Hai máy mỗi đợt kết hợp tiến bằng bản sửa mất 240 giây, đạt đỉnh 14 máy.',
  ],
  teaching: {
    primer: 'Rolling thay đội máy theo từng đợt. Máy mới lên trước, máy cũ tắt sau, nên đỉnh tài nguyên bằng số máy đang phục vụ cộng kích thước đợt. Lùi rolling cũng là thay máy: số đợt đã bắt đầu càng nhiều thì thời gian quay về càng dài. Tham số cảnh báo trong bài tính từ lúc máy ứng viên đầu tiên nhận lưu lượng. Ngoài rollback, đội có thể tiến bằng một bản sửa với thời gian đã biết. Đồng hồ khôi phục bắt đầu khi quyết định rút bản lỗi, không phải lúc bắt đầu phát hành.',
    cheatsheet: [{
      where: 'cd-panel', control: 'release.rolling', label: 'Phát hành → Số máy mỗi đợt rolling',
      explain: 'Tăng kích thước đợt làm giảm số đợt phải lùi, đồng thời tăng số máy chạy cùng lúc.',
    }, {
      where: 'cd-panel', control: 'release.onBadRelease', label: 'Phát hành → Khi phát hiện bản lỗi',
      explain: 'Lùi thay lại các đợt đã đổi; tiến dùng bản sửa mất 240 giây theo tình huống. Chọn cùng với ngân sách máy.',
    }],
    takeaways: [
      'Rolling không lùi bằng một thao tác định tuyến: nó phải thay lại những đợt đã đổi.',
      'Đợt lớn đổi tốc độ lấy máy dư; đợt nhỏ có thể kéo dài khôi phục.',
      'Tiến bằng bản sửa là một đường khôi phục khác, phụ thuộc thời gian sửa đã được chuẩn bị.',
    ],
    pitfalls: ['Chọn một máy mỗi đợt vì trông thận trọng: tới khi cảnh báo, nhiều đợt đã bắt đầu và đều phải lùi.', 'Thay cả 12 máy một lần để lùi nhanh: đỉnh tài nguyên vượt giới hạn 16 máy.'],
  },
  theoryId: '15-rolling-va-blue-green',
  solutionWorkflow: WORKFLOW,
  altSolutionWorkflow: WORKFLOW,
  cd: {
    release: {
      scenarios: [{
        instances: 12, requestsPerSecond: 1_000, baselineErrorRate: 0.01, candidateErrorRate: 0.12,
        replaceSeconds: 60, switchSeconds: 3, routeSeconds: 10, alertSeconds: 180,
        migration: 'none', fixForwardSeconds: 240,
      }],
      evaluation: { baseSeed: 180_801, passes: 20 },
    },
    editable: ['release.rolling', 'release.onBadRelease'],
    initial: { release: { strategy: 'rolling', rolling: { batchSize: 1 }, onBadRelease: 'rollback' } },
    // A lùi ba đợt lớn; B giữ đợt nhỏ và tiến bằng bản sửa, không chỉ đổi kích thước đợt.
    solution: { release: { strategy: 'rolling', rolling: { batchSize: 4 }, onBadRelease: 'rollback' } },
    altSolution: { release: { strategy: 'rolling', rolling: { batchSize: 2 }, onBadRelease: 'roll-forward' } },
  },
};
