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
  mission: 'Đưa Deployment `tra-cuu` lên 6 replica và giữ cả sáu ở trạng thái sẵn sàng.',
  brief: `Sở giáo dục công bố điểm thi lúc 20 giờ tối nay. Cổng tra cứu \`tra-cuu\` trong
namespace \`giao-duc\` bình thường chỉ có vài chục người mỗi giờ; tối nay nó sẽ
nhận hàng chục nghìn lượt trong mười phút đầu.

Hiện nó đang chạy 2 replica, đội vận hành ước tính cần 6.`,
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
  teaching: {
    primer: `Scale ngang nghĩa là chạy **thêm bản sao** của cùng một ứng dụng, thay vì cho một
bản sao nhiều CPU hơn (đó là scale dọc). Trong Kubernetes việc này rẻ vì bạn chỉ
sửa một field: \`replicas\`.

Pod mới không hiện ra tức thì. Cột READY \`4/6\` nghĩa là 6 pod tồn tại nhưng mới 4
qua được kiểm tra sẵn sàng. Đếm pod tồn tại là đếm sai thứ.

**Scheduler** quyết định pod mới nằm ở node nào; nó trải đều pod của cùng một
workload để một node chết không kéo sập cả dịch vụ.

Một điều kiện ngầm: chỉ ứng dụng **không giữ trạng thái riêng** mới scale ngang
được.`,
    cheatsheet: [
      {
        command: 'kubectl scale deployment/tra-cuu -n giao-duc --replicas=6',
        explain: 'Đổi số bản chạy mong muốn bằng một lệnh, không cần mở YAML.',
      },
      {
        command: 'kubectl get deploy tra-cuu -n giao-duc',
        explain: 'Cột READY dạng x/y: y là số mong muốn, x là số đã thật sự sẵn sàng.',
      },
      {
        command: 'kubectl get pods -n giao-duc',
        explain: 'Gõ lại vài lần trong lúc chờ để thấy pod mới lần lượt chuyển sang sẵn sàng.',
      },
      {
        command: 'kubectl describe pod <ten-pod> -n giao-duc',
        explain: 'Dòng Node cho biết pod rơi vào máy nào; so vài pod là thấy scheduler trải đều.',
      },
    ],
    takeaways: [
      'Scale ngang là đổi một con số trong trạng thái mong muốn, phần còn lại do reconciliation loop làm.',
      'READY x/y đếm pod đã sẵn sàng, không đếm pod tồn tại: chỉ x mới thật sự nhận được lưu lượng.',
      'Scheduler tự trải pod ra nhiều node để một node chết không làm mất cả dịch vụ.',
      'Chỉ ứng dụng không giữ trạng thái riêng mới scale ngang được một cách an toàn.',
    ],
    proTips: [
      'Scale TRƯỚC sự kiện đã biết lịch, đừng chờ tới lúc tải đã lên. Pod mới cần thời gian khởi động và đó là lúc bạn không có thời gian.',
      'Ở chương 6 bạn sẽ gặp HorizontalPodAutoscaler, thứ làm đúng việc này tự động dựa trên số đo thật.',
    ],
    pitfalls: [
      'Tạo thêm pod bằng tay cho nhanh. Deployment đang giữ số lượng nên nó coi pod thừa là sai lệch và xoá đi, và bạn tưởng cluster đang hỏng.',
      'Tăng replica để chữa một ứng dụng chậm. Nếu điểm nghẽn nằm ở cơ sở dữ liệu phía sau thì thêm bản chạy chỉ làm nghẽn nặng hơn.',
    ],
  },
};
