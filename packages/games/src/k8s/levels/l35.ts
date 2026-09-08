import type { Level } from '../contract.ts';

/**
 * Level cuối. Nó khép vòng về l23 một cách có chủ ý: `requests` được học ở đó
 * như thứ scheduler dùng để đặt chỗ, và ở đây lộ ra vai trò thứ hai — nó là MẪU
 * SỐ mà HPA chia để ra phần trăm. Không có requests thì phép chia không tồn tại,
 * và HPA không sai, nó chỉ không có gì để tính.
 *
 * Đây cũng là lý do level này đứng cuối chứ không đứng cạnh l23: nó chỉ đắt giá
 * khi người chơi đã tin rằng mình hiểu requests rồi.
 */
export const l35: Level = {
  id: 'k8s-35-hpa-khong-co-gi-de-tinh',
  chapter: 6,
  title: 'Tự động co giãn, mà không co giãn gì cả',
  brief: `Namespace \`nen-tang\` có HorizontalPodAutoscaler \`api\` khai rất rõ ràng: giữ
mức dùng CPU trung bình quanh 70%, co giãn giữa 3 và 10 replica.

Tải đã cao suốt hai giờ. Deployment vẫn đứng nguyên ở 3 replica.

\`kubectl get hpa\` cho một manh mối mà nhiều người lướt qua: cột TARGETS ghi
\`<unknown>/70%\`. Đó không phải 0%, và khác biệt này quan trọng. **0% nghĩa là
đo được và bằng không. \`<unknown>\` nghĩa là không đo được gì cả.**

HPA không đọc số CPU tuyệt đối. Nó tính một tỷ lệ:

    mức dùng thật / requests đã khai

Kết quả là phần trăm mà nó đem so với ngưỡng 70%. Phép chia đó cần **mẫu số**, và
mẫu số chính là \`resources.requests.cpu\` của container.

Container nào không khai requests thì HPA không có mẫu số, không tính ra phần
trăm, và không quyết định gì. Nó không báo lỗi, không sinh Event đỏ, không dừng
lại — nó chỉ đứng im mãi mãi với chữ \`<unknown>\`.

Đây là lý do \`requests\` quan trọng hơn vẻ ngoài của nó. Ở level 23 nó là thứ
scheduler dùng để đặt chỗ. Ở đây nó là mẫu số của phép chia mà toàn bộ cơ chế tự
động co giãn dựa vào.

**Việc cần làm:** làm cho HPA \`api\` đọc được metric và co giãn được, giữ
Deployment ở tối thiểu 3 replica.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-3', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['nen-tang'],
    resources: [
      {
        kind: 'Deployment',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'api' } },
          template: {
            labels: { app: 'api' },
            containers: [
              {
                name: 'api',
                image: 'ghcr.io/dlp/api:1.5.0',
                ports: [{ containerPort: 8080 }],
              },
            ],
          },
        },
      },
      {
        kind: 'HorizontalPodAutoscaler',
        name: 'api',
        namespace: 'nen-tang',
        spec: {
          scaleTargetRef: { kind: 'Deployment', name: 'api' },
          minReplicas: 3,
          maxReplicas: 10,
          metrics: [
            {
              type: 'Resource',
              resource: { name: 'cpu', targetAverageUtilization: 70 },
            },
          ],
        },
        seededIncident: 'hpa-khong-co-metrics',
      },
    ],
  },
  allowedResources: ['Deployment', 'HorizontalPodAutoscaler'],
  objectives: [
    {
      id: 'hpa-doc-duoc-metric',
      label: 'HPA `api` đọc được metric nguồn hợp lệ',
      check: 'hpa-has-metrics',
      args: { name: 'api', namespace: 'nen-tang' },
      required: true,
    },
    {
      id: 'co-requests-va-limits',
      label: 'Container của `api` khai đầy đủ requests và limits',
      check: 'resource-limits-set',
      args: { kind: 'Deployment', name: 'api', namespace: 'nen-tang' },
      required: true,
    },
    {
      id: 'giu-toi-thieu-ba',
      label: 'Deployment `api` giữ tối thiểu 3 replica',
      check: 'replicas-at-least',
      args: { kind: 'Deployment', name: 'api', namespace: 'nen-tang', n: 3 },
      required: true,
    },
    {
      id: 'ba-pod-san-sang',
      label: 'Có ít nhất 3 pod `app=api` đang chạy',
      check: 'pod-count-running',
      args: { namespace: 'nen-tang', labelSelector: 'app=api', min: 3 },
      required: false,
    },
  ],
  hints: [
    '`<unknown>` và `0%` là hai chuyện khác hẳn nhau. `0%` nghĩa là đo được và bằng không; `<unknown>` nghĩa là HPA không tính được tỷ lệ. Bắt đầu bằng câu hỏi: nó thiếu gì để tính?',
    '`kubectl describe hpa api -n nen-tang` ghi lý do trong phần Conditions. HPA tính phần trăm bằng mức dùng chia cho requests, nên hãy kiểm mẫu số: `kubectl get deploy api -n nen-tang -o yaml` và tìm khối `resources` của container.',
    'Container không khai `resources` gì cả, nên không có `requests.cpu` để chia. Thêm `requests` (ví dụ `cpu: 200m`, `memory: 256Mi`) và `limits` tương ứng vào container. HPA sẽ có mẫu số, cột TARGETS chuyển từ `<unknown>` sang một con số thật, và nó bắt đầu co giãn.',
  ],
  parMoves: 1,
  teaches: [
    'HorizontalPodAutoscaler',
    'HPAScalingFailure',
    'requests là mẫu số của HPA',
    'targetAverageUtilization',
    'minReplicas và maxReplicas',
    'unknown khác 0',
    'metrics-server',
  ],
  teaching: {
    primer: `**HorizontalPodAutoscaler** thay đổi số replica theo tải. Nó chạy một vòng lặp
đều đặn: đọc metric, so với ngưỡng, tính số replica mong muốn, ghi vào workload.

Điểm cần hiểu chính xác là **phép tính**. Với metric kiểu \`Resource\`, HPA không
dùng số CPU tuyệt đối. Nó tính:

    mức dùng trung bình / requests đã khai = phần trăm

rồi so phần trăm đó với \`targetAverageUtilization\`. Vì vậy
\`resources.requests\` **không phải tuỳ chọn** với workload có HPA — nó là mẫu số
của phép chia. Thiếu nó, phép chia không tồn tại.

Ba nguyên nhân làm HPA không co giãn, và chúng phân biệt được bằng những dấu hiệu
khác nhau:

| Nguyên nhân | Dấu hiệu |
|---|---|
| Container không khai requests | TARGETS ghi \`<unknown>\` |
| Không có nguồn metric (metrics-server chết) | TARGETS ghi \`<unknown>\`; \`kubectl top\` cũng hỏng |
| Đã chạm \`maxReplicas\` | TARGETS có số thật, REPLICAS đứng ở đúng maxReplicas |

Nhớ tách \`<unknown>\` khỏi \`0%\`: cái đầu là **không đo được**, cái sau là **đo
được và bằng không**. Nhầm hai thứ này sẽ dẫn bạn đi tìm lý do tải thấp trong khi
thật ra chưa có phép đo nào.

HPA và số \`replicas\` viết tay xung khắc nhau: khi HPA hoạt động, nó là chủ của
con số đó. Đừng sửa tay song song.`,
    cheatsheet: [
      { command: 'kubectl get hpa -n <ns>', explain: 'Cột TARGETS: `<unknown>` là không đo được, một con số là đo được.' },
      { command: 'kubectl describe hpa <tên> -n <ns>', explain: 'Phần Conditions và Events ghi vì sao HPA không tính hoặc không hành động.' },
      { command: 'kubectl top pods -n <ns>', explain: 'Nếu lệnh này cũng hỏng thì nguồn metric của cả cluster mới là vấn đề.' },
      { command: 'kubectl get deploy <tên> -n <ns> -o yaml', explain: 'Kiểm khối `resources` của container — mẫu số HPA cần.' },
    ],
    takeaways: [
      'HPA tính phần trăm bằng mức dùng chia cho requests, nên requests là bắt buộc với workload có HPA.',
      '`<unknown>` nghĩa là không đo được; `0%` nghĩa là đo được và bằng không.',
      'HPA không co giãn có ba nguyên nhân chính, và cột TARGETS tách chúng ra.',
      'Khi HPA hoạt động, nó là chủ của số replica — đừng sửa tay song song.',
    ],
    pitfalls: [
      'Nâng `maxReplicas` khi thấy HPA không scale. Đó là nguyên nhân thứ ba trong bảng và là thứ dễ sửa nhất nên hay được thử trước, nhưng nếu TARGETS đang là `<unknown>` thì HPA chưa từng tính ra con số nào — nới trần cho một phép tính không xảy ra thì không đổi được gì.',
      'Đặt requests rất thấp để phần trăm trông cao và HPA scale mạnh. Nó có tác dụng, và nó phá luôn việc xếp lịch: scheduler sẽ nhồi quá nhiều pod lên mỗi node vì tin vào con số đặt chỗ đó.',
      'Sửa tay `replicas` trong khi HPA đang bật. Hai bên sẽ ghi đè lẫn nhau và số replica dao động không rõ lý do.',
    ],
  },
};
