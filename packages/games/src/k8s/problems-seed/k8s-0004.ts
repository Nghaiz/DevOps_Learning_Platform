import type { Problem } from '../problem.ts';

/**
 * Hai workload cùng Pending, hai lý do
 *
 * Chuyển từ `challenges.ts` (ch-04-hai-pod-cung-pending) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0004: Problem = {
  code: 'K8S-0004',
  slug: 'hai-pod-cung-pending',
  title: 'Hai workload cùng Pending, hai lý do',
  statement: `Namespace \`phan-tich\` có hai Deployment kẹt \`Pending\`. Cluster nhìn qua thì
rảnh. Không cái nào Pending vì cùng lý do với cái kia.

Đưa cả hai lên chạy. Không được giảm số replica của bất kỳ workload nào,
kể cả \`chiem-cho\` — nó phải giữ nguyên 6 replica sẵn sàng khi bạn xong.`,
  /* Bậc hard: `advanced` → `hard`. Hai nguyên nhân Pending trông giống hệt nhau ở `get pods`, và ràng buộc "không được giảm replica của cái nào" chặn đúng lối tắt mà đa số người chơi thử đầu tiên. */
  difficulty: 'hard',
  topics: ['scheduling', 'troubleshooting'],
  tags: ['pending', 'requests-cpu', 'nodeselector', 'scheduler'],
  timeLimitSec: 240,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true, labels: { loai: 'thuong' } },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true, labels: { loai: 'thuong' } },
    ],
    namespaces: ['phan-tich'],
    resources: [
      {
        kind: 'Deployment',
        name: 'chiem-cho',
        namespace: 'phan-tich',
        spec: {
          replicas: 6,
          selector: { matchLabels: { app: 'chiem-cho' } },
          template: {
            labels: { app: 'chiem-cho' },
            containers: [
              {
                name: 'chiem-cho',
                image: 'ghcr.io/dlp/chiem-cho:1.0.0',
                resources: {
                  requests: { cpu: '1100m', memory: '256Mi' },
                  limits: { cpu: '1400m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'tong-hop',
        namespace: 'phan-tich',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'tong-hop' } },
          template: {
            labels: { app: 'tong-hop' },
            containers: [
              {
                name: 'tong-hop',
                image: 'ghcr.io/dlp/tong-hop:2.0.0',
                resources: {
                  requests: { cpu: '800m', memory: '512Mi' },
                  limits: { cpu: '1000m', memory: '1Gi' },
                },
              },
            ],
          },
        },
        seededIncident: 'node-het-cpu',
      },
      {
        kind: 'Deployment',
        name: 'gom-so-lieu',
        namespace: 'phan-tich',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'gom-so-lieu' } },
          template: {
            labels: { app: 'gom-so-lieu' },
            nodeSelector: { 'may-loai': 'thuong' },
            containers: [
              {
                name: 'gom-so-lieu',
                image: 'ghcr.io/dlp/gom-so-lieu:1.3.0',
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '300m', memory: '256Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'nodeselector-khong-khop',
      },
    ],
  },
  objectives: [
    {
      id: 'tong-hop-chay',
      label: '`tong-hop` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'tong-hop', namespace: 'phan-tich', replicas: 2 },
      required: true,
    },
    {
      id: 'gom-so-lieu-chay',
      label: '`gom-so-lieu` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'gom-so-lieu', namespace: 'phan-tich', replicas: 2 },
      required: true,
    },
    {
      id: 'giu-chiem-cho',
      label: '`chiem-cho` vẫn giữ đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'chiem-cho', namespace: 'phan-tich', replicas: 6 },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Scheduler ghi lý do từ chối vào Events của chính pod đang Pending. Hai pod, hai câu khác nhau — đọc cả hai trước khi kết luận.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: 'Một pod không tìm ra node nào ĐỦ CHỖ; chỗ trống được tính bằng tổng `requests` đã đặt trên node, không phải bằng mức dùng thật. Pod kia thì không có node nào KHỚP điều kiện nó đòi.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'Hạ `requests` của workload bị chật xuống mức thật sự cần, và sửa `nodeSelector` của workload kia cho khớp label có thật trên node. Đừng đụng tới `chiem-cho`.',
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
