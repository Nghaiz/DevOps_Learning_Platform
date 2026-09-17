import { cheatsheetExample } from '../cheatsheet-example.ts';
import type { CicdLevel, StageSpec, WorkflowSpec } from '../contract.ts';

const DUNG: StageSpec = {
  id: 'dung', kind: 'build', name: 'Dựng ảnh ứng dụng', dependsOn: [],
  blocking: true, retries: 0, runnerClass: 'chung',
  steps: [{ id: 'tao-anh', name: 'Tạo ảnh ứng dụng', durationTicks: 3, blocking: true, produces: ['image'] }],
};
const SOAT: StageSpec = {
  id: 'soat', kind: 'lint', name: 'Soát khai báo môi trường', dependsOn: ['dung'],
  blocking: true, retries: 0, runnerClass: 'chung',
  steps: [{ id: 'soat-khai-bao', name: 'Soát khai báo độc lập với ảnh', durationTicks: 2, blocking: true, produces: ['khai-bao-hop-le'] }],
};
const GHI: StageSpec = {
  id: 'ghi', kind: 'package', name: 'Chuẩn bị commit cấu hình', dependsOn: ['soat'],
  blocking: true, retries: 0, runnerClass: 'chung',
  steps: [{ id: 'ghi-cau-hinh', name: 'Ghi ảnh vào khai báo', durationTicks: 1, blocking: true, requires: ['image', 'khai-bao-hop-le'] }],
};
const TUAN_TU: WorkflowSpec = { name: 'Dựng rồi soát khai báo', stages: [DUNG, SOAT, GHI] };
const SONG_SONG: WorkflowSpec = {
  name: 'Soát khai báo trong lúc dựng ảnh',
  stages: [DUNG, { ...SOAT, dependsOn: [] }, { ...GHI, dependsOn: ['dung', 'soat'] }],
};

