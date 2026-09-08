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
  brief: `Pod \`canh-bao\` trong namespace \`giam-sat\` nằm \`Pending\` từ sáng. Scheduler
ghi lý do rất thẳng: không node nào đủ CPU.

Nhưng \`kubectl top nodes\` lại nói cả hai node đang dùng chưa tới **15%** CPU.
Cluster gần như rảnh, và scheduler vẫn từ chối.

Cả hai con số đều đúng, vì chúng đo hai thứ khác nhau:

- \`requests\` là phần CPU và bộ nhớ được **đặt chỗ trước** cho pod. Scheduler
  cộng \`requests\` của mọi pod trên một node, và chỉ xếp thêm nếu phần còn lại
  đủ cho pod mới. Đây là một phép cộng trên giấy tờ.
- Mức dùng thật thì scheduler không nhìn tới. Một pod đặt chỗ 1200m rồi ngồi
  không vẫn giữ nguyên 1200m đó, và không ai được dùng phần thừa.

Deployment \`nhat-ky\` đang giữ 6 replica, mỗi replica đặt chỗ 1200m CPU. Kiểm
tra mức dùng thật của chúng trước khi quyết định làm gì.

**Việc cần làm:** đưa pod \`canh-bao\` lên Running, **giữ nguyên 6 replica** của
\`nhat-ky\`, và \`nhat-ky\` vẫn phải khai đầy đủ cả requests lẫn limits.

Bỏ hẳn requests đi cũng làm pod lên được, và đó là cách sai: pod không có
requests là pod scheduler không biết cần gì, và là pod đầu tiên bị đuổi khi node
cạn tài nguyên.`,
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
    'Đặt hai con số cạnh nhau: `kubectl top pods -n giam-sat` (mức dùng thật) và requests khai trong Deployment `nhat-ky`. 6 pod × 1200m = 7200m đã bị giữ chỗ trên tổng 8000m của cluster, trong khi mức dùng thật của chúng chỉ khoảng một phần mười.',
    'Hạ `requests.cpu` của `nhat-ky` xuống mức gần với mức dùng thật — khoảng 200m là dư dả. Giữ nguyên `replicas: 6` và giữ nguyên khối `limits`. Pod `canh-bao` đang Pending sẽ được xếp lịch ngay khi chỗ trống xuất hiện, bạn không phải tạo lại nó.',
  ],
  parMoves: 1,
  teaches: [
    'requests vs limits',
    'scheduler chỉ đọc requests',
    'Allocated resources',
    'kubectl top',
    'Unschedulable',
    'over-provisioning',
  ],
  teaching: {
    primer: `Mỗi container khai hai con số cho mỗi loại tài nguyên, và chúng làm hai việc
hoàn toàn khác nhau:

- \`requests\` — mức **đặt chỗ**. Scheduler cộng requests của mọi pod trên một
  node và chỉ xếp thêm nếu phần còn lại đủ. Đây là một phép cộng trên giấy tờ, và
  nó là thứ **duy nhất** scheduler nhìn.
- \`limits\` — mức **trần**. Vượt trần CPU thì container bị bóp lại cho chậm đi;
  vượt trần bộ nhớ thì bị giết.

Hệ quả gây bất ngờ nhiều nhất: một cluster có thể **rảnh mà vẫn đầy**. Sáu pod
đặt chỗ 1200m rồi ngồi không vẫn giữ nguyên 7200m, và không ai được dùng phần
thừa. \`kubectl top\` báo 15%, scheduler vẫn từ chối, và cả hai đều đúng.

Ba mức chất lượng dịch vụ (**QoS**) sinh ra từ hai con số này, và chúng quyết
định thứ tự bị đuổi khi node cạn tài nguyên:

- **Guaranteed** — requests bằng limits. Bị đuổi sau cùng.
- **Burstable** — có requests, limits lớn hơn.
- **BestEffort** — không khai gì. Bị đuổi trước tiên.

Vì vậy bỏ requests đi để pod lên được là một cách sửa tệ: nó biến pod thành nhóm
hy sinh đầu tiên.`,
    cheatsheet: [
      { command: 'kubectl describe node <node>', explain: 'Bảng "Allocated resources" là phép cộng requests mà scheduler thật sự dùng.' },
      { command: 'kubectl top nodes', explain: 'Mức dùng THẬT của node — con số này scheduler không quan tâm.' },
      { command: 'kubectl top pods -n <ns>', explain: 'Đặt cạnh requests đã khai để thấy khoảng cách giữa đặt chỗ và thực dùng.' },
      { command: 'kubectl describe pod <pod> -n <ns>', explain: 'Events ghi lý do scheduler loại từng node, ví dụ "Insufficient cpu".' },
      { command: 'kubectl get pods -n <ns> --field-selector status.phase=Pending', explain: 'Lọc nhanh những pod chưa được xếp lịch.' },
    ],
    takeaways: [
      'Scheduler chỉ đọc requests, không bao giờ đọc mức dùng thật.',
      'Cluster rảnh mà vẫn từ chối pod là chuyện bình thường khi requests bị khai quá tay.',
      'Đặt requests gần mức dùng thật; dùng limits để chặn trường hợp xấu.',
      'Bỏ requests không phải cách sửa: pod BestEffort là pod bị đuổi đầu tiên.',
    ],
    pitfalls: [
      'Giảm số replica cho pod mới có chỗ. Nó làm triệu chứng biến mất ngay nên trông như đã sửa, trong khi vấn đề thật — requests khai quá tay — vẫn nguyên và sẽ quay lại ở workload tiếp theo.',
      'Đọc `kubectl top` rồi kết luận cluster còn chỗ. Hai con số đo hai thứ khác nhau.',
    ],
  },
};
