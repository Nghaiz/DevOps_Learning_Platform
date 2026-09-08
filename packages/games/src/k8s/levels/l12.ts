import type { Level } from '../contract.ts';

/**
 * Level đầu chương 3 và cũng là chỗ giới thiệu `kubectl get endpoints` — công cụ
 * chẩn đoán mạng quan trọng nhất trong cả game. Ở đây nó được dùng khi mọi thứ
 * ĐANG ĐÚNG, để hai level sau người chơi biết một danh sách endpoint lành trông
 * ra sao trước khi phải nhìn một danh sách rỗng.
 */
export const l12: Level = {
  id: 'k8s-12-service-dau-tien',
  chapter: 3,
  title: 'Một địa chỉ ổn định cho ba pod hay đổi',
  brief: `Deployment \`web\` trong namespace \`san-pham\` đang chạy 3 pod khoẻ mạnh. Nhưng
không có gì trong cluster gọi được chúng, và lý do là một tính chất cơ bản của
pod: **IP của pod là tạm thời**. Pod chết đi mọc lại là có IP khác; rolling update
thay cả ba pod là ba IP mới. Không ai đi hardcode một địa chỉ như thế.

**Service** giải quyết đúng chuyện đó. Nó là một cái tên và một IP ảo cố định,
đứng trước một nhóm pod hay thay đổi. Service tìm pod của nó bằng **selector** —
so label, y hệt cách ReplicaSet nhận con ở chương 2.

Danh sách pod mà Service đang thật sự trỏ tới có tên riêng: **endpoints**. Đây là
object bạn sẽ đọc đi đọc lại suốt chương này, vì nó phân biệt được "Service cấu
hình sai" với "pod hỏng" — hai chuyện trông y hệt nhau từ phía người dùng.

**Việc cần làm:** tạo Service \`web\` trong \`san-pham\`, kiểu ClusterIP, nhận
request ở cổng 80 và chuyển tới cổng 80 của container, sao cho nó có đủ **3
endpoint**.

Container của Deployment nghe ở cổng nào thì đọc trong template — đừng đoán.`,
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
          replicas: 3,
          selector: { matchLabels: { app: 'web' } },
          template: {
            labels: { app: 'web', tang: 'frontend' },
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
  allowedResources: ['Service'],
  objectives: [
    {
      id: 'service-ton-tai',
      label: 'Có Service `web` trong namespace `san-pham`',
      check: 'resource-exists',
      args: { kind: 'Service', name: 'web', namespace: 'san-pham' },
      required: true,
    },
    {
      id: 'du-ba-endpoint',
      label: 'Service `web` có đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'web', namespace: 'san-pham', min: 3 },
      required: true,
    },
  ],
  hints: [
    'Service cần ba thứ: một selector để tìm pod, cổng nó lắng nghe (`port`), và cổng của container mà nó chuyển tới (`targetPort`). Kiểu mặc định là ClusterIP — chỉ gọi được từ trong cluster, và đó đúng là thứ cần ở đây.',
    'Selector của Service phải khớp label THẬT của pod. Xem label pod bằng `kubectl get pods -n san-pham --show-labels`. Pod ở đây mang hai label; chọn một cái mô tả đúng nhóm bạn muốn phục vụ.',
    'Tạo Service `web` với `selector: app=web`, `port: 80`, `targetPort: 80`, type ClusterIP. Kiểm chứng bằng `kubectl get endpoints web -n san-pham` — phải liệt kê 3 địa chỉ IP.',
  ],
  parMoves: 1,
  teaches: [
    'Service',
    'ClusterIP',
    'selector',
    'endpoints',
    'targetPort',
    'kubectl get endpoints',
    'ephemeral pod IP',
  ],
};
