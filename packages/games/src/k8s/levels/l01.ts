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
  teaching: {
    primer: `Kubernetes không chạy container trực tiếp. Đơn vị nhỏ nhất mà nó xếp lên
node là **pod**: một lớp bọc quanh một hoặc nhiều container, chia nhau một địa
chỉ IP và một vùng lưu trữ tạm.

Cách làm việc với Kubernetes là **khai báo**, không phải ra lệnh từng bước. Bạn
không nói "hãy chạy container này"; bạn ghi ra trạng thái mong muốn, rồi cluster
liên tục so mong muốn với thực tế và tự đóng khoảng cách. Mọi thứ ở các chương
sau đều là biến thể của ý này.

Một pod tối thiểu cần bốn thứ: tên, namespace, tên container, và image.
**Namespace** là ranh giới đặt tên: hai namespace chứa được hai pod cùng tên
\`web\` mà không đụng nhau, và lệnh \`kubectl\` nào không ghi \`-n\` thì làm việc
với namespace \`default\`.

Sau khi được tạo, pod đi qua vài **phase**. \`Pending\` nghĩa là API server đã
nhận bản khai nhưng container chưa chạy: pod đang chờ được xếp lên node, hoặc
node đang kéo image về. \`Running\` nghĩa là ít nhất một container đã khởi động.

Nhìn vào đâu: \`kubectl get pods\` cho bạn phase, \`kubectl describe pod\` cho
bạn từng bước kubelet đã làm và lý do nó dừng lại.`,
    cheatsheet: [
      {
        command: 'kubectl get pods -n hoc-tap',
        explain: 'Liệt kê pod trong namespace. Cột STATUS chính là phase bạn đang chờ đổi.',
      },
      {
        command: 'kubectl get pods -n hoc-tap -o wide',
        explain: 'Thêm cột IP và NODE, cho biết pod đã được xếp lên máy nào.',
      },
      {
        command: 'kubectl describe pod web -n hoc-tap',
        explain: 'Chi tiết pod kèm Events ở cuối. Đây là nơi kubelet kể nó đã làm gì.',
      },
      {
        command: 'kubectl get namespaces',
        explain: 'Xem cluster có những namespace nào, phòng khi bạn gõ nhầm tên.',
      },
      {
        command: 'kubectl apply -f pod.yaml',
        explain: 'Đưa một bản khai báo vào cluster. Chạy lại nhiều lần vẫn ra cùng kết quả.',
      },
    ],
    takeaways: [
      'Pod là đơn vị Kubernetes xếp lịch, không phải container: một pod chứa được nhiều container.',
      'Bạn khai báo trạng thái mong muốn chứ không ra lệnh, và cluster tự đưa thực tế về khớp.',
      'Pending nghĩa là chưa có container chạy, Running nghĩa là đã có ít nhất một container khởi động.',
      'Namespace là ranh giới đặt tên, nên thiếu cờ `-n` là bạn đang nhìn nhầm chỗ.',
    ],
    proTips: [
      'Thêm `-w` vào `kubectl get pods` để xem trạng thái đổi theo thời gian thực thay vì gõ lại lệnh.',
      '`kubectl run web --image=nginx:1.27-alpine --dry-run=client -o yaml` sinh sẵn khung YAML để bạn sửa, nhanh hơn gõ từ đầu.',
    ],
    pitfalls: [
      'Quên `-n` rồi kết luận pod chưa được tạo. Lệnh chạy đúng, chỉ là nó đang nhìn namespace `default` trong khi pod nằm ở chỗ khác.',
      'Coi pod và container là một. Cách hiểu đó chạy được ở level này và sẽ hỏng ngay ở level sidecar, nơi một pod có hai container.',
    ],
  },
};
