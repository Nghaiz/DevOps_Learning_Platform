import type { CicdLevel, WorkflowSpec } from '../contract.ts';
import { cheatsheetExample } from '../cheatsheet-example.ts';

const BAN_DAU: WorkflowSpec = {
  name: 'Có người duyệt nhưng prod đi đường vòng',
  stages: [
    {
      id: 'build', kind: 'build', name: 'Dựng ảnh dịch vụ thông báo',
      dependsOn: [], blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'dung-anh', name: 'Dựng ảnh phát hành', durationTicks: 6, blocking: true, produces: ['image'] }],
    },
    {
      id: 'deploy-staging', kind: 'deploy', name: 'Chạy ảnh ở staging', environment: 'staging',
      dependsOn: ['build'], blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'len-staging', name: 'Đưa ảnh vào staging', durationTicks: 3, blocking: true, requires: ['image'] }],
    },
    {
      id: 'approval', kind: 'approval', name: 'Một người duyệt bản phát hành',
      dependsOn: ['deploy-staging'], blocking: true, retries: 0, runnerClass: 'chung', runnerSlots: 0,
      approval: { reviewers: 1 },
      steps: [{ id: 'duyet-ban', name: 'Xem xét artifact và yêu cầu phát hành', durationTicks: 12, blocking: true, requires: ['image'] }],
    },
    {
      id: 'deploy-prod', kind: 'deploy', name: 'Phát hành vào prod', environment: 'prod',
      dependsOn: ['deploy-staging'], blocking: true, retries: 0, runnerClass: 'chung',
      steps: [{ id: 'len-prod', name: 'Đưa ảnh đã duyệt vào prod', durationTicks: 3, blocking: true, requires: ['image'] }],
    },
  ],
};

// A duyệt sau staging; B duyệt artifact song song với staging, rồi gom cả hai điều kiện trước prod.
function coCong(songSong: boolean): WorkflowSpec {
  return {
    name: songSong ? 'Duyệt artifact song song với staging' : 'Duyệt sau khi staging hoàn tất',
    stages: BAN_DAU.stages.map((stage) => {
      if (stage.id === 'approval') return { ...stage, dependsOn: [songSong ? 'build' : 'deploy-staging'] };
      if (stage.id === 'deploy-prod') return { ...stage, dependsOn: songSong ? ['deploy-staging', 'approval'] : ['approval'] };
      return stage;
    }),
  };
}

export const LEVEL_C17: CicdLevel = {
  id: 'cicd-c17-cong-duyet-prod',
  chapter: 'cd',
  title: 'Cổng duyệt phải chặn prod',
  mission: 'Chặn bản bị từ chối khỏi prod và giữ nguyên artifact từ staging.',
  brief: 'Ba commit đang chờ phát hành dịch vụ thông báo. Người duyệt từ chối commit thứ hai, nhưng prod vẫn có đường chạy tới trước khi quyết định duyệt hoàn tất. Đội cần một cổng thật sự có hiệu lực: bản bị từ chối phải dừng, các bản được duyệt phải lên prod bằng đúng ảnh đã chạy ở staging. Thời gian chờ con người cũng tính vào độ trễ.',
  difficulty: 'intermediate',
  initialWorkflow: BAN_DAU,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 3 }],
    inputs: [{ id: 'ma-nguon', label: 'Mã nguồn', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 40, approvalRejected: true }, { id: 'c3', tick: 80 }],
  },
  evaluation: { baseSeed: 170_401, passes: 20 },
  editable: ['edges'],
  allowedKinds: null,
  objectives: [
    { id: 'prod-duoc-canh', label: 'Mọi đường vào prod được canh bởi ít nhất một người duyệt', check: 'environmentGuardedByApproval', args: { environment: 'prod', reviewers: 1 }, required: true },
    { id: 'giu-anh-staging', label: 'Bản lên prod giữ nguyên ảnh staging đã chạy', check: 'promotedArtifactUnchanged', args: { output: 'image', from: 'staging', to: 'prod' }, required: true },
    { id: 'duyet-song-song', label: 'THƯỞNG: lead time dưới 230 giây', check: 'leadTimeUnder', args: { seconds: 230 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 210, budgetLeadSeconds: 500,
    parThroughputPerHour: 6, minThroughputPerHour: 1,
    parRunnerMinutes: 6, budgetRunnerMinutes: 20, minGreenRate: 0.66,
  },
  hints: [
    'Nhìn riêng commit thứ hai: trạng thái đỏ do bị từ chối là kết quả mong muốn, nhưng prod không được chạy.',
    'Cổng approval đang đứng cạnh đường phát hành. Một cổng chỉ canh được prod nếu prod phụ thuộc vào nó.',
    'Cho deploy-prod đợi approval. Có thể duyệt sau staging, hoặc duyệt ngay sau build và cho prod chờ cả staging lẫn approval.',
  ],
  teaching: {
    primer: 'Cổng duyệt là một điều kiện trong đường phát hành. Số người duyệt không có tác dụng nếu tồn tại đường vào prod bỏ qua cổng. Trong bài này, cổng chờ một người và không giữ máy chạy; commit thứ hai bị từ chối theo dữ liệu tình huống. Vì vậy tỷ lệ xanh không cần đạt 100%: dừng đúng bản bị từ chối mới là kết quả an toàn. Duyệt artifact có thể diễn ra song song với staging; nếu quy trình yêu cầu người duyệt xem kết quả staging, cổng phải đứng sau môi trường đó.',
    cheatsheet: [{
      where: 'yaml',
      example: cheatsheetExample('chung', [
        { id: 'deploy-staging', kind: 'deploy', steps: ['len-staging'] },
        { id: 'approval', kind: 'approval', dependsOn: ['deploy-staging'], steps: ['duyet-ban'] },
        { id: 'deploy-prod', kind: 'deploy', dependsOn: ['approval'], steps: ['len-prod'] },
      ]),
      explain: 'Nối đường phát hành đi qua cổng approval có sẵn. Level cố định một người duyệt và kết quả từ chối; ô soạn sửa vị trí cổng trong đồ thị.',
    }, {
      where: 'yaml',
      example: cheatsheetExample('chung', [
        { id: 'build', steps: ['dung-anh'] },
        { id: 'deploy-staging', kind: 'deploy', dependsOn: ['build'], steps: ['len-staging'] },
        { id: 'approval', kind: 'approval', dependsOn: ['build'], steps: ['duyet-ban'] },
        { id: 'deploy-prod', kind: 'deploy', dependsOn: ['deploy-staging', 'approval'], steps: ['len-prod'] },
      ]),
      explain: 'Gom hai điều kiện trước prod: staging hoàn tất và artifact được duyệt. Cổng vẫn chặn dù chạy song song với staging.',
    }],
    takeaways: [
      'Có người duyệt chưa đủ: mọi đường vào prod phải đi qua cổng có hiệu lực.',
      'Bản bị từ chối phải dừng; ép mọi lượt xanh có thể làm mất ý nghĩa phê duyệt.',
      'Chờ con người làm tăng lead time dù không chiếm máy chạy.',
    ],
    pitfalls: ['Để cổng ở nhánh riêng cho sơ đồ gọn: prod có thể phát hành trước khi người duyệt quyết định.', 'Cho cổng bỏ qua lỗi để giữ bảng xanh: quyết định từ chối sẽ mất tác dụng.'],
  },
  theoryId: null,
  solutionWorkflow: coCong(false),
  altSolutionWorkflow: coCong(true),
};
