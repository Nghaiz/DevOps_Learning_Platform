import type { Level } from '../contract.ts';

/**
 * Level ngắn nhất chương, và cố ý như vậy: scale là một thao tác một dòng, giá
 * trị nằm ở chỗ hiểu vì sao nó rẻ đến thế. Cụm chỉ có hai node vừa đủ chỗ cho 6
 * replica — người chơi chưa gặp giới hạn tài nguyên ở đây, chương 5 mới đụng tới.
 */
export const l07: Level = {
  id: 'k8s-07-scale-theo-tai',
  chapter: 2,
  title: 'Tăng số bản chạy trước giờ cao điểm',
  brief: `Sàn thương mại điện tử mở đợt khuyến mãi lúc 20 giờ. Hiện tại Deployment
\`web\` trong namespace \`san-pham\` đang chạy 2 replica, và đội vận hành ước tính
cần **6** để chịu được lượng truy cập dự kiến.

Đây là thao tác thường xuyên nhất mà một người vận hành Kubernetes làm, và nó rẻ
vì một lý do kiến trúc: bạn chỉ sửa **một con số** trong trạng thái mong muốn.
Không có bước "cài đặt", không có script khởi động máy chủ. Bạn đổi số, và
reconciliation loop lo phần còn lại — nó thấy thực tế 2 mà mong muốn 6, nên tạo
thêm 4.

**Việc cần làm:** đưa Deployment \`web\` lên 6 replica và giữ cả 6 ở trạng thái
sẵn sàng.

Trong lúc chờ, để ý cách Kubernetes rải pod mới lên hai node thay vì dồn hết vào
một chỗ. Đó không phải ngẫu nhiên — scheduler tính điểm cho từng node trước khi
chọn, và một trong các tiêu chí là trải đều pod cùng một workload.`,
  difficulty: 'basic',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['san-pham'],
    resources: [
      {
        kind: 'Deployment',
        name: 'web',
        namespace: 'san-pham',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'web' } },
          template: {
            labels: { app: 'web' },
            containers: [
              {
                name: 'web',
                image: 'nginx:1.27-alpine',
                ports: [{ containerPort: 80 }],
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '250m', memory: '256Mi' },
                },
              },
            ],
          },
        },
      },
    ],
  },
  allowedResources: ['Deployment'],
  objectives: [
    {
      id: 'sau-replica-san-sang',
      label: 'Deployment `web` có đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'web', namespace: 'san-pham', replicas: 6 },
      required: true,
    },
    {
      id: 'sau-pod-dang-chay',
      label: 'Có ít nhất 6 pod `app=web` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'san-pham', labelSelector: 'app=web', min: 6 },
      required: true,
    },
  ],
  hints: [
    'Bạn không cần tạo thêm pod bằng tay. Deployment đã giữ số lượng rồi — việc của bạn là đổi con số nó đang giữ.',
    'Có hai đường: sửa trực tiếp trường `replicas` trong Deployment, hoặc dùng lệnh chuyên dụng `kubectl scale`. Cả hai cuối cùng đều ghi vào cùng một field.',
    '`kubectl scale deployment/web -n san-pham --replicas=6`, rồi theo dõi bằng `kubectl get pods -n san-pham -w` cho tới khi đủ 6 pod ở Running.',
  ],
  parMoves: 1,
  teaches: ['kubectl scale', 'replicas', 'horizontal scaling', 'scheduler spreading'],
};
