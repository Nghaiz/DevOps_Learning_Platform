import type { Level } from '../contract.ts';

/**
 * Taint/toleration, và điểm dạy thật nằm ở nửa sau: toleration CHO PHÉP chứ
 * không HÚT. Đây là hiểu nhầm phổ biến nhất về cơ chế này, và cách duy nhất để
 * bắt người chơi đối diện nó là đặt hai yêu cầu ngược chiều trong cùng một
 * level — một thứ phải chạy khắp nơi kể cả node bị taint, một thứ phải chạy
 * ĐÚNG trên node đó.
 *
 * Nếu chỉ có yêu cầu thứ nhất, người chơi thêm toleration rồi kết luận sai rằng
 * toleration là cách chọn node.
 */
export const l25: Level = {
  id: 'k8s-25-taint-cho-phep-khong-phai-hut',
  chapter: 5,
  title: 'Đưa việc lên đúng node có taint',
  mission:
    'Cho `thu-thap-metric` chạy đủ trên cả 3 node, và đưa `huan-luyen` lên đúng `may-chu-gpu`.',
  brief: `\`may-chu-gpu\` được mua riêng cho việc huấn luyện, nên quản trị viên đã đánh
**taint** \`chuyen-dung=gpu:NoSchedule\` lên nó.

Hai việc đang hỏng theo hai kiểu khác nhau:

- DaemonSet \`thu-thap-metric\` phải chạy trên **mọi** node, và nó không lên được
  \`may-chu-gpu\`.
- Pod \`huan-luyen\` phải chạy **đúng trên** \`may-chu-gpu\`, và nó đang nằm ở node thường.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true, labels: { loai: 'thuong' } },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true, labels: { loai: 'thuong' } },
      {
        name: 'may-chu-gpu',
        cpu: 8000,
        memory: 32768,
        ready: true,
        labels: { loai: 'gpu', 'phan-cung': 'gpu-a100' },
        taints: ['chuyen-dung=gpu:NoSchedule'],
      },
    ],
    namespaces: ['giam-sat', 'nghien-cuu'],
    resources: [
      {
        kind: 'DaemonSet',
        name: 'thu-thap-metric',
        namespace: 'giam-sat',
        spec: {
          selector: { matchLabels: { app: 'thu-thap-metric' } },
          template: {
            labels: { app: 'thu-thap-metric' },
            containers: [
              {
                name: 'thu-thap-metric',
                image: 'ghcr.io/dlp/thu-thap-metric:1.6.0',
                ports: [{ containerPort: 9100 }],
                resources: {
                  requests: { cpu: '50m', memory: '64Mi' },
                  limits: { cpu: '200m', memory: '128Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'taint-khong-co-toleration',
      },
      {
        kind: 'Pod',
        name: 'huan-luyen',
        namespace: 'nghien-cuu',
        spec: {
          labels: { app: 'huan-luyen' },
          containers: [
            {
              name: 'huan-luyen',
              image: 'ghcr.io/dlp/huan-luyen:0.9.2',
              resources: {
                requests: { cpu: '2000m', memory: '8Gi' },
                limits: { cpu: '4000m', memory: '16Gi' },
              },
            },
          ],
        },
      },
    ],
  },
  allowedResources: ['DaemonSet', 'Pod'],
  objectives: [
    {
      id: 'daemonset-chiu-duoc-taint',
      label: 'DaemonSet `thu-thap-metric` chịu được taint của node dành riêng',
      check: 'toleration-matches',
      args: { namespace: 'giam-sat', kind: 'DaemonSet', name: 'thu-thap-metric' },
      required: true,
    },
    {
      id: 'phu-du-ba-node',
      label: 'Có đủ 3 pod `app=thu-thap-metric` đang chạy, một cho mỗi node',
      check: 'pod-count-running',
      args: { namespace: 'giam-sat', labelSelector: 'app=thu-thap-metric', min: 3 },
      required: true,
    },
    {
      id: 'huan-luyen-dung-node',
      label: 'Pod `huan-luyen` nằm trên `may-chu-gpu`',
      check: 'pod-on-node',
      args: { namespace: 'nghien-cuu', name: 'huan-luyen', nodeName: 'may-chu-gpu' },
      required: true,
    },
    {
      id: 'huan-luyen-chay',
      label: 'Pod `huan-luyen` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'nghien-cuu', name: 'huan-luyen' },
      required: true,
    },
  ],
  hints: [
    '`kubectl describe node may-chu-gpu` cho bạn hai thứ cùng lúc, ở hai dòng khác nhau: Taints (cái đang chặn) và Labels (cái dùng để chọn). Cả hai đều cần cho level này.',
    'Toleration khai trong pod spec và phải khớp cả `key`, `value` lẫn `effect` của taint. Nhưng toleration mới chỉ gỡ rào — pod vẫn có thể được xếp lên bất kỳ node nào. Muốn ghim vào một node cụ thể thì dùng `nodeSelector` khớp một label của node đó.',
    'Với DaemonSet: thêm toleration `chuyen-dung=gpu` hiệu ứng `NoSchedule`; nó sẽ tự sinh pod cho node thứ ba. Với pod `huan-luyen`: cần CẢ HAI — toleration đó (để được phép) và `nodeSelector: phan-cung=gpu-a100` (để được đưa tới đúng chỗ). Pod đã tồn tại nên phải xoá và tạo lại: `nodeSelector` không sửa được trên pod đang chạy.',
  ],
  parMoves: 3,
  teaches: [
    'taint',
    'toleration',
    'NoSchedule',
    'nodeSelector',
    'toleration cho phép chứ không hút',
    'DaemonSet phủ mọi node',
    'node label',
  ],
  teaching: {
    primer: `Hai cơ chế ngược chiều nhau, và lẫn lộn chúng là hiểu nhầm phổ biến nhất về xếp lịch.

**Taint đặt trên node** — một lời từ chối mặc định. \`NoSchedule\` chặn pod mới,
\`NoExecute\` chặn **và đuổi** pod đang chạy.

**Toleration đặt trên pod** — tấm vé đi qua, khớp \`key\`, \`value\` và \`effect\` của
taint.

Chỗ cần nhớ kỹ: **toleration CHO PHÉP, không HÚT**. Pod có toleration được phép
lên node bị taint, nhưng scheduler vẫn có thể đặt nó ở bất kỳ đâu khác. Muốn chỉ
định nơi đến thì cần \`nodeSelector\` hoặc node affinity.

Vì vậy một pod phải chạy đúng trên node dành riêng cần **cả hai**.`,
    cheatsheet: [
      {
        command: 'kubectl describe node <node>',
        explain:
          'Labels và spec của node: nơi đọc taint đang đặt và các label dùng cho nodeSelector.',
      },
      {
        command: 'spec.nodeSelector',
        explain:
          'Cách chỉ định NƠI ĐẾN: khớp một label mà node đích thật sự mang. Khai trong pod spec.',
      },
      {
        command: 'spec.tolerations',
        explain: 'Tấm vé đi qua taint, phải khớp key, value và effect. Khai trong pod spec.',
      },
      {
        command: 'kubectl get pods -n <ns>',
        explain: 'Cột NODE cho biết pod thật sự nằm ở đâu, không phải nơi bạn nghĩ.',
      },
      {
        command: 'kubectl describe daemonset <tên> -n <ns>',
        explain:
          'Spec của DaemonSet, gồm cả tolerations đang khai. Đếm pod thật thì dùng get pods.',
      },
    ],
    takeaways: [
      'Taint nằm trên node và từ chối; toleration nằm trên pod và xin phép.',
      'Toleration chỉ gỡ rào — muốn ghim pod vào một node cụ thể thì cần nodeSelector hoặc affinity.',
      'Pod phải chạy đúng trên node dành riêng cần cả hai thứ cùng lúc.',
      'DaemonSet không tolerate được taint sẽ để lại một node không ai giám sát.',
    ],
    pitfalls: [
      'Thêm toleration rồi đợi pod tự chuyển sang node dành riêng. Nó trông hợp lý vì toleration nhắc đúng tên node đó, nhưng scheduler đọc toleration là "được phép", không phải "hãy đưa tôi tới".',
      'Gỡ taint cho nhanh. Pod lên được ngay, nhưng node dành riêng mất luôn tác dụng và workload khác sẽ tràn vào.',
    ],
    proTips: [
      'DaemonSet là ngoại lệ đáng nhớ: nó chạy một pod trên mỗi node, nên một node bị taint mà DaemonSet không tolerate được là một điểm mù trong giám sát.',
      'Hiệu ứng thứ ba là `PreferNoSchedule`: scheduler tránh node đó nếu còn chỗ khác, nhưng đây là ưu tiên chứ không phải luật cứng.',
    ],
  },
};
