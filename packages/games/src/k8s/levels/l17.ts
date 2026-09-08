import type { Level } from '../contract.ts';

/**
 * Đóng chương 3 bằng sự cố duy nhất trong chương mà triệu chứng ĐẾN TỪ NGOÀI
 * cluster: 404 và 502. Bên trong mọi thứ xanh.
 *
 * Hai lỗi cùng lúc là chủ ý, không phải để làm khó: 404 và 502 là hai tầng khác
 * nhau (định tuyến sai và backend sai) và người chơi phải tách chúng ra. Sửa một
 * cái sẽ làm lỗi kia lộ ra rõ hơn chứ không làm level qua được.
 */
export const l17: Level = {
  id: 'k8s-17-ingress-tra-404',
  chapter: 3,
  title: 'Bên trong xanh hết, bên ngoài trả lỗi',
  brief: `Trang \`https://shop.dlp.vn\` vừa lên và người dùng báo hai lỗi khác nhau:

- Vào \`/\` thì ra trang chủ bình thường.
- Vào \`/gio-hang\` thì nhận **404** từ ingress controller.
- Vào \`/api\` thì nhận **502 Bad Gateway**.

Từ bên trong cluster, cả ba Service đều gọi được, đều có endpoint đầy đủ, mọi pod
đều Ready. Đây là kiểu sự cố mà mọi bảng theo dõi nội bộ đều xanh trong khi khách
hàng thì không vào được.

Hai mã lỗi này nói hai chuyện khác nhau, và tách được chúng ra là toàn bộ nội
dung của level:

- **404** đến từ chính ingress controller: nó nhận request nhưng **không tìm thấy
  luật nào khớp đường dẫn đó**. Request chưa từng rời khỏi controller.
- **502** nghĩa là controller ĐÃ tìm thấy luật khớp, đã chuyển tiếp đi, và **cái
  đích đó không trả lời** — sai tên Service, hoặc sai cổng Service.

**Việc cần làm:** sửa Ingress \`shop\` trong namespace \`san-pham\` để
\`/gio-hang\` đi tới Service \`gio-hang\` và \`/api\` đi tới Service \`api\`,
không đụng tới Service hay Deployment nào.`,
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
        name: 'gio-hang',
        namespace: 'san-pham',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'gio-hang' } },
          template: {
            labels: { app: 'gio-hang' },
            containers: [
              {
                name: 'gio-hang',
                image: 'ghcr.io/dlp/gio-hang:1.1.0',
                ports: [{ containerPort: 3000 }],
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'gio-hang',
        namespace: 'san-pham',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'gio-hang' },
          ports: [{ port: 8000, targetPort: 3000, protocol: 'TCP' }],
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
      {
        kind: 'Ingress',
        name: 'shop',
        namespace: 'san-pham',
        spec: {
          rules: [
            {
              host: 'shop.dlp.vn',
              paths: [
                { path: '/cart', pathType: 'Prefix', serviceName: 'gio-hang', servicePort: 8000 },
                { path: '/api', pathType: 'Prefix', serviceName: 'api', servicePort: 8080 },
              ],
            },
          ],
        },
        seededIncident: 'ingress-sai-path',
      },
    ],
  },
  allowedResources: ['Ingress'],
  objectives: [
    {
      id: 'gio-hang-dung-duong',
      label: 'Đường dẫn `/gio-hang` đi tới Service `gio-hang`',
      check: 'ingress-routes',
      args: {
        name: 'shop',
        namespace: 'san-pham',
        path: '/gio-hang',
        serviceName: 'gio-hang',
      },
      required: true,
    },
    {
      id: 'api-dung-cong',
      label: 'Đường dẫn `/api` đi tới Service `api` ở đúng cổng của Service',
      check: 'ingress-routes',
      args: { name: 'shop', namespace: 'san-pham', path: '/api', serviceName: 'api' },
      required: true,
    },
    {
      id: 'het-su-co-ingress',
      label: 'Không còn sự cố định tuyến nào trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'san-pham', kind: 'ingress-sai-path' },
      required: true,
    },
  ],
  hints: [
    '404 và 502 không cùng một lỗi, đừng đi tìm một nguyên nhân chung. Bắt đầu bằng `kubectl describe ingress shop -n san-pham` và đọc bảng luật: đường dẫn nào đang được khai, và mỗi đường trỏ tới đâu.',
    'Với 404: so danh sách path trong Ingress với đường dẫn người dùng thật sự gõ. Với 502: cổng ghi trong backend của Ingress phải là cổng của SERVICE (`port`), không phải cổng của container (`targetPort`) — đối chiếu với `kubectl get svc -n san-pham`.',
    'Có hai chỗ sai. Path `/cart` phải đổi thành `/gio-hang`. Và backend của `/api` đang ghi cổng 8080 (cổng container) trong khi Service `api` lắng nghe ở cổng 80 — sửa nó về 80.',
  ],
  parMoves: 2,
  teaches: [
    'IngressMisconfigured',
    '404 vs 502',
    'ingress backend port',
    'service port vs container port',
    'kubectl describe ingress',
  ],
};
