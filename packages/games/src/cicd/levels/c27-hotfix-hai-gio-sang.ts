import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { ReleasePolicy } from '../cd-contract.ts';
import type { CicdLevel, WorkflowSpec } from '../contract.ts';

function workflow(mode: 'initial' | 'parallel' | 'report-first'): WorkflowSpec {
  return {
    name: 'Hotfix lúc hai giờ sáng',
    stages: [
      {
        id: 'dung', kind: 'build', name: 'Dựng hotfix', dependsOn: [],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'dong-goi', name: 'Đóng gói hotfix', durationTicks: 5, blocking: true, produces: ['image'] }],
      },
      {
        id: 'quet', kind: 'image-scan', name: 'Quét ảnh ứng viên', dependsOn: ['dung'],
        blocking: true, retries: 0, runnerClass: 'chung',
        steps: [{ id: 'quet-anh', name: 'Quét ảnh đã dựng', durationTicks: 6, blocking: true, requires: ['image'] }],
      },
      {
        id: 'staging', kind: 'deploy', name: 'Đưa lên staging', dependsOn: mode === 'initial' ? ['quet'] : ['dung'],
        blocking: true, retries: 0, runnerClass: 'chung', environment: 'staging',
        steps: [{ id: 'len-staging', name: 'Chạy ảnh ở staging', durationTicks: 2, blocking: true, requires: ['image'] }],
      },
      {
        id: 'duyet', kind: 'approval', name: 'Duyệt phát hành',
        dependsOn: mode === 'report-first' ? ['staging', 'quet'] : ['staging'],
        blocking: true, retries: 0, runnerClass: 'chung', runnerSlots: 0, approval: { reviewers: 1 },
        steps: [{ id: 'cho-duyet', name: 'Chờ người trực duyệt', durationTicks: 4, blocking: true }],
      },
      {
        id: 'prod', kind: 'deploy', name: 'Thăng hạng lên prod', dependsOn: ['duyet', 'quet'],
        blocking: true, retries: 0, runnerClass: 'chung', environment: 'prod',
        steps: [{ id: 'len-prod', name: 'Nhận ảnh đã qua staging', durationTicks: 1, blocking: true, requires: ['image'] }],
      },
    ],
  };
}

const INITIAL_RELEASE: ReleasePolicy = {
  strategy: 'rolling', rolling: { batchSize: 2 }, onBadRelease: 'rollback',
  canary: { weightPercent: 5, intervalSeconds: 10, intervals: 2, maxErrorRateDelta: 0.02 },
};

