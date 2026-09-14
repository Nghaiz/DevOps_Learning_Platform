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
  title: 'Gỡ rollout treo giữa chừng',
  mission:
    'Đưa Deployment `api` về 6 replica sẵn sàng trên image có thật, không pod nào còn lý do lỗi.',
  brief: `Pipeline CI vừa đẩy một bản lên production rồi báo đỏ. Deployment \`api\` trong
\`nen-tang\` có **7 pod** dù chỉ khai 6 replica, trong đó một số Running và một số
kẹt không bao giờ Ready.

Trang trạng thái của công ty vẫn xanh, khách hàng không phàn nàn. Đó không phải
may mắn.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['nen-tang'],
    resources: [
      {
        kind: 'ReplicaSet',
        name: 'api-6b4c7d',
        namespace: 'nen-tang',
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
        namespace: 'nen-tang',
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
      args: { name: 'api', namespace: 'nen-tang', replicas: 6 },
      required: true,
    },
    {
      id: 'image-lanh',
      label: 'Deployment `api` chạy lại image lành `ghcr.io/dlp/api:1.5.0`',
      check: 'container-image-is',
      args: {
        kind: 'Deployment',
        name: 'api',
        namespace: 'nen-tang',
        image: 'ghcr.io/dlp/api:1.5.0',
      },
      required: true,
    },
    {
      id: 'khong-con-pod-loi',
      label: 'Không pod `app=api` nào còn mang lý do lỗi',
      check: 'pod-no-reason',
      args: { namespace: 'nen-tang', labelSelector: 'app=api' },
      required: true,
    },
  ],
  hints: [
    '7 pod cho 6 replica là dấu vết của hai thế hệ cùng sống: `maxSurge: 1` cho phép tạo thừa đúng một pod, và pod thừa đó chính là pod mới đang kẹt. `kubectl get rs -n nen-tang` cho bạn thấy cả hai ReplicaSet.',
    '`kubectl rollout status deployment/api -n nen-tang` sẽ treo chứ không trả về — đó là xác nhận. `kubectl rollout history deployment/api -n nen-tang` liệt kê các revision đã đi qua, và `kubectl describe rs <ten-rs> -n nen-tang` cho bạn image của từng thế hệ.',
    'ReplicaSet của thế hệ trước dùng image `ghcr.io/dlp/api:1.5.0`. Quay về nó bằng `kubectl rollout undo deployment/api -n nen-tang`, hoặc sửa thẳng image trong Deployment về đúng tag đó. Cách nào cũng được — điều quan trọng là bạn đã ĐỌC ra tag đó từ cluster chứ không đoán.',
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
  teaching: {
    primer: `Một rollout **treo** không giống một rollout **hỏng**.

Deployment với \`maxUnavailable: 0\` không được phép hạ pod cũ trước khi pod mới
sẵn sàng. Nếu pod mới không bao giờ sẵn sàng, quy tắc đó thành một cái phanh:
rollout đứng yên vô thời hạn, pod cũ vẫn phục vụ, người dùng không thấy gì.

Dấu vết nhận ra nó: số pod nhiều hơn số replica.

Mỗi lần \`template\` đổi, Kubernetes giữ lại ReplicaSet của thế hệ trước, kể cả sau
khi đã hạ nó về 0 pod. Đó là **lịch sử revision**, nằm ngay trong cluster — nghĩa
là bản lành đọc ra được chứ không phải đoán.`,
    cheatsheet: [
      {
        command: 'kubectl rollout status deployment/api -n nen-tang',
        explain: 'Không trả về nghĩa là rollout đang treo. Bản thân việc treo đã là một kết luận.',
      },
      {
        command: 'kubectl get rs -n nen-tang',
        explain: 'Hai ReplicaSet cùng tồn tại: một thế hệ đang lên, một thế hệ cũ chưa bị hạ hết.',
      },
      {
        command: 'kubectl describe rs <ten-rs> -n nen-tang',
        explain: 'Image của từng thế hệ nằm ở đây. Đây là chỗ đọc ra tag lành mà không phải đoán.',
      },
      {
        command: 'kubectl rollout undo deployment/api -n nen-tang',
        explain: 'Quay về revision liền trước, tức là ghi lại template của thế hệ lành.',
      },
      {
        command: 'kubectl describe pod -n nen-tang -l app=api',
        explain: 'Xem pod mới kẹt vì lý do gì, để biết quay lui hay sửa image là đúng.',
      },
    ],
    takeaways: [
      'Rollout treo với maxUnavailable bằng 0 là cơ chế bảo vệ đang hoạt động, không phải sự cố mất dịch vụ.',
      'Số pod nhiều hơn số replica là dấu vết của hai thế hệ ReplicaSet cùng sống.',
      'Lịch sử revision nằm trong chính cluster, dưới dạng các ReplicaSet cũ đã hạ về 0 pod.',
      '`rollout undo` chỉ là cách đọc lịch sử đó và ghi lại vào template, nên hiểu lịch sử quan trọng hơn thuộc lệnh.',
    ],
    proTips: [
      'Trong sự cố thật, quay lui trước rồi điều tra sau. Bản lành đã được kiểm chứng còn nguyên nhân thì chưa.',
      '`revisionHistoryLimit` quyết định giữ lại bao nhiêu thế hệ. Đặt về 0 nghĩa là tự tay vứt đường lùi của mình.',
    ],
    pitfalls: [
      'Xoá các pod đang kẹt cho bảng trạng thái sạch. ReplicaSet mới vẫn giữ số lượng mong muốn nên chúng mọc lại ngay, và rollout vẫn treo y như cũ.',
      'Đoán tag lành theo trí nhớ hoặc theo tên nghe hợp lý. Cluster đang giữ câu trả lời chính xác, và đoán là bỏ qua bằng chứng có sẵn.',
    ],
  },
};
