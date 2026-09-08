import type { Problem } from '../problem.ts';

/**
 * Một policy, hai thứ bị cắt nhầm
 *
 * Chuyển từ `challenges.ts` (ch-08-policy-cat-nham-hai-duong) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0008: Problem = {
  code: 'K8S-0008',
  slug: 'policy-cat-nham-hai-duong',
  title: 'Một policy, hai thứ bị cắt nhầm',
  statement: `Sau khi siết mạng namespace \`vien-thong\`, hai chuyện xảy ra: \`web\` không
phân giải được tên nào nữa, và biểu đồ giám sát của \`loi-tong\` trống trơn.

Sửa để \`web\` gọi và phân giải được \`loi-tong\`, và \`thu-thap-metric\` lấy
được metric ở cổng 9100. \`khach-la\` phải vẫn KHÔNG gọi được \`loi-tong\` —
xoá policy đi là hỏng bài.`,
  /* Bậc expert: `advanced` → `expert`, và nó là bài duy nhất trong bộ phải giữ đồng thời ba điều được phép VÀ một điều phải vẫn bị chặn. Nới policy cho ba mục đầu xanh là cách dễ nhất để làm mục thứ tư đỏ, nên không có lối tắt nào an toàn — đó là thứ tách nó khỏi nhóm `hard`. */
  difficulty: 'expert',
  topics: ['networking', 'security', 'troubleshooting'],
  tags: ['networkpolicy', 'egress-dns', 'ingress-metric', 'giu-nguyen-chan'],
  timeLimitSec: 300,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['vien-thong'],
    resources: [
      {
        kind: 'Pod',
        name: 'loi-tong',
        namespace: 'vien-thong',
        spec: {
          labels: { app: 'loi-tong', tang: 'backend' },
          containers: [
            {
              name: 'loi-tong',
              image: 'ghcr.io/dlp/loi-tong:5.0.0',
              ports: [{ containerPort: 8080 }, { containerPort: 9100 }],
            },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'web',
        namespace: 'vien-thong',
        spec: {
          labels: { app: 'web', tang: 'frontend' },
          containers: [{ name: 'web', image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }] }],
        },
      },
      {
        kind: 'Pod',
        name: 'thu-thap-metric',
        namespace: 'vien-thong',
        spec: {
          labels: { app: 'thu-thap-metric', tang: 'giam-sat' },
          containers: [
            {
              name: 'thu-thap-metric',
              image: 'ghcr.io/dlp/thu-thap-metric:1.6.0',
              ports: [{ containerPort: 9090 }],
            },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'khach-la',
        namespace: 'vien-thong',
        spec: {
          labels: { app: 'khach-la', tang: 'khong-ro' },
          containers: [{ name: 'khach-la', image: 'busybox:1.37', command: ['sleep', '86400'] }],
        },
      },
      {
        kind: 'Service',
        name: 'loi-tong',
        namespace: 'vien-thong',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'loi-tong' },
          ports: [{ port: 8080, targetPort: 8080, protocol: 'TCP' }],
        },
      },
      {
        kind: 'NetworkPolicy',
        name: 'siet-mang',
        namespace: 'vien-thong',
        spec: {
          podSelector: {},
          policyTypes: ['Ingress', 'Egress'],
          ingress: [
            {
              from: [{ podSelector: { matchLabels: { tang: 'frontend' } } }],
              ports: [{ port: 8080, protocol: 'TCP' }],
            },
          ],
          egress: [
            {
              to: [{ podSelector: { matchLabels: { tang: 'backend' } } }],
              ports: [{ port: 8080, protocol: 'TCP' }],
            },
          ],
        },
        seededIncident: 'networkpolicy-chan-nham',
      },
    ],
  },
  objectives: [
    {
      id: 'web-goi-duoc',
      label: '`web` gọi được `loi-tong` ở cổng 8080',
      check: 'netpol-allows',
      args: {
        namespace: 'vien-thong',
        fromLabels: { app: 'web' },
        toLabels: { app: 'loi-tong' },
        port: 8080,
      },
      required: true,
    },
    {
      id: 'web-phan-giai-duoc',
      label: '`web` phân giải được tên của Service `loi-tong`',
      check: 'dns-resolves',
      args: {
        namespace: 'vien-thong',
        fromName: 'web',
        toName: 'loi-tong.vien-thong.svc.cluster.local',
      },
      required: true,
    },
    {
      id: 'metric-thu-duoc',
      label: '`thu-thap-metric` lấy được metric ở cổng 9100',
      check: 'netpol-allows',
      args: {
        namespace: 'vien-thong',
        fromLabels: { app: 'thu-thap-metric' },
        toLabels: { app: 'loi-tong' },
        port: 9100,
      },
      required: true,
    },
    {
      id: 'khach-la-bi-chan',
      label: '`khach-la` vẫn KHÔNG gọi được `loi-tong`',
      check: 'netpol-denies',
      args: {
        namespace: 'vien-thong',
        fromLabels: { app: 'khach-la' },
        toLabels: { app: 'loi-tong' },
        port: 8080,
      },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Một policy chặn được hai chiều. "Không phân giải được tên nào" là chiều đi ra; "biểu đồ trống" là chiều đi vào, và người bị chặn là bên thu metric chứ không phải ứng dụng.',
      penaltyPoints: 10,
    },
    {
      id: 'g2',
      text: 'Phân giải tên là một lượt gọi mạng tới CoreDNS ở cổng 53. Một policy có `policyTypes: Egress` mà không mở cổng đó thì cắt luôn DNS của mọi pod nó phủ.',
      penaltyPoints: 20,
    },
    {
      id: 'g3',
      text: 'Thêm luật egress cho DNS (cổng 53), thêm luật ingress cho pod thu metric ở cổng 9100, và mở đúng cổng 8080 từ `web` tới `loi-tong`. Mỗi luật nêu đích danh nhóm pod được phép — nới bằng một luật rỗng sẽ mở luôn cho `khach-la`.',
      penaltyPoints: 40,
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
