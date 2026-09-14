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
  title: 'Cấp metric cho HPA đang đứng im',
  mission: 'Làm cho HPA `api` đọc được metric và co giãn được, tối thiểu 3 replica.',
  brief: `Namespace \`nen-tang\` có HorizontalPodAutoscaler \`api\` khai rất rõ: giữ CPU quanh
70%, co giãn giữa 3 và 10 replica.

Tải đã cao suốt hai giờ. Deployment vẫn đứng nguyên ở 3 replica.

HPA không báo lỗi và cũng không hành động. Nó không thiếu quyền, và cũng không
chạm trần trên.`,
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
    '`kubectl describe hpa api -n nen-tang` ghi lý do trong phần Conditions. HPA tính phần trăm bằng mức dùng chia cho requests, nên hãy kiểm mẫu số: `kubectl describe deploy api -n nen-tang` và tìm khối `resources` của container.',
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
    primer: `**HorizontalPodAutoscaler** đổi số replica theo tải: đọc metric, so với ngưỡng,
rồi ghi số replica mới.

Điểm cần hiểu là **phép tính**. Với metric kiểu \`Resource\`, HPA không
dùng số CPU tuyệt đối; nó lấy \`mức dùng trung bình / requests đã khai\` rồi so
phần trăm đó với \`targetAverageUtilization\`. Vì vậy \`resources.requests\` **không
phải tuỳ chọn** với workload có HPA — nó là mẫu số. Thiếu nó thì không có phép chia.

Ba nguyên nhân làm HPA đứng im:

- Container không khai requests, nên HPA không có mẫu số.
- Không có nguồn metric, nên không có tử số.
- Đã chạm \`maxReplicas\`, nên nó tính ra rồi mà không được phép tăng nữa.`,
    cheatsheet: [
      { command: 'kubectl get hpa -n <ns>', explain: 'Xác nhận HPA nào đang áp trong namespace.' },
      {
        command: 'kubectl describe hpa <tên> -n <ns>',
        explain: 'Spec của HPA (ngưỡng, minReplicas, maxReplicas) kèm khối Events của nó.',
      },
      {
        command: 'kubectl get pods -n <ns>',
        explain: 'Đếm replica đang chạy: nó có nhúc nhích khỏi minReplicas hay không.',
      },
      {
        command: 'kubectl describe deploy <tên> -n <ns>',
        explain: 'Kiểm khối `resources` của container — mẫu số HPA cần.',
      },
    ],
    takeaways: [
      'HPA tính phần trăm bằng mức dùng chia cho requests, nên requests là bắt buộc với workload có HPA.',
      '`<unknown>` nghĩa là không đo được; `0%` nghĩa là đo được và bằng không.',
      'HPA không co giãn có ba nguyên nhân chính, và mẫu số requests là cái đầu tiên phải loại trừ.',
      'Khi HPA hoạt động, nó là chủ của số replica — đừng sửa tay song song.',
    ],
    pitfalls: [
      'Nâng `maxReplicas` khi thấy HPA không scale. Đó là nguyên nhân thứ ba trong bảng và là thứ dễ sửa nhất nên hay được thử trước, nhưng nếu HPA chưa có mẫu số để chia thì nó chưa từng tính ra con số nào — nới trần cho một phép tính không xảy ra thì không đổi được gì.',
      'Đặt requests rất thấp để phần trăm trông cao và HPA scale mạnh. Nó có tác dụng, và nó phá luôn việc xếp lịch: scheduler sẽ nhồi quá nhiều pod lên mỗi node vì tin vào con số đặt chỗ đó.',
      'Sửa tay `replicas` trong khi HPA đang bật. Hai bên sẽ ghi đè lẫn nhau và số replica dao động không rõ lý do.',
    ],
    proTips: [
      'Ngoài đời, cột TARGETS của `kubectl get hpa` phân biệt `<unknown>` với `0%`: cái đầu là không đo được, cái sau là đo được và bằng không. Nhầm hai thứ này sẽ dẫn bạn đi tìm lý do tải thấp trong khi thật ra chưa có phép đo nào.',
      'HPA và số `replicas` viết tay xung khắc nhau: khi HPA hoạt động, nó là chủ của con số đó. Đừng sửa tay song song.',
    ],
  },
};
