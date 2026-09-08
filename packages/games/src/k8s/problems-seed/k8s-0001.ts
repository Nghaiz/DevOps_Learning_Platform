import type { Problem } from '../problem.ts';

/**
 * Ba dịch vụ cùng restart, ba lý do khác nhau
 *
 * Chuyển từ `challenges.ts` (ch-01-ba-kieu-restart) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0001: Problem = {
  code: 'K8S-0001',
  slug: 'ba-kieu-restart',
  title: 'Ba dịch vụ cùng restart, ba lý do khác nhau',
  statement: `Namespace \`san-xuat\` có ba Deployment và cả ba đều restart liên tục. Cột
RESTARTS của cả ba đều tăng đều, cả ba đều luân phiên Running rồi chết.

Không cái nào hỏng vì cùng một lý do với cái nào.

Đưa cả ba về chạy ổn định, và không để pod nào còn mang lý do lỗi.`,
  /* Bậc hard: `advanced` → `hard`, không phải `expert`. Ba nguyên nhân đều đã được dạy rời rạc ở l03, l24 và l29; cái khó là chúng cho CÙNG một triệu chứng ở `get pods`, nên bài đo phản xạ đọc bằng chứng chứ không đo kiến thức mới. */
  difficulty: 'hard',
  topics: ['workload', 'troubleshooting'],
  tags: ['crashloopbackoff', 'oomkilled', 'liveness-probe', 'chan-doan-phan-biet'],
  timeLimitSec: 240,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['san-xuat'],
    resources: [
      {
        kind: 'Deployment',
        name: 'thu-nhat',
        namespace: 'san-xuat',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'thu-nhat' } },
          template: {
            labels: { app: 'thu-nhat' },
            containers: [
              {
                name: 'thu-nhat',
                image: 'ghcr.io/dlp/thu-nhat:1.0.0',
                command: ['/app/serve-r'],
                resources: {
                  requests: { cpu: '100m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'lenh-entrypoint-sai',
      },
      {
        kind: 'Deployment',
        name: 'thu-hai',
        namespace: 'san-xuat',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'thu-hai' } },
          template: {
            labels: { app: 'thu-hai' },
            containers: [
              {
                name: 'thu-hai',
                image: 'ghcr.io/dlp/thu-hai:2.0.0',
                resources: {
                  requests: { cpu: '100m', memory: '48Mi' },
                  limits: { cpu: '500m', memory: '64Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'memory-limit-qua-thap',
      },
      {
        kind: 'Deployment',
        name: 'thu-ba',
        namespace: 'san-xuat',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'thu-ba' } },
          template: {
            labels: { app: 'thu-ba' },
            containers: [
              {
                name: 'thu-ba',
                image: 'ghcr.io/dlp/thu-ba:3.0.0',
                ports: [{ containerPort: 8080 }],
                thoiGianKhoiDongGiay: 35,
                livenessProbe: {
                  httpGet: { path: '/healthz', port: 8080 },
                  initialDelaySeconds: 0,
                  periodSeconds: 5,
                  timeoutSeconds: 1,
                  failureThreshold: 1,
                },
                resources: {
                  requests: { cpu: '200m', memory: '512Mi' },
                  limits: { cpu: '800m', memory: '1Gi' },
                },
              },
            ],
          },
        },
        seededIncident: 'liveness-probe-qua-gat',
      },
    ],
  },
  objectives: [
    {
      id: 'thu-nhat-on',
      label: '`thu-nhat` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'thu-nhat', namespace: 'san-xuat', replicas: 2 },
      required: true,
    },
    {
      id: 'thu-hai-on',
      label: '`thu-hai` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'thu-hai', namespace: 'san-xuat', replicas: 2 },
      required: true,
    },
    {
      id: 'thu-ba-on',
      label: '`thu-ba` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'thu-ba', namespace: 'san-xuat', replicas: 2 },
      required: true,
    },
    {
      id: 'sach-su-co',
      label: 'Không pod nào trong `san-xuat` còn mang lý do lỗi',
      check: 'all-pods-healthy',
      args: { namespace: 'san-xuat' },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Ba dịch vụ cho cùng một triệu chứng ở `get pods`. Thứ tách chúng ra nằm trong `describe`: khối Last State và danh sách Events.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: 'Một cái chết vì lệnh khởi động sai, một cái bị giết vì chạm trần bộ nhớ, một cái bị chính probe của nó giết. Log của lần chạy trước phân biệt được hai cái đầu.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'Đọc `Last State` của từng pod: `Error` kèm exit code khác 0 là lệnh sai, `OOMKilled` là trần bộ nhớ quá thấp, còn Events ghi `Liveness probe failed` là probe quá gắt.',
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
