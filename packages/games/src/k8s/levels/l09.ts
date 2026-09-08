import type { Level } from '../contract.ts';

/**
 * Rollout treo — và điểm dạy nằm ở chỗ dịch vụ VẪN SỐNG. Đây là sự cố duy nhất
 * trong chương mà "không làm gì" cũng không mất khách, nên nó là chỗ tốt nhất để
 * nói rằng `maxUnavailable: 0` không phải một tuỳ chọn hiệu năng mà là một cái
 * phanh an toàn.
 *
 * ReplicaSet cũ được gieo sẵn với `replicas: 0` và image lành: đó chính là thứ
 * `rollout undo` đọc, và cũng là chỗ người chơi tra ra tag cần quay về mà không
 * cần brief mách. Mục tiêu chỉ kiểm image cuối cùng nên sửa tay cũng qua được —
 * level dạy đường đúng, không ép đúng một cú pháp.
 */
export const l09: Level = {
  id: 'k8s-09-rollout-treo-giua-chung',
  chapter: 2,
  title: 'Rollout dừng giữa chừng lúc 2 giờ sáng',
  brief: `Pipeline CI vừa đẩy một bản lên production rồi báo đỏ. Bạn mở cluster ra và thấy
một cảnh khó hiểu: Deployment \`api\` trong \`thanh-toan\` có **7 pod** dù nó chỉ
khai 6 replica, trong đó một số Running và một số kẹt không bao giờ Ready.

Trang trạng thái của công ty vẫn xanh. Khách hàng không phàn nàn. Đó không phải
may mắn — Deployment này đặt \`maxUnavailable: 0\`, nghĩa là nó **không được phép**
hạ pod cũ xuống trước khi pod mới sẵn sàng. Pod mới không bao giờ sẵn sàng, nên
pod cũ không bao giờ bị hạ, nên dịch vụ không đứt. Rollout đứng yên vô thời hạn
thay vì làm sập production.

**Việc cần làm:** đưa Deployment \`api\` về một trạng thái ổn định với 6 replica
sẵn sàng, chạy image có thật, và không pod nào còn mang lý do lỗi.

Bạn không cần đoán tag nào là tag lành. Mỗi lần Deployment đổi template,
Kubernetes giữ lại ReplicaSet của thế hệ trước — nguyên vẹn, kể cả khi nó đã bị
hạ về 0 pod. Lịch sử đó nằm ngay trong cluster.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['thanh-toan'],
    resources: [
      {
        kind: 'ReplicaSet',
        name: 'api-6b4c7d',
        namespace: 'thanh-toan',
        spec: {
          replicas: 0,
          revision: 4,
          selector: { matchLabels: { app: 'api', 'pod-template-hash': '6b4c7d' } },
          template: {
            labels: { app: 'api', 'pod-template-hash': '6b4c7d' },
            containers: [
              { name: 'api', image: 'ghcr.io/dlp/api:1.5.0', ports: [{ containerPort: 8080 }] },
            ],
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'thanh-toan',
        spec: {
          replicas: 6,
          revision: 5,
          selector: { matchLabels: { app: 'api' } },
          strategy: { type: 'RollingUpdate', maxSurge: 1, maxUnavailable: 0 },
          template: {
            labels: { app: 'api' },
            containers: [
              {
                name: 'api',
                image: 'ghcr.io/dlp/api:1.5.1-rc',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'image-tag-sai',
      },
    ],
  },
  allowedResources: ['Deployment', 'ReplicaSet'],
  objectives: [
    {
      id: 'sau-replica-san-sang',
      label: 'Deployment `api` có đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'api', namespace: 'thanh-toan', replicas: 6 },
      required: true,
    },
    {
      id: 'image-lanh',
      label: 'Deployment `api` chạy lại image lành `ghcr.io/dlp/api:1.5.0`',
      check: 'container-image-is',
      args: {
        kind: 'Deployment',
        name: 'api',
        namespace: 'thanh-toan',
        image: 'ghcr.io/dlp/api:1.5.0',
      },
      required: true,
    },
    {
      id: 'khong-con-pod-loi',
      label: 'Không pod `app=api` nào còn mang lý do lỗi',
      check: 'pod-no-reason',
      args: { namespace: 'thanh-toan', labelSelector: 'app=api' },
      required: true,
    },
  ],
  hints: [
    '7 pod cho 6 replica là dấu vết của hai thế hệ cùng sống: `maxSurge: 1` cho phép tạo thừa đúng một pod, và pod thừa đó chính là pod mới đang kẹt. `kubectl get rs -n thanh-toan` cho bạn thấy cả hai ReplicaSet.',
    '`kubectl rollout status deployment/api -n thanh-toan` sẽ treo chứ không trả về — đó là xác nhận. `kubectl rollout history deployment/api -n thanh-toan` liệt kê các revision đã đi qua; thêm `--revision=4` để xem template của thế hệ trước.',
    'Revision 4 dùng image `ghcr.io/dlp/api:1.5.0`. Quay về nó bằng `kubectl rollout undo deployment/api -n thanh-toan`, hoặc sửa thẳng image trong Deployment về đúng tag đó. Cách nào cũng được — điều quan trọng là bạn đã ĐỌC ra tag đó từ cluster chứ không đoán.',
  ],
  parMoves: 2,
  teaches: [
    'DeploymentStuckRollout',
    'kubectl rollout history',
    'kubectl rollout undo',
    'revision',
    'maxUnavailable',
    'ReplicaSet history',
  ],
};
