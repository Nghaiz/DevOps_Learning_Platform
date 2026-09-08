import type { Problem } from '../problem.ts';

/**
 * Ngoài trả lỗi, trong xanh hết
 *
 * Chuyển từ `challenges.ts` (ch-05-ngoai-loi-trong-xanh) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0005: Problem = {
  code: 'K8S-0005',
  slug: 'ngoai-loi-trong-xanh',
  title: 'Ngoài trả lỗi, trong xanh hết',
  statement: `Người dùng ngoài Internet báo lỗi trên hai đường dẫn. Bên trong cluster mọi
Service đều gọi được và mọi pod đều Ready.

Sửa Ingress \`cong-vao\` trong namespace \`dich-vu\` để \`/tra-cuu\` đi tới
Service \`tra-cuu\` và \`/ho-tro\` đi tới Service \`ho-tro\` ở đúng cổng.`,
  /* Bậc hard: `advanced` → `hard`. Mọi phép kiểm quen thuộc đều xanh, nên bài đo được đúng một thứ: người làm có biết tầng nào CHƯA được kiểm hay không. Hai lỗi nằm trong cùng một object và cho hai mã lỗi khác nhau. */
  difficulty: 'hard',
  topics: ['networking', 'troubleshooting'],
  tags: ['ingress', 'path-sai', 'targetport', 'lop-ngoai-cung'],
  timeLimitSec: 240,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['dich-vu'],
    resources: [
      {
        kind: 'Deployment',
        name: 'tra-cuu',
        namespace: 'dich-vu',
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
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'tra-cuu',
        namespace: 'dich-vu',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'tra-cuu' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Deployment',
        name: 'ho-tro',
        namespace: 'dich-vu',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'ho-tro' } },
          template: {
            labels: { app: 'ho-tro' },
            containers: [
              {
                name: 'ho-tro',
                image: 'ghcr.io/dlp/ho-tro:1.4.0',
                ports: [{ containerPort: 3000 }],
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'ho-tro',
        namespace: 'dich-vu',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'ho-tro' },
          ports: [{ port: 8000, targetPort: 3000, protocol: 'TCP' }],
        },
      },
      {
        kind: 'Ingress',
        name: 'cong-vao',
        namespace: 'dich-vu',
        spec: {
          rules: [
            {
              host: 'dich-vu.dlp.vn',
              paths: [
                { path: '/lookup', pathType: 'Prefix', serviceName: 'tra-cuu', servicePort: 80 },
                { path: '/ho-tro', pathType: 'Prefix', serviceName: 'ho-tro', servicePort: 3000 },
              ],
            },
          ],
        },
        seededIncident: 'ingress-sai-path',
      },
    ],
  },
  objectives: [
    {
      id: 'tra-cuu-dung-duong',
      label: '`/tra-cuu` đi tới Service `tra-cuu`',
      check: 'ingress-routes',
      args: { name: 'cong-vao', namespace: 'dich-vu', path: '/tra-cuu', serviceName: 'tra-cuu' },
      required: true,
    },
    {
      id: 'ho-tro-dung-cong',
      label: '`/ho-tro` đi tới Service `ho-tro` ở đúng cổng Service',
      check: 'ingress-routes',
      args: { name: 'cong-vao', namespace: 'dich-vu', path: '/ho-tro', serviceName: 'ho-tro' },
      required: true,
    },
    {
      id: 'het-su-co-dinh-tuyen',
      label: 'Không còn sự cố định tuyến trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'dich-vu', kind: 'ingress-sai-path' },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Hai đường dẫn trả hai mã lỗi khác nhau, nên đừng đi tìm một nguyên nhân chung. 404 dừng ở tầng định tuyến; 502 nghĩa là đã tìm được backend nhưng không nói chuyện được với nó.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: '`kubectl describe ingress cong-vao -n dich-vu` in bảng luật: mỗi path kèm Service và cổng của nó. Đặt bảng đó cạnh `kubectl get svc` là thấy chỗ lệch.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'Một luật khai sai đường dẫn nên không khớp gì (404). Luật kia trỏ đúng Service nhưng khai cổng của container thay vì cổng của Service (502) — Ingress nói chuyện với Service, không nói thẳng với pod.',
      penaltyPoints: 30,
    },
  ],
  /* `null` chứ không phải một con số bịa: challenge cũ không có `parMoves`, và
     đặt đại một giá trị sẽ làm phần chấm theo số nước đi nói dối ngay từ bài đầu. */
  parMoves: null,
  state: 'published',
  authorId: null,
  createdAt: '2026-09-08T00:00:00.000Z',
  updatedAt: '2026-09-08T00:00:00.000Z',
};
