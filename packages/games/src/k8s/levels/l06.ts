import type { Level } from '../contract.ts';

/**
 * Mở chương 2 bằng câu hỏi "vì sao không dùng pod trần nữa" thay vì bằng cú pháp
 * Deployment. Câu trả lời — tự phục hồi — chỉ thuyết phục khi người chơi tự tay
 * xoá một pod và thấy nó mọc lại, nên mục tiêu thưởng cố ý yêu cầu đúng việc đó.
 */
export const l06: Level = {
  id: 'k8s-06-deployment-thay-cho-pod',
  chapter: 2,
  title: 'Deployment và khả năng tự phục hồi',
  brief: `Năm level vừa rồi bạn tạo pod bằng tay. Ở production không ai làm thế, vì một lý
do rất cụ thể: **pod trần không tự mọc lại**. Node chết, pod chết theo, và không
có gì trong cluster nhận trách nhiệm dựng lại nó.

**Deployment** là object nhận trách nhiệm đó. Bạn không khai "hãy tạo ba pod";
bạn khai "namespace này phải LUÔN có ba pod trông như thế này", rồi Kubernetes so
liên tục giữa mong muốn và thực tế, và tự đóng khoảng cách. Cơ chế đó gọi là
reconciliation loop, và nó là ý tưởng trung tâm của cả Kubernetes.

Deployment không tự quản pod. Nó tạo ra một **ReplicaSet**, và ReplicaSet mới là
thứ đếm pod. Ba tầng — Deployment, ReplicaSet, Pod — nghe thừa một tầng, nhưng
tầng giữa chính là thứ làm được rolling update ở level sau.

**Việc cần làm:** dựng Deployment \`web\` trong namespace \`san-pham\` với 3 replica
chạy \`nginx:1.27-alpine\`, và đưa cả ba pod tới trạng thái sẵn sàng.

Xong rồi, thử xoá một pod bất kỳ và đếm lại. Đó là điểm thưởng của level này, và
cũng là thứ đáng nhớ nhất trong nó.`,
  difficulty: 'basic',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['san-pham'],
    resources: [],
  },
  allowedResources: ['Deployment', 'Pod'],
  objectives: [
    {
      id: 'deployment-ton-tai',
      label: 'Có Deployment `web` trong namespace `san-pham`',
      check: 'resource-exists',
      args: { kind: 'Deployment', name: 'web', namespace: 'san-pham' },
      required: true,
    },
    {
      id: 'du-ba-replica',
      label: 'Deployment `web` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'web', namespace: 'san-pham', replicas: 3 },
      required: true,
    },
    {
      id: 'tu-phuc-hoi',
      label: 'Sau khi xoá một pod, số pod đang chạy vẫn quay về 3',
      check: 'pod-count-running',
      args: { namespace: 'san-pham', labelSelector: 'app=web', min: 3 },
      required: false,
    },
  ],
  hints: [
    'Deployment cần ba thứ mà pod trần không cần: số replica mong muốn, một selector để nhận diện pod của nó, và một template mô tả pod sẽ được tạo ra.',
    'Selector và label trong template phải khớp nhau. Nếu selector tìm `app=web` mà template gắn label `app=frontend`, Deployment sẽ tạo pod rồi không nhận ra chính con mình — và cứ tạo thêm mãi.',
    'Tạo Deployment `web` trong `san-pham`: `replicas: 3`, selector `app=web`, template gắn label `app=web` và một container `nginx:1.27-alpine`. Sau đó chạy `kubectl delete pod <một-pod-bất-kỳ> -n san-pham` rồi `kubectl get pods` lại.',
  ],
  parMoves: 2,
  teaches: [
    'Deployment',
    'ReplicaSet',
    'replicas',
    'selector',
    'pod template',
    'reconciliation loop',
    'self-healing',
  ],
};
