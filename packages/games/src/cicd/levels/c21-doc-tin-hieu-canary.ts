import type { ReleaseScenario } from '../cd-contract.ts';
import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const WORKFLOW: WorkflowSpec = {
  name: 'Chuẩn bị ảnh trước khi quan sát canary',
  stages: [{
    id: 'build', kind: 'build', name: 'Dựng ảnh API tìm kiếm',
    dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'dung-anh', name: 'Dựng ảnh ứng viên', durationTicks: 3, blocking: true, produces: ['image'] }],
  }, {
    id: 'deploy-prod', kind: 'deploy', name: 'Giao ảnh cho nhóm quan sát', environment: 'prod',
    dependsOn: ['build'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'giao-anh', name: 'Giao ảnh phát hành', durationTicks: 1, blocking: true, requires: ['image'] }],
  }],
};

const BAN_TOT: ReleaseScenario = {
  instances: 100, requestsPerSecond: 1_000, baselineErrorRate: 0.01, candidateErrorRate: 0.01,
  replaceSeconds: 60, switchSeconds: 3, routeSeconds: 12, alertSeconds: 30,
  migration: 'none', fixForwardSeconds: 300,
};

export const LEVEL_C21: CicdLevel = {
  id: 'cicd-c21-doc-tin-hieu-canary',
  chapter: 'cd',
  title: 'Canary: tách tín hiệu khỏi nhiễu',
  mission: 'Giữ bản tốt, rút bản lỗi bằng một chính sách canary đủ dữ liệu.',
  brief: 'API tìm kiếm nhận 1.000 yêu cầu mỗi giây trên 100 máy. Các đợt phát hành gồm cả ứng viên tốt lẫn ứng viên lỗi; cùng một chính sách phải xử lý cả hai. Đội đang quyết định sau một khoảng đo dài một giây với 2% lưu lượng. Mỗi tình huống được mô phỏng qua 100 lượt có hạt giống cố định, vì một lượt may mắn chưa nói được mức ổn định của quyết định. Hãy giảm cả hủy nhầm và bỏ lọt, đồng thời giữ thời gian rút lưu lượng dưới 30 giây.',
  difficulty: 'advanced',
  initialWorkflow: WORKFLOW,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 210_401, passes: 20 },
  editable: [],
  allowedKinds: null,
  objectives: [
    { id: 'giu-ban-tot', label: 'Không hủy nhầm ứng viên tốt trong 100 lượt', check: 'goodReleaseAbortedAtMost', args: { max: 0 }, required: true },
    { id: 'rut-ban-loi', label: 'Không thăng hạng ứng viên lỗi trong 100 lượt', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'rut-luu-luong-kip', label: 'Khôi phục dưới 30 giây sau quyết định rút', check: 'rollbackUnder', args: { seconds: 30 }, required: true },
    { id: 'giu-nhom-nho', label: 'THƯỞNG: không dùng quá 105 máy cùng lúc', check: 'peakInstancesAtMost', args: { max: 105 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 40, budgetLeadSeconds: 300,
    parThroughputPerHour: 36, minThroughputPerHour: 1,
    parRunnerMinutes: 2, budgetRunnerMinutes: 20, minGreenRate: 1,
  },
  hints: [
    'Nhìn số yêu cầu thực sự vào canary, rồi so số lần hủy bản tốt và số lần bản lỗi lọt qua toàn bộ các lượt.',
    'Ở 2% trong một giây, canary chỉ có 20 yêu cầu. Một lỗi đã tương ứng năm điểm phần trăm; thay ngưỡng liên tục không tạo thêm dữ liệu.',
    'Giữ ngưỡng chênh lệch 0,04. Một đường tăng trọng số lên 50% và giữ một khoảng một giây; đường còn lại giữ 2% nhưng gộp 100 khoảng một giây trước khi quyết.',
  ],
  teaching: {
    primer: 'Tỷ lệ lỗi đo được là số lỗi chia số yêu cầu. Với mẫu 20 yêu cầu, thêm đúng một lỗi đã làm tỷ lệ nhảy năm điểm phần trăm. Đó là nhiễu do cỡ mẫu, không phải bằng chứng rằng bản ứng viên vừa thay đổi. Canary so hiệu tỷ lệ lỗi gộp của ứng viên với nhóm đối chứng trong cùng cửa sổ. Muốn số liệu ổn định hơn, có thể tăng phần lưu lượng quan sát hoặc giữ nhóm nhỏ và thu thêm nhiều khoảng đo. Đường thứ nhất đặt nhiều người dùng vào bản ứng viên hơn và cần nhiều máy hơn; đường thứ hai trì hoãn quyết định. Một chính sách phải giữ được bản tốt và rút được bản xấu: luôn hủy hay luôn thăng hạng đều không đạt bài này. Hạt giống cố định giúp lặp lại cùng số liệu để so các lựa chọn.',
    cheatsheet: [{
      where: 'cd-panel', control: 'release.canary', label: 'Phát hành → Tham số canary',
      explain: 'Cỡ mẫu tăng theo lưu lượng, độ dài khoảng đo và số khoảng. Bộ mô phỏng cộng số lỗi và số yêu cầu trước khi lấy tỷ lệ trên cả cửa sổ.',
    }],
    takeaways: [
      'Mẫu nhỏ làm tỷ lệ nhảy mạnh dù tỷ lệ lỗi thật không đổi.',
      'Tăng trọng số đổi thêm máy và thêm lưu lượng tiếp xúc lấy quyết định sớm hơn.',
      'Giữ trọng số nhỏ rồi gộp nhiều khoảng đo cần chờ lâu hơn nhưng giảm đỉnh tài nguyên.',
      'Phải đánh giá cả bản tốt lẫn bản lỗi; một lượt đúng chưa đủ chứng minh chính sách ổn định.',
    ],
    pitfalls: ['Hạ ngưỡng thật thấp để không bỏ sót bản lỗi: ứng viên tốt cũng có thể bị hủy vì nhiễu.', 'Nâng ngưỡng để bảng không còn hủy nhầm: bản lỗi có thể được thăng hạng.', 'Coi 50% là mặc định an toàn vì đủ mẫu nhanh: một nửa lưu lượng sẽ gặp ứng viên chưa được xác nhận; đây là đánh đổi có chủ ý.'],
  },
  theoryId: null,
  solutionWorkflow: WORKFLOW,
  altSolutionWorkflow: WORKFLOW,
  cd: {
    release: {
      scenarios: [BAN_TOT, { ...BAN_TOT, candidateErrorRate: 0.15 }],
      evaluation: { baseSeed: 210_801, passes: 100 },
    },
    editable: ['release.canary'],
    initial: { release: {
      strategy: 'canary', onBadRelease: 'rollback',
      canary: { weightPercent: 2, intervalSeconds: 1, intervals: 1, maxErrorRateDelta: 0.04 },
    } },
    // A tăng mẫu theo bề rộng lưu lượng; B tích lũy mẫu theo thời gian, giữ nhóm canary nhỏ.
    solution: { release: {
      strategy: 'canary', onBadRelease: 'rollback',
      canary: { weightPercent: 50, intervalSeconds: 1, intervals: 1, maxErrorRateDelta: 0.04 },
    } },
    altSolution: { release: {
      strategy: 'canary', onBadRelease: 'rollback',
      canary: { weightPercent: 2, intervalSeconds: 1, intervals: 100, maxErrorRateDelta: 0.04 },
    } },
  },
};
