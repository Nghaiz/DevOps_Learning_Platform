import type { Level } from '../contract.ts';

/**
 * Level đầu tiên: một người chưa từng gõ `kubectl` phải qua được.
 *
 * Cụm để TRỐNG có chủ ý. Không có gì hỏng, không có gì để chẩn đoán — việc duy
 * nhất là tạo ra một object và nhìn nó chuyển sang Running. Đặt một sự cố ở đây
 * sẽ dạy sai thứ tự: người học chưa biết trạng thái BÌNH THƯỜNG trông thế nào
 * thì không có gì để so khi gặp trạng thái bất thường.
 */
export const l01: Level = {
  id: 'k8s-01-pod-dau-tien',
  chapter: 1,
  title: 'Pod đầu tiên',
  brief: `Bạn vừa được cấp một cluster Kubernetes trống. Một node, không object nào,
\`kubectl get pods\` trả về đúng một dòng: *No resources found*.

Đơn vị nhỏ nhất mà Kubernetes chịu chạy không phải là container — mà là **pod**,
một lớp bọc quanh một hoặc nhiều container, chia nhau cùng địa chỉ mạng và cùng
vùng lưu trữ tạm. Bạn không nói với Kubernetes "hãy chạy container này"; bạn khai
báo "cluster phải có một pod trông như thế này", rồi để nó tự lo phần còn lại.

**Việc cần làm:** dựng một pod tên \`web\` trong namespace \`hoc-tap\`, chạy image
\`nginx:1.27-alpine\`, và đưa được nó tới trạng thái Running.

Đừng vội. Sau khi tạo xong, hãy xem pod đi qua những trạng thái nào trước khi tới
Running — sáu level tới đều dựa trên việc bạn đọc được các trạng thái đó.`,
  difficulty: 'basic',
  initialState: {
    nodes: [{ name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true }],
    namespaces: ['hoc-tap'],
    resources: [],
  },
  allowedResources: ['Pod'],
  objectives: [
    {
      id: 'pod-ton-tai',
      label: 'Có một pod tên `web` trong namespace `hoc-tap`',
      check: 'resource-exists',
      args: { kind: 'Pod', name: 'web', namespace: 'hoc-tap' },
      required: true,
    },
    {
      id: 'pod-chay',
      label: 'Pod `web` ở trạng thái Running',
      check: 'pod-running',
      args: { namespace: 'hoc-tap', name: 'web' },
      required: true,
    },
    {
      id: 'dung-image',
      label: 'Container dùng đúng image `nginx:1.27-alpine`',
      check: 'container-image-is',
      args: { kind: 'Pod', name: 'web', namespace: 'hoc-tap', image: 'nginx:1.27-alpine' },
      required: false,
    },
  ],
  hints: [
    'Mọi object trong Kubernetes đều khai báo được bằng một file YAML rồi đưa vào cluster. Bảng tài nguyên bên trái cho bạn tạo pod mà không cần gõ YAML từ đầu.',
    'Một pod cần tối thiểu bốn thứ: tên, namespace, tên container, và image. Thiếu image thì API server từ chối ngay chứ không tạo ra pod hỏng.',
    'Tạo pod tên `web` trong `hoc-tap` với đúng một container dùng image `nginx:1.27-alpine`. Sau khi tạo, `kubectl get pods -n hoc-tap` sẽ hiện nó ở Pending vài giây rồi chuyển Running.',
  ],
  parMoves: 1,
  teaches: ['pod', 'container', 'image', 'namespace', 'kubectl apply', 'pod phase'],
};
