import type { Level } from '../contract.ts';

/**
 * Mở chương 5 bằng khoảng cách giữa "đã đặt chỗ" và "đang dùng". Scheduler chỉ
 * đọc `requests`; nó không biết và không quan tâm workload thật sự tiêu bao
 * nhiêu. Người chơi phải nhìn thấy hai con số đó khác nhau thì phần còn lại của
 * chương mới đứng vững.
 *
 * Cách sửa SAI mà level cố ý để mở: xoá bớt replica của `nhat-ky` cho có chỗ.
 * Nó làm pod mới lên được, nên nếu chỉ kiểm `pod-running` thì qua. Vì vậy có
 * thêm mục tiêu bắt buộc giữ nguyên 6 replica — đường tắt đó bị chặn bằng dữ
 * liệu, không bằng lời dặn trong brief.
 */
export const l23: Level = {
  id: 'k8s-23-khong-node-nao-nhan',
  chapter: 5,
  title: 'Chỗ thì còn, mà không node nào nhận',
  mission: 'Đưa pod `canh-bao` lên Running mà vẫn giữ 6 replica `nhat-ky` cùng requests và limits.',
  brief: `Pod \`canh-bao\` trong namespace \`giam-sat\` nằm \`Pending\`. Scheduler ghi lý do rất
thẳng: không node nào đủ CPU.

Nhưng mức dùng thật của cả hai node chưa tới **15%**. Cluster gần như rảnh, và
scheduler vẫn từ chối. Cả hai con số đều đúng.

Deployment \`nhat-ky\` đang giữ 6 replica. Kiểm mức dùng thật của chúng trước.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['giam-sat'],
    resources: [
      {
        kind: 'Deployment',
        name: 'nhat-ky',
        namespace: 'giam-sat',
        spec: {
          replicas: 6,
          selector: { matchLabels: { app: 'nhat-ky' } },
          template: {
            labels: { app: 'nhat-ky' },
            containers: [
              {
                name: 'nhat-ky',
                image: 'ghcr.io/dlp/nhat-ky:1.2.0',
                ports: [{ containerPort: 8080 }],
                resources: {
                  requests: { cpu: '1200m', memory: '256Mi' },
                  limits: { cpu: '1500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
      },
      {
        kind: 'Pod',
        name: 'canh-bao',
        namespace: 'giam-sat',
        spec: {
          labels: { app: 'canh-bao' },
          containers: [
            {
              name: 'canh-bao',
              image: 'ghcr.io/dlp/canh-bao:1.0.1',
              ports: [{ containerPort: 9093 }],
              resources: {
                requests: { cpu: '1000m', memory: '512Mi' },
                limits: { cpu: '1000m', memory: '512Mi' },
              },
            },
          ],
        },
        seededIncident: 'node-het-cpu',
      },
    ],
  },
  allowedResources: ['Deployment', 'Pod'],
  objectives: [
    {
      id: 'canh-bao-chay',
      label: 'Pod `canh-bao` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'giam-sat', name: 'canh-bao' },
      required: true,
    },
    {
      id: 'giu-sau-replica',
      label: 'Deployment `nhat-ky` vẫn giữ đủ 6 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'nhat-ky', namespace: 'giam-sat', replicas: 6 },
      required: true,
    },
    {
      id: 'van-con-requests-limits',
      label: '`nhat-ky` vẫn khai đầy đủ cả requests lẫn limits',
      check: 'resource-limits-set',
      args: { kind: 'Deployment', name: 'nhat-ky', namespace: 'giam-sat' },
      required: true,
    },
    {
      id: 'khong-con-su-co',
      label: 'Không còn sự cố tài nguyên nào trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'giam-sat' },
      required: false,
    },
  ],
  hints: [
    '`kubectl describe pod canh-bao -n giam-sat` cho biết scheduler đã từ chối từng node vì lý do gì. Đọc tiếp `kubectl describe node may-chu-1` và tìm bảng "Allocated resources" — đó là phép cộng requests mà scheduler đang dùng.',
    'Đặt hai con số cạnh nhau: mức dùng thật đã nêu ở đề bài và requests khai trong Deployment `nhat-ky` (`kubectl describe deploy nhat-ky -n giam-sat`). 6 pod × 1200m = 7200m đã bị giữ chỗ trên tổng 8000m của cluster, trong khi mức dùng thật của chúng chỉ khoảng một phần mười.',
    'Hạ `requests.cpu` của `nhat-ky` xuống mức gần với mức dùng thật — khoảng 200m là dư dả. Giữ nguyên `replicas: 6` và giữ nguyên khối `limits`. Pod `canh-bao` đang Pending sẽ được xếp lịch ngay khi chỗ trống xuất hiện, bạn không phải tạo lại nó.',
  ],
  parMoves: 1,
  teaches: [
    'requests vs limits',
    'scheduler chỉ đọc requests',
    'Allocated resources',
    'đặt chỗ khác mức dùng thật',
    'Unschedulable',
    'over-provisioning',
  ],
  teaching: {
    primer: `Mỗi container khai hai con số cho mỗi loại tài nguyên, và chúng làm hai việc khác
hẳn nhau.

- \`requests\` là mức **đặt chỗ**. Scheduler cộng requests của mọi pod trên một
  node và chỉ xếp thêm nếu phần còn lại đủ. Đây là phép cộng trên giấy tờ, và là
  thứ **duy nhất** scheduler nhìn.
- \`limits\` là mức **trần**. Vượt trần CPU thì container bị bóp cho chậm lại; vượt
  trần bộ nhớ thì bị giết.

Hệ quả gây bất ngờ nhiều nhất: một cluster có thể **rảnh mà vẫn đầy**. Sáu pod
đặt chỗ 1200m rồi ngồi không vẫn giữ nguyên 7200m, và không ai được dùng phần thừa.`,
    cheatsheet: [
      {
        command: 'kubectl describe node <node>',
        explain: 'Spec của node cho biết tổng CPU và bộ nhớ mà mọi requests phải cộng vừa vào.',
      },
      {
        command: 'kubectl describe deploy nhat-ky -n giam-sat',
        explain:
          'Đọc requests đang khai của từng container: vế đặt chỗ trong phép cộng của scheduler.',
      },
      {
        command: 'kubectl get pods -n <ns>',
        explain: 'Đếm pod đang giữ chỗ trên cluster; cột STATUS cho biết cái nào còn Pending.',
      },
      {
        command: 'kubectl describe pod <pod> -n <ns>',
        explain: 'Events ghi lý do scheduler loại từng node, ví dụ "Insufficient cpu".',
      },
      {
        command: 'spec.template.spec.containers[].resources.requests.cpu',
        explain:
          'Trường cần hạ. Sửa trong bảng YAML của Deployment, giữ nguyên replicas và limits.',
      },
    ],
    takeaways: [
      'Scheduler chỉ đọc requests, không bao giờ đọc mức dùng thật.',
      'Cluster rảnh mà vẫn từ chối pod là chuyện bình thường khi requests bị khai quá tay.',
      'Đặt requests gần mức dùng thật; dùng limits để chặn trường hợp xấu.',
      'Bỏ requests không phải cách sửa: pod BestEffort là pod bị đuổi đầu tiên.',
    ],
    pitfalls: [
      'Giảm số replica cho pod mới có chỗ. Nó làm triệu chứng biến mất ngay nên trông như đã sửa, trong khi vấn đề thật — requests khai quá tay — vẫn nguyên và sẽ quay lại ở workload tiếp theo.',
      'Đọc mức dùng thật rồi kết luận cluster còn chỗ. Hai con số đo hai thứ khác nhau, và scheduler chỉ nhìn con số kia.',
      'Bỏ hẳn requests đi cho pod lên được. Cách này hiệu nghiệm ngay, và nó biến pod thành BestEffort, tức nhóm hy sinh đầu tiên khi node cạn tài nguyên.',
    ],
    proTips: [
      'Hai con số đó sinh ra ba mức QoS, và chúng quyết định thứ tự bị đuổi khi node cạn tài nguyên: Guaranteed (requests bằng limits) bị đuổi sau cùng, Burstable ở giữa, BestEffort (không khai gì) bị đuổi trước tiên.',
    ],
  },
};
