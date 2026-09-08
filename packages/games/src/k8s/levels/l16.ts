import type { Level } from '../contract.ts';

/**
 * Ingress lành, hai đường định tuyến. Cần một level "xây được" trước l17 (Ingress
 * hỏng) vì lý do đã dùng ở cặp l12/l13: không có mẫu đúng thì không nhận ra mẫu
 * sai.
 *
 * Hai `ingress-routes` đều required — một mình đường `/api` qua được sẽ che mất
 * việc `/` bị bỏ quên, và đó chính là hình dạng lỗi thật của Ingress.
 */
export const l16: Level = {
  id: 'k8s-16-ingress-mo-cua-ra-ngoai',
  chapter: 3,
  title: 'Mở một cửa duy nhất ra Internet',
  mission: 'Tạo Ingress `san-pham` để `/api` đi tới Service `api` và `/` đi tới Service `web`.',
  brief: `Namespace \`san-pham\` có hai Service ClusterIP đang chạy tốt: \`web\` phục vụ giao
diện, \`api\` phục vụ dữ liệu. Cả hai chỉ gọi được từ bên trong cluster.

Thứ tự khai báo path có ý nghĩa hơn bạn tưởng: \`/\` với \`pathType: Prefix\` khớp
mọi thứ, kể cả \`/api\`.`,
  difficulty: 'intermediate',
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
              { name: 'web', image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }] },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'web',
        namespace: 'san-pham',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'web' },
          ports: [{ port: 80, targetPort: 80, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'san-pham',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'api' } },
          template: {
            labels: { app: 'api' },
            containers: [
              { name: 'api', image: 'ghcr.io/dlp/api:1.5.0', ports: [{ containerPort: 8080 }] },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'api',
        namespace: 'san-pham',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'api' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
      },
    ],
  },
  allowedResources: ['Ingress'],
  objectives: [
    {
      id: 'dinh-tuyen-api',
      label: 'Đường dẫn `/api` đi tới Service `api`',
      check: 'ingress-routes',
      args: { name: 'san-pham', namespace: 'san-pham', path: '/api', serviceName: 'api' },
      required: true,
    },
    {
      id: 'dinh-tuyen-goc',
      label: 'Đường dẫn `/` đi tới Service `web`',
      check: 'ingress-routes',
      args: { name: 'san-pham', namespace: 'san-pham', path: '/', serviceName: 'web' },
      required: true,
    },
    {
      id: 'endpoint-con-nguyen',
      label: 'Service `api` vẫn có endpoint phía sau',
      check: 'service-has-endpoints',
      args: { name: 'api', namespace: 'san-pham', min: 2 },
      required: false,
    },
  ],
  hints: [
    'Ingress không thay thế Service — nó đứng TRƯỚC Service. Mỗi luật trong Ingress trỏ tới một Service theo tên và theo cổng của Service đó (không phải cổng của container).',
    'Một Ingress chứa danh sách `rules`, mỗi rule chứa danh sách path. Mỗi path cần ba thứ: chuỗi đường dẫn, `pathType`, và backend (tên Service + cổng Service).',
    'Khai hai path trong cùng một rule: `/api` → Service `api` cổng 80, và `/` → Service `web` cổng 80, cả hai `pathType: Prefix`. Ingress controller so path CỤ THỂ NHẤT trước, nên `/api` vẫn thắng `/` dù bạn viết theo thứ tự nào.',
  ],
  parMoves: 1,
  teaches: [
    'Ingress',
    'pathType Prefix',
    'HTTP routing',
    'ingress backend',
    'NodePort vs LoadBalancer vs Ingress',
    'TLS termination',
  ],
  teaching: {
    primer: `Service kiểu ClusterIP chỉ gọi được từ trong cluster. Muốn mở ra ngoài có ba
đường, và chúng làm việc ở hai tầng khác nhau:

- **NodePort** mở một cổng cao trên mọi node. Tầng TCP.
- **LoadBalancer** xin hạ tầng một IP ngoài. Cũng tầng TCP, mỗi dịch vụ một IP.
- **Ingress** làm việc ở **tầng HTTP**: một địa chỉ vào duy nhất, phân luồng theo
  tên miền và theo đường dẫn.

Hai kiểu đầu không đọc được đường dẫn HTTP nên không định tuyến theo path được.
Ingress đọc được, và đó cũng là chỗ đặt chứng chỉ TLS một lần.

Ingress **không** thay thế Service: nó đứng trước Service, và trỏ tới **cổng của
Service**.`,
    cheatsheet: [
      {
        command: 'kubectl get svc -n san-pham',
        explain: 'Đọc cổng của từng Service. Đây là con số Ingress cần, không phải containerPort.',
      },
      {
        command: 'kubectl get ingress -n san-pham',
        explain: 'Xem host, đường dẫn và địa chỉ mà Ingress đang lắng nghe.',
      },
      {
        command: 'kubectl describe ingress san-pham -n san-pham',
        explain:
          'In bảng luật đầy đủ: mỗi path kèm backend của nó. Đây là chỗ đối chiếu nhanh nhất.',
      },
      {
        command: 'kubectl get svc -n san-pham',
        explain: 'Kiểm các Service phía sau còn pod hay không, trước khi nghi ngờ chính Ingress.',
      },
    ],
    takeaways: [
      'Ingress đứng trước Service chứ không thay thế nó, nên Service phải khoẻ thì Ingress mới có tác dụng.',
      'Ingress làm việc ở tầng HTTP nên định tuyến được theo đường dẫn, thứ NodePort và LoadBalancer không làm được.',
      'Backend của Ingress dùng cổng của Service, không dùng cổng của container.',
      'Prefix `/` khớp mọi đường dẫn, và controller so luật cụ thể nhất trước nên thứ tự khai không quyết định.',
    ],
    proTips: [
      'Ingress chỉ là bản khai báo. Phải có một ingress controller đang chạy trong cluster thì nó mới được thực thi, và cụm trống thì Ingress nằm im không báo lỗi.',
      'Gom nhiều dịch vụ sau một Ingress còn cho bạn một chỗ duy nhất để đặt TLS, thay vì cấu hình chứng chỉ ở từng dịch vụ.',
    ],
    pitfalls: [
      'Chỉ khai luật `/` rồi tin rằng `/api` cũng đi đúng chỗ vì tên trùng nhau. Prefix `/` nuốt hết, nên mọi request đổ về web và API không bao giờ được gọi.',
      'Điền containerPort vào backend vì con số đó vừa đọc trong Deployment và nhìn quen mắt. Luật vẫn khớp đường dẫn, nhưng chuyển tiếp tới một cổng Service không có.',
      'Khai `/` với `pathType: Prefix` rồi tưởng nó nuốt mất `/api`, nên đi sắp lại thứ tự hai luật cho chắc. Thứ tự trong YAML không quyết định gì: ingress controller so luật CỤ THỂ NHẤT trước, nên thứ thật sự làm hỏng là thiếu luật chứ không phải sai thứ tự.',
    ],
  },
};