// A duyệt staging đồng thời với quét ảnh, prod đợi cả hai; canary giữ đội nhỏ.
// B người duyệt đợi đủ báo cáo quét; blue-green dùng đội dự phòng để đổi về nhanh.
// Thời lượng/bước/môi trường/cổng giữ cố định theo stage id để hydrate không đổi bài làm.
export const LEVEL_C27: CicdLevel = {
  id: 'cicd-c27-hotfix-hai-gio-sang',
  chapter: 'cd',
  title: 'Hotfix lúc hai giờ sáng',
  mission: 'Phát hành hotfix dưới 170 giây, vẫn giữ duyệt, danh tính artifact và đường phục hồi an toàn.',
  brief: `Lúc hai giờ sáng, dịch vụ thông báo cần một hotfix khẩn. Đường ống hiện mất 180 giây
cho một bản được duyệt, trong khi hạn mới là dưới 170 giây. Có hai máy chạy, nhưng công việc
đang xếp thành hàng dài.

Ba đề xuất sửa được gửi lên; đề xuất thứ hai bị người trực từ chối. Prod chỉ được nhận ảnh
đã chạy ở staging, sau phê duyệt và quét ảnh. Nếu ứng viên lỗi dưới tải thật, hệ thống phải
phục hồi trong dưới 30 giây kể từ quyết định rút. Đội cũng theo dõi số máy phát hành cao nhất.
Nhanh hơn bằng cách bỏ một lớp bảo vệ có thể gây thêm sự cố trong ca trực này.`,
  difficulty: 'advanced',
  initialWorkflow: workflow('initial'),
  solutionWorkflow: workflow('parallel'),
  altSolutionWorkflow: workflow('report-first'),
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma', label: 'Mã nguồn hotfix', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 30, approvalRejected: true }, { id: 'c3', tick: 60 }],
  },
  evaluation: { baseSeed: 1927, passes: 4 },
  editable: ['edges', 'blocking'],
  allowedKinds: [],
  objectives: [
    { id: 'du-kip', label: 'Lead time dưới 170 giây', check: 'leadTimeUnder', args: { seconds: 170 }, required: true },
    { id: 'giu-duyet', label: 'Prod được chặn bởi ít nhất một người duyệt', check: 'environmentGuardedByApproval', args: { environment: 'prod', reviewers: 1 }, required: true },
    { id: 'giu-ban', label: 'Prod dùng đúng ảnh đã qua staging', check: 'promotedArtifactUnchanged', args: { output: 'image', from: 'staging', to: 'prod' }, required: true },
    { id: 'giu-quet', label: 'Prod vẫn đợi quét ảnh', check: 'stageDependsOn', args: { stage: 'prod', on: 'quet' }, required: true },
    { id: 'khong-lot', label: 'Không giữ bản ứng viên lỗi', check: 'badReleasePromotedAtMost', args: { max: 0 }, required: true },
    { id: 'phuc-hoi', label: 'Phục hồi dưới 30 giây sau quyết định rút', check: 'rollbackUnder', args: { seconds: 30 }, required: true },
    { id: 'doi-nho', label: 'Thưởng: cao nhất 11 máy phát hành cùng lúc', check: 'peakInstancesAtMost', args: { max: 11 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 120, budgetLeadSeconds: 170, parThroughputPerHour: 12, minThroughputPerHour: 5,
    parRunnerMinutes: 7, budgetRunnerMinutes: 15,
    // Một commit bị từ chối có chủ ý khiến mỗi pass đỏ; đó là cổng làm đúng việc.
    minGreenRate: 0,
  },
  cd: {
    release: {
      scenarios: [{
        instances: 10, requestsPerSecond: 200, baselineErrorRate: 0, candidateErrorRate: 1,
        replaceSeconds: 60, switchSeconds: 3, routeSeconds: 20, alertSeconds: 180,
        migration: 'none', fixForwardSeconds: 240,
      }],
      evaluation: { baseSeed: 2727, passes: 20 },
    },
    editable: ['release.strategy'],
    initial: { release: INITIAL_RELEASE },
    solution: { release: { ...INITIAL_RELEASE, strategy: 'canary' } },
    altSolution: { release: { ...INITIAL_RELEASE, strategy: 'blue-green' } },
  },
  hints: [
    'Dựng lại artifact, bỏ duyệt hoặc bỏ quét đều thay đổi một bảo đảm đang cần trong ca trực. Tìm thời gian chờ giữa những việc có thể chạy độc lập.',
    'Staging và quét ảnh cùng cần image từ dung. Prod cần cả kết quả quét lẫn cổng duyệt, còn người duyệt có thể xem staging trong lúc quét tiếp tục.',
    'Cho staging và quet chạy sau dung. Duyệt ngay sau staging cho đường ống 120 giây; đợi thêm quet rồi duyệt mất 160 giây. Chọn canary để phục hồi 20 giây với 11 máy, hoặc blue-green để đổi về trong 3 giây với 20 máy.',
  ],
  teaching: {
    primer: `Một hotfix nhanh cần giảm thời gian chờ mà vẫn giữ các bảo đảm quan trọng. Bỏ cổng duyệt làm đường ống ngắn đi, nhưng đề xuất đã bị từ chối có thể tới prod. Dựng lại cũng phá danh tính của bản đã chạy ở staging.

Hai đường mẫu khác nhau ở thời điểm người trực xem xét. Một đường cho phép duyệt staging khi quét ảnh đang chạy; prod vẫn phải đợi cả hai. Đường kia chỉ bắt đầu duyệt sau khi đủ báo cáo, nên mất thêm thời gian nhưng người trực có nhiều thông tin hơn.

Chọn chiến lược phục hồi là quyết định riêng. Canary giới hạn máy ứng viên; blue-green giữ cả một đội dự phòng và đổi bộ chọn nhanh. Những giây phục hồi này không cộng vào lead time CI trong mô hình: đây là hai ngân sách độc lập cùng phải đạt.

Một lượt đỏ do từ chối là kết quả đúng. Không nên dùng tỷ lệ xanh tuyệt đối để ép đội gỡ cổng bảo vệ.`,
    cheatsheet: [
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'dung', steps: ['dong-goi'] },
          { id: 'quet', steps: ['quet-anh'], dependsOn: ['dung'] },
          { id: 'staging', steps: ['len-staging'], dependsOn: ['dung'] },
          { id: 'duyet', steps: ['cho-duyet'], dependsOn: ['staging'] },
          { id: 'prod', steps: ['len-prod'], dependsOn: ['duyet', 'quet'] },
        ]),
        explain: 'Staging và quét nhận cùng ảnh. Cổng duyệt và quét đều phải xong trước prod; tính chất môi trường và phê duyệt đã được level gắn cố định.',
      },
      { where: 'cd-panel', control: 'release.strategy', label: 'Đường phục hồi', explain: 'Canary dùng một máy ứng viên và rút lưu lượng trong 20 giây; blue-green giữ hai đội và đổi bộ chọn trong 3 giây.' },
    ],
    takeaways: [
      'Giảm thời gian chờ không nhất thiết phải bỏ một lớp bảo vệ.',
      'Duyệt song song và duyệt sau đủ báo cáo có đánh đổi về thông tin khi quyết định.',
      'Lead time đường ống và thời gian phục hồi phát hành là hai ngân sách khác nhau.',
      'Từ chối một đề xuất không an toàn là thành công của cổng duyệt.',
    ],
    pitfalls: [
      'Đặt cổng không chặn để mọi lượt xanh: đề xuất bị từ chối sẽ vượt qua cổng.',
      'Đổi chiến lược phát hành rồi mong đường ống 180 giây tự ngắn lại: hai bộ mô phỏng chạy độc lập.',
    ],
  },
  theoryId: null,
};
