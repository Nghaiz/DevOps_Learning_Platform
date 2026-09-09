import type { Level } from '../contract.ts';

/**
 * Nửa thứ hai của bộ ba dễ nhầm "container cứ restart mãi". l03 là entrypoint
 * sai (CrashLoopBackOff), đây là OOMKilled, l29 sẽ là liveness probe. Cả ba
 * hiện ra giống hệt nhau ở `kubectl get pods`: Running rồi restart, số RESTARTS
 * tăng đều.
 *
 * Chỗ tách được chúng là `Last State` trong `describe` và exit code — nên brief
 * cố ý nói rõ log ứng dụng SẠCH. Không có chi tiết đó thì người chơi sẽ đi lại
 * đường của l03, tìm log, không thấy gì, và bế tắc vì lý do sai.
 */
export const l24: Level = {
  id: 'k8s-24-bi-giet-vi-thieu-bo-nho',
  chapter: 5,
  title: 'Nâng limit bộ nhớ cho pod bị OOM',
  mission: 'Đưa `xu-ly-anh` về 3 replica chạy ổn định, vẫn khai đủ requests và limits bộ nhớ.',
  brief: `Deployment \`xu-ly-anh\` trong namespace \`noi-dung\` restart liên tục. Bảng
\`get pods\` trông hệt level 3: Running một lúc rồi chết, RESTARTS tăng dần.

Nhưng log ứng dụng **sạch**. Không exception, không stack trace. Dòng cuối luôn
là một dòng bình thường ở giữa công việc, rồi đứt ngang.

Node có 8Gi mỗi cái, nên bạn có chỗ.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['noi-dung'],
    resources: [
      {
        kind: 'Deployment',
        name: 'xu-ly-anh',
        namespace: 'noi-dung',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'xu-ly-anh' } },
          template: {
            labels: { app: 'xu-ly-anh' },
            containers: [
              {
                name: 'xu-ly-anh',
                image: 'ghcr.io/dlp/xu-ly-anh:2.4.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '300m', memory: '64Mi' },
                  limits: { cpu: '1000m', memory: '96Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'memory-limit-qua-thap',
      },
    ],
  },
  allowedResources: ['Deployment'],
  objectives: [
    {
      id: 'ba-replica-on-dinh',
      label: 'Deployment `xu-ly-anh` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'xu-ly-anh', namespace: 'noi-dung', replicas: 3 },
      required: true,
    },
    {
      id: 'khong-con-bi-giet',
      label: 'Không pod `app=xu-ly-anh` nào còn mang lý do lỗi',
      check: 'pod-no-reason',
      args: { namespace: 'noi-dung', labelSelector: 'app=xu-ly-anh' },
      required: true,
    },
    {
      id: 'van-con-limit',
      label: '`xu-ly-anh` vẫn khai đầy đủ cả requests lẫn limits',
      check: 'resource-limits-set',
      args: { kind: 'Deployment', name: 'xu-ly-anh', namespace: 'noi-dung' },
      required: true,
    },
  ],
  hints: [
    'Log sạch mà container vẫn chết nghĩa là nó bị giết từ bên ngoài. `kubectl describe pod -n noi-dung -l app=xu-ly-anh` và tìm khối **Last State** — không phải State — cùng dòng Exit Code.',
    'Exit code 137 là 128 + 9, tức tiến trình nhận SIGKILL. Với container trong Kubernetes, thủ phạm gần như luôn là OOM killer của kernel khi container chạm `memory limit`. Đọc limit hiện tại bằng `kubectl describe deploy xu-ly-anh -n noi-dung` rồi đặt nó cạnh kích thước công việc mà ứng dụng phải làm.',
    'Limit đang là 96Mi, quá thấp cho một dịch vụ xử lý ảnh. Nâng `limits.memory` lên khoảng 512Mi và nâng `requests.memory` theo (256Mi là hợp lý) — requests thấp hơn nhiều so với limit sẽ làm pod thành hạng BestEffort hơn và dễ bị đuổi trước khi node cạn RAM.',
  ],
  parMoves: 1,
  teaches: [
    'OOMKilled',
    'exit code 137',
    'Last State',
    'memory limit',
    'SIGKILL không bắt được',
    'QoS class',
    'chẩn đoán phân biệt với CrashLoopBackOff',
  ],
  teaching: {
    primer: `Ba sự cố khác nhau cùng hiện ra một kiểu ở \`kubectl get pods\`: pod Running rồi
chết, RESTARTS tăng đều. Tách chúng ra là kỹ năng chẩn đoán quan trọng nhất
chương này.

- **Ứng dụng tự chết** — log có exception, exit code do ứng dụng chọn.
- **OOMKilled** — log **sạch** rồi đứt ngang, exit code **137**, chữ \`OOMKilled\`
  nằm ở **Last State**.
- **Liveness probe fail** — log sạch, nhưng Events ghi \`Liveness probe failed\` và
  RAM bình thường.

Hai loại sau có điểm chung: ứng dụng **không sai**, nó bị giết từ bên ngoài. Với
OOM, kẻ giết là OOM killer của kernel và tín hiệu là SIGKILL, không bắt được.`,
    cheatsheet: [
      {
        command: 'kubectl describe pod <pod> -n <ns>',
        explain: 'Tìm khối Last State kèm Reason và Exit Code — không phải khối State.',
      },
      {
        command: 'kubectl logs <pod> -n <ns> --previous',
        explain: 'Log của lần chạy đã chết; sạch và đứt ngang là dấu hiệu bị giết từ ngoài.',
      },
      {
        command: 'kubectl describe deploy <tên> -n <ns>',
        explain: 'Đọc khối resources của container: limits.memory đang đặt bao nhiêu.',
      },
      {
        command: 'kubectl get pods -n <ns>',
        explain: 'Cột RESTARTS và cột NODE — nhiều pod cùng OOM trên một node là tín hiệu khác.',
      },
    ],
    takeaways: [
      'Exit code 137 là SIGKILL, và trong container gần như luôn nghĩa là chạm memory limit.',
      'Lý do bị giết nằm ở Last State, không phải State.',
      'Log sạch rồi đứt ngang phân biệt "bị giết" với "tự crash".',
      'Bỏ memory limit không phải cách sửa: container không trần có thể kéo sập mọi pod khác trên node.',
    ],
    pitfalls: [
      'Đi tìm exception trong log. Với OOMKilled không có exception nào để tìm, và cái vắng mặt đó chính là bằng chứng — nhưng nó dễ bị đọc thành "chưa tìm đúng chỗ".',
      'Nâng limit mà không nâng requests. Khoảng cách quá xa giữa hai con số đẩy pod xuống nhóm dễ bị đuổi khi node cạn RAM.',
      'Bỏ `limits.memory` đi cho container thôi bị giết. Pod đứng yên thật, và cái giá là một container không trần có thể ăn hết RAM của node rồi kéo theo mọi pod khác trên đó.',
    ],
  },
};
