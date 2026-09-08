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
  brief: `Sở giáo dục công bố điểm thi lúc 20 giờ tối nay. Cổng tra cứu \`tra-cuu\` trong
namespace \`giao-duc\` bình thường chỉ có vài chục người dùng mỗi giờ; tối nay nó
sẽ nhận hàng chục nghìn lượt trong mười phút đầu.

Hiện Deployment \`tra-cuu\` đang chạy 2 replica. Đội vận hành ước tính cần **6**
để chịu được lượng truy cập dự kiến.

Đây là thao tác thường xuyên nhất mà một người vận hành Kubernetes làm, và nó rẻ
vì một lý do kiến trúc: bạn chỉ sửa **một con số** trong trạng thái mong muốn.
Không có bước "cài đặt", không có script khởi động máy chủ. Bạn đổi số, và
reconciliation loop lo phần còn lại — nó thấy thực tế 2 mà mong muốn 6, nên tạo
thêm 4.

**Việc cần làm:** đưa Deployment \`tra-cuu\` lên 6 replica và giữ cả 6 ở trạng
thái sẵn sàng.

Trong lúc chờ, để ý cách Kubernetes rải pod mới lên hai node thay vì dồn hết vào
một chỗ. Đó không phải ngẫu nhiên — scheduler tính điểm cho từng node trước khi
chọn, và một trong các tiêu chí là trải đều pod cùng một workload.`,
  difficulty: 'basic',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['giao-duc'],
    resources: [
      {
        kind: 'Deployment',
        name: 'tra-cuu',
        namespace: 'giao-duc',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'tra-cuu' } },
          template: {
            labels: { app: 'tra-cuu' },
            containers: [
              {
                name: 'tra-cuu',
                image: 'ghcr.io/dlp/tra-cuu:2.0.0',
                ports: [{ containerPort: 8080 }],
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
      label: 'Deployment `tra-cuu` có đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'tra-cuu', namespace: 'giao-duc', replicas: 6 },
      required: true,
    },
    {
      id: 'sau-pod-dang-chay',
      label: 'Có ít nhất 6 pod `app=tra-cuu` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'giao-duc', labelSelector: 'app=tra-cuu', min: 6 },
      required: true,
    },
  ],
  hints: [
    'Bạn không cần tạo thêm pod bằng tay. Deployment đã giữ số lượng rồi — việc của bạn là đổi con số nó đang giữ.',
    'Có hai đường: sửa trực tiếp trường `replicas` trong Deployment, hoặc dùng lệnh chuyên dụng `kubectl scale`. Cả hai cuối cùng đều ghi vào cùng một field.',
    '`kubectl scale deployment/tra-cuu -n giao-duc --replicas=6`, rồi theo dõi bằng `kubectl get pods -n giao-duc -w` cho tới khi đủ 6 pod ở Running.',
  ],
  parMoves: 1,
  teaches: ['kubectl scale', 'replicas', 'horizontal scaling', 'scheduler spreading'],
};
