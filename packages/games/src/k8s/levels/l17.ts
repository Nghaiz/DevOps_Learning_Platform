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
  brief: `Trang \`https://thu-vien.dlp.vn\` vừa lên và người dùng báo hai lỗi khác nhau:

- Vào \`/\` thì ra trang chủ bình thường.
- Vào \`/muon-sach\` thì nhận **404** từ ingress controller.
- Vào \`/api\` thì nhận **502 Bad Gateway**.

Từ bên trong cluster, cả ba Service đều gọi được, đều có endpoint đầy đủ, mọi pod
đều Ready. Đây là kiểu sự cố mà mọi bảng theo dõi nội bộ đều xanh trong khi người
dùng thì không vào được.

Hai mã lỗi này nói hai chuyện khác nhau, và tách được chúng ra là toàn bộ nội
dung của level:

- **404** đến từ chính ingress controller: nó nhận request nhưng **không tìm thấy
  luật nào khớp đường dẫn đó**. Request chưa từng rời khỏi controller.
- **502** nghĩa là controller ĐÃ tìm thấy luật khớp, đã chuyển tiếp đi, và **cái
  đích đó không trả lời** — sai tên Service, hoặc sai cổng Service.

**Việc cần làm:** sửa Ingress \`thu-vien\` trong namespace \`thu-vien\` để
\`/muon-sach\` đi tới Service \`muon-sach\` và \`/api\` đi tới Service \`api\`,
không đụng tới Service hay Deployment nào.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['thu-vien'],
    resources: [
      {
        kind: 'Deployment',
        name: 'muon-sach',
        namespace: 'thu-vien',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'muon-sach' } },
          template: {
            labels: { app: 'muon-sach' },
            containers: [
              {
                name: 'muon-sach',
                image: 'ghcr.io/dlp/muon-sach:1.1.0',
                ports: [{ containerPort: 3000 }],
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'muon-sach',
        namespace: 'thu-vien',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'muon-sach' },
          ports: [{ port: 8000, targetPort: 3000, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'thu-vien',
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
        namespace: 'thu-vien',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'api' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Ingress',
        name: 'thu-vien',
        namespace: 'thu-vien',
        spec: {
          rules: [
            {
              host: 'thu-vien.dlp.vn',
              paths: [
                { path: '/tra-sach', pathType: 'Prefix', serviceName: 'muon-sach', servicePort: 8000 },
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
      id: 'muon-sach-dung-duong',
      label: 'Đường dẫn `/muon-sach` đi tới Service `muon-sach`',
      check: 'ingress-routes',
      args: {
        name: 'thu-vien',
        namespace: 'thu-vien',
        path: '/muon-sach',
        serviceName: 'muon-sach',
      },
      required: true,
    },
    {
      id: 'api-dung-cong',
      label: 'Đường dẫn `/api` đi tới Service `api` ở đúng cổng của Service',
      check: 'ingress-routes',
      args: { name: 'thu-vien', namespace: 'thu-vien', path: '/api', serviceName: 'api' },
      required: true,
    },
    {
      id: 'het-su-co-ingress',
      label: 'Không còn sự cố định tuyến nào trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'thu-vien', kind: 'ingress-sai-path' },
      required: true,
    },
  ],
  hints: [
    '404 và 502 không cùng một lỗi, đừng đi tìm một nguyên nhân chung. Bắt đầu bằng `kubectl describe ingress thu-vien -n thu-vien` và đọc bảng luật: đường dẫn nào đang được khai, và mỗi đường trỏ tới đâu.',
    'Với 404: so danh sách path trong Ingress với đường dẫn người dùng thật sự gõ. Với 502: cổng ghi trong backend của Ingress phải là cổng của SERVICE (`port`), không phải cổng của container (`targetPort`) — đối chiếu với `kubectl get svc -n thu-vien`.',
    'Có hai chỗ sai. Path `/tra-sach` phải đổi thành `/muon-sach`. Và backend của `/api` đang ghi cổng 8080 (cổng container) trong khi Service `api` lắng nghe ở cổng 80 — sửa nó về 80.',
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
