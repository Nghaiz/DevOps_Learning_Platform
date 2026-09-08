import type { Problem } from '../problem.ts';

/**
 * Đêm trực: ba sự cố, hai namespace, mười phút
 *
 * Chuyển từ `challenges.ts` (ch-10-dem-truc) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0010: Problem = {
  code: 'K8S-0010',
  slug: 'dem-truc',
  title: 'Đêm trực: ba sự cố, hai namespace, mười phút',
  statement: `Bạn nhận ca trực lúc 2 giờ sáng với ba việc đang mở:

- \`nen-tang\` — Deployment \`api\` khai 6 replica và **không có pod nào tồn
  tại**.
- \`van-hanh\` — Deployment \`xu-ly\` restart liên tục, log sạch.
- \`van-hanh\` — HPA \`giao-tiep\` báo tải cao suốt hai giờ mà số replica
  không đổi.

Ba nguyên nhân khác nhau, không cái nào liên quan tới cái nào. Xử lý cả ba
mà vẫn giữ namespace \`nen-tang\` trong hạn mức.`,
  /* Bậc expert: `advanced` → `expert`. Bài tổng kết: ba sự cố không liên quan, trải hai namespace, sáu ô mục tiêu, và một trong ba (quota chặn) không hề tạo ra pod nào để mà đọc — người làm phải biết đi tìm ở chỗ KHÔNG có triệu chứng. */
  difficulty: 'expert',
  topics: ['workload', 'scaling', 'troubleshooting'],
  tags: ['resourcequota', 'hpa-khong-co-metrics', 'crashloop', 'ca-truc'],
  timeLimitSec: 600,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['nen-tang', 'van-hanh'],
    resources: [
      {
        kind: 'ResourceQuota',
        name: 'han-muc',
        namespace: 'nen-tang',
        spec: { hard: { 'requests.memory': '1600Mi', 'requests.cpu': '3', pods: '10' } },
      },
      {
        kind: 'LimitRange',
        name: 'khung',
        namespace: 'nen-tang',
        spec: {
          limits: [
            {
              type: 'Container',
              min: { memory: '128Mi', cpu: '50m' },
              max: { memory: '512Mi', cpu: '1' },
            },
          ],
        },
      },
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          replicas: 6,
          selector: { matchLabels: { app: 'api' } },
          template: {
            labels: { app: 'api' },
            containers: [
              {
                name: 'api',
                image: 'ghcr.io/dlp/api:1.5.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '400m', memory: '512Mi' },
                  limits: { cpu: '1000m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'replica-vuot-quota',
      },
      {
        kind: 'Deployment',
        name: 'xu-ly',
        namespace: 'van-hanh',
        spec: {
          replicas: 2,
          selector: { matchLabels: { app: 'xu-ly' } },
          template: {
            labels: { app: 'xu-ly' },
            containers: [
              {
                name: 'xu-ly',
                image: 'ghcr.io/dlp/xu-ly:4.1.0',
                resources: {
                  requests: { cpu: '200m', memory: '64Mi' },
                  limits: { cpu: '600m', memory: '96Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'memory-limit-qua-thap',
      },
      {
        kind: 'Deployment',
        name: 'giao-tiep',
        namespace: 'van-hanh',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'giao-tiep' } },
          template: {
            labels: { app: 'giao-tiep' },
            containers: [
              {
                name: 'giao-tiep',
                image: 'ghcr.io/dlp/giao-tiep:2.2.0',
                ports: [{ containerPort: 8080 }],
              },
            ],
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'giao-tiep',
        namespace: 'van-hanh',
        spec: {
          scaleTargetRef: { kind: 'Deployment', name: 'giao-tiep' },
          minReplicas: 3,
          maxReplicas: 12,
          metrics: [{ type: 'Resource', resource: { name: 'cpu', targetAverageUtilization: 70 } }],
        },
        seededIncident: 'hpa-khong-co-metrics',
      },
    ],
  },
  objectives: [
    {
      id: 'api-du-sau',
      label: '`api` có đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'api', namespace: 'nen-tang', replicas: 6 },
      required: true,
    },
    {
      id: 'trong-han-muc',
      label: 'Namespace `nen-tang` không vượt ResourceQuota',
      check: 'quota-within-limit',
      args: { namespace: 'nen-tang' },
      required: true,
    },
    {
      id: 'xu-ly-on-dinh',
      label: '`xu-ly` có đủ 2 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'xu-ly', namespace: 'van-hanh', replicas: 2 },
      required: true,
    },
    {
      id: 'hpa-doc-duoc',
      label: 'HPA `giao-tiep` đọc được metric nguồn hợp lệ',
      check: 'hpa-has-metrics',
      args: { name: 'giao-tiep', namespace: 'van-hanh' },
      required: true,
    },
    {
      id: 'giao-tiep-khai-du',
      label: '`giao-tiep` khai đầy đủ requests và limits',
      check: 'resource-limits-set',
      args: { kind: 'Deployment', name: 'giao-tiep', namespace: 'van-hanh' },
      required: true,
    },
    {
      id: 'van-hanh-sach',
      label: 'Mọi pod trong `van-hanh` đều khoẻ',
      check: 'all-pods-healthy',
      args: { namespace: 'van-hanh' },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Việc thứ nhất khác hai việc kia ở một điểm quyết định: không có pod nào để mà đọc. Không pod nghĩa là thứ chặn nằm ở tầng nhận yêu cầu, không ở tầng chạy.',
      penaltyPoints: 10,
    },
    {
      id: 'g2',
      text: 'Restart liên tục mà log sạch thì ứng dụng chưa kịp ghi gì trước khi bị giết — nhìn Last State chứ đừng nhìn log. Còn HPA không đổi replica trong khi báo tải cao thì hãy hỏi nó đã thật sự ĐỌC được số đo nào chưa.',
      penaltyPoints: 20,
    },
    {
      id: 'g3',
      text: 'ResourceQuota chặn việc tạo pod mới nên `api` không có pod — hạ requests hoặc nới hạn mức. `xu-ly` bị OOMKilled — nâng memory limit. HPA đang trỏ vào một nguồn metric không hợp lệ, và target của nó cần workload khai đủ requests lẫn limits.',
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
