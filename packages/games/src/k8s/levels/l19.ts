import type { Level } from '../contract.ts';

/**
 * Cùng trạng thái lỗi với l18 nhưng nguyên nhân lệch một tầng: object CÓ, khoá
 * bên trong thì không. Đây là mẫu "gần đúng còn khó tìm hơn sai hẳn" — người
 * chơi vừa học phản xạ `get configmap`, và lần này phản xạ đó trả lời "có" rồi
 * dẫn họ đi sai đường.
 *
 * `key` được tham chiếu qua `env[].valueFrom` chứ không qua `envFrom` như l18:
 * đó chính là khác biệt kỹ thuật khiến một khoá thiếu trở thành lỗi cứng thay vì
 * bị bỏ qua trong im lặng.
 */
export const l19: Level = {
  id: 'k8s-19-thieu-mot-khoa-trong-configmap',
  chapter: 4,
  title: 'ConfigMap có đó, khoá thì không',
  brief: `Lại \`CreateContainerConfigError\`, lần này ở Deployment \`du-bao\` trong
namespace \`khi-tuong\`. Bạn làm đúng như level trước: \`kubectl get configmap\`.

ConfigMap \`du-bao-cau-hinh\` tồn tại. Bạn xem nội dung, thấy có dữ liệu bên
trong, và bế tắc.

Cách một pod đọc ConfigMap có hai kiểu, và chúng hỏng khác nhau:

- \`envFrom\` bơm **toàn bộ** khoá trong ConfigMap thành biến môi trường. Thiếu
  một khoá thì đơn giản là thiếu một biến — container vẫn dựng được, và ứng dụng
  tự xoay xở hoặc tự chết sau đó.
- \`env[].valueFrom.configMapKeyRef\` đòi **đúng một khoá có tên cụ thể**. Khoá
  không tồn tại thì kubelet dừng ngay: nó không có giá trị để bơm, nên không dựng
  container. Đây là kiểu tham chiếu chặt, và cũng là kiểu đang được dùng ở đây.

**Việc cần làm:** đưa Deployment \`du-bao\` (3 replica) lên chạy được, và
giữ nguyên mọi khoá đang có trong ConfigMap.

Đừng đoán tên khoá còn thiếu. Nó được ghi ra ở hai chỗ khác nhau trong cluster,
và cả hai đều chính xác hơn trí nhớ của bạn.`,
  difficulty: 'intermediate',
  initialState: {
    nodes: [
      { name: 'may-chu-1', cpu: 4000, memory: 8192, ready: true },
      { name: 'may-chu-2', cpu: 4000, memory: 8192, ready: true },
    ],
    namespaces: ['khi-tuong'],
    resources: [
      {
        kind: 'ConfigMap',
        name: 'du-bao-cau-hinh',
        namespace: 'khi-tuong',
        spec: {
          data: {
            API_THOI_TIET: 'https://api.khi-tuong.vn/v2',
            SO_LAN_THU_LAI: '3',
            MUC_LOG: 'info',
          },
        },
      },
      {
        kind: 'Deployment',
        name: 'du-bao',
        namespace: 'khi-tuong',
        spec: {
          replicas: 3,
          selector: { matchLabels: { app: 'du-bao' } },
          template: {
            labels: { app: 'du-bao' },
            containers: [
              {
                name: 'du-bao',
                image: 'ghcr.io/dlp/du-bao:4.0.2',
                ports: [{ containerPort: 8080 }],
                env: [
                  {
                    name: 'API_THOI_TIET',
                    valueFrom: {
                      configMapKeyRef: { name: 'du-bao-cau-hinh', key: 'API_THOI_TIET' },
                    },
                  },
                  {
                    name: 'MA_TRAM',
                    valueFrom: {
                      configMapKeyRef: { name: 'du-bao-cau-hinh', key: 'MA_TRAM' },
                    },
                  },
                ],
                resources: {
                  requests: { cpu: '200m', memory: '256Mi' },
                  limits: { cpu: '500m', memory: '512Mi' },
                },
              },
            ],
          },
        },
        seededIncident: 'key-configmap-sai',
      },
    ],
  },
  allowedResources: ['ConfigMap', 'Deployment'],
  objectives: [
    {
      id: 'co-khoa-ma-doi-tac',
      label: 'ConfigMap `du-bao-cau-hinh` có khoá `MA_TRAM`',
      check: 'configmap-key-set',
      args: { name: 'du-bao-cau-hinh', namespace: 'khi-tuong', key: 'MA_TRAM' },
      required: true,
    },
    {
      id: 'giu-khoa-cu',
      label: 'Khoá `API_THOI_TIET` vẫn còn nguyên',
      check: 'configmap-key-set',
      args: { name: 'du-bao-cau-hinh', namespace: 'khi-tuong', key: 'API_THOI_TIET' },
      required: true,
    },
    {
      id: 'ba-replica-san-sang',
      label: 'Deployment `du-bao` có đủ 3 replica sẵn sàng',
      check: 'deployment-ready',
      args: { name: 'du-bao', namespace: 'khi-tuong', replicas: 3 },
      required: true,
    },
    {
      id: 'het-su-co',
      label: 'Sự cố cấu hình đã được xử lý dứt điểm',
      check: 'no-incident-active',
      args: { namespace: 'khi-tuong', kind: 'key-configmap-sai' },
      required: false,
    },
  ],
  hints: [
    'Sự tồn tại của ConfigMap không phải câu trả lời — nội dung của nó mới là. `kubectl get configmap du-bao-cau-hinh -n khi-tuong -o yaml` liệt kê từng khoá đang có.',
    'Chỗ thứ hai ghi tên khoá là Events của pod: `kubectl describe pod -n khi-tuong -l app=du-bao` nói rõ khoá nào không tìm thấy. Chỗ thứ ba là chính template của Deployment — đọc danh sách `env` và các `configMapKeyRef` trong đó.',
    'Pod đòi hai khoá qua `configMapKeyRef`: `API_THOI_TIET` (đã có) và `MA_TRAM` (chưa có). Thêm khoá `MA_TRAM` vào ConfigMap mà không xoá ba khoá cũ.',
  ],
  parMoves: 1,
  teaches: [
    'configMapKeyRef',
    'envFrom vs env valueFrom',
    'tham chiếu chặt và lỏng',
    'CreateContainerConfigError',
  ],
  teaching: {
    primer: `Cùng trạng thái lỗi với level trước, nguyên nhân lệch một tầng: object **có**,
khoá bên trong thì **không**. Phản xạ \`kubectl get configmap\` bạn vừa học sẽ
trả lời "có" rồi dẫn bạn đi sai đường, nên level này dạy tầng sâu hơn một bậc.

Pod đọc ConfigMap theo hai kiểu, và chúng hỏng khác hẳn nhau:

- \`envFrom\` bơm **toàn bộ** khoá trong ConfigMap thành biến môi trường. Đây là
  tham chiếu **lỏng**: thiếu một khoá thì chỉ là thiếu một biến, container vẫn
  dựng được, và lỗi lộ ra muộn hơn ở bên trong ứng dụng.
- \`env[].valueFrom.configMapKeyRef\` đòi **đúng một khoá có tên cụ thể**. Đây là
  tham chiếu **chặt**: khoá không tồn tại thì kubelet không có giá trị để bơm,
  nên nó dừng và không dựng container.

Tham chiếu chặt hỏng sớm và hỏng rõ, ngay lúc tạo pod, với tên khoá ghi thẳng
trong Events. Đó là ưu điểm chứ không phải nhược điểm: lỗi cấu hình bị chặn ở
biên chứ không lọt vào trong rồi biểu hiện thành một hành vi kỳ lạ lúc 3 giờ sáng.

Tên khoá còn thiếu được ghi ở **hai chỗ** trong cluster: Events của pod, và
danh sách \`env\` trong template của Deployment. Cả hai đều chính xác hơn trí nhớ.

Nhìn vào đâu: nội dung ConfigMap, không phải sự tồn tại của nó.`,
    cheatsheet: [
      {
        command: 'kubectl get configmap du-bao-cau-hinh -n khi-tuong -o yaml',
        explain: 'Liệt kê từng khoá đang có. Sự tồn tại của ConfigMap không phải câu trả lời, nội dung mới là.',
      },
      {
        command: 'kubectl describe pod -n khi-tuong -l app=du-bao',
        explain: 'Events nói đích danh khoá nào không tìm thấy, không phải chỉ nói ConfigMap nào.',
      },
      {
        command: 'kubectl get deploy du-bao -n khi-tuong -o yaml',
        explain: 'Đọc danh sách env và các configMapKeyRef để biết pod đang đòi những khoá nào.',
      },
      {
        command: 'kubectl patch configmap du-bao-cau-hinh -n khi-tuong --type merge -p \x27{"data":{"MA_TRAM":"HN-01"}}\x27',
        explain: 'Thêm một khoá mà giữ nguyên các khoá cũ. Đây là cách sửa an toàn ở level này.',
      },
      {
        command: 'kubectl edit configmap du-bao-cau-hinh -n khi-tuong',
        explain: 'Sửa tay khi cần xem toàn cảnh trước lúc thêm khoá.',
      },
    ],
    takeaways: [
      'Object tồn tại không có nghĩa nội dung của nó đủ, nên câu hỏi đúng là khoá nào có chứ không phải ConfigMap nào có.',
      'configMapKeyRef là tham chiếu chặt: thiếu khoá là lỗi cứng, container không được dựng.',
      'envFrom là tham chiếu lỏng: thiếu khoá không chặn gì, và lỗi hiện ra muộn bên trong ứng dụng.',
      'Hỏng sớm và hỏng rõ ở biên tốt hơn hỏng muộn và hỏng mơ hồ trong lúc chạy.',
    ],
    proTips: [
      'Thêm `optional: true` vào configMapKeyRef nếu khoá đó thật sự không bắt buộc. Chọn có ý thức, đừng để mặc định quyết định thay bạn.',
      'Với cấu hình bắt buộc, tham chiếu chặt là lựa chọn đúng: nó biến một lỗi vận hành lúc nửa đêm thành một lỗi lúc triển khai.',
    ],
    pitfalls: [
      '`kubectl get configmap` thấy tên trong danh sách rồi loại ConfigMap khỏi diện nghi ngờ. Lệnh chạy đúng và câu trả lời cũng đúng, chỉ là nó trả lời một câu hỏi khác với câu bạn cần hỏi.',
      'Tạo lại ConfigMap bằng `create --from-literal` chỉ với khoá còn thiếu rồi apply đè. Pod lên được nên trông như đã sửa xong, trong khi ba khoá cũ vừa biến mất và lỗi tiếp theo sẽ không liên quan gì tới lỗi này.',
    ],
  },
};
