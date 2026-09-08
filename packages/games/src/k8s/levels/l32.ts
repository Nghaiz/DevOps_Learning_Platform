import type { Level } from '../contract.ts';

/**
 * Mặt trái của l31: policy đã có, viết đúng ý định, và vẫn chặn nhầm một thứ
 * không ai nghĩ tới. Triệu chứng cố ý là một sự cố IM LẶNG — không có gì đỏ,
 * chỉ có một biểu đồ giám sát ngừng cập nhật.
 *
 * Điểm dạy: một luật allow quá hẹp không báo lỗi ở đâu cả. NetworkPolicy không
 * ghi log, không sinh Event, và gói tin bị bỏ đi trong im lặng — người viết
 * policy sẽ không bao giờ biết mình vừa cắt mất thứ gì nếu không chủ động đi tìm.
 */
export const l32: Level = {
  id: 'k8s-32-policy-chan-nham-thu-khong-ai-nghi',
  chapter: 6,
  title: 'Policy đúng ý định, và vẫn cắt nhầm một đường',
  mission: 'Cho `thu-thap-metric` gọi được `kho-van` cổng 9100, trong khi `khach-la` vẫn bị chặn.',
  brief: `Tuần trước namespace \`giao-van\` được siết bằng NetworkPolicy \`chi-cho-frontend\`:
chỉ pod tầng frontend mới gọi được vào \`kho-van\`.

Sáng nay có người phát hiện biểu đồ giám sát của \`kho-van\` **trống từ tuần
trước**. Không một điểm dữ liệu nào.

DaemonSet \`thu-thap-metric\` vẫn Running trên mọi node, log không lỗi, và
\`kho-van\` thì hoàn toàn khoẻ.`,
  difficulty: 'advanced',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['giao-van'],
    resources: [
      {
        kind: 'Pod',
        name: 'kho-van',
        namespace: 'giao-van',
        spec: {
          labels: { app: 'kho-van', tang: 'backend' },
          containers: [
            {
              name: 'kho-van',
              image: 'ghcr.io/dlp/kho-van:4.2.0',
              ports: [{ containerPort: 8080 }, { containerPort: 9100 }],
            },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'web',
        namespace: 'giao-van',
        spec: {
          labels: { app: 'web', tang: 'frontend' },
          containers: [{ name: 'web', image: 'nginx:1.27-alpine', ports: [{ containerPort: 80 }] }],
        },
      },
      {
        kind: 'Pod',
        name: 'thu-thap-metric',
        namespace: 'giao-van',
        spec: {
          labels: { app: 'thu-thap-metric', tang: 'giam-sat' },
          containers: [
            {
              name: 'thu-thap-metric',
              image: 'ghcr.io/dlp/thu-thap-metric:1.6.0',
              ports: [{ containerPort: 9090 }],
            },
          ],
        },
      },
      {
        kind: 'Pod',
        name: 'khach-la',
        namespace: 'giao-van',
        spec: {
          labels: { app: 'khach-la', tang: 'khong-ro' },
          containers: [{ name: 'khach-la', image: 'busybox:1.37', command: ['sleep', '86400'] }],
        },
      },
      {
        kind: 'NetworkPolicy',
        name: 'chi-cho-frontend',
        namespace: 'giao-van',
        spec: {
          podSelector: { matchLabels: { app: 'kho-van' } },
          policyTypes: ['Ingress'],
          ingress: [
            {
              from: [{ podSelector: { matchLabels: { tang: 'frontend' } } }],
              ports: [{ port: 8080, protocol: 'TCP' }],
            },
          ],
        },
        seededIncident: 'networkpolicy-chan-nham',
      },
    ],
  },
  allowedResources: ['NetworkPolicy'],
  objectives: [
    {
      id: 'metric-thu-duoc',
      label: '`thu-thap-metric` gọi được `kho-van` ở cổng 9100',
      check: 'netpol-allows',
      args: {
        namespace: 'giao-van',
        fromLabels: { app: 'thu-thap-metric' },
        toLabels: { app: 'kho-van' },
        port: 9100,
      },
      required: true,
    },
    {
      id: 'frontend-van-goi-duoc',
      label: '`web` vẫn gọi được `kho-van` ở cổng 8080',
      check: 'netpol-allows',
      args: {
        namespace: 'giao-van',
        fromLabels: { app: 'web' },
        toLabels: { app: 'kho-van' },
        port: 8080,
      },
      required: true,
    },
    {
      id: 'khach-la-van-bi-chan',
      label: '`khach-la` vẫn KHÔNG gọi được `kho-van` ở cổng 8080',
      check: 'netpol-denies',
      args: {
        namespace: 'giao-van',
        fromLabels: { app: 'khach-la' },
        toLabels: { app: 'kho-van' },
        port: 8080,
      },
      required: true,
    },
    {
      id: 'khach-la-khong-vao-cong-metric',
      label: '`khach-la` cũng không vào được cổng metric 9100',
      check: 'netpol-denies',
      args: {
        namespace: 'giao-van',
        fromLabels: { app: 'khach-la' },
        toLabels: { app: 'kho-van' },
        port: 9100,
      },
      required: true,
    },
    {
      id: 'het-su-co-chan-nham',
      label: 'Không còn sự cố chặn nhầm nào trong namespace',
      check: 'no-incident-active',
      args: { namespace: 'giao-van', kind: 'networkpolicy-chan-nham' },
      required: false,
    },
  ],
  hints: [
    'Không có gì đỏ để đọc, và đó chính là đặc điểm của NetworkPolicy. Bắt đầu từ luật đang có: `kubectl describe networkpolicy chi-cho-frontend -n giao-van`, rồi hỏi nó cho phép AI vào CỔNG NÀO.',
    '`kubectl describe networkpolicy chi-cho-frontend -n giao-van` cho bạn luật hiện có. Đặt nó cạnh `kubectl get pods -n giao-van --show-labels` và kiểm hai thứ riêng biệt: pod nguồn có khớp `from` không, và cổng đích có nằm trong `ports` không. Một luật allow phải khớp CẢ HAI.',
    'Luật hiện tại chỉ cho `tang=frontend` vào cổng 8080. `thu-thap-metric` mang `tang=giam-sat` và cần cổng 9100 — trượt cả hai điều kiện. Thêm một luật ingress THỨ HAI cho `app=thu-thap-metric` ở cổng 9100. Đừng nới luật cũ thành mọi cổng hay mọi pod: `khach-la` phải tiếp tục bị chặn.',
  ],
  parMoves: 1,
  teaches: [
    'NetworkPolicyBlocking',
    'sự cố mạng im lặng',
    'luật allow phải khớp cả nguồn lẫn cổng',
    'nhiều luật ingress trong một policy',
    'kubectl exec để kiểm chứng kết nối',
  ],
  teaching: {
    primer: `NetworkPolicy chặn **trong im lặng**. Không log, không Event, không mã lỗi. Phía
gọi chỉ thấy timeout. Không có gì để \`describe\`, không có gì màu đỏ, và bằng
chứng phải do bạn tự dựng bằng cách đặt luật cạnh label của **đúng pod nguồn**.

Một luật allow là phép **AND** của hai điều kiện:

- **nguồn** — pod gọi phải khớp \`from\`.
- **cổng** — cổng đích phải nằm trong \`ports\` của luật đó. Bỏ trống \`ports\` nghĩa
  là mọi cổng.

Trượt một trong hai là bị chặn. Đây là lý do một dịch vụ nhiều cổng dễ bị cắt mất
một nửa: cổng ứng dụng được mở, cổng metric thì không ai nhớ tới.`,
    cheatsheet: [
      {
        command: 'ingress[].from cùng ingress[].ports',
        explain: 'Một luật allow là phép AND của hai trường này; trượt một trong hai là bị chặn.',
      },
      {
        command: 'kubectl describe networkpolicy <tên> -n <ns>',
        explain: 'Đọc từng luật: nguồn nào, cổng nào — kiểm hai điều kiện riêng biệt.',
      },
      {
        command: 'kubectl get pods -n <ns> --show-labels',
        explain: 'Label của pod nguồn quyết định nó có khớp `from` hay không.',
      },
      {
        command: 'kubectl describe pod <pod> -n <ns>',
        explain:
          'Dòng Ports liệt kê mọi cổng container mở, và một dịch vụ thường mở nhiều hơn một.',
      },
    ],
    takeaways: [
      'NetworkPolicy chặn im lặng: không log, không Event, chỉ có timeout ở phía gọi.',
      'Bằng chứng phải tự dựng: đặt luật cạnh label của đúng pod nguồn.',
      'Một luật allow chỉ ăn khi khớp CẢ nguồn lẫn cổng; trượt một là bị chặn.',
      'Mở thêm bằng cách thêm luật hẹp, không bằng cách nới luật cũ.',
    ],
    pitfalls: [
      'Xoá policy để biểu đồ có dữ liệu lại. Nó hiệu quả tức thì và ai cũng thấy nhẹ nhõm, nhưng namespace quay về đúng tình trạng mà policy được dựng lên để sửa — và lần này không ai nhớ dựng lại.',
      'Nới luật cũ thành mọi cổng cho `tang=frontend`. Nó không giúp gì cho pod giám sát (label khác) và lại mở thêm cổng metric cho frontend — sai cả hai chiều.',
      'Đọc luật rồi kết luận chung cho cả namespace. Policy khớp theo label của từng pod nguồn, nên câu trả lời khác nhau tuỳ pod, và bạn phải soi label của đúng pod đang hỏng.',
    ],
    proTips: [
      'Cách mở thêm đúng đắn là thêm một luật MỚI vào danh sách `ingress`, không phải nới luật cũ. Các luật hợp lại bằng phép hợp, nên một luật hẹp thêm vào chỉ mở đúng phần bạn khai, trong khi nới luật cũ thành mọi cổng hay mọi pod sẽ mở cho cả những thứ bạn đang cố chặn.',
    ],
  },
};
