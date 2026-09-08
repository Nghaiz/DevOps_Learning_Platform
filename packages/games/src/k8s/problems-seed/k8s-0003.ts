import type { Problem } from '../problem.ts';

/**
 * Rollout treo, dịch vụ còn sống, đồng hồ đang chạy
 *
 * Chuyển từ `challenges.ts` (ch-03-rollout-treo) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0003: Problem = {
  code: 'K8S-0003',
  slug: 'rollout-treo',
  title: 'Rollout treo, dịch vụ còn sống, đồng hồ đang chạy',
  statement: `Deployment \`cong-noi-bo\` đang có 5 pod cho 4 replica. Một số pod mới không
bao giờ Ready. Người dùng chưa bị ảnh hưởng.

Đưa nó về trạng thái ổn định: 4 replica sẵn sàng, chạy image lành
\`ghcr.io/dlp/cong-noi-bo:2.8.0\`, và không pod nào còn mang lý do lỗi.`,
  /* Bậc medium: `intermediate` → `medium`. Một lỗi duy nhất, và cluster tự giữ lại câu trả lời trong lịch sử revision. Sức ép ở đây là nhận ra "treo" khác "sập" chứ không phải ở số bước phải làm. */
  difficulty: 'medium',
  topics: ['workload', 'troubleshooting'],
  tags: ['rollout-treo', 'maxunavailable', 'replicaset', 'rollout-undo'],
  timeLimitSec: 180,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['noi-bo'],
    resources: [
      {
        kind: 'ReplicaSet',
        name: 'cong-noi-bo-a1b2c3',
        namespace: 'noi-bo',
        spec: {
          replicas: 0,
          revision: 7,
          selector: { matchLabels: { app: 'cong-noi-bo', 'pod-template-hash': 'a1b2c3' } },
          template: {
            labels: { app: 'cong-noi-bo', 'pod-template-hash': 'a1b2c3' },
            containers: [
              {
                name: 'cong',
                image: 'ghcr.io/dlp/cong-noi-bo:2.8.0',
                ports: [{ containerPort: 8080 }],
              },
            ],
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'cong-noi-bo',
        namespace: 'noi-bo',
        spec: {
          replicas: 4,
          revision: 8,
          selector: { matchLabels: { app: 'cong-noi-bo' } },
          strategy: { type: 'RollingUpdate', maxSurge: 1, maxUnavailable: 0 },
          template: {
            labels: { app: 'cong-noi-bo' },
            containers: [
              {
                name: 'cong',
                image: 'ghcr.io/dlp/cong-noi-bo:2.9.0-rc3',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '600m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'image-tag-sai',
      },
    ],
  },
  objectives: [
    {
      id: 'bon-replica',
      label: '`cong-noi-bo` có đủ 4 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'cong-noi-bo', namespace: 'noi-bo', replicas: 4 },
      required: true,
    },
    {
      id: 'image-lanh',
      label: 'Chạy lại image lành `ghcr.io/dlp/cong-noi-bo:2.8.0`',
      check: 'container-image-is',
      args: {
        kind: 'Deployment',
        name: 'cong-noi-bo',
        namespace: 'noi-bo',
        image: 'ghcr.io/dlp/cong-noi-bo:2.8.0',
      },
      required: true,
    },
    {
      id: 'khong-con-pod-loi',
      label: 'Không pod nào còn mang lý do lỗi',
      check: 'pod-no-reason',
      args: { namespace: 'noi-bo', labelSelector: 'app=cong-noi-bo' },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Số pod nhiều hơn số replica là dấu vết của hai thế hệ ReplicaSet cùng sống. Xem `kubectl get rs` trước khi làm gì khác.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: 'Tag lành không cần đoán: ReplicaSet của thế hệ trước vẫn nằm trong cluster, đã hạ về 0 pod nhưng còn nguyên template. `describe rs` cho bạn image của nó.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: '`kubectl rollout undo deployment/cong-noi-bo -n <ns>` đưa template về thế hệ trước. Sửa thẳng image về `2.8.0` cũng tương đương.',
      penaltyPoints: 25,
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
