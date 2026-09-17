import type { CicdLevel, StageSpec, WorkflowSpec } from '../contract.ts';
import { cheatsheetExample } from '../cheatsheet-example.ts';

const BUILD: StageSpec = {
  id: 'build-staging', kind: 'build', name: 'Dựng ảnh lần đầu',
  dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
  steps: [{ id: 'dung-anh', name: 'Dựng ảnh từ mã nguồn', durationTicks: 6, blocking: true, produces: ['image'] }],
};
const STAGING: StageSpec = {
  id: 'deploy-staging', kind: 'deploy', name: 'Chạy ảnh ở staging', environment: 'staging',
  dependsOn: ['build-staging'], blocking: true, retries: 0, runnerClass: 'chung',
  steps: [{ id: 'len-staging', name: 'Phát hành ảnh vào staging', durationTicks: 3, blocking: true, requires: ['image'] }],
};
const PROD: StageSpec = {
  id: 'deploy-prod', kind: 'deploy', name: 'Phát hành vào prod', environment: 'prod',
  dependsOn: ['build-prod'], blocking: true, retries: 0, runnerClass: 'chung',
  steps: [{ id: 'len-prod', name: 'Phát hành ảnh vào prod', durationTicks: 3, blocking: true, requires: ['image'] }],
};
const BAN_DAU: WorkflowSpec = {
  name: 'Mỗi môi trường dựng một ảnh',
  stages: [BUILD, STAGING, {
    id: 'build-prod', kind: 'build', name: 'Dựng lại ảnh cho prod',
    dependsOn: ['deploy-staging'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'dung-lai-anh', name: 'Dựng ảnh lần thứ hai', durationTicks: 6, blocking: true, produces: ['image'] }],
  }, PROD],
};

// A thăng hạng trực tiếp từ staging; B thêm cổng kiểm tra vận hành trên chính ảnh staging rồi thăng hạng.
const THANG_HANG: WorkflowSpec = {
  name: 'Thăng hạng ảnh staging vào prod',
  stages: [BUILD, STAGING, { ...PROD, dependsOn: ['deploy-staging'] }],
};
const QUA_CONG: WorkflowSpec = {
  name: 'Kiểm tra vận hành rồi thăng hạng',
  stages: [BUILD, STAGING, {
    id: 'smoke-staging', kind: 'smoke', name: 'Kiểm tra vận hành ở staging',
    dependsOn: ['deploy-staging'], blocking: true, retries: 0, runnerClass: 'chung',
    steps: [{ id: 'goi-thu-api', name: 'Gọi thử API của bản staging', durationTicks: 6, blocking: true, requires: ['image'] }],
  }, { ...PROD, dependsOn: ['smoke-staging'] }],
};

export const LEVEL_C16: CicdLevel = {
  id: 'cicd-c16-thang-hang-dung-dung-lai',
  chapter: 'cd',
  title: 'Thăng hạng, đừng dựng lại',
  mission: 'Đưa đúng artifact đã chạy ở staging lên prod, giữ nguyên danh tính.',
  brief: 'Staging xanh, prod cũng xanh, nhưng hai môi trường đang dùng hai danh tính ảnh khác nhau. Một thay đổi phụ thuộc lúc dựng lại có thể khiến kết quả ở staging không còn chứng minh điều gì cho prod. Đội cần mỗi commit lên prod bằng chính ảnh đã chạy ở staging; việc kiểm tra vận hành bổ sung là lựa chọn của bạn.',
  difficulty: 'intermediate',
  initialWorkflow: BAN_DAU,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 3 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 30 }, { id: 'c3', tick: 60 }],
  },
  evaluation: { baseSeed: 160_401, passes: 20 },
  editable: ['stages', 'edges'],
  allowedKinds: ['build', 'deploy', 'smoke'],
  objectives: [
    { id: 'giu-danh-tinh', label: 'Prod nhận đúng ảnh đã chạy ở staging', check: 'promotedArtifactUnchanged', args: { output: 'image', from: 'staging', to: 'prod' }, required: true },
    { id: 'tat-ca-xanh', label: 'Mọi commit hoàn tất thành công', check: 'greenRateAtLeast', args: { rate: 1 }, required: true },
    { id: 'thang-hang-gon', label: 'THƯỞNG: lead time dưới 150 giây', check: 'leadTimeUnder', args: { seconds: 150 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 120, budgetLeadSeconds: 400,
    parThroughputPerHour: 12, minThroughputPerHour: 1,
    parRunnerMinutes: 6, budgetRunnerMinutes: 20, minGreenRate: 1,
  },
  hints: [
    'So danh tính ảnh ở hai môi trường, đừng chỉ so mã commit hoặc tên image.',
    'build-prod tạo một artifact mới dù lấy cùng mã nguồn. Prod phải nhận ảnh đã tồn tại.',
    'Bỏ build-prod và nối deploy-prod sau deploy-staging. Nếu muốn thêm kiểm tra vận hành, đặt smoke-staging giữa hai môi trường và giữ nguyên ảnh.',
  ],
  teaching: {
    primer: 'Thăng hạng là chuyển cùng một artifact qua các môi trường. Dựng lại là tạo artifact mới. Cùng commit không bảo đảm hai lần dựng giống hệt nhau: dấu thời gian hoặc phụ thuộc có thể khác. Trong bài này, mỗi stage dựng sinh một danh tính khác. Mục tiêu so cả thứ tự lẫn danh tính: prod phải nhận ảnh sau khi staging chạy xong, từ cùng một nguồn dựng. Thêm kiểm tra vận hành không cần tạo ảnh khác.',
    cheatsheet: [{
      where: 'yaml',
      example: cheatsheetExample('chung', [
        { id: 'build-staging', steps: ['dung-anh'] },
        { id: 'deploy-staging', kind: 'deploy', dependsOn: ['build-staging'], steps: ['len-staging'] },
        { id: 'deploy-prod', kind: 'deploy', dependsOn: ['deploy-staging'], steps: ['len-prod'] },
      ]),
      explain: 'Một nguồn dựng, hai môi trường nối tiếp. Bước phát hành chỉ nhận image, không sản xuất một image thay thế.',
    }, {
      where: 'yaml',
      example: cheatsheetExample('chung', [
        { id: 'deploy-staging', kind: 'deploy', steps: ['len-staging'] },
        { id: 'smoke-staging', kind: 'smoke', dependsOn: ['deploy-staging'], steps: ['goi-thu-api'] },
        { id: 'deploy-prod', kind: 'deploy', dependsOn: ['smoke-staging'], steps: ['len-prod'] },
      ]),
      explain: 'Cổng kiểm tra vận hành kéo dài đường đi nhưng giữ nguyên artifact từ staging tới prod.',
    }],
    takeaways: [
      'Thăng hạng giữ nguyên danh tính artifact; dựng lại sinh một danh tính mới.',
      'Staging và prod cùng xanh chưa chứng minh prod đang dùng bản đã được thử.',
      'Một cổng kiểm tra có thể đứng giữa hai môi trường mà không cần dựng lại.',
    ],
    pitfalls: ['Dùng cùng tên image làm bằng chứng: tên là nhãn, danh tính mới phân biệt hai bản dựng.', 'Cho staging và prod chạy song song để nhanh hơn: prod có thể lên trước khi staging xong.'],
  },
  theoryId: '13-thang-hang-dung-dung-lai',
  solutionWorkflow: THANG_HANG,
  altSolutionWorkflow: QUA_CONG,
};
