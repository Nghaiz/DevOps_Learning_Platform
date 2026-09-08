import type { Level } from '../contract.ts';

/**
 * Sự cố "ai sở hữu pod này". Triệu chứng cố ý NGƯỢC với trực giác: Deployment
 * khai 4 replica, cluster có 4 pod đúng label, mà chỉ 1 pod thật sự thuộc về nó.
 *
 * Chọn kể chuyện này ở chương 2 vì đây là chỗ duy nhất ba tầng Deployment →
 * ReplicaSet → Pod lộ ra rằng chúng nối với nhau bằng LABEL chứ không bằng tên,
 * và label là thứ ai cũng gán trùng được.
 */
export const l10: Level = {
  id: 'k8s-10-replicaset-mo-coi',
  chapter: 2,
  title: 'ReplicaSet không ai nhận',
  brief: `Một người trong đội đã tạo tay một ReplicaSet tên \`web-tam\` hồi tháng trước để
thử nghiệm, rồi quên nó ở đó. ReplicaSet này gắn cho pod của nó **đúng cái label
mà Deployment \`web\` dùng làm selector**: \`app=web\`.

Kết quả là một tình huống khó chịu. Deployment \`web\` muốn 4 pod \`app=web\`.
Nó đếm pod theo label, thấy đủ 4 — nhưng 3 trong số đó do \`web-tam\` sinh ra và
chạy image cũ. Nên Deployment giữ ReplicaSet của chính nó ở đúng 1 pod. Một nửa
lưu lượng vào \`web\` đang được phục vụ bởi một phiên bản mà không ai chủ ý deploy.

Đây là hệ quả trực tiếp của một điều bạn đã dùng từ level 6 mà chưa để ý: các
tầng trong Kubernetes nối với nhau bằng **label**, không bằng tên hay quan hệ cha
con cứng. Label là chuỗi tự do, và không có gì ngăn hai chủ sở hữu cùng đòi một
nhóm pod.

**Việc cần làm:** dọn ReplicaSet mồ côi đi, và đưa Deployment \`web\` về đúng 4
pod của chính nó, tất cả chạy \`nginx:1.27-alpine\`.

Xoá ReplicaSet cũng xoá luôn pod nó sở hữu. Điều đó là đúng ở đây — nhưng hãy
kiểm tra kỹ bạn đang xoá cái nào trước khi gõ.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['san-pham'],
    resources: [
      {
        kind: 'ReplicaSet',
        name: 'web-tam',
        namespace: 'san-pham',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'web' } },
          template: {
            labels: { app: 'web' },
            containers: [
              { name: 'web', image: 'nginx:1.21-alpine', ports: [{ containerPort: 80 }] },
            ],
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'web',
        namespace: 'san-pham',
        spec: {
          replicas: 4,
          selector: { matchLabels: { app: 'web' } },
          template: {
            labels: { app: 'web' },
            containers: [
              {
                name: 'web',
                image: 'nginx:1.27-alpine',
                ports: [{ containerPort: 80 }],
                resources: {
                  requests: { cpu: '100m', memory: '128Mi' },
                  limits: { cpu: '250m', memory: '256Mi' },
                },
              },
            ],
          },
        },
      },
    ],
  },
  allowedResources: ['Deployment', 'ReplicaSet', 'Pod'],
  objectives: [
    {
      id: 'xoa-replicaset-mo-coi',
      label: 'ReplicaSet `web-tam` đã bị xoá',
      check: 'resource-absent',
      args: { kind: 'ReplicaSet', name: 'web-tam', namespace: 'san-pham' },
      required: true,
    },
    {
      id: 'deployment-du-bon',
      label: 'Deployment `web` có đủ 4 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'web', namespace: 'san-pham', replicas: 4 },
      required: true,
    },
    {
      id: 'toan-bo-image-moi',
      label: 'Pod của `web` chạy image `nginx:1.27-alpine`',
      check: 'container-image-is',
      args: {
        kind: 'Deployment',
        name: 'web',
        namespace: 'san-pham',
        image: 'nginx:1.27-alpine',
      },
      required: true,
    },
  ],
  hints: [
    '`kubectl get pods -n san-pham -o wide` cho bạn thấy các pod, nhưng không cho biết ai sinh ra chúng. Thứ trả lời được câu đó nằm trong `kubectl describe pod` — dòng `Controlled By`.',
    '`kubectl get rs -n san-pham` liệt kê mọi ReplicaSet. Cái do Deployment tạo ra có hậu tố băm ngẫu nhiên trong tên và có `Controlled By: Deployment/web`; cái tạo tay thì không có chủ.',
    'Xoá ReplicaSet `web-tam`. Pod của nó biến mất theo, số pod `app=web` tụt xuống, và Deployment `web` tự tạo bù cho đủ 4 — bạn không cần scale gì thêm.',
  ],
  parMoves: 2,
  teaches: [
    'label selector',
    'ownerReferences',
    'ReplicaSet adoption',
    'cascading delete',
    'kubectl get rs',
    'Controlled By',
  ],
  teaching: {
    primer: `Từ level 6 tới giờ bạn dựa vào **label** mà chưa nhìn kỹ nó. Label là cặp
khoá-giá trị tự do gắn lên object, và mọi quan hệ giữa các tầng trong Kubernetes
đều đi qua nó: ReplicaSet nhận pod bằng label, Service tìm pod bằng label.

Điểm quan trọng: label là chuỗi tự do và **không có tính độc quyền**. Hai
controller cùng khai selector \`app=web\` sẽ cùng đòi một nhóm pod. Không có gì
trong Kubernetes ngăn việc đó, và không có cảnh báo nào bật lên.

Vậy làm sao biết pod nào thật sự thuộc về ai? Không xem label, mà xem
**ownerReferences**: một trường trong metadata của pod, trỏ tới object đã tạo ra
nó. \`kubectl describe pod\` in nó ra dưới dòng \`Controlled By\`. Đây là quan hệ
sở hữu thật, và nó là thứ quyết định hai chuyện: ai chịu trách nhiệm dựng lại
pod, và pod nào bị xoá theo khi bạn xoá controller.

Xoá một controller sẽ **xoá luôn** pod nó sở hữu. Cơ chế đó tên là cascading
delete, và ở đây nó có lợi: bạn xoá một ReplicaSet, pod của nó biến mất, số pod
khớp label tụt xuống, và Deployment thật tự tạo bù cho đủ.

Nhìn vào đâu: \`Controlled By\` trong \`describe pod\`, không phải cột label.`,
    cheatsheet: [
      {
        command: 'kubectl get rs -n san-pham',
        explain: 'ReplicaSet do Deployment tạo có hậu tố băm trong tên; cái tạo tay thì không.',
      },
      {
        command: 'kubectl describe pod <ten-pod> -n san-pham',
        explain: 'Dòng Controlled By nói ai thật sự sở hữu pod này, khác hẳn với ai đang khớp label.',
      },
      {
        command: 'kubectl get pods -n san-pham --show-labels',
        explain: 'Thấy pod nào mang label nào, để hiểu vì sao hai controller cùng đòi chúng.',
      },
      {
        command: 'kubectl get pods -n san-pham -o custom-columns=POD:.metadata.name,CHU:.metadata.ownerReferences[*].name',
        explain: 'Bảng pod kèm chủ sở hữu trong một lệnh, nhanh hơn describe từng pod.',
      },
      {
        command: 'kubectl delete rs web-tam -n san-pham',
        explain: 'Xoá ReplicaSet mồ côi. Pod của nó bị xoá theo, đó là cascading delete.',
      },
    ],
    takeaways: [
      'Label là chuỗi tự do và không độc quyền: hai controller có thể cùng đòi một nhóm pod mà không ai cảnh báo.',
      'ownerReferences (hiện ra ở dòng Controlled By) mới là quan hệ sở hữu thật, không phải label.',
      'Xoá một controller xoá luôn pod nó sở hữu, nên phải xác định đúng chủ trước khi gõ lệnh xoá.',
      'Đếm pod theo label có thể ra đủ số mà vẫn sai: đúng số lượng không có nghĩa đúng phiên bản.',
    ],
    proTips: [
      'Thêm `--cascade=orphan` nếu muốn xoá controller mà giữ pod lại, ví dụ khi đang cứu dữ liệu trong lúc sự cố.',
      'Đặt cho mỗi workload một label riêng biệt ngay từ đầu (thêm chiều như `phien-ban` hay `doi`) để hai chủ không bao giờ giẫm nhau.',
    ],
    pitfalls: [
      'Đọc `kubectl get pods` thấy đủ 4 pod đúng label rồi kết luận Deployment khoẻ. Đúng số lượng là thứ dễ nhìn nhất và ở đây nó nói dối: ba trong bốn pod chạy image cũ.',
      'Xoá pod thay vì xoá ReplicaSet mồ côi. Pod mọc lại ngay vì chủ của chúng vẫn còn đó và vẫn đang giữ số lượng.',
    ],
  },
};
