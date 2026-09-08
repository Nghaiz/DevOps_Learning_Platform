import type { Problem } from '../problem.ts';

/**
 * Cụm dữ liệu không lên nổi pod đầu tiên
 *
 * Chuyển từ `challenges.ts` (ch-06-o-dia-khong-gan-duoc) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0006: Problem = {
  code: 'K8S-0006',
  slug: 'o-dia-khong-gan-duoc',
  title: 'Cụm dữ liệu không lên nổi pod đầu tiên',
  statement: `StatefulSet \`kho-ban-ghi\` trong namespace \`luu-tru\` khai 3 replica, và
cluster chỉ có đúng một pod — đang Pending.

Đưa cả 3 pod lên chạy, mỗi pod có ổ đĩa riêng đã Bound.`,
  /* Bậc hard: `advanced` → `hard`. Cái khó không nằm ở kiến thức PVC mà ở thứ tự: một StatefulSet dựng pod tuần tự, nên một PVC kẹt chặn đứng mọi pod phía sau và bảng `get pods` trông như thể nó chỉ khai một replica. */
  difficulty: 'hard',
  topics: ['storage', 'workload', 'troubleshooting'],
  tags: ['statefulset', 'pvc-pending', 'storageclass', 'thu-tu-tuan-tu'],
  timeLimitSec: 300,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['luu-tru'],
    resources: [
      {
        kind: 'Service',
        name: 'kho-ban-ghi',
        namespace: 'luu-tru',
        spec: {
          type: 'ClusterIP',
          clusterIP: 'None',
          selector: { app: 'kho-ban-ghi' },
          ports: [{ port: 5432, targetPort: 5432, protocol: 'TCP' }],
        },
      },
      {
        kind: 'StatefulSet',
        name: 'kho-ban-ghi',
        namespace: 'luu-tru',
        spec: {
          replicas: 3,
          serviceName: 'kho-ban-ghi',
          podManagementPolicy: 'OrderedReady',
          selector: { matchLabels: { app: 'kho-ban-ghi' } },
          template: {
            labels: { app: 'kho-ban-ghi' },
            containers: [
              {
                name: 'kho-ban-ghi',
                image: 'postgres:17-alpine',
                ports: [{ containerPort: 5432 }],
                volumeMounts: [{ name: 'du-lieu', mountPath: '/var/lib/postgresql/data' }],
                resources: {
                  requests: { cpu: '400m', memory: '512Mi' },
                  limits: { cpu: '1000m', memory: '1Gi' },
                },
              },
            ],
          },
          volumeClaimTemplates: [
            {
              name: 'du-lieu',
              accessModes: ['ReadWriteOnce'],
              storageClassName: 'ben-vung',
              storage: '20Gi',
            },
          ],
        },
        seededIncident: 'storageclass-khong-ton-tai',
      },
    ],
  },
  objectives: [
    {
      id: 'pvc-0-bound',
      label: 'PVC của pod số 0 đã Bound',
      check: 'pvc-bound',
      args: { name: 'du-lieu-kho-ban-ghi-0', namespace: 'luu-tru' },
      required: true,
    },
    {
      id: 'pvc-2-bound',
      label: 'PVC của pod số 2 đã Bound',
      check: 'pvc-bound',
      args: { name: 'du-lieu-kho-ban-ghi-2', namespace: 'luu-tru' },
      required: true,
    },
    {
      id: 'ba-pod-chay',
      label: 'Cả 3 pod `app=kho-ban-ghi` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'luu-tru', labelSelector: 'app=kho-ban-ghi', min: 3 },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Ba replica mà chỉ một pod tồn tại không phải là mất pod. StatefulSet dựng pod theo thứ tự và chờ pod trước sẵn sàng, nên pod số 0 kẹt là hai pod sau chưa bao giờ được tạo.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: 'Pod Pending vì volume thì nguyên nhân nằm ở PVC, không ở pod. `kubectl describe pvc` nói vì sao nó chưa Bound.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'PVC đang xin một StorageClass không tồn tại trong cluster, nên không có PV nào được cấp. Sửa `storageClassName` trong `volumeClaimTemplates` về một class có thật, hoặc tạo class đó.',
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
