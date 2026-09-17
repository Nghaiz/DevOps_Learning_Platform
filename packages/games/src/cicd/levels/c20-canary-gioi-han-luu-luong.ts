import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const WORKFLOW: WorkflowSpec = {
  name: 'Chuẩn bị ảnh cho phát hành canary',
  stages: [{
    id: 'build', kind: 'build', name: 'Dựng ảnh dịch vụ thông báo',
    dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'dung-anh', name: 'Dựng ảnh ứng viên', durationTicks: 3, blocking: true, produces: ['image'] }],
  }, {
    id: 'deploy-prod', kind: 'deploy', name: 'Giao ảnh cho nhóm canary', environment: 'prod',
    dependsOn: ['build'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'giao-anh', name: 'Giao ảnh phát hành', durationTicks: 1, blocking: true, requires: ['image'] }],
  }],
};

export const LEVEL_C20: CicdLevel = {
  id: 'cicd-c20-canary-gioi-han-luu-luong',
  chapter: 'cd',
  title: 'Canary: giới hạn phần lưu lượng thử',
  mission: 'Rút bản lỗi dưới ba mươi giây mà không dựng thêm cả một đội máy.',
  brief: 'Dịch vụ thông báo có 100 máy và nhận 10.000 yêu cầu mỗi giây. Đội chỉ có thể cấp thêm năm máy cho phát hành. Bộ định tuyến cần 12 giây để thay trọng số; một bản sửa cần 300 giây để sẵn sàng. Bản ứng viên trong đợt này có lỗi rõ rệt. Hãy giới hạn tài nguyên phát hành và đáp ứng thời gian khôi phục kể từ khi quyết định rút bản lỗi.',
  difficulty: 'intermediate',
  initialWorkflow: WORKFLOW,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 200_401, passes: 20 },
  editable: [],
  allowedKinds: null,
  objectives: [
    { id: 'rut-kip', label: 'Khôi phục dưới 30 giây từ lúc rút bản lỗi', check: 'rollbackUnder', args: { seconds: 30 }, required: true },
    { id: 'toi-da-nam-may-du', label: 'Không dùng quá 105 máy cùng lúc', check: 'peakInstancesAtMost', args: { max: 105 }, required: true },
    { id: 'khong-lot-ban-loi', label: 'Không thăng hạng bản lỗi ở bất kỳ lượt nào', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'chi-hai-may-du', label: 'THƯỞNG: đỉnh tài nguyên không quá 102 máy', check: 'peakInstancesAtMost', args: { max: 102 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 40, budgetLeadSeconds: 300,
    parThroughputPerHour: 36, minThroughputPerHour: 1,
    parRunnerMinutes: 2, budgetRunnerMinutes: 20, minGreenRate: 1,
  },
  hints: [
    'So phần máy canary với 100 máy hiện có. Đội máy thứ hai của blue-green sẽ cần tới 200 máy cùng lúc.',
    'Lùi canary chỉ đổi trọng số về không, mất 12 giây. Đường tiến phải chờ bản sửa 300 giây.',
    'Chọn lùi. Có thể giữ 2% lưu lượng và đo 12 khoảng, mỗi khoảng 5 giây; hoặc dành 5% lưu lượng và đo ba khoảng 5 giây. Cả hai dùng ngưỡng chênh lệch lỗi 0,03.',
  ],
  teaching: {
    primer: 'Canary cho bản ứng viên nhận một phần lưu lượng thật trước khi thay cả đội máy. Nhóm còn lại là đối chứng trong cùng khoảng thời gian. Máy canary được tính theo trọng số rồi làm tròn lên; đội 100 máy với trọng số 2% cần thêm hai máy. Nếu quyết định hủy, hệ thống đổi trọng số canary về không. Thời gian đổi định tuyến trong bài là 12 giây, độc lập với thời gian đã dùng để quan sát. Thu thập đủ tín hiệu có thể dựa vào nhiều lưu lượng trong cửa sổ ngắn hoặc ít lưu lượng trong cửa sổ dài. Hai cách dùng tài nguyên và đặt người dùng vào bản ứng viên khác nhau.',
    cheatsheet: [{
      where: 'cd-panel', control: 'release.canary', label: 'Phát hành → Tham số canary',
      explain: 'Trọng số quyết định lưu lượng và số máy thêm; độ dài cùng số khoảng đo quyết định cửa sổ quan sát. So chênh lệch lỗi với nhóm đối chứng.',
    }, {
      where: 'cd-panel', control: 'release.onBadRelease', label: 'Phát hành → Khi phát hiện bản lỗi',
      explain: 'Lùi đổi trọng số về không; tiến dùng thời gian chuẩn bị bản sửa của tình huống.',
    }],
    takeaways: [
      'Canary không dựng đủ một môi trường thứ hai nên đỉnh tài nguyên thấp hơn blue-green.',
      'Thời gian thu thập tín hiệu và thời gian rút lưu lượng là hai khoảng khác nhau.',
      'Giảm trọng số tiết kiệm máy và hạn chế phần lưu lượng gặp ứng viên, nhưng cần quan sát lâu hơn.',
    ],
    pitfalls: ['Chọn tiến vì nghĩ đây cũng là khôi phục nhanh: trong tình huống này bản sửa cần năm phút.', 'Thu hẹp trọng số mà giữ nguyên cửa sổ rất ngắn: ít yêu cầu hơn khiến quyết định dựa trên số liệu kém ổn định.'],
  },
  theoryId: '16-canary-va-co-mau',
  solutionWorkflow: WORKFLOW,
  altSolutionWorkflow: WORKFLOW,
  cd: {
    release: {
      scenarios: [{
        instances: 100, requestsPerSecond: 10_000, baselineErrorRate: 0.01, candidateErrorRate: 0.15,
        replaceSeconds: 60, switchSeconds: 3, routeSeconds: 12, alertSeconds: 30,
        migration: 'none', fixForwardSeconds: 300,
      }],
      evaluation: { baseSeed: 200_801, passes: 20 },
    },
    editable: ['release.canary', 'release.onBadRelease'],
    initial: { release: {
      strategy: 'canary', onBadRelease: 'roll-forward',
      canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
    } },
    // A giữ nhóm nhỏ và quan sát một phút; B tăng lưu lượng để quyết sau 15 giây, đổi thời gian lấy máy.
    solution: { release: {
      strategy: 'canary', onBadRelease: 'rollback',
      canary: { weightPercent: 2, intervalSeconds: 5, intervals: 12, maxErrorRateDelta: 0.03 },
    } },
    altSolution: { release: {
      strategy: 'canary', onBadRelease: 'rollback',
      canary: { weightPercent: 5, intervalSeconds: 5, intervals: 3, maxErrorRateDelta: 0.03 },
    } },
  },
};
