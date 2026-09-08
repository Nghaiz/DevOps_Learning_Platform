import type { Level } from '../contract.ts';

/**
 * Cặp dễ nhầm đặt CẠNH NHAU, sau khi đã dạy tách ra: l13 (selector lệch label)
 * và l28 (readiness fail). Hai Service, cùng một triệu chứng — endpoint rỗng —
 * hai nguyên nhân không liên quan gì tới nhau.
 *
 * Level này khó vì tình huống phức tạp, không vì giấu thông tin: primer nói đủ
 * cả hai cơ chế, và cách phân biệt nằm ngay ở cột READY. Bản có đồng hồ và không
 * gợi ý thuộc về `challenges.ts`.
 *
 * Cái bẫy thật là quán tính: sửa xong cái thứ nhất, người chơi áp cùng cách sửa
 * cho cái thứ hai và nó không ăn.
 */
export const l30: Level = {
  id: 'k8s-30-hai-endpoint-rong-hai-nguyen-nhan',
  chapter: 6,
  title: 'Chữa hai Service rỗng vì hai lý do',
  mission: 'Đưa cả hai Service về đủ 3 endpoint, và `binh-luan` phải giữ readiness probe.',
  brief: `Trang tin \`tin-tuc\` hỏng hai chỗ cùng lúc sau một đợt deploy. Cả hai Service đều
không có endpoint nào:

- \`bai-viet\` — 3 pod, tất cả \`Running\`, cột READY ghi \`1/1\`.
- \`binh-luan\` — 3 pod, tất cả \`Running\`, cột READY ghi \`0/1\`.

Một chi tiết trong bảng trên đã tách chúng ra.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['tin-tuc'],
    resources: [
      {
        kind: 'Deployment',
        name: 'bai-viet',
        namespace: 'tin-tuc',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'bai-viet' } },
          template: {
            labels: { app: 'bai-viet', tang: 'backend' },
            containers: [
              {
                name: 'bai-viet',
                image: 'ghcr.io/dlp/bai-viet:2.0.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
      {
        kind: 'Service',
        name: 'bai-viet',
        namespace: 'tin-tuc',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'bai-viet', tang: 'api' },
          ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
        },
        seededIncident: 'service-selector-lech-label',
      },
      {
        kind: 'Deployment',
        name: 'binh-luan',
        namespace: 'tin-tuc',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'binh-luan' } },
          template: {
            labels: { app: 'binh-luan', tang: 'backend' },
            containers: [
              {
                name: 'binh-luan',
                image: 'ghcr.io/dlp/binh-luan:1.7.0',
                ports: [{ containerPort: 3000 }],
                readinessProbe: {
                  httpGet: { path: '/san-sang', port: 8080 },
                  initialDelaySeconds: 5,
                  periodSeconds: 10,
                },
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'readiness-probe-sai-cong',
      },
      {
        kind: 'Service',
        name: 'binh-luan',
        namespace: 'tin-tuc',
        spec: {
          type: 'ClusterIP',
          selector: { app: 'binh-luan' },
          ports: [{ port: 80, targetPort: 3000, protocol: 'TCP' }],
        },
      },
    ],
  },
  allowedResources: ['Deployment', 'Service'],
  objectives: [
    {
      id: 'bai-viet-du-endpoint',
      label: 'Service `bai-viet` có đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'bai-viet', namespace: 'tin-tuc', min: 3 },
      required: true,
    },
    {
      id: 'binh-luan-du-endpoint',
      label: 'Service `binh-luan` có đủ 3 endpoint',
      check: 'service-has-endpoints',
      args: { name: 'binh-luan', namespace: 'tin-tuc', min: 3 },
      required: true,
    },
    {
      id: 'binh-luan-san-sang',
      label: 'Cả 3 pod của `binh-luan` đã sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'binh-luan', namespace: 'tin-tuc', replicas: 3 },
      required: true,
    },
    {
      id: 'giu-readiness',
      label: '`binh-luan` vẫn khai readiness probe',
      check: 'probe-configured',
      args: { kind: 'Deployment', name: 'binh-luan', namespace: 'tin-tuc', probe: 'readiness' },
      required: true,
    },
    {
      id: 'khong-con-su-co',
      label: 'Không còn sự cố nào trong namespace `tin-tuc`',
      check: 'no-incident-active',
      args: { namespace: 'tin-tuc' },
      required: false,
    },
  ],
  hints: [
    'Đừng chẩn đoán hai cái cùng lúc. Tách chúng ngay bằng một cột duy nhất: `kubectl get pods -n tin-tuc` và đọc READY. `1/1` nghĩa là pod sẵn sàng, nên Service không thấy nó vì lý do khác; `0/1` nghĩa là pod tự khai chưa phục vụ được.',
    'Với `bai-viet` (pod `1/1`): so `kubectl describe svc bai-viet -n tin-tuc` với `kubectl get pods -n tin-tuc --show-labels`. Selector đòi hai label và pod chỉ khớp một. Với `binh-luan` (pod `0/1`): `kubectl describe pod` ghi cổng mà readiness probe đang gọi — so nó với `containerPort`.',
    'Hai chỗ sai độc lập nhau. `bai-viet`: selector đòi `tang=api` trong khi pod mang `tang=backend` — sửa selector cho khớp label thật. `binh-luan`: probe gọi cổng 8080 trong khi container nghe 3000 — sửa cổng của probe.',
  ],
  parMoves: 2,
  teaches: [
    'chẩn đoán phân biệt',
    'endpoint rỗng có nhiều nguyên nhân',
    'cột READY tách hai nguyên nhân',
    'selector nhiều label',
    'readiness probe',
  ],
  teaching: {
    primer: `Endpoint của một Service được dựng qua **hai bước lọc nối tiếp**.

**Bước 1 — chọn.** Service lấy mọi pod khớp **toàn bộ** label trong selector.
Selector liệt kê hai label thì pod phải có cả hai.

**Bước 2 — lọc.** Trong số pod đã chọn, chỉ pod **Ready** được đưa vào endpoint.
Pod \`Running\` mà \`0/1\` bị loại một cách có chủ ý.

Cách phân biệt chỉ cần một cột:

- Pod \`1/1\` mà endpoint rỗng — pod khoẻ, Service không nhìn thấy nó. Hỏng ở bước 1.
- Pod \`0/1\` mà endpoint rỗng — Service thấy pod, pod tự khai chưa sẵn sàng. Hỏng
  ở bước 2.`,
    cheatsheet: [
      {
        command: 'kubectl get pods -n <ns> --show-labels',
        explain: 'Cột READY và label thật, cùng một lệnh — đủ để tách hai nguyên nhân.',
      },
      {
        command: 'kubectl get svc -n <ns>',
        explain: 'Cột ENDPOINTS đếm pod mà mỗi Service thật sự trỏ tới, thấy ngay cái nào rỗng.',
      },
      {
        command: 'kubectl describe svc <tên> -n <ns>',
        explain: 'Đọc dòng Selector; nó có thể đòi nhiều label hơn bạn nhớ.',
      },
      {
        command: 'kubectl describe pod <pod> -n <ns>',
        explain: 'Với pod 0/1, Events ghi probe nào fail và nó đang gọi cổng nào.',
      },
    ],
    takeaways: [
      'Endpoint dựng qua hai bước: chọn theo selector, rồi lọc bỏ pod chưa Ready.',
      'Cột READY tách hai nguyên nhân trước khi bạn mở bất kỳ file YAML nào.',
      'Selector nhiều label là phép AND — pod phải khớp tất cả, không phải một cái.',
      'Hai sự cố cùng triệu chứng trong một namespace là chuyện bình thường; chẩn đoán từng cái riêng.',
    ],
    pitfalls: [
      'Sửa xong cái thứ nhất rồi áp đúng cách đó cho cái thứ hai. Quán tính này rất mạnh vì triệu chứng giống hệt nhau, và nó làm người ta sửa đúng một nửa rồi kết luận cluster bị lỗi.',
      'Giả định một namespace chỉ có một nguyên nhân. Một đợt deploy hỏng thường mang theo vài lỗi độc lập cùng lúc.',
    ],
  },
};
