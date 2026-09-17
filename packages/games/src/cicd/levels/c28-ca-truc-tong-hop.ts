import type { CicdCdPolicies } from '../cd-contract.ts';
import type { CicdLevel, WorkflowSpec } from '../contract.ts';
import { cheatsheetExample } from '../cheatsheet-example.ts';

function workflow(parallel: boolean): WorkflowSpec {
  return {
    name: 'Khép lại ca trực dịch vụ thông báo',
    stages: [
      {
        id: 'dung', kind: 'build', name: 'Dựng ảnh ứng viên', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'tao-anh', name: 'Đóng gói ảnh', durationTicks: 4, blocking: true, produces: ['image'] }],
      },
      {
        id: 'quet', kind: 'image-scan', name: 'Quét ảnh', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'quet-anh', name: 'Soát ảnh đã dựng', durationTicks: 3, blocking: true, requires: ['image'] }],
      },
      {
        id: 'staging', kind: 'deploy', name: 'Chạy ở staging', dependsOn: parallel ? ['dung'] : ['quet'],
        blocking: true, retries: 0, runnerClass: 'chung', environment: 'staging',
        steps: [{ id: 'len-staging', name: 'Nhận ảnh ứng viên', durationTicks: 2, blocking: true, requires: ['image'] }],
      },
      {
        id: 'duyet', kind: 'approval', name: 'Duyệt sau đủ báo cáo', dependsOn: ['staging', 'quet'],
        blocking: true, retries: 0, runnerClass: 'chung', runnerSlots: 0, approval: { reviewers: 1 },
        steps: [{ id: 'duyet-anh', name: 'Xem báo cáo phát hành', durationTicks: 2, blocking: true }],
      },
      {
        id: 'prod', kind: 'deploy', name: 'Thăng hạng ảnh', dependsOn: ['duyet'],
        blocking: true, retries: 0, runnerClass: 'chung', environment: 'prod',
        steps: [{ id: 'len-prod', name: 'Nhận ảnh đã qua staging', durationTicks: 1, blocking: true, requires: ['image'] }],
      },
    ],
  };
}

const INITIAL: CicdCdPolicies = {
  release: {
    strategy: 'rolling', rolling: { batchSize: 2 }, onBadRelease: 'rollback',
    canary: { weightPercent: 5, intervalSeconds: 10, intervals: 2, maxErrorRateDelta: 0.02 },
  },
  gitops: { reconcileEverySeconds: 60, selfHeal: false, ignoreFields: [] },
  masking: { masked: [{ secret: 'khoa', form: 'raw' }] },
};
const MASKING = { masked: [{ secret: 'khoa', form: 'raw' }, { secret: 'khoa', form: 'base64' }] } as const;

