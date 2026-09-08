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
  mission: 'Tạo Service `web` kiểu ClusterIP trong `san-pham` sao cho nó có đủ 3 endpoint.',
  brief: `Deployment \`web\` trong namespace \`san-pham\` đang chạy 3 pod khoẻ mạnh. Nhưng
không có gì trong cluster gọi được chúng.

Lý do là một tính chất cơ bản của pod: **IP của pod là tạm thời**. Pod chết đi mọc
lại là có IP khác; rolling update thay cả ba pod là ba IP mới.`,
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
    'Tạo Service `web` với `selector: app=web`, `port: 80`, `targetPort: 80`, type ClusterIP. Kiểm chứng bằng `kubectl describe service web -n san-pham` — dòng Endpoints phải liệt kê 3 pod.',
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
  teaching: {
    primer: `**Service** là một cái tên và một IP ảo cố định, đứng trước một nhóm pod hay thay
đổi. Nó tìm pod của mình bằng **selector**, tức là so label — đúng cách ReplicaSet
nhận con ở chương 2.

Danh sách pod mà Service thật sự đang trỏ tới có tên riêng: **endpoints**. Đây là
thứ quan trọng nhất của cả chương 3, vì nó là cái duy nhất cho biết Service có
đang nối tới ai hay không.

Một pod chỉ vào được endpoints khi nó đã **Ready**. Pod Running mà chưa Ready thì
đứng ngoài.

Service có hai cổng, đừng gộp: \`port\` là cổng người khác gọi vào Service,
\`targetPort\` là cổng Service gõ vào container.`,
    cheatsheet: [
      {
        command: 'kubectl get pods -n san-pham --show-labels',
        explain: 'Đọc label THẬT của pod trước khi viết selector, thay vì suy từ tên Deployment.',
      },
      {
        command: 'kubectl describe service web -n san-pham',
        explain: 'Danh sách địa chỉ Service đang nối tới. Đây là bằng chứng, không phải khai báo.',
      },
      {
        command: 'kubectl describe svc web -n san-pham',
        explain: 'Cho Selector, Port, TargetPort và cả Endpoints trong một màn hình.',
      },
      {
        command: 'kubectl apply -f service.yaml',
        explain: 'Tạo nhanh Service từ Deployment, selector được suy ra từ label sẵn có.',
      },
      {
        command: 'kubectl get svc -n san-pham',
        explain: 'Xem TYPE và CLUSTER-IP. ClusterIP nghĩa là chỉ gọi được từ trong cluster.',
      },
    ],
    takeaways: [
      'IP của pod là tạm thời, nên mọi liên lạc ổn định trong cluster phải đi qua tên của Service.',
      'Service nhận pod bằng label chứ không bằng tên, nên nó không cần biết pod nào tồn tại lúc nào.',
      'Endpoints là danh sách pod Service đang thật sự trỏ tới, và là thứ duy nhất trả lời được câu hỏi đó.',
      'Chỉ pod đã Ready mới nằm trong endpoints, vì thế trạng thái Ready có sức nặng hơn Running.',
    ],
    proTips: [
      'Nhớ một thứ tự chẩn đoán cho cả chương: endpoints trước, describe sau, YAML cuối cùng.',
      'Ở cụm thật, EndpointSlice là bản chi tiết hơn của endpoints và là thứ Kubernetes dùng khi số pod lớn; khái niệm giống hệt, chỉ chia nhỏ ra nhiều mảnh.',
    ],
    pitfalls: [
      'Viết selector theo tên Deployment vì thường thì tên và label trùng nhau. Nó đúng đủ thường xuyên để thành thói quen, rồi hỏng im lặng ở đúng chỗ label được đặt khác tên.',
      'Chọn label quá hẹp hoặc quá rộng khi pod mang nhiều label. Quá rộng thì Service nuốt luôn pod của workload khác, và không có cảnh báo nào cho việc đó.',
    ],
  },
};
