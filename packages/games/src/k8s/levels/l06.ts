import type { Level } from '../contract.ts';

/**
 * Mở chương 2 bằng câu hỏi "vì sao không dùng pod trần nữa" thay vì bằng cú pháp
 * Deployment. Câu trả lời — tự phục hồi — chỉ thuyết phục khi người chơi tự tay
 * xoá một pod và thấy nó mọc lại, nên mục tiêu thưởng cố ý yêu cầu đúng việc đó.
 */
export const l06: Level = {
  id: 'k8s-06-deployment-thay-cho-pod',
  chapter: 2,
  title: 'Giao pod cho Deployment quản',
  mission:
    'Dựng Deployment `web` trong `san-pham` với 3 replica chạy `nginx:1.27-alpine`, cả ba sẵn sàng.',
  brief: `Năm level vừa rồi bạn tạo pod bằng tay. Ở production không ai làm thế, vì một lý
do rất cụ thể: **pod trần không tự mọc lại**. Node chết là pod chết theo.

Dựng xong, thử xoá một pod bất kỳ rồi đếm lại. Đó là điểm thưởng, và cũng là thứ
đáng nhớ nhất ở đây.`,
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
  teaching: {
    primer: `Trung tâm của Kubernetes là **reconciliation loop**: một vòng lặp không ngừng so
*trạng thái mong muốn* với *trạng thái thực tế*, rồi tự thu hẹp khoảng cách. Pod
trần không có ai chạy vòng lặp đó cho nó.

**Deployment** là nơi ghi trạng thái mong muốn của một dịch vụ. Nó cần ba thứ mà
pod trần không cần: \`replicas\` (bao nhiêu bản chạy), \`selector\` (nhận diện pod
của nó, bằng label), và \`template\` (khuôn để tạo pod mới khi thiếu).

Deployment không đếm pod trực tiếp. Nó tạo một **ReplicaSet**, và ReplicaSet mới
là thứ giữ đúng số lượng. Tầng giữa nghe thừa, nhưng chính nó cho phép hai thế hệ
pod cùng sống lúc đổi phiên bản.`,
    cheatsheet: [
      {
        command: 'kubectl get deploy,rs,pods -n san-pham',
        explain: 'Ba tầng trong một lệnh. Tên ReplicaSet là tên Deployment cộng một hậu tố băm.',
      },
      {
        command: 'kubectl describe deployment web -n san-pham',
        explain:
          'Cho biết Selector, số replica mong muốn/thực tế, và Events về việc scale ReplicaSet.',
      },
      {
        command: 'kubectl delete pod <ten-pod> -n san-pham',
        explain: 'Xoá thử một pod để nhìn vòng lặp tự dựng lại. Đây là bằng chứng của tự phục hồi.',
      },
      {
        command: 'kubectl get pods -n san-pham --show-labels',
        explain:
          'Label của pod là thứ selector dùng để nhận con mình, nên đây là chỗ đối chiếu khi nghi lệch.',
      },
      {
        command: 'kubectl apply -f web.yaml',
        explain:
          'Áp bản khai Deployment. Selector và label trong template phải khớp nhau từng ký tự.',
      },
    ],
    takeaways: [
      'Deployment không tạo pod trực tiếp: nó tạo ReplicaSet, và ReplicaSet giữ số lượng pod.',
      'Reconciliation loop nghĩa là bạn khai mong muốn một lần, cluster giữ nó đúng mãi về sau.',
      'Xoá một pod của Deployment không làm mất dịch vụ; xoá một pod trần thì mất hẳn.',
      'Selector và label trong template phải khớp nhau, vì mọi quan hệ giữa các tầng đều đi qua label.',
    ],
    proTips: [
      'Ở cụm thật, gần như không ai tạo pod trần. Pod trần chỉ dùng để thử nhanh rồi xoá.',
      'Selector của Deployment là bất biến sau khi tạo. Chọn kỹ ngay từ đầu, vì đổi nó sau này nghĩa là xoá và tạo lại.',
    ],
    pitfalls: [
      'Đặt selector `app=web` mà template gắn label `app=frontend`, vì hai tên đều mô tả đúng dịch vụ. Deployment tạo pod xong không nhận ra con mình, vẫn thấy thiếu, và tạo tiếp mãi.',
      'Sửa label của một pod đang chạy để "vá nhanh". Pod đó rơi ra khỏi selector, Deployment thấy thiếu nên tạo pod bù, và bạn còn lại một pod mồ côi không ai quản.',
      'Đặt selector rộng kiểu `app=web` cho nhiều workload khác nhau. Nó chạy được cho tới khi có workload thứ hai dùng đúng label đó, và level 10 là chỗ bạn thấy hậu quả.',
    ],
  },
};
