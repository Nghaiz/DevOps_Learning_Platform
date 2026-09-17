import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel, WorkflowSpec } from '../contract.ts';

const TUAN_TU: WorkflowSpec = {
  name: 'Chuẩn bị blue-green theo thứ tự',
  stages: [{
    id: 'build', kind: 'build', name: 'Dựng ảnh dịch vụ đặt lịch',
    dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'dung-anh', name: 'Dựng ảnh ứng viên', durationTicks: 4, blocking: true, produces: ['image'] }],
  }, {
    id: 'chuan-bi', kind: 'build', name: 'Chuẩn bị cấu hình bộ chọn',
    dependsOn: ['build'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'cau-hinh', name: 'Chuẩn bị cấu hình định tuyến', durationTicks: 3, blocking: true, produces: ['cau-hinh'] }],
  }, {
    id: 'deploy-prod', kind: 'deploy', name: 'Giao ảnh và cấu hình cho phát hành', environment: 'prod',
    dependsOn: ['build', 'chuan-bi'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'giao-anh', name: 'Giao ảnh và cấu hình', durationTicks: 1, blocking: true, requires: ['image', 'cau-hinh'] }],
  }],
};

const SONG_SONG: WorkflowSpec = {
  ...TUAN_TU,
  name: 'Dựng ảnh song song với chuẩn bị cấu hình',
  stages: TUAN_TU.stages.map((stage) => stage.id === 'chuan-bi' ? { ...stage, dependsOn: [] } : stage),
};

export const LEVEL_C19: CicdLevel = {
  id: 'cicd-c19-blue-green-doi-bo-chon',
  chapter: 'cd',
  title: 'Blue-green: lùi bằng bộ chọn',
  mission: 'Khôi phục dưới năm giây và giữ đủ hai môi trường trong lúc chuyển bản.',
  brief: 'Dịch vụ đặt lịch có tám máy đang phục vụ. Môi trường mới cần thêm tám máy; môi trường cũ vẫn được giữ nguyên. Bộ chọn lưu lượng mất ba giây để đổi đích. Bản ứng viên gây lỗi, còn bản sửa cần 240 giây để sẵn sàng. Trước phát hành, đường ống dựng ảnh trong 40 giây và chuẩn bị cấu hình định tuyến trong 30 giây; hai việc này không trao đổi sản phẩm. Hãy đạt giới hạn khôi phục mà đội trực đã cam kết.',
  difficulty: 'intermediate',
  initialWorkflow: TUAN_TU,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 15 }, { id: 'c3', tick: 30 }],
  },
  evaluation: { baseSeed: 190_401, passes: 20 },
  editable: ['edges'],
  allowedKinds: null,
  objectives: [
    { id: 'lui-duoi-nam-giay', label: 'Khôi phục dưới 5 giây từ lúc rút bản lỗi', check: 'rollbackUnder', args: { seconds: 5 }, required: true },
    { id: 'hai-moi-truong', label: 'Không vượt 16 máy chạy cùng lúc', check: 'peakInstancesAtMost', args: { max: 16 }, required: true },
    { id: 'khong-giu-ban-loi', label: 'Không giữ lại bản ứng viên lỗi', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'giao-du-san-pham', label: 'Đường ống giao đủ ảnh và cấu hình ở mọi lượt', check: 'greenRateAtLeast', args: { rate: 1 }, required: true },
    { id: 'chuan-bi-nhanh', label: 'THƯỞNG: chuẩn bị đường ống dưới 60 giây mỗi commit', check: 'leadTimeUnder', args: { seconds: 60 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 50, budgetLeadSeconds: 300,
    parThroughputPerHour: 24, minThroughputPerHour: 1,
    parRunnerMinutes: 4, budgetRunnerMinutes: 20, minGreenRate: 1,
  },
  hints: [
    'Đọc thời gian từ quyết định rút bản lỗi tới lúc hết lưu lượng lỗi; đừng nhầm với thời gian chuẩn bị đường ống.',
    'Môi trường cũ còn nguyên. Đổi bộ chọn về mất ba giây, trong khi dựng bản sửa cần 240 giây.',
    'Chọn lùi khi phát hiện lỗi. Để lấy thưởng, bỏ cạnh từ chuan-bi tới build và giữ deploy-prod chờ cả hai sản phẩm.',
  ],
  teaching: {
    primer: 'Blue-green giữ hai môi trường hoàn chỉnh. Khi môi trường mới sẵn sàng, bộ chọn chuyển lưu lượng sang đó. Nếu bản mới lỗi và dữ liệu còn tương thích, quay về bản cũ chỉ cần đổi bộ chọn. Tốc độ này đến từ việc giữ sẵn toàn bộ môi trường cũ: tám máy phục vụ cần đạt đỉnh 16 máy trong bài. Đồng hồ khôi phục của bộ mô phỏng đo bằng giây từ quyết định rút bản lỗi; thời gian chuẩn bị đường ống là một phép đo khác. Làm hai việc chuẩn bị độc lập đồng thời giảm thời gian chờ của commit, nhưng không làm giảm số máy cần cho blue-green.',
    cheatsheet: [{
      where: 'cd-panel', control: 'release.onBadRelease', label: 'Phát hành → Khi phát hiện bản lỗi',
      explain: 'Lùi sử dụng môi trường cũ còn nguyên. Tiến cần chờ bản sửa sẵn sàng theo thời gian tình huống cấp.',
    }, {
      where: 'yaml',
      example: cheatsheetExample('chung', [
        { id: 'build', steps: ['dung-anh'] },
        { id: 'chuan-bi', steps: ['cau-hinh'] },
        { id: 'deploy-prod', kind: 'deploy', dependsOn: ['build', 'chuan-bi'], steps: ['giao-anh'] },
      ]),
      explain: 'Hai việc không nhận sản phẩm của nhau có thể chạy độc lập; việc giao bản vẫn chờ cả ảnh và cấu hình.',
    }],
    takeaways: [
      'Blue-green lùi nhanh nhờ môi trường cũ vẫn sẵn sàng nhận toàn bộ lưu lượng.',
      'Giữ hai môi trường hoàn chỉnh đồng nghĩa với đỉnh tài nguyên gấp đôi.',
      'Rút ngắn chuẩn bị đường ống và rút ngắn khôi phục là hai quyết định khác nhau.',
    ],
    pitfalls: ['Chọn tiến vì muốn luôn dùng bản mới nhất: khi bản sửa chưa sẵn sàng, lưu lượng lỗi còn kéo dài.', 'Bỏ mọi cạnh để chạy nhanh: việc giao bản cần đủ hai sản phẩm trước khi bắt đầu.'],
  },
  theoryId: null,
  // A chỉ đổi cách khôi phục; B còn tách hai nhánh chuẩn bị độc lập, giảm 80 xuống 50 giây.
  solutionWorkflow: TUAN_TU,
  altSolutionWorkflow: SONG_SONG,
  cd: {
    release: {
      scenarios: [{
        instances: 8, requestsPerSecond: 1_000, baselineErrorRate: 0.01, candidateErrorRate: 0.12,
        replaceSeconds: 60, switchSeconds: 3, routeSeconds: 10, alertSeconds: 30,
        migration: 'none', fixForwardSeconds: 240,
      }],
      evaluation: { baseSeed: 190_801, passes: 20 },
    },
    editable: ['release.onBadRelease'],
    initial: { release: { strategy: 'blue-green', onBadRelease: 'roll-forward' } },
    solution: { release: { strategy: 'blue-green', onBadRelease: 'rollback' } },
    altSolution: { release: { strategy: 'blue-green', onBadRelease: 'rollback' } },
  },
};
