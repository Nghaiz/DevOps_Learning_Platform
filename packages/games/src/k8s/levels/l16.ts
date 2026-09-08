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
  brief: `Namespace \`san-pham\` có hai Service ClusterIP đang chạy tốt: \`web\` phục vụ
giao diện, \`api\` phục vụ dữ liệu. Cả hai chỉ gọi được từ bên trong cluster.

Cách thô sơ để mở ra ngoài là đổi mỗi Service sang NodePort hoặc LoadBalancer.
Với hai dịch vụ thì đã là hai cổng lạ hoặc hai địa chỉ IP phải trả tiền; với hai
mươi dịch vụ thì không quản nổi. Và cả hai kiểu đó đều làm việc ở tầng TCP — chúng
không đọc được đường dẫn HTTP, nên không thể định tuyến theo path.

**Ingress** làm việc ở tầng HTTP. Một địa chỉ vào duy nhất, rồi phân luồng theo
host và theo đường dẫn tới các Service khác nhau bên trong. Đây cũng là chỗ đặt
chứng chỉ TLS một lần cho mọi dịch vụ phía sau.

**Việc cần làm:** tạo Ingress \`san-pham\` trong namespace \`san-pham\` sao cho:

- \`/api\` đi tới Service \`api\`
- \`/\` đi tới Service \`web\`

Thứ tự khai báo path có ý nghĩa hơn bạn tưởng: \`/\` với \`pathType: Prefix\`
khớp mọi thứ, kể cả \`/api\`. Hãy nghĩ xem điều đó ảnh hưởng gì tới cách bạn viết
hai luật này.`,
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
};