// A giữ hai việc tuần tự; B soát manifest song song với build rồi gom đủ đầu ra.
// Cùng chu kỳ CD: sự khác biệt nằm ở công việc chuẩn bị commit, không phải đổi số.
export const LEVEL_C23: CicdLevel = {
  id: 'cicd-c23-git-la-nguon-that',
  chapter: 'cd',
  title: 'Git là nguồn sự thật',
  mission: 'Đưa thay đổi đã ghi trong Git lên môi trường sống trong dưới 30 giây.',
  brief: `Đội đã ghi hai phiên bản ảnh mới vào Git ở giây 7 và giây 67. Môi trường sống vẫn chạy ảnh cũ một lúc,
nên bảng theo dõi đang cho thấy trạng thái khai và trạng thái sống khác nhau.

Đường ống chuẩn bị cấu hình có hai việc độc lập: dựng ảnh và soát khai báo. Bộ đối soát đọc thay đổi
theo chu kỳ riêng. Bạn cần giữ đầy đủ sản phẩm của đường ống, đồng thời bảo đảm mỗi thay đổi trong Git
không nằm chờ quá lâu trước khi môi trường sống theo kịp.`,
  difficulty: 'intermediate',
  initialWorkflow: TUAN_TU,
  solutionWorkflow: TUAN_TU,
  altSolutionWorkflow: SONG_SONG,
  workload: {
    runners: [{ id: 'chung', label: 'Máy chạy chung', count: 2 }],
    inputs: [{ id: 'ma', label: 'Mã nguồn và cấu hình', changesEvery: 1 }],
    commits: [{ id: 'c1', tick: 0 }, { id: 'c2', tick: 10 }, { id: 'c3', tick: 20 }],
  },
  evaluation: { baseSeed: 1923, passes: 4 },
  editable: ['edges'],
  allowedKinds: [],
  objectives: [
    { id: 'git-den-song', label: 'Ảnh sống theo kịp Git trong dưới 30 giây', check: 'driftLongestUnder', args: { field: 'image', seconds: 30 }, required: true },
    { id: 'du-dau-ra', label: 'Không thiếu ảnh hay khai báo đã được soát', check: 'noFailureCause', args: { cause: 'missing-output' }, required: true },
    { id: 'xanh', label: 'Mọi lượt chuẩn bị cấu hình đều xanh', check: 'greenRateAtLeast', args: { rate: 1 }, required: true },
    { id: 'chuan-bi-nhanh', label: 'Thưởng: chuẩn bị một commit trong dưới 50 giây', check: 'leadTimeUnder', args: { seconds: 50 }, required: false },
  ],
  thresholds: {
    parLeadSeconds: 40, budgetLeadSeconds: 120, parThroughputPerHour: 30, minThroughputPerHour: 10,
    parRunnerMinutes: 3, budgetRunnerMinutes: 10, minGreenRate: 1,
  },
  cd: {
    gitops: { scenario: {
      horizonSeconds: 150,
      initial: [{ field: 'image', value: 'api-tim-kiem-v1' }],
      changes: [
        { atSecond: 7, actor: 'git', field: 'image', value: 'api-tim-kiem-v2' },
        { atSecond: 67, actor: 'git', field: 'image', value: 'api-tim-kiem-v3' },
      ],
    } },
    editable: ['gitops.reconcileEvery'],
    initial: { gitops: { reconcileEverySeconds: 120, selfHeal: false, ignoreFields: [] } },
    solution: { gitops: { reconcileEverySeconds: 30, selfHeal: false, ignoreFields: [] } },
    altSolution: { gitops: { reconcileEverySeconds: 30, selfHeal: false, ignoreFields: [] } },
  },
  hints: [
    'Ở giây 7, chỉ trạng thái khai đổi. Nhịp đối soát đầu tiên của chính sách ban đầu ở giây 120.',
    'Tắt tự sửa không tắt đồng bộ commit. Hãy tìm nhịp đọc Git kế tiếp thay vì tìm lỗi trong ảnh.',
    'Chu kỳ 30 giây đồng bộ hai commit ở giây 30 và 90. Để lấy thưởng, soát khai báo song song với dựng ảnh rồi cho bước ghi chờ cả hai.',
  ],
  teaching: {
    primer: `Git chứa trạng thái mong muốn, còn môi trường sống chứa trạng thái đang thực thi. Một commit thay đổi bên thứ nhất ngay, nhưng bên thứ hai chỉ theo ở lần đối soát kế tiếp.

Đồng bộ một commit và tự sửa thay đổi tay là hai cơ chế khác nhau. Bài này tắt tự sửa nhưng vẫn bật đồng bộ Git: một commit hợp lệ vẫn được áp dụng.

Đường ống chuẩn bị cấu hình và vòng đối soát dùng hai đồng hồ riêng. Lead time của đường ống không phải khoảng chờ đọc Git. Các mốc commit trong kịch bản được cấp sẵn, không tính từ thời gian của các stage.

Quan sát cả hai trạng thái ở giữa hai nhịp giúp phân biệt độ trễ bình thường với việc cấu hình chưa được ghi vào nguồn chính thức.`,
    cheatsheet: [
      { where: 'cd-panel', control: 'gitops.reconcileEvery', label: 'Chu kỳ đối soát', explain: 'Các nhịp ở P, 2P, 3P giây. Một commit nằm giữa hai nhịp phải đợi tới nhịp tiếp theo.' },
      {
        where: 'yaml',
        example: cheatsheetExample('chung', [
          { id: 'dung', steps: ['tao-anh'] }, { id: 'soat', steps: ['soat-khai-bao'] },
          { id: 'ghi', dependsOn: ['dung', 'soat'], steps: ['ghi-cau-hinh'] },
        ]),
        explain: 'Gom kết quả từ hai nhánh độc lập trước khi chuẩn bị commit cấu hình.',
      },
    ],
    takeaways: [
      'Commit đổi trạng thái khai ngay; môi trường sống chỉ theo ở nhịp đối soát kế tiếp.',
      'Tắt tự sửa không tắt việc đồng bộ những commit mới.',
      'Tối ưu đường ống chuẩn bị và tối ưu chu kỳ đối soát giải quyết hai loại thời gian chờ khác nhau.',
    ],
    pitfalls: [
      'Thấy ảnh cũ ngay sau commit rồi kết luận phát hành thất bại: bộ đối soát có thể chưa tới nhịp.',
      'Gỡ cạnh gom kết quả để bước ghi chạy sớm: nó mất ảnh hoặc khai báo đã được soát.',
    ],
  },
  theoryId: '18-gitops-va-drift',
};