// A chuẩn bị song song, canary và tự sửa theo nhịp. B chuẩn bị tuần tự,
// blue-green và chờ commit sửa drift. Hai đường khác cả đồ thị lẫn quyền sửa sống.
export const LEVEL_C28: CicdLevel = {
  id: 'cicd-c28-ca-truc-tong-hop', chapter: 'cd', title: 'Khép lại ca trực',
  mission: 'Giữ đúng artifact, phục hồi nhanh, giới hạn drift và chặn bí mật trong cùng ca trực.',
  brief: `Dịch vụ thông báo gặp ba vấn đề trong một ca trực: ứng viên lỗi dưới tải,
ảnh sống bị đổi tay và khóa dịch vụ xuất hiện trong log chẩn đoán dưới dạng biến đổi.
Đội cần khôi phục dưới 30 giây kể từ quyết định rút bản lỗi, giữ mỗi đoạn lệch ảnh dưới
40 giây và không để lại bí mật trong log.

Đường ống vẫn phải quét ảnh, chạy staging rồi nhận phê duyệt trước prod. Có hai máy chạy
và ngân sách chuẩn bị dưới 150 giây. Bạn tự chọn cách xếp công việc, chiến lược phát hành
và quyền tự sửa. Mỗi quyết định cần giữ được các bảo đảm còn lại.`,
  difficulty: 'advanced', initialWorkflow: workflow(false),
  solutionWorkflow: workflow(true), altSolutionWorkflow: workflow(false),
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 30 }, { id: 'c3', tick: 60 }],
  },
  evaluation: { baseSeed: 1928, passes: 20 }, editable: ['edges'], allowedKinds: [],
  objectives: [
    { id: 'giu-anh', label: 'Prod nhận đúng ảnh staging', check: 'promotedArtifactUnchanged', args: { output: 'image', from: 'staging', to: 'prod' }, required: true },
    { id: 'giu-duyet', label: 'Prod được canh bởi một người duyệt', check: 'environmentGuardedByApproval', args: { environment: 'prod', reviewers: 1 }, required: true },
    { id: 'giu-quet', label: 'Prod đợi quét ảnh', check: 'stageDependsOn', args: { stage: 'prod', on: 'quet' }, required: true },
    { id: 'kip-ca', label: 'Chuẩn bị dưới 150 giây', check: 'leadTimeUnder', args: { seconds: 150 }, required: true },
    { id: 'phuc-hoi', label: 'Phục hồi dưới 30 giây sau quyết định rút', check: 'rollbackUnder', args: { seconds: 30 }, required: true },
    { id: 'khong-giu-loi', label: 'Không giữ bản ứng viên lỗi', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'du-lieu', label: 'Không gây sự cố dữ liệu', check: 'noDataIncident', required: true },
    { id: 'drift', label: 'Mỗi đoạn lệch ảnh dưới 40 giây', check: 'driftLongestUnder', args: { field: 'image', seconds: 40 }, required: true },
    { id: 'bi-mat', label: 'Không rò khóa trong log', check: 'secretLeaksAtMost', args: { max: 0 }, required: true },
    { id: 'tiet-kiem-may', label: 'Thưởng: không quá 11 máy phát hành', check: 'peakInstancesAtMost', args: { max: 11 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 100, budgetLeadSeconds: 150, parThroughputPerHour: 12, minThroughputPerHour: 5,
    parRunnerMinutes: 6, budgetRunnerMinutes: 15, minGreenRate: 1,
  },
  cd: {
    release: {
      scenarios: [{
        instances: 10, requestsPerSecond: 200, baselineErrorRate: 0, candidateErrorRate: 1,
        replaceSeconds: 60, switchSeconds: 3, routeSeconds: 20, alertSeconds: 180,
        migration: 'none', fixForwardSeconds: 240,
      }],
      evaluation: { baseSeed: 2828, passes: 20 },
    },
    gitops: { scenario: {
      horizonSeconds: 120, initial: [{ field: 'image', value: 'thong-bao-v1' }],
      changes: [
        { atSecond: 11, actor: 'human', field: 'image', value: 'thong-bao-tam' },
        { atSecond: 41, actor: 'git', field: 'image', value: 'thong-bao-v2' },
      ],
    } },
    masking: { scenario: {
      secrets: [{ id: 'khoa', value: 'ThongBao+28/a?K=7' }],
      lines: [{ text: 'Khóa: {{khoa}}' }, { text: 'Chẩn đoán: {{khoa|base64}}' }],
    } },
    editable: ['release.strategy', 'gitops.reconcileEvery', 'gitops.selfHeal', 'masking.masked'],
    initial: INITIAL,
    solution: {
      release: { ...INITIAL.release!, strategy: 'canary' },
      gitops: { reconcileEverySeconds: 30, selfHeal: true, ignoreFields: [] }, masking: MASKING,
    },
    altSolution: {
      release: { ...INITIAL.release!, strategy: 'blue-green' },
      gitops: { reconcileEverySeconds: 15, selfHeal: false, ignoreFields: [] }, masking: MASKING,
    },
  },
  hints: [
    'Tách từng điều kiện: đường phụ thuộc bảo vệ artifact, chính sách phát hành bảo vệ phục hồi, đối soát quản drift và đăng ký chuỗi bảo vệ log.',
    'Đọc khoảng lệch từ giây 11 tới nhịp sửa kế tiếp. Tắt tự sửa vẫn có thể đồng bộ commit ở giây 41; chu kỳ quyết định nó lên sống lúc nào.',
    'Một đường dùng canary, tự sửa mỗi 30 giây và chuẩn bị song song. Đường khác dùng blue-green, chỉ đồng bộ mỗi 15 giây và giữ chuẩn bị tuần tự. Cả hai đăng ký raw và base64; canary lấy thưởng đội máy nhỏ.',
  ],
  teaching: {
    primer: `Bài cuối ghép các quyết định độc lập của một ca trực. Một đường ống xanh không chứng minh bản ứng viên an toàn dưới tải. Phục hồi ứng dụng nhanh cũng không chứng minh cấu hình đã hết drift hoặc log đã sạch bí mật.

Ba bộ mô phỏng dùng các tình huống cố định, độc lập với thời gian chạy workflow. Mốc chỉnh tay và commit không được sinh từ stage; nội dung log cũng không biến mất khi đổi cạnh. Vì vậy từng nhóm mục tiêu phải được xử lý trực tiếp.

Không có một cấu hình duy nhất: có thể dành thêm máy để đổi bộ chọn nhanh, hoặc dùng nhóm canary nhỏ; có thể tự sửa ngay nhịp kế tiếp, hoặc đợi commit hợp lệ. Mỗi hướng phải giữ nguyên danh tính ảnh và đường duyệt trước prod.`,
    cheatsheet: [
      { where: 'cd-panel', control: 'release.strategy', label: 'Chiến lược phát hành', explain: 'Cân đội máy canary với đội dự phòng blue-green; cả hai phải phục hồi trong ngân sách.' },
      { where: 'cd-panel', control: 'gitops.selfHeal', label: 'Tự sửa', explain: 'Tự sửa chỉnh tay hoặc chỉ đồng bộ thay đổi mới từ Git.' },
      { where: 'cd-panel', control: 'gitops.reconcileEvery', label: 'Chu kỳ đối soát', explain: 'Tính nhịp kế tiếp sau giây 11 và sau giây 41 để đọc độ dài drift.' },
      { where: 'cd-panel', control: 'masking.masked', label: 'Chuỗi đăng ký che', explain: 'Đối chiếu từng dạng thực sự xuất hiện trong log.' },
      { where: 'yaml', example: cheatsheetExample('chung', [
        { id: 'dung', steps: ['tao-anh'] },
        { id: 'quet', dependsOn: ['dung'], steps: ['quet-anh'] },
        { id: 'staging', dependsOn: ['dung'], steps: ['len-staging'] },
        { id: 'duyet', dependsOn: ['staging', 'quet'], steps: ['duyet-anh'] },
        { id: 'prod', dependsOn: ['duyet'], steps: ['len-prod'] },
      ]), explain: 'Giữ cổng duyệt sau cả staging lẫn quét; prod chỉ nhận ảnh sau cổng.' },
    ],
    takeaways: [
      'Mỗi bảo đảm vận hành cần bằng chứng riêng, không suy ra từ một lượt xanh.',
      'Đổi chiến lược phát hành không tự sửa drift hoặc che log.',
      'Hai hướng giải có thể cùng an toàn nhưng dùng tài nguyên và quyền tự sửa khác nhau.',
    ],
    pitfalls: ['Chỉ tối ưu lead time rồi bỏ quên thời gian phục hồi.', 'Tắt tự sửa và tưởng drift biến mất ngay sau commit.', 'Che khóa thô rồi bỏ qua chuỗi base64 có thể khôi phục.'],
  },
  theoryId: '21-hotfix-va-ca-truc',
};
