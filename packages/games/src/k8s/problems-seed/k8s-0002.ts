import type { Problem } from '../problem.ts';

/**
 * Hai Service, không cái nào có endpoint
 *
 * Chuyển từ `challenges.ts` (ch-02-hai-endpoint-rong) ngày 2026-09-08. `initialState` và
 * `objectives` được chép NGUYÊN VĂN: chúng đã chạy được với engine, và gõ lại
 * là tự chuốc rủi ro lệch một field mà không phép kiểm nào bắt.
 *
 * ⚠ Bậc khó KHÔNG ánh xạ máy móc từ thang ba bậc cũ. `problem.ts` ghi rõ hai
 * thang là khác nhau và cấm ánh xạ ngầm, nên lý do chọn bậc ghi ngay dưới đây.
 */
export const k8s0002: Problem = {
  code: 'K8S-0002',
  slug: 'hai-endpoint-rong',
  title: 'Hai Service, không cái nào có endpoint',
  statement: `Cổng dịch vụ \`cong-dan\` ngừng phục vụ. Hai Service \`ho-so\` và \`lich-hen\`
đều không có endpoint nào, trong khi mọi Deployment vẫn báo đủ số pod.

Đưa cả hai Service về đủ 3 endpoint. Giữ nguyên readiness probe của
\`lich-hen\` — bỏ probe đi là bịt triệu chứng chứ không sửa nguyên nhân.`,
  /* Bậc medium: `intermediate` → `medium`. Hai lỗi, nhưng cùng một họ (endpoint rỗng) và cả hai lộ ra chỉ với `describe service`; không có ràng buộc nào phải giữ song song ngoài readiness probe. */
  difficulty: 'medium',
  topics: ['networking', 'troubleshooting'],
  tags: ['service', 'endpoint-rong', 'selector-lech-label', 'readiness-probe'],
  timeLimitSec: 180,
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['cong-dan'],
    resources: [
      {
        kind: 'Deployment',
        name: 'ho-so',
        namespace: 'cong-dan',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'ho-so' } },
          template: {
            labels: { app: 'ho-so', tang: 'backend' },
            containers: [
              { name: 'ho-so', image: 'ghcr.io/dlp/ho-so:1.2.0', ports: [{ containerPort: 8080 }] },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'ho-so',
        namespace: 'cong-dan',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'ho-so', tang: 'api' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
        seededIncident: 'service-selector-lech-label',
      },
      {
        kind: 'Deployment',
        name: 'lich-hen',
        namespace: 'cong-dan',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'lich-hen' } },
          template: {
            labels: { app: 'lich-hen' },
            containers: [
              {
                name: 'lich-hen',
                image: 'ghcr.io/dlp/lich-hen:2.5.0',
                ports: [{ containerPort: 5000 }],
                readinessProbe: {
                  httpGet: { path: '/san-sang', port: 8080 },
                  initialDelaySeconds: 3,
                  periodSeconds: 10,
                },
              },
            ],
          },
        },
        seededIncident: 'readiness-probe-sai-cong',
      },
      {
        kind: 'Service',
        name: 'lich-hen',
        namespace: 'cong-dan',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'lich-hen' },
          ports: [{ port: 80, targetPort: 5000, protocol: 'TCP' }],
        },
      },
    ],
  },
  objectives: [
    {
      id: 'ho-so-co-endpoint',
      label: 'Service `ho-so` có đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'ho-so', namespace: 'cong-dan', min: 3 },
      required: true,
    },
    {
      id: 'lich-hen-co-endpoint',
      label: 'Service `lich-hen` có đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'lich-hen', namespace: 'cong-dan', min: 3 },
      required: true,
    },
    {
      id: 'giu-readiness',
      label: '`lich-hen` vẫn khai readiness probe',
      check: 'probe-configured',
      args: { kind: 'Deployment', name: 'lich-hen', namespace: 'cong-dan', probe: 'readiness' },
      required: true,
    },
  ],
  /* Challenge cũ không giới hạn loại tài nguyên, và giữ nguyên là đúng: một bài
     OJ không dẫn nhịp dạy nên không có lý do bịt bớt công cụ của người làm. */
  allowedResources: null,
  hints: [
    {
      id: 'g1',
      text: 'Endpoint rỗng có đúng hai họ nguyên nhân: Service tìm nhầm pod, hoặc pod có đó mà chưa Ready. Hai Service này mỗi cái một họ.',
      penaltyPoints: 5,
    },
    {
      id: 'g2',
      text: '`kubectl describe service <tên>` cho cả Selector lẫn Endpoints. Đặt Selector cạnh label thật của pod (`get pods --show-labels`) là một trong hai lộ ngay.',
      penaltyPoints: 15,
    },
    {
      id: 'g3',
      text: 'Một Service khai selector lệch label pod — sửa selector. Cái còn lại có pod nhưng readiness probe trỏ sai cổng nên pod không bao giờ Ready — sửa cổng trong probe, đừng xoá probe.',
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
