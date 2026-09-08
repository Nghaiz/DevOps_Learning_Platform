import type { Problem } from '../problem.ts';

/**
 * Thu quyền lại mà không làm sập bảng điều khiển
 *
 * Chuyển từ `challenges.ts` (ch-09-quyen-qua-rong) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0009: Problem = {
  code: 'K8S-0009',
  slug: 'quyen-qua-rong',
  title: 'Thu quyền lại mà không làm sập bảng điều khiển',
  statement: `Đợt rà soát an ninh phát hiện ServiceAccount \`bot-bao-cao\` trong namespace
\`quan-tri\` đang được nối tới một Role cho phép mọi động từ trên mọi tài
nguyên.

Nó chỉ cần đọc danh sách pod và service. Thu quyền lại về đúng mức đó: sau
khi xong, nó vẫn liệt kê được pod và service, và **không** đọc được Secret,
**không** xoá được gì. Ứng dụng \`bao-cao-noi-bo\` phải vẫn đủ 2 replica.`,
  /* Bậc hard: `advanced` → `hard`. Hai ô cho phép, hai ô cấm, và một ứng dụng phải sống. Khác ch-08 ở chỗ mọi ràng buộc nằm trong MỘT object và kiểm được từng ô độc lập, nên nó khó nhưng không bấp bênh. */
  difficulty: 'hard',
  topics: ['security', 'troubleshooting'],
  tags: ['rbac', 'role', 'quyen-toi-thieu', 'serviceaccount'],
  timeLimitSec: 240,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['quan-tri'],
    resources: [
      { kind: 'ServiceAccount', name: 'bot-bao-cao', namespace: 'quan-tri', spec: {} },
      {
        kind: 'Secret',
        name: 'khoa-noi-bo',
        namespace: 'quan-tri',
        spec: { type: 'Opaque', data: { KHOA: 'noi-dung-nhay-cam' } },
      },
      {
        kind: 'Role',
        name: 'toan-quyen-tam',
        namespace: 'quan-tri',
        spec: {
          rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
        },
      },
      {
        kind: 'RoleBinding',
        name: 'bot-bao-cao-toan-quyen',
        namespace: 'quan-tri',
        spec: {
          roleRef: { kind: 'Role', name: 'toan-quyen-tam' },
          subjects: [{ kind: 'ServiceAccount', name: 'bot-bao-cao', namespace: 'quan-tri' }],
        },
      },
      {
        kind: 'Deployment',
        name: 'bao-cao-noi-bo',
        namespace: 'quan-tri',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'bao-cao-noi-bo' } },
          template: {
            labels: { app: 'bao-cao-noi-bo' },
            serviceAccountName: 'bot-bao-cao',
            containers: [
              {
                name: 'bao-cao-noi-bo',
                image: 'ghcr.io/dlp/bao-cao-noi-bo:1.1.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '300m', memory: '256Mi' },
                },
              },
            ],
          },
        },
      },
    ],
  },
  objectives: [
    {
      id: 'con-liet-ke-duoc-pod',
      label: '`bot-bao-cao` vẫn liệt kê được pod',
      check: 'rbac-allows',
      args: {
        serviceAccount: 'bot-bao-cao',
        namespace: 'quan-tri',
        verb: 'list',
        resource: 'pods',
      },
      required: true,
    },
    {
      id: 'con-liet-ke-duoc-service',
      label: '`bot-bao-cao` vẫn liệt kê được service',
      check: 'rbac-allows',
      args: {
        serviceAccount: 'bot-bao-cao',
        namespace: 'quan-tri',
        verb: 'list',
        resource: 'services',
      },
      required: true,
    },
    {
      id: 'khong-doc-secret',
      label: '`bot-bao-cao` KHÔNG đọc được Secret',
      check: 'rbac-denies',
      args: {
        serviceAccount: 'bot-bao-cao',
        namespace: 'quan-tri',
        verb: 'get',
        resource: 'secrets',
      },
      required: true,
    },
    {
      id: 'khong-xoa-pod',
      label: '`bot-bao-cao` KHÔNG xoá được pod',
      check: 'rbac-denies',
      args: {
        serviceAccount: 'bot-bao-cao',
        namespace: 'quan-tri',
        verb: 'delete',
        resource: 'pods',
      },
      required: true,
    },
    {
      id: 'ung-dung-van-chay',
      label: '`bao-cao-noi-bo` vẫn có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'bao-cao-noi-bo', namespace: 'quan-tri', replicas: 2 },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Quyền trong Kubernetes là phép cộng: không có luật nào từ chối, nên thu quyền nghĩa là viết lại danh sách được phép chứ không phải thêm một dòng cấm.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: 'Một luật RBAC gồm ba trục: `apiGroups`, `resources`, `verbs`. Dấu sao ở bất kỳ trục nào là mở toàn bộ trục đó.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'Sửa Role: `resources` chỉ còn `pods` và `services`, `verbs` chỉ còn `get`, `list`, `watch`, `apiGroups` để chuỗi rỗng (nhóm core). Giữ nguyên RoleBinding — nó đang trỏ đúng chỗ.',
      penaltyPoints: 30,
    },
  ],
  /* `null` chứ không phải một con số bịa: challenge cũ không có `parMoves`, và
     đặt đại một giá trị sẽ làm phần chấm theo số nước đi nói dối ngay từ bài đầu. */
  parMoves: null,
  state: 'published',
  authorId: null,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};
